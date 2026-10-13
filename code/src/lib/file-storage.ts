/**
 * 文件存储适配层。
 *
 * 默认使用本地磁盘；配置 MINIO_* 后自动切换到 MinIO。
 * MinIO 使用标准 S3 API，通过 AWS SDK 访问，不依赖 Coze 专用鉴权。
 */
import { existsSync } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import path from 'path';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildFileUrl, buildStoredFileName, getUploadDir } from '@/lib/upload';

export type FileStorageDriver = 'local' | 'minio';

export interface StoredUpload {
  /** 实际存储键：本地为业务目录/文件名，MinIO 为对象 key */
  key: string;
  /** 入库使用的唯一文件标识 */
  filename: string;
  /** 客户端可直接访问的稳定地址 */
  url: string;
  storage: FileStorageDriver;
}

interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
  publicUrl: string;
}

let cachedClient: { signature: string; client: S3Client } | null = null;

function sanitizePrefix(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return sanitized || 'general';
}

function readMinioConfig(): MinioConfig {
  return {
    endpoint: process.env.MINIO_ENDPOINT?.trim().replace(/\/$/, '') || '',
    accessKey: process.env.MINIO_ACCESS_KEY?.trim() || '',
    secretKey: process.env.MINIO_SECRET_KEY?.trim() || '',
    bucket: process.env.MINIO_BUCKET?.trim() || '',
    region: process.env.MINIO_REGION?.trim() || 'us-east-1',
    forcePathStyle: process.env.MINIO_FORCE_PATH_STYLE !== 'false',
    publicUrl: process.env.MINIO_PUBLIC_URL?.trim().replace(/\/$/, '') || '',
  };
}

function getMissingMinioConfig(config = readMinioConfig()): string[] {
  const missing: string[] = [];
  if (!config.endpoint) missing.push('MINIO_ENDPOINT');
  if (!config.accessKey) missing.push('MINIO_ACCESS_KEY');
  if (!config.secretKey) missing.push('MINIO_SECRET_KEY');
  if (!config.bucket) missing.push('MINIO_BUCKET');
  return missing;
}

function requireMinioConfig(): MinioConfig {
  const config = readMinioConfig();
  const missing = getMissingMinioConfig(config);
  if (missing.length > 0) {
    throw new Error(`MinIO 配置不完整，缺少: ${missing.join(', ')}`);
  }
  return config;
}

/** 是否已完整配置 MinIO。 */
export function hasMinioStorageConfig(): boolean {
  return getMissingMinioConfig().length === 0;
}

/**
 * 获取当前存储驱动。
 *
 * FILE_STORAGE_DRIVER:
 * - auto（默认）：配置完整 MINIO_* 时使用 minio，否则使用 local
 * - local：强制本地磁盘
 * - minio：强制 MinIO，缺少配置时直接报错
 * - s3 / bucket / object：兼容旧配置，按 minio 处理
 */
export function getFileStorageDriver(): FileStorageDriver {
  const requested = (process.env.FILE_STORAGE_DRIVER || 'auto').trim().toLowerCase();
  const config = readMinioConfig();
  const missing = getMissingMinioConfig(config);
  const configuredCount = [config.endpoint, config.accessKey, config.secretKey, config.bucket].filter(
    Boolean
  ).length;

  if (requested === 'local') return 'local';

  if (['minio', 's3', 'bucket', 'object'].includes(requested)) {
    if (missing.length > 0) {
      throw new Error(`MinIO 配置不完整，缺少: ${missing.join(', ')}`);
    }
    return 'minio';
  }

  if (requested !== 'auto') {
    throw new Error(`不支持的 FILE_STORAGE_DRIVER: ${requested}`);
  }

  if (configuredCount > 0 && missing.length > 0) {
    throw new Error(`MinIO 配置不完整，缺少: ${missing.join(', ')}`);
  }

  return missing.length === 0 ? 'minio' : 'local';
}

function getMinioClient(config = requireMinioConfig()): S3Client {
  const signature = JSON.stringify([
    config.endpoint,
    config.accessKey,
    config.secretKey,
    config.region,
    config.forcePathStyle,
  ]);

  if (!cachedClient || cachedClient.signature !== signature) {
    cachedClient?.client.destroy();
    cachedClient = {
      signature,
      client: new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKey,
          secretAccessKey: config.secretKey,
        },
        forcePathStyle: config.forcePathStyle,
      }),
    };
  }

  return cachedClient.client;
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** 防止外部请求利用对象 key 访问异常路径。 */
export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 1024 || key.includes('\\') || key.includes('\0')) return false;
  return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** MinIO 文件的稳定访问地址。私有桶默认通过应用路由动态生成短期签名。 */
export function buildMinioFileUrl(key: string): string {
  const { publicUrl } = readMinioConfig();
  const encodedKey = encodeObjectKey(key);
  return publicUrl ? `${publicUrl}/${encodedKey}` : `/api/storage/${encodedKey}`;
}

function getPresignedUrlTtl(): number {
  const defaultTtl = 15 * 60;
  const raw = Number(process.env.MINIO_PRESIGNED_URL_TTL_SECONDS || defaultTtl);
  return Number.isSafeInteger(raw) && raw > 0 && raw <= 7 * 24 * 60 * 60 ? raw : defaultTtl;
}

/** 为私有 MinIO 对象生成临时读取地址。HEAD 请求需要单独签名。 */
export async function generateMinioPresignedUrl(
  key: string,
  method: 'get' | 'head' = 'get'
): Promise<string> {
  if (!isSafeObjectKey(key)) throw new Error('无效的对象存储 key');

  const config = requireMinioConfig();
  const input = { Bucket: config.bucket, Key: key };
  const command = method === 'head' ? new HeadObjectCommand(input) : new GetObjectCommand(input);
  return getSignedUrl(getMinioClient(config), command, { expiresIn: getPresignedUrlTtl() });
}

async function uploadToLocal(file: File, prefix: string): Promise<StoredUpload> {
  const storagePath = getUploadDir();
  if (!existsSync(storagePath)) {
    await mkdir(storagePath, { recursive: true });
  }

  const filename = buildStoredFileName(file.name);
  const filePath = path.join(storagePath, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const written = await stat(filePath);
  if (!written.isFile()) throw new Error('文件保存失败');

  return {
    key: `${prefix}/${filename}`,
    filename,
    url: buildFileUrl(filename),
    storage: 'local',
  };
}

async function uploadToMinio(file: File, prefix: string): Promise<StoredUpload> {
  const config = requireMinioConfig();
  const objectKey = `${prefix}/${buildStoredFileName(file.name)}`;

  const uploader = new Upload({
    client: getMinioClient(config),
    params: {
      Bucket: config.bucket,
      Key: objectKey,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || 'application/octet-stream',
    },
  });
  await uploader.done();

  return {
    key: objectKey,
    filename: objectKey,
    url: buildMinioFileUrl(objectKey),
    storage: 'minio',
  };
}

/** 按当前配置将文件保存到本地磁盘或 MinIO。 */
export async function storeUploadedFile(file: File, bizType = 'general'): Promise<StoredUpload> {
  const prefix = sanitizePrefix(bizType);
  const driver = getFileStorageDriver();
  return driver === 'minio' ? uploadToMinio(file, prefix) : uploadToLocal(file, prefix);
}

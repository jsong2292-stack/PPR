/**
 * 文件上传 / 读取的公共配置
 *
 * 本地模式下文件写入 public/uploads，通过 next.config.ts 的 rewrite 由
 * /uploads/:filename 映射到 /api/uploads/:filename 读取。
 * 对象存储适配见 src/lib/file-storage.ts；配置 MinIO 后会自动切换。
 */
import path from 'path';

/** 上传目录的绝对路径 */
export function getUploadDir(): string {
  const basePath = process.env.UPLOAD_BASE_PATH || process.env.COZE_WORKSPACE_PATH || process.cwd();
  return path.join(basePath, 'public/uploads');
}

/** 允许上传的文件类型（按业务分类） */
export const ALLOWED_TYPES: Record<string, string[]> = {
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
  ],
  video: [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-ms-wmv',
    'video/x-flv',
    'video/webm',
    'video/3gpp',
    'video/x-matroska',
  ],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/flac'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'application/rtf',
  ],
  archive: [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    'application/x-tar',
  ],
  code: ['application/json', 'text/xml', 'application/xml'],
};

/** 扩展名兜底白名单：部分浏览器上传时 MIME 为空 */
export const ALLOWED_EXTENSIONS = [
  // 图片
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'ico',
  // 视频
  'mp4', 'mpeg', 'mpg', 'mov', 'avi', 'wmv', 'flv', 'webm', '3gp', 'mkv',
  // 音频
  'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac',
  // 文档
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'rtf', 'csv',
  // 压缩包
  'zip', 'rar', '7z', 'gz', 'tar',
];

/** 禁止上传的可执行 / 脚本类扩展名 */
export const DANGEROUS_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'php', 'jsp', 'asp', 'aspx', 'com', 'vbs',
  'ps1', 'msi', 'dll', 'scr', 'hta', 'cpl', 'wsf',
];

/** 支持的文件类型提示文案 */
export const SUPPORTED_TYPES_HINT =
  '图片(jpg/png/gif/webp/svg)、视频(mp4/mov/avi/wmv/webm/mkv)、音频(mp3/wav/aac/flac)、文档(pdf/doc/docx/ppt/pptx/xls/xlsx/txt/md)、压缩包(zip/rar/7z)';

/** 根据 MIME 判断业务分类，未识别返回 null */
export function getFileCategory(mimeType: string): string | null {
  for (const [category, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) return category;
  }
  return null;
}

/** 扩展名 → MIME 映射，用于读取文件时回写 Content-Type */
export const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/x-m4a',
  '.flac': 'audio/flac',
};

/** 生成不易冲突的存储文件名：{时间戳}_{随机串}.{扩展名} */
export function buildStoredFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'bin';
  return `${timestamp}_${randomStr}.${ext}`;
}

/** 校验文件名是否安全（防目录穿越），并对文件名做 URI 解码 */
export function isSafeFileName(filename: string): boolean {
  if (!filename) return false;
  if (filename.includes('..')) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  // 仅允许常规字符，避免空字节等异常输入
  return /^[\w.\-\u4e00-\u9fa5]+$/.test(filename);
}

/** 文件访问地址 */
export function buildFileUrl(filename: string): string {
  return `/uploads/${filename}`;
}

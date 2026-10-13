'use client';

/**
 * 通用文件上传组件
 *
 * 特性：
 *   - 拖拽 / 点击选择，多文件队列
 *   - XHR 上传进度
 *   - 从 /api/config/max-file-size 读取服务端限制
 *   - 可通过 accept / maxFiles / maxSize 定制
 *   - 内置「在线预览」按钮（PDF / DOCX / PPTX / SVG / 图片）
 *
 * 用法：
 *   const [files, setFiles] = useState<UploadedFileItem[]>([]);
 *   <FileUploader files={files} onChange={setFiles} />
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { FilePreviewButton } from '@/components/ui/file-preview-button';
import { toast } from 'sonner';
import { Upload, X, FileText, FileArchive, Loader2, CheckCircle, Image as ImageIcon } from 'lucide-react';

export interface UploadedFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploading?: boolean;
  progress?: number;
  error?: string;
}

interface FileUploaderProps {
  files: UploadedFileItem[];
  onChange: (files: UploadedFileItem[]) => void;
  /** 覆盖默认的最大体积（MB）；不传则读取服务端配置 */
  maxSize?: number;
  /** 最多上传文件数，默认 10 */
  maxFiles?: number;
  /** input accept 属性，默认覆盖常用文档 / 压缩包 */
  accept?: string;
  /** 上传接口的 type 字段，便于业务侧区分用途 */
  bizType?: string;
  /** 单行提示文案 */
  hint?: string;
  disabled?: boolean;
}

const DEFAULT_ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv',
  '.zip', '.rar', '.7z', '.gz', '.tar',
  'image/*', 'video/*', 'audio/*',
].join(',');

const EXT_ICON_MAP: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  pdf: { icon: FileText, color: 'text-red-500', label: 'PDF' },
  doc: { icon: FileText, color: 'text-blue-500', label: 'Word' },
  docx: { icon: FileText, color: 'text-blue-500', label: 'Word' },
  xls: { icon: FileText, color: 'text-green-600', label: 'Excel' },
  xlsx: { icon: FileText, color: 'text-green-600', label: 'Excel' },
  ppt: { icon: FileText, color: 'text-orange-500', label: 'PPT' },
  pptx: { icon: FileText, color: 'text-orange-500', label: 'PPT' },
  zip: { icon: FileArchive, color: 'text-purple-500', label: 'ZIP' },
  rar: { icon: FileArchive, color: 'text-purple-500', label: 'RAR' },
  '7z': { icon: FileArchive, color: 'text-purple-500', label: '7Z' },
  png: { icon: ImageIcon, color: 'text-pink-500', label: 'PNG' },
  jpg: { icon: ImageIcon, color: 'text-pink-500', label: 'JPG' },
  jpeg: { icon: ImageIcon, color: 'text-pink-500', label: 'JPEG' },
  webp: { icon: ImageIcon, color: 'text-pink-500', label: 'WEBP' },
  gif: { icon: ImageIcon, color: 'text-pink-500', label: 'GIF' },
};

export function FileUploader({
  files,
  onChange,
  maxSize: propMaxSize,
  maxFiles = 10,
  accept = DEFAULT_ACCEPT,
  bizType = 'attachment',
  hint,
  disabled = false,
}: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [maxSize, setMaxSize] = useState(propMaxSize ?? 500);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 未显式传入时从服务端读取限制
  useEffect(() => {
    if (propMaxSize !== undefined) {
      setMaxSize(propMaxSize);
      return;
    }
    fetch('/api/config/max-file-size')
      .then((res) => res.json())
      .then((data) => {
        if (data?.maxSize) setMaxSize(Number(data.maxSize) || 500);
      })
      .catch(() => {
        /* 保持默认值 */
      });
  }, [propMaxSize]);

  const uploadFile = async (file: File): Promise<UploadedFileItem | null> => {
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`${file.name}: 文件大小超过 ${maxSize}MB`);
      return null;
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setUploadingFiles((prev) => new Map(prev).set(fileId, 0));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', bizType);

      const result = await new Promise<UploadedFileItem>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setUploadingFiles((prev) => new Map(prev).set(fileId, progress));
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const response = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({
                id: fileId,
                name: file.name,
                size: file.size,
                type: file.type,
                url: response.url,
              });
            } else {
              reject(new Error(response.error || '上传失败'));
            }
          } catch {
            reject(new Error(xhr.status === 413 ? '文件过大，被服务器拒绝' : '上传失败'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.open('POST', '/api/upload');
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      return result;
    } catch (error) {
      toast.error(`${file.name}: ${error instanceof Error ? error.message : '上传失败'}`);
      return null;
    } finally {
      setUploadingFiles((prev) => {
        const next = new Map(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleFiles = useCallback(
    async (selected: FileList | File[]) => {
      if (disabled) return;

      const list = Array.from(selected);
      const next = [...files];

      for (const file of list) {
        if (next.length >= maxFiles) {
          toast.error(`最多上传 ${maxFiles} 个文件`);
          break;
        }
        const uploaded = await uploadFile(file);
        if (uploaded) {
          next.push(uploaded);
          onChange([...next]);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, maxFiles, onChange, disabled, maxSize, bizType]
  );

  const removeFile = (id: string) => onChange(files.filter((f) => f.id !== id));

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const getFileInfo = (item: UploadedFileItem) => {
    const ext = item.name.split('.').pop()?.toLowerCase() || '';
    return EXT_ICON_MAP[ext] || { icon: FileText, color: 'text-gray-500', label: ext.toUpperCase() };
  };

  return (
    <div className="space-y-4">
      {/* 拖拽上传区 */}
      <div
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          disabled
            ? 'cursor-not-allowed border-gray-200 opacity-60'
            : dragOver
              ? 'cursor-pointer border-blue-500 bg-blue-50'
              : 'cursor-pointer border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            // 允许重复选择同一个文件
            e.target.value = '';
          }}
        />

        <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
        <p className="mb-1 text-gray-600">
          拖拽文件到此处，或 <span className="font-medium text-blue-600">点击上传</span>
        </p>
        <p className="text-sm text-gray-500">
          {hint || `单个文件最大 ${maxSize}MB，最多 ${maxFiles} 个`}
        </p>
      </div>

      {/* 上传进度 */}
      {uploadingFiles.size > 0 && (
        <div className="space-y-2">
          {Array.from(uploadingFiles.entries()).map(([fileId, progress]) => (
            <div key={fileId} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <div className="flex-1">
                <Progress value={progress} className="h-2" />
              </div>
              <span className="text-sm text-gray-500">{progress}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 已上传列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            已上传文件 ({files.length}/{maxFiles})
          </p>
          {files.map((item) => {
            const info = getFileInfo(item);
            const Icon = info.icon;

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
              >
                <Icon className={`h-5 w-5 shrink-0 ${info.color}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    {info.label} · {formatFileSize(item.size)}
                  </p>
                </div>
                <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                <FilePreviewButton
                  fileUrl={item.url}
                  fileName={item.name}
                  fileType={item.type}
                  variant="ghost"
                />
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  aria-label={`移除 ${item.name}`}
                  className="rounded p-1 transition-colors hover:bg-gray-200"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FileUploader;

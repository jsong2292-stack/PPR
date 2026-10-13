'use client';

/**
 * 图片上传（头像 / 封面 / 图标）
 *
 * - 点击或拖拽选择图片
 * - 本地即时预览，上传成功后回调服务端 URL
 * - 可选裁剪尺寸提示、圆形头像模式
 */
import { useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Upload, Trash2 } from 'lucide-react';

interface ImageUploaderProps {
  /** 当前图片地址 */
  value?: string | null;
  /** 上传成功 / 清除时回调 */
  onChange: (url: string | null) => void;
  /** 圆形头像模式，默认 true */
  circular?: boolean;
  /** 显示尺寸（像素），默认 96 */
  size?: number;
  /** 上传接口的 type 字段，默认 avatar */
  bizType?: string;
  /** 允许的最大体积（MB），默认 5 */
  maxSizeMB?: number;
  /** 无图片时的占位文字（通常是昵称首字） */
  fallbackText?: string;
}

export function ImageUploader({
  value,
  onChange,
  circular = true,
  size = 96,
  bizType = 'avatar',
  maxSizeMB = 5,
  fallbackText,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = localPreview || value || undefined;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`图片大小不能超过 ${maxSizeMB}MB`);
      return;
    }

    // 立即本地预览，避免等待网络的空白期
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', bizType);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '上传失败');

      onChange(data.url);
      toast.success('上传成功');
    } catch (error) {
      setLocalPreview(null);
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClear = () => {
    setLocalPreview(null);
    onChange(null);
  };

  return (
    <div className="flex items-center gap-4">
      {circular ? (
        <Avatar style={{ width: size, height: size }}>
          <AvatarImage src={preview} alt="头像" />
          <AvatarFallback className="bg-gray-100 text-2xl text-gray-500">
            {fallbackText?.[0] || '?'}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div
          className="flex items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
          style={{ width: size, height: size }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="预览" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-6 w-6 text-gray-300" />
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              上传中
            </>
          ) : (
            <>
              <Upload className="mr-1 h-4 w-4" />
              {value ? '更换图片' : '上传图片'}
            </>
          )}
        </Button>

        {value && !uploading && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            <Trash2 className="mr-1 h-4 w-4" />
            移除
          </Button>
        )}

        <p className="text-xs text-gray-400">
          支持 jpg / png / webp / svg，不超过 {maxSizeMB}MB
        </p>
      </div>
    </div>
  );
}

export default ImageUploader;

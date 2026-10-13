'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilePreviewButton } from '@/components/ui/file-preview-button';
import { FileUploader, type UploadedFileItem } from '@/components/upload/file-uploader';
import { toast } from 'sonner';

interface StoredFile {
  id: number;
  original_name: string;
  url: string;
  mime_type: string | null;
  category: string | null;
  size: number | null;
  created_at: string;
}

/**
 * 文件预览示例
 *
 * 预览基于 udoc-viewer 纯前端实现（PDF / DOCX / PPTX / SVG / 图片），
 * 不依赖任何后端转换服务。
 */
export default function PreviewDemoPage() {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [stored, setStored] = useState<StoredFile[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [manualName, setManualName] = useState('');

  const loadStored = useCallback(async () => {
    try {
      const res = await fetch('/api/files?pageSize=10', { credentials: 'same-origin' });
      const data = await res.json();
      if (res.ok) setStored(data.files || []);
    } catch {
      /* 未登录或数据库不可用时忽略 */
    }
  }, []);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">文件预览</h1>
        <p className="mt-1 text-sm text-gray-500">
          支持在线预览的类型：PDF、DOCX、PPTX、SVG、PNG / JPG / GIF / WEBP / BMP / TIFF。
          其余类型不会渲染预览按钮。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">上传并预览</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploader
            files={files}
            onChange={(next) => {
              setFiles(next);
              loadStored();
            }}
            bizType="preview-demo"
            maxFiles={3}
            hint="上传 PDF / Word / PPT / 图片后，列表右侧会出现「预览」按钮"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">按地址预览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="文件地址，如 /uploads/xxx.pdf"
          />
          <Input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="文件名（含扩展名），如 报告.pdf"
          />
          <div className="flex gap-2">
            <FilePreviewButton
              fileUrl={manualUrl}
              fileName={manualName || 'file.pdf'}
              variant="default"
            />
            <Button
              variant="ghost"
              onClick={() => toast.info('文件名扩展名决定是否可预览，不支持的类型不渲染按钮')}
            >
              说明
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">我的上传记录</CardTitle>
        </CardHeader>
        <CardContent>
          {stored.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">暂无上传记录</p>
          ) : (
            <ul className="divide-y">
              {stored.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-900">{file.original_name}</p>
                    <p className="text-xs text-gray-400">
                      {file.category || 'unknown'} · {new Date(file.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <FilePreviewButton
                      fileUrl={file.url}
                      fileName={file.original_name}
                      fileType={file.mime_type || undefined}
                    />
                    <a href={file.url} download target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm">
                        下载
                      </Button>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import {
  DocumentPreviewDialog,
  useDocumentPreview,
} from '@/components/ui/document-preview-dialog';

interface FilePreviewButtonProps {
  fileUrl: string;
  fileName: string;
  fileType?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

// 支持在线预览的文件类型 (udoc-viewer)
const PREVIEWABLE_EXTENSIONS = [
  // PDF
  'pdf',
  // Word (仅 docx，不支持 doc)
  'docx',
  // PowerPoint (仅 pptx，不支持 ppt)
  'pptx',
  // SVG
  'svg',
  // 图片
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'ico',
];

// MIME 类型到扩展名的映射
const MIME_TO_EXTENSION: Record<string, string> = {
  // PDF
  'application/pdf': 'pdf',
  // Word
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc', // 不支持，但记录用于判断
  // PowerPoint
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt', // 不支持，但记录用于判断
  // Excel (暂不支持预览)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  // 图片
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
};

// 从 URL 中提取文件扩展名
function extractExtensionFromUrl(url: string): string {
  try {
    // 移除查询参数
    const urlWithoutQuery = url.split('?')[0];
    // 获取路径最后一部分
    const pathParts = urlWithoutQuery.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    // 获取扩展名
    const ext = lastPart.split('.').pop()?.toLowerCase() || '';
    return ext;
  } catch {
    return '';
  }
}

// 判断文件是否可预览
function isPreviewable(fileName: string, fileType?: string, fileUrl?: string): boolean {
  // 优先从 fileType (MIME类型) 获取扩展名
  if (fileType) {
    const normalizedMime = fileType.toLowerCase();
    if (MIME_TO_EXTENSION[normalizedMime]) {
      const ext = MIME_TO_EXTENSION[normalizedMime];
      return PREVIEWABLE_EXTENSIONS.includes(ext);
    }
    
    // 检查是否是图片类型的 MIME
    if (normalizedMime.startsWith('image/')) {
      return true;
    }
  }
  
  // 从文件名获取扩展名
  const nameExt = fileName.split('.').pop()?.toLowerCase() || '';
  if (PREVIEWABLE_EXTENSIONS.includes(nameExt)) {
    return true;
  }
  
  // 如果文件名没有有效扩展名，尝试从 URL 获取
  if (fileUrl) {
    const urlExt = extractExtensionFromUrl(fileUrl);
    if (PREVIEWABLE_EXTENSIONS.includes(urlExt)) {
      return true;
    }
  }
  
  return false;
}

// 获取文件扩展名（用于显示）
function getFileExtension(fileName: string, fileType?: string, fileUrl?: string): string {
  // 优先从 MIME 类型获取
  if (fileType) {
    const normalizedMime = fileType.toLowerCase();
    if (MIME_TO_EXTENSION[normalizedMime]) {
      return MIME_TO_EXTENSION[normalizedMime];
    }
  }
  
  // 从文件名获取
  const nameExt = fileName.split('.').pop()?.toLowerCase() || '';
  if (nameExt && nameExt !== fileName.toLowerCase()) {
    return nameExt;
  }
  
  // 从 URL 获取
  if (fileUrl) {
    const urlExt = extractExtensionFromUrl(fileUrl);
    if (urlExt) {
      return urlExt;
    }
  }
  
  return '';
}

export function FilePreviewButton({
  fileUrl,
  fileName,
  fileType,
  className,
  variant = 'outline',
  size = 'sm',
  children,
}: FilePreviewButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // 文件不支持预览时不显示按钮
  if (!isPreviewable(fileName, fileType, fileUrl)) {
    return null;
  }

  const handlePreview = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
  };

  // 获取用于预览的文件类型（扩展名）
  const previewType = getFileExtension(fileName, fileType, fileUrl);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handlePreview}
      >
        {children || (
          <>
            <Eye className="w-4 h-4 mr-1" />
            预览
          </>
        )}
      </Button>

      <DocumentPreviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fileUrl={fileUrl}
        fileName={fileName}
        fileType={previewType}
      />
    </>
  );
}

// 简化版本：只返回是否可预览和预览函数
export function useFilePreview() {
  const { previewState, openPreview, closePreview, canPreview } = useDocumentPreview();

  const handlePreview = (fileUrl: string, fileName: string, fileType?: string): boolean => {
    if (!canPreview(fileName, fileType)) {
      return false;
    }

    openPreview(fileUrl, fileName, fileType);
    return true;
  };

  return {
    previewState,
    openPreview,
    closePreview,
    canPreview,
    previewFile: handlePreview,
    supportedTypes: PREVIEWABLE_EXTENSIONS,
  };
}

// 导出类型和工具函数
export { PREVIEWABLE_EXTENSIONS, isPreviewable, getFileExtension };

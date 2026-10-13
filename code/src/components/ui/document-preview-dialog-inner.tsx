'use client';

// Polyfill for crypto.randomUUID (required for HTTP environments)
if (typeof window !== 'undefined' && !window.crypto?.randomUUID) {
  const cryptoPolyfill = {
    ...window.crypto,
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
  };
  Object.defineProperty(window, 'crypto', { value: cryptoPolyfill });
}

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCw, X, Expand } from 'lucide-react';

/**
 * udoc-viewer 未提供 TypeScript 类型定义，且其 API 会随版本变化。
 * 这里统一以 any 持有运行时实例，豁免范围仅限本文件。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type UdocViewerLike = any;
type UdocClientLike = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  fileType?: string;
}

// udoc-viewer 支持的文件类型
const UDOC_SUPPORTED_TYPES = [
  'pdf', 'docx', 'pptx', 'svg',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'ico',
];

// MIME 类型到扩展名的映射
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
};

// 从 URL 中提取文件扩展名
function extractExtensionFromUrl(url: string): string {
  try {
    const urlWithoutQuery = url.split('?')[0];
    const pathParts = urlWithoutQuery.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    const ext = lastPart.split('.').pop()?.toLowerCase() || '';
    return ext;
  } catch {
    return '';
  }
}

// 判断是否支持预览
function isUdocSupported(fileName: string, fileType?: string, fileUrl?: string): boolean {
  // 优先从 fileType (MIME类型) 获取扩展名
  if (fileType) {
    const normalized = fileType.toLowerCase();
    if (MIME_TO_EXTENSION[normalized]) {
      return UDOC_SUPPORTED_TYPES.includes(MIME_TO_EXTENSION[normalized]);
    }
    if (normalized.includes('/')) {
      if (normalized.startsWith('image/')) return true;
      return false;
    }
    // 假设是扩展名
    if (UDOC_SUPPORTED_TYPES.includes(normalized)) {
      return true;
    }
  }
  
  // 从文件名获取扩展名
  const nameExt = fileName.split('.').pop()?.toLowerCase() || '';
  if (nameExt && nameExt !== fileName.toLowerCase() && UDOC_SUPPORTED_TYPES.includes(nameExt)) {
    return true;
  }
  
  // 从 URL 获取扩展名
  if (fileUrl) {
    const urlExt = extractExtensionFromUrl(fileUrl);
    if (urlExt && UDOC_SUPPORTED_TYPES.includes(urlExt)) {
      return true;
    }
  }
  
  return false;
}

// 获取文件扩展名
function getFileExtension(fileName: string, fileType?: string, fileUrl?: string): string {
  // 优先从 fileType 获取
  if (fileType) {
    const normalized = fileType.toLowerCase();
    if (MIME_TO_EXTENSION[normalized]) {
      return MIME_TO_EXTENSION[normalized];
    }
    // 假设是扩展名
    if (!normalized.includes('/')) {
      return normalized;
    }
  }
  
  // 从文件名获取
  const nameExt = fileName.split('.').pop()?.toLowerCase() || '';
  if (nameExt && nameExt !== fileName.toLowerCase()) {
    return nameExt;
  }
  
  // 从 URL 获取
  if (fileUrl) {
    return extractExtensionFromUrl(fileUrl);
  }
  
  return '';
}

// 获取完整 URL
function getAbsoluteUrl(url: string): string {
  if (!url) return '';
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${origin}${path}`;
  }
  
  return url;
}

export function DocumentPreviewDialogInner({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  fileType,
}: DocumentPreviewDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // udoc-viewer 未提供 TypeScript 类型，这里以 unknown 持有实例并在调用处断言
  const viewerRef = useRef<UdocViewerLike | null>(null);
  const clientRef = useRef<UdocClientLike | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dialogId = useId();

  // 清理函数
  const cleanup = useCallback(() => {
    if (viewerRef.current) {
      try {
        viewerRef.current.destroy();
      } catch (e) {
        console.error('[DocumentPreview] Error destroying viewer:', e);
      }
      viewerRef.current = null;
    }
    if (clientRef.current) {
      try {
        clientRef.current.destroy();
      } catch (e) {
        console.error('[DocumentPreview] Error destroying client:', e);
      }
      clientRef.current = null;
    }
  }, []);

  // 加载文档
  useEffect(() => {
    if (!open || !fileUrl) {
      return;
    }

    // 检查文件类型是否支持
    if (!isUdocSupported(fileName, fileType, fileUrl)) {
      setError('该文件类型不支持在线预览');
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    const loadDocument = async () => {
      try {
        console.log('[DocumentPreview] Starting to load document:', { fileUrl, fileName, fileType });
        
        // 动态导入 udoc-viewer
        const { UDocClient } = await import('@docmentis/udoc-viewer');
        console.log('[DocumentPreview] UDocClient loaded, version:', UDocClient.version);

        if (!mounted) return;

        // 创建客户端
        console.log('[DocumentPreview] Creating client...');
        const client = await UDocClient.create();
        
        if (!mounted) {
          client.destroy();
          return;
        }
        clientRef.current = client;
        console.log('[DocumentPreview] Client created successfully');

        // 等待容器准备好
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!mounted || !containerRef.current) {
          client.destroy();
          return;
        }

        // 创建查看器
        console.log('[DocumentPreview] Creating viewer...');
        const viewer = await client.createViewer({
          container: containerRef.current,
          theme: 'system',
          zoomMode: 'fit-spread-width',
        });

        if (!mounted) {
          viewer.destroy();
          client.destroy();
          return;
        }
        viewerRef.current = viewer;
        console.log('[DocumentPreview] Viewer created successfully');

        // 获取完整 URL
        const absoluteUrl = getAbsoluteUrl(fileUrl);
        console.log('[DocumentPreview] Loading document from:', absoluteUrl);

        // 加载文档
        await viewer.load(absoluteUrl);
        console.log('[DocumentPreview] Document loaded successfully');

        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('[DocumentPreview] Failed to load document:', err);
        const errMessage = err instanceof Error ? err.message : String(err);
        console.error('[DocumentPreview] Error message:', errMessage);
        console.error('[DocumentPreview] Error stack:', err instanceof Error ? err.stack : undefined);
        
        if (mounted) {
          setLoading(false);
          const errorMessage = errMessage || '文档加载失败，请稍后重试';
          setError(errorMessage);
        }
      }
    };

    loadDocument();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [open, fileUrl, fileName, fileType, cleanup]);

  // 对话框关闭时清理
  useEffect(() => {
    if (!open) {
      cleanup();
      setError(null);
      setLoading(false);
      setZoom(1);
      setIsFullscreen(false);
    }
  }, [open, cleanup]);

  // 缩放控制
  const handleZoomIn = () => {
    if (viewerRef.current) {
      try {
        viewerRef.current.zoomIn();
        // 从 viewer 获取实际缩放值
        const actualZoom = viewerRef.current.zoom || 1;
        setZoom(actualZoom);
      } catch (e) {
        console.error('[DocumentPreview] zoomIn error:', e);
      }
    }
  };

  const handleZoomOut = () => {
    if (viewerRef.current) {
      try {
        viewerRef.current.zoomOut();
        const actualZoom = viewerRef.current.zoom || 1;
        setZoom(actualZoom);
      } catch (e) {
        console.error('[DocumentPreview] zoomOut error:', e);
      }
    }
  };

  const handleFitWidth = () => {
    console.log('[DocumentPreview] handleFitWidth called, viewerRef:', viewerRef.current);
    if (viewerRef.current) {
      try {
        viewerRef.current.setZoomMode('fit-spread-width');
        // 获取适应宽度后的实际缩放值
        setTimeout(() => {
          const actualZoom = viewerRef.current?.zoom || 1;
          console.log('[DocumentPreview] Actual zoom after fitWidth:', actualZoom);
          setZoom(actualZoom);
        }, 100);
      } catch (e) {
        console.error('[DocumentPreview] setZoomMode error:', e);
      }
    }
  };

  const handleRotate = () => {
    if (viewerRef.current) {
      try {
        const currentRotation = viewerRef.current.pageRotation || 0;
        viewerRef.current.setPageRotation((currentRotation + 90) % 360);
      } catch (e) {
        console.error('[DocumentPreview] setPageRotation error:', e);
      }
    }
  };

  const handleToggleFullscreen = () => {
    // 获取 DialogContent 元素
    const element = document.getElementById(dialogId);
    if (!element) {
      console.error('[DocumentPreview] Cannot find dialog element');
      return;
    }
    
    if (!document.fullscreenElement) {
      // 进入全屏
      element.requestFullscreen().catch(err => {
        console.error('[DocumentPreview] Fullscreen error:', err);
      });
    } else {
      // 退出全屏
      document.exitFullscreen().catch(err => {
        console.error('[DocumentPreview] Exit fullscreen error:', err);
      });
    }
  };

  // 监听全屏变化事件
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleDownload = () => {
    const absoluteUrl = getAbsoluteUrl(fileUrl);
    window.open(absoluteUrl, '_blank');
  };

  const ext = getFileExtension(fileName, fileType, fileUrl);
  const unsupportedType = !isUdocSupported(fileName, fileType, fileUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        id={dialogId}
        showCloseButton={false}
        className={`
          flex flex-col p-0 gap-0
          ${isFullscreen 
            ? '!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 w-screen h-screen max-w-none max-h-none rounded-none' 
            : 'w-[98vw] h-[95vh] max-w-none max-h-none'
          }
        `}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background flex-shrink-0">
          <DialogTitle className="truncate text-base">{fileName}</DialogTitle>
          <div className="flex items-center gap-1">
            {!unsupportedType && !error && (
              <>
                <Button variant="ghost" size="icon" onClick={handleZoomOut} title="缩小" className="h-8 w-8">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[50px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button variant="ghost" size="icon" onClick={handleZoomIn} title="放大" className="h-8 w-8">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleFitWidth} title="适应宽度" className="h-8 w-8">
                  <Maximize2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRotate} title="旋转" className="h-8 w-8">
                  <RotateCw className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
                <Button variant="ghost" size="icon" onClick={handleToggleFullscreen} title={isFullscreen ? "退出全屏" : "全屏"} className="h-8 w-8">
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleDownload} title="下载" className="h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} title="关闭" className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription className="sr-only">
            预览文档: {fileName}
          </DialogDescription>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden bg-muted/30 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">正在加载文档...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="text-center text-muted-foreground p-4">
                <p className="text-lg font-medium">预览失败</p>
                <p className="text-sm mt-2">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleDownload}
                >
                  <Download className="h-4 w-4 mr-2" />
                  下载文件
                </Button>
              </div>
            </div>
          )}

          {unsupportedType && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="text-center text-muted-foreground p-4">
                <p className="text-lg font-medium">不支持预览</p>
                <p className="text-sm mt-2">.{ext} 格式暂不支持在线预览</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  支持的格式: PDF, DOCX, PPTX, SVG, 图片
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleDownload}
                >
                  <Download className="h-4 w-4 mr-2" />
                  下载文件
                </Button>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ display: error || unsupportedType ? 'none' : 'block' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook
export function useDocumentPreview() {
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    fileUrl: string;
    fileName: string;
    fileType?: string;
  }>({
    open: false,
    fileUrl: '',
    fileName: '',
  });

  const openPreview = useCallback((fileUrl: string, fileName: string, fileType?: string) => {
    setPreviewState({ open: true, fileUrl, fileName, fileType });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewState(prev => ({ ...prev, open: false }));
  }, []);

  const canPreview = useCallback((fileName: string, fileType?: string, fileUrl?: string): boolean => {
    return isUdocSupported(fileName, fileType, fileUrl);
  }, []);

  return {
    previewState,
    openPreview,
    closePreview,
    canPreview,
    supportedTypes: UDOC_SUPPORTED_TYPES,
  };
}

'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// 动态导入预览组件，禁用 SSR
const DocumentPreviewDialogInner = dynamic(
  () => import('./document-preview-dialog-inner').then(mod => mod.DocumentPreviewDialogInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
);

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  fileType?: string;
}

export function DocumentPreviewDialog(props: DocumentPreviewDialogProps) {
  return <DocumentPreviewDialogInner {...props} />;
}

// Hook - 从 inner 导出
export { useDocumentPreview } from './document-preview-dialog-inner';

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

interface ImageViewerProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageViewer({ src, alt = '', isOpen, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 重置状态
  const resetState = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 关闭时重置
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case '+':
        case '=':
          setScale(prev => Math.min(prev + 0.5, 5));
          break;
        case '-':
          setScale(prev => Math.max(prev - 0.5, 0.5));
          break;
        case 'r':
          setRotation(prev => prev + 90);
          break;
        case '0':
          resetState();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, resetState]);

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  // 拖拽开始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  // 拖拽移动
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  // 拖拽结束
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 放大
  const zoomIn = () => setScale(prev => Math.min(prev + 0.5, 5));
  
  // 缩小
  const zoomOut = () => setScale(prev => Math.max(prev - 0.5, 0.5));
  
  // 旋转
  const rotate = () => setRotation(prev => prev + 90);
  
  // 下载
  const download = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = alt || 'image';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      // 如果 fetch 失败，尝试直接打开链接
      window.open(src, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 工具栏 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
        <button
          onClick={zoomOut}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          title="缩小 (-)"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white text-sm min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          title="放大 (+)"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-white/30 mx-1" />
        <button
          onClick={rotate}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          title="旋转 (R)"
        >
          <RotateCw className="w-5 h-5" />
        </button>
        <button
          onClick={download}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          title="下载"
        >
          <Download className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-white/30 mx-1" />
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          title="关闭 (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 图片 */}
      <div 
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain transition-transform duration-100 select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
          }}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => {
            if (scale === 1) {
              setScale(2);
            } else {
              resetState();
            }
          }}
        />
      </div>

      {/* 提示 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        滚轮缩放 | 双击图片切换放大/原大小 | 拖拽移动 | ESC 关闭
      </div>
    </div>
  );
}

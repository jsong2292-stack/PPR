'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * 通用对话框。
 *
 * 行为约定：
 *   - Esc 关闭、点击遮罩关闭（可通过 dismissible=false 关闭该行为）
 *   - 打开时锁定 body 滚动，避免背景跟着滚
 *   - 使用 role="dialog" + aria-modal，读屏软件可识别
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="p-modal"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="p-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        <div className="p-modal__head">
          <h2>{title}</h2>
          <button type="button" className="u-btn u-btn--ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="p-modal__body">
          {children}
          {footer ? <div className="u-row u-row--between u-mt">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

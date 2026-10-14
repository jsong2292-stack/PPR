'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  /** 支持多行文本（\n 会保留换行），也支持直接传节点，比如把关联条数做成列表。 */
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 删除类操作用红色确认按钮。 */
  destructive?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

/**
 * 业务确认弹窗（替代 window.confirm）。
 *
 * 用法：组件里 `const { confirm, element } = useConfirmDialog()`，
 * 把 `element` 挂到 JSX 末尾，然后 `if (!(await confirm({ title, description }))) return;`。
 *
 * 用 AlertDialog 而不是 Dialog，是因为它自带 role=alertdialog 与焦点锁定：确认框会抢焦点、
 * Enter 触发确认、Esc 触发取消，长按和脚本化点击也不会像原生 confirm 那样阻塞整个渲染进程。
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // 上一个确认框还没关就又弹一个时，先把上一个当作取消，避免 Promise 永远悬着。
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }, []);

  const element = (
    <AlertDialog
      open={options !== null}
      onOpenChange={(open) => { if (!open) settle(false); }}
    >
      {options && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description != null && (
              <AlertDialogDescription className="whitespace-pre-line">{options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>{options.cancelText ?? '取消'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={options.destructive ? 'bg-red-600 text-white hover:bg-red-700' : undefined}
            >
              {options.confirmText ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );

  return { confirm, element };
}

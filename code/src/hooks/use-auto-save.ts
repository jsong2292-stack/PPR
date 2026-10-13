'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** 被监听的数据对象 */
  data: T;
  /** 保存函数，返回 true 表示成功 */
  onSave: (data: T) => Promise<boolean>;
  /** 内容变更后的防抖延迟（毫秒），默认 3000ms */
  debounceMs?: number;
  /** 定时保存间隔（毫秒），默认 60000ms（1分钟），设为 0 禁用 */
  intervalMs?: number;
  /** 判断数据是否为"有内容可保存"，避免空白时频繁请求 */
  hasContent?: (data: T) => boolean;
  /** 序列化函数，用于比对前后数据是否变化，默认 JSON.stringify */
  serialize?: (data: T) => string;
}

interface UseAutoSaveReturn {
  /** 当前保存状态 */
  status: SaveStatus;
  /** 上次成功保存的时间 */
  lastSaved: Date | null;
  /** 手动触发保存（如点击保存按钮） */
  saveManually: () => Promise<boolean>;
  /** 是否有未保存的变更 */
  isDirty: boolean;
  /** 保存失败时的错误信息 */
  errorMessage: string | null;
}

export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 3000,
  intervalMs = 60000,
  hasContent,
  serialize,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 用 ref 持有最新值，避免闭包陷阱
  const dataRef = useRef(data);
  const onSaveRef = useRef(onSave);
  const hasContentRef = useRef(hasContent);
  const serializeRef = useRef(serialize);
  const savingRef = useRef(false); // 防止并发保存
  const lastSerializedRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 每次渲染都更新 ref
  useEffect(() => {
    dataRef.current = data;
    onSaveRef.current = onSave;
    hasContentRef.current = hasContent;
    serializeRef.current = serialize;
  });

  // 序列化辅助
  const stringify = useCallback((d: T): string => {
    if (serializeRef.current) return serializeRef.current(d);
    return JSON.stringify(d);
  }, []);

  // 核心保存逻辑
  const doSave = useCallback(async (_isAuto: boolean): Promise<boolean> => {
    // 防止并发
    if (savingRef.current) return false;

    const currentData = dataRef.current;
    const contentCheck = hasContentRef.current;
    if (contentCheck && !contentCheck(currentData)) return false;

    savingRef.current = true;
    setStatus('saving');
    setErrorMessage(null);

    try {
      const success = await onSaveRef.current(currentData);
      if (success) {
        const now = new Date();
        setLastSaved(now);
        setStatus('saved');
        setIsDirty(false);
        lastSerializedRef.current = stringify(currentData);
        // 3秒后回到 idle
        setTimeout(() => setStatus(prev => (prev === 'saved' ? 'idle' : prev)), 3000);
      } else {
        setStatus('error');
        setErrorMessage('保存失败');
      }
      return success;
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : '保存失败');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [stringify]);

  // 手动保存
  const saveManually = useCallback(async (): Promise<boolean> => {
    // 手动保存时清除防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    return doSave(false);
  }, [doSave]);

  // 监听数据变化 → 防抖自动保存
  useEffect(() => {
    const currentSerialized = stringify(data);
    if (currentSerialized === lastSerializedRef.current) {
      // 数据没变化
      return;
    }

    setIsDirty(true);

    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 设置新的防抖定时器
    debounceTimerRef.current = setTimeout(() => {
      doSave(true);
      debounceTimerRef.current = null;
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [data, debounceMs, doSave, stringify]);

  // 初始化 lastSerialized（首次加载草稿后标记为已保存）
  useEffect(() => {
    if (!lastSerializedRef.current) {
      lastSerializedRef.current = stringify(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 定时兜底保存
  useEffect(() => {
    if (intervalMs <= 0) return;

    intervalTimerRef.current = setInterval(() => {
      if (isDirty && !savingRef.current) {
        doSave(true);
      }
    }, intervalMs);

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current);
      }
    };
  }, [intervalMs, isDirty, doSave]);

  // 页面离开前提醒
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return {
    status,
    lastSaved,
    saveManually,
    isDirty,
    errorMessage,
  };
}

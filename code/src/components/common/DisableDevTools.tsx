'use client';

import { useEffect, useRef } from 'react';

/**
 * 禁用开发工具
 * 
 * 功能：
 * 1. 隐藏 Next.js DevTools 浮动按钮（左下角 N 图标）
 * 2. 禁用 React DevTools
 * 3. 禁用 React DevTools 控制台日志
 * 
 * 注意：在生产环境或 COZE_PROJECT_ENV=PROD 时执行
 */

// 全局标记防止重复执行
let globalInitialized = false;

export function DisableDevTools() {
  const mountedRef = useRef(false);

  useEffect(() => {
    // 防止 React StrictMode 双重调用
    if (mountedRef.current) return;
    mountedRef.current = true;

    // 全局标记防止重复
    if (globalInitialized) return;
    globalInitialized = true;

    // 判断是否需要隐藏 DevTools
    // 生产环境 或 COZE_PROJECT_ENV=PROD 时执行
    const isProduction = process.env.NODE_ENV === 'production';
    const isDeploy = typeof window !== 'undefined' && 
      (window.location.hostname.includes('.coze.site') || 
       window.location.hostname.includes('.vercel.app'));
    
    if (!isProduction && !isDeploy) {
      return;
    }

    // 0. 禁用 React DevTools 控制台日志
    // 过滤掉 React DevTools 相关的日志信息
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;
    
    const devToolsPatterns = [
      /Download the React DevTools/i,
      /React DevTools/i,
      /devtools/i,
      /__REACT_DEVTOOLS_GLOBAL_HOOK__/i,
      /development experience/i,
      /fb\.me\/react-devtools/i,
    ];
    
    const shouldFilter = (args: unknown[]): boolean => {
      const message = args.map(arg => 
        typeof arg === 'string' ? arg : String(arg)
      ).join(' ');
      return devToolsPatterns.some(pattern => pattern.test(message));
    };
    
    console.log = (...args: unknown[]) => {
      if (!shouldFilter(args)) {
        originalConsoleLog.apply(console, args);
      }
    };
    
    console.warn = (...args: unknown[]) => {
      if (!shouldFilter(args)) {
        originalConsoleWarn.apply(console, args);
      }
    };
    
    console.info = (...args: unknown[]) => {
      if (!shouldFilter(args)) {
        originalConsoleInfo.apply(console, args);
      }
    };

    // 1. 注入 CSS 隐藏所有 DevTools 相关元素
    const style = document.createElement('style');
    style.id = 'hide-all-devtools';
    style.textContent = `
      /* 隐藏 Next.js DevTools */
      nextjs-portal,
      [data-nextjs-dialog],
      [data-nextjs-scroll-focus-boundary],
      [data-nextjs-dev-tools-button],
      button[data-nextjs-dev-tools-button],
      div[data-nextjs-dialog],
      [class*="nextjs"][class*="dev"],
      [class*="nextjs-portal"],
      [class*="__NEXT_DEV"],
      [data-testid="nextjs-dev-tools"],
      div:has(> button[data-nextjs-dev-tools-button]),
      
      /* 隐藏 React DevTools */
      [data-react-devtools-iframe],
      [data-react-devtools-panel],
      .react-devtools-root,
      [data-testid="react-devtools-panel"],
      [data-rdt] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        z-index: -9999 !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);

    // 2. 移除已存在的 DevTools 元素
    const removeDevTools = () => {
      // 移除 nextjs-portal
      document.querySelectorAll('nextjs-portal').forEach(el => el.remove());
      
      // 移除带有 nextjs dev 相关 class 的元素
      document.querySelectorAll('[class*="nextjs"][class*="dev"]').forEach(el => el.remove());
      
      // 移除 data-nextjs-dev-tools-button
      document.querySelectorAll('[data-nextjs-dev-tools-button]').forEach(el => el.remove());
      
      // 移除 data-nextjs-dialog
      document.querySelectorAll('[data-nextjs-dialog]').forEach(el => el.remove());
      
      // 移除可能包含 DevTools 按钮的容器
      document.querySelectorAll('div:has(> button[data-nextjs-dev-tools-button])').forEach(el => {
        if (el.innerHTML.includes('nextjs-dev-tools')) {
          el.remove();
        }
      });
    };

    // 立即移除
    removeDevTools();

    // 3. 监听 DOM 变化，持续移除新添加的 DevTools 元素
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement || node instanceof Element) {
            const el = node;
            const tagName = el.tagName?.toLowerCase() || '';
            
            // 检查是否是 DevTools 相关元素
            if (
              tagName === 'nextjs-portal' ||
              el.hasAttribute?.('data-nextjs-dev-tools-button') ||
              el.hasAttribute?.('data-nextjs-dialog') ||
              el.className?.includes?.('nextjs') ||
              el.className?.includes?.('__NEXT_DEV')
            ) {
              el.remove();
            }
          }
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 4. 禁用 React DevTools hook
    try {
      if (typeof window !== 'undefined') {
        // @ts-expect-error -- 全局 hook 未在 TS 类型定义中声明
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook) {
          // @ts-expect-error -- 全局 hook 未在 TS 类型定义中声明
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
            ...hook,
            renderers: new Map(),
            supportsFiber: false,
            supportsFlight: false,
            checkDCE: () => {},
            onCommitFiberRoot: () => {},
            onCommitFiberUnmount: () => {},
            inject: () => {},
            onScheduleFiberRoot: () => {},
          };
        }
      }
    } catch {
      // 忽略错误
    }

    // 定期检查并移除（备用方案）
    const interval = setInterval(removeDevTools, 1000);

    // 清理
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return null;
}

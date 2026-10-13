'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** 过渡延迟（毫秒），用于同组元素的错峰入场 */
  delay?: number;
}

// 滚动淡入淡出：元素进入视口时淡入上移，离开视口后淡出，可反复触发
export default function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // 不支持 IntersectionObserver 时直接显示，不做动效
      el.classList.add('reveal-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => setVisible(entry.isIntersecting));
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

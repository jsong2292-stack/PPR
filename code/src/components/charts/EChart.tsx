'use client';

import { useEffect, useRef, useState } from 'react';
import type { ECharts, EChartsOption } from 'echarts';

/**
 * ECharts 容器组件。
 *
 * 为什么动态 import：echarts 体积较大，且只有诊断 / 详情页需要。
 * 在客户端按需加载可以避免首屏（监控网格）被图表库拖慢。
 *
 * 生命周期要点：
 *   - 首次挂载时初始化实例并设置 option；
 *   - option 变化时用 setOption(option, true) 整体替换，避免残留旧系列；
 *   - 用 ResizeObserver 跟随容器尺寸变化（侧边栏折叠、窗口缩放）；
 *   - 卸载时断开观察者并 dispose，防止内存泄漏。
 */
export function EChart({
  option,
  height = 320,
  ariaLabel,
  emptyHint,
}: {
  option: EChartsOption | null;
  height?: number;
  ariaLabel?: string;
  emptyHint?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [failed, setFailed] = useState(false);

  // 初始化 / 销毁：只跑一次
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const container = containerRef.current;
      if (!container) return;
      try {
        const echarts = await import('echarts');
        if (cancelled || !containerRef.current) return;
        const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
        chartRef.current = chart;
        observer = new ResizeObserver(() => chart.resize());
        observer.observe(container);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // 数据更新：整体替换，避免切换指标后旧系列残留
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !option) return;
    chart.setOption(option, true);
  }, [option]);

  if (failed) {
    return (
      <div className="p-chart__fallback" style={{ height }}>
        图表组件未能加载，数值仍可在下方明细中查看。
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="p-chart"
        style={{ height, display: option ? undefined : 'none' }}
        role="img"
        aria-label={ariaLabel ?? '图表'}
      />
      {option ? null : (
        <div className="p-chart__fallback" style={{ height }}>
          {emptyHint ?? '暂无可绘制的数据。'}
        </div>
      )}
    </>
  );
}

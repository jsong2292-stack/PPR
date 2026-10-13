'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';

interface HeatCell {
  recordId: number | null;
  batchId: number;
  batchNo: string;
  inspectTime: string;
  riskType: 'normal' | 'medium' | 'high' | 'error';
  ruleCode: string | null;
  eventCode: string | null;
  metricName: string | null;
}

/**
 * 批次 × 抽检时间风险网格。
 *
 * 交互设计说明：
 *   选中态写在 URL 查询参数里（?record=123），而不是组件内部 state。
 *   好处是刷新页面、复制链接给同事、浏览器前进后退都能回到同一个视图，
 *   详情面板也能由服务端直接渲染。
 *
 * 表格语义：用真实 <table> 而不是 div 网格，读屏软件可以朗读「批次 / 时间 / 风险」，
 * 每格是一个带 aria-label 的按钮。
 */
export function MonitorGrid({
  batches,
  times,
  cells,
  selectedRecordId,
}: {
  batches: Array<{ batchId: number; batchNo: string; productionGroup: string | null }>;
  times: string[];
  cells: HeatCell[];
  selectedRecordId: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cellIndex = useMemo(() => {
    const map = new Map<string, HeatCell>();
    for (const cell of cells) map.set(`${cell.batchId}|${cell.inspectTime}`, cell);
    return map;
  }, [cells]);

  const select = (recordId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get('record') === String(recordId)) params.delete('record');
    else params.set('record', String(recordId));
    const query = params.toString();
    router.replace(query ? `/monitor?${query}` : '/monitor', { scroll: false });
  };

  if (!batches.length || !times.length) {
    return (
      <div className="u-empty">
        当前筛选条件下没有抽检记录。请确认已通过 Excel 批量导入或数据源管理录入抽检数据。
      </div>
    );
  }

  return (
    <div className="p-heat">
      <table className="u-table" style={{ minWidth: Math.max(520, times.length * 92) }}>
        <caption className="u-sr-only">批次与抽检时间的风险分布</caption>
        <thead>
          <tr>
            <th scope="col">批次</th>
            {times.map((time) => (
              <th key={time} scope="col" className="u-num">
                {time.slice(5, 10)}
                <br />
                <span className="u-faint">{time.slice(11, 16)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.batchId}>
              <th scope="row" className="u-num u-nowrap">
                {batch.batchNo}
                {batch.productionGroup ? (
                  <div className="u-xs u-faint">{batch.productionGroup}</div>
                ) : null}
              </th>
              {times.map((time) => {
                const cell = cellIndex.get(`${batch.batchId}|${time}`);
                if (!cell || cell.recordId === null) {
                  return (
                    <td key={time}>
                      <span className="u-faint u-xs">—</span>
                    </td>
                  );
                }
                const active = cell.recordId === selectedRecordId;
                const label =
                  `批次 ${cell.batchNo} · 抽检时间 ${cell.inspectTime} · ` +
                  `${RISK_TEXT[cell.riskType]}` +
                  (cell.ruleCode ? ` （${cell.ruleCode}）` : '') +
                  (cell.metricName ? ` · 指标 ${cell.metricName}` : '');
                return (
                  <td key={time} style={{ padding: 4 }}>
                    <button
                      type="button"
                      className={`p-heat__cell p-heat__cell--${cell.riskType}`}
                      style={{
                        width: '100%',
                        height: 30,
                        outline: active ? '2px solid var(--c-primary)' : undefined,
                        outlineOffset: active ? 1 : undefined,
                      }}
                      aria-pressed={active}
                      aria-label={label}
                      title={label}
                      onClick={() => select(cell.recordId as number)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RISK_TEXT: Record<HeatCell['riskType'], string> = {
  normal: '正常',
  medium: '中风险',
  high: '高风险',
  error: '数据报错',
};

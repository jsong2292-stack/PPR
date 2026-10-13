'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EChartsOption, LineSeriesOption } from 'echarts';
import { EChart } from '@/components/charts/EChart';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import { ConclusionCard } from '@/components/diagnosis/ConclusionCard';
import { api, errorMessage } from '@/lib/client/api';
import { fmt, fmtCount, NO_DATA } from '@/lib/format';
import {
  CALIBRATION_LABELS,
  DECISION_LABELS,
  HANDLING_LABELS,
  RISK_LABELS,
  type CalibrationStatus,
  type EngineerDecision,
  type HandlingStatus,
  type RiskType,
} from '@/lib/types';

/** 工艺参数序列（由服务端页面读取 process_record / process_zone_value 后传入） */
export interface ProcessParameterPayload {
  records: Array<{ time: string; haulOffMpm: number | null; lineSpeedMpm: number | null }>;
  /** 按温区分组的偏差序列（°C） */
  zones: Array<{ zoneName: string; points: Array<{ time: string; deviationC: number }> }>;
}

interface EvidenceItem {
  id: number;
  conclusionId: number;
  evidenceType: string;
  layer: string;
  content: string;
  factTime: string | null;
  isLocateable: boolean;
  relatedRecordId: number | null;
  isUsable: boolean;
}

interface Conclusion {
  id: number;
  seq: number;
  hypothesis: string;
  rootCauseCategory: string;
  observation: string;
  mechanism: string;
  mechanismSources: string[];
  missingEvidence: string[];
  validationActions: string;
  validationMethod: string;
  engineerDecision: EngineerDecision;
  engineerComment: string | null;
  validationResult: string | null;
  actualFinding: string | null;
  finalAction: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface DiagnosisData {
  event: {
    id: number;
    code: string;
    batchNo: string;
    productionGroup: string | null;
    ruleCode: string;
    ruleName: string;
    ruleCalibrationStatus: string;
    riskType: RiskType;
    metricName: string;
    triggerRecordId: number | null;
    triggerRecordCode: string | null;
    windowStartTime: string | null;
    windowEndTime: string;
    reason: string;
    affectedLengthM: number | null;
    lineSpeedMpm: number | null;
    handlingStatus: HandlingStatus;
    handlingNote: string | null;
    handlerName: string | null;
  };
  metric: { code: string; name: string; unit: string; decimalScale: number };
  batchRecords: Array<{
    id: number;
    code: string;
    sampleNo: string;
    inspectTime: string;
    qualityFlag: string;
    value: number | null;
  }>;
  counts: {
    wallPoints: number;
    productData: number;
    processRecords: number;
    equipmentReadings: number;
    references: number;
    consistencyChecks: number;
  };
  influences: Array<{ parameterId: number; code: string; name: string; unit: string }>;
  consistencyChecks: Array<{
    recordId: number;
    recordCode: string;
    metricName: string;
    primaryValue: number | null;
    secondaryValue: number | null;
    diffValue: number;
    toleranceValue: number;
    result: string;
    matchedTime: string | null;
    conclusionNote: string | null;
  }>;
  dataVersionNote: string;
  runs: Array<{
    id: number;
    code: string;
    runNo: number;
    generationType: string;
    modelName: string | null;
    status: string;
    dataVersionNote: string | null;
    generatedAt: string;
    generatedByName: string | null;
  }>;
  latestRunId: number | null;
  conclusions: Conclusion[];
  evidence: EvidenceItem[];
  snapshots: Array<{
    referenceBatchNo: string;
    productionGroup: string | null;
    sampleCount: number;
    medianValue: number | null;
    minValue: number | null;
    maxValue: number | null;
    note: string | null;
  }>;
  hasBuilder: boolean;
}

interface BatchEvent {
  id: number;
  code: string;
  triggerRecordId: number | null;
  riskType: RiskType;
}

/** 数据层清单：缺哪一层都要显示出来，而不是省略 */
const DATA_LAYERS: Array<{ key: keyof DiagnosisData['counts']; label: string; purpose: string }> = [
  { key: 'wallPoints', label: '分点壁厚测点', purpose: '评估同一样管的测量分散性' },
  { key: 'productData', label: '在线产品数据', purpose: '与抽检结果做测量口径对照' },
  { key: 'processRecords', label: '工艺过程记录', purpose: '温区设定/实测、牵引速度' },
  { key: 'equipmentReadings', label: '设备采集读数', purpose: '逐小时温度、压力、牵引速度' },
  { key: 'references', label: '参考批次', purpose: '同规格历史批次对照' },
  { key: 'consistencyChecks', label: 'QMS/MES 核对记录', purpose: '两条来源记录的口径核对' },
];

const QUALITY_FLAG_LABELS: Record<string, string> = {
  none: '无数据质量异常',
  qms_mes_mismatch: 'QMS/MES 记录差异',
  measurement_error: '测量数据错误',
  spec_mismatch: '规格匹配待核对',
  insufficient: '数据不足',
};

/** DATETIME 文本化：'null' 字符串与空值都按「无数据」展示 */
function safeText(value: string | null | undefined): string {
  if (!value) return NO_DATA;
  const text = String(value);
  return text === 'null' || text === 'undefined' ? NO_DATA : text;
}

/** 图表横轴标签：MM-DD HH:mm（跨天时仍可区分） */
function axisLabel(time: string): string {
  return time.length >= 16 ? time.slice(5, 16) : time;
}

export function DiagnosisWorkbench({
  eventCode,
  process,
  initialData = null,
  permissions,
}: {
  eventCode: string;
  process: ProcessParameterPayload;
  /** 服务端已取回的首屏数据（无 JS 也能看到结论与数据层清单） */
  initialData?: DiagnosisData | null;
  permissions: {
    canGenerate: boolean;
    canVerify: boolean;
    canWriteReport: boolean;
    canHandleEvent: boolean;
  };
}) {
  const toast = useToast();
  const router = useRouter();

  const [data, setData] = useState<DiagnosisData | null>(initialData);
  const [batchEvents, setBatchEvents] = useState<BatchEvent[]>([]);
  const [loading, setLoading] = useState(initialData === null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** 点击证据后高亮的抽检时间（在趋势图上打标） */
  const [highlightTime, setHighlightTime] = useState<string | null>(null);

  const [handlingOpen, setHandlingOpen] = useState(false);
  const [handlingStatus, setHandlingStatus] = useState<HandlingStatus>(
    initialData?.event.handlingStatus ?? 'processing',
  );
  const [handlingNote, setHandlingNote] = useState(initialData?.event.handlingNote ?? '');
  const [handlingError, setHandlingError] = useState<string | null>(null);

  /** 该批次的所有事件：用于在趋势图上区分「有事件的抽检点」 */
  const loadBatchEvents = useCallback(async (batchNo: string, signal?: AbortSignal) => {
    try {
      const events = await api.get<{ rows: BatchEvent[] }>(
        `/api/events?batchNo=${encodeURIComponent(batchNo)}&pageSize=100`,
        { signal },
      );
      setBatchEvents(events.rows);
    } catch {
      setBatchEvents([]);
    }
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const payload = await api.get<DiagnosisData>(
          `/api/diagnosis?event=${encodeURIComponent(eventCode)}`,
          { signal },
        );
        setData(payload);
        setHandlingStatus(payload.event.handlingStatus);
        setHandlingNote(payload.event.handlingNote ?? '');
        await loadBatchEvents(payload.event.batchNo, signal);
      } catch (caught) {
        if ((caught as { name?: string })?.name === 'AbortError') return;
        setError(errorMessage(caught, '加载诊断数据失败。'));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [eventCode, loadBatchEvents],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (initialData) {
      // 服务端已取回首屏数据，这里只补一次「该批次事件」用于趋势图着色
      void loadBatchEvents(initialData.event.batchNo, controller.signal);
    } else {
      void load(controller.signal);
    }
    return () => controller.abort();
  }, [initialData, load, loadBatchEvents]);

  async function runDiagnosis() {
    setBusy('run');
    try {
      const result = await api.post<{
        runId: number;
        runCode: string;
        runNo: number;
        hypotheses: number;
        dataVersionNote: string;
      }>('/api/diagnosis', { eventCode });
      toast.success(
        `已生成第 ${result.runNo} 次诊断（${result.runCode}），共 ${result.hypotheses} 条结论候选。请逐条验证。`,
      );
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught, '执行诊断失败。'));
    } finally {
      setBusy(null);
    }
  }

  async function createReport() {
    setBusy('report');
    try {
      const result = await api.post<{ reportId: number; code: string; created: boolean }>(
        '/api/reports',
        { eventCode },
      );
      toast.success(
        result.created
          ? `已生成 8D 报告 ${result.code}，请继续填写 D1–D8。`
          : `该事件已有 8D 报告 ${result.code}，正在打开。`,
      );
      router.push(`/reports/${result.reportId}`);
    } catch (caught) {
      toast.error(errorMessage(caught, '生成 8D 报告失败。'));
      setBusy(null);
    }
  }

  async function submitHandling() {
    setHandlingError(null);
    if (handlingStatus === 'closed' && !handlingNote.trim()) {
      setHandlingError('闭环事件必须填写处置说明。');
      return;
    }
    setBusy('handling');
    try {
      await api.patch('/api/events', {
        eventCode,
        status: handlingStatus,
        note: handlingNote.trim() || null,
      });
      toast.success(`事件处置状态已更新为「${HANDLING_LABELS[handlingStatus]}」。`);
      setHandlingOpen(false);
      await load();
    } catch (caught) {
      const message = errorMessage(caught, '更新事件处置状态失败。');
      setHandlingError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  // ── 趋势图：该批次该指标随抽检时间的变化 ──────────────────────────
  const eventRecordIds = useMemo(() => {
    const ids = new Set<number>();
    for (const event of batchEvents) {
      if (event.triggerRecordId !== null) ids.add(event.triggerRecordId);
    }
    if (!ids.size && data?.event.triggerRecordId) ids.add(data.event.triggerRecordId);
    return ids;
  }, [batchEvents, data]);

  const trendPoints = useMemo(() => {
    if (!data) return [];
    return [...data.batchRecords]
      .filter((record) => record.value !== null)
      .sort((a, b) => a.inspectTime.localeCompare(b.inspectTime));
  }, [data]);

  const trendOption = useMemo<EChartsOption | null>(() => {
    if (!data || trendPoints.length < 2) return null;
    const labels = trendPoints.map((record) => axisLabel(record.inspectTime));

    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => fmt(value, data.metric.decimalScale),
      },
      grid: { left: 56, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: labels, name: '抽检时间', nameLocation: 'end' },
      yAxis: {
        type: 'value',
        scale: true,
        name: `${data.metric.name}${data.metric.unit ? ` / ${data.metric.unit}` : ''}`,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { formatter: (value: number) => fmt(value, data.metric.decimalScale) },
      },
      series: [
        {
          type: 'line',
          name: data.metric.name,
          data: trendPoints.map((record) => ({
            value: record.value,
            itemStyle: {
              color: eventRecordIds.has(record.id) ? '#ef4444' : '#2563eb',
            },
            symbolSize: eventRecordIds.has(record.id) ? 10 : 7,
          })),
          lineStyle: { width: 2, color: '#93c5fd' },
          itemStyle: { color: '#2563eb' },
          connectNulls: false,
          markLine: highlightTime
            ? {
                symbol: 'none',
                silent: true,
                data: [{ xAxis: axisLabel(highlightTime) }],
                lineStyle: { color: '#f59e0b', type: 'dashed' },
                label: { formatter: '证据时间', fontSize: 10 },
              }
            : undefined,
        },
      ],
      animation: false,
    };
  }, [data, trendPoints, eventRecordIds, highlightTime]);

  // ── 对照图：同期工艺参数（温区偏差 / 牵引速度） ────────────────────
  const processTimes = useMemo(() => {
    const times = new Set<string>();
    for (const record of process.records) times.add(record.time);
    for (const zone of process.zones) for (const point of zone.points) times.add(point.time);
    return [...times].sort((a, b) => a.localeCompare(b));
  }, [process]);

  const processOption = useMemo<EChartsOption | null>(() => {
    const zoneSeries = process.zones.slice(0, 8);
    const hasSpeed = process.records.some(
      (record) => record.haulOffMpm !== null || record.lineSpeedMpm !== null,
    );
    if (!processTimes.length || (zoneSeries.length === 0 && !hasSpeed)) return null;

    const labels = processTimes.map(axisLabel);
    const series: LineSeriesOption[] = zoneSeries.map((zone) => ({
      type: 'line' as const,
      name: `${zone.zoneName} 偏差`,
      yAxisIndex: 0,
      connectNulls: true,
      symbolSize: 5,
      lineStyle: { width: 1.5 },
      data: processTimes.map((time) => {
        const point = zone.points.find((item) => item.time === time);
        return point ? Number(point.deviationC.toFixed(2)) : null;
      }),
    }));

    if (hasSpeed) {
      series.push({
        type: 'line',
        name: '牵引速度',
        yAxisIndex: 1,
        connectNulls: true,
        symbolSize: 5,
        lineStyle: { width: 2, type: 'dashed', color: '#f59e0b' },
        itemStyle: { color: '#f59e0b' },
        data: processTimes.map((time) => {
          const record = process.records.find((item) => item.time === time);
          if (!record) return null;
          const value = record.haulOffMpm ?? record.lineSpeedMpm;
          return value === null ? null : Number(value.toFixed(2));
        }),
      });
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, itemWidth: 12, itemHeight: 8, type: 'scroll' },
      grid: { left: 56, right: 56, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: labels, name: '工艺记录时间', nameLocation: 'end' },
      yAxis: [
        {
          type: 'value',
          scale: true,
          name: '温区偏差 / °C',
          nameTextStyle: { fontSize: 11 },
        },
        {
          type: 'value',
          scale: true,
          name: '牵引速度 / m·min⁻¹',
          nameTextStyle: { fontSize: 11 },
        },
      ],
      series,
      animation: false,
    };
  }, [process, processTimes]);

  if (loading && !data) {
    return <div className="u-empty">正在加载诊断数据…</div>;
  }

  if (error || !data) {
    return (
      <div className="p-panel">
        <div className="p-panel__head">
          <h2>诊断数据加载失败</h2>
        </div>
        <div className="p-panel__body">
          <p className="u-notice u-notice--danger">{error ?? '没有取到诊断数据。'}</p>
          <div className="u-row u-mt">
            <button type="button" className="u-btn" onClick={() => void load()}>
              重新加载
            </button>
            <Link className="u-btn" href="/diagnosis">
              返回事件列表
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { event, counts, metric } = data;
  const calibration =
    CALIBRATION_LABELS[event.ruleCalibrationStatus as CalibrationStatus] ??
    event.ruleCalibrationStatus;
  const confirmedCount = data.conclusions.filter(
    (item) => item.engineerDecision === 'confirmed',
  ).length;
  const pendingCount = data.conclusions.filter(
    (item) => item.engineerDecision === 'pending',
  ).length;
  const missingLayers = DATA_LAYERS.filter((layer) => counts[layer.key] === 0);
  const recordsWithoutValue = data.batchRecords.length - trendPoints.length;
  const latestRun = data.runs.find((run) => run.id === data.latestRunId) ?? data.runs[0] ?? null;

  return (
    <>
      <section className="p-panel u-mb">
        <div className="p-panel__head">
          <div>
            <h2>诊断流程</h2>
            <div className="u-xs u-faint u-mt">
              规则模板：{event.ruleCode} · 数据版本：{data.dataVersionNote}
            </div>
          </div>
          <div className="u-row">
            {permissions.canGenerate ? (
              <button
                type="button"
                className="u-btn u-btn--primary u-btn--small"
                disabled={busy !== null || !data.hasBuilder}
                onClick={() => void runDiagnosis()}
              >
                {busy === 'run' ? '执行中…' : latestRun ? '重新执行诊断' : '执行诊断'}
              </button>
            ) : (
              <span className="u-xs u-faint">当前角色无 analysis:generate 权限，仅可查看</span>
            )}
            {permissions.canHandleEvent ? (
              <button
                type="button"
                className="u-btn u-btn--small"
                onClick={() => setHandlingOpen(true)}
              >
                更新处置状态
              </button>
            ) : null}
            {permissions.canWriteReport ? (
              <button
                type="button"
                className="u-btn u-btn--small"
                disabled={busy !== null}
                onClick={() => void createReport()}
              >
                {busy === 'report' ? '处理中…' : '生成 8D 报告'}
              </button>
            ) : null}
            <button type="button" className="u-btn u-btn--small" onClick={() => void load()}>
              刷新
            </button>
          </div>
        </div>
        <div className="p-panel__body">
          {!data.hasBuilder ? (
            <div className="u-notice u-notice--warning u-mb">
              规则 {event.ruleCode} 目前没有诊断模板，无法生成结论候选。这是「无数据 / 无模板不推断」的
              有意设计，请在分析引擎中补充模板后再执行。
            </div>
          ) : null}

          <ol className="p-steps">
            <li className="p-step" data-state="done">
              <i>1</i>
              <span>采集证据：抽检 {fmtCount(data.batchRecords.length)} 条 · 数据层缺失 {missingLayers.length} 层</span>
            </li>
            <li className="p-step" data-state={latestRun ? 'done' : 'running'}>
              <i>2</i>
              <span>
                {latestRun
                  ? `生成结论候选：${latestRun.code}（第 ${latestRun.runNo} 次）`
                  : '生成结论候选：尚未执行诊断'}
              </span>
            </li>
            <li
              className="p-step"
              data-state={confirmedCount > 0 ? 'done' : latestRun ? 'running' : 'pending'}
            >
              <i>3</i>
              <span>
                工程师判定：已确认 {fmtCount(confirmedCount)} 条 · 待确认 {fmtCount(pendingCount)} 条
              </span>
            </li>
            <li className="p-step" data-state={confirmedCount > 0 ? 'running' : 'pending'}>
              <i>4</i>
              <span>写入 8D 报告 D4：只有「已确认」的结论可以作为根因引用</span>
            </li>
          </ol>

          <div className="u-notice u-notice--warning u-mt">
            当前事件阈值状态：<strong>{calibration}</strong>。
            {event.ruleCalibrationStatus === 'validated'
              ? '阈值已完成现场标定，判定结论仍需工程师复核确认。'
              : '触发值来自额定参数，本页所有判定位置都用于提示复核，不作为产品合格判定依据。'}
          </div>
        </div>
      </section>

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">结论候选</span>
          <span className="u-stat__value">{fmtCount(data.conclusions.length)}</span>
          <span className="u-stat__hint">均为假设，未确认前不是根因</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">已确认根因</span>
          <span className="u-stat__value">{fmtCount(confirmedCount)}</span>
          <span className="u-stat__hint">可作为 8D 报告 D4 的引用依据</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">待工程师验证</span>
          <span className="u-stat__value">{fmtCount(pendingCount)}</span>
          <span className="u-stat__hint">需填写验证结果与实际发现</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">数据层缺失</span>
          <span className="u-stat__value">{fmtCount(missingLayers.length)}</span>
          <span className="u-stat__hint">缺失层已列为「缺失证据」，不做推断</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">诊断批次</span>
          <span className="u-stat__value">{fmtCount(data.runs.length)}</span>
          <span className="u-stat__hint">
            最新：{latestRun ? safeText(latestRun.code) : NO_DATA}
          </span>
        </div>
      </div>

      <section className="p-panel u-mb">
        <div className="p-panel__head">
          <h2>数据层清单（有哪些层的数据、缺哪些层）</h2>
          <span className="u-xs u-faint">缺失的层按「缺失证据」列出，不用 0 或省略代替</span>
        </div>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>数据层</th>
                <th>用途</th>
                <th>记录数</th>
                <th>状态</th>
                <th>缺失时的处理</th>
              </tr>
            </thead>
            <tbody>
              {DATA_LAYERS.map((layer) => {
                const value = counts[layer.key];
                return (
                  <tr key={layer.key}>
                    <td>{layer.label}</td>
                    <td className="u-small u-muted">{layer.purpose}</td>
                    <td className="u-num">{fmtCount(value)}</td>
                    <td>
                      {value > 0 ? (
                        <span className="u-tag u-tag--normal">有数据</span>
                      ) : (
                        <span className="u-tag u-tag--danger">缺失证据</span>
                      )}
                    </td>
                    <td className="u-small">
                      {value > 0 ? (
                        <span className="u-faint">—</span>
                      ) : (
                        <span style={{ color: 'var(--c-danger)' }}>
                          缺失证据：{layer.label}无记录，相关判断只能标为假设，需先补齐数据
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-panel__body">
          <p className="u-xs u-faint">
            数据版本说明：{data.dataVersionNote}
            {data.influences.length
              ? `。指标「${metric.name}」的关联过程参数：${data.influences
                  .map((item) => `${item.name}（${item.unit}）`)
                  .join('、')}（关联关系用于确定排查范围，本身不构成因果证明）。`
              : '。该指标未配置关联过程参数，排查范围无法由系统给出。'}
          </p>
          {data.consistencyChecks.length ? (
            <>
              <div className="u-divider" />
              <h3 className="u-small u-strong u-mb">QMS/MES 核对结果</h3>
              <div className="u-table-wrap">
                <table className="u-table">
                  <thead>
                    <tr>
                      <th>记录</th>
                      <th>指标</th>
                      <th>主记录</th>
                      <th>待核对</th>
                      <th>差值</th>
                      <th>容差</th>
                      <th>结论</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consistencyChecks.map((check) => (
                      <tr key={`${check.recordId}-${check.metricName}`}>
                        <td className="u-num">{check.recordCode}</td>
                        <td>{check.metricName}</td>
                        <td className="u-num">{fmt(check.primaryValue, 3)}</td>
                        <td className="u-num">{fmt(check.secondaryValue, 3)}</td>
                        <td className="u-num">{fmt(check.diffValue, 3)}</td>
                        <td className="u-num">{fmt(check.toleranceValue, 3)}</td>
                        <td>{check.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="u-xs u-mt" style={{ color: 'var(--c-danger)' }}>
              缺失证据：该批次没有 QMS/MES 核对记录，无法判断超范围是否来自数据口径差异。
            </p>
          )}
        </div>
      </section>

      <div className="p-grid-2">
        <section className="p-panel" id="diagnosis-trend">
          <div className="p-panel__head">
            <div>
              <h2>批次内{metric.name}趋势（按抽检时间）</h2>
              <div className="u-xs u-faint u-mt">
                共 {fmtCount(data.batchRecords.length)} 条抽检记录
                {recordsWithoutValue > 0
                  ? `，其中 ${recordsWithoutValue} 条无${metric.name}测量值（按「无数据」处理，不补零、不插值）`
                  : ''}
              </div>
            </div>
            <div className="p-legend">
              <span>
                <i style={{ background: '#ef4444' }} />
                有事件
              </span>
              <span>
                <i style={{ background: '#2563eb' }} />
                无事件
              </span>
            </div>
          </div>
          <div className="p-panel__body">
            <EChart
              option={trendOption}
              height={300}
              ariaLabel={`批次内${metric.name}随抽检时间的变化`}
              emptyHint={
                data.batchRecords.length === 0
                  ? `缺少抽检记录，无法绘制${metric.name}趋势图。`
                  : `有效测量点不足 2 个，无法绘制${metric.name}趋势图。`
              }
            />
            {highlightTime ? (
              <p className="u-xs u-mt" style={{ color: '#b45309' }}>
                已按证据时间 {highlightTime} 在图中打标。
                <button
                  type="button"
                  className="u-btn u-btn--ghost u-btn--small"
                  onClick={() => setHighlightTime(null)}
                >
                  清除标记
                </button>
              </p>
            ) : null}
            <p className="u-xs u-faint u-mt">
              颜色只表示该抽检点是否触发了事件；阈值状态为「{calibration}」，
              图中的上限/下限对照仅用于提示复核，不是合格判定。
            </p>
          </div>
        </section>

        <section className="p-panel">
          <div className="p-panel__head">
            <div>
              <h2>同期工艺参数对照（温区偏差 / 牵引速度）</h2>
              <div className="u-xs u-faint u-mt">
                共 {fmtCount(counts.processRecords)} 条工艺记录 · {fmtCount(process.zones.length)} 个温区
              </div>
            </div>
          </div>
          <div className="p-panel__body">
            <EChart
              option={processOption}
              height={300}
              ariaLabel="同期工艺参数对照图"
              emptyHint={
                counts.processRecords === 0
                  ? '缺少工艺过程记录（温区设定/实测、牵引速度），无法绘制对照图。'
                  : '工艺记录中没有可用的温区偏差或牵引速度数值，无法绘制对照图。'
              }
            />
            <p className="u-xs u-faint u-mt">
              温区偏差为「实测 − 设定」，牵引速度取工艺记录的反馈值。
              偏差用于定位排查范围，与阈值状态「{calibration}」一样，只提示复核，
              不构成合格判定；没有数值的工艺记录不画点，也不按 0 处理。
            </p>
          </div>
        </section>
      </div>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>抽检记录明细</h2>
          <span className="u-xs u-faint">测量值缺失显示「{NO_DATA}」，不显示 0</span>
        </div>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>记录编号</th>
                <th>样管编号</th>
                <th>抽检时间</th>
                <th>{metric.name}{metric.unit ? `（${metric.unit}）` : ''}</th>
                <th>数据质量</th>
                <th>事件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {[...data.batchRecords]
                .sort((a, b) => a.inspectTime.localeCompare(b.inspectTime))
                .map((record) => (
                  <tr key={record.id}>
                    <td className="u-num">{record.code}</td>
                    <td className="u-num">{record.sampleNo}</td>
                    <td className="u-num">{record.inspectTime}</td>
                    <td className="u-num">
                      {record.value === null ? NO_DATA : fmt(record.value, metric.decimalScale)}
                    </td>
                    <td>
                      {record.qualityFlag === 'none' ? (
                        <span className="u-tag u-tag--normal">
                          {QUALITY_FLAG_LABELS.none}
                        </span>
                      ) : (
                        <span className="u-tag u-tag--medium">
                          {QUALITY_FLAG_LABELS[record.qualityFlag] ?? record.qualityFlag}
                        </span>
                      )}
                    </td>
                    <td>
                      {eventRecordIds.has(record.id) ? (
                        <span className="u-tag u-tag--high">有事件</span>
                      ) : (
                        <span className="u-tag">无</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="u-btn u-btn--small"
                        disabled={record.value === null}
                        onClick={() => setHighlightTime(record.inspectTime)}
                      >
                        在图中定位
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>参考对照（同规格历史批次）</h2>
          <span className="u-tag u-tag--info">历史参考统计量，不是合格判定限</span>
        </div>
        <div className="p-panel__body">
          <p className="u-notice u-notice--info u-mb">
            中位数与观察范围只描述历史批次的实际数据分布，<strong>不是规格限值、也不是合格判定限</strong>。
            本批次是否合格，需按规格限值与已标定的阈值另行判定。
          </p>
          {data.snapshots.length ? (
            <div className="u-table-wrap">
              <table className="u-table">
                <thead>
                  <tr>
                    <th>参考批次</th>
                    <th>生产组别</th>
                    <th>样本数</th>
                    <th>中位数</th>
                    <th>观察范围</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {data.snapshots.map((snapshot) => (
                    <tr key={snapshot.referenceBatchNo}>
                      <td className="u-num">{snapshot.referenceBatchNo}</td>
                      <td>{snapshot.productionGroup ?? NO_DATA}</td>
                      <td className="u-num">{fmtCount(snapshot.sampleCount)}</td>
                      <td className="u-num">{fmt(snapshot.medianValue, metric.decimalScale)}</td>
                      <td className="u-num">
                        {snapshot.minValue === null && snapshot.maxValue === null
                          ? NO_DATA
                          : `${fmt(snapshot.minValue, metric.decimalScale)} – ${fmt(
                              snapshot.maxValue,
                              metric.decimalScale,
                            )}`}
                      </td>
                      <td className="u-small u-muted">{snapshot.note ?? NO_DATA}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="u-notice u-notice--danger">
              缺失证据：同规格下没有可用的参考批次，无法做历史对照。相关结论只能作为假设，
              不能据此推断本批次偏离。
            </p>
          )}
        </div>
      </section>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <div>
            <h2>结论候选与工程师判定</h2>
            <div className="u-xs u-faint u-mt">
              每条都是待验证的假设。未确认的结论不能作为根因写入 8D 报告。
            </div>
          </div>
          {latestRun ? (
            <span className="u-tag u-tag--info">{safeText(latestRun.code)}</span>
          ) : null}
        </div>
        <div className="p-panel__body">
          {!latestRun ? (
            <div className="u-empty">
              该事件尚未执行诊断。
              {permissions.canGenerate
                ? '点击上方「执行诊断」生成结论候选。'
                : '请由具备 analysis:generate 权限的工程师执行诊断。'}
            </div>
          ) : data.conclusions.length === 0 ? (
            <div className="u-empty">
              本次诊断未生成任何结论候选（数据不足时不伪造结论）。请补齐数据后重新执行诊断。
            </div>
          ) : (
            <div className="p-stack">
              {data.conclusions.map((conclusion) => (
                <ConclusionCard
                  key={conclusion.id}
                  conclusion={conclusion}
                  evidence={data.evidence.filter(
                    (item) => item.conclusionId === conclusion.id,
                  )}
                  canVerify={permissions.canVerify}
                  metricName={metric.name}
                  onLocateEvidence={(time) => {
                    if (!time) return;
                    setHighlightTime(time);
                    document
                      .getElementById('diagnosis-trend')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  onDecided={() => void load()}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>诊断批次记录</h2>
          <span className="u-xs u-faint">重新执行诊断会新增批次，历史结论全部保留</span>
        </div>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>批次编号</th>
                <th>序号</th>
                <th>生成方式</th>
                <th>模型 / 模板</th>
                <th>状态</th>
                <th>数据版本说明</th>
                <th>生成时间</th>
                <th>生成人</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.length ? (
                data.runs.map((run) => (
                  <tr key={run.id}>
                    <td className="u-num">
                      {run.code}
                      {run.id === data.latestRunId ? (
                        <span className="u-tag u-tag--info" style={{ marginLeft: 6 }}>
                          当前展示
                        </span>
                      ) : null}
                    </td>
                    <td className="u-num">{run.runNo}</td>
                    <td>{run.generationType}</td>
                    <td>{run.modelName ?? NO_DATA}</td>
                    <td>{run.status}</td>
                    <td className="u-small u-muted">{safeText(run.dataVersionNote)}</td>
                    <td className="u-num">{safeText(run.generatedAt)}</td>
                    <td>{run.generatedByName ?? NO_DATA}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="u-empty">尚无诊断批次记录。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-panel__body">
          <p className="u-xs u-faint">
            事件处置状态：{HANDLING_LABELS[event.handlingStatus]}
            {event.handlerName ? ` · 处理人 ${event.handlerName}` : ''}
            {event.handlingNote ? ` · 说明：${event.handlingNote}` : ''}。
            有结论被确认后事件自动进入「处理中」，闭环需工程师手动确认，系统不自动关闭。
          </p>
        </div>
      </section>

      <Modal
        open={handlingOpen}
        title="更新事件处置状态"
        onClose={() => setHandlingOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="u-btn"
              onClick={() => setHandlingOpen(false)}
              disabled={busy === 'handling'}
            >
              取消
            </button>
            <button
              type="button"
              className="u-btn u-btn--primary"
              onClick={() => void submitHandling()}
              disabled={busy === 'handling'}
            >
              {busy === 'handling' ? '提交中…' : '提交'}
            </button>
          </>
        }
      >
        <div className="u-field">
          <label className="u-field__label" htmlFor="handling-status">
            处置状态
          </label>
          <select
            id="handling-status"
            className="u-select"
            value={handlingStatus}
            onChange={(changeEvent) =>
              setHandlingStatus(changeEvent.target.value as HandlingStatus)
            }
          >
            {(Object.keys(HANDLING_LABELS) as HandlingStatus[]).map((status) => (
              <option key={status} value={status}>
                {HANDLING_LABELS[status]}
              </option>
            ))}
          </select>
          <span className="u-field__hint">
            处置状态是事件生命周期的唯一入口：待处理 → 处理中 → 已验证 → 已闭环 / 已忽略。
          </span>
        </div>
        <div className="u-field u-mt">
          <label className="u-field__label" htmlFor="handling-note">
            处置说明{handlingStatus === 'closed' ? '（闭环必填）' : ''}
          </label>
          <textarea
            id="handling-note"
            className="u-textarea"
            rows={3}
            maxLength={500}
            value={handlingNote}
            onChange={(changeEvent) => setHandlingNote(changeEvent.target.value)}
            placeholder="例如：已隔离该批次 12 根样管并加严抽检，等待工艺参数复核结果。"
          />
          {handlingError ? <span className="u-field__error">{handlingError}</span> : null}
        </div>
        <p className="u-xs u-faint u-mt">
          每次状态变更都会写入操作日志（谁、何时、因为什么）。当前状态：
          {HANDLING_LABELS[event.handlingStatus]}。
        </p>
      </Modal>

      <p className="u-xs u-faint u-mt">
        {data.conclusions.length
          ? `当前展示 ${data.conclusions.length} 条结论候选，决策标签：${DECISION_LABELS.confirmed} / ${DECISION_LABELS.rejected}；`
          : ''}
        风险等级：{RISK_LABELS[event.riskType]}，触发原因：{event.reason}
      </p>
    </>
  );
}

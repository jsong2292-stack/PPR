'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/client/api';
import { fmt, NO_DATA } from '@/lib/format';
import { RISK_LABELS, HANDLING_LABELS, CALIBRATION_LABELS, type RiskType, type HandlingStatus, type CalibrationStatus } from '@/lib/types';

interface MetricValue {
  metricId: number;
  metricCode: string;
  metricName: string;
  unit: string | null;
  value: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
  decimalScale: number;
}

interface DetailResponse {
  record: {
    id: number;
    code: string;
    sampleNo: string;
    batchNo: string;
    productionGroup: string | null;
    inspectTime: string;
    productionTime: string | null;
    inspectionDelayMinutes: number | null;
    measurementStage: string;
    inspectionMethod: string | null;
    instrumentInfo: string | null;
    qualityFlag: string;
    qualityNote: string | null;
    dataSourceName: string | null;
    remark: string | null;
  };
  metrics: MetricValue[];
  events: Array<{
    id: number;
    code: string;
    ruleCode: string;
    ruleName: string;
    riskType: RiskType;
    metricName: string;
    reason: string;
    windowStartTime: string | null;
    windowEndTime: string;
    handlingStatus: HandlingStatus;
    ruleCalibrationStatus: string;
    affectedLengthM: number | null;
    lineSpeedMpm: number | null;
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  initial: '初测',
  retest: '复测',
  unconfirmed: '初测/复测待确认',
};

const QUALITY_FLAG_LABELS: Record<string, string> = {
  none: '无数据质量问题',
  qms_mes_mismatch: 'QMS/MES 记录差异',
  measurement_error: '测量数据错误',
  spec_mismatch: '规格匹配待核对',
  insufficient: '数据不足',
};

/**
 * 抽检详情面板。
 *
 * 数据通过接口按需加载：网格里可能有很多格子，没必要在首屏把所有记录详情都渲染出来。
 */
export function InspectionPanel({ recordId }: { recordId: number | null }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<DetailResponse>(`/api/monitor/inspections/${id}`, { signal });
      setDetail(data);
    } catch (caught) {
      if ((caught as { name?: string })?.name === 'AbortError') return;
      setError(errorMessage(caught, '加载抽检详情失败。'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (recordId === null) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    void load(recordId, controller.signal);
    return () => controller.abort();
  }, [recordId, load]);

  if (recordId === null) {
    return (
      <aside className="p-panel">
        <div className="p-panel__head">
          <h2>抽检详情</h2>
        </div>
        <div className="p-panel__body">
          <p className="u-muted u-small">
            在左侧网格中选择一个抽检点，这里会显示该样管的测量值、数据质量标记与触发事件。
          </p>
        </div>
      </aside>
    );
  }

  if (loading && !detail) {
    return (
      <aside className="p-panel">
        <div className="p-panel__head">
          <h2>抽检详情</h2>
        </div>
        <div className="u-empty">加载中…</div>
      </aside>
    );
  }

  if (error || !detail) {
    return (
      <aside className="p-panel">
        <div className="p-panel__head">
          <h2>抽检详情</h2>
        </div>
        <div className="p-panel__body">
          <p className="u-notice u-notice--danger">{error ?? '未找到该记录。'}</p>
        </div>
      </aside>
    );
  }

  const { record, metrics, events } = detail;
  const primaryEvent = events[0];

  return (
    <aside className="p-panel">
      <div className="p-panel__head">
        <h2>抽检详情</h2>
        {primaryEvent ? (
          <span className={`u-tag u-tag--${primaryEvent.riskType}`}>
            {RISK_LABELS[primaryEvent.riskType]}
          </span>
        ) : (
          <span className="u-tag u-tag--normal">未触发预警</span>
        )}
      </div>

      <div className="p-panel__body">
        <dl className="u-small">
          <DetailRow label="记录编号" value={record.code} mono />
          <DetailRow label="样管编号" value={record.sampleNo} mono />
          <DetailRow label="批次编号" value={record.batchNo} mono />
          <DetailRow label="生产组别" value={record.productionGroup} />
          <DetailRow label="抽检时间" value={record.inspectTime} mono />
          <DetailRow
            label="生产时间"
            value={record.productionTime ?? '待 MES 回传'}
          />
          <DetailRow
            label="检测延迟"
            value={
              record.inspectionDelayMinutes === null
                ? '无法计算（缺生产时间）'
                : `${record.inspectionDelayMinutes} 分钟`
            }
          />
          <DetailRow label="测量阶段" value={STAGE_LABELS[record.measurementStage] ?? record.measurementStage} />
          <DetailRow label="检验方法" value={record.inspectionMethod} />
          <DetailRow label="量具 / 仪器" value={record.instrumentInfo} />
          <DetailRow label="数据来源" value={record.dataSourceName} />
          <DetailRow
            label="数据质量"
            value={QUALITY_FLAG_LABELS[record.qualityFlag] ?? record.qualityFlag}
          />
          {record.qualityNote ? <DetailRow label="质量说明" value={record.qualityNote} /> : null}
          {record.remark ? <DetailRow label="备注" value={record.remark} /> : null}
        </dl>

        <div className="u-divider" />

        <h3 className="u-small u-strong u-mb">测量值与规格对照</h3>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>测量值</th>
                <th>规格范围</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const outOfRange =
                  metric.value !== null &&
                  ((metric.lowerLimit !== null && metric.value < metric.lowerLimit) ||
                    (metric.upperLimit !== null && metric.value > metric.upperLimit));
                return (
                  <tr key={metric.metricCode}>
                    <td>{metric.metricName}</td>
                    <td className="u-num">
                      {metric.value === null
                        ? NO_DATA
                        : `${fmt(metric.value, metric.decimalScale)} ${metric.unit ?? ''}`}
                    </td>
                    <td className="u-num">
                      {metric.lowerLimit === null && metric.upperLimit === null
                        ? '未配置限值'
                        : `${fmt(metric.lowerLimit, metric.decimalScale)} – ${fmt(
                            metric.upperLimit,
                            metric.decimalScale,
                          )}`}
                    </td>
                    <td>
                      {metric.value === null ? (
                        <span className="u-tag">无数据</span>
                      ) : outOfRange ? (
                        <span className="u-tag u-tag--medium">超范围</span>
                      ) : (
                        <span className="u-tag u-tag--normal">范围内</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="u-xs u-faint u-mt">
          「规格范围」来自规格限值配置，当前标定状态为
          {metrics.length ? '' : '未配置'}：{' '}
          {CALIBRATION_LABELS[(primaryEvent?.ruleCalibrationStatus as CalibrationStatus) ?? 'demo']}。
          「范围内」只表示落在配置范围内，不构成产品合格判定。
        </p>

        {events.length ? (
          <>
            <div className="u-divider" />
            <h3 className="u-small u-strong u-mb">触发事件</h3>
            {events.map((event) => (
              <div key={event.id} className="u-notice u-notice--warning u-mb">
                <div>
                  <div className="u-row u-row--between">
                    <strong>
                      [{event.ruleCode}] {event.ruleName}
                    </strong>
                    <span className={`u-tag u-tag--${event.riskType}`}>
                      {RISK_LABELS[event.riskType]}
                    </span>
                  </div>
                  <p className="u-small u-mt">{event.reason}</p>
                  <p className="u-xs u-faint u-mt">
                    窗口：{event.windowStartTime ?? '—'} ~ {event.windowEndTime} · 异常指标：
                    {event.metricName} · 处置状态：
                    {HANDLING_LABELS[event.handlingStatus] ?? event.handlingStatus}
                    {event.affectedLengthM !== null
                      ? ` · 影响长度估算 ${fmt(event.affectedLengthM, 1)} m（按线速度 ${fmt(
                          event.lineSpeedMpm,
                          2,
                        )} m/min）`
                      : ' · 影响长度：缺线速度记录，无法估算'}
                  </p>
                  <div className="u-row u-mt">
                    <Link className="u-btn u-btn--small" href={`/diagnosis?event=${event.code}`}>
                      进入诊断
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="u-divider" />
            <p className="u-small u-muted">
              该抽检记录未触发预警事件。按当前规则集（R1–R4）未发现问题，
              这不等同于产品已完成正式合格判定。
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="u-row u-row--between" style={{ alignItems: 'baseline' }}>
      <span className="u-faint u-xs">{label}</span>
      <span className={mono ? 'u-num u-small' : 'u-small'}>{value ?? NO_DATA}</span>
    </div>
  );
}

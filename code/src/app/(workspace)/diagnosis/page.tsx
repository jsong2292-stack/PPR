import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  DiagnosisWorkbench,
  type DiagnosisData,
  type ProcessParameterPayload,
} from '@/components/diagnosis/DiagnosisWorkbench';
import { can, requirePermission } from '@/lib/auth/session';
import { findAlertEventByCode, listAlertEvents } from '@/lib/repositories/alertEventRepository';
import { listProcessRecords } from '@/lib/repositories/diagnosisRepository';
import {
  CALIBRATION_LABELS,
  HANDLING_LABELS,
  RISK_LABELS,
  type CalibrationStatus,
  type HandlingStatus,
  type RiskType,
} from '@/lib/types';
import { fmt, fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '异常诊断与验证' };
export const dynamic = 'force-dynamic';

/**
 * 异常诊断与验证（服务端页面）。
 *
 * 两种视图：
 *   - 不带 `?event=` ：列出可诊断的预警事件，供工程师选择；
 *   - 带 `?event=<事件编号>`：把事件编码交给客户端工作区，由其调用
 *     GET /api/diagnosis 取回结论候选、证据、数据层计数与参考快照。
 *
 * 为什么工艺参数（温区偏差 / 牵引速度）序列在这里取：
 * 诊断接口目前只返回工艺记录的**条数**，不返回逐条序列，而对图（要求 5）
 * 需要真实数值。这里服务端直接读同一张表，把序列作为 props 交给图表，
 * 避免「有计数却画不出图」或「用假数据补图」。
 */
export default async function DiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const user = await requirePermission('analysis:read');
  const query = await searchParams;
  const eventCode = query.event?.trim();

  if (!eventCode) {
    return <EventPicker />;
  }

  const event = await findAlertEventByCode(eventCode);
  if (!event) {
    return (
      <>
        <PageHeader
          title="异常诊断与验证"
          description="对照规格限值、批次内变化趋势与参考批次统计量，形成待工程师确认的结构化结论。结论是假设，不是根因。"
          actions={
            <Link className="u-btn" href="/diagnosis">
              选择其它事件
            </Link>
          }
        />
        <div className="u-notice u-notice--danger">
          未找到编号为「{eventCode}」的预警事件。请返回事件列表重新选择。
        </div>
      </>
    );
  }

  const { records, zones } = await listProcessRecords(event.batchId);
  const process: ProcessParameterPayload = {
    records: records.map((record) => ({
      time: record.recordTime,
      haulOffMpm: record.haulOffFeedbackMpm,
      lineSpeedMpm: record.pipeLineSpeedMpm,
    })),
    zones: buildZoneSeries(records, zones),
  };

  // 首屏数据由服务端取一次，客户端仍可继续调用同一接口刷新：
  // 这样 HTML 里就有结论、证据与数据层清单（无 JS 也能读到业务口径），
  // 同时把图表 option 的计算放在 SSR 里跑一遍，避免只在浏览器里才暴露的错误。
  const initialData = await loadDiagnosisPayload(event.code);

  const calibration =
    CALIBRATION_LABELS[event.ruleCalibrationStatus as CalibrationStatus] ??
    event.ruleCalibrationStatus;

  return (
    <>
      <PageHeader
        title="异常诊断与验证"
        description="结论是待验证的假设，不是根因。每条结论都必须由工程师填写验证结果与实际发现后确认，未确认的结论不得写入 8D 报告。"
        meta={
          <>
            <span className="u-tag u-tag--info">{event.code}</span>
            <span className={`u-tag u-tag--${event.riskType}`}>
              {RISK_LABELS[event.riskType as RiskType]}
            </span>
            <span className="u-tag">
              {event.ruleCode} {event.ruleName}
            </span>
            <span className="u-tag">
              {HANDLING_LABELS[event.handlingStatus as HandlingStatus]}
            </span>
            <span className="u-tag u-tag--medium">{calibration}</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href={`/reports?keyword=${encodeURIComponent(event.code)}`}>
              查看该事件 8D 报告
            </Link>
            <Link className="u-btn" href="/diagnosis">
              切换事件
            </Link>
          </>
        }
      />

      <div className="u-notice u-notice--info u-mb">
        事件 {event.code} · 批次 {event.batchNo}
        {event.productionGroup ? `（${event.productionGroup}）` : ''} · 触发记录{' '}
        {event.triggerRecordCode ?? '无数据'} · 窗口 {event.windowStartTime ?? '—'} ~{' '}
        {event.windowEndTime} · 影响长度{' '}
        {event.affectedLengthM === null
          ? '无法估算（缺少该批次线速度记录）'
          : `${fmt(event.affectedLengthM, 1)} m`}
      </div>

      <DiagnosisWorkbench
        eventCode={event.code}
        process={process}
        initialData={initialData}
        permissions={{
          canGenerate: can(user, 'analysis:generate'),
          canVerify: can(user, 'analysis:verify'),
          canWriteReport: can(user, 'report:write'),
          canHandleEvent: can(user, 'monitor:read'),
        }}
      />
    </>
  );
}

/**
 * 服务端取一次诊断数据（复用 GET /api/diagnosis，并把当前请求的 Cookie 带上）。
 * 失败时不抛错：交给客户端组件自行加载，页面退化为纯客户端取数。
 */
async function loadDiagnosisPayload(eventCode: string): Promise<DiagnosisData | null> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host');
    if (!host) return null;
    const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
    const response = await fetch(
      `${proto}://${host}/api/diagnosis?event=${encodeURIComponent(eventCode)}`,
      {
        headers: { cookie: requestHeaders.get('cookie') ?? '' },
        cache: 'no-store',
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: boolean; data?: DiagnosisData };
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

/** 把温区记录按「温区名 → 时间序列」分组，只保留有偏差值的数据点 */
function buildZoneSeries(
  records: Array<{ id: number; recordTime: string }>,
  zones: Array<{ processRecordId: number; zoneName: string; deviationC: number | null }>,
): ProcessParameterPayload['zones'] {
  const timeById = new Map(records.map((record) => [record.id, record.recordTime]));
  const byZone = new Map<string, Array<{ time: string; deviationC: number }>>();

  for (const zone of zones) {
    if (zone.deviationC === null) continue;
    const time = timeById.get(zone.processRecordId);
    if (!time) continue;
    const list = byZone.get(zone.zoneName) ?? [];
    list.push({ time, deviationC: Number(zone.deviationC) });
    byZone.set(zone.zoneName, list);
  }

  return [...byZone.entries()].map(([zoneName, points]) => ({
    zoneName,
    points: points.sort((a, b) => a.time.localeCompare(b.time)),
  }));
}

/** 无 `?event=` 时的事件选择列表（服务端渲染，不依赖客户端请求） */
async function EventPicker() {
  const events = await listAlertEvents({ page: 1, pageSize: 20 });

  return (
    <>
      <PageHeader
        title="异常诊断与验证"
        description="先从预警事件中选择一条进入诊断工作台。诊断会按 R1–R4 的规则模板生成结论候选，候选结论必须由工程师逐条验证。"
        meta={
          <>
            <span className="u-tag u-tag--info">可诊断事件 {fmtCount(events.total)} 条</span>
            <span className="u-tag u-tag--medium">阈值待现场标定</span>
          </>
        }
        actions={
          <Link className="u-btn" href="/monitor">
            返回质量监控
          </Link>
        }
      />

      <section className="p-panel u-mb">
        <div className="p-panel__head">
          <h2>按事件编号直接进入</h2>
        </div>
        <div className="p-panel__body">
          <form className="u-row" action="/diagnosis" method="get">
            <label className="u-field" style={{ flex: '1 1 320px' }}>
              <span className="u-field__label">预警事件编号</span>
              <input
                className="u-input"
                type="text"
                name="event"
                placeholder="例如 QE-12121D0032-20261009-001"
                autoComplete="off"
              />
            </label>
            <button className="u-btn u-btn--primary" type="submit">
              进入诊断
            </button>
          </form>
          <p className="u-xs u-faint u-mt">
            事件编号可在「质量监控与预警」的事件列表或通知记录中找到。
          </p>
        </div>
      </section>

      <section className="p-panel">
        <div className="p-panel__head">
          <h2>待诊断事件</h2>
          <span className="u-xs u-faint">按窗口终点倒序，最多显示 20 条</span>
        </div>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>事件编号</th>
                <th>批次</th>
                <th>规则</th>
                <th>风险</th>
                <th>异常指标</th>
                <th>窗口终点</th>
                <th>处置状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {events.rows.length ? (
                events.rows.map((event) => (
                  <tr key={event.id}>
                    <td className="u-num">{event.code}</td>
                    <td className="u-num">{event.batchNo}</td>
                    <td>
                      <span className="u-tag">{event.ruleCode}</span> {event.ruleName}
                    </td>
                    <td>
                      <span className={`u-tag u-tag--${event.riskType}`}>
                        {RISK_LABELS[event.riskType as RiskType]}
                      </span>
                    </td>
                    <td>{event.metricName}</td>
                    <td className="u-num">{event.windowEndTime}</td>
                    <td>{HANDLING_LABELS[event.handlingStatus as HandlingStatus]}</td>
                    <td>
                      <Link className="u-btn u-btn--small" href={`/diagnosis?event=${event.code}`}>
                        进入诊断
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="u-empty">当前没有可诊断的预警事件。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="u-xs u-faint u-mt">
        说明：R1–R4 的阈值目前为「{CALIBRATION_LABELS.pending_field_validation}」状态，
        预警用于提示复核，不作为产品合格判定依据。
      </p>
    </>
  );
}

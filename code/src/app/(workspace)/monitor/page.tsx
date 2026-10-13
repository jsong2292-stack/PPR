import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { InspectionPanel } from '@/components/monitor/InspectionPanel';
import { MonitorGrid } from '@/components/monitor/MonitorGrid';
import { requirePermission } from '@/lib/auth/session';
import { loadMonitorOverview } from '@/lib/services/monitorService';
import { HANDLING_LABELS, RISK_LABELS, type HandlingStatus, type RiskType } from '@/lib/types';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '质量监控与预警' };

/** 阈值标定状态文案（与 alert_rule.calibration_status 的展示口径一致） */
const CALIBRATION_TEXT = '阈值待现场标定';
export const dynamic = 'force-dynamic';

/**
 * 质量监控与预警（服务端页面）。
 *
 * 数据全部来自数据库：抽检记录、批次、预警事件。
 * 交互（选中抽检点）通过 URL 查询参数表达，因此刷新、分享链接、
 * 浏览器前进后退都能保持在同一视图，也便于服务端直接渲染详情面板。
 */
export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string; spec?: string; from?: string; to?: string }>;
}) {
  await requirePermission('monitor:read');
  const query = await searchParams;

  const specId = query.spec ? Number(query.spec) : undefined;
  const overview = await loadMonitorOverview({
    specId: Number.isFinite(specId) ? specId : undefined,
    from: query.from,
    to: query.to,
  });

  const selectedId = query.record ? Number(query.record) : null;
  const validSelected =
    selectedId !== null && Number.isFinite(selectedId) && selectedId > 0 ? selectedId : null;

  const { summary } = overview;
  const mediumCount = summary.byRisk.medium ?? 0;
  const errorCount = summary.byRisk.error ?? 0;
  const highCount = summary.byRisk.high ?? 0;
  const pendingCount = summary.byHandling.pending ?? 0;

  return (
    <>
      <PageHeader
        title="质量监控与预警"
        description="按批次与抽检时间定位风险，查看触发规则、影响范围与处置入口。风险由服务端规则引擎按 R1–R5 顺序判定后落库，本页不做前端计算。"
        meta={
          <>
            <span className="u-tag u-tag--info">
              抽检点 {fmtCount(overview.inspectedCount)} 个
            </span>
            <span className="u-tag">
              覆盖批次 {fmtCount(overview.batches.length)} 个
            </span>
            {summary.byRule.R4 ? (
              <span className="u-tag u-tag--normal">趋势规则已启用</span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/diagnosis">
              异常诊断
            </Link>
            <Link className="u-btn" href="/reports">
              8D 报告
            </Link>
          </>
        }
      />

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">已筛查抽检点</span>
          <span className="u-stat__value">{fmtCount(overview.inspectedCount)}</span>
          <span className="u-stat__hint">目标规格的有效抽检记录</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">当前异常事件</span>
          <span className="u-stat__value">{fmtCount(summary.total)}</span>
          <span className="u-stat__hint">由 R1–R4 顺序判定生成</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">中风险</span>
          <span className="u-stat__value">{fmtCount(mediumCount)}</span>
          <span className="u-stat__hint">趋势变化 / 规格限值对照</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">数据待核对</span>
          <span className="u-stat__value">{fmtCount(errorCount + highCount)}</span>
          <span className="u-stat__hint">记录差异 / 测量数据有效性</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">待工程师处理</span>
          <span className="u-stat__value">{fmtCount(pendingCount)}</span>
          <span className="u-stat__hint">
            处理中 {fmtCount(summary.byHandling.processing ?? 0)} 条
          </span>
        </div>
      </div>

      <div className="p-grid-2">
        <section className="p-panel">
          <div className="p-panel__head">
            <div>
              <h2>批次 × 抽检时间风险轨迹</h2>
              <div className="u-xs u-faint u-mt">每个单元格代表一条样管抽检记录，颜色为该记录的风险等级</div>
            </div>
            <div className="p-legend">
              <span>
                <i style={{ background: '#bbf7d0' }} />
                正常
              </span>
              <span>
                <i style={{ background: '#fbbf24' }} />
                中风险
              </span>
              <span>
                <i style={{ background: '#ef4444' }} />
                高风险
              </span>
              <span>
                <i style={{ background: '#a78bfa' }} />
                数据报错
              </span>
            </div>
          </div>
          <div className="p-panel__body">
            <MonitorGrid
              batches={overview.batches}
              times={overview.times}
              cells={overview.cells}
              selectedRecordId={validSelected}
            />
          </div>
        </section>

        <InspectionPanel recordId={validSelected} />
      </div>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>待处理异常事件</h2>
          <Link className="u-btn u-btn--small" href="/notifications">
            查看通知记录
          </Link>
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
              {overview.openEvents.length ? (
                overview.openEvents.map((event) => (
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
                        诊断
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="u-empty">
                      当前没有待处理事件。规则引擎会按配置的间隔自动扫描新抽检记录。
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>阈值标定状态说明</h2>
        </div>
        <div className="p-panel__body">
          <div className="u-notice u-notice--warning">
            R3 规格限值与 R4 趋势阈值目前处于「{CALIBRATION_TEXT}」状态，其取值来自额定参数，
            尚未用现场数据标定。因此本页的预警结论用于提示复核，不作为产品合格判定依据。
            标定完成后，请在「系统管理 → 预警规则」更新阈值并把标定状态改为已标定。
          </div>
          <div className="u-row u-mt">
            <Link className="u-btn u-btn--small" href="/system/rules">
              查看规则与阈值
            </Link>
            <Link className="u-btn u-btn--small" href="/datasource/import">
              Excel 批量导入
            </Link>
          </div>
        </div>
      </section>

      <p className="u-xs u-faint u-mt">
        影响长度估算口径：异常窗口时长（分钟）× 该批次最近一条工艺记录的管材线速度（m/min）。
        缺少线速度记录时显示「无法估算」，不用质量产出率换算——两者是相互独立的量。
      </p>
    </>
  );
}

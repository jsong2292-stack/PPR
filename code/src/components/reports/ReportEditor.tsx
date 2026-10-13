'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage, fieldErrors } from '@/lib/client/api';
import { fmtCount, NO_DATA } from '@/lib/format';
import { REPORT_STATUS_LABELS, type ReportStatus } from '@/lib/types';

interface ReportField {
  code: string;
  name: string;
  content: string;
  sourceType: 'pending' | 'ai_prefill' | 'engineer';
  isRequired: boolean;
  updatedBy: number | null;
  updatedAt: string | null;
  hint: string;
}

interface ConfirmedConclusion {
  seq: number;
  hypothesis: string;
  actualFinding: string | null;
}

interface Revision {
  id: number;
  versionNo: number;
  action: string;
  summary: string | null;
  operatorName: string | null;
  createdAt: string;
}

interface ReportDetailPayload {
  report: {
    id: number;
    code: string;
    eventId: number;
    eventCode: string;
    batchNo: string;
    ruleCode: string;
    productionGroup: string | null;
    status: string;
    versionNo: number;
    riskType: string;
    metricName: string;
    windowStartTime: string | null;
    windowEndTime: string;
    affectedLengthM: number | null;
    savedAt: string | null;
    finalizedAt: string | null;
    ownerName: string | null;
    reviewerNote: string | null;
    createdAt: string;
  };
  fields: ReportField[];
  confirmedConclusions: ConfirmedConclusion[];
  revisions: Revision[];
}

const SOURCE_TYPE_LABELS: Record<ReportField['sourceType'], string> = {
  pending: '待填写',
  ai_prefill: '系统预填，请人工核对',
  engineer: '工程师填写',
};

/** 预填内容用警示色，工程师已填写内容用正常色 */
const SOURCE_TYPE_TONES: Record<ReportField['sourceType'], string> = {
  pending: 'u-tag',
  ai_prefill: 'u-tag u-tag--medium',
  engineer: 'u-tag u-tag--normal',
};

const REVISION_ACTION_LABELS: Record<string, string> = {
  create: '生成报告',
  save_draft: '保存草稿',
  finalize: '定稿',
  reopen: '重新打开',
  export: '导出 / 打印',
};

/** 定稿前必须在页面上先自查的必填项（与后端 finalize 校验一一对应） */
const REQUIRED_CODES = ['D1', 'D2', 'D3'];

export function ReportEditor({
  detail,
  permissions,
}: {
  detail: ReportDetailPayload;
  permissions: { canWrite: boolean; canFinalize: boolean };
}) {
  const toast = useToast();

  const [current, setCurrent] = useState<ReportDetailPayload>(detail);
  const [contents, setContents] = useState<Record<string, string>>(() =>
    Object.fromEntries(detail.fields.map((field) => [field.code, field.content])),
  );
  const [reviewerNote, setReviewerNote] = useState(detail.report.reviewerNote ?? '');
  const [busy, setBusy] = useState<'save' | 'finalize' | 'reopen' | 'export' | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);

  const { report, fields, confirmedConclusions, revisions } = current;
  const readOnly = report.status === 'finalized';
  const editable = permissions.canWrite && !readOnly;

  // 服务端返回新版本后，用最新内容覆盖本地编辑态
  useEffect(() => {
    setCurrent(detail);
    setContents(Object.fromEntries(detail.fields.map((field) => [field.code, field.content])));
    setReviewerNote(detail.report.reviewerNote ?? '');
  }, [detail]);

  /** 本地定稿自查：必填小节 + 至少一条已确认根因结论 */
  const checks = useMemo(() => {
    const requiredFields = fields.filter(
      (field) => field.isRequired || REQUIRED_CODES.includes(field.code),
    );
    const items = requiredFields.map((field) => ({
      ok: (contents[field.code] ?? '').trim().length > 0,
      text: `${field.code}「${field.name}」已填写`,
      failText: `${field.code}「${field.name}」尚未填写`,
    }));
    items.push({
      ok: confirmedConclusions.length > 0,
      text: `已确认根因结论 ${fmtCount(confirmedConclusions.length)} 条（可作为 D4 引用依据）`,
      failText: '尚无工程师已确认的根因结论，请先在异常诊断中确认结论',
    });
    return items;
  }, [fields, contents, confirmedConclusions]);

  const failedChecks = checks.filter((item) => !item.ok);

  async function reload() {
    const fresh = await api.get<ReportDetailPayload>(`/api/reports/${report.id}`);
    setCurrent(fresh);
    setContents(Object.fromEntries(fresh.fields.map((field) => [field.code, field.content])));
    setReviewerNote(fresh.report.reviewerNote ?? '');
  }

  function payloadFields() {
    return fields.map((field) => ({ code: field.code, content: contents[field.code] ?? '' }));
  }

  async function saveDraft(): Promise<boolean> {
    setBusy('save');
    setFormError(null);
    try {
      const result = await api.post<{ report: ReportDetailPayload }>('/api/reports', {
        reportId: report.id,
        fields: payloadFields(),
        reviewerNote: reviewerNote.trim() || null,
      });
      setCurrent(result.report);
      setContents(
        Object.fromEntries(result.report.fields.map((field) => [field.code, field.content])),
      );
      setBlocking([]);
      toast.success(`草稿已保存（v${result.report.report.versionNo}）。`);
      return true;
    } catch (caught) {
      const fieldsError = fieldErrors(caught);
      const lines = Object.entries(fieldsError).map(([key, value]) => `${key}：${value}`);
      setFormError(lines.length ? lines.join('；') : errorMessage(caught, '保存草稿失败。'));
      toast.error(errorMessage(caught, '保存草稿失败。'));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function finalize() {
    setFormError(null);
    if (failedChecks.length) {
      setBlocking(failedChecks.map((item) => item.failText));
      toast.error(`定稿条件未满足（${failedChecks.length} 项），请查看右侧校验清单。`);
      return;
    }
    setBlocking([]);
    setBusy('finalize');
    try {
      // 先把编辑中的内容落库，再定稿：否则后端校验的是旧内容
      await api.post('/api/reports', {
        reportId: report.id,
        fields: payloadFields(),
        reviewerNote: reviewerNote.trim() || null,
      });
      await api.post('/api/reports', {
        reportId: report.id,
        action: 'finalize',
        reviewerNote: reviewerNote.trim() || null,
      });
      await reload();
      toast.success('报告已定稿。所有小节转为只读，如需修改请填写原因后重新打开。');
    } catch (caught) {
      const fieldsError = fieldErrors(caught);
      const raw = fieldsError._ ?? fieldsError.reason ?? '';
      const lines = raw
        ? raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
      setBlocking(lines.length ? lines : [errorMessage(caught, '定稿失败。')]);
      toast.error(errorMessage(caught, '定稿失败。'));
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    setReopenError(null);
    if (!reopenReason.trim()) {
      setReopenError('重新打开必须填写原因（例如：D6 验证数据补充、根因结论被否决）。');
      return;
    }
    setBusy('reopen');
    try {
      await api.post('/api/reports', {
        reportId: report.id,
        action: 'reopen',
        reason: reopenReason.trim(),
      });
      await reload();
      setReopenOpen(false);
      setReopenReason('');
      toast.success('报告已重新打开为草稿，版本记录保留。');
    } catch (caught) {
      const message = errorMessage(caught, '重新打开失败。');
      setReopenError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function exportAndPrint() {
    setBusy('export');
    try {
      await api.post(`/api/reports/${report.id}`);
      toast.success('已记录导出/打印留痕，正在调起打印。');
      window.print();
    } catch (caught) {
      toast.error(errorMessage(caught, '记录导出留痕失败。'));
    } finally {
      setBusy(null);
    }
  }

  function appendConclusion(conclusion: ConfirmedConclusion) {
    const line = `已确认结论 #${conclusion.seq}：${conclusion.hypothesis}${
      conclusion.actualFinding ? `（实际发现：${conclusion.actualFinding}）` : ''
    }`;
    setContents((prev) => {
      const existing = prev.D4 ?? '';
      if (existing.includes(line)) return prev;
      return { ...prev, D4: existing ? `${existing}\n${line}` : line };
    });
    toast.success(`已把结论 #${conclusion.seq} 引用到 D4，请补充验证方法与证据。`);
  }

  return (
    <div className="p-report">
      <div>
        <section className="p-panel">
          <div className="p-panel__head">
            <h2>报告信息</h2>
            <span
              className={`u-tag u-tag--${report.status === 'finalized' ? 'normal' : 'pending'}`}
            >
              {REPORT_STATUS_LABELS[report.status as ReportStatus] ?? report.status}
            </span>
          </div>
          <div className="p-report__meta">
            <div>
              <span>报告编号</span>
              <strong className="u-num u-small">{report.code}</strong>
            </div>
            <div>
              <span>事件编号</span>
              <strong className="u-num u-small">{report.eventCode}</strong>
            </div>
            <div>
              <span>批次 / 生产组</span>
              <strong className="u-num u-small">
                {report.batchNo}
                {report.productionGroup ? `（${report.productionGroup}）` : ''}
              </strong>
            </div>
            <div>
              <span>规则 / 异常指标</span>
              <strong className="u-small">
                {report.ruleCode} · {report.metricName}
              </strong>
            </div>
            <div>
              <span>版本</span>
              <strong className="u-num u-small">v{report.versionNo}</strong>
            </div>
            <div>
              <span>最近保存</span>
              <strong className="u-num u-small">{report.savedAt ?? NO_DATA}</strong>
            </div>
            <div>
              <span>定稿时间</span>
              <strong className="u-num u-small">{report.finalizedAt ?? '未定稿'}</strong>
            </div>
            <div>
              <span>负责人</span>
              <strong className="u-small">{report.ownerName ?? NO_DATA}</strong>
            </div>
          </div>
          <div className="p-panel__body">
            {readOnly ? (
              <div className="u-notice u-notice--info">
                报告已于 {report.finalizedAt ?? NO_DATA} 定稿，所有小节只读。
                需要修改时请填写原因后「重新打开」，版本记录会全部保留。
              </div>
            ) : (
              <div className="u-notice u-notice--warning">
                D1–D8 中带「必填」标记的小节必须填写；D2 的预填内容只搬运事实，
                定稿前必须人工核对。根本原因（D4）只能引用「已确认」的结论。
              </div>
            )}
            {!permissions.canWrite ? (
              <div className="u-notice u-notice--warning u-mt">
                当前角色没有 report:write 权限，只能查看，不能保存、定稿或重新打开。
              </div>
            ) : null}
          </div>
        </section>

        <section className="p-panel u-mt">
          <div className="p-panel__head">
            <h2>D1–D8 小节</h2>
            <span className="u-xs u-faint">
              {fmtCount(fields.length)} 个小节 · 必填 {fmtCount(fields.filter((f) => f.isRequired).length)} 个
            </span>
          </div>

          {fields.map((field) => {
            const value = contents[field.code] ?? '';
            const missingRequired = field.isRequired && !value.trim() && !readOnly;
            return (
              <div className="p-report__section" key={field.code}>
                <div className="p-report__section-head">
                  <strong>{field.code}</strong>
                  <b>{field.name}</b>
                  {field.isRequired ? (
                    <span className="u-tag u-tag--danger">必填</span>
                  ) : (
                    <span className="u-tag">选填</span>
                  )}
                  <span className={SOURCE_TYPE_TONES[field.sourceType] ?? 'u-tag'}>
                    {SOURCE_TYPE_LABELS[field.sourceType] ?? field.sourceType}
                  </span>
                  {missingRequired ? (
                    <span className="u-tag u-tag--medium">尚未填写，不能定稿</span>
                  ) : null}
                  {field.updatedAt ? (
                    <span className="u-xs u-faint">最近更新 {field.updatedAt}</span>
                  ) : null}
                </div>
                <div className="p-panel__body">
                  {field.sourceType === 'ai_prefill' ? (
                    <div className="u-notice u-notice--warning u-mb">
                      系统预填，请人工核对：预填内容来自事件事实（批次、时间、指标、判定依据与阈值状态），
                      不含结论性判断，核对后再定稿。
                    </div>
                  ) : null}

                  <textarea
                    className="u-textarea"
                    rows={field.code === 'D2' ? 8 : field.code === 'D4' ? 6 : 4}
                    maxLength={20000}
                    readOnly={!editable}
                    aria-invalid={missingRequired}
                    value={value}
                    onChange={(changeEvent) =>
                      setContents((prev) => ({ ...prev, [field.code]: changeEvent.target.value }))
                    }
                    placeholder={readOnly ? '' : '按提示填写…'}
                  />

                  <p className="u-xs u-faint u-mt">{field.hint}</p>

                  {field.code === 'D4' ? (
                    <div className="u-mt">
                      <h3 className="u-small u-strong u-mb">已确认的根因结论（供 D4 引用）</h3>
                      {confirmedConclusions.length ? (
                        <>
                          <div className="u-table-wrap">
                            <table className="u-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>已确认结论（假设）</th>
                                  <th>工程师实际发现</th>
                                  <th>引用</th>
                                </tr>
                              </thead>
                              <tbody>
                                {confirmedConclusions.map((conclusion) => (
                                  <tr key={conclusion.seq}>
                                    <td className="u-num">#{conclusion.seq}</td>
                                    <td className="u-small">{conclusion.hypothesis}</td>
                                    <td className="u-small">
                                      {conclusion.actualFinding ?? NO_DATA}
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="u-btn u-btn--small"
                                        disabled={!editable}
                                        onClick={() => appendConclusion(conclusion)}
                                      >
                                        引用到 D4
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="u-xs u-faint u-mt">
                            只有「工程师已确认」的结论会出现在这里；待确认或被否决的假设不会出现在定稿依据中。
                          </p>
                        </>
                      ) : (
                        <div className="u-notice u-notice--danger">
                          请先在异常诊断中确认结论
                          （
                          <Link className="u-btn u-btn--small" href={`/diagnosis?event=${report.eventCode}`}>
                            进入异常诊断
                          </Link>
                          ）：目前没有工程师已确认的根因结论，报告无法定稿。
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <aside>
        <section className="p-panel">
          <div className="p-panel__head">
            <h2>操作</h2>
          </div>
          <div className="p-panel__body">
            <div className="u-row">
              {editable ? (
                <button
                  type="button"
                  className="u-btn u-btn--primary"
                  disabled={busy !== null}
                  onClick={() => void saveDraft()}
                >
                  {busy === 'save' ? '保存中…' : '保存草稿'}
                </button>
              ) : null}
              {!readOnly && permissions.canFinalize ? (
                <button
                  type="button"
                  className="u-btn"
                  disabled={busy !== null}
                  onClick={() => void finalize()}
                >
                  {busy === 'finalize' ? '定稿中…' : '定稿'}
                </button>
              ) : null}
              {!readOnly && !permissions.canFinalize ? (
                <span className="u-xs u-faint">当前角色无 report:finalize 权限，不能定稿。</span>
              ) : null}
              {readOnly && permissions.canWrite ? (
                <button
                  type="button"
                  className="u-btn"
                  disabled={busy !== null}
                  onClick={() => setReopenOpen(true)}
                >
                  重新打开
                </button>
              ) : null}
              <button
                type="button"
                className="u-btn u-btn--ghost"
                disabled={busy !== null}
                onClick={() => void exportAndPrint()}
              >
                {busy === 'export' ? '记录中…' : '导出 / 打印'}
              </button>
            </div>

            <div className="u-field u-mt">
              <label className="u-field__label" htmlFor="reviewer-note">
                复核说明（随报告保存）
              </label>
              <textarea
                id="reviewer-note"
                className="u-textarea"
                rows={2}
                maxLength={500}
                readOnly={!editable}
                value={reviewerNote}
                onChange={(changeEvent) => setReviewerNote(changeEvent.target.value)}
                placeholder="例如：D2 预填内容已按 QMS 原始检验单核对，实测值一致。"
              />
            </div>

            {formError ? <p className="u-notice u-notice--danger u-mt">{formError}</p> : null}
          </div>
        </section>

        <section className="p-panel u-mt">
          <div className="p-panel__head">
            <h2>定稿校验清单</h2>
            <span className="u-xs u-faint">本地自查 + 后端校验</span>
          </div>
          <div className="p-panel__body">
            <div className="p-checklist">
              {checks.map((item) => (
                <div className="p-checklist__item" data-ok={item.ok} key={item.text}>
                  <i>{item.ok ? '✓' : '!'}</i>
                  <span>{item.ok ? item.text : item.failText}</span>
                </div>
              ))}
            </div>

            {blocking.length ? (
              <div className="u-notice u-notice--danger u-mt">
                <div>
                  <strong>定稿被拒绝，原因如下：</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {blocking.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="u-xs u-faint u-mt">
                定稿条件：D1/D2/D3 非空 + 至少 1 条已确认根因结论。定稿会先保存当前编辑内容，
                再由后端复核（后端不通过时会返回全部阻塞原因）。
              </p>
            )}
          </div>
        </section>

        <section className="p-panel u-mt">
          <div className="p-panel__head">
            <h2>版本记录</h2>
            <span className="u-xs u-faint">{fmtCount(revisions.length)} 条</span>
          </div>
          <div className="p-panel__body">
            {revisions.length ? (
              <ol className="p-steps">
                {revisions.map((revision) => (
                  <li
                    className="p-step"
                    key={revision.id}
                    data-state={revision.action === 'finalize' ? 'done' : 'pending'}
                  >
                    <i>v{revision.versionNo}</i>
                    <span>
                      <strong>
                        {REVISION_ACTION_LABELS[revision.action] ?? revision.action}
                      </strong>
                      {revision.summary ? ` · ${revision.summary}` : ''}
                      <span className="u-faint">
                        {' '}
                        · {revision.operatorName ?? NO_DATA} · {revision.createdAt}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="u-empty">暂无版本记录。</div>
            )}
          </div>
        </section>
      </aside>

      <Modal
        open={reopenOpen}
        title="重新打开已定稿报告"
        onClose={() => setReopenOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="u-btn"
              onClick={() => setReopenOpen(false)}
              disabled={busy === 'reopen'}
            >
              取消
            </button>
            <button
              type="button"
              className="u-btn u-btn--primary"
              onClick={() => void reopen()}
              disabled={busy === 'reopen'}
            >
              {busy === 'reopen' ? '提交中…' : '确认重新打开'}
            </button>
          </>
        }
      >
        <div className="u-field">
          <label className="u-field__label" htmlFor="reopen-reason">
            重新打开原因（必填）
          </label>
          <textarea
            id="reopen-reason"
            className="u-textarea"
            rows={3}
            maxLength={500}
            value={reopenReason}
            onChange={(changeEvent) => setReopenReason(changeEvent.target.value)}
            placeholder="例如：D6 实施验证补充了对比批次的复测数据，需更新报告内容。"
          />
          {reopenError ? <span className="u-field__error">{reopenError}</span> : null}
        </div>
        <p className="u-xs u-faint u-mt">
          重新打开会把报告退回草稿状态并新增一条版本记录，原因会写入操作日志与版本历史。
        </p>
      </Modal>
    </div>
  );
}

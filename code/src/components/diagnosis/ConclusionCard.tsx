'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage, fieldErrors } from '@/lib/client/api';
import { NO_DATA } from '@/lib/format';
import { DECISION_LABELS, type EngineerDecision } from '@/lib/types';

interface EvidenceItem {
  id: number;
  evidenceType: string;
  layer: string;
  content: string;
  factTime: string | null;
  isLocateable: boolean;
  isUsable: boolean;
}

export interface ConclusionCardData {
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

/** 证据三分类（数据库 conclusion_evidence.evidence_type）的中文说明 */
const EVIDENCE_KIND_LABELS: Record<string, string> = {
  basis: '依据',
  support: '支持',
  contradict: '反证',
};

function safeText(value: string | null | undefined): string {
  if (!value) return NO_DATA;
  const text = String(value);
  return text === 'null' || text === 'undefined' ? NO_DATA : text;
}

/**
 * 单条结论：假设 + 证据 + 工程师判定。
 *
 * 三条展示规则：
 *   1) 假设与根因类别必须是卡片的视觉主体 —— 它是假设，不是根因；
 *   2) 缺失证据用红字列出，不用「暂无」一带而过；
 *   3) 判定必须填写验证结果与实际发现，否则按钮直接拒绝提交。
 */
export function ConclusionCard({
  conclusion,
  evidence,
  canVerify,
  metricName,
  onLocateEvidence,
  onDecided,
}: {
  conclusion: ConclusionCardData;
  evidence: EvidenceItem[];
  canVerify: boolean;
  metricName: string;
  onLocateEvidence: (time: string | null) => void;
  onDecided: () => void;
}) {
  const toast = useToast();

  const [validationResult, setValidationResult] = useState(conclusion.validationResult ?? '');
  const [actualFinding, setActualFinding] = useState(conclusion.actualFinding ?? '');
  const [finalAction, setFinalAction] = useState(conclusion.finalAction ?? '');
  const [comment, setComment] = useState(conclusion.engineerComment ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<EngineerDecision | null>(null);

  // 重新加载或判定结果变化后，用后端最新值同步表单
  useEffect(() => {
    setValidationResult(conclusion.validationResult ?? '');
    setActualFinding(conclusion.actualFinding ?? '');
    setFinalAction(conclusion.finalAction ?? '');
    setComment(conclusion.engineerComment ?? '');
  }, [
    conclusion.id,
    conclusion.validationResult,
    conclusion.actualFinding,
    conclusion.finalAction,
    conclusion.engineerComment,
  ]);

  async function submit(decision: EngineerDecision) {
    setFormError(null);

    if (decision !== 'pending') {
      if (!validationResult.trim()) {
        setFormError('请先填写「验证结果」：做了哪些验证动作、得到了什么数据，再提交判定。');
        return;
      }
      if (!actualFinding.trim()) {
        setFormError('请先填写「实际发现」：现场核对或复测得到的实际结论，再提交判定。');
        return;
      }
    }

    setBusy(decision);
    try {
      await api.patch('/api/diagnosis', {
        conclusionId: conclusion.id,
        decision,
        comment: comment.trim() || undefined,
        validationResult: validationResult.trim() || undefined,
        actualFinding: actualFinding.trim() || undefined,
        finalAction: finalAction.trim() || undefined,
      });
      toast.success(
        decision === 'confirmed'
          ? `结论 #${conclusion.seq} 已确认为根因依据，事件转入处理中。`
          : decision === 'rejected'
            ? `结论 #${conclusion.seq} 已否决，不会被当作根因。`
            : `结论 #${conclusion.seq} 已撤回为待确认。`,
      );
      onDecided();
    } catch (caught) {
      const fields = fieldErrors(caught);
      const fieldText = Object.entries(fields)
        .map(([key, value]) => `${key}：${value}`)
        .join('；');
      const message = errorMessage(caught, '保存判定失败。');
      setFormError(fieldText ? `${message}（${fieldText}）` : message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  const decision = conclusion.engineerDecision;

  return (
    <article className="p-conclusion" data-decision={decision}>
      <div className="p-conclusion__head">
        <span className="p-conclusion__rank">#{conclusion.seq}</span>
        <div style={{ flex: 1 }}>
          <div className="u-row u-row--between">
            <span className="u-tag u-tag--info">根因类别：{conclusion.rootCauseCategory || NO_DATA}</span>
            <span className={`u-tag u-tag--${decision}`}>{DECISION_LABELS[decision]}</span>
          </div>
          <p className="u-strong u-small u-mt" style={{ fontSize: 13.5 }}>
            假设：{conclusion.hypothesis}
          </p>
          <p className="u-xs u-mt" style={{ color: '#b45309' }}>
            这是待验证的假设，不是根因。未确认的结论不得写入 8D 报告 D4。
          </p>
        </div>
      </div>

      <div className="p-conclusion__body">
        {conclusion.missingEvidence.length ? (
          <div className="p-conclusion__section">
            <b>缺失证据（{conclusion.missingEvidence.length} 项，必须先补齐）</b>
            <div className="u-notice u-notice--danger">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {conclusion.missingEvidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="p-conclusion__section">
            <b>缺失证据</b>
            <div className="p-gap">
              本条结论在当前数据版本下未记录缺失项；仍须工程师按验证动作核实后再确认。
            </div>
          </div>
        )}

        <div className="p-conclusion__section">
          <b>观察事实</b>
          <p className="u-small">{conclusion.observation || NO_DATA}</p>
        </div>

        <div className="p-conclusion__section">
          <b>机理</b>
          <p className="u-small">{conclusion.mechanism || NO_DATA}</p>
        </div>

        <div className="p-conclusion__section">
          <b>机理来源</b>
          {conclusion.mechanismSources.length ? (
            <ul className="u-small" style={{ margin: 0, paddingLeft: 18 }}>
              {conclusion.mechanismSources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          ) : (
            <p className="u-small u-muted">无数据（未配置机理来源）</p>
          )}
        </div>

        <div className="p-conclusion__section">
          <b>验证动作</b>
          <p className="u-small">{conclusion.validationActions || NO_DATA}</p>
        </div>

        <div className="p-conclusion__section">
          <b>验证方法</b>
          <p className="u-small">{conclusion.validationMethod || NO_DATA}</p>
        </div>

        <div className="p-conclusion__section">
          <b>
            证据（{evidence.length} 条
            {evidence.some((item) => item.isLocateable) ? '，带时间的证据可点击定位到趋势图' : ''}）
          </b>
          {evidence.length ? (
            evidence.map((item) =>
              item.isLocateable && item.factTime ? (
                <button
                  key={item.id}
                  type="button"
                  className="p-evidence"
                  onClick={() => onLocateEvidence(item.factTime)}
                >
                  <span className="u-tag">{item.layer || '证据'}</span>{' '}
                  <span className="u-tag u-tag--info">
                    {EVIDENCE_KIND_LABELS[item.evidenceType] ?? item.evidenceType}
                  </span>{' '}
                  {item.content}
                  <span className="u-xs u-faint"> · 记录时间 {item.factTime}（点击在{metricName}趋势图中定位）</span>
                </button>
              ) : (
                <div key={item.id} className="p-evidence p-evidence--static">
                  <span className="u-tag">{item.layer || '证据'}</span>{' '}
                  <span className="u-tag u-tag--info">
                    {EVIDENCE_KIND_LABELS[item.evidenceType] ?? item.evidenceType}
                  </span>{' '}
                  {item.content}
                  <span className="u-xs u-faint">
                    {item.factTime ? ` · 记录时间 ${item.factTime}` : ' · 无具体记录时间，不可定位'}
                  </span>
                </div>
              ),
            )
          ) : (
            <div className="p-gap">
              缺失证据：本条结论没有落库的证据条目，只能作为排查方向，不能作为判定依据。
            </div>
          )}
        </div>

        <div className="p-conclusion__section">
          <b>
            工程师判定
            {decision !== 'pending'
              ? `（当前：${DECISION_LABELS[decision]}${
                  conclusion.decidedByName ? ` · ${conclusion.decidedByName}` : ''
                }${conclusion.decidedAt ? ` · ${safeText(conclusion.decidedAt)}` : ''}）`
              : ''}
          </b>

          {!canVerify ? (
            <p className="u-notice u-notice--warning">
              当前角色没有 analysis:verify 权限，只能查看结论与判定记录，不能确认或否决。
            </p>
          ) : null}

          <div className="u-field u-mt">
            <label className="u-field__label" htmlFor={`validation-${conclusion.id}`}>
              验证结果（必填：做了什么验证、得到什么数据）
            </label>
            <textarea
              id={`validation-${conclusion.id}`}
              className="u-textarea"
              rows={2}
              maxLength={1000}
              readOnly={!canVerify}
              value={validationResult}
              onChange={(changeEvent) => setValidationResult(changeEvent.target.value)}
              placeholder="例如：调取工艺记录 7 条，M1 机筒3区设定 198 °C / 实测 199 °C，偏差在工艺卡 ±2 °C 范围内。"
            />
          </div>

          <div className="u-field u-mt">
            <label className="u-field__label" htmlFor={`finding-${conclusion.id}`}>
              实际发现（必填：现场核对 / 复测得到的结论）
            </label>
            <textarea
              id={`finding-${conclusion.id}`}
              className="u-textarea"
              rows={2}
              maxLength={1000}
              readOnly={!canVerify}
              value={actualFinding}
              onChange={(changeEvent) => setActualFinding(changeEvent.target.value)}
              placeholder="例如：温区偏差未超工艺卡范围，但 3# 定径套冷却水温度波动 4 °C，与不圆度上升同步。"
            />
          </div>

          <div className="u-field u-mt">
            <label className="u-field__label" htmlFor={`action-${conclusion.id}`}>
              后续措施（确认根因时建议填写）
            </label>
            <textarea
              id={`action-${conclusion.id}`}
              className="u-textarea"
              rows={2}
              maxLength={1000}
              readOnly={!canVerify}
              value={finalAction}
              onChange={(changeEvent) => setFinalAction(changeEvent.target.value)}
              placeholder="例如：更换 3# 定径套密封圈并加装冷却水温监控，责任：设备工程师，完成时间 2026-10-15。"
            />
          </div>

          <div className="u-field u-mt">
            <label className="u-field__label" htmlFor={`comment-${conclusion.id}`}>
              判定说明（可选）
            </label>
            <input
              id={`comment-${conclusion.id}`}
              className="u-input"
              type="text"
              maxLength={500}
              readOnly={!canVerify}
              value={comment}
              onChange={(changeEvent) => setComment(changeEvent.target.value)}
              placeholder="例如：本次判定基于 2026-10-09 现场记录，样管已留存。"
            />
          </div>

          {formError ? (
            <p className="u-notice u-notice--danger u-mt">{formError}</p>
          ) : null}

          <div className="u-row u-mt">
            <button
              type="button"
              className="u-btn u-btn--primary"
              disabled={!canVerify || busy !== null}
              onClick={() => void submit('confirmed')}
            >
              {busy === 'confirmed' ? '提交中…' : '确认（作为根因依据）'}
            </button>
            <button
              type="button"
              className="u-btn u-btn--danger"
              disabled={!canVerify || busy !== null}
              onClick={() => void submit('rejected')}
            >
              {busy === 'rejected' ? '提交中…' : '否决（不作为根因）'}
            </button>
            {decision !== 'pending' ? (
              <button
                type="button"
                className="u-btn u-btn--ghost"
                disabled={!canVerify || busy !== null}
                onClick={() => void submit('pending')}
              >
                {busy === 'pending' ? '提交中…' : '撤回为待确认'}
              </button>
            ) : null}
          </div>
          <p className="u-xs u-faint u-mt">
            每次判定都会记录判定人、时间与说明。确认后的结论才会出现在 8D 报告的「已确认根因」列表中。
          </p>
        </div>
      </div>
    </article>
  );
}

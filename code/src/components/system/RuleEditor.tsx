'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage, fieldErrors } from '@/lib/client/api';
import { CALIBRATION_LABELS, type CalibrationStatus } from '@/lib/types';
import type { RuleParamSpec, RuleRow } from '@/lib/services/ruleAdminService';

interface Draft {
  name: string;
  description: string;
  evaluateOrder: string;
  enabled: boolean;
  calibrationStatus: string;
  /** 键值表：只包含该规则允许的键；'' 表示不写该键（由代码里的默认值兜底） */
  params: Record<string, string>;
}

/** 没有可配置阈值的规则，说明阈值到底在哪里 */
const EMPTY_PARAM_HINT: Record<string, string> = {
  R1: 'R1 的比对容差来自数据一致性核对记录（data_consistency_check.tolerance_value），不是规则参数，因此没有可配置的阈值。',
  R2: 'R2 的物理关系检查（非正值、最大/最小关系、与公称尺寸的偏差比例）写在规则代码中，没有可配置的阈值。',
  R3: 'R3 的规格上下限来自「规格限值」（metric_spec_limit），请到「基础主数据 → 质量指标与影响因素」维护，不在此处配置。',
  R5: 'R5 是兜底规则（R1–R4 均未命中时给出「未发现问题」），不读取任何阈值参数。',
};

function toDraft(rule: RuleRow): Draft {
  const params: Record<string, string> = {};
  for (const spec of rule.allowedParams) {
    const value = rule.paramsJson[spec.key];
    params[spec.key] = value === undefined || value === null ? '' : String(value);
  }
  return {
    name: rule.name,
    description: rule.description ?? '',
    evaluateOrder: String(rule.evaluateOrder),
    enabled: rule.enabled,
    calibrationStatus: rule.calibrationStatus,
    params,
  };
}

/**
 * 预警规则编辑器（客户端组件）。
 *
 * 阈值用**键值表**编辑，不是裸 JSON 文本框：
 *   - 表格的每一行来自服务端返回的 allowedParams（即 rules.ts 中真正被读取的键），
 *     并附上含义、单位、取值范围与默认值；
 *   - 保存时提交的对象只包含这些键，因此不会写入「规则不读取」的无效配置；
 *   - 数据库里已存在的无效键（例如历史遗留的 maximum_window_hours）会单独列出，
 *     提示保存后会被移除，由使用者确认。
 *
 * 校验在服务端：非法键 / 非法取值返回 422，页面把 message 与字段提示原样展示。
 */
export function RuleEditor({
  rules,
  calibrationOptions,
  canWrite,
}: {
  rules: RuleRow[];
  calibrationOptions: Array<{ value: string; label: string }>;
  canWrite: boolean;
}) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(rules.map((rule) => [rule.id, toDraft(rule)])),
  );
  const [savingId, setSavingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [savedIds, setSavedIds] = useState<number[]>([]);

  const options = useMemo(
    () => calibrationOptions.map((item) => ({ value: item.value, label: item.label })),
    [calibrationOptions],
  );

  const patch = (id: number, changes: Partial<Draft>) => {
    setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...changes } }));
    setSavedIds((previous) => previous.filter((item) => item !== id));
    setErrors((previous) => {
      if (!previous[id]) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const save = async (rule: RuleRow) => {
    const draft = drafts[rule.id];
    if (!draft) return;

    const paramsJson: Record<string, number> = {};
    for (const spec of rule.allowedParams) {
      const raw = (draft.params[spec.key] ?? '').trim();
      if (!raw) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        setErrors((previous) => ({
          ...previous,
          [rule.id]: `「${spec.label}」必须是数值。`,
        }));
        return;
      }
      paramsJson[spec.key] = num;
    }

    setSavingId(rule.id);
    setErrors((previous) => {
      const next = { ...previous };
      delete next[rule.id];
      return next;
    });

    try {
      await api.put<{ rule: RuleRow }>('/api/system/rules', {
        id: rule.id,
        name: draft.name,
        description: draft.description.trim() || null,
        evaluateOrder: Number(draft.evaluateOrder),
        enabled: draft.enabled,
        calibrationStatus: draft.calibrationStatus,
        paramsJson,
      });
      setSavedIds((previous) => [...previous, rule.id]);
      toast.success(`规则 ${rule.code} 已保存（已记入操作日志）。`);
    } catch (caught) {
      const fields = fieldErrors(caught);
      const detail = Object.values(fields).filter(Boolean).join(' ');
      setErrors((previous) => ({
        ...previous,
        [rule.id]: detail || errorMessage(caught, '保存失败，请稍后重试。'),
      }));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-stack">
      {rules.map((rule) => {
        const draft = drafts[rule.id] ?? toDraft(rule);
        const calibrationLabel =
          CALIBRATION_LABELS[draft.calibrationStatus as CalibrationStatus] ??
          draft.calibrationStatus;

        return (
          <section className="p-panel" key={rule.id}>
            <div className="p-panel__head">
              <div>
                <h2>
                  <span className="u-tag u-tag--info">{rule.code}</span> {rule.name}
                </h2>
                <div className="u-xs u-faint u-mt">
                  判定顺序 {rule.evaluateOrder} · 类别 {rule.ruleCategory} · 风险等级{' '}
                  {rule.riskType} · 版本 {rule.ruleVersion}
                  {rule.isTerminal ? ' · 兜底规则（顺序判定中的最后一条）' : ''}
                </div>
              </div>
              <span className={`u-tag ${draft.calibrationStatus === 'validated' ? 'u-tag--success' : 'u-tag--medium'}`}>
                {calibrationLabel}
              </span>
            </div>

            <div className="p-panel__body">
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'minmax(220px, 2fr) minmax(120px, 1fr) minmax(200px, 2fr)',
                }}
              >
                <label className="u-field">
                  <span className="u-field__label">规则名称</span>
                  <input
                    className="u-input"
                    value={draft.name}
                    maxLength={128}
                    disabled={!canWrite}
                    onChange={(event) => patch(rule.id, { name: event.target.value })}
                  />
                  <span className="u-field__hint">规则编码 {rule.code} 不可修改</span>
                </label>
                <label className="u-field">
                  <span className="u-field__label">判定顺序</span>
                  <input
                    className="u-input"
                    type="number"
                    min={1}
                    max={99}
                    value={draft.evaluateOrder}
                    disabled={!canWrite}
                    onChange={(event) => patch(rule.id, { evaluateOrder: event.target.value })}
                  />
                  <span className="u-field__hint">小者先判定，命中即结束</span>
                </label>
                <label className="u-field">
                  <span className="u-field__label">标定状态</span>
                  <select
                    className="u-select"
                    value={draft.calibrationStatus}
                    disabled={!canWrite}
                    onChange={(event) => patch(rule.id, { calibrationStatus: event.target.value })}
                  >
                    {options.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <span className="u-field__hint">
                    「阈值待现场标定」期间的预警只用于提示复核，不作为合格判定依据
                  </span>
                </label>
              </div>

              <label className="u-field">
                <span className="u-field__label">规则说明与适用边界</span>
                <textarea
                  className="u-textarea"
                  value={draft.description}
                  maxLength={500}
                  disabled={!canWrite}
                  onChange={(event) => patch(rule.id, { description: event.target.value })}
                />
                <span className="u-field__hint">
                  说明该规则「能得出什么结论、不能得出什么结论」，会随事件原因一起提示现场
                </span>
              </label>

              <div className="u-row u-mb">
                <label className="u-row" style={{ gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    disabled={!canWrite}
                    onChange={(event) => patch(rule.id, { enabled: event.target.checked })}
                  />
                  <span className="u-small">启用该规则</span>
                </label>
                <span className="u-xs u-faint">
                  停用后规则引擎不再执行本规则；R5 兜底规则停用会导致未命中事件没有结论
                </span>
              </div>

              <h3 className="u-small u-strong u-mb">阈值参数</h3>

              {rule.allowedParams.length ? (
                <div className="u-table-wrap">
                  <table className="u-table">
                    <thead>
                      <tr>
                        <th>参数键</th>
                        <th>含义</th>
                        <th>取值</th>
                        <th>单位</th>
                        <th>默认值</th>
                        <th>取值范围</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rule.allowedParams.map((spec: RuleParamSpec) => (
                        <tr key={spec.key}>
                          <td className="u-num u-nowrap">{spec.key}</td>
                          <td>{spec.description}</td>
                          <td style={{ width: 140 }}>
                            <input
                              className="u-input"
                              type="number"
                              step="any"
                              value={draft.params[spec.key] ?? ''}
                              placeholder={String(spec.defaultValue)}
                              disabled={!canWrite}
                              aria-label={`${spec.label}取值`}
                              onChange={(event) =>
                                patch(rule.id, {
                                  params: { ...draft.params, [spec.key]: event.target.value },
                                })
                              }
                            />
                          </td>
                          <td>{spec.unit ?? '—'}</td>
                          <td className="u-num">{spec.defaultValue}</td>
                          <td className="u-nowrap">
                            {spec.min !== undefined && spec.max !== undefined
                              ? `${spec.min} ~ ${spec.max}${spec.integer ? '（整数）' : ''}`
                              : '不限'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="u-notice u-notice--info">
                  {EMPTY_PARAM_HINT[rule.code] ?? '该规则不读取任何阈值参数。'}
                </div>
              )}

              <p className="u-xs u-faint u-mt">
                留空表示不写该键，规则代码会使用默认值。只有规则代码真正读取的键才能保存 ——
                写入未被读取的键会返回 422 并说明原因，避免出现「改了参数但不生效」的假配置。
              </p>

              {rule.invalidParams.length ? (
                <div className="u-notice u-notice--warning u-mt">
                  数据库中还存在规则 {rule.code} 不会读取的参数键：
                  <strong>{rule.invalidParams.join('、')}</strong>。
                  它们对判定没有任何作用（历史配置遗留），保存本规则时会被移除。
                </div>
              ) : null}

              {errors[rule.id] ? (
                <div className="u-notice u-notice--danger u-mt" role="alert">
                  {errors[rule.id]}
                </div>
              ) : null}
              {savedIds.includes(rule.id) ? (
                <div className="u-notice u-notice--info u-mt">
                  已保存。规则引擎下次扫描（或在保存后触发的分析）会使用新的阈值。
                </div>
              ) : null}

              {canWrite ? (
                <div className="u-row u-mt">
                  <button
                    type="button"
                    className="u-btn u-btn--primary"
                    onClick={() => void save(rule)}
                    disabled={savingId === rule.id}
                  >
                    {savingId === rule.id ? '保存中…' : '保存规则'}
                  </button>
                  <button
                    type="button"
                    className="u-btn u-btn--small"
                    onClick={() => {
                      setDrafts((previous) => ({ ...previous, [rule.id]: toDraft(rule) }));
                      setSavedIds((previous) => previous.filter((item) => item !== rule.id));
                    }}
                    disabled={savingId === rule.id}
                  >
                    放弃修改
                  </button>
                </div>
              ) : (
                <div className="u-notice u-notice--info u-mt">
                  当前账号没有「system:write」权限，只能查看规则配置。
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

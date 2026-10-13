'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MasterField, MasterFieldOption } from '@/lib/masterdata/resources';
import { api, errorMessage } from '@/lib/client/api';

/**
 * 主数据表单（客户端）。
 *
 * 设计要点：
 *   1) 字段全部来自资源配置 `MasterResource.fields`，本组件不内置任何业务字段，
 *      新增一类主数据时无需改这里。
 *   2) 控件按 `field.type` 分支：text / textarea / number / select / boolean / readonly。
 *   3) 引用型字段（`field.reference`）在挂载时请求 `/api/masterdata/<资源>?options=1`
 *      拿下拉选项；映射只写一处（REFERENCE_SEGMENTS）。
 *   4) 表单值由父组件受控持有：父组件负责调接口与错误回填，
 *      这样 422 的 `fieldErrors(err)` 能直接标到对应输入框下方。
 *   5) 关闭浏览器原生校验（noValidate）：校验口径以后端 zod schema 为唯一来源，
 *      避免前后端两套规则不一致。
 */

export type MasterFormValue = string | boolean;
export type MasterFormValues = Record<string, MasterFormValue>;

/**
 * 引用型字段 → REST 资源路径片段。
 * 配置里 reference 用资源语义名（如 equipmentTypes），路径用短横线（equipment-types），
 * 这里做唯一一处映射，避免各页面各写一遍 URL。
 */
const REFERENCE_SEGMENTS: Record<NonNullable<MasterField['reference']>, string> = {
  categories: 'categories',
  equipmentTypes: 'equipment-types',
  equipment: 'equipment',
  lines: 'lines',
  metrics: 'metrics',
  specs: 'specs',
};

interface OptionsResponse {
  options: MasterFieldOption[];
}

export function MasterDataForm({
  fields,
  values,
  errors,
  generalError,
  disabled,
  onSubmit,
  onChange,
}: {
  fields: MasterField[];
  values: MasterFormValues;
  /** 字段级错误（来自 422 响应的 fields） */
  errors: Record<string, string>;
  /** 表单整体错误（无字段归属的校验失败或接口异常） */
  generalError?: string | null;
  disabled?: boolean;
  onSubmit: () => void;
  onChange: (key: string, value: MasterFormValue) => void;
}) {
  const [referenceOptions, setReferenceOptions] = useState<Record<string, MasterFieldOption[]>>({});
  const [optionError, setOptionError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // 用字符串 key 做依赖，避免 fields 每次渲染产生新数组导致重复请求
  const referencesKey = useMemo(
    () => fields.map((field) => field.reference ?? '').filter(Boolean).join('|'),
    [fields],
  );
  const references = useMemo(
    () =>
      (referencesKey
        ? referencesKey.split('|')
        : []) as Array<NonNullable<MasterField['reference']>>,
    [referencesKey],
  );

  useEffect(() => {
    if (!references.length) {
      setReferenceOptions({});
      return;
    }

    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionError(null);

    void (async () => {
      try {
        const entries = await Promise.all(
          references.map(async (reference) => {
            const segment = REFERENCE_SEGMENTS[reference];
            const data = await api.get<OptionsResponse>(
              `/api/masterdata/${segment}?options=1`,
              { signal: controller.signal },
            );
            return [reference, data.options ?? []] as const;
          }),
        );
        if (!controller.signal.aborted) setReferenceOptions(Object.fromEntries(entries));
      } catch (caught) {
        if ((caught as { name?: string })?.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setOptionError(errorMessage(caught, '下拉选项加载失败，请关闭后重试。'));
          setReferenceOptions({});
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    })();

    return () => controller.abort();
  }, [references]);

  function optionsOf(field: MasterField): MasterFieldOption[] {
    if (field.options?.length) return field.options;
    if (field.reference) return referenceOptions[field.reference] ?? [];
    return [];
  }

  return (
    <form
      id="master-data-form"
      className="p-form-grid"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      {generalError ? (
        <div className="u-notice u-notice--danger u-field--full">{generalError}</div>
      ) : null}
      {optionError ? (
        <div className="u-notice u-notice--warning u-field--full">{optionError}</div>
      ) : null}

      {fields.map((field) => {
        const value = values[field.key];
        const error = errors[field.key];
        const fieldId = `master-field-${field.key}`;
        // 错误既标在控件上（aria-invalid + u-field__error），也用 role="alert" 便于读屏
        const invalid = Boolean(error);
        const wide = field.type === 'textarea' || field.type === 'readonly';

        return (
          <label
            key={field.key}
            className={`u-field${wide ? ' u-field--full' : ''}`}
            htmlFor={fieldId}
          >
            <span className="u-field__label">
              {field.label}
              {field.required ? <span className="u-faint"> · 必填</span> : null}
            </span>

            {renderControl(field, fieldId, value, invalid, disabled, onChange, optionsOf, loadingOptions)}

            {field.hint ? (
              <span className="u-field__hint" id={`${fieldId}-hint`}>
                {field.hint}
              </span>
            ) : null}
            {error ? (
              <span className="u-field__error" role="alert">
                {error}
              </span>
            ) : null}
          </label>
        );
      })}
    </form>
  );
}

/** 按 field.type 渲染控件（新增控件类型时只改这里） */
function renderControl(
  field: MasterField,
  fieldId: string,
  value: MasterFormValue | undefined,
  invalid: boolean,
  disabled: boolean | undefined,
  onChange: (key: string, value: MasterFormValue) => void,
  optionsOf: (field: MasterField) => MasterFieldOption[],
  loadingOptions: boolean,
) {
  const common = {
    id: fieldId,
    disabled,
    'aria-invalid': invalid ? (true as const) : undefined,
    'aria-describedby': field.hint ? `${fieldId}-hint` : undefined,
  };

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          {...common}
          className="u-textarea"
          rows={3}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.hint ? undefined : `请输入${field.label}`}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      );

    case 'number':
      return (
        <input
          {...common}
          className="u-input u-num"
          type="number"
          inputMode="decimal"
          step={field.digits ? String(1 / 10 ** field.digits) : 'any'}
          value={typeof value === 'string' ? value : ''}
          placeholder={`请输入${field.label}`}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      );

    case 'select': {
      const options = optionsOf(field);
      const current = typeof value === 'string' ? value : '';
      const waiting = Boolean(field.reference) && loadingOptions && !options.length;
      return (
        <select
          {...common}
          className="u-select"
          value={current}
          onChange={(event) => onChange(field.key, event.target.value)}
        >
          <option value="">{waiting ? '选项加载中…' : '请选择'}</option>
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    case 'boolean':
      return (
        <span className="u-row">
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(field.key, event.target.checked)}
          />
          <span className="u-small u-muted">勾选表示「是」</span>
        </span>
      );

    case 'readonly':
      return (
        <input
          {...common}
          className="u-input"
          type="text"
          readOnly
          value={typeof value === 'string' ? value : ''}
        />
      );

    case 'text':
    default:
      return (
        <input
          {...common}
          className="u-input"
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={`请输入${field.label}`}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      );
  }
}

/** 新增时的默认值：按字段类型给出可编辑的初值（状态类下拉默认取第一项） */
export function defaultFormValues(fields: MasterField[]): MasterFormValues {
  const values: MasterFormValues = {};
  for (const field of fields) {
    if (field.type === 'boolean') values[field.key] = false;
    else if (field.type === 'select' && field.options?.length) {
      values[field.key] = String(field.options[0].value);
    } else values[field.key] = '';
  }
  return values;
}

/** 编辑时的初值：把列表行还原成表单字符串（引用型字段保留数值的字符串形式） */
export function rowToFormValues(
  fields: MasterField[],
  row: Record<string, unknown>,
): MasterFormValues {
  const values: MasterFormValues = {};
  for (const field of fields) {
    const raw = row[field.key];
    if (field.type === 'boolean') values[field.key] = Boolean(raw);
    else if (raw === null || raw === undefined) values[field.key] = '';
    else values[field.key] = String(raw);
  }
  return values;
}

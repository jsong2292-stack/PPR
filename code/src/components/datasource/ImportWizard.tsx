'use client';

/**
 * Excel 批量导入向导（客户端组件）。
 *
 * 三步：选类别并下载模板 → 上传文件 → 查看校验结果。
 * 校验结果由服务端逐行返回：**任一行有错即整批拒绝**，错误明细逐行展示，
 * 用户可以直接按「行号 + 列名」回到 Excel 修改后重传。
 *
 * 不使用任何浏览器存储：刷新页面后导入状态即清空，避免把上一批的结论
 * 误当成当前文件的结果。
 */
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { ApiError, api, errorMessage } from '@/lib/client/api';

interface TemplateMeta {
  type: string;
  label: string;
  fileName: string;
  note: string;
  columns: string[];
  example: Array<string | number>;
}

interface ImportErrorRow {
  sheet: string;
  table: string;
  row: number;
  column: string | null;
  message: string;
  rawValue: string | null;
}

interface ImportOutcome {
  accepted: boolean;
  jobId: number | null;
  jobCode: string | null;
  label: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  writtenRows: number;
  errors: ImportErrorRow[];
  message: string;
}

const TYPE_OPTIONS = [
  { type: 'batches', label: '生产批次' },
  { type: 'products', label: '产品数据' },
  { type: 'readings', label: '设备采集数据' },
  { type: 'inspections', label: '样管抽检记录' },
  { type: 'process', label: '工艺过程记录' },
  { type: 'production-events', label: '生产事件记录' },
];

const MAX_MB = 20;

export function ImportWizard() {
  const [type, setType] = useState('batches');
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setMetaError(null);
    api
      .get<{ templates: TemplateMeta[] }>(
        `/api/datasource/import/template?type=${encodeURIComponent(type)}&meta=1`,
      )
      .then((data) => {
        if (cancelled) return;
        setMeta(data.templates[0] ?? null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setMetaError(errorMessage(caught, '加载模板说明失败。'));
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const handleFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setOutcome(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const extension = (selected.name.split('.').pop() ?? '').toLowerCase();
    if (!['xlsx', 'xls'].includes(extension)) {
      setOutcome({
        accepted: false,
        jobId: null,
        jobCode: null,
        label: '',
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        writtenRows: 0,
        errors: [],
        message: `不支持的文件类型「.${extension}」，只接受 .xlsx 或 .xls 工作簿。`,
      });
      setFile(null);
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      setOutcome({
        accepted: false,
        jobId: null,
        jobCode: null,
        label: '',
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        writtenRows: 0,
        errors: [],
        message: `文件大小超过上限 ${MAX_MB} MB。`,
      });
      setFile(null);
      return;
    }
    setFile(selected);
  }, []);

  const upload = useCallback(async () => {
    if (!file) {
      setOutcome({
        accepted: false,
        jobId: null,
        jobCode: null,
        label: '',
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        writtenRows: 0,
        errors: [],
        message: '请先选择要导入的 Excel 文件。',
      });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      const data = await api.upload<{
        accepted: boolean;
        jobId: number;
        jobCode: string;
        type: string;
        label: string;
        totalRows: number;
        successRows: number;
        errorRows: number;
        writtenRows: number;
        errors: ImportErrorRow[];
      }>(`/api/datasource/import?type=${encodeURIComponent(type)}`, form);
      setOutcome({
        accepted: true,
        jobId: data.jobId,
        jobCode: data.jobCode,
        label: data.label,
        totalRows: data.totalRows,
        successRows: data.successRows,
        errorRows: data.errorRows,
        writtenRows: data.writtenRows,
        errors: [],
        message: `导入成功：${data.label} 共写入 ${data.writtenRows} 行，导入任务 ${data.jobCode} 已记录。`,
      });
      setFile(null);
    } catch (caught) {
      const extra =
        caught instanceof ApiError
          ? (caught.extra as
              | {
                  jobCode?: string;
                  jobId?: number;
                  label?: string;
                  totalRows?: number;
                  successRows?: number;
                  errorRows?: number;
                  writtenRows?: number;
                  errors?: ImportErrorRow[];
                }
              | undefined)
          : undefined;
      setOutcome({
        accepted: false,
        jobId: extra?.jobId ?? null,
        jobCode: extra?.jobCode ?? null,
        label: extra?.label ?? '',
        totalRows: extra?.totalRows ?? 0,
        successRows: extra?.successRows ?? 0,
        errorRows: extra?.errorRows ?? 0,
        writtenRows: extra?.writtenRows ?? 0,
        errors: extra?.errors ?? [],
        message: errorMessage(caught, '导入失败，请稍后重试。'),
      });
    } finally {
      setUploading(false);
    }
  }, [file, type]);

  const step2Done = file !== null;
  const step3Done = outcome !== null;

  return (
    <div className="p-stack">
      <section className="p-panel">
        <div className="p-panel__head">
          <h2>① 选择类别并下载模板</h2>
          <a
            className="u-btn u-btn--small"
            href={`/api/datasource/import/template?type=${encodeURIComponent(type)}`}
          >
            下载当前类别模板
          </a>
        </div>
        <div className="p-panel__body">
          <div className="u-row">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                className={option.type === type ? 'u-btn u-btn--primary' : 'u-btn'}
                onClick={() => {
                  setType(option.type);
                  setOutcome(null);
                  setFile(null);
                }}
              >
                {option.label}
              </button>
            ))}
            <a className="u-btn" href="/api/datasource/import/template">
              下载全部类别模板（多工作表）
            </a>
          </div>

          <div className="u-notice u-notice--info u-mt">
            模板结构固定为三行：第 1 行说明、第 2 行中文表头（带 * 为必填列）、第 3 行示例。
            示例行已标注「示例行」，导入时会被自动跳过；请从第 4 行开始填写数据。
          </div>

          {metaError ? <div className="u-notice u-notice--danger u-mt">{metaError}</div> : null}
          {meta ? (
            <div className="u-mt">
              <div className="u-small u-strong u-mb">模板列（{meta.label}）</div>
              <div className="u-table-wrap">
                <table className="u-table">
                  <thead>
                    <tr>
                      <th>列名</th>
                      <th>示例值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meta.columns.map((column, index) => (
                      <tr key={column}>
                        <td>{column}</td>
                        <td className="u-num">{String(meta.example[index] ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="u-xs u-faint u-mt">{meta.note}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="p-panel">
        <div className="p-panel__head">
          <h2>② 上传文件并校验</h2>
          <div className="p-steps">
            <span className="p-step" data-state="done">
              <i>1</i> 已选类别
            </span>
            <span className="p-step" data-state={step2Done ? 'done' : 'running'}>
              <i>2</i> {step2Done ? '已选择文件' : '等待选择文件'}
            </span>
            <span className="p-step" data-state={step3Done ? 'done' : 'running'}>
              <i>3</i> {step3Done ? '已出校验结果' : '等待校验'}
            </span>
          </div>
        </div>
        <div className="p-panel__body">
          <div className="u-row">
            <input
              className="u-input"
              style={{ maxWidth: 360 }}
              type="file"
              accept=".xlsx,.xls"
              aria-label="选择 Excel 文件"
              onChange={handleFile}
            />
            <button
              className="u-btn u-btn--primary"
              type="button"
              onClick={() => void upload()}
              disabled={uploading || !file}
            >
              {uploading ? '校验并导入中…' : '上传并校验'}
            </button>
            {file ? (
              <span className="u-xs u-faint">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </span>
            ) : (
              <span className="u-xs u-faint">支持 .xlsx / .xls，单文件不超过 {MAX_MB} MB</span>
            )}
          </div>
          <div className="u-notice u-notice--warning u-mt">
            服务端会先逐行校验（必填列、批次/指标/参数/温区编码是否存在、数值与时间格式、重复行），
            只要有一行不通过就整批拒绝，不会写入任何业务数据。
          </div>
        </div>
      </section>

      {outcome ? (
        <section className="p-panel">
          <div className="p-panel__head">
            <h2>③ 校验结果</h2>
            <span className={outcome.accepted ? 'u-tag u-tag--normal' : 'u-tag u-tag--high'}>
              {outcome.accepted ? '已写入' : '整批拒绝'}
            </span>
          </div>
          <div className="p-panel__body">
            <div className={outcome.accepted ? 'u-notice u-notice--info' : 'u-notice u-notice--danger'}>
              {outcome.message}
            </div>

            <div className="u-stats u-mt">
              <div className="u-stat">
                <span className="u-stat__label">校验总行数</span>
                <span className="u-stat__value">{outcome.totalRows}</span>
              </div>
              <div className="u-stat">
                <span className="u-stat__label">通过校验行数</span>
                <span className="u-stat__value">{outcome.successRows}</span>
              </div>
              <div className="u-stat">
                <span className="u-stat__label">错误行数</span>
                <span className="u-stat__value">{outcome.errorRows}</span>
              </div>
              <div className="u-stat">
                <span className="u-stat__label">实际写入行数</span>
                <span className="u-stat__value">{outcome.writtenRows}</span>
                <span className="u-stat__hint">
                  {outcome.jobCode ? `导入任务 ${outcome.jobCode}` : '未生成导入任务'}
                </span>
              </div>
            </div>

            {outcome.errors.length ? (
              <div className="u-table-wrap">
                <table className="u-table">
                  <thead>
                    <tr>
                      <th>工作表</th>
                      <th>Excel 行号</th>
                      <th>列</th>
                      <th>错误说明</th>
                      <th>原始值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.errors.map((row, index) => (
                      <tr key={`${row.row}-${row.column ?? '-'}-${index}`}>
                        <td>{row.sheet}</td>
                        <td className="u-num">{row.row}</td>
                        <td>{row.column ?? '—'}</td>
                        <td>{row.message}</td>
                        <td className="u-num">{row.rawValue ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="u-small u-muted u-mt">
                本次校验没有发现错误，所有行均已写入业务表。
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

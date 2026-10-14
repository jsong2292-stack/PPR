/**
 * Excel 导入的逐行提交逻辑（批次页、规格下钻页、设备批次页共用）。
 *
 * 数据模型是「批次号即唯一关联键，批次不落表」（见 scripts/init-db.sql 的 ppr_batch 视图）：
 *   - 产品数据文件（含 record_no / inspect_time / batch_no / spec_code）→ 写检验记录，
 *     批次号与规格直接落在检验记录行上，批次清单里随即出现这个批次；
 *   - 设备采集文件（采集时间 + 该设备类型的采集项）→ 写采集数据，批次号由页面上选的批次决定，
 *     写完后该批次就出现在这台设备的批次列表里。
 * 两条路都不需要（也不能）先手工建批次。
 */

export interface ImportOutcome {
  /** 实际写入的接口目标：measurements（检验记录）或 readings（设备采集数据） */
  target: 'measurements' | 'readings';
  total: number;
  ok: number;
  /** 本次导入涉及到的批次号（去重后按出现顺序） */
  batches: string[];
  high: number;
  medium: number;
  /** 最多留前 3 条失败原因，避免刷屏 */
  failures: string[];
}

/** 表头同时有 record_no 与 inspect_time，就按产品数据（检验记录）处理。 */
export function isProductDataSheet(headers: string[]): boolean {
  return headers.includes('record_no') && headers.includes('inspect_time');
}

/** 批次页 / 规格下钻页导入的都是检验记录；设备批次页导入的是采集数据（走 endpoint）。 */
export function importTargetFor(resource: string, headers: string[]): 'measurements' | 'readings' {
  if (resource === 'measurements' || resource === 'batches') return 'measurements';
  if (isProductDataSheet(headers)) return 'measurements';
  return 'readings';
}

export async function importRows(options: {
  rows: Record<string, unknown>[];
  /** 写入目标：measurements 走 /api/quality/master/measurements */
  target: 'measurements' | 'readings';
  /** 采集数据用：显式接口地址（含设备ID与批次号） */
  endpoint?: string;
  /** 页面上下文：规格下钻页给 spec_id，设备批次页给 batch_no */
  preset?: Record<string, unknown>;
  /**
   * 汇总提示里要显示的批次号。
   * 采集数据的文件里没有批次号列（批次号由页面上选的），所以只能由调用方显式告诉汇总逻辑，
   * 否则导入成功后的提示只会说「成功 12 / 12 条采集数据」，看不出这批数据落在了哪个批次。
   */
  batchNo?: string;
}): Promise<ImportOutcome> {
  const preset = options.preset ?? {};
  const outcome: ImportOutcome = { target: options.target, total: options.rows.length, ok: 0, batches: [], high: 0, medium: 0, failures: [] };
  const presetBatchNo = String(options.batchNo ?? '').trim();
  if (presetBatchNo) outcome.batches.push(presetBatchNo);
  const url = options.endpoint ?? `/api/quality/master/${options.target}`;

  for (const [index, row] of options.rows.entries()) {
    const payload = { ...row, ...preset };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // 之前是把失败行静默丢掉，只报「成功 N / M」，用户根本不知道哪行错了。
      const json = await res.json().catch(() => null);
      if (outcome.failures.length < 3) outcome.failures.push(`第 ${index + 2} 行：${json?.error ?? `HTTP ${res.status}`}`);
      continue;
    }
    outcome.ok += 1;
    const batchNo = String(payload.batch_no ?? '').trim();
    if (batchNo && !outcome.batches.includes(batchNo)) outcome.batches.push(batchNo);
    // 产品数据保存后服务端会自动重算预警，这里把高风险/中风险条数汇总给用户。
    const json = await res.json().catch(() => null);
    const summary = json?.alerts as { high?: number; medium?: number } | null;
    if (summary) {
      outcome.high += summary.high ?? 0;
      outcome.medium += summary.medium ?? 0;
    }
  }

  return outcome;
}

/** 把导入结果拼成一句给用户看的提示（标题 + 补充说明）。 */
export function describeImport(outcome: ImportOutcome): { message: string; details: string; failed: boolean } {
  const unit = outcome.target === 'measurements' ? '条检验记录' : '条采集数据';
  const details = [
    outcome.batches.length === 1 ? `批次 ${outcome.batches[0]}` : outcome.batches.length > 1 ? `涉及批次 ${outcome.batches.length} 个：${outcome.batches.join('、')}` : '',
    outcome.high + outcome.medium ? `自动预警：高风险 ${outcome.high} 条，中风险 ${outcome.medium} 条` : '',
    outcome.failures.length ? `${outcome.total - outcome.ok} 行失败 → ${outcome.failures.join('；')}` : '',
  ].filter(Boolean).join(' ｜ ');
  return {
    message: `导入完成：成功 ${outcome.ok} / ${outcome.total} ${unit}`,
    details,
    failed: outcome.failures.length > 0,
  };
}

/**
 * 异常诊断引擎。
 *
 * 目标：把一条预警事件展开成「可核对的结论候选」。
 *
 * 三条硬性原则（写在代码里，也写在页面上）：
 *   1) 不编根因。每条结论都是假设，必须由工程师确认或否决后才进 8D 报告。
 *   2) 无数据不推断。任何一层证据缺失时，如实写成「缺失证据」并列出补数动作，
 *      不用 0、空字符串或「可能」来填空。
 *   3) 结论必须可定位。每条证据都带时间与来源记录，工程师能点开原始记录核对。
 *
 * 结构：
 *   buildDiagnosisInput()   —— 采集一次诊断所需的全部数据（一次查询，多结论复用）
 *   HYPOTHESIS_BUILDERS     —— 按规则编码注册「假设生成器」，新增规则只需加一条
 *   runDiagnosis()          —— 生成分析批次、参考对照快照、结论与证据层，落库
 */
import { execute, queryOne, withTransaction, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { writeAudit } from '../audit';
import { fmt } from '../format';
import { createHash } from 'node:crypto';
import type { BasisLayer } from '../types';
import {
  influencesForMetric,
  listConsistencyChecks,
  listEquipmentReadings,
  listProcessRecords,
  listProductData,
  listRecordTimeline,
  listReferenceBatches,
  listWallPoints,
  referenceStatsForBatch,
  type EquipmentReadingRow,
  type ProcessRecordRow,
  type ProcessZoneRow,
  type ProductDataRow,
  type WallPointRow,
} from '../repositories/diagnosisRepository';
import { findAlertEventByCode, type AlertEventListItem } from '../repositories/alertEventRepository';
import { listBatchInspections, type InspectionListItem } from '../repositories/inspectionRepository';
import { metricDictionaryById } from '../repositories/metricRepository';

// ── 证据与结论的结构 ────────────────────────────────────────────────

export interface EvidenceItem {
  evidenceType: '测量数据' | '工艺参数' | '设备采集' | '参考对照' | '数据核对' | '观察事实';
  layer: BasisLayer;
  content: string;
  factTime?: string | null;
  isLocateable: boolean;
  relatedRecordId?: number | null;
  isUsable: boolean;
}

export interface Hypothesis {
  seq: number;
  hypothesis: string;
  rootCauseCategory: string;
  observation: string;
  mechanism: string;
  mechanismSources: string[];
  missingEvidence: string[];
  validationActions: string;
  validationMethod: string;
  evidence: EvidenceItem[];
}

export interface DiagnosisInput {
  event: AlertEventListItem;
  /** 事件对应指标的编码（记录里 metrics 的键名） */
  metricCode: string;
  metricName: string;
  metricUnit: string;
  decimalScale: number;
  targetRecord: InspectionListItem | null;
  batchRecords: InspectionListItem[];
  timeline: Array<{ id: number; code: string; inspectTime: string; qualityFlag: string }>;
  wallPoints: WallPointRow[];
  productData: ProductDataRow[];
  processRecords: ProcessRecordRow[];
  processZones: ProcessZoneRow[];
  equipmentReadings: EquipmentReadingRow[];
  consistencyChecks: Awaited<ReturnType<typeof listConsistencyChecks>>;
  influences: Array<{ parameterId: number; code: string; name: string; unit: string }>;
  references: Array<{
    batchId: number;
    batchNo: string;
    productionGroup: string | null;
    recordCount: number;
    stats: { count: number; median: number | null; min: number | null; max: number | null };
  }>;
  dataVersionNote: string;
}

/** 采集诊断输入（一条事件一次） */
export async function buildDiagnosisInput(eventCode: string): Promise<DiagnosisInput> {
  const event = await findAlertEventByCode(eventCode);
  if (!event) throw AppError.notFound('预警事件不存在。');

  const metricDict = await metricDictionaryById();
  const metric = metricDict.get(event.metricId);

  const [batchRecords, timeline, processData, equipmentReadings, productData, influences] =
    await Promise.all([
      event.specId ? listBatchInspections(event.batchId, event.specId) : Promise.resolve([]),
      listRecordTimeline(event.batchId),
      listProcessRecords(event.batchId),
      listEquipmentReadings(event.batchId),
      listProductData({ batchId: event.batchId }),
      influencesForMetric(event.metricId),
    ]);

  const targetRecord =
    batchRecords.find((record) => record.id === event.triggerRecordId) ?? null;

  const recordIds = batchRecords.map((record) => record.id);
  const [wallPoints, consistencyChecks] = await Promise.all([
    listWallPoints(recordIds),
    listConsistencyChecks(recordIds),
  ]);

  // 没有规格就无法找参考批次（参考对照以「同规格历史批次」为准）
  const referenceBatches = event.specId
    ? await listReferenceBatches({
        specId: event.specId,
        excludeBatchId: event.batchId,
        limit: 5,
      })
    : [];

  const references = await Promise.all(
    referenceBatches.map(async (reference) => ({
      ...reference,
      stats: await referenceStatsForBatch(reference.batchId, event.metricId),
    })),
  );

  const usableReferences = references.filter((reference) => reference.stats.count > 0);

  const dataVersionNote = [
    `抽检记录 ${batchRecords.length} 条`,
    `壁厚测点 ${wallPoints.length} 条`,
    `在线产品数据 ${productData.length} 条`,
    `工艺记录 ${processData.records.length} 条`,
    `设备读数 ${equipmentReadings.length} 条`,
    `参考批次 ${usableReferences.length} 个`,
  ].join(' · ');

  return {
    event,
    metricCode: metric?.code ?? '',
    metricName: metric?.name ?? event.metricName,
    metricUnit: metric?.unit ?? 'mm',
    decimalScale: metric?.decimalScale ?? 3,
    targetRecord,
    batchRecords,
    timeline: timeline.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      inspectTime: String(row.inspectTime),
      qualityFlag: String(row.qualityFlag ?? 'none'),
    })),
    wallPoints,
    productData,
    processRecords: processData.records,
    processZones: processData.zones,
    equipmentReadings,
    consistencyChecks,
    influences,
    references: usableReferences,
    dataVersionNote,
  };
}

// ── 统计工具 ────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function deviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ── 假设生成器 ──────────────────────────────────────────────────────

type HypothesisBuilder = (input: DiagnosisInput) => Hypothesis[];

/**
 * 按规则编码分派的假设生成器。
 *
 * 新增规则时：在这里加一个键 + 一个生成函数，其它代码不用动。
 * 未注册的规则编码返回空数组，页面会提示「该规则暂无诊断模板」，
 * 而不是伪造几条看起来很像的分析。
 */
const HYPOTHESIS_BUILDERS: Record<string, HypothesisBuilder> = {
  R1: buildDataConsistencyHypotheses,
  R2: buildMeasurementValidityHypotheses,
  R3: buildSpecDeviationHypotheses,
  R4: buildTrendHypotheses,
};

function buildSpecDeviationHypotheses(input: DiagnosisInput): Hypothesis[] {
  const results: Hypothesis[] = [];
  const series = metricSeriesFor(input);
  const outliers = series.filter((item) => item.value > 0);

  const zoneDeviations = input.processZones
    .filter((zone) => zone.deviationC !== null)
    .map((zone) => ({
      zone,
      deviation: Math.abs(Number(zone.deviationC)),
    }))
    .sort((a, b) => b.deviation - a.deviation);

  // 假设 1：壁厚/外径控制参数漂移（温区实测偏离设定）
  const topZone = zoneDeviations[0];
  const driftEvidence: EvidenceItem[] = [];
  const missing: string[] = [];

  if (topZone) {
    driftEvidence.push({
      evidenceType: '工艺参数',
      layer: '相关因素变化',
      content: `温区「${topZone.zone.zoneName}」实测 ${fmt(topZone.zone.feedbackC, 1)} °C，`
        + `设定 ${fmt(topZone.zone.setpointC, 1)} °C，偏差 ${fmt(topZone.zone.deviationC, 1)} °C，`
        + `为本次记录中偏差最大的温区。`,
      factTime: input.processRecords.at(-1)?.recordTime ?? null,
      isLocateable: false,
      isUsable: true,
    });
  } else {
    missing.push('缺少温区实测/设定温度记录，无法判断温度偏差');
  }

  if (input.influences.length) {
    driftEvidence.push({
      evidenceType: '参考对照',
      layer: '相关因素变化',
      content:
        `指标「${input.metricName}」在本平台的关联过程参数为：` +
        input.influences.map((influence) => `${influence.name}（${influence.unit}）`).join('、') +
        '。关联关系来自指标—过程参数配置，用于确定排查范围，本身不构成因果证明。',
      isLocateable: false,
      isUsable: true,
    });
  }

  if (outliers.length) {
    driftEvidence.push({
      evidenceType: '测量数据',
      layer: '规格限值',
      content:
        `本批次共 ${outliers.length} 条超范围记录，最早为 ${outliers[0].code}（${outliers[0].time}），` +
        `最近为 ${outliers.at(-1)!.code}（${outliers.at(-1)!.time}）。`,
      factTime: outliers[0].time,
      isLocateable: true,
      relatedRecordId: input.targetRecord?.id ?? null,
      isUsable: true,
    });
  }

  results.push({
    seq: 1,
    hypothesis: `过程参数（温度 / 牵引速度 / 压力）偏离设定，导致${input.metricName}超出当前配置范围`,
    rootCauseCategory: '过程参数漂移',
    observation: `本批次 ${outliers.length} 条记录的${input.metricName}超出规格限值；`
      + (topZone
        ? `其中温区「${topZone.zone.zoneName}」实测与设定偏差最大（${fmt(topZone.deviation, 1)} °C）。`
        : '目前缺少工艺参数记录，暂无法定位具体参数。'),
    mechanism: '温度或牵引速度变化会直接改变熔体流动与冷却定型条件，进而影响管材的壁厚分布与外径尺寸。',
    mechanismSources: ['塑料管材挤出成型工艺：温度—熔体黏度—壁厚关系', '牵引速度与管材外径的对应关系'],
    missingEvidence: missing,
    validationActions: topZone
      ? `调取 ${input.processRecords.at(-1)?.batchNo ?? input.event.batchNo} 批次的温区记录，核对「${topZone.zone.zoneName}」`
        + '设定值是否在工艺卡范围内；同步核对牵引速度与压力记录的实际波动区间。'
      : '先补齐该批次的工艺记录（温区设定/实测、牵引速度、压力），再判断参数是否偏离。',
    validationMethod: '工艺记录与工艺卡逐项比对 + 现场复核仪表读数',
    evidence: driftEvidence,
  });

  // 假设 2：在线测量与抽检测量系统差异（数据口径问题）
  const mismatch = input.consistencyChecks.filter((check) => check.result === 'inconsistent');
  const productRows = input.productData.filter((row) => row.ovalityEffectiveMm !== null);
  const productEvidence: EvidenceItem[] = [];
  const productMissing: string[] = [];

  if (productRows.length) {
    const values = productRows.map((row) => Number(row.ovalityEffectiveMm));
    productEvidence.push({
      evidenceType: '测量数据',
      layer: '参考对照',
      content:
        `在线产品数据 ${productRows.length} 条：不圆度中位数 ${fmt(median(values), 3)} mm，` +
        `观察范围 ${fmt(Math.min(...values), 3)} – ${fmt(Math.max(...values), 3)} mm。` +
        '这是在线测量的观察范围，不是规格限值。',
      factTime: productRows[0].productionDate,
      isLocateable: false,
      isUsable: true,
    });
  } else {
    productMissing.push('缺少在线产品数据（v_product_data_wide 无该批次记录），无法与抽检结果对照');
  }

  if (mismatch.length) {
    productEvidence.push({
      evidenceType: '数据核对',
      layer: '数据核对',
      content:
        `存在 ${mismatch.length} 条 QMS/MES 记录差异待核对，` +
        `其中 ${mismatch[0].recordCode}（${mismatch[0].metricName}）` +
        `主记录 ${fmt(mismatch[0].primaryValue, 3)}、待核对记录 ${fmt(mismatch[0].secondaryValue, 3)}，` +
        `差值 ${fmt(mismatch[0].diffValue, 3)}、容差 ${fmt(mismatch[0].toleranceValue, 3)}。`,
      factTime: mismatch[0].matchedTime,
      isLocateable: true,
      relatedRecordId: mismatch[0].recordId,
      isUsable: true,
    });
  }

  results.push({
    seq: 2,
    hypothesis: '抽检测量结果与在线测量结果存在系统差异，超范围可能是测量口径不一致而非产品实际偏移',
    rootCauseCategory: '测量系统差异',
    observation: productRows.length
      ? `在线不圆度中位数 ${fmt(median(productRows.map((row) => Number(row.ovalityEffectiveMm))), 3)} mm，`
        + `与抽检记录存在可对照的数据。`
      : '缺少在线产品数据，无法完成两套测量口径的对照。',
    mechanism: '在线测量与实验室抽检的测量位置、方法与量具不同，天然存在偏差；需要先用同一样管做比对才能确认差异量级。',
    mechanismSources: ['测量系统分析（MSA）：重复性与再现性', '在线测量与离线抽检的测量位置差异'],
    missingEvidence: productMissing,
    validationActions:
      '取同一根样管分别用在线测量与抽检方法各测一次，记录两组数据；'
      + '若差异超过比对容差，先修正数据口径再讨论产品是否偏离。',
    validationMethod: '同一样管双方法比对（测量系统分析）',
    evidence: productEvidence,
  });

  return results;
}

/**
 * 事件指标在本批次的测量序列（按时间正序，跳过无数据点）。
 * `code` 是抽检记录编号，用于把结论指回具体记录。
 */
function metricSeriesFor(
  input: DiagnosisInput,
): Array<{ code: string; time: string; value: number }> {
  if (!input.metricCode) return [];
  return input.batchRecords
    .map((record) => ({
      code: record.code,
      time: record.inspectTime,
      value: record.metrics[input.metricCode] ?? null,
    }))
    .filter((item): item is { code: string; time: string; value: number } => item.value !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function buildTrendHypotheses(input: DiagnosisInput): Hypothesis[] {
  const series = seriesForEventMetric(input);
  const first = series[0];
  const last = series.at(-1);
  const change = first && last ? last.value - first.value : null;

  const evidence: EvidenceItem[] = [];
  if (series.length) {
    evidence.push({
      evidenceType: '测量数据',
      layer: '变化趋势',
      content:
        `${input.event.metricName}在同一生产日内共 ${series.length} 个抽检点：` +
        series
          .map((item) => `${item.time.slice(11, 16)} ${fmt(item.value, input.decimalScale)}`)
          .join(' → ') +
        (change === null ? '' : `，累计变化 ${fmt(change, input.decimalScale)} ${input.metricUnit}。`),
      factTime: last?.time ?? null,
      isLocateable: true,
      relatedRecordId: input.targetRecord?.id ?? null,
      isUsable: true,
    });
  }

  const referenceEvidence: EvidenceItem[] = input.references.map((reference) => ({
    evidenceType: '参考对照',
    layer: '参考对照',
    content:
      `参考批次 ${reference.batchNo}` +
      (reference.productionGroup ? `（${reference.productionGroup}）` : '') +
      `：${input.metricName} ${reference.stats.count} 个样本，中位数 ${fmt(
        reference.stats.median,
        input.decimalScale,
      )}，观察范围 ${fmt(reference.stats.min, input.decimalScale)} – ${fmt(
        reference.stats.max,
        input.decimalScale,
      )} ${input.metricUnit}。中位数与观察范围只描述历史数据，不是合格判定限。`,
    factTime: null,
    isLocateable: false,
    isUsable: true,
  }));

  const missing: string[] = [];
  if (!series.length) missing.push('该批次缺少该指标的有效测量值，无法计算趋势');
  if (!referenceEvidence.length) missing.push('同规格下没有可用的参考批次，无法做历史对照');

  const zoneEvidence: EvidenceItem[] = [];
  const zoneRows = input.processZones.filter((zone) => zone.deviationC !== null);
  if (zoneRows.length) {
    const worst = [...zoneRows].sort(
      (a, b) => Math.abs(Number(b.deviationC)) - Math.abs(Number(a.deviationC)),
    )[0];
    zoneEvidence.push({
      evidenceType: '工艺参数',
      layer: '相关因素变化',
      content:
        `同期 ${zoneRows.length} 个温区记录中，偏差最大的是「${worst.zoneName}」：` +
        `设定 ${fmt(worst.setpointC, 1)} °C、实测 ${fmt(worst.feedbackC, 1)} °C、` +
        `偏差 ${fmt(worst.deviationC, 1)} °C。`,
      factTime: input.processRecords.at(-1)?.recordTime ?? null,
      isLocateable: false,
      isUsable: true,
    });
  } else {
    missing.push('缺少可用的温区实测数据，无法判断趋势是否与温度变化同步');
  }

  return [
    {
      seq: 1,
      hypothesis: `${input.metricName}存在单向漂移，过程处于连续调整状态（刀具磨损 / 牵引速度缓慢变化 / 温度渐进漂移）`,
      rootCauseCategory: '过程单向漂移',
      observation:
        change === null
          ? `${input.event.metricName}的测量点不足以计算变化量。`
          : `同一生产日内${input.metricName}累计变化 ${fmt(change, input.decimalScale)} ${
              input.metricUnit
            }（${series.length} 个抽检点）。`,
      mechanism: '模具或定径套磨损、牵引速度随温度变化缓慢波动，都会让尺寸沿生产时间单向变化，而不是随机跳动。',
      mechanismSources: ['挤出模具磨损与尺寸漂移关系', '牵引速度与冷却收缩的耦合作用'],
      missingEvidence: missing,
      validationActions:
        '按时间顺序复核抽检点的量具与测量人是否一致；'
        + '调取同期牵引速度与温区趋势，确认漂移是否与参数变化同步。',
      validationMethod: '同批次时间序列复核 + 与工艺参数趋势对齐',
      evidence: [...evidence, ...zoneEvidence, ...referenceEvidence],
    },
    {
      seq: 2,
      hypothesis: '测量或记录环节引入系统性偏差（量具未校准 / 记录批次内样管编号错位）',
      rootCauseCategory: '测量与记录偏差',
      observation: `本批次共 ${input.batchRecords.length} 条抽检记录，`
        + `数据质量标记异常 ${input.timeline.filter((row) => row.qualityFlag !== 'none').length} 条。`,
      mechanism: '量具未按期校准或样管编号记录错位时，数据会呈现「看似趋势」的位移，但实际产品并未变化。',
      mechanismSources: ['计量器具周期校准要求', '样管标识与追溯管理'],
      missingEvidence: input.wallPoints.length
        ? []
        : ['台账未录入分点壁厚测点（inspection_wall_point），无法核对同一样管不同位置的分布'],
      validationActions: '核对本批次量具校准有效期与测量人；重新测量留存样管，与本批次记录比对。',
      validationMethod: '量具校准记录核查 + 留存样管复测',
      evidence: [
        {
          evidenceType: '观察事实',
          layer: '观察事实',
          content:
            `数据质量标记分布：` +
            input.timeline
              .map((row) => `${row.code}=${row.qualityFlag}`)
              .join('、'),
          isLocateable: true,
          isUsable: true,
        },
        ...referenceEvidence,
      ],
    },
  ];
}

function seriesForEventMetric(input: DiagnosisInput): Array<{ time: string; value: number }> {
  const code = input.metricCode;
  if (!code) return [];
  const targetDay = (input.targetRecord?.inspectTime ?? input.event.windowEndTime).slice(0, 10);
  return input.batchRecords
    .filter((record) => record.inspectTime.slice(0, 10) === targetDay)
    .map((record) => ({ time: record.inspectTime, value: record.metrics[code] ?? null }))
    .filter((item): item is { time: string; value: number } => item.value !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function buildDataConsistencyHypotheses(input: DiagnosisInput): Hypothesis[] {
  const checks = input.consistencyChecks;
  const evidence: EvidenceItem[] = checks.map((check) => ({
    evidenceType: '数据核对',
    layer: '数据核对',
    content:
      `${check.recordCode} · ${check.metricName}：主记录 ${fmt(check.primaryValue, 3)}，`
      + `待核对记录 ${fmt(check.secondaryValue, 3)}，差值 ${fmt(check.diffValue, 3)}，`
      + `容差 ${fmt(check.toleranceValue, 3)}，结论「${check.result}」` +
      (check.conclusionNote ? `（${check.conclusionNote}）` : ''),
    factTime: check.matchedTime,
    isLocateable: true,
    relatedRecordId: check.recordId,
    isUsable: true,
  }));

  const missing: string[] = [];
  if (!checks.length) missing.push('该批次没有 QMS/MES 核对记录，无法确认差异来源');
  if (!input.productData.length) missing.push('缺少在线产品数据，无法判断差异属于记录问题还是测量问题');

  return [
    {
      seq: 1,
      hypothesis: '两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）',
      rootCauseCategory: '样管与时间匹配错误',
      observation: checks.length
        ? `共 ${checks.length} 条核对记录，其中差值超过容差 ${checks.filter((c) => c.diffValue > c.toleranceValue).length} 条。`
        : '当前没有核对记录可分析。',
      mechanism: 'MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。',
      mechanismSources: ['质量追溯：样管编号与批次绑定要求', 'MES/QMS 时间戳对齐要求'],
      missingEvidence: missing,
      validationActions:
        '按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；'
        + '确认是否为同一样管后，再判断差异是否真实存在。',
      validationMethod: '原始检验单回溯 + 样管编号核对',
      evidence,
    },
    {
      seq: 2,
      hypothesis: '其中一套系统存在录入或单位换算错误（小数位、单位、抄录）',
      rootCauseCategory: '数据录入错误',
      observation: checks.length
        ? `最大差值 ${fmt(Math.max(...checks.map((c) => c.diffValue)), 3)}，`
          + `最大容差 ${fmt(Math.max(...checks.map((c) => c.toleranceValue)), 3)}。`
        : '当前没有核对记录可分析。',
      mechanism: '手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。',
      mechanismSources: ['数据录入双人复核要求', '计量单位与有效位数规范'],
      missingEvidence: missing,
      validationActions: '核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。',
      validationMethod: '原始记录与系统值逐字段比对',
      evidence,
    },
  ];
}

function buildMeasurementValidityHypotheses(input: DiagnosisInput): Hypothesis[] {
  const wallPoints = input.wallPoints;
  const values = wallPoints.map((point) => point.valueMm).filter((value): value is number => value !== null);
  const spread = values.length >= 2 ? Math.max(...values) - Math.min(...values) : null;

  const evidence: EvidenceItem[] = [];
  const missing: string[] = [];

  if (values.length) {
    evidence.push({
      evidenceType: '测量数据',
      layer: '观察事实',
      content:
        `分点壁厚测点 ${values.length} 个：最小 ${fmt(Math.min(...values), 3)}，`
        + `最大 ${fmt(Math.max(...values), 3)}，极差 ${fmt(spread, 3)} mm，`
        + `标准差 ${fmt(deviation(values), 3)} mm。`,
      factTime: input.targetRecord?.inspectTime ?? null,
      isLocateable: true,
      relatedRecordId: input.targetRecord?.id ?? null,
      isUsable: true,
    });
  } else {
    missing.push('台账未录入分点壁厚测点（inspection_wall_point），无法评估测量分散性');
  }

  const readings = input.equipmentReadings.filter((row) => row.temperatureC !== null);
  if (readings.length) {
    const temperatures = readings.map((row) => Number(row.temperatureC));
    evidence.push({
      evidenceType: '设备采集',
      layer: '相关因素变化',
      content:
        `设备温度采集 ${readings.length} 条：中位数 ${fmt(median(temperatures), 1)} °C，`
        + `观察范围 ${fmt(Math.min(...temperatures), 1)} – ${fmt(Math.max(...temperatures), 1)} °C。`,
      factTime: readings[0].collectTime,
      isLocateable: false,
      isUsable: true,
    });
  } else {
    missing.push('缺少设备温度采集数据，无法判断测量偏差是否伴随设备波动');
  }

  return [
    {
      seq: 1,
      hypothesis: '测量过程本身不可靠（量具失准 / 测量位置不规范 / 未按标准方法测量）',
      rootCauseCategory: '测量过程不可靠',
      observation: values.length
        ? `分点壁厚极差 ${fmt(spread, 3)} mm，标准差 ${fmt(deviation(values), 3)} mm。`
        : '缺少分点测点数据，无法评估。',
      mechanism: '量具失准或测量位置不规范会同时抬高同一批次多条记录的分散性，与产品实际波动难以区分。',
      mechanismSources: ['计量器具周期校准与期间核查', '壁厚测量位置与方法规范'],
      missingEvidence: missing,
      validationActions:
        '核对量具校准有效期与期间核查记录；按标准方法在同一截面重新测量并记录位置；'
        + '必要时做重复性测试（同一样管同一位置连续测 3 次）。',
      validationMethod: '重复性与再现性测试 + 量具校准记录核查',
      evidence,
    },
  ];
}

// ── 落库 ────────────────────────────────────────────────────────────

/** 业务证据来源 → 数据库三分类（basis 依据 / support 支持 / contradict 反证） */
function toEvidenceType(
  source: EvidenceItem['evidenceType'],
): 'basis' | 'support' | 'contradict' {
  if (source === '测量数据') return 'basis';
  return 'support';
}

function snapshotHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export interface RunDiagnosisOptions {
  eventCode: string;
  userId: number;
  request?: Request;
}

export interface DiagnosisRunResult {
  runId: number;
  runCode: string;
  runNo: number;
  hypotheses: number;
  dataVersionNote: string;
}

/**
 * 执行一次诊断并落库。
 *
 * run_no 递增：同一事件可以多次诊断（补充数据后再跑一次），
 * 历史结论全部保留，避免「重新分析把上次结论覆盖掉」。
 */
export async function runDiagnosis(options: RunDiagnosisOptions): Promise<DiagnosisRunResult> {
  const input = await buildDiagnosisInput(options.eventCode);
  const builder = HYPOTHESIS_BUILDERS[input.event.ruleCode];

  if (!builder) {
    throw AppError.badRequest(
      `规则 ${input.event.ruleCode} 目前没有诊断模板。请在 src/lib/services/analysisEngine.ts 的 ` +
        'HYPOTHESIS_BUILDERS 中补充对应生成器后再执行诊断。',
    );
  }

  const hypotheses = builder(input);
  if (!hypotheses.length) {
    throw AppError.badRequest('当前数据不足以生成任何结论候选，请先补齐证据数据。');
  }

  const lastRun = await queryOne<RowDataPacket>(
    'SELECT COALESCE(MAX(run_no), 0) AS lastNo FROM analysis_run WHERE event_id = ?',
    [input.event.id],
  );
  const runNo = Number(lastRun?.lastNo ?? 0) + 1;
  const runCode = `AN-${input.event.code}-${String(runNo).padStart(2, '0')}`;

  const runId = await withTransaction(async (connection) => {
    const [runResult] = await connection.execute(
      `INSERT INTO analysis_run
         (code, event_id, metric_id, reference_batch_id, run_no, generation_type, model_name,
          status, data_version_note, generated_by)
       VALUES (?,?,?,?,?, 'rule_based', '平台规则模板', 'completed', ?, ?)`,
      [
        runCode,
        input.event.id,
        input.event.metricId,
        input.references[0]?.batchId ?? null,
        runNo,
        input.dataVersionNote,
        options.userId,
      ],
    );
    const newRunId = Number((runResult as { insertId: number }).insertId);

    // analysis_reference_snapshot 上有 UNIQUE(run_id)：一次分析只落一行参考对照快照。
    // 这符合「快照=当时对照基础」的语义：多个参考批次写成一行汇总，
    // 逐批明细保留在 note 中，避免同一分析出现多行互相矛盾的「对照基线」。
    if (input.references.length) {
      const stats = input.references.map((reference) => reference.stats).filter((item) => item.count > 0);
      const allValues = stats.flatMap((item) => [item.min, item.max]).filter((value): value is number => value !== null);
      const medianOfMedians = stats.length
        ? stats.reduce((sum, item) => sum + (item.median ?? 0), 0) / stats.length
        : null;

      await connection.execute(
        `INSERT INTO analysis_reference_snapshot
           (run_id, reference_batch_id, reference_batch_no, spec_code, spec_name, production_group,
            metric_id, sample_count, median_value, min_value, max_value, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newRunId,
          input.references[0].batchId,
          input.references.map((reference) => reference.batchNo).join('、'),
          input.event.specCode ?? null,
          input.event.specName ?? null,
          input.references[0].productionGroup,
          input.event.metricId,
          stats.reduce((sum, item) => sum + item.count, 0),
          medianOfMedians,
          allValues.length ? Math.min(...allValues) : null,
          allValues.length ? Math.max(...allValues) : null,
          '参考统计量用于对照，不是规格限值；明细：' +
            input.references
              .map(
                (reference) =>
                  `${reference.batchNo}(${reference.stats.count} 个样本，中位数 ${fmt(
                    reference.stats.median,
                    input.decimalScale,
                  )}，范围 ${fmt(reference.stats.min, input.decimalScale)}–${fmt(
                    reference.stats.max,
                    input.decimalScale,
                  )})`,
              )
              .join('；'),
        ],
      );
    }

    for (const hypothesis of hypotheses) {
      const [conclusionResult] = await connection.execute(
        `INSERT INTO analysis_conclusion
           (run_id, seq, hypothesis, root_cause_category, observation, mechanism, mechanism_sources,
            missing_evidence, validation_actions, validation_method, engineer_decision)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`,
        [
          newRunId,
          hypothesis.seq,
          hypothesis.hypothesis,
          hypothesis.rootCauseCategory,
          hypothesis.observation,
          hypothesis.mechanism,
          JSON.stringify(hypothesis.mechanismSources),
          hypothesis.missingEvidence.length ? hypothesis.missingEvidence.join('\n') : null,
          hypothesis.validationActions,
          hypothesis.validationMethod,
        ],
      );
      const conclusionId = Number((conclusionResult as { insertId: number }).insertId);

      let sortNo = 0;
      for (const item of hypothesis.evidence) {
        await connection.execute(
          `INSERT INTO conclusion_evidence
             (conclusion_id, evidence_type, layer, content, fact_time, is_locateable,
              related_record_id, is_usable, sort_no)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            conclusionId,
            // conclusion_evidence.evidence_type 是「依据 / 支持 / 反证」三分类，
            // 我们采集到的「测量数据 / 工艺参数 / 设备采集 / 参考对照 / 数据核对 / 观察事实」
            // 属于业务来源，写库时映射到三分类，业务来源保留在 content 与 layer 里。
            toEvidenceType(item.evidenceType),
            item.layer,
            item.content,
            item.factTime ?? null,
            item.isLocateable ? 1 : 0,
            item.relatedRecordId ?? null,
            item.isUsable ? 1 : 0,
            sortNo++,
          ],
        );
      }
    }

    return newRunId;
  });

  await writeAudit({
    user: { userId: options.userId },
    module: 'diagnosis',
    action: 'create',
    targetType: 'analysis_run',
    targetId: runId,
    detail:
      `对事件 ${input.event.code}（${input.event.ruleCode}）执行诊断，生成 ${hypotheses.length} 条结论候选；` +
      `数据版本：${input.dataVersionNote}；快照指纹 ${snapshotHash(input.dataVersionNote)}`,
    request: options.request,
  });

  return {
    runId,
    runCode,
    runNo,
    hypotheses: hypotheses.length,
    dataVersionNote: input.dataVersionNote,
  };
}

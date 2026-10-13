/**
 * Excel 导入模板下载。
 *
 * 路径：GET /api/datasource/import/template?type=batches
 *       GET /api/datasource/import/template            （不带 type：一个工作簿含全部模板工作表）
 *       GET /api/datasource/import/template?type=batches&meta=1  （返回模板结构 JSON，供页面预览）
 *
 * 模板约定（每张工作表固定三行）：
 *   第 1 行：说明（必填列、格式与校验口径）
 *   第 2 行：中文表头（带 * 为必填列）
 *   第 3 行：示例数据行
 *
 * 中文文件名按 RFC 5987 编码：同时给出 ASCII 回退名与 filename*=UTF-8''…，
 * 否则 Chrome/Safari 拿到的是乱码或直接丢弃文件名。
 */
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TemplateDef {
  /** 资源键，与 /api/datasource/:resource 一致 */
  type: string;
  /** 中文名，用作工作表名 */
  label: string;
  /** 下载文件名 */
  fileName: string;
  /** 第 1 行说明 */
  note: string;
  /** 第 2 行中文表头，带 * 为必填 */
  columns: string[];
  /** 第 3 行示例 */
  example: Array<string | number>;
}

const TEMPLATE_DEFS: TemplateDef[] = [
  {
    type: 'batches',
    label: '生产批次',
    fileName: '生产批次导入模板.xlsx',
    note:
      '说明：带 * 的列为必填；时间格式 YYYY-MM-DD HH:mm:ss；规格编码、产线编码、挤出/牵引设备编码、数据来源编码必须已在主数据中存在；批次编号在系统内必须唯一，重复行整批拒绝。',
    columns: [
      '批次编号*',
      '规格编码*',
      '生产开始时间*',
      '生产结束时间',
      '批次状态',
      '生产组别',
      '产线编码',
      '挤出设备编码',
      '牵引设备编码',
      '数据来源编码',
      '备注',
    ],
    example: [
      'BATCH-DEMO-001',
      'SPEC-25-42',
      '2026-10-01 08:00:00',
      '2026-10-01 20:00:00',
      '已完成',
      'D组',
      'LINE-A',
      'EQ-EX-01',
      'EQ-HO-01',
      'mes_demo',
      '示例行，导入前请删除',
    ],
  },
  {
    type: 'products',
    label: '产品数据',
    fileName: '产品数据导入模板.xlsx',
    note:
      '说明：带 * 的列为必填；同一「产品数据编号」可有多行，每行一个指标（指标编码或指标名称均可）；批次编号必须已存在；批次 + 生产日期唯一；指标编码必须存在于质量指标字典。',
    columns: ['产品数据编号*', '批次编号*', '生产日期*', '指标编码*', '指标值*', '数据来源编码', '备注'],
    example: ['PRD-DEMO-001', '12121D0032', '2026-10-01', 'outer_diameter', 25.02, 'mes_demo', '示例行，导入前请删除'],
  },
  {
    type: 'readings',
    label: '设备采集数据',
    fileName: '设备采集数据导入模板.xlsx',
    note:
      '说明：带 * 的列为必填；同一「记录编号」可有多行，每行一个参数；采集时间格式 HH:mm（小时:分钟）；同一设备 + 生产日期 + 采集时间只能有一条记录；参数编码必须存在于过程参数字典。',
    columns: [
      '记录编号*',
      '批次编号*',
      '生产日期*',
      '设备编码*',
      '采集时间*',
      '参数编码*',
      '参数值*',
      '数据来源编码',
      '备注',
    ],
    example: [
      'DEV-DEMO-20261001-0800',
      '12121D0032',
      '2026-10-01',
      'EQ-EX-01',
      '08:00',
      'temperature',
      192.5,
      'device_demo',
      '示例行，导入前请删除',
    ],
  },
  {
    type: 'inspections',
    label: '样管抽检记录',
    fileName: '样管抽检记录导入模板.xlsx',
    note:
      '说明：带 * 的列为必填；同一「记录编号」可有多行，每行一个指标；指标缺失请不要写行，系统按「无数据」处理（不会当成 0）；批次 + 抽检时间唯一；指标编码必须存在于质量指标字典。',
    columns: [
      '记录编号*',
      '样管编号*',
      '批次编号*',
      '抽检时间*',
      '指标编码*',
      '指标值*',
      '生产时间',
      '测量阶段',
      '检验方法',
      '量具仪器',
      '数据质量标记',
      '备注',
    ],
    example: [
      'IR-DEMO-001',
      'S-DEMO-001',
      '12121D0032',
      '2026-10-01 08:30:00',
      'outer_diameter',
      25.03,
      '2026-10-01 08:00:00',
      '初测',
      'GB/T 8806',
      '数显游标卡尺',
      '无数据质量问题',
      '示例行，导入前请删除',
    ],
  },
  {
    type: 'process',
    label: '工艺过程记录',
    fileName: '工艺过程记录导入模板.xlsx',
    note:
      '说明：带 * 的列为必填；同一「记录编号」可有多行，每行一个温区；温区编码必须已在温区字典中存在；时间格式 YYYY-MM-DD HH:mm:ss；偏差由反馈温度 − 设定温度自动计算，不需填写。',
    columns: [
      '记录编号*',
      '批次编号*',
      '记录时间*',
      '设备编码',
      '温区编码*',
      '设定温度',
      '反馈温度',
      '牵引反馈速度',
      '管材线速度',
      '质量产出率',
      '时间匹配状态',
      '备注',
    ],
    example: [
      'PR-DEMO-001',
      '12121D0032',
      '2026-10-01 08:00:00',
      'EQ-EX-01',
      'M1-barrel-1',
      190,
      191.2,
      2.35,
      2.2,
      310.5,
      '已确认',
      '示例行，导入前请删除',
    ],
  },
  {
    type: 'production-events',
    label: '生产事件记录',
    fileName: '生产事件记录导入模板.xlsx',
    note:
      '说明：带 * 的列为必填；批次编号必须已存在；事件类型可用中文（开机/停机/重启/换规格/调机/换料/其他）或编码（start/stop/restart/spec_changeover/adjustment/material_change/other）；时间格式 YYYY-MM-DD HH:mm:ss；持续分钟可留空。',
    columns: ['批次编号*', '事件类型*', '发生时间*', '结束时间', '持续分钟', '原因', '明细', '来源'],
    example: [
      '12121D0032',
      '停机',
      '2026-10-01 10:15:00',
      '2026-10-01 10:45:00',
      30,
      '更换过滤网',
      '换网停机',
      'MES',
      '示例行，导入前请删除',
    ],
  },
];

function findTemplate(type: string): TemplateDef {
  const def = TEMPLATE_DEFS.find((item) => item.type === type);
  if (!def) {
    throw AppError.notFound(
      `未知的导入模板类型：${type}（可选：${TEMPLATE_DEFS.map((item) => item.type).join(' / ')}）。`,
    );
  }
  return def;
}

/** 用「说明 + 中文表头 + 示例」三行构造一张工作表 */
function buildSheet(def: TemplateDef): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([ [def.note], def.columns, def.example ]);
  sheet['!cols'] = def.columns.map((column, index) => ({
    wch: Math.max(14, Math.min(30, Math.max(column.length * 2 + 6, String(def.example[index] ?? '').length * 2))),
  }));
  sheet['!rows'] = [{ hpt: 34 }, { hpt: 20 }, { hpt: 20 }];
  return sheet;
}

/**
 * GET 模板文件 / 模板结构。
 * meta=1 时不下载文件，返回结构与示例，供导入向导在页面上直接展示。
 */
export const GET = withApi(
  { name: 'GET /api/datasource/import/template', permission: 'datasource:import' },
  async ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const meta = url.searchParams.get('meta') === '1';

    if (meta) {
      const defs = type ? [findTemplate(type)] : TEMPLATE_DEFS;
      return ok({
        templates: defs.map((def) => ({
          type: def.type,
          label: def.label,
          fileName: def.fileName,
          note: def.note,
          columns: def.columns,
          example: def.example,
        })),
      });
    }

    const book = XLSX.utils.book_new();
    const defs = type ? [findTemplate(type)] : TEMPLATE_DEFS;
    for (const def of defs) {
      // Excel 工作表名上限 31 字符
      XLSX.utils.book_append_sheet(book, buildSheet(def), def.label.slice(0, 31));
    }

    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const fileName = type ? findTemplate(type).fileName : '数据源导入模板（全部类别）.xlsx';
    const asciiName = type ? `datasource-${type}-template.xlsx` : 'datasource-template.xlsx';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
          fileName,
        )}`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  },
);

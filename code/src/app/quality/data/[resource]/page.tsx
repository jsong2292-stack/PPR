'use client';

import { useParams, notFound } from 'next/navigation';
import { DataManager, type Column, type Field } from '@/components/quality/DataManager';

const statusOptions = [{ label: '启用', value: 'enabled' }, { label: '停用', value: 'disabled' }];
const batchStatus = [{ label: '生产中', value: 'running' }, { label: '已完成', value: 'completed' }, { label: '暂停', value: 'paused' }];
const qualityFlags = [{ label: '正常', value: 'normal' }, { label: '中风险', value: 'medium' }, { label: '高风险', value: 'high' }, { label: '数据错误', value: 'error' }];

// 系统管理下的基础主数据只允许页面 CRUD，不提供 Excel 模板与导入（excel: false）。
const configs: Record<string, { title: string; description: string; fields: Field[]; columns: Column[]; excel?: boolean }> = {
  categories: {
    title: '产品类别', description: '维护产品分类，为规格和质量数据提供统一主数据编码。',
    excel: false,
    fields: [{ key:'code',label:'类别编码',required:true },{ key:'name',label:'类别名称',required:true },{ key:'description',label:'说明',type:'textarea' },{ key:'status',label:'状态',type:'select',options:statusOptions }],
    columns: [{key:'code',label:'编码'},{key:'name',label:'名称'},{key:'description',label:'说明'},{key:'status',label:'状态'}],
  },
  specs: {
    title: '产品规格', description: '维护规格的最大/最小外径、最大/最小壁厚和不圆度上限，作为监控判定限值；正式判定仍以适用标准为准。',
    excel: false,
    fields: [{key:'code',label:'规格编码',required:true},{key:'name',label:'规格名称',required:true},{key:'category_id',label:'产品类别',type:'select',optionResource:'categories',required:true},{key:'outer_upper_mm',label:'最大外径 mm',type:'number',required:true},{key:'outer_lower_mm',label:'最小外径 mm',type:'number',required:true},{key:'wall_upper_mm',label:'最大壁厚 mm',type:'number',required:true},{key:'wall_lower_mm',label:'最小壁厚 mm',type:'number',required:true},{key:'ovality_upper_mm',label:'不圆度上限 mm',type:'number',required:true},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'编码'},{key:'name',label:'名称'},{key:'category_name',label:'产品类别'},{key:'outer_upper_mm',label:'最大外径 mm'},{key:'outer_lower_mm',label:'最小外径 mm'},{key:'wall_upper_mm',label:'最大壁厚 mm'},{key:'wall_lower_mm',label:'最小壁厚 mm'},{key:'ovality_upper_mm',label:'不圆度上限 mm'},{key:'status',label:'状态'}],
  },
  'equipment-types': {
    title: '设备类型', description: '维护挤出机、牵引机、在线测径仪等设备分类。',
    excel: false,
    fields: [{key:'code',label:'类型编码',required:true},{key:'name',label:'类型名称',required:true},{key:'description',label:'说明',type:'textarea'},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'编码'},{key:'name',label:'名称'},{key:'description',label:'说明'},{key:'status',label:'状态'}],
  },
  equipment: {
    title: '设备台账', description: '维护生产设备、类型和所属产线，供批次及采集数据关联。',
    excel: false,
    fields: [{key:'code',label:'设备编码',required:true},{key:'name',label:'设备名称',required:true},{key:'type_id',label:'设备类型',type:'select',optionResource:'equipment-types',required:true},{key:'line_name',label:'产线/工段',required:true},{key:'status',label:'状态',type:'select',options:[...statusOptions,{label:'检修',value:'maintenance'}]},{key:'description',label:'说明',type:'textarea'}],
    columns: [{key:'code',label:'设备编码'},{key:'name',label:'设备名称'},{key:'type_name',label:'设备类型'},{key:'line_name',label:'产线/工段'},{key:'status',label:'状态'}],
  },
  batches: {
    title: '批次基础信息', description: '批次是产品检验、设备采集、预警分析之间的数据关联主线。',
    fields: [{key:'batch_no',label:'批次号',required:true},{key:'spec_id',label:'产品规格',type:'select',optionResource:'specs',required:true},{key:'extruder_id',label:'挤出机',type:'select',optionResource:'equipment'},{key:'haul_off_id',label:'牵引机',type:'select',optionResource:'equipment'},{key:'production_group',label:'生产组别',required:true},{key:'start_time',label:'生产开始时间',type:'datetime',required:true},{key:'end_time',label:'生产结束时间',type:'datetime'},{key:'status',label:'批次状态',type:'select',options:batchStatus},{key:'data_source',label:'数据来源'}],
    columns: [{key:'batch_no',label:'批次号'},{key:'spec_name',label:'产品规格'},{key:'production_group',label:'组别'},{key:'start_time',label:'开始时间'},{key:'extruder_name',label:'挤出机'},{key:'haul_off_name',label:'牵引机'},{key:'status',label:'状态'}],
  },
  metrics: {
    title: '质量指标与影响因素', description: '维护指标口径、影响因素和排查方向；判定限值统一取产品规格，本页不再维护限值。',
    excel: false,
    fields: [{key:'code',label:'指标编码',required:true},{key:'name',label:'指标名称',required:true},{key:'unit',label:'单位',required:true},{key:'influences',label:'影响因素',type:'textarea'},{key:'description',label:'指标说明',type:'textarea'},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'指标编码'},{key:'name',label:'名称'},{key:'unit',label:'单位'},{key:'influences',label:'影响因素'},{key:'status',label:'状态'}],
  },
  measurements: {
    title: '产品数据', description: '维护QMS/检验产品记录；新增后可在监控页重新扫描生成预警。',
    fields: [{key:'record_no',label:'记录编号',required:true},{key:'sample_no',label:'样管编号',required:true},{key:'batch_id',label:'生产批次',type:'select',optionResource:'batches',required:true},{key:'inspect_time',label:'检验时间',type:'datetime',required:true},{key:'outer_diameter_mm',label:'外径 mm',type:'number'},{key:'min_wall_thickness_mm',label:'壁厚 mm',type:'number'},{key:'max_wall_thickness_mm',label:'最大壁厚 mm',type:'number'},{key:'max_outer_diameter_mm',label:'同截面最大外径 mm',type:'number'},{key:'min_outer_diameter_mm',label:'同截面最小外径 mm',type:'number'},{key:'ovality_mm',label:'不圆度 mm',type:'number'},{key:'data_source',label:'数据来源',required:true},{key:'quality_flag',label:'质量标记',type:'select',options:qualityFlags},{key:'remark',label:'备注',type:'textarea'}],
    columns: [{key:'record_no',label:'记录编号'},{key:'batch_no',label:'批次号'},{key:'sample_no',label:'样管'},{key:'inspect_time',label:'检验时间'},{key:'outer_diameter_mm',label:'外径 mm'},{key:'min_wall_thickness_mm',label:'壁厚 mm'},{key:'ovality_mm',label:'不圆度 mm'},{key:'data_source',label:'来源'},{key:'quality_flag',label:'标记'}],
  },
  readings: {
    title: '设备采集数据', description: '维护同批次设备时序数据，诊断时按批次和时间自动关联。',
    fields: [{key:'record_no',label:'记录编号',required:true},{key:'batch_id',label:'生产批次',type:'select',optionResource:'batches',required:true},{key:'equipment_id',label:'设备',type:'select',optionResource:'equipment',required:true},{key:'collect_time',label:'采集时间',type:'datetime',required:true},{key:'temperature_c',label:'温度 ℃',type:'number'},{key:'pressure_mpa',label:'压力 MPa',type:'number'},{key:'haul_off_speed_mpm',label:'牵引速度 m/min',type:'number'},{key:'data_source',label:'数据来源',required:true},{key:'remark',label:'备注',type:'textarea'}],
    columns: [{key:'record_no',label:'记录编号'},{key:'batch_no',label:'批次号'},{key:'equipment_name',label:'设备'},{key:'collect_time',label:'采集时间'},{key:'temperature_c',label:'温度 ℃'},{key:'pressure_mpa',label:'压力 MPa'},{key:'haul_off_speed_mpm',label:'牵引速度 m/min'},{key:'data_source',label:'来源'}],
  },
};

export default function DataPage() {
  const { resource } = useParams<{ resource: string }>(); const config = configs[resource];
  if (!config) return notFound();
  return <DataManager resource={resource} {...config} />;
}

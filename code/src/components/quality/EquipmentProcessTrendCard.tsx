'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Loader2, Maximize2, RefreshCw, TrendingUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-client';
import { ALL_READING_FIELDS, readingFieldMeta, type ReadingFieldKey, type ReadingFieldMeta } from '@/lib/quality-equipment';

type Row = Record<string, unknown>;

interface EquipmentInfo {
  id: number;
  code: string;
  name: string;
  line_name: string;
  type_name: string;
  type_code: string;
}
/** 一张「某采集项」的图：同一指标可能由多台设备采集，因此是多条曲线 */
interface TrendChart {
  field: ReadingFieldKey;
  meta: ReadingFieldMeta;
  seriesEquipments: EquipmentInfo[];
  data: ({ t: number } & Record<string, number | null>)[];
  xDomain: [number, number];
  yDomain: [number, number];
  markAnomaly: boolean;
}
interface BatchInfo {
  id: string;
  batch_no: string;
  spec_name?: string;
  production_group?: string;
  start_time?: string;
  end_time?: string;
}

/** 聚焦窗口：异常样管检验时刻前后各 4 小时，与规则引擎 get_equipment_window 的默认口径一致 */
const FOCUS_MINUTES = 240;
/** 同一指标可能由多台设备采集（例如两台挤出机都报温度），按设备逐条曲线 */
const SERIES_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#0891b2', '#65a30d'];
const ANOMALY_COLOR = '#e11d48';

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const toTime = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};
/** 库里 DATETIME 按 UTC 读出，这里直接按 ISO 字面量展示，与产品趋势图口径一致 */
const timeLabel = (value: unknown) => {
  const time = toTime(value);
  return time === null ? '—' : new Date(time).toISOString().slice(5, 16).replace('T', ' ');
};
const clockLabel = (value: number) => new Date(value).toISOString().slice(11, 16);
const dayLabel = (value: number) => new Date(value).toISOString().slice(5, 10);
const displayNumber = (value: unknown) => {
  const parsed = toNumber(value);
  return parsed === null ? '—' : String(parsed);
};

export interface EquipmentProcessTrendCardProps {
  /** 当前异常事件所属批次号（批次不落表，批次号是唯一关联键）；为空时不渲染 */
  batchNo: string | null;
  /** 当前异常事件的检验时刻，用于在图上标出异常样管被检验的位置 */
  alertTime?: string;
  /** 当前异常事件的指标名（如「不圆度」），仅用于说明文字 */
  alertMetricLabel?: string;
}

/**
 * 异常诊断页的「设备工艺参数」图表。
 *
 * 数据按批次取：预警事件 → 产品检验记录 → 批次 → 该批次下全部设备的采集记录。
 * 指标口径完全由设备类型决定（挤出机=温度/压力，牵引机=牵引速度），
 * 与「设备台账 → 采集项」页面、Excel 模板共用 quality-equipment.ts 的定义。
 *
 * 这里刻意不做任何相关性计算：时间接近只是排查线索，不是因果结论。
 *
 * 与 rule-engine 的「设备时序待对齐」结论保持同一口径：图上的红线是异常样管的
 * **检验时刻**，不是该样管在设备处的生产时刻。未完成生产时间、长度码、设备距离和
 * 检测延迟对齐前，这些曲线不能称为该样管的对应参数。
 */
export function EquipmentProcessTrendCard({ batchNo, alertTime, alertMetricLabel }: EquipmentProcessTrendCardProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [equipments, setEquipments] = useState<EquipmentInfo[]>([]);
  const [readings, setReadings] = useState<Row[]>([]);
  const [windowMode, setWindowMode] = useState<'focus' | 'batch'>('focus');
  /** 被点开放大的采集项：null 表示不显示下方放大区，默认仍是三图并排对比 */
  const [zoomedField, setZoomedField] = useState<ReadingFieldKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!batchNo) { setBatch(null); setEquipments([]); setReadings([]); return; }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/quality/batches/${encodeURIComponent(batchNo)}/equipment-readings`);
      // 先取文本再解析：路由未注册时服务端返回的是 HTML 404 页，
      // 直接 response.json() 只会抛出 "Unexpected token '<'" 这种看不懂的报错。
      const raw = await response.text();
      let json: Row = {};
      try {
        json = raw ? (JSON.parse(raw) as Row) : {};
      } catch {
        throw new Error(`接口返回了非 JSON 响应（HTTP ${response.status}）：请确认已登录，且服务端已重新加载路由。`);
      }
      if (!response.ok) throw new Error(String(json.error || `加载设备采集数据失败（HTTP ${response.status}）`));
      setBatch((json.batch as BatchInfo) ?? null);
      setEquipments((json.equipments as EquipmentInfo[]) ?? []);
      setReadings((json.readings as Row[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
      setBatch(null); setEquipments([]); setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [batchNo]);

  useEffect(() => { setWindowMode('focus'); setZoomedField(null); void load(); }, [batchNo, load]);

  const alertTs = useMemo(() => (alertTime ? toTime(alertTime) : null), [alertTime]);

  /** 聚焦窗口只保留异常样管检验时刻前后各 4 小时；没有检验时刻时退化为整批次 */
  const visible = useMemo(() => {
    if (windowMode !== 'focus' || alertTs === null) return readings;
    return readings.filter((row) => {
      const time = toTime(row.collect_time);
      return time !== null && Math.abs(time - alertTs) <= FOCUS_MINUTES * 60 * 1000;
    });
  }, [readings, windowMode, alertTs]);

  /** 哪些采集项真的有数据：只画有数据的图，避免出现一排空白坐标轴 */
  const usedFields = useMemo(
    () => ALL_READING_FIELDS.filter((key) => visible.some((row) => toNumber(row[key]) !== null)),
    [visible]
  );

  const charts = useMemo<TrendChart[]>(() => {
    const result: TrendChart[] = [];
    for (const field of usedFields) {
      const meta = readingFieldMeta(field);
      if (!meta) continue;
      const seriesEquipments = equipments.filter((equipment) =>
        visible.some((row) => Number(row.equipment_id) === equipment.id && toNumber(row[field]) !== null)
      );
      const times = [...new Set(
        visible.filter((row) => toNumber(row[field]) !== null).map((row) => toTime(row.collect_time))
      )].filter((time): time is number => time !== null).sort((a, b) => a - b);
      // 没有设备或没有时间点就不出这张图，避免画出一排空坐标轴
      if (!seriesEquipments.length || !times.length) continue;

      const data = times.map((time) => {
        const point: Record<string, number | null> = {};
        for (const equipment of seriesEquipments) {
          const record = visible.find((row) => Number(row.equipment_id) === equipment.id && toTime(row.collect_time) === time);
          point[`e${equipment.id}`] = record ? toNumber(record[field]) : null;
        }
        return { t: time, ...point } as { t: number } & Record<string, number | null>;
      });

      const values = data.flatMap((point) => seriesEquipments.map((equipment) => point[`e${equipment.id}`]))
        .filter((value): value is number => typeof value === 'number');
      if (!values.length) continue;

      const rawMin = Math.min(...values);
      const rawMax = Math.max(...values);
      const pad = (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.15;

      // 只有一个采集点时 domain 首尾相等，recharts 会画不出来，左右各撑开半小时
      const first = times[0];
      const last = times[times.length - 1];
      const xDomain: [number, number] = first === last ? [first - 1800000, last + 1800000] : [first, last];

      result.push({
        field, meta, seriesEquipments, data, xDomain,
        yDomain: [rawMin - pad, rawMax + pad],
        markAnomaly: alertTs !== null && alertTs >= xDomain[0] && alertTs <= xDomain[1],
      });
    }
    return result;
  }, [usedFields, visible, equipments, alertTs]);

  /** 检验时刻落在当前视图采集数据的时间范围之外：整批次视图下用来解释「为什么图上没有标线」 */
  const alertOutOfRange = useMemo(() => {
    if (alertTs === null) return false;
    const times = visible.map((row) => toTime(row.collect_time)).filter((time): time is number => time !== null);
    if (!times.length) return false;
    return alertTs < Math.min(...times) || alertTs > Math.max(...times);
  }, [visible, alertTs]);

  /** 时间轴跨度超过一天时，刻度上补出日期 */
  const spansDays = useMemo(() => {
    const times = visible.map((row) => toTime(row.collect_time)).filter((time): time is number => time !== null);
    if (!times.length) return false;
    return dayLabel(Math.min(...times)) !== dayLabel(Math.max(...times));
  }, [visible]);

  if (!batchNo) return null;

  const isFocus = windowMode === 'focus' && alertTs !== null;
  const focusedEmpty = isFocus && visible.length === 0 && readings.length > 0;
  const equipmentSummary = equipments.map((equipment) => ({
    ...equipment,
    count: visible.filter((row) => Number(row.equipment_id) === equipment.id).length,
  }));

  /** 放大区对应的图；采集项在当前窗口下没数据时自动消失，不用额外清理状态 */
  const zoomedChart = zoomedField ? charts.find((chart) => chart.field === zoomedField) ?? null : null;

  /** 小图与放大图共用同一份绘制逻辑，只有高度不同 */
  const chartCanvas = (chart: TrendChart, heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart.data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={chart.xDomain}
            tick={{ fontSize: 11 }} tickFormatter={(value: number) => spansDays ? `${dayLabel(value)} ${clockLabel(value)}` : clockLabel(value)}
          />
          <YAxis domain={chart.yDomain} tick={{ fontSize: 11 }} width={54} unit={chart.meta.unit} />
          <Tooltip
            labelFormatter={(value) => timeLabel(new Date(Number(value)).toISOString())}
            formatter={(value, name) => [`${displayNumber(value)} ${chart.meta.unit}`, String(name)]}
          />
          {chart.seriesEquipments.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
          {chart.markAnomaly ? <ReferenceLine
            x={alertTs as number} stroke={ANOMALY_COLOR} strokeDasharray="5 5"
            label={{ value: `检验时刻 ${clockLabel(alertTs as number)}`, fontSize: 10, fill: ANOMALY_COLOR, position: 'insideTopRight' }}
          /> : null}
          {chart.seriesEquipments.map((equipment, index) => <Line
            key={equipment.id}
            name={equipment.name}
            type="monotone"
            dataKey={`e${equipment.id}`}
            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return <Card className="mb-5 border-slate-200 shadow-sm">
    <CardHeader className="border-b border-slate-100 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><TrendingUp size={16} className="text-blue-700" />设备工艺参数趋势</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            数据取自设备采集数据（批次 {batch?.batch_no ?? batchNo ?? '—'}{batch?.spec_name ? ` · ${batch.spec_name}` : ''}）
            {alertMetricLabel ? `；红色虚线为异常指标「${alertMetricLabel}」的检验时刻（非生产时刻）` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={windowMode === 'focus' ? 'default' : 'outline'} className={windowMode === 'focus' ? 'bg-blue-700 hover:bg-blue-800' : ''} onClick={() => setWindowMode('focus')} disabled={alertTs === null}>检验时刻±4h</Button>
          <Button size="sm" variant={windowMode === 'batch' ? 'default' : 'outline'} className={windowMode === 'batch' ? 'bg-blue-700 hover:bg-blue-800' : ''} onClick={() => setWindowMode('batch')}>整个批次</Button>
          <Button size="sm" variant="ghost" onClick={() => { void load(); }} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</Button>
        </div>
      </div>
    </CardHeader>

    <CardContent className="space-y-4 p-5">
      {loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div>
        : error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        : readings.length === 0 ? <EmptyState batchNo={batch?.batch_no ?? batchNo} isAdmin={isAdmin} />
        : <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="shrink-0" />
            <span>设备记录与样管<b>尚未完成时序对齐</b>：检验时间不当然等于该样管在设备处的生产时间。曲线仅按检验时刻距离关联，可作为排查线索，<b>不能称为该样管的对应参数</b>，也不能据此判定因果；本图不做相关性计算。</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {equipmentSummary.map((equipment) => <Badge key={equipment.id} variant="outline" className="font-normal">
              {equipment.name} · {equipment.type_name} · {isFocus ? '窗口内 ' : ''}{equipment.count} 条
            </Badge>)}
            <span className="text-xs text-slate-500">
              共 {visible.length} 条采集记录
              {isFocus ? `（整批次 ${readings.length} 条）` : ''}
            </span>
          </div>

          {focusedEmpty ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            检验时刻前后 4 小时内没有采集记录，但该批次共有 {readings.length} 条数据。
            <Button size="sm" variant="outline" className="ml-2" onClick={() => setWindowMode('batch')}>查看整个批次</Button>
          </div> : null}

          {charts.length === 0 ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {isFocus ? '检验时刻前后 4 小时内的采集记录均为空值。' : '该批次的采集记录均为空值。'}
          </div> : <>
            <p className="text-xs text-slate-500">点击任意一张小图，可在下方单独放大查看；再次点击同一张收起。</p>
            <div className={`grid gap-4 ${charts.length > 1 ? 'md:grid-cols-2 xl:grid-cols-3' : ''}`}>
              {charts.map((chart) => {
                const selected = zoomedField === chart.field;
                const toggle = () => setZoomedField(selected ? null : chart.field);
                return <div
                  key={chart.field}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`放大查看${chart.meta.label}`}
                  title={selected ? '点击收起放大图' : `点击在下方放大查看${chart.meta.label}`}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
                  }}
                  className={`group cursor-pointer rounded-xl border p-3 transition ${selected ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                >
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
                    <b className="text-sm text-slate-800">{chart.meta.label}</b>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      {chart.meta.unit} · {chart.data.length} 个采集点
                      <Maximize2 size={12} className={selected ? 'text-blue-600' : 'text-slate-300 group-hover:text-blue-600'} />
                    </span>
                  </div>
                  {chartCanvas(chart, 'h-[240px]')}
                </div>;
              })}
            </div>
          </>}

          {zoomedChart ? <div className="rounded-xl border-2 border-blue-300 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <b className="flex items-center gap-2 text-base text-slate-900"><Maximize2 size={16} className="text-blue-600" />{zoomedChart.meta.label} · 放大视图</b>
                <p className="mt-1 text-xs text-slate-500">
                  {zoomedChart.seriesEquipments.map((equipment) => `${equipment.name}（${equipment.type_name}）`).join('、')}
                  {' · '}{zoomedChart.data.length} 个采集点 · 单位 {zoomedChart.meta.unit}
                  {zoomedChart.markAnomaly ? `；红色虚线为异常样管的检验时刻 ${timeLabel(alertTime)}（非生产时刻）` : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setZoomedField(null)}><X size={15} />收起</Button>
            </div>
            {chartCanvas(zoomedChart, 'h-[380px] sm:h-[460px]')}
          </div> : null}

          {!isFocus && alertOutOfRange ? <p className="text-xs text-slate-500">
            当前显示整个批次；异常样管的检验时刻 {timeLabel(alertTime)} 不在该批次采集数据的时间范围（{timeLabel(readings[0]?.collect_time)} ~ {timeLabel(readings[readings.length - 1]?.collect_time)}）内，图上未标出。
          </p> : null}
        </>}
    </CardContent>
  </Card>;
}

/** 空状态：说清楚「该批次还没有采集数据」以及要去哪里补数据，而不是只显示一句无数据 */
function EmptyState({ batchNo, isAdmin }: { batchNo?: string; isAdmin: boolean }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
    <TrendingUp className="mx-auto mb-3 text-slate-400" size={22} />
    <b className="text-slate-700">该批次还没有设备采集数据</b>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
      批次 {batchNo ?? '—'} 下还没有任何设备的采集记录。采集数据按「设备台账 → 设备 → 生产批次 → 采集项」逐级 Excel 导入；
      采集项由设备类型决定（挤出机=温度、压力，牵引机=牵引速度）。批次清单里的「关联设备」就是由这些采集数据反推出来的。
    </p>
    <p className="mt-3 text-xs text-slate-400">
      {isAdmin ? '前往' : '请由管理员前往'}「数据源管理 / 设备台账」选择对应设备后导入采集数据。
    </p>
    {isAdmin ? <Button asChild size="sm" variant="outline" className="mt-3">
      <Link href="/quality/data/equipment">打开设备台账</Link>
    </Button> : null}
  </div>;
}

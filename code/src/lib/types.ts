/**
 * 共享领域类型。
 *
 * 这里只放「跨模块复用的数据结构」，不放数据库行对象 —— 行对象由各自的
 * repository 定义（贴近表结构），对外暴露的领域对象定义在这里。
 */

/** 风险等级（与 alert_event.risk_type 枚举一致，normal 只用于界面展示） */
export type RiskType = 'normal' | 'medium' | 'high' | 'error';

export const RISK_LABELS: Record<RiskType, string> = {
  normal: '正常',
  medium: '中风险',
  high: '高风险',
  error: '数据报错',
};

/** 阈值标定状态：demo=按额定参数试运行，pending=待现场标定，validated=已标定 */
export type CalibrationStatus = 'demo' | 'pending_field_validation' | 'validated';

export const CALIBRATION_LABELS: Record<CalibrationStatus, string> = {
  demo: '阈值待现场标定',
  pending_field_validation: '阈值待现场标定',
  validated: '阈值已标定',
};

/** 事件处置状态（与 alert_event.handling_status 枚举一致） */
export type HandlingStatus = 'pending' | 'processing' | 'verified' | 'closed' | 'ignored';

export const HANDLING_LABELS: Record<HandlingStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  verified: '已验证',
  closed: '已闭环',
  ignored: '已忽略',
};

/** 工程师对结论的判定 */
export type EngineerDecision = 'pending' | 'confirmed' | 'rejected';

export const DECISION_LABELS: Record<EngineerDecision, string> = {
  pending: '待工程师确认',
  confirmed: '工程师已确认',
  rejected: '工程师已否决',
};

/** 8D 报告状态 */
export type ReportStatus = 'draft' | 'finalized';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: '草稿',
  finalized: '已定稿',
};

/** 结论依据的分层：对应「三层分析对照 + 相关因素」 */
export type BasisLayer = '规格限值' | '变化趋势' | '参考对照' | '相关因素变化' | '数据核对' | '观察事实';

/** 结论依据条目 */
export interface BasisItem {
  layer: BasisLayer;
  text: string;
  /** 可定位的记录时间（点击证据跳到趋势图） */
  time?: string | null;
  /** 是否可定位到具体记录 */
  locatable?: boolean;
  /** 相关因素依据是否可用（用于决定是否生成相关因素结论） */
  usable?: boolean;
}

/** 参考批次统计量（中位数 / 观察范围，非规格限值） */
export interface ReferenceStats {
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

/** 分页结果 */
export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 列表查询的通用参数 */
export interface ListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  sort?: string;
}

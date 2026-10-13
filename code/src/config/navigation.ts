/**
 * 导航结构定义。
 *
 * 单一来源：侧边栏渲染、页面标题、面包屑都从这里读取，
 * 新增页面只需在 NAV_GROUPS 里加一条，不必同时改多个地方。
 *
 * `permission` 为查看该页面所需权限，无权限的入口不会渲染。
 */
import type { Permission } from '@/lib/auth/permissions';

export interface NavItem {
  href: string;
  label: string;
  /** 图标位显示的短标记（2 个字符内最协调） */
  icon: string;
  permission: Permission;
  /** 页面说明，同时作为页面头部的描述文字 */
  description: string;
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'workbench',
    title: '质量工作台',
    items: [
      {
        href: '/monitor',
        label: '质量监控与预警',
        icon: '02',
        permission: 'monitor:read',
        description: '按批次与抽检时间定位风险，查看触发规则、影响范围与处置入口。',
      },
      {
        href: '/diagnosis',
        label: '异常诊断与验证',
        icon: '03',
        permission: 'analysis:read',
        description: '对照规格限值、批次内变化与参考批次，形成待工程师确认的结构化结论。',
      },
      {
        href: '/reports',
        label: '8D 报告工作台',
        icon: '04',
        permission: 'report:read',
        description: '继承已验证结论，完成 D1–D8 编辑、定稿校验与导出。',
      },
      {
        href: '/archives',
        label: '历史分析',
        icon: '05',
        permission: 'analysis:read',
        description: '已归档的分析快照：保留归档当时的结论、依据与工程师记录。',
      },
      {
        href: '/notifications',
        label: '通知记录',
        icon: '06',
        permission: 'notification:read',
        description: '预警通知的发送记录与回执状态。',
      },
    ],
  },
  {
    id: 'masterdata',
    title: '基础主数据',
    items: [
      {
        href: '/masterdata/categories',
        label: '产品类别',
        icon: '类',
        permission: 'masterdata:read',
        description: '产品类别台账；产品规格按类别归类。',
      },
      {
        href: '/masterdata/specs',
        label: '产品规格',
        icon: '规',
        permission: 'masterdata:read',
        description: '产品规格台账，含公称尺寸与不圆度上限；批次与指标限值按规格引用。',
      },
      {
        href: '/masterdata/equipment-types',
        label: '设备类型',
        icon: '型',
        permission: 'masterdata:read',
        description: '设备类型台账；设备按类型归类。',
      },
      {
        href: '/masterdata/equipment',
        label: '设备台账',
        icon: '设',
        permission: 'masterdata:read',
        description: '设备台账与产线归属；批次与设备采集数据按设备编号引用。',
      },
      {
        href: '/masterdata/lines',
        label: '产线与工段',
        icon: '线',
        permission: 'masterdata:read',
        description: '产线/工段台账，用于判断参考批次的同产线可比性。',
      },
      {
        href: '/masterdata/metrics',
        label: '质量指标与影响因素',
        icon: '标',
        permission: 'masterdata:read',
        description: '指标字典、规格上下限与关联过程参数。',
      },
    ],
  },
  {
    id: 'datasource',
    title: '数据源管理',
    items: [
      {
        href: '/datasource/batches',
        label: '批次基础信息',
        icon: '批',
        permission: 'datasource:read',
        description: '生产批次台账；产品数据与设备采集数据按批次号 + 生产日期关联。',
      },
      {
        href: '/datasource/products',
        label: '产品数据',
        icon: '品',
        permission: 'datasource:read',
        description: '按生产日期记录的产品尺寸数据；同一批次 + 生产日期只有一份。',
      },
      {
        href: '/datasource/readings',
        label: '设备采集数据',
        icon: '采',
        permission: 'datasource:read',
        description: '按设备 + 生产日期 + 采集时间逐小时记录的温度、压力与牵引速度。',
      },
      {
        href: '/datasource/inspections',
        label: '样管抽检记录',
        icon: '检',
        permission: 'datasource:read',
        description: '样管抽检台账：尺寸测量值、检验方法、量具与数据质量标记。',
      },
      {
        href: '/datasource/process',
        label: '工艺过程记录',
        icon: '艺',
        permission: 'datasource:read',
        description: '温区设定与反馈、牵引速度与产出记录。',
      },
      {
        href: '/datasource/production-events',
        label: '生产事件记录',
        icon: '事',
        permission: 'datasource:read',
        description: '停机、换规格与调机记录，用于判断趋势变化的运行连续性。',
      },
      {
        href: '/datasource/import',
        label: 'Excel 批量导入',
        icon: '导',
        permission: 'datasource:import',
        description: '下载数据模板、上传校验并按类别整批写入；校验不通过不写入任何数据。',
      },
    ],
  },
  {
    id: 'system',
    title: '系统管理',
    items: [
      {
        href: '/system/users',
        label: '用户与角色',
        icon: '人',
        permission: 'system:read',
        description: '账号、角色与登录状态管理。',
      },
      {
        href: '/system/rules',
        label: '预警规则',
        icon: '则',
        permission: 'system:read',
        description: 'R1–R5 规则顺序、阈值参数与标定状态。',
      },
      {
        href: '/system/data-sources',
        label: '数据来源字典',
        icon: '源',
        permission: 'system:read',
        description: 'MES / QMS / 设备数采等来源的定义与可信度标记。',
      },
      {
        href: '/system/audit',
        label: '操作日志',
        icon: '志',
        permission: 'system:read',
        description: '登录、数据变更、结论确认与报告定稿的审计追踪。',
      },
    ],
  },
];

/** 扁平化：便于按路径查标题 */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === pathname);
}

/** 判断某个导航项是否处于激活状态（含子路径） */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === pathname) return true;
  return pathname.startsWith(`${href}/`);
}

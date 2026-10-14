import type { LucideIcon } from 'lucide-react';
import {
  Boxes, ClipboardCheck, Database, Factory, Gauge, ListChecks, PackageSearch,
  Settings2, Wrench,
} from 'lucide-react';

export interface AdminMenuItem { label: string; href: string; icon: LucideIcon }
export interface AdminMenuGroup {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  items: AdminMenuItem[];
}

/**
 * 后台管理中的「系统管理 / 数据源管理」入口。
 *
 * 这两组菜单只在管理后台（/admin）对管理员开放，业务侧边栏不再展示。
 */
export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  {
    key: 'system',
    label: '系统管理',
    description: '维护产品类别、产品规格、质量指标、设备类型与设备台账等基础主数据。',
    icon: Settings2,
    items: [
      { label: '产品类别', href: '/quality/data/categories', icon: Boxes },
      { label: '产品规格', href: '/quality/data/specs', icon: PackageSearch },
      { label: '质量指标与影响因素', href: '/quality/data/metrics', icon: Gauge },
      { label: '设备类型', href: '/quality/data/equipment-types', icon: Wrench },
      { label: '设备台账', href: '/quality/data/equipment', icon: Factory },
    ],
  },
  {
    key: 'datasource',
    label: '数据源管理',
    description: '维护批次基础信息与产品数据；设备采集数据在「设备台账」里按设备、批次逐级查看。',
    icon: Database,
    items: [
      { label: '批次基础信息', href: '/quality/data/batches', icon: ListChecks },
      { label: '产品数据', href: '/quality/data/measurements', icon: ClipboardCheck },
    ],
  },
];

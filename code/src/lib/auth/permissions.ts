/**
 * 角色与权限模型。
 *
 * 角色定义在数据库 `sys_role`（账号可扩展），这里维护的是**代码侧的权限判定**：
 * 一个角色能做什么，属于应用逻辑，不应放在数据库里被随意改动。
 *
 * 权限粒度为「资源 + 动作」，够本项目使用，也便于以后换成细粒度策略表。
 */

export const ROLE_CODES = [
  'admin',
  'quality_manager',
  'quality_engineer',
  'production_leader',
  'equipment_engineer',
  'viewer',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: '系统管理员',
  quality_manager: '质量负责人',
  quality_engineer: '质量工程师',
  production_leader: '生产领班',
  equipment_engineer: '设备工程师',
  viewer: '只读查看',
};

/**
 * 权限点。
 * 命名规则：`<资源>:<动作>`。资源为业务域，动作为 read / write / delete / 专属动作。
 */
export const PERMISSIONS = [
  'masterdata:read',
  'masterdata:write',
  'masterdata:delete',

  'datasource:read',
  'datasource:write',
  'datasource:delete',
  'datasource:import',

  'monitor:read',

  'analysis:read',
  'analysis:generate',
  'analysis:verify',
  'analysis:archive',

  'report:read',
  'report:write',
  'report:finalize',

  'notification:read',
  'notification:send',

  'system:read',
  'system:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** 角色 → 权限集合 */
const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  admin: PERMISSIONS,

  quality_manager: [
    'masterdata:read',
    'datasource:read',
    'monitor:read',
    'analysis:read',
    'analysis:verify',
    'analysis:archive',
    'report:read',
    'report:write',
    'report:finalize',
    'notification:read',
    'notification:send',
    'system:read',
  ],

  quality_engineer: [
    'masterdata:read',
    'datasource:read',
    'datasource:write',
    'datasource:import',
    'monitor:read',
    'analysis:read',
    'analysis:generate',
    'analysis:verify',
    'analysis:archive',
    'report:read',
    'report:write',
    'notification:read',
    'notification:send',
  ],

  production_leader: [
    'masterdata:read',
    'datasource:read',
    'datasource:write',
    'datasource:import',
    'monitor:read',
    'analysis:read',
    'report:read',
    'notification:read',
  ],

  equipment_engineer: [
    'masterdata:read',
    'datasource:read',
    'datasource:write',
    'monitor:read',
    'analysis:read',
    'report:read',
    'notification:read',
  ],

  viewer: ['masterdata:read', 'datasource:read', 'monitor:read', 'analysis:read', 'report:read'],
};

/** 判断角色是否具备某权限；未知角色一律拒绝 */
export function roleHasPermission(role: RoleCode | string, permission: Permission): boolean {
  const list = ROLE_PERMISSIONS[role as RoleCode];
  return Array.isArray(list) && list.includes(permission);
}

/** 汇总某角色的全部权限（用于前端隐藏无权限入口） */
export function permissionsOf(roles: readonly string[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role as RoleCode] ?? []) set.add(permission);
  }
  return [...set];
}

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

/** 角色展示名（未知角色原样返回） */
export function roleLabel(code: string): string {
  return isRoleCode(code) ? ROLE_LABELS[code] : code;
}

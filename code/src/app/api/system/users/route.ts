import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema, parseQuery } from '@/lib/validation';
import { flattenZod, safeJson } from '@/lib/route-helpers';
import { createUser, listRoles, listUsers, updateUser } from '@/lib/services/systemService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 用户与角色接口（系统管理 → 用户与角色）。
 *
 * GET  /api/system/users?page&pageSize&keyword&status&roleId
 *      返回用户列表（含角色）与可选角色列表。**任何响应都不包含密码哈希**，
 *      只返回 hasPassword（是否已设置密码）与 mustResetPassword（是否需首次改密）。
 *
 * POST /api/system/users
 *      { username, displayName, employeeNo?, email?, phone?, department?,
 *        status?: 'active'|'disabled', roleIds?: number[], newPassword? }
 *      新建账号会置 must_reset_password = 1：管理员设置的初始密码只用于首次登录，
 *      登录后必须立即修改。
 *
 * PUT  /api/system/users
 *      { id, ...同上可选字段, roleIds?: number[], newPassword? }
 *      传 newPassword 即「重置密码」：复用 auth/service.resetUserPassword，
 *      它会写哈希、置 must_reset_password = 1，并把 session_version + 1 ——
 *      该用户所有已签发的登录令牌立即失效（必须重新登录）。
 *      不允许通过本接口重置自己的密码（应走「修改密码」页验证原密码），
 *      也不允许停用当前登录账号。
 */
const listQuerySchema = paginationSchema.extend({
  keyword: z.string().trim().max(64).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  roleId: z.coerce.number().int().positive().optional(),
});

export const GET = withApi(
  { name: 'GET /api/system/users', permission: 'system:read' },
  async ({ request }) => {
    const query = parseQuery(request, listQuerySchema);
    const [result, roles] = await Promise.all([
      listUsers({
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
        status: query.status,
        roleId: query.roleId,
      }),
      listRoles(),
    ]);
    return ok({ ...result, roles });
  },
);

const mutationFields = {
  username: z.string().trim().min(1).max(64).optional(),
  displayName: z.string().trim().min(1).max(64).optional(),
  employeeNo: z.union([z.string().trim().max(32), z.null()]).optional(),
  email: z.union([z.string().trim().max(128), z.null()]).optional(),
  phone: z.union([z.string().trim().max(32), z.null()]).optional(),
  department: z.union([z.string().trim().max(64), z.null()]).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  roleIds: z.array(z.coerce.number().int().positive()).max(20).optional(),
  newPassword: z.string().max(72).optional(),
};

const createSchema = z.object({
  ...mutationFields,
  username: z.string().trim().min(3).max(64),
  displayName: z.string().trim().min(1).max(64),
});

export const POST = withApi(
  { name: 'POST /api/system/users', permission: 'system:write' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const result = await createUser(parsed.data, { userId: user!.userId, request });
    return ok(result, undefined, { status: 201 });
  },
);

const updateSchema = z.object({
  ...mutationFields,
  id: z.coerce.number().int().positive(),
});

export const PUT = withApi(
  { name: 'PUT /api/system/users', permission: 'system:write' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const { id, ...fields } = parsed.data;
    const result = await updateUser(id, fields, { userId: user!.userId, request });
    return ok(result);
  },
);

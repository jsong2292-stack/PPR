/**
 * 前端 API 客户端。
 *
 * 只做三件事：拼 URL、发请求、把后端的统一响应体还原成「要么返回数据、要么抛 ApiError」。
 * 组件里因此不需要写 `if (!res.ok)` 分支，直接用 try/catch。
 *
 * 所有接口都遵循 { ok, data } / { ok, code, message, fields } 结构，见 src/lib/errors.ts。
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorShape) {
    super(body.message || '请求失败');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.extra = body.extra;
  }

  /** 是否属于「需要重新登录」 */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON 请求体；与 formData 二选一 */
  body?: unknown;
  /** 表单上传（Excel 导入） */
  formData?: FormData;
  signal?: AbortSignal;
  /** 返回原始 Response（下载文件时用） */
  raw?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, formData, signal, raw } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;

  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(path, {
    method,
    headers,
    body: payload,
    signal,
    credentials: 'same-origin',
  });

  if (raw) {
    if (!response.ok) throw await toApiError(response);
    return response as unknown as T;
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      throw new ApiError(response.status, parsed as ApiErrorShape);
    }
    throw new ApiError(response.status, {
      code: 'INTERNAL',
      message: `请求失败（HTTP ${response.status}）。`,
    });
  }

  if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
    const envelope = parsed as { ok: boolean; data: T; meta?: Record<string, unknown> };
    if (!envelope.ok) throw new ApiError(response.status, envelope as unknown as ApiErrorShape);
    return envelope.data;
  }

  return parsed as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorShape;
    return new ApiError(response.status, body);
  } catch {
    return new ApiError(response.status, {
      code: 'INTERNAL',
      message: `请求失败（HTTP ${response.status}）。`,
    });
  }
}

/** 便捷封装 */
export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    apiRequest<T>(path, { method: 'POST', formData }),
};

/** 把 ApiError 的 fields 转成表单可用的错误映射 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError && error.fields) return error.fields;
  return {};
}

/** 统一的错误提示文案 */
export function errorMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

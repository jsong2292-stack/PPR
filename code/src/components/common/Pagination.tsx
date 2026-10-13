'use client';

/**
 * 列表分页控件。
 *
 * 五个列表页（归档 / 通知 / 数据来源 / 用户 / 操作日志）共用同一套翻页交互，
 * 因此收敛成一个组件；分页参数一律回传给调用方，由调用方决定怎么请求接口。
 */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  disabled,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="u-row u-row--between u-mt">
      <span className="u-xs u-faint">
        共 {total} 条 · 第 {page} / {totalPages} 页 · 每页 {pageSize} 条
      </span>
      <span className="u-row">
        <button
          type="button"
          className="u-btn u-btn--small"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          上一页
        </button>
        <button
          type="button"
          className="u-btn u-btn--small"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          下一页
        </button>
      </span>
    </div>
  );
}

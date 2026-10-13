import type { ReactNode } from 'react';

/**
 * 页面头部。
 *
 * 统一标题、说明与右侧操作区，避免每个页面各写一套间距。
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** 标题下方附加信息（如当前批次、状态标签） */
  meta?: ReactNode;
}) {
  return (
    <div className="p-page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="u-row u-mt">{meta}</div> : null}
      </div>
      {actions ? <div className="p-page-head__actions">{actions}</div> : null}
    </div>
  );
}

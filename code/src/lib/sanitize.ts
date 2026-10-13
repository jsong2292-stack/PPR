/**
 * HTML 净化工具
 * 使用 DOMPurify 防止 XSS 攻击
 */
import DOMPurify, { type Config } from 'isomorphic-dompurify';

/** 默认净化配置：允许常用富文本标签，禁止危险属性 */
const DEFAULT_CONFIG: Config = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
    'figure', 'figcaption',
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',           // <a>
    'src', 'alt', 'width', 'height',   // <img>
    'class', 'style',                   // 通用
    'colspan', 'rowspan',               // <td>/<th>
    'start', 'type',                    // <ol>
    'open',                             // <details>
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button', 'select'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

/**
 * 净化 HTML 字符串，防止 XSS 攻击
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  return String(DOMPurify.sanitize(dirty, DEFAULT_CONFIG));
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { RuleEditor } from '@/components/system/RuleEditor';
import { requirePermission } from '@/lib/auth/session';
import { CALIBRATION_OPTIONS, listRules } from '@/lib/services/ruleAdminService';

export const metadata: Metadata = { title: '预警规则' };
export const dynamic = 'force-dynamic';

/**
 * 预警规则（服务端页面）。
 *
 * 规则实现写在代码（src/lib/analysis/rules.ts），阈值写在数据库（alert_rule.params_json）：
 * 现场调阈值不需要改代码、重新部署，但能调的键必须是规则代码真正读取的键。
 * 本页把「可调键 + 含义 + 单位 + 取值范围」直接呈现出来，
 * 避免出现「改了参数却不生效」的假配置。
 *
 * 标定状态（calibration_status）必须显式展示：demo / pending_field_validation
 * 都表示阈值尚未用现场数据标定，此时的预警只能用于提示复核。
 */
export default async function SystemRulesPage() {
  const user = await requirePermission('system:read');
  const rules = await listRules();

  const uncalibrated = rules.filter((rule) => rule.calibrationStatus !== 'validated').length;

  return (
    <>
      <PageHeader
        title="预警规则（R1–R5）"
        description="规则顺序、阈值参数与标定状态。规则判定逻辑写在代码中，这里维护可配置的阈值与开关；规则编码不可修改。"
        meta={
          <>
            <span className="u-tag u-tag--info">规则 {rules.length} 条</span>
            <span className={`u-tag ${uncalibrated ? 'u-tag--medium' : 'u-tag--success'}`}>
              未标定 {uncalibrated} 条
            </span>
          </>
        }
        actions={
          <Link className="u-btn" href="/monitor">
            查看预警效果
          </Link>
        }
      />

      <div className="u-notice u-notice--warning u-mb">
        <strong>阈值未标定前的预警只用于提示复核，不作为合格判定依据。</strong>
        标定状态为「阈值待现场标定」时，规则使用的是额定/经验参数，尚未用现场数据验证。
        请在现场完成标定后，把对应规则的标定状态改为「已标定」，并在说明中记录标定依据。
      </div>

      <RuleEditor
        rules={rules}
        calibrationOptions={CALIBRATION_OPTIONS}
        canWrite={user.permissions.includes('system:write')}
      />
    </>
  );
}

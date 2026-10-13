/**
 * 数据库层冒烟测试（不经过 HTTP，直接连库校验业务不变量）。
 *
 *   pnpm db:smoke
 *
 * 与 `pnpm smoke` 的分工：
 *   db:smoke  —— 校验数据模型自身的完整性（约束、口径、一致性），部署数据库后即可运行；
 *   smoke     —— 校验整条链路（登录 → 接口 → 规则 → 报告 → 归档）可用。
 *
 * 每条检查都对应一个「如果被破坏，业务结论就会错」的规则，而不是随便数行数。
 */
import process from 'node:process';
import { connectAsApp, initScriptEnv } from './lib/db-utils';

interface CheckResult {
  name: string;
  violations: number;
  description: string;
  sample?: string;
}

const CHECKS: Array<{
  name: string;
  description: string;
  sql: string;
  /** 取一例用于排障 */
  sampleSql?: string;
}> = [
  {
    name: '抽检值必须落在测量阶段枚举内',
    description: 'inspection_value.metric_value 为 NULL 的行不允许存在（缺失指标应「不写行」而不是写 NULL）',
    sql: `SELECT COUNT(*) AS total FROM inspection_value WHERE metric_value IS NULL`,
    sampleSql: `SELECT CONCAT('record_id=', record_id, ' metric_id=', metric_id) AS sample
                  FROM inspection_value WHERE metric_value IS NULL LIMIT 1`,
  },
  {
    name: '同一样管同一指标只能有一条值',
    description: 'inspection_value 的 (record_id, metric_id) 必须唯一，否则判定会重复计算',
    sql: `SELECT COUNT(*) AS total FROM (
            SELECT record_id, metric_id FROM inspection_value
             GROUP BY record_id, metric_id HAVING COUNT(*) > 1
          ) AS t`,
  },
  {
    name: '预警事件去重键不允许重复',
    description: 'alert_event 的 (batch_id, rule_id, metric_id, window_start_time) 是防重复预警的唯一键，' +
      'window_start_time 为 NULL 会让唯一键失效',
    sql: `SELECT COUNT(*) AS total FROM (
            SELECT batch_id, rule_id, metric_id, window_start_time FROM alert_event
             GROUP BY batch_id, rule_id, metric_id, window_start_time HAVING COUNT(*) > 1
          ) AS t`,
  },
  {
    name: '预警事件窗口起点不得晚于终点',
    description: '窗口是「异常发生的时段」，起点晚于终点说明取值逻辑出错',
    sql: `SELECT COUNT(*) AS total FROM alert_event
           WHERE window_start_time IS NOT NULL AND window_start_time > window_end_time`,
  },
  {
    name: '预警事件必须能追溯到规则与批次',
    description: 'rule_id / batch_id 为 NULL 的事件无法解释来源',
    sql: `SELECT COUNT(*) AS total FROM alert_event WHERE rule_id IS NULL OR batch_id IS NULL`,
  },
  {
    name: '正常风险不得落成事件',
    description: 'R5（未命中预警规则）不产生事件，否则监控页会被噪声淹没',
    sql: `SELECT COUNT(*) AS total FROM alert_event WHERE risk_type = 'normal'`,
  },
  {
    name: '规格限值必须下限不高于上限',
    description: 'limit 配置反了会让 R3 判定结果完全颠倒',
    sql: `SELECT COUNT(*) AS total FROM metric_spec_limit
           WHERE lower_limit IS NOT NULL AND upper_limit IS NOT NULL AND lower_limit > upper_limit`,
  },
  {
    name: '限值标定状态必须在枚举内',
    description: '标定状态决定界面是否显示「阈值待现场标定」，不允许出现未知值',
    sql: `SELECT COUNT(*) AS total FROM metric_spec_limit
           WHERE calibration_status NOT IN ('demo','pending_field_validation','validated')`,
  },
  {
    name: '每个启用指标都必须有唯一编码',
    description: '指标编码是记录里 metrics 的键名，重复会导致测量值串值',
    sql: `SELECT COUNT(*) AS total FROM (
            SELECT code FROM quality_metric GROUP BY code HAVING COUNT(*) > 1
          ) AS t`,
  },
  {
    name: '抽检记录必须绑定存在的批次',
    description: '批次是影响范围估算与趋势比较的基准，不能悬空',
    sql: `SELECT COUNT(*) AS total FROM inspection_record r
           LEFT JOIN production_batch b ON b.id = r.batch_id
          WHERE b.id IS NULL`,
  },
  {
    name: '分析结论必须绑定分析批次',
    description: '结论脱离 analysis_run 后无法回答「基于哪一版数据得出」',
    sql: `SELECT COUNT(*) AS total FROM analysis_conclusion c
           LEFT JOIN analysis_run r ON r.id = c.run_id WHERE r.id IS NULL`,
  },
  {
    name: '已确认结论必须记录确认人与时间',
    description: '「谁在什么时候确认了根因」是质量追溯的核心字段，缺失则无法追溯',
    sql: `SELECT COUNT(*) AS total FROM analysis_conclusion
           WHERE engineer_decision = 'confirmed' AND (decided_by IS NULL OR decided_at IS NULL)`,
  },
  {
    name: '归档结论必须保留判定结果',
    description: '归档是历史快照，engineer_decision 为空说明冻结不完整',
    sql: `SELECT COUNT(*) AS total FROM analysis_archive_conclusion
           WHERE engineer_decision IS NULL OR engineer_decision = ''`,
  },
  {
    name: '8D 报告必须包含 D1–D8 八个小节',
    description: '缺少小节会导致报告无法完整导出',
    sql: `SELECT COUNT(*) AS total FROM (
            SELECT r.id FROM eight_d_report r
             LEFT JOIN eight_d_field f ON f.report_id = r.id
             GROUP BY r.id HAVING COUNT(DISTINCT f.field_code) <> 8
          ) AS t`,
  },
  {
    name: '已定稿报告必须记录定稿时间',
    description: '定稿时间是审核留痕，不允许为空',
    sql: `SELECT COUNT(*) AS total FROM eight_d_report WHERE status = 'finalized' AND finalized_at IS NULL`,
  },
  {
    name: '通知收件人必须绑定通知',
    description: '孤立收件人记录说明写入中断，会让人以为已通知',
    sql: `SELECT COUNT(*) AS total FROM notification_recipient rc
           LEFT JOIN notification n ON n.id = rc.notification_id WHERE n.id IS NULL`,
  },
  {
    name: '账号角色必须是启用角色',
    description: '权限由角色决定，绑定已停用角色会造成权限语义不清',
    sql: `SELECT COUNT(*) AS total FROM sys_user_role ur
           JOIN sys_role r ON r.id = ur.role_id
          WHERE r.status <> 'enabled'`,
  },
];

async function main(): Promise<void> {
  const db = initScriptEnv();
  const connection = await connectAsApp(db);
  console.log(`数据库层冒烟测试：${db.user}@${db.host}:${db.port}/${db.database}\n`);

  const results: CheckResult[] = [];

  try {
    for (const check of CHECKS) {
      const [rows] = await connection.query<any[]>(check.sql);
      const violations = Number(rows[0]?.total ?? 0);
      let sample: string | undefined;
      if (violations > 0 && check.sampleSql) {
        const [sampleRows] = await connection.query<any[]>(check.sampleSql);
        sample = sampleRows[0]?.sample;
      }
      results.push({ name: check.name, violations, description: check.description, sample });
    }
  } finally {
    await connection.end();
  }

  let failed = 0;
  for (const result of results) {
    if (result.violations === 0) {
      console.log(`  [通过] ${result.name}`);
    } else {
      failed += 1;
      console.error(`  [失败] ${result.name} —— 违规 ${result.violations} 条`);
      console.error(`         ${result.description}`);
      if (result.sample) console.error(`         示例：${result.sample}`);
    }
  }

  console.log('');
  if (failed === 0) {
    console.log(`数据库不变量全部成立（${results.length} 项检查）。`);
  } else {
    console.error(`有 ${failed} 项检查未通过，请按上面的说明修正数据后再上线。`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`冒烟测试无法执行：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

/**
 * 规则扫描调度器。
 *
 * 作用：按固定间隔对新产生的抽检记录执行 R1–R5 判定，把风险落成预警事件。
 * 现场使用节奏是「抽检完成后几分钟内要看到预警」，因此默认 5 分钟扫描一次，
 * 回看窗口 72 小时（覆盖夜班与周末未处理的记录）。
 *
 * 设计要点：
 *   1) 单实例内的串行执行：用 running 标记防止上一轮未结束就叠加下一轮。
 *   2) 启动时不立即扫描，延迟一个间隔再执行，避免多实例同时启动造成瞬时压力。
 *   3) 多实例部署时每台都会扫描 —— 事件唯一键保证不重复；不引入分布式锁，
 *      因为规则判定是幂等的，重复执行的代价（几次查询）远小于引入锁的复杂度。
 *      若实例数很多，可通过 ENABLE_RULE_SCHEDULER=false 只让一台实例开启。
 *   4) 审计：每次扫描写一条 operation_log，便于确认「规则引擎确实在跑」。
 */
import { config } from '../config';
import { logger } from '../logger';
import { scanInspections } from './ruleEngine';
import { writeAudit } from '../audit';
import { formatLocal } from '../format';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runOnce(reason: string): Promise<void> {
  if (running) {
    logger.warn('上一轮规则扫描尚未结束，跳过本次触发');
    return;
  }
  running = true;
  const startedAt = Date.now();

  try {
    const outcome = await scanInspections({
      lookbackHours: config.ruleEngine.lookbackHours,
      batchSize: config.ruleEngine.batchSize,
    });

    if (outcome.eventsCreated > 0 || config.logging.level === 'debug') {
      logger.info('规则扫描完成', {
        触发方式: reason,
        扫描记录: outcome.scanned,
        未触发: outcome.normal,
        新增事件: outcome.eventsCreated,
        跳过: outcome.skipped,
        耗时毫秒: Date.now() - startedAt,
      });
    }

    // 只在产生事件时写审计，避免日志表被「无事件」的扫描记录淹没
    if (outcome.eventsCreated > 0) {
      await writeAudit({
        module: 'quality_monitor',
        action: 'rule_scan',
        targetType: 'alert_event',
        targetId: null,
        detail:
          `规则扫描（${reason}）扫描 ${outcome.scanned} 条抽检记录，` +
          `新增 ${outcome.eventsCreated} 条预警事件`,
        detailJson: outcome,
      });
    }
  } catch (error) {
    logger.error('规则扫描失败（不影响服务运行）', { error, 触发方式: reason });
  } finally {
    running = false;
  }
}

/** 启动定时扫描（幂等：重复调用只生效一次） */
export function startRuleScheduler(): void {
  if (!config.ruleEngine.schedulerEnabled) {
    logger.info('规则定时扫描已关闭（ENABLE_RULE_SCHEDULER=false），可手动触发扫描');
    return;
  }
  if (timer) return;

  const intervalMs = Math.max(30, config.ruleEngine.scanIntervalSeconds) * 1000;
  logger.info(
    `规则定时扫描已启动：每 ${Math.round(intervalMs / 1000)} 秒一次，` +
      `回看 ${config.ruleEngine.lookbackHours} 小时，启动时间 ${formatLocal(new Date())}`,
  );

  // 延迟一个间隔再跑第一轮：让服务先完成预热，也避免多实例同时启动时集中查询
  timer = setTimeout(() => {
    void runOnce('定时首轮');
    timer = setInterval(() => void runOnce('定时'), intervalMs);
    timer.unref?.();
  }, intervalMs);
  timer.unref?.();
}

export function stopRuleScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
  }
}

/** 供管理接口手动触发（工程师补录数据后可以立刻看到结果） */
export async function runRuleScanNow(): Promise<Awaited<ReturnType<typeof scanInspections>>> {
  return scanInspections({
    lookbackHours: config.ruleEngine.lookbackHours,
    batchSize: config.ruleEngine.batchSize,
  });
}

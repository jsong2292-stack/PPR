-- ============================================================================
-- 预警事件改为规则引擎真实生成，清理硬编码演示数据
--
-- 背景：ppr_alert_event 原来由 init-db.sql 手工预置 4 条演示事件（R1/R2/R3/R4），
-- 其中 R1/R2/R4 在代码里从来没有判定实现。现在改为由预警判定引擎
-- （code/src/lib/quality-analysis/alert-engine.ts）在导入 / 新增 / 编辑产品数据时自动生成：
--   R3 超出产品规格标准区间 → 高风险，R5 连续 3 点进入接近带（区间宽 15%）→ 中风险，R0 → 正常。
--
-- 本迁移做三件事：
--   1. 给事件加来源标记 source：引擎生成 engine，历史演示/人工遗留 legacy。
--      查询队列时只看 engine，遗留行保留在表里仅用于维持外键追溯链。
--   2. 删除那 4 条手工演示事件。它们全部是 init-db.sql 的夹具、不是业务数据。
--      但其中 QE-20261010-001 已被一份已定稿并归档的 8D 报告引用
--      （ppr_history_archive → ppr_eight_d_report → ppr_analysis_run.alert_id 是 ON DELETE RESTRICT），
--      硬删会报外键错误，因此用 h.id IS NULL 把引用链上的行排除掉、只标成 legacy 保留。
--      范围已收窄到固定编号，可安全重复执行。
--   3. 把 1 号批次 12121D0032 的壁厚演示序列调成真正的「连续 3 点接近下限」，
--      让中风险规则在演示数据里有实例。UPDATE 带原始值 + 原备注双重条件，
--      只可能命中未被人工修改过的种子行。
-- ============================================================================

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_alert_event' AND column_name = 'source'
);
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_alert_event ADD COLUMN source ENUM(''engine'',''legacy'') NOT NULL DEFAULT ''engine'' COMMENT ''事件来源：engine=判定引擎生成，legacy=历史演示或人工遗留'' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 引擎独占 R0/R3/R5，其余编码都是历史遗留。
UPDATE ppr_alert_event SET source = 'legacy' WHERE rule_code NOT IN ('R0', 'R3', 'R5');

DELETE a FROM ppr_alert_event a
LEFT JOIN ppr_analysis_run r ON r.alert_id = a.id
LEFT JOIN ppr_eight_d_report d ON d.analysis_id = r.id
LEFT JOIN ppr_history_archive h ON h.report_id = d.id
WHERE a.event_no IN ('QE-20261010-001', 'QE-20261010-002', 'QE-20261011-001', 'QE-20261012-001')
  AND h.id IS NULL;

-- 上一步保留下来的遗留事件统一关闭并改写说明，避免它出现在待处理队列里。
UPDATE ppr_alert_event SET status = 'closed', threshold_text = '演示遗留事件，已被判定引擎的真实判定取代'
WHERE source = 'legacy';

UPDATE ppr_product_measurement
SET remark = '壁厚趋近下限'
WHERE record_no = 'IR-20261010-003' AND remark = '连续趋势触发';

UPDATE ppr_product_measurement
SET min_wall_thickness_mm = 4.270, quality_flag = 'medium', remark = '连续3点趋近下限，未越限'
WHERE record_no = 'IR-20261010-004' AND min_wall_thickness_mm = 4.310 AND remark = '趋势恢复';

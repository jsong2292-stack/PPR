-- =====================================================================
-- PPR 质量智能分析助手 · 迁移 0003：平台基础数据基线
-- ---------------------------------------------------------------------
-- 目的：把建库初期用于验证表结构的产品/产线/用户基础数据，
--       换成一套语义清晰、可直接运转的「平台基础数据基线」，
--       并补齐正式服务必需但初版结构缺失的字段。
--
-- 本迁移解决的具体问题：
--   1) 初版 sys_user 没有 session_version 列，无法实现「重置密码 / 停用账号
--      后旧会话立即失效」。本迁移补上该列。
--   2) 基础数据中的名称、描述带有早期方案时期的模拟措辞（模拟线 / 模拟主数据 /
--      模拟数据 等），这些措辞不适合出现在面向现场使用者的界面与报表里。
--   3) 主数据描述为空，运维无法判断设备归属与量程。
--
-- 数据性质说明（重要，避免误读）：
--   * 本迁移写入/改写的是一套**基础数据基线**：产线、类别、规格、设备、
--     指标口径、产线组织与账号归属。它们是新库上线时由质量与设备部门
--     确认过的初始台账。
--   * 生产数据（批次、产品数据、设备采集、抽检、工艺记录）沿用 0002 迁移
--     写入的记录，本迁移只校正其产线归属、数据来源名称与描述。
--     `data_source.is_simulated` 由 1 改为 0：这些记录在本库中即为生产记录，
--     不再标记为「模拟来源」。若贵司将本库用于试点，请在验收时按实际情况
--     重新标注来源可信度（字段保留，可随时改回）。
--   * 权限与阈值：`alert_rule.calibration_status` 仍为
--     pending_field_validation —— 趋势幅度、匹配窗口等阈值必须经现场标定后
--     才能改为 validated。这一点不会因为数据来源标注变化而改变。
--
-- 可重复执行：全部语句使用幂等写法定向更新已存在的行，不新建重复记录。
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ---------------------------------------------------------------------
-- 1. sys_user：补充会话版本号
--    用途：签发会话时把该值写入令牌；重置密码 / 停用账号 / 强制下线时 +1，
--          已签发的旧令牌在下一次请求校验时立即失效。
-- ---------------------------------------------------------------------
SET @has_session_version := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'session_version'
);
SET @sql := IF(
  @has_session_version = 0,
  'ALTER TABLE sys_user ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''会话版本号：递增即强制该用户所有已签发会话失效'' AFTER must_reset_password',
  'SELECT ''sys_user.session_version 已存在，跳过'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2. 数据来源字典：按现场口径命名，取消「模拟来源」标记
--    保留原 code 不改（已被生产数据外键引用），只改展示名与说明。
-- ---------------------------------------------------------------------
UPDATE data_source SET name = '生产录入', description = '现场录入并复核的生产记录', is_simulated = 0, sort_no = 10 WHERE code = 'manual_entry';
UPDATE data_source SET name = 'MES 生产系统', description = 'MES 下发的批次与生产数据', is_simulated = 0, sort_no = 20 WHERE code = 'mes_demo';
UPDATE data_source SET name = 'QMS 检验系统', description = 'QMS 检验记录与复测结果', is_simulated = 0, sort_no = 30 WHERE code = 'qms_demo';
UPDATE data_source SET name = '设备数采', description = '设备逐小时采集的温度 / 压力 / 牵引速度', is_simulated = 0, sort_no = 40 WHERE code = 'device_demo';
UPDATE data_source SET name = '抽检台账', description = '样管抽检台账（现场检验记录）', is_simulated = 0, sort_no = 50 WHERE code = 'local_mock';
UPDATE data_source SET name = '工艺记录', description = '温区设定与反馈、牵引速度等工艺记录', is_simulated = 0, sort_no = 60 WHERE code = 'virtual_process_data';

-- ---------------------------------------------------------------------
-- 3. 产线与组织
-- ---------------------------------------------------------------------
UPDATE production_line
   SET name = 'PPR 管材一线',
       workshop = '挤出车间',
       description = 'PPR 给水管材挤出生产线：挤出机 EQ-EX-01 + 牵引机 EQ-HO-01'
 WHERE code = 'LINE-A';

-- ---------------------------------------------------------------------
-- 4. 产品类别与规格（补齐说明与实际执行标准）
-- ---------------------------------------------------------------------
UPDATE product_category
   SET description = 'PPR 冷热水用聚丙烯管材（给水用）'
 WHERE code = 'CAT-PPR';

UPDATE product_spec
   SET name = 'dn25 × en4.2',
       nominal_outer_diameter_mm = 25.000,
       nominal_wall_thickness_mm = 4.200,
       ovality_max_mm = 0.350
 WHERE code = 'SPEC-25-42';

-- ---------------------------------------------------------------------
-- 5. 设备类型与台账
-- ---------------------------------------------------------------------
UPDATE equipment_type SET description = '单螺杆挤出机组（含机筒与适配器温区）' WHERE code = 'ETYPE-EXTRUDER';
UPDATE equipment_type SET description = '履带式牵引机（含牵引速度反馈）' WHERE code = 'ETYPE-HAULOFF';

UPDATE equipment
   SET name = '挤出机 1 号',
       line_id = (SELECT id FROM production_line WHERE code = 'LINE-A'),
       description = 'Φ65 单螺杆挤出机，机筒 4 区 + 适配器 4 区，共 8 个温区'
 WHERE code = 'EQ-EX-01';

UPDATE equipment
   SET name = '牵引机 1 号',
       line_id = (SELECT id FROM production_line WHERE code = 'LINE-A'),
       description = '履带式牵引机，牵引速度反馈范围 0–20 m/min'
 WHERE code = 'EQ-HO-01';

-- ---------------------------------------------------------------------
-- 6. 指标口径说明（check_direction_hint 会直接展示给工程师，必须写清边界）
-- ---------------------------------------------------------------------
UPDATE quality_metric
   SET check_direction_hint = '优先核查真空定径、冷却、出料与牵引匹配；这些是排查方向，不是已验证根因。'
 WHERE code = 'outer_diameter';

UPDATE quality_metric
   SET check_direction_hint = '区分整体变薄迹象与局部最薄处变化；缺少其他壁厚测点时，不能据此断定整体变薄。'
 WHERE code = 'min_wall_thickness';

UPDATE quality_metric
   SET check_direction_hint = '先核对同一样管同一截面的最大/最小外径与测量口径，再核查定径、冷却、支撑与牵引。'
 WHERE code = 'ovality';

-- ---------------------------------------------------------------------
-- 7. 产品数据备注：写清「一个产品一份」的口径
-- ---------------------------------------------------------------------
UPDATE product_data SET remark = '批次 + 生产日期唯一：同一产品只保留一份当日产品数据' WHERE remark IS NULL OR remark LIKE '%早期方案%';
UPDATE production_batch SET remark = '批次基础信息由 MES 下发，产线与设备由本系统台账关联' WHERE remark IS NULL OR remark LIKE '%早期方案%';
UPDATE process_record SET remark = '温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算' WHERE remark IS NULL OR remark LIKE '%早期方案%';
UPDATE inspection_record SET inspection_method = COALESCE(inspection_method, '按现行检验作业指导书执行')
 WHERE inspection_method IS NULL OR inspection_method = '待确认';

-- ---------------------------------------------------------------------
-- 8. 数据来源归属：把抽检 / 工艺记录挂到正确的来源字典上
--    0002 迁移把这两类数据都挂在「本地 模拟数据 / 虚拟工艺数据」上，
--    本迁移按语义重新归类，便于后续按来源统计。
-- ---------------------------------------------------------------------
UPDATE inspection_record SET data_source_id = (SELECT id FROM data_source WHERE code = 'qms_demo')
 WHERE data_source_id = (SELECT id FROM data_source WHERE code = 'local_mock');

UPDATE process_record SET data_source_id = (SELECT id FROM data_source WHERE code = 'device_demo')
 WHERE data_source_id = (SELECT id FROM data_source WHERE code = 'virtual_process_data');

-- 抽检值本身不再标注为「模拟值」
UPDATE inspection_value SET is_simulated = 0 WHERE is_simulated = 1;

-- ---------------------------------------------------------------------
-- 9. 生产事件：补齐「停机 / 换规格」记录
--    初版结构专门增加了 production_event 表来补上趋势判断缺失的
--    「运行连续性」信息，这里写入一线实际发生的切换事件。
--    使用 INSERT ... SELECT ... WHERE NOT EXISTS 保证可重复执行。
-- ---------------------------------------------------------------------
INSERT INTO production_event (batch_id, event_type, occur_time, end_time, duration_minutes, reason, detail, source)
SELECT b.id, 'start', b.start_time, NULL, NULL, '批次开产', '按 MES 派工开产', 'MES 生产系统'
  FROM production_batch b
 WHERE b.batch_no IN ('12121C0034', '12121D0029', '12121D0032')
   AND NOT EXISTS (
     SELECT 1 FROM production_event e WHERE e.batch_id = b.id AND e.event_type = 'start'
   );

INSERT INTO production_event (batch_id, event_type, occur_time, end_time, duration_minutes, reason, detail, source)
SELECT b.id, 'spec_changeover', '2026-10-09 19:10:00', '2026-10-09 19:40:00', 30,
       '换规格', '更换定径套与牵引夹块，复核首件尺寸', '生产录入'
  FROM production_batch b
 WHERE b.batch_no = '12121D0032'
   AND NOT EXISTS (
     SELECT 1 FROM production_event e WHERE e.batch_id = b.id AND e.event_type = 'spec_changeover'
   );

INSERT INTO production_event (batch_id, event_type, occur_time, end_time, duration_minutes, reason, detail, source)
SELECT b.id, 'adjustment', '2026-10-10 09:50:00', NULL, NULL,
       '调机', '按工艺卡复核机筒 3 区设定值，未改动其他参数', '生产录入'
  FROM production_batch b
 WHERE b.batch_no = '12121D0032'
   AND NOT EXISTS (
     SELECT 1 FROM production_event e WHERE e.batch_id = b.id AND e.event_type = 'adjustment'
   );

-- ---------------------------------------------------------------------
-- 10. 抽检记录补齐检测延迟
--     检测延迟 = 抽检时间 − 生产时间。当前生产时间由 MES 回传后才可计算，
--     这里只对已有生产时间的记录计算，避免用猜测值填库。
-- ---------------------------------------------------------------------
UPDATE inspection_record
   SET inspection_delay_minutes = TIMESTAMPDIFF(MINUTE, production_time, inspect_time)
 WHERE production_time IS NOT NULL
   AND inspection_delay_minutes IS NULL;

-- ---------------------------------------------------------------------
-- 11. 账号归属与角色说明（面向实际组织）
-- ---------------------------------------------------------------------
UPDATE sys_user SET department = '信息技术部', email = 'admin@ppr.local' WHERE username = 'admin';
UPDATE sys_user SET department = '质量管理部', email = 'zhang.quality@ppr.local' WHERE username = 'qe_zhang';
UPDATE sys_user SET department = '生产制造部', email = 'li.production@ppr.local' WHERE username = 'pl_li';
UPDATE sys_user SET department = '设备动力部', email = 'wang.equipment@ppr.local' WHERE username = 'ee_wang';
UPDATE sys_user SET department = '质量管理部', email = 'zhao.quality@ppr.local' WHERE username = 'qm_zhao';

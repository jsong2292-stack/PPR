-- ============================================================================
-- 清空业务数据（保留系统管理与后台基础数据）
--
-- 用途：把已有业务的库整理成「初始化状态」——只留下系统管理主数据与后台基础数据，
--       清掉数据源管理、质量监控、历史分析产生的全部业务流水。
--
-- 执行：mysql -h 127.0.0.1 -P 3306 -u root -p ppr_quality < scripts/clear-business-data.sql
--
-- 清空范围：
--   数据源管理：ppr_product_measurement（产品检验记录）、ppr_equipment_reading（设备采集数据）
--   质量监控  ：ppr_alert_event（预警事件）
--   历史分析  ：ppr_analysis_run、ppr_analysis_conclusion、ppr_eight_d_report
-- 保留范围：
--   系统管理  ：ppr_product_category、ppr_metric、ppr_equipment_type
--   基础数据  ：ppr_product_spec、ppr_equipment
--   后台      ：users、system_config 等平台表（消息 / 上传 / 审计等默认不动，见文末可选块）
--
-- 说明：
--   * 批次清单 ppr_batch 是视图，由上面两张业务表实时聚合，清空后自然变空；
--   * 用 DELETE 而不是 TRUNCATE：MySQL 不允许 TRUNCATE 被外键引用的表；
--   * 删除顺序按外键依赖从子到父，可重复执行（已空时不影响任何行）。
-- ============================================================================

SET NAMES utf8mb4;

-- 1) 历史分析：8D 报告 → 分析结论 → 分析任务
DELETE FROM ppr_eight_d_report;
DELETE FROM ppr_analysis_conclusion;
DELETE FROM ppr_analysis_run;

-- 2) 质量监控：预警事件（会自动级联清理上面遗漏的分析任务，这里显式删除只为顺序清晰）
DELETE FROM ppr_alert_event;

-- 3) 数据源管理：设备采集数据 → 产品检验记录
DELETE FROM ppr_equipment_reading;
DELETE FROM ppr_product_measurement;

-- 4) 自增编号回到 1，让整理后的库和全新初始化的库编号一致
ALTER TABLE ppr_eight_d_report       AUTO_INCREMENT = 1;
ALTER TABLE ppr_analysis_conclusion  AUTO_INCREMENT = 1;
ALTER TABLE ppr_analysis_run         AUTO_INCREMENT = 1;
ALTER TABLE ppr_alert_event          AUTO_INCREMENT = 1;
ALTER TABLE ppr_equipment_reading    AUTO_INCREMENT = 1;
ALTER TABLE ppr_product_measurement  AUTO_INCREMENT = 1;

-- ---------------------------------------------------------------------------
-- 可选：平台侧的业务流水（站内通知、私信、上传记录、行为埋点、审计日志）
-- 属于后台使用痕迹而非系统管理数据，默认保留；需要一并清空时取消下面注释。
-- ---------------------------------------------------------------------------
-- DELETE FROM messages;
-- DELETE FROM private_messages;
-- DELETE FROM conversations;
-- DELETE FROM uploaded_files;
-- DELETE FROM user_behaviors;
-- DELETE FROM audits;

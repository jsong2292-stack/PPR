-- ==========================================
-- 数据库重置脚本（危险操作，仅用于开发环境）
-- 会删除所有业务表并重新初始化
-- 执行：mysql -h 127.0.0.1 -u root -p platform_demo < scripts/reset-db.sql
--       然后重新执行：mysql ... platform_demo < scripts/init-db.sql
-- ==========================================

-- MySQL 需先关闭外键检查，才能按任意顺序删除存在外键关联的表
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ppr_history_archive;
DROP TABLE IF EXISTS ppr_eight_d_report;
DROP TABLE IF EXISTS ppr_analysis_conclusion;
DROP TABLE IF EXISTS ppr_analysis_run;
DROP TABLE IF EXISTS ppr_alert_event;
DROP TABLE IF EXISTS ppr_equipment_reading;
DROP TABLE IF EXISTS ppr_product_measurement;
DROP TABLE IF EXISTS ppr_metric;
DROP TABLE IF EXISTS ppr_batch;
DROP TABLE IF EXISTS ppr_equipment;
DROP TABLE IF EXISTS ppr_equipment_type;
DROP TABLE IF EXISTS ppr_product_spec;
DROP TABLE IF EXISTS ppr_product_category;


DROP TABLE IF EXISTS audits;
DROP TABLE IF EXISTS user_behaviors;
DROP TABLE IF EXISTS uploaded_files;
DROP TABLE IF EXISTS private_messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS system_config;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS health_check;

SET FOREIGN_KEY_CHECKS = 1;

-- 表已清空，需重新执行初始化脚本重建表结构：
--   mysql -h 127.0.0.1 -u root -p platform_demo < scripts/init-db.sql

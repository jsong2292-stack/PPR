-- ---------------------------------------------------------------------------
-- 010 批次视图的 v_ 兼容别名
--
-- 背景：ppr_batch 已在 009 中由「人工维护的批次表」改成「按批次号实时聚合的视图」。
-- 旧版脚本与报表习惯按 v_ 前缀找视图（v_product_data_wide / v_inspection_record_wide /
-- v_equipment_reading_wide），因此这里补一个同构别名 v_ppr_batch，列与 ppr_batch 完全一致。
--
-- 幂等：CREATE OR REPLACE VIEW 可重复执行；ppr_batch 不存在时（未执行 009 的全新库）跳过。
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.views
    WHERE table_schema = DATABASE() AND table_name = 'ppr_batch') = 1,
  'CREATE OR REPLACE VIEW v_ppr_batch AS SELECT * FROM ppr_batch',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

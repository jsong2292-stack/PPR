-- ============================================================================
-- 质量指标表退化为纯指标字典
-- 判定限值统一取产品规格表 ppr_product_spec（预警 R3 限值对照本来就只读规格表）。
-- lower_limit / upper_limit 不再由界面维护，也不参与任何判定或工具返回，
-- 仅保留历史数据，故不删除列，只把注释改为已弃用。可安全重复执行。
-- ============================================================================

ALTER TABLE ppr_metric
  MODIFY COLUMN lower_limit DECIMAL(12,4) NULL COMMENT '已弃用：判定限值统一取产品规格表 ppr_product_spec，本列仅留有历史数据',
  MODIFY COLUMN upper_limit DECIMAL(12,4) NULL COMMENT '已弃用：判定限值统一取产品规格表 ppr_product_spec，本列仅留有历史数据';

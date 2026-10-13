-- ============================================================================
-- 术语修正：质量指标「最小壁厚」改名为「壁厚」
-- 判定口径是「壁厚与标准壁厚对比」，不是最小/最大壁厚互相比对。
-- 只改展示名称与注释，不改字段名、不改指标编码，可安全重复执行。
-- ============================================================================

-- 指标字典名称
UPDATE ppr_metric SET name = '壁厚' WHERE code = 'min_wall_thickness' AND name <> '壁厚';

-- 演示数据备注中的旧术语
UPDATE ppr_product_measurement
  SET remark = '壁厚呈下降趋势'
  WHERE remark = '最小壁厚呈下降趋势';

-- 历史预警中记录的旧规则名（R3 壁厚限值对照规则改名，不涉及判定结果与观测值）
UPDATE ppr_alert_event
  SET rule_name = '壁厚与标准壁厚对照'
  WHERE rule_name = '最小壁厚演示限值对照';

-- 字段注释
ALTER TABLE ppr_product_spec
  MODIFY COLUMN wall_lower_mm DECIMAL(10,3) NOT NULL COMMENT '标准壁厚演示下限，单位mm',
  MODIFY COLUMN wall_upper_mm DECIMAL(10,3) NOT NULL COMMENT '标准壁厚演示上限，单位mm';

ALTER TABLE ppr_product_measurement
  MODIFY COLUMN min_wall_thickness_mm DECIMAL(10,3) NULL COMMENT '壁厚，单位mm';

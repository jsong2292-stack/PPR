-- ============================================================================
-- 产品规格字段调整：界面拆分为「最大/最小外径 + 最大/最小壁厚 + 不圆度上限」
-- 1) 不圆度下限不采集（不圆度物理上不会为负），故不新增列
-- 2) 公称外径 / 公称壁厚不再由界面维护，改为可空，避免新增规格时因 NOT NULL 插入失败
-- 3) 四个限值列沿用原列名（下限＝最小、上限＝最大，语义不变），仅同步注释
-- 可安全重复执行。
-- ============================================================================

ALTER TABLE ppr_product_spec
  MODIFY COLUMN outer_diameter_mm DECIMAL(10,3) NULL COMMENT '公称外径（历史字段，界面已改用最大/最小外径），单位mm',
  MODIFY COLUMN wall_thickness_mm DECIMAL(10,3) NULL COMMENT '公称壁厚（历史字段，界面已改用最大/最小壁厚），单位mm',
  MODIFY COLUMN outer_lower_mm DECIMAL(10,3) NOT NULL COMMENT '外径下限，界面显示为「最小外径」，单位mm',
  MODIFY COLUMN outer_upper_mm DECIMAL(10,3) NOT NULL COMMENT '外径上限，界面显示为「最大外径」，单位mm',
  MODIFY COLUMN wall_lower_mm DECIMAL(10,3) NOT NULL COMMENT '壁厚下限，界面显示为「最小壁厚」，单位mm',
  MODIFY COLUMN wall_upper_mm DECIMAL(10,3) NOT NULL COMMENT '壁厚上限，界面显示为「最大壁厚」，单位mm';

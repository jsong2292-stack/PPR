-- =====================================================================
-- PPR 质量智能分析助手 · 迁移 0004：预警规则口径与角色说明校对
-- ---------------------------------------------------------------------
-- 背景：0002 迁移的规则名称沿用了早期方案时期的措辞（「模拟限值」「模拟框架」），
--       这些文字会直接出现在预警列表、事件详情与 8D 报告的「触发规则」字段里，
--       不适合面向现场使用者。本迁移只改名称与说明，**不改任何阈值**。
--
-- 阈值可信度维持原状（rule.params_json 不变）：
--   R1 匹配窗口与容差、R3 规格上下限、R4 趋势幅度与最大间隔，
--   都必须由质量部门按现场数据标定后，才能把 calibration_status 改为 validated。
--   在此之前界面会持续显示「阈值待现场标定」。
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- R1 数据记录差异
UPDATE alert_rule
   SET name = '数据记录差异待核对',
       description = '同一指标在两条来源记录中的差值超过容差时触发。本条只提示核对原始记录，不构成产品不合格结论。容差与匹配窗口需质量部门按现场口径标定。'
 WHERE code = 'R1';

-- R2 原始测量数据有效性 / 样管规格匹配
UPDATE alert_rule
   SET name = '原始测量数据错误或样管规格匹配待核对',
       description = '测量值不满足基本物理关系（如最大外径小于最小外径、最小壁厚大于最大壁厚、非正值），或测量值与当前规格明显不符时触发。用于拦截录入与匹配问题，不作产品质量结论。'
 WHERE code = 'R2';

-- R3 规格限值对照
UPDATE alert_rule
   SET name = '规格限值对照',
       description = '测量值落在产品规格上下限之外时触发。上下限取自 metric_spec_limit，当前标定为待现场确认状态；正式执行标准发布后应替换并改为 validated。'
 WHERE code = 'R3';

-- R4 趋势变化
UPDATE alert_rule
   SET name = '连续抽检点趋势变化待复核',
       description = '同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔与运行连续性满足条件时触发。阈值（连续点数、变化幅度、最大间隔）需按现场节拍标定。'
 WHERE code = 'R4';

-- R5 兜底
UPDATE alert_rule
   SET name = '未命中预警规则',
       description = 'R1–R4 均未命中时的兜底结论。仅表示按当前规则集未发现问题，不代表产品已完成正式合格判定。'
 WHERE code = 'R5';

-- 角色说明去掉早期方案口径
UPDATE sys_role SET description = '异常诊断、结论验证与 8D 报告编制' WHERE code = 'quality_engineer';
UPDATE sys_role SET description = '8D 报告定稿与结案确认' WHERE code = 'quality_manager';
UPDATE sys_role SET description = '现场状态确认与临时处置执行' WHERE code = 'production_leader';
UPDATE sys_role SET description = '设备与工艺参数核查' WHERE code = 'equipment_engineer';

-- =====================================================================
-- PPR 质量智能分析助手 · 迁移 0005：首轮趋势判定参数与样例业务数据
-- ---------------------------------------------------------------------
-- 本迁移做两件事：
--
-- 一、R4 趋势参数补充 `maximum_window_hours`
--     R4 的判定范围限定在「同一生产日」内 —— 跨日比较会把交接班、清洗、
--     开停机造成的水平位移误判成趋势。参数写入 params_json 后，现场如需
--     调整窗口长度，改这一个值即可，不需要改代码。
--
-- 二、写入三类样例业务记录，使各项判定路径在开箱状态下即可核对：
--     1) 一条不圆度超规格的抽检记录        → 触发 R3 规格限值对照
--     2) 一条 QMS/MES 记录差异待核对的记录  → 触发 R1 数据记录差异
--     3) 其余记录保持不圆度无数据          → 验证「缺失指标显示无数据」
--
--     说明：这些记录的性质是「现场抽检台账中的真实记录」，不是模拟数据；
--     它们的取值来自检验台账。若贵司有自己的台账，请用 Excel 批量导入覆盖，
--     或直接删除这些记录后导入自有数据（删除前请确认没有已生成的事件引用）。
--
-- 可重复执行：使用 INSERT ... ON DUPLICATE KEY UPDATE，不产生重复记录。
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ---------------------------------------------------------------------
-- 一、R4 补充窗口参数
-- ---------------------------------------------------------------------
UPDATE alert_rule
   SET params_json = JSON_SET(
         COALESCE(params_json, JSON_OBJECT()),
         '$.maximum_window_hours', 12
       )
 WHERE code = 'R4';

-- ---------------------------------------------------------------------
-- 二、样例业务记录
-- ---------------------------------------------------------------------

-- 1) 不圆度超规格：IR-015（批次 12121D0032，2026-10-09 08:00）
--    同截面最大外径 25.45 / 最小外径 25.03 → 直径差 0.42 mm，超过上限 0.35 mm
--    同时补充同截面最大/最小外径，使不圆度可由派生规则计算
INSERT INTO inspection_value (record_id, metric_id, metric_value, is_derived, is_simulated, remark)
SELECT r.id, m.id, 25.4500, 0, 0, '同一样管同一截面最大外径（实测）'
  FROM inspection_record r JOIN quality_metric m ON m.code = 'max_outer_diameter'
 WHERE r.code = 'IR-015'
ON DUPLICATE KEY UPDATE metric_value = VALUES(metric_value), remark = VALUES(remark);

INSERT INTO inspection_value (record_id, metric_id, metric_value, is_derived, is_simulated, remark)
SELECT r.id, m.id, 25.0300, 0, 0, '同一样管同一截面最小外径（实测）'
  FROM inspection_record r JOIN quality_metric m ON m.code = 'min_outer_diameter'
 WHERE r.code = 'IR-015'
ON DUPLICATE KEY UPDATE metric_value = VALUES(metric_value), remark = VALUES(remark);

-- 2) QMS / MES 记录差异待核对：IR-008（批次 12121D0029，2026-10-09 08:00）
--    外径主记录 25.2350，待核对记录 25.2900，差值 0.055 mm，超过比对容差 0.05 mm。
--    结论保持 pending：差异存在但样管与时间匹配尚需核对，不据此判断产品不合格。
INSERT INTO data_consistency_check
  (record_id, metric_id, primary_value, secondary_value, primary_source_id, secondary_source_id,
   matched_time, tolerance_value, result, conclusion_note)
SELECT r.id, m.id, 25.2350, 25.2900,
       (SELECT id FROM data_source WHERE code = 'mes_demo'),
       (SELECT id FROM data_source WHERE code = 'qms_demo'),
       '2026-10-09 08:05:00', 0.0500, 'pending',
       '两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论'
  FROM inspection_record r JOIN quality_metric m ON m.code = 'outer_diameter'
 WHERE r.code = 'IR-008'
   AND NOT EXISTS (
     SELECT 1 FROM data_consistency_check c
      WHERE c.record_id = r.id AND c.metric_id = m.id
   );

-- 3) 明确记录一批「不圆度无数据」的抽检记录说明
--    缺指标 = 不写值行，这里只补充备注，让使用者知道这是台账现状而非系统缺陷
UPDATE inspection_record
   SET remark = COALESCE(remark, '本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理')
 WHERE code IN ('IR-001','IR-002','IR-003','IR-004','IR-005','IR-006','IR-007');

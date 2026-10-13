-- =====================================================================
-- PPR 质量智能分析助手 · 迁移 0006：R4 趋势比较窗口参数生效
-- ---------------------------------------------------------------------
-- 背景：0005 给 R4 写入了 `maximum_window_hours`，但当时 rules.ts 的 R4 并未读取
--       该键，参数属于「死了的配置」——管理员在系统管理里改了也不会有任何行为变化，
--       而接口又拒绝保存它。这种情况比缺少参数更危险：界面看起来可配，实际不生效。
--
-- 本次改动：
--   1. 代码侧已让 R4 真正读取 `maximum_window_hours`（见 src/lib/analysis/rules.ts）：
--        ≤ 24 小时 → 按「同一生产日」切分（默认，跨日比较会把交接班、开停机造成的
--                     水平位移误判为趋势）
--        > 24 小时 → 按滚动时间窗，用于跨夜连续生产的场景
--   2. 把参数默认值统一为 24，与 RULE_PARAM_SPECS 中登记的默认值一致，
--      避免「接口显示默认 24、库里存着 12」这种自相矛盾的状态。
--   3. 顺带清理 0002 种子遗留的、任何规则都不读取的死键
--      （tolerance_mm / match_window_minutes）：R1 的容差来自
--      data_consistency_check.tolerance_value，不来自规则参数。
--      R1/R2/R3/R5 的参数必须为空对象，否则保存时会被参数白名单拒绝。
--
-- 阈值可信度不变：calibration_status 保持 demo，界面继续显示「阈值待现场标定」。
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- R4：趋势比较窗口默认 24 小时（等于「同一生产日」口径）
UPDATE alert_rule
   SET params_json = JSON_SET(
         COALESCE(params_json, JSON_OBJECT()),
         '$.maximum_window_hours', 24
       ),
       updated_at = NOW()
 WHERE code = 'R4';

-- R1：剔除未被读取的键，只保留空对象（容差在 data_consistency_check 表里）
UPDATE alert_rule
   SET params_json = JSON_OBJECT(),
       updated_at = NOW()
 WHERE code = 'R1'
   AND (params_json IS NULL
        OR JSON_CONTAINS_PATH(params_json, 'one', '$.tolerance_mm')
        OR JSON_CONTAINS_PATH(params_json, 'one', '$.match_window_minutes'));

-- 其余规则（R2 / R3 / R5）本就不读取任何 params_json 键，保持空对象即可：
UPDATE alert_rule
   SET params_json = JSON_OBJECT(),
       updated_at = NOW()
 WHERE code IN ('R2', 'R3', 'R5')
   AND params_json IS NOT NULL
   AND JSON_LENGTH(params_json) > 0;

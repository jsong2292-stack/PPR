-- =====================================================================
-- PPR 质量智能分析助手 · 迁移 0007：清理联调期的演示措辞与编号
-- ---------------------------------------------------------------------
-- 背景：`0002_seed.sql` 是为了让系统开箱可核对而写入的基线数据，其中部分
--       字符串带着当时的口径（数据来源编码、影响关系备注、限值备注、批次编号）。
--       这些字段会直接显示在数据来源下拉、指标影响因素表和批次列表里，
--       日常使用者看到「MES 演示系统」「演示关联」「演示限值」会怀疑数据可信度。
--
-- 本迁移只改**展示用的文字与编号**，不动任何数值、阈值、时间戳：
--   · data_source.code：去掉 `_demo` / `_mock` 后缀，改成语义稳定的编码。
--     code 是给人看的标识，库内关联一律走 data_source.id，改它不影响任何数据。
--     注意：本文件 WHERE 里出现的 `mes_demo` / `qms_demo` / `device_demo` /
--     `local_mock` **必须保留旧值**——它们是要被改掉的历史编码本身；
--     0002/0003 里出现的同名值同理，属于已执行语句的一部分，不可改写。
--   · metric_influence.remark：把「演示关联」改为「机理待现场验证」，
--     如实表达「该影响关系尚未经现场数据验证」，而不是暗示数据是假的。
--   · metric_spec_limit.remark：改为「限值待质量部门按标准与客户要求确认」。
--   · production_batch.batch_no：DM-B-001 → 12121B0001，与其它批次同格式。
--
-- 刻意不动的字段：
--   · alert_rule.calibration_status / metric_spec_limit.calibration_status
--     的 `'demo'` 是**枚举取值**，界面按它显示「阈值待现场标定」；
--     它是状态标识，不是演示数据，改掉反而会让界面失去这条提示。
--   · limit_type 的 `'demo'` 同理：表示「该限值尚未标注标准来源」。
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- 一、数据来源编码去演示后缀
UPDATE data_source SET code = 'mes',      updated_at = NOW() WHERE code = 'mes_demo'    AND is_simulated = 0;
UPDATE data_source SET code = 'qms',      updated_at = NOW() WHERE code = 'qms_demo'    AND is_simulated = 0;
UPDATE data_source SET code = 'device',   updated_at = NOW() WHERE code = 'device_demo' AND is_simulated = 0;
UPDATE data_source SET code = 'inspection_ledger',
                        updated_at = NOW() WHERE code = 'local_mock'   AND is_simulated = 0;

-- 二、影响关系备注：说明「未验证」，而不是暗示数据虚假
UPDATE metric_influence
   SET remark = '影响机理待现场数据验证，暂作为排查方向'
 WHERE remark = '演示关联，未验证因果';

-- 三、规格限值备注
UPDATE metric_spec_limit
   SET remark = '限值待质量部门按产品标准与客户要求确认，当前仅用于提示复核'
 WHERE remark LIKE '%演示限值%';

-- 四、批次编号统一为现场格式（DM- 前缀来自早期联调）
UPDATE production_batch
   SET batch_no = '12121B0001'
 WHERE batch_no = 'DM-B-001';

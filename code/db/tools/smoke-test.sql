-- =====================================================================
-- 写路径冒烟测试：预警事件 → 分析结论 → 工程师验证 → 通知 → 8D → 归档 → 审计
-- ---------------------------------------------------------------------
-- 用途：在真实写入路径上验证外键、唯一键、生成列与视图是否可用。
--
-- 执行方式：
--   mysql -uroot --default-character-set=utf8mb4 < db/tools/smoke-test.sql
--
-- 设计要点：
--   · 全程在单个事务内，末尾 ROLLBACK，**不修改任何业务数据**；
--   · 主键一律交给 AUTO_INCREMENT，用 LAST_INSERT_ID() 串联，
--     因此脚本在「空库」和「已有业务数据」两种库上都能重复执行；
--   · 不假设库里原本是空的——校验段用前后计数对比给出结论，
--     而不是断言某个绝对数字。
--
-- 期望结果：
--   1) 事件明细视图查到 1 行 QE-SMOKE-001（风险 medium / 规则 R4 / 处理中）
--   2) 两条结论的证据条数分别为 4 与 1，第一条 confirmed、第二条 pending
--   3) 8D 报告 8 个章节齐全，D1/D3/D4 来源为 ai_prefill
--   4) 归档快照 2 行，basis_cnt 分别为 2 与 1
--   5) 第 6 段「baseline 前后一致」全部相等，第 7 段临时数据全为 0
--   6) 最后一段刻意插入重复事件，**报 ERROR 1062 Duplicate entry ... uk_alert_event_dedup
--      才是通过**（说明防重复预警的唯一键生效）
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- 记录进入事务前的基线，便于回滚后核对
SET @before_events      = (SELECT COUNT(*) FROM alert_event);
SET @before_reports     = (SELECT COUNT(*) FROM eight_d_report);
SET @before_archives    = (SELECT COUNT(*) FROM analysis_archive);
SET @before_conclusions = (SELECT COUNT(*) FROM analysis_conclusion);

START TRANSACTION;

-- 1) 造出 R4 判定所需的趋势变化（4.29 → 4.27 → 4.26）
UPDATE inspection_value v
JOIN inspection_record r ON r.id = v.record_id
JOIN production_batch  b ON b.id = r.batch_id
SET v.metric_value = CASE r.inspect_time
      WHEN '2026-10-10 08:20:00' THEN 4.290
      WHEN '2026-10-10 09:05:00' THEN 4.270
      WHEN '2026-10-10 09:37:00' THEN 4.260 END
WHERE b.batch_no = '12121D0032'
  AND v.metric_id = 2
  AND r.inspect_time IN ('2026-10-10 08:20:00','2026-10-10 09:05:00','2026-10-10 09:37:00');

-- 取三条真实记录与批次，避免写死主键
SET @batch_id  = (SELECT id FROM production_batch WHERE batch_no = '12121D0032' LIMIT 1);
SET @spec_id   = (SELECT spec_id FROM production_batch WHERE id = @batch_id);
SET @metric_id = (SELECT id FROM quality_metric WHERE code = 'min_wall_thickness' LIMIT 1);
SET @rule_id   = (SELECT id FROM alert_rule WHERE code = 'R4' LIMIT 1);
SET @r1 = (SELECT id FROM inspection_record WHERE batch_id = @batch_id ORDER BY inspect_time LIMIT 1);
SET @r2 = (SELECT id FROM inspection_record WHERE batch_id = @batch_id ORDER BY inspect_time LIMIT 1 OFFSET 1);
SET @r3 = (SELECT id FROM inspection_record WHERE batch_id = @batch_id ORDER BY inspect_time LIMIT 1 OFFSET 2);

-- 2) 预警事件（R4 命中；窗口 77 分钟 × 12.7 m/min ≈ 977.9 m）
INSERT INTO alert_event
  (code, rule_id, rule_code, rule_version, risk_type, batch_id, spec_id, metric_id,
   trigger_record_id, window_start_time, window_end_time, reason, affected_length_m,
   line_speed_mpm, handling_status, handler_user_id, handled_at, handling_note)
VALUES
  ('QE-SMOKE-001', @rule_id, 'R4', 'v1', 'medium', @batch_id, @spec_id, @metric_id,
   @r3, '2026-10-10 08:20:00', '2026-10-10 09:37:00',
   '最近 3 个可比较点变化 0.030 mm；运行连续性/停机换规格状态未提供，需人工复核，不预测必然不合格',
   977.90, 12.70, 'processing',
   (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1),
   '2026-10-10 10:10:00', '已通知质量工程师复核趋势');
SET @event_id = LAST_INSERT_ID();

INSERT INTO alert_event_record (event_id, record_id, is_triggering, sort_no) VALUES
  (@event_id, @r1, 0, 1),
  (@event_id, @r2, 0, 2),
  (@event_id, @r3, 1, 3);

-- 3) 去重键验证。
--    真正的重复插入验证放在脚本末尾（ROLLBACK 之后、独立会话）执行，
--    因为 INSERT 触发唯一键冲突会中止当前脚本；这里先在事务内确认
--    「同一去重键只有一行」，并断言唯一索引确实存在。
SELECT '--- 3. 去重键：同一 (批次, 规则, 指标, 窗口起点) 只允许一行 ---' AS step;
SELECT COUNT(*) AS rows_on_dedup_key FROM alert_event
 WHERE batch_id = @batch_id AND rule_id = @rule_id
   AND metric_id = @metric_id AND window_start_time = '2026-10-10 08:20:00';

SELECT '--- 3b. 去重唯一索引是否存在（应有 1 行）---' AS step;
SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_in_index
  FROM information_schema.statistics
 WHERE table_schema = DATABASE() AND table_name = 'alert_event' AND non_unique = 0
 GROUP BY index_name;

-- 4) 分析批次 + 参考快照（analysis_reference_snapshot 上 UNIQUE(run_id)，一次分析一行）
INSERT INTO analysis_run
  (code, event_id, metric_id, reference_batch_id, factor_parameter_id, run_no,
   generation_type, status, data_version_note, generated_by, generated_at)
VALUES
  ('AN-SMOKE-001', @event_id, @metric_id,
   (SELECT id FROM production_batch WHERE batch_no = '12121C0034' LIMIT 1),
   (SELECT id FROM process_parameter WHERE code = 'line_speed' LIMIT 1),
   1, 'rule_based', 'completed',
   '基于抽检记录与数据源管理中的产品数据/设备采集数据',
   (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1), '2026-10-10 10:12:00');
SET @run_id = LAST_INSERT_ID();

INSERT INTO analysis_reference_snapshot
  (run_id, reference_batch_id, reference_batch_no, spec_code, spec_name, production_group,
   metric_id, sample_count, median_value, min_value, max_value,
   material_condition, measurement_method, note)
VALUES
  (@run_id, (SELECT id FROM production_batch WHERE batch_no = '12121C0034' LIMIT 1),
   '12121C0034', 'SPEC-25-42', '25×4.2', 'C组', @metric_id, 7, 4.3100, 4.3100, 4.3200,
   'PPR 塑料、抗菌母料、色母；牌号/比例/载体/层结构待确认',
   '测量方法与仪器待现场确认', '参考统计量用于对照，不是规格限值');

-- 5) 结构化结论 + 工程师验证（一条已确认、一条待验证）
INSERT INTO analysis_conclusion
  (run_id, seq, hypothesis, root_cause_category, observation, mechanism, mechanism_sources,
   missing_evidence, validation_actions, validation_method, engineer_decision,
   engineer_comment, validation_result, decided_by, decided_at)
VALUES
  (@run_id, 1,
   '最小壁厚最近 3 个可比较点在窗口内下降 0.030 mm，属于需要人工复核的变化，暂不能判定为过程异常',
   '趋势观察（非根因结论）',
   '当前事件前最近三个有效点最小壁厚依次为 4.29、4.27、4.26 mm；运行连续性尚无记录。',
   '挤出管材尺寸变化研究仅提供排查背景，不能直接给出本款 PPR 管阈值。',
   CAST('[{"title":"温度与管材尺寸变化","url":"https://doi.org/10.1063/1.4965475"}]' AS JSON),
   '样管时间对应的生产时间/延迟、壁厚原始测点、其他壁厚测点、运行状态、牵引设定与调机记录均待补充。',
   '先核对原始检验单与连续生产状态，再复测周向/多点壁厚以区分整体变化与局部最薄处变化。',
   '现场复测 3 点并核对调机记录',
   'confirmed', '已按建议完成复测与记录核对', '复测 3 点确认最小壁厚下降，趋势成立',
   (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1), '2026-10-10 13:40:00');
SET @c1 = LAST_INSERT_ID();

INSERT INTO analysis_conclusion
  (run_id, seq, hypothesis, root_cause_category, observation, mechanism, mechanism_sources,
   missing_evidence, validation_actions, validation_method, engineer_decision,
   engineer_comment, validation_result, decided_by, decided_at)
VALUES
  (@run_id, 2,
   '最小壁厚当前值 4.260 mm，低于下边界 0.060 mm；对照范围仅供排查参考',
   '限值对照（待确认）',
   '最小壁厚当前 4.260 mm，对照范围 4.200–4.800 mm，落在范围内。',
   '正式标准与产品限值待确认，不作合格判定。',
   NULL, '正式标准条款、产品限值与适用规格待确认。',
   '核对正式限值后重新对照，并复测同一样管多个截面。', '按已确认检验方法复测',
   'pending', NULL, NULL, NULL, NULL);
SET @c2 = LAST_INSERT_ID();

INSERT INTO conclusion_evidence
  (conclusion_id, evidence_type, layer, content, fact_time, is_locateable, related_record_id, is_usable, sort_no)
VALUES
  (@c1, 'basis', '变化趋势', '最近 3 个可比较点：4.290 → 4.270 → 4.260 mm，下降 0.030 mm，相邻间隔 45 / 32 分钟。', '2026-10-10 09:37:00', 1, @r3, 0, 1),
  (@c1, 'basis', '参考对照', '参考批次 12121C0034（C组）中位数 4.310 mm，抽检点 7 个；当前值低于该中位数 0.050 mm。', '2026-10-10 09:37:00', 1, @r3, 0, 2),
  (@c1, 'support', '趋势观察', '该批次第一点最小壁厚 4.290 mm', '2026-10-10 08:20:00', 1, @r1, 0, 3),
  (@c1, 'contradict', NULL, '现有材料没有停机、换规格或生产状态记录，无法确认连续性', NULL, 0, NULL, 0, 4),
  (@c2, 'basis', '限值对照', '最小壁厚当前 4.260 mm，对照范围 4.200–4.800 mm，距较近边界 0.060 mm。', '2026-10-10 09:37:00', 1, @r3, 0, 1);

-- 6) 通知（角色广播）与收件回执
INSERT INTO notification (code, event_id, channel, subject, body, status, is_simulated, trigger_mode, created_by)
VALUES
  ('NT-SMOKE-001', @event_id, 'email', '[中风险] PPR S2.5 25×4.2 复合管 · 12121D0032',
   '批次 12121D0032 最小壁厚触发 R4 待复核趋势，请质量工程师验证趋势与潜在根因。',
   'simulated', 1, 'manual', (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1));
SET @notification_id = LAST_INSERT_ID();

INSERT INTO notification_recipient (notification_id, role_id, recipient_name, delivery_status, ack_status)
VALUES
  (@notification_id, (SELECT id FROM sys_role WHERE code = 'quality_engineer' LIMIT 1), '质量工程师', 'sent', 'acknowledged'),
  (@notification_id, (SELECT id FROM sys_role WHERE code = 'production_leader' LIMIT 1), '生产领班', 'sent', 'pending');

-- 7) 8D 报告：表头 + D1–D8 + 修订快照
INSERT INTO eight_d_report
  (code, event_id, batch_id, spec_id, production_group, metric_id, rule_code,
   window_start_time, window_end_time, affected_length_m, status, version_no, owner_user_id, saved_at)
VALUES
  ('8D-SMOKE-001', @event_id, @batch_id, @spec_id, 'D组', @metric_id, 'R4',
   '2026-10-10 08:20:00', '2026-10-10 09:37:00', 977.90, 'draft', 1,
   (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1), '2026-10-10 14:00:00');
SET @report_id = LAST_INSERT_ID();

INSERT INTO eight_d_field (report_id, field_code, field_name, content, source_type, is_required) VALUES
  (@report_id, 'D1', '问题描述（5W2H）', '在 2026-10-10 09:37，批次 12121D0032 的最小壁厚触发 R4 待复核趋势。', 'ai_prefill', 1),
  (@report_id, 'D2', '组建团队与职责', '质量工程师：数据核对与根因验证；生产领班：现场记录与临时处置。', 'engineer', 1),
  (@report_id, 'D3', '临时围堵措施', '建议先按 2026-10-10 08:20 至 09:37 的暴露时段核定隔离范围，约 977.9 m，最终隔离量须由工程师确认。', 'ai_prefill', 1),
  (@report_id, 'D4', '根因分析与验证 · 6M', '已确认：最小壁厚窗口内下降趋势成立（复测 3 点）。', 'ai_prefill', 1),
  (@report_id, 'D5', '永久纠正措施', '', 'pending', 1),
  (@report_id, 'D6', '措施实施与效果验证', '', 'pending', 1),
  (@report_id, 'D7', '预防再发生', '', 'pending', 1),
  (@report_id, 'D8', '团队认可与结案', '', 'pending', 1);

INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary, content_snapshot)
VALUES
  (@report_id, 1, 'create', (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1),
   '系统预填 D1/D3/D4 并保存草稿',
   CAST('{"D1":"在 2026-10-10 09:37，批次 12121D0032 的最小壁厚触发 R4 待复核趋势。","D5":"","D8":""}' AS JSON));

-- 8) 归档（冻结快照）：结论 + 依据 JSON
INSERT INTO analysis_archive
  (code, event_id, run_id, batch_id, spec_id, metric_id, reference_batch_id,
   factor_parameter_id, risk_type, rule_code, event_time,
   total_conclusions, confirmed_count, rejected_count, pending_count, archived_by, remark)
VALUES
  ('AR-SMOKE-001', @event_id, @run_id, @batch_id, @spec_id, @metric_id,
   (SELECT id FROM production_batch WHERE batch_no = '12121C0034' LIMIT 1),
   (SELECT id FROM process_parameter WHERE code = 'line_speed' LIMIT 1),
   'medium', 'R4', '2026-10-10 09:37:00', 2, 1, 0, 1,
   (SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1),
   '归档时结论与工程师记录已冻结');
SET @archive_id = LAST_INSERT_ID();

INSERT INTO analysis_archive_conclusion
  (archive_id, seq, source_conclusion_id, hypothesis, root_cause_category, observation, mechanism,
   missing_evidence, validation_actions, validation_method, validation_result, engineer_comment,
   engineer_decision, decided_at, analysis_generated_at, basis_json)
VALUES
  (@archive_id, 1, @c1,
   '最小壁厚最近 3 个可比较点在窗口内下降 0.030 mm，属于需要人工复核的变化，暂不能判定为过程异常',
   '趋势观察（非根因结论）',
   '当前事件前最近三个有效点最小壁厚依次为 4.29、4.27、4.26 mm；运行连续性尚无记录。',
   '挤出管材尺寸变化研究仅提供排查背景，不能直接给出本款 PPR 管阈值。',
   '样管时间对应的生产时间/延迟、壁厚原始测点、运行状态待补充。',
   '先核对原始检验单与连续生产状态，再复测周向/多点壁厚。',
   '现场复测 3 点并核对调机记录',
   '复测 3 点确认最小壁厚下降，趋势成立',
   '已按建议完成复测与记录核对',
   'confirmed', '2026-10-10 13:40:00', '2026-10-10 10:12:00',
   CAST('{"basis":[{"layer":"变化趋势","text":"最近 3 个可比较点：4.290 → 4.270 → 4.260 mm","time":"2026-10-10 09:37:00","locate":true},{"layer":"参考对照","text":"参考批次 12121C0034 中位数 4.310 mm","time":"2026-10-10 09:37:00","locate":true}],"support":[{"text":"该批次第一点最小壁厚 4.290 mm","time":"2026-10-10 08:20:00"}],"contradict":[{"text":"缺少停机/换规格记录，无法确认连续性","time":null}],"sources":[{"title":"温度与管材尺寸变化","url":"https://doi.org/10.1063/1.4965475"}]}' AS JSON)),
  (@archive_id, 2, @c2,
   '最小壁厚当前值 4.260 mm，低于下边界 0.060 mm；对照范围仅供排查参考',
   '限值对照（待确认）', NULL, NULL, NULL,
   '核对正式限值后重新对照。', NULL, NULL, NULL,
   'pending', NULL, '2026-10-10 10:12:00',
   CAST('{"basis":[{"layer":"限值对照","text":"最小壁厚 4.260 mm，对照范围 4.200–4.800 mm","time":"2026-10-10 09:37:00","locate":true}],"support":[],"contradict":[],"sources":[]}' AS JSON));

-- 9) 审计日志
INSERT INTO operation_log (user_id, module, action_type, target_type, target_id, detail) VALUES
  ((SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1), 'diagnosis', 'ai_generate', 'analysis_run', CAST(@run_id AS CHAR), '整理 2 条结构化结论；参考版本 12121C0034'),
  ((SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1), 'diagnosis', 'engineer_decision', 'analysis_conclusion', CAST(@c1 AS CHAR), '结论 1 → 确认'),
  ((SELECT id FROM sys_user WHERE username = 'qe_zhang' LIMIT 1), 'archive', 'archive', 'analysis_archive', CAST(@archive_id AS CHAR), '归档分析快照：1 确认 / 0 否决 / 1 待验证');

-- =====================================================================
-- 校验：全部在本事务内读取，ROLLBACK 前的状态
-- =====================================================================
SELECT '--- 1. 事件明细视图 ---' AS step;
SELECT code, risk_type, rule_code, rule_name, batch_no, metric_name,
       window_start_time, window_end_time, affected_length_m, handling_status, handler_name
FROM v_alert_event_detail WHERE code = 'QE-SMOKE-001';

SELECT '--- 2. 结论与工程师验证（证据条数应分别为 4 与 1）---' AS step;
SELECT c.seq, c.root_cause_category, c.engineer_decision, c.validation_result,
       (SELECT COUNT(*) FROM conclusion_evidence e WHERE e.conclusion_id = c.id) AS evidence_cnt
FROM analysis_conclusion c WHERE c.run_id = @run_id ORDER BY c.seq;

SELECT '--- 3. 8D 章节与来源标记（应为 8 行）---' AS step;
SELECT field_code, source_type, CHAR_LENGTH(COALESCE(content,'')) AS content_len
FROM eight_d_field WHERE report_id = @report_id ORDER BY field_code;

SELECT '--- 4. 归档快照与统计 ---' AS step;
SELECT a.code, a.total_conclusions, a.confirmed_count, a.rejected_count, a.pending_count,
       ac.seq, ac.engineer_decision,
       JSON_LENGTH(ac.basis_json, '$.basis') AS basis_cnt,
       JSON_LENGTH(ac.basis_json, '$.sources') AS source_cnt
FROM analysis_archive a
JOIN analysis_archive_conclusion ac ON ac.archive_id = a.id
WHERE a.id = @archive_id
ORDER BY ac.seq;

SELECT '--- 5. 生成列与通知回执 ---' AS step;
SELECT (SELECT COUNT(*) FROM equipment_reading_value) AS reading_values,
       (SELECT COUNT(*) FROM process_zone_value WHERE deviation_c IS NOT NULL) AS zone_deviations,
       (SELECT COUNT(*) FROM notification_recipient
         WHERE notification_id = @notification_id AND ack_status = 'acknowledged') AS acked;

ROLLBACK;

-- =====================================================================
-- 回滚核对：与进入事务前的基线一致，说明脚本没有留下任何痕迹
-- =====================================================================
SELECT '--- 6. ROLLBACK 后应与基线一致 ---' AS step;
SELECT @before_events      AS events_before,      (SELECT COUNT(*) FROM alert_event)         AS events_after,
       @before_reports     AS reports_before,     (SELECT COUNT(*) FROM eight_d_report)      AS reports_after,
       @before_archives    AS archives_before,    (SELECT COUNT(*) FROM analysis_archive)     AS archives_after,
       @before_conclusions AS conclusions_before, (SELECT COUNT(*) FROM analysis_conclusion) AS conclusions_after;

SELECT '--- 7. 临时数据应已消失（全部为 0）---' AS step;
SELECT (SELECT COUNT(*) FROM alert_event WHERE code LIKE 'QE-SMOKE-%')            AS smoke_events,
       (SELECT COUNT(*) FROM eight_d_report WHERE code LIKE '8D-SMOKE-%')         AS smoke_reports,
       (SELECT COUNT(*) FROM analysis_archive WHERE code LIKE 'AR-SMOKE-%')       AS smoke_archives,
       (SELECT COUNT(*) FROM inspection_value WHERE metric_id = 2 AND metric_value = 4.2600) AS trend_change_leftover;

-- =====================================================================
-- 8. 重复插入验证（独立会话、独立事务，预期失败）
-- ---------------------------------------------------------------------
-- 上面在事务内插入了 code = 'QE-SMOKE-001' 的事件，但事务已回滚，
-- 因此这里重新插入一条同去重键的事件，验证唯一键会拒绝它。
-- 期望：报 ERROR 1062 Duplicate entry ... for key 'alert_event.uk_alert_event_dedup'
-- 本段用独立事务，不依赖上面的变量，可单独复制执行。
-- =====================================================================
SET @batch_id  = (SELECT id FROM production_batch WHERE batch_no = '12121D0032' LIMIT 1);
SET @spec_id   = (SELECT spec_id FROM production_batch WHERE id = @batch_id);
SET @metric_id = (SELECT id FROM quality_metric WHERE code = 'min_wall_thickness' LIMIT 1);
SET @rule_id   = (SELECT id FROM alert_rule WHERE code = 'R4' LIMIT 1);
SET @r3        = (SELECT id FROM inspection_record WHERE batch_id = @batch_id
                   ORDER BY inspect_time LIMIT 1 OFFSET 2);

START TRANSACTION;
INSERT INTO alert_event
  (code, rule_id, rule_code, risk_type, batch_id, spec_id, metric_id,
   trigger_record_id, window_start_time, window_end_time, reason)
VALUES
  ('QE-SMOKE-DUP-A', @rule_id, 'R4', 'medium', @batch_id, @spec_id, @metric_id,
   @r3, '2026-10-10 08:20:00', '2026-10-10 09:37:00', '第一条：应插入成功');

-- 下面这条预期报 Duplicate entry（同一去重键），报错即代表唯一键生效
INSERT INTO alert_event
  (code, rule_id, rule_code, risk_type, batch_id, spec_id, metric_id,
   trigger_record_id, window_start_time, window_end_time, reason)
VALUES
  ('QE-SMOKE-DUP-B', @rule_id, 'R4', 'medium', @batch_id, @spec_id, @metric_id,
   @r3, '2026-10-10 08:20:00', '2026-10-10 09:37:00', '第二条：应被唯一键拒绝');

ROLLBACK;

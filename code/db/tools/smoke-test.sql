-- =====================================================================
-- 写路径冒烟测试：预警事件 → 分析结论 → 工程师验证 → 8D → 归档
-- ---------------------------------------------------------------------
-- 用途：验证表间外键、唯一键、生成列与视图在真实写入路径下可用。
-- 执行方式（全程在单个会话内，最后 ROLLBACK，不污染种子数据）：
--   mysql -uroot --default-character-set=utf8mb4 < tools/smoke-test.sql
-- 期望：全部语句成功，末尾校验查询返回 1 行事件、2 条结论、8 个 8D 章节。
-- =====================================================================

USE ppr_quality;
SET NAMES utf8mb4;
SET time_zone = '+08:00';

START TRANSACTION;

-- 1) 制造 R4 场景所需的趋势变化（原型场景 A：4.29 → 4.27 → 4.26）
UPDATE inspection_value v
JOIN inspection_record r ON r.id = v.record_id
JOIN production_batch b ON b.id = r.batch_id
SET v.metric_value = CASE r.inspect_time
      WHEN '2026-10-10 08:20:00' THEN 4.290
      WHEN '2026-10-10 09:05:00' THEN 4.270
      WHEN '2026-10-10 09:37:00' THEN 4.260 END
WHERE b.batch_no = '12121D0032'
  AND v.metric_id = 2
  AND r.inspect_time IN ('2026-10-10 08:20:00','2026-10-10 09:05:00','2026-10-10 09:37:00');

-- 2) 预警事件（R4 命中；77 分钟 × 12.7 m/min ≈ 977.9 m）
INSERT INTO alert_event
  (id, code, rule_id, rule_code, rule_version, risk_type, batch_id, spec_id, metric_id,
   trigger_record_id, window_start_time, window_end_time, reason, affected_length_m,
   line_speed_mpm, handling_status, handler_user_id, handled_at, handling_note)
VALUES
  (1, 'QE-20261010-001', 4, 'R4', 'v1', 'medium', 4, 1, 2,
   21, '2026-10-10 08:20:00', '2026-10-10 09:37:00',
   '最近 3 个可比较点变化 0.030 mm；运行连续性/停机换规格状态未提供，需人工复核，不预测必然不合格',
   977.90, 12.70, 'processing', 2, '2026-10-10 10:10:00', '已通知质量工程师复核趋势');

-- 3) 事件关联记录（窗口内可比较点 + 触发点）
INSERT INTO alert_event_record (event_id, record_id, is_triggering, sort_no) VALUES
  (1, 19, 0, 1),
  (1, 20, 0, 2),
  (1, 21, 1, 3);

-- 4) 去重键验证：同批次 + 同规则 + 同指标 + 同窗口起点应被拒绝
INSERT IGNORE INTO alert_event
  (id, code, rule_id, rule_code, risk_type, batch_id, spec_id, metric_id,
   trigger_record_id, window_start_time, window_end_time, reason)
VALUES
  (99, 'QE-20261010-001-DUP', 4, 'R4', 'medium', 4, 1, 2,
   21, '2026-10-10 08:20:00', '2026-10-10 09:37:00', '重复事件应被唯一键拒绝');

-- 5) 分析批次 + 参考版本快照
INSERT INTO analysis_run
  (id, code, event_id, metric_id, reference_batch_id, factor_parameter_id, run_no,
   generation_type, status, data_version_note, generated_by, generated_at)
VALUES
  (1, 'AN-20261010-001', 1, 2, 2, 3, 1, 'rule_based', 'completed',
   '基于 02 抽检 Mock Data 与数据源管理产品数据/设备采集数据', 2, '2026-10-10 10:12:00');

INSERT INTO analysis_reference_snapshot
  (run_id, reference_batch_id, reference_batch_no, spec_code, spec_name, production_group,
   metric_id, sample_count, median_value, min_value, max_value,
   material_condition, measurement_method, note)
VALUES
  (1, 2, '12121C0034', 'SPEC-25-42', '25×4.2', 'C组', 2, 7, 4.3100, 4.3100, 4.3200,
   'PPR塑料、抗菌母料、色母；牌号/比例/载体/层结构待确认',
   '演示测量记录；正式方法与仪器待确认', '同数据集内的模拟参考生产记录');

-- 6) 结构化结论 + 工程师验证（一条已确认、一条待验证）
INSERT INTO analysis_conclusion
  (id, run_id, seq, hypothesis, root_cause_category, observation, mechanism, mechanism_sources,
   missing_evidence, validation_actions, validation_method, engineer_decision,
   engineer_comment, validation_result, decided_by, decided_at)
VALUES
  (1, 1, 1,
   '最小壁厚最近 3 个可比较点在窗口内下降 0.030 mm，属于需要人工复核的变化，暂不能判定为过程异常',
   '趋势观察（非根因结论）',
   'Mock Data 中当前事件前最近三个有效点最小壁厚依次为 4.29、4.27、4.26 mm；运行连续性尚无记录。',
   '挤出管材尺寸变化研究仅提供排查背景，不能直接给出本款 PPR 管阈值。',
   CAST('[{"title":"温度与管材尺寸变化","url":"https://doi.org/10.1063/1.4965475"}]' AS JSON),
   '样管时间对应的生产时间/延迟、壁厚原始测点、其他壁厚测点、运行状态、牵引设定与调机记录均待补充。',
   '先核对原始检验单与连续生产状态，再复测周向/多点壁厚以区分整体变化与局部最薄处变化。',
   '现场复测 3 点并核对调机记录',
   'confirmed', '已按建议完成复测与记录核对', '复测 3 点确认最小壁厚下降，趋势成立',
   2, '2026-10-10 13:40:00'),
  (2, 1, 2,
   '最小壁厚当前值 4.260 mm，低于下边界 0.060 mm；演示对照范围仅供排查参考',
   '限值对照（待确认）',
   '最小壁厚当前 4.260 mm，演示对照范围 4.200–4.800 mm，落在范围内。',
   '正式标准与产品限值待确认，不作合格判定。',
   NULL,
   '正式标准条款、产品限值与适用规格待确认。',
   '核对正式限值后重新对照，并复测同一样管多个截面。',
   '按已确认检验方法复测',
   'pending', NULL, NULL, NULL, NULL);

INSERT INTO conclusion_evidence
  (conclusion_id, evidence_type, layer, content, fact_time, is_locateable, related_record_id, is_usable, sort_no)
VALUES
  (1, 'basis', '变化趋势', '最近 3 个可比较点：4.290 → 4.270 → 4.260 mm，下降 0.030 mm，相邻间隔 45 / 32 分钟。', '2026-10-10 09:37:00', 1, 21, 0, 1),
  (1, 'basis', '参考对照', '参考批次 12121C0034（C组）中位数 4.310 mm，抽检点 7 个；当前值低于该中位数 0.050 mm。', '2026-10-10 09:37:00', 1, 21, 0, 2),
  (1, 'support', '趋势观察', '记录 IR-019：最小壁厚 4.290 mm', '2026-10-10 08:20:00', 1, 19, 0, 3),
  (1, 'contradict', NULL, '现有材料没有停机、换规格或生产状态记录，无法确认连续性', NULL, 0, NULL, 0, 4),
  (2, 'basis', '限值对照', '最小壁厚当前 4.260 mm，演示对照范围 4.200–4.800 mm，距较近边界 0.060 mm。', '2026-10-10 09:37:00', 1, 21, 0, 1);

-- 7) 通知（角色广播）与收件回执
INSERT INTO notification (id, code, event_id, channel, subject, body, status, is_simulated, trigger_mode, created_by)
VALUES
  (1, 'NT-20261010-001', 1, 'email', '[中风险] PPR S2.5 25×4.2 瓷芯管 · 12121D0032',
   '批次 12121D0032 最小壁厚触发 R4 待复核趋势，请质量工程师验证趋势与潜在根因。',
   'simulated', 1, 'manual', 2);

INSERT INTO notification_recipient (notification_id, role_id, recipient_name, delivery_status, ack_status)
VALUES
  (1, 3, '质量工程师', 'sent', 'acknowledged'),
  (1, 4, '生产领班', 'sent', 'pending');

-- 8) 8D 报告：表头 + D1–D8 + 修订快照
INSERT INTO eight_d_report
  (id, code, event_id, batch_id, spec_id, production_group, metric_id, rule_code,
   window_start_time, window_end_time, affected_length_m, status, version_no, owner_user_id, saved_at)
VALUES
  (1, '8D-QE-20261010-001', 1, 4, 1, 'D组', 2, 'R4',
   '2026-10-10 08:20:00', '2026-10-10 09:37:00', 977.90, 'draft', 1, 2, '2026-10-10 14:00:00');

INSERT INTO eight_d_field (report_id, field_code, field_name, content, source_type, is_required) VALUES
  (1, 'D1', '问题描述（5W2H）', '在 2026-10-10 09:37，批次 12121D0032 的最小壁厚触发 R4 待复核趋势。', 'ai_prefill', 1),
  (1, 'D2', '组建团队与职责', '质量工程师：数据核对与根因验证；生产领班：现场记录与临时处置。', 'engineer', 1),
  (1, 'D3', '临时围堵措施', '建议先按 2026-10-10 08:20 至 09:37 的暴露时段核定隔离范围，约 977.9 m，最终隔离量须由工程师确认。', 'ai_prefill', 1),
  (1, 'D4', '根因分析与验证 · 6M', '已确认：最小壁厚窗口内下降趋势成立（复测 3 点）。', 'ai_prefill', 1),
  (1, 'D5', '永久纠正措施', '', 'pending', 1),
  (1, 'D6', '措施实施与效果验证', '', 'pending', 1),
  (1, 'D7', '预防再发生', '', 'pending', 1),
  (1, 'D8', '团队认可与结案', '', 'pending', 1);

INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary, content_snapshot)
VALUES
  (1, 1, 'create', 2, 'AI 预填 D1/D3/D4 并保存草稿',
   CAST('{"D1":"在 2026-10-10 09:37，批次 12121D0032 的最小壁厚触发 R4 待复核趋势。","D5":"","D8":""}' AS JSON));

-- 9) 归档（冻结快照）：结论 + 依据 JSON
INSERT INTO analysis_archive
  (id, code, event_id, run_id, batch_id, spec_id, metric_id, reference_batch_id,
   factor_parameter_id, risk_type, rule_code, event_time,
   total_conclusions, confirmed_count, rejected_count, pending_count, archived_by, remark)
VALUES
  (1, 'ARC-001', 1, 1, 4, 1, 2, 2, 3, 'medium', 'R4', '2026-10-10 09:37:00',
   2, 1, 0, 1, 2, '归档时结论与工程师记录已冻结');

INSERT INTO analysis_archive_conclusion
  (archive_id, seq, source_conclusion_id, hypothesis, root_cause_category, observation, mechanism,
   missing_evidence, validation_actions, validation_method, validation_result, engineer_comment,
   engineer_decision, decided_at, analysis_generated_at, basis_json)
VALUES
  (1, 1, 1,
   '最小壁厚最近 3 个可比较点在窗口内下降 0.030 mm，属于需要人工复核的变化，暂不能判定为过程异常',
   '趋势观察（非根因结论）',
   'Mock Data 中当前事件前最近三个有效点最小壁厚依次为 4.29、4.27、4.26 mm；运行连续性尚无记录。',
   '挤出管材尺寸变化研究仅提供排查背景，不能直接给出本款 PPR 管阈值。',
   '样管时间对应的生产时间/延迟、壁厚原始测点、运行状态待补充。',
   '先核对原始检验单与连续生产状态，再复测周向/多点壁厚。',
   '现场复测 3 点并核对调机记录',
   '复测 3 点确认最小壁厚下降，趋势成立',
   '已按建议完成复测与记录核对',
   'confirmed', '2026-10-10 13:40:00', '2026-10-10 10:12:00',
   CAST('{"basis":[{"layer":"变化趋势","text":"最近 3 个可比较点：4.290 → 4.270 → 4.260 mm","time":"2026-10-10 09:37:00","locate":true},{"layer":"参考对照","text":"参考批次 12121C0034 中位数 4.310 mm","time":"2026-10-10 09:37:00","locate":true}],"support":[{"text":"记录 IR-019：最小壁厚 4.290 mm","time":"2026-10-10 08:20:00"}],"contradict":[{"text":"缺少停机/换规格记录，无法确认连续性","time":null}],"sources":[{"title":"温度与管材尺寸变化","url":"https://doi.org/10.1063/1.4965475"}]}' AS JSON)),
  (1, 2, 2,
   '最小壁厚当前值 4.260 mm，低于下边界 0.060 mm；演示对照范围仅供排查参考',
   '限值对照（待确认）', NULL, NULL, NULL,
   '核对正式限值后重新对照。', NULL, NULL, NULL,
   'pending', NULL, '2026-10-10 10:12:00',
   CAST('{"basis":[{"layer":"限值对照","text":"最小壁厚 4.260 mm，演示范围 4.200–4.800 mm","time":"2026-10-10 09:37:00","locate":true}],"support":[],"contradict":[],"sources":[]}' AS JSON));

-- 10) 审计日志
INSERT INTO operation_log (user_id, module, action_type, target_type, target_id, detail) VALUES
  (2, 'diagnosis', 'ai_generate', 'analysis_run', '1', '整理 2 条结构化结论；参考版本 12121C0034'),
  (2, 'diagnosis', 'engineer_decision', 'analysis_conclusion', '1', '结论 1 → 确认'),
  (2, 'archive', 'archive', 'analysis_archive', '1', '归档分析快照 ARC-001：1 确认 / 0 否决 / 1 待验证');

-- =====================================================================
-- 校验
-- =====================================================================
SELECT '--- 1. 事件明细视图 ---' AS step;
SELECT code, risk_type, rule_code, rule_name, batch_no, metric_name,
       window_start_time, window_end_time, affected_length_m, handling_status, handler_name
FROM v_alert_event_detail;

SELECT '--- 2. 去重校验：重复事件是否被拒绝（应为 0） ---' AS step;
SELECT COUNT(*) AS duplicate_inserted FROM alert_event WHERE code = 'QE-20261010-001-DUP';

SELECT '--- 3. 结论与工程师验证 ---' AS step;
SELECT c.seq, c.root_cause_category, c.engineer_decision, c.validation_result,
       (SELECT COUNT(*) FROM conclusion_evidence e WHERE e.conclusion_id = c.id) AS evidence_cnt
FROM analysis_conclusion c ORDER BY c.seq;

SELECT '--- 4. 8D 章节与来源标记 ---' AS step;
SELECT field_code, source_type, CHAR_LENGTH(COALESCE(content,'')) AS content_len
FROM eight_d_field ORDER BY field_code;

SELECT '--- 5. 归档快照与统计 ---' AS step;
SELECT a.code, a.total_conclusions, a.confirmed_count, a.rejected_count, a.pending_count,
       ac.seq, ac.engineer_decision,
       JSON_LENGTH(ac.basis_json, '$.basis') AS basis_cnt,
       JSON_LENGTH(ac.basis_json, '$.sources') AS source_cnt
FROM analysis_archive a
JOIN analysis_archive_conclusion ac ON ac.archive_id = a.id
ORDER BY ac.seq;

SELECT '--- 6. 生成列与通知 ---' AS step;
SELECT (SELECT COUNT(*) FROM equipment_reading_value) AS reading_values,
       (SELECT COUNT(*) FROM process_zone_value WHERE deviation_c IS NOT NULL) AS zone_deviations,
       (SELECT COUNT(*) FROM notification_recipient WHERE ack_status = 'acknowledged') AS acked;

ROLLBACK;

SELECT '--- 7. ROLLBACK 后应回到种子状态（全部应为 0） ---' AS step;
SELECT (SELECT COUNT(*) FROM alert_event) AS alert_events,
       (SELECT COUNT(*) FROM analysis_conclusion) AS conclusions,
       (SELECT COUNT(*) FROM eight_d_report) AS reports,
       (SELECT COUNT(*) FROM analysis_archive) AS archives,
       (SELECT COUNT(*) FROM inspection_value WHERE metric_id = 2 AND metric_value = 4.2600) AS scenario_a_leftover;

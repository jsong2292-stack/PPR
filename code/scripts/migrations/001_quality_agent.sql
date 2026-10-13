-- ============================================================================
-- PPR异常诊断双模式升级：规则引擎 + LangChain Agent
-- 本迁移通过 information_schema 判断列是否存在，可安全重复执行。
-- ============================================================================

INSERT INTO system_config (`key`, value, description) VALUES
  ('quality_analysis_mode', 'rule', '异常诊断模式：rule规则引擎、agent LangChain智能体'),
  ('quality_agent_model', 'gpt-6-luna', 'LangChain Agent使用的模型名称'),
  ('quality_agent_fallback_to_rule', 'true', 'Agent失败或未配置密钥时是否自动降级规则引擎'),
  ('quality_agent_max_tool_rounds', '8', 'Agent单次分析最大工具调用轮数'),
  ('quality_agent_reasoning_effort', 'low', 'Agent推理强度：none/minimal/low/medium/high')
ON DUPLICATE KEY UPDATE description=VALUES(description);

SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='engine_type')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN engine_type ENUM('rule','agent') NOT NULL DEFAULT 'rule' COMMENT '分析引擎：规则引擎或LangChain Agent' AFTER evidence_snapshot", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='model_name')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN model_name VARCHAR(100) NULL COMMENT 'Agent模式实际使用的模型名称' AFTER engine_type", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='prompt_version')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN prompt_version VARCHAR(64) NULL COMMENT '规则模板或Agent提示词版本' AFTER model_name", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='agent_version')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN agent_version VARCHAR(64) NULL COMMENT 'Agent编排实现版本' AFTER prompt_version", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='tool_trace_json')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN tool_trace_json JSON NULL COMMENT 'Agent工具调用轨迹及返回证据' AFTER agent_version", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='token_usage_json')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN token_usage_json JSON NULL COMMENT '模型Token使用统计' AFTER tool_trace_json", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='raw_response_json')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN raw_response_json JSON NULL COMMENT '模型原始消息的可审计快照' AFTER token_usage_json", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='latency_ms')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN latency_ms INT UNSIGNED NULL COMMENT '本次分析总耗时，单位毫秒' AFTER raw_response_json", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_run' AND column_name='fallback_reason')=0,
  "ALTER TABLE ppr_analysis_run ADD COLUMN fallback_reason TEXT NULL COMMENT 'Agent降级到规则引擎的原因' AFTER latency_ms", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_conclusion' AND column_name='confidence')=0,
  "ALTER TABLE ppr_analysis_conclusion ADD COLUMN confidence DECIMAL(5,4) NULL COMMENT '证据完备度置信分，0到1，不代表根因概率' AFTER validation_action", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_conclusion' AND column_name='evidence_source_ids')=0,
  "ALTER TABLE ppr_analysis_conclusion ADD COLUMN evidence_source_ids JSON NULL COMMENT '本结论引用的产品、设备或事件业务编号' AFTER confidence", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_conclusion' AND column_name='generated_by_model')=0,
  "ALTER TABLE ppr_analysis_conclusion ADD COLUMN generated_by_model VARCHAR(100) NULL COMMENT '生成本结论的模型名称，规则模式为空' AFTER evidence_source_ids", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @ddl=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ppr_analysis_conclusion' AND column_name='engineer_modified')=0,
  "ALTER TABLE ppr_analysis_conclusion ADD COLUMN engineer_modified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '工程师是否修改或补充过本结论' AFTER generated_by_model", 'SELECT 1'); PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 011 8D 报告生成审计字段
--
-- 背景：8D 报告的 D1–D8 原先由接口内的固定模板文字生成，无法追溯是谁、用哪个模型、
-- 依据哪些证据生成。改为「8D 生成 Agent」后，报告需要与 ppr_analysis_run 一样保留
-- 生成引擎、模型、提示词版本、工具证据轨迹与耗时，供工程师复核与审计。
--
-- 幂等：MySQL 不支持 ALTER TABLE ... ADD COLUMN IF NOT EXISTS，
--       每列先用 information_schema.columns 判断后再决定是否 ALTER。
--       新增列均可空，不会影响既有报告数据。
-- ---------------------------------------------------------------------------

-- 生成引擎：agent=LangChain Agent，rule=确定性模板降级
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'generation_engine');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN generation_engine ENUM(''rule'',''agent'') NULL COMMENT ''本稿生成的引擎：LangChain Agent 或规则模板'' AFTER owner_name',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 实际使用的模型名称
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'model_name');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN model_name VARCHAR(100) NULL COMMENT ''生成本稿的模型名称，规则模板为空'' AFTER generation_engine',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 提示词版本 / 编排版本
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'prompt_version');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN prompt_version VARCHAR(64) NULL COMMENT ''8D 生成提示词版本'' AFTER model_name',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'agent_version');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN agent_version VARCHAR(64) NULL COMMENT ''Agent 编排实现版本'' AFTER prompt_version',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 工具调用轨迹与证据快照
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'tool_trace_json');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN tool_trace_json JSON NULL COMMENT ''8D Agent 工具调用轨迹及返回证据'' AFTER agent_version',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'latency_ms');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN latency_ms INT UNSIGNED NULL COMMENT ''本次生成总耗时，单位毫秒'' AFTER tool_trace_json',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'fallback_reason');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN fallback_reason TEXT NULL COMMENT ''Agent 降级到规则模板的原因'' AFTER latency_ms',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 生成人与生成时间
SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'generated_by');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN generated_by VARCHAR(100) NULL COMMENT ''本稿生成发起人'' AFTER fallback_reason',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_eight_d_report' AND column_name = 'generated_at');
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_eight_d_report ADD COLUMN generated_at DATETIME NULL COMMENT ''本稿生成时间'' AFTER generated_by',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

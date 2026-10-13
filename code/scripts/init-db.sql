-- ==========================================
-- 通用平台脚手架 - 数据库初始化脚本
-- 数据库：MySQL 8.0+
-- 执行：mysql -h 127.0.0.1 -P 3306 -u root -p platform_demo < scripts/init-db.sql
-- ==========================================

SET NAMES utf8mb4;

-- ==========================================
-- 系统
-- ==========================================

-- 健康检查表：用于探活与连接自检
CREATE TABLE IF NOT EXISTS health_check (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 系统配置：key-value 形式的全局开关与参数
-- 注意：`key` 是 MySQL 保留字，引用时必须使用反引号
CREATE TABLE IF NOT EXISTS system_config (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY system_config_key_key (`key`),
  KEY system_config_key_idx (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_config (`key`, value, description) VALUES
  ('enable_register', 'true', '是否开放用户注册（true/false）'),
  ('enable_file_upload', 'true', '是否开放文件上传（true/false）'),
  ('enable_file_preview', 'true', '是否启用文件在线预览（true/false）'),
  ('max_file_size', '500', '文件上传大小上限（MB）'),
  ('enable_sso_auto_login', 'false', '未登录时是否自动跳转单点登录（true/false）'),
  ('quality_analysis_mode', 'rule', '异常诊断模式：rule规则引擎、agent LangChain智能体'),
  ('quality_agent_model', 'gpt-6-luna', 'LangChain Agent使用的模型名称'),
  ('quality_agent_fallback_to_rule', 'true', 'Agent失败或未配置密钥时是否自动降级规则引擎'),
  ('quality_agent_max_tool_rounds', '8', 'Agent单次分析最大工具调用轮数'),
  ('quality_agent_reasoning_effort', 'low', 'Agent推理强度：none/minimal/low/medium/high')
ON DUPLICATE KEY UPDATE `key` = `key`;

-- ==========================================
-- 用户
-- ==========================================

-- id 使用 UUID（字符串），由应用层生成；此处默认值仅作为兜底
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()),
  -- 登录账号（本地账号体系中即用户名），单点登录用户可为空
  phone VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  nickname VARCHAR(100) NOT NULL,
  avatar TEXT,
  password TEXT,
  -- 部门 / 岗位
  industry VARCHAR(100),
  -- 专长 / 标签
  expertise TEXT,
  bio TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- 单点登录返回的外部用户标识
  external_id VARCHAR(128),
  -- 认证来源：local / sso
  auth_provider VARCHAR(20) DEFAULT 'local',
  login_fail_count INT DEFAULT 0,
  frozen_until DATETIME NULL DEFAULT NULL,
  last_login_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_phone_key (phone),
  UNIQUE KEY users_email_key (email),
  KEY users_phone_idx (phone),
  KEY users_email_idx (email),
  KEY users_external_id_idx (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 关注关系
CREATE TABLE IF NOT EXISTS follows (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  follower_id VARCHAR(36) NOT NULL,
  following_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY follows_follower_id_following_id_key (follower_id, following_id),
  KEY follows_follower_id_idx (follower_id),
  KEY follows_following_id_idx (following_id),
  CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 消息
-- ==========================================

-- 站内通知
CREATE TABLE IF NOT EXISTS messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  related_id INT NULL,
  related_type VARCHAR(30),
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY messages_user_id_idx (user_id),
  KEY messages_is_read_idx (is_read),
  CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 私信会话
CREATE TABLE IF NOT EXISTS conversations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user1_id VARCHAR(36) NOT NULL,
  user2_id VARCHAR(36) NOT NULL,
  last_message TEXT,
  last_message_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY conversations_user1_id_user2_id_key (user1_id, user2_id),
  KEY conversations_user1_id_idx (user1_id),
  KEY conversations_user2_id_idx (user2_id),
  CONSTRAINT conversations_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT conversations_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 私信消息
CREATE TABLE IF NOT EXISTS private_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  receiver_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY private_messages_conversation_id_idx (conversation_id),
  KEY private_messages_sender_id_idx (sender_id),
  KEY private_messages_receiver_id_idx (receiver_id),
  CONSTRAINT private_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT private_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT private_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 文件
-- ==========================================

CREATE TABLE IF NOT EXISTS uploaded_files (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  url TEXT NOT NULL,
  mime_type VARCHAR(200),
  category VARCHAR(30),
  size BIGINT,
  uploader_id VARCHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uploaded_files_filename_key (filename),
  KEY uploaded_files_uploader_id_idx (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 行为埋点 / 审计
-- ==========================================

CREATE TABLE IF NOT EXISTS user_behaviors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(36) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id INT NOT NULL,
  action VARCHAR(30) NOT NULL,
  duration INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY user_behaviors_user_id_idx (user_id),
  KEY user_behaviors_target_idx (target_type, target_id),
  KEY user_behaviors_created_at_idx (created_at),
  CONSTRAINT user_behaviors_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_type VARCHAR(30) NOT NULL,
  target_id INT NOT NULL,
  auditor_id VARCHAR(36) NOT NULL,
  action VARCHAR(30),
  status VARCHAR(20) NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY audits_target_idx (target_type, target_id),
  KEY audits_auditor_id_idx (auditor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 完成
-- ==========================================
-- 建表完成后访问 /install 创建管理员账号，
-- 或手动执行（id 由 UUID() 自动生成）：
--   INSERT INTO users (phone, nickname, password, role, status)
--   VALUES ('admin', '管理员', '<bcrypt hash>', 'admin', 'active');

-- ============================================================================
-- PPR 过程质量异常智能分析助手业务库表
-- 说明：以下表承载“主数据 → 产品/设备数据 → 预警 → 诊断 → 8D → 历史归档”全流程。
-- 所有表均采用 ppr_ 前缀，避免与平台认证、消息、文件等基础表冲突。
-- ============================================================================

-- 产品类别：维护 PPR 管材等产品大类。
CREATE TABLE IF NOT EXISTS ppr_product_category (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  code VARCHAR(64) NOT NULL COMMENT '产品类别编码，全局唯一',
  name VARCHAR(100) NOT NULL COMMENT '产品类别名称',
  description VARCHAR(500) NULL COMMENT '产品类别说明',
  status ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_product_category_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品类别主数据';

-- 产品规格：定义最大/最小外径、最大/最小壁厚及不圆度上限，作为监控判定限值。
CREATE TABLE IF NOT EXISTS ppr_product_spec (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  code VARCHAR(64) NOT NULL COMMENT '产品规格编码，全局唯一',
  name VARCHAR(120) NOT NULL COMMENT '产品规格名称',
  category_id BIGINT UNSIGNED NOT NULL COMMENT '所属产品类别ID',
  outer_diameter_mm DECIMAL(10,3) NULL COMMENT '公称外径（历史字段，界面已改用最大/最小外径），单位mm',
  wall_thickness_mm DECIMAL(10,3) NULL COMMENT '公称壁厚（历史字段，界面已改用最大/最小壁厚），单位mm',
  outer_lower_mm DECIMAL(10,3) NOT NULL COMMENT '外径下限，界面显示为「最小外径」，单位mm',
  outer_upper_mm DECIMAL(10,3) NOT NULL COMMENT '外径上限，界面显示为「最大外径」，单位mm',
  wall_lower_mm DECIMAL(10,3) NOT NULL COMMENT '壁厚下限，界面显示为「最小壁厚」，单位mm',
  wall_upper_mm DECIMAL(10,3) NOT NULL COMMENT '壁厚上限，界面显示为「最大壁厚」，单位mm',
  ovality_upper_mm DECIMAL(10,3) NOT NULL COMMENT '不圆度演示上限，单位mm',
  status ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_product_spec_code (code),
  KEY idx_ppr_product_spec_category (category_id),
  CONSTRAINT fk_ppr_product_spec_category FOREIGN KEY (category_id) REFERENCES ppr_product_category(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品规格主数据与演示限值';

-- 设备类型：挤出机、牵引机等设备分类。
CREATE TABLE IF NOT EXISTS ppr_equipment_type (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  code VARCHAR(64) NOT NULL COMMENT '设备类型编码，全局唯一',
  name VARCHAR(100) NOT NULL COMMENT '设备类型名称',
  description VARCHAR(500) NULL COMMENT '设备类型说明',
  status ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_equipment_type_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR设备类型主数据';

-- 设备台账：设备与产线的基础信息。
CREATE TABLE IF NOT EXISTS ppr_equipment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  code VARCHAR(64) NOT NULL COMMENT '设备编码，全局唯一',
  name VARCHAR(100) NOT NULL COMMENT '设备名称',
  type_id BIGINT UNSIGNED NOT NULL COMMENT '设备类型ID',
  line_name VARCHAR(100) NOT NULL COMMENT '所属产线或工段名称',
  status ENUM('enabled','disabled','maintenance') NOT NULL DEFAULT 'enabled' COMMENT '设备状态：启用、停用、检修',
  description VARCHAR(500) NULL COMMENT '设备说明',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_equipment_code (code),
  KEY idx_ppr_equipment_type (type_id),
  CONSTRAINT fk_ppr_equipment_type FOREIGN KEY (type_id) REFERENCES ppr_equipment_type(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR生产设备台账';

-- 生产批次：连接规格、设备、生产时间和后续质量记录。
CREATE TABLE IF NOT EXISTS ppr_batch (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  batch_no VARCHAR(64) NOT NULL COMMENT '生产批次号，全局唯一',
  spec_id BIGINT UNSIGNED NOT NULL COMMENT '产品规格ID',
  extruder_id BIGINT UNSIGNED NULL COMMENT '挤出机设备ID',
  haul_off_id BIGINT UNSIGNED NULL COMMENT '牵引机设备ID',
  production_group VARCHAR(64) NOT NULL COMMENT '生产组别',
  start_time DATETIME NOT NULL COMMENT '生产开始时间',
  end_time DATETIME NULL COMMENT '生产结束时间',
  status ENUM('running','completed','paused') NOT NULL DEFAULT 'completed' COMMENT '批次状态：生产中、已完成、暂停',
  data_source VARCHAR(64) NOT NULL DEFAULT 'MES' COMMENT '批次基础信息来源系统',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_batch_no (batch_no),
  KEY idx_ppr_batch_spec (spec_id),
  CONSTRAINT fk_ppr_batch_spec FOREIGN KEY (spec_id) REFERENCES ppr_product_spec(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ppr_batch_extruder FOREIGN KEY (extruder_id) REFERENCES ppr_equipment(id) ON DELETE SET NULL,
  CONSTRAINT fk_ppr_batch_haul_off FOREIGN KEY (haul_off_id) REFERENCES ppr_equipment(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR生产批次基础信息';

-- 质量指标及影响因素：纯指标字典（编码/名称/单位/影响因素/说明）；判定限值统一取产品规格表 ppr_product_spec。
CREATE TABLE IF NOT EXISTS ppr_metric (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  code VARCHAR(64) NOT NULL COMMENT '指标编码，全局唯一',
  name VARCHAR(100) NOT NULL COMMENT '指标名称',
  unit VARCHAR(20) NOT NULL COMMENT '计量单位',
  lower_limit DECIMAL(12,4) NULL COMMENT '已弃用：判定限值统一取产品规格表 ppr_product_spec，本列仅留有历史数据',
  upper_limit DECIMAL(12,4) NULL COMMENT '已弃用：判定限值统一取产品规格表 ppr_product_spec，本列仅留有历史数据',
  influences VARCHAR(1000) NULL COMMENT '可能影响因素，仅作为排查方向',
  description VARCHAR(1000) NULL COMMENT '指标口径与说明',
  status ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_metric_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR质量指标与影响因素字典';

-- 产品检验数据：一条样管记录包含外径、壁厚和不圆度相关测量值。
CREATE TABLE IF NOT EXISTS ppr_product_measurement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  record_no VARCHAR(64) NOT NULL COMMENT '检验记录编号，全局唯一',
  sample_no VARCHAR(64) NOT NULL COMMENT '样管编号',
  batch_id BIGINT UNSIGNED NOT NULL COMMENT '所属生产批次ID',
  inspect_time DATETIME NOT NULL COMMENT '检验时间',
  outer_diameter_mm DECIMAL(10,3) NULL COMMENT '外径测量值，单位mm',
  min_wall_thickness_mm DECIMAL(10,3) NULL COMMENT '壁厚，单位mm',
  max_wall_thickness_mm DECIMAL(10,3) NULL COMMENT '最大壁厚，单位mm',
  max_outer_diameter_mm DECIMAL(10,3) NULL COMMENT '同截面最大外径，单位mm',
  min_outer_diameter_mm DECIMAL(10,3) NULL COMMENT '同截面最小外径，单位mm',
  ovality_mm DECIMAL(10,3) NULL COMMENT '不圆度，通常为最大外径减最小外径，单位mm',
  data_source VARCHAR(64) NOT NULL DEFAULT 'QMS' COMMENT '数据来源系统，如QMS、MES或人工导入',
  quality_flag ENUM('normal','medium','high','error') NOT NULL DEFAULT 'normal' COMMENT '质量标记：正常、中风险、高风险、数据错误',
  remark VARCHAR(500) NULL COMMENT '检验备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_measurement_record_no (record_no),
  KEY idx_ppr_measurement_batch_time (batch_id, inspect_time),
  CONSTRAINT fk_ppr_measurement_batch FOREIGN KEY (batch_id) REFERENCES ppr_batch(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品检验数据';

-- 设备采集数据：按批次、设备和时刻保存关键工艺参数。
CREATE TABLE IF NOT EXISTS ppr_equipment_reading (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  record_no VARCHAR(64) NOT NULL COMMENT '设备采集记录编号，全局唯一',
  batch_id BIGINT UNSIGNED NOT NULL COMMENT '所属生产批次ID',
  equipment_id BIGINT UNSIGNED NOT NULL COMMENT '采集设备ID',
  collect_time DATETIME NOT NULL COMMENT '设备数据采集时间',
  temperature_c DECIMAL(10,2) NULL COMMENT '温度，单位摄氏度',
  pressure_mpa DECIMAL(10,3) NULL COMMENT '压力，单位MPa',
  haul_off_speed_mpm DECIMAL(10,3) NULL COMMENT '牵引速度，单位m/min',
  data_source VARCHAR(64) NOT NULL DEFAULT 'SCADA' COMMENT '设备数据来源系统',
  remark VARCHAR(500) NULL COMMENT '采集备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_equipment_reading_no (record_no),
  KEY idx_ppr_equipment_reading_batch_time (batch_id, collect_time),
  KEY idx_ppr_equipment_reading_equipment (equipment_id),
  CONSTRAINT fk_ppr_reading_batch FOREIGN KEY (batch_id) REFERENCES ppr_batch(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ppr_reading_equipment FOREIGN KEY (equipment_id) REFERENCES ppr_equipment(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR设备工艺参数采集数据';

-- 质量预警事件：由扫描规则从产品数据中产生，是后续诊断的入口。
CREATE TABLE IF NOT EXISTS ppr_alert_event (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  event_no VARCHAR(64) NOT NULL COMMENT '预警事件编号，全局唯一',
  measurement_id BIGINT UNSIGNED NOT NULL COMMENT '触发预警的产品检验记录ID',
  metric_code VARCHAR(64) NOT NULL COMMENT '触发指标编码',
  risk_level ENUM('normal','medium','high','error') NOT NULL COMMENT '风险级别：正常、中风险、高风险、数据错误',
  rule_code VARCHAR(32) NOT NULL COMMENT '触发规则编码',
  rule_name VARCHAR(200) NOT NULL COMMENT '触发规则名称',
  observed_value DECIMAL(12,4) NULL COMMENT '触发时的观测值',
  threshold_text VARCHAR(200) NULL COMMENT '触发阈值文本快照',
  status ENUM('open','analyzing','closed') NOT NULL DEFAULT 'open' COMMENT '事件状态：待分析、分析中、已关闭',
  detected_at DATETIME NOT NULL COMMENT '预警识别时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_alert_event_no (event_no),
  UNIQUE KEY uk_ppr_alert_measurement_metric_rule (measurement_id, metric_code, rule_code),
  KEY idx_ppr_alert_status_time (status, detected_at),
  CONSTRAINT fk_ppr_alert_measurement FOREIGN KEY (measurement_id) REFERENCES ppr_product_measurement(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR质量监控预警事件';

-- 分析任务：保存一次针对预警事件的诊断运行及输入快照。
CREATE TABLE IF NOT EXISTS ppr_analysis_run (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  run_no VARCHAR(64) NOT NULL COMMENT '分析任务编号，全局唯一',
  alert_id BIGINT UNSIGNED NOT NULL COMMENT '关联预警事件ID',
  status ENUM('generated','reviewing','completed') NOT NULL DEFAULT 'generated' COMMENT '分析状态：已生成、复核中、已完成',
  summary TEXT NOT NULL COMMENT '分析摘要',
  evidence_snapshot JSON NULL COMMENT '生成时使用的产品、设备、限值和趋势证据快照',
  engine_type ENUM('rule','agent') NOT NULL DEFAULT 'rule' COMMENT '分析引擎：规则引擎或LangChain Agent',
  model_name VARCHAR(100) NULL COMMENT 'Agent模式实际使用的模型名称',
  prompt_version VARCHAR(64) NULL COMMENT '规则模板或Agent提示词版本',
  agent_version VARCHAR(64) NULL COMMENT 'Agent编排实现版本',
  tool_trace_json JSON NULL COMMENT 'Agent工具调用轨迹及返回证据',
  token_usage_json JSON NULL COMMENT '模型Token使用统计',
  raw_response_json JSON NULL COMMENT '模型原始消息的可审计快照',
  latency_ms INT UNSIGNED NULL COMMENT '本次分析总耗时，单位毫秒',
  fallback_reason TEXT NULL COMMENT 'Agent降级到规则引擎的原因',
  generated_by VARCHAR(100) NULL COMMENT '分析发起人名称或账号',
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '分析生成时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_analysis_run_no (run_no),
  KEY idx_ppr_analysis_alert (alert_id),
  CONSTRAINT fk_ppr_analysis_alert FOREIGN KEY (alert_id) REFERENCES ppr_alert_event(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR异常诊断分析任务';

-- 分析结论：支持工程师逐条确认、驳回并记录验证信息。
CREATE TABLE IF NOT EXISTS ppr_analysis_conclusion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  analysis_id BIGINT UNSIGNED NOT NULL COMMENT '所属分析任务ID',
  sort_no INT NOT NULL DEFAULT 0 COMMENT '同一分析内展示顺序',
  category VARCHAR(100) NOT NULL COMMENT '结论类别，如限值对照、趋势观察、相关因素变化',
  hypothesis TEXT NOT NULL COMMENT '待验证结论或假设内容',
  evidence TEXT NULL COMMENT '支持证据说明',
  missing_evidence TEXT NULL COMMENT '缺失证据说明',
  validation_action TEXT NULL COMMENT '建议验证动作',
  confidence DECIMAL(5,4) NULL COMMENT '证据完备度置信分，0到1，不代表根因概率',
  evidence_source_ids JSON NULL COMMENT '本结论引用的产品、设备或事件业务编号',
  generated_by_model VARCHAR(100) NULL COMMENT '生成本结论的模型名称，规则模式为空',
  engineer_modified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '工程师是否修改或补充过本结论',
  engineer_decision ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'pending' COMMENT '工程师判定：待处理、已确认、已驳回',
  engineer_comment TEXT NULL COMMENT '工程师意见',
  actual_finding TEXT NULL COMMENT '现场验证实际发现',
  updated_by VARCHAR(100) NULL COMMENT '最近更新人',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_ppr_conclusion_analysis (analysis_id, sort_no),
  CONSTRAINT fk_ppr_conclusion_analysis FOREIGN KEY (analysis_id) REFERENCES ppr_analysis_run(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR异常诊断结论与工程师验证';

-- 8D报告：一个分析任务对应一份8D报告，D1-D8均可编辑并定稿。
CREATE TABLE IF NOT EXISTS ppr_eight_d_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  report_no VARCHAR(64) NOT NULL COMMENT '8D报告编号，全局唯一',
  analysis_id BIGINT UNSIGNED NOT NULL COMMENT '关联分析任务ID，一次分析仅一份报告',
  title VARCHAR(200) NOT NULL COMMENT '报告标题',
  d1 TEXT NULL COMMENT 'D1组建团队',
  d2 TEXT NULL COMMENT 'D2问题描述',
  d3 TEXT NULL COMMENT 'D3临时围堵措施',
  d4 TEXT NULL COMMENT 'D4根因分析与验证',
  d5 TEXT NULL COMMENT 'D5永久纠正措施选择',
  d6 TEXT NULL COMMENT 'D6永久纠正措施实施与验证',
  d7 TEXT NULL COMMENT 'D7预防再发生',
  d8 TEXT NULL COMMENT 'D8团队表彰与结案',
  status ENUM('draft','finalized') NOT NULL DEFAULT 'draft' COMMENT '报告状态：草稿、已定稿',
  owner_name VARCHAR(100) NULL COMMENT '报告负责人',
  finalized_at DATETIME NULL COMMENT '报告定稿时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_report_no (report_no),
  UNIQUE KEY uk_ppr_report_analysis (analysis_id),
  CONSTRAINT fk_ppr_report_analysis FOREIGN KEY (analysis_id) REFERENCES ppr_analysis_run(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR过程异常8D报告';

-- 历史归档：报告定稿时生成不可变业务摘要，供历史分析检索。
CREATE TABLE IF NOT EXISTS ppr_history_archive (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  archive_no VARCHAR(64) NOT NULL COMMENT '归档编号，全局唯一',
  report_id BIGINT UNSIGNED NOT NULL COMMENT '来源8D报告ID',
  event_no VARCHAR(64) NOT NULL COMMENT '来源预警事件编号快照',
  batch_no VARCHAR(64) NOT NULL COMMENT '来源生产批次号快照',
  metric_code VARCHAR(64) NOT NULL COMMENT '来源异常指标编码快照',
  risk_level VARCHAR(32) NOT NULL COMMENT '来源风险级别快照',
  problem_summary TEXT NOT NULL COMMENT '问题摘要快照',
  confirmed_root_cause TEXT NULL COMMENT '已确认根因或主要验证结论快照',
  corrective_action TEXT NULL COMMENT '永久纠正措施快照',
  archived_by VARCHAR(100) NULL COMMENT '归档操作人',
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_history_archive_no (archive_no),
  UNIQUE KEY uk_ppr_history_report (report_id),
  CONSTRAINT fk_ppr_history_report FOREIGN KEY (report_id) REFERENCES ppr_eight_d_report(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR质量异常历史归档';

-- 平台演示管理员：仅用于本地首次启动，生产部署必须修改密码或通过安装向导创建管理员。
INSERT INTO users (id, phone, email, nickname, password, role, status, auth_provider)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'admin@local.demo', '质量平台管理员', '$2b$10$Xn3Xw9bnTqTNYfns8Ig.reoOWmU9G3V3btkuB2o/Qmbt2yhf33Wdy', 'admin', 'active', 'local')
ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), role = 'admin', status = 'active';

-- 业务演示种子：均为可替换的本地模拟数据，用于串通平台全流程。
INSERT INTO ppr_product_category (id, code, name, description, status) VALUES
  (1, 'CAT-PPR', 'PPR 管材', '无规共聚聚丙烯管材', 'enabled'),
  (2, 'CAT-FITTING', 'PPR 管件', 'PPR 配套管件', 'enabled')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), status=VALUES(status);

INSERT INTO ppr_product_spec (id, code, name, category_id, outer_diameter_mm, wall_thickness_mm, outer_lower_mm, outer_upper_mm, wall_lower_mm, wall_upper_mm, ovality_upper_mm, status) VALUES
  (1, 'SPEC-25X4.2', 'PPR S2.5 25×4.2 瓷芯管', 1, 25.000, 4.200, 25.000, 25.500, 4.200, 4.800, 0.350, 'enabled'),
  (2, 'SPEC-20X3.4', 'PPR S2.5 20×3.4 管', 1, 20.000, 3.400, 20.000, 20.400, 3.400, 4.000, 0.300, 'enabled')
ON DUPLICATE KEY UPDATE name=VALUES(name), category_id=VALUES(category_id), status=VALUES(status);

INSERT INTO ppr_equipment_type (id, code, name, description, status) VALUES
  (1, 'ETYPE-EXTRUDER', '挤出机', '负责塑化与挤出成型', 'enabled'),
  (2, 'ETYPE-HAULOFF', '牵引机', '负责稳定牵引速度', 'enabled'),
  (3, 'ETYPE-GAUGE', '在线测径仪', '在线采集外径数据', 'enabled')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), status=VALUES(status);

INSERT INTO ppr_equipment (id, code, name, type_id, line_name, status, description) VALUES
  (1, 'EQ-EX-01', '1号挤出机', 1, '演示线 A', 'enabled', 'PPR管材主挤出设备'),
  (2, 'EQ-HA-01', '1号牵引机', 2, '演示线 A', 'enabled', 'PPR管材牵引设备'),
  (3, 'EQ-GA-01', '1号在线测径仪', 3, '演示线 A', 'enabled', '演示在线测径设备')
ON DUPLICATE KEY UPDATE name=VALUES(name), type_id=VALUES(type_id), line_name=VALUES(line_name), status=VALUES(status);

INSERT INTO ppr_batch (id, batch_no, spec_id, extruder_id, haul_off_id, production_group, start_time, end_time, status, data_source) VALUES
  (1, '12121D0032', 1, 1, 2, '甲班', '2026-10-10 06:00:00', '2026-10-10 16:00:00', 'completed', 'MES'),
  (2, '12121D0033', 1, 1, 2, '乙班', '2026-10-11 06:00:00', '2026-10-11 16:00:00', 'completed', 'MES'),
  (3, '12121D0034', 1, 1, 2, '甲班', '2026-10-12 06:00:00', '2026-10-12 16:00:00', 'completed', 'MES'),
  (4, '12121D0035', 2, 1, 2, '乙班', '2026-10-12 18:00:00', '2026-10-13 02:00:00', 'completed', 'MES')
ON DUPLICATE KEY UPDATE spec_id=VALUES(spec_id), production_group=VALUES(production_group), start_time=VALUES(start_time), status=VALUES(status);

INSERT INTO ppr_metric (id, code, name, unit, influences, description, status) VALUES
  (1, 'outer_diameter', '外径', 'mm', '定径套、真空度、冷却水温、牵引速度', '测量管材外径；判定限值取产品规格，正式判定以适用标准为准', 'enabled'),
  (2, 'min_wall_thickness', '壁厚', 'mm', '挤出量、牵引速度、模具偏心、原料波动', '仅最薄点不能代表整体壁厚分布', 'enabled'),
  (3, 'ovality', '不圆度', 'mm', '定径冷却、支撑、牵引、测量截面', '同一样管同一截面最大外径减最小外径', 'enabled')
ON DUPLICATE KEY UPDATE name=VALUES(name), unit=VALUES(unit), influences=VALUES(influences), status=VALUES(status);

INSERT INTO ppr_product_measurement (id, record_no, sample_no, batch_id, inspect_time, outer_diameter_mm, min_wall_thickness_mm, max_wall_thickness_mm, max_outer_diameter_mm, min_outer_diameter_mm, ovality_mm, data_source, quality_flag, remark) VALUES
  (1, 'IR-20261010-001', 'S-001', 1, '2026-10-10 08:20:00', 25.230, 4.320, 4.430, 25.310, 25.120, 0.190, 'QMS', 'normal', '基线点'),
  (2, 'IR-20261010-002', 'S-002', 1, '2026-10-10 09:05:00', 25.240, 4.290, 4.410, 25.330, 25.110, 0.220, 'QMS', 'medium', '壁厚呈下降趋势'),
  (3, 'IR-20261010-003', 'S-003', 1, '2026-10-10 09:37:00', 25.250, 4.260, 4.390, 25.350, 25.100, 0.250, 'QMS', 'medium', '连续趋势触发'),
  (4, 'IR-20261010-004', 'S-004', 1, '2026-10-10 10:15:00', 25.260, 4.310, 4.420, 25.360, 25.120, 0.240, 'QMS', 'normal', '趋势恢复'),
  (5, 'IR-20261011-001', 'S-101', 2, '2026-10-11 08:00:00', 25.220, 4.340, 4.460, 25.320, 25.100, 0.220, 'QMS', 'normal', '参考批次'),
  (6, 'IR-20261011-002', 'S-102', 2, '2026-10-11 09:00:00', 25.230, 4.330, 4.450, 25.550, 25.120, 0.430, 'QMS', 'high', '不圆度超过演示上限'),
  (7, 'IR-20261011-003', 'S-103', 2, '2026-10-11 10:00:00', 25.240, 4.350, 4.470, 25.340, 25.110, 0.230, 'QMS', 'normal', '恢复正常'),
  (8, 'IR-20261012-001', 'S-201', 3, '2026-10-12 08:00:00', 25.210, 4.360, 4.480, 25.310, 25.100, 0.210, 'QMS', 'normal', '参考批次'),
  (9, 'IR-20261012-002', 'S-202', 3, '2026-10-12 09:00:00', 25.220, 4.380, 4.490, 25.320, 25.100, 0.220, 'QMS', 'normal', '参考批次'),
  (10, 'IR-20261012-003', 'S-203', 3, '2026-10-12 10:00:00', 25.230, 4.370, 4.500, 25.330, 25.110, 0.220, 'QMS', 'normal', '参考批次'),
  (11, 'IR-20261012-004', 'S-204', 3, '2026-10-12 11:00:00', 25.220, 4.390, 4.510, 25.320, 25.100, 0.220, 'QMS', 'normal', '参考批次'),
  (12, 'IR-20261012-005', 'S-205', 3, '2026-10-12 12:00:00', 25.230, 4.380, 4.500, 25.330, 25.110, 0.220, 'QMS', 'normal', '参考批次'),
  (13, 'IR-20261012-006', 'S-206', 3, '2026-10-12 13:00:00', 25.240, 4.390, 4.510, 25.340, 25.120, 0.220, 'QMS', 'normal', '参考批次'),
  (14, 'IR-20261012-007', 'S-207', 3, '2026-10-12 14:00:00', 25.230, 4.370, 4.490, 25.330, 25.110, 0.220, 'QMS', 'normal', '参考批次'),
  (15, 'IR-20261012-008', 'S-208', 3, '2026-10-12 15:00:00', 25.220, 4.380, 4.500, 25.320, 25.100, 0.220, 'QMS', 'normal', '参考批次'),
  (16, 'IR-20261012-009', 'S-209', 4, '2026-10-12 20:00:00', 25.180, 4.310, 4.420, 25.280, 25.090, 0.190, 'MES_IMPORT', 'error', '记录值疑似跨规格录入')
ON DUPLICATE KEY UPDATE sample_no=VALUES(sample_no), batch_id=VALUES(batch_id), inspect_time=VALUES(inspect_time), outer_diameter_mm=VALUES(outer_diameter_mm), min_wall_thickness_mm=VALUES(min_wall_thickness_mm), ovality_mm=VALUES(ovality_mm), quality_flag=VALUES(quality_flag), remark=VALUES(remark);

INSERT INTO ppr_equipment_reading (id, record_no, batch_id, equipment_id, collect_time, temperature_c, pressure_mpa, haul_off_speed_mpm, data_source, remark) VALUES
  (1, 'ER-20261010-0800', 1, 1, '2026-10-10 08:00:00', 205.00, 12.600, 8.200, 'SCADA', '稳定运行'),
  (2, 'ER-20261010-0900', 1, 1, '2026-10-10 09:00:00', 205.50, 12.400, 8.300, 'SCADA', '压力轻微下降'),
  (3, 'ER-20261010-1000', 1, 1, '2026-10-10 10:00:00', 206.00, 12.200, 8.450, 'SCADA', '牵引速度上升'),
  (4, 'ER-20261011-0800', 2, 1, '2026-10-11 08:00:00', 205.00, 12.500, 8.200, 'SCADA', '稳定运行'),
  (5, 'ER-20261011-0900', 2, 2, '2026-10-11 09:00:00', 204.80, 12.500, 8.550, 'SCADA', '牵引速度波动'),
  (6, 'ER-20261012-0800', 3, 1, '2026-10-12 08:00:00', 205.20, 12.600, 8.200, 'SCADA', '参考批次'),
  (7, 'ER-20261012-0900', 3, 2, '2026-10-12 09:00:00', 205.10, 12.500, 8.220, 'SCADA', '参考批次'),
  (8, 'ER-20261012-2000', 4, 1, '2026-10-12 20:00:00', 203.00, 11.800, 7.900, 'SCADA', '换规格后首件')
ON DUPLICATE KEY UPDATE batch_id=VALUES(batch_id), equipment_id=VALUES(equipment_id), collect_time=VALUES(collect_time), temperature_c=VALUES(temperature_c), pressure_mpa=VALUES(pressure_mpa), haul_off_speed_mpm=VALUES(haul_off_speed_mpm), remark=VALUES(remark);

INSERT INTO ppr_alert_event (id, event_no, measurement_id, metric_code, risk_level, rule_code, rule_name, observed_value, threshold_text, status, detected_at) VALUES
  (1, 'QE-20261010-001', 3, 'min_wall_thickness', 'medium', 'R4', '待复核趋势', 4.2600, '连续3个可比较点下降，规则参数待现场验证', 'open', '2026-10-10 09:38:00'),
  (2, 'QE-20261011-001', 6, 'ovality', 'high', 'R3', '不圆度演示限值对照', 0.4300, '演示上限0.350 mm，正式标准待确认', 'open', '2026-10-11 09:01:00'),
  (3, 'QE-20261010-002', 4, 'min_wall_thickness', 'error', 'R1', 'QMS/MES数据不一致待核对', 4.3100, '来源差值0.080 mm，大于演示容差0.050 mm', 'open', '2026-10-10 10:16:00'),
  (4, 'QE-20261012-001', 16, 'outer_diameter', 'error', 'R2', '疑似跨规格录入', 25.1800, '批次规格20×3.4但记录值接近25 mm', 'open', '2026-10-12 20:01:00')
ON DUPLICATE KEY UPDATE measurement_id=VALUES(measurement_id), metric_code=VALUES(metric_code), risk_level=VALUES(risk_level), rule_name=VALUES(rule_name), observed_value=VALUES(observed_value), threshold_text=VALUES(threshold_text), status=VALUES(status), detected_at=VALUES(detected_at);

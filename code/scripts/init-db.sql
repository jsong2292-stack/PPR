-- ============================================================================
-- PPR 过程质量异常智能分析助手 - 数据库初始化 DDL（clean init）
-- 数据库：MySQL 8.0+
--
-- 执行方式（二选一）：
--   1) 命令行 ：mysql -h 127.0.0.1 -P 3306 -u root -p ppr_quality < scripts/init-db.sql
--   2) 项目脚本：pnpm db:init（先执行本文件，再依次执行 scripts/migrations/*.sql）
--
-- 本文件是**唯一权威建表来源**，已经包含 scripts/migrations/001 ~ 012 的全部结构变更，
-- 在空库上执行即可得到与最新代码一致的库结构。
-- 重复执行安全：建表用 CREATE TABLE IF NOT EXISTS，种子数据用 ON DUPLICATE KEY UPDATE。
--
-- 初始化后的数据范围（2026-10-14 整理版）：
--   保留 - 系统管理    ：产品类别、质量指标与影响因素、设备类型
--   保留 - 后台基础数据：管理员与账号、系统配置、产品规格、设备台账
--   清空 - 数据源管理  ：产品检验记录、设备采集数据
--                        （批次总览 ppr_batch 由这两张表实时聚合，因此同样为空）
--   清空 - 质量监控    ：预警事件（改由预警判定引擎在导入数据时自动生成）
--   清空 - 历史分析    ：分析任务、分析结论、8D 报告
--   清空 - 旧原型遗留表：本文件不包含任何旧版原型表（alert_event / data_source /
--                        production_batch / sys_user / inspection_record / product_data /
--                        v_product_data_wide 等），当前代码已不再使用，新库不再创建。
--
-- 注意：本文件只负责「建表 + 预置基础数据」，不含任何 DELETE / TRUNCATE，
--       因此在已有业务的库上重复执行**不会**清空业务数据。
--       如需在已有库上清空业务数据、保留系统管理与基础数据，请执行
--       scripts/clear-business-data.sql。
-- ============================================================================

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

-- 注：system_config 的初始取值统一放在文件末尾的「初始化数据」一节，
--     避免同一份种子数据在文件里出现两处、后一处又覆盖不回前一处。

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

-- 生产批次：**不再是表**。
-- 批次号是产品检验数据与设备采集数据之间唯一的关联键，批次本身不持久化：
-- 它由下面两张子表按 batch_no 实时聚合出来，见本文件末尾的 ppr_batch 视图。
-- 因此「批次」没有需要单独维护的状态、结束时间、设备归属等字段，也没有手工新建批次的入口。

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
-- 归属关系全部落本行：batch_no 关联设备采集数据，spec_id 决定判定限值，不再依赖批次主表。
CREATE TABLE IF NOT EXISTS ppr_product_measurement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  record_no VARCHAR(64) NOT NULL COMMENT '检验记录编号，全局唯一',
  sample_no VARCHAR(64) NOT NULL COMMENT '样管编号',
  batch_no VARCHAR(64) NOT NULL COMMENT '生产批次号，与设备采集数据按批次号关联',
  spec_id BIGINT UNSIGNED NOT NULL COMMENT '产品规格ID，判定限值来源',
  production_group VARCHAR(64) NULL COMMENT '生产组别，来自产品数据导入',
  batch_start_time DATETIME NULL COMMENT '批次开始时间，来自产品数据导入',
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
  KEY idx_ppr_measurement_batch_time (batch_no, inspect_time),
  KEY idx_ppr_measurement_spec_time (spec_id, inspect_time),
  CONSTRAINT fk_ppr_measurement_spec FOREIGN KEY (spec_id) REFERENCES ppr_product_spec(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品检验数据';

-- 设备采集数据：按批次号、设备和时刻保存关键工艺参数。
CREATE TABLE IF NOT EXISTS ppr_equipment_reading (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  record_no VARCHAR(64) NOT NULL COMMENT '设备采集记录编号，全局唯一',
  batch_no VARCHAR(64) NOT NULL COMMENT '生产批次号，与产品检验数据按批次号关联',
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
  -- 同一设备 + 同一批次号 + 同一采集时刻只能有一条记录，防止批次内 Excel 重复导入。
  UNIQUE KEY uk_ppr_equipment_reading_equipment_batch_time (equipment_id, batch_no, collect_time),
  KEY idx_ppr_equipment_reading_batch_time (batch_no, collect_time),
  CONSTRAINT fk_ppr_reading_equipment FOREIGN KEY (equipment_id) REFERENCES ppr_equipment(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR设备工艺参数采集数据';

-- 生产批次视图：批次号 → 批次清单，全部由产品检验数据 + 设备采集数据实时聚合。
-- 没有数据的批次号在这里不存在（没有需要维护的批次主数据）。
-- 字段含义：
--   id / batch_no     批次号（id 为兼容前端行主键与 URL，值就是批次号本身）
--   spec_id           该批次检验记录上的规格，决定判定限值；只有采集数据时为 NULL
--   production_group  生产组别（取该批次检验记录上的值）
--   start_time        批次开始时间（优先取导入时的 batch_start_time，否则取最早检验时间）
--   end_time          最后一次检验 / 采集时间（派生值，不再人工维护）
--   extruder_id 等    设备归属由采集数据反推：该批次有采集数据的挤出机 / 牵引机
CREATE OR REPLACE VIEW ppr_batch AS
SELECT
  k.batch_no                                        AS id,
  k.batch_no                                        AS batch_no,
  m.spec_id                                         AS spec_id,
  m.production_group                                AS production_group,
  m.start_time                                      AS start_time,
  GREATEST(COALESCE(m.last_inspect_time, '1970-01-01 00:00:00'), COALESCE(r.last_collect_time, '1970-01-01 00:00:00')) AS end_time,
  'completed'                                       AS status,
  COALESCE(m.measurement_count, 0)                  AS measurement_count,
  COALESCE(r.reading_count, 0)                      AS reading_count,
  m.last_inspect_time                               AS last_inspect_time,
  r.last_collect_time                               AS last_collect_time,
  eq.extruder_id                                    AS extruder_id,
  eq.extruder_name                                  AS extruder_name,
  eq.haul_off_id                                    AS haul_off_id,
  eq.haul_off_name                                  AS haul_off_name,
  COALESCE(m.start_time, r.first_collect_time)      AS created_at,
  COALESCE(m.last_inspect_time, r.last_collect_time) AS updated_at
FROM (
  SELECT batch_no FROM ppr_product_measurement
  UNION
  SELECT batch_no FROM ppr_equipment_reading
) k
LEFT JOIN (
  SELECT batch_no,
         MAX(spec_id)                                  AS spec_id,
         MAX(production_group)                         AS production_group,
         MIN(COALESCE(batch_start_time, inspect_time)) AS start_time,
         COUNT(*)                                      AS measurement_count,
         MAX(inspect_time)                             AS last_inspect_time
  FROM ppr_product_measurement
  GROUP BY batch_no
) m ON m.batch_no = k.batch_no
LEFT JOIN (
  SELECT batch_no,
         COUNT(*)          AS reading_count,
         MIN(collect_time) AS first_collect_time,
         MAX(collect_time) AS last_collect_time
  FROM ppr_equipment_reading
  GROUP BY batch_no
) r ON r.batch_no = k.batch_no
LEFT JOIN (
  SELECT rd.batch_no,
         MAX(CASE WHEN t.code = 'ETYPE-EXTRUDER' THEN e.id END)   AS extruder_id,
         MAX(CASE WHEN t.code = 'ETYPE-EXTRUDER' THEN e.name END) AS extruder_name,
         MAX(CASE WHEN t.code = 'ETYPE-HAULOFF'  THEN e.id END)   AS haul_off_id,
         MAX(CASE WHEN t.code = 'ETYPE-HAULOFF'  THEN e.name END) AS haul_off_name
  FROM ppr_equipment_reading rd
  JOIN ppr_equipment e ON e.id = rd.equipment_id
  JOIN ppr_equipment_type t ON t.id = e.type_id
  GROUP BY rd.batch_no
) eq ON eq.batch_no = k.batch_no;

-- 兼容别名：旧版脚本与报表按 v_ 前缀找视图（v_product_data_wide 等），
-- 这里给出列完全一致的批次视图，方便沿用旧的查询习惯。
CREATE OR REPLACE VIEW v_ppr_batch AS SELECT * FROM ppr_batch;

-- 质量预警事件：由预警判定引擎按产品规格的标准区间自动产生，是后续诊断的入口。
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
  source ENUM('engine','legacy') NOT NULL DEFAULT 'engine' COMMENT '事件来源：engine=判定引擎生成，legacy=历史演示或人工遗留',
  notified_level ENUM('medium','high') NULL COMMENT '已推送到企业微信的最高风险级别，NULL=未推送；用于重算时避免重复告警',
  notified_at DATETIME NULL COMMENT '最近一次企业微信推送时间',
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
  -- 生成审计：记录本稿由谁、用哪个引擎/模型、依据哪些工具证据生成，口径与 ppr_analysis_run 一致。
  generation_engine ENUM('rule','agent') NULL COMMENT '本稿生成的引擎：LangChain Agent 或规则模板',
  model_name VARCHAR(100) NULL COMMENT '生成本稿的模型名称，规则模板为空',
  prompt_version VARCHAR(64) NULL COMMENT '8D 生成提示词版本',
  agent_version VARCHAR(64) NULL COMMENT 'Agent 编排实现版本',
  tool_trace_json JSON NULL COMMENT '8D Agent 工具调用轨迹及返回证据',
  latency_ms INT UNSIGNED NULL COMMENT '本次生成总耗时，单位毫秒',
  fallback_reason TEXT NULL COMMENT 'Agent 降级到规则模板的原因',
  generated_by VARCHAR(100) NULL COMMENT '本稿生成发起人',
  generated_at DATETIME NULL COMMENT '本稿生成时间',
  finalized_at DATETIME NULL COMMENT '报告定稿时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ppr_report_no (report_no),
  UNIQUE KEY uk_ppr_report_analysis (analysis_id),
  CONSTRAINT fk_ppr_report_analysis FOREIGN KEY (analysis_id) REFERENCES ppr_analysis_run(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR过程异常8D报告';

-- 历史分析没有独立表：一条 8D 报告就是一条历史记录（status: draft 草稿 / finalized 归档），
-- 历史分析列表直接查 ppr_eight_d_report，点进去复用同一套报告页继续编辑。
-- 早期的 ppr_history_archive 归档快照表已废弃，见 scripts/migrations/012_drop_history_archive.sql。

-- ============================================================================
-- 初始化数据：系统管理 + 后台基础数据
--
-- 只预置下面这些内容（均为可替换的本地演示基础数据，用 ON DUPLICATE KEY 保证可重复执行）：
--   后台基础数据：管理员与账号、系统配置
--   系统管理    ：产品类别、质量指标与影响因素、设备类型
--   基础数据    ：产品规格、设备台账
--
-- 不预置（由业务操作自然产生，故新库中「数据源管理 / 质量监控 / 历史分析」都是空的）：
--   数据源管理：产品检验记录 ppr_product_measurement、设备采集数据 ppr_equipment_reading
--   质量监控  ：预警事件 ppr_alert_event
--   历史分析  ：分析任务 ppr_analysis_run、分析结论 ppr_analysis_conclusion、8D 报告 ppr_eight_d_report
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 后台基础数据 1/2：账号
-- 本地演示管理员仅用于本地首次启动，生产部署必须改密码或通过安装向导创建管理员。
-- 演示口令：Admin@123（口令哈希写死在下面）。
-- ---------------------------------------------------------------------------
INSERT INTO users (id, phone, email, nickname, password, role, status, auth_provider) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', 'admin@local.demo', '质量平台管理员', '$2b$10$Xn3Xw9bnTqTNYfns8Ig.reoOWmU9G3V3btkuB2o/Qmbt2yhf33Wdy', 'admin', 'active', 'local')
ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), role = VALUES(role), status = VALUES(status);

-- 本地测试账号（可选）：不需要时直接删掉这一条 INSERT 即可。
INSERT INTO users (id, phone, email, nickname, password, role, status, auth_provider) VALUES
  ('3c5612ad-c047-4dda-b6f5-d10a522db0a8', 'wzh', NULL, 'wzh', '$2b$12$TuLovy6RytO0.AaVABD/AeSeyrgKAZio9i10JQI.JQuEi944WedHm', 'user', 'active', 'local')
ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), role = VALUES(role), status = VALUES(status);

-- ---------------------------------------------------------------------------
-- 后台基础数据 2/2：系统配置
-- 取值沿用整理时的当前配置（诊断模式 agent、模型 deepseek-v4-flash、企微 Webhook 已填写）。
-- 已存在的键只刷新说明文字，不覆盖管理员在「系统设置」里改过的 value。
-- ---------------------------------------------------------------------------
INSERT INTO system_config (`key`, value, description) VALUES
  ('enable_register', 'true', '是否开放用户注册（true/false）'),
  ('enable_file_upload', 'true', '是否开放文件上传（true/false）'),
  ('enable_file_preview', 'true', '是否启用文件在线预览（true/false）'),
  ('max_file_size', '500', '文件上传大小上限（MB）'),
  ('enable_sso_auto_login', 'false', '未登录时是否自动跳转单点登录（true/false）'),
  ('quality_analysis_mode', 'agent', '异常诊断模式：rule规则引擎、agent LangChain智能体'),
  ('quality_agent_model', 'deepseek-v4-flash', 'LangChain Agent使用的模型名称'),
  ('quality_agent_fallback_to_rule', 'true', 'Agent失败或未配置密钥时是否自动降级规则引擎'),
  ('quality_agent_max_tool_rounds', '8', 'Agent单次分析最大工具调用轮数'),
  ('quality_agent_reasoning_effort', 'low', 'Agent推理强度：none/minimal/low/medium/high'),
  ('wecom_alert_enabled', 'false', '中/高风险预警是否推送到企业微信消息推送（原群机器人）（true/false）'),
  ('wecom_alert_webhook', 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=171d6761-b612-46a1-b81e-f656315d807d', '企业微信「消息推送」（原群机器人）Webhook地址，入口在群聊右上角···，不在管理后台'),
  ('wecom_alert_min_level', 'medium', '触发推送的最低风险级别：medium=中风险及以上、high=仅高风险'),
  ('wecom_alert_mention_list', '', '推送消息需要@的成员userid，多个用逗号分隔，留空表示不@人'),
  ('wecom_alert_mention_all', 'false', '推送中/高风险预警时是否@所有人（true/false）')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ---------------------------------------------------------------------------
-- 系统管理 1/3：产品类别
-- ---------------------------------------------------------------------------
INSERT INTO ppr_product_category (id, code, name, description, status) VALUES
  (1, 'CAT-PPR', 'PPR 管材', '无规共聚聚丙烯管材', 'enabled')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = VALUES(status);

-- ---------------------------------------------------------------------------
-- 基础数据 1/3：产品规格
-- 判定限值的唯一来源：最大/最小外径、最大/最小壁厚、不圆度上限。
-- ---------------------------------------------------------------------------
INSERT INTO ppr_product_spec (id, code, name, category_id, outer_diameter_mm, wall_thickness_mm, outer_lower_mm, outer_upper_mm, wall_lower_mm, wall_upper_mm, ovality_upper_mm, status) VALUES
  (1, 'SPEC-25X4.2', 'PPR S2.5 25×4.2 瓷芯管', 1, 25.000, 4.200, 25.000, 25.500, 4.200, 4.800, 0.350, 'enabled')
ON DUPLICATE KEY UPDATE name = VALUES(name), category_id = VALUES(category_id), outer_lower_mm = VALUES(outer_lower_mm), outer_upper_mm = VALUES(outer_upper_mm), wall_lower_mm = VALUES(wall_lower_mm), wall_upper_mm = VALUES(wall_upper_mm), ovality_upper_mm = VALUES(ovality_upper_mm), status = VALUES(status);

-- ---------------------------------------------------------------------------
-- 系统管理 2/3：设备类型
-- ---------------------------------------------------------------------------
INSERT INTO ppr_equipment_type (id, code, name, description, status) VALUES
  (1, 'ETYPE-EXTRUDER', '挤出机', '负责塑化与挤出成型，采集温度与压力', 'enabled'),
  (2, 'ETYPE-HAULOFF', '牵引机', '负责稳定牵引速度，采集牵引速度', 'enabled')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = VALUES(status);

-- ---------------------------------------------------------------------------
-- 基础数据 2/3：设备台账
-- ---------------------------------------------------------------------------
INSERT INTO ppr_equipment (id, code, name, type_id, line_name, status, description) VALUES
  (1, 'EQ-EX-01', '1号挤出机', 1, '演示线 A', 'enabled', 'PPR管材主挤出设备'),
  (2, 'EQ-HA-01', '1号牵引机', 2, '演示线 A', 'enabled', 'PPR管材牵引设备')
ON DUPLICATE KEY UPDATE name = VALUES(name), type_id = VALUES(type_id), line_name = VALUES(line_name), status = VALUES(status);

-- ---------------------------------------------------------------------------
-- 系统管理 3/3：质量指标与影响因素
-- 纯指标字典：lower_limit / upper_limit 已弃用（判定限值统一取 ppr_product_spec），
-- 这里保留整理时的历史取值，界面不再维护、也不参与任何判定。
-- ---------------------------------------------------------------------------
INSERT INTO ppr_metric (id, code, name, unit, lower_limit, upper_limit, influences, description, status) VALUES
  (1, 'outer_diameter', '外径', 'mm', 25.0000, 25.5000, '定径套、真空度、冷却水温、牵引速度', '测量管材外径；正式判定以适用标准和产品规格为准', 'enabled'),
  (2, 'min_wall_thickness', '壁厚', 'mm', 4.2000, 4.8000, '挤出量、牵引速度、模具偏心、原料波动', '仅最薄点不能代表整体壁厚分布', 'enabled'),
  (3, 'ovality', '不圆度', 'mm', 0.0000, 0.3500, '定径冷却、支撑、牵引、测量截面', '同一样管同一截面最大外径减最小外径', 'enabled')
ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), influences = VALUES(influences), description = VALUES(description), status = VALUES(status);

-- ---------------------------------------------------------------------------
-- 基础数据 3/3：业务流水（不预置，保持空库）
--
-- 生产批次不落表：批次清单由「产品检验数据 + 设备采集数据」按 batch_no 实时聚合（见 ppr_batch 视图）。
-- 两张子表都为空，所以新库的批次总览、质量监控队列、历史分析列表都是空的。
--   产品检验数据：在「数据源管理 / 产品台账」按规格导入 Excel，导入后按规格限值自动重算预警事件
--   设备采集数据：在「数据源管理 / 设备台账」逐台设备、按批次导入 Excel
--   预警事件    ：由判定引擎在导入 / 新增 / 编辑产品数据时自动生成
--                 （R3 超出规格标准区间 → 高风险；R5 连续 3 点进入接近带 → 中风险；R0 → 正常）
--   8D 报告      ：从「质量监控」下钻到诊断页生成，定稿后即出现在「历史分析」
-- 演示用 Excel：PPR/测试数据/ 与 PPR/测试数据/设备采集模拟数据/
-- ---------------------------------------------------------------------------

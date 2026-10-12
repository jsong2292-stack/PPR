-- =====================================================================
-- PPR 质量智能分析助手 · MySQL 8.0 库表结构（DDL）
-- ---------------------------------------------------------------------
-- 设计基线：PPR/原型/index.html（单文件原型，localStorage 两个键：
--   pprQualityCopilotV1 / pprQualityDataManagementV1）
-- 目标：Node.js 前后端分离服务的正式数据库结构
-- 版本：v1.0
-- 约定：
--   1) 引擎 InnoDB，字符集 utf8mb4 / utf8mb4_0900_ai_ci
--   2) 主键统一使用 BIGINT UNSIGNED 代理键；原型中的业务编码（CAT-PPR、
--      IR-001、QE-... 等）保留为 code / batch_no / sample_no 等唯一业务键
--   3) 时间统一 DATETIME（无时区）。应用层按现场时区（建议 Asia/Shanghai）
--      写入与展示，连接建立后执行 SET time_zone = '+08:00'
--   4) 枚举使用 ENUM 表达封闭集合；可扩展的字典（指标、过程参数、温区、
--      数据来源、规则）使用字典表
--   5) 测量值采用"表头 + 指标值行"（长表）结构，指标字典驱动：
--      某指标无数据 = 不写值行（保留原型"缺失不圆度显示无数据"规则）
--   6) 主数据使用 is_deleted 逻辑删除，保证历史引用不被打断
--   7) 注释中标注 [原型] 的表示与原型字段直接对应；标注 [扩展] 的表示
--      为正式系统补充、原型中不存在或仅为演示常量
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE DATABASE IF NOT EXISTS ppr_quality
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE ppr_quality;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS operation_log;
DROP TABLE IF EXISTS analysis_archive_conclusion;
DROP TABLE IF EXISTS analysis_archive;
DROP TABLE IF EXISTS eight_d_revision;
DROP TABLE IF EXISTS eight_d_field;
DROP TABLE IF EXISTS eight_d_report;
DROP TABLE IF EXISTS conclusion_evidence;
DROP TABLE IF EXISTS analysis_conclusion;
DROP TABLE IF EXISTS analysis_reference_snapshot;
DROP TABLE IF EXISTS analysis_run;
DROP TABLE IF EXISTS notification_recipient;
DROP TABLE IF EXISTS notification;
DROP TABLE IF EXISTS alert_event_record;
DROP TABLE IF EXISTS alert_event;
DROP TABLE IF EXISTS alert_rule;
DROP TABLE IF EXISTS data_consistency_check;
DROP TABLE IF EXISTS inspection_wall_point;
DROP TABLE IF EXISTS inspection_value;
DROP TABLE IF EXISTS inspection_record;
DROP TABLE IF EXISTS import_job;
DROP TABLE IF EXISTS process_zone_value;
DROP TABLE IF EXISTS process_record;
DROP TABLE IF EXISTS equipment_reading_value;
DROP TABLE IF EXISTS equipment_reading;
DROP TABLE IF EXISTS production_event;
DROP TABLE IF EXISTS product_data_value;
DROP TABLE IF EXISTS product_data;
DROP TABLE IF EXISTS production_batch;
DROP TABLE IF EXISTS temp_zone;
DROP TABLE IF EXISTS metric_influence;
DROP TABLE IF EXISTS metric_spec_limit;
DROP TABLE IF EXISTS process_parameter;
DROP TABLE IF EXISTS quality_metric;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS equipment_type;
DROP TABLE IF EXISTS product_spec;
DROP TABLE IF EXISTS product_category;
DROP TABLE IF EXISTS production_line;
DROP TABLE IF EXISTS data_source;
DROP TABLE IF EXISTS sys_user_role;
DROP TABLE IF EXISTS sys_role;
DROP TABLE IF EXISTS sys_user;
SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
-- A. 用户、角色与基础字典
-- =====================================================================

-- 系统用户：原型中的"质量工程师 / 生产领班 / 设备工程师"等收件与确认角色
CREATE TABLE sys_user (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username            VARCHAR(64)     NOT NULL                COMMENT '登录名',
  password_hash       VARCHAR(255)    NULL                    COMMENT '密码哈希（bcrypt/argon2）。种子数据留空，禁止明文',
  must_reset_password TINYINT(1)      NOT NULL DEFAULT 1      COMMENT '1=首次登录必须重置密码',
  display_name        VARCHAR(64)     NOT NULL                COMMENT '姓名',
  employee_no         VARCHAR(32)     NULL                    COMMENT '工号',
  email               VARCHAR(128)    NULL                    COMMENT '邮箱（通知收件地址）',
  phone               VARCHAR(32)     NULL                    COMMENT '手机号',
  department          VARCHAR(64)     NULL                    COMMENT '部门',
  status              ENUM('active','disabled') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  last_login_at       DATETIME        NULL                    COMMENT '最近登录时间',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_user_username (username),
  UNIQUE KEY uk_sys_user_employee_no (employee_no),
  KEY idx_sys_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统用户';

-- 角色：quality_engineer 质量工程师（结论确认/8D 主体）等
CREATE TABLE sys_role (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)     NOT NULL COMMENT '角色编码：admin/quality_engineer/production_leader/equipment_engineer/quality_manager/viewer',
  name        VARCHAR(64)     NOT NULL COMMENT '角色名称',
  description VARCHAR(255)    NULL     COMMENT '说明',
  is_builtin  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=内置角色，不允许删除',
  status      ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_role_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色';

CREATE TABLE sys_user_role (
  user_id    BIGINT UNSIGNED NOT NULL,
  role_id    BIGINT UNSIGNED NOT NULL,
  granted_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_sys_user_role_role (role_id),
  CONSTRAINT fk_sys_user_role_user FOREIGN KEY (user_id) REFERENCES sys_user (id) ON DELETE CASCADE,
  CONSTRAINT fk_sys_user_role_role FOREIGN KEY (role_id) REFERENCES sys_role (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联';

-- 数据来源字典 [原型] 批次/产品/采集/抽检记录的 dataSource：
--   演示录入 / MES模拟 / QMS模拟
-- is_simulated 用于把"模拟数据"与将来接入的生产数据严格区分开，
-- 避免把 Mock Data 当作正式生产能力（原型 AGENTS.md 明确要求）
CREATE TABLE data_source (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)     NOT NULL COMMENT '来源编码：manual_entry/mes/qms/device/import',
  name         VARCHAR(64)     NOT NULL COMMENT '来源名称',
  system_type  ENUM('manual','mes','qms','device','other') NOT NULL DEFAULT 'other' COMMENT '系统类型',
  is_simulated TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=模拟/演示数据来源，非正式生产能力',
  description  VARCHAR(255)    NULL,
  status       ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  sort_no      INT             NOT NULL DEFAULT 0,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_data_source_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据来源字典';

-- 产线/工段 [扩展] 原型中设备行只有一个文本 lineName（如"演示线 A"），
-- 正式库独立成表，用于"同产线可比性"判断（原型多次提示产线未映射）
CREATE TABLE production_line (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)     NOT NULL COMMENT '产线编码',
  name        VARCHAR(64)     NOT NULL COMMENT '产线名称',
  workshop    VARCHAR(64)     NULL     COMMENT '车间/工段',
  description VARCHAR(255)    NULL,
  status      ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  is_deleted  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_line_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产线/工段';


-- =====================================================================
-- B. 产品与设备主数据（原型"系统管理"分组）
-- =====================================================================

-- 产品类别 [原型] categories：id/name/description
CREATE TABLE product_category (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)     NOT NULL COMMENT '类别编码，如 CAT-PPR',
  name        VARCHAR(64)     NOT NULL COMMENT '类别名称，如 PPR 管材',
  description VARCHAR(255)    NULL     COMMENT '说明',
  status      ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  is_deleted  TINYINT(1)      NOT NULL DEFAULT 0,
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_category_code (code),
  KEY idx_product_category_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品类别';

-- 产品规格 [原型] specs：id/name/categoryId/outerDiameter/wallThickness/ovalityMax/status
CREATE TABLE product_spec (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                       VARCHAR(64)     NOT NULL COMMENT '规格编码，如 SPEC-25-42',
  name                       VARCHAR(64)     NOT NULL COMMENT '规格名称，如 25×4.2',
  category_id                BIGINT UNSIGNED NOT NULL COMMENT '所属产品类别',
  nominal_outer_diameter_mm  DECIMAL(10,3)   NOT NULL COMMENT '公称外径 mm [原型 outerDiameter]',
  nominal_wall_thickness_mm  DECIMAL(10,3)   NOT NULL COMMENT '公称壁厚 mm [原型 wallThickness]',
  ovality_max_mm             DECIMAL(10,3)   NULL     COMMENT '不圆度上限 mm [原型 ovalityMax]',
  status                     ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  is_deleted                 TINYINT(1)      NOT NULL DEFAULT 0,
  created_by                 BIGINT UNSIGNED NULL,
  created_at                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_spec_code (code),
  KEY idx_product_spec_category (category_id),
  CONSTRAINT fk_product_spec_category FOREIGN KEY (category_id) REFERENCES product_category (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品规格';

-- 设备类型 [原型] equipmentTypes：id/name/description
CREATE TABLE equipment_type (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)     NOT NULL COMMENT '类型编码，如 ETYPE-EXTRUDER / ETYPE-HAULOFF',
  name        VARCHAR(64)     NOT NULL COMMENT '类型名称，如 挤出机 / 牵引机',
  description VARCHAR(255)    NULL,
  is_deleted  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_equipment_type_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备类型';

-- 设备台账 [原型] equipment：id/name/typeId/lineName/status
CREATE TABLE equipment (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)     NOT NULL COMMENT '设备编码，如 EQ-EX-01',
  name        VARCHAR(64)     NOT NULL COMMENT '设备名称',
  type_id     BIGINT UNSIGNED NOT NULL COMMENT '设备类型',
  line_id     BIGINT UNSIGNED NULL     COMMENT '所属产线 [扩展：原型为文本 lineName]',
  status      ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  description VARCHAR(255)    NULL,
  is_deleted  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_equipment_code (code),
  KEY idx_equipment_type (type_id),
  KEY idx_equipment_line (line_id),
  CONSTRAINT fk_equipment_type FOREIGN KEY (type_id) REFERENCES equipment_type (id) ON DELETE RESTRICT,
  CONSTRAINT fk_equipment_line FOREIGN KEY (line_id) REFERENCES production_line (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备台账';


-- =====================================================================
-- C. 质量指标与过程参数字典（原型"质量指标与影响因素"）
-- =====================================================================

-- 质量指标字典 [原型] metrics + metricMeta
-- metric_role 区分：primary 参与判定（外径/最小壁厚/不圆度）；
--                  raw 原始测量项（最大/最小外径、最大壁厚）；
--                  derived 计算指标（不圆度 = 最大外径 − 最小外径）
CREATE TABLE quality_metric (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                 VARCHAR(64)     NOT NULL COMMENT '指标编码：outer_diameter/min_wall_thickness/max_wall_thickness/max_outer_diameter/min_outer_diameter/ovality',
  name                 VARCHAR(64)     NOT NULL COMMENT '指标名称',
  unit                 VARCHAR(16)     NOT NULL DEFAULT 'mm' COMMENT '单位 [原型 metricMeta.unit]',
  decimal_scale        TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '展示小数位 [原型 fmt(n,3)/(n,2)]',
  metric_role          ENUM('primary','raw','derived') NOT NULL DEFAULT 'primary' COMMENT '指标角色',
  derived_expr         VARCHAR(255)    NULL     COMMENT '计算表达式（仅 derived，由后端计算，不在 SQL 内动态求值），如 max_outer_diameter - min_outer_diameter',
  check_direction_hint VARCHAR(500)    NULL     COMMENT '核查方向提示 [原型 metricCheckDirection]',
  status               ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  sort_no              INT             NOT NULL DEFAULT 0,
  is_deleted           TINYINT(1)      NOT NULL DEFAULT 0,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quality_metric_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='质量指标字典';

-- 指标 × 规格限值 [原型] metrics.specIds + lowerLimit/upperLimit
-- 归一化说明：原型把"适用规格列表"和"上下限"放在同一指标行上，正式库
-- 拆为（规格, 指标）维度的限值表，同一指标在不同规格可有不同限值。
-- limit_type/calibration_status 用于区分"演示限值"与正式标准，
-- 原型反复强调演示限值不构成合格判定（不得写成已验证能力）。
CREATE TABLE metric_spec_limit (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  spec_id            BIGINT UNSIGNED NOT NULL COMMENT '产品规格',
  metric_id          BIGINT UNSIGNED NOT NULL COMMENT '质量指标',
  lower_limit        DECIMAL(12,4)   NULL     COMMENT '下限，NULL=不设下限',
  upper_limit        DECIMAL(12,4)   NULL     COMMENT '上限，NULL=不设上限',
  limit_type         ENUM('demo','internal','customer','national') NOT NULL DEFAULT 'demo' COMMENT '限值类型：demo 演示限值',
  calibration_status ENUM('demo','pending_field_validation','validated') NOT NULL DEFAULT 'demo' COMMENT '限值可信状态：演示策略待现场验证',
  standard_ref       VARCHAR(128)    NULL     COMMENT '适用标准/条款（待确认）',
  effective_from     DATE            NULL     COMMENT '生效日期',
  effective_to       DATE            NULL     COMMENT '失效日期',
  remark             VARCHAR(255)    NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_metric_spec_limit (spec_id, metric_id),
  KEY idx_metric_spec_limit_metric (metric_id),
  CONSTRAINT fk_metric_spec_limit_spec FOREIGN KEY (spec_id) REFERENCES product_spec (id) ON DELETE CASCADE,
  CONSTRAINT fk_metric_spec_limit_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指标规格限值';

-- 过程参数字典 [原型] processFactorLabels / factorMeta：温度/压力/牵引速度
CREATE TABLE process_parameter (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(64)     NOT NULL COMMENT '参数编码：temperature/pressure/haul_off_speed',
  name          VARCHAR(64)     NOT NULL COMMENT '参数名称',
  unit          VARCHAR(16)     NOT NULL COMMENT '单位：°C/MPa/m/min',
  decimal_scale TINYINT UNSIGNED NOT NULL DEFAULT 2 COMMENT '展示小数位 [原型 factorMeta.digits]',
  description   VARCHAR(255)    NULL,
  status        ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  sort_no       INT             NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_parameter_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='过程参数（影响因素）字典';

-- 指标 × 过程参数 [原型] metrics.influences（multi 选择）
CREATE TABLE metric_influence (
  metric_id    BIGINT UNSIGNED NOT NULL COMMENT '质量指标',
  parameter_id BIGINT UNSIGNED NOT NULL COMMENT '关联过程参数',
  remark       VARCHAR(255)    NULL     COMMENT '关联说明/待确认事项',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_id, parameter_id),
  KEY idx_metric_influence_parameter (parameter_id),
  CONSTRAINT fk_metric_influence_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE CASCADE,
  CONSTRAINT fk_metric_influence_parameter FOREIGN KEY (parameter_id) REFERENCES process_parameter (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指标与过程参数关联';

-- 温区字典 [原型] zoneDefinitions：M1 机筒 1–4 区、M1 适配器 1–4 区
-- 说明：设定值/反馈值按温区独立展示，不计算总平均（原型明确规则）
CREATE TABLE temp_zone (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code               VARCHAR(64)     NOT NULL COMMENT '温区编码，如 M1-barrel-1',
  name               VARCHAR(64)     NOT NULL COMMENT '温区名称，如 M1 机筒1区',
  equipment_id       BIGINT UNSIGNED NULL     COMMENT '所属设备',
  default_setpoint_c DECIMAL(8,2)    NULL     COMMENT '默认设定温度 °C [原型 zoneDefinitions.setpoint]',
  sort_no            INT             NOT NULL DEFAULT 0,
  description        VARCHAR(255)    NULL,
  is_deleted         TINYINT(1)      NOT NULL DEFAULT 0,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_temp_zone_code (code),
  KEY idx_temp_zone_equipment (equipment_id),
  CONSTRAINT fk_temp_zone_equipment FOREIGN KEY (equipment_id) REFERENCES equipment (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='温区字典';


-- =====================================================================
-- D. 生产批次、产品数据与设备采集数据（原型"数据源管理"）
-- =====================================================================

-- 生产批次 [原型] batches：id/specId/extruderId/haulOffId/productionGroup/startTime/source
CREATE TABLE production_batch (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_no         VARCHAR(64)     NOT NULL COMMENT '批次号，如 12121D0032 [原型 id]，来自 MES 的自然键',
  spec_id          BIGINT UNSIGNED NOT NULL COMMENT '产品规格',
  line_id          BIGINT UNSIGNED NULL     COMMENT '生产产线 [扩展]',
  extruder_id      BIGINT UNSIGNED NULL     COMMENT '挤出设备 [原型 extruderId]',
  haul_off_id      BIGINT UNSIGNED NULL     COMMENT '牵引设备 [原型 haulOffId]',
  production_group VARCHAR(32)     NULL     COMMENT '生产组别，如 D组 [原型 productionGroup]',
  start_time       DATETIME        NOT NULL COMMENT '生产开始时间 [原型 startTime]',
  end_time         DATETIME        NULL     COMMENT '生产结束时间 [扩展]',
  batch_status     ENUM('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'completed' COMMENT '批次状态 [扩展：原型缺运行连续性信息]',
  data_source_id   BIGINT UNSIGNED NOT NULL COMMENT '数据来源 [原型 source]',
  remark           VARCHAR(255)    NULL,
  is_deleted       TINYINT(1)      NOT NULL DEFAULT 0,
  created_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_production_batch_no (batch_no),
  KEY idx_production_batch_spec (spec_id),
  KEY idx_production_batch_start (start_time),
  KEY idx_production_batch_group (production_group, start_time),
  CONSTRAINT fk_production_batch_spec FOREIGN KEY (spec_id) REFERENCES product_spec (id) ON DELETE RESTRICT,
  CONSTRAINT fk_production_batch_line FOREIGN KEY (line_id) REFERENCES production_line (id) ON DELETE SET NULL,
  CONSTRAINT fk_production_batch_extruder FOREIGN KEY (extruder_id) REFERENCES equipment (id) ON DELETE SET NULL,
  CONSTRAINT fk_production_batch_hauloff FOREIGN KEY (haul_off_id) REFERENCES equipment (id) ON DELETE SET NULL,
  CONSTRAINT fk_production_batch_source FOREIGN KEY (data_source_id) REFERENCES data_source (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='生产批次基础信息';

-- 生产事件 [扩展]（停机/换规格/调机）
-- 原型的 R4 趋势规则反复提示"停机、换规格或运行连续性记录未提供"，
-- 本表用于正式系统补齐该缺口，支撑"运行连续性"判断
CREATE TABLE production_event (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id         BIGINT UNSIGNED NOT NULL COMMENT '批次',
  event_type       ENUM('start','stop','restart','spec_changeover','adjustment','material_change','other') NOT NULL COMMENT '事件类型',
  occur_time       DATETIME        NOT NULL COMMENT '发生时间',
  end_time         DATETIME        NULL     COMMENT '结束时间',
  duration_minutes INT UNSIGNED    NULL     COMMENT '持续分钟（停机/换规格）',
  reason           VARCHAR(255)    NULL     COMMENT '原因',
  detail           VARCHAR(500)    NULL     COMMENT '明细：设定值变更、调机内容等',
  source           VARCHAR(64)     NULL     COMMENT '记录来源',
  operator_user_id BIGINT UNSIGNED NULL     COMMENT '记录人',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_production_event_batch (batch_id, occur_time),
  KEY idx_production_event_type (event_type, occur_time),
  CONSTRAINT fk_production_event_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_production_event_operator FOREIGN KEY (operator_user_id) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='生产事件（停机/换规格/调机）';

-- 产品数据 [原型] products：id/batchId/productionDate/指标值/dataSource
-- 唯一键 (batch_id, production_date) 对应原型规则"一个产品只有一份"
CREATE TABLE product_data (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(64)     NOT NULL COMMENT '产品数据编号，如 PRD-001 [原型 id]',
  batch_id       BIGINT UNSIGNED NOT NULL COMMENT '批次号',
  production_date DATE           NOT NULL COMMENT '生产日期 [原型 productionDate]',
  data_source_id BIGINT UNSIGNED NOT NULL COMMENT '数据来源 [原型 dataSource]',
  remark         VARCHAR(255)    NULL     COMMENT '备注',
  migrated_from  VARCHAR(64)     NULL     COMMENT '迁移来源记录号（原型 migrateAdminRecords 的 migratedFrom）',
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_data_code (code),
  UNIQUE KEY uk_product_data_batch_date (batch_id, production_date),
  KEY idx_product_data_source (data_source_id),
  CONSTRAINT fk_product_data_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_data_source FOREIGN KEY (data_source_id) REFERENCES data_source (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品数据（批次 + 生产日期唯一）';

-- 产品指标值 [原型] products 的 outerDiameter/minWallThickness/maxWallThickness/ovality 列
CREATE TABLE product_data_value (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_data_id BIGINT UNSIGNED NOT NULL COMMENT '产品数据',
  metric_id       BIGINT UNSIGNED NOT NULL COMMENT '质量指标',
  metric_value    DECIMAL(12,4)   NOT NULL COMMENT '指标值（无数据不写行）',
  is_derived      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=计算得到（如不圆度）',
  remark          VARCHAR(255)    NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_data_value (product_data_id, metric_id),
  KEY idx_product_data_value_metric (metric_id),
  CONSTRAINT fk_product_data_value_header FOREIGN KEY (product_data_id) REFERENCES product_data (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_data_value_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品指标值';

-- 设备采集数据 [原型] deviceReadings：id/batchId/productionDate/equipmentId/collectTime/参数值/dataSource
-- 唯一键 (batch_id, production_date, equipment_id, collect_time)：对应"设备编号 + 生产日期 + 采集时间唯一，每小时 1 条"
CREATE TABLE equipment_reading (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                  VARCHAR(64)     NOT NULL COMMENT '记录编号，如 DEV-EX-... [原型 id]',
  batch_id              BIGINT UNSIGNED NOT NULL COMMENT '批次号',
  production_date       DATE            NOT NULL COMMENT '生产日期',
  equipment_id          BIGINT UNSIGNED NOT NULL COMMENT '设备编号',
  collect_time          TIME            NOT NULL COMMENT '采集时间（时:分）[原型 collectTime]',
  collected_at          DATETIME        NULL     COMMENT '采集时间戳（生产日期 + 采集时间，应用层写入）',
  data_source_id        BIGINT UNSIGNED NOT NULL COMMENT '数据来源',
  remark                VARCHAR(255)    NULL,
  migrated_from         VARCHAR(64)     NULL     COMMENT '迁移来源记录号',
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_equipment_reading_code (code),
  UNIQUE KEY uk_equipment_reading_natural (batch_id, production_date, equipment_id, collect_time),
  KEY idx_equipment_reading_equipment (equipment_id, production_date, collect_time),
  KEY idx_equipment_reading_source (data_source_id),
  CONSTRAINT fk_equipment_reading_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_equipment_reading_equipment FOREIGN KEY (equipment_id) REFERENCES equipment (id) ON DELETE RESTRICT,
  CONSTRAINT fk_equipment_reading_source FOREIGN KEY (data_source_id) REFERENCES data_source (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备采集数据表头';

-- 设备采集参数值 [原型] deviceReadings 的 temperature/pressure/haulOffSpeed 列
-- 长表原因：过程参数是可扩展字典（metric_influence 引用同一字典），
-- 新增参数不需要 ALTER TABLE；NULL 值不再占位（原型中挤出机行的 haulOffSpeed 为 null）
CREATE TABLE equipment_reading_value (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reading_id     BIGINT UNSIGNED NOT NULL COMMENT '采集记录表头',
  parameter_id   BIGINT UNSIGNED NOT NULL COMMENT '过程参数',
  parameter_value DECIMAL(12,4)  NOT NULL COMMENT '参数值',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_equipment_reading_value (reading_id, parameter_id),
  KEY idx_equipment_reading_value_parameter (parameter_id),
  CONSTRAINT fk_equipment_reading_value_header FOREIGN KEY (reading_id) REFERENCES equipment_reading (id) ON DELETE CASCADE,
  CONSTRAINT fk_equipment_reading_value_parameter FOREIGN KEY (parameter_id) REFERENCES process_parameter (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备采集参数值';

-- 工艺过程记录 [原型] scenarios[].process：虚拟工艺数据
-- 注意：原型中"牵引反馈速度 haulOffFeedback"与"演示管材线速度 pipeLineSpeedMpm"
-- 是两个独立量（后者不是牵引反馈），本表分别存列，不做换算
CREATE TABLE process_record (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                       VARCHAR(64)     NOT NULL COMMENT '工艺记录编号，如 PR-A-0 [原型 id]',
  batch_id                   BIGINT UNSIGNED NOT NULL COMMENT '批次号',
  equipment_id               BIGINT UNSIGNED NULL     COMMENT '对应设备',
  record_time                DATETIME        NOT NULL COMMENT '记录时间 [原型 timestamp]',
  data_source_id             BIGINT UNSIGNED NULL     COMMENT '数据来源',
  time_match_status          ENUM('confirmed','pending','mismatch') NOT NULL DEFAULT 'pending' COMMENT '时间匹配状态 [原型 timeMatchStatus：时间匹配待确认]',
  haul_off_feedback_mpm      DECIMAL(8,2)    NULL     COMMENT '牵引反馈速度 m/min（语义待确认）',
  pipe_line_speed_mpm        DECIMAL(8,2)    NULL     COMMENT '管材线速度 m/min（独立虚拟量，非牵引反馈）',
  mass_output_kgh            DECIMAL(10,2)   NULL     COMMENT '质量产出率 kg/h（演示量，不可换算长度）',
  measured_unit_weight_kgpm  DECIMAL(10,4)   NULL     COMMENT '每米重量 kg/m（测量方式为实测，当前值为模拟）',
  production_group           VARCHAR(32)     NULL     COMMENT '生产组别',
  remark                     VARCHAR(255)    NULL,
  created_at                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_record_code (code),
  KEY idx_process_record_batch (batch_id, record_time),
  KEY idx_process_record_equipment (equipment_id),
  CONSTRAINT fk_process_record_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE CASCADE,
  CONSTRAINT fk_process_record_equipment FOREIGN KEY (equipment_id) REFERENCES equipment (id) ON DELETE SET NULL,
  CONSTRAINT fk_process_record_source FOREIGN KEY (data_source_id) REFERENCES data_source (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工艺过程记录（温区/牵引/产出）';

-- 温区设定与反馈 [原型] process.zones[]：id/setpoint/feedback
-- 偏差列由生成列计算（反馈 − 设定），与原型展示口径一致
CREATE TABLE process_zone_value (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  process_record_id BIGINT UNSIGNED NOT NULL COMMENT '工艺记录',
  zone_id           BIGINT UNSIGNED NOT NULL COMMENT '温区',
  setpoint_c        DECIMAL(8,2)    NULL     COMMENT '设定温度 °C',
  feedback_c        DECIMAL(8,2)    NULL     COMMENT '反馈温度 °C',
  deviation_c       DECIMAL(8,2)    GENERATED ALWAYS AS (feedback_c - setpoint_c) STORED COMMENT '偏差 = 反馈 − 设定（原型展示口径）',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_zone_value (process_record_id, zone_id),
  KEY idx_process_zone_value_zone (zone_id),
  CONSTRAINT fk_process_zone_value_record FOREIGN KEY (process_record_id) REFERENCES process_record (id) ON DELETE CASCADE,
  CONSTRAINT fk_process_zone_value_zone FOREIGN KEY (zone_id) REFERENCES temp_zone (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工艺温区设定与反馈';


-- =====================================================================
-- E. Excel 批量导入（原型"下载整套模板 / 校验后整批写入"）
-- =====================================================================

-- 导入任务。原型规则：先整批校验，发现错误不写入任何数据 → 只有
-- status=validated 的任务才允许提交为 committed；error_summary 保留逐行错误明细
CREATE TABLE import_job (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(64)     NOT NULL COMMENT '导入批次号',
  group_key      ENUM('product_master','equipment','production_data') NOT NULL COMMENT '数据类别 [原型 adminImportGroups]',
  file_name      VARCHAR(255)    NOT NULL COMMENT '上传文件名',
  file_size_bytes BIGINT UNSIGNED NULL    COMMENT '文件大小',
  sheet_count    INT UNSIGNED    NULL     COMMENT '工作表数量',
  total_rows     INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '校验总行数',
  success_rows   INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '可写入行数',
  error_rows     INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '错误行数',
  status         ENUM('validating','validated','committed','failed','cancelled') NOT NULL DEFAULT 'validating' COMMENT '任务状态',
  error_summary  JSON            NULL     COMMENT '逐行错误明细 [{sheet,table,row,column,message,rawValue}]',
  imported_by    BIGINT UNSIGNED NULL     COMMENT '导入人',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at   DATETIME        NULL     COMMENT '整批写入时间',
  remark         VARCHAR(255)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_import_job_code (code),
  KEY idx_import_job_status (status, created_at),
  CONSTRAINT fk_import_job_user FOREIGN KEY (imported_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Excel 批量导入任务';


-- =====================================================================
-- F. 抽检记录与质量预警（原型"质量监控与预警" + R1–R5）
-- =====================================================================

-- 抽检记录（样管）[原型] record：
--   id/sampleId/batchId/productSpec/timestamp/productionTime/inspectionTime/
--   dataSource/dataValueType/inspectionMethod/instrumentInfo/measurementStage/
--   inspectionStatus/productionGroup
-- 唯一键 (batch_id, inspect_time)：对应原型"批次 × 抽检时间"热力格每格一条
CREATE TABLE inspection_record (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                    VARCHAR(64)     NOT NULL COMMENT '记录编号，如 IR-001 [原型 id]',
  sample_no               VARCHAR(64)     NOT NULL COMMENT '样管编号，如 S-001 [原型 sampleId]（同一样管初测/复测可多条）',
  batch_id                BIGINT UNSIGNED NOT NULL COMMENT '批次号',
  spec_id                 BIGINT UNSIGNED NOT NULL COMMENT '产品规格',
  production_group        VARCHAR(32)     NULL     COMMENT '生产组别',
  inspect_time            DATETIME        NOT NULL COMMENT '抽检/检测时间 [原型 timestamp / inspectionTime]',
  production_time         DATETIME        NULL     COMMENT '生产时间（待补，用于计算检测延迟）[原型 productionTime]',
  inspection_delay_minutes INT UNSIGNED   NULL     COMMENT '检测延迟分钟（由生产时间与检测时间计算）',
  measurement_stage       ENUM('initial','retest','unconfirmed') NOT NULL DEFAULT 'unconfirmed' COMMENT '初测/复测 [原型 measurementStage]',
  inspection_method       VARCHAR(128)    NULL     COMMENT '检验方法 [原型 inspectionMethod：待确认]',
  instrument_info         VARCHAR(128)    NULL     COMMENT '量具/仪器与校准信息 [原型 instrumentInfo：待确认]',
  quality_flag            ENUM('none','qms_mes_mismatch','measurement_error','spec_mismatch','insufficient') NOT NULL DEFAULT 'none' COMMENT '数据质量标记：R1/R2 判定来源',
  quality_note            VARCHAR(500)    NULL     COMMENT '数据质量问题说明（不构成产品合格判定）',
  simulated_ovality       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=不圆度为显式模拟构造值 [原型 simulatedOvality]',
  data_source_id          BIGINT UNSIGNED NOT NULL COMMENT '数据来源',
  record_status           ENUM('valid','void') NOT NULL DEFAULT 'valid' COMMENT '记录有效性（作废不物理删除）',
  remark                  VARCHAR(255)    NULL,
  created_by              BIGINT UNSIGNED NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inspection_record_code (code),
  UNIQUE KEY uk_inspection_record_batch_time (batch_id, inspect_time),
  KEY idx_inspection_record_sample (sample_no),
  KEY idx_inspection_record_batch (batch_id, inspect_time),
  KEY idx_inspection_record_flag (quality_flag),
  CONSTRAINT fk_inspection_record_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE RESTRICT,
  CONSTRAINT fk_inspection_record_spec FOREIGN KEY (spec_id) REFERENCES product_spec (id) ON DELETE RESTRICT,
  CONSTRAINT fk_inspection_record_source FOREIGN KEY (data_source_id) REFERENCES data_source (id) ON DELETE RESTRICT,
  CONSTRAINT fk_inspection_record_creator FOREIGN KEY (created_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样管抽检记录';

-- 抽检指标值 [原型] record 的 outerDiameter/maxOuterDiameter/minOuterDiameter/
--   minWallThickness/maxWallThickness/ovality 列
-- 关键规则：某指标缺失 = 不写行 → 接口层返回"无数据"（原型"缺失不圆度显示无数据"）
CREATE TABLE inspection_value (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  record_id     BIGINT UNSIGNED NOT NULL COMMENT '抽检记录',
  metric_id     BIGINT UNSIGNED NOT NULL COMMENT '质量指标',
  metric_value  DECIMAL(12,4)   NOT NULL COMMENT '测量值（单位见指标字典）',
  is_derived    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=计算值（不圆度 = 最大外径 − 最小外径）',
  is_simulated  TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1=模拟值 [原型 dataValueType：模拟值]',
  remark        VARCHAR(255)    NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inspection_value (record_id, metric_id),
  KEY idx_inspection_value_metric (metric_id),
  CONSTRAINT fk_inspection_value_record FOREIGN KEY (record_id) REFERENCES inspection_record (id) ON DELETE CASCADE,
  CONSTRAINT fk_inspection_value_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='抽检指标值';

-- 多点壁厚原始测点 [原型] wallThicknessPoints（原型中恒为 null，此处预留给正式系统）
-- 用于区分"整体变薄"与"局部最薄处变化"（原型反复提示仅凭最小壁厚不能判定整体变薄）
CREATE TABLE inspection_wall_point (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  record_id     BIGINT UNSIGNED NOT NULL COMMENT '抽检记录',
  point_no      SMALLINT UNSIGNED NOT NULL COMMENT '测点序号',
  position_desc VARCHAR(64)     NULL     COMMENT '位置描述：周向角度/轴向位置/截面位置',
  value_mm      DECIMAL(10,3)   NOT NULL COMMENT '壁厚 mm',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inspection_wall_point (record_id, point_no),
  CONSTRAINT fk_inspection_wall_point_record FOREIGN KEY (record_id) REFERENCES inspection_record (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='多点壁厚原始测点';

-- QMS / MES 记录核对 [原型] record.qmsPair（场景 C）
-- diff_value 为生成列，容差与结论分列保存，便于追溯"当时用的容差"
CREATE TABLE data_consistency_check (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  record_id           BIGINT UNSIGNED NOT NULL COMMENT '抽检记录',
  metric_id           BIGINT UNSIGNED NOT NULL COMMENT '核对指标',
  primary_value       DECIMAL(12,4)   NOT NULL COMMENT '主记录值（如 MES 值）',
  secondary_value     DECIMAL(12,4)   NOT NULL COMMENT '待核对记录值（如 QMS 值）',
  primary_source_id   BIGINT UNSIGNED NULL     COMMENT '主记录来源',
  secondary_source_id BIGINT UNSIGNED NULL     COMMENT '待核对记录来源',
  matched_time        DATETIME        NULL     COMMENT '两条记录的匹配时间 [原型 qmsPair.timestamp]',
  diff_value          DECIMAL(12,4)   GENERATED ALWAYS AS (ABS(primary_value - secondary_value)) STORED COMMENT '差值绝对值（生成列）',
  tolerance_value     DECIMAL(12,4)   NOT NULL COMMENT '当时的比对容差 [原型 qmsMes.toleranceMm]',
  result              ENUM('pending','consistent','inconsistent','insufficient') NOT NULL DEFAULT 'pending' COMMENT '核对结论',
  conclusion_note     VARCHAR(500)    NULL     COMMENT '核对说明（不得据此判断产品不合格）',
  checked_by          BIGINT UNSIGNED NULL     COMMENT '核对人',
  checked_at          DATETIME        NULL     COMMENT '核对时间',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_data_consistency_record (record_id),
  KEY idx_data_consistency_result (result),
  CONSTRAINT fk_data_consistency_record FOREIGN KEY (record_id) REFERENCES inspection_record (id) ON DELETE CASCADE,
  CONSTRAINT fk_data_consistency_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT,
  CONSTRAINT fk_data_consistency_primary_source FOREIGN KEY (primary_source_id) REFERENCES data_source (id) ON DELETE SET NULL,
  CONSTRAINT fk_data_consistency_secondary_source FOREIGN KEY (secondary_source_id) REFERENCES data_source (id) ON DELETE SET NULL,
  CONSTRAINT fk_data_consistency_checker FOREIGN KEY (checked_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='QMS/MES 数据一致性核对';

-- 预警规则 [原型] R1–R5 顺序判断 + DEMO_CONFIG 阈值常量
-- evaluate_order 即"顺序判断"顺序；params_json 保存可配置阈值；
-- calibration_status 明确阈值为演示策略、待现场验证
CREATE TABLE alert_rule (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code               VARCHAR(32)     NOT NULL COMMENT '规则编码：R1/R2/R3/R4/R5',
  name               VARCHAR(128)    NOT NULL COMMENT '规则名称',
  risk_type          ENUM('normal','medium','high','error') NOT NULL COMMENT '命中后风险类型',
  evaluate_order     TINYINT UNSIGNED NOT NULL COMMENT '顺序判断优先级（小者先）',
  rule_category      ENUM('data_consistency','data_validity','spec_limit','trend','fallback') NOT NULL COMMENT '规则类别',
  metric_id          BIGINT UNSIGNED NULL     COMMENT '限定指标，NULL=适用于全部指标',
  params_json        JSON            NULL     COMMENT '阈值参数：{tolerance_mm,consecutive,minimum_change_mm,maximum_gap_minutes,...}',
  calibration_status ENUM('demo','pending_field_validation','validated') NOT NULL DEFAULT 'demo' COMMENT '阈值可信状态',
  is_terminal        TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=兜底规则（如 R5 未触发任何项）',
  enabled            TINYINT(1)      NOT NULL DEFAULT 1,
  rule_version       VARCHAR(32)     NOT NULL DEFAULT 'v1' COMMENT '规则版本（结论需记录当时版本）',
  description        VARCHAR(500)    NULL     COMMENT '规则说明与适用边界',
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alert_rule_code (code),
  KEY idx_alert_rule_order (enabled, evaluate_order),
  CONSTRAINT fk_alert_rule_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预警规则（R1–R5）';

-- 预警事件 [原型] buildEvents() 产出：eventId/recordId/batchId/timestamp/startTime/
--   metric/riskType/triggeredRule/reason/affectedLengthEstimate/emailStatus/handlingStatus
-- 去重：同一批次 + 规则 + 指标 + 窗口起点只产生一条事件；
--       窗口推进（window_start_time 变化）后允许再次产生事件
CREATE TABLE alert_event (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code               VARCHAR(64)     NOT NULL COMMENT '事件编号，如 QE-A-20261010-001 [原型 eventId]',
  rule_id            BIGINT UNSIGNED NOT NULL COMMENT '命中规则',
  rule_code          VARCHAR(32)     NOT NULL COMMENT '规则编码快照',
  rule_version       VARCHAR(32)     NULL     COMMENT '规则版本快照',
  risk_type          ENUM('medium','high','error') NOT NULL COMMENT '风险类型（原型无 high 规则，保留以扩展）',
  batch_id           BIGINT UNSIGNED NOT NULL COMMENT '批次号',
  spec_id            BIGINT UNSIGNED NULL     COMMENT '产品规格',
  metric_id          BIGINT UNSIGNED NOT NULL COMMENT '异常指标',
  trigger_record_id  BIGINT UNSIGNED NULL     COMMENT '触发记录 [原型 recordId]',
  window_start_time  DATETIME        NULL     COMMENT '异常窗口起点 [原型 startTime]',
  window_end_time    DATETIME        NOT NULL COMMENT '异常窗口终点/事件时间 [原型 timestamp]',
  reason             VARCHAR(1000)   NOT NULL COMMENT '触发原因说明 [原型 reason]',
  affected_length_m  DECIMAL(12,2)   NULL     COMMENT '影响长度演示估算 m [原型 affectedLengthEstimate]',
  line_speed_mpm     DECIMAL(8,2)    NULL     COMMENT '估算所用线速度 m/min（快照）',
  handling_status    ENUM('pending','processing','verified','closed','ignored') NOT NULL DEFAULT 'pending' COMMENT '处理状态 [原型 handlingStatus]',
  handler_user_id    BIGINT UNSIGNED NULL     COMMENT '处理人',
  handled_at         DATETIME        NULL     COMMENT '处理时间',
  handling_note      VARCHAR(500)    NULL     COMMENT '处理说明',
  generated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件生成时间',
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alert_event_code (code),
  UNIQUE KEY uk_alert_event_dedup (batch_id, rule_id, metric_id, window_start_time),
  KEY idx_alert_event_open (risk_type, handling_status, window_end_time),
  KEY idx_alert_event_batch (batch_id, window_end_time),
  CONSTRAINT fk_alert_event_rule FOREIGN KEY (rule_id) REFERENCES alert_rule (id) ON DELETE RESTRICT,
  CONSTRAINT fk_alert_event_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE RESTRICT,
  CONSTRAINT fk_alert_event_spec FOREIGN KEY (spec_id) REFERENCES product_spec (id) ON DELETE SET NULL,
  CONSTRAINT fk_alert_event_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT,
  CONSTRAINT fk_alert_event_record FOREIGN KEY (trigger_record_id) REFERENCES inspection_record (id) ON DELETE SET NULL,
  CONSTRAINT fk_alert_event_handler FOREIGN KEY (handler_user_id) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='质量预警事件';

-- 事件关联记录（触发点 + 参与窗口的可比较点），供"证据可定位"使用
CREATE TABLE alert_event_record (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id      BIGINT UNSIGNED NOT NULL COMMENT '预警事件',
  record_id     BIGINT UNSIGNED NOT NULL COMMENT '抽检记录',
  is_triggering TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=触发点，0=窗口内参与比较的点',
  sort_no       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_alert_event_record (event_id, record_id),
  KEY idx_alert_event_record_record (record_id),
  CONSTRAINT fk_alert_event_record_event FOREIGN KEY (event_id) REFERENCES alert_event (id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_event_record_record FOREIGN KEY (record_id) REFERENCES inspection_record (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预警事件关联抽检记录';

-- 通知 [原型] showMail()：收件角色（质量工程师/生产领班）、主题、正文、状态
-- is_simulated 区分"演示发送"与真实邮件服务；中风险自动发送策略待业务确认
CREATE TABLE notification (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(64)     NOT NULL COMMENT '通知编号',
  event_id      BIGINT UNSIGNED NOT NULL COMMENT '关联预警事件',
  channel       ENUM('email','sms','im','system') NOT NULL DEFAULT 'email' COMMENT '通知渠道',
  subject       VARCHAR(255)    NULL     COMMENT '主题',
  body          MEDIUMTEXT      NULL     COMMENT '正文',
  status        ENUM('pending','sent','failed','simulated','cancelled') NOT NULL DEFAULT 'pending' COMMENT '发送状态',
  is_simulated  TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1=模拟发送，未接入真实邮件服务',
  trigger_mode  ENUM('manual','auto') NOT NULL DEFAULT 'manual' COMMENT '触发方式：中风险自动发送策略待确认',
  attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '发送尝试次数',
  error_message VARCHAR(500)    NULL     COMMENT '失败原因',
  sent_at       DATETIME        NULL     COMMENT '发送时间',
  created_by    BIGINT UNSIGNED NULL     COMMENT '创建人',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notification_code (code),
  KEY idx_notification_event (event_id),
  KEY idx_notification_status (status, created_at),
  CONSTRAINT fk_notification_event FOREIGN KEY (event_id) REFERENCES alert_event (id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_creator FOREIGN KEY (created_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知（邮件/消息）';

CREATE TABLE notification_recipient (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id   BIGINT UNSIGNED NOT NULL COMMENT '通知',
  role_id           BIGINT UNSIGNED NULL     COMMENT '收件角色（按角色广播）',
  user_id           BIGINT UNSIGNED NULL     COMMENT '收件人（按人发送）',
  recipient_name    VARCHAR(64)     NULL     COMMENT '收件人/角色名称快照',
  recipient_address VARCHAR(128)    NULL     COMMENT '收件地址快照',
  delivery_status   ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending' COMMENT '投递状态',
  read_at           DATETIME        NULL     COMMENT '阅读时间',
  ack_status        ENUM('pending','acknowledged','rejected') NOT NULL DEFAULT 'pending' COMMENT '确认状态',
  ack_at            DATETIME        NULL     COMMENT '确认时间',
  ack_comment       VARCHAR(500)    NULL     COMMENT '确认/拒绝说明',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notification_recipient_notification (notification_id),
  KEY idx_notification_recipient_user (user_id, ack_status),
  CONSTRAINT fk_notification_recipient_notification FOREIGN KEY (notification_id) REFERENCES notification (id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_recipient_role FOREIGN KEY (role_id) REFERENCES sys_role (id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_recipient_user FOREIGN KEY (user_id) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知收件人与回执';


-- =====================================================================
-- G. 异常诊断、结构化结论与工程师验证（原型"异常诊断与验证"）
-- =====================================================================

-- 分析批次（一次"生成分析"）[原型] state.ai + state.hypotheses[scenario]
-- 重新生成 = 新增 run_no，历史结论与工程师记录不被覆盖
CREATE TABLE analysis_run (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                 VARCHAR(64)     NOT NULL COMMENT '分析批次号',
  event_id             BIGINT UNSIGNED NOT NULL COMMENT '预警事件',
  metric_id            BIGINT UNSIGNED NOT NULL COMMENT '分析指标 [原型 state.metric]',
  reference_batch_id   BIGINT UNSIGNED NULL     COMMENT '参考批次 [原型 state.golden]',
  factor_parameter_id  BIGINT UNSIGNED NULL     COMMENT '当前相关因素参数 [原型 currentFactor()]',
  run_no               INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT '同事件内的第几次生成',
  generation_type      ENUM('rule_based','llm') NOT NULL DEFAULT 'rule_based' COMMENT '生成方式：原型为本地规则，正式接入大模型时置 llm',
  model_name           VARCHAR(64)     NULL     COMMENT '模型名称（llm 时记录，便于追溯）',
  prompt_version       VARCHAR(32)     NULL     COMMENT '提示词版本',
  status               ENUM('running','completed','failed') NOT NULL DEFAULT 'running' COMMENT '生成状态',
  data_version_note    VARCHAR(255)    NULL     COMMENT '数据版本/数据边界说明',
  generated_by         BIGINT UNSIGNED NULL     COMMENT '生成人',
  generated_at         DATETIME        NULL     COMMENT '生成完成时间',
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_run_code (code),
  UNIQUE KEY uk_analysis_run_no (event_id, run_no),
  KEY idx_analysis_run_metric (metric_id),
  KEY idx_analysis_run_reference (reference_batch_id),
  CONSTRAINT fk_analysis_run_event FOREIGN KEY (event_id) REFERENCES alert_event (id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_run_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT,
  CONSTRAINT fk_analysis_run_reference FOREIGN KEY (reference_batch_id) REFERENCES production_batch (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_run_factor FOREIGN KEY (factor_parameter_id) REFERENCES process_parameter (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_run_user FOREIGN KEY (generated_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分析批次（一次生成分析）';

-- 参考版本快照 [原型] analysisReference / referenceSnapshot()
-- 冻结当时的参考统计量：更换参考批次不修改已保存结论（原型明确规则）
CREATE TABLE analysis_reference_snapshot (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id              BIGINT UNSIGNED NOT NULL COMMENT '分析批次（1:1）',
  reference_batch_id  BIGINT UNSIGNED NULL     COMMENT '参考批次',
  reference_batch_no  VARCHAR(64)     NULL     COMMENT '参考批次号快照',
  spec_code           VARCHAR(64)     NULL     COMMENT '规格编码快照',
  spec_name           VARCHAR(64)     NULL     COMMENT '规格名称快照',
  production_group    VARCHAR(32)     NULL     COMMENT '参考批次生产组别',
  metric_id           BIGINT UNSIGNED NOT NULL COMMENT '快照指标（可能与当前查看指标不同）',
  sample_count        INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '参与统计的抽检点数 n',
  median_value        DECIMAL(12,4)   NULL     COMMENT '中位数',
  min_value           DECIMAL(12,4)   NULL     COMMENT '观察最小值（非规格限值）',
  max_value           DECIMAL(12,4)   NULL     COMMENT '观察最大值（非规格限值）',
  material_condition  VARCHAR(255)    NULL     COMMENT '材料条件快照',
  measurement_method  VARCHAR(255)    NULL     COMMENT '测量方法快照',
  note                VARCHAR(500)    NULL     COMMENT '参考版本说明',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_reference_run (run_id),
  KEY idx_analysis_reference_batch (reference_batch_id),
  CONSTRAINT fk_analysis_reference_run FOREIGN KEY (run_id) REFERENCES analysis_run (id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_reference_batch FOREIGN KEY (reference_batch_id) REFERENCES production_batch (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_reference_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分析参考版本快照';

-- 结构化结论 [原型] hypothesis 对象：
--   id/hypothesis/rootCauseCategory/observation/supportingEvidence/
--   contradictingEvidence/mechanism/sources/missingEvidence/validationActions/
--   validationMethod/engineerDecision/engineerComment/validationResult/
--   actualFinding/finalAction/analysisReference/analysisGeneratedAt/updatedAt
-- 工程师验证字段与"AI 原始建议"分列保存，互不覆盖（原型明确要求）
CREATE TABLE analysis_conclusion (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id              BIGINT UNSIGNED NOT NULL COMMENT '分析批次',
  seq                 TINYINT UNSIGNED NOT NULL COMMENT '结论序号，同批次内 1..n',
  hypothesis          TEXT            NOT NULL COMMENT '结论/待验证假设原文',
  root_cause_category VARCHAR(64)     NULL     COMMENT '结论类别，如"趋势观察（非根因结论）"',
  observation         TEXT            NULL     COMMENT '观察事实',
  mechanism           TEXT            NULL     COMMENT '机理背景与适用边界',
  mechanism_sources   JSON            NULL     COMMENT '机理文献来源 [{title,url}]',
  missing_evidence     TEXT           NULL     COMMENT '缺失资料',
  validation_actions  TEXT            NULL     COMMENT '建议验证动作',
  validation_method   TEXT            NULL     COMMENT '验证方法（工程师可编辑）',
  engineer_decision   ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'pending' COMMENT '工程师判定：确认/否决/待验证',
  engineer_comment    TEXT            NULL     COMMENT '工程师备注 / 否决理由（否决必填）',
  validation_result   TEXT            NULL     COMMENT '验证结果（确认必填）',
  actual_finding      TEXT            NULL     COMMENT '实际发现',
  final_action        TEXT            NULL     COMMENT '最终处置',
  decided_by          BIGINT UNSIGNED NULL     COMMENT '判定人',
  decided_at          DATETIME        NULL     COMMENT '判定时间',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_conclusion_seq (run_id, seq),
  KEY idx_analysis_conclusion_decision (engineer_decision),
  CONSTRAINT fk_analysis_conclusion_run FOREIGN KEY (run_id) REFERENCES analysis_run (id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_conclusion_user FOREIGN KEY (decided_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 结构化分析结论与工程师验证';

-- 结论依据与证据 [原型] basis[] / supportingEvidence[] / contradictingEvidence[]
-- layer 取值：限值对照 / 变化趋势 / 参考对照 / 相关因素变化 / 观察事实
CREATE TABLE conclusion_evidence (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conclusion_id     BIGINT UNSIGNED NOT NULL COMMENT '结论',
  evidence_type     ENUM('basis','support','contradict') NOT NULL COMMENT '依据/支持证据/反向证据',
  layer             VARCHAR(64)     NULL     COMMENT '依据分层：限值对照等 [原型 basisItem.layer]',
  content           TEXT            NOT NULL COMMENT '证据内容',
  fact_time         DATETIME        NULL     COMMENT '可定位的事实时间 [原型 basisItem.time]',
  is_locateable     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=可在趋势图中定位 [原型 basisItem.locate]',
  related_record_id BIGINT UNSIGNED NULL     COMMENT '关联抽检记录（证据入口）',
  is_usable         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=该依据可用于结论 [原型 usable]',
  sort_no           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_conclusion_evidence_conclusion (conclusion_id, evidence_type),
  KEY idx_conclusion_evidence_record (related_record_id),
  CONSTRAINT fk_conclusion_evidence_conclusion FOREIGN KEY (conclusion_id) REFERENCES analysis_conclusion (id) ON DELETE CASCADE,
  CONSTRAINT fk_conclusion_evidence_record FOREIGN KEY (related_record_id) REFERENCES inspection_record (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='结论依据与证据';


-- =====================================================================
-- H. 8D 报告工作台
-- =====================================================================

-- 8D 报告 [原型] reportFor()：reportId/eventId/batchId/status/savedAt/finalizedAt
-- 一事件一报告；定稿为原型内确认，非企业 OA 审批
CREATE TABLE eight_d_report (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(64)     NOT NULL COMMENT '报告编号，如 8D-QE-... [原型 reportId]',
  event_id         BIGINT UNSIGNED NOT NULL COMMENT '关联预警事件（唯一）',
  batch_id         BIGINT UNSIGNED NOT NULL COMMENT '生产批次',
  spec_id          BIGINT UNSIGNED NULL     COMMENT '产品规格',
  production_group VARCHAR(32)     NULL     COMMENT '生产组别',
  metric_id        BIGINT UNSIGNED NULL     COMMENT '异常指标',
  rule_code        VARCHAR(32)     NULL     COMMENT '触发规则编码快照',
  window_start_time DATETIME       NULL     COMMENT '异常时段开始',
  window_end_time  DATETIME        NULL     COMMENT '异常时段结束',
  affected_length_m DECIMAL(12,2)  NULL     COMMENT '预计涉及米数 m（待核定）',
  status           ENUM('draft','finalized','obsolete') NOT NULL DEFAULT 'draft' COMMENT '报告状态 [原型 status：草稿/已定稿]',
  version_no       INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT '当前版本号',
  owner_user_id    BIGINT UNSIGNED NULL     COMMENT '质量工程师（负责人）',
  reviewer_user_id BIGINT UNSIGNED NULL     COMMENT '批准人（待确认）',
  saved_at         DATETIME        NULL     COMMENT '最近保存时间',
  finalized_at     DATETIME        NULL     COMMENT '定稿时间',
  reviewer_note    VARCHAR(500)    NULL     COMMENT '定稿/审批说明',
  created_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_eight_d_report_code (code),
  UNIQUE KEY uk_eight_d_report_event (event_id),
  KEY idx_eight_d_report_status (status, updated_at),
  CONSTRAINT fk_eight_d_report_event FOREIGN KEY (event_id) REFERENCES alert_event (id) ON DELETE RESTRICT,
  CONSTRAINT fk_eight_d_report_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE RESTRICT,
  CONSTRAINT fk_eight_d_report_spec FOREIGN KEY (spec_id) REFERENCES product_spec (id) ON DELETE SET NULL,
  CONSTRAINT fk_eight_d_report_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE SET NULL,
  CONSTRAINT fk_eight_d_report_owner FOREIGN KEY (owner_user_id) REFERENCES sys_user (id) ON DELETE SET NULL,
  CONSTRAINT fk_eight_d_report_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES sys_user (id) ON DELETE SET NULL,
  CONSTRAINT fk_eight_d_report_creator FOREIGN KEY (created_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='8D 报告';

-- 8D 各章节内容 [原型] reportNames D1–D8
-- source_type 对应原型的来源标记：AI 预填（D1/D3/D4）/ 工程师负责 / 待补充
CREATE TABLE eight_d_field (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id   BIGINT UNSIGNED NOT NULL COMMENT '报告',
  field_code  ENUM('D1','D2','D3','D4','D5','D6','D7','D8') NOT NULL COMMENT '8D 章节编码',
  field_name  VARCHAR(128)    NOT NULL COMMENT '章节名称',
  content     MEDIUMTEXT      NULL     COMMENT '内容',
  source_type ENUM('pending','ai_prefill','engineer') NOT NULL DEFAULT 'pending' COMMENT '内容来源：待补充/AI 预填需确认/工程师负责',
  is_required TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1=定稿必填',
  updated_by  BIGINT UNSIGNED NULL     COMMENT '最后修改人',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_eight_d_field (report_id, field_code),
  CONSTRAINT fk_eight_d_field_report FOREIGN KEY (report_id) REFERENCES eight_d_report (id) ON DELETE CASCADE,
  CONSTRAINT fk_eight_d_field_user FOREIGN KEY (updated_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='8D 报告章节内容';

-- 报告修订历史 [原型] report.history 列表
-- content_snapshot 保存当次 D1–D8 全文快照，便于逐版比对与审计
CREATE TABLE eight_d_revision (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id        BIGINT UNSIGNED NOT NULL COMMENT '报告',
  version_no       INT UNSIGNED    NOT NULL COMMENT '版本号',
  action           ENUM('create','save_draft','ai_prefill','finalize','export','reopen') NOT NULL COMMENT '动作',
  operator_user_id BIGINT UNSIGNED NULL     COMMENT '操作人',
  summary          VARCHAR(500)    NULL     COMMENT '动作摘要 [原型 history[].action]',
  content_snapshot JSON            NOT NULL COMMENT 'D1–D8 全文快照 {"D1":"...",...}',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eight_d_revision_report (report_id, version_no),
  CONSTRAINT fk_eight_d_revision_report FOREIGN KEY (report_id) REFERENCES eight_d_report (id) ON DELETE CASCADE,
  CONSTRAINT fk_eight_d_revision_user FOREIGN KEY (operator_user_id) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='8D 报告修订历史';


-- =====================================================================
-- I. 历史分析归档（原型"历史分析"）
-- 归档 = 冻结快照：只写不改。归档后不随当前数据变化（原型明确规则），
-- 因此本组表不设置 updated_at，也不随源记录级联更新
-- =====================================================================

CREATE TABLE analysis_archive (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(64)     NOT NULL COMMENT '归档案号，如 ARC-001 [原型 id]',
  event_id            BIGINT UNSIGNED NULL     COMMENT '归档时的预警事件',
  run_id              BIGINT UNSIGNED NULL     COMMENT '归档时的分析批次',
  batch_id            BIGINT UNSIGNED NOT NULL COMMENT '生产批次',
  spec_id             BIGINT UNSIGNED NULL     COMMENT '产品规格',
  metric_id           BIGINT UNSIGNED NOT NULL COMMENT '异常指标',
  reference_batch_id  BIGINT UNSIGNED NULL     COMMENT '参考批次',
  factor_parameter_id BIGINT UNSIGNED NULL     COMMENT '相关因素参数',
  risk_type           ENUM('medium','high','error') NULL     COMMENT '归档时风险类型',
  rule_code           VARCHAR(32)     NULL     COMMENT '归档时触发规则编码',
  event_time          DATETIME        NULL     COMMENT '归档时的异常时间',
  total_conclusions   INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '结论总数',
  confirmed_count     INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '已确认数',
  rejected_count      INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '已否决数',
  pending_count       INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '待验证数',
  archived_by         BIGINT UNSIGNED NULL     COMMENT '归档人',
  archived_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
  remark              VARCHAR(500)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_archive_code (code),
  KEY idx_analysis_archive_batch (batch_id, archived_at),
  KEY idx_analysis_archive_event (event_id),
  CONSTRAINT fk_analysis_archive_event FOREIGN KEY (event_id) REFERENCES alert_event (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_archive_run FOREIGN KEY (run_id) REFERENCES analysis_run (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_archive_batch FOREIGN KEY (batch_id) REFERENCES production_batch (id) ON DELETE RESTRICT,
  CONSTRAINT fk_analysis_archive_spec FOREIGN KEY (spec_id) REFERENCES product_spec (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_archive_metric FOREIGN KEY (metric_id) REFERENCES quality_metric (id) ON DELETE RESTRICT,
  CONSTRAINT fk_analysis_archive_reference FOREIGN KEY (reference_batch_id) REFERENCES production_batch (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_archive_factor FOREIGN KEY (factor_parameter_id) REFERENCES process_parameter (id) ON DELETE SET NULL,
  CONSTRAINT fk_analysis_archive_user FOREIGN KEY (archived_by) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分析归档（冻结快照表头）';

-- 归档结论快照。basis_json 冻结"分析依据/证据/来源"的展示结构：
--   {"basis":[{"layer","text","time","locate"}],
--    "support":[{"text","time"}],"contradict":[{"text","time"}],
--    "sources":[{"title","url"}]}
CREATE TABLE analysis_archive_conclusion (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  archive_id           BIGINT UNSIGNED NOT NULL COMMENT '归档案号',
  seq                  SMALLINT UNSIGNED NOT NULL COMMENT '序号',
  source_conclusion_id BIGINT UNSIGNED NULL     COMMENT '来源结论（仅溯源用，不参与级联）',
  hypothesis           TEXT            NOT NULL COMMENT '结论原文快照',
  root_cause_category  VARCHAR(64)     NULL     COMMENT '结论类别快照',
  observation          TEXT            NULL     COMMENT '观察事实快照',
  mechanism            TEXT            NULL     COMMENT '机理背景快照',
  missing_evidence     TEXT            NULL     COMMENT '缺失资料快照',
  validation_actions   TEXT            NULL     COMMENT '建议动作快照',
  validation_method    TEXT            NULL     COMMENT '验证方法快照',
  validation_result    TEXT            NULL     COMMENT '工程师验证结果快照',
  engineer_comment     TEXT            NULL     COMMENT '工程师备注/否决理由快照',
  actual_finding       TEXT            NULL     COMMENT '实际发现快照',
  final_action         TEXT            NULL     COMMENT '最终处置快照',
  engineer_decision    ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'pending' COMMENT '归档时判定状态',
  decided_at           DATETIME        NULL     COMMENT '归档时判定时间',
  analysis_generated_at DATETIME       NULL     COMMENT '结论生成时间快照',
  basis_json           JSON            NOT NULL COMMENT '依据/证据/来源快照',
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_analysis_archive_conclusion (archive_id, seq),
  CONSTRAINT fk_analysis_archive_conclusion_archive FOREIGN KEY (archive_id) REFERENCES analysis_archive (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='归档结论快照';


-- =====================================================================
-- J. 操作与审计日志（原型 state.history：ai / decision / archive 事件）
-- =====================================================================

CREATE TABLE operation_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NULL     COMMENT '操作人（系统任务为空）',
  module       VARCHAR(64)     NOT NULL COMMENT '模块：data_admin/quality_monitor/diagnosis/eight_d/archive/auth',
  action_type  VARCHAR(32)     NOT NULL COMMENT '动作：ai_generate/engineer_decision/archive/report_save/report_finalize/import/data_crud/notify/login',
  target_type  VARCHAR(64)     NULL     COMMENT '目标对象类型',
  target_id    VARCHAR(64)     NULL     COMMENT '目标对象标识',
  detail       VARCHAR(1000)   NULL     COMMENT '操作说明 [原型 history[].action]',
  detail_json  JSON            NULL     COMMENT '结构化明细',
  ip_address   VARCHAR(64)     NULL,
  user_agent   VARCHAR(255)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operation_log_module (module, action_type, created_at),
  KEY idx_operation_log_target (target_type, target_id),
  KEY idx_operation_log_user (user_id, created_at),
  CONSTRAINT fk_operation_log_user FOREIGN KEY (user_id) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='操作与审计日志';


-- =====================================================================
-- K. 便捷视图
-- 说明：长表（指标值行）转宽表，便于后端直接按列返回前端。
-- 新增指标时需同步扩列；若指标频繁变动，建议改由后端动态透视。
-- =====================================================================

-- 抽检记录宽表：保留原型 metricValue('ovality') 的取值规则
-- （同截面最大/最小外径差优先，缺失时回落到入库的不圆度值）
CREATE OR REPLACE VIEW v_inspection_record_wide AS
SELECT
  r.id,
  r.code,
  r.sample_no,
  b.batch_no,
  r.production_group,
  s.code AS spec_code,
  s.name AS spec_name,
  r.inspect_time,
  r.production_time,
  r.inspection_delay_minutes,
  r.measurement_stage,
  r.inspection_method,
  r.instrument_info,
  r.quality_flag,
  r.quality_note,
  r.simulated_ovality,
  r.record_status,
  ds.name AS data_source_name,
  ds.is_simulated AS source_is_simulated,
  p.outer_diameter_mm,
  p.min_wall_thickness_mm,
  p.max_wall_thickness_mm,
  p.max_outer_diameter_mm,
  p.min_outer_diameter_mm,
  p.ovality_stored_mm,
  COALESCE(p.max_outer_diameter_mm - p.min_outer_diameter_mm, p.ovality_stored_mm) AS ovality_effective_mm
FROM inspection_record r
JOIN production_batch b ON b.id = r.batch_id
LEFT JOIN product_spec s ON s.id = r.spec_id
LEFT JOIN data_source ds ON ds.id = r.data_source_id
LEFT JOIN (
  SELECT
    v.record_id,
    MAX(CASE WHEN m.code = 'outer_diameter'     THEN v.metric_value END) AS outer_diameter_mm,
    MAX(CASE WHEN m.code = 'min_wall_thickness' THEN v.metric_value END) AS min_wall_thickness_mm,
    MAX(CASE WHEN m.code = 'max_wall_thickness' THEN v.metric_value END) AS max_wall_thickness_mm,
    MAX(CASE WHEN m.code = 'max_outer_diameter' THEN v.metric_value END) AS max_outer_diameter_mm,
    MAX(CASE WHEN m.code = 'min_outer_diameter' THEN v.metric_value END) AS min_outer_diameter_mm,
    MAX(CASE WHEN m.code = 'ovality'            THEN v.metric_value END) AS ovality_stored_mm
  FROM inspection_value v
  JOIN quality_metric m ON m.id = v.metric_id
  GROUP BY v.record_id
) p ON p.record_id = r.id;

-- 产品数据宽表（批次 + 生产日期唯一，供"相关因素变化趋势"取当日水平参考线）
CREATE OR REPLACE VIEW v_product_data_wide AS
SELECT
  d.id,
  d.code,
  b.batch_no,
  d.production_date,
  ds.name AS data_source_name,
  ds.is_simulated AS source_is_simulated,
  p.outer_diameter_mm,
  p.min_wall_thickness_mm,
  p.max_wall_thickness_mm,
  p.ovality_mm,
  COALESCE(p.max_outer_diameter_mm - p.min_outer_diameter_mm, p.ovality_mm) AS ovality_effective_mm
FROM product_data d
JOIN production_batch b ON b.id = d.batch_id
LEFT JOIN data_source ds ON ds.id = d.data_source_id
LEFT JOIN (
  SELECT
    v.product_data_id,
    MAX(CASE WHEN m.code = 'outer_diameter'     THEN v.metric_value END) AS outer_diameter_mm,
    MAX(CASE WHEN m.code = 'min_wall_thickness' THEN v.metric_value END) AS min_wall_thickness_mm,
    MAX(CASE WHEN m.code = 'max_wall_thickness' THEN v.metric_value END) AS max_wall_thickness_mm,
    MAX(CASE WHEN m.code = 'ovality'            THEN v.metric_value END) AS ovality_mm,
    MAX(CASE WHEN m.code = 'max_outer_diameter' THEN v.metric_value END) AS max_outer_diameter_mm,
    MAX(CASE WHEN m.code = 'min_outer_diameter' THEN v.metric_value END) AS min_outer_diameter_mm
  FROM product_data_value v
  JOIN quality_metric m ON m.id = v.metric_id
  GROUP BY v.product_data_id
) p ON p.product_data_id = d.id;

-- 设备采集宽表（按批次号 + 生产日期 + 采集时间逐小时排列）
CREATE OR REPLACE VIEW v_equipment_reading_wide AS
SELECT
  r.id,
  r.code,
  b.batch_no,
  r.production_date,
  e.code AS equipment_code,
  e.name AS equipment_name,
  r.collect_time,
  r.collected_at,
  ds.name AS data_source_name,
  ds.is_simulated AS source_is_simulated,
  p.temperature_c,
  p.pressure_mpa,
  p.haul_off_speed_mpm
FROM equipment_reading r
JOIN production_batch b ON b.id = r.batch_id
JOIN equipment e ON e.id = r.equipment_id
LEFT JOIN data_source ds ON ds.id = r.data_source_id
LEFT JOIN (
  SELECT
    v.reading_id,
    MAX(CASE WHEN pp.code = 'temperature'     THEN v.parameter_value END) AS temperature_c,
    MAX(CASE WHEN pp.code = 'pressure'        THEN v.parameter_value END) AS pressure_mpa,
    MAX(CASE WHEN pp.code = 'haul_off_speed'  THEN v.parameter_value END) AS haul_off_speed_mpm
  FROM equipment_reading_value v
  JOIN process_parameter pp ON pp.id = v.parameter_id
  GROUP BY v.reading_id
) p ON p.reading_id = r.id;

-- 预警事件明细视图（预警列表与详情接口可直接使用）
CREATE OR REPLACE VIEW v_alert_event_detail AS
SELECT
  e.id,
  e.code,
  e.risk_type,
  e.rule_code,
  e.rule_version,
  ar.name              AS rule_name,
  ar.calibration_status AS rule_calibration_status,
  b.batch_no,
  b.production_group,
  s.code               AS spec_code,
  s.name               AS spec_name,
  m.code               AS metric_code,
  m.name               AS metric_name,
  m.unit               AS metric_unit,
  m.decimal_scale      AS metric_decimal_scale,
  e.trigger_record_id,
  ir.code              AS trigger_record_code,
  ir.sample_no         AS trigger_sample_no,
  e.window_start_time,
  e.window_end_time,
  e.reason,
  e.affected_length_m,
  e.line_speed_mpm,
  e.handling_status,
  e.handled_at,
  e.handling_note,
  hu.display_name      AS handler_name,
  e.generated_at
FROM alert_event e
JOIN alert_rule ar        ON ar.id = e.rule_id
JOIN production_batch b   ON b.id = e.batch_id
LEFT JOIN product_spec s  ON s.id = e.spec_id
JOIN quality_metric m     ON m.id = e.metric_id
LEFT JOIN inspection_record ir ON ir.id = e.trigger_record_id
LEFT JOIN sys_user hu     ON hu.id = e.handler_user_id;

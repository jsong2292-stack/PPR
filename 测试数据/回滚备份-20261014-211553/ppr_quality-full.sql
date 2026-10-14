-- MySQL dump 10.13  Distrib 26.7.0, for Linux (aarch64)
--
-- Host: localhost    Database: ppr_quality
-- ------------------------------------------------------
-- Server version	26.7.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `alert_event`
--

DROP TABLE IF EXISTS `alert_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_event` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '事件编号，如 QE-A-20261010-001 [原型 eventId]',
  `rule_id` bigint unsigned NOT NULL COMMENT '命中规则',
  `rule_code` varchar(32) NOT NULL COMMENT '规则编码快照',
  `rule_version` varchar(32) DEFAULT NULL COMMENT '规则版本快照',
  `risk_type` enum('medium','high','error') NOT NULL COMMENT '风险类型（原型无 high 规则，保留以扩展）',
  `batch_id` bigint unsigned NOT NULL COMMENT '批次号',
  `spec_id` bigint unsigned DEFAULT NULL COMMENT '产品规格',
  `metric_id` bigint unsigned NOT NULL COMMENT '异常指标',
  `trigger_record_id` bigint unsigned DEFAULT NULL COMMENT '触发记录 [原型 recordId]',
  `window_start_time` datetime DEFAULT NULL COMMENT '异常窗口起点 [原型 startTime]',
  `window_end_time` datetime NOT NULL COMMENT '异常窗口终点/事件时间 [原型 timestamp]',
  `reason` varchar(1000) NOT NULL COMMENT '触发原因说明 [原型 reason]',
  `affected_length_m` decimal(12,2) DEFAULT NULL COMMENT '影响长度演示估算 m [原型 affectedLengthEstimate]',
  `line_speed_mpm` decimal(8,2) DEFAULT NULL COMMENT '估算所用线速度 m/min（快照）',
  `handling_status` enum('pending','processing','verified','closed','ignored') NOT NULL DEFAULT 'pending' COMMENT '处理状态 [原型 handlingStatus]',
  `handler_user_id` bigint unsigned DEFAULT NULL COMMENT '处理人',
  `handled_at` datetime DEFAULT NULL COMMENT '处理时间',
  `handling_note` varchar(500) DEFAULT NULL COMMENT '处理说明',
  `generated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件生成时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alert_event_code` (`code`),
  UNIQUE KEY `uk_alert_event_dedup` (`batch_id`,`rule_id`,`metric_id`,`window_start_time`),
  KEY `idx_alert_event_open` (`risk_type`,`handling_status`,`window_end_time`),
  KEY `idx_alert_event_batch` (`batch_id`,`window_end_time`),
  KEY `fk_alert_event_rule` (`rule_id`),
  KEY `fk_alert_event_spec` (`spec_id`),
  KEY `fk_alert_event_metric` (`metric_id`),
  KEY `fk_alert_event_record` (`trigger_record_id`),
  KEY `fk_alert_event_handler` (`handler_user_id`),
  CONSTRAINT `fk_alert_event_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_alert_event_handler` FOREIGN KEY (`handler_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_alert_event_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_alert_event_record` FOREIGN KEY (`trigger_record_id`) REFERENCES `inspection_record` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_alert_event_rule` FOREIGN KEY (`rule_id`) REFERENCES `alert_rule` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_alert_event_spec` FOREIGN KEY (`spec_id`) REFERENCES `product_spec` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='质量预警事件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_event`
--

LOCK TABLES `alert_event` WRITE;
/*!40000 ALTER TABLE `alert_event` DISABLE KEYS */;
INSERT INTO `alert_event` VALUES (4,'QE-12121D0032-20261009-001',3,'R3','v1','medium',4,1,6,15,'2026-10-09 08:00:00','2026-10-09 08:00:00','不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。',NULL,12.70,'processing',1,'2026-10-12 19:36:35','诊断结论已由工程师确认，事件转入处理中','2026-10-12 19:34:43','2026-10-12 19:34:43','2026-10-12 19:36:35'),(5,'QE-12121D0029-20261009-001',1,'R1','v1','error',3,1,1,8,'2026-10-09 08:00:00','2026-10-09 08:00:00','同一指标存在两条来源记录：MES 生产系统 25.235 mm，QMS 检验系统 25.290 mm，差值 0.055 mm，核对结论尚未确认。请先核对样管编号、原始检验单与仪器，差异核实前不作产品质量结论。',NULL,NULL,'pending',NULL,NULL,NULL,'2026-10-12 19:34:43','2026-10-12 19:34:43','2026-10-12 19:34:43');
/*!40000 ALTER TABLE `alert_event` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `alert_event_record`
--

DROP TABLE IF EXISTS `alert_event_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_event_record` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` bigint unsigned NOT NULL COMMENT '预警事件',
  `record_id` bigint unsigned NOT NULL COMMENT '抽检记录',
  `is_triggering` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=触发点，0=窗口内参与比较的点',
  `sort_no` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alert_event_record` (`event_id`,`record_id`),
  KEY `idx_alert_event_record_record` (`record_id`),
  CONSTRAINT `fk_alert_event_record_event` FOREIGN KEY (`event_id`) REFERENCES `alert_event` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_alert_event_record_record` FOREIGN KEY (`record_id`) REFERENCES `inspection_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预警事件关联抽检记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_event_record`
--

LOCK TABLES `alert_event_record` WRITE;
/*!40000 ALTER TABLE `alert_event_record` DISABLE KEYS */;
INSERT INTO `alert_event_record` VALUES (4,4,15,1,0,'2026-10-12 19:34:43'),(5,5,8,1,0,'2026-10-12 19:34:43');
/*!40000 ALTER TABLE `alert_event_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `alert_rule`
--

DROP TABLE IF EXISTS `alert_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_rule` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '规则编码：R1/R2/R3/R4/R5',
  `name` varchar(128) NOT NULL COMMENT '规则名称',
  `risk_type` enum('normal','medium','high','error') NOT NULL COMMENT '命中后风险类型',
  `evaluate_order` tinyint unsigned NOT NULL COMMENT '顺序判断优先级（小者先）',
  `rule_category` enum('data_consistency','data_validity','spec_limit','trend','fallback') NOT NULL COMMENT '规则类别',
  `metric_id` bigint unsigned DEFAULT NULL COMMENT '限定指标，NULL=适用于全部指标',
  `params_json` json DEFAULT NULL COMMENT '阈值参数：{tolerance_mm,consecutive,minimum_change_mm,maximum_gap_minutes,...}',
  `calibration_status` enum('demo','pending_field_validation','validated') NOT NULL DEFAULT 'demo' COMMENT '阈值可信状态',
  `is_terminal` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=兜底规则（如 R5 未触发任何项）',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `rule_version` varchar(32) NOT NULL DEFAULT 'v1' COMMENT '规则版本（结论需记录当时版本）',
  `description` varchar(500) DEFAULT NULL COMMENT '规则说明与适用边界',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alert_rule_code` (`code`),
  KEY `idx_alert_rule_order` (`enabled`,`evaluate_order`),
  KEY `fk_alert_rule_metric` (`metric_id`),
  CONSTRAINT `fk_alert_rule_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预警规则（R1–R5）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_rule`
--

LOCK TABLES `alert_rule` WRITE;
/*!40000 ALTER TABLE `alert_rule` DISABLE KEYS */;
INSERT INTO `alert_rule` VALUES (1,'R1','数据记录差异待核对','error',1,'data_consistency',NULL,'{}','demo',0,1,'v1','同一指标在两条来源记录中的差值超过容差时触发。本条只提示核对原始记录，不构成产品不合格结论。容差与匹配窗口需质量部门按现场口径标定。','2026-10-12 19:03:33','2026-10-12 19:35:30'),(2,'R2','原始测量数据错误或样管规格匹配待核对','error',2,'data_validity',NULL,'{}','demo',0,1,'v1','测量值不满足基本物理关系（如最大外径小于最小外径、最小壁厚大于最大壁厚、非正值），或测量值与当前规格明显不符时触发。用于拦截录入与匹配问题，不作产品质量结论。','2026-10-12 19:03:33','2026-10-12 19:13:36'),(3,'R3','规格限值对照','medium',3,'spec_limit',NULL,'{}','demo',0,1,'v1','测量值落在产品规格上下限之外时触发。上下限取自 metric_spec_limit，当前标定为待现场确认状态；正式执行标准发布后应替换并改为 validated。','2026-10-12 19:03:33','2026-10-12 19:13:36'),(4,'R4','连续抽检点趋势变化待复核','medium',4,'trend',NULL,'{\"consecutive\": 3, \"minimum_change_mm\": 0.015, \"maximum_gap_minutes\": 240, \"maximum_window_hours\": 24}','demo',0,1,'v1','同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔与运行连续性满足条件时触发。阈值（连续点数、变化幅度、最大间隔）需按现场节拍标定。','2026-10-12 19:03:33','2026-10-12 19:58:13'),(5,'R5','未命中预警规则','normal',5,'fallback',NULL,'{}','demo',1,1,'v1','R1–R4 均未命中时的兜底结论。仅表示按当前规则集未发现问题，不代表产品已完成正式合格判定。','2026-10-12 19:03:33','2026-10-12 19:13:36');
/*!40000 ALTER TABLE `alert_rule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `analysis_archive`
--

DROP TABLE IF EXISTS `analysis_archive`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analysis_archive` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '归档案号，如 ARC-001 [原型 id]',
  `event_id` bigint unsigned DEFAULT NULL COMMENT '归档时的预警事件',
  `run_id` bigint unsigned DEFAULT NULL COMMENT '归档时的分析批次',
  `batch_id` bigint unsigned NOT NULL COMMENT '生产批次',
  `spec_id` bigint unsigned DEFAULT NULL COMMENT '产品规格',
  `metric_id` bigint unsigned NOT NULL COMMENT '异常指标',
  `reference_batch_id` bigint unsigned DEFAULT NULL COMMENT '参考批次',
  `factor_parameter_id` bigint unsigned DEFAULT NULL COMMENT '相关因素参数',
  `risk_type` enum('medium','high','error') DEFAULT NULL COMMENT '归档时风险类型',
  `rule_code` varchar(32) DEFAULT NULL COMMENT '归档时触发规则编码',
  `event_time` datetime DEFAULT NULL COMMENT '归档时的异常时间',
  `total_conclusions` int unsigned NOT NULL DEFAULT '0' COMMENT '结论总数',
  `confirmed_count` int unsigned NOT NULL DEFAULT '0' COMMENT '已确认数',
  `rejected_count` int unsigned NOT NULL DEFAULT '0' COMMENT '已否决数',
  `pending_count` int unsigned NOT NULL DEFAULT '0' COMMENT '待验证数',
  `archived_by` bigint unsigned DEFAULT NULL COMMENT '归档人',
  `archived_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
  `remark` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_archive_code` (`code`),
  KEY `idx_analysis_archive_batch` (`batch_id`,`archived_at`),
  KEY `idx_analysis_archive_event` (`event_id`),
  KEY `fk_analysis_archive_run` (`run_id`),
  KEY `fk_analysis_archive_spec` (`spec_id`),
  KEY `fk_analysis_archive_metric` (`metric_id`),
  KEY `fk_analysis_archive_reference` (`reference_batch_id`),
  KEY `fk_analysis_archive_factor` (`factor_parameter_id`),
  KEY `fk_analysis_archive_user` (`archived_by`),
  CONSTRAINT `fk_analysis_archive_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_analysis_archive_event` FOREIGN KEY (`event_id`) REFERENCES `alert_event` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_archive_factor` FOREIGN KEY (`factor_parameter_id`) REFERENCES `process_parameter` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_archive_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_analysis_archive_reference` FOREIGN KEY (`reference_batch_id`) REFERENCES `production_batch` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_archive_run` FOREIGN KEY (`run_id`) REFERENCES `analysis_run` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_archive_spec` FOREIGN KEY (`spec_id`) REFERENCES `product_spec` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_archive_user` FOREIGN KEY (`archived_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分析归档（冻结快照表头）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `analysis_archive`
--

LOCK TABLES `analysis_archive` WRITE;
/*!40000 ALTER TABLE `analysis_archive` DISABLE KEYS */;
/*!40000 ALTER TABLE `analysis_archive` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `analysis_archive_conclusion`
--

DROP TABLE IF EXISTS `analysis_archive_conclusion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analysis_archive_conclusion` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `archive_id` bigint unsigned NOT NULL COMMENT '归档案号',
  `seq` smallint unsigned NOT NULL COMMENT '序号',
  `source_conclusion_id` bigint unsigned DEFAULT NULL COMMENT '来源结论（仅溯源用，不参与级联）',
  `hypothesis` text NOT NULL COMMENT '结论原文快照',
  `root_cause_category` varchar(64) DEFAULT NULL COMMENT '结论类别快照',
  `observation` text COMMENT '观察事实快照',
  `mechanism` text COMMENT '机理背景快照',
  `missing_evidence` text COMMENT '缺失资料快照',
  `validation_actions` text COMMENT '建议动作快照',
  `validation_method` text COMMENT '验证方法快照',
  `validation_result` text COMMENT '工程师验证结果快照',
  `engineer_comment` text COMMENT '工程师备注/否决理由快照',
  `actual_finding` text COMMENT '实际发现快照',
  `final_action` text COMMENT '最终处置快照',
  `engineer_decision` enum('pending','confirmed','rejected') NOT NULL DEFAULT 'pending' COMMENT '归档时判定状态',
  `decided_at` datetime DEFAULT NULL COMMENT '归档时判定时间',
  `analysis_generated_at` datetime DEFAULT NULL COMMENT '结论生成时间快照',
  `basis_json` json NOT NULL COMMENT '依据/证据/来源快照',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_archive_conclusion` (`archive_id`,`seq`),
  CONSTRAINT `fk_analysis_archive_conclusion_archive` FOREIGN KEY (`archive_id`) REFERENCES `analysis_archive` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='归档结论快照';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `analysis_archive_conclusion`
--

LOCK TABLES `analysis_archive_conclusion` WRITE;
/*!40000 ALTER TABLE `analysis_archive_conclusion` DISABLE KEYS */;
/*!40000 ALTER TABLE `analysis_archive_conclusion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `analysis_conclusion`
--

DROP TABLE IF EXISTS `analysis_conclusion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analysis_conclusion` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `run_id` bigint unsigned NOT NULL COMMENT '分析批次',
  `seq` tinyint unsigned NOT NULL COMMENT '结论序号，同批次内 1..n',
  `hypothesis` text NOT NULL COMMENT '结论/待验证假设原文',
  `root_cause_category` varchar(64) DEFAULT NULL COMMENT '结论类别，如"趋势观察（非根因结论）"',
  `observation` text COMMENT '观察事实',
  `mechanism` text COMMENT '机理背景与适用边界',
  `mechanism_sources` json DEFAULT NULL COMMENT '机理文献来源 [{title,url}]',
  `missing_evidence` text COMMENT '缺失资料',
  `validation_actions` text COMMENT '建议验证动作',
  `validation_method` text COMMENT '验证方法（工程师可编辑）',
  `engineer_decision` enum('pending','confirmed','rejected') NOT NULL DEFAULT 'pending' COMMENT '工程师判定：确认/否决/待验证',
  `engineer_comment` text COMMENT '工程师备注 / 否决理由（否决必填）',
  `validation_result` text COMMENT '验证结果（确认必填）',
  `actual_finding` text COMMENT '实际发现',
  `final_action` text COMMENT '最终处置',
  `decided_by` bigint unsigned DEFAULT NULL COMMENT '判定人',
  `decided_at` datetime DEFAULT NULL COMMENT '判定时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_conclusion_seq` (`run_id`,`seq`),
  KEY `idx_analysis_conclusion_decision` (`engineer_decision`),
  KEY `fk_analysis_conclusion_user` (`decided_by`),
  CONSTRAINT `fk_analysis_conclusion_run` FOREIGN KEY (`run_id`) REFERENCES `analysis_run` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_analysis_conclusion_user` FOREIGN KEY (`decided_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI 结构化分析结论与工程师验证';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `analysis_conclusion`
--

LOCK TABLES `analysis_conclusion` WRITE;
/*!40000 ALTER TABLE `analysis_conclusion` DISABLE KEYS */;
INSERT INTO `analysis_conclusion` VALUES (6,4,1,'过程参数（温度 / 牵引速度 / 压力）偏离设定，导致不圆度超出当前配置范围','过程参数漂移','本批次 1 条记录的不圆度超出规格限值；其中温区「M1 机筒3区」实测与设定偏差最大（1.0 °C）。','温度或牵引速度变化会直接改变熔体流动与冷却定型条件，进而影响管材的壁厚分布与外径尺寸。','[\"塑料管材挤出成型工艺：温度—熔体黏度—壁厚关系\", \"牵引速度与管材外径的对应关系\"]',NULL,'调取 12121D0032 批次的温区记录，核对「M1 机筒3区」设定值是否在工艺卡范围内；同步核对牵引速度与压力记录的实际波动区间。','工艺记录与工艺卡逐项比对 + 现场复核仪表读数','confirmed','现场核对工艺记录与定径套冷却水记录后确认','调取 12121D0032 批次 7 条工艺记录：M1 机筒3区 设定 198.0°C / 实测 199.0°C，偏差 1.0°C，在工艺卡 ±2°C 范围内；同期牵引速度 1.42-1.48 m/min，波动 0.06 m/min。','温区偏差未超工艺卡范围；但 3# 定径套冷却水温度由 18.2°C 升至 22.6°C，与不圆度由 0.21mm 升至 0.42mm 同步，判定为过程参数（冷却）漂移。','更换 3# 定径套冷却水调节阀并加装水温在线监控；责任：设备工程师；完成时间 2026-10-15。',1,'2026-10-12 19:36:35','2026-10-12 19:36:23','2026-10-12 19:36:35'),(7,4,2,'抽检测量结果与在线测量结果存在系统差异，超范围可能是测量口径不一致而非产品实际偏移','测量系统差异','在线不圆度中位数 0.180 mm，与抽检记录存在可对照的数据。','在线测量与实验室抽检的测量位置、方法与量具不同，天然存在偏差；需要先用同一样管做比对才能确认差异量级。','[\"测量系统分析（MSA）：重复性与再现性\", \"在线测量与离线抽检的测量位置差异\"]',NULL,'取同一根样管分别用在线测量与抽检方法各测一次，记录两组数据；若差异超过比对容差，先修正数据口径再讨论产品是否偏离。','同一样管双方法比对（测量系统分析）','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:36:23','2026-10-12 19:36:23'),(8,6,1,'过程参数（温度 / 牵引速度 / 压力）偏离设定，导致不圆度超出当前配置范围','过程参数漂移','本批次 1 条记录的不圆度超出规格限值；其中温区「M1 机筒3区」实测与设定偏差最大（1.0 °C）。','温度或牵引速度变化会直接改变熔体流动与冷却定型条件，进而影响管材的壁厚分布与外径尺寸。','[\"塑料管材挤出成型工艺：温度—熔体黏度—壁厚关系\", \"牵引速度与管材外径的对应关系\"]',NULL,'调取 12121D0032 批次的温区记录，核对「M1 机筒3区」设定值是否在工艺卡范围内；同步核对牵引速度与压力记录的实际波动区间。','工艺记录与工艺卡逐项比对 + 现场复核仪表读数','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(9,6,2,'抽检测量结果与在线测量结果存在系统差异，超范围可能是测量口径不一致而非产品实际偏移','测量系统差异','在线不圆度中位数 0.180 mm，与抽检记录存在可对照的数据。','在线测量与实验室抽检的测量位置、方法与量具不同，天然存在偏差；需要先用同一样管做比对才能确认差异量级。','[\"测量系统分析（MSA）：重复性与再现性\", \"在线测量与离线抽检的测量位置差异\"]',NULL,'取同一根样管分别用在线测量与抽检方法各测一次，记录两组数据；若差异超过比对容差，先修正数据口径再讨论产品是否偏离。','同一样管双方法比对（测量系统分析）','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(10,7,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(11,7,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(12,8,1,'过程参数（温度 / 牵引速度 / 压力）偏离设定，导致不圆度超出当前配置范围','过程参数漂移','本批次 1 条记录的不圆度超出规格限值；其中温区「M1 机筒1区」实测与设定偏差最大（1.5 °C）。','温度或牵引速度变化会直接改变熔体流动与冷却定型条件，进而影响管材的壁厚分布与外径尺寸。','[\"塑料管材挤出成型工艺：温度—熔体黏度—壁厚关系\", \"牵引速度与管材外径的对应关系\"]',NULL,'调取 12121D0032 批次的温区记录，核对「M1 机筒1区」设定值是否在工艺卡范围内；同步核对牵引速度与压力记录的实际波动区间。','工艺记录与工艺卡逐项比对 + 现场复核仪表读数','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(13,8,2,'抽检测量结果与在线测量结果存在系统差异，超范围可能是测量口径不一致而非产品实际偏移','测量系统差异','在线不圆度中位数 0.180 mm，与抽检记录存在可对照的数据。','在线测量与实验室抽检的测量位置、方法与量具不同，天然存在偏差；需要先用同一样管做比对才能确认差异量级。','[\"测量系统分析（MSA）：重复性与再现性\", \"在线测量与离线抽检的测量位置差异\"]',NULL,'取同一根样管分别用在线测量与抽检方法各测一次，记录两组数据；若差异超过比对容差，先修正数据口径再讨论产品是否偏离。','同一样管双方法比对（测量系统分析）','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(16,10,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:41:49','2026-10-12 19:41:49'),(17,10,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:41:49','2026-10-12 19:41:49'),(18,11,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(19,11,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(20,12,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:55:21','2026-10-12 19:55:21'),(21,12,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:55:21','2026-10-12 19:55:21'),(22,13,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(23,13,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(26,15,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(27,15,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(28,16,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(29,16,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(30,17,1,'两条来源记录指向的不是同一根样管或同一时间点（样管匹配错误 / 时间未对齐）','样管与时间匹配错误','共 1 条核对记录，其中差值超过容差 1 条。','MES 与 QMS 的取样时间、样管编号若未严格对齐，会把不同样管的数据当成同一条比对。','[\"质量追溯：样管编号与批次绑定要求\", \"MES/QMS 时间戳对齐要求\"]',NULL,'按样管编号回溯两条记录的原始检验单，核对取样时间与测量人；确认是否为同一样管后，再判断差异是否真实存在。','原始检验单回溯 + 样管编号核对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 08:30:30','2026-10-13 08:30:30'),(31,17,2,'其中一套系统存在录入或单位换算错误（小数位、单位、抄录）','数据录入错误','最大差值 0.055，最大容差 0.050。','手工抄录、单位换算或小数位处理不一致，会造成整条记录级别的固定偏差，而不是随机误差。','[\"数据录入双人复核要求\", \"计量单位与有效位数规范\"]',NULL,'核对两条记录的原始值、单位与有效位数；若为手工录入，检查是否经过双人复核。','原始记录与系统值逐字段比对','pending',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-13 08:30:30','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `analysis_conclusion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `analysis_reference_snapshot`
--

DROP TABLE IF EXISTS `analysis_reference_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analysis_reference_snapshot` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `run_id` bigint unsigned NOT NULL COMMENT '分析批次（1:1）',
  `reference_batch_id` bigint unsigned DEFAULT NULL COMMENT '参考批次',
  `reference_batch_no` varchar(64) DEFAULT NULL COMMENT '参考批次号快照',
  `spec_code` varchar(64) DEFAULT NULL COMMENT '规格编码快照',
  `spec_name` varchar(64) DEFAULT NULL COMMENT '规格名称快照',
  `production_group` varchar(32) DEFAULT NULL COMMENT '参考批次生产组别',
  `metric_id` bigint unsigned NOT NULL COMMENT '快照指标（可能与当前查看指标不同）',
  `sample_count` int unsigned NOT NULL DEFAULT '0' COMMENT '参与统计的抽检点数 n',
  `median_value` decimal(12,4) DEFAULT NULL COMMENT '中位数',
  `min_value` decimal(12,4) DEFAULT NULL COMMENT '观察最小值（非规格限值）',
  `max_value` decimal(12,4) DEFAULT NULL COMMENT '观察最大值（非规格限值）',
  `material_condition` varchar(255) DEFAULT NULL COMMENT '材料条件快照',
  `measurement_method` varchar(255) DEFAULT NULL COMMENT '测量方法快照',
  `note` varchar(500) DEFAULT NULL COMMENT '参考版本说明',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_reference_run` (`run_id`),
  KEY `idx_analysis_reference_batch` (`reference_batch_id`),
  KEY `fk_analysis_reference_metric` (`metric_id`),
  CONSTRAINT `fk_analysis_reference_batch` FOREIGN KEY (`reference_batch_id`) REFERENCES `production_batch` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_reference_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_analysis_reference_run` FOREIGN KEY (`run_id`) REFERENCES `analysis_run` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分析参考版本快照';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `analysis_reference_snapshot`
--

LOCK TABLES `analysis_reference_snapshot` WRITE;
/*!40000 ALTER TABLE `analysis_reference_snapshot` DISABLE KEYS */;
INSERT INTO `analysis_reference_snapshot` VALUES (3,7,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,15,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(8 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-12 19:40:50'),(4,10,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-12 19:41:49'),(5,11,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-12 19:45:33'),(6,12,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-12 19:55:21'),(7,13,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-12 19:59:23'),(10,15,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-12 20:10:18'),(11,16,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-13 03:45:25'),(12,17,4,'12121D0032、12121C0034','SPEC-25-42','dn25 × en4.2','D组',1,16,25.2350,25.0300,25.2400,NULL,NULL,'参考统计量用于对照，不是规格限值；明细：12121D0032(9 个样本，中位数 25.235，范围 25.030–25.240)；12121C0034(7 个样本，中位数 25.235，范围 25.230–25.240)','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `analysis_reference_snapshot` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `analysis_run`
--

DROP TABLE IF EXISTS `analysis_run`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analysis_run` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '分析批次号',
  `event_id` bigint unsigned NOT NULL COMMENT '预警事件',
  `metric_id` bigint unsigned NOT NULL COMMENT '分析指标 [原型 state.metric]',
  `reference_batch_id` bigint unsigned DEFAULT NULL COMMENT '参考批次 [原型 state.golden]',
  `factor_parameter_id` bigint unsigned DEFAULT NULL COMMENT '当前相关因素参数 [原型 currentFactor()]',
  `run_no` int unsigned NOT NULL DEFAULT '1' COMMENT '同事件内的第几次生成',
  `generation_type` enum('rule_based','llm') NOT NULL DEFAULT 'rule_based' COMMENT '生成方式：原型为本地规则，正式接入大模型时置 llm',
  `model_name` varchar(64) DEFAULT NULL COMMENT '模型名称（llm 时记录，便于追溯）',
  `prompt_version` varchar(32) DEFAULT NULL COMMENT '提示词版本',
  `status` enum('running','completed','failed') NOT NULL DEFAULT 'running' COMMENT '生成状态',
  `data_version_note` varchar(255) DEFAULT NULL COMMENT '数据版本/数据边界说明',
  `generated_by` bigint unsigned DEFAULT NULL COMMENT '生成人',
  `generated_at` datetime DEFAULT NULL COMMENT '生成完成时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_analysis_run_code` (`code`),
  UNIQUE KEY `uk_analysis_run_no` (`event_id`,`run_no`),
  KEY `idx_analysis_run_metric` (`metric_id`),
  KEY `idx_analysis_run_reference` (`reference_batch_id`),
  KEY `fk_analysis_run_factor` (`factor_parameter_id`),
  KEY `fk_analysis_run_user` (`generated_by`),
  CONSTRAINT `fk_analysis_run_event` FOREIGN KEY (`event_id`) REFERENCES `alert_event` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_analysis_run_factor` FOREIGN KEY (`factor_parameter_id`) REFERENCES `process_parameter` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_run_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_analysis_run_reference` FOREIGN KEY (`reference_batch_id`) REFERENCES `production_batch` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analysis_run_user` FOREIGN KEY (`generated_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分析批次（一次生成分析）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `analysis_run`
--

LOCK TABLES `analysis_run` WRITE;
/*!40000 ALTER TABLE `analysis_run` DISABLE KEYS */;
INSERT INTO `analysis_run` VALUES (4,'AN-QE-12121D0032-20261009-001-01',4,6,NULL,NULL,1,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 7 条 · 设备读数 44 条 · 参考批次 0 个',1,NULL,'2026-10-12 19:36:23','2026-10-12 19:36:23'),(6,'AN-QE-12121D0032-20261009-001-02',4,6,NULL,NULL,2,'rule_based','平台规则模板',NULL,'completed','抽检记录 8 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 7 条 · 设备读数 44 条 · 参考批次 0 个',1,NULL,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(7,'AN-QE-12121D0029-20261009-001-01',5,1,4,NULL,1,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(8,'AN-QE-12121D0032-20261009-001-03',4,6,NULL,NULL,3,'rule_based','平台规则模板',NULL,'completed','抽检记录 8 条 · 壁厚测点 0 条 · 在线产品数据 3 条 · 工艺记录 8 条 · 设备读数 45 条 · 参考批次 0 个',1,NULL,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(10,'AN-QE-12121D0029-20261009-001-02',5,1,4,NULL,2,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-12 19:41:49','2026-10-12 19:41:49'),(11,'AN-QE-12121D0029-20261009-001-03',5,1,4,NULL,3,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(12,'AN-QE-12121D0029-20261009-001-04',5,1,4,NULL,4,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-12 19:55:21','2026-10-12 19:55:21'),(13,'AN-QE-12121D0029-20261009-001-05',5,1,4,NULL,5,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(15,'AN-QE-12121D0029-20261009-001-06',5,1,4,NULL,6,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(16,'AN-QE-12121D0029-20261009-001-07',5,1,4,NULL,7,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(17,'AN-QE-12121D0029-20261009-001-08',5,1,4,NULL,8,'rule_based','平台规则模板',NULL,'completed','抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个',1,NULL,'2026-10-13 08:30:30','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `analysis_run` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audits`
--

DROP TABLE IF EXISTS `audits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audits` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `target_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` int NOT NULL,
  `auditor_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audits_target_idx` (`target_type`,`target_id`),
  KEY `audits_auditor_id_idx` (`auditor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audits`
--

LOCK TABLES `audits` WRITE;
/*!40000 ALTER TABLE `audits` DISABLE KEYS */;
/*!40000 ALTER TABLE `audits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conclusion_evidence`
--

DROP TABLE IF EXISTS `conclusion_evidence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conclusion_evidence` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conclusion_id` bigint unsigned NOT NULL COMMENT '结论',
  `evidence_type` enum('basis','support','contradict') NOT NULL COMMENT '依据/支持证据/反向证据',
  `layer` varchar(64) DEFAULT NULL COMMENT '依据分层：限值对照等 [原型 basisItem.layer]',
  `content` text NOT NULL COMMENT '证据内容',
  `fact_time` datetime DEFAULT NULL COMMENT '可定位的事实时间 [原型 basisItem.time]',
  `is_locateable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=可在趋势图中定位 [原型 basisItem.locate]',
  `related_record_id` bigint unsigned DEFAULT NULL COMMENT '关联抽检记录（证据入口）',
  `is_usable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=该依据可用于结论 [原型 usable]',
  `sort_no` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conclusion_evidence_conclusion` (`conclusion_id`,`evidence_type`),
  KEY `idx_conclusion_evidence_record` (`related_record_id`),
  CONSTRAINT `fk_conclusion_evidence_conclusion` FOREIGN KEY (`conclusion_id`) REFERENCES `analysis_conclusion` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conclusion_evidence_record` FOREIGN KEY (`related_record_id`) REFERENCES `inspection_record` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='结论依据与证据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conclusion_evidence`
--

LOCK TABLES `conclusion_evidence` WRITE;
/*!40000 ALTER TABLE `conclusion_evidence` DISABLE KEYS */;
INSERT INTO `conclusion_evidence` VALUES (9,6,'support','相关因素变化','温区「M1 机筒3区」实测 199.0 °C，设定 198.0 °C，偏差 1.0 °C，为本次记录中偏差最大的温区。','2026-10-10 09:37:00',0,NULL,1,0,'2026-10-12 19:36:23','2026-10-12 19:36:23'),(10,6,'support','相关因素变化','指标「不圆度」在本平台的关联过程参数为：温度（°C）、压力（MPa）、牵引速度（m/min）。关联关系来自指标—过程参数配置，用于确定排查范围，本身不构成因果证明。',NULL,0,NULL,1,1,'2026-10-12 19:36:23','2026-10-12 19:36:23'),(11,6,'basis','规格限值','本批次共 1 条超范围记录，最早为 IR-015（2026-10-09 08:00:00），最近为 IR-015（2026-10-09 08:00:00）。','2026-10-09 08:00:00',1,15,1,2,'2026-10-12 19:36:23','2026-10-12 19:36:23'),(12,7,'basis','参考对照','在线产品数据 2 条：不圆度中位数 0.180 mm，观察范围 0.170 – 0.190 mm。这是在线测量的观察范围，不是规格限值。','2026-10-10 00:00:00',0,NULL,1,0,'2026-10-12 19:36:23','2026-10-12 19:36:23'),(13,8,'support','相关因素变化','温区「M1 机筒3区」实测 199.0 °C，设定 198.0 °C，偏差 1.0 °C，为本次记录中偏差最大的温区。','2026-10-10 09:37:00',0,NULL,1,0,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(14,8,'support','相关因素变化','指标「不圆度」在本平台的关联过程参数为：温度（°C）、压力（MPa）、牵引速度（m/min）。关联关系来自指标—过程参数配置，用于确定排查范围，本身不构成因果证明。',NULL,0,NULL,1,1,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(15,8,'basis','规格限值','本批次共 1 条超范围记录，最早为 IR-015（2026-10-09 08:00:00），最近为 IR-015（2026-10-09 08:00:00）。','2026-10-09 08:00:00',1,15,1,2,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(16,9,'basis','参考对照','在线产品数据 2 条：不圆度中位数 0.180 mm，观察范围 0.170 – 0.190 mm。这是在线测量的观察范围，不是规格限值。','2026-10-10 00:00:00',0,NULL,1,0,'2026-10-12 19:40:08','2026-10-12 19:40:08'),(17,10,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(18,11,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(19,12,'support','相关因素变化','温区「M1 机筒1区」实测 191.5 °C，设定 190.0 °C，偏差 1.5 °C，为本次记录中偏差最大的温区。','2026-10-20 09:00:00',0,NULL,1,0,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(20,12,'support','相关因素变化','指标「不圆度」在本平台的关联过程参数为：温度（°C）、压力（MPa）、牵引速度（m/min）。关联关系来自指标—过程参数配置，用于确定排查范围，本身不构成因果证明。',NULL,0,NULL,1,1,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(21,12,'basis','规格限值','本批次共 1 条超范围记录，最早为 IR-015（2026-10-09 08:00:00），最近为 IR-015（2026-10-09 08:00:00）。','2026-10-09 08:00:00',1,15,1,2,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(22,13,'basis','参考对照','在线产品数据 2 条：不圆度中位数 0.180 mm，观察范围 0.170 – 0.190 mm。这是在线测量的观察范围，不是规格限值。','2026-10-10 00:00:00',0,NULL,1,0,'2026-10-12 19:40:50','2026-10-12 19:40:50'),(23,16,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:41:49','2026-10-12 19:41:49'),(24,17,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:41:49','2026-10-12 19:41:49'),(25,18,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(26,19,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(27,20,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:55:21','2026-10-12 19:55:21'),(28,21,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:55:21','2026-10-12 19:55:21'),(29,22,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(30,23,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(41,26,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(42,27,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(43,28,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(44,29,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(45,30,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-13 08:30:30','2026-10-13 08:30:30'),(46,31,'support','数据核对','IR-008 · 外径：主记录 25.235，待核对记录 25.290，差值 0.055，容差 0.050，结论「pending」（两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论）','2026-10-09 08:05:00',1,8,1,0,'2026-10-13 08:30:30','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `conclusion_evidence` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversations`
--

DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user1_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user2_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_message` text COLLATE utf8mb4_unicode_ci,
  `last_message_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversations_user1_id_user2_id_key` (`user1_id`,`user2_id`),
  KEY `conversations_user1_id_idx` (`user1_id`),
  KEY `conversations_user2_id_idx` (`user2_id`),
  CONSTRAINT `conversations_user1_id_fkey` FOREIGN KEY (`user1_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversations_user2_id_fkey` FOREIGN KEY (`user2_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
/*!40000 ALTER TABLE `conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `data_consistency_check`
--

DROP TABLE IF EXISTS `data_consistency_check`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_consistency_check` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `record_id` bigint unsigned NOT NULL COMMENT '抽检记录',
  `metric_id` bigint unsigned NOT NULL COMMENT '核对指标',
  `primary_value` decimal(12,4) NOT NULL COMMENT '主记录值（如 MES 值）',
  `secondary_value` decimal(12,4) NOT NULL COMMENT '待核对记录值（如 QMS 值）',
  `primary_source_id` bigint unsigned DEFAULT NULL COMMENT '主记录来源',
  `secondary_source_id` bigint unsigned DEFAULT NULL COMMENT '待核对记录来源',
  `matched_time` datetime DEFAULT NULL COMMENT '两条记录的匹配时间 [原型 qmsPair.timestamp]',
  `diff_value` decimal(12,4) GENERATED ALWAYS AS (abs((`primary_value` - `secondary_value`))) STORED COMMENT '差值绝对值（生成列）',
  `tolerance_value` decimal(12,4) NOT NULL COMMENT '当时的比对容差 [原型 qmsMes.toleranceMm]',
  `result` enum('pending','consistent','inconsistent','insufficient') NOT NULL DEFAULT 'pending' COMMENT '核对结论',
  `conclusion_note` varchar(500) DEFAULT NULL COMMENT '核对说明（不得据此判断产品不合格）',
  `checked_by` bigint unsigned DEFAULT NULL COMMENT '核对人',
  `checked_at` datetime DEFAULT NULL COMMENT '核对时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_data_consistency_record` (`record_id`),
  KEY `idx_data_consistency_result` (`result`),
  KEY `fk_data_consistency_metric` (`metric_id`),
  KEY `fk_data_consistency_primary_source` (`primary_source_id`),
  KEY `fk_data_consistency_secondary_source` (`secondary_source_id`),
  KEY `fk_data_consistency_checker` (`checked_by`),
  CONSTRAINT `fk_data_consistency_checker` FOREIGN KEY (`checked_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_data_consistency_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_data_consistency_primary_source` FOREIGN KEY (`primary_source_id`) REFERENCES `data_source` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_data_consistency_record` FOREIGN KEY (`record_id`) REFERENCES `inspection_record` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_data_consistency_secondary_source` FOREIGN KEY (`secondary_source_id`) REFERENCES `data_source` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='QMS/MES 数据一致性核对';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `data_consistency_check`
--

LOCK TABLES `data_consistency_check` WRITE;
/*!40000 ALTER TABLE `data_consistency_check` DISABLE KEYS */;
INSERT INTO `data_consistency_check` (`id`, `record_id`, `metric_id`, `primary_value`, `secondary_value`, `primary_source_id`, `secondary_source_id`, `matched_time`, `tolerance_value`, `result`, `conclusion_note`, `checked_by`, `checked_at`, `created_at`, `updated_at`) VALUES (1,8,1,25.2350,25.2900,2,3,'2026-10-09 08:05:00',0.0500,'pending','两条来源记录存在差异，需核对样管编号与匹配时间后确认，本差异不构成产品不合格结论',NULL,NULL,'2026-10-12 19:13:36','2026-10-12 19:13:36');
/*!40000 ALTER TABLE `data_consistency_check` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `data_source`
--

DROP TABLE IF EXISTS `data_source`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_source` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '来源编码：manual_entry/mes/qms/device/import',
  `name` varchar(64) NOT NULL COMMENT '来源名称',
  `system_type` enum('manual','mes','qms','device','other') NOT NULL DEFAULT 'other' COMMENT '系统类型',
  `is_simulated` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=模拟/演示数据来源，非正式生产能力',
  `description` varchar(255) DEFAULT NULL,
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `sort_no` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_data_source_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据来源字典';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `data_source`
--

LOCK TABLES `data_source` WRITE;
/*!40000 ALTER TABLE `data_source` DISABLE KEYS */;
INSERT INTO `data_source` VALUES (1,'manual_entry','生产录入','manual',0,'现场录入并复核的生产记录','enabled',10,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'mes','MES 生产系统','mes',0,'MES 下发的批次与生产数据','enabled',20,'2026-10-12 19:03:33','2026-10-12 20:02:02'),(3,'qms','QMS 检验系统','qms',0,'QMS 检验记录与复测结果','enabled',30,'2026-10-12 19:03:33','2026-10-12 20:02:02'),(4,'device','设备数采','device',0,'设备逐小时采集的温度 / 压力 / 牵引速度','enabled',40,'2026-10-12 19:03:33','2026-10-12 20:02:02'),(5,'inspection_ledger','抽检台账','other',0,'样管抽检台账（现场检验记录）','enabled',50,'2026-10-12 19:03:33','2026-10-12 20:02:02'),(6,'virtual_process_data','工艺记录','other',0,'温区设定与反馈、牵引速度等工艺记录','enabled',60,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `data_source` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eight_d_field`
--

DROP TABLE IF EXISTS `eight_d_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `eight_d_field` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `report_id` bigint unsigned NOT NULL COMMENT '报告',
  `field_code` enum('D1','D2','D3','D4','D5','D6','D7','D8') NOT NULL COMMENT '8D 章节编码',
  `field_name` varchar(128) NOT NULL COMMENT '章节名称',
  `content` mediumtext COMMENT '内容',
  `source_type` enum('pending','ai_prefill','engineer') NOT NULL DEFAULT 'pending' COMMENT '内容来源：待补充/AI 预填需确认/工程师负责',
  `is_required` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=定稿必填',
  `updated_by` bigint unsigned DEFAULT NULL COMMENT '最后修改人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_eight_d_field` (`report_id`,`field_code`),
  KEY `fk_eight_d_field_user` (`updated_by`),
  CONSTRAINT `fk_eight_d_field_report` FOREIGN KEY (`report_id`) REFERENCES `eight_d_report` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eight_d_field_user` FOREIGN KEY (`updated_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='8D 报告章节内容';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eight_d_field`
--

LOCK TABLES `eight_d_field` WRITE;
/*!40000 ALTER TABLE `eight_d_field` DISABLE KEYS */;
INSERT INTO `eight_d_field` VALUES (9,2,'D1','小组成员','质量工程师：张工（组长）；工艺工程师：李工；设备工程师：王工；生产领班：赵工。','engineer',1,1,'2026-10-12 19:36:25','2026-10-12 19:36:41'),(10,2,'D2','问题描述','【已人工核对 QMS 原始检验单 IR-015】\n批次 12121D0032（D组） 在 2026-10-09 08:00:00 触发规则 R3（规格限值对照）。\n风险等级：中风险。异常指标：不圆度，对照范围：0.000 – 0.350 mm（阈值待现场标定）。\n判定依据：不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。','engineer',1,1,'2026-10-12 19:36:25','2026-10-12 19:36:41'),(11,2,'D3','临时遏制措施','1) 2026-10-09 09:20 已隔离该批次 12 根样管，转入待处理区并挂黄色标识；\n2) 2026-10-09 10:00 起对该批次后续出管加严抽检（每 30 分钟 1 根）；\n3) 2026-10-09 11:00 起 3 号线暂停发货，等待不圆度复测结果。','engineer',1,1,'2026-10-12 19:36:25','2026-10-12 19:36:41'),(12,2,'D4','根本原因','','pending',0,NULL,'2026-10-12 19:36:25','2026-10-12 19:36:25'),(13,2,'D5','纠正措施','','pending',0,NULL,'2026-10-12 19:36:25','2026-10-12 19:36:25'),(14,2,'D6','实施与验证','','pending',0,NULL,'2026-10-12 19:36:25','2026-10-12 19:36:25'),(15,2,'D7','预防再发生','','pending',0,NULL,'2026-10-12 19:36:25','2026-10-12 19:36:25'),(16,2,'D8','小组总结','','pending',0,NULL,'2026-10-12 19:36:25','2026-10-12 19:36:25'),(17,3,'D1','小组成员','冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师','engineer',1,1,'2026-10-12 19:36:54','2026-10-12 19:39:08'),(18,3,'D2','问题描述','冒烟测试占位：请以实际预填内容为准','engineer',1,1,'2026-10-12 19:36:54','2026-10-12 19:39:08'),(19,3,'D3','临时遏制措施','冒烟测试占位：该批次已加严抽检并隔离待处理','engineer',1,1,'2026-10-12 19:36:54','2026-10-12 19:39:08'),(20,3,'D4','根本原因','','pending',0,NULL,'2026-10-12 19:36:54','2026-10-12 19:36:54'),(21,3,'D5','纠正措施','','pending',0,NULL,'2026-10-12 19:36:54','2026-10-12 19:36:54'),(22,3,'D6','实施与验证','','pending',0,NULL,'2026-10-12 19:36:54','2026-10-12 19:36:54'),(23,3,'D7','预防再发生','','pending',0,NULL,'2026-10-12 19:36:54','2026-10-12 19:36:54'),(24,3,'D8','小组总结','','pending',0,NULL,'2026-10-12 19:36:54','2026-10-12 19:36:54');
/*!40000 ALTER TABLE `eight_d_field` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eight_d_report`
--

DROP TABLE IF EXISTS `eight_d_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `eight_d_report` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '报告编号，如 8D-QE-... [原型 reportId]',
  `event_id` bigint unsigned NOT NULL COMMENT '关联预警事件（唯一）',
  `batch_id` bigint unsigned NOT NULL COMMENT '生产批次',
  `spec_id` bigint unsigned DEFAULT NULL COMMENT '产品规格',
  `production_group` varchar(32) DEFAULT NULL COMMENT '生产组别',
  `metric_id` bigint unsigned DEFAULT NULL COMMENT '异常指标',
  `rule_code` varchar(32) DEFAULT NULL COMMENT '触发规则编码快照',
  `window_start_time` datetime DEFAULT NULL COMMENT '异常时段开始',
  `window_end_time` datetime DEFAULT NULL COMMENT '异常时段结束',
  `affected_length_m` decimal(12,2) DEFAULT NULL COMMENT '预计涉及米数 m（待核定）',
  `status` enum('draft','finalized','obsolete') NOT NULL DEFAULT 'draft' COMMENT '报告状态 [原型 status：草稿/已定稿]',
  `version_no` int unsigned NOT NULL DEFAULT '1' COMMENT '当前版本号',
  `owner_user_id` bigint unsigned DEFAULT NULL COMMENT '质量工程师（负责人）',
  `reviewer_user_id` bigint unsigned DEFAULT NULL COMMENT '批准人（待确认）',
  `saved_at` datetime DEFAULT NULL COMMENT '最近保存时间',
  `finalized_at` datetime DEFAULT NULL COMMENT '定稿时间',
  `reviewer_note` varchar(500) DEFAULT NULL COMMENT '定稿/审批说明',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_eight_d_report_code` (`code`),
  UNIQUE KEY `uk_eight_d_report_event` (`event_id`),
  KEY `idx_eight_d_report_status` (`status`,`updated_at`),
  KEY `fk_eight_d_report_batch` (`batch_id`),
  KEY `fk_eight_d_report_spec` (`spec_id`),
  KEY `fk_eight_d_report_metric` (`metric_id`),
  KEY `fk_eight_d_report_owner` (`owner_user_id`),
  KEY `fk_eight_d_report_reviewer` (`reviewer_user_id`),
  KEY `fk_eight_d_report_creator` (`created_by`),
  CONSTRAINT `fk_eight_d_report_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_eight_d_report_creator` FOREIGN KEY (`created_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_eight_d_report_event` FOREIGN KEY (`event_id`) REFERENCES `alert_event` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_eight_d_report_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_eight_d_report_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_eight_d_report_reviewer` FOREIGN KEY (`reviewer_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_eight_d_report_spec` FOREIGN KEY (`spec_id`) REFERENCES `product_spec` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='8D 报告';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eight_d_report`
--

LOCK TABLES `eight_d_report` WRITE;
/*!40000 ALTER TABLE `eight_d_report` DISABLE KEYS */;
INSERT INTO `eight_d_report` VALUES (2,'8D-QE-12121D0032-20261009-001-001',4,4,1,'D组',6,'R3','2026-10-09 08:00:00','2026-10-09 08:00:00',NULL,'finalized',5,1,NULL,'2026-10-12 19:36:41','2026-10-12 19:36:51','补充复核后再次定稿。',1,'2026-10-12 19:36:25','2026-10-12 19:36:51'),(3,'8D-QE-12121D0029-20261009-001-002',5,3,1,'D组',1,'R1','2026-10-09 08:00:00','2026-10-09 08:00:00',NULL,'draft',8,1,NULL,'2026-10-13 08:30:30',NULL,NULL,1,'2026-10-12 19:36:54','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `eight_d_report` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `eight_d_revision`
--

DROP TABLE IF EXISTS `eight_d_revision`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `eight_d_revision` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `report_id` bigint unsigned NOT NULL COMMENT '报告',
  `version_no` int unsigned NOT NULL COMMENT '版本号',
  `action` enum('create','save_draft','ai_prefill','finalize','export','reopen') NOT NULL COMMENT '动作',
  `operator_user_id` bigint unsigned DEFAULT NULL COMMENT '操作人',
  `summary` varchar(500) DEFAULT NULL COMMENT '动作摘要 [原型 history[].action]',
  `content_snapshot` json NOT NULL COMMENT 'D1–D8 全文快照 {"D1":"...",...}',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eight_d_revision_report` (`report_id`,`version_no`),
  KEY `fk_eight_d_revision_user` (`operator_user_id`),
  CONSTRAINT `fk_eight_d_revision_report` FOREIGN KEY (`report_id`) REFERENCES `eight_d_report` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eight_d_revision_user` FOREIGN KEY (`operator_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='8D 报告修订历史';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `eight_d_revision`
--

LOCK TABLES `eight_d_revision` WRITE;
/*!40000 ALTER TABLE `eight_d_revision` DISABLE KEYS */;
INSERT INTO `eight_d_revision` VALUES (3,2,1,'create',1,'由事件 QE-12121D0032-20261009-001 生成 8D 报告，预填 D1–D5','[{\"code\": \"D1\", \"name\": \"小组成员\", \"content\": \"\", \"isRequired\": true, \"sourceType\": \"pending\"}, {\"code\": \"D2\", \"name\": \"问题描述\", \"content\": \"批次 12121D0032（D组） 在 2026-10-09 08:00:00 触发规则 R3（规格限值对照）。\\n风险等级：中风险。异常指标：不圆度，对照范围：0.000 – 0.350 mm（阈值待现场标定）。\\n判定依据：不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\", \"isRequired\": true, \"sourceType\": \"ai_prefill\"}, {\"code\": \"D3\", \"name\": \"临时遏制措施\", \"content\": \"\", \"isRequired\": true, \"sourceType\": \"pending\"}, {\"code\": \"D4\", \"name\": \"根本原因\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D5\", \"name\": \"纠正措施\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D6\", \"name\": \"实施与验证\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D7\", \"name\": \"预防再发生\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D8\", \"name\": \"小组总结\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}]','2026-10-12 19:36:25'),(4,2,2,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"\"}, {\"code\": \"D2\", \"content\": \"批次 12121D0032（D组） 在 2026-10-09 08:00:00 触发规则 R3（规格限值对照）。\\n风险等级：中风险。异常指标：不圆度，对照范围：0.000 – 0.350 mm（阈值待现场标定）。\\n判定依据：不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\"}, {\"code\": \"D3\", \"content\": \"\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:36:41'),(5,2,3,'finalize',1,'报告定稿','[{\"code\": \"D1\", \"content\": \"质量工程师：张工（组长）；工艺工程师：李工；设备工程师：王工；生产领班：赵工。\"}, {\"code\": \"D2\", \"content\": \"【已人工核对 QMS 原始检验单 IR-015】\\n批次 12121D0032（D组） 在 2026-10-09 08:00:00 触发规则 R3（规格限值对照）。\\n风险等级：中风险。异常指标：不圆度，对照范围：0.000 – 0.350 mm（阈值待现场标定）。\\n判定依据：不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\"}, {\"code\": \"D3\", \"content\": \"1) 2026-10-09 09:20 已隔离该批次 12 根样管，转入待处理区并挂黄色标识；\\n2) 2026-10-09 10:00 起对该批次后续出管加严抽检（每 30 分钟 1 根）；\\n3) 2026-10-09 11:00 起 3 号线暂停发货，等待不圆度复测结果。\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:36:48'),(6,2,4,'reopen',1,'重新打开：D6 补充对比批次复测数据后需要更新报告内容。','[{\"code\": \"D1\", \"content\": \"质量工程师：张工（组长）；工艺工程师：李工；设备工程师：王工；生产领班：赵工。\"}, {\"code\": \"D2\", \"content\": \"【已人工核对 QMS 原始检验单 IR-015】\\n批次 12121D0032（D组） 在 2026-10-09 08:00:00 触发规则 R3（规格限值对照）。\\n风险等级：中风险。异常指标：不圆度，对照范围：0.000 – 0.350 mm（阈值待现场标定）。\\n判定依据：不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\"}, {\"code\": \"D3\", \"content\": \"1) 2026-10-09 09:20 已隔离该批次 12 根样管，转入待处理区并挂黄色标识；\\n2) 2026-10-09 10:00 起对该批次后续出管加严抽检（每 30 分钟 1 根）；\\n3) 2026-10-09 11:00 起 3 号线暂停发货，等待不圆度复测结果。\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:36:51'),(7,2,5,'finalize',1,'报告定稿','[{\"code\": \"D1\", \"content\": \"质量工程师：张工（组长）；工艺工程师：李工；设备工程师：王工；生产领班：赵工。\"}, {\"code\": \"D2\", \"content\": \"【已人工核对 QMS 原始检验单 IR-015】\\n批次 12121D0032（D组） 在 2026-10-09 08:00:00 触发规则 R3（规格限值对照）。\\n风险等级：中风险。异常指标：不圆度，对照范围：0.000 – 0.350 mm（阈值待现场标定）。\\n判定依据：不圆度测量值 0.420 mm，高于上限 0.350 mm 共 0.070 mm（对照范围 0.000–0.350 mm）。当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\"}, {\"code\": \"D3\", \"content\": \"1) 2026-10-09 09:20 已隔离该批次 12 根样管，转入待处理区并挂黄色标识；\\n2) 2026-10-09 10:00 起对该批次后续出管加严抽检（每 30 分钟 1 根）；\\n3) 2026-10-09 11:00 起 3 号线暂停发货，等待不圆度复测结果。\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:36:51'),(8,3,1,'create',1,'由事件 QE-12121D0029-20261009-001 生成 8D 报告，预填 D1–D5','[{\"code\": \"D1\", \"name\": \"小组成员\", \"content\": \"\", \"isRequired\": true, \"sourceType\": \"pending\"}, {\"code\": \"D2\", \"name\": \"问题描述\", \"content\": \"批次 12121D0029（D组） 在 2026-10-09 08:00:00 触发规则 R1（数据记录差异待核对）。\\n风险等级：数据报错。异常指标：外径，对照范围：25.000 – 25.500 mm（阈值待现场标定）。\\n判定依据：同一指标存在两条来源记录：MES 生产系统 25.235 mm，QMS 检验系统 25.290 mm，差值 0.055 mm，核对结论尚未确认。请先核对样管编号、原始检验单与仪器，差异核实前不作产品质量结论。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\", \"isRequired\": true, \"sourceType\": \"ai_prefill\"}, {\"code\": \"D3\", \"name\": \"临时遏制措施\", \"content\": \"\", \"isRequired\": true, \"sourceType\": \"pending\"}, {\"code\": \"D4\", \"name\": \"根本原因\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D5\", \"name\": \"纠正措施\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D6\", \"name\": \"实施与验证\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D7\", \"name\": \"预防再发生\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}, {\"code\": \"D8\", \"name\": \"小组总结\", \"content\": \"\", \"isRequired\": false, \"sourceType\": \"pending\"}]','2026-10-12 19:36:54'),(9,3,2,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"\"}, {\"code\": \"D2\", \"content\": \"批次 12121D0029（D组） 在 2026-10-09 08:00:00 触发规则 R1（数据记录差异待核对）。\\n风险等级：数据报错。异常指标：外径，对照范围：25.000 – 25.500 mm（阈值待现场标定）。\\n判定依据：同一指标存在两条来源记录：MES 生产系统 25.235 mm，QMS 检验系统 25.290 mm，差值 0.055 mm，核对结论尚未确认。请先核对样管编号、原始检验单与仪器，差异核实前不作产品质量结论。\\n影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。\\n注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。\"}, {\"code\": \"D3\", \"content\": \"\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:39:08'),(10,3,3,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师\"}, {\"code\": \"D2\", \"content\": \"冒烟测试占位：请以实际预填内容为准\"}, {\"code\": \"D3\", \"content\": \"冒烟测试占位：该批次已加严抽检并隔离待处理\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:45:33'),(11,3,4,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师\"}, {\"code\": \"D2\", \"content\": \"冒烟测试占位：请以实际预填内容为准\"}, {\"code\": \"D3\", \"content\": \"冒烟测试占位：该批次已加严抽检并隔离待处理\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:55:22'),(12,3,5,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师\"}, {\"code\": \"D2\", \"content\": \"冒烟测试占位：请以实际预填内容为准\"}, {\"code\": \"D3\", \"content\": \"冒烟测试占位：该批次已加严抽检并隔离待处理\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 19:59:23'),(14,3,6,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师\"}, {\"code\": \"D2\", \"content\": \"冒烟测试占位：请以实际预填内容为准\"}, {\"code\": \"D3\", \"content\": \"冒烟测试占位：该批次已加严抽检并隔离待处理\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-12 20:10:18'),(15,3,7,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师\"}, {\"code\": \"D2\", \"content\": \"冒烟测试占位：请以实际预填内容为准\"}, {\"code\": \"D3\", \"content\": \"冒烟测试占位：该批次已加严抽检并隔离待处理\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-13 03:45:25'),(16,3,8,'save_draft',1,'保存草稿（更新 3 个小节）','[{\"code\": \"D1\", \"content\": \"冒烟测试占位：质量工程师 / 工艺工程师 / 设备工程师\"}, {\"code\": \"D2\", \"content\": \"冒烟测试占位：请以实际预填内容为准\"}, {\"code\": \"D3\", \"content\": \"冒烟测试占位：该批次已加严抽检并隔离待处理\"}, {\"code\": \"D4\", \"content\": \"\"}, {\"code\": \"D5\", \"content\": \"\"}, {\"code\": \"D6\", \"content\": \"\"}, {\"code\": \"D7\", \"content\": \"\"}, {\"code\": \"D8\", \"content\": \"\"}]','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `eight_d_revision` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `equipment`
--

DROP TABLE IF EXISTS `equipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '设备编码，如 EQ-EX-01',
  `name` varchar(64) NOT NULL COMMENT '设备名称',
  `type_id` bigint unsigned NOT NULL COMMENT '设备类型',
  `line_id` bigint unsigned DEFAULT NULL COMMENT '所属产线 [扩展：原型为文本 lineName]',
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `description` varchar(255) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_equipment_code` (`code`),
  KEY `idx_equipment_type` (`type_id`),
  KEY `idx_equipment_line` (`line_id`),
  CONSTRAINT `fk_equipment_line` FOREIGN KEY (`line_id`) REFERENCES `production_line` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipment_type` FOREIGN KEY (`type_id`) REFERENCES `equipment_type` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备台账';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment`
--

LOCK TABLES `equipment` WRITE;
/*!40000 ALTER TABLE `equipment` DISABLE KEYS */;
INSERT INTO `equipment` VALUES (1,'EQ-EX-01','挤出机 1 号',1,1,'enabled','Φ65 单螺杆挤出机，机筒 4 区 + 适配器 4 区，共 8 个温区',0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'EQ-HO-01','牵引机 1 号',2,1,'enabled','履带式牵引机，牵引速度反馈范围 0–20 m/min',0,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `equipment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `equipment_reading`
--

DROP TABLE IF EXISTS `equipment_reading`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_reading` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '记录编号，如 DEV-EX-... [原型 id]',
  `batch_id` bigint unsigned NOT NULL COMMENT '批次号',
  `production_date` date NOT NULL COMMENT '生产日期',
  `equipment_id` bigint unsigned NOT NULL COMMENT '设备编号',
  `collect_time` time NOT NULL COMMENT '采集时间（时:分）[原型 collectTime]',
  `collected_at` datetime DEFAULT NULL COMMENT '采集时间戳（生产日期 + 采集时间，应用层写入）',
  `data_source_id` bigint unsigned NOT NULL COMMENT '数据来源',
  `remark` varchar(255) DEFAULT NULL,
  `migrated_from` varchar(64) DEFAULT NULL COMMENT '迁移来源记录号',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_equipment_reading_code` (`code`),
  UNIQUE KEY `uk_equipment_reading_natural` (`batch_id`,`production_date`,`equipment_id`,`collect_time`),
  KEY `idx_equipment_reading_equipment` (`equipment_id`,`production_date`,`collect_time`),
  KEY `idx_equipment_reading_source` (`data_source_id`),
  CONSTRAINT `fk_equipment_reading_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_equipment_reading_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_equipment_reading_source` FOREIGN KEY (`data_source_id`) REFERENCES `data_source` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备采集数据表头';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment_reading`
--

LOCK TABLES `equipment_reading` WRITE;
/*!40000 ALTER TABLE `equipment_reading` DISABLE KEYS */;
INSERT INTO `equipment_reading` VALUES (1,'DEV-EX-0034-1009-0800',2,'2026-10-09',1,'08:00:00','2026-10-09 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'DEV-HO-0034-1009-0800',2,'2026-10-09',2,'08:00:00','2026-10-09 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'DEV-EX-0034-1009-0900',2,'2026-10-09',1,'09:00:00','2026-10-09 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'DEV-HO-0034-1009-0900',2,'2026-10-09',2,'09:00:00','2026-10-09 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,'DEV-EX-0034-1009-1000',2,'2026-10-09',1,'10:00:00','2026-10-09 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,'DEV-HO-0034-1009-1000',2,'2026-10-09',2,'10:00:00','2026-10-09 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,'DEV-EX-0034-1009-1100',2,'2026-10-09',1,'11:00:00','2026-10-09 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(8,'DEV-HO-0034-1009-1100',2,'2026-10-09',2,'11:00:00','2026-10-09 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(9,'DEV-EX-0034-1009-1200',2,'2026-10-09',1,'12:00:00','2026-10-09 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(10,'DEV-HO-0034-1009-1200',2,'2026-10-09',2,'12:00:00','2026-10-09 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(11,'DEV-EX-0034-1009-1300',2,'2026-10-09',1,'13:00:00','2026-10-09 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(12,'DEV-HO-0034-1009-1300',2,'2026-10-09',2,'13:00:00','2026-10-09 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(13,'DEV-EX-0034-1009-1400',2,'2026-10-09',1,'14:00:00','2026-10-09 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(14,'DEV-HO-0034-1009-1400',2,'2026-10-09',2,'14:00:00','2026-10-09 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(15,'DEV-EX-0034-1009-1500',2,'2026-10-09',1,'15:00:00','2026-10-09 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(16,'DEV-HO-0034-1009-1500',2,'2026-10-09',2,'15:00:00','2026-10-09 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(17,'DEV-EX-0034-1009-1600',2,'2026-10-09',1,'16:00:00','2026-10-09 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(18,'DEV-HO-0034-1009-1600',2,'2026-10-09',2,'16:00:00','2026-10-09 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(19,'DEV-EX-0034-1009-1700',2,'2026-10-09',1,'17:00:00','2026-10-09 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(20,'DEV-HO-0034-1009-1700',2,'2026-10-09',2,'17:00:00','2026-10-09 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(21,'DEV-EX-0034-1009-1800',2,'2026-10-09',1,'18:00:00','2026-10-09 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(22,'DEV-HO-0034-1009-1800',2,'2026-10-09',2,'18:00:00','2026-10-09 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(23,'DEV-EX-0034-1010-0800',2,'2026-10-10',1,'08:00:00','2026-10-10 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(24,'DEV-HO-0034-1010-0800',2,'2026-10-10',2,'08:00:00','2026-10-10 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(25,'DEV-EX-0034-1010-0900',2,'2026-10-10',1,'09:00:00','2026-10-10 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(26,'DEV-HO-0034-1010-0900',2,'2026-10-10',2,'09:00:00','2026-10-10 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(27,'DEV-EX-0034-1010-1000',2,'2026-10-10',1,'10:00:00','2026-10-10 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(28,'DEV-HO-0034-1010-1000',2,'2026-10-10',2,'10:00:00','2026-10-10 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(29,'DEV-EX-0034-1010-1100',2,'2026-10-10',1,'11:00:00','2026-10-10 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(30,'DEV-HO-0034-1010-1100',2,'2026-10-10',2,'11:00:00','2026-10-10 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(31,'DEV-EX-0034-1010-1200',2,'2026-10-10',1,'12:00:00','2026-10-10 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(32,'DEV-HO-0034-1010-1200',2,'2026-10-10',2,'12:00:00','2026-10-10 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(33,'DEV-EX-0034-1010-1300',2,'2026-10-10',1,'13:00:00','2026-10-10 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(34,'DEV-HO-0034-1010-1300',2,'2026-10-10',2,'13:00:00','2026-10-10 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(35,'DEV-EX-0034-1010-1400',2,'2026-10-10',1,'14:00:00','2026-10-10 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(36,'DEV-HO-0034-1010-1400',2,'2026-10-10',2,'14:00:00','2026-10-10 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(37,'DEV-EX-0034-1010-1500',2,'2026-10-10',1,'15:00:00','2026-10-10 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(38,'DEV-HO-0034-1010-1500',2,'2026-10-10',2,'15:00:00','2026-10-10 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(39,'DEV-EX-0034-1010-1600',2,'2026-10-10',1,'16:00:00','2026-10-10 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(40,'DEV-HO-0034-1010-1600',2,'2026-10-10',2,'16:00:00','2026-10-10 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(41,'DEV-EX-0034-1010-1700',2,'2026-10-10',1,'17:00:00','2026-10-10 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(42,'DEV-HO-0034-1010-1700',2,'2026-10-10',2,'17:00:00','2026-10-10 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(43,'DEV-EX-0034-1010-1800',2,'2026-10-10',1,'18:00:00','2026-10-10 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(44,'DEV-HO-0034-1010-1800',2,'2026-10-10',2,'18:00:00','2026-10-10 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(45,'DEV-EX-0029-1009-0800',3,'2026-10-09',1,'08:00:00','2026-10-09 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(46,'DEV-HO-0029-1009-0800',3,'2026-10-09',2,'08:00:00','2026-10-09 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(47,'DEV-EX-0029-1009-0900',3,'2026-10-09',1,'09:00:00','2026-10-09 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(48,'DEV-HO-0029-1009-0900',3,'2026-10-09',2,'09:00:00','2026-10-09 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(49,'DEV-EX-0029-1009-1000',3,'2026-10-09',1,'10:00:00','2026-10-09 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(50,'DEV-HO-0029-1009-1000',3,'2026-10-09',2,'10:00:00','2026-10-09 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(51,'DEV-EX-0029-1009-1100',3,'2026-10-09',1,'11:00:00','2026-10-09 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(52,'DEV-HO-0029-1009-1100',3,'2026-10-09',2,'11:00:00','2026-10-09 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(53,'DEV-EX-0029-1009-1200',3,'2026-10-09',1,'12:00:00','2026-10-09 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(54,'DEV-HO-0029-1009-1200',3,'2026-10-09',2,'12:00:00','2026-10-09 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(55,'DEV-EX-0029-1009-1300',3,'2026-10-09',1,'13:00:00','2026-10-09 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(56,'DEV-HO-0029-1009-1300',3,'2026-10-09',2,'13:00:00','2026-10-09 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(57,'DEV-EX-0029-1009-1400',3,'2026-10-09',1,'14:00:00','2026-10-09 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(58,'DEV-HO-0029-1009-1400',3,'2026-10-09',2,'14:00:00','2026-10-09 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(59,'DEV-EX-0029-1009-1500',3,'2026-10-09',1,'15:00:00','2026-10-09 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(60,'DEV-HO-0029-1009-1500',3,'2026-10-09',2,'15:00:00','2026-10-09 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(61,'DEV-EX-0029-1009-1600',3,'2026-10-09',1,'16:00:00','2026-10-09 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(62,'DEV-HO-0029-1009-1600',3,'2026-10-09',2,'16:00:00','2026-10-09 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(63,'DEV-EX-0029-1009-1700',3,'2026-10-09',1,'17:00:00','2026-10-09 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(64,'DEV-HO-0029-1009-1700',3,'2026-10-09',2,'17:00:00','2026-10-09 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(65,'DEV-EX-0029-1009-1800',3,'2026-10-09',1,'18:00:00','2026-10-09 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(66,'DEV-HO-0029-1009-1800',3,'2026-10-09',2,'18:00:00','2026-10-09 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(67,'DEV-EX-0029-1010-0800',3,'2026-10-10',1,'08:00:00','2026-10-10 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(68,'DEV-HO-0029-1010-0800',3,'2026-10-10',2,'08:00:00','2026-10-10 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(69,'DEV-EX-0029-1010-0900',3,'2026-10-10',1,'09:00:00','2026-10-10 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(70,'DEV-HO-0029-1010-0900',3,'2026-10-10',2,'09:00:00','2026-10-10 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(71,'DEV-EX-0029-1010-1000',3,'2026-10-10',1,'10:00:00','2026-10-10 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(72,'DEV-HO-0029-1010-1000',3,'2026-10-10',2,'10:00:00','2026-10-10 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(73,'DEV-EX-0029-1010-1100',3,'2026-10-10',1,'11:00:00','2026-10-10 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(74,'DEV-HO-0029-1010-1100',3,'2026-10-10',2,'11:00:00','2026-10-10 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(75,'DEV-EX-0029-1010-1200',3,'2026-10-10',1,'12:00:00','2026-10-10 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(76,'DEV-HO-0029-1010-1200',3,'2026-10-10',2,'12:00:00','2026-10-10 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(77,'DEV-EX-0029-1010-1300',3,'2026-10-10',1,'13:00:00','2026-10-10 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(78,'DEV-HO-0029-1010-1300',3,'2026-10-10',2,'13:00:00','2026-10-10 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(79,'DEV-EX-0029-1010-1400',3,'2026-10-10',1,'14:00:00','2026-10-10 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(80,'DEV-HO-0029-1010-1400',3,'2026-10-10',2,'14:00:00','2026-10-10 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(81,'DEV-EX-0029-1010-1500',3,'2026-10-10',1,'15:00:00','2026-10-10 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(82,'DEV-HO-0029-1010-1500',3,'2026-10-10',2,'15:00:00','2026-10-10 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(83,'DEV-EX-0029-1010-1600',3,'2026-10-10',1,'16:00:00','2026-10-10 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(84,'DEV-HO-0029-1010-1600',3,'2026-10-10',2,'16:00:00','2026-10-10 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(85,'DEV-EX-0029-1010-1700',3,'2026-10-10',1,'17:00:00','2026-10-10 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(86,'DEV-HO-0029-1010-1700',3,'2026-10-10',2,'17:00:00','2026-10-10 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(87,'DEV-EX-0029-1010-1800',3,'2026-10-10',1,'18:00:00','2026-10-10 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(88,'DEV-HO-0029-1010-1800',3,'2026-10-10',2,'18:00:00','2026-10-10 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(89,'DEV-EX-0032-1009-0800',4,'2026-10-09',1,'08:00:00','2026-10-09 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(90,'DEV-HO-0032-1009-0800',4,'2026-10-09',2,'08:00:00','2026-10-09 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(91,'DEV-EX-0032-1009-0900',4,'2026-10-09',1,'09:00:00','2026-10-09 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(92,'DEV-HO-0032-1009-0900',4,'2026-10-09',2,'09:00:00','2026-10-09 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(93,'DEV-EX-0032-1009-1000',4,'2026-10-09',1,'10:00:00','2026-10-09 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(94,'DEV-HO-0032-1009-1000',4,'2026-10-09',2,'10:00:00','2026-10-09 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(95,'DEV-EX-0032-1009-1100',4,'2026-10-09',1,'11:00:00','2026-10-09 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(96,'DEV-HO-0032-1009-1100',4,'2026-10-09',2,'11:00:00','2026-10-09 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(97,'DEV-EX-0032-1009-1200',4,'2026-10-09',1,'12:00:00','2026-10-09 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(98,'DEV-HO-0032-1009-1200',4,'2026-10-09',2,'12:00:00','2026-10-09 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(99,'DEV-EX-0032-1009-1300',4,'2026-10-09',1,'13:00:00','2026-10-09 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(100,'DEV-HO-0032-1009-1300',4,'2026-10-09',2,'13:00:00','2026-10-09 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(101,'DEV-EX-0032-1009-1400',4,'2026-10-09',1,'14:00:00','2026-10-09 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(102,'DEV-HO-0032-1009-1400',4,'2026-10-09',2,'14:00:00','2026-10-09 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(103,'DEV-EX-0032-1009-1500',4,'2026-10-09',1,'15:00:00','2026-10-09 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(104,'DEV-HO-0032-1009-1500',4,'2026-10-09',2,'15:00:00','2026-10-09 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(105,'DEV-EX-0032-1009-1600',4,'2026-10-09',1,'16:00:00','2026-10-09 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(106,'DEV-HO-0032-1009-1600',4,'2026-10-09',2,'16:00:00','2026-10-09 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(107,'DEV-EX-0032-1009-1700',4,'2026-10-09',1,'17:00:00','2026-10-09 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(108,'DEV-HO-0032-1009-1700',4,'2026-10-09',2,'17:00:00','2026-10-09 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(109,'DEV-EX-0032-1009-1800',4,'2026-10-09',1,'18:00:00','2026-10-09 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(110,'DEV-HO-0032-1009-1800',4,'2026-10-09',2,'18:00:00','2026-10-09 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(111,'DEV-EX-0032-1010-0800',4,'2026-10-10',1,'08:00:00','2026-10-10 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(112,'DEV-HO-0032-1010-0800',4,'2026-10-10',2,'08:00:00','2026-10-10 08:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(113,'DEV-EX-0032-1010-0900',4,'2026-10-10',1,'09:00:00','2026-10-10 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(114,'DEV-HO-0032-1010-0900',4,'2026-10-10',2,'09:00:00','2026-10-10 09:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(115,'DEV-EX-0032-1010-1000',4,'2026-10-10',1,'10:00:00','2026-10-10 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(116,'DEV-HO-0032-1010-1000',4,'2026-10-10',2,'10:00:00','2026-10-10 10:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(117,'DEV-EX-0032-1010-1100',4,'2026-10-10',1,'11:00:00','2026-10-10 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(118,'DEV-HO-0032-1010-1100',4,'2026-10-10',2,'11:00:00','2026-10-10 11:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(119,'DEV-EX-0032-1010-1200',4,'2026-10-10',1,'12:00:00','2026-10-10 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(120,'DEV-HO-0032-1010-1200',4,'2026-10-10',2,'12:00:00','2026-10-10 12:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(121,'DEV-EX-0032-1010-1300',4,'2026-10-10',1,'13:00:00','2026-10-10 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(122,'DEV-HO-0032-1010-1300',4,'2026-10-10',2,'13:00:00','2026-10-10 13:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(123,'DEV-EX-0032-1010-1400',4,'2026-10-10',1,'14:00:00','2026-10-10 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(124,'DEV-HO-0032-1010-1400',4,'2026-10-10',2,'14:00:00','2026-10-10 14:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(125,'DEV-EX-0032-1010-1500',4,'2026-10-10',1,'15:00:00','2026-10-10 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(126,'DEV-HO-0032-1010-1500',4,'2026-10-10',2,'15:00:00','2026-10-10 15:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(127,'DEV-EX-0032-1010-1600',4,'2026-10-10',1,'16:00:00','2026-10-10 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(128,'DEV-HO-0032-1010-1600',4,'2026-10-10',2,'16:00:00','2026-10-10 16:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(129,'DEV-EX-0032-1010-1700',4,'2026-10-10',1,'17:00:00','2026-10-10 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(130,'DEV-HO-0032-1010-1700',4,'2026-10-10',2,'17:00:00','2026-10-10 17:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(131,'DEV-EX-0032-1010-1800',4,'2026-10-10',1,'18:00:00','2026-10-10 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(132,'DEV-HO-0032-1010-1800',4,'2026-10-10',2,'18:00:00','2026-10-10 18:00:00',2,NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `equipment_reading` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `equipment_reading_value`
--

DROP TABLE IF EXISTS `equipment_reading_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_reading_value` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `reading_id` bigint unsigned NOT NULL COMMENT '采集记录表头',
  `parameter_id` bigint unsigned NOT NULL COMMENT '过程参数',
  `parameter_value` decimal(12,4) NOT NULL COMMENT '参数值',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_equipment_reading_value` (`reading_id`,`parameter_id`),
  KEY `idx_equipment_reading_value_parameter` (`parameter_id`),
  CONSTRAINT `fk_equipment_reading_value_header` FOREIGN KEY (`reading_id`) REFERENCES `equipment_reading` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_equipment_reading_value_parameter` FOREIGN KEY (`parameter_id`) REFERENCES `process_parameter` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=201 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备采集参数值';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment_reading_value`
--

LOCK TABLES `equipment_reading_value` WRITE;
/*!40000 ALTER TABLE `equipment_reading_value` DISABLE KEYS */;
INSERT INTO `equipment_reading_value` VALUES (1,1,1,199.9000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,1,2,8.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,2,3,12.5500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,3,1,199.9000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,3,2,8.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,4,3,12.5600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,5,1,200.0000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(8,5,2,8.1100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(9,6,3,12.5700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(10,7,1,200.0000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(11,7,2,8.1100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(12,8,3,12.5700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(13,9,1,200.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(14,9,2,8.1200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(15,10,3,12.5800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(16,11,1,200.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(17,11,2,8.1200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(18,12,3,12.5900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(19,13,1,200.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(20,13,2,8.1200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(21,14,3,12.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(22,15,1,200.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(23,15,2,8.1300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(24,16,3,12.6100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(25,17,1,200.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(26,17,2,8.1300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(27,18,3,12.6100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(28,19,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(29,19,2,8.1400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(30,20,3,12.6200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(31,21,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(32,21,2,8.1400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(33,22,3,12.6300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(34,23,1,200.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(35,23,2,8.1200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(36,24,3,12.5800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(37,25,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(38,25,2,8.1300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(39,26,3,12.5900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(40,27,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(41,27,2,8.1300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(42,28,3,12.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(43,29,1,200.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(44,29,2,8.1400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(45,30,3,12.6100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(46,31,1,200.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(47,31,2,8.1400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(48,32,3,12.6200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(49,33,1,200.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(50,33,2,8.1500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(51,34,3,12.6300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(52,35,1,200.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(53,35,2,8.1600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(54,36,3,12.6400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(55,37,1,200.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(56,37,2,8.1600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(57,38,3,12.6500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(58,39,1,200.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(59,39,2,8.1700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(60,40,3,12.6600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(61,41,1,200.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(62,41,2,8.1700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(63,42,3,12.6700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(64,43,1,200.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(65,43,2,8.1800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(66,44,3,12.6800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(67,45,1,200.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(68,45,2,8.1400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(69,46,3,12.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(70,47,1,200.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(71,47,2,8.1500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(72,48,3,12.6100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(73,49,1,200.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(74,49,2,8.1500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(75,50,3,12.6200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(76,51,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(77,51,2,8.1600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(78,52,3,12.6300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(79,53,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(80,53,2,8.1600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(81,54,3,12.6400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(82,55,1,200.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(83,55,2,8.1700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(84,56,3,12.6500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(85,57,1,200.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(86,57,2,8.1800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(87,58,3,12.6600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(88,59,1,200.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(89,59,2,8.1800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(90,60,3,12.6700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(91,61,1,200.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(92,61,2,8.1900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(93,62,3,12.6800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(94,63,1,200.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(95,63,2,8.1900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(96,64,3,12.6900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(97,65,1,200.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(98,65,2,8.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(99,66,3,12.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(100,67,1,200.9000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(101,67,2,8.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(102,68,3,12.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(103,69,1,201.0000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(104,69,2,8.2100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(105,70,3,12.7200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(106,71,1,201.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(107,71,2,8.2200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(108,72,3,12.7300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(109,73,1,201.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(110,73,2,8.2300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(111,74,3,12.7500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(112,75,1,201.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(113,75,2,8.2400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(114,76,3,12.7600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(115,77,1,201.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(116,77,2,8.2500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(117,78,3,12.7800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(118,79,1,201.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(119,79,2,8.2600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(120,80,3,12.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(121,81,1,201.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(122,81,2,8.2700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(123,82,3,12.8100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(124,83,1,201.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(125,83,2,8.2800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(126,84,3,12.8300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(127,85,1,201.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(128,85,2,8.2900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(129,86,3,12.8400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(130,87,1,201.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(131,87,2,8.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(132,88,3,12.8600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(133,89,1,200.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(134,89,2,8.1600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(135,90,3,12.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(136,91,1,200.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(137,91,2,8.1700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(138,92,3,12.6100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(139,93,1,200.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(140,93,2,8.1700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(141,94,3,12.6200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(142,95,1,200.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(143,95,2,8.1800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(144,96,3,12.6300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(145,97,1,200.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(146,97,2,8.1800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(147,98,3,12.6400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(148,99,1,200.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(149,99,2,8.1900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(150,100,3,12.6500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(151,101,1,200.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(152,101,2,8.1900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(153,102,3,12.6600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(154,103,1,200.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(155,103,2,8.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(156,104,3,12.6700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(157,105,1,200.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(158,105,2,8.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(159,106,3,12.6800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(160,107,1,200.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(161,107,2,8.2100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(162,108,3,12.6900,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(163,109,1,200.9000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(164,109,2,8.2100,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(165,110,3,12.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(166,111,1,201.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(167,111,2,8.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(168,112,3,12.6200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(169,113,1,201.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(170,113,2,8.2200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(171,114,3,12.6500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(172,115,1,201.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(173,115,2,8.2400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(174,116,3,12.6700,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(175,117,1,202.1000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(176,117,2,8.2600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(177,118,3,12.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(178,119,1,202.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(179,119,2,8.2800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(180,120,3,12.7200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(181,121,1,202.5000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(182,121,2,8.3000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(183,122,3,12.7500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(184,123,1,202.7000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(185,123,2,8.3200,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(186,124,3,12.7800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(187,125,1,202.9000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(188,125,2,8.3400,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(189,126,3,12.8000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(190,127,1,203.2000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(191,127,2,8.3600,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(192,128,3,12.8300,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(193,129,1,203.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(194,129,2,8.3800,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(195,130,3,12.8500,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(196,131,1,203.6000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(197,131,2,8.4000,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(198,132,3,12.8800,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `equipment_reading_value` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `equipment_type`
--

DROP TABLE IF EXISTS `equipment_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_type` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '类型编码，如 ETYPE-EXTRUDER / ETYPE-HAULOFF',
  `name` varchar(64) NOT NULL COMMENT '类型名称，如 挤出机 / 牵引机',
  `description` varchar(255) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_equipment_type_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备类型';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment_type`
--

LOCK TABLES `equipment_type` WRITE;
/*!40000 ALTER TABLE `equipment_type` DISABLE KEYS */;
INSERT INTO `equipment_type` VALUES (1,'ETYPE-EXTRUDER','挤出机','单螺杆挤出机组（含机筒与适配器温区）',0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'ETYPE-HAULOFF','牵引机','履带式牵引机（含牵引速度反馈）',0,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `equipment_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `follows`
--

DROP TABLE IF EXISTS `follows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `follows` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `follower_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `following_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `follows_follower_id_following_id_key` (`follower_id`,`following_id`),
  KEY `follows_follower_id_idx` (`follower_id`),
  KEY `follows_following_id_idx` (`following_id`),
  CONSTRAINT `follows_follower_id_fkey` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `follows_following_id_fkey` FOREIGN KEY (`following_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `follows`
--

LOCK TABLES `follows` WRITE;
/*!40000 ALTER TABLE `follows` DISABLE KEYS */;
/*!40000 ALTER TABLE `follows` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `health_check`
--

DROP TABLE IF EXISTS `health_check`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `health_check` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `health_check`
--

LOCK TABLES `health_check` WRITE;
/*!40000 ALTER TABLE `health_check` DISABLE KEYS */;
/*!40000 ALTER TABLE `health_check` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `import_job`
--

DROP TABLE IF EXISTS `import_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `import_job` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '导入批次号',
  `group_key` enum('product_master','equipment','production_data') NOT NULL COMMENT '数据类别 [原型 adminImportGroups]',
  `file_name` varchar(255) NOT NULL COMMENT '上传文件名',
  `file_size_bytes` bigint unsigned DEFAULT NULL COMMENT '文件大小',
  `sheet_count` int unsigned DEFAULT NULL COMMENT '工作表数量',
  `total_rows` int unsigned NOT NULL DEFAULT '0' COMMENT '校验总行数',
  `success_rows` int unsigned NOT NULL DEFAULT '0' COMMENT '可写入行数',
  `error_rows` int unsigned NOT NULL DEFAULT '0' COMMENT '错误行数',
  `status` enum('validating','validated','committed','failed','cancelled') NOT NULL DEFAULT 'validating' COMMENT '任务状态',
  `error_summary` json DEFAULT NULL COMMENT '逐行错误明细 [{sheet,table,row,column,message,rawValue}]',
  `imported_by` bigint unsigned DEFAULT NULL COMMENT '导入人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `committed_at` datetime DEFAULT NULL COMMENT '整批写入时间',
  `remark` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_import_job_code` (`code`),
  KEY `idx_import_job_status` (`status`,`created_at`),
  KEY `fk_import_job_user` (`imported_by`),
  CONSTRAINT `fk_import_job_user` FOREIGN KEY (`imported_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Excel 批量导入任务';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `import_job`
--

LOCK TABLES `import_job` WRITE;
/*!40000 ALTER TABLE `import_job` DISABLE KEYS */;
INSERT INTO `import_job` VALUES (1,'IMP-20261012193910-9929','production_data','test_ok_batches.xlsx',17257,1,2,2,0,'committed','[]',1,'2026-10-12 19:39:10','2026-10-12 19:39:10','导入类别：batches（生产批次）'),(2,'IMP-20261012193913-5002','production_data','test_ok_inspections.xlsx',17409,1,2,0,2,'failed','[{\"row\": 3, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「12121D0032」，请先在主数据中登记。\", \"rawValue\": \"12121D0032\"}, {\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「12121D0032」，请先在主数据中登记。\", \"rawValue\": \"12121D0032\"}]',1,'2026-10-12 19:39:13',NULL,'导入类别：inspections（样管抽检记录）'),(3,'IMP-20261012193927-9305','production_data','test_ok_inspections.xlsx',17409,1,2,2,0,'committed','[]',1,'2026-10-12 19:39:27','2026-10-12 19:39:27','导入类别：inspections（样管抽检记录）'),(4,'IMP-20261012193935-4691','production_data','test_bad_inspections.xlsx',18985,1,6,2,4,'failed','[{\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"指标编码不存在：「not_a_metric」，请先在主数据中登记。\", \"rawValue\": \"not_a_metric\"}, {\"row\": 5, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「NO_SUCH_BATCH」，请先在主数据中登记。\", \"rawValue\": \"NO_SUCH_BATCH\"}, {\"row\": 6, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标值\", \"message\": \"数值非法：「abc」不是有效数字。\", \"rawValue\": \"abc\"}, {\"row\": 8, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"重复行：记录编号「IMP-BAD-001」的指标「outer_diameter」重复。\", \"rawValue\": \"outer_diameter\"}]',1,'2026-10-12 19:39:35',NULL,'导入类别：inspections（样管抽检记录）'),(5,'IMP-20261012194002-5159','production_data','test_bad_inspections.xlsx',18985,1,6,1,5,'failed','[{\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"指标编码不存在：「not_a_metric」，请先在主数据中登记。\", \"rawValue\": \"not_a_metric\"}, {\"row\": 5, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「NO_SUCH_BATCH」，请先在主数据中登记。\", \"rawValue\": \"NO_SUCH_BATCH\"}, {\"row\": 6, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标值\", \"message\": \"数值非法：「abc」不是有效数字。\", \"rawValue\": \"abc\"}, {\"row\": 7, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"时间格式非法：「2026/13/45 99:99」超出有效日期时间范围。\", \"rawValue\": \"2026/13/45 99:99\"}, {\"row\": 8, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"重复行：记录编号「IMP-BAD-001」的指标「outer_diameter」重复。\", \"rawValue\": \"outer_diameter\"}]',1,'2026-10-12 19:40:02',NULL,'导入类别：inspections（样管抽检记录）'),(6,'IMP-20261012194005-6966','production_data','test_missing_column.xlsx',16329,1,0,0,1,'failed','[{\"row\": 2, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"必填列缺失：批次编号*。请使用系统下载的最新模板。\", \"rawValue\": null}]',1,'2026-10-12 19:40:05',NULL,'导入类别：inspections（样管抽检记录）'),(7,'IMP-20261012194040-1504','production_data','test_ok_products.xlsx',16744,1,2,2,0,'committed','[]',1,'2026-10-12 19:40:40','2026-10-12 19:40:40','导入类别：products（产品数据）'),(8,'IMP-20261012194040-0467','equipment','test_ok_readings.xlsx',16957,1,2,2,0,'committed','[]',1,'2026-10-12 19:40:40','2026-10-12 19:40:40','导入类别：readings（设备采集数据）'),(9,'IMP-20261012194040-0500','production_data','test_ok_process.xlsx',17232,1,2,2,0,'committed','[]',1,'2026-10-12 19:40:40','2026-10-12 19:40:40','导入类别：process（工艺过程记录）'),(10,'IMP-20261012194040-8422','production_data','test_ok_events.xlsx',16528,1,1,1,0,'committed','[]',1,'2026-10-12 19:40:40','2026-10-12 19:40:40','导入类别：production-events（生产事件记录）'),(11,'IMP-20261012194046-2789','production_data','tpl_batches.xlsx',17780,1,0,0,1,'failed','[{\"row\": 3, \"sheet\": \"生产批次\", \"table\": \"production_batch\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}]',1,'2026-10-12 19:40:46',NULL,'导入类别：batches（生产批次）'),(12,'IMP-20261012194046-6161','production_data','tpl_products.xlsx',17197,1,0,0,1,'failed','[{\"row\": 3, \"sheet\": \"产品数据\", \"table\": \"product_data\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}]',1,'2026-10-12 19:40:46',NULL,'导入类别：products（产品数据）'),(13,'IMP-20261012194046-9893','equipment','tpl_readings.xlsx',17491,1,0,0,1,'failed','[{\"row\": 3, \"sheet\": \"设备采集数据\", \"table\": \"equipment_reading\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}]',1,'2026-10-12 19:40:46',NULL,'导入类别：readings（设备采集数据）'),(14,'IMP-20261012194046-8736','production_data','tpl_inspections.xlsx',17941,1,0,0,1,'failed','[{\"row\": 3, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}]',1,'2026-10-12 19:40:46',NULL,'导入类别：inspections（样管抽检记录）'),(15,'IMP-20261012194046-8691','production_data','tpl_process.xlsx',17858,1,0,0,1,'failed','[{\"row\": 3, \"sheet\": \"工艺过程记录\", \"table\": \"process_record\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}]',1,'2026-10-12 19:40:46',NULL,'导入类别：process（工艺过程记录）'),(16,'IMP-20261012194046-8735','production_data','tpl_production-events.xlsx',17412,1,0,0,1,'failed','[{\"row\": 3, \"sheet\": \"生产事件记录\", \"table\": \"production_event\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}]',1,'2026-10-12 19:40:46',NULL,'导入类别：production-events（生产事件记录）'),(17,'IMP-20261012194134-8166','production_data','test_ok_inspections.xlsx',17409,1,2,0,2,'failed','[{\"row\": 3, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"批次 + 抽检时间（12121D0032 / 2026-10-12 08:30:00）的抽检记录已存在，不能重复导入。\", \"rawValue\": \"IMP-IR-001\"}, {\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"批次 + 抽检时间（12121D0032 / 2026-10-12 08:30:00）的抽检记录已存在，不能重复导入。\", \"rawValue\": \"IMP-IR-001\"}]',1,'2026-10-12 19:41:34',NULL,'导入类别：inspections（样管抽检记录）'),(18,'IMP-20261012194134-6889','production_data','test_bad_inspections.xlsx',18985,1,6,1,5,'failed','[{\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"指标编码不存在：「not_a_metric」，请先在主数据中登记。\", \"rawValue\": \"not_a_metric\"}, {\"row\": 5, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「NO_SUCH_BATCH」，请先在主数据中登记。\", \"rawValue\": \"NO_SUCH_BATCH\"}, {\"row\": 6, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标值\", \"message\": \"数值非法：「abc」不是有效数字。\", \"rawValue\": \"abc\"}, {\"row\": 7, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"时间格式非法：「2026/13/45 99:99」超出有效日期时间范围。\", \"rawValue\": \"2026/13/45 99:99\"}, {\"row\": 8, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"重复行：记录编号「IMP-BAD-001」的指标「outer_diameter」重复。\", \"rawValue\": \"outer_diameter\"}]',1,'2026-10-12 19:41:34',NULL,'导入类别：inspections（样管抽检记录）'),(19,'IMP-20261012194141-3549','production_data','test_ok_inspections2.xlsx',17409,1,2,2,0,'committed','[]',1,'2026-10-12 19:41:41','2026-10-12 19:41:41','导入类别：inspections（样管抽检记录）');
/*!40000 ALTER TABLE `import_job` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspection_record`
--

DROP TABLE IF EXISTS `inspection_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_record` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '记录编号，如 IR-001 [原型 id]',
  `sample_no` varchar(64) NOT NULL COMMENT '样管编号，如 S-001 [原型 sampleId]（同一样管初测/复测可多条）',
  `batch_id` bigint unsigned NOT NULL COMMENT '批次号',
  `spec_id` bigint unsigned NOT NULL COMMENT '产品规格',
  `production_group` varchar(32) DEFAULT NULL COMMENT '生产组别',
  `inspect_time` datetime NOT NULL COMMENT '抽检/检测时间 [原型 timestamp / inspectionTime]',
  `production_time` datetime DEFAULT NULL COMMENT '生产时间（待补，用于计算检测延迟）[原型 productionTime]',
  `inspection_delay_minutes` int unsigned DEFAULT NULL COMMENT '检测延迟分钟（由生产时间与检测时间计算）',
  `measurement_stage` enum('initial','retest','unconfirmed') NOT NULL DEFAULT 'unconfirmed' COMMENT '初测/复测 [原型 measurementStage]',
  `inspection_method` varchar(128) DEFAULT NULL COMMENT '检验方法 [原型 inspectionMethod：待确认]',
  `instrument_info` varchar(128) DEFAULT NULL COMMENT '量具/仪器与校准信息 [原型 instrumentInfo：待确认]',
  `quality_flag` enum('none','qms_mes_mismatch','measurement_error','spec_mismatch','insufficient') NOT NULL DEFAULT 'none' COMMENT '数据质量标记：R1/R2 判定来源',
  `quality_note` varchar(500) DEFAULT NULL COMMENT '数据质量问题说明（不构成产品合格判定）',
  `simulated_ovality` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=不圆度为显式模拟构造值 [原型 simulatedOvality]',
  `data_source_id` bigint unsigned NOT NULL COMMENT '数据来源',
  `record_status` enum('valid','void') NOT NULL DEFAULT 'valid' COMMENT '记录有效性（作废不物理删除）',
  `remark` varchar(255) DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inspection_record_code` (`code`),
  UNIQUE KEY `uk_inspection_record_batch_time` (`batch_id`,`inspect_time`),
  KEY `idx_inspection_record_sample` (`sample_no`),
  KEY `idx_inspection_record_batch` (`batch_id`,`inspect_time`),
  KEY `idx_inspection_record_flag` (`quality_flag`),
  KEY `fk_inspection_record_spec` (`spec_id`),
  KEY `fk_inspection_record_source` (`data_source_id`),
  KEY `fk_inspection_record_creator` (`created_by`),
  CONSTRAINT `fk_inspection_record_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inspection_record_creator` FOREIGN KEY (`created_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inspection_record_source` FOREIGN KEY (`data_source_id`) REFERENCES `data_source` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inspection_record_spec` FOREIGN KEY (`spec_id`) REFERENCES `product_spec` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样管抽检记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspection_record`
--

LOCK TABLES `inspection_record` WRITE;
/*!40000 ALTER TABLE `inspection_record` DISABLE KEYS */;
INSERT INTO `inspection_record` VALUES (1,'IR-001','S-IR-001',2,1,'C组','2026-10-09 08:00:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(2,'IR-002','S-IR-002',2,1,'C组','2026-10-09 11:20:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(3,'IR-003','S-IR-003',2,1,'C组','2026-10-09 15:03:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(4,'IR-004','S-IR-004',2,1,'C组','2026-10-09 18:40:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(5,'IR-005','S-IR-005',2,1,'C组','2026-10-10 08:20:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(6,'IR-006','S-IR-006',2,1,'C组','2026-10-10 09:05:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(7,'IR-007','S-IR-007',2,1,'C组','2026-10-10 09:37:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid','本次抽检未测量同截面最大/最小外径，不圆度按「无数据」处理',NULL,'2026-10-12 19:03:33','2026-10-12 19:13:36'),(8,'IR-008','S-IR-008',3,1,'D组','2026-10-09 08:00:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(9,'IR-009','S-IR-009',3,1,'D组','2026-10-09 11:20:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(10,'IR-010','S-IR-010',3,1,'D组','2026-10-09 15:03:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(11,'IR-011','S-IR-011',3,1,'D组','2026-10-09 18:40:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(12,'IR-012','S-IR-012',3,1,'D组','2026-10-10 08:20:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(13,'IR-013','S-IR-013',3,1,'D组','2026-10-10 09:05:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(14,'IR-014','S-IR-014',3,1,'D组','2026-10-10 09:37:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(15,'IR-015','S-IR-015',4,1,'D组','2026-10-09 08:00:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(16,'IR-016','S-IR-016',4,1,'D组','2026-10-09 11:20:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(17,'IR-017','S-IR-017',4,1,'D组','2026-10-09 15:03:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(18,'IR-018','S-IR-018',4,1,'D组','2026-10-09 18:40:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(19,'IR-019','S-IR-019',4,1,'D组','2026-10-10 08:20:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(20,'IR-020','S-IR-020',4,1,'D组','2026-10-10 09:05:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(21,'IR-021','S-IR-021',4,1,'D组','2026-10-10 09:37:00',NULL,NULL,'unconfirmed','待确认','待确认','none',NULL,0,3,'valid',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(22,'IMP-IR-001','S-IMP-001',4,1,'D组','2026-10-12 08:30:00','2026-10-12 08:00:00',30,'initial','GB/T 8806','数显游标卡尺','none',NULL,0,1,'valid',NULL,1,'2026-10-12 19:39:27','2026-10-12 19:39:27'),(23,'IMP-IR-002','S-IMP-002',4,1,'D组','2026-10-16 08:30:00','2026-10-16 08:00:00',30,'initial','GB/T 8806','数显游标卡尺','none',NULL,0,1,'valid',NULL,1,'2026-10-12 19:41:41','2026-10-12 19:41:41');
/*!40000 ALTER TABLE `inspection_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspection_value`
--

DROP TABLE IF EXISTS `inspection_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_value` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `record_id` bigint unsigned NOT NULL COMMENT '抽检记录',
  `metric_id` bigint unsigned NOT NULL COMMENT '质量指标',
  `metric_value` decimal(12,4) NOT NULL COMMENT '测量值（单位见指标字典）',
  `is_derived` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=计算值（不圆度 = 最大外径 − 最小外径）',
  `is_simulated` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=模拟值 [原型 dataValueType：模拟值]',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inspection_value` (`record_id`,`metric_id`),
  KEY `idx_inspection_value_metric` (`metric_id`),
  CONSTRAINT `fk_inspection_value_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inspection_value_record` FOREIGN KEY (`record_id`) REFERENCES `inspection_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='抽检指标值';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspection_value`
--

LOCK TABLES `inspection_value` WRITE;
/*!40000 ALTER TABLE `inspection_value` DISABLE KEYS */;
INSERT INTO `inspection_value` VALUES (1,1,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,1,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,1,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,2,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,2,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,2,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,3,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(8,3,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(9,3,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(10,4,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(11,4,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(12,4,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(13,5,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(14,5,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(15,5,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(16,6,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(17,6,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(18,6,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(19,7,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(20,7,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(21,7,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(22,8,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(23,8,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(24,8,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(25,9,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(26,9,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(27,9,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(28,10,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(29,10,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(30,10,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(31,11,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(32,11,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(33,11,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(34,12,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(35,12,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(36,12,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(37,13,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(38,13,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(39,13,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(40,14,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(41,14,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(42,14,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(43,15,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(44,15,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(45,15,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(46,16,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(47,16,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(48,16,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(49,17,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(50,17,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(51,17,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(52,18,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(53,18,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(54,18,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(55,19,1,25.2300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(56,19,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(57,19,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(58,20,1,25.2350,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(59,20,2,4.3200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(60,20,3,4.4300,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(61,21,1,25.2400,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(62,21,2,4.3100,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(63,21,3,4.4200,0,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(64,15,4,25.4500,0,0,'同一样管同一截面最大外径（实测）','2026-10-12 19:13:36','2026-10-12 19:13:36'),(65,15,5,25.0300,0,0,'同一样管同一截面最小外径（实测）','2026-10-12 19:13:36','2026-10-12 19:13:36'),(66,22,1,25.0300,0,0,NULL,'2026-10-12 19:39:27','2026-10-12 19:39:27'),(67,22,2,4.2100,0,0,NULL,'2026-10-12 19:39:27','2026-10-12 19:39:27'),(68,23,1,25.0500,0,0,NULL,'2026-10-12 19:41:41','2026-10-12 19:41:41'),(69,23,2,4.2200,0,0,NULL,'2026-10-12 19:41:41','2026-10-12 19:41:41');
/*!40000 ALTER TABLE `inspection_value` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspection_wall_point`
--

DROP TABLE IF EXISTS `inspection_wall_point`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_wall_point` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `record_id` bigint unsigned NOT NULL COMMENT '抽检记录',
  `point_no` smallint unsigned NOT NULL COMMENT '测点序号',
  `position_desc` varchar(64) DEFAULT NULL COMMENT '位置描述：周向角度/轴向位置/截面位置',
  `value_mm` decimal(10,3) NOT NULL COMMENT '壁厚 mm',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inspection_wall_point` (`record_id`,`point_no`),
  CONSTRAINT `fk_inspection_wall_point_record` FOREIGN KEY (`record_id`) REFERENCES `inspection_record` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='多点壁厚原始测点';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspection_wall_point`
--

LOCK TABLES `inspection_wall_point` WRITE;
/*!40000 ALTER TABLE `inspection_wall_point` DISABLE KEYS */;
/*!40000 ALTER TABLE `inspection_wall_point` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `related_id` int DEFAULT NULL,
  `related_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `messages_user_id_idx` (`user_id`),
  KEY `messages_is_read_idx` (`is_read`),
  CONSTRAINT `messages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metric_influence`
--

DROP TABLE IF EXISTS `metric_influence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metric_influence` (
  `metric_id` bigint unsigned NOT NULL COMMENT '质量指标',
  `parameter_id` bigint unsigned NOT NULL COMMENT '关联过程参数',
  `remark` varchar(255) DEFAULT NULL COMMENT '关联说明/待确认事项',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`metric_id`,`parameter_id`),
  KEY `idx_metric_influence_parameter` (`parameter_id`),
  CONSTRAINT `fk_metric_influence_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_metric_influence_parameter` FOREIGN KEY (`parameter_id`) REFERENCES `process_parameter` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指标与过程参数关联';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metric_influence`
--

LOCK TABLES `metric_influence` WRITE;
/*!40000 ALTER TABLE `metric_influence` DISABLE KEYS */;
INSERT INTO `metric_influence` VALUES (1,1,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33'),(1,2,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33'),(2,1,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33'),(2,3,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33'),(6,1,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33'),(6,2,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33'),(6,3,'影响机理待现场数据验证，暂作为排查方向','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `metric_influence` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metric_spec_limit`
--

DROP TABLE IF EXISTS `metric_spec_limit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metric_spec_limit` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `spec_id` bigint unsigned NOT NULL COMMENT '产品规格',
  `metric_id` bigint unsigned NOT NULL COMMENT '质量指标',
  `lower_limit` decimal(12,4) DEFAULT NULL COMMENT '下限，NULL=不设下限',
  `upper_limit` decimal(12,4) DEFAULT NULL COMMENT '上限，NULL=不设上限',
  `limit_type` enum('demo','internal','customer','national') NOT NULL DEFAULT 'demo' COMMENT '限值类型：demo 演示限值',
  `calibration_status` enum('demo','pending_field_validation','validated') NOT NULL DEFAULT 'demo' COMMENT '限值可信状态：演示策略待现场验证',
  `standard_ref` varchar(128) DEFAULT NULL COMMENT '适用标准/条款（待确认）',
  `effective_from` date DEFAULT NULL COMMENT '生效日期',
  `effective_to` date DEFAULT NULL COMMENT '失效日期',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_metric_spec_limit` (`spec_id`,`metric_id`),
  KEY `idx_metric_spec_limit_metric` (`metric_id`),
  CONSTRAINT `fk_metric_spec_limit_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_metric_spec_limit_spec` FOREIGN KEY (`spec_id`) REFERENCES `product_spec` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='指标规格限值';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metric_spec_limit`
--

LOCK TABLES `metric_spec_limit` WRITE;
/*!40000 ALTER TABLE `metric_spec_limit` DISABLE KEYS */;
INSERT INTO `metric_spec_limit` VALUES (1,1,1,25.0000,25.5000,'demo','demo',NULL,NULL,NULL,'限值待质量部门按产品标准与客户要求确认，当前仅用于提示复核','2026-10-12 19:03:33','2026-10-12 20:02:02'),(2,1,2,4.2000,4.8000,'demo','demo',NULL,NULL,NULL,'限值待质量部门按产品标准与客户要求确认，当前仅用于提示复核','2026-10-12 19:03:33','2026-10-12 20:02:02'),(3,1,6,0.0000,0.3500,'demo','demo',NULL,NULL,NULL,'限值待质量部门按产品标准与客户要求确认，当前仅用于提示复核','2026-10-12 19:03:33','2026-10-12 20:02:02');
/*!40000 ALTER TABLE `metric_spec_limit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification`
--

DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '通知编号',
  `event_id` bigint unsigned NOT NULL COMMENT '关联预警事件',
  `channel` enum('email','sms','im','system') NOT NULL DEFAULT 'email' COMMENT '通知渠道',
  `subject` varchar(255) DEFAULT NULL COMMENT '主题',
  `body` mediumtext COMMENT '正文',
  `status` enum('pending','sent','failed','simulated','cancelled') NOT NULL DEFAULT 'pending' COMMENT '发送状态',
  `is_simulated` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=模拟发送，未接入真实邮件服务',
  `trigger_mode` enum('manual','auto') NOT NULL DEFAULT 'manual' COMMENT '触发方式：中风险自动发送策略待确认',
  `attempt_count` smallint unsigned NOT NULL DEFAULT '0' COMMENT '发送尝试次数',
  `error_message` varchar(500) DEFAULT NULL COMMENT '失败原因',
  `sent_at` datetime DEFAULT NULL COMMENT '发送时间',
  `created_by` bigint unsigned DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_code` (`code`),
  KEY `idx_notification_event` (`event_id`),
  KEY `idx_notification_status` (`status`,`created_at`),
  KEY `fk_notification_creator` (`created_by`),
  CONSTRAINT `fk_notification_creator` FOREIGN KEY (`created_by`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notification_event` FOREIGN KEY (`event_id`) REFERENCES `alert_event` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知（邮件/消息）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification`
--

LOCK TABLES `notification` WRITE;
/*!40000 ALTER TABLE `notification` DISABLE KEYS */;
INSERT INTO `notification` VALUES (1,'NT-QE-12121D0029-20261009-001-001',5,'email','【质量预警】12121D0029 · R1 · 外径','批次：12121D0029（D组）\n规则：R1 数据记录差异待核对（阈值状态：demo）\n风险等级：error\n异常指标：外径\n窗口：2026-10-09 08:00:00 ~ 2026-10-09 08:00:00\n判定依据：同一指标存在两条来源记录：MES 生产系统 25.235 mm，QMS 检验系统 25.290 mm，差值 0.055 mm，核对结论尚未确认。请先核对样管编号、原始检验单与仪器，差异核实前不作产品质量结论。\n影响长度：缺少线速度记录，无法估算','cancelled',0,'manual',8,'未配置 SMTP（NOTIFY_TRANSPORT / SMTP_HOST / SMTP_FROM），通知已落库，可人工外发',NULL,1,'2026-10-12 19:39:08','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `notification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_recipient`
--

DROP TABLE IF EXISTS `notification_recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_recipient` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL COMMENT '通知',
  `role_id` bigint unsigned DEFAULT NULL COMMENT '收件角色（按角色广播）',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '收件人（按人发送）',
  `recipient_name` varchar(64) DEFAULT NULL COMMENT '收件人/角色名称快照',
  `recipient_address` varchar(128) DEFAULT NULL COMMENT '收件地址快照',
  `delivery_status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending' COMMENT '投递状态',
  `read_at` datetime DEFAULT NULL COMMENT '阅读时间',
  `ack_status` enum('pending','acknowledged','rejected') NOT NULL DEFAULT 'pending' COMMENT '确认状态',
  `ack_at` datetime DEFAULT NULL COMMENT '确认时间',
  `ack_comment` varchar(500) DEFAULT NULL COMMENT '确认/拒绝说明',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_recipient_notification` (`notification_id`),
  KEY `idx_notification_recipient_user` (`user_id`,`ack_status`),
  KEY `fk_notification_recipient_role` (`role_id`),
  CONSTRAINT `fk_notification_recipient_notification` FOREIGN KEY (`notification_id`) REFERENCES `notification` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notification_recipient_role` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notification_recipient_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知收件人与回执';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_recipient`
--

LOCK TABLES `notification_recipient` WRITE;
/*!40000 ALTER TABLE `notification_recipient` DISABLE KEYS */;
INSERT INTO `notification_recipient` VALUES (1,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:39:08','2026-10-12 19:39:08'),(2,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:39:08','2026-10-12 19:39:08'),(3,1,3,NULL,'验收测试员（已调整）','qa.test01@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:39:08','2026-10-12 19:39:08'),(4,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:41:57','2026-10-12 19:41:57'),(5,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:41:57','2026-10-12 19:41:57'),(6,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(7,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:45:33','2026-10-12 19:45:33'),(8,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:55:22','2026-10-12 19:55:22'),(9,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:55:22','2026-10-12 19:55:22'),(10,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(11,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 19:59:23','2026-10-12 19:59:23'),(14,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(15,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-12 20:10:18','2026-10-12 20:10:18'),(16,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(17,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-13 03:45:25','2026-10-13 03:45:25'),(18,1,3,2,'张工','zhang.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-13 08:30:30','2026-10-13 08:30:30'),(19,1,2,5,'赵主管','zhao.quality@ppr.local','pending',NULL,'pending',NULL,NULL,'2026-10-13 08:30:30','2026-10-13 08:30:30');
/*!40000 ALTER TABLE `notification_recipient` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `operation_log`
--

DROP TABLE IF EXISTS `operation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operation_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT '操作人（系统任务为空）',
  `module` varchar(64) NOT NULL COMMENT '模块：data_admin/quality_monitor/diagnosis/eight_d/archive/auth',
  `action_type` varchar(32) NOT NULL COMMENT '动作：ai_generate/engineer_decision/archive/report_save/report_finalize/import/data_crud/notify/login',
  `target_type` varchar(64) DEFAULT NULL COMMENT '目标对象类型',
  `target_id` varchar(64) DEFAULT NULL COMMENT '目标对象标识',
  `detail` varchar(1000) DEFAULT NULL COMMENT '操作说明 [原型 history[].action]',
  `detail_json` json DEFAULT NULL COMMENT '结构化明细',
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_operation_log_module` (`module`,`action_type`,`created_at`),
  KEY `idx_operation_log_target` (`target_type`,`target_id`),
  KEY `idx_operation_log_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_operation_log_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=126 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='操作与审计日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `operation_log`
--

LOCK TABLES `operation_log` WRITE;
/*!40000 ALTER TABLE `operation_log` DISABLE KEYS */;
INSERT INTO `operation_log` VALUES (1,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 11:07:15'),(2,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 11:19:54'),(3,NULL,'masterdata','create','product_category','2','新增产品类别：测试类别','{\"code\": \"CAT-TEST\", \"name\": \"测试类别\", \"status\": \"enabled\", \"description\": \"临时验证\"}','127.0.0.1','curl/8.7.1','2026-10-12 11:21:40'),(4,NULL,'masterdata','delete','product_category','2','停用并删除产品类别：测试类别',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 11:22:42'),(5,1,'diagnosis','create','analysis_run','2','对事件 QE-12121D0032-20261009-001（R3）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 7 条 · 设备读数 44 条 · 参考批次 0 个；快照指纹 d59a3c61e1a320c5',NULL,NULL,NULL,'2026-10-12 19:26:49'),(6,1,'eight_d','create','eight_d_report','1','生成 8D 报告 8D-QE-12121D0032-20261009-001-001（事件 QE-12121D0032-20261009-001）',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:29:13'),(7,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:31:36'),(8,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-12 19:32:22'),(9,1,'diagnosis','create','analysis_run','3','对事件 QE-12121D0032-20261009-001（R3）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 7 条 · 设备读数 44 条 · 参考批次 0 个；快照指纹 d59a3c61e1a320c5',NULL,'127.0.0.1','node','2026-10-12 19:32:22'),(10,1,'eight_d','update','eight_d_report','1','保存 8D 报告 8D-QE-12121D0032-20261009-001-001 草稿',NULL,'127.0.0.1','node','2026-10-12 19:32:22'),(11,1,'masterdata','update','product_category','1','修改产品类别：无字段变化','{\"after\": {\"status\": \"enabled\", \"description\": \"PPR 冷热水用聚丙烯管材（给水用）\"}, \"before\": {\"status\": \"enabled\", \"description\": \"PPR 冷热水用聚丙烯管材（给水用）\"}}','127.0.0.1','curl/8.7.1','2026-10-12 19:34:12'),(12,1,'system','update','alert_rule','4','修改预警规则 R4（连续抽检点趋势变化待复核）：标定状态：demo → pending_field_validation；阈值参数：{consecutive=3, minimum_change_mm=0.015, maximum_gap_minutes=240, maximum_window_hours=12} → {consecutive=3, minimum_change_mm=0.02, maximum_gap_minutes=240}','{\"code\": \"R4\", \"after\": {\"name\": \"连续抽检点趋势变化待复核\", \"enabled\": 1, \"description\": \"同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔与运行连续性满足条件时触发。阈值（连续点数、变化幅度、最大间隔）需按现场节拍标定。\", \"params_json\": {\"consecutive\": 3, \"minimum_change_mm\": 0.02, \"maximum_gap_minutes\": 240}, \"evaluate_order\": 4, \"calibration_status\": \"pending_field_validation\"}, \"before\": {\"name\": \"连续抽检点趋势变化待复核\", \"enabled\": 1, \"description\": \"同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔与运行连续性满足条件时触发。阈值（连续点数、变化幅度、最大间隔）需按现场节拍标定。\", \"params_json\": {\"consecutive\": 3, \"minimum_change_mm\": 0.015, \"maximum_gap_minutes\": 240, \"maximum_window_hours\": 12}, \"evaluate_order\": 4, \"calibration_status\": \"demo\"}, \"changes\": [\"标定状态：demo → pending_field_validation\", \"阈值参数：{consecutive=3, minimum_change_mm=0.015, maximum_gap_minutes=240, maximum_window_hours=12} → {consecutive=3, minimum_change_mm=0.02, maximum_gap_minutes=240}\"]}','127.0.0.1','curl/8.7.1','2026-10-12 19:35:30'),(13,1,'system','update','alert_rule','1','修改预警规则 R1（数据记录差异待核对）：阈值参数：{tolerance_mm=0.05, match_window_minutes=30} → {}','{\"code\": \"R1\", \"after\": {\"name\": \"数据记录差异待核对\", \"enabled\": 1, \"description\": \"同一指标在两条来源记录中的差值超过容差时触发。本条只提示核对原始记录，不构成产品不合格结论。容差与匹配窗口需质量部门按现场口径标定。\", \"params_json\": {}, \"evaluate_order\": 1, \"calibration_status\": \"demo\"}, \"before\": {\"name\": \"数据记录差异待核对\", \"enabled\": 1, \"description\": \"同一指标在两条来源记录中的差值超过容差时触发。本条只提示核对原始记录，不构成产品不合格结论。容差与匹配窗口需质量部门按现场口径标定。\", \"params_json\": {\"tolerance_mm\": 0.05, \"match_window_minutes\": 30}, \"evaluate_order\": 1, \"calibration_status\": \"demo\"}, \"changes\": [\"阈值参数：{tolerance_mm=0.05, match_window_minutes=30} → {}\"]}','127.0.0.1','curl/8.7.1','2026-10-12 19:35:30'),(14,1,'system','create','data_source','7','新增数据来源：LIMS 实验室系统（编码 lims_real，类型 QMS 检验系统）','{\"code\": \"lims_real\", \"name\": \"LIMS 实验室系统\", \"sort_no\": 70, \"description\": \"现场 LIMS 检验数据接口（验收测试）\", \"system_type\": \"qms\", \"is_simulated\": 0}','127.0.0.1','curl/8.7.1','2026-10-12 19:35:34'),(15,1,'system','update','data_source','7','修改数据来源 lims_real（LIMS 实验室系统）：name：LIMS 实验室系统 → LIMS 实验室系统（已联调）；status：enabled → disabled','{\"after\": {\"name\": \"LIMS 实验室系统（已联调）\", \"status\": \"disabled\"}, \"before\": {\"code\": \"lims_real\", \"name\": \"LIMS 实验室系统\", \"status\": \"enabled\", \"sort_no\": 70, \"description\": \"现场 LIMS 检验数据接口（验收测试）\", \"system_type\": \"qms\"}}','127.0.0.1','curl/8.7.1','2026-10-12 19:35:38'),(16,1,'system','delete','data_source','7','删除数据来源：lims_real（LIMS 实验室系统（已联调））',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:35:41'),(17,1,'system','create','sys_user','6','新增用户 qa_test01（验收测试员），角色 1 个，已设置初始密码（首次登录必须修改）','{\"email\": \"qa.test01@ppr.local\", \"phone\": null, \"status\": \"active\", \"roleIds\": [3], \"username\": \"qa_test01\", \"department\": \"质量部\", \"employeeNo\": \"QA9001\", \"displayName\": \"验收测试员\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:35:43'),(18,1,'auth','password_change','sys_user','6','管理员重置账号密码，该账号下次登录须修改密码',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:35:46'),(19,1,'system','update','sys_user','6','修改用户 qa_test01（验收测试员）：display_name：验收测试员 → 验收测试员（已调整）；department：质量部 → 质量管理部；角色：quality_engineer → 已重新分配 2 个角色；重置登录密码：该用户所有登录会话已失效，下次登录必须修改密码','{\"after\": {\"status\": \"active\", \"department\": \"质量管理部\", \"display_name\": \"验收测试员（已调整）\"}, \"before\": {\"email\": \"qa.test01@ppr.local\", \"phone\": null, \"status\": \"active\", \"username\": \"qa_test01\", \"department\": \"质量部\", \"employee_no\": \"QA9001\", \"display_name\": \"验收测试员\"}, \"roleIds\": [3, 6], \"passwordReset\": true}','127.0.0.1','curl/8.7.1','2026-10-12 19:35:46'),(20,1,'diagnosis','create','analysis_run','4','对事件 QE-12121D0032-20261009-001（R3）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 7 条 · 设备读数 44 条 · 参考批次 0 个；快照指纹 d59a3c61e1a320c5',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:23'),(21,1,'eight_d','create','eight_d_report','2','生成 8D 报告 8D-QE-12121D0032-20261009-001-001（事件 QE-12121D0032-20261009-001）',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:25'),(22,1,'eight_d','update','eight_d_report','2','保存 8D 报告 8D-QE-12121D0032-20261009-001-001 草稿',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:41'),(23,1,'eight_d','update','eight_d_report','2','8D 报告 8D-QE-12121D0032-20261009-001-001 定稿',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:48'),(24,1,'eight_d','update','eight_d_report','2','重新打开 8D 报告 8D-QE-12121D0032-20261009-001-001：D6 补充对比批次复测数据后需要更新报告内容。',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:51'),(25,1,'eight_d','update','eight_d_report','2','8D 报告 8D-QE-12121D0032-20261009-001-001 定稿',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:51'),(26,1,'eight_d','create','eight_d_report','3','生成 8D 报告 8D-QE-12121D0029-20261009-001-002（事件 QE-12121D0029-20261009-001）',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:36:54'),(27,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-12 19:39:07'),(28,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-12 19:39:08'),(29,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 3 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-12 19:39:08'),(30,1,'datasource','import','import_job','1','导入成功：生产批次，文件 test_ok_batches.xlsx，写入 2 行。','{\"rows\": 2, \"type\": \"batches\", \"jobCode\": \"IMP-20261012193910-9929\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:39:10'),(31,1,'datasource','import','import_job','2','导入被拒绝：样管抽检记录，文件 test_ok_inspections.xlsx，总 2 行，错误 2 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 3, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「12121D0032」，请先在主数据中登记。\", \"rawValue\": \"12121D0032\"}, {\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「12121D0032」，请先在主数据中登记。\", \"rawValue\": \"12121D0032\"}], \"jobCode\": \"IMP-20261012193913-5002\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:39:13'),(32,1,'datasource','import','import_job','3','导入成功：样管抽检记录，文件 test_ok_inspections.xlsx，写入 2 行。','{\"rows\": 2, \"type\": \"inspections\", \"jobCode\": \"IMP-20261012193927-9305\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:39:27'),(33,1,'datasource','import','import_job','4','导入被拒绝：样管抽检记录，文件 test_bad_inspections.xlsx，总 6 行，错误 4 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"指标编码不存在：「not_a_metric」，请先在主数据中登记。\", \"rawValue\": \"not_a_metric\"}, {\"row\": 5, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「NO_SUCH_BATCH」，请先在主数据中登记。\", \"rawValue\": \"NO_SUCH_BATCH\"}, {\"row\": 6, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标值\", \"message\": \"数值非法：「abc」不是有效数字。\", \"rawValue\": \"abc\"}, {\"row\": 8, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"重复行：记录编号「IMP-BAD-001」的指标「outer_diameter」重复。\", \"rawValue\": \"outer_diameter\"}], \"jobCode\": \"IMP-20261012193935-4691\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:39:35'),(34,1,'datasource','import','import_job','5','导入被拒绝：样管抽检记录，文件 test_bad_inspections.xlsx，总 6 行，错误 5 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"指标编码不存在：「not_a_metric」，请先在主数据中登记。\", \"rawValue\": \"not_a_metric\"}, {\"row\": 5, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「NO_SUCH_BATCH」，请先在主数据中登记。\", \"rawValue\": \"NO_SUCH_BATCH\"}, {\"row\": 6, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标值\", \"message\": \"数值非法：「abc」不是有效数字。\", \"rawValue\": \"abc\"}, {\"row\": 7, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"时间格式非法：「2026/13/45 99:99」超出有效日期时间范围。\", \"rawValue\": \"2026/13/45 99:99\"}, {\"row\": 8, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"重复行：记录编号「IMP-BAD-001」的指标「outer_diameter」重复。\", \"rawValue\": \"outer_diameter\"}], \"jobCode\": \"IMP-20261012194002-5159\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:02'),(35,1,'datasource','import','import_job','6','导入被拒绝：样管抽检记录，文件 test_missing_column.xlsx，总 0 行，错误 1 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 2, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"必填列缺失：批次编号*。请使用系统下载的最新模板。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194005-6966\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:05'),(36,1,'diagnosis','create','analysis_run','6','对事件 QE-12121D0032-20261009-001（R3）执行诊断，生成 2 条结论候选；数据版本：抽检记录 8 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 7 条 · 设备读数 44 条 · 参考批次 0 个；快照指纹 e4adeb0bdf4ab30a',NULL,NULL,NULL,'2026-10-12 19:40:08'),(37,1,'datasource','import','import_job','7','导入成功：产品数据，文件 test_ok_products.xlsx，写入 2 行。','{\"rows\": 2, \"type\": \"products\", \"jobCode\": \"IMP-20261012194040-1504\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:40'),(38,1,'datasource','import','import_job','8','导入成功：设备采集数据，文件 test_ok_readings.xlsx，写入 2 行。','{\"rows\": 2, \"type\": \"readings\", \"jobCode\": \"IMP-20261012194040-0467\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:40'),(39,1,'datasource','import','import_job','9','导入成功：工艺过程记录，文件 test_ok_process.xlsx，写入 2 行。','{\"rows\": 2, \"type\": \"process\", \"jobCode\": \"IMP-20261012194040-0500\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:40'),(40,1,'datasource','import','import_job','10','导入成功：生产事件记录，文件 test_ok_events.xlsx，写入 1 行。','{\"rows\": 1, \"type\": \"production-events\", \"jobCode\": \"IMP-20261012194040-8422\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:40'),(41,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:40:40'),(42,1,'datasource','import','import_job','11','导入被拒绝：生产批次，文件 tpl_batches.xlsx，总 0 行，错误 1 行。','{\"type\": \"batches\", \"errors\": [{\"row\": 3, \"sheet\": \"生产批次\", \"table\": \"production_batch\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194046-2789\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:46'),(43,1,'datasource','import','import_job','12','导入被拒绝：产品数据，文件 tpl_products.xlsx，总 0 行，错误 1 行。','{\"type\": \"products\", \"errors\": [{\"row\": 3, \"sheet\": \"产品数据\", \"table\": \"product_data\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194046-6161\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:46'),(44,1,'datasource','import','import_job','13','导入被拒绝：设备采集数据，文件 tpl_readings.xlsx，总 0 行，错误 1 行。','{\"type\": \"readings\", \"errors\": [{\"row\": 3, \"sheet\": \"设备采集数据\", \"table\": \"equipment_reading\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194046-9893\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:46'),(45,1,'datasource','import','import_job','14','导入被拒绝：样管抽检记录，文件 tpl_inspections.xlsx，总 0 行，错误 1 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 3, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194046-8736\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:46'),(46,1,'datasource','import','import_job','15','导入被拒绝：工艺过程记录，文件 tpl_process.xlsx，总 0 行，错误 1 行。','{\"type\": \"process\", \"errors\": [{\"row\": 3, \"sheet\": \"工艺过程记录\", \"table\": \"process_record\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194046-8691\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:46'),(47,1,'datasource','import','import_job','16','导入被拒绝：生产事件记录，文件 tpl_production-events.xlsx，总 0 行，错误 1 行。','{\"type\": \"production-events\", \"errors\": [{\"row\": 3, \"sheet\": \"生产事件记录\", \"table\": \"production_event\", \"column\": null, \"message\": \"文件中没有可导入的数据行（表头下方为空）。\", \"rawValue\": null}], \"jobCode\": \"IMP-20261012194046-8735\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:40:46'),(48,1,'diagnosis','create','analysis_run','7','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,NULL,NULL,'2026-10-12 19:40:50'),(49,1,'diagnosis','create','analysis_run','8','对事件 QE-12121D0032-20261009-001（R3）执行诊断，生成 2 条结论候选；数据版本：抽检记录 8 条 · 壁厚测点 0 条 · 在线产品数据 3 条 · 工艺记录 8 条 · 设备读数 45 条 · 参考批次 0 个；快照指纹 09a1d40e636c5a85',NULL,NULL,NULL,'2026-10-12 19:40:50'),(50,1,'archive','create','analysis_archive','1','归档事件 QE-VERIFY-ARCHIVE-001（R3），冻结 2 条结论（确认 1 / 否决 1）',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:41:02'),(51,1,'system','update','alert_rule','4','修改预警规则 R4（连续抽检点趋势变化待复核）：标定状态：pending_field_validation → demo；阈值参数：{consecutive=3, minimum_change_mm=0.02, maximum_gap_minutes=240} → {consecutive=3, minimum_change_mm=0.015, maximum_gap_minutes=240}','{\"code\": \"R4\", \"after\": {\"name\": \"连续抽检点趋势变化待复核\", \"enabled\": 1, \"description\": \"同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔与运行连续性满足条件时触发。阈值（连续点数、变化幅度、最大间隔）需按现场节拍标定。\", \"params_json\": {\"consecutive\": 3, \"minimum_change_mm\": 0.015, \"maximum_gap_minutes\": 240}, \"evaluate_order\": 4, \"calibration_status\": \"demo\"}, \"before\": {\"name\": \"连续抽检点趋势变化待复核\", \"enabled\": 1, \"description\": \"同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔与运行连续性满足条件时触发。阈值（连续点数、变化幅度、最大间隔）需按现场节拍标定。\", \"params_json\": {\"consecutive\": 3, \"minimum_change_mm\": 0.02, \"maximum_gap_minutes\": 240}, \"evaluate_order\": 4, \"calibration_status\": \"pending_field_validation\"}, \"changes\": [\"标定状态：pending_field_validation → demo\", \"阈值参数：{consecutive=3, minimum_change_mm=0.02, maximum_gap_minutes=240} → {consecutive=3, minimum_change_mm=0.015, maximum_gap_minutes=240}\"]}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:20'),(52,1,'datasource','import','import_job','17','导入被拒绝：样管抽检记录，文件 test_ok_inspections.xlsx，总 2 行，错误 2 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 3, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"批次 + 抽检时间（12121D0032 / 2026-10-12 08:30:00）的抽检记录已存在，不能重复导入。\", \"rawValue\": \"IMP-IR-001\"}, {\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"批次 + 抽检时间（12121D0032 / 2026-10-12 08:30:00）的抽检记录已存在，不能重复导入。\", \"rawValue\": \"IMP-IR-001\"}], \"jobCode\": \"IMP-20261012194134-8166\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:34'),(53,1,'datasource','import','import_job','18','导入被拒绝：样管抽检记录，文件 test_bad_inspections.xlsx，总 6 行，错误 5 行。','{\"type\": \"inspections\", \"errors\": [{\"row\": 4, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"指标编码不存在：「not_a_metric」，请先在主数据中登记。\", \"rawValue\": \"not_a_metric\"}, {\"row\": 5, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"批次编号\", \"message\": \"批次编号不存在：「NO_SUCH_BATCH」，请先在主数据中登记。\", \"rawValue\": \"NO_SUCH_BATCH\"}, {\"row\": 6, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标值\", \"message\": \"数值非法：「abc」不是有效数字。\", \"rawValue\": \"abc\"}, {\"row\": 7, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"抽检时间\", \"message\": \"时间格式非法：「2026/13/45 99:99」超出有效日期时间范围。\", \"rawValue\": \"2026/13/45 99:99\"}, {\"row\": 8, \"sheet\": \"样管抽检记录\", \"table\": \"inspection_record\", \"column\": \"指标编码\", \"message\": \"重复行：记录编号「IMP-BAD-001」的指标「outer_diameter」重复。\", \"rawValue\": \"outer_diameter\"}], \"jobCode\": \"IMP-20261012194134-6889\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:34'),(54,1,'system','create','data_source','9','新增数据来源：验收探针来源（编码 verify_probe，类型 其它）','{\"code\": \"verify_probe\", \"name\": \"验收探针来源\", \"sort_no\": 999, \"description\": \"临时，验证写链路后删除\", \"system_type\": \"other\", \"is_simulated\": 0}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:37'),(55,1,'system','update','data_source','9','修改数据来源 verify_probe（验收探针来源）：name：验收探针来源 → 验收探针来源（已改名）；status：enabled → disabled','{\"after\": {\"name\": \"验收探针来源（已改名）\", \"status\": \"disabled\"}, \"before\": {\"code\": \"verify_probe\", \"name\": \"验收探针来源\", \"status\": \"enabled\", \"sort_no\": 999, \"description\": \"临时，验证写链路后删除\", \"system_type\": \"other\"}}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:37'),(56,1,'system','delete','data_source','9','删除数据来源：verify_probe（验收探针来源（已改名））',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:41:37'),(57,1,'datasource','import','import_job','19','导入成功：样管抽检记录，文件 test_ok_inspections2.xlsx，写入 2 行。','{\"rows\": 2, \"type\": \"inspections\", \"jobCode\": \"IMP-20261012194141-3549\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:41'),(58,1,'system','create','sys_user','7','新增用户 verify_probe（验收探针），角色 1 个，已设置初始密码（首次登录必须修改）','{\"email\": \"verify@ppr.local\", \"phone\": null, \"status\": \"active\", \"roleIds\": [3], \"username\": \"verify_probe\", \"department\": \"质量部\", \"employeeNo\": \"VP9001\", \"displayName\": \"验收探针\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:42'),(59,1,'system','create','sys_user','8','新增用户 verify_probe2（验收探针二），角色 1 个，已设置初始密码（首次登录必须修改）','{\"email\": \"verify2@ppr.local\", \"phone\": null, \"status\": \"active\", \"roleIds\": [3], \"username\": \"verify_probe2\", \"department\": \"质量部\", \"employeeNo\": \"VP9002\", \"displayName\": \"验收探针二\"}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:47'),(60,1,'auth','password_change','sys_user','8','管理员重置账号密码，该账号下次登录须修改密码',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:41:47'),(61,1,'system','update','sys_user','8','修改用户 verify_probe2（验收探针二）：角色：quality_engineer → 已重新分配 2 个角色；重置登录密码：该用户所有登录会话已失效，下次登录必须修改密码','{\"after\": {}, \"before\": {\"email\": \"verify2@ppr.local\", \"phone\": null, \"status\": \"active\", \"username\": \"verify_probe2\", \"department\": \"质量部\", \"employee_no\": \"VP9002\", \"display_name\": \"验收探针二\"}, \"roleIds\": [3, 6], \"passwordReset\": true}','127.0.0.1','curl/8.7.1','2026-10-12 19:41:47'),(62,1,'diagnosis','create','analysis_run','10','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:41:49'),(63,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:41:57'),(64,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-12 19:45:33'),(65,1,'diagnosis','create','analysis_run','11','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','node','2026-10-12 19:45:33'),(66,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-12 19:45:33'),(67,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-12 19:45:33'),(68,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 19:49:19'),(69,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-12 19:55:19'),(70,1,'diagnosis','create','analysis_run','12','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','node','2026-10-12 19:55:21'),(71,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-12 19:55:22'),(72,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-12 19:55:22'),(73,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-12 19:59:22'),(74,1,'diagnosis','create','analysis_run','13','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','node','2026-10-12 19:59:23'),(75,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-12 19:59:23'),(76,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-12 19:59:23'),(80,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-12 20:10:17'),(81,1,'diagnosis','create','analysis_run','15','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','node','2026-10-12 20:10:18'),(82,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-12 20:10:18'),(83,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-12 20:10:18'),(84,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-12 20:12:09'),(85,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-13 03:45:25'),(86,1,'diagnosis','create','analysis_run','16','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','node','2026-10-13 03:45:25'),(87,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-13 03:45:25'),(88,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-13 03:45:25'),(89,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-13 08:30:21'),(90,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','node','2026-10-13 08:30:28'),(91,1,'diagnosis','create','analysis_run','17','对事件 QE-12121D0029-20261009-001（R1）执行诊断，生成 2 条结论候选；数据版本：抽检记录 7 条 · 壁厚测点 0 条 · 在线产品数据 2 条 · 工艺记录 0 条 · 设备读数 44 条 · 参考批次 2 个；快照指纹 e17b466899bacae1',NULL,'127.0.0.1','node','2026-10-13 08:30:30'),(92,1,'eight_d','update','eight_d_report','3','保存 8D 报告 8D-QE-12121D0029-20261009-001-002 草稿',NULL,'127.0.0.1','node','2026-10-13 08:30:30'),(93,1,'notification','notify','notification','1','生成预警通知 NT-QE-12121D0029-20261009-001-001，收件人 2 人；投递结果：cancelled',NULL,'127.0.0.1','node','2026-10-13 08:30:30'),(94,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-13 08:33:30'),(95,1,'auth','login_failed','sys_user','admin','密码不正确',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0','2026-10-13 08:33:51'),(96,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0','2026-10-13 08:34:00'),(97,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-13 08:38:23'),(98,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:39:33'),(99,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:39:48'),(100,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:40:06'),(101,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:41:50'),(102,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:44:23'),(103,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:44:55'),(104,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:45:06'),(105,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:45:21'),(106,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:46:06'),(107,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:46:26'),(108,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:47:17'),(109,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:49:18'),(110,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:49:34'),(111,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:49:43'),(112,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:50:07'),(113,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','curl/8.7.1','2026-10-13 08:58:40'),(114,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 08:59:39'),(115,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 09:00:09'),(116,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 09:00:34'),(117,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 09:01:01'),(118,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 09:03:09'),(119,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 09:03:38'),(120,1,'auth','login','sys_user','admin','系统管理员 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36','2026-10-13 09:04:07'),(121,1,'system','update','sys_user','2','修改用户 qe_zhang（张工）：无字段变化','{\"after\": {\"email\": \"zhang.quality@ppr.local\", \"phone\": null, \"status\": \"active\", \"department\": \"质量管理部\", \"employee_no\": \"EMP0002\", \"display_name\": \"张工\"}, \"before\": {\"email\": \"zhang.quality@ppr.local\", \"phone\": null, \"status\": \"active\", \"username\": \"qe_zhang\", \"department\": \"质量管理部\", \"employee_no\": \"EMP0002\", \"display_name\": \"张工\"}, \"roleIds\": [3], \"passwordReset\": false}','127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0','2026-10-13 09:12:28'),(122,1,'auth','password_change','sys_user','2','管理员重置账号密码，该账号下次登录须修改密码',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0','2026-10-13 09:13:26'),(123,1,'system','update','sys_user','2','修改用户 qe_zhang（张工）：重置登录密码：该用户所有登录会话已失效，下次登录必须修改密码','{\"after\": {}, \"before\": {\"email\": \"zhang.quality@ppr.local\", \"phone\": null, \"status\": \"active\", \"username\": \"qe_zhang\", \"department\": \"质量管理部\", \"employee_no\": \"EMP0002\", \"display_name\": \"张工\"}, \"roleIds\": null, \"passwordReset\": true}','127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0','2026-10-13 09:13:26'),(124,2,'auth','login','sys_user','qe_zhang','张工 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','2026-10-13 09:13:32'),(125,2,'auth','login','sys_user','qe_zhang','张工 登录成功',NULL,'127.0.0.1','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0','2026-10-13 09:14:54');
/*!40000 ALTER TABLE `operation_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_alert_event`
--

DROP TABLE IF EXISTS `ppr_alert_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_alert_event` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `event_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '预警事件编号，全局唯一',
  `measurement_id` bigint unsigned NOT NULL COMMENT '触发预警的产品检验记录ID',
  `metric_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发指标编码',
  `risk_level` enum('normal','medium','high','error') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '风险级别：正常、中风险、高风险、数据错误',
  `rule_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发规则编码',
  `rule_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发规则名称',
  `observed_value` decimal(12,4) DEFAULT NULL COMMENT '触发时的观测值',
  `threshold_text` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '触发阈值文本快照',
  `status` enum('open','analyzing','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open' COMMENT '事件状态：待分析、分析中、已关闭',
  `source` enum('engine','legacy') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'engine' COMMENT '事件来源：engine=判定引擎生成，legacy=历史演示或人工遗留',
  `notified_level` enum('medium','high') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '已推送到企业微信的最高风险级别，NULL=未推送；用于重算时避免重复告警',
  `notified_at` datetime DEFAULT NULL COMMENT '最近一次企业微信推送时间',
  `detected_at` datetime NOT NULL COMMENT '预警识别时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_alert_event_no` (`event_no`),
  UNIQUE KEY `uk_ppr_alert_measurement_metric_rule` (`measurement_id`,`metric_code`,`rule_code`),
  KEY `idx_ppr_alert_status_time` (`status`,`detected_at`),
  CONSTRAINT `fk_ppr_alert_measurement` FOREIGN KEY (`measurement_id`) REFERENCES `ppr_product_measurement` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=754 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR质量监控预警事件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_alert_event`
--

LOCK TABLES `ppr_alert_event` WRITE;
/*!40000 ALTER TABLE `ppr_alert_event` DISABLE KEYS */;
INSERT INTO `ppr_alert_event` VALUES (718,'QE-20261116-295OD',295,'outer_diameter','normal','R0','在标准区间内',25.2450,'25.000 mm–25.500 mm，实测 25.245 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 08:15:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(719,'QE-20261116-295WT',295,'min_wall_thickness','normal','R0','在标准区间内',4.4200,'4.200 mm–4.800 mm，实测 4.420 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 08:15:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(720,'QE-20261116-295OV',295,'ovality','normal','R0','在标准区间内',0.2150,'0.000 mm–0.350 mm，实测 0.215 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 08:15:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(721,'QE-20261116-296OD',296,'outer_diameter','normal','R0','在标准区间内',25.2350,'25.000 mm–25.500 mm，实测 25.235 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 09:20:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(722,'QE-20261116-296WT',296,'min_wall_thickness','normal','R0','在标准区间内',4.4050,'4.200 mm–4.800 mm，实测 4.405 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 09:20:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(723,'QE-20261116-296OV',296,'ovality','normal','R0','在标准区间内',0.2250,'0.000 mm–0.350 mm，实测 0.225 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 09:20:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(724,'QE-20261116-297OD',297,'outer_diameter','normal','R0','在标准区间内',25.2550,'25.000 mm–25.500 mm，实测 25.255 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 10:25:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(725,'QE-20261116-297WT',297,'min_wall_thickness','normal','R0','在标准区间内',4.4300,'4.200 mm–4.800 mm，实测 4.430 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 10:25:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(726,'QE-20261116-297OV',297,'ovality','normal','R0','在标准区间内',0.2050,'0.000 mm–0.350 mm，实测 0.205 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 10:25:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(727,'QE-20261116-298OD',298,'outer_diameter','normal','R0','在标准区间内',25.2400,'25.000 mm–25.500 mm，实测 25.240 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 11:30:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(728,'QE-20261116-298WT',298,'min_wall_thickness','normal','R0','在标准区间内',4.3950,'4.200 mm–4.800 mm，实测 4.395 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 11:30:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(729,'QE-20261116-298OV',298,'ovality','normal','R0','在标准区间内',0.2300,'0.000 mm–0.350 mm，实测 0.230 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 11:30:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(730,'QE-20261116-299OD',299,'outer_diameter','normal','R0','在标准区间内',25.2500,'25.000 mm–25.500 mm，实测 25.250 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 12:35:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(731,'QE-20261116-299WT',299,'min_wall_thickness','normal','R0','在标准区间内',4.4150,'4.200 mm–4.800 mm，实测 4.415 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 12:35:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(732,'QE-20261116-299OV',299,'ovality','normal','R0','在标准区间内',0.2200,'0.000 mm–0.350 mm，实测 0.220 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 12:35:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(733,'QE-20261116-300OD',300,'outer_diameter','normal','R0','在标准区间内',25.2300,'25.000 mm–25.500 mm，实测 25.230 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 13:40:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(734,'QE-20261116-300WT',300,'min_wall_thickness','normal','R0','在标准区间内',4.4000,'4.200 mm–4.800 mm，实测 4.400 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 13:40:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(735,'QE-20261116-300OV',300,'ovality','normal','R0','在标准区间内',0.2100,'0.000 mm–0.350 mm，实测 0.210 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-16 13:40:00','2026-10-14 09:26:34','2026-10-14 09:26:34'),(736,'QE-20261117-301OD',301,'outer_diameter','normal','R0','在标准区间内',25.2400,'25.000 mm–25.500 mm，实测 25.240 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 08:15:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(737,'QE-20261117-301WT',301,'min_wall_thickness','normal','R0','在标准区间内',4.3200,'4.200 mm–4.800 mm，实测 4.320 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 08:15:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(738,'QE-20261117-301OV',301,'ovality','normal','R0','在标准区间内',0.2200,'0.000 mm–0.350 mm，实测 0.220 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 08:15:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(739,'QE-20261117-302OD',302,'outer_diameter','normal','R0','在标准区间内',25.2350,'25.000 mm–25.500 mm，实测 25.235 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 09:20:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(740,'QE-20261117-302WT',302,'min_wall_thickness','normal','R0','在标准区间内',4.2850,'4.200 mm–4.800 mm，实测 4.285 mm，已进入接近带但未连续 3 点','closed','engine',NULL,NULL,'2026-11-17 09:20:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(741,'QE-20261117-302OV',302,'ovality','normal','R0','在标准区间内',0.2150,'0.000 mm–0.350 mm，实测 0.215 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 09:20:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(742,'QE-20261117-303OD',303,'outer_diameter','normal','R0','在标准区间内',25.2500,'25.000 mm–25.500 mm，实测 25.250 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 10:25:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(743,'QE-20261117-303WT',303,'min_wall_thickness','normal','R0','在标准区间内',4.2700,'4.200 mm–4.800 mm，实测 4.270 mm，已进入接近带但未连续 3 点','closed','engine',NULL,NULL,'2026-11-17 10:25:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(744,'QE-20261117-303OV',303,'ovality','normal','R0','在标准区间内',0.2250,'0.000 mm–0.350 mm，实测 0.225 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 10:25:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(745,'QE-20261117-304OD',304,'outer_diameter','normal','R0','在标准区间内',25.2450,'25.000 mm–25.500 mm，实测 25.245 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 11:30:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(746,'QE-20261117-304WT',304,'min_wall_thickness','medium','R5','连续3点接近区间边界',4.2550,'4.200 mm–4.800 mm，连续 3 点进入接近带（距下限 ≤ 0.090 mm，为区间宽度的 15%）：4.285 / 4.270 / 4.255','analyzing','engine',NULL,NULL,'2026-11-17 11:30:00','2026-10-14 09:26:53','2026-10-14 10:13:28'),(747,'QE-20261117-304OV',304,'ovality','normal','R0','在标准区间内',0.2100,'0.000 mm–0.350 mm，实测 0.210 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 11:30:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(748,'QE-20261117-305OD',305,'outer_diameter','normal','R0','在标准区间内',25.2380,'25.000 mm–25.500 mm，实测 25.238 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 12:35:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(749,'QE-20261117-305WT',305,'min_wall_thickness','normal','R0','在标准区间内',4.3600,'4.200 mm–4.800 mm，实测 4.360 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 12:35:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(750,'QE-20261117-305OV',305,'ovality','normal','R0','在标准区间内',0.2200,'0.000 mm–0.350 mm，实测 0.220 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 12:35:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(751,'QE-20261117-306OD',306,'outer_diameter','normal','R0','在标准区间内',25.2520,'25.000 mm–25.500 mm，实测 25.252 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 13:40:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(752,'QE-20261117-306WT',306,'min_wall_thickness','normal','R0','在标准区间内',4.4000,'4.200 mm–4.800 mm，实测 4.400 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 13:40:00','2026-10-14 09:26:53','2026-10-14 09:26:53'),(753,'QE-20261117-306OV',306,'ovality','normal','R0','在标准区间内',0.2150,'0.000 mm–0.350 mm，实测 0.215 mm，未进入接近带','closed','engine',NULL,NULL,'2026-11-17 13:40:00','2026-10-14 09:26:53','2026-10-14 09:26:53');
/*!40000 ALTER TABLE `ppr_alert_event` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_analysis_conclusion`
--

DROP TABLE IF EXISTS `ppr_analysis_conclusion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_analysis_conclusion` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `analysis_id` bigint unsigned NOT NULL COMMENT '所属分析任务ID',
  `sort_no` int NOT NULL DEFAULT '0' COMMENT '同一分析内展示顺序',
  `category` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '结论类别，如限值对照、趋势观察、相关因素变化',
  `hypothesis` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '待验证结论或假设内容',
  `evidence` text COLLATE utf8mb4_unicode_ci COMMENT '支持证据说明',
  `missing_evidence` text COLLATE utf8mb4_unicode_ci COMMENT '缺失证据说明',
  `validation_action` text COLLATE utf8mb4_unicode_ci COMMENT '建议验证动作',
  `confidence` decimal(5,4) DEFAULT NULL COMMENT '证据完备度置信分，0到1，不代表根因概率',
  `evidence_source_ids` json DEFAULT NULL COMMENT '本结论引用的产品、设备或事件业务编号',
  `generated_by_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '生成本结论的模型名称，规则模式为空',
  `engineer_modified` tinyint(1) NOT NULL DEFAULT '0' COMMENT '工程师是否修改或补充过本结论',
  `engineer_decision` enum('pending','confirmed','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '工程师判定：待处理、已确认、已驳回',
  `engineer_comment` text COLLATE utf8mb4_unicode_ci COMMENT '工程师意见',
  `actual_finding` text COLLATE utf8mb4_unicode_ci COMMENT '现场验证实际发现',
  `updated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最近更新人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_ppr_conclusion_analysis` (`analysis_id`,`sort_no`),
  CONSTRAINT `fk_ppr_conclusion_analysis` FOREIGN KEY (`analysis_id`) REFERENCES `ppr_analysis_run` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR异常诊断结论与工程师验证';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_analysis_conclusion`
--

LOCK TABLES `ppr_analysis_conclusion` WRITE;
/*!40000 ALTER TABLE `ppr_analysis_conclusion` DISABLE KEYS */;
INSERT INTO `ppr_analysis_conclusion` VALUES (87,21,1,'测量/数据有效性','当前 min_wall_thickness 的接近带触发可能部分由测量/取样口径因素贡献，而非全部为真实壁厚下降；需先确认最薄点定义、测厚量具、测量截面与测量温度，再谈工艺归因。','支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，且影响因素列出挤出量、牵引速度、模具偏心、原料波动（get_metric_definition，metric_code=min_wall_thickness）；事件记录的 data_source=MES_IMPORT（记录 304 / IR-20261117-004），为导入数据。反向或不支持证据：四点记录的最大与最小外径差稳定在 0.21–0.22 mm、不圆度 0.205–0.225 mm 均远小于 0.350 mm 上限，且 max/min 壁厚跨度稳定约 0.11 mm，形态上更像真实整体厚度水平变化而非量测跳变；三连点单调下降具有趋势一致性。','最薄点的周向角度/截面位置与测点数、测厚量具型号与校准状态、测量温度与样管状态调节时间、是否同一测点重复测量、原始 MES 导入前的检验记录与抽检频次。','预期伴随信号：若为测量问题，应在相同样管复测或不同量具复测时出现点间差大于工艺可能的 0.005–0.015 mm/点的离散；若为真实趋势，复测应复现 4.28→4.26 量级并保持最薄点位置一致。验证动作：由检验人员在受控条件下对留存样管按同一截面与量具复测，并回溯原始检验单与量具校准记录，记录最薄点角度。',0.4500,'[\"304\", \"303\", \"302\", \"301\"]','deepseek-v4-flash',1,'pending',NULL,NULL,'质量工程师','2026-10-14 09:31:26','2026-10-14 09:42:46'),(88,21,2,'异常形态与三层对照','当前事件形态为“min 与 max 壁厚同向单调下降、壁厚跨度与不圆度基本不变”，属于整体壁厚水平下移（相对供料/牵伸/定径冻结状态变化），而非以偏心为主的最薄点单独恶化。','支持证据：同批次序列 min 壁厚 4.320→4.285→4.270→4.255 mm，max 壁厚 4.430→4.395→4.380→4.365 mm，两者同步下降且跨度 0.110→0.115 mm 稳定（记录 301/302/303/304）；外径 25.240→25.235→25.250→25.245 mm、min/max 外径差与不圆度均无明显趋势；三层对照：规格限 4.200–4.800 mm，最新点仍在内但距下限仅 0.055 mm；同规格正常参考（前一批次 12121D0050）6 点 min 壁厚 4.395–4.430 mm（记录 295–300），当前低约 0.14–0.17 mm。反向或不支持证据：参考批次为 12121D0050 甲班，跨批次且未证明同产线、同口模/定径套、同层结构、同配方、同测量方法，不能作为控制限；当前无周向壁厚点位数据，不能排除偏心叠加。','周向多点壁厚分布（尤其最薄点与最厚点角度）、同批次更早（点1 之前）的历史序列与班次切换记录、参考批次的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。','预期伴随信号：若为整体壁厚下移，沿周长多点平均值同步下降且最薄点角度不变；若为偏心，则最薄点固定角度处下降幅显著大于其他点而平均厚度变化较小。验证动作：在受控条件下对留存样管实施周向多点（≥4 点）壁厚测量并与前一批次比对，同时核对同规格参考批次的生产线、口模/定径套与配方信息以决定参考权重。',0.6000,'[\"301\", \"302\", \"303\", \"304\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\"]','deepseek-v4-flash',1,'pending',NULL,NULL,'质量工程师','2026-10-14 09:31:26','2026-10-14 09:42:47'),(89,21,3,'设备/生产机理（牵伸—供料关系）','待验证：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、纵向取向与壁厚减薄，从而使 min 与 max 壁厚同步下降；该方向与牵引速度缓升、压力缓升的同期记录一致，但尚未完成生产时间对齐，不能作为因果确认。','支持证据：异常检验时段内 1 号牵引机速度 8.214→8.222→8.231→8.246 m/min 逐小时缓升（记录 366/367/368/369）；1 号挤出机压力 12.584→12.624→12.666→12.719 MPa 同向缓升、温度 204.91→204.46 ℃ 缓降（记录 390–393）；检验时刻 11:30 与 11:00 设备记录相邻。反向或不支持证据：外径未随壁厚下降而同步变小（25.235→25.250→25.245 mm），若单纯牵伸显著增大通常会伴随外径或周长收缩，说明定径/冷却冻结或供料侧存在补偿；压力上升也可解释为黏度升高或流道阻力增大而非产量增加，现有工具未提供可核对的反向证据。','线速度与螺杆转速/进料量的配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间与检验时间的对齐换算、口模/定径套与真空设定。','预期伴随信号：若牵伸相对供料上升，应见单位长度米重下降、同长度段产量下降或螺杆转速不变而牵引速度上升；若为黏度/阻力上升，则压力升高的同时熔体温度或机头压差有相应变化而米重变化较小。验证动作：在受控条件下按长度码/生产时间抽取对应段样管同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照，严禁直接调机。',0.3500,'[\"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\", \"301\", \"302\", \"303\", \"304\"]','deepseek-v4-flash',1,'confirmed','现场核对牵引速度设定与反馈记录，异常时段反馈值由 12.4 m/min 升至 12.9 m/min，与壁厚整体下移方向一致。','调阅 1 号牵引机运行记录：异常时段前后牵引反馈上升约 0.5 m/min，螺杆转速与机头压力未见明显变化；样管复测壁厚 3 点均为 4.26/4.27/4.25 mm，复现性良好。','质量工程师','2026-10-14 09:31:26','2026-10-14 09:38:36'),(90,21,4,'设备/生产机理（定径—冷却—离模行为）','待验证：外径保持稳定而壁厚整体下移，可用真空定径与冷却冻结强度相对变化（定径约束补偿了牵伸引起的收缩）或机头/口模出口状态变化解释；现有工具无真空、冷却与口模数据，该假设暂不能与牵伸假设区分。','支持证据：外径 25.235→25.250→25.245 mm 稳定且位于 25.000–25.500 mm 区间中部，不圆度 0.205–0.225 mm 稳定，说明外形成型约束充分；而壁厚同步减薄提示内表面/壁厚方向由供料—牵伸—冻结关系决定（记录 301–304）。反向或不支持证据：现有工具未提供真空度、定径水温/流量、喷淋分布、口模间隙、熔体温度与离模膨胀（get_equipment_window 仅有挤出机温度/压力与牵引速度），无法判断定径能力是否变化；也无证据表明定径异常，故不支持将其列为已确认机制。','真空定径设定与实测值、定径套规格与磨损状态、冷却水温与流量、口模/芯模间隙与同心度记录、真实熔体温度与熔体压力位置、开机与换网/换料时间点。','预期伴随信号：若定径或冷却能力变化，应见真空度、定径水温波动或口模出口状态与换网时间相关联，且外形（不圆度、外径）出现同步微变；若仅是牵伸—供料关系，则定径参数应保持稳定。验证动作：调取同期真空、冷却与口模维护记录并与检验时刻对齐，仅在受控工艺窗口内做单一变量评估，任何调整须按现场流程批准。',0.2500,'[\"301\", \"302\", \"303\", \"304\", \"390\", \"391\", \"392\", \"393\"]','deepseek-v4-flash',1,'pending',NULL,NULL,'质量工程师','2026-10-14 09:31:26','2026-10-14 09:42:47'),(91,21,5,'材料机理','待验证：原料流动性/黏度或组分（牌号、母料、填料、降解程度）变化导致挤出量与离模牵伸平衡偏移，从而引起壁厚整体下降；只有在确认外因无法解释且存在换料或批次线索时才应提高其优先级。','支持证据：本批次号 12121D0051 与参考批次 12121D0050 不同，且班次由甲班切换为乙班，存在物料/批次或班次变更的弱线索；压力同期缓升而温度缓降，方向上可与黏度升高或流道阻力变化相容（记录 390–397、304）。反向或不支持证据：现有工具未提供任何原料批次、换料记录、MFR、密度、灰分或降解检测数据，也无米重数据；压力缓升同样可由滤网/流道阻力、温度下降或产量变化解释，因此不能把材料变化作为当前证据支持的根因。','本批次与上一批次原料牌号/供应商/批号、换料时间与过渡长度、MFR 与熔体流动对比、DSC 熔融结晶数据、密度与灰分/TGA、外观与炭黑/污染记录。','预期伴随信号：若为材料流动性变化，应见同工艺条件下的机头压力与米重关系整体平移，且换料前后出现阶跃；若为降解，应见 MFR 异常、色差/气味或模口析出。验证动作：先核对换料与批次切换时间及过渡段取样记录，再按假设选择 MFR 与 DSC（必要时密度/灰分、FTIR）对比留样，避免无差别全套检测。',0.2000,'[\"304\", \"303\", \"302\", \"301\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\", \"390\", \"393\"]','deepseek-v4-flash',1,'rejected','本批次未发生换料或牌号切换，原料入库检验 MFR 与上批一致，缺少支撑材料变化的证据，先予排除。','核对原料批次台账：本批次使用原料批号与上一批次相同，无换料记录。','质量工程师','2026-10-14 09:31:26','2026-10-14 09:38:36'),(92,21,6,'时间对齐','待验证：现有设备记录（1 号挤出机、1 号牵引机逐小时点）与检验样管之间是否存在一一对应关系尚未建立，因此上述参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。','支持证据：检验记录 inspect_time 为 09:20/10:25/11:30/12:35 系列（记录 301–304），设备记录 collect_time 为整点 08:00–15:00（记录 366–373、390–397），两者时间尺度接近但不重合；工具未返回长度码、线速度对应产量、设备到检验点距离或检测延迟。反向或不支持证据：现有工具未提供可核对的反向证据，但也无任何字段能证明对齐成立。','线速度与设备出口到测径/取样的距离、生产时间戳或长度码打标、检测延迟与样管取样位置、设备时钟与 MES 时钟一致性核对记录。','预期伴随信号：若完成对齐，壁厚最薄段应能与某一段螺杆转速/牵引速度记录稳定配对并在重复取样中复现；若无法配对，则应见参数变化与样管指标无稳定对应。验证动作：依据长度码或生产时间戳抽取指定段样管，与同段设备曲线比对；在完成对齐前，所有参数—指标关系仅作为待验证线索记录。',0.5000,'[\"301\", \"302\", \"303\", \"304\", \"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\"]','deepseek-v4-flash',1,'pending',NULL,NULL,'质量工程师','2026-10-14 09:31:26','2026-10-14 09:42:47');
/*!40000 ALTER TABLE `ppr_analysis_conclusion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_analysis_run`
--

DROP TABLE IF EXISTS `ppr_analysis_run`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_analysis_run` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `run_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分析任务编号，全局唯一',
  `alert_id` bigint unsigned NOT NULL COMMENT '关联预警事件ID',
  `status` enum('generated','reviewing','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generated' COMMENT '分析状态：已生成、复核中、已完成',
  `summary` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分析摘要',
  `evidence_snapshot` json DEFAULT NULL COMMENT '生成时使用的产品、设备、限值和趋势证据快照',
  `engine_type` enum('rule','agent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rule' COMMENT '分析引擎：规则引擎或LangChain Agent',
  `model_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Agent模式实际使用的模型名称',
  `prompt_version` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则模板或Agent提示词版本',
  `agent_version` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Agent编排实现版本',
  `tool_trace_json` json DEFAULT NULL COMMENT 'Agent工具调用轨迹及返回证据',
  `token_usage_json` json DEFAULT NULL COMMENT '模型Token使用统计',
  `raw_response_json` json DEFAULT NULL COMMENT '模型原始消息的可审计快照',
  `latency_ms` int unsigned DEFAULT NULL COMMENT '本次分析总耗时，单位毫秒',
  `fallback_reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Agent降级到规则引擎的原因',
  `generated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '分析发起人名称或账号',
  `generated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '分析生成时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_analysis_run_no` (`run_no`),
  KEY `idx_ppr_analysis_alert` (`alert_id`),
  CONSTRAINT `fk_ppr_analysis_alert` FOREIGN KEY (`alert_id`) REFERENCES `ppr_alert_event` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR异常诊断分析任务';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_analysis_run`
--

LOCK TABLES `ppr_analysis_run` WRITE;
/*!40000 ALTER TABLE `ppr_analysis_run` DISABLE KEYS */;
INSERT INTO `ppr_analysis_run` VALUES (21,'AN-20261014093126-YMY5',746,'reviewing','事件 QE-20261117-304WT（批次 12121D0051，PPR S2.5 25×4.2 瓷芯管，乙班）由 R5“连续3点接近区间边界”触发，min_wall_thickness 依次为 4.285→4.270→4.255 mm（点1 4.320 尚未进入接近带），下限 4.200 mm，最新点距下限 0.055 mm 且仍在内。形态特征：最小壁厚逐点单调下降约 0.065 mm/3 点，而代表外径（25.235→25.250→25.245）、最大外径、min/max 外径差（约 0.21 mm）、不圆度（0.205–0.225，上限 0.350）基本平稳；max_wall_thickness 同步下降 4.395→4.380→4.365，即最薄点与最厚点同向变薄、壁厚跨度约 0.11–0.115 mm 基本不变，提示整体壁厚水平下移而非偏心加剧。前一批次 12121D0050（甲班）同规格 6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm，为跨批次弱参考（产线、口模/定径套、配方、测量方法未确认）。最有区分度的设备事实：异常时刻前后挤出机温度 204.91→204.46 ℃、压力 12.584→12.719 MPa 缓慢同向变化，牵引速度 8.214→8.246 m/min 缓慢上升，三者与壁厚下降在小时尺度上同向，符合“牵引相对挤出量略升”和/或“黏度/流动阻力变化”方向，但未做生产时间—长度码—检测延迟对齐，不能称为该样管对应参数或因果证据。当前优先验证路径：①产品质量/测量侧自洽性复核（最薄点位置、量具、截面、测量温度、调节时间）；②供料量—线速度关系及壁厚周向分布（区分整体壁厚下移与偏心）；③真空定径、冷却与离模牵伸的能力变化。现有工具无真空、冷却、米重/质量挤出量、螺杆转速、原料批次与材料检测数据，不得据此判定最终根因或给出调机数值。','{\"alert\": {\"id\": 746, \"source\": \"engine\", \"status\": \"open\", \"spec_id\": 1, \"batch_no\": \"12121D0051\", \"event_no\": \"QE-20261117-304WT\", \"record_no\": \"IR-20261117-004\", \"rule_code\": \"R5\", \"rule_name\": \"连续3点接近区间边界\", \"sample_no\": \"S-513\", \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"created_at\": \"2026-10-14T09:26:53.000Z\", \"ovality_mm\": \"0.210\", \"risk_level\": \"medium\", \"updated_at\": \"2026-10-14T09:26:53.000Z\", \"data_source\": \"MES_IMPORT\", \"detected_at\": \"2026-11-17T11:30:00.000Z\", \"metric_code\": \"min_wall_thickness\", \"notified_at\": null, \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"wall_lower_mm\": \"4.200\", \"wall_upper_mm\": \"4.800\", \"measurement_id\": 304, \"notified_level\": null, \"observed_value\": \"4.2550\", \"outer_lower_mm\": \"25.000\", \"outer_upper_mm\": \"25.500\", \"threshold_text\": \"4.200 mm–4.800 mm，连续 3 点进入接近带（距下限 ≤ 0.090 mm，为区间宽度的 15%）：4.285 / 4.270 / 4.255\", \"ovality_upper_mm\": \"0.350\", \"production_group\": \"乙班\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, \"toolEvidence\": [{\"tool\": \"get_alert_context\", \"input\": {}, \"output\": {\"id\": 746, \"source\": \"engine\", \"status\": \"open\", \"spec_id\": 1, \"batch_no\": \"12121D0051\", \"event_no\": \"QE-20261117-304WT\", \"record_no\": \"IR-20261117-004\", \"rule_code\": \"R5\", \"rule_name\": \"连续3点接近区间边界\", \"sample_no\": \"S-513\", \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"created_at\": \"2026-10-14T09:26:53.000Z\", \"ovality_mm\": \"0.210\", \"risk_level\": \"medium\", \"updated_at\": \"2026-10-14T09:26:53.000Z\", \"data_source\": \"MES_IMPORT\", \"detected_at\": \"2026-11-17T11:30:00.000Z\", \"metric_code\": \"min_wall_thickness\", \"notified_at\": null, \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"wall_lower_mm\": \"4.200\", \"wall_upper_mm\": \"4.800\", \"measurement_id\": 304, \"notified_level\": null, \"observed_value\": \"4.2550\", \"outer_lower_mm\": \"25.000\", \"outer_upper_mm\": \"25.500\", \"threshold_text\": \"4.200 mm–4.800 mm，连续 3 点进入接近带（距下限 ≤ 0.090 mm，为区间宽度的 15%）：4.285 / 4.270 / 4.255\", \"ovality_upper_mm\": \"0.350\", \"production_group\": \"乙班\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, \"startedAt\": \"2026-10-14T09:30:59.483Z\", \"durationMs\": 1}, {\"tool\": \"get_reference_measurements\", \"input\": {\"limit\": 20}, \"output\": [{\"id\": 300, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-006\", \"ovality_mm\": \"0.210\", \"inspect_time\": \"2026-11-16T13:40:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.230\", \"max_outer_diameter_mm\": \"25.370\", \"max_wall_thickness_mm\": \"4.510\", \"min_outer_diameter_mm\": \"25.160\", \"min_wall_thickness_mm\": \"4.400\"}, {\"id\": 299, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-005\", \"ovality_mm\": \"0.220\", \"inspect_time\": \"2026-11-16T12:35:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.250\", \"max_outer_diameter_mm\": \"25.397\", \"max_wall_thickness_mm\": \"4.525\", \"min_outer_diameter_mm\": \"25.177\", \"min_wall_thickness_mm\": \"4.415\"}, {\"id\": 298, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-004\", \"ovality_mm\": \"0.230\", \"inspect_time\": \"2026-11-16T11:30:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.240\", \"max_outer_diameter_mm\": \"25.393\", \"max_wall_thickness_mm\": \"4.505\", \"min_outer_diameter_mm\": \"25.163\", \"min_wall_thickness_mm\": \"4.395\"}, {\"id\": 297, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-003\", \"ovality_mm\": \"0.205\", \"inspect_time\": \"2026-11-16T10:25:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.255\", \"max_outer_diameter_mm\": \"25.392\", \"max_wall_thickness_mm\": \"4.540\", \"min_outer_diameter_mm\": \"25.187\", \"min_wall_thickness_mm\": \"4.430\"}, {\"id\": 296, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-002\", \"ovality_mm\": \"0.225\", \"inspect_time\": \"2026-11-16T09:20:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.235\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.515\", \"min_outer_diameter_mm\": \"25.160\", \"min_wall_thickness_mm\": \"4.405\"}, {\"id\": 295, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-001\", \"ovality_mm\": \"0.215\", \"inspect_time\": \"2026-11-16T08:15:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.388\", \"max_wall_thickness_mm\": \"4.530\", \"min_outer_diameter_mm\": \"25.173\", \"min_wall_thickness_mm\": \"4.420\"}], \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 3}, {\"tool\": \"get_batch_measurements\", \"input\": {\"limit\": 15}, \"output\": [{\"id\": 304, \"remark\": \"点4 壁厚4.255 距下限0.055 → 接近带（第3点）→ 段末产出R5中风险\", \"record_no\": \"IR-20261117-004\", \"sample_no\": \"S-513\", \"ovality_mm\": \"0.210\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, {\"id\": 303, \"remark\": \"点3 壁厚4.270 距下限0.070 → 接近带（第2点）\", \"record_no\": \"IR-20261117-003\", \"sample_no\": \"S-512\", \"ovality_mm\": \"0.225\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T10:25:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.250\", \"max_outer_diameter_mm\": \"25.400\", \"max_wall_thickness_mm\": \"4.380\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.270\"}, {\"id\": 302, \"remark\": \"点2 壁厚4.285 距下限0.085 → 进入接近带（第1点）\", \"record_no\": \"IR-20261117-002\", \"sample_no\": \"S-511\", \"ovality_mm\": \"0.215\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T09:20:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.235\", \"max_outer_diameter_mm\": \"25.378\", \"max_wall_thickness_mm\": \"4.395\", \"min_outer_diameter_mm\": \"25.163\", \"min_wall_thickness_mm\": \"4.285\"}, {\"id\": 301, \"remark\": \"点1 壁厚4.320 距下限0.120，未进接近带\", \"record_no\": \"IR-20261117-001\", \"sample_no\": \"S-510\", \"ovality_mm\": \"0.220\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T08:15:00.000Z\", \"quality_flag\": \"normal\", \"outer_diameter_mm\": \"25.240\", \"max_outer_diameter_mm\": \"25.387\", \"max_wall_thickness_mm\": \"4.430\", \"min_outer_diameter_mm\": \"25.167\", \"min_wall_thickness_mm\": \"4.320\"}], \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 5}, {\"tool\": \"get_metric_definition\", \"input\": {}, \"output\": {\"code\": \"min_wall_thickness\", \"name\": \"壁厚\", \"unit\": \"mm\", \"spec_id\": 1, \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"influences\": \"挤出量、牵引速度、模具偏心、原料波动\", \"description\": \"仅最薄点不能代表整体壁厚分布\", \"lower_limit\": \"4.200\", \"metric_code\": \"min_wall_thickness\", \"upper_limit\": \"4.800\", \"limit_source\": \"产品规格（ppr_product_spec）标准限值\"}, \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 7}, {\"tool\": \"get_equipment_window\", \"input\": {\"windowMinutes\": 240}, \"output\": [{\"id\": 390, \"remark\": null, \"record_no\": \"ER-20261014093020-N5C6\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T08:00:00.000Z\", \"pressure_mpa\": \"12.584\", \"temperature_c\": \"204.91\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 366, \"remark\": null, \"record_no\": \"ER-20261014092947-B3F8\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T08:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.214\"}, {\"id\": 391, \"remark\": null, \"record_no\": \"ER-20261014093020-4EJ2\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T09:00:00.000Z\", \"pressure_mpa\": \"12.624\", \"temperature_c\": \"204.69\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 367, \"remark\": null, \"record_no\": \"ER-20261014092947-J0WP\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T09:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.222\"}, {\"id\": 392, \"remark\": null, \"record_no\": \"ER-20261014093020-Z9N8\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T10:00:00.000Z\", \"pressure_mpa\": \"12.666\", \"temperature_c\": \"204.54\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 368, \"remark\": null, \"record_no\": \"ER-20261014092947-L6DR\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T10:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.231\"}, {\"id\": 393, \"remark\": null, \"record_no\": \"ER-20261014093020-DMZS\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T11:00:00.000Z\", \"pressure_mpa\": \"12.719\", \"temperature_c\": \"204.46\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 369, \"remark\": null, \"record_no\": \"ER-20261014092947-WLCY\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T11:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.246\"}, {\"id\": 394, \"remark\": null, \"record_no\": \"ER-20261014093020-3KEK\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T12:00:00.000Z\", \"pressure_mpa\": \"12.758\", \"temperature_c\": \"204.36\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 370, \"remark\": null, \"record_no\": \"ER-20261014092947-PCDY\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T12:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.260\"}, {\"id\": 395, \"remark\": null, \"record_no\": \"ER-20261014093020-CR4M\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T13:00:00.000Z\", \"pressure_mpa\": \"12.743\", \"temperature_c\": \"204.33\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 371, \"remark\": null, \"record_no\": \"ER-20261014092947-QUVS\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T13:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.259\"}, {\"id\": 396, \"remark\": null, \"record_no\": \"ER-20261014093020-Y0DK\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T14:00:00.000Z\", \"pressure_mpa\": \"12.698\", \"temperature_c\": \"204.42\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 372, \"remark\": null, \"record_no\": \"ER-20261014092947-61Z0\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T14:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.244\"}, {\"id\": 397, \"remark\": null, \"record_no\": \"ER-20261014093020-RNH1\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T15:00:00.000Z\", \"pressure_mpa\": \"12.636\", \"temperature_c\": \"204.67\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 373, \"remark\": null, \"record_no\": \"ER-20261014092947-DLJ7\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T15:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.226\"}], \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 9}]}','agent','deepseek-v4-flash','quality-agent-v2.0','langchain-create-agent-v1','[{\"tool\": \"get_alert_context\", \"input\": {}, \"output\": {\"id\": 746, \"source\": \"engine\", \"status\": \"open\", \"spec_id\": 1, \"batch_no\": \"12121D0051\", \"event_no\": \"QE-20261117-304WT\", \"record_no\": \"IR-20261117-004\", \"rule_code\": \"R5\", \"rule_name\": \"连续3点接近区间边界\", \"sample_no\": \"S-513\", \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"created_at\": \"2026-10-14T09:26:53.000Z\", \"ovality_mm\": \"0.210\", \"risk_level\": \"medium\", \"updated_at\": \"2026-10-14T09:26:53.000Z\", \"data_source\": \"MES_IMPORT\", \"detected_at\": \"2026-11-17T11:30:00.000Z\", \"metric_code\": \"min_wall_thickness\", \"notified_at\": null, \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"wall_lower_mm\": \"4.200\", \"wall_upper_mm\": \"4.800\", \"measurement_id\": 304, \"notified_level\": null, \"observed_value\": \"4.2550\", \"outer_lower_mm\": \"25.000\", \"outer_upper_mm\": \"25.500\", \"threshold_text\": \"4.200 mm–4.800 mm，连续 3 点进入接近带（距下限 ≤ 0.090 mm，为区间宽度的 15%）：4.285 / 4.270 / 4.255\", \"ovality_upper_mm\": \"0.350\", \"production_group\": \"乙班\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, \"startedAt\": \"2026-10-14T09:30:59.483Z\", \"durationMs\": 1}, {\"tool\": \"get_reference_measurements\", \"input\": {\"limit\": 20}, \"output\": [{\"id\": 300, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-006\", \"ovality_mm\": \"0.210\", \"inspect_time\": \"2026-11-16T13:40:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.230\", \"max_outer_diameter_mm\": \"25.370\", \"max_wall_thickness_mm\": \"4.510\", \"min_outer_diameter_mm\": \"25.160\", \"min_wall_thickness_mm\": \"4.400\"}, {\"id\": 299, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-005\", \"ovality_mm\": \"0.220\", \"inspect_time\": \"2026-11-16T12:35:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.250\", \"max_outer_diameter_mm\": \"25.397\", \"max_wall_thickness_mm\": \"4.525\", \"min_outer_diameter_mm\": \"25.177\", \"min_wall_thickness_mm\": \"4.415\"}, {\"id\": 298, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-004\", \"ovality_mm\": \"0.230\", \"inspect_time\": \"2026-11-16T11:30:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.240\", \"max_outer_diameter_mm\": \"25.393\", \"max_wall_thickness_mm\": \"4.505\", \"min_outer_diameter_mm\": \"25.163\", \"min_wall_thickness_mm\": \"4.395\"}, {\"id\": 297, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-003\", \"ovality_mm\": \"0.205\", \"inspect_time\": \"2026-11-16T10:25:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.255\", \"max_outer_diameter_mm\": \"25.392\", \"max_wall_thickness_mm\": \"4.540\", \"min_outer_diameter_mm\": \"25.187\", \"min_wall_thickness_mm\": \"4.430\"}, {\"id\": 296, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-002\", \"ovality_mm\": \"0.225\", \"inspect_time\": \"2026-11-16T09:20:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.235\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.515\", \"min_outer_diameter_mm\": \"25.160\", \"min_wall_thickness_mm\": \"4.405\"}, {\"id\": 295, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-001\", \"ovality_mm\": \"0.215\", \"inspect_time\": \"2026-11-16T08:15:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.388\", \"max_wall_thickness_mm\": \"4.530\", \"min_outer_diameter_mm\": \"25.173\", \"min_wall_thickness_mm\": \"4.420\"}], \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 3}, {\"tool\": \"get_batch_measurements\", \"input\": {\"limit\": 15}, \"output\": [{\"id\": 304, \"remark\": \"点4 壁厚4.255 距下限0.055 → 接近带（第3点）→ 段末产出R5中风险\", \"record_no\": \"IR-20261117-004\", \"sample_no\": \"S-513\", \"ovality_mm\": \"0.210\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, {\"id\": 303, \"remark\": \"点3 壁厚4.270 距下限0.070 → 接近带（第2点）\", \"record_no\": \"IR-20261117-003\", \"sample_no\": \"S-512\", \"ovality_mm\": \"0.225\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T10:25:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.250\", \"max_outer_diameter_mm\": \"25.400\", \"max_wall_thickness_mm\": \"4.380\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.270\"}, {\"id\": 302, \"remark\": \"点2 壁厚4.285 距下限0.085 → 进入接近带（第1点）\", \"record_no\": \"IR-20261117-002\", \"sample_no\": \"S-511\", \"ovality_mm\": \"0.215\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T09:20:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.235\", \"max_outer_diameter_mm\": \"25.378\", \"max_wall_thickness_mm\": \"4.395\", \"min_outer_diameter_mm\": \"25.163\", \"min_wall_thickness_mm\": \"4.285\"}, {\"id\": 301, \"remark\": \"点1 壁厚4.320 距下限0.120，未进接近带\", \"record_no\": \"IR-20261117-001\", \"sample_no\": \"S-510\", \"ovality_mm\": \"0.220\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T08:15:00.000Z\", \"quality_flag\": \"normal\", \"outer_diameter_mm\": \"25.240\", \"max_outer_diameter_mm\": \"25.387\", \"max_wall_thickness_mm\": \"4.430\", \"min_outer_diameter_mm\": \"25.167\", \"min_wall_thickness_mm\": \"4.320\"}], \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 5}, {\"tool\": \"get_metric_definition\", \"input\": {}, \"output\": {\"code\": \"min_wall_thickness\", \"name\": \"壁厚\", \"unit\": \"mm\", \"spec_id\": 1, \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"influences\": \"挤出量、牵引速度、模具偏心、原料波动\", \"description\": \"仅最薄点不能代表整体壁厚分布\", \"lower_limit\": \"4.200\", \"metric_code\": \"min_wall_thickness\", \"upper_limit\": \"4.800\", \"limit_source\": \"产品规格（ppr_product_spec）标准限值\"}, \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 7}, {\"tool\": \"get_equipment_window\", \"input\": {\"windowMinutes\": 240}, \"output\": [{\"id\": 390, \"remark\": null, \"record_no\": \"ER-20261014093020-N5C6\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T08:00:00.000Z\", \"pressure_mpa\": \"12.584\", \"temperature_c\": \"204.91\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 366, \"remark\": null, \"record_no\": \"ER-20261014092947-B3F8\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T08:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.214\"}, {\"id\": 391, \"remark\": null, \"record_no\": \"ER-20261014093020-4EJ2\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T09:00:00.000Z\", \"pressure_mpa\": \"12.624\", \"temperature_c\": \"204.69\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 367, \"remark\": null, \"record_no\": \"ER-20261014092947-J0WP\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T09:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.222\"}, {\"id\": 392, \"remark\": null, \"record_no\": \"ER-20261014093020-Z9N8\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T10:00:00.000Z\", \"pressure_mpa\": \"12.666\", \"temperature_c\": \"204.54\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 368, \"remark\": null, \"record_no\": \"ER-20261014092947-L6DR\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T10:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.231\"}, {\"id\": 393, \"remark\": null, \"record_no\": \"ER-20261014093020-DMZS\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T11:00:00.000Z\", \"pressure_mpa\": \"12.719\", \"temperature_c\": \"204.46\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 369, \"remark\": null, \"record_no\": \"ER-20261014092947-WLCY\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T11:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.246\"}, {\"id\": 394, \"remark\": null, \"record_no\": \"ER-20261014093020-3KEK\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T12:00:00.000Z\", \"pressure_mpa\": \"12.758\", \"temperature_c\": \"204.36\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 370, \"remark\": null, \"record_no\": \"ER-20261014092947-PCDY\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T12:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.260\"}, {\"id\": 395, \"remark\": null, \"record_no\": \"ER-20261014093020-CR4M\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T13:00:00.000Z\", \"pressure_mpa\": \"12.743\", \"temperature_c\": \"204.33\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 371, \"remark\": null, \"record_no\": \"ER-20261014092947-QUVS\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T13:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.259\"}, {\"id\": 396, \"remark\": null, \"record_no\": \"ER-20261014093020-Y0DK\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T14:00:00.000Z\", \"pressure_mpa\": \"12.698\", \"temperature_c\": \"204.42\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 372, \"remark\": null, \"record_no\": \"ER-20261014092947-61Z0\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T14:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.244\"}, {\"id\": 397, \"remark\": null, \"record_no\": \"ER-20261014093020-RNH1\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T15:00:00.000Z\", \"pressure_mpa\": \"12.636\", \"temperature_c\": \"204.67\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 373, \"remark\": null, \"record_no\": \"ER-20261014092947-DLJ7\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T15:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.226\"}], \"startedAt\": \"2026-10-14T09:31:00.625Z\", \"durationMs\": 9}]','{\"inputTokens\": 14643, \"totalTokens\": 18725, \"outputTokens\": 4082}','[{\"type\": \"human\", \"content\": \"请分析预警事件 QE-20261117-304WT。当前触发规则为“连续3点接近区间边界”，异常指标为 min_wall_thickness。请严格按“测量与数据有效性→异常形态→规格/同批次/正常参考三层对照→时间对齐→成型链与材料链竞争假设→反证及受控验证”的顺序先取证，再形成2到6条待工程师验证的结论。外径异常不得简化为单一工艺参数的直接因果；工具未提供的数据必须写入缺失证据，不得补造。\"}, {\"name\": \"model\", \"type\": \"ai\", \"content\": \"\", \"tool_calls\": [{\"id\": \"call_00_Wzy9A4UPehlXLcEnNIac4786\", \"args\": {}, \"name\": \"get_alert_context\", \"type\": \"tool_call\"}], \"usage_metadata\": {\"input_tokens\": 3519, \"total_tokens\": 3537, \"output_tokens\": 18, \"input_token_details\": {\"cache_read\": 3200}, \"output_token_details\": {}}}, {\"name\": \"get_alert_context\", \"type\": \"tool\", \"content\": \"{\\\"id\\\":746,\\\"event_no\\\":\\\"QE-20261117-304WT\\\",\\\"measurement_id\\\":304,\\\"metric_code\\\":\\\"min_wall_thickness\\\",\\\"risk_level\\\":\\\"medium\\\",\\\"rule_code\\\":\\\"R5\\\",\\\"rule_name\\\":\\\"连续3点接近区间边界\\\",\\\"observed_value\\\":\\\"4.2550\\\",\\\"threshold_text\\\":\\\"4.200 mm–4.800 mm，连续 3 点进入接近带（距下限 ≤ 0.090 mm，为区间宽度的 15%）：4.285 / 4.270 / 4.255\\\",\\\"status\\\":\\\"open\\\",\\\"source\\\":\\\"engine\\\",\\\"notified_level\\\":null,\\\"notified_at\\\":null,\\\"detected_at\\\":\\\"2026-11-17T11:30:00.000Z\\\",\\\"created_at\\\":\\\"2026-10-14T09:26:53.000Z\\\",\\\"updated_at\\\":\\\"2026-10-14T09:26:53.000Z\\\",\\\"record_no\\\":\\\"IR-20261117-004\\\",\\\"sample_no\\\":\\\"S-513\\\",\\\"inspect_time\\\":\\\"2026-11-17T11:30:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.245\\\",\\\"min_wall_thickness_mm\\\":\\\"4.255\\\",\\\"max_wall_thickness_mm\\\":\\\"4.365\\\",\\\"max_outer_diameter_mm\\\":\\\"25.385\\\",\\\"min_outer_diameter_mm\\\":\\\"25.175\\\",\\\"ovality_mm\\\":\\\"0.210\\\",\\\"data_source\\\":\\\"MES_IMPORT\\\",\\\"batch_no\\\":\\\"12121D0051\\\",\\\"production_group\\\":\\\"乙班\\\",\\\"spec_id\\\":1,\\\"spec_name\\\":\\\"PPR S2.5 25×4.2 瓷芯管\\\",\\\"outer_lower_mm\\\":\\\"25.000\\\",\\\"outer_upper_mm\\\":\\\"25.500\\\",\\\"wall_lower_mm\\\":\\\"4.200\\\",\\\"wall_upper_mm\\\":\\\"4.800\\\",\\\"ovality_upper_mm\\\":\\\"0.350\\\"}\"}, {\"name\": \"model\", \"type\": \"ai\", \"content\": \"\", \"tool_calls\": [{\"id\": \"call_00_KijjAaUtaciEUVlLo33F7288\", \"args\": {}, \"name\": \"get_metric_definition\", \"type\": \"tool_call\"}, {\"id\": \"call_01_NIIhMcabMC1sNgGFl7Gz8071\", \"args\": {\"limit\": 15}, \"name\": \"get_batch_measurements\", \"type\": \"tool_call\"}, {\"id\": \"call_02_XUrBT5BdO2rEo7Y8Eztx1670\", \"args\": {\"windowMinutes\": 240}, \"name\": \"get_equipment_window\", \"type\": \"tool_call\"}, {\"id\": \"call_03_lt5di4TxpGChoQPQFGyO1997\", \"args\": {\"limit\": 20}, \"name\": \"get_reference_measurements\", \"type\": \"tool_call\"}], \"usage_metadata\": {\"input_tokens\": 3951, \"total_tokens\": 4066, \"output_tokens\": 115, \"input_token_details\": {\"cache_read\": 3456}, \"output_token_details\": {}}}, {\"name\": \"get_metric_definition\", \"type\": \"tool\", \"content\": \"{\\\"code\\\":\\\"min_wall_thickness\\\",\\\"name\\\":\\\"壁厚\\\",\\\"unit\\\":\\\"mm\\\",\\\"influences\\\":\\\"挤出量、牵引速度、模具偏心、原料波动\\\",\\\"description\\\":\\\"仅最薄点不能代表整体壁厚分布\\\",\\\"metric_code\\\":\\\"min_wall_thickness\\\",\\\"spec_id\\\":1,\\\"spec_name\\\":\\\"PPR S2.5 25×4.2 瓷芯管\\\",\\\"lower_limit\\\":\\\"4.200\\\",\\\"upper_limit\\\":\\\"4.800\\\",\\\"limit_source\\\":\\\"产品规格（ppr_product_spec）标准限值\\\"}\"}, {\"name\": \"get_batch_measurements\", \"type\": \"tool\", \"content\": \"[{\\\"id\\\":304,\\\"record_no\\\":\\\"IR-20261117-004\\\",\\\"sample_no\\\":\\\"S-513\\\",\\\"inspect_time\\\":\\\"2026-11-17T11:30:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.245\\\",\\\"min_wall_thickness_mm\\\":\\\"4.255\\\",\\\"max_wall_thickness_mm\\\":\\\"4.365\\\",\\\"max_outer_diameter_mm\\\":\\\"25.385\\\",\\\"min_outer_diameter_mm\\\":\\\"25.175\\\",\\\"ovality_mm\\\":\\\"0.210\\\",\\\"data_source\\\":\\\"MES_IMPORT\\\",\\\"quality_flag\\\":\\\"medium\\\",\\\"remark\\\":\\\"点4 壁厚4.255 距下限0.055 → 接近带（第3点）→ 段末产出R5中风险\\\"},{\\\"id\\\":303,\\\"record_no\\\":\\\"IR-20261117-003\\\",\\\"sample_no\\\":\\\"S-512\\\",\\\"inspect_time\\\":\\\"2026-11-17T10:25:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.250\\\",\\\"min_wall_thickness_mm\\\":\\\"4.270\\\",\\\"max_wall_thickness_mm\\\":\\\"4.380\\\",\\\"max_outer_diameter_mm\\\":\\\"25.400\\\",\\\"min_outer_diameter_mm\\\":\\\"25.175\\\",\\\"ovality_mm\\\":\\\"0.225\\\",\\\"data_source\\\":\\\"MES_IMPORT\\\",\\\"quality_flag\\\":\\\"medium\\\",\\\"remark\\\":\\\"点3 壁厚4.270 距下限0.070 → 接近带（第2点）\\\"},{\\\"id\\\":302,\\\"record_no\\\":\\\"IR-20261117-002\\\",\\\"sample_no\\\":\\\"S-511\\\",\\\"inspect_time\\\":\\\"2026-11-17T09:20:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.235\\\",\\\"min_wall_thickness_mm\\\":\\\"4.285\\\",\\\"max_wall_thickness_mm\\\":\\\"4.395\\\",\\\"max_outer_diameter_mm\\\":\\\"25.378\\\",\\\"min_outer_diameter_mm\\\":\\\"25.163\\\",\\\"ovality_mm\\\":\\\"0.215\\\",\\\"data_source\\\":\\\"MES_IMPORT\\\",\\\"quality_flag\\\":\\\"medium\\\",\\\"remark\\\":\\\"点2 壁厚4.285 距下限0.085 → 进入接近带（第1点）\\\"},{\\\"id\\\":301,\\\"record_no\\\":\\\"IR-20261117-001\\\",\\\"sample_no\\\":\\\"S-510\\\",\\\"inspect_time\\\":\\\"2026-11-17T08:15:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.240\\\",\\\"min_wall_thickness_mm\\\":\\\"4.320\\\",\\\"max_wall_thickness_mm\\\":\\\"4.430\\\",\\\"max_outer_diameter_mm\\\":\\\"25.387\\\",\\\"min_outer_diameter_mm\\\":\\\"25.167\\\",\\\"ovality_mm\\\":\\\"0.220\\\",\\\"data_source\\\":\\\"MES_IMPORT\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"remark\\\":\\\"点1 壁厚4.320 距下限0.120，未进接近带\\\"}]\"}, {\"name\": \"get_equipment_window\", \"type\": \"tool\", \"content\": \"[{\\\"id\\\":390,\\\"record_no\\\":\\\"ER-20261014093020-N5C6\\\",\\\"collect_time\\\":\\\"2026-11-17T08:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.91\\\",\\\"pressure_mpa\\\":\\\"12.584\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":366,\\\"record_no\\\":\\\"ER-20261014092947-B3F8\\\",\\\"collect_time\\\":\\\"2026-11-17T08:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.214\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":391,\\\"record_no\\\":\\\"ER-20261014093020-4EJ2\\\",\\\"collect_time\\\":\\\"2026-11-17T09:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.69\\\",\\\"pressure_mpa\\\":\\\"12.624\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":367,\\\"record_no\\\":\\\"ER-20261014092947-J0WP\\\",\\\"collect_time\\\":\\\"2026-11-17T09:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.222\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":392,\\\"record_no\\\":\\\"ER-20261014093020-Z9N8\\\",\\\"collect_time\\\":\\\"2026-11-17T10:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.54\\\",\\\"pressure_mpa\\\":\\\"12.666\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":368,\\\"record_no\\\":\\\"ER-20261014092947-L6DR\\\",\\\"collect_time\\\":\\\"2026-11-17T10:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.231\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":393,\\\"record_no\\\":\\\"ER-20261014093020-DMZS\\\",\\\"collect_time\\\":\\\"2026-11-17T11:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.46\\\",\\\"pressure_mpa\\\":\\\"12.719\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":369,\\\"record_no\\\":\\\"ER-20261014092947-WLCY\\\",\\\"collect_time\\\":\\\"2026-11-17T11:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.246\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":394,\\\"record_no\\\":\\\"ER-20261014093020-3KEK\\\",\\\"collect_time\\\":\\\"2026-11-17T12:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.36\\\",\\\"pressure_mpa\\\":\\\"12.758\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":370,\\\"record_no\\\":\\\"ER-20261014092947-PCDY\\\",\\\"collect_time\\\":\\\"2026-11-17T12:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.260\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":395,\\\"record_no\\\":\\\"ER-20261014093020-CR4M\\\",\\\"collect_time\\\":\\\"2026-11-17T13:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.33\\\",\\\"pressure_mpa\\\":\\\"12.743\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":371,\\\"record_no\\\":\\\"ER-20261014092947-QUVS\\\",\\\"collect_time\\\":\\\"2026-11-17T13:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.259\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":396,\\\"record_no\\\":\\\"ER-20261014093020-Y0DK\\\",\\\"collect_time\\\":\\\"2026-11-17T14:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.42\\\",\\\"pressure_mpa\\\":\\\"12.698\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":372,\\\"record_no\\\":\\\"ER-20261014092947-61Z0\\\",\\\"collect_time\\\":\\\"2026-11-17T14:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.244\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"},{\\\"id\\\":397,\\\"record_no\\\":\\\"ER-20261014093020-RNH1\\\",\\\"collect_time\\\":\\\"2026-11-17T15:00:00.000Z\\\",\\\"temperature_c\\\":\\\"204.67\\\",\\\"pressure_mpa\\\":\\\"12.636\\\",\\\"haul_off_speed_mpm\\\":null,\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-EX-01\\\",\\\"equipment_name\\\":\\\"1号挤出机\\\",\\\"equipment_type\\\":\\\"挤出机\\\"},{\\\"id\\\":373,\\\"record_no\\\":\\\"ER-20261014092947-DLJ7\\\",\\\"collect_time\\\":\\\"2026-11-17T15:00:00.000Z\\\",\\\"temperature_c\\\":null,\\\"pressure_mpa\\\":null,\\\"haul_off_speed_mpm\\\":\\\"8.226\\\",\\\"data_source\\\":\\\"Excel导入\\\",\\\"remark\\\":null,\\\"equipment_code\\\":\\\"EQ-HA-01\\\",\\\"equipment_name\\\":\\\"1号牵引机\\\",\\\"equipment_type\\\":\\\"牵引机\\\"}]\"}, {\"name\": \"get_reference_measurements\", \"type\": \"tool\", \"content\": \"[{\\\"id\\\":300,\\\"record_no\\\":\\\"IR-20261116-006\\\",\\\"inspect_time\\\":\\\"2026-11-16T13:40:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.230\\\",\\\"min_wall_thickness_mm\\\":\\\"4.400\\\",\\\"max_wall_thickness_mm\\\":\\\"4.510\\\",\\\"max_outer_diameter_mm\\\":\\\"25.370\\\",\\\"min_outer_diameter_mm\\\":\\\"25.160\\\",\\\"ovality_mm\\\":\\\"0.210\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"batch_no\\\":\\\"12121D0050\\\",\\\"production_group\\\":\\\"甲班\\\"},{\\\"id\\\":299,\\\"record_no\\\":\\\"IR-20261116-005\\\",\\\"inspect_time\\\":\\\"2026-11-16T12:35:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.250\\\",\\\"min_wall_thickness_mm\\\":\\\"4.415\\\",\\\"max_wall_thickness_mm\\\":\\\"4.525\\\",\\\"max_outer_diameter_mm\\\":\\\"25.397\\\",\\\"min_outer_diameter_mm\\\":\\\"25.177\\\",\\\"ovality_mm\\\":\\\"0.220\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"batch_no\\\":\\\"12121D0050\\\",\\\"production_group\\\":\\\"甲班\\\"},{\\\"id\\\":298,\\\"record_no\\\":\\\"IR-20261116-004\\\",\\\"inspect_time\\\":\\\"2026-11-16T11:30:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.240\\\",\\\"min_wall_thickness_mm\\\":\\\"4.395\\\",\\\"max_wall_thickness_mm\\\":\\\"4.505\\\",\\\"max_outer_diameter_mm\\\":\\\"25.393\\\",\\\"min_outer_diameter_mm\\\":\\\"25.163\\\",\\\"ovality_mm\\\":\\\"0.230\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"batch_no\\\":\\\"12121D0050\\\",\\\"production_group\\\":\\\"甲班\\\"},{\\\"id\\\":297,\\\"record_no\\\":\\\"IR-20261116-003\\\",\\\"inspect_time\\\":\\\"2026-11-16T10:25:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.255\\\",\\\"min_wall_thickness_mm\\\":\\\"4.430\\\",\\\"max_wall_thickness_mm\\\":\\\"4.540\\\",\\\"max_outer_diameter_mm\\\":\\\"25.392\\\",\\\"min_outer_diameter_mm\\\":\\\"25.187\\\",\\\"ovality_mm\\\":\\\"0.205\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"batch_no\\\":\\\"12121D0050\\\",\\\"production_group\\\":\\\"甲班\\\"},{\\\"id\\\":296,\\\"record_no\\\":\\\"IR-20261116-002\\\",\\\"inspect_time\\\":\\\"2026-11-16T09:20:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.235\\\",\\\"min_wall_thickness_mm\\\":\\\"4.405\\\",\\\"max_wall_thickness_mm\\\":\\\"4.515\\\",\\\"max_outer_diameter_mm\\\":\\\"25.385\\\",\\\"min_outer_diameter_mm\\\":\\\"25.160\\\",\\\"ovality_mm\\\":\\\"0.225\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"batch_no\\\":\\\"12121D0050\\\",\\\"production_group\\\":\\\"甲班\\\"},{\\\"id\\\":295,\\\"record_no\\\":\\\"IR-20261116-001\\\",\\\"inspect_time\\\":\\\"2026-11-16T08:15:00.000Z\\\",\\\"outer_diameter_mm\\\":\\\"25.245\\\",\\\"min_wall_thickness_mm\\\":\\\"4.420\\\",\\\"max_wall_thickness_mm\\\":\\\"4.530\\\",\\\"max_outer_diameter_mm\\\":\\\"25.388\\\",\\\"min_outer_diameter_mm\\\":\\\"25.173\\\",\\\"ovality_mm\\\":\\\"0.215\\\",\\\"quality_flag\\\":\\\"normal\\\",\\\"batch_no\\\":\\\"12121D0050\\\",\\\"production_group\\\":\\\"甲班\\\"}]\"}, {\"type\": \"ai\", \"content\": \"\", \"tool_calls\": [{\"id\": \"call_00_t9FQlXZnvDbMm0BJlNFy5479\", \"args\": {\"summary\": \"事件 QE-20261117-304WT（批次 12121D0051，PPR S2.5 25×4.2 瓷芯管，乙班）由 R5“连续3点接近区间边界”触发，min_wall_thickness 依次为 4.285→4.270→4.255 mm（点1 4.320 尚未进入接近带），下限 4.200 mm，最新点距下限 0.055 mm 且仍在内。形态特征：最小壁厚逐点单调下降约 0.065 mm/3 点，而代表外径（25.235→25.250→25.245）、最大外径、min/max 外径差（约 0.21 mm）、不圆度（0.205–0.225，上限 0.350）基本平稳；max_wall_thickness 同步下降 4.395→4.380→4.365，即最薄点与最厚点同向变薄、壁厚跨度约 0.11–0.115 mm 基本不变，提示整体壁厚水平下移而非偏心加剧。前一批次 12121D0050（甲班）同规格 6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm，为跨批次弱参考（产线、口模/定径套、配方、测量方法未确认）。最有区分度的设备事实：异常时刻前后挤出机温度 204.91→204.46 ℃、压力 12.584→12.719 MPa 缓慢同向变化，牵引速度 8.214→8.246 m/min 缓慢上升，三者与壁厚下降在小时尺度上同向，符合“牵引相对挤出量略升”和/或“黏度/流动阻力变化”方向，但未做生产时间—长度码—检测延迟对齐，不能称为该样管对应参数或因果证据。当前优先验证路径：①产品质量/测量侧自洽性复核（最薄点位置、量具、截面、测量温度、调节时间）；②供料量—线速度关系及壁厚周向分布（区分整体壁厚下移与偏心）；③真空定径、冷却与离模牵伸的能力变化。现有工具无真空、冷却、米重/质量挤出量、螺杆转速、原料批次与材料检测数据，不得据此判定最终根因或给出调机数值。\", \"conclusions\": [{\"category\": \"测量/数据有效性\", \"evidence\": \"支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，且影响因素列出挤出量、牵引速度、模具偏心、原料波动（get_metric_definition，metric_code=min_wall_thickness）；事件记录的 data_source=MES_IMPORT（记录 304 / IR-20261117-004），为导入数据。反向或不支持证据：四点记录的最大与最小外径差稳定在 0.21–0.22 mm、不圆度 0.205–0.225 mm 均远小于 0.350 mm 上限，且 max/min 壁厚跨度稳定约 0.11 mm，形态上更像真实整体厚度水平变化而非量测跳变；三连点单调下降具有趋势一致性。\", \"confidence\": 0.45, \"hypothesis\": \"当前 min_wall_thickness 的接近带触发可能部分由测量/取样口径因素贡献，而非全部为真实壁厚下降；需先确认最薄点定义、测厚量具、测量截面与测量温度，再谈工艺归因。\", \"missingEvidence\": \"最薄点的周向角度/截面位置与测点数、测厚量具型号与校准状态、测量温度与样管状态调节时间、是否同一测点重复测量、原始 MES 导入前的检验记录与抽检频次。\", \"validationAction\": \"预期伴随信号：若为测量问题，应在相同样管复测或不同量具复测时出现点间差大于工艺可能的 0.005–0.015 mm/点的离散；若为真实趋势，复测应复现 4.28→4.26 量级并保持最薄点位置一致。验证动作：由检验人员在受控条件下对留存样管按同一截面与量具复测，并回溯原始检验单与量具校准记录，记录最薄点角度。\", \"evidenceSourceIds\": [\"304\", \"303\", \"302\", \"301\"]}, {\"category\": \"异常形态与三层对照\", \"evidence\": \"支持证据：同批次序列 min 壁厚 4.320→4.285→4.270→4.255 mm，max 壁厚 4.430→4.395→4.380→4.365 mm，两者同步下降且跨度 0.110→0.115 mm 稳定（记录 301/302/303/304）；外径 25.240→25.235→25.250→25.245 mm、min/max 外径差与不圆度均无明显趋势；三层对照：规格限 4.200–4.800 mm，最新点仍在内但距下限仅 0.055 mm；同规格正常参考（前一批次 12121D0050）6 点 min 壁厚 4.395–4.430 mm（记录 295–300），当前低约 0.14–0.17 mm。反向或不支持证据：参考批次为 12121D0050 甲班，跨批次且未证明同产线、同口模/定径套、同层结构、同配方、同测量方法，不能作为控制限；当前无周向壁厚点位数据，不能排除偏心叠加。\", \"confidence\": 0.6, \"hypothesis\": \"当前事件形态为“min 与 max 壁厚同向单调下降、壁厚跨度与不圆度基本不变”，属于整体壁厚水平下移（相对供料/牵伸/定径冻结状态变化），而非以偏心为主的最薄点单独恶化。\", \"missingEvidence\": \"周向多点壁厚分布（尤其最薄点与最厚点角度）、同批次更早（点1 之前）的历史序列与班次切换记录、参考批次的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。\", \"validationAction\": \"预期伴随信号：若为整体壁厚下移，沿周长多点平均值同步下降且最薄点角度不变；若为偏心，则最薄点固定角度处下降幅显著大于其他点而平均厚度变化较小。验证动作：在受控条件下对留存样管实施周向多点（≥4 点）壁厚测量并与前一批次比对，同时核对同规格参考批次的生产线、口模/定径套与配方信息以决定参考权重。\", \"evidenceSourceIds\": [\"301\", \"302\", \"303\", \"304\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\"]}, {\"category\": \"设备/生产机理（牵伸—供料关系）\", \"evidence\": \"支持证据：异常检验时段内 1 号牵引机速度 8.214→8.222→8.231→8.246 m/min 逐小时缓升（记录 366/367/368/369）；1 号挤出机压力 12.584→12.624→12.666→12.719 MPa 同向缓升、温度 204.91→204.46 ℃ 缓降（记录 390–393）；检验时刻 11:30 与 11:00 设备记录相邻。反向或不支持证据：外径未随壁厚下降而同步变小（25.235→25.250→25.245 mm），若单纯牵伸显著增大通常会伴随外径或周长收缩，说明定径/冷却冻结或供料侧存在补偿；压力上升也可解释为黏度升高或流道阻力增大而非产量增加，现有工具未提供可核对的反向证据。\", \"confidence\": 0.35, \"hypothesis\": \"待验证：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、纵向取向与壁厚减薄，从而使 min 与 max 壁厚同步下降；该方向与牵引速度缓升、压力缓升的同期记录一致，但尚未完成生产时间对齐，不能作为因果确认。\", \"missingEvidence\": \"线速度与螺杆转速/进料量的配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间与检验时间的对齐换算、口模/定径套与真空设定。\", \"validationAction\": \"预期伴随信号：若牵伸相对供料上升，应见单位长度米重下降、同长度段产量下降或螺杆转速不变而牵引速度上升；若为黏度/阻力上升，则压力升高的同时熔体温度或机头压差有相应变化而米重变化较小。验证动作：在受控条件下按长度码/生产时间抽取对应段样管同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照，严禁直接调机。\", \"evidenceSourceIds\": [\"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\", \"301\", \"302\", \"303\", \"304\"]}, {\"category\": \"设备/生产机理（定径—冷却—离模行为）\", \"evidence\": \"支持证据：外径 25.235→25.250→25.245 mm 稳定且位于 25.000–25.500 mm 区间中部，不圆度 0.205–0.225 mm 稳定，说明外形成型约束充分；而壁厚同步减薄提示内表面/壁厚方向由供料—牵伸—冻结关系决定（记录 301–304）。反向或不支持证据：现有工具未提供真空度、定径水温/流量、喷淋分布、口模间隙、熔体温度与离模膨胀（get_equipment_window 仅有挤出机温度/压力与牵引速度），无法判断定径能力是否变化；也无证据表明定径异常，故不支持将其列为已确认机制。\", \"confidence\": 0.25, \"hypothesis\": \"待验证：外径保持稳定而壁厚整体下移，可用真空定径与冷却冻结强度相对变化（定径约束补偿了牵伸引起的收缩）或机头/口模出口状态变化解释；现有工具无真空、冷却与口模数据，该假设暂不能与牵伸假设区分。\", \"missingEvidence\": \"真空定径设定与实测值、定径套规格与磨损状态、冷却水温与流量、口模/芯模间隙与同心度记录、真实熔体温度与熔体压力位置、开机与换网/换料时间点。\", \"validationAction\": \"预期伴随信号：若定径或冷却能力变化，应见真空度、定径水温波动或口模出口状态与换网时间相关联，且外形（不圆度、外径）出现同步微变；若仅是牵伸—供料关系，则定径参数应保持稳定。验证动作：调取同期真空、冷却与口模维护记录并与检验时刻对齐，仅在受控工艺窗口内做单一变量评估，任何调整须按现场流程批准。\", \"evidenceSourceIds\": [\"301\", \"302\", \"303\", \"304\", \"390\", \"391\", \"392\", \"393\"]}, {\"category\": \"材料机理\", \"evidence\": \"支持证据：本批次号 12121D0051 与参考批次 12121D0050 不同，且班次由甲班切换为乙班，存在物料/批次或班次变更的弱线索；压力同期缓升而温度缓降，方向上可与黏度升高或流道阻力变化相容（记录 390–397、304）。反向或不支持证据：现有工具未提供任何原料批次、换料记录、MFR、密度、灰分或降解检测数据，也无米重数据；压力缓升同样可由滤网/流道阻力、温度下降或产量变化解释，因此不能把材料变化作为当前证据支持的根因。\", \"confidence\": 0.2, \"hypothesis\": \"待验证：原料流动性/黏度或组分（牌号、母料、填料、降解程度）变化导致挤出量与离模牵伸平衡偏移，从而引起壁厚整体下降；只有在确认外因无法解释且存在换料或批次线索时才应提高其优先级。\", \"missingEvidence\": \"本批次与上一批次原料牌号/供应商/批号、换料时间与过渡长度、MFR 与熔体流动对比、DSC 熔融结晶数据、密度与灰分/TGA、外观与炭黑/污染记录。\", \"validationAction\": \"预期伴随信号：若为材料流动性变化，应见同工艺条件下的机头压力与米重关系整体平移，且换料前后出现阶跃；若为降解，应见 MFR 异常、色差/气味或模口析出。验证动作：先核对换料与批次切换时间及过渡段取样记录，再按假设选择 MFR 与 DSC（必要时密度/灰分、FTIR）对比留样，避免无差别全套检测。\", \"evidenceSourceIds\": [\"304\", \"303\", \"302\", \"301\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\", \"390\", \"393\"]}, {\"category\": \"时间对齐\", \"evidence\": \"支持证据：检验记录 inspect_time 为 09:20/10:25/11:30/12:35 系列（记录 301–304），设备记录 collect_time 为整点 08:00–15:00（记录 366–373、390–397），两者时间尺度接近但不重合；工具未返回长度码、线速度对应产量、设备到检验点距离或检测延迟。反向或不支持证据：现有工具未提供可核对的反向证据，但也无任何字段能证明对齐成立。\", \"confidence\": 0.5, \"hypothesis\": \"待验证：现有设备记录（1 号挤出机、1 号牵引机逐小时点）与检验样管之间是否存在一一对应关系尚未建立，因此上述参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。\", \"missingEvidence\": \"线速度与设备出口到测径/取样的距离、生产时间戳或长度码打标、检测延迟与样管取样位置、设备时钟与 MES 时钟一致性核对记录。\", \"validationAction\": \"预期伴随信号：若完成对齐，壁厚最薄段应能与某一段螺杆转速/牵引速度记录稳定配对并在重复取样中复现；若无法配对，则应见参数变化与样管指标无稳定对应。验证动作：依据长度码或生产时间戳抽取指定段样管，与同段设备曲线比对；在完成对齐前，所有参数—指标关系仅作为待验证线索记录。\", \"evidenceSourceIds\": [\"301\", \"302\", \"303\", \"304\", \"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\"]}], \"riskAssessment\": {\"level\": \"medium\", \"reason\": \"触发指标仍在下限 4.200 mm 之上（最新 4.255 mm，余量 0.055 mm），外径与不圆度未见越界，但最小壁厚为连续3点单调下降且尚未止跌，存在后续突破下限的质量风险；同时最薄点与最厚点同向变薄提示可能为整体壁厚水平下移，若成立则涉及工艺/物料量—牵伸关系而非单纯局部偏心。诊断风险中等：缺少生产时间对齐、真空/冷却/米重/原料数据，参考批次可比性未确认，无法排除测量与取样因素。以上仅为诊断风险提示，不替代正式产品处置。\"}, \"analysisLimitations\": [\"时间对齐限制：检验时间（09:20/10:25/11:30）与设备整点记录（08:00–13:00 系列）不重合，且工具未提供长度码、设备到检测点距离、线速度—产量换算和检测延迟，设备参数与样管指标只能视为同批次邻近时刻的相关线索，不能称为该样管对应参数或因果证据。\", \"参考可比性限制：同规格正常记录来自批次 12121D0050（甲班），未确认同产线、同口模/定径套、同层结构、同配方、同测量方法与相近速度，只能作为弱参考，不构成控制限或最佳工艺窗口；前序同批次仅 4 点，不足以判定阶跃或周期性。\", \"字段缺口：工具未返回真空定径、冷却水温/流量、米重/质量挤出量、螺杆转速与进料量、原料牌号与批次、材料检测（MFR/DSC/密度/灰分/FTIR）、口模与芯模状态、壁厚周向点位；工具返回的 equipment_window 中牵引记录仅含速度、挤出机记录仅含温度与压力，熔体真实温度未知。\", \"规格判定边界：本事件使用产品规格限值 4.200–4.800 mm（wall）与 25.000–25.500 mm（outer）、不圆度上限 0.350 mm，来源为工具返回的 ppr_product_spec 标准限值；触发规则为接近带（区间宽度 15%）而非越界，尚未构成不合格判定。\", \"本分析为假设生成与验证建议，不含最终根因判定、放行/报废/停产结论，也不提供具体调机数值；任何现场确认与处置须按受控流程与人工批准执行。\"]}, \"name\": \"extract-1\", \"type\": \"tool_call\"}], \"usage_metadata\": {\"input_tokens\": 7173, \"total_tokens\": 11122, \"output_tokens\": 3949, \"input_token_details\": {\"cache_read\": 3968}, \"output_token_details\": {}}}, {\"name\": \"extract-1\", \"type\": \"tool\", \"content\": \"{\\\"summary\\\":\\\"事件 QE-20261117-304WT（批次 12121D0051，PPR S2.5 25×4.2 瓷芯管，乙班）由 R5“连续3点接近区间边界”触发，min_wall_thickness 依次为 4.285→4.270→4.255 mm（点1 4.320 尚未进入接近带），下限 4.200 mm，最新点距下限 0.055 mm 且仍在内。形态特征：最小壁厚逐点单调下降约 0.065 mm/3 点，而代表外径（25.235→25.250→25.245）、最大外径、min/max 外径差（约 0.21 mm）、不圆度（0.205–0.225，上限 0.350）基本平稳；max_wall_thickness 同步下降 4.395→4.380→4.365，即最薄点与最厚点同向变薄、壁厚跨度约 0.11–0.115 mm 基本不变，提示整体壁厚水平下移而非偏心加剧。前一批次 12121D0050（甲班）同规格 6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm，为跨批次弱参考（产线、口模/定径套、配方、测量方法未确认）。最有区分度的设备事实：异常时刻前后挤出机温度 204.91→204.46 ℃、压力 12.584→12.719 MPa 缓慢同向变化，牵引速度 8.214→8.246 m/min 缓慢上升，三者与壁厚下降在小时尺度上同向，符合“牵引相对挤出量略升”和/或“黏度/流动阻力变化”方向，但未做生产时间—长度码—检测延迟对齐，不能称为该样管对应参数或因果证据。当前优先验证路径：①产品质量/测量侧自洽性复核（最薄点位置、量具、截面、测量温度、调节时间）；②供料量—线速度关系及壁厚周向分布（区分整体壁厚下移与偏心）；③真空定径、冷却与离模牵伸的能力变化。现有工具无真空、冷却、米重/质量挤出量、螺杆转速、原料批次与材料检测数据，不得据此判定最终根因或给出调机数值。\\\",\\\"riskAssessment\\\":{\\\"level\\\":\\\"medium\\\",\\\"reason\\\":\\\"触发指标仍在下限 4.200 mm 之上（最新 4.255 mm，余量 0.055 mm），外径与不圆度未见越界，但最小壁厚为连续3点单调下降且尚未止跌，存在后续突破下限的质量风险；同时最薄点与最厚点同向变薄提示可能为整体壁厚水平下移，若成立则涉及工艺/物料量—牵伸关系而非单纯局部偏心。诊断风险中等：缺少生产时间对齐、真空/冷却/米重/原料数据，参考批次可比性未确认，无法排除测量与取样因素。以上仅为诊断风险提示，不替代正式产品处置。\\\"},\\\"conclusions\\\":[{\\\"category\\\":\\\"测量/数据有效性\\\",\\\"hypothesis\\\":\\\"当前 min_wall_thickness 的接近带触发可能部分由测量/取样口径因素贡献，而非全部为真实壁厚下降；需先确认最薄点定义、测厚量具、测量截面与测量温度，再谈工艺归因。\\\",\\\"evidence\\\":\\\"支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，且影响因素列出挤出量、牵引速度、模具偏心、原料波动（get_metric_definition，metric_code=min_wall_thickness）；事件记录的 data_source=MES_IMPORT（记录 304 / IR-20261117-004），为导入数据。反向或不支持证据：四点记录的最大与最小外径差稳定在 0.21–0.22 mm、不圆度 0.205–0.225 mm 均远小于 0.350 mm 上限，且 max/min 壁厚跨度稳定约 0.11 mm，形态上更像真实整体厚度水平变化而非量测跳变；三连点单调下降具有趋势一致性。\\\",\\\"missingEvidence\\\":\\\"最薄点的周向角度/截面位置与测点数、测厚量具型号与校准状态、测量温度与样管状态调节时间、是否同一测点重复测量、原始 MES 导入前的检验记录与抽检频次。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若为测量问题，应在相同样管复测或不同量具复测时出现点间差大于工艺可能的 0.005–0.015 mm/点的离散；若为真实趋势，复测应复现 4.28→4.26 量级并保持最薄点位置一致。验证动作：由检验人员在受控条件下对留存样管按同一截面与量具复测，并回溯原始检验单与量具校准记录，记录最薄点角度。\\\",\\\"confidence\\\":0.45,\\\"evidenceSourceIds\\\":[\\\"304\\\",\\\"303\\\",\\\"302\\\",\\\"301\\\"]},{\\\"category\\\":\\\"异常形态与三层对照\\\",\\\"hypothesis\\\":\\\"当前事件形态为“min 与 max 壁厚同向单调下降、壁厚跨度与不圆度基本不变”，属于整体壁厚水平下移（相对供料/牵伸/定径冻结状态变化），而非以偏心为主的最薄点单独恶化。\\\",\\\"evidence\\\":\\\"支持证据：同批次序列 min 壁厚 4.320→4.285→4.270→4.255 mm，max 壁厚 4.430→4.395→4.380→4.365 mm，两者同步下降且跨度 0.110→0.115 mm 稳定（记录 301/302/303/304）；外径 25.240→25.235→25.250→25.245 mm、min/max 外径差与不圆度均无明显趋势；三层对照：规格限 4.200–4.800 mm，最新点仍在内但距下限仅 0.055 mm；同规格正常参考（前一批次 12121D0050）6 点 min 壁厚 4.395–4.430 mm（记录 295–300），当前低约 0.14–0.17 mm。反向或不支持证据：参考批次为 12121D0050 甲班，跨批次且未证明同产线、同口模/定径套、同层结构、同配方、同测量方法，不能作为控制限；当前无周向壁厚点位数据，不能排除偏心叠加。\\\",\\\"missingEvidence\\\":\\\"周向多点壁厚分布（尤其最薄点与最厚点角度）、同批次更早（点1 之前）的历史序列与班次切换记录、参考批次的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若为整体壁厚下移，沿周长多点平均值同步下降且最薄点角度不变；若为偏心，则最薄点固定角度处下降幅显著大于其他点而平均厚度变化较小。验证动作：在受控条件下对留存样管实施周向多点（≥4 点）壁厚测量并与前一批次比对，同时核对同规格参考批次的生产线、口模/定径套与配方信息以决定参考权重。\\\",\\\"confidence\\\":0.6,\\\"evidenceSourceIds\\\":[\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\",\\\"295\\\",\\\"296\\\",\\\"297\\\",\\\"298\\\",\\\"299\\\",\\\"300\\\"]},{\\\"category\\\":\\\"设备/生产机理（牵伸—供料关系）\\\",\\\"hypothesis\\\":\\\"待验证：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、纵向取向与壁厚减薄，从而使 min 与 max 壁厚同步下降；该方向与牵引速度缓升、压力缓升的同期记录一致，但尚未完成生产时间对齐，不能作为因果确认。\\\",\\\"evidence\\\":\\\"支持证据：异常检验时段内 1 号牵引机速度 8.214→8.222→8.231→8.246 m/min 逐小时缓升（记录 366/367/368/369）；1 号挤出机压力 12.584→12.624→12.666→12.719 MPa 同向缓升、温度 204.91→204.46 ℃ 缓降（记录 390–393）；检验时刻 11:30 与 11:00 设备记录相邻。反向或不支持证据：外径未随壁厚下降而同步变小（25.235→25.250→25.245 mm），若单纯牵伸显著增大通常会伴随外径或周长收缩，说明定径/冷却冻结或供料侧存在补偿；压力上升也可解释为黏度升高或流道阻力增大而非产量增加，现有工具未提供可核对的反向证据。\\\",\\\"missingEvidence\\\":\\\"线速度与螺杆转速/进料量的配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间与检验时间的对齐换算、口模/定径套与真空设定。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若牵伸相对供料上升，应见单位长度米重下降、同长度段产量下降或螺杆转速不变而牵引速度上升；若为黏度/阻力上升，则压力升高的同时熔体温度或机头压差有相应变化而米重变化较小。验证动作：在受控条件下按长度码/生产时间抽取对应段样管同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照，严禁直接调机。\\\",\\\"confidence\\\":0.35,\\\"evidenceSourceIds\\\":[\\\"366\\\",\\\"367\\\",\\\"368\\\",\\\"369\\\",\\\"390\\\",\\\"391\\\",\\\"392\\\",\\\"393\\\",\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\"]},{\\\"category\\\":\\\"设备/生产机理（定径—冷却—离模行为）\\\",\\\"hypothesis\\\":\\\"待验证：外径保持稳定而壁厚整体下移，可用真空定径与冷却冻结强度相对变化（定径约束补偿了牵伸引起的收缩）或机头/口模出口状态变化解释；现有工具无真空、冷却与口模数据，该假设暂不能与牵伸假设区分。\\\",\\\"evidence\\\":\\\"支持证据：外径 25.235→25.250→25.245 mm 稳定且位于 25.000–25.500 mm 区间中部，不圆度 0.205–0.225 mm 稳定，说明外形成型约束充分；而壁厚同步减薄提示内表面/壁厚方向由供料—牵伸—冻结关系决定（记录 301–304）。反向或不支持证据：现有工具未提供真空度、定径水温/流量、喷淋分布、口模间隙、熔体温度与离模膨胀（get_equipment_window 仅有挤出机温度/压力与牵引速度），无法判断定径能力是否变化；也无证据表明定径异常，故不支持将其列为已确认机制。\\\",\\\"missingEvidence\\\":\\\"真空定径设定与实测值、定径套规格与磨损状态、冷却水温与流量、口模/芯模间隙与同心度记录、真实熔体温度与熔体压力位置、开机与换网/换料时间点。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若定径或冷却能力变化，应见真空度、定径水温波动或口模出口状态与换网时间相关联，且外形（不圆度、外径）出现同步微变；若仅是牵伸—供料关系，则定径参数应保持稳定。验证动作：调取同期真空、冷却与口模维护记录并与检验时刻对齐，仅在受控工艺窗口内做单一变量评估，任何调整须按现场流程批准。\\\",\\\"confidence\\\":0.25,\\\"evidenceSourceIds\\\":[\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\",\\\"390\\\",\\\"391\\\",\\\"392\\\",\\\"393\\\"]},{\\\"category\\\":\\\"材料机理\\\",\\\"hypothesis\\\":\\\"待验证：原料流动性/黏度或组分（牌号、母料、填料、降解程度）变化导致挤出量与离模牵伸平衡偏移，从而引起壁厚整体下降；只有在确认外因无法解释且存在换料或批次线索时才应提高其优先级。\\\",\\\"evidence\\\":\\\"支持证据：本批次号 12121D0051 与参考批次 12121D0050 不同，且班次由甲班切换为乙班，存在物料/批次或班次变更的弱线索；压力同期缓升而温度缓降，方向上可与黏度升高或流道阻力变化相容（记录 390–397、304）。反向或不支持证据：现有工具未提供任何原料批次、换料记录、MFR、密度、灰分或降解检测数据，也无米重数据；压力缓升同样可由滤网/流道阻力、温度下降或产量变化解释，因此不能把材料变化作为当前证据支持的根因。\\\",\\\"missingEvidence\\\":\\\"本批次与上一批次原料牌号/供应商/批号、换料时间与过渡长度、MFR 与熔体流动对比、DSC 熔融结晶数据、密度与灰分/TGA、外观与炭黑/污染记录。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若为材料流动性变化，应见同工艺条件下的机头压力与米重关系整体平移，且换料前后出现阶跃；若为降解，应见 MFR 异常、色差/气味或模口析出。验证动作：先核对换料与批次切换时间及过渡段取样记录，再按假设选择 MFR 与 DSC（必要时密度/灰分、FTIR）对比留样，避免无差别全套检测。\\\",\\\"confidence\\\":0.2,\\\"evidenceSourceIds\\\":[\\\"304\\\",\\\"303\\\",\\\"302\\\",\\\"301\\\",\\\"295\\\",\\\"296\\\",\\\"297\\\",\\\"298\\\",\\\"299\\\",\\\"300\\\",\\\"390\\\",\\\"393\\\"]},{\\\"category\\\":\\\"时间对齐\\\",\\\"hypothesis\\\":\\\"待验证：现有设备记录（1 号挤出机、1 号牵引机逐小时点）与检验样管之间是否存在一一对应关系尚未建立，因此上述参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。\\\",\\\"evidence\\\":\\\"支持证据：检验记录 inspect_time 为 09:20/10:25/11:30/12:35 系列（记录 301–304），设备记录 collect_time 为整点 08:00–15:00（记录 366–373、390–397），两者时间尺度接近但不重合；工具未返回长度码、线速度对应产量、设备到检验点距离或检测延迟。反向或不支持证据：现有工具未提供可核对的反向证据，但也无任何字段能证明对齐成立。\\\",\\\"missingEvidence\\\":\\\"线速度与设备出口到测径/取样的距离、生产时间戳或长度码打标、检测延迟与样管取样位置、设备时钟与 MES 时钟一致性核对记录。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若完成对齐，壁厚最薄段应能与某一段螺杆转速/牵引速度记录稳定配对并在重复取样中复现；若无法配对，则应见参数变化与样管指标无稳定对应。验证动作：依据长度码或生产时间戳抽取指定段样管，与同段设备曲线比对；在完成对齐前，所有参数—指标关系仅作为待验证线索记录。\\\",\\\"confidence\\\":0.5,\\\"evidenceSourceIds\\\":[\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\",\\\"366\\\",\\\"367\\\",\\\"368\\\",\\\"369\\\",\\\"390\\\",\\\"391\\\",\\\"392\\\",\\\"393\\\"]}],\\\"analysisLimitations\\\":[\\\"时间对齐限制：检验时间（09:20/10:25/11:30）与设备整点记录（08:00–13:00 系列）不重合，且工具未提供长度码、设备到检测点距离、线速度—产量换算和检测延迟，设备参数与样管指标只能视为同批次邻近时刻的相关线索，不能称为该样管对应参数或因果证据。\\\",\\\"参考可比性限制：同规格正常记录来自批次 12121D0050（甲班），未确认同产线、同口模/定径套、同层结构、同配方、同测量方法与相近速度，只能作为弱参考，不构成控制限或最佳工艺窗口；前序同批次仅 4 点，不足以判定阶跃或周期性。\\\",\\\"字段缺口：工具未返回真空定径、冷却水温/流量、米重/质量挤出量、螺杆转速与进料量、原料牌号与批次、材料检测（MFR/DSC/密度/灰分/FTIR）、口模与芯模状态、壁厚周向点位；工具返回的 equipment_window 中牵引记录仅含速度、挤出机记录仅含温度与压力，熔体真实温度未知。\\\",\\\"规格判定边界：本事件使用产品规格限值 4.200–4.800 mm（wall）与 25.000–25.500 mm（outer）、不圆度上限 0.350 mm，来源为工具返回的 ppr_product_spec 标准限值；触发规则为接近带（区间宽度 15%）而非越界，尚未构成不合格判定。\\\",\\\"本分析为假设生成与验证建议，不含最终根因判定、放行/报废/停产结论，也不提供具体调机数值；任何现场确认与处置须按受控流程与人工批准执行。\\\"]}\"}, {\"type\": \"ai\", \"content\": \"Returning structured response: {\\\"summary\\\":\\\"事件 QE-20261117-304WT（批次 12121D0051，PPR S2.5 25×4.2 瓷芯管，乙班）由 R5“连续3点接近区间边界”触发，min_wall_thickness 依次为 4.285→4.270→4.255 mm（点1 4.320 尚未进入接近带），下限 4.200 mm，最新点距下限 0.055 mm 且仍在内。形态特征：最小壁厚逐点单调下降约 0.065 mm/3 点，而代表外径（25.235→25.250→25.245）、最大外径、min/max 外径差（约 0.21 mm）、不圆度（0.205–0.225，上限 0.350）基本平稳；max_wall_thickness 同步下降 4.395→4.380→4.365，即最薄点与最厚点同向变薄、壁厚跨度约 0.11–0.115 mm 基本不变，提示整体壁厚水平下移而非偏心加剧。前一批次 12121D0050（甲班）同规格 6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm，为跨批次弱参考（产线、口模/定径套、配方、测量方法未确认）。最有区分度的设备事实：异常时刻前后挤出机温度 204.91→204.46 ℃、压力 12.584→12.719 MPa 缓慢同向变化，牵引速度 8.214→8.246 m/min 缓慢上升，三者与壁厚下降在小时尺度上同向，符合“牵引相对挤出量略升”和/或“黏度/流动阻力变化”方向，但未做生产时间—长度码—检测延迟对齐，不能称为该样管对应参数或因果证据。当前优先验证路径：①产品质量/测量侧自洽性复核（最薄点位置、量具、截面、测量温度、调节时间）；②供料量—线速度关系及壁厚周向分布（区分整体壁厚下移与偏心）；③真空定径、冷却与离模牵伸的能力变化。现有工具无真空、冷却、米重/质量挤出量、螺杆转速、原料批次与材料检测数据，不得据此判定最终根因或给出调机数值。\\\",\\\"riskAssessment\\\":{\\\"level\\\":\\\"medium\\\",\\\"reason\\\":\\\"触发指标仍在下限 4.200 mm 之上（最新 4.255 mm，余量 0.055 mm），外径与不圆度未见越界，但最小壁厚为连续3点单调下降且尚未止跌，存在后续突破下限的质量风险；同时最薄点与最厚点同向变薄提示可能为整体壁厚水平下移，若成立则涉及工艺/物料量—牵伸关系而非单纯局部偏心。诊断风险中等：缺少生产时间对齐、真空/冷却/米重/原料数据，参考批次可比性未确认，无法排除测量与取样因素。以上仅为诊断风险提示，不替代正式产品处置。\\\"},\\\"conclusions\\\":[{\\\"category\\\":\\\"测量/数据有效性\\\",\\\"hypothesis\\\":\\\"当前 min_wall_thickness 的接近带触发可能部分由测量/取样口径因素贡献，而非全部为真实壁厚下降；需先确认最薄点定义、测厚量具、测量截面与测量温度，再谈工艺归因。\\\",\\\"evidence\\\":\\\"支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，且影响因素列出挤出量、牵引速度、模具偏心、原料波动（get_metric_definition，metric_code=min_wall_thickness）；事件记录的 data_source=MES_IMPORT（记录 304 / IR-20261117-004），为导入数据。反向或不支持证据：四点记录的最大与最小外径差稳定在 0.21–0.22 mm、不圆度 0.205–0.225 mm 均远小于 0.350 mm 上限，且 max/min 壁厚跨度稳定约 0.11 mm，形态上更像真实整体厚度水平变化而非量测跳变；三连点单调下降具有趋势一致性。\\\",\\\"missingEvidence\\\":\\\"最薄点的周向角度/截面位置与测点数、测厚量具型号与校准状态、测量温度与样管状态调节时间、是否同一测点重复测量、原始 MES 导入前的检验记录与抽检频次。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若为测量问题，应在相同样管复测或不同量具复测时出现点间差大于工艺可能的 0.005–0.015 mm/点的离散；若为真实趋势，复测应复现 4.28→4.26 量级并保持最薄点位置一致。验证动作：由检验人员在受控条件下对留存样管按同一截面与量具复测，并回溯原始检验单与量具校准记录，记录最薄点角度。\\\",\\\"confidence\\\":0.45,\\\"evidenceSourceIds\\\":[\\\"304\\\",\\\"303\\\",\\\"302\\\",\\\"301\\\"]},{\\\"category\\\":\\\"异常形态与三层对照\\\",\\\"hypothesis\\\":\\\"当前事件形态为“min 与 max 壁厚同向单调下降、壁厚跨度与不圆度基本不变”，属于整体壁厚水平下移（相对供料/牵伸/定径冻结状态变化），而非以偏心为主的最薄点单独恶化。\\\",\\\"evidence\\\":\\\"支持证据：同批次序列 min 壁厚 4.320→4.285→4.270→4.255 mm，max 壁厚 4.430→4.395→4.380→4.365 mm，两者同步下降且跨度 0.110→0.115 mm 稳定（记录 301/302/303/304）；外径 25.240→25.235→25.250→25.245 mm、min/max 外径差与不圆度均无明显趋势；三层对照：规格限 4.200–4.800 mm，最新点仍在内但距下限仅 0.055 mm；同规格正常参考（前一批次 12121D0050）6 点 min 壁厚 4.395–4.430 mm（记录 295–300），当前低约 0.14–0.17 mm。反向或不支持证据：参考批次为 12121D0050 甲班，跨批次且未证明同产线、同口模/定径套、同层结构、同配方、同测量方法，不能作为控制限；当前无周向壁厚点位数据，不能排除偏心叠加。\\\",\\\"missingEvidence\\\":\\\"周向多点壁厚分布（尤其最薄点与最厚点角度）、同批次更早（点1 之前）的历史序列与班次切换记录、参考批次的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若为整体壁厚下移，沿周长多点平均值同步下降且最薄点角度不变；若为偏心，则最薄点固定角度处下降幅显著大于其他点而平均厚度变化较小。验证动作：在受控条件下对留存样管实施周向多点（≥4 点）壁厚测量并与前一批次比对，同时核对同规格参考批次的生产线、口模/定径套与配方信息以决定参考权重。\\\",\\\"confidence\\\":0.6,\\\"evidenceSourceIds\\\":[\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\",\\\"295\\\",\\\"296\\\",\\\"297\\\",\\\"298\\\",\\\"299\\\",\\\"300\\\"]},{\\\"category\\\":\\\"设备/生产机理（牵伸—供料关系）\\\",\\\"hypothesis\\\":\\\"待验证：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、纵向取向与壁厚减薄，从而使 min 与 max 壁厚同步下降；该方向与牵引速度缓升、压力缓升的同期记录一致，但尚未完成生产时间对齐，不能作为因果确认。\\\",\\\"evidence\\\":\\\"支持证据：异常检验时段内 1 号牵引机速度 8.214→8.222→8.231→8.246 m/min 逐小时缓升（记录 366/367/368/369）；1 号挤出机压力 12.584→12.624→12.666→12.719 MPa 同向缓升、温度 204.91→204.46 ℃ 缓降（记录 390–393）；检验时刻 11:30 与 11:00 设备记录相邻。反向或不支持证据：外径未随壁厚下降而同步变小（25.235→25.250→25.245 mm），若单纯牵伸显著增大通常会伴随外径或周长收缩，说明定径/冷却冻结或供料侧存在补偿；压力上升也可解释为黏度升高或流道阻力增大而非产量增加，现有工具未提供可核对的反向证据。\\\",\\\"missingEvidence\\\":\\\"线速度与螺杆转速/进料量的配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间与检验时间的对齐换算、口模/定径套与真空设定。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若牵伸相对供料上升，应见单位长度米重下降、同长度段产量下降或螺杆转速不变而牵引速度上升；若为黏度/阻力上升，则压力升高的同时熔体温度或机头压差有相应变化而米重变化较小。验证动作：在受控条件下按长度码/生产时间抽取对应段样管同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照，严禁直接调机。\\\",\\\"confidence\\\":0.35,\\\"evidenceSourceIds\\\":[\\\"366\\\",\\\"367\\\",\\\"368\\\",\\\"369\\\",\\\"390\\\",\\\"391\\\",\\\"392\\\",\\\"393\\\",\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\"]},{\\\"category\\\":\\\"设备/生产机理（定径—冷却—离模行为）\\\",\\\"hypothesis\\\":\\\"待验证：外径保持稳定而壁厚整体下移，可用真空定径与冷却冻结强度相对变化（定径约束补偿了牵伸引起的收缩）或机头/口模出口状态变化解释；现有工具无真空、冷却与口模数据，该假设暂不能与牵伸假设区分。\\\",\\\"evidence\\\":\\\"支持证据：外径 25.235→25.250→25.245 mm 稳定且位于 25.000–25.500 mm 区间中部，不圆度 0.205–0.225 mm 稳定，说明外形成型约束充分；而壁厚同步减薄提示内表面/壁厚方向由供料—牵伸—冻结关系决定（记录 301–304）。反向或不支持证据：现有工具未提供真空度、定径水温/流量、喷淋分布、口模间隙、熔体温度与离模膨胀（get_equipment_window 仅有挤出机温度/压力与牵引速度），无法判断定径能力是否变化；也无证据表明定径异常，故不支持将其列为已确认机制。\\\",\\\"missingEvidence\\\":\\\"真空定径设定与实测值、定径套规格与磨损状态、冷却水温与流量、口模/芯模间隙与同心度记录、真实熔体温度与熔体压力位置、开机与换网/换料时间点。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若定径或冷却能力变化，应见真空度、定径水温波动或口模出口状态与换网时间相关联，且外形（不圆度、外径）出现同步微变；若仅是牵伸—供料关系，则定径参数应保持稳定。验证动作：调取同期真空、冷却与口模维护记录并与检验时刻对齐，仅在受控工艺窗口内做单一变量评估，任何调整须按现场流程批准。\\\",\\\"confidence\\\":0.25,\\\"evidenceSourceIds\\\":[\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\",\\\"390\\\",\\\"391\\\",\\\"392\\\",\\\"393\\\"]},{\\\"category\\\":\\\"材料机理\\\",\\\"hypothesis\\\":\\\"待验证：原料流动性/黏度或组分（牌号、母料、填料、降解程度）变化导致挤出量与离模牵伸平衡偏移，从而引起壁厚整体下降；只有在确认外因无法解释且存在换料或批次线索时才应提高其优先级。\\\",\\\"evidence\\\":\\\"支持证据：本批次号 12121D0051 与参考批次 12121D0050 不同，且班次由甲班切换为乙班，存在物料/批次或班次变更的弱线索；压力同期缓升而温度缓降，方向上可与黏度升高或流道阻力变化相容（记录 390–397、304）。反向或不支持证据：现有工具未提供任何原料批次、换料记录、MFR、密度、灰分或降解检测数据，也无米重数据；压力缓升同样可由滤网/流道阻力、温度下降或产量变化解释，因此不能把材料变化作为当前证据支持的根因。\\\",\\\"missingEvidence\\\":\\\"本批次与上一批次原料牌号/供应商/批号、换料时间与过渡长度、MFR 与熔体流动对比、DSC 熔融结晶数据、密度与灰分/TGA、外观与炭黑/污染记录。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若为材料流动性变化，应见同工艺条件下的机头压力与米重关系整体平移，且换料前后出现阶跃；若为降解，应见 MFR 异常、色差/气味或模口析出。验证动作：先核对换料与批次切换时间及过渡段取样记录，再按假设选择 MFR 与 DSC（必要时密度/灰分、FTIR）对比留样，避免无差别全套检测。\\\",\\\"confidence\\\":0.2,\\\"evidenceSourceIds\\\":[\\\"304\\\",\\\"303\\\",\\\"302\\\",\\\"301\\\",\\\"295\\\",\\\"296\\\",\\\"297\\\",\\\"298\\\",\\\"299\\\",\\\"300\\\",\\\"390\\\",\\\"393\\\"]},{\\\"category\\\":\\\"时间对齐\\\",\\\"hypothesis\\\":\\\"待验证：现有设备记录（1 号挤出机、1 号牵引机逐小时点）与检验样管之间是否存在一一对应关系尚未建立，因此上述参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。\\\",\\\"evidence\\\":\\\"支持证据：检验记录 inspect_time 为 09:20/10:25/11:30/12:35 系列（记录 301–304），设备记录 collect_time 为整点 08:00–15:00（记录 366–373、390–397），两者时间尺度接近但不重合；工具未返回长度码、线速度对应产量、设备到检验点距离或检测延迟。反向或不支持证据：现有工具未提供可核对的反向证据，但也无任何字段能证明对齐成立。\\\",\\\"missingEvidence\\\":\\\"线速度与设备出口到测径/取样的距离、生产时间戳或长度码打标、检测延迟与样管取样位置、设备时钟与 MES 时钟一致性核对记录。\\\",\\\"validationAction\\\":\\\"预期伴随信号：若完成对齐，壁厚最薄段应能与某一段螺杆转速/牵引速度记录稳定配对并在重复取样中复现；若无法配对，则应见参数变化与样管指标无稳定对应。验证动作：依据长度码或生产时间戳抽取指定段样管，与同段设备曲线比对；在完成对齐前，所有参数—指标关系仅作为待验证线索记录。\\\",\\\"confidence\\\":0.5,\\\"evidenceSourceIds\\\":[\\\"301\\\",\\\"302\\\",\\\"303\\\",\\\"304\\\",\\\"366\\\",\\\"367\\\",\\\"368\\\",\\\"369\\\",\\\"390\\\",\\\"391\\\",\\\"392\\\",\\\"393\\\"]}],\\\"analysisLimitations\\\":[\\\"时间对齐限制：检验时间（09:20/10:25/11:30）与设备整点记录（08:00–13:00 系列）不重合，且工具未提供长度码、设备到检测点距离、线速度—产量换算和检测延迟，设备参数与样管指标只能视为同批次邻近时刻的相关线索，不能称为该样管对应参数或因果证据。\\\",\\\"参考可比性限制：同规格正常记录来自批次 12121D0050（甲班），未确认同产线、同口模/定径套、同层结构、同配方、同测量方法与相近速度，只能作为弱参考，不构成控制限或最佳工艺窗口；前序同批次仅 4 点，不足以判定阶跃或周期性。\\\",\\\"字段缺口：工具未返回真空定径、冷却水温/流量、米重/质量挤出量、螺杆转速与进料量、原料牌号与批次、材料检测（MFR/DSC/密度/灰分/FTIR）、口模与芯模状态、壁厚周向点位；工具返回的 equipment_window 中牵引记录仅含速度、挤出机记录仅含温度与压力，熔体真实温度未知。\\\",\\\"规格判定边界：本事件使用产品规格限值 4.200–4.800 mm（wall）与 25.000–25.500 mm（outer）、不圆度上限 0.350 mm，来源为工具返回的 ppr_product_spec 标准限值；触发规则为接近带（区间宽度 15%）而非越界，尚未构成不合格判定。\\\",\\\"本分析为假设生成与验证建议，不含最终根因判定、放行/报废/停产结论，也不提供具体调机数值；任何现场确认与处置须按受控流程与人工批准执行。\\\"]}\", \"tool_calls\": []}]',27654,NULL,'质量工程师','2026-10-14 09:31:26','2026-10-14 10:13:28');
/*!40000 ALTER TABLE `ppr_analysis_run` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `ppr_batch`
--

DROP TABLE IF EXISTS `ppr_batch`;
/*!50001 DROP VIEW IF EXISTS `ppr_batch`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `ppr_batch` AS SELECT 
 1 AS `id`,
 1 AS `batch_no`,
 1 AS `spec_id`,
 1 AS `production_group`,
 1 AS `start_time`,
 1 AS `end_time`,
 1 AS `status`,
 1 AS `measurement_count`,
 1 AS `reading_count`,
 1 AS `last_inspect_time`,
 1 AS `last_collect_time`,
 1 AS `extruder_id`,
 1 AS `extruder_name`,
 1 AS `haul_off_id`,
 1 AS `haul_off_name`,
 1 AS `created_at`,
 1 AS `updated_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `ppr_eight_d_report`
--

DROP TABLE IF EXISTS `ppr_eight_d_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_eight_d_report` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `report_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '8D报告编号，全局唯一',
  `analysis_id` bigint unsigned NOT NULL COMMENT '关联分析任务ID，一次分析仅一份报告',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报告标题',
  `d1` text COLLATE utf8mb4_unicode_ci COMMENT 'D1组建团队',
  `d2` text COLLATE utf8mb4_unicode_ci COMMENT 'D2问题描述',
  `d3` text COLLATE utf8mb4_unicode_ci COMMENT 'D3临时围堵措施',
  `d4` text COLLATE utf8mb4_unicode_ci COMMENT 'D4根因分析与验证',
  `d5` text COLLATE utf8mb4_unicode_ci COMMENT 'D5永久纠正措施选择',
  `d6` text COLLATE utf8mb4_unicode_ci COMMENT 'D6永久纠正措施实施与验证',
  `d7` text COLLATE utf8mb4_unicode_ci COMMENT 'D7预防再发生',
  `d8` text COLLATE utf8mb4_unicode_ci COMMENT 'D8团队表彰与结案',
  `status` enum('draft','finalized') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '报告状态：草稿、已定稿',
  `owner_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报告负责人',
  `generation_engine` enum('rule','agent') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '本稿生成的引擎：LangChain Agent 或规则模板',
  `model_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '生成本稿的模型名称，规则模板为空',
  `prompt_version` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '8D 生成提示词版本',
  `agent_version` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Agent 编排实现版本',
  `tool_trace_json` json DEFAULT NULL COMMENT '8D Agent 工具调用轨迹及返回证据',
  `latency_ms` int unsigned DEFAULT NULL COMMENT '本次生成总耗时，单位毫秒',
  `fallback_reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Agent 降级到规则模板的原因',
  `generated_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '本稿生成发起人',
  `generated_at` datetime DEFAULT NULL COMMENT '本稿生成时间',
  `finalized_at` datetime DEFAULT NULL COMMENT '报告定稿时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_report_no` (`report_no`),
  UNIQUE KEY `uk_ppr_report_analysis` (`analysis_id`),
  CONSTRAINT `fk_ppr_report_analysis` FOREIGN KEY (`analysis_id`) REFERENCES `ppr_analysis_run` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR过程异常8D报告';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_eight_d_report`
--

LOCK TABLES `ppr_eight_d_report` WRITE;
/*!40000 ALTER TABLE `ppr_eight_d_report` DISABLE KEYS */;
INSERT INTO `ppr_eight_d_report` VALUES (16,'8D-20261014100255-ELPL',21,'QE-20261117-304WT 批次12121D0051 min_wall_thickness 过程质量异常8D报告','【团队组成与职责分工（姓名与批准人待确认）】\n- 质量工程师（主责，姓名待确认）：8D 主笔与汇总，负责规格限值与观测值自洽性核对、D2/D3/D4 证据整理、隔离范围核定提请、结案确认；对报告结论性表述承担复核把关。\n- 生产领班（姓名待确认）：负责现场处置与运行记录提供，含乙班 12121D0051 生产时序、班次切换、牵引速度设定/反馈记录调阅。\n- 设备工程师（姓名待确认）：负责设备侧数据核对，含 1 号挤出机（EQ-EX-01）温度/压力、1 号牵引机（EQ-HA-01）速度记录，以及真空定径、冷却、口模相关记录是否可调取。\n- 检验员（姓名待确认）：负责留存样管复测与加严检验执行，量具与校准状态回溯，记录最薄点周向角度/截面位置；本次事件记录 no=IR-20261117-004、sample_no=S-513、data_source=MES_IMPORT（导入数据）。\n- 工艺/技术接口（姓名待确认，是否设置待定）：负责供料量—线速度关系与米重、螺杆转速等缺失数据协调。\n【批准与确认】\n- 批准人（待确认）：D3 隔离/复检范围、D5–D7 措施均需质量工程师与生产负责人确认；本报告为草稿，尚无任何签字批准。\n\n【数据事实来源】事件记录（event_no=QE-20261117-304WT，analysis_id=21，run_no=AN-20261014093126-YMY5，规则 R5）、诊断分析（分析意见，非工程师结论）、工程师评审记录（已确认 1 条、已否决 1 条、待验证 4 条）、同批次检验序列（IR-20261117-001~004）、设备窗口记录（ER-...）、同规格参考批次（12121D0050）、指标定义（metric_code=min_wall_thickness）。','【5W2H 问题描述】\n- What（异常是什么）：指标 min_wall_thickness（壁厚，单位 mm）触发规则 R5「连续3点接近区间边界」（风险等级 medium）。规格区间 4.200–4.800 mm，接近带定义为距下限 ≤0.090 mm（区间宽度的 15%）。\n- 观测值：4.285 → 4.270 → 4.255 mm（连续 3 点进入接近带），触发前点 4.320 mm 尚未进入接近带；最新点距下限 0.055 mm，仍在规格区间内。\n- 同批次其他事实：max_wall_thickness 4.430 → 4.395 → 4.380 → 4.365 mm，与最薄点同向下降；代表外径 25.240 → 25.235 → 25.250 → 25.245 mm 基本平稳（外径规格 25.000–25.500 mm）；不圆度 0.220/0.215/0.225/0.210 mm，均低于上限 0.350 mm。\n- Where（在哪里）：1 号挤出机（EQ-EX-01）与 1 号牵引机（EQ-HA-01）相关工序的设备记录窗口内；产品为 PPR S2.5 25×4.2 瓷芯管（spec_id=1）。\n- When（何时）：检验时刻序列（inspect_time）为 2026-11-17T08:15 / 09:20 / 10:25 / 11:30，事件检测时间 detected_at=2026-11-17T11:30:00Z；记录创建时间 2026-10-14T09:26:53Z。\n- Who（涉及谁）：生产班组为乙班（production_group=乙班）；记录来源 data_source=MES_IMPORT。\n- Which（涉及记录与范围）：记录号 IR-20261117-001 / -002 / -003 / -004（样管 S-510 / S-511 / S-512 / S-513）；受影响米数、在制/在库产品范围与暴露时段均为【估算且待核定】，现有工具未返回产量、长度码、库存与出货数据，无法给出数量化影响范围。\n- How（如何被发现）：MES 导入数据（记录 304）在段末产出触发 R5 中风险预警，事件状态 status=analyzing，notified_level 与 notified_at 为空（未登记通知层级与通知时间）。\n- How many（量级与比较）：最薄点 3 点累计下降约 0.065 mm；同规格上一批次 12121D0050（甲班）6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm——该批次为跨批次弱参考（产线、口模/定径套、层结构、配方、速度与测量方法均未确认），不是控制限或最佳工艺窗口。\n【缺口】现有工具未返回产量/长度码、库存与出货、客户投诉、真空/冷却/米重/螺杆转速/原料批次与材料检测数据。','【临时围堵措施（区分已发生与建议待批准）】\n已发生/已执行的事实性动作：\n- 事件已登记（event_no=QE-20261117-304WT，记录 no=IR-20261117-004，样管 S-513），风险等级 medium，状态 analyzing；数据来自 MES_IMPORT。\n- 工程师已完成现场核对动作并留有记录：调阅 1 号牵引机运行记录，异常时段前后牵引反馈上升约 0.5 m/min（设定 12.4→12.9 m/min），螺杆转速与机头压力未见明显变化；样管复测壁厚 3 点 4.26 / 4.27 / 4.25 mm，复现性良好（见 D4 已确认结论）。\n建议待批准（尚未确认已执行，范围由质量工程师最终核定）：\n- 隔离范围：建议对记录 IR-20261117-001~-004 对应取样段及其相邻产出段实施暂扣隔离；具体米数/卷号/库位【估算且待核定】，因缺长度码与库存数据，需由质量工程师会同生产领班按实际产出与库位核定。\n- 加严检验：建议对隔离范围内及后续产出按加严频次复测 min/max 壁厚、外径与不圆度，并记录最薄点周向角度与测量截面，检验频次与抽样数量待质量工程师核定。\n- 记录核对：建议回溯原始检验单、量具与校准记录、MES 导入前原始记录；核对设备运行记录（挤出机与牵引机整点记录）与检验时刻的对齐关系。\n- 可疑时段产品处置：不放行、不报废、不调机——处置方式（返工/让步/报废）尚无授权，待质量工程师与生产负责人按最终根因与实测结果确定。\n【缺口】未返回真空定径、冷却水温/流量、口模与换网记录，上述核对项目中的相关部分暂无数据来源。','【已确认根因（工程师 engineer_decision=confirmed，仅 1 条）】\n结论（诊断分类：设备/生产机理—牵伸—供料关系）：\n- 假设原述：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、壁厚减薄，使 min 与 max 壁厚同步下降。\n- 工程师实际发现（actual_finding）：调阅 1 号牵引机运行记录，异常时段前后牵引反馈上升约 0.5 m/min，螺杆转速与机头压力未见明显变化；样管复测壁厚 3 点均为 4.26/4.27/4.25 mm，复现性良好。\n- 工程师意见（engineer_comment）：现场核对牵引速度设定与反馈记录，异常时段反馈值由 12.4 m/min 升至 12.9 m/min，与壁厚整体下移方向一致。\n【证据边界（必须与上述结论一并阅读）】\n- 该结论由工程师确认，可作为本报告的已确认方向；但诊断卡片原列缺失证据（线速度与螺杆转速/进料量配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间—检验时间对齐换算、口模/定径套与真空设定）在本次工具返回中仍为空，故“影响量级、作用时长、是否唯一主因”尚未量化确认。\n- 时间对齐假设（结论 6，pending）尚未完成，牵引反馈数值（12.4→12.9 m/min）与设备窗口整点记录值（8.214→8.246 m/min）口径/来源不同，二者关系待澄清；因此本确认结论应以“牵引反馈上升与壁厚整体下移方向一致”为限，不外推为已量化的因果关系。\n- 测量侧证据支持复现性：min 壁厚 4.320→4.285→4.270→4.255 mm、max 壁厚同向 4.430→4.365 mm、壁厚跨度 0.110–0.115 mm 基本不变，外径与不圆度平稳，形态更接近整体壁厚水平下移（此形态描述为诊断分析意见，对应结论 2 仍为 pending）。\n\n【已排除/已否决（engineer_decision=rejected，1 条）】\n- 材料机理（原料流动性/黏度或组分变化，如牌号、母料、填料、降解）——予以排除。\n- 工程师否决理由（engineer_comment）：本批次未发生换料或牌号切换，原料入库检验 MFR 与上批一致，缺少支撑材料变化的证据，先予排除。\n- 工程师实际发现（actual_finding）：核对原料批次台账，本批次使用原料批号与上一批次相同，无换料记录。\n【说明】该项被否决仅针对“材料变化”方向；文件未返回 MFR 检测报告、换料台账原文等附件，台账核对结论以工程师填写为准。\n\n【仍待验证假设（engineer_decision=pending，共 4 条；均未经工程师确认，不能作为根因）】\n1) 测量/数据有效性（诊断置信度 0.45）：接近带触发可能部分由测量/取样口径因素贡献，需先确认最薄点定义、量具、测量截面与测量温度。支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，影响因素为挤出量、牵引速度、模具偏心、原料波动；记录 data_source=MES_IMPORT 为导入数据。反向证据：外径差 0.21–0.22 mm、不圆度 0.205–0.225 mm 远低于上限 0.350 mm，壁厚跨度稳定，更像真实壁厚变化；且工程师复测 3 点复现性良好。缺失证据：最薄点周向角度/截面位置与测点数、量具型号与校准状态、测量温度与状态调节时间、是否同一测点重复测量、导入前原始检验记录与抽检频次。建议区分性验证：受控条件下留存样管同截面同量具复测并回溯原始检验单与量具校准记录。\n2) 异常形态与三层对照（诊断置信度 0.6）：“min 与 max 壁厚同向下降、跨度与不圆度基本不变”属整体壁厚水平下移，而非以偏心为主的最薄点单独恶化。缺失证据：周向多点壁厚分布（最薄/最厚点角度）、点 1 之前更早序列与班次切换记录、参考批次 12121D0050 的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。建议区分性验证：留存样管周向 ≥4 点壁厚测量并与前一批次比对。\n3) 定径—冷却—离模行为（诊断置信度 0.25）：外径稳定而壁厚整体下移可用真空定径与冷却冻结强度相对变化或机头/口模出口状态变化解释，暂不能与牵伸假设区分。缺失证据：真空定径设定与实测值、定径套规格与磨损、冷却水温与流量、口模/芯模间隙与同心度、真实熔体温度与熔体压力位置、开机与换网时间点。建议区分性验证：调取同期真空、冷却与口模维护记录与检验时刻对齐，受控窗口内单变量评估。\n4) 时间对齐（诊断置信度 0.5）：设备记录（检验时刻 08:15/09:20/10:25/11:30 的检验序列；设备整点 08:00–15:00）与检验样管是否一一对应尚未建立，参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。缺失证据：线速度与设备出口到测径/取样距离、生产时间戳或长度码打标、检测延迟与取样位置、设备时钟与 MES 时钟一致性核对记录。建议区分性验证：按长度码/生产时间戳抽取指定段样管与同段设备曲线比对。\n\n【6M 归类小结】\n- 原料（Material）：已由工程师否决（无换料，MFR 与上批一致），列为排除项；无新证据前不再展开材料检测。\n- 制程方法（Method）：与已确认方向直接相关（牵引—供料平衡），但作用量级与米重/线速配对证据缺失，属“方向已确认、量级待验证”。\n- 生产设备（Machine）：牵引机反馈上升为已确认发现；真空定径、冷却、口模状态为待验证（工具无该数据，属缺失证据）。\n- 设计（Design）：本次事件未返回产品设计/结构变更信息，无证据支持设计变更参与，亦无法排除，视为未覆盖。\n- 人员（Man）：仅知生产班组为乙班（前一批次为甲班），班次差异与参数设定差异无记录支撑，属未覆盖。\n- 环境（Environment）：工具未返回环境（温湿度、水温、季节）数据，属未覆盖。\n- 边界声明：本次为整体壁厚水平下移形态；是否存在偏心叠加、定径/冷却参与及班次因素，均因缺失证据而不能归因。\n\n【一致性检查与待澄清事项】\n- 诊断卡片 4 的时间对齐暂记 “设备记录 collect_time 整点 08:00–15:00” 与工程师描述的牵引反馈值（12.4→12.9 m/min）同工具返回的 haul_off_speed_mpm（8.214→8.246 m/min）不一致，属口径/来源差异，须由设备工程师澄清后方可写入正式结论。\n- 结论卡 3 的支持证据（外径未随壁厚下降而变小，说明存在定径/供料侧补偿）与结论 4（定径假设证据不足）方向存在张力，均未被确认，待验证。\n- 工程师实际发现与诊断假设未出现方向冲突（均指向“壁厚整体下移 + 牵引反馈上升”），但量级与因果仍待对齐验证。','【永久纠正措施选择（候选，均未选定实施，待批准）】\n候选措施 A（牵引—供料关系方向，对应已确认结论）：\n- 内容：核对并锁定牵引速度设定/反馈的允许波动范围与联动逻辑，评估牵引反馈与挤出机产量（螺杆转速/进料量/米重）的配比控制；将牵引反馈与米重纳入同段配对监控。\n- 选择依据：工程师已确认异常时段牵引反馈上升约 0.5 m/min 且与壁厚整体下移方向一致；但米重、螺杆转速配对数据缺失。\n- 待批准环节：工艺/设备工程师提出参数与监控方案，质量工程师与生产负责人评审；任何调机数值不得由本报告给出，须现场按流程批准后执行。\n候选措施 B（测量与判定口径）：\n- 内容：明确 min_wall_thickness 最薄点的定义、测点数、量具与校准要求、测量温度/状态调节与记录格式（含最薄点周向角度）。\n- 选择依据：该项为 pending 假设 1，且 metric 定义明确“仅最薄点不能代表整体壁厚分布”。\n- 待批准环节：检验/质量部门核定，纳入检验规范。\n候选措施 C（定径/冷却/口模能力评估）：\n- 内容：建立真空定径设定值、定径水温/流量、口模与芯模维护的同期记录留存与异常关联机制。\n- 选择依据：该项为 pending 假设 3，工具未返回相关数据，属证据缺口。\n- 待批准环节：设备工程师与生产负责人确认可采集项后再定实施范围。\n候选措施 D（时间对齐机制）：\n- 内容：推进长度码/生产时间戳与检验样管的对应关系，建立设备时钟与 MES 时钟一致性核对规则。\n- 选择依据：pending 假设 4 指出参数—指标关系在完成对齐前只能作为线索。\n- 待批准环节：设备工程师、检验与 MES 数据管理方联合确认。\n【选择说明】四条候选措施优先级建议：A 与 B 优先（A 有工程师已确认的方向支撑，B 用于先排除测量干扰）；C、D 作为支撑性措施。最终选择、实施范围与顺序待工程师与现场批准，本报告不声称已选定。','【永久纠正措施实施与验证计划（尚无实施验证结果，均待批准）】\n实施步骤（候选，待批准后执行）：\n1) 措施 B 先行：检验人员在受控条件下对留存样管按同一截面、同一量具复测 min/max 壁厚，记录最薄点周向角度、测点数与测量温度；回溯量具校准状态与导入前原始检验记录。责任角色：检验员（主责），质量工程师复核。\n2) 措施 A：按长度码/生产时间戳抽取指定段样管，同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照；先核对，不调机。责任角色：设备工程师 + 工艺接口，生产领班配合。\n3) 措施 C/D：调取同期真空、冷却与口模维护记录并与检验时刻对齐；建立抽样段与设备曲线的配对规则。责任角色：设备工程师，MES 数据管理方配合。\n验证方式与判定口径（待质量工程师核定）：\n- 复测点数与频次：对隔离范围内及后续产出建议至少连续 4 点（与本次 4 点序列同频），必要时加严为每点间隔加采；周向 ≥4 点（候选，具体点数与频次待核定）。\n- 判定口径：min_wall_thickness 与 max_wall_thickness 同时回到参考批次量级（同规格参考 12121D0050 的 min 壁厚 4.395–4.430 mm，仅作弱参考）且不再进入接近带（距下限 >0.090 mm）；外径保持在 25.000–25.500 mm、不圆度 <0.350 mm；牵引反馈与米重配比在设定窗口内。\n- 验证通过条件：加严检验连续多点满足上述口径，且配对设备数据无同向残余趋势；不满足则维持隔离并升级评审。\n【验证结果】尚无实施验证结果；本轮仅工程师完成 1 号牵引机记录调阅与 3 点样管复测（4.26/4.27/4.25 mm），属既有确认结论的现场核对，不构成本计划的实施验证。','【预防再发生（计划性要求，阈值与频次变更待业务确认）】\n- 检验频次：建议在牵引参数调整或班次切换（甲/乙班交接）后一定时间内提高 min/max 壁厚的检验频次，并对最薄点记录周向角度与截面位置；具体频次与持续时间待质量工程师与生产负责人核定。\n- 预警规则阈值：R5 现行接近带为距下限 ≤0.090 mm（区间宽度 15%）、连续 3 点触发，本次已有效预警；建议评估是否增加“单调下降趋势”触发条件（如连续 3 点同向下降且累计降幅超某值），阈值方案与限值调整待业务确认，本报告不设定新阈值。\n- 设备点检标准：建议将牵引速度设定值与反馈值的一致性、牵引反馈趋势纳入班中点检/巡检项目，并留存米重或产量配对数据；点检项目与判定标准待设备工程师与工艺确认。\n- 作业指导书与培训：建议在作业指导书中明确 min_wall_thickness 最薄点测量口径（测点数、截面、量具、状态调节）与记录要求，并在甲/乙班交接时对牵引参数变更进行书面确认与交接培训；文件修订与培训安排待质量与生产确认。\n- 时间对齐基础设施：建议推进长度码/生产时间戳打标与设备时钟—MES 时钟一致性核对机制，使后续事件的参数—指标关系可建立对应关系。\n- 数据完整性：现有记录在真空定径、冷却、米重、螺杆转速、原料批次与产量/库存维度缺项，建议明确采集与留存责任部门（待确认），以支持后续同类事件的快速归因。','【结案条件】\n- 未完成事项清单：① 隔离范围与米数/库位核定（估算待核定）；② 措施 B 的复测量具、截面、最薄点角度与量具校准记录；③ 措施 A 的米重/螺杆转速—牵引速度配对数据；④ 措施 C/D 的真空、冷却、口模记录与时间对齐；⑤ 牵引反馈值（12.4→12.9 m/min）与设备窗口记录值（8.214→8.246 m/min）口径不一致的澄清；⑥ 该缺口数据在措施落实前，事件维持“根因尚未完全量化确认”状态（仅有 1 条已确认方向）。\n- 结案判定：需 D6 验证计划产生实施验证结果并满足判定口径，且上述①②⑤澄清完毕，方可提请结案；结案须经质量工程师与生产负责人确认，姓名与批准人待确认。\n【团队表彰与认可】\n- 认可范围建议：1 号牵引机记录调阅与样管 3 点复测的现场核对工作（由工程师完成并已形成确认结论）；MES 导入数据与本批次检验序列的记录完整性；后续 4 项待验证假设的区分性验证执行团队。\n- 形式与时间待质量工程师与生产负责人安排；本报告为草稿，未获任何批准，不构成放行、报废或最终根因判定依据。','draft','质量平台管理员','agent','deepseek-v4-flash','quality-8d-agent-v1.0','langchain-create-agent-8d-v1','[{\"tool\": \"get_alert_context\", \"input\": {}, \"output\": {\"id\": 746, \"run_no\": \"AN-20261014093126-YMY5\", \"source\": \"engine\", \"status\": \"analyzing\", \"spec_id\": 1, \"summary\": \"事件 QE-20261117-304WT（批次 12121D0051，PPR S2.5 25×4.2 瓷芯管，乙班）由 R5“连续3点接近区间边界”触发，min_wall_thickness 依次为 4.285→4.270→4.255 mm（点1 4.320 尚未进入接近带），下限 4.200 mm，最新点距下限 0.055 mm 且仍在内。形态特征：最小壁厚逐点单调下降约 0.065 mm/3 点，而代表外径（25.235→25.250→25.245）、最大外径、min/max 外径差（约 0.21 mm）、不圆度（0.205–0.225，上限 0.350）基本平稳；max_wall_thickness 同步下降 4.395→4.380→4.365，即最薄点与最厚点同向变薄、壁厚跨度约 0.11–0.115 mm 基本不变，提示整体壁厚水平下移而非偏心加剧。前一批次 12121D0050（甲班）同规格 6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm，为跨批次弱参考（产线、口模/定径套、配方、测量方法未确认）。最有区分度的设备事实：异常时刻前后挤出机温度 204.91→204.46 ℃、压力 12.584→12.719 MPa 缓慢同向变化，牵引速度 8.214→8.246 m/min 缓慢上升，三者与壁厚下降在小时尺度上同向，符合“牵引相对挤出量略升”和/或“黏度/流动阻力变化”方向，但未做生产时间—长度码—检测延迟对齐，不能称为该样管对应参数或因果证据。当前优先验证路径：①产品质量/测量侧自洽性复核（最薄点位置、量具、截面、测量温度、调节时间）；②供料量—线速度关系及壁厚周向分布（区分整体壁厚下移与偏心）；③真空定径、冷却与离模牵伸的能力变化。现有工具无真空、冷却、米重/质量挤出量、螺杆转速、原料批次与材料检测数据，不得据此判定最终根因或给出调机数值。\", \"batch_no\": \"12121D0051\", \"event_no\": \"QE-20261117-304WT\", \"record_no\": \"IR-20261117-004\", \"rule_code\": \"R5\", \"rule_name\": \"连续3点接近区间边界\", \"sample_no\": \"S-513\", \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"created_at\": \"2026-10-14T09:26:53.000Z\", \"ovality_mm\": \"0.210\", \"risk_level\": \"medium\", \"run_status\": \"reviewing\", \"updated_at\": \"2026-10-14T09:31:26.000Z\", \"analysis_id\": 21, \"conclusions\": [{\"id\": 87, \"sort_no\": 1, \"category\": \"测量/数据有效性\", \"evidence\": \"支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，且影响因素列出挤出量、牵引速度、模具偏心、原料波动（get_metric_definition，metric_code=min_wall_thickness）；事件记录的 data_source=MES_IMPORT（记录 304 / IR-20261117-004），为导入数据。反向或不支持证据：四点记录的最大与最小外径差稳定在 0.21–0.22 mm、不圆度 0.205–0.225 mm 均远小于 0.350 mm 上限，且 max/min 壁厚跨度稳定约 0.11 mm，形态上更像真实整体厚度水平变化而非量测跳变；三连点单调下降具有趋势一致性。\", \"confidence\": 0.45, \"hypothesis\": \"当前 min_wall_thickness 的接近带触发可能部分由测量/取样口径因素贡献，而非全部为真实壁厚下降；需先确认最薄点定义、测厚量具、测量截面与测量温度，再谈工艺归因。\", \"actual_finding\": null, \"engineer_comment\": null, \"missing_evidence\": \"最薄点的周向角度/截面位置与测点数、测厚量具型号与校准状态、测量温度与样管状态调节时间、是否同一测点重复测量、原始 MES 导入前的检验记录与抽检频次。\", \"engineer_decision\": \"pending\", \"validation_action\": \"预期伴随信号：若为测量问题，应在相同样管复测或不同量具复测时出现点间差大于工艺可能的 0.005–0.015 mm/点的离散；若为真实趋势，复测应复现 4.28→4.26 量级并保持最薄点位置一致。验证动作：由检验人员在受控条件下对留存样管按同一截面与量具复测，并回溯原始检验单与量具校准记录，记录最薄点角度。\", \"evidence_source_ids\": [\"304\", \"303\", \"302\", \"301\"]}, {\"id\": 88, \"sort_no\": 2, \"category\": \"异常形态与三层对照\", \"evidence\": \"支持证据：同批次序列 min 壁厚 4.320→4.285→4.270→4.255 mm，max 壁厚 4.430→4.395→4.380→4.365 mm，两者同步下降且跨度 0.110→0.115 mm 稳定（记录 301/302/303/304）；外径 25.240→25.235→25.250→25.245 mm、min/max 外径差与不圆度均无明显趋势；三层对照：规格限 4.200–4.800 mm，最新点仍在内但距下限仅 0.055 mm；同规格正常参考（前一批次 12121D0050）6 点 min 壁厚 4.395–4.430 mm（记录 295–300），当前低约 0.14–0.17 mm。反向或不支持证据：参考批次为 12121D0050 甲班，跨批次且未证明同产线、同口模/定径套、同层结构、同配方、同测量方法，不能作为控制限；当前无周向壁厚点位数据，不能排除偏心叠加。\", \"confidence\": 0.6, \"hypothesis\": \"当前事件形态为“min 与 max 壁厚同向单调下降、壁厚跨度与不圆度基本不变”，属于整体壁厚水平下移（相对供料/牵伸/定径冻结状态变化），而非以偏心为主的最薄点单独恶化。\", \"actual_finding\": null, \"engineer_comment\": null, \"missing_evidence\": \"周向多点壁厚分布（尤其最薄点与最厚点角度）、同批次更早（点1 之前）的历史序列与班次切换记录、参考批次的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。\", \"engineer_decision\": \"pending\", \"validation_action\": \"预期伴随信号：若为整体壁厚下移，沿周长多点平均值同步下降且最薄点角度不变；若为偏心，则最薄点固定角度处下降幅显著大于其他点而平均厚度变化较小。验证动作：在受控条件下对留存样管实施周向多点（≥4 点）壁厚测量并与前一批次比对，同时核对同规格参考批次的生产线、口模/定径套与配方信息以决定参考权重。\", \"evidence_source_ids\": [\"301\", \"302\", \"303\", \"304\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\"]}, {\"id\": 89, \"sort_no\": 3, \"category\": \"设备/生产机理（牵伸—供料关系）\", \"evidence\": \"支持证据：异常检验时段内 1 号牵引机速度 8.214→8.222→8.231→8.246 m/min 逐小时缓升（记录 366/367/368/369）；1 号挤出机压力 12.584→12.624→12.666→12.719 MPa 同向缓升、温度 204.91→204.46 ℃ 缓降（记录 390–393）；检验时刻 11:30 与 11:00 设备记录相邻。反向或不支持证据：外径未随壁厚下降而同步变小（25.235→25.250→25.245 mm），若单纯牵伸显著增大通常会伴随外径或周长收缩，说明定径/冷却冻结或供料侧存在补偿；压力上升也可解释为黏度升高或流道阻力增大而非产量增加，现有工具未提供可核对的反向证据。\", \"confidence\": 0.35, \"hypothesis\": \"待验证：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、纵向取向与壁厚减薄，从而使 min 与 max 壁厚同步下降；该方向与牵引速度缓升、压力缓升的同期记录一致，但尚未完成生产时间对齐，不能作为因果确认。\", \"actual_finding\": \"调阅 1 号牵引机运行记录：异常时段前后牵引反馈上升约 0.5 m/min，螺杆转速与机头压力未见明显变化；样管复测壁厚 3 点均为 4.26/4.27/4.25 mm，复现性良好。\", \"engineer_comment\": \"现场核对牵引速度设定与反馈记录，异常时段反馈值由 12.4 m/min 升至 12.9 m/min，与壁厚整体下移方向一致。\", \"missing_evidence\": \"线速度与螺杆转速/进料量的配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间与检验时间的对齐换算、口模/定径套与真空设定。\", \"engineer_decision\": \"confirmed\", \"validation_action\": \"预期伴随信号：若牵伸相对供料上升，应见单位长度米重下降、同长度段产量下降或螺杆转速不变而牵引速度上升；若为黏度/阻力上升，则压力升高的同时熔体温度或机头压差有相应变化而米重变化较小。验证动作：在受控条件下按长度码/生产时间抽取对应段样管同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照，严禁直接调机。\", \"evidence_source_ids\": [\"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\", \"301\", \"302\", \"303\", \"304\"]}, {\"id\": 90, \"sort_no\": 4, \"category\": \"设备/生产机理（定径—冷却—离模行为）\", \"evidence\": \"支持证据：外径 25.235→25.250→25.245 mm 稳定且位于 25.000–25.500 mm 区间中部，不圆度 0.205–0.225 mm 稳定，说明外形成型约束充分；而壁厚同步减薄提示内表面/壁厚方向由供料—牵伸—冻结关系决定（记录 301–304）。反向或不支持证据：现有工具未提供真空度、定径水温/流量、喷淋分布、口模间隙、熔体温度与离模膨胀（get_equipment_window 仅有挤出机温度/压力与牵引速度），无法判断定径能力是否变化；也无证据表明定径异常，故不支持将其列为已确认机制。\", \"confidence\": 0.25, \"hypothesis\": \"待验证：外径保持稳定而壁厚整体下移，可用真空定径与冷却冻结强度相对变化（定径约束补偿了牵伸引起的收缩）或机头/口模出口状态变化解释；现有工具无真空、冷却与口模数据，该假设暂不能与牵伸假设区分。\", \"actual_finding\": null, \"engineer_comment\": null, \"missing_evidence\": \"真空定径设定与实测值、定径套规格与磨损状态、冷却水温与流量、口模/芯模间隙与同心度记录、真实熔体温度与熔体压力位置、开机与换网/换料时间点。\", \"engineer_decision\": \"pending\", \"validation_action\": \"预期伴随信号：若定径或冷却能力变化，应见真空度、定径水温波动或口模出口状态与换网时间相关联，且外形（不圆度、外径）出现同步微变；若仅是牵伸—供料关系，则定径参数应保持稳定。验证动作：调取同期真空、冷却与口模维护记录并与检验时刻对齐，仅在受控工艺窗口内做单一变量评估，任何调整须按现场流程批准。\", \"evidence_source_ids\": [\"301\", \"302\", \"303\", \"304\", \"390\", \"391\", \"392\", \"393\"]}, {\"id\": 91, \"sort_no\": 5, \"category\": \"材料机理\", \"evidence\": \"支持证据：本批次号 12121D0051 与参考批次 12121D0050 不同，且班次由甲班切换为乙班，存在物料/批次或班次变更的弱线索；压力同期缓升而温度缓降，方向上可与黏度升高或流道阻力变化相容（记录 390–397、304）。反向或不支持证据：现有工具未提供任何原料批次、换料记录、MFR、密度、灰分或降解检测数据，也无米重数据；压力缓升同样可由滤网/流道阻力、温度下降或产量变化解释，因此不能把材料变化作为当前证据支持的根因。\", \"confidence\": 0.2, \"hypothesis\": \"待验证：原料流动性/黏度或组分（牌号、母料、填料、降解程度）变化导致挤出量与离模牵伸平衡偏移，从而引起壁厚整体下降；只有在确认外因无法解释且存在换料或批次线索时才应提高其优先级。\", \"actual_finding\": \"核对原料批次台账：本批次使用原料批号与上一批次相同，无换料记录。\", \"engineer_comment\": \"本批次未发生换料或牌号切换，原料入库检验 MFR 与上批一致，缺少支撑材料变化的证据，先予排除。\", \"missing_evidence\": \"本批次与上一批次原料牌号/供应商/批号、换料时间与过渡长度、MFR 与熔体流动对比、DSC 熔融结晶数据、密度与灰分/TGA、外观与炭黑/污染记录。\", \"engineer_decision\": \"rejected\", \"validation_action\": \"预期伴随信号：若为材料流动性变化，应见同工艺条件下的机头压力与米重关系整体平移，且换料前后出现阶跃；若为降解，应见 MFR 异常、色差/气味或模口析出。验证动作：先核对换料与批次切换时间及过渡段取样记录，再按假设选择 MFR 与 DSC（必要时密度/灰分、FTIR）对比留样，避免无差别全套检测。\", \"evidence_source_ids\": [\"304\", \"303\", \"302\", \"301\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\", \"390\", \"393\"]}, {\"id\": 92, \"sort_no\": 6, \"category\": \"时间对齐\", \"evidence\": \"支持证据：检验记录 inspect_time 为 09:20/10:25/11:30/12:35 系列（记录 301–304），设备记录 collect_time 为整点 08:00–15:00（记录 366–373、390–397），两者时间尺度接近但不重合；工具未返回长度码、线速度对应产量、设备到检验点距离或检测延迟。反向或不支持证据：现有工具未提供可核对的反向证据，但也无任何字段能证明对齐成立。\", \"confidence\": 0.5, \"hypothesis\": \"待验证：现有设备记录（1 号挤出机、1 号牵引机逐小时点）与检验样管之间是否存在一一对应关系尚未建立，因此上述参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。\", \"actual_finding\": null, \"engineer_comment\": null, \"missing_evidence\": \"线速度与设备出口到测径/取样的距离、生产时间戳或长度码打标、检测延迟与样管取样位置、设备时钟与 MES 时钟一致性核对记录。\", \"engineer_decision\": \"pending\", \"validation_action\": \"预期伴随信号：若完成对齐，壁厚最薄段应能与某一段螺杆转速/牵引速度记录稳定配对并在重复取样中复现；若无法配对，则应见参数变化与样管指标无稳定对应。验证动作：依据长度码或生产时间戳抽取指定段样管，与同段设备曲线比对；在完成对齐前，所有参数—指标关系仅作为待验证线索记录。\", \"evidence_source_ids\": [\"301\", \"302\", \"303\", \"304\", \"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\"]}], \"data_source\": \"MES_IMPORT\", \"detected_at\": \"2026-11-17T11:30:00.000Z\", \"engine_type\": \"agent\", \"metric_code\": \"min_wall_thickness\", \"notified_at\": null, \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"wall_lower_mm\": \"4.200\", \"wall_upper_mm\": \"4.800\", \"measurement_id\": 304, \"notified_level\": null, \"observed_value\": \"4.2550\", \"outer_lower_mm\": \"25.000\", \"outer_upper_mm\": \"25.500\", \"threshold_text\": \"4.200 mm–4.800 mm，连续 3 点进入接近带（距下限 ≤ 0.090 mm，为区间宽度的 15%）：4.285 / 4.270 / 4.255\", \"ovality_upper_mm\": \"0.350\", \"production_group\": \"乙班\", \"outer_diameter_mm\": \"25.245\", \"analysis_model_name\": \"deepseek-v4-flash\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, \"startedAt\": \"2026-10-14T10:08:38.989Z\", \"durationMs\": 0}, {\"tool\": \"get_diagnosis_result\", \"input\": {}, \"output\": {\"note\": \"diagnosisSummary 是上一步诊断 Agent 的分析意见；只有 engineerDecision=confirmed 的结论可写入 D4 已确认根因。\", \"runNo\": \"AN-20261014093126-YMY5\", \"modelName\": \"deepseek-v4-flash\", \"analysisId\": 21, \"engineType\": \"agent\", \"diagnosisSummary\": \"事件 QE-20261117-304WT（批次 12121D0051，PPR S2.5 25×4.2 瓷芯管，乙班）由 R5“连续3点接近区间边界”触发，min_wall_thickness 依次为 4.285→4.270→4.255 mm（点1 4.320 尚未进入接近带），下限 4.200 mm，最新点距下限 0.055 mm 且仍在内。形态特征：最小壁厚逐点单调下降约 0.065 mm/3 点，而代表外径（25.235→25.250→25.245）、最大外径、min/max 外径差（约 0.21 mm）、不圆度（0.205–0.225，上限 0.350）基本平稳；max_wall_thickness 同步下降 4.395→4.380→4.365，即最薄点与最厚点同向变薄、壁厚跨度约 0.11–0.115 mm 基本不变，提示整体壁厚水平下移而非偏心加剧。前一批次 12121D0050（甲班）同规格 6 点 min 壁厚 4.395–4.430 mm，当前批次整体低约 0.14–0.17 mm，为跨批次弱参考（产线、口模/定径套、配方、测量方法未确认）。最有区分度的设备事实：异常时刻前后挤出机温度 204.91→204.46 ℃、压力 12.584→12.719 MPa 缓慢同向变化，牵引速度 8.214→8.246 m/min 缓慢上升，三者与壁厚下降在小时尺度上同向，符合“牵引相对挤出量略升”和/或“黏度/流动阻力变化”方向，但未做生产时间—长度码—检测延迟对齐，不能称为该样管对应参数或因果证据。当前优先验证路径：①产品质量/测量侧自洽性复核（最薄点位置、量具、截面、测量温度、调节时间）；②供料量—线速度关系及壁厚周向分布（区分整体壁厚下移与偏心）；③真空定径、冷却与离模牵伸的能力变化。现有工具无真空、冷却、米重/质量挤出量、螺杆转速、原料批次与材料检测数据，不得据此判定最终根因或给出调机数值。\", \"pendingConclusions\": [{\"sortNo\": 1, \"category\": \"测量/数据有效性\", \"evidence\": \"支持证据：metric 定义为“仅最薄点不能代表整体壁厚分布”，且影响因素列出挤出量、牵引速度、模具偏心、原料波动（get_metric_definition，metric_code=min_wall_thickness）；事件记录的 data_source=MES_IMPORT（记录 304 / IR-20261117-004），为导入数据。反向或不支持证据：四点记录的最大与最小外径差稳定在 0.21–0.22 mm、不圆度 0.205–0.225 mm 均远小于 0.350 mm 上限，且 max/min 壁厚跨度稳定约 0.11 mm，形态上更像真实整体厚度水平变化而非量测跳变；三连点单调下降具有趋势一致性。\", \"confidence\": 0.45, \"hypothesis\": \"当前 min_wall_thickness 的接近带触发可能部分由测量/取样口径因素贡献，而非全部为真实壁厚下降；需先确认最薄点定义、测厚量具、测量截面与测量温度，再谈工艺归因。\", \"actualFinding\": null, \"engineerComment\": null, \"missingEvidence\": \"最薄点的周向角度/截面位置与测点数、测厚量具型号与校准状态、测量温度与样管状态调节时间、是否同一测点重复测量、原始 MES 导入前的检验记录与抽检频次。\", \"engineerDecision\": \"pending\", \"validationAction\": \"预期伴随信号：若为测量问题，应在相同样管复测或不同量具复测时出现点间差大于工艺可能的 0.005–0.015 mm/点的离散；若为真实趋势，复测应复现 4.28→4.26 量级并保持最薄点位置一致。验证动作：由检验人员在受控条件下对留存样管按同一截面与量具复测，并回溯原始检验单与量具校准记录，记录最薄点角度。\", \"evidenceSourceIds\": [\"304\", \"303\", \"302\", \"301\"]}, {\"sortNo\": 2, \"category\": \"异常形态与三层对照\", \"evidence\": \"支持证据：同批次序列 min 壁厚 4.320→4.285→4.270→4.255 mm，max 壁厚 4.430→4.395→4.380→4.365 mm，两者同步下降且跨度 0.110→0.115 mm 稳定（记录 301/302/303/304）；外径 25.240→25.235→25.250→25.245 mm、min/max 外径差与不圆度均无明显趋势；三层对照：规格限 4.200–4.800 mm，最新点仍在内但距下限仅 0.055 mm；同规格正常参考（前一批次 12121D0050）6 点 min 壁厚 4.395–4.430 mm（记录 295–300），当前低约 0.14–0.17 mm。反向或不支持证据：参考批次为 12121D0050 甲班，跨批次且未证明同产线、同口模/定径套、同层结构、同配方、同测量方法，不能作为控制限；当前无周向壁厚点位数据，不能排除偏心叠加。\", \"confidence\": 0.6, \"hypothesis\": \"当前事件形态为“min 与 max 壁厚同向单调下降、壁厚跨度与不圆度基本不变”，属于整体壁厚水平下移（相对供料/牵伸/定径冻结状态变化），而非以偏心为主的最薄点单独恶化。\", \"actualFinding\": null, \"engineerComment\": null, \"missingEvidence\": \"周向多点壁厚分布（尤其最薄点与最厚点角度）、同批次更早（点1 之前）的历史序列与班次切换记录、参考批次的产线/口模/定径套/配方/速度可比性确认、周向平均壁厚。\", \"engineerDecision\": \"pending\", \"validationAction\": \"预期伴随信号：若为整体壁厚下移，沿周长多点平均值同步下降且最薄点角度不变；若为偏心，则最薄点固定角度处下降幅显著大于其他点而平均厚度变化较小。验证动作：在受控条件下对留存样管实施周向多点（≥4 点）壁厚测量并与前一批次比对，同时核对同规格参考批次的生产线、口模/定径套与配方信息以决定参考权重。\", \"evidenceSourceIds\": [\"301\", \"302\", \"303\", \"304\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\"]}, {\"sortNo\": 4, \"category\": \"设备/生产机理（定径—冷却—离模行为）\", \"evidence\": \"支持证据：外径 25.235→25.250→25.245 mm 稳定且位于 25.000–25.500 mm 区间中部，不圆度 0.205–0.225 mm 稳定，说明外形成型约束充分；而壁厚同步减薄提示内表面/壁厚方向由供料—牵伸—冻结关系决定（记录 301–304）。反向或不支持证据：现有工具未提供真空度、定径水温/流量、喷淋分布、口模间隙、熔体温度与离模膨胀（get_equipment_window 仅有挤出机温度/压力与牵引速度），无法判断定径能力是否变化；也无证据表明定径异常，故不支持将其列为已确认机制。\", \"confidence\": 0.25, \"hypothesis\": \"待验证：外径保持稳定而壁厚整体下移，可用真空定径与冷却冻结强度相对变化（定径约束补偿了牵伸引起的收缩）或机头/口模出口状态变化解释；现有工具无真空、冷却与口模数据，该假设暂不能与牵伸假设区分。\", \"actualFinding\": null, \"engineerComment\": null, \"missingEvidence\": \"真空定径设定与实测值、定径套规格与磨损状态、冷却水温与流量、口模/芯模间隙与同心度记录、真实熔体温度与熔体压力位置、开机与换网/换料时间点。\", \"engineerDecision\": \"pending\", \"validationAction\": \"预期伴随信号：若定径或冷却能力变化，应见真空度、定径水温波动或口模出口状态与换网时间相关联，且外形（不圆度、外径）出现同步微变；若仅是牵伸—供料关系，则定径参数应保持稳定。验证动作：调取同期真空、冷却与口模维护记录并与检验时刻对齐，仅在受控工艺窗口内做单一变量评估，任何调整须按现场流程批准。\", \"evidenceSourceIds\": [\"301\", \"302\", \"303\", \"304\", \"390\", \"391\", \"392\", \"393\"]}, {\"sortNo\": 6, \"category\": \"时间对齐\", \"evidence\": \"支持证据：检验记录 inspect_time 为 09:20/10:25/11:30/12:35 系列（记录 301–304），设备记录 collect_time 为整点 08:00–15:00（记录 366–373、390–397），两者时间尺度接近但不重合；工具未返回长度码、线速度对应产量、设备到检验点距离或检测延迟。反向或不支持证据：现有工具未提供可核对的反向证据，但也无任何字段能证明对齐成立。\", \"confidence\": 0.5, \"hypothesis\": \"待验证：现有设备记录（1 号挤出机、1 号牵引机逐小时点）与检验样管之间是否存在一一对应关系尚未建立，因此上述参数—壁厚同向变化只能视为同批次邻近时刻的相关线索。\", \"actualFinding\": null, \"engineerComment\": null, \"missingEvidence\": \"线速度与设备出口到测径/取样的距离、生产时间戳或长度码打标、检测延迟与样管取样位置、设备时钟与 MES 时钟一致性核对记录。\", \"engineerDecision\": \"pending\", \"validationAction\": \"预期伴随信号：若完成对齐，壁厚最薄段应能与某一段螺杆转速/牵引速度记录稳定配对并在重复取样中复现；若无法配对，则应见参数变化与样管指标无稳定对应。验证动作：依据长度码或生产时间戳抽取指定段样管，与同段设备曲线比对；在完成对齐前，所有参数—指标关系仅作为待验证线索记录。\", \"evidenceSourceIds\": [\"301\", \"302\", \"303\", \"304\", \"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\"]}], \"engineerReviewStats\": {\"total\": 6, \"pending\": 4, \"rejected\": 1, \"confirmed\": 1}, \"rejectedConclusions\": [{\"sortNo\": 5, \"category\": \"材料机理\", \"evidence\": \"支持证据：本批次号 12121D0051 与参考批次 12121D0050 不同，且班次由甲班切换为乙班，存在物料/批次或班次变更的弱线索；压力同期缓升而温度缓降，方向上可与黏度升高或流道阻力变化相容（记录 390–397、304）。反向或不支持证据：现有工具未提供任何原料批次、换料记录、MFR、密度、灰分或降解检测数据，也无米重数据；压力缓升同样可由滤网/流道阻力、温度下降或产量变化解释，因此不能把材料变化作为当前证据支持的根因。\", \"confidence\": 0.2, \"hypothesis\": \"待验证：原料流动性/黏度或组分（牌号、母料、填料、降解程度）变化导致挤出量与离模牵伸平衡偏移，从而引起壁厚整体下降；只有在确认外因无法解释且存在换料或批次线索时才应提高其优先级。\", \"actualFinding\": \"核对原料批次台账：本批次使用原料批号与上一批次相同，无换料记录。\", \"engineerComment\": \"本批次未发生换料或牌号切换，原料入库检验 MFR 与上批一致，缺少支撑材料变化的证据，先予排除。\", \"missingEvidence\": \"本批次与上一批次原料牌号/供应商/批号、换料时间与过渡长度、MFR 与熔体流动对比、DSC 熔融结晶数据、密度与灰分/TGA、外观与炭黑/污染记录。\", \"engineerDecision\": \"rejected\", \"validationAction\": \"预期伴随信号：若为材料流动性变化，应见同工艺条件下的机头压力与米重关系整体平移，且换料前后出现阶跃；若为降解，应见 MFR 异常、色差/气味或模口析出。验证动作：先核对换料与批次切换时间及过渡段取样记录，再按假设选择 MFR 与 DSC（必要时密度/灰分、FTIR）对比留样，避免无差别全套检测。\", \"evidenceSourceIds\": [\"304\", \"303\", \"302\", \"301\", \"295\", \"296\", \"297\", \"298\", \"299\", \"300\", \"390\", \"393\"]}], \"confirmedConclusions\": [{\"sortNo\": 3, \"category\": \"设备/生产机理（牵伸—供料关系）\", \"evidence\": \"支持证据：异常检验时段内 1 号牵引机速度 8.214→8.222→8.231→8.246 m/min 逐小时缓升（记录 366/367/368/369）；1 号挤出机压力 12.584→12.624→12.666→12.719 MPa 同向缓升、温度 204.91→204.46 ℃ 缓降（记录 390–393）；检验时刻 11:30 与 11:00 设备记录相邻。反向或不支持证据：外径未随壁厚下降而同步变小（25.235→25.250→25.245 mm），若单纯牵伸显著增大通常会伴随外径或周长收缩，说明定径/冷却冻结或供料侧存在补偿；压力上升也可解释为黏度升高或流道阻力增大而非产量增加，现有工具未提供可核对的反向证据。\", \"confidence\": 0.35, \"hypothesis\": \"待验证：牵引线速相对挤出量略升（或单位时间挤出量略降）导致离模牵伸增大、纵向取向与壁厚减薄，从而使 min 与 max 壁厚同步下降；该方向与牵引速度缓升、压力缓升的同期记录一致，但尚未完成生产时间对齐，不能作为因果确认。\", \"actualFinding\": \"调阅 1 号牵引机运行记录：异常时段前后牵引反馈上升约 0.5 m/min，螺杆转速与机头压力未见明显变化；样管复测壁厚 3 点均为 4.26/4.27/4.25 mm，复现性良好。\", \"engineerComment\": \"现场核对牵引速度设定与反馈记录，异常时段反馈值由 12.4 m/min 升至 12.9 m/min，与壁厚整体下移方向一致。\", \"missingEvidence\": \"线速度与螺杆转速/进料量的配对记录、米重或质量挤出量、产量与长度码、设备到检测点距离与检测延迟、生产时间与检验时间的对齐换算、口模/定径套与真空设定。\", \"engineerDecision\": \"confirmed\", \"validationAction\": \"预期伴随信号：若牵伸相对供料上升，应见单位长度米重下降、同长度段产量下降或螺杆转速不变而牵引速度上升；若为黏度/阻力上升，则压力升高的同时熔体温度或机头压差有相应变化而米重变化较小。验证动作：在受控条件下按长度码/生产时间抽取对应段样管同步测米重、外径与周向平均壁厚，并调取同段螺杆转速与进料量记录做对照，严禁直接调机。\", \"evidenceSourceIds\": [\"366\", \"367\", \"368\", \"369\", \"390\", \"391\", \"392\", \"393\", \"301\", \"302\", \"303\", \"304\"]}]}, \"startedAt\": \"2026-10-14T10:08:38.989Z\", \"durationMs\": 0}, {\"tool\": \"get_batch_measurements\", \"input\": {\"limit\": 10}, \"output\": [{\"id\": 304, \"remark\": \"点4 壁厚4.255 距下限0.055 → 接近带（第3点）→ 段末产出R5中风险\", \"record_no\": \"IR-20261117-004\", \"sample_no\": \"S-513\", \"ovality_mm\": \"0.210\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T11:30:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.365\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.255\"}, {\"id\": 303, \"remark\": \"点3 壁厚4.270 距下限0.070 → 接近带（第2点）\", \"record_no\": \"IR-20261117-003\", \"sample_no\": \"S-512\", \"ovality_mm\": \"0.225\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T10:25:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.250\", \"max_outer_diameter_mm\": \"25.400\", \"max_wall_thickness_mm\": \"4.380\", \"min_outer_diameter_mm\": \"25.175\", \"min_wall_thickness_mm\": \"4.270\"}, {\"id\": 302, \"remark\": \"点2 壁厚4.285 距下限0.085 → 进入接近带（第1点）\", \"record_no\": \"IR-20261117-002\", \"sample_no\": \"S-511\", \"ovality_mm\": \"0.215\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T09:20:00.000Z\", \"quality_flag\": \"medium\", \"outer_diameter_mm\": \"25.235\", \"max_outer_diameter_mm\": \"25.378\", \"max_wall_thickness_mm\": \"4.395\", \"min_outer_diameter_mm\": \"25.163\", \"min_wall_thickness_mm\": \"4.285\"}, {\"id\": 301, \"remark\": \"点1 壁厚4.320 距下限0.120，未进接近带\", \"record_no\": \"IR-20261117-001\", \"sample_no\": \"S-510\", \"ovality_mm\": \"0.220\", \"data_source\": \"MES_IMPORT\", \"inspect_time\": \"2026-11-17T08:15:00.000Z\", \"quality_flag\": \"normal\", \"outer_diameter_mm\": \"25.240\", \"max_outer_diameter_mm\": \"25.387\", \"max_wall_thickness_mm\": \"4.430\", \"min_outer_diameter_mm\": \"25.167\", \"min_wall_thickness_mm\": \"4.320\"}], \"startedAt\": \"2026-10-14T10:08:39.902Z\", \"durationMs\": 3}, {\"tool\": \"get_reference_measurements\", \"input\": {\"limit\": 15}, \"output\": [{\"id\": 300, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-006\", \"ovality_mm\": \"0.210\", \"inspect_time\": \"2026-11-16T13:40:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.230\", \"max_outer_diameter_mm\": \"25.370\", \"max_wall_thickness_mm\": \"4.510\", \"min_outer_diameter_mm\": \"25.160\", \"min_wall_thickness_mm\": \"4.400\"}, {\"id\": 299, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-005\", \"ovality_mm\": \"0.220\", \"inspect_time\": \"2026-11-16T12:35:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.250\", \"max_outer_diameter_mm\": \"25.397\", \"max_wall_thickness_mm\": \"4.525\", \"min_outer_diameter_mm\": \"25.177\", \"min_wall_thickness_mm\": \"4.415\"}, {\"id\": 298, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-004\", \"ovality_mm\": \"0.230\", \"inspect_time\": \"2026-11-16T11:30:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.240\", \"max_outer_diameter_mm\": \"25.393\", \"max_wall_thickness_mm\": \"4.505\", \"min_outer_diameter_mm\": \"25.163\", \"min_wall_thickness_mm\": \"4.395\"}, {\"id\": 297, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-003\", \"ovality_mm\": \"0.205\", \"inspect_time\": \"2026-11-16T10:25:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.255\", \"max_outer_diameter_mm\": \"25.392\", \"max_wall_thickness_mm\": \"4.540\", \"min_outer_diameter_mm\": \"25.187\", \"min_wall_thickness_mm\": \"4.430\"}, {\"id\": 296, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-002\", \"ovality_mm\": \"0.225\", \"inspect_time\": \"2026-11-16T09:20:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.235\", \"max_outer_diameter_mm\": \"25.385\", \"max_wall_thickness_mm\": \"4.515\", \"min_outer_diameter_mm\": \"25.160\", \"min_wall_thickness_mm\": \"4.405\"}, {\"id\": 295, \"batch_no\": \"12121D0050\", \"record_no\": \"IR-20261116-001\", \"ovality_mm\": \"0.215\", \"inspect_time\": \"2026-11-16T08:15:00.000Z\", \"quality_flag\": \"normal\", \"production_group\": \"甲班\", \"outer_diameter_mm\": \"25.245\", \"max_outer_diameter_mm\": \"25.388\", \"max_wall_thickness_mm\": \"4.530\", \"min_outer_diameter_mm\": \"25.173\", \"min_wall_thickness_mm\": \"4.420\"}], \"startedAt\": \"2026-10-14T10:08:39.902Z\", \"durationMs\": 5}, {\"tool\": \"get_metric_definition\", \"input\": {}, \"output\": {\"code\": \"min_wall_thickness\", \"name\": \"壁厚\", \"unit\": \"mm\", \"spec_id\": 1, \"spec_name\": \"PPR S2.5 25×4.2 瓷芯管\", \"influences\": \"挤出量、牵引速度、模具偏心、原料波动\", \"description\": \"仅最薄点不能代表整体壁厚分布\", \"lower_limit\": \"4.200\", \"metric_code\": \"min_wall_thickness\", \"upper_limit\": \"4.800\", \"limit_source\": \"产品规格（ppr_product_spec）标准限值\"}, \"startedAt\": \"2026-10-14T10:08:39.903Z\", \"durationMs\": 5}, {\"tool\": \"get_equipment_window\", \"input\": {\"windowMinutes\": 240}, \"output\": [{\"id\": 390, \"remark\": null, \"record_no\": \"ER-20261014093020-N5C6\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T08:00:00.000Z\", \"pressure_mpa\": \"12.584\", \"temperature_c\": \"204.91\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 366, \"remark\": null, \"record_no\": \"ER-20261014092947-B3F8\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T08:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.214\"}, {\"id\": 391, \"remark\": null, \"record_no\": \"ER-20261014093020-4EJ2\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T09:00:00.000Z\", \"pressure_mpa\": \"12.624\", \"temperature_c\": \"204.69\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 367, \"remark\": null, \"record_no\": \"ER-20261014092947-J0WP\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T09:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.222\"}, {\"id\": 392, \"remark\": null, \"record_no\": \"ER-20261014093020-Z9N8\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T10:00:00.000Z\", \"pressure_mpa\": \"12.666\", \"temperature_c\": \"204.54\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 368, \"remark\": null, \"record_no\": \"ER-20261014092947-L6DR\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T10:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.231\"}, {\"id\": 393, \"remark\": null, \"record_no\": \"ER-20261014093020-DMZS\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T11:00:00.000Z\", \"pressure_mpa\": \"12.719\", \"temperature_c\": \"204.46\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 369, \"remark\": null, \"record_no\": \"ER-20261014092947-WLCY\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T11:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.246\"}, {\"id\": 394, \"remark\": null, \"record_no\": \"ER-20261014093020-3KEK\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T12:00:00.000Z\", \"pressure_mpa\": \"12.758\", \"temperature_c\": \"204.36\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 370, \"remark\": null, \"record_no\": \"ER-20261014092947-PCDY\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T12:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.260\"}, {\"id\": 395, \"remark\": null, \"record_no\": \"ER-20261014093020-CR4M\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T13:00:00.000Z\", \"pressure_mpa\": \"12.743\", \"temperature_c\": \"204.33\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 371, \"remark\": null, \"record_no\": \"ER-20261014092947-QUVS\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T13:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.259\"}, {\"id\": 396, \"remark\": null, \"record_no\": \"ER-20261014093020-Y0DK\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T14:00:00.000Z\", \"pressure_mpa\": \"12.698\", \"temperature_c\": \"204.42\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 372, \"remark\": null, \"record_no\": \"ER-20261014092947-61Z0\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T14:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.244\"}, {\"id\": 397, \"remark\": null, \"record_no\": \"ER-20261014093020-RNH1\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T15:00:00.000Z\", \"pressure_mpa\": \"12.636\", \"temperature_c\": \"204.67\", \"equipment_code\": \"EQ-EX-01\", \"equipment_name\": \"1号挤出机\", \"equipment_type\": \"挤出机\", \"haul_off_speed_mpm\": null}, {\"id\": 373, \"remark\": null, \"record_no\": \"ER-20261014092947-DLJ7\", \"data_source\": \"Excel导入\", \"collect_time\": \"2026-11-17T15:00:00.000Z\", \"pressure_mpa\": null, \"temperature_c\": null, \"equipment_code\": \"EQ-HA-01\", \"equipment_name\": \"1号牵引机\", \"equipment_type\": \"牵引机\", \"haul_off_speed_mpm\": \"8.226\"}], \"startedAt\": \"2026-10-14T10:08:39.902Z\", \"durationMs\": 7}]',32585,NULL,'质量平台管理员','2026-10-14 10:09:10',NULL,'2026-10-14 10:02:55','2026-10-14 10:13:28');
/*!40000 ALTER TABLE `ppr_eight_d_report` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_equipment`
--

DROP TABLE IF EXISTS `ppr_equipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_equipment` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备编码，全局唯一',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备名称',
  `type_id` bigint unsigned NOT NULL COMMENT '设备类型ID',
  `line_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属产线或工段名称',
  `status` enum('enabled','disabled','maintenance') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled' COMMENT '设备状态：启用、停用、检修',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备说明',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_equipment_code` (`code`),
  KEY `idx_ppr_equipment_type` (`type_id`),
  CONSTRAINT `fk_ppr_equipment_type` FOREIGN KEY (`type_id`) REFERENCES `ppr_equipment_type` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR生产设备台账';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_equipment`
--

LOCK TABLES `ppr_equipment` WRITE;
/*!40000 ALTER TABLE `ppr_equipment` DISABLE KEYS */;
INSERT INTO `ppr_equipment` VALUES (1,'EQ-EX-01','1号挤出机',1,'演示线 A','enabled','PPR管材主挤出设备','2026-10-13 01:36:53','2026-10-13 01:36:53'),(2,'EQ-HA-01','1号牵引机',2,'演示线 A','enabled','PPR管材牵引设备','2026-10-13 01:36:53','2026-10-13 01:36:53');
/*!40000 ALTER TABLE `ppr_equipment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_equipment_reading`
--

DROP TABLE IF EXISTS `ppr_equipment_reading`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_equipment_reading` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `record_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备采集记录编号，全局唯一',
  `batch_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '生产批次号，与产品检验数据按批次号关联',
  `equipment_id` bigint unsigned NOT NULL COMMENT '采集设备ID',
  `collect_time` datetime NOT NULL COMMENT '设备数据采集时间',
  `temperature_c` decimal(10,2) DEFAULT NULL COMMENT '温度，单位摄氏度',
  `pressure_mpa` decimal(10,3) DEFAULT NULL COMMENT '压力，单位MPa',
  `haul_off_speed_mpm` decimal(10,3) DEFAULT NULL COMMENT '牵引速度，单位m/min',
  `data_source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCADA' COMMENT '设备数据来源系统',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采集备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_equipment_reading_no` (`record_no`),
  UNIQUE KEY `uk_ppr_equipment_reading_equipment_batch_time` (`equipment_id`,`batch_no`,`collect_time`),
  KEY `idx_ppr_equipment_reading_equipment` (`equipment_id`),
  KEY `idx_ppr_equipment_reading_batch_time` (`batch_no`,`collect_time`),
  CONSTRAINT `fk_ppr_reading_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `ppr_equipment` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=412 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR设备工艺参数采集数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_equipment_reading`
--

LOCK TABLES `ppr_equipment_reading` WRITE;
/*!40000 ALTER TABLE `ppr_equipment_reading` DISABLE KEYS */;
INSERT INTO `ppr_equipment_reading` VALUES (364,'ER-20261014092947-097A','12121D0051',2,'2026-11-17 06:00:00',NULL,NULL,8.197,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(365,'ER-20261014092947-O8QI','12121D0051',2,'2026-11-17 07:00:00',NULL,NULL,8.206,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(366,'ER-20261014092947-B3F8','12121D0051',2,'2026-11-17 08:00:00',NULL,NULL,8.214,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(367,'ER-20261014092947-J0WP','12121D0051',2,'2026-11-17 09:00:00',NULL,NULL,8.222,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(368,'ER-20261014092947-L6DR','12121D0051',2,'2026-11-17 10:00:00',NULL,NULL,8.231,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(369,'ER-20261014092947-WLCY','12121D0051',2,'2026-11-17 11:00:00',NULL,NULL,8.246,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(370,'ER-20261014092947-PCDY','12121D0051',2,'2026-11-17 12:00:00',NULL,NULL,8.260,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(371,'ER-20261014092947-QUVS','12121D0051',2,'2026-11-17 13:00:00',NULL,NULL,8.259,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(372,'ER-20261014092947-61Z0','12121D0051',2,'2026-11-17 14:00:00',NULL,NULL,8.244,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(373,'ER-20261014092947-DLJ7','12121D0051',2,'2026-11-17 15:00:00',NULL,NULL,8.226,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(374,'ER-20261014092947-ROWI','12121D0051',2,'2026-11-17 16:00:00',NULL,NULL,8.213,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(375,'ER-20261014092947-VJ5N','12121D0051',2,'2026-11-17 17:00:00',NULL,NULL,8.208,'Excel导入',NULL,'2026-10-14 09:29:47','2026-10-14 09:29:47'),(376,'ER-20261014092959-U3DL','12121D0050',2,'2026-11-16 06:00:00',NULL,NULL,8.197,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(377,'ER-20261014092959-QK3J','12121D0050',2,'2026-11-16 07:00:00',NULL,NULL,8.210,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(378,'ER-20261014092959-B3PQ','12121D0050',2,'2026-11-16 08:00:00',NULL,NULL,8.198,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(379,'ER-20261014092959-QSQP','12121D0050',2,'2026-11-16 09:00:00',NULL,NULL,8.210,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(380,'ER-20261014092959-C4Y9','12121D0050',2,'2026-11-16 10:00:00',NULL,NULL,8.192,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(381,'ER-20261014092959-T8AC','12121D0050',2,'2026-11-16 11:00:00',NULL,NULL,8.204,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(382,'ER-20261014092959-E9AF','12121D0050',2,'2026-11-16 12:00:00',NULL,NULL,8.203,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(383,'ER-20261014092959-T78E','12121D0050',2,'2026-11-16 13:00:00',NULL,NULL,8.196,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(384,'ER-20261014092959-QOLE','12121D0050',2,'2026-11-16 14:00:00',NULL,NULL,8.204,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(385,'ER-20261014092959-908I','12121D0050',2,'2026-11-16 15:00:00',NULL,NULL,8.196,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(386,'ER-20261014092959-H94U','12121D0050',2,'2026-11-16 16:00:00',NULL,NULL,8.205,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(387,'ER-20261014092959-FZPC','12121D0050',2,'2026-11-16 17:00:00',NULL,NULL,8.200,'Excel导入',NULL,'2026-10-14 09:29:59','2026-10-14 09:29:59'),(388,'ER-20261014093020-4Y9L','12121D0051',1,'2026-11-17 06:00:00',205.05,12.553,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(389,'ER-20261014093020-LUFN','12121D0051',1,'2026-11-17 07:00:00',205.06,12.553,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(390,'ER-20261014093020-N5C6','12121D0051',1,'2026-11-17 08:00:00',204.91,12.584,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(391,'ER-20261014093020-4EJ2','12121D0051',1,'2026-11-17 09:00:00',204.69,12.624,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(392,'ER-20261014093020-Z9N8','12121D0051',1,'2026-11-17 10:00:00',204.54,12.666,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(393,'ER-20261014093020-DMZS','12121D0051',1,'2026-11-17 11:00:00',204.46,12.719,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(394,'ER-20261014093020-3KEK','12121D0051',1,'2026-11-17 12:00:00',204.36,12.758,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(395,'ER-20261014093020-CR4M','12121D0051',1,'2026-11-17 13:00:00',204.33,12.743,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(396,'ER-20261014093020-Y0DK','12121D0051',1,'2026-11-17 14:00:00',204.42,12.698,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(397,'ER-20261014093020-RNH1','12121D0051',1,'2026-11-17 15:00:00',204.67,12.636,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(398,'ER-20261014093020-JL52','12121D0051',1,'2026-11-17 16:00:00',204.90,12.594,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(399,'ER-20261014093020-Q82F','12121D0051',1,'2026-11-17 17:00:00',205.01,12.564,NULL,'Excel导入',NULL,'2026-10-14 09:30:20','2026-10-14 09:30:20'),(400,'ER-20261014093039-8HLL','12121D0050',1,'2026-11-16 06:00:00',205.03,12.548,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(401,'ER-20261014093039-85W5','12121D0050',1,'2026-11-16 07:00:00',205.10,12.565,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(402,'ER-20261014093039-RQP4','12121D0050',1,'2026-11-16 08:00:00',204.98,12.546,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(403,'ER-20261014093039-IG02','12121D0050',1,'2026-11-16 09:00:00',205.00,12.564,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(404,'ER-20261014093039-I61E','12121D0050',1,'2026-11-16 10:00:00',204.94,12.536,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(405,'ER-20261014093039-B56Y','12121D0050',1,'2026-11-16 11:00:00',205.09,12.555,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(406,'ER-20261014093039-HF6F','12121D0050',1,'2026-11-16 12:00:00',205.07,12.555,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(407,'ER-20261014093039-Y66M','12121D0050',1,'2026-11-16 13:00:00',204.95,12.541,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(408,'ER-20261014093039-IO5P','12121D0050',1,'2026-11-16 14:00:00',204.97,12.557,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(409,'ER-20261014093039-ZVER','12121D0050',1,'2026-11-16 15:00:00',204.97,12.546,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(410,'ER-20261014093039-QJGA','12121D0050',1,'2026-11-16 16:00:00',205.10,12.559,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39'),(411,'ER-20261014093039-RV4G','12121D0050',1,'2026-11-16 17:00:00',205.03,12.548,NULL,'Excel导入',NULL,'2026-10-14 09:30:39','2026-10-14 09:30:39');
/*!40000 ALTER TABLE `ppr_equipment_reading` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_equipment_type`
--

DROP TABLE IF EXISTS `ppr_equipment_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_equipment_type` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备类型编码，全局唯一',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备类型名称',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备类型说明',
  `status` enum('enabled','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_equipment_type_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR设备类型主数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_equipment_type`
--

LOCK TABLES `ppr_equipment_type` WRITE;
/*!40000 ALTER TABLE `ppr_equipment_type` DISABLE KEYS */;
INSERT INTO `ppr_equipment_type` VALUES (1,'ETYPE-EXTRUDER','挤出机','负责塑化与挤出成型，采集温度与压力','enabled','2026-10-13 01:36:53','2026-10-14 01:24:32'),(2,'ETYPE-HAULOFF','牵引机','负责稳定牵引速度，采集牵引速度','enabled','2026-10-13 01:36:53','2026-10-14 01:24:32');
/*!40000 ALTER TABLE `ppr_equipment_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_metric`
--

DROP TABLE IF EXISTS `ppr_metric`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_metric` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '指标编码，全局唯一',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '指标名称',
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计量单位',
  `lower_limit` decimal(12,4) DEFAULT NULL COMMENT '已弃用：判定限值统一取产品规格表 ppr_product_spec，本列仅留有历史数据',
  `upper_limit` decimal(12,4) DEFAULT NULL COMMENT '已弃用：判定限值统一取产品规格表 ppr_product_spec，本列仅留有历史数据',
  `influences` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '可能影响因素，仅作为排查方向',
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '指标口径与说明',
  `status` enum('enabled','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_metric_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR质量指标与影响因素字典';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_metric`
--

LOCK TABLES `ppr_metric` WRITE;
/*!40000 ALTER TABLE `ppr_metric` DISABLE KEYS */;
INSERT INTO `ppr_metric` VALUES (1,'outer_diameter','外径','mm',25.0000,25.5000,'定径套、真空度、冷却水温、牵引速度','测量管材外径；正式判定以适用标准和产品规格为准','enabled','2026-10-13 01:36:53','2026-10-13 01:36:53'),(2,'min_wall_thickness','壁厚','mm',4.2000,4.8000,'挤出量、牵引速度、模具偏心、原料波动','仅最薄点不能代表整体壁厚分布','enabled','2026-10-13 01:36:53','2026-10-13 06:21:56'),(3,'ovality','不圆度','mm',0.0000,0.3500,'定径冷却、支撑、牵引、测量截面','同一样管同一截面最大外径减最小外径','enabled','2026-10-13 01:36:53','2026-10-13 01:36:53');
/*!40000 ALTER TABLE `ppr_metric` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_product_category`
--

DROP TABLE IF EXISTS `ppr_product_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_product_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品类别编码，全局唯一',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品类别名称',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品类别说明',
  `status` enum('enabled','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_product_category_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品类别主数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_product_category`
--

LOCK TABLES `ppr_product_category` WRITE;
/*!40000 ALTER TABLE `ppr_product_category` DISABLE KEYS */;
INSERT INTO `ppr_product_category` VALUES (1,'CAT-PPR','PPR 管材','无规共聚聚丙烯管材','enabled','2026-10-13 01:36:53','2026-10-13 01:36:53');
/*!40000 ALTER TABLE `ppr_product_category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_product_measurement`
--

DROP TABLE IF EXISTS `ppr_product_measurement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_product_measurement` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `record_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '检验记录编号，全局唯一',
  `sample_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '样管编号',
  `batch_no` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '生产批次号，与设备采集数据按批次号关联',
  `spec_id` bigint unsigned NOT NULL COMMENT '产品规格ID，判定限值来源',
  `production_group` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '生产组别，来自产品数据导入',
  `batch_start_time` datetime DEFAULT NULL COMMENT '批次开始时间，来自产品数据导入',
  `inspect_time` datetime NOT NULL COMMENT '检验时间',
  `outer_diameter_mm` decimal(10,3) DEFAULT NULL COMMENT '外径测量值，单位mm',
  `min_wall_thickness_mm` decimal(10,3) DEFAULT NULL COMMENT '壁厚，单位mm',
  `max_wall_thickness_mm` decimal(10,3) DEFAULT NULL COMMENT '最大壁厚，单位mm',
  `max_outer_diameter_mm` decimal(10,3) DEFAULT NULL COMMENT '同截面最大外径，单位mm',
  `min_outer_diameter_mm` decimal(10,3) DEFAULT NULL COMMENT '同截面最小外径，单位mm',
  `ovality_mm` decimal(10,3) DEFAULT NULL COMMENT '不圆度，通常为最大外径减最小外径，单位mm',
  `data_source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'QMS' COMMENT '数据来源系统，如QMS、MES或人工导入',
  `quality_flag` enum('normal','medium','high','error') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '质量标记：正常、中风险、高风险、数据错误',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '检验备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_measurement_record_no` (`record_no`),
  KEY `idx_ppr_measurement_spec_time` (`spec_id`,`inspect_time`),
  KEY `idx_ppr_measurement_batch_time` (`batch_no`,`inspect_time`)
) ENGINE=InnoDB AUTO_INCREMENT=307 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品检验数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_product_measurement`
--

LOCK TABLES `ppr_product_measurement` WRITE;
/*!40000 ALTER TABLE `ppr_product_measurement` DISABLE KEYS */;
INSERT INTO `ppr_product_measurement` VALUES (295,'IR-20261116-001','S-500','12121D0050',1,'甲班','2026-11-16 06:00:00','2026-11-16 08:15:00',25.245,4.420,4.530,25.388,25.173,0.215,'MES_IMPORT','normal','点1 三指标均在区间中段','2026-10-14 09:26:34','2026-10-14 09:26:34'),(296,'IR-20261116-002','S-501','12121D0050',1,'甲班','2026-11-16 06:00:00','2026-11-16 09:20:00',25.235,4.405,4.515,25.385,25.160,0.225,'MES_IMPORT','normal','点2 正常','2026-10-14 09:26:34','2026-10-14 09:26:34'),(297,'IR-20261116-003','S-502','12121D0050',1,'甲班','2026-11-16 06:00:00','2026-11-16 10:25:00',25.255,4.430,4.540,25.392,25.187,0.205,'MES_IMPORT','normal','点3 正常','2026-10-14 09:26:34','2026-10-14 09:26:34'),(298,'IR-20261116-004','S-503','12121D0050',1,'甲班','2026-11-16 06:00:00','2026-11-16 11:30:00',25.240,4.395,4.505,25.393,25.163,0.230,'MES_IMPORT','normal','点4 正常','2026-10-14 09:26:34','2026-10-14 09:26:34'),(299,'IR-20261116-005','S-504','12121D0050',1,'甲班','2026-11-16 06:00:00','2026-11-16 12:35:00',25.250,4.415,4.525,25.397,25.177,0.220,'MES_IMPORT','normal','点5 正常','2026-10-14 09:26:34','2026-10-14 09:26:34'),(300,'IR-20261116-006','S-505','12121D0050',1,'甲班','2026-11-16 06:00:00','2026-11-16 13:40:00',25.230,4.400,4.510,25.370,25.160,0.210,'MES_IMPORT','normal','点6 正常','2026-10-14 09:26:34','2026-10-14 09:26:34'),(301,'IR-20261117-001','S-510','12121D0051',1,'乙班','2026-11-17 06:00:00','2026-11-17 08:15:00',25.240,4.320,4.430,25.387,25.167,0.220,'MES_IMPORT','normal','点1 壁厚4.320 距下限0.120，未进接近带','2026-10-14 09:26:53','2026-10-14 09:26:53'),(302,'IR-20261117-002','S-511','12121D0051',1,'乙班','2026-11-17 06:00:00','2026-11-17 09:20:00',25.235,4.285,4.395,25.378,25.163,0.215,'MES_IMPORT','medium','点2 壁厚4.285 距下限0.085 → 进入接近带（第1点）','2026-10-14 09:26:53','2026-10-14 09:26:53'),(303,'IR-20261117-003','S-512','12121D0051',1,'乙班','2026-11-17 06:00:00','2026-11-17 10:25:00',25.250,4.270,4.380,25.400,25.175,0.225,'MES_IMPORT','medium','点3 壁厚4.270 距下限0.070 → 接近带（第2点）','2026-10-14 09:26:53','2026-10-14 09:26:53'),(304,'IR-20261117-004','S-513','12121D0051',1,'乙班','2026-11-17 06:00:00','2026-11-17 11:30:00',25.245,4.255,4.365,25.385,25.175,0.210,'MES_IMPORT','medium','点4 壁厚4.255 距下限0.055 → 接近带（第3点）→ 段末产出R5中风险','2026-10-14 09:26:53','2026-10-14 09:26:53'),(305,'IR-20261117-005','S-514','12121D0051',1,'乙班','2026-11-17 06:00:00','2026-11-17 12:35:00',25.238,4.360,4.470,25.385,25.165,0.220,'MES_IMPORT','normal','点5 壁厚回到4.360，连续段中断','2026-10-14 09:26:53','2026-10-14 09:26:53'),(306,'IR-20261117-006','S-515','12121D0051',1,'乙班','2026-11-17 06:00:00','2026-11-17 13:40:00',25.252,4.400,4.510,25.395,25.180,0.215,'MES_IMPORT','normal','点6 正常','2026-10-14 09:26:53','2026-10-14 09:26:53');
/*!40000 ALTER TABLE `ppr_product_measurement` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ppr_product_spec`
--

DROP TABLE IF EXISTS `ppr_product_spec`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppr_product_spec` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键，自增编号',
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品规格编码，全局唯一',
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品规格名称',
  `category_id` bigint unsigned NOT NULL COMMENT '所属产品类别ID',
  `outer_diameter_mm` decimal(10,3) DEFAULT NULL COMMENT '公称外径（历史字段，界面已改用最大/最小外径），单位mm',
  `wall_thickness_mm` decimal(10,3) DEFAULT NULL COMMENT '公称壁厚（历史字段，界面已改用最大/最小壁厚），单位mm',
  `outer_lower_mm` decimal(10,3) NOT NULL COMMENT '外径下限，界面显示为「最小外径」，单位mm',
  `outer_upper_mm` decimal(10,3) NOT NULL COMMENT '外径上限，界面显示为「最大外径」，单位mm',
  `wall_lower_mm` decimal(10,3) NOT NULL COMMENT '壁厚下限，界面显示为「最小壁厚」，单位mm',
  `wall_upper_mm` decimal(10,3) NOT NULL COMMENT '壁厚上限，界面显示为「最大壁厚」，单位mm',
  `ovality_upper_mm` decimal(10,3) NOT NULL COMMENT '不圆度演示上限，单位mm',
  `status` enum('enabled','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled启用、disabled停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppr_product_spec_code` (`code`),
  KEY `idx_ppr_product_spec_category` (`category_id`),
  CONSTRAINT `fk_ppr_product_spec_category` FOREIGN KEY (`category_id`) REFERENCES `ppr_product_category` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPR产品规格主数据与演示限值';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ppr_product_spec`
--

LOCK TABLES `ppr_product_spec` WRITE;
/*!40000 ALTER TABLE `ppr_product_spec` DISABLE KEYS */;
INSERT INTO `ppr_product_spec` VALUES (1,'SPEC-25X4.2','PPR S2.5 25×4.2 瓷芯管',1,25.000,4.200,25.000,25.500,4.200,4.800,0.350,'enabled','2026-10-13 01:36:53','2026-10-13 01:36:53');
/*!40000 ALTER TABLE `ppr_product_spec` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `private_messages`
--

DROP TABLE IF EXISTS `private_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `private_messages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL,
  `sender_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `receiver_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `private_messages_conversation_id_idx` (`conversation_id`),
  KEY `private_messages_sender_id_idx` (`sender_id`),
  KEY `private_messages_receiver_id_idx` (`receiver_id`),
  CONSTRAINT `private_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `private_messages_receiver_id_fkey` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `private_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `private_messages`
--

LOCK TABLES `private_messages` WRITE;
/*!40000 ALTER TABLE `private_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `private_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `process_parameter`
--

DROP TABLE IF EXISTS `process_parameter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `process_parameter` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '参数编码：temperature/pressure/haul_off_speed',
  `name` varchar(64) NOT NULL COMMENT '参数名称',
  `unit` varchar(16) NOT NULL COMMENT '单位：°C/MPa/m/min',
  `decimal_scale` tinyint unsigned NOT NULL DEFAULT '2' COMMENT '展示小数位 [原型 factorMeta.digits]',
  `description` varchar(255) DEFAULT NULL,
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `sort_no` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_process_parameter_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='过程参数（影响因素）字典';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `process_parameter`
--

LOCK TABLES `process_parameter` WRITE;
/*!40000 ALTER TABLE `process_parameter` DISABLE KEYS */;
INSERT INTO `process_parameter` VALUES (1,'temperature','温度','°C',1,NULL,'enabled',1,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'pressure','压力','MPa',2,NULL,'enabled',2,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'haul_off_speed','牵引速度','m/min',2,NULL,'enabled',3,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `process_parameter` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `process_record`
--

DROP TABLE IF EXISTS `process_record`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `process_record` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '工艺记录编号，如 PR-A-0 [原型 id]',
  `batch_id` bigint unsigned NOT NULL COMMENT '批次号',
  `equipment_id` bigint unsigned DEFAULT NULL COMMENT '对应设备',
  `record_time` datetime NOT NULL COMMENT '记录时间 [原型 timestamp]',
  `data_source_id` bigint unsigned DEFAULT NULL COMMENT '数据来源',
  `time_match_status` enum('confirmed','pending','mismatch') NOT NULL DEFAULT 'pending' COMMENT '时间匹配状态 [原型 timeMatchStatus：时间匹配待确认]',
  `haul_off_feedback_mpm` decimal(8,2) DEFAULT NULL COMMENT '牵引反馈速度 m/min（语义待确认）',
  `pipe_line_speed_mpm` decimal(8,2) DEFAULT NULL COMMENT '管材线速度 m/min（独立虚拟量，非牵引反馈）',
  `mass_output_kgh` decimal(10,2) DEFAULT NULL COMMENT '质量产出率 kg/h（演示量，不可换算长度）',
  `measured_unit_weight_kgpm` decimal(10,4) DEFAULT NULL COMMENT '每米重量 kg/m（测量方式为实测，当前值为模拟）',
  `production_group` varchar(32) DEFAULT NULL COMMENT '生产组别',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_process_record_code` (`code`),
  KEY `idx_process_record_batch` (`batch_id`,`record_time`),
  KEY `idx_process_record_equipment` (`equipment_id`),
  KEY `fk_process_record_source` (`data_source_id`),
  CONSTRAINT `fk_process_record_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_process_record_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_process_record_source` FOREIGN KEY (`data_source_id`) REFERENCES `data_source` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工艺过程记录（温区/牵引/产出）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `process_record`
--

LOCK TABLES `process_record` WRITE;
/*!40000 ALTER TABLE `process_record` DISABLE KEYS */;
INSERT INTO `process_record` VALUES (1,'PR-001',4,1,'2026-10-09 08:00:00',4,'pending',12.62,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'PR-002',4,1,'2026-10-09 11:20:00',4,'pending',12.63,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'PR-003',4,1,'2026-10-09 15:03:00',4,'pending',12.64,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'PR-004',4,1,'2026-10-09 18:40:00',4,'pending',12.65,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,'PR-005',4,1,'2026-10-10 08:20:00',4,'pending',12.70,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,'PR-006',4,1,'2026-10-10 09:05:00',4,'pending',12.79,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,'PR-007',4,1,'2026-10-10 09:37:00',4,'pending',12.88,12.70,186.00,0.2600,'D组','温区设定/反馈逐小时记录；牵引反馈速度与管材线速度为两个独立量，不互相换算','2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `process_record` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `process_zone_value`
--

DROP TABLE IF EXISTS `process_zone_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `process_zone_value` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `process_record_id` bigint unsigned NOT NULL COMMENT '工艺记录',
  `zone_id` bigint unsigned NOT NULL COMMENT '温区',
  `setpoint_c` decimal(8,2) DEFAULT NULL COMMENT '设定温度 °C',
  `feedback_c` decimal(8,2) DEFAULT NULL COMMENT '反馈温度 °C',
  `deviation_c` decimal(8,2) GENERATED ALWAYS AS ((`feedback_c` - `setpoint_c`)) STORED COMMENT '偏差 = 反馈 − 设定（原型展示口径）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_process_zone_value` (`process_record_id`,`zone_id`),
  KEY `idx_process_zone_value_zone` (`zone_id`),
  CONSTRAINT `fk_process_zone_value_record` FOREIGN KEY (`process_record_id`) REFERENCES `process_record` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_process_zone_value_zone` FOREIGN KEY (`zone_id`) REFERENCES `temp_zone` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=59 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工艺温区设定与反馈';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `process_zone_value`
--

LOCK TABLES `process_zone_value` WRITE;
/*!40000 ALTER TABLE `process_zone_value` DISABLE KEYS */;
INSERT INTO `process_zone_value` (`id`, `process_record_id`, `zone_id`, `setpoint_c`, `feedback_c`, `created_at`, `updated_at`) VALUES (1,1,1,188.00,188.10,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,1,2,192.00,191.80,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,1,3,198.00,198.30,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,1,4,202.00,201.90,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,1,5,204.00,204.20,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,1,6,205.00,204.70,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,1,7,206.00,206.15,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(8,1,8,207.00,206.95,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(9,2,1,188.00,188.15,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(10,2,2,192.00,191.85,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(11,2,3,198.00,198.35,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(12,2,4,202.00,201.95,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(13,2,5,204.00,204.25,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(14,2,6,205.00,204.75,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(15,2,7,206.00,206.20,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(16,2,8,207.00,207.00,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(17,3,1,188.00,188.20,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(18,3,2,192.00,191.90,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(19,3,3,198.00,198.40,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(20,3,4,202.00,202.00,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(21,3,5,204.00,204.30,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(22,3,6,205.00,204.80,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(23,3,7,206.00,206.25,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(24,3,8,207.00,207.05,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(25,4,1,188.00,188.30,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(26,4,2,192.00,192.00,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(27,4,3,198.00,198.50,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(28,4,4,202.00,202.10,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(29,4,5,204.00,204.40,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(30,4,6,205.00,204.90,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(31,4,7,206.00,206.35,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(32,4,8,207.00,207.15,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(33,5,1,188.00,188.45,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(34,5,2,192.00,192.15,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(35,5,3,198.00,198.65,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(36,5,4,202.00,202.25,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(37,5,5,204.00,204.55,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(38,5,6,205.00,205.05,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(39,5,7,206.00,206.50,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(40,5,8,207.00,207.30,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(41,6,1,188.00,188.65,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(42,6,2,192.00,192.35,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(43,6,3,198.00,198.85,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(44,6,4,202.00,202.45,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(45,6,5,204.00,204.75,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(46,6,6,205.00,205.25,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(47,6,7,206.00,206.70,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(48,6,8,207.00,207.50,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(49,7,1,188.00,188.80,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(50,7,2,192.00,192.50,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(51,7,3,198.00,199.00,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(52,7,4,202.00,202.60,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(53,7,5,204.00,204.90,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(54,7,6,205.00,205.40,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(55,7,7,206.00,206.85,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(56,7,8,207.00,207.65,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `process_zone_value` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_category`
--

DROP TABLE IF EXISTS `product_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '类别编码，如 CAT-PPR',
  `name` varchar(64) NOT NULL COMMENT '类别名称，如 PPR 管材',
  `description` varchar(255) DEFAULT NULL COMMENT '说明',
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_category_code` (`code`),
  KEY `idx_product_category_deleted` (`is_deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品类别';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_category`
--

LOCK TABLES `product_category` WRITE;
/*!40000 ALTER TABLE `product_category` DISABLE KEYS */;
INSERT INTO `product_category` VALUES (1,'CAT-PPR','PPR 管材','PPR 冷热水用聚丙烯管材（给水用）','enabled',0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'CAT-TEST','测试类别','临时验证','disabled',1,NULL,'2026-10-12 11:21:40','2026-10-12 11:22:42');
/*!40000 ALTER TABLE `product_category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_data`
--

DROP TABLE IF EXISTS `product_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_data` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '产品数据编号，如 PRD-001 [原型 id]',
  `batch_id` bigint unsigned NOT NULL COMMENT '批次号',
  `production_date` date NOT NULL COMMENT '生产日期 [原型 productionDate]',
  `data_source_id` bigint unsigned NOT NULL COMMENT '数据来源 [原型 dataSource]',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `migrated_from` varchar(64) DEFAULT NULL COMMENT '迁移来源记录号（原型 migrateAdminRecords 的 migratedFrom）',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_data_code` (`code`),
  UNIQUE KEY `uk_product_data_batch_date` (`batch_id`,`production_date`),
  KEY `idx_product_data_source` (`data_source_id`),
  CONSTRAINT `fk_product_data_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_data_source` FOREIGN KEY (`data_source_id`) REFERENCES `data_source` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品数据（批次 + 生产日期唯一）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_data`
--

LOCK TABLES `product_data` WRITE;
/*!40000 ALTER TABLE `product_data` DISABLE KEYS */;
INSERT INTO `product_data` VALUES (1,'PRD-001',2,'2026-10-09',2,'批次 + 生产日期唯一：同一产品只保留一份当日产品数据',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'PRD-002',2,'2026-10-10',2,'批次 + 生产日期唯一：同一产品只保留一份当日产品数据',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'PRD-003',3,'2026-10-09',2,'批次 + 生产日期唯一：同一产品只保留一份当日产品数据',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'PRD-004',3,'2026-10-10',2,'批次 + 生产日期唯一：同一产品只保留一份当日产品数据',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,'PRD-005',4,'2026-10-09',2,'批次 + 生产日期唯一：同一产品只保留一份当日产品数据',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,'PRD-006',4,'2026-10-10',2,'批次 + 生产日期唯一：同一产品只保留一份当日产品数据',NULL,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `product_data` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_data_value`
--

DROP TABLE IF EXISTS `product_data_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_data_value` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_data_id` bigint unsigned NOT NULL COMMENT '产品数据',
  `metric_id` bigint unsigned NOT NULL COMMENT '质量指标',
  `metric_value` decimal(12,4) NOT NULL COMMENT '指标值（无数据不写行）',
  `is_derived` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=计算得到（如不圆度）',
  `remark` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_data_value` (`product_data_id`,`metric_id`),
  KEY `idx_product_data_value_metric` (`metric_id`),
  CONSTRAINT `fk_product_data_value_header` FOREIGN KEY (`product_data_id`) REFERENCES `product_data` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_data_value_metric` FOREIGN KEY (`metric_id`) REFERENCES `quality_metric` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品指标值';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_data_value`
--

LOCK TABLES `product_data_value` WRITE;
/*!40000 ALTER TABLE `product_data_value` DISABLE KEYS */;
INSERT INTO `product_data_value` VALUES (1,1,1,25.2350,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,1,2,4.3200,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,1,3,4.4300,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,1,6,0.1800,1,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,2,1,25.2400,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,2,2,4.3100,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,2,3,4.4200,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(8,2,6,0.1800,1,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(9,3,1,25.2300,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(10,3,2,4.3100,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(11,3,3,4.4200,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(12,3,6,0.1900,1,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(13,4,1,25.2450,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(14,4,2,4.2900,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(15,4,3,4.4100,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(16,4,6,0.2000,1,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(17,5,1,25.2380,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(18,5,2,4.3000,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(19,5,3,4.4200,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(20,5,6,0.1700,1,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(21,6,1,25.2500,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(22,6,2,4.2600,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(23,6,3,4.4000,0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(24,6,6,0.1900,1,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `product_data_value` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_spec`
--

DROP TABLE IF EXISTS `product_spec`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_spec` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '规格编码，如 SPEC-25-42',
  `name` varchar(64) NOT NULL COMMENT '规格名称，如 25×4.2',
  `category_id` bigint unsigned NOT NULL COMMENT '所属产品类别',
  `nominal_outer_diameter_mm` decimal(10,3) NOT NULL COMMENT '公称外径 mm [原型 outerDiameter]',
  `nominal_wall_thickness_mm` decimal(10,3) NOT NULL COMMENT '公称壁厚 mm [原型 wallThickness]',
  `ovality_max_mm` decimal(10,3) DEFAULT NULL COMMENT '不圆度上限 mm [原型 ovalityMax]',
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_spec_code` (`code`),
  KEY `idx_product_spec_category` (`category_id`),
  CONSTRAINT `fk_product_spec_category` FOREIGN KEY (`category_id`) REFERENCES `product_category` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产品规格';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_spec`
--

LOCK TABLES `product_spec` WRITE;
/*!40000 ALTER TABLE `product_spec` DISABLE KEYS */;
INSERT INTO `product_spec` VALUES (1,'SPEC-25-42','dn25 × en4.2',1,25.000,4.200,0.350,'enabled',0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `product_spec` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `production_batch`
--

DROP TABLE IF EXISTS `production_batch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_batch` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `batch_no` varchar(64) NOT NULL COMMENT '批次号，如 12121D0032 [原型 id]，来自 MES 的自然键',
  `spec_id` bigint unsigned NOT NULL COMMENT '产品规格',
  `line_id` bigint unsigned DEFAULT NULL COMMENT '生产产线 [扩展]',
  `extruder_id` bigint unsigned DEFAULT NULL COMMENT '挤出设备 [原型 extruderId]',
  `haul_off_id` bigint unsigned DEFAULT NULL COMMENT '牵引设备 [原型 haulOffId]',
  `production_group` varchar(32) DEFAULT NULL COMMENT '生产组别，如 D组 [原型 productionGroup]',
  `start_time` datetime NOT NULL COMMENT '生产开始时间 [原型 startTime]',
  `end_time` datetime DEFAULT NULL COMMENT '生产结束时间 [扩展]',
  `batch_status` enum('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'completed' COMMENT '批次状态 [扩展：原型缺运行连续性信息]',
  `data_source_id` bigint unsigned NOT NULL COMMENT '数据来源 [原型 source]',
  `remark` varchar(255) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_production_batch_no` (`batch_no`),
  KEY `idx_production_batch_spec` (`spec_id`),
  KEY `idx_production_batch_start` (`start_time`),
  KEY `idx_production_batch_group` (`production_group`,`start_time`),
  KEY `fk_production_batch_line` (`line_id`),
  KEY `fk_production_batch_extruder` (`extruder_id`),
  KEY `fk_production_batch_hauloff` (`haul_off_id`),
  KEY `fk_production_batch_source` (`data_source_id`),
  CONSTRAINT `fk_production_batch_extruder` FOREIGN KEY (`extruder_id`) REFERENCES `equipment` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_production_batch_hauloff` FOREIGN KEY (`haul_off_id`) REFERENCES `equipment` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_production_batch_line` FOREIGN KEY (`line_id`) REFERENCES `production_line` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_production_batch_source` FOREIGN KEY (`data_source_id`) REFERENCES `data_source` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_production_batch_spec` FOREIGN KEY (`spec_id`) REFERENCES `product_spec` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='生产批次基础信息';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `production_batch`
--

LOCK TABLES `production_batch` WRITE;
/*!40000 ALTER TABLE `production_batch` DISABLE KEYS */;
INSERT INTO `production_batch` VALUES (1,'12121B0001',1,1,1,2,'A 组','2026-10-10 08:00:00',NULL,'completed',2,'批次基础信息由 MES 下发，产线与设备由本系统台账关联',0,NULL,'2026-10-12 19:03:33','2026-10-12 20:02:02'),(2,'12121C0034',1,1,1,2,'C组','2026-10-09 08:00:00',NULL,'completed',2,'批次基础信息由 MES 下发，产线与设备由本系统台账关联',0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'12121D0029',1,1,1,2,'D组','2026-10-09 08:00:00',NULL,'completed',2,'批次基础信息由 MES 下发，产线与设备由本系统台账关联',0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'12121D0032',1,1,1,2,'D组','2026-10-09 08:00:00',NULL,'completed',2,'批次基础信息由 MES 下发，产线与设备由本系统台账关联',0,NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `production_batch` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `production_event`
--

DROP TABLE IF EXISTS `production_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_event` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `batch_id` bigint unsigned NOT NULL COMMENT '批次',
  `event_type` enum('start','stop','restart','spec_changeover','adjustment','material_change','other') NOT NULL COMMENT '事件类型',
  `occur_time` datetime NOT NULL COMMENT '发生时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `duration_minutes` int unsigned DEFAULT NULL COMMENT '持续分钟（停机/换规格）',
  `reason` varchar(255) DEFAULT NULL COMMENT '原因',
  `detail` varchar(500) DEFAULT NULL COMMENT '明细：设定值变更、调机内容等',
  `source` varchar(64) DEFAULT NULL COMMENT '记录来源',
  `operator_user_id` bigint unsigned DEFAULT NULL COMMENT '记录人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_production_event_batch` (`batch_id`,`occur_time`),
  KEY `idx_production_event_type` (`event_type`,`occur_time`),
  KEY `fk_production_event_operator` (`operator_user_id`),
  CONSTRAINT `fk_production_event_batch` FOREIGN KEY (`batch_id`) REFERENCES `production_batch` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_production_event_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `sys_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='生产事件（停机/换规格/调机）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `production_event`
--

LOCK TABLES `production_event` WRITE;
/*!40000 ALTER TABLE `production_event` DISABLE KEYS */;
INSERT INTO `production_event` VALUES (1,2,'start','2026-10-09 08:00:00',NULL,NULL,'批次开产','按 MES 派工开产','MES 生产系统',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,3,'start','2026-10-09 08:00:00',NULL,NULL,'批次开产','按 MES 派工开产','MES 生产系统',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,4,'start','2026-10-09 08:00:00',NULL,NULL,'批次开产','按 MES 派工开产','MES 生产系统',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,4,'spec_changeover','2026-10-09 19:10:00','2026-10-09 19:40:00',30,'换规格','更换定径套与牵引夹块，复核首件尺寸','生产录入',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,4,'adjustment','2026-10-10 09:50:00',NULL,NULL,'调机','按工艺卡复核机筒 3 区设定值，未改动其他参数','生产录入',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,4,'stop','2026-10-20 10:00:00','2026-10-20 10:30:00',30,'更换过滤网','换网停机','MES',1,'2026-10-12 19:40:40','2026-10-12 19:40:40');
/*!40000 ALTER TABLE `production_event` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `production_line`
--

DROP TABLE IF EXISTS `production_line`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_line` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '产线编码',
  `name` varchar(64) NOT NULL COMMENT '产线名称',
  `workshop` varchar(64) DEFAULT NULL COMMENT '车间/工段',
  `description` varchar(255) DEFAULT NULL,
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_production_line_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='产线/工段';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `production_line`
--

LOCK TABLES `production_line` WRITE;
/*!40000 ALTER TABLE `production_line` DISABLE KEYS */;
INSERT INTO `production_line` VALUES (1,'LINE-A','PPR 管材一线','挤出车间','PPR 给水管材挤出生产线：挤出机 EQ-EX-01 + 牵引机 EQ-HO-01','enabled',0,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `production_line` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quality_metric`
--

DROP TABLE IF EXISTS `quality_metric`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quality_metric` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '指标编码：outer_diameter/min_wall_thickness/max_wall_thickness/max_outer_diameter/min_outer_diameter/ovality',
  `name` varchar(64) NOT NULL COMMENT '指标名称',
  `unit` varchar(16) NOT NULL DEFAULT 'mm' COMMENT '单位 [原型 metricMeta.unit]',
  `decimal_scale` tinyint unsigned NOT NULL DEFAULT '3' COMMENT '展示小数位 [原型 fmt(n,3)/(n,2)]',
  `metric_role` enum('primary','raw','derived') NOT NULL DEFAULT 'primary' COMMENT '指标角色',
  `derived_expr` varchar(255) DEFAULT NULL COMMENT '计算表达式（仅 derived，由后端计算，不在 SQL 内动态求值），如 max_outer_diameter - min_outer_diameter',
  `check_direction_hint` varchar(500) DEFAULT NULL COMMENT '核查方向提示 [原型 metricCheckDirection]',
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `sort_no` int NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_quality_metric_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='质量指标字典';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quality_metric`
--

LOCK TABLES `quality_metric` WRITE;
/*!40000 ALTER TABLE `quality_metric` DISABLE KEYS */;
INSERT INTO `quality_metric` VALUES (1,'outer_diameter','外径','mm',3,'primary',NULL,'优先核查真空定径、冷却、出料与牵引匹配；这些是排查方向，不是已验证根因。','enabled',1,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'min_wall_thickness','最小壁厚','mm',3,'primary',NULL,'区分整体变薄迹象与局部最薄处变化；缺少其他壁厚测点时，不能据此断定整体变薄。','enabled',2,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'max_wall_thickness','最大壁厚','mm',3,'raw',NULL,NULL,'enabled',3,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'max_outer_diameter','最大外径','mm',3,'raw',NULL,NULL,'enabled',4,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,'min_outer_diameter','最小外径','mm',3,'raw',NULL,NULL,'enabled',5,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,'ovality','不圆度','mm',3,'derived','max_outer_diameter - min_outer_diameter','先核对同一样管同一截面的最大/最小外径与测量口径，再核查定径、冷却、支撑与牵引。','enabled',6,0,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `quality_metric` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schema_migration`
--

DROP TABLE IF EXISTS `schema_migration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migration` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) NOT NULL COMMENT '迁移文件名',
  `checksum` char(16) NOT NULL COMMENT '内容校验和（sha256 前 16 位）',
  `statements` int unsigned NOT NULL DEFAULT '0' COMMENT '执行的语句条数',
  `applied_by` varchar(64) NOT NULL DEFAULT '' COMMENT '执行账号',
  `applied_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_migration_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据库迁移记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migration`
--

LOCK TABLES `schema_migration` WRITE;
/*!40000 ALTER TABLE `schema_migration` DISABLE KEYS */;
INSERT INTO `schema_migration` VALUES (1,'0001_schema.sql','fe7790df9820361e',94,'ppr_migrator','2026-10-12 19:03:33'),(2,'0002_seed.sql','d184533fc5910dce',31,'ppr_migrator','2026-10-12 19:03:33'),(3,'0003_platform_baseline.sql','7b7aa93794554481',40,'ppr_migrator','2026-10-12 19:03:33'),(4,'0004_rule_wording.sql','aac4db106aed7ac5',12,'ppr_migrator','2026-10-12 19:13:36'),(5,'0005_trend_params_and_samples.sql','e0608bee108526cb',8,'ppr_migrator','2026-10-12 19:13:36'),(6,'0006_rule_param_alignment.sql','68780dd6fc7ea856',6,'ppr_migrator','2026-10-12 19:58:13'),(7,'0007_remove_demo_wording.sql','cf56b81a469d1d94',10,'ppr_migrator','2026-10-12 20:02:02');
/*!40000 ALTER TABLE `schema_migration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '角色编码：admin/quality_engineer/production_leader/equipment_engineer/quality_manager/viewer',
  `name` varchar(64) NOT NULL COMMENT '角色名称',
  `description` varchar(255) DEFAULT NULL COMMENT '说明',
  `is_builtin` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=内置角色，不允许删除',
  `status` enum('enabled','disabled') NOT NULL DEFAULT 'enabled',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_role_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES (1,'admin','系统管理员','账号、字典与规则维护',1,'enabled','2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'quality_manager','质量负责人','8D 报告定稿与结案确认',1,'enabled','2026-10-12 19:03:33','2026-10-12 19:13:36'),(3,'quality_engineer','质量工程师','异常诊断、结论验证与 8D 报告编制',1,'enabled','2026-10-12 19:03:33','2026-10-12 19:13:36'),(4,'production_leader','生产领班','现场状态确认与临时处置执行',1,'enabled','2026-10-12 19:03:33','2026-10-12 19:13:36'),(5,'equipment_engineer','设备工程师','设备与工艺参数核查',1,'enabled','2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,'viewer','只读查看','只读访问监控与归档',1,'enabled','2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL COMMENT '登录名',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '密码哈希（bcrypt/argon2）。种子数据留空，禁止明文',
  `must_reset_password` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1=首次登录必须重置密码',
  `session_version` int unsigned NOT NULL DEFAULT '1' COMMENT '会话版本号：递增即强制该用户所有已签发会话失效',
  `display_name` varchar(64) NOT NULL COMMENT '姓名',
  `employee_no` varchar(32) DEFAULT NULL COMMENT '工号',
  `email` varchar(128) DEFAULT NULL COMMENT '邮箱（通知收件地址）',
  `phone` varchar(32) DEFAULT NULL COMMENT '手机号',
  `department` varchar(64) DEFAULT NULL COMMENT '部门',
  `status` enum('active','disabled') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  `last_login_at` datetime DEFAULT NULL COMMENT '最近登录时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_user_username` (`username`),
  UNIQUE KEY `uk_sys_user_employee_no` (`employee_no`),
  KEY `idx_sys_user_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统用户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES (1,'admin','$2b$10$fFWB5BWa49WVwF.sGSZP.uSaL9md1lDW7tNXCuya2lrpOsoyrMcRe',0,1,'系统管理员','EMP0001','admin@ppr.local',NULL,'信息技术部','active','2026-10-13 09:04:07','2026-10-12 19:03:33','2026-10-13 09:04:07'),(2,'qe_zhang','$2b$10$D4ZAUA0DJto16UZmcLx.5.4ijmk/S81DJJDjhSFx6mBkDuapA0fPS',1,2,'张工','EMP0002','zhang.quality@ppr.local',NULL,'质量管理部','active','2026-10-13 09:14:54','2026-10-12 19:03:33','2026-10-13 09:14:54'),(3,'pl_li',NULL,1,1,'李领班','EMP0003','li.production@ppr.local',NULL,'生产制造部','active',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'ee_wang',NULL,1,1,'王工','EMP0004','wang.equipment@ppr.local',NULL,'设备动力部','active',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,'qm_zhao',NULL,1,1,'赵主管','EMP0005','zhao.quality@ppr.local',NULL,'质量管理部','active',NULL,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sys_user_role`
--

DROP TABLE IF EXISTS `sys_user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_role` (
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `granted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `idx_sys_user_role_role` (`role_id`),
  CONSTRAINT `fk_sys_user_role_role` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sys_user_role_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--

LOCK TABLES `sys_user_role` WRITE;
/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;
INSERT INTO `sys_user_role` VALUES (1,1,'2026-10-12 19:03:33'),(2,3,'2026-10-12 19:03:33'),(3,4,'2026-10-12 19:03:33'),(4,5,'2026-10-12 19:03:33'),(5,2,'2026-10-12 19:03:33');
/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_config`
--

DROP TABLE IF EXISTS `system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_config` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_config_key_key` (`key`),
  KEY `system_config_key_idx` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=277 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_config`
--

LOCK TABLES `system_config` WRITE;
/*!40000 ALTER TABLE `system_config` DISABLE KEYS */;
INSERT INTO `system_config` VALUES (1,'enable_register','true','是否开放用户注册（true/false）','2026-10-13 01:36:53',NULL),(2,'enable_file_upload','true','是否开放文件上传（true/false）','2026-10-13 01:36:53',NULL),(3,'enable_file_preview','true','是否启用文件在线预览（true/false）','2026-10-13 01:36:53',NULL),(4,'max_file_size','500','文件上传大小上限（MB）','2026-10-13 01:36:53',NULL),(5,'enable_sso_auto_login','false','未登录时是否自动跳转单点登录（true/false）','2026-10-13 01:36:53',NULL),(6,'quality_analysis_mode','agent','异常诊断模式：rule规则引擎、agent LangChain智能体','2026-10-13 02:13:38','2026-10-13 05:36:43'),(7,'quality_agent_model','deepseek-v4-flash','LangChain Agent使用的模型名称','2026-10-13 02:13:38','2026-10-13 02:24:36'),(8,'quality_agent_fallback_to_rule','true','Agent失败或未配置密钥时是否自动降级规则引擎','2026-10-13 02:13:38',NULL),(9,'quality_agent_max_tool_rounds','8','Agent单次分析最大工具调用轮数','2026-10-13 02:13:38',NULL),(10,'quality_agent_reasoning_effort','low','Agent推理强度：none/minimal/low/medium/high','2026-10-13 02:13:38',NULL),(83,'wecom_alert_enabled','false','中/高风险预警是否推送到企业微信群机器人（true/false）','2026-10-13 08:02:34','2026-10-14 09:11:37'),(84,'wecom_alert_webhook','https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=171d6761-b612-46a1-b81e-f656315d807d','企业微信群机器人Webhook地址，形如 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx','2026-10-13 08:02:34','2026-10-13 08:10:59'),(85,'wecom_alert_min_level','medium','触发机器人推送的最低风险级别：medium=中风险及以上、high=仅高风险','2026-10-13 08:02:34',NULL),(101,'wecom_alert_mention_list','','推送消息需要@的成员userid，多个用逗号分隔，留空表示不@人','2026-10-13 08:12:58',NULL),(102,'wecom_alert_mention_all','false','推送中/高风险预警时是否@所有人（true/false）','2026-10-13 08:12:58',NULL);
/*!40000 ALTER TABLE `system_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `temp_zone`
--

DROP TABLE IF EXISTS `temp_zone`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_zone` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL COMMENT '温区编码，如 M1-barrel-1',
  `name` varchar(64) NOT NULL COMMENT '温区名称，如 M1 机筒1区',
  `equipment_id` bigint unsigned DEFAULT NULL COMMENT '所属设备',
  `default_setpoint_c` decimal(8,2) DEFAULT NULL COMMENT '默认设定温度 °C [原型 zoneDefinitions.setpoint]',
  `sort_no` int NOT NULL DEFAULT '0',
  `description` varchar(255) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_temp_zone_code` (`code`),
  KEY `idx_temp_zone_equipment` (`equipment_id`),
  CONSTRAINT `fk_temp_zone_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='温区字典';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `temp_zone`
--

LOCK TABLES `temp_zone` WRITE;
/*!40000 ALTER TABLE `temp_zone` DISABLE KEYS */;
INSERT INTO `temp_zone` VALUES (1,'M1-barrel-1','M1 机筒1区',1,188.00,1,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(2,'M1-barrel-2','M1 机筒2区',1,192.00,2,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(3,'M1-barrel-3','M1 机筒3区',1,198.00,3,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(4,'M1-barrel-4','M1 机筒4区',1,202.00,4,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(5,'M1-adapter-1','M1 适配器1区',1,204.00,5,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(6,'M1-adapter-2','M1 适配器2区',1,205.00,6,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(7,'M1-adapter-3','M1 适配器3区',1,206.00,7,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33'),(8,'M1-adapter-4','M1 适配器4区',1,207.00,8,NULL,0,'2026-10-12 19:03:33','2026-10-12 19:03:33');
/*!40000 ALTER TABLE `temp_zone` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `uploaded_files`
--

DROP TABLE IF EXISTS `uploaded_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uploaded_files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size` bigint DEFAULT NULL,
  `uploader_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uploaded_files_filename_key` (`filename`),
  KEY `uploaded_files_uploader_id_idx` (`uploader_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `uploaded_files`
--

LOCK TABLES `uploaded_files` WRITE;
/*!40000 ALTER TABLE `uploaded_files` DISABLE KEYS */;
/*!40000 ALTER TABLE `uploaded_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_behaviors`
--

DROP TABLE IF EXISTS `user_behaviors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_behaviors` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` int NOT NULL,
  `action` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_behaviors_user_id_idx` (`user_id`),
  KEY `user_behaviors_target_idx` (`target_type`,`target_id`),
  KEY `user_behaviors_created_at_idx` (`created_at`),
  CONSTRAINT `user_behaviors_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_behaviors`
--

LOCK TABLES `user_behaviors` WRITE;
/*!40000 ALTER TABLE `user_behaviors` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_behaviors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `phone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nickname` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar` text COLLATE utf8mb4_unicode_ci,
  `password` text COLLATE utf8mb4_unicode_ci,
  `industry` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expertise` text COLLATE utf8mb4_unicode_ci,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `role` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `external_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auth_provider` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'local',
  `login_fail_count` int DEFAULT '0',
  `frozen_until` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_phone_key` (`phone`),
  UNIQUE KEY `users_email_key` (`email`),
  KEY `users_phone_idx` (`phone`),
  KEY `users_email_idx` (`email`),
  KEY `users_external_id_idx` (`external_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('00000000-0000-0000-0000-000000000001','admin','admin@local.demo','质量平台管理员',NULL,'$2b$10$Xn3Xw9bnTqTNYfns8Ig.reoOWmU9G3V3btkuB2o/Qmbt2yhf33Wdy',NULL,NULL,NULL,'admin','active',NULL,'local',0,NULL,'2026-10-14 10:25:42','2026-10-13 01:36:53',NULL),('3c5612ad-c047-4dda-b6f5-d10a522db0a8','wzh',NULL,'wzh',NULL,'$2b$12$TuLovy6RytO0.AaVABD/AeSeyrgKAZio9i10JQI.JQuEi944WedHm',NULL,NULL,NULL,'user','active',NULL,'local',0,NULL,'2026-10-13 06:17:02','2026-10-13 06:16:57',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_alert_event_detail`
--

DROP TABLE IF EXISTS `v_alert_event_detail`;
/*!50001 DROP VIEW IF EXISTS `v_alert_event_detail`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_alert_event_detail` AS SELECT 
 1 AS `id`,
 1 AS `code`,
 1 AS `risk_type`,
 1 AS `rule_code`,
 1 AS `rule_version`,
 1 AS `rule_name`,
 1 AS `rule_calibration_status`,
 1 AS `batch_no`,
 1 AS `production_group`,
 1 AS `spec_code`,
 1 AS `spec_name`,
 1 AS `metric_code`,
 1 AS `metric_name`,
 1 AS `metric_unit`,
 1 AS `metric_decimal_scale`,
 1 AS `trigger_record_id`,
 1 AS `trigger_record_code`,
 1 AS `trigger_sample_no`,
 1 AS `window_start_time`,
 1 AS `window_end_time`,
 1 AS `reason`,
 1 AS `affected_length_m`,
 1 AS `line_speed_mpm`,
 1 AS `handling_status`,
 1 AS `handled_at`,
 1 AS `handling_note`,
 1 AS `handler_name`,
 1 AS `generated_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_equipment_reading_wide`
--

DROP TABLE IF EXISTS `v_equipment_reading_wide`;
/*!50001 DROP VIEW IF EXISTS `v_equipment_reading_wide`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_equipment_reading_wide` AS SELECT 
 1 AS `id`,
 1 AS `code`,
 1 AS `batch_no`,
 1 AS `production_date`,
 1 AS `equipment_code`,
 1 AS `equipment_name`,
 1 AS `collect_time`,
 1 AS `collected_at`,
 1 AS `data_source_name`,
 1 AS `source_is_simulated`,
 1 AS `temperature_c`,
 1 AS `pressure_mpa`,
 1 AS `haul_off_speed_mpm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_inspection_record_wide`
--

DROP TABLE IF EXISTS `v_inspection_record_wide`;
/*!50001 DROP VIEW IF EXISTS `v_inspection_record_wide`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_inspection_record_wide` AS SELECT 
 1 AS `id`,
 1 AS `code`,
 1 AS `sample_no`,
 1 AS `batch_no`,
 1 AS `production_group`,
 1 AS `spec_code`,
 1 AS `spec_name`,
 1 AS `inspect_time`,
 1 AS `production_time`,
 1 AS `inspection_delay_minutes`,
 1 AS `measurement_stage`,
 1 AS `inspection_method`,
 1 AS `instrument_info`,
 1 AS `quality_flag`,
 1 AS `quality_note`,
 1 AS `simulated_ovality`,
 1 AS `record_status`,
 1 AS `data_source_name`,
 1 AS `source_is_simulated`,
 1 AS `outer_diameter_mm`,
 1 AS `min_wall_thickness_mm`,
 1 AS `max_wall_thickness_mm`,
 1 AS `max_outer_diameter_mm`,
 1 AS `min_outer_diameter_mm`,
 1 AS `ovality_stored_mm`,
 1 AS `ovality_effective_mm`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_ppr_batch`
--

DROP TABLE IF EXISTS `v_ppr_batch`;
/*!50001 DROP VIEW IF EXISTS `v_ppr_batch`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_ppr_batch` AS SELECT 
 1 AS `id`,
 1 AS `batch_no`,
 1 AS `spec_id`,
 1 AS `production_group`,
 1 AS `start_time`,
 1 AS `end_time`,
 1 AS `status`,
 1 AS `measurement_count`,
 1 AS `reading_count`,
 1 AS `last_inspect_time`,
 1 AS `last_collect_time`,
 1 AS `extruder_id`,
 1 AS `extruder_name`,
 1 AS `haul_off_id`,
 1 AS `haul_off_name`,
 1 AS `created_at`,
 1 AS `updated_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_product_data_wide`
--

DROP TABLE IF EXISTS `v_product_data_wide`;
/*!50001 DROP VIEW IF EXISTS `v_product_data_wide`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_product_data_wide` AS SELECT 
 1 AS `id`,
 1 AS `code`,
 1 AS `batch_no`,
 1 AS `production_date`,
 1 AS `data_source_name`,
 1 AS `source_is_simulated`,
 1 AS `outer_diameter_mm`,
 1 AS `min_wall_thickness_mm`,
 1 AS `max_wall_thickness_mm`,
 1 AS `ovality_mm`,
 1 AS `ovality_effective_mm`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping events for database 'ppr_quality'
--

--
-- Dumping routines for database 'ppr_quality'
--

--
-- Final view structure for view `ppr_batch`
--

/*!50001 DROP VIEW IF EXISTS `ppr_batch`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `ppr_batch` AS select `k`.`batch_no` AS `id`,`k`.`batch_no` AS `batch_no`,`m`.`spec_id` AS `spec_id`,`m`.`production_group` AS `production_group`,`m`.`start_time` AS `start_time`,greatest(coalesce(`m`.`last_inspect_time`,'1970-01-01 00:00:00'),coalesce(`r`.`last_collect_time`,'1970-01-01 00:00:00')) AS `end_time`,'completed' AS `status`,coalesce(`m`.`measurement_count`,0) AS `measurement_count`,coalesce(`r`.`reading_count`,0) AS `reading_count`,`m`.`last_inspect_time` AS `last_inspect_time`,`r`.`last_collect_time` AS `last_collect_time`,`eq`.`extruder_id` AS `extruder_id`,`eq`.`extruder_name` AS `extruder_name`,`eq`.`haul_off_id` AS `haul_off_id`,`eq`.`haul_off_name` AS `haul_off_name`,coalesce(`m`.`start_time`,`r`.`first_collect_time`) AS `created_at`,coalesce(`m`.`last_inspect_time`,`r`.`last_collect_time`) AS `updated_at` from ((((select `ppr_product_measurement`.`batch_no` AS `batch_no` from `ppr_product_measurement` union select `ppr_equipment_reading`.`batch_no` AS `batch_no` from `ppr_equipment_reading`) `k` left join (select `ppr_product_measurement`.`batch_no` AS `batch_no`,max(`ppr_product_measurement`.`spec_id`) AS `spec_id`,max(`ppr_product_measurement`.`production_group`) AS `production_group`,min(coalesce(`ppr_product_measurement`.`batch_start_time`,`ppr_product_measurement`.`inspect_time`)) AS `start_time`,count(0) AS `measurement_count`,max(`ppr_product_measurement`.`inspect_time`) AS `last_inspect_time` from `ppr_product_measurement` group by `ppr_product_measurement`.`batch_no`) `m` on((`m`.`batch_no` = `k`.`batch_no`))) left join (select `ppr_equipment_reading`.`batch_no` AS `batch_no`,count(0) AS `reading_count`,min(`ppr_equipment_reading`.`collect_time`) AS `first_collect_time`,max(`ppr_equipment_reading`.`collect_time`) AS `last_collect_time` from `ppr_equipment_reading` group by `ppr_equipment_reading`.`batch_no`) `r` on((`r`.`batch_no` = `k`.`batch_no`))) left join (select `rd`.`batch_no` AS `batch_no`,max((case when (`t`.`code` = 'ETYPE-EXTRUDER') then `e`.`id` end)) AS `extruder_id`,max((case when (`t`.`code` = 'ETYPE-EXTRUDER') then `e`.`name` end)) AS `extruder_name`,max((case when (`t`.`code` = 'ETYPE-HAULOFF') then `e`.`id` end)) AS `haul_off_id`,max((case when (`t`.`code` = 'ETYPE-HAULOFF') then `e`.`name` end)) AS `haul_off_name` from ((`ppr_equipment_reading` `rd` join `ppr_equipment` `e` on((`e`.`id` = `rd`.`equipment_id`))) join `ppr_equipment_type` `t` on((`t`.`id` = `e`.`type_id`))) group by `rd`.`batch_no`) `eq` on((`eq`.`batch_no` = `k`.`batch_no`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_alert_event_detail`
--

/*!50001 DROP VIEW IF EXISTS `v_alert_event_detail`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`ppr_migrator`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_alert_event_detail` AS select `e`.`id` AS `id`,`e`.`code` AS `code`,`e`.`risk_type` AS `risk_type`,`e`.`rule_code` AS `rule_code`,`e`.`rule_version` AS `rule_version`,`ar`.`name` AS `rule_name`,`ar`.`calibration_status` AS `rule_calibration_status`,`b`.`batch_no` AS `batch_no`,`b`.`production_group` AS `production_group`,`s`.`code` AS `spec_code`,`s`.`name` AS `spec_name`,`m`.`code` AS `metric_code`,`m`.`name` AS `metric_name`,`m`.`unit` AS `metric_unit`,`m`.`decimal_scale` AS `metric_decimal_scale`,`e`.`trigger_record_id` AS `trigger_record_id`,`ir`.`code` AS `trigger_record_code`,`ir`.`sample_no` AS `trigger_sample_no`,`e`.`window_start_time` AS `window_start_time`,`e`.`window_end_time` AS `window_end_time`,`e`.`reason` AS `reason`,`e`.`affected_length_m` AS `affected_length_m`,`e`.`line_speed_mpm` AS `line_speed_mpm`,`e`.`handling_status` AS `handling_status`,`e`.`handled_at` AS `handled_at`,`e`.`handling_note` AS `handling_note`,`hu`.`display_name` AS `handler_name`,`e`.`generated_at` AS `generated_at` from ((((((`alert_event` `e` join `alert_rule` `ar` on((`ar`.`id` = `e`.`rule_id`))) join `production_batch` `b` on((`b`.`id` = `e`.`batch_id`))) left join `product_spec` `s` on((`s`.`id` = `e`.`spec_id`))) join `quality_metric` `m` on((`m`.`id` = `e`.`metric_id`))) left join `inspection_record` `ir` on((`ir`.`id` = `e`.`trigger_record_id`))) left join `sys_user` `hu` on((`hu`.`id` = `e`.`handler_user_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_equipment_reading_wide`
--

/*!50001 DROP VIEW IF EXISTS `v_equipment_reading_wide`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`ppr_migrator`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_equipment_reading_wide` AS select `r`.`id` AS `id`,`r`.`code` AS `code`,`b`.`batch_no` AS `batch_no`,`r`.`production_date` AS `production_date`,`e`.`code` AS `equipment_code`,`e`.`name` AS `equipment_name`,`r`.`collect_time` AS `collect_time`,`r`.`collected_at` AS `collected_at`,`ds`.`name` AS `data_source_name`,`ds`.`is_simulated` AS `source_is_simulated`,`p`.`temperature_c` AS `temperature_c`,`p`.`pressure_mpa` AS `pressure_mpa`,`p`.`haul_off_speed_mpm` AS `haul_off_speed_mpm` from ((((`equipment_reading` `r` join `production_batch` `b` on((`b`.`id` = `r`.`batch_id`))) join `equipment` `e` on((`e`.`id` = `r`.`equipment_id`))) left join `data_source` `ds` on((`ds`.`id` = `r`.`data_source_id`))) left join (select `v`.`reading_id` AS `reading_id`,max((case when (`pp`.`code` = 'temperature') then `v`.`parameter_value` end)) AS `temperature_c`,max((case when (`pp`.`code` = 'pressure') then `v`.`parameter_value` end)) AS `pressure_mpa`,max((case when (`pp`.`code` = 'haul_off_speed') then `v`.`parameter_value` end)) AS `haul_off_speed_mpm` from (`equipment_reading_value` `v` join `process_parameter` `pp` on((`pp`.`id` = `v`.`parameter_id`))) group by `v`.`reading_id`) `p` on((`p`.`reading_id` = `r`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_inspection_record_wide`
--

/*!50001 DROP VIEW IF EXISTS `v_inspection_record_wide`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`ppr_migrator`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_inspection_record_wide` AS select `r`.`id` AS `id`,`r`.`code` AS `code`,`r`.`sample_no` AS `sample_no`,`b`.`batch_no` AS `batch_no`,`r`.`production_group` AS `production_group`,`s`.`code` AS `spec_code`,`s`.`name` AS `spec_name`,`r`.`inspect_time` AS `inspect_time`,`r`.`production_time` AS `production_time`,`r`.`inspection_delay_minutes` AS `inspection_delay_minutes`,`r`.`measurement_stage` AS `measurement_stage`,`r`.`inspection_method` AS `inspection_method`,`r`.`instrument_info` AS `instrument_info`,`r`.`quality_flag` AS `quality_flag`,`r`.`quality_note` AS `quality_note`,`r`.`simulated_ovality` AS `simulated_ovality`,`r`.`record_status` AS `record_status`,`ds`.`name` AS `data_source_name`,`ds`.`is_simulated` AS `source_is_simulated`,`p`.`outer_diameter_mm` AS `outer_diameter_mm`,`p`.`min_wall_thickness_mm` AS `min_wall_thickness_mm`,`p`.`max_wall_thickness_mm` AS `max_wall_thickness_mm`,`p`.`max_outer_diameter_mm` AS `max_outer_diameter_mm`,`p`.`min_outer_diameter_mm` AS `min_outer_diameter_mm`,`p`.`ovality_stored_mm` AS `ovality_stored_mm`,coalesce((`p`.`max_outer_diameter_mm` - `p`.`min_outer_diameter_mm`),`p`.`ovality_stored_mm`) AS `ovality_effective_mm` from ((((`inspection_record` `r` join `production_batch` `b` on((`b`.`id` = `r`.`batch_id`))) left join `product_spec` `s` on((`s`.`id` = `r`.`spec_id`))) left join `data_source` `ds` on((`ds`.`id` = `r`.`data_source_id`))) left join (select `v`.`record_id` AS `record_id`,max((case when (`m`.`code` = 'outer_diameter') then `v`.`metric_value` end)) AS `outer_diameter_mm`,max((case when (`m`.`code` = 'min_wall_thickness') then `v`.`metric_value` end)) AS `min_wall_thickness_mm`,max((case when (`m`.`code` = 'max_wall_thickness') then `v`.`metric_value` end)) AS `max_wall_thickness_mm`,max((case when (`m`.`code` = 'max_outer_diameter') then `v`.`metric_value` end)) AS `max_outer_diameter_mm`,max((case when (`m`.`code` = 'min_outer_diameter') then `v`.`metric_value` end)) AS `min_outer_diameter_mm`,max((case when (`m`.`code` = 'ovality') then `v`.`metric_value` end)) AS `ovality_stored_mm` from (`inspection_value` `v` join `quality_metric` `m` on((`m`.`id` = `v`.`metric_id`))) group by `v`.`record_id`) `p` on((`p`.`record_id` = `r`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_ppr_batch`
--

/*!50001 DROP VIEW IF EXISTS `v_ppr_batch`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_ppr_batch` AS select `ppr_batch`.`id` AS `id`,`ppr_batch`.`batch_no` AS `batch_no`,`ppr_batch`.`spec_id` AS `spec_id`,`ppr_batch`.`production_group` AS `production_group`,`ppr_batch`.`start_time` AS `start_time`,`ppr_batch`.`end_time` AS `end_time`,`ppr_batch`.`status` AS `status`,`ppr_batch`.`measurement_count` AS `measurement_count`,`ppr_batch`.`reading_count` AS `reading_count`,`ppr_batch`.`last_inspect_time` AS `last_inspect_time`,`ppr_batch`.`last_collect_time` AS `last_collect_time`,`ppr_batch`.`extruder_id` AS `extruder_id`,`ppr_batch`.`extruder_name` AS `extruder_name`,`ppr_batch`.`haul_off_id` AS `haul_off_id`,`ppr_batch`.`haul_off_name` AS `haul_off_name`,`ppr_batch`.`created_at` AS `created_at`,`ppr_batch`.`updated_at` AS `updated_at` from `ppr_batch` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_product_data_wide`
--

/*!50001 DROP VIEW IF EXISTS `v_product_data_wide`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`ppr_migrator`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_product_data_wide` AS select `d`.`id` AS `id`,`d`.`code` AS `code`,`b`.`batch_no` AS `batch_no`,`d`.`production_date` AS `production_date`,`ds`.`name` AS `data_source_name`,`ds`.`is_simulated` AS `source_is_simulated`,`p`.`outer_diameter_mm` AS `outer_diameter_mm`,`p`.`min_wall_thickness_mm` AS `min_wall_thickness_mm`,`p`.`max_wall_thickness_mm` AS `max_wall_thickness_mm`,`p`.`ovality_mm` AS `ovality_mm`,coalesce((`p`.`max_outer_diameter_mm` - `p`.`min_outer_diameter_mm`),`p`.`ovality_mm`) AS `ovality_effective_mm` from (((`product_data` `d` join `production_batch` `b` on((`b`.`id` = `d`.`batch_id`))) left join `data_source` `ds` on((`ds`.`id` = `d`.`data_source_id`))) left join (select `v`.`product_data_id` AS `product_data_id`,max((case when (`m`.`code` = 'outer_diameter') then `v`.`metric_value` end)) AS `outer_diameter_mm`,max((case when (`m`.`code` = 'min_wall_thickness') then `v`.`metric_value` end)) AS `min_wall_thickness_mm`,max((case when (`m`.`code` = 'max_wall_thickness') then `v`.`metric_value` end)) AS `max_wall_thickness_mm`,max((case when (`m`.`code` = 'ovality') then `v`.`metric_value` end)) AS `ovality_mm`,max((case when (`m`.`code` = 'max_outer_diameter') then `v`.`metric_value` end)) AS `max_outer_diameter_mm`,max((case when (`m`.`code` = 'min_outer_diameter') then `v`.`metric_value` end)) AS `min_outer_diameter_mm` from (`product_data_value` `v` join `quality_metric` `m` on((`m`.`id` = `v`.`metric_id`))) group by `v`.`product_data_id`) `p` on((`p`.`product_data_id` = `d`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-14 13:18:19

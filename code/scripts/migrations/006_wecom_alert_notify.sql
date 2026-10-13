-- ============================================================================
-- 预警事件接入企业微信群机器人推送
--
-- 背景：预警判定引擎在导入 / 新增 / 编辑 / 删除产品数据、修改规格限值、手工全量扫描后
-- 都会重算事件（见 doc/预警判定规则与实现说明.md 第 7 节）。重算会原地 UPDATE 已有事件，
-- 所以「本次结果里有中高风险」并不等于「出现了新的异常」——只按结果推送会导致重复告警，
-- 批量导入时更会撞上群机器人 20 条/分钟的限流。
--
-- 本迁移做两件事：
--   1. 给 ppr_alert_event 增加推送状态：
--      notified_level = 已推送过的最高风险级别（NULL 表示从未推送）。
--      只有新产生的事件、或 risk_level 高于 notified_level 的事件才会入队推送；
--      推送成功后由 code/src/lib/quality-analysis/wecom-notifier.ts 回写。
--      事件回到正常（normal / closed）时会被清空，下次再异常能重新告警。
--   2. 写入企微推送的 3 个 system_config 配置项，默认关闭，由管理员在
--      「管理后台 → 系统设置 → 预警推送」里填写 Webhook 并开启。
--
-- 迁移幂等：列存在性用 information_schema 判断，配置项用 ON DUPLICATE KEY 忽略已有值。
-- ============================================================================

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_alert_event' AND column_name = 'notified_level'
);
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_alert_event ADD COLUMN notified_level ENUM(''medium'',''high'') NULL COMMENT ''已推送到企业微信的最高风险级别，NULL=未推送；用于重算时避免重复告警'' AFTER source',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ppr_alert_event' AND column_name = 'notified_at'
);
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_alert_event ADD COLUMN notified_at DATETIME NULL COMMENT ''最近一次企业微信推送时间'' AFTER notified_level',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 默认关闭：未配置 Webhook 时不会产生任何外发请求。
-- 已存在的行只保留原值，因此重复执行不会覆盖管理员填写的地址。
INSERT INTO system_config (`key`, value, description) VALUES
  ('wecom_alert_enabled', 'false', '中/高风险预警是否推送到企业微信消息推送（原群机器人）（true/false）'),
  ('wecom_alert_webhook', '', '企业微信「消息推送」（原群机器人）Webhook地址，形如 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx；入口在群聊右上角···，不在管理后台'),
  ('wecom_alert_min_level', 'medium', '触发推送的最低风险级别：medium=中风险及以上、high=仅高风险'),
  ('wecom_alert_mention_list', '', '推送消息需要@的成员userid，多个用逗号分隔，留空表示不@人'),
  ('wecom_alert_mention_all', 'false', '推送中/高风险预警时是否@所有人（true/false）')
ON DUPLICATE KEY UPDATE `key` = `key`;

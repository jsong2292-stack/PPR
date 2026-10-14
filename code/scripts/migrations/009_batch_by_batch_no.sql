-- 009_batch_by_batch_no.sql
--
-- 数据模型改造：批次号成为产品数据与设备数据之间**唯一**的关联键，批次不再单独建表。
--
-- 改造前：ppr_batch 表同时承担三个角色
--   1) 检验记录 / 采集数据的父行（batch_id 外键，ON DELETE RESTRICT）
--   2) 到产品规格的桥（batch.spec_id → 判定限值）
--   3) 到设备的归属（batch.extruder_id / haul_off_id）
-- 改造后：
--   1) ppr_product_measurement / ppr_equipment_reading 各自落 batch_no
--   2) 检验记录直接落 spec_id（判定限值的来源，不再绕批次表）
--   3) 设备归属由采集数据自身反推（reading.equipment_id + 设备类型）
--   4) ppr_batch 变成**视图**：按 batch_no 实时聚合两张子表，不再有需要维护的批次主数据
--
-- 说明：
--   * 本迁移保留既有数据：先把 batch_no / spec_id 从 ppr_batch 回填到子表，再删除外键与 batch_id 列，
--     最后用同名视图顶替原表。已迁移过的库再次执行会自动跳过（每步都用 information_schema 判断）。
--   * 生产/演示环境重建请以 scripts/init-db.sql 为准（那里是权威 DDL）。

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 1) 检验记录：补齐 batch_no / spec_id / production_group / batch_start_time
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'batch_no') = 0,
  'ALTER TABLE ppr_product_measurement ADD COLUMN batch_no VARCHAR(64) NULL COMMENT ''生产批次号，与设备采集数据按批次号关联'' AFTER sample_no',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'spec_id') = 0,
  'ALTER TABLE ppr_product_measurement ADD COLUMN spec_id BIGINT UNSIGNED NULL COMMENT ''产品规格ID，判定限值来源'' AFTER batch_no',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'production_group') = 0,
  'ALTER TABLE ppr_product_measurement ADD COLUMN production_group VARCHAR(64) NULL COMMENT ''生产组别，来自产品数据导入'' AFTER spec_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'batch_start_time') = 0,
  'ALTER TABLE ppr_product_measurement ADD COLUMN batch_start_time DATETIME NULL COMMENT ''批次开始时间，来自产品数据导入'' AFTER production_group',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填（仅当 batch_id 还在，即首次执行本迁移时）
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'batch_id') = 1,
  'UPDATE ppr_product_measurement m JOIN ppr_batch b ON b.id = m.batch_id
     SET m.batch_no = COALESCE(NULLIF(m.batch_no, ''''), b.batch_no),
         m.spec_id = COALESCE(m.spec_id, b.spec_id),
         m.production_group = COALESCE(NULLIF(m.production_group, ''''), b.production_group),
         m.batch_start_time = COALESCE(m.batch_start_time, b.start_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 空批次号的兜底：用检验记录编号占位，保证 NOT NULL 能加上（正常情况下回填后不会命中）
UPDATE ppr_product_measurement SET batch_no = CONCAT('UNKNOWN-', record_no) WHERE batch_no IS NULL OR batch_no = '';

-- ---------------------------------------------------------------------------
-- 2) 采集数据：补齐 batch_no 并回填
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND column_name = 'batch_no') = 0,
  'ALTER TABLE ppr_equipment_reading ADD COLUMN batch_no VARCHAR(64) NULL COMMENT ''生产批次号，与产品检验数据按批次号关联'' AFTER record_no',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND column_name = 'batch_id') = 1,
  'UPDATE ppr_equipment_reading r JOIN ppr_batch b ON b.id = r.batch_id
     SET r.batch_no = COALESCE(NULLIF(r.batch_no, ''''), b.batch_no)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 同一设备 + 同一批次号 + 同一采集时刻的重复行只留 id 最小的一条（加新唯一键前）
DELETE r FROM ppr_equipment_reading r
JOIN ppr_equipment_reading keep
  ON keep.equipment_id = r.equipment_id
 AND keep.batch_no = r.batch_no
 AND keep.collect_time = r.collect_time
 AND keep.id < r.id;
UPDATE ppr_equipment_reading SET batch_no = CONCAT('UNKNOWN-', record_no) WHERE batch_no IS NULL OR batch_no = '';

-- ---------------------------------------------------------------------------
-- 3) NOT NULL 约束（先回填后收紧）
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'batch_no') = 'YES',
  'ALTER TABLE ppr_product_measurement MODIFY COLUMN batch_no VARCHAR(64) NOT NULL COMMENT ''生产批次号，与设备采集数据按批次号关联''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'spec_id') = 'YES',
  'ALTER TABLE ppr_product_measurement MODIFY COLUMN spec_id BIGINT UNSIGNED NOT NULL COMMENT ''产品规格ID，判定限值来源''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND column_name = 'batch_no') = 'YES',
  'ALTER TABLE ppr_equipment_reading MODIFY COLUMN batch_no VARCHAR(64) NOT NULL COMMENT ''生产批次号，与产品检验数据按批次号关联''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4) 索引调整
--
-- 这里三条索引都是「旧定义里带 batch_id」→「新定义里带 batch_no」。
-- 判断索引是否存在必须用 statistics 的行数（多列索引每列一行），
-- 并且要额外确认 batch_no 已在索引里，否则 batch_id 列被删后索引会退化成单列，
-- 而按名字判断「已存在」会让它永远补不回来。
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement'
      AND index_name = 'idx_ppr_measurement_batch_time') > 0
  AND (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement'
      AND index_name = 'idx_ppr_measurement_batch_time' AND column_name = 'batch_no') = 0,
  'ALTER TABLE ppr_product_measurement DROP KEY idx_ppr_measurement_batch_time',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND index_name = 'idx_ppr_measurement_batch_time') = 0,
  'ALTER TABLE ppr_product_measurement ADD KEY idx_ppr_measurement_batch_time (batch_no, inspect_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND index_name = 'idx_ppr_measurement_spec_time') = 0,
  'ALTER TABLE ppr_product_measurement ADD KEY idx_ppr_measurement_spec_time (spec_id, inspect_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading'
      AND index_name = 'idx_ppr_equipment_reading_batch_time') > 0
  AND (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading'
      AND index_name = 'idx_ppr_equipment_reading_batch_time' AND column_name = 'batch_no') = 0,
  'ALTER TABLE ppr_equipment_reading DROP KEY idx_ppr_equipment_reading_batch_time',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND index_name = 'idx_ppr_equipment_reading_batch_time') = 0,
  'ALTER TABLE ppr_equipment_reading ADD KEY idx_ppr_equipment_reading_batch_time (batch_no, collect_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 采集数据唯一键：batch_id → batch_no
--
-- 注意 information_schema.statistics 对多列索引是「每列一行」，
-- 判断「索引是否存在」必须用 > 0 / = 0，不能用 = 1（旧写法 = 1 会让 3 列索引的 DROP 被跳过，
-- 结果是列改名后索引悄悄退化成 (equipment_id, collect_time)，跨批次同一时刻会被误判为重复）。
-- 判断「是否为旧定义」则看索引里有没有 batch_no 这一列。
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading'
      AND index_name = 'uk_ppr_equipment_reading_equipment_batch_time') > 0
  AND (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading'
      AND index_name = 'uk_ppr_equipment_reading_equipment_batch_time' AND column_name = 'batch_no') = 0,
  'ALTER TABLE ppr_equipment_reading DROP KEY uk_ppr_equipment_reading_equipment_batch_time',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading'
      AND index_name = 'uk_ppr_equipment_reading_equipment_batch_time') = 0,
  'ALTER TABLE ppr_equipment_reading ADD UNIQUE KEY uk_ppr_equipment_reading_equipment_batch_time (equipment_id, batch_no, collect_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 5) 拆掉 ppr_batch 外键与 batch_id 列
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement'
      AND constraint_name = 'fk_ppr_measurement_batch' AND constraint_type = 'FOREIGN KEY') = 1,
  'ALTER TABLE ppr_product_measurement DROP FOREIGN KEY fk_ppr_measurement_batch',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading'
      AND constraint_name = 'fk_ppr_reading_batch' AND constraint_type = 'FOREIGN KEY') = 1,
  'ALTER TABLE ppr_equipment_reading DROP FOREIGN KEY fk_ppr_reading_batch',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_product_measurement' AND column_name = 'batch_id') = 1,
  'ALTER TABLE ppr_product_measurement DROP COLUMN batch_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND column_name = 'batch_id') = 1,
  'ALTER TABLE ppr_equipment_reading DROP COLUMN batch_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 6) 表 → 视图：ppr_batch 变成按批次号实时聚合的只读视图
-- ---------------------------------------------------------------------------
-- 兼容别名 v_ppr_batch 指向 ppr_batch，重建 ppr_batch 前必须先摘掉它，
-- 否则 MySQL 不允许替换/删除被其它视图引用的视图。
DROP VIEW IF EXISTS v_ppr_batch;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'ppr_batch' AND table_type = 'BASE TABLE') = 1,
  'DROP TABLE ppr_batch',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
         MAX(spec_id)                                AS spec_id,
         MAX(production_group)                       AS production_group,
         MIN(COALESCE(batch_start_time, inspect_time)) AS start_time,
         COUNT(*)                                    AS measurement_count,
         MAX(inspect_time)                           AS last_inspect_time
  FROM ppr_product_measurement
  GROUP BY batch_no
) m ON m.batch_no = k.batch_no
LEFT JOIN (
  SELECT batch_no,
         COUNT(*)           AS reading_count,
         MIN(collect_time)  AS first_collect_time,
         MAX(collect_time)  AS last_collect_time
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

-- 兼容别名：旧版报表/工具按 v_ 前缀找视图（v_product_data_wide 等），
-- 这里给出同名的批次视图，列与 ppr_batch 完全一致，方便沿用旧查询习惯。
CREATE OR REPLACE VIEW v_ppr_batch AS SELECT * FROM ppr_batch;

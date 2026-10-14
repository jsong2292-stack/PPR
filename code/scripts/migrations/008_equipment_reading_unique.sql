-- 008_equipment_reading_unique.sql
--
-- 采集数据唯一键：同一设备 + 同一批次 + 同一采集时刻只允许一条记录。
-- 目的：设备采集数据改为「批次内 Excel 导入」后，重复导入同一个文件会产生脏数据，
--       用数据库唯一键做最后一道防线（接口侧也会给出可读提示，见
--       src/app/api/quality/equipment/[equipmentId]/batches/[batchNo]/readings/route.ts）。
--
-- 幂等：MySQL 不支持 ADD UNIQUE KEY IF NOT EXISTS，先查 information_schema.statistics 再决定是否执行 DDL。
--
-- 兼容两种模型：批次列在 009 之前叫 batch_id（指向已废弃的批次表），009 之后叫 batch_no（批次号字符串）。
-- 迁移执行器不记录「已执行」，每次 db:migrate 都会从头跑一遍，所以这里必须能在新模型下原样通过。

-- 1) 判断当前哪一列存在，决定后面拼 SQL 用哪个列名。
SET @batch_col := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND column_name = 'batch_id') = 1,
  'batch_id',
  IF((SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'ppr_equipment_reading' AND column_name = 'batch_no') = 1,
    'batch_no', NULL));

-- 2) 加唯一键前先清理历史重复行：同一 (设备, 批次, 采集时刻) 只保留 id 最小的一条。
--    这一步只删除「按同一口径完全重复」的冗余行，不做任何字段改写。
SET @ddl := IF(@batch_col IS NULL, 'SELECT 1',
  CONCAT('DELETE r FROM ppr_equipment_reading r JOIN ppr_equipment_reading keep',
         ' ON keep.equipment_id = r.equipment_id',
         ' AND keep.', @batch_col, ' = r.', @batch_col,
         ' AND keep.collect_time = r.collect_time',
         ' AND keep.id < r.id'));
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 加唯一键（已存在则跳过）。索引名沿用旧名，新旧模型下含义一致。
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ppr_equipment_reading'
    AND index_name = 'uk_ppr_equipment_reading_equipment_batch_time'
);
SET @ddl := IF(@exists > 0 OR @batch_col IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE ppr_equipment_reading ADD UNIQUE KEY uk_ppr_equipment_reading_equipment_batch_time (equipment_id, ',
         @batch_col, ', collect_time)'));
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

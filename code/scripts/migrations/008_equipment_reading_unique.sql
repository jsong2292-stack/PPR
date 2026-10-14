-- 008_equipment_reading_unique.sql
--
-- 采集数据唯一键：同一设备 + 同一批次 + 同一采集时刻只允许一条记录。
-- 目的：设备采集数据改为「批次内 Excel 导入」后，重复导入同一个文件会产生脏数据，
--       用数据库唯一键做最后一道防线（接口会先给出可读的重复提示，见
--       src/app/api/quality/equipment/[equipmentId]/batches/[batchId]/readings/route.ts）。
--
-- 幂等：MySQL 不支持 ADD UNIQUE KEY IF NOT EXISTS，先查 information_schema.statistics 再决定是否执行 DDL。

-- 1) 加唯一键前先清理历史重复行：同一 (device, batch, time) 只保留 id 最小的一条。
--    这一步只删除「按新口径完全重复」的冗余行，不做任何字段改写。
DELETE r FROM ppr_equipment_reading r
JOIN ppr_equipment_reading keep
  ON keep.equipment_id = r.equipment_id
 AND keep.batch_id = r.batch_id
 AND keep.collect_time = r.collect_time
 AND keep.id < r.id;

-- 2) 加唯一键（已存在则跳过）。
SET @exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ppr_equipment_reading'
    AND index_name = 'uk_ppr_equipment_reading_equipment_batch_time'
);
SET @ddl := IF(@exists = 0,
  'ALTER TABLE ppr_equipment_reading ADD UNIQUE KEY uk_ppr_equipment_reading_equipment_batch_time (equipment_id, batch_id, collect_time)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

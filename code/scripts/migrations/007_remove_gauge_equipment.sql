-- 007_remove_gauge_equipment.sql
--
-- 删除设备台账中的「1号在线测径仪」（EQ-GA-01）及其设备类型「在线测径仪」（ETYPE-GAUGE）。
-- 业务口径：测径仪不在本次设备采集数据的范围内，设备类型只保留挤出机与牵引机。
--
-- 幂等：可重复执行，已删除时两条语句都不影响任何行。
-- 安全：带引用保护——只有在该设备/类型确实没有任何业务引用时才删除，避免误删在用的主数据。
--   ppr_equipment            ← ppr_equipment_reading.equipment_id (RESTRICT)
--                            ← ppr_batch.extruder_id / haul_off_id (SET NULL)
--   ppr_equipment_type       ← ppr_equipment.type_id (RESTRICT)
-- MySQL 外键是 RESTRICT，若不先删设备直接删类型会直接报错，所以顺序必须是「先设备、后类型」。

-- 1) 设备：没有任何采集记录、也没有被任何批次当作挤出机/牵引机引用时才删除。
DELETE FROM ppr_equipment
WHERE code = 'EQ-GA-01'
  AND NOT EXISTS (
    SELECT 1 FROM ppr_equipment_reading r WHERE r.equipment_id = ppr_equipment.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM ppr_batch b
    WHERE b.extruder_id = ppr_equipment.id OR b.haul_off_id = ppr_equipment.id
  );

-- 2) 设备类型：该类型下已经没有设备时才删除。
DELETE FROM ppr_equipment_type
WHERE code = 'ETYPE-GAUGE'
  AND NOT EXISTS (
    SELECT 1 FROM ppr_equipment e WHERE e.type_id = ppr_equipment_type.id
  );

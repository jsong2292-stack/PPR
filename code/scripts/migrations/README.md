# 增量迁移目录

按文件名顺序执行（`node scripts/migrate.js`）。

## 约定

1. 文件名格式：`NNN_描述.sql`，例如 `001_add_user_department.sql`
2. **必须幂等**：迁移执行器不记录执行状态，重复运行不能报错

   ```sql
   CREATE TABLE IF NOT EXISTS example (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT,
     name VARCHAR(100),
     PRIMARY KEY (id)
   );

   CREATE INDEX example_name_idx ON example(name);
   ```

   > MySQL 不支持 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，
   > 新增列时请先查询 `information_schema.columns` 判断，或使用存储过程封装。

3. 不要在迁移中删除数据；破坏性变更请拆成「新增 → 双写 → 切读 → 清理」多步

4. **判断索引是否存在，不能用 `COUNT(*) = 1`**

   `information_schema.statistics` 对多列索引是「每个索引列一行」，所以
   `COUNT(*) = 1` 只对单列索引成立。写成 `= 1` 会让多列索引的 `DROP KEY` 被悄悄跳过，
   紧接着「不存在就创建」的判断又看到索引名已存在而跳过创建 —— 索引就永久退化了
   （改 `batch_id` → `batch_no` 时就踩过：唯一键悄悄变成 `(equipment_id, collect_time)`）。

   ```sql
   -- 索引存在（≥1 行）且里面还没有目标列 → 先删掉旧定义
   SET @ddl := IF(
     (SELECT COUNT(*) FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 't' AND index_name = 'idx_t_a_b') > 0
     AND (SELECT COUNT(*) FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 't' AND index_name = 'idx_t_a_b' AND column_name = 'b') = 0,
     'ALTER TABLE t DROP KEY idx_t_a_b', 'SELECT 1');
   ```

   相关坑：索引里如果有列被 `DROP COLUMN` 删掉，MySQL 会把那一列从索引里摘掉（索引名保留），
   按名字判断「已存在」就再也补不回来。删列前先确认哪些索引引用了它。

## 示例

```sql
-- 001_add_user_department.sql
-- 由于 MySQL 无 ADD COLUMN IF NOT EXISTS，需先判断列是否存在
SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'department'
);
SET @ddl := IF(@exists = 0,
  'ALTER TABLE users ADD COLUMN department VARCHAR(100)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

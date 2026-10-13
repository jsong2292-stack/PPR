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

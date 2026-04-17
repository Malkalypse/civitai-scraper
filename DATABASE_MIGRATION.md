# Database Migration: JSON to `images` Table

## Summary

The application has been restructured to move from JSON file-based storage of image metadata to a centralized `images` database table. This eliminates the need for the redundant `version_workflows` table and provides a single source of truth for all image data.

## Schema Changes

### New Table: `images`

```sql
CREATE TABLE IF NOT EXISTS images (
  image_id BIGINT NOT NULL PRIMARY KEY,
  model_id INT NOT NULL,
  model_version_id INT NOT NULL,
  image_filename VARCHAR(255),
  prompt_text LONGTEXT,
  copy_all_text LONGTEXT,
  workflow_hash VARCHAR(64),
  favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_version_id (model_version_id),
  INDEX idx_workflow_hash (workflow_hash),
  INDEX idx_version_workflow (model_version_id, workflow_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### Deprecated Table: `version_workflows`

This table is now **redundant** and can be dropped. The `images` table contains all necessary information to determine workflow counts per version via:

```sql
SELECT workflow_hash, COUNT(*) AS image_count 
FROM images 
WHERE model_version_id = ? AND workflow_hash IS NOT NULL 
GROUP BY workflow_hash
```

## Migration Steps

### 1. Create the `images` Table

Run the SQL in `sql/create_images_table.sql` in your MySQL database:

```sql
USE civitai_models;
SOURCE sql/create_images_table.sql;
```

### 2. Migrate Existing JSON Data (Optional)

If you have existing `image_generation/*.json` files with data, use the migration script:

**Via Browser:**
Navigate to: `http://localhost/civitai-scraper/web/api/utils/migrate_json_to_db.php`

**Via Command Line:**
```bash
cd /c/xampp/htdocs/civitai-scraper
php web/api/utils/migrate_json_to_db.php
```

This will:
- Read all JSON files from `web/cache/image_generation/`
- Parse each file and extract metadata
- Insert into the `images` table (skips if already present)
- Report migration statistics (migrated, skipped, errors)

### 3. Verify Data (Optional)

Check that data was migrated correctly:

```sql
SELECT COUNT(*) FROM images;
SELECT workflow_hash, COUNT(*) FROM images 
  WHERE workflow_hash IS NOT NULL 
  GROUP BY workflow_hash 
  LIMIT 10;
```

### 4. Drop Old `version_workflows` Table (When Ready)

Once you've verified the migration is complete:

```sql
DROP TABLE IF EXISTS version_workflows;
```

## Code Changes

### Updated Endpoints

0. **`web/api/images/update_image_workflow.php`**
   - Now writes to `images` table instead of JSON files
   - Updates: `image_id`, `model_id`, `model_version_id`, `image_filename`, `workflow_hash`
   - Uses `INSERT INTO images (...) ON DUPLICATE KEY UPDATE` for upserts

2. **`web/api/images/get_image_workflow_state.php`**
   - Reads workflow state from `images.workflow_hash` instead of JSON
   - Returns: `{ imageId, hasWorkflowEntry, workflowNull, workflowHash }`
   - `workflow_hash = NULL` means "confirmed no workflow"
   - `workflow_hash = string` means workflow present

3. **`web/api/images/get_image_generation_data.php`**
   - Reads/writes `prompt_text`, `copy_all_text`, `favorite` to database
   - Fetches from Civitai API on first access
   - Caches results in DB for future requests
   - Updates `model_id`, `model_version_id`, `image_filename` when provided

4. **`web/api/settings/get_version_workflows.php`**
   - Now queries `images` table instead of `version_workflows`
   - Counts images per workflow hash for the given model version
   - Returns actual image counts (not always 1)

### New Files

- **`sql/create_images_table.sql`** — Schema for the images table
- **`web/api/utils/migrate_json_to_db.php`** — Migration script

### Removed Requirements

- The `version_workflows` database table is no longer needed
- The `web/cache/image_generation/*.json` files are no longer written to (but old files can be kept, do old code for Python, etc.)

## Benefits

1. **Single Source of Truth** — All image data is in one table
2. **Real Image Counts** — Workflow filter buttons now show actual image counts per hash
3. **Better Performance** — Direct DB queries are faster than file I/O for counts
4. **Cleaner Codebase** — Reduces JSON file management and parsing overhead
5. **Eliminated Redundancy** — No duplicate `version_workflows` table

## Backward Compatibility

- The JSON files can still exist; they're just not read or written anymore
- All external APIs continue to work the same way from the frontend perspective
- The migration is transparent to JavaScript code (same API responses)

## Next Steps

1. Run the SQL `CREATE TABLE` statement
2. Run the migration script (if you have existing JSON data)
3. Remove `version_workflows` table (when ready)
4. Delete old JSON cache files (optional: `rm web/cache/image_generation/*.json`)
5. Test the app to ensure workflows/prompts display correctly

## Rollback (If Needed)

If you need to rollback:

1. Keep the backups of the original `get_image_generation_data.php` (saved as `.json.bak`)
2. Restore from backups if needed
3. The JSON files will still be on disk, so you can recover data if necessary

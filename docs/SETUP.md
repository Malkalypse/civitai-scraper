# Setup Guide

## Prerequisites

- Windows with XAMPP (Apache + MySQL)
- PHP cURL extension enabled
- Write permissions for:
  - web/cache/images/
  - web/cache/image_generation/
- Optional: Python 3 for optimize_image.py

## Install

1. Place repository in htdocs:
   - c:/xampp/htdocs/civitai-scraper
2. Start Apache and MySQL from XAMPP.
3. Create databases:
   - civitai_models
   - comfyui_nodes
4. Run SQL bootstrap:
   - sql/create_models_table.sql

## Required civitai_models Tables

The runtime references these tables:
- models
- tags
- model_tags
- settings
- version_workflows
- version_samplers
- version_schedulers
- samplers
- schedulers

If version_workflows is new in your environment, use a schema equivalent to:

```sql
CREATE TABLE IF NOT EXISTS version_workflows (
  version_id INT NOT NULL,
  workflow_id VARCHAR(255) NOT NULL,
  workflow_revision INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version_id, workflow_id, workflow_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## Open App

- http://localhost/civitai-scraper/web/

## Common Issues

### Prompts/params show unavailable

- Ensure get_image_generation_data.php can reach Civitai.
- Verify cache files are writable in web/cache/image_generation/.

### Workflow copy/analyze always fails

- Some images are not PNG or have no embedded workflow metadata.
- Check web/cache/error.log for backend errors.

### Cache clear does not remove expected files

- Use model clear or clear all from UI cache section.
- Confirm web/cache/images/ and web/cache/image_generation/ permissions.

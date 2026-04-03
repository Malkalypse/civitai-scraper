# Civitai Scraper

Local-first Civitai model explorer and metadata utility for Windows/XAMPP environments.

This project provides:
- A browser UI for loading Civitai model/version data.
- Async carousel/gallery image loading with local image caching.
- Prompt/parameter hydration from Civitai generation data.
- Workflow extraction and analysis from PNG metadata.
- Local workflow/favorite state tracking in JSON cache files.
- Database sync utilities for models, tags, settings, and workflow/version associations.

## Tech Stack

- Frontend: vanilla JavaScript + PHP-rendered HTML
- Backend APIs: PHP (mysqli + cURL)
- Databases:
  - civitai_models
  - comfyui_nodes
- Optional Python helper:
  - python/optimize_image.py (Pillow)

## Project Layout

- web/: UI and API endpoints
  - web/index.php
  - web/js/script.js
  - web/api/*.php
  - web/cache/images/
  - web/cache/image_generation/
- sql/: SQL bootstrap scripts
- python/: optional image optimization helper scripts
- tests/: PHP test utilities

## Quick Start (XAMPP)

1. Place repo at:
   - c:/xampp/htdocs/civitai-scraper
2. Start Apache and MySQL in XAMPP.
3. Ensure databases exist:
   - civitai_models
   - comfyui_nodes
4. Create base models table:
   - run sql/create_models_table.sql
5. Open app:
   - http://localhost/civitai-scraper/web/

## Minimum Database Tables

At minimum, current runtime expects these tables to exist in civitai_models:
- models
- tags
- model_tags
- settings
- version_workflows
- version_samplers
- version_schedulers
- samplers
- schedulers

Expected version_workflows columns:
- version_id (INT)
- workflow_id (VARCHAR/TEXT)
- workflow_revision (INT)

Recommended key:
- UNIQUE KEY(version_id, workflow_id, workflow_revision)

## Core Features

### Image Loading and Cache

- Images are fetched from Civitai APIs and displayed in carousel + gallery sections.
- Cache checks happen before downloads.
- Cached images load immediately.
- Remote image downloads are throttled to reduce anti-scraping pressure.

### Prompt and Parameter Hydration

- Per-image prompt/params are fetched via:
  - web/api/get_image_generation_data.php
- Results are cached to:
  - web/cache/image_generation/<imageId>.json

### Workflow Extraction and Analysis

- Copy Workflow and Analyze Workflow use:
  - web/api/extract_image_workflow.php
- Workflow metadata state updates use:
  - web/api/update_image_workflow.php
- Successful workflow extraction stores workflow id and revision in metadata cache.

### Workflow Version Tracking

When a workflow is successfully extracted:
- version_id, workflow_id, workflow_revision are inserted into version_workflows if not present.

### Workflow Filter Buttons

On model page load:
- The UI queries workflow combinations for the current version from:
  - web/api/get_version_workflows.php
- A vertical filter list is rendered (with All at top).
- Selecting a workflow filter shows only images whose cached metadata matches that workflow id + revision.

## Cache Management

- Clear (model) and Clear All actions remove both:
  - cached image files
  - image generation metadata JSON files

## Documentation

- docs/SETUP.md
- docs/API.md
- docs/WORKFLOWS.md

## Development Notes

- Follow STYLE_GUIDE.md conventions.
- Keep frontend state updates centralized in script.js helper functions where possible.
- Prefer additive, rollback-safe changes.

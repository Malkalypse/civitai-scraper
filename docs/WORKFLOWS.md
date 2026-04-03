# Workflow and Image Filtering

## Overview

The UI supports workflow-oriented actions and filtering:
- Copy Workflow
- Analyze Workflow
- Workflow-based image filtering by version

## Workflow Extraction Flow

1. User clicks Copy Workflow or Analyze Workflow.
2. Frontend calls extract_image_workflow.php.
3. On success:
   - Workflow JSON is parsed.
   - Workflow id and revision are persisted to image metadata cache.
   - version_workflows table is updated (insert-if-missing).
4. On explicit missing-workflow response:
   - image is marked workflow:null.

## Error Handling

The extractor returns explicit error codes:
- WORKFLOW_NOT_FOUND
- UNSUPPORTED_FORMAT

Only WORKFLOW_NOT_FOUND should mark an image as workflow missing.
Transient/network/clipboard issues should not permanently mark missing workflow.

## Per-image Metadata

Files:
- web/cache/image_generation/<imageId>.json

Relevant fields:
- workflow (string id, null, or legacy true)
- version (revision)
- Favorite
- modelId
- modelVersionId
- imageFilename

## Version Workflow Registry

When workflow extraction succeeds, update_image_workflow.php attempts to insert:
- version_id
- workflow_id
- workflow_revision

into version_workflows if the exact combination does not already exist.

## Workflow Filter Buttons

On model page load:
1. Frontend requests workflow combos for current version via get_version_workflows.php.
2. Renders vertical button list below display toggle row:
   - All (default)
   - one button per workflow_id + workflow_revision pair
3. Buttons are single-select (radio-like).

Filter behavior:
- All: all cards eligible.
- Specific workflow button: show only cards whose cached workflow id+revision match.

## Interaction with Other Filters

Workflow filter composes with existing card filters:
- Hide Non-Workflow
- Hide Non-Favorites

A card is hidden if any active filter says it should be hidden.

## Video Behavior

Video tiles are wrapped as image-card elements so workflow filtering can hide them under specific workflow selections.

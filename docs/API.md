# API Overview

This document summarizes key API endpoints under web/api/.

## Model and Data Loading

### POST fetch_data.php
Input:
- modelId (string)

Output:
- selectedVersion
- modelTags
- parsed __NEXT_DATA__ payload

### POST get_model_images.php
Input:
- modelId
- versionId

Output:
- carouselImages[]
- galleryImages[]

## Image Cache and Metadata

### POST cache_image.php
Input:
- imageUrl
- lookupUrl (optional id hint)
- download (bool)
- modelId/versionId (optional metadata)

Behavior:
- checks local cache
- optionally downloads and stores image
- updates image_generation metadata file when imageId is known

### POST cache_manager.php
Actions:
- getSize
- clearModel
- clearAll

Clear actions remove both:
- web/cache/images/*
- web/cache/image_generation/*.json

## Prompt/Parameter Hydration

### POST get_image_generation_data.php
Input:
- imageId
- modelId (optional)
- modelVersionId (optional)
- imageFilename (optional)

Output:
- promptText
- paramsText
- copyAllText
- favorite
- workflowPresent
- workflowNull
- workflowId
- workflowRevision

Notes:
- Uses local metadata cache when generation text exists.
- Falls through to remote fetch when cache has only workflow/favorite metadata.

## Workflow Extraction and State

### POST extract_image_workflow.php
Input:
- imageId
- imagePageUrl
- fullImageUrl

Output:
- success + workflowText
- or explicit errorCode such as:
  - WORKFLOW_NOT_FOUND
  - UNSUPPORTED_FORMAT

### POST update_image_workflow.php
Input:
- imageId
- workflowState (present/missing)
- workflow
- version
- modelId/modelVersionId/imageFilename (optional metadata)

Behavior:
- updates image_generation JSON workflow state
- on present: inserts into version_workflows when missing
  - version_id (int)
  - workflow_id (string)
  - workflow_revision (int)

### POST get_version_workflows.php
Input:
- versionId (int)

Output:
- workflows[]:
  - workflowId
  - workflowRevision

Used by frontend workflow filter button list.

## Favorites and Settings

### POST update_image_favorite.php
Input:
- imageId
- favorite
- modelId/modelVersionId/imageFilename (optional)

Behavior:
- updates Favorite field in per-image JSON metadata

### POST update_settings.php
Updates settings set values for a version.

### POST create_settings_set.php
Creates a new settings row set_id for a version.

### POST update_version_tools.php
Updates sampler/scheduler assignments for a version + set.

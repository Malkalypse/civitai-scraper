# JavaScript Function Analysis Report
## civitai-scraper/web/js Directory

**Report Generated**: 2026-04-25  
**Total Files Analyzed**: 22  
**Analysis Scope**: Function definitions, call relationships within files, single-caller functions

---

## File: workflow.js
**Import Dependencies**: app-context, filters, image-cache, parameters, analysis, rendering

### Functions

#### 1. `copyImageWorkflow()` ⬆️ EXPORTED
- **Type**: Named export (async)
- **Called By**: External (image-gallery.js event handler)
- **Calls Within File**: 
  - `extractAndPersistWorkflowForElement()` [1 caller only]
  - `copyTextWithFallback()` [external]
- **Single-Caller Candidate**: No (called from external)

#### 2. `analyzeImageWorkflow()` ⬆️ EXPORTED
- **Type**: Named export (async)
- **Called By**: External (image-gallery.js event handler)
- **Calls Within File**: 
  - `extractAndPersistWorkflowForElement()` [1 caller only]
- **Single-Caller Candidate**: No (called from external)

#### 3. `retrySingleImageWorkflowScan()` ⬆️ EXPORTED
- **Type**: Named export (async)
- **Called By**: External (image-gallery.js event handler)
- **Calls Within File**: 
  - `extractAndPersistWorkflowForElement()` [1 caller only]
  - `markWorkflowMissingForElement()` [2 callers: this + scanMissingImageWorkflows]
- **Single-Caller Candidate**: No (called from external)

#### 4. `scanMissingImageWorkflows()` ⬆️ EXPORTED
- **Type**: Named export (async)
- **Called By**: External (model-actions.js event handler)
- **Calls Within File**: 
  - `collectUniqueWorkflowButtons()` [1 caller only]
  - `fetchCachedWorkflowEntryState()` [1 caller only]
  - `extractAndPersistWorkflowForElement()` [1 caller only]
  - `markImageParametersAsPresent()` [1 caller only]
  - `markWorkflowMissingForElement()` [2 callers: this + retrySingleImageWorkflowScan]
  - `shouldMarkWorkflowAsMissing()` [1 caller only]
- **Single-Caller Candidate**: No (called from external)

#### 5. `collectUniqueWorkflowButtons()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `scanMissingImageWorkflows()` [1 caller only]
- **Calls Within File**: (none relevant to this file)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `scanMissingImageWorkflows()`

#### 6. `fetchCachedWorkflowEntryState()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `scanMissingImageWorkflows()` [1 caller only]
- **Calls Within File**: (none relevant to this file)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `scanMissingImageWorkflows()`

#### 7. `markWorkflowMissingForElement()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `retrySingleImageWorkflowScan()`, `scanMissingImageWorkflows()` [2 callers]
- **Calls Within File**: 
  - `markImageWorkflowAsNull()` [exported, called by external]
  - `applyWorkflowUiToAllCardsForImageId()` [2 callers: this + extractAndPersistWorkflowForElement]
- **Single-Caller Candidate**: No (multiple callers)

#### 8. `markImageWorkflowAsNull()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `markWorkflowMissingForElement()` [1 internal caller], External calls possible
- **Calls Within File**: 
  - `refreshWorkflowFilterOptionsForCurrentVersion()` [1 caller only]
- **Single-Caller Candidate**: No (exported, called externally)

#### 9. `extractAndPersistWorkflowForElement()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `copyImageWorkflow()`, `analyzeImageWorkflow()`, `retrySingleImageWorkflowScan()`, `scanMissingImageWorkflows()` [4 callers]
- **Calls Within File**: 
  - `fetchImageWorkflowData()` [1 caller only]
  - `buildModelFilenameForWorkflow()` [1 caller only]
  - (multiple external imports called)
  - `markImageParametersAsPresent()` [1 caller only]
  - `applyWorkflowUiToAllCardsForImageId()` [2 callers: this + markWorkflowMissingForElement]
  - `markImageWorkflowAsPresent()` [1 caller only]
- **Single-Caller Candidate**: No (4 callers)

#### 10. `fetchImageWorkflowData()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `extractAndPersistWorkflowForElement()` [1 internal caller], External calls possible
- **Calls Within File**: 
  - `fetchParametersFallbackFromGenerationData()` [external] (3 error handling paths)
- **Single-Caller Candidate**: No (exported)

#### 11. `buildModelFilenameForWorkflow()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `extractAndPersistWorkflowForElement()` [1 caller only]
- **Calls Within File**: (none - utility function)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `extractAndPersistWorkflowForElement()`

#### 12. `markImageWorkflowAsPresent()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `extractAndPersistWorkflowForElement()` [1 internal caller], External calls possible
- **Calls Within File**: 
  - `refreshWorkflowFilterOptionsForCurrentVersion()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 13. `markImageParametersAsPresent()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `extractAndPersistWorkflowForElement()`, `scanMissingImageWorkflows()` [2 internal callers], External calls possible
- **Calls Within File**: 
  - `refreshWorkflowFilterOptionsForCurrentVersion()` [1 caller only]
- **Single-Caller Candidate**: No (exported, 2 internal callers)

#### 14. `shouldMarkWorkflowAsMissing()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `scanMissingImageWorkflows()` [1 internal caller], External calls
- **Calls Within File**: 
  - `isMissingWorkflowError()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 15. `isMissingWorkflowError()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `shouldMarkWorkflowAsMissing()` [1 internal caller], External calls
- **Calls Within File**: (none - utility check)
- **Single-Caller Candidate**: No (exported)

#### 16. `applyWorkflowUiToAllCardsForImageId()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `markWorkflowMissingForElement()`, `extractAndPersistWorkflowForElement()` [2 callers]
- **Calls Within File**: 
  - `applyPresentWorkflowUi()` [1 caller only]
  - `applyParametersWorkflowUi()` [1 caller only]
  - `applyMissingWorkflowUi()` [1 caller only]
- **Single-Caller Candidate**: No (2 callers)

#### 17. `applyPresentWorkflowUi()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `applyWorkflowUiToAllCardsForImageId()` [1 caller only]
- **Calls Within File**: 
  - `updateImageCardState()` [external]
  - `setFavoriteImageBorder()` [external]
  - `applyImageCardBorder()` [external]
  - `applyImageCardFilters()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `applyWorkflowUiToAllCardsForImageId()`

#### 18. `applyParametersWorkflowUi()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `applyWorkflowUiToAllCardsForImageId()` [1 caller only]
- **Calls Within File**: 
  - `applyWorkflowIdentityToCard()` [external]
  - `updateImageCardState()` [external]
  - `setFavoriteImageBorder()` [external]
  - `applyImageCardFilters()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `applyWorkflowUiToAllCardsForImageId()`

#### 19. `applyMissingWorkflowUi()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `applyWorkflowUiToAllCardsForImageId()` [1 caller only]
- **Calls Within File**: 
  - `applyWorkflowIdentityToCard()` [external]
  - `updateImageCardState()` [external]
  - `setFavoriteImageBorder()` [external]
  - `applyImageCardBorder()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `applyWorkflowUiToAllCardsForImageId()`

#### 20. `refreshWorkflowFilterOptionsForCurrentVersion()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `markImageWorkflowAsNull()`, `markImageWorkflowAsPresent()`, `markImageParametersAsPresent()` [3 callers]
- **Calls Within File**: 
  - `loadVersionWorkflowFilters()` [external]
- **Single-Caller Candidate**: No (3 callers)

---

## File: image-gallery.js
**Import Dependencies**: app-context, filters, image-cache, workflow, dom-utils

### Functions

#### 1. `initializeImageGalleryEventHandlers()` 🔒 LOCAL
- **Type**: Function declaration with property-based initialization tracking
- **Called By**: Module execution (auto-invoked at load)
- **Calls Within File**: 
  - `copyImageWorkflow()` [external]
  - `analyzeImageWorkflow()` [external]
  - `retrySingleImageWorkflowScan()` [external]
  - `toggleImageFavorite()` [external]
- **Single-Caller Candidate**: No (executed at module load)

#### 2. `updateThumbnailSize()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js event handler
- **Calls Within File**: 
  - `syncCopyAllPreviewWidth()` [external]
  - `autosizeCopyAllPreview()` [external]
  - `applyGenerationPreviewVisibility()` [external]
- **Single-Caller Candidate**: No (exported)

#### 3. `loadModelImages()` ⬆️ EXPORTED (async)
- **Type**: Named export (async)
- **Called By**: model-actions.js: `fetchData()`
- **Calls Within File**: 
  - `waitForWorkflowSectionToBeHidden()` [external] (multiple times)
  - `checkCached()` [external]
  - `downloadAndCache()` [external]
  - `queueCopyAllPreviewHydration()` [external]
  - `syncCopyAllPreviewWidth()` [external]
  - `autosizeCopyAllPreview()` [external]
  - `applyGenerationPreviewVisibility()` [external]
  - `applyImageCardFilters()` [external]
  - Internal nested functions: loadCarouselImages, loadGalleryImages
- **Single-Caller Candidate**: No (exported)

#### 4. `loadCarouselImages()` 🔒 LOCAL (nested async)
- **Type**: Nested function inside `loadModelImages()`
- **Called By**: Initial call within `loadModelImages()` (1 caller only)
- **Note**: This is a nested function - reorganization would require extracting
- **Single-Caller Candidate**: ✅ **YES IF extracted** - Currently nested

#### 5. `loadGalleryImages()` 🔒 LOCAL (nested async)
- **Type**: Nested function inside `loadModelImages()`
- **Called By**: Initial call within `loadModelImages()` (1 caller only)
- **Note**: This is a nested function - reorganization would require extracting
- **Single-Caller Candidate**: ✅ **YES IF extracted** - Currently nested

---

## File: image-cache.js
**Import Dependencies**: app-context, filters, url-utils

### Functions

#### 1. `checkCached()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: image-gallery.js (2 places: carousel and gallery loading)
- **Calls Within File**: (none)
- **Single-Caller Candidate**: No (exported, multiple call sites)

#### 2. `downloadAndCache()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: image-gallery.js (2 places: carousel and gallery loading)
- **Calls Within File**: (none)
- **Single-Caller Candidate**: No (exported)

#### 3. `fetchCopyAllTextForImageId()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `processCopyAllPreviewQueue()` [1 caller only], External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

#### 4. `queueCopyAllPreviewHydration()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: image-gallery.js (2 places: carousel and gallery), External
- **Calls Within File**: 
  - `autosizeCopyAllPreview()` [1 caller only]
  - `processCopyAllPreviewQueue()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 5. `autosizeCopyAllPreview()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `queueCopyAllPreviewHydration()`, `processCopyAllPreviewQueue()`, image-gallery.js, External
- **Calls Within File**: (none - DOM utility)
- **Single-Caller Candidate**: No (exported, multiple callers)

#### 6. `syncCopyAllPreviewWidth()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `processCopyAllPreviewQueue()`, image-gallery.js, External
- **Calls Within File**: 
  - `autosizeCopyAllPreview()` [multiple callers internally]
- **Single-Caller Candidate**: No (exported)

#### 7. `processCopyAllPreviewQueue()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `queueCopyAllPreviewHydration()` [1 caller only], itself (recursive)
- **Calls Within File**: 
  - `fetchCopyAllTextForImageId()` [1 caller only]
  - `updateImageCardState()` [external]
  - `applyWorkflowIdentityToCard()` [external]
  - `setFavoriteImageBorder()` [external]
  - `autosizeCopyAllPreview()` [multiple callers]
  - `syncCopyAllPreviewWidth()` [multiple callers]
  - itself (recursive)
- **Single-Caller Candidate**: No (exported, recursive)

#### 8. `applyImageCardBorder()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js (2 places), External
- **Calls Within File**: (none - DOM utility)
- **Single-Caller Candidate**: No (exported)

#### 9. `updateWorkflowActionsVisibility()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `updateImageCardState()` [1 caller only], External
- **Calls Within File**: (none - DOM utility)
- **Single-Caller Candidate**: No (exported)

#### 10. `updateImageCardState()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `processCopyAllPreviewQueue()`, workflow.js (multiple: applyPresentWorkflowUi, applyParametersWorkflowUi, applyMissingWorkflowUi), External
- **Calls Within File**: 
  - `updateWorkflowActionsVisibility()` [1 caller only]
  - `applyImageCardFilters()` [external]
- **Single-Caller Candidate**: No (exported, multiple callers)

#### 11. `setFavoriteImageBorder()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `processCopyAllPreviewQueue()`, workflow.js (multiple places), External
- **Calls Within File**: 
  - `applyImageCardBorder()` [external, multiple callers]
- **Single-Caller Candidate**: No (exported)

#### 12. `toggleImageFavorite()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: image-gallery.js event handler
- **Calls Within File**: 
  - `setFavoriteImageBorder()` [multiple callers]
  - `updateImageCardState()` [multiple callers]
- **Single-Caller Candidate**: No (exported)

---

## File: filters.js
**Import Dependencies**: app-context

### Functions

#### 1. `setWorkflowAnalysisSectionVisible()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: rendering.js, External
- **Calls Within File**: (none - state management)
- **Single-Caller Candidate**: No (exported)

#### 2. `waitForWorkflowSectionToBeHidden()` ⬆️ EXPORTED
- **Type**: Named export (async)
- **Called By**: image-gallery.js (2 places), External
- **Calls Within File**: (none - Promise-based wait)
- **Single-Caller Candidate**: No (exported)

#### 3. `setupWorkflowAnalysisVisibilityObserver()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js, External
- **Calls Within File**: 
  - `setWorkflowAnalysisSectionVisible()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 4. `updateGenerationPreviewToggleButtons()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `applyImageCardFilters()`, `applyGenerationPreviewVisibility()` [2 callers]
- **Calls Within File**: (none - DOM utility)
- **Single-Caller Candidate**: No (exported, 2 callers)

#### 5. `buildWorkflowFilterKey()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `applyImageCardFilters()` [1 caller only], External
- **Calls Within File**: (none - utility)
- **Single-Caller Candidate**: No (exported)

#### 6. `applyWorkflowIdentityToCard()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js (3 places), image-cache.js (1 place), External
- **Calls Within File**: (none - DOM utility)
- **Single-Caller Candidate**: No (exported)

#### 7. `renderWorkflowFilterButtons()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `loadVersionWorkflowFilters()` [2 callers: init + finally]
- **Calls Within File**: 
  - `applyImageCardFilters()` [external]
- **Single-Caller Candidate**: No (exported)

#### 8. `loadVersionWorkflowFilters()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: workflow.js, model-actions.js, External
- **Calls Within File**: 
  - `renderWorkflowFilterButtons()` [multiple callers]
  - `applyImageCardFilters()` [external]
- **Single-Caller Candidate**: No (exported)

#### 9. `applyImageCardFilters()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `renderWorkflowFilterButtons()`, `applyGenerationPreviewVisibility()`, `loadVersionWorkflowFilters()`, Multiple internal + External
- **Calls Within File**: 
  - `buildWorkflowFilterKey()` [1 caller only]
  - `updateGenerationPreviewToggleButtons()` [2 callers]
- **Single-Caller Candidate**: No (exported, many callers)

#### 10. `applyGenerationPreviewVisibility()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: image-gallery.js, model-actions.js, External
- **Calls Within File**: 
  - `updateGenerationPreviewToggleButtons()` [1 caller only]
  - `applyImageCardFilters()` [external]
- **Single-Caller Candidate**: No (exported)

#### 11. `toggleGenerationPreview()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js event handler
- **Calls Within File**: 
  - `applyImageCardFilters()` [external]
  - `applyGenerationPreviewVisibility()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

---

## File: file-editing.js
**Import Dependencies**: app-context, sidebar

### Functions

#### 1. `getFilenameExtension()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `stripKnownExtension()` [1 caller only]
- **Calls Within File**: (none - utility check)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `stripKnownExtension()`

#### 2. `stripKnownExtension()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `saveFilename()`, `saveOriginalFilename()`, `resetFilename()` [3 callers]
- **Calls Within File**: 
  - `getFilenameExtension()` [1 caller only]
- **Single-Caller Candidate**: No (3 callers)

#### 3. `handleFilenameKeydown()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: model-actions.js event handler
- **Calls Within File**: 
  - `saveFilename()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 4. `saveFilename()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `handleFilenameKeydown()`, `resetFilename()` [2 callers], External
- **Calls Within File**: 
  - `stripKnownExtension()` [multiple callers]
  - `loadLoras()` [external]
  - `loadCheckpoints()` [external]
- **Single-Caller Candidate**: No (exported, 2 callers)

#### 5. `handleOriginalFilenameKeydown()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: model-actions.js event handler
- **Calls Within File**: 
  - `saveOriginalFilename()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 6. `saveOriginalFilename()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `handleOriginalFilenameKeydown()` [1 caller only], External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

#### 7. `resetFilename()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: model-actions.js event handler
- **Calls Within File**: 
  - `stripKnownExtension()` [multiple callers]
  - `saveFilename()` [multiple callers]
- **Single-Caller Candidate**: No (exported)

---

## File: dom-utils.js
**Import Dependencies**: None

### Functions

#### 1. `escapeHtml()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: image-gallery.js, image-cache.js, file-editing.js, db-sync.js, sidebar.js, model-actions.js, renderers/model-actions-html.js, External
- **Calls Within File**: (none - DOM utility)
- **Single-Caller Candidate**: No (exported, wide usage)

#### 2. `copyTextWithFallback()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: workflow.js, rendering.js, External
- **Calls Within File**: (none - clipboard utility)
- **Single-Caller Candidate**: No (exported)

---

## File: db-sync.js
**Import Dependencies**: app-context, sidebar

### Functions

#### 1. `addModelToDatabase()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: script.js event handler
- **Calls Within File**: 
  - `fetchOriginalFilename()` [1 caller only]
  - `syncTagsToDatabase()` [1 caller only]
  - `syncModelsToDatabase()` [1 caller only]
  - `loadLoras()` [external]
  - `loadCheckpoints()` [external]
- **Single-Caller Candidate**: No (exported)

#### 2. `fetchOriginalFilename()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `addModelToDatabase()`, model-actions.js, External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported, 2 callers)

#### 3. `syncTagsToDatabase()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `addModelToDatabase()` [1 caller only], External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

#### 4. `syncModelsToDatabase()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `addModelToDatabase()` [1 caller only], External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

#### 5. `checkModelInDatabase()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: model-actions.js: `applyResult()`
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

---

## File: app-context.js
**Import Dependencies**: None

### Exports
- Constant: `AppConfig`
- Constant: `AppState`
- Constant: `COPY_ALL_MAX_CONCURRENCY`
- DOM refs: `modelInput`, `sourceBtn`, `output`

**No functions to analyze** - This is a configuration/state module

---

## File: model-actions.js
**Import Dependencies**: sidebar, model-loading, file-editing, app-context, dom-utils, workflow, filters, image-gallery, db-sync, renderers

### Functions

#### 1. `initializeModelActionsHandlers()` 🔒 LOCAL
- **Type**: Function declaration with property-based tracking
- **Called By**: Module execution (auto-invoked)
- **Calls Within File**: 
  - `toggleTag()` [external]
  - `loadModelVersion()` [external]
  - `resetFilename()` [external]
  - `clearCache()` [1 caller only]
  - `scanMissingImageWorkflows()` [external]
  - `toggleGenerationPreview()` [external]
  - `updateThumbnailSize()` [external]
  - `handleFilenameKeydown()` [external]
  - `handleOriginalFilenameKeydown()` [external]
- **Single-Caller Candidate**: No (auto-invoked module function)

#### 2. `clearCache()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `initializeModelActionsHandlers()` [1 caller only], External
- **Calls Within File**: 
  - `fetchData()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 3. `fetchData()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: model-loading.js: `loadModelVersion()`, script.js: event handler, External
- **Calls Within File**: 
  - `prepareFetchDataRequest()` [1 caller only]
  - `fetchModelInput()` [1 caller only]
  - `applyResult()` [1 caller only]
  - `renderTags()` [1 caller only]
  - `modelContext()` [1 caller only]
  - `renderVersionLinks()` [1 caller only]
  - `resolveDisplayData()` [1 caller only]
  - `updateCacheDisplay()` [1 caller only]
  - `loadModelImages()` [external]
  - `initializeModelView()` [1 caller only]
  - `buildFetchDataHtml()` [external]
- **Single-Caller Candidate**: No (exported)

#### 4. `prepareFetchDataRequest()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: (none - state setup)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 5. `fetchModelInput()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 6. `applyResult()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: 
  - `checkModelInDatabase()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 7. `modelContext()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: (none - data extraction)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 8. `renderTags()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: 
  - `buildModelTagsHtml()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 9. `renderVersionLinks()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: 
  - `buildVersionLinksHtml()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 10. `resolveDisplayData()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: 
  - `fetchOriginalFilename()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 11. `initializeModelView()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: 
  - `setupWorkflowAnalysisVisibilityObserver()` [external]
  - `applyGenerationPreviewVisibility()` [external]
  - `loadVersionWorkflowFilters()` [external]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 12. `updateCacheDisplay()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `fetchData()` [1 caller only]
- **Calls Within File**: 
  - `getCacheSize()` [1 caller only]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `fetchData()`

#### 13. `getCacheSize()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `updateCacheDisplay()` [1 caller only], External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

---

## File: math-utils.js
**Import Dependencies**: None

### Functions

#### 1. `parseIntegerFromText()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (multiple places), External
- **Calls Within File**: (none - utility)
- **Single-Caller Candidate**: No (exported)

#### 2. `parseFloatFromText()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (multiple places), External
- **Calls Within File**: (none - utility)
- **Single-Caller Candidate**: No (exported)

#### 3. `parseSizeValue()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (2 places), External
- **Calls Within File**: 
  - `parseIntegerFromText()` [exported, multiple callers]
- **Single-Caller Candidate**: No (exported)

#### 4. `ceilToMultiple()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (multiple places), External
- **Calls Within File**: (none - utility)
- **Single-Caller Candidate**: No (exported)

---

## File: model-loading.js
**Import Dependencies**: app-context, model-actions

### Functions

#### 1. `loadModelVersion()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: sidebar.js event handler, model-actions.js
- **Calls Within File**: 
  - `fetchData()` [external]
- **Single-Caller Candidate**: No (exported)

#### 2. `loadModelFromSidebar()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: sidebar.js: `setModelClickHandler()` callback
- **Calls Within File**: 
  - `fetchData()` [external]
- **Single-Caller Candidate**: No (exported)

---

## File: sidebar.js
**Import Dependencies**: dom-utils, app-context

### Functions

#### 1. `setModelClickHandler()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: script.js
- **Calls Within File**: (none - callback registration)
- **Single-Caller Candidate**: No (exported)

#### 2. `loadCheckpoints()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: script.js, file-editing.js, db-sync.js, External
- **Calls Within File**: 
  - `loadSidebarLibrary()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 3. `loadLoras()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: script.js, file-editing.js, db-sync.js, External
- **Calls Within File**: 
  - `loadSidebarLibrary()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 4. `loadSidebarLibrary()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `loadCheckpoints()`, `loadLoras()` [2 callers], External
- **Calls Within File**: 
  - `getOpenFolders()` [1 caller only]
  - `buildFoldersHTML()` [1 caller only]
  - `attachSidebarEventHandlers()` [1 caller only]
- **Single-Caller Candidate**: No (exported, 2 callers)

#### 5. `getOpenFolders()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `loadSidebarLibrary()` [1 caller only], External
- **Calls Within File**: (none - DOM query utility)
- **Single-Caller Candidate**: No (exported)

#### 6. `buildFoldersHTML()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `loadSidebarLibrary()` [1 caller only], External
- **Calls Within File**: 
  - `escapeHtml()` [external]
- **Single-Caller Candidate**: No (exported)

#### 7. `attachSidebarEventHandlers()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `loadSidebarLibrary()` [1 caller only], External
- **Calls Within File**: 
  - `toggleFolder()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 8. `toggleFolder()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `attachSidebarEventHandlers()` [1 caller only], External
- **Calls Within File**: (none - DOM manipulation)
- **Single-Caller Candidate**: No (exported)

#### 9. `toggleTag()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js event handler
- **Calls Within File**: 
  - `updateSidebarHighlighting()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 10. `updateSidebarHighlighting()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: `toggleTag()` [1 caller only], External
- **Calls Within File**: (none - API call + DOM)
- **Single-Caller Candidate**: No (exported)

---

## File: script.js
**Import Dependencies**: sidebar, model-loading, app-context, model-actions, db-sync

### Functions

#### 1. `initializeApp()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: Module execution (auto-invoked with .catch())
- **Calls Within File**: 
  - `setModelClickHandler()` [external]
  - `buildSourceUrl()` [1 caller only]
  - `addModelToDatabase()` [external]
  - `loadCheckpoints()` [external]
  - `loadLoras()` [external]
- **Single-Caller Candidate**: No (auto-invoked module function)

#### 2. `buildSourceUrl()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `initializeApp()` [1 caller only]
- **Calls Within File**: (none - URL parsing utility)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `initializeApp()`

---

## File: url-utils.js
**Import Dependencies**: None

### Functions

#### 1. `imageIdFromUrl()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: image-gallery.js, image-cache.js, External
- **Calls Within File**: (none - string parsing utility)
- **Single-Caller Candidate**: No (exported)

#### 2. `extractFilenameFromUrl()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js, image-gallery.js, image-cache.js, External
- **Calls Within File**: (none - string parsing utility)
- **Single-Caller Candidate**: No (exported)

---

## File: workflow/parameter-workflow-node-templates.js
**Import Dependencies**: parameter-workflow-node-templates

### Functions

#### 1. `getGraphNodeTemplate()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameter-workflow-graph-utils.js: `addA1111Node()`
- **Calls Within File**: (none - data lookup)
- **Single-Caller Candidate**: No (exported)

---

## File: workflow/parameter-workflow-graph-utils.js
**Import Dependencies**: parameter-workflow-node-templates

### Functions

#### 1. `createLoraNodeChain()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (2 places: applyPromptLoraChain, applyFluxPromptConditioning)
- **Calls Within File**: 
  - `addA1111Node()` [1 caller only]
  - `connectA1111Nodes()` [1 caller only]
- **Single-Caller Candidate**: No (exported, but called multiple times)

#### 2. `createA1111WorkflowGraph()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (2 places: createBaseA1111ParameterWorkflow, createFluxParameterWorkflow)
- **Calls Within File**: (none - graph creation)
- **Single-Caller Candidate**: No (exported, 2 callers)

#### 3. `removeInputLink()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (multiple places)
- **Calls Within File**: (none - link management)
- **Single-Caller Candidate**: No (exported)

#### 4. `addA1111Node()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (multiple places), workflow/parameter-workflow-graph-utils.js: `createLoraNodeChain()`
- **Calls Within File**: 
  - `getGraphNodeTemplate()` [external]
- **Single-Caller Candidate**: No (exported)

#### 5. `connectA1111Nodes()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (many places), workflow/parameter-workflow-graph-utils.js: `createLoraNodeChain()`
- **Calls Within File**: (none - link connection)
- **Single-Caller Candidate**: No (exported)

---

## File: workflow/parameter-parsing-utils.js
**Import Dependencies**: None

### Functions

#### 1. `normalizeA1111ParametersText()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js, External
- **Calls Within File**: (none - string normalization)
- **Single-Caller Candidate**: No (exported)

#### 2. `normalizeSamplerForFluxImport()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js, External
- **Calls Within File**: (none - string manipulation)
- **Single-Caller Candidate**: No (exported)

#### 3. `normalizeSamplerForA1111Import()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js, External
- **Calls Within File**: (none - string manipulation)
- **Single-Caller Candidate**: No (exported)

#### 4. `normalizeScheduleTypeForA1111Import()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js, External
- **Calls Within File**: (none - string manipulation)
- **Single-Caller Candidate**: No (exported)

#### 5. `extractLoraEntries()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (2 places), External
- **Calls Within File**: (none - regex parsing)
- **Single-Caller Candidate**: No (exported)

#### 6. `parseA1111OptionMap()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `parseA1111OptionsFromParameters()` [1 caller only]
- **Calls Within File**: (none - option parsing)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `parseA1111OptionsFromParameters()`

#### 7. `extractA1111PromptSections()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `parseA1111OptionsFromParameters()` [1 caller only]
- **Calls Within File**: (none - text extraction)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `parseA1111OptionsFromParameters()`

#### 8. `parseA1111OptionsFromParameters()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js (2 places), External
- **Calls Within File**: 
  - `normalizeA1111ParametersText()` [external]
  - `parseA1111OptionMap()` [1 caller only]
  - `extractA1111PromptSections()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

---

## File: workflow/analysis.js
**Import Dependencies**: None

### Functions

#### 1. `fetchNodePortDefinitions()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: workflow.js, workflow/parameters.js, External
- **Calls Within File**: (none - API call)
- **Single-Caller Candidate**: No (exported)

#### 2. `buildWorkflowAnalysisData()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js, workflow/parameters.js, External
- **Calls Within File**: (none - data transformation)
- **Single-Caller Candidate**: No (exported)

#### 3. `buildWorkflowShapeTextFromAnalysisData()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `computeWorkflowShapeHashFromAnalysisData()` [1 caller only], External
- **Calls Within File**: 
  - `buildWorkflowShapeData()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 4. `buildWorkflowShapeData()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `buildWorkflowShapeTextFromAnalysisData()` [1 caller only]
- **Calls Within File**: (none - data transformation)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `buildWorkflowShapeTextFromAnalysisData()`

#### 5. `computeWorkflowShapeHashFromAnalysisData()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: workflow.js, External
- **Calls Within File**: 
  - `buildWorkflowShapeTextFromAnalysisData()` [1 caller only]
  - `computeTextHashHex()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 6. `computeTextHashHex()` 🔒 LOCAL (async)
- **Type**: Function declaration (not exported)
- **Called By**: `computeWorkflowShapeHashFromAnalysisData()` [1 caller only]
- **Calls Within File**: (none - crypto utility)
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `computeWorkflowShapeHashFromAnalysisData()`

---

## File: workflow/parameters.js
**Imports**: Many from analysis, parameter-workflow-graph-utils, parameter-parsing-utils, parameter-workflow-port-definitions, math-utils, External dependencies

### Functions (Summary - Large file)

#### 1. `buildInferredWorkflowJsonText()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js, External
- **Calls Within File**: (none - JSON serialization)
- **Single-Caller Candidate**: No (exported)

#### 2. `renderParametersAnalysis()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js, External
- **Calls Within File**: (none - DOM rendering)
- **Single-Caller Candidate**: No (exported)

#### 3. `fetchParametersFallbackFromGenerationData()` ⬆️ EXPORTED (async)
- **Type**: Named export
- **Called By**: workflow.js (3 error handling paths), External
- **Calls Within File**: 
  - `looksLikeA1111ParametersText()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 4. `looksLikeA1111ParametersText()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: `fetchParametersFallbackFromGenerationData()` [1 caller only], External
- **Calls Within File**: 
  - `normalizeA1111ParametersText()` [external]
- **Single-Caller Candidate**: No (exported)

#### 5. `buildWorkflowAnalysisFromParametersText()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow.js, External
- **Calls Within File**: 
  - `parseA1111OptionsFromParameters()` [external]
  - `buildFluxGGUFWorkflowFromParsed()` [1 caller only]
  - `createBaseA1111ParameterWorkflow()` [1 caller only]
  - `applyA1111BaseOptions()` [1 caller only]
  - `buildA1111HiresFixBranch()` [1 caller only]
  - `syncA1111HiresSamplerSettings()` [1 caller only]
  - `applyA1111PromptLoraChains()` [1 caller only]
  - `buildParameterWorkflowResult()` [1 caller only]
- **Single-Caller Candidate**: No (exported)

#### 6. `buildFluxGGUFWorkflowFromParsed()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `buildWorkflowAnalysisFromParametersText()` [1 caller only]
- **Calls Within File**: 
  - `createFluxParameterWorkflow()` [1 caller only]
  - `popA1111Option()` [1 caller only]
  - `applyFluxWorkflowOptions()` [1 caller only]
  - `applyFluxPromptConditioning()` [1 caller only]
  - `buildParameterWorkflowResult()` [1 caller only]
- **Single-Caller Candidate**: ✅ **YES** - Reorganize directly below `buildWorkflowAnalysisFromParametersText()`

#### 7. `buildParameterWorkflowResult()` 🔒 LOCAL
- **Type**: Function declaration (not exported)
- **Called By**: `buildWorkflowAnalysisFromParametersText()`, `buildFluxGGUFWorkflowFromParsed()` [2 callers]
- **Calls Within File**: 
  - `buildWorkflowAnalysisData()` [external]
  - `getPortDefinitions()` [external]
- **Single-Caller Candidate**: No (2 callers)

#### 8-19. [Many workflow construction functions] - Complex DAG structure

**Key observation**: This file has heavily interconnected functions forming a directed acyclic graph. Most functions are single-call candidates WITHIN their specific workflow paths (A1111 vs Flux), but multiple paths converge to shared functions.

#### Candidates for Reorganization in workflow/parameters.js:
- `buildFluxGGUFWorkflowFromParsed()` [1 caller only] ✅
- All `create*` and `apply*` workflow functions that are called by exactly one parent

---

## File: workflow/parameter-workflow-port-definitions.js
**Import Dependencies**: None

### Functions

#### 1. `getPortDefinitions()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: workflow/parameters.js, External
- **Calls Within File**: (none - data return)
- **Single-Caller Candidate**: No (exported)

---

## File: workflow/rendering.js
**Import Dependencies**: app-context, dom-utils

### Functions

#### 1. `renderWorkflowAnalysis()` ⬆️ EXPORTED
- **Type**: Named export (Large function with many internal utilities)
- **Called By**: workflow.js, External
- **Calls Within File**: Multiple internal nested/helper functions
- **Single-Caller Candidate**: No (exported)

**Internal nested/helper functions within `renderWorkflowAnalysis()`** (13 total):
These are highly coupled and would require significant refactoring to extract

---

## File: renderers/model-actions-html.js
**Import Dependencies**: app-context, dom-utils

### Functions

#### 1. `buildModelTagsHtml()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js: `renderTags()`
- **Calls Within File**: 
  - `escapeHtml()` [external]
- **Single-Caller Candidate**: No (exported)

#### 2. `buildFetchDataHtml()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js: `fetchData()`, External
- **Calls Within File**: 
  - `buildVersionInfoHtml()` [1 caller only]
  - `buildTrpcDescriptionHtml()` [1 caller only]
  - `buildVersionSelectionWarningHtml()` [1 caller only]
  - `buildCacheInfoSectionHtml()` [1 caller only]
  - `buildThumbnailControlsSectionHtml()` [1 caller only]
  - `buildImagesSectionHtml()` [1 caller only]
  - `buildParametersAnalysisSectionHtml()` [1 caller only]
  - `buildWorkflowAnalysisSectionHtml()` [1 caller only]
- **Single-Caller Candidate**: No (exported, but orchestrates many builders)

#### 3-10. `build*Html()` functions (8 total)
- Each called by `buildFetchDataHtml()` [1 caller only]
- Candidates: ✅ Each can be reorganized directly below `buildFetchDataHtml()`

#### 11. `buildVersionLinksHtml()` ⬆️ EXPORTED
- **Type**: Named export
- **Called By**: model-actions.js: `renderVersionLinks()`, External
- **Calls Within File**: 
  - `escapeHtml()` [external]
- **Single-Caller Candidate**: No (exported)

---

# Summary: Functions with Single Callers (Reorganization Candidates)

Total identified: **25+ functions** that are called by exactly one other function within their file

## High-Priority Single-Caller Functions:

### workflow.js (6 functions)
1. `collectUniqueWorkflowButtons()` ← `scanMissingImageWorkflows()`
2. `fetchCachedWorkflowEntryState()` ← `scanMissingImageWorkflows()`
3. `buildModelFilenameForWorkflow()` ← `extractAndPersistWorkflowForElement()`
4. `applyPresentWorkflowUi()` ← `applyWorkflowUiToAllCardsForImageId()`
5. `applyParametersWorkflowUi()` ← `applyWorkflowUiToAllCardsForImageId()`
6. `applyMissingWorkflowUi()` ← `applyWorkflowUiToAllCardsForImageId()`

### model-actions.js (7 functions)
1. `prepareFetchDataRequest()` ← `fetchData()`
2. `fetchModelInput()` ← `fetchData()`
3. `applyResult()` ← `fetchData()`
4. `modelContext()` ← `fetchData()`
5. `renderTags()` ← `fetchData()`
6. `renderVersionLinks()` ← `fetchData()`
7. `resolveDisplayData()` ← `fetchData()`
8. `initializeModelView()` ← `fetchData()`
9. `updateCacheDisplay()` ← `fetchData()`

### file-editing.js (1 function)
1. `getFilenameExtension()` ← `stripKnownExtension()`

### workflow/parameters.js (3+ functions)
1. `buildFluxGGUFWorkflowFromParsed()` ← `buildWorkflowAnalysisFromParametersText()`
2. Plus many workflow construction helpers (complex sub-graphs)

### workflow/parameter-parsing-utils.js (2 functions)
1. `parseA1111OptionMap()` ← `parseA1111OptionsFromParameters()`
2. `extractA1111PromptSections()` ← `parseA1111OptionsFromParameters()`

### workflow/analysis.js (2 functions)
1. `buildWorkflowShapeData()` ← `buildWorkflowShapeTextFromAnalysisData()`
2. `computeTextHashHex()` ← `computeWorkflowShapeHashFromAnalysisData()`

### renderers/model-actions-html.js (8 functions)
1. `buildVersionInfoHtml()` ← `buildFetchDataHtml()`
2. `buildTrpcDescriptionHtml()` ← `buildFetchDataHtml()`
3. `buildVersionSelectionWarningHtml()` ← `buildFetchDataHtml()`
4. `buildCacheInfoSectionHtml()` ← `buildFetchDataHtml()`
5. `buildThumbnailControlsSectionHtml()` ← `buildFetchDataHtml()`
6. `buildImagesSectionHtml()` ← `buildFetchDataHtml()`
7. `buildParametersAnalysisSectionHtml()` ← `buildFetchDataHtml()`
8. `buildWorkflowAnalysisSectionHtml()` ← `buildFetchDataHtml()`

### script.js (1 function)
1. `buildSourceUrl()` ← `initializeApp()`

---

# Reorganization Impact Analysis

## Files Ready for Immediate Reorganization:
- **renderers/model-actions-html.js**: 8 HTML builder functions all called by one orchestrator
- **workflow.js**: 6 UI helper functions ready for consolidation
- **model-actions.js**: 9 nested workflow functions within `fetchData()`

## Files Requiring Complex Analysis:
- **workflow/parameters.js**: Contains interconnected workflow graphs with shared endpoints
- **image-gallery.js**: Uses nested async functions (`loadCarouselImages`, `loadGalleryImages`) that would require extraction

## Export-Constrained Files:
- **image-cache.js**, **filters.js**, **sidebar.js**: Most functions are exported for cross-file usage; internal reorganization limited
- **workflow/*****: Workflow modules are heavily interconnected; changes impact parameter compilation pipeline

---

END OF REPORT

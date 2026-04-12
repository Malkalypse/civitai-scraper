export const AppConfig = {
	copyAllMaxConcurrency: 4 // maximum number of concurrent "copy all" operations to prevent browser overload
};

export const AppState = {
	model: { // The currently selected model and version information
		currentFilename:          null,   // filename currently being viewed/edited
		currentVersionId:         null,   // version ID of currently selected model
		currentSelectedVersion:   null,   // full version data of the currently selected model
		currentModelIdForDb:      null,   // model ID used for database operations (may differ from currentVersionId if not in DB)
		currentBaseModel:         null,   // base model name of currently selected model
		currentOriginalFilename:  null,   // original filename as stored in the database
		currentModelExistsInDb:   false,  // whether currently selected model/version exists in the database
		currentModelId:           null,   // model ID of currently selected model
		currentModelJsonData:     null    // full JSON data of currently selected model
	},
	settings: {
		activeTags:               new Set(),  // currently active tags for filtering
		currentSettingsSets:      [],         // settings sets for the currently selected model version
		currentSamplerOptions:    [],         // current sampler options for the selected model version
		currentSchedulerOptions:  [],         // current scheduler options for the selected model version 
		currentSettingsShowAll:   {}          // which settings categories are currently set to "show all" vs "show only differences" 
	},
	runtime: {
		currentImageLoadToken:  0,          // token to track latest image load operation for cancellation purposes
		copyAllTextCache:       new Map(),  // cache for "copy all" text content to avoid redundant DOM reads
		copyAllTextPending:     new Map(),  // tracks pending "copy all" operations to prevent concurrent execution on the same element
		copyAllTextQueue:       [],         // queue for "copy all" operations that are waiting to execute due to concurrency limits
		copyAllActiveCount:     0           // current count of active "copy all" operations to enforce concurrency limit
	},
	ui: {
		generationParamsHidden:   localStorage.getItem( 'generationParamsHidden' ) === 'true',  // whether to hide generation parameters
		generationPromptsHidden:  localStorage.getItem( 'generationPromptsHidden' ) === 'true', // whether to hide generation prompts
		hideNonWorkflowImages:    localStorage.getItem( 'hideNonWorkflowImages' ) === 'true',   // whether to hide images without workflow data
		hideNonFavoriteImages:    localStorage.getItem( 'hideNonFavoriteImages' ) === 'true',   // whether to hide images not marked as favorite
		thumbnailSize:            localStorage.getItem( 'thumbnailSize' ) || '450'              // size of thumbnails in UI
	},
	workflow: {
		workflowFilterOptions:          [],     // available workflow filter options based on the loaded images (e.g. [{ key: 'workflow1_revA', workflowId: 'workflow1', workflowRevision: 'revA' }, ...])
		activeWorkflowFilterKey:        'all',  // currently active workflow filter key (e.g. 'workflow1_revA' or 'all' for no filter)
		workflowLinksHidden:            false,  // whether to hide workflow links in the UI when a workflow filter is active
		workflowTextHidden:             false,  // whether to hide workflow text in the UI when a workflow filter is active
		workflowAnalysisSectionVisible: false,  // whether the workflow analysis section is visible in the UI
		workflowVisibilityObserver:     null,   // MutationObserver instance for observing changes to workflow-related elements for dynamic filtering
		workflowVisibilityWaiters:      []      // Array of functions waiting for the workflowVisibilityObserver to be initialized before they can add elements to observe
	}
};

export const COPY_ALL_MAX_CONCURRENCY = AppConfig.copyAllMaxConcurrency;

export const modelInput	= document.getElementById( 'modelInput' );
export const sourceBtn  = document.getElementById( 'sourceBtn' );
export const output     = document.getElementById( 'output' );
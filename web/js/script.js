// Load loras folder structure on page load
async function loadLoras() {
  try {
    const response = await fetch( 'api/get_loras.php' );
    const result = await response.json();

    if( result.error ) {
      document.getElementById( 'lorasList' ).innerHTML = `<div class="error" style="font-size: 12px;">${escapeHtml( result.error )}</div>`;
      return;
    }

    if( result.data ) {
      let html = '';
      result.data.forEach( folder => {
        html += `
					<div class="folder-item">
						<div class="folder-name" onclick="toggleFolder(this)">${escapeHtml( folder.folder )}</div>
						<ul class="file-list" style="display: none;">`;

        folder.files.forEach( file => {
          const modelAttr = file.modelId ? ` data-model="${escapeHtml( file.modelId )}"` : '';
          const versionAttr = file.versionId ? ` data-version="${escapeHtml( file.versionId )}"` : '';
          html += `<li class="file-item"${modelAttr}${versionAttr} onclick="loadLoraFromFile(this)">${escapeHtml( file.name )}</li>`;
        } );

        html += `</ul></div>`;
      } );

      document.getElementById( 'lorasList' ).innerHTML = html;
    }
  } catch( error ) {
    document.getElementById( 'lorasList' ).innerHTML = `<div class="error" style="font-size: 12px;">Error loading loras</div>`;
  }
}

function toggleFolder( element ) {
  const fileList = element.nextElementSibling;
  if( fileList.style.display === 'none' ) {
    fileList.style.display = 'block';
  } else {
    fileList.style.display = 'none';
  }
}

let currentFilename = null; // Store the current filename for model sync
let currentVersionId = null; // Store the current version ID for model sync
let currentSelectedVersion = null; // Store the full selected version data for Add to Database
let currentModelIdForDb = null; // Store the model ID for Add to Database
let activeTags = new Set(); // Store currently selected tags

function loadLoraFromFile( element ) {
  const modelId = element.getAttribute( 'data-model' );
  const versionId = element.getAttribute( 'data-version' );
  currentFilename = element.textContent.trim(); // Store filename for sync
  currentVersionId = versionId ? parseInt( versionId ) : null; // Store version ID for sync

  if( modelId ) {
    // Set the model ID in the input field
    if( versionId ) {
      modelIdInput.value = modelId + '?modelVersionId=' + versionId;
    } else {
      modelIdInput.value = modelId;
    }
    // Trigger the fetch
    fetchData();
  } else {
    console.error( 'No model ID found for this file' );
  }
}

// Load loras when page loads
loadLoras();

// Set up persistent event listener for Add to Database button (immediately, not on DOMContentLoaded)
const addToDbBtn = document.getElementById( 'addToDbBtn' );
if( addToDbBtn ) {
  addToDbBtn.addEventListener( 'click', () => {
    console.log( 'Button clicked, using:', { modelId: currentModelIdForDb, versionId: currentSelectedVersion?.id } );
    if( currentModelIdForDb && currentSelectedVersion ) {
      addModelToDatabase( currentModelIdForDb, currentSelectedVersion );
    } else {
      console.error( 'No model data stored for Add to Database' );
    }
  } );
  console.log( 'Add to Database button listener initialized' );
} else {
  console.error( 'Add to Database button not found during initialization' );
}

const modelIdInput = document.getElementById( 'modelId' );
const goBtn = document.getElementById( 'goBtn' );
const output = document.getElementById( 'output' );

// Handle Enter key in input field
modelIdInput.addEventListener( 'keypress', ( e ) => {
  if( e.key === 'Enter' ) {
    fetchData();
  }
} );

// Handle button click
goBtn.addEventListener( 'click', fetchData );

// Load model version from version link click
function loadModelVersion( modelVersionString ) {
  modelIdInput.value = modelVersionString;
  fetchData();
}

let currentModelId = null;
let thumbnailSize = localStorage.getItem( 'thumbnailSize' ) || '450';

// Update thumbnail size for all images
function updateThumbnailSize( size ) {
  thumbnailSize = size;
  localStorage.setItem( 'thumbnailSize', size );

  // Update all images
  const allImages = document.querySelectorAll( '#carouselContainer img, #galleryContainer img' );
  allImages.forEach( img => {
    img.style.maxWidth = size + 'px';
    img.style.maxHeight = size + 'px';
  } );

  // Update all videos
  const allVideos = document.querySelectorAll( '#carouselContainer video, #galleryContainer video' );
  allVideos.forEach( video => {
    video.style.maxWidth = size + 'px';
    video.style.maxHeight = size + 'px';
  } );
}

// Check if image is cached (doesn't download)
async function checkCached( remoteUrl ) {
  try {
    const response = await fetch( 'api/cache_image.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { imageUrl: remoteUrl, download: false, modelId: currentModelId } )
    } );
    const result = await response.json();

    if( result.cached && result.localUrl ) {
      return { url: result.localUrl, cached: true };
    }
    return { url: remoteUrl, cached: false };
  } catch( error ) {
    console.error( 'Cache check failed:', error );
    return { url: remoteUrl, cached: false };
  }
}

// Download and cache image
async function downloadAndCache( remoteUrl ) {
  try {
    const response = await fetch( 'api/cache_image.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { imageUrl: remoteUrl, download: true, modelId: currentModelId } )
    } );
    const result = await response.json();

    if( result.localUrl ) {
      return result.localUrl;
    }
    return remoteUrl;
  } catch( error ) {
    console.error( 'Download failed:', error );
    return remoteUrl;
  }
}

// Sync tags to database
async function syncTagsToDatabase( nextData, modelId ) {
  try {
    // Extract tagsOnModels from __NEXT_DATA__
    const tagsOnModels = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.tagsOnModels;

    if( !tagsOnModels || !Array.isArray( tagsOnModels ) || tagsOnModels.length === 0 ) {
      console.log( 'No tags found in __NEXT_DATA__' );
      return;
    }

    // Extract numeric model ID from the input (handles formats like "434302" or "434302?modelVersionId=...")
    const numericModelId = parseInt( modelId.toString().match( /\d+/ )?.[0] || '0' );

    if( !numericModelId ) {
      console.error( 'Invalid model ID for tag sync:', modelId );
      return;
    }

    console.log( `Syncing ${tagsOnModels.length} tags for model ${numericModelId} to database...` );

    const response = await fetch( 'api/sync_tags.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { tagsOnModels, modelId: numericModelId } )
    } );

    const result = await response.json();

    if( result.success ) {
      console.log( `Tags synced: ${result.tags.inserted} inserted, ${result.tags.updated} updated, ${result.tags.total_processed} total processed` );
      console.log( `Model-Tag associations: ${result.model_tags.inserted} inserted for model ${numericModelId}` );
      if( result.tags.errors && result.tags.errors.length > 0 ) {
        console.warn( 'Tag sync errors:', result.tags.errors );
      }
      if( result.model_tags.errors && result.model_tags.errors.length > 0 ) {
        console.warn( 'Model-tag sync errors:', result.model_tags.errors );
      }
    } else {
      console.error( 'Tag sync failed:', result.error );
    }
  } catch( error ) {
    console.error( 'Tag sync error:', error );
  }
}

// Sync model data to database
async function syncModelsToDatabase( nextData, modelId, filename, clickedVersionId ) {
  try {
    // Extract modelVersions from __NEXT_DATA__
    const modelVersions = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;

    if( !modelVersions || !Array.isArray( modelVersions ) || modelVersions.length === 0 ) {
      console.log( 'No model versions found in __NEXT_DATA__' );
      return;
    }

    // Only sync the specific version that was clicked
    const targetVersion = modelVersions.find( v => v.id === clickedVersionId );
    if( !targetVersion ) {
      console.warn( `Clicked version ${clickedVersionId} not found in model versions` );
      return;
    }

    console.log( `Syncing version ${clickedVersionId} to database...` );

    const response = await fetch( 'api/sync_models.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { modelVersions: [targetVersion], filename } )
    } );

    const result = await response.json();

    if( result.success ) {
      console.log( `Models synced: ${result.stats.inserted} inserted, ${result.stats.updated} updated` );
      if( result.stats.errors && result.stats.errors.length > 0 ) {
        console.warn( 'Model sync errors:', result.stats.errors );
      }
    } else {
      console.error( 'Model sync failed:', result.error );
    }
  } catch( error ) {
    console.error( 'Model sync error:', error );
  }
}

// Get cache size info
async function getCacheSize( modelId ) {
  try {
    const response = await fetch( 'api/cache_manager.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { action: 'getSize', modelId: modelId } )
    } );
    return await response.json();
  } catch( error ) {
    console.error( 'Cache size check failed:', error );
    return null;
  }
}

// Clear cache
async function clearCache( modelId = null ) {
  const action = modelId ? 'clearModel' : 'clearAll';
  const confirmMsg = modelId ?
    'Clear cache for this model?' :
    'Clear entire image cache?';

  if( !confirm( confirmMsg ) ) return;

  try {
    const response = await fetch( 'api/cache_manager.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { action: action, modelId: modelId } )
    } );
    const result = await response.json();

    if( result.success ) {
      alert( `Cleared ${result.deletedCount} files (${result.deletedSizeMB} MB)` );
      // Refresh the data
      fetchData();
    }
  } catch( error ) {
    console.error( 'Cache clear failed:', error );
    alert( 'Failed to clear cache' );
  }
}

async function fetchData() {
  const modelId = modelIdInput.value.trim();

  if( !modelId ) {
    output.innerHTML = '<div class="error">Please enter a model ID</div>';
    return;
  }

  // Hide sections while loading
  document.getElementById( 'modelTags' ).classList.remove( 'visible' );
  document.getElementById( 'versionLinks' ).classList.remove( 'visible' );
  document.getElementById( 'addToDbSection' ).style.display = 'none';

  // Reset loading flags on any existing containers from previous model
  const existingCarousel = document.getElementById( 'carouselContainer' );
  if( existingCarousel ) existingCarousel.dataset.loading = 'false';
  const existingGallery = document.getElementById( 'galleryContainer' );
  if( existingGallery ) existingGallery.dataset.loading = 'false';

  // Show loading state
  output.innerHTML = '<div class="loading">Fetching model data...</div>';
  goBtn.disabled = true;

  try {
    // Add cache-busting parameter to prevent browser caching
    const cacheBuster = new Date().getTime();
    const response = await fetch( `api/fetch_data.php?_=${cacheBuster}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify( { modelId } )
    } );

    const result = await response.json();

    if( result.error ) {
      output.innerHTML = `<div class="error">${escapeHtml( result.error )}</div>`;
    } else if( result.data ) {
      // Note: Database syncing removed - loading a LoRA should only display data, not write to database
      // Tags and models are synced during initial batch import only

      // Set current model ID for cache tracking (moved earlier)
      currentModelId = result.modelId || modelId.split( '?' )[0];

      // Check if model exists in database
      checkModelInDatabase( currentModelId, result.selectedVersion );

      // Populate model tags
      if( result.modelTags && Array.isArray( result.modelTags ) && result.modelTags.length > 0 ) {
        const modelTagsContainer = document.getElementById( 'modelTagsContainer' );
        let modelTagsHtml = '';

        result.modelTags.forEach( tag => {
          const activeClass = activeTags.has( tag ) ? ' active' : '';
          modelTagsHtml += `<div class="model-tag${activeClass}" data-tag="${escapeHtml( tag )}" onclick="toggleTag(this)">${escapeHtml( tag )}</div>`;
        } );

        modelTagsContainer.innerHTML = modelTagsHtml;
        document.getElementById( 'modelTags' ).classList.add( 'visible' );
      }

      // Populate version links
      const modelVersions = result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;
      if( modelVersions && Array.isArray( modelVersions ) && modelVersions.length > 0 ) {
        const versionLinksContainer = document.getElementById( 'versionLinksContainer' );
        let versionLinksHtml = '';

        modelVersions.forEach( version => {
          if( version.id && version.modelId && version.name ) {
            const modelVersionString = `${version.modelId}?modelVersionId=${version.id}`;
            versionLinksHtml += `<div class="version-link" onclick="loadModelVersion('${escapeHtml( modelVersionString )}')">${escapeHtml( version.name )}</div>`;
          }
        } );

        versionLinksContainer.innerHTML = versionLinksHtml;
        document.getElementById( 'versionLinks' ).classList.add( 'visible' );
      }

      let html = '';

      // Show selected version information
      if( result.selectedVersion ) {
        const version = result.selectedVersion;

        // Extract file names - find first .safetensors file
        let safetensorsFile = '';
        if( version.files && Array.isArray( version.files ) ) {
          const safetensors = version.files.find( f => f.name && f.name.endsWith( '.safetensors' ) );
          if( safetensors ) {
            safetensorsFile = safetensors.name;
          }
        }

        // Extract trained words
        let trainedWords = '';
        if( version.trainedWords && Array.isArray( version.trainedWords ) ) {
          trainedWords = version.trainedWords.map( w => `<code class="trigger-word">${escapeHtml( w )}</code>` ).join( '<br>' );
        }

        html += `
					<div class="info success">
						<strong>Selected Model Version</strong>
						${result.versionSelectionMethod ? `<div class="matched"><em>${escapeHtml( result.versionSelectionMethod )}</em></div>` : ''}
						
						<table class="info-table">
							<tr>
								<td>ID</td>
								<td>${version.id}</td>
							</tr>
							<tr>
								<td>Name</td>
								<td>${escapeHtml( version.name || 'N/A' )}</td>
							</tr>
							${version.baseModel ? `
							<tr>
								<td>Base Model</td>
								<td>${escapeHtml( version.baseModel )}</td>
							</tr>` : ''}
							${version.createdAt ? `
							<tr>
								<td>Created</td>
								<td>${new Date( version.createdAt ).toLocaleDateString()}</td>
							</tr>` : ''}
							${version.description ? `
							<tr>
								<td>Description</td>
								<td>${version.description}</td>
							</tr>` : ''}
							${trainedWords ? `
							<tr>
								<td>Trigger Words</td>
								<td>${trainedWords}</td>
							</tr>` : ''}
							${safetensorsFile ? `
							<tr>
								<td>Original Filename</td>
								<td class="filename">${escapeHtml( safetensorsFile )}</td>
							</tr>` : ''}
						</table>
					</div>
				`;
      } else if( result.versionSelectionMethod ) {
        html += `
					<div class="info warning">
						<strong>Model Version Selection:</strong><br>
						${escapeHtml( result.versionSelectionMethod )}
					</div>
				`;
      }

      // Cache info section
      html += `
				<div class="info" style="background: #1e1e2e; border: 1px solid #333;">
					<div id="cacheInfo" style="display: flex; gap: 20px; align-items: center; font-size: 13px;">
						<span style="color: #888;">Loading cache info...</span>
					</div>
				</div>
			`;

      // Thumbnail size selector
      html += `
				<div class="info" style="background: #1e1e2e; border: 1px solid #333; padding: 10px 15px;">
					<label style="display: flex; align-items: center; gap: 10px; font-size: 13px;">
						<strong>Thumbnail Size:</strong>
						<select id="thumbnailSize" onchange="updateThumbnailSize(this.value)" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer;">
							<option value="150">150px</option>
							<option value="300">300px</option>
							<option value="450">450px</option>
						</select>
					</label>
				</div>
			`;

      // Display version images - placeholder with loading indicator
      html += `
				<div class="info">
					<strong>Carousel Images <span id="carouselStatus">(loading...)</span></strong>
					<div id="carouselContainer" style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;"></div>
				</div>
			`;

      // Display gallery images - placeholder with loading indicator
      html += `
				<div class="info">
					<strong>Gallery Images <span id="galleryStatus">(loading...)</span></strong>
					<div id="galleryContainer" style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;"></div>
				</div>
			`;

      // Step 3: Display the JSON data
      const jsonString = JSON.stringify( result.data, null, 2 );
      html += `
				<div class="info">
					<strong>JSON Data Structure</strong>
				</div>
				<div class="json-output">
					<pre>${escapeHtml( jsonString )}</pre>
				</div>
			`;

      // Render HTML immediately so user sees content right away
      output.innerHTML = html;

      // Load and display cache info
      getCacheSize( currentModelId ).then( cacheInfo => {
        if( cacheInfo ) {
          const cacheInfoDiv = document.getElementById( 'cacheInfo' );
          cacheInfoDiv.innerHTML = `
						<div>
							<strong>Model cache:</strong> ${cacheInfo.modelSizeMB} MB
							<button onclick="clearCache('${currentModelId}')" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear</button>
						</div>
						<div>
							<strong>Total cache:</strong> ${cacheInfo.totalSizeMB} MB (${cacheInfo.fileCount} files)
							<button onclick="clearCache()" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear All</button>
						</div>
					`;
        }
      } );

      // Set thumbnail size dropdown to saved value
      const thumbnailSizeSelect = document.getElementById( 'thumbnailSize' );
      if( thumbnailSizeSelect ) {
        thumbnailSizeSelect.value = thumbnailSize;
      }

      // Load images asynchronously - don't block main content display
      loadModelImages( currentModelId, result.selectedVersion );
    } else {
      output.innerHTML = '<div class="error">No data found in response</div>';
    }
  } catch( error ) {
    output.innerHTML = `<div class="error">Error: ${escapeHtml( error.message )}</div>`;
  } finally {
    goBtn.disabled = false;
  }
}

// Check if model exists in database
async function checkModelInDatabase( modelId, selectedVersion ) {
  if( !selectedVersion || !selectedVersion.id ) {
    console.log( 'No selectedVersion, skipping database check' );
    return;
  }

  try {
    console.log( `Checking if model ${modelId} version ${selectedVersion.id} exists in database...` );
    const response = await fetch( 'api/check_model_exists.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { modelId: parseInt( modelId ), versionId: selectedVersion.id } )
    } );

    if( !response.ok ) {
      console.error( `HTTP error! status: ${response.status}` );
      return;
    }

    const result = await response.json();
    console.log( 'Database check result:', result );
    console.log( 'result.exists type:', typeof result.exists, 'value:', result.exists );

    if( result.success && result.exists === false ) {
      console.log( 'Model not in database - showing Add to Database button' );

      // Store current model and version data globally for the button click handler
      currentModelIdForDb = modelId;
      currentSelectedVersion = selectedVersion;
      console.log( 'Stored for Add to Database:', { modelId, versionId: selectedVersion.id } );

      // Model not in database - show Add to Database button
      const addToDbSection = document.getElementById( 'addToDbSection' );
      const addToDbBtn = document.getElementById( 'addToDbBtn' );
      const addToDbStatus = document.getElementById( 'addToDbStatus' );

      if( !addToDbSection || !addToDbBtn || !addToDbStatus ) {
        console.error( 'Button elements not found in DOM!' );
        return;
      }

      addToDbSection.style.display = 'block';
      addToDbStatus.textContent = '';
      addToDbBtn.disabled = false; // Re-enable button in case it was disabled from previous use

      console.log( 'Button displayed and ready' );
    } else if( result.success && result.exists === true ) {
      console.log( 'Model already exists in database' );
    } else {
      console.error( 'Unexpected result from check_model_exists.php:', result );
    }
  } catch( error ) {
    console.error( 'Error checking model in database:', error );
  }
}

// Add model to database (models, tags, and model_tags tables)
async function addModelToDatabase( modelId, selectedVersion ) {
  console.log( 'addModelToDatabase called with:', { modelId, versionId: selectedVersion?.id } );

  // Get fresh references to DOM elements (important after button cloning)
  const addToDbBtn = document.getElementById( 'addToDbBtn' );
  const addToDbStatus = document.getElementById( 'addToDbStatus' );

  if( !addToDbBtn || !addToDbStatus ) {
    console.error( 'Button elements not found!' );
    return;
  }

  if( !modelId || !selectedVersion ) {
    console.error( 'Missing modelId or selectedVersion!' );
    addToDbStatus.textContent = '❌ Error: Missing model data';
    addToDbStatus.style.color = '#fa5252';
    return;
  }

  addToDbBtn.disabled = true;
  addToDbStatus.textContent = '⏳ Adding to database...';
  addToDbStatus.style.color = '#868e96';

  try {
    // Get the full __NEXT_DATA__ from the page
    const cacheBuster = new Date().getTime();
    const response = await fetch( `api/fetch_data.php?_=${cacheBuster}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify( { modelId } )
    } );

    const result = await response.json();

    if( result.error || !result.data ) {
      throw new Error( result.error || 'Failed to fetch model data' );
    }

    // Determine filename: prefer original_filename from safetensors, fallback to currentFilename from sidebar
    let filename = null;

    // First priority: Extract original filename from version files data
    if( selectedVersion.files && Array.isArray( selectedVersion.files ) ) {
      const safetensors = selectedVersion.files.find( f => f.name && f.name.endsWith( '.safetensors' ) );
      if( safetensors && safetensors.name ) {
        filename = safetensors.name;
        console.log( `Using original filename from version data: ${filename}` );
      }
    }

    // Second priority: Use sidebar filename if no original filename found
    if( !filename && currentFilename ) {
      filename = currentFilename;
      console.log( `Using filename from sidebar: ${filename}` );
    }

    // Last resort: Generate a filename based on model name
    if( !filename ) {
      const modelName = selectedVersion.name || 'model';
      filename = `${modelName.replace( /[^a-zA-Z0-9_-]/g, '_' )}.safetensors`;
      console.log( `Generated fallback filename: ${filename}` );
    }

    // Sync tags
    await syncTagsToDatabase( result.data, modelId );

    // Sync model
    await syncModelsToDatabase( result.data, modelId, filename, selectedVersion.id );

    addToDbStatus.textContent = '✅ Successfully added to database!';
    addToDbStatus.style.color = '#51cf66';

    // Reload the sidebar to show the newly added model
    loadLoras();

    // Hide the button after successful addition
    setTimeout( () => {
      document.getElementById( 'addToDbSection' ).style.display = 'none';
    }, 3000 );

  } catch( error ) {
    console.error( 'Error adding to database:', error );
    addToDbStatus.textContent = `❌ Error: ${error.message}`;
    addToDbStatus.style.color = '#fa5252';
    addToDbBtn.disabled = false;
  }
}

// Load model images asynchronously (carousel + gallery)
async function loadModelImages( modelId, selectedVersion ) {
  if( !selectedVersion || !selectedVersion.id ) {
    document.getElementById( 'carouselStatus' ).textContent = '(no version data)';
    document.getElementById( 'galleryStatus' ).textContent = '(no version data)';
    return;
  }

  const versionId = selectedVersion.id;

  // Fetch images from server
  try {
    const response = await fetch( 'api/get_model_images.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { modelId, versionId } )
    } );

    const result = await response.json();

    if( result.error ) {
      console.error( 'Image fetch error:', result.error );
      document.getElementById( 'carouselStatus' ).textContent = '(error loading)';
      document.getElementById( 'galleryStatus' ).textContent = '(error loading)';
      return;
    }

    // Load carousel images
    if( result.carouselImages && result.carouselImages.length > 0 ) {
      document.getElementById( 'carouselStatus' ).textContent = `(<span id="carouselCount">0</span>/${result.carouselImages.length})`;

      const loadCarouselImages = async () => {
        const container = document.getElementById( 'carouselContainer' );
        if( !container ) {
          console.error( 'Carousel container not found' );
          return;
        }
        if( container.dataset.loading === 'true' ) {
          console.warn( 'Carousel already loading, skipping duplicate call' );
          return;
        }

        console.log( `Starting carousel load: ${result.carouselImages.length} images` );
        container.dataset.loading = 'true';
        container.innerHTML = ''; // Clear container

        // Reset counter
        const carouselCountEl = document.getElementById( 'carouselCount' );
        if( carouselCountEl ) {
          carouselCountEl.textContent = '0';
        }

        // First, check which images are cached (fast, parallel)
        const cacheChecks = result.carouselImages.map( img => {
          const isVideo = img.type === 'video' || ( img.url && ( img.url.includes( '.mp4' ) || img.url.includes( '.webm' ) ) );
          if( isVideo ) {
            return Promise.resolve( { originalUrl: img.url, url: img.url, isVideo: true, cached: true } );
          }
          return checkCached( img.url ).then( result => ( {
            originalUrl: img.url,
            url: result.url,
            cached: result.cached,
            isVideo: false
          } ) );
        } );

        const imageInfo = await Promise.all( cacheChecks );

        const uncachedCount = imageInfo.filter( i => !i.cached && !i.isVideo ).length;
        console.log( `Carousel: ${imageInfo.length} total, ${uncachedCount} to download` );

        // Display and download images progressively
        let downloadCount = 0;
        for( let index = 0; index < imageInfo.length; index++ ) {
          const info = imageInfo[index];

          // If not cached, download with delay (1.5 seconds between each download)
          let displayUrl = info.url;
          if( !info.cached && !info.isVideo ) {
            if( downloadCount > 0 ) {
              // console.log(`Waiting 1.5s before downloading carousel image ${index + 1}...`);
              await new Promise( resolve => setTimeout( resolve, 1500 ) );
            }
            // console.log(`Downloading carousel image ${index + 1}/${imageInfo.length}`);
            displayUrl = await downloadAndCache( info.originalUrl );
            downloadCount++;
          }

          let imageHtml = '';
          if( info.isVideo ) {
            const mp4Url = info.url.replace( /\.webm$/, '.mp4' );
            imageHtml = `
								<div style="flex: 0 0 auto;">
									<video style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block; cursor: pointer;"
												 playsinline loop muted autoplay
												 onclick="this.requestFullscreen()">
										<source src="${escapeHtml( mp4Url )}" type="video/mp4">
									</video>
								</div>`;
          } else {
            imageHtml = `
								<div style="flex: 0 0 auto;">
									<a href="${escapeHtml( info.originalUrl )}" target="_blank">
										<img src="${escapeHtml( displayUrl )}" 
												 alt="Image ${index + 1}" 
												 style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block;"
												 loading="lazy">
									</a>
								</div>`;
          }

          container.insertAdjacentHTML( 'beforeend', imageHtml );

          // Update counter based on actual number of images in container
          const carouselCountEl = document.getElementById( 'carouselCount' );
          if( carouselCountEl ) {
            carouselCountEl.textContent = container.children.length;
          }
        }

        console.log( `Carousel loading complete: ${container.children.length} images added` );
        container.dataset.loading = 'false';
        document.getElementById( 'carouselStatus' ).innerHTML = `(${container.children.length})`;
      };

      loadCarouselImages();
    } else {
      document.getElementById( 'carouselStatus' ).textContent = '(0)';
    }

    // Load gallery images
    if( result.galleryImages && result.galleryImages.length > 0 ) {
      document.getElementById( 'galleryStatus' ).textContent = `(<span id="galleryCount">0</span>/${result.galleryImages.length})`;
      const loadGalleryImages = async () => {
        const container = document.getElementById( 'galleryContainer' );
        if( !container ) {
          console.error( 'Gallery container not found' );
          return;
        }
        if( container.dataset.loading === 'true' ) {
          console.warn( 'Gallery already loading, skipping duplicate call' );
          return;
        }

        console.log( `Starting gallery load: ${result.galleryImages.length} images` );
        container.dataset.loading = 'true';
        container.innerHTML = ''; // Clear container

        // Reset counter
        const galleryCountEl = document.getElementById( 'galleryCount' );
        if( galleryCountEl ) {
          galleryCountEl.textContent = '0';
        }

        // First, check which images are cached (fast, parallel)
        const cacheChecks = result.galleryImages.map( img => {
          const isVideo = img.type === 'video' || ( img.url && ( img.url.includes( '.mp4' ) || img.url.includes( '.webm' ) ) );
          if( isVideo ) {
            return Promise.resolve( { originalUrl: img.url, url: img.url, isVideo: true, cached: true } );
          }
          return checkCached( img.url ).then( result => ( {
            originalUrl: img.url,
            url: result.url,
            cached: result.cached,
            isVideo: false
          } ) );
        } );

        const imageInfo = await Promise.all( cacheChecks );

        const uncachedCount = imageInfo.filter( i => !i.cached && !i.isVideo ).length;
        console.log( `Gallery: ${imageInfo.length} total, ${uncachedCount} to download, ${imageInfo.length - uncachedCount} cached` );

        // Display and download images progressively
        let downloadCount = 0;
        for( let index = 0; index < imageInfo.length; index++ ) {
          const info = imageInfo[index];

          // If not cached, download with delay (1.5 seconds between each download)
          let displayUrl = info.url;
          if( !info.cached && !info.isVideo ) {
            if( downloadCount > 0 ) {
              // console.log(`Waiting 1.5s before downloading gallery image ${index + 1}...`);
              await new Promise( resolve => setTimeout( resolve, 1500 ) );
            }
            // console.log(`Downloading gallery image ${index + 1}/${imageInfo.length}`);
            displayUrl = await downloadAndCache( info.originalUrl );
            downloadCount++;
          } else if( info.cached ) {
            console.log( `Gallery image ${index + 1} loaded from cache` );
          }

          let imageHtml = '';
          if( info.isVideo ) {
            const mp4Url = info.url.replace( /\.webm$/, '.mp4' );
            imageHtml = `
								<div style="flex: 0 0 auto;">
									<video style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block; cursor: pointer;"
												 playsinline loop muted autoplay
												 onclick="this.requestFullscreen()">
										<source src="${escapeHtml( mp4Url )}" type="video/mp4">
									</video>
								</div>`;
          } else {
            imageHtml = `
								<div style="flex: 0 0 auto;">
									<a href="${escapeHtml( info.originalUrl )}" target="_blank">
										<img src="${escapeHtml( displayUrl )}" 
												 alt="Gallery Image ${index + 1}" 
												 style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block;"
												 loading="lazy">
									</a>
								</div>`;
          }

          container.insertAdjacentHTML( 'beforeend', imageHtml );

          // Update counter based on actual number of images in container
          const galleryCountEl = document.getElementById( 'galleryCount' );
          if( galleryCountEl ) {
            galleryCountEl.textContent = container.children.length;
          }
        }

        console.log( `Gallery loading complete: ${container.children.length} images added` );
        container.dataset.loading = 'false';
        document.getElementById( 'galleryStatus' ).innerHTML = `(${container.children.length})`;
      };

      loadGalleryImages();
    } else {
      document.getElementById( 'galleryStatus' ).textContent = '(0)';
    }
  } catch( error ) {
    console.error( 'Error loading images:', error );
    document.getElementById( 'carouselStatus' ).textContent = '(error)';
    document.getElementById( 'galleryStatus' ).textContent = '(error)';
  }
}

function escapeHtml( text ) {
  const div = document.createElement( 'div' );
  div.textContent = text;
  return div.innerHTML;
}

// Toggle tag selection
function toggleTag( element ) {
  const tag = element.getAttribute( 'data-tag' );

  if( activeTags.has( tag ) ) {
    activeTags.delete( tag );
    element.classList.remove( 'active' );
  } else {
    activeTags.add( tag );
    element.classList.add( 'active' );
  }

  console.log( 'Active tags:', Array.from( activeTags ) );
  updateSidebarHighlighting();
}

// Update sidebar to highlight loras that match all active tags
async function updateSidebarHighlighting() {
  if( activeTags.size === 0 ) {
    // No tags selected - remove all highlighting
    document.querySelectorAll( '.file-item' ).forEach( item => {
      item.classList.remove( 'highlighted', 'dimmed' );
    } );
    return;
  }

  try {
    // Fetch tag information for all models from database
    const response = await fetch( 'api/get_model_tags.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { tags: Array.from( activeTags ) } )
    } );

    const result = await response.json();

    if( result.success && result.matchingModels ) {
      // Get all file items
      const fileItems = document.querySelectorAll( '.file-item' );

      fileItems.forEach( item => {
        const modelId = item.getAttribute( 'data-model' );
        const versionId = item.getAttribute( 'data-version' );

        // Check if this model matches all active tags
        const matches = result.matchingModels.some( m =>
          m.model_id == modelId && m.version_id == versionId
        );

        if( matches ) {
          item.classList.add( 'highlighted' );
          item.classList.remove( 'dimmed' );
        } else {
          item.classList.remove( 'highlighted' );
          item.classList.add( 'dimmed' );
        }
      } );

      console.log( `Highlighted ${result.matchingModels.length} matching loras` );
    }
  } catch( error ) {
    console.error( 'Error updating sidebar highlighting:', error );
  }
}

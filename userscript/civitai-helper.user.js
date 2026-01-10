// ==UserScript==
// @name         Civitai Helper
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Helper script for Civitai scraper development
// @author       You
// @match        https://civitai.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=civitai.com
// @grant        GM_download
// @grant        GM.download
// @grant        GM_addValueChangeListener
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

( function () {
    'use strict';

    console.log( '[Civitai Helper] Script loaded' );

    // Track active downloads
    const activeDownloads = new Map();

    // Monitor download links and buttons
    function detectDownloads() {
        // Method 1: Monitor clicks on download buttons/links
        document.addEventListener( 'click', function ( e ) {
            const target = e.target.closest( 'a, button' );
            if( !target ) return;

            // Check if it's a download link
            const href = target.getAttribute( 'href' );
            const ariaLabel = target.getAttribute( 'aria-label' );
            const text = target.textContent.toLowerCase();

            // Detect download actions
            if( href && ( href.includes( '/api/download/models/' ) || href.includes( 'download' ) ) ) {
                console.log( '[Civitai Helper] Download detected via link:', href );
                handleDownload( href, target );
            } else if( text.includes( 'download' ) || ( ariaLabel && ariaLabel.toLowerCase().includes( 'download' ) ) ) {
                console.log( '[Civitai Helper] Download button clicked:', target );
                // Wait a bit for the actual download URL to be generated
                setTimeout( () => {
                    const possibleLink = target.closest( 'a' );
                    if( possibleLink && possibleLink.href ) {
                        handleDownload( possibleLink.href, target );
                    }
                }, 100 );
            }
        }, true );

        // Method 2: Intercept fetch/XHR requests for downloads
        const originalFetch = window.fetch;
        window.fetch = function ( ...args ) {
            const url = args[0];
            if( typeof url === 'string' && ( url.includes( '/api/download/' ) || url.includes( 'download' ) ) ) {
                console.log( '[Civitai Helper] Fetch download detected:', url );
            }
            return originalFetch.apply( this, args );
        };

        // Method 3: Monitor anchor elements with download attribute
        const observer = new MutationObserver( function ( mutations ) {
            mutations.forEach( function ( mutation ) {
                mutation.addedNodes.forEach( function ( node ) {
                    if( node.nodeType === 1 ) { // Element node
                        // Check if the added node is a download link
                        if( node.tagName === 'A' && ( node.hasAttribute( 'download' ) || node.href.includes( 'download' ) ) ) {
                            console.log( '[Civitai Helper] Download link detected in DOM:', node.href );
                        }
                        // Check descendants
                        const downloadLinks = node.querySelectorAll && node.querySelectorAll( 'a[download], a[href*="download"]' );
                        if( downloadLinks && downloadLinks.length > 0 ) {
                            downloadLinks.forEach( link => {
                                console.log( '[Civitai Helper] Download link detected in DOM:', link.href );
                            } );
                        }
                    }
                } );
            } );
        } );

        observer.observe( document.body, {
            childList: true,
            subtree: true
        } );
    }

    function handleDownload( url, element ) {
        // Extract information from the page
        const pageInfo = extractPageInfo();
        const fileName = extractFileNameFromUrl( url );
        const downloadId = Date.now() + '_' + Math.random().toString( 36 ).substr( 2, 9 );

        const downloadInfo = {
            id: downloadId,
            url: url,
            modelId: pageInfo.modelId,
            versionId: pageInfo.versionId,
            modelName: pageInfo.modelName,
            versionName: pageInfo.versionName,
            fileName: fileName,
            startTime: Date.now(),
            status: 'started'
        };

        activeDownloads.set( downloadId, downloadInfo );

        console.log( '[Civitai Helper] Download initiated:', downloadInfo );

        // Monitor this specific download for completion
        monitorDownloadCompletion( downloadId, fileName, url );

        // You can add custom logic here, such as:
        // - Send data to your local server
        // - Store in localStorage
        // - Display notifications
        // - Auto-fill forms
    }

    function monitorDownloadCompletion( downloadId, fileName, url ) {
        const downloadInfo = activeDownloads.get( downloadId );

        // Method 1: For Firefox - Poll local server to check if file exists
        let pollCount = 0;
        const maxPolls = 360; // Poll for up to 30 minutes (360 * 5 seconds)

        const checkInterval = setInterval( () => {
            const info = activeDownloads.get( downloadId );
            if( !info ) {
                clearInterval( checkInterval );
                return;
            }

            const elapsed = Date.now() - info.startTime;

            // Mark as "in progress" after 5 seconds
            if( elapsed > 5000 && info.status === 'started' ) {
                info.status = 'in_progress';
                console.log( '[Civitai Helper] Download in progress:', info );
            }

            // Poll local server to check if file exists
            if( info.status === 'in_progress' || info.status === 'started' ) {
                pollCount++;
                checkFileExistsOnServer( info.fileName, ( exists ) => {
                    if( exists && info.status !== 'completed' ) {
                        info.status = 'completed';
                        info.endTime = Date.now();
                        info.duration = info.endTime - info.startTime;

                        console.log( '[Civitai Helper] Download completed (verified on server):', info );
                        onDownloadComplete( info );

                        activeDownloads.delete( downloadId );
                        clearInterval( checkInterval );
                    }
                } );
            }

            // Timeout after max polls
            if( pollCount >= maxPolls ) {
                console.log( '[Civitai Helper] Download timeout (max polls reached):', info );
                activeDownloads.delete( downloadId );
                clearInterval( checkInterval );
            }
        }, 5000 ); // Check every 5 seconds

        // Method 2: Prompt user to notify when download completes
        // After 10 seconds, show a button they can click when download finishes
        setTimeout( () => {
            const info = activeDownloads.get( downloadId );
            if( info && info.status !== 'completed' ) {
                addManualCompleteButton( downloadId, fileName );
            }
        }, 10000 );

        // Method 3: Use PerformanceObserver (works better in Chrome)
        if( window.PerformanceObserver ) {
            try {
                const observer = new PerformanceObserver( ( list ) => {
                    for( const entry of list.getEntries() ) {
                        if( entry.name === url || ( fileName && entry.name.includes( fileName ) ) ) {
                            const info = activeDownloads.get( downloadId );
                            if( info && info.status !== 'completed' ) {
                                info.status = 'completed';
                                info.endTime = Date.now();
                                info.duration = info.endTime - info.startTime;

                                console.log( '[Civitai Helper] Download completed (PerformanceObserver):', info );
                                onDownloadComplete( info );

                                activeDownloads.delete( downloadId );
                                observer.disconnect();
                            }
                        }
                    }
                } );

                observer.observe( { entryTypes: ['resource'] } );

                setTimeout( () => observer.disconnect(), 1800000 ); // 30 minutes
            } catch( e ) {
                console.log( '[Civitai Helper] PerformanceObserver error:', e );
            }
        }
    }

    function checkFileExistsOnServer( fileName, callback ) {
        // Check if the file exists on the local server
        const checkUrl = 'http://localhost/civitai-scraper/userscript/api/check_file.php';

        fetch( checkUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify( { fileName: fileName } )
        } )
            .then( response => response.json() )
            .then( data => {
                callback( data.exists === true );
            } )
            .catch( error => {
                // Server not available, assume file doesn't exist yet
                callback( false );
            } );
    }

    function addManualCompleteButton( downloadId, fileName ) {
        const info = activeDownloads.get( downloadId );
        if( !info || info.status === 'completed' ) return;

        const buttonContainer = document.createElement( 'div' );
        buttonContainer.id = `download-complete-btn-${downloadId}`;
        buttonContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #FF9800;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            font-size: 13px;
            z-index: 10002;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            cursor: pointer;
            max-width: 300px;
        `;
        buttonContainer.innerHTML = `
            <strong>Download in progress...</strong><br>
            <small>${fileName}</small><br>
            <button style="margin-top: 8px; padding: 6px 12px; background: white; color: #FF9800; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">
                Click when complete
            </button>
        `;

        buttonContainer.querySelector( 'button' ).addEventListener( 'click', () => {
            const currentInfo = activeDownloads.get( downloadId );
            if( currentInfo ) {
                currentInfo.status = 'completed';
                currentInfo.endTime = Date.now();
                currentInfo.duration = currentInfo.endTime - currentInfo.startTime;

                console.log( '[Civitai Helper] Download completed (manual confirmation):', currentInfo );
                onDownloadComplete( currentInfo );

                activeDownloads.delete( downloadId );
            }
            buttonContainer.remove();
        } );

        document.body.appendChild( buttonContainer );

        // Auto-remove after 5 minutes
        setTimeout( () => {
            const btn = document.getElementById( `download-complete-btn-${downloadId}` );
            if( btn ) btn.remove();
        }, 300000 );
    }

    function onDownloadComplete( downloadInfo ) {
        // Show notification
        showNotification( 'Download Complete', `${downloadInfo.fileName} has finished downloading` );

        // Send to local server (if you set up an endpoint)
        sendToLocalServer( downloadInfo );

        // Store in localStorage for later retrieval
        storeDownloadHistory( downloadInfo );
    }

    function showNotification( title, message ) {
        const notification = document.createElement( 'div' );
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2196F3;
            color: white;
            padding: 15px 20px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            max-width: 300px;
        `;
        notification.innerHTML = `<strong>${title}</strong><br>${message}`;
        document.body.appendChild( notification );
        setTimeout( () => notification.remove(), 5000 );
    }

    function sendToLocalServer( downloadInfo ) {
        // Send download completion info to local server
        // You'll need to create an endpoint on your local server to receive this
        const serverUrl = 'http://localhost/civitai-scraper/userscript/api/download_complete.php';

        fetch( serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify( downloadInfo )
        } )
            .then( response => response.json() )
            .then( data => {
                console.log( '[Civitai Helper] Sent to local server:', data );
            } )
            .catch( error => {
                console.log( '[Civitai Helper] Could not send to local server:', error );
            } );
    }

    function storeDownloadHistory( downloadInfo ) {
        try {
            let history = JSON.parse( localStorage.getItem( 'civitai_download_history' ) || '[]' );
            history.push( downloadInfo );
            // Keep only last 100 downloads
            if( history.length > 100 ) {
                history = history.slice( -100 );
            }
            localStorage.setItem( 'civitai_download_history', JSON.stringify( history ) );
            console.log( '[Civitai Helper] Download stored in history' );
        } catch( e ) {
            console.log( '[Civitai Helper] Could not store in localStorage:', e );
        }
    }

    function extractPageInfo() {
        // Extract model information from the page
        const pathParts = window.location.pathname.split( '/' );
        let modelId = null;
        let modelName = null;

        // URL format: /models/{id}/{slug}
        if( pathParts[1] === 'models' && pathParts[2] ) {
            modelId = pathParts[2];
            modelName = pathParts[3] || '';
        }

        // Try to get version info from the page
        let versionId = null;
        let versionName = null;

        // Look for version selector or active version in the page
        const versionSelector = document.querySelector( '[data-version-id]' );
        if( versionSelector ) {
            versionId = versionSelector.getAttribute( 'data-version-id' );
        }

        // Try to extract from __NEXT_DATA__ if available
        const nextDataScript = document.getElementById( '__NEXT_DATA__' );
        if( nextDataScript ) {
            try {
                const nextData = JSON.parse( nextDataScript.textContent );
                const modelData = nextData?.props?.pageProps?.trpcState?.json?.queries?.find(
                    q => q.queryKey && q.queryKey[0] && q.queryKey[0][1] === 'getById'
                );
                if( modelData?.state?.data ) {
                    const data = modelData.state.data;
                    modelId = modelId || data.id;
                    modelName = modelName || data.name;
                    if( data.modelVersions && data.modelVersions[0] ) {
                        versionId = versionId || data.modelVersions[0].id;
                        versionName = data.modelVersions[0].name;
                    }
                }
            } catch( e ) {
                console.log( '[Civitai Helper] Could not parse __NEXT_DATA__:', e );
            }
        }

        return {
            modelId,
            modelName,
            versionId,
            versionName
        };
    }

    function extractFileNameFromUrl( url ) {
        // Extract filename from download URL
        try {
            const urlObj = new URL( url, window.location.origin );
            const pathParts = urlObj.pathname.split( '/' );
            return pathParts[pathParts.length - 1] || null;
        } catch( e ) {
            return null;
        }
    }

    // Initialize when page is ready
    if( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', detectDownloads );
    } else {
        detectDownloads();
    }

    // Add a visual indicator that the script is running
    const indicator = document.createElement( 'div' );
    indicator.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #4CAF50; color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px; z-index: 10000; font-family: monospace;';
    indicator.textContent = 'Civitai Helper Active';
    document.body.appendChild( indicator );
    setTimeout( () => indicator.remove(), 3000 );

} )();

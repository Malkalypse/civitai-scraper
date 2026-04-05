export function installApiDebugFetchWrapper() {
	if( typeof window === 'undefined' || typeof window.fetch !== 'function' ) {
		return;
	}

	if( window.__apiDebugFetchWrapperInstalled ) {
		return;
	}

	const originalFetch = window.fetch.bind( window );

	window.fetch = async ( ...args ) => {
		const response = await originalFetch( ...args );
		const debugHeader = response.headers.get( 'X-API-Debug' );

		if( debugHeader ) {
			const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '(unknown URL)';
			console.log( `[API DEBUG] ${requestUrl}: ${debugHeader}` );
		}

		return response;
	};

	window.__apiDebugFetchWrapperInstalled = true;
}
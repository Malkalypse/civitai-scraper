/** Generic image cache client.
 *
 * Wraps POST requests to a cache endpoint. The endpoint URL and any extra
 * request context (e.g. modelId) are supplied at construction time so the
 * class has no knowledge of the target site.
 */
export class ImageCache {
	#endpoint
	#getContext

	/**
	 * @param {object} options
	 * @param {string} [options.endpoint='api/images/cache_image.php']
	 * @param {function(): object} [options.getContext] Returns extra fields merged into every request body.
	 */
	constructor({ endpoint = 'api/images/cache_image.php', getContext = () => ({}) } = {}) {
		this.#endpoint   = endpoint
		this.#getContext = getContext
	}

	/** Check whether an image is already cached locally.
	 * @param {string} remoteUrl
	 * @param {string|null} [cacheLookupUrl]
	 * @returns {Promise<{url: string, cached: boolean}>}
	 */
	async checkCached( remoteUrl, cacheLookupUrl = null ) {
		try {
			const body = {
				imageUrl: remoteUrl,
				lookupUrl: cacheLookupUrl || remoteUrl,
				download: false,
				...this.#getContext()
			}
			const response = await fetch( this.#endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( body )
			} )
			const result = await response.json()
			if( result.cached && result.localUrl ) {
				return { url: result.localUrl, cached: true }
			}
			return { url: remoteUrl, cached: false }
		} catch( error ) {
			console.error( 'Cache check failed:', error )
			return { url: remoteUrl, cached: false }
		}
	}

	/** Download an image and cache it locally.
	 * @param {string} remoteUrl
	 * @param {string|null} [cacheLookupUrl]
	 * @returns {Promise<{url: string, wasDownloaded: boolean, failed: boolean}>}
	 */
	async downloadAndCache( remoteUrl, cacheLookupUrl = null ) {
		try {
			const body = {
				imageUrl: remoteUrl,
				lookupUrl: cacheLookupUrl || remoteUrl,
				download: true,
				...this.#getContext()
			}
			const response = await fetch( this.#endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( body )
			} )
			const result = await response.json()
			if( result.localUrl ) {
				return { url: result.localUrl, wasDownloaded: result.downloaded === true, failed: false }
			}
			return { url: remoteUrl, wasDownloaded: false, failed: true }
		} catch( error ) {
			console.error( 'Download failed:', error )
			return { url: remoteUrl, wasDownloaded: false, failed: true }
		}
	}
}

export type RequestDetails = browser.webRequest._OnBeforeRequestDetails;
export type BlockingResponse = browser.webRequest.BlockingResponse;

export type JSONRewriter = (json: Record<string, any>, url: URL) => object | Promise<Record<string, any>>;

export const requestsInProgress = new Set<string>();
export const ownRequests = new Set<string>();

export function wrapRewriter(details: RequestDetails, rewriter: JSONRewriter, url?: URL): BlockingResponse {
	
	if (ownRequests.has(details.url)) return {};
	console.log('rewrite', details.url);
	
	const filter = browser.webRequest.filterResponseData(details.requestId);
	const buffers: ArrayBuffer[] = [];
	const decoder = new TextDecoder('utf-8');
	const encoder = new TextEncoder();
	
	filter.ondata = event => buffers.push(event.data);
	filter.onstop = async event => {
		try {
			const str = buffers.map(buf => decoder.decode(buf, { stream: true })).join('');
			const body = JSON.parse(str);
			const result = await rewriter(body, url ?? new URL(details.url));
			filter.write(encoder.encode(JSON.stringify(result)));
		}
		catch (e) {
			console.error(e);
			for (const buf of buffers) filter.write(buf);
		}
		filter.disconnect();
	};
	
	return {};
	
}

export function rewriteApiRequest(
	match: string[],
	override: null | ((details: RequestDetails) => Promise<BlockingResponse | null>),
	rewriter: JSONRewriter,
) {

	const filter: browser.webRequest.RequestFilter = {
		urls: ['https://*/api/*/' + match.join('/')],
		types: ['xmlhttprequest'],
	};
	
	browser.webRequest.onBeforeRequest.addListener(
		async details => {
			console.log('req', details.url);
			requestsInProgress.add(details.url);
			// console.log('req', details.url);
			
			const parsed = new URL(details.url);
			const parts = parsed.pathname.split('/').slice(3);
			if (parts.length != match.length || !match.every((m, i) => m == '*' || m == parts[i])) return {};
			
			const pre = await override?.(details).catch(e => {
				console.error(e);
				return {};
			});
			if (pre) return pre;
			
			return wrapRewriter(details, rewriter, parsed);
			
		},
		filter,
		['blocking'],
	);
	
	browser.webRequest.onCompleted.addListener(
		details => requestsInProgress.delete(details.url),
		filter,
	);
	browser.webRequest.onErrorOccurred.addListener(
		details => requestsInProgress.delete(details.url),
		filter,
	);
	
}


export function doFetch(url: string, init?: RequestInit) {
	ownRequests.add(url);
	const promise = fetch(url, init);
	promise.finally(() => ownRequests.delete(url));
	return promise;
}

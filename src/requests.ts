import { ContextResponse, isLocalMapping, isRemoteMapping, Maybe } from './types.js';
import { ownRequests } from './fetch.js';
import { getSettings, Settings } from './settings.js';
import {
	fetchContext,
	fetchStatus,
	getActiveStatusRequest,
	getStatusMapping,
	mergeContextResponses,
	parseId,
	processStatusJSON,
	provideMapping,
} from './remapping.js';

type RequestDetails = browser.webRequest._OnBeforeRequestDetails;
type BlockingResponse = browser.webRequest.BlockingResponse;

type FilterHandler = (details: RequestDetails) => Promise<BlockingResponse>;
type JSONHandlerFilter = (json: any, details: RequestDetails) => void | Promise<void>;
type JSONRewriterFilter = (json: any, details: RequestDetails) => Record<string, any> | Promise<Record<string, any>>;

export const requestsInProgress = new Set<string>();

export function wrapHandler(details: RequestDetails, handler: JSONHandlerFilter): BlockingResponse {
	
	console.log('handle', details.url);
	
	const filter = browser.webRequest.filterResponseData(details.requestId);
	const buffers: ArrayBuffer[] = [];
	const decoder = new TextDecoder('utf-8');
	
	filter.ondata = event => {
		buffers.push(event.data);
		filter.write(event.data);
	};
	filter.onstop = async () => {
		filter.disconnect();
		try {
			const str = buffers.map(buf => decoder.decode(buf, { stream: true })).join('');
			const body = JSON.parse(str);
			await handler(body, details);
		}
		catch (e) {
			console.error(e);
		}
	};
	
	return {};
	
}

export function wrapRewriter(details: RequestDetails, rewriter: JSONRewriterFilter): BlockingResponse {
	
	console.log('rewrite', details.url);
	
	const filter = browser.webRequest.filterResponseData(details.requestId);
	const buffers: ArrayBuffer[] = [];
	const decoder = new TextDecoder('utf-8');
	const encoder = new TextEncoder();
	
	filter.ondata = event => buffers.push(event.data);
	filter.onstop = async () => {
		try {
			const str = buffers.map(buf => decoder.decode(buf, { stream: true })).join('');
			const body = JSON.parse(str);
			const result = await rewriter(body, details);
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

function parseStatusApiUrl(url: string) {
	const { hostname: localHost, pathname } = new URL(url);
	const parts = pathname.split('/').slice(3).filter(s => !!s);
	const urlId = (parts[0] == 'statuses' && parts[1]);
	const parsed = urlId && parseId(localHost, urlId) || null;
	// console.log('parsed', urlId, parsed);
	const rest = parts.slice(2);
	return { pathname, parts, urlId, parsed, localHost, rest };
}

const statusRequestHandler: FilterHandler = async details => {
	
	const { localHost, parsed } = parseStatusApiUrl(details.url);
	if (!parsed || details.method != 'GET') return {};
	
	// If this is a request for a remote status, attempt to substitute a local one.
	// TODO Does this even happen?
	if (isRemoteMapping(parsed)) {
		const result = await provideMapping(parsed);
		if (!result?.mapping.localId) return {};
		return { redirectUrl: `https://${localHost}/api/v1/statuses/${result?.mapping.localId}` };
	}
	
	const key = `${localHost}:${parsed.localId}`;
	
	// If there is already an active request, keep it as is
	if (getActiveStatusRequest(key)) return {};
	
	return wrapHandler(details, async json => {
		if (json.id) await processStatusJSON(localHost, json);
	});
	
};

const statusContextHandler: FilterHandler = async details => {
	
	const { localHost, parsed } = parseStatusApiUrl(details.url);
	if (!parsed) return {};
	
	let remoteReq: Promise<Maybe<ContextResponse>>;
	let mapping = await getStatusMapping(parsed);
	
	// this is a local status, nothing to merge
	if (mapping && mapping.localHost == mapping.remoteHost) return {};
	
	// TODO check that remote instance even is Mastodon
	
	// do we already know the remote id?
	if (isRemoteMapping(mapping)) {
		
		if (getSettings().skipInstances.includes(mapping.remoteHost)) return {};
	
		remoteReq = fetchContext(mapping);
		
		// client is trying to fetch context for a fake id (or our db is screwed up)
		if (!isLocalMapping(mapping)) {
			console.log('fix mapping', mapping);
			mapping = await provideMapping(mapping).then(res => res?.mapping);
		}
		
		// requested via fake id, redirect, keep remoteReq dangling (it will be reused)
		if (isLocalMapping(mapping) && !isLocalMapping(parsed)) {
			console.log('redir context', mapping);
			return { redirectUrl: `https://${localHost}/api/v1/statuses/${mapping.localId}/context` };
		}
		
	}
	
	// then do we at least know the local id?
	else if (!mapping && isLocalMapping(parsed)) {
		mapping = await fetchStatus(parsed.localHost, parsed.localId).then(res => res?.mapping);
		if (isRemoteMapping(mapping)) remoteReq = fetchContext(mapping);
	}
	
	if (!isRemoteMapping(mapping)) return {};
	const remoteMapping = mapping;
	
	return wrapRewriter(details, async (localResponse: ContextResponse) => {
	
		const remoteResponse = await remoteReq;
		if (!remoteResponse) return localResponse;
		
		return await mergeContextResponses({
			localHost,
			mapping: remoteMapping,
			localResponse,
			remoteResponse,
		});
	
	});
	
};

const statusActionHandler: FilterHandler = async details => {
	
	const { localHost, parsed, rest } = parseStatusApiUrl(details.url);
	if (!parsed) return {};
	
	// If this is a request for a fake status ID, attempt to substitute a real one.
	if (!isLocalMapping(parsed)) {
		console.log('fix action', details.url);
		const result = await provideMapping(parsed);
		if (!result?.mapping.localId) return {};
		const redirectUrl = `https://${localHost}/api/v1/statuses/${result?.mapping.localId}/${rest.join('/')}`;
		console.log('redir action to', redirectUrl);
		return { redirectUrl };
	}
	
	return {};
	
};

const matches: Array<{
	match: string[];
	handler: FilterHandler;
}> = [
	{
		match: ['statuses', '*'],
		handler: statusRequestHandler,
	},
	{
		match: ['statuses', '*', 'context'],
		handler: statusContextHandler,
	},
	{
		match: ['statuses', '*', '*'],
		handler: statusActionHandler,
	},
];

export const beforeRequestListener = async (details: RequestDetails) => {
	
	if (ownRequests.has(details.url)) {
		console.log('own req', details.url);
		return {};
	}
	
	console.log('req', details.url);
	requestsInProgress.add(details.url);
	// console.log('req', details.url);
	
	const parsed = new URL(details.url);
	const parts = parsed.pathname.split('/').slice(3);
	
	for (const { match, handler } of matches) {
		
		if (parts.length != match.length || !match.every((m, i) => m == '*' || m == parts[i])) continue;
		
		return await handler(details).catch(e => {
			console.error(e);
			return {};
		});
		
	}
	
	return {};
	
};

export const requestUrlDeleter = (details: browser.webRequest._OnCompletedDetails | browser.webRequest._OnErrorOccurredDetails) => {
	requestsInProgress.delete(details.url);
};

export function getWebRequestFilter(settings: Settings): browser.webRequest.RequestFilter {
	return {
		urls: settings.instances.flatMap(host => matches.map(
			({ match }) => `https://${host}/api/*/${match.join('/')}`,
		)),
		types: ['xmlhttprequest'],
	};
}

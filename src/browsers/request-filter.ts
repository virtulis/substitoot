// Request interception using webRequest.filterResponseData etc.
// Mostly Firefox-specific

import { ContextResponse, isLocalMapping, isRemoteMapping, Maybe } from '../types.js';
import { getSettings, Settings } from '../settings.js';
import { sleep } from '../util.js';
import {
	fetchStatus,
	getStatusMapping,
	processStatusJSON,
	provideStatusMapping,
	statusRequests,
} from '../remapping/statuses.js';
import { fetchContext, mergeContextResponses } from '../remapping/context.js';
import { provideAccountMapping } from '../remapping/accounts.js';
import { parseId } from '../ids.js';
import { ownRequests } from '../instances/fetch.js';

type RequestDetails = browser.webRequest._OnBeforeRequestDetails;
type BlockingResponse = browser.webRequest.BlockingResponse;

type FilterHandler = (details: RequestDetails) => Promise<BlockingResponse>;
type JSONHandlerFilter = (json: any, details: RequestDetails) => void | Promise<void>;
type JSONRewriterFilter = (json: any, details: RequestDetails) => Record<string, any> | Promise<Record<string, any>>;

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
	const parts = pathname.split('/').filter(s => !!s);
	const prefix = parts.slice(0, 3); // api/v1/statuses
	const urlId = parts[3];
	const parsed = urlId && parseId(localHost, urlId) || null;
	const rest = parts.slice(4);
	console.log('parsed', parts, prefix, urlId, rest, parsed);
	return { pathname, prefix, parts, urlId, parsed, localHost, rest };
}

const statusRequestHandler: FilterHandler = async details => {
	
	const { localHost, parsed, prefix } = parseStatusApiUrl(details.url);
	if (!parsed || details.method != 'GET') return {};
	
	// If this is a request for a remote status, attempt to substitute a local one.
	// TODO Does this even happen?
	if (isRemoteMapping(parsed)) {
		const result = await provideStatusMapping(parsed);
		if (!result?.mapping.localId) return {};
		return { redirectUrl: `https://${localHost}/${prefix.join('/')}/${result?.mapping.localId}` };
	}
	
	const key = `${localHost}:${parsed.localId}`;
	
	// If there is already an active request, keep it as is and still perform this one
	if (statusRequests.get(key)) return {};
	
	return wrapHandler(details, async json => {
		if (!json.id) return;
		await statusRequests.add(key, processStatusJSON(localHost, json));
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
			mapping = await provideStatusMapping(mapping).then(res => res?.mapping);
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
	
	const { localHost, parsed, prefix, rest } = parseStatusApiUrl(details.url);
	if (!parsed) return {};
	
	// If this is a request for a fake status ID, attempt to substitute a real one.
	if (!isLocalMapping(parsed)) {
		console.log('fix action', details.url);
		const result = await provideStatusMapping(parsed);
		if (!result?.mapping.localId) return {};
		const redirectUrl = `https://${localHost}/${prefix.join('/')}/${result?.mapping.localId}/${rest.join('/')}`;
		console.log('redir action to', redirectUrl);
		return { redirectUrl };
	}
	
	return {};
	
};

const accountActionHandler: FilterHandler = async details => {
	
	const url = new URL(details.url);
	const { hostname: localHost, pathname, searchParams } = url;
	
	const parts = pathname.split('/').filter(s => !!s);
	const prefix = parts.slice(0, 3); // api/v1/statuses
	const urlId = parts[3];
	const parsed = urlId && parseId(localHost, urlId) || null;
	const rest = parts.slice(4);
	
	// if (!parsed || isLocalMapping(parsed) || !isRemoteMapping(parsed)) return {};
	
	if (parsed && isRemoteMapping(parsed)) {
		
		// If this is a request for a fake account ID, attempt to substitute a real one.
		console.log('fix acct action', details.url);
		
		const result = await provideAccountMapping(parsed);
		if (!result?.localId) {
			await sleep(1000); // Mastodon web code does a stupid and keeps hammering when it gets a 404 on some account requests
			return {};
		}
		
		const redirectUrl = `https://${localHost}/${prefix.join('/')}/${result.localId}${rest.length ? '/' + rest.join('/') : ''}`;
		console.log('redir action to', redirectUrl);
		return { redirectUrl };
		
	}
	
	if (!parsed) {
		
		let modified = false;
		for (const [key, value] of searchParams.entries()) {
			if (!value.match(/^s:a:/)) continue;
			const id = parseId(localHost, value);
			if (!id || isLocalMapping(id) || !isRemoteMapping(id)) continue;
			const result = await provideAccountMapping(id);
			if (!result?.localId) continue;
			searchParams.set(key, result.localId);
			modified = true;
		}
		
		if (modified) {
			const redirectUrl = url.toString();
			console.log('redir action qs to', redirectUrl);
			return { redirectUrl };
		}
		
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
	{
		match: ['accounts', '*'],
		handler: accountActionHandler,
	},
	{
		match: ['accounts', '*', '*'],
		handler: accountActionHandler,
	},
];

export const beforeRequestListener = async (details: RequestDetails) => {
	
	if (ownRequests.has(details.url)) {
		console.log('own req', details.url);
		return {};
	}
	
	console.log('req', details.url);
	
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

export function getWebRequestFilter(settings: Settings): browser.webRequest.RequestFilter {
	return {
		urls: settings.instances.flatMap(host => matches.map(
			({ match }) => `https://${host}/api/*/${match.join('/')}`,
		)),
		types: ['xmlhttprequest'],
	};
}

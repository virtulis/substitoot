import { parseId } from '../remapping/ids.js';
import { ContextResponse, isFullMapping, isLocalMapping, isRemoteMapping, Maybe, StatusMapping } from '../types.js';
import { callSubstitoot } from './call.js';
import { PatchedXHR } from './xhr.js';
import { sleep } from '../util.js';
import { contextLists } from '../remapping/context.js';
import DOMPurify from 'dompurify';

let curReqAt = 0;
let curReqId: Maybe<string> = null;
let haveSecondReq = false;
let curShared: Maybe<{
	mappingRequest?: Promise<Maybe<StatusMapping>>;
	fullMappingRequest?: Promise<Maybe<StatusMapping>>;
	localRequest?: Promise<Maybe<ContextResponse>>;
}> = null;

export async function wrapContextRequest(xhr: PatchedXHR, parts: string[]) {

	const id = parts[3];
	const localHost = location.hostname;
	
	const parsed = parseId(localHost, id);
	const { onloadend, onerror, onabort } = xhr;
	// console.log(parsed, onloadend, onerror, onabort);
	
	if (!parsed || !onloadend) return xhr.__send();
	
	// Tricky concurrency shenanigans.
	const isSecondReq = curReqId == id && Date.now() - curReqAt < 100;
	curReqId = id;
	curReqAt = Date.now();
	curShared = isSecondReq ? {} : null;
	haveSecondReq = isSecondReq;
	// console.log({ isSecondReq, haveSecondReq });
	
	// Tricky concurrency shenanigans continued!
	await sleep(1);
	const shared = curShared || {};
	const isFirstReq = haveSecondReq && !isSecondReq;
	// console.log({ isSecondReq, isFirstReq });
	
	// const store = getReduxStore();
	// console.log({ store });
	
	shared.mappingRequest ??= callSubstitoot('getStatusMapping', parsed);
	let mapping = (await shared.mappingRequest) ?? parsed;
	// console.log(mapping);
	
	if (mapping.remoteHost == mapping.localHost) {
		return xhr.__send();
	}
	
	let event: Maybe<ProgressEvent> = null;
	
	// const fullMapping = isFullMapping(mapping) ? mapping : ;
	if (!isFullMapping(mapping)) shared.fullMappingRequest ??= callSubstitoot('provideStatusMapping', mapping).then(res => res?.mapping);
	
	if (!isSecondReq) shared.localRequest = (async () => {
	
		if (!isLocalMapping(mapping)) mapping = (await shared.fullMappingRequest) ?? mapping;
		
		let actual: PatchedXHR;
		if (isLocalMapping(parsed) || !isLocalMapping(mapping)) {
			actual = xhr;
		}
		else {
			const url = `/${parts.map(p => p == id ? mapping.localId : p).join('/')}`;
			console.log(url);
			actual = new XMLHttpRequest() as PatchedXHR;
			actual.open(xhr.__method, url);
			console.log(xhr.__headers);
			for (const [name, value] of Object.entries(xhr.__headers)) actual.setRequestHeader(name, value);
		}
		
		return await new Promise<Maybe<ContextResponse>>(resolve => {
			actual.onloadend = (ev: ProgressEvent) => {
				event = ev;
				try {
					const json = JSON.parse(actual.responseText);
					if (!json.descendants) {
						console.error(json);
						return resolve(null);
					}
					resolve(json);
				}
				catch (e) {
					console.error(e);
					console.error(actual.status);
					resolve(null);
				}
				onloadend.call(actual, ev);
			};
			actual.onerror = (ev) => {
				resolve(null);
				onerror?.call(actual, ev);
			};
			actual.onabort = (ev) => {
				resolve(null);
				onabort?.call(actual, ev);
			};
			actual.__send();
		});
		
	})();
	
	if (isFirstReq) return;
	
	const remoteRequest = (async () => {
		
		if (!isRemoteMapping(mapping)) mapping = (await shared.fullMappingRequest) ?? mapping;
		if (!isRemoteMapping(mapping)) return;
		
		return await callSubstitoot('fetchContext', mapping);
		
	})();
	
	const remoteResponse = await remoteRequest;
	const localResponse = await shared.localRequest;
	
	// console.log({ localResponse, remoteResponse, isFirstReq, isSecondReq, haveSecondReq });
	
	if (!event) {
		event = new ProgressEvent('loadend');
		Object.defineProperty(event, 'target', { value: xhr });
	}
	
	if (!remoteResponse || !isRemoteMapping(mapping)) {
		if (isSecondReq) onloadend.call(xhr, event);
		return;
	}
	
	// FIXME ?
	for (const list of contextLists) for (const status of remoteResponse[list]) {
		status.content = DOMPurify.sanitize(status.content);
	}
	
	const merged = await callSubstitoot('mergeContextResponses', {
		mapping,
		localHost,
		localResponse,
		remoteResponse,
	});
	
	// console.log(merged);
	
	Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(merged) });
	onloadend.call(xhr, event);
	
}

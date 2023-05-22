import { PatchedXHR, swapInXHR } from './xhr.js';
import { parseId } from '../ids.js';
import { isFullMapping, isLocalMapping, Maybe, Status, StatusMapping } from '../types.js';
import { callSubstitoot } from './call.js';
import { updateRemoteStatusCounts } from './redux.js';
import { reportAndNull, sleep } from '../util.js';

const patches = new Map<string, Partial<Status>>();

export function patchStatus(id: string, patch: Partial<Status>) {
	patches.set(id, {
		...patches.get(id),
		...patch,
	});
}

export async function wrapRemoteStatusRequest(xhr: PatchedXHR, parts: string[], body: any) {
	
	const id = parts[3];
	const parsed = id && parseId(location.hostname, id);
	if (!parsed || !xhr.onloadend) return xhr.__send(body);
	
	const mapping = await callSubstitoot('provideStatusMapping', parsed).then(res => res?.mapping);
	if (!isLocalMapping(mapping)) return xhr.__send(body);
	
	const url = `/${parts.map(p => p == id ? mapping.localId : p).join('/')}`;
	
	swapInXHR(xhr, url, body, res => {
		try {
			const json = JSON.parse(xhr.responseText);
			const patch = patches.get(mapping.localId);
			// console.log('wrapRemoteStatusRequest', json, patch);
			if (patch) Object.assign(json, patch);
			return JSON.stringify(json);
		}
		catch (e) {
			console.error(e);
			return res;
		}
	});
	
}

export async function wrapLocalStatusRequest(xhr: PatchedXHR, parts: string[], body: any) {
	
	const id = parts[3];
	
	const { onloadend } = xhr;
	xhr.onloadend = ev => {
		try {
			const json = JSON.parse(xhr.responseText);
			const patch = patches.get(id);
			// console.log('wrapLocalStatusRequest', json, patch);
			if (patch) Object.assign(json, patch);
			Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(json) });
		}
		catch (e) {
			console.error(e);
		}
		onloadend?.call(xhr, ev);
	};
	
	xhr.__send(body);
	
}

export async function wrapTimelineRequest(xhr: PatchedXHR, parts: string[], body: any) {
	const { onloadend } = xhr;
	xhr.onloadend = ev => {
		try {
			const json = JSON.parse(xhr.responseText);
			let changed = false;
			for (const row of json) {
				for (const status of [row, row.reblog] as Maybe<Status>[]) {
					const patch = status && patches.get(status.id);
					if (patch) {
						// console.log('wrapTimelineRequest', status?.id, status?.content, patch);
						Object.assign(status, patch);
						changed = true;
					}
					else if (status) {
						enqueueStatusFetch({ status });
					}
				}
			}
			if (changed) Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(json) });
		}
		catch (e) {
			console.error(e);
		}
		onloadend?.call(xhr, ev);
	};
	xhr.__send(body);
}

export async function wrapStatusPostRequest(xhr: PatchedXHR, body: string) {

	const json = JSON.parse(body);
	const id = json.in_reply_to_id;
	const parsed = id && parseId(location.hostname, id);
	if (!id || isLocalMapping(parsed)) return xhr.__send(body);
	
	const mapping = await callSubstitoot('provideStatusMapping', parsed).then(res => res?.mapping);
	if (!isLocalMapping(mapping)) return xhr.__send(body);
	
	json.in_reply_to_id = mapping.localId;
	
	const { onloadend } = xhr;
	xhr.onloadend = ev => {
		try {
			const json = JSON.parse(xhr.responseText);
			json.in_reply_to_id = id;
			Object.defineProperty(xhr, 'responseText', { value: JSON.stringify(json) });
		}
		catch (e) {
			console.error(e);
		}
		onloadend?.call(xhr, ev);
	};
	
	xhr.__send(JSON.stringify(json));
	
}

type QueueEntry = { status?: Status; mapping?: StatusMapping };

const statusQueue: QueueEntry[] = [];
let statusQueueActive = false;

export function enqueueStatusFetch(entry: QueueEntry) {
	statusQueue.push(entry);
	if (statusQueueActive) return;
	statusQueueActive = true;
	(async () => {
		while (statusQueue.length) {
			const entry = statusQueue.shift()!;
			const local = entry.mapping ?? { localHost: location.hostname, localId: entry.status!.id };
			const mapping = isFullMapping(local) ? local : await callSubstitoot('provideStatusMapping', local).then(res => res?.mapping);
			console.log(mapping?.localId, mapping?.remoteId);
			if (!isFullMapping(mapping)) continue;
			const counts = await callSubstitoot('fetchStatusCounts', mapping.remoteHost, mapping.remoteId);
			console.log(counts);
			if (counts) await updateRemoteStatusCounts(mapping, counts);
			await sleep(100);
		}
	})().catch(reportAndNull).finally(() => statusQueueActive = false);
}

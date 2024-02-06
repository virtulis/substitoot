
import { contextLists, ContextResponse, Maybe, Status } from '../types.js';
import { callSubstitoot } from './call.js';
import { callMessageHandler, PatchedXHR } from './xhr.js';
import { showToast, toastColors } from './toast.js';
import { decideRequestDelay, reportAndNull } from '../util.js';
import { patchStatus } from './status.js';

let nextContextRequest = 1;

export async function wrapContextRequest(xhr: PatchedXHR, parts: string[]) {

	const pfx = ['wrapContextRequest', nextContextRequest++];
	const log = (...args: any[]) => {
		console.log(...pfx, ...args);
	};
	
	const id = parts[3];
	const instance = location.hostname;
	const cached = await callSubstitoot('getStatusUri', instance, id);
	if (cached && new URL(cached.uri).hostname == instance) {
		log('skip local', id);
		return xhr.__send();
	}
	
	log('begin', id, parts);
	const { onloadend, onerror, onabort } = xhr;
	if (!onloadend) return xhr.__send();
	
	let canceled = false;
	const cancel = () => {
		log('cancel');
		canceled = true;
	};
	const { dot, text, hide } = showToast(cancel);
	
	let localCount: Maybe<number> = null;
	let remoteCount: Maybe<number> = null;
	let loadedCount = 0;
	let failureCount = 0;
	let errorInfo: Maybe<string> = null;
	const showStatus = (color: keyof typeof toastColors) => {
		dot.style.backgroundColor = toastColors[color];
		text.textContent = errorInfo || `${localCount ?? '·'} + ${loadedCount ?? '·'} / ${remoteCount ?? '·'} ${failureCount ? `- ${failureCount} failed` : ''}`;
	};
	showStatus('init');
	const fail = (info: string) => {
		errorInfo = info;
		showStatus('failed');
		setTimeout(hide, 5000);
	};
	
	(async () => {
		
		const localResponse = await new Promise<Maybe<ContextResponse>>(resolve => {
			xhr.onloadend = (ev: ProgressEvent) => {
				try {
					const json = JSON.parse(xhr.responseText);
					if (json.descendants) {
						resolve(json);
					}
					else {
						console.error(json);
						resolve(null);
					}
				}
				catch (e) {
					console.error(e);
					console.error(xhr.status);
					resolve(null);
				}
				onloadend.call(xhr, ev);
			};
			xhr.onerror = (ev) => {
				resolve(null);
				onerror?.call(xhr, ev);
			};
			xhr.onabort = (ev) => {
				resolve(null);
				onabort?.call(xhr, ev);
			};
			xhr.__send();
		});
		if (canceled) return;
		
		if (!localResponse) return fail('Local request failed?');
		log('localResponse', localResponse);
		
		const settings = await callSubstitoot('getSettings');
		
		const knownIds = new Set<string>([id]);
		for (const list of contextLists) for (const st of localResponse[list]) {
			knownIds.add(st.id);
		}
		localCount = knownIds.size;
		showStatus('initMore');
		
		const mainStatus: Status = await fetch(`/api/v1/statuses/${id}`).then(res => res.json());
		if (mainStatus) await callSubstitoot('cacheStatusUri', { instance, id, uri: mainStatus.uri });
		if (canceled) return;
		
		const known = new Set<string>([mainStatus.uri]);
		for (const list of contextLists) for (const st of localResponse[list]) {
			known.add(st.uri);
		}
		log('known', known);
		
		const url = new URL(mainStatus.uri);
		if (url.hostname == instance) {
			showStatus('success');
			hide();
			return;
		}
		
		showStatus('localSuccess');
		const remoteResponse = await callSubstitoot('fetchRemoteStatusAndContext', mainStatus.uri);
		log('remoteResponse', remoteResponse);
		if (canceled) return;
		if (!remoteResponse) return fail('Could not fetch remote status');
		
		if (remoteResponse.counts) {
			patchStatus(mainStatus.id, remoteResponse.counts);
			const payload = JSON.stringify({ ...mainStatus, ...remoteResponse.counts });
			const data = JSON.stringify({
				stream: ['user'],
				event: 'status.update',
				payload,
			});
			callMessageHandler(data);
		}
		
		const remoteContext = remoteResponse?.context;
		if (!remoteContext) return fail('Could not fetch remote context');
		
		const missing = new Set<string>();
		for (const list of contextLists) for (const st of remoteContext[list]) {
			if (!known.has(st.uri)) missing.add(st.uri);
		}
		remoteCount = missing.size;
		loadedCount = 0;
		log('missing', missing);
		
		showStatus('inProgress');
		const active = new Set<Promise<any>>();
		const readyChildren = new Map<string, Status[]>;
		const maxActive = settings.maxParallelSearchReqs;
		const emit = (status: Status) => {
			if (canceled) return;
			log('emit', status);
			knownIds.add(status.id);
			const payload = JSON.stringify(status);
			const data = JSON.stringify({
				stream: ['user'],
				event: 'update',
				payload,
			});
			callMessageHandler(data);
		};
		const addChild = (child: Status) => {
			const parId = child.in_reply_to_id;
			log('addChild', child.id, parId, knownIds.has(parId!));
			if (!parId || knownIds.has(parId)) {
				emit(child);
				const arr = readyChildren.get(child.id);
				if (arr) {
					readyChildren.delete(child.id);
					for (const child of arr) emit(child);
				}
			}
			else {
				let arr = readyChildren.get(parId);
				if (!arr) {
					arr = [];
					readyChildren.set(parId, arr);
				}
				arr.push(child);
			}
			callSubstitoot('cacheStatusUri', { instance, id: child.id, uri: child.uri }).catch(reportAndNull);
		};
		let last = 0;
		let delay = 200;
		for (const uri of missing) {
		
			if (active.size >= maxActive) await Promise.race(active);
			const now = Date.now();
			if (now - last < delay) await new Promise(resolve => setTimeout(resolve, delay - (now - last)));
			if (canceled) return;
			last = Date.now();
			
			log('resolve', uri);
			const promise = (async () => {
				
				const search = `/api/v2/search?q=${uri}&resolve=true&limit=1&type=statuses`;
				const res = await fetch(search);
				loadedCount++;
				if (res.headers.has('x-ratelimit-remaining') && res.headers.has('date')) {
					delay = decideRequestDelay(res);
				}
				if (res.status >= 400) {
					delay = 2000;
					failureCount++;
					return;
				}
				const json = await res.json();
				
				const status = json.statuses?.[0] ?? null;
				if (status) addChild(status);
				else failureCount++;
				
				showStatus(failureCount ? 'partFailed' : 'inProgress');
				
			})().catch(reportAndNull);
			active.add(promise);
			promise.finally(() => active.delete(promise));
			
		}
		
		await Promise.all(active);
		
		failureCount += [...readyChildren.values()].flat(1).length;
		
		showStatus(failureCount ? 'partSuccess' : 'success');
		setTimeout(hide, 2000);
		
	})().catch(e => {
		console.error(e);
		fail('Error (see console)');
	});
	
}

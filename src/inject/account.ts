import { callMessageHandler, PatchedXHR } from './xhr.js';
import { Account, Maybe, Status } from '../types.js';
import { callSubstitoot } from './call.js';
import { showToast, toastColors } from './toast.js';
import { decideRequestDelay } from '../util.js';

const idParams = ['since_id', 'min_id', 'max_id'] as const;
const modParams = ['exclude_reblogs', 'exclude_replies', 'only_media', 'tagged', 'pinned'] as const;
const prevStatusFetches = new Set<string>();

let nextStatusesRequest = 1;

export async function wrapAccountStatusesRequest(xhr: PatchedXHR, parts: string[], query: URLSearchParams) {
	
	const { onloadend, onerror, onabort } = xhr;
	
	const pfx = ['wrapAccountStatusesRequest', nextStatusesRequest++];
	const log = (...args: any[]) => {
		console.log(...pfx, ...args);
	};
	
	const id = parts[3];
	if (!onloadend || idParams.some(p => query.has(p))) {
		log('skip _id req', id);
		return xhr.__send();
	}
	
	const key = [id, ...modParams.map(k => query.get(k) || '-')].join(',');
	if (prevStatusFetches.has(key)) {
		log('skip prev', key);
		return xhr.__send();
	}
	
	prevStatusFetches.add(key);
	
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
		text.textContent = errorInfo || `${localCount ?? '·'} + ${loadedCount ?? '·'} / ${remoteCount ?? '·'} ${failureCount ? `- ${failureCount} fail` : ''} ${loadedCount - failureCount > 0 ? '(refresh!)' : ''}`;
	};
	
	log('begin', key);
	showStatus('init');
	const fail = (info: string) => {
		canceled = true;
		errorInfo = info;
		showStatus('failed');
		setTimeout(hide, 5000);
	};
	
	(async () => {
		
		const localStatuses = await new Promise<Maybe<Status[]>>(resolve => {
			xhr.onloadend = (ev: ProgressEvent) => {
				try {
					const json = JSON.parse(xhr.responseText);
					if (Array.isArray(json)) {
						resolve(json);
					}
					else {
						console.error(json);
						return resolve(null);
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
		if (!localStatuses) return fail('Local request failed?');
		
		localCount = localStatuses.length;
		showStatus('initMore');
		
		const account: Account = await fetch(`/api/v1/accounts/${id}`).then(res => res.json());
		
		const remoteStatuses = await callSubstitoot('fetchRemoteAccountStatuses', account.acct, account.uri, query.toString());
		if (canceled) return;
		if (!remoteStatuses) return fail('Remote request failed');
		
		const known = new Set(localStatuses.map(st => st.uri));
		const missing = new Set(remoteStatuses.map(st => st.uri).filter(u => !known.has(u)));
		remoteCount = missing.size;
		loadedCount = 0;
		log('missing', missing);
		
		if (!remoteCount) {
			showStatus('success');
			setTimeout(hide, 2000);
			return;
		}
		
		showStatus('inProgress');
		
		const emit = (status: Status) => {
			if (canceled) return;
			log('emit', status);
			const payload = JSON.stringify(status);
			const data = JSON.stringify({
				stream: ['user'],
				event: 'update',
				payload,
			});
			callMessageHandler(data);
		};
		
		let last = 0;
		let delay = 200;
		for (const uri of missing) {
			
			const now = Date.now();
			if (now - last < delay) await new Promise(resolve => setTimeout(resolve, delay - (now - last)));
			if (canceled) return;
			last = Date.now();
			
			log('resolve', uri);
			
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
			if (status) {
				emit(status);
			}
			else {
				failureCount++;
				if (failureCount >= 3) break;
				delay = 2000;
			}
			showStatus(failureCount ? 'partFailed' : 'inProgress');
			
		}
		
		if (loadedCount - failureCount < 0) return fail('Too many failures');
		
		showStatus(failureCount ? 'partSuccess' : 'success');
		setTimeout(hide, 5000);
	
	})().catch(e => {
		console.error(e);
		fail('Error (see console)');
	});
	
}


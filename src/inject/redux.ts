import { LocalMapping, Maybe, RemoteMapping, Status, StatusCounts } from '../types.js';
import { maybe, pick } from '../util.js';
import { patchStatus } from './status.js';

interface ReduxStore {
	dispatch(arg: ((dispatch: ReduxStore['dispatch'], getState: () => any) => void) | object): void;
	getState(): any;
}

let reduxStore: Maybe<ReduxStore> = null;

function findReduxStore(ctrEl: HTMLElement) {
	const ctrProp = Object.getOwnPropertyNames(ctrEl).find(s => s.match(/^__reactContainer.*\$.*/));
	if (!ctrProp) return null;
	const ctr = (ctrEl as any)[ctrProp];
	let child;
	for (child = ctr; child; child = child.child) {
		const store = child.memoizedProps?.store;
		if (!store?.dispatch) continue;
		reduxStore = store;
		watchReduxStore(store);
		return;
	}
	return null;
}

function watchReduxStore(store: ReduxStore) {
	const { dispatch } = store;
	store.dispatch = function (arg: any) {
		
		if (typeof arg == 'function') {
			const code = arg.toString();
			if (code.includes('/api/v1/statuses/') && code.match(/`\/api\/v1\/statuses\/\$\{\w+}\/context`/)) {
				dispatch.call(this, arg);
				// console.log('duplicated the context call');
			}
		}
		
		dispatch.call(this, arg);
		
	};
}

let reduxObserver: Maybe<Promise<Maybe<ReduxStore>>> = null;

export function observeForRedux() {

	reduxObserver = new Promise<Maybe<ReduxStore>>(resolve => {
	
		setTimeout(() => resolve(null), 5000);
	
		const ctrEl = document.getElementById('mastodon');
		if (!ctrEl || !window.MutationObserver) {
			return resolve(null);
		}
	
		const config = { attributes: true, childList: true, subtree: true };
		const started = Date.now();
	
		const callback: MutationCallback = (mutationList, observer) => {
			if (!reduxStore) findReduxStore(ctrEl);
			if (reduxStore || Date.now() - started > 5000) {
				observer.disconnect();
				resolve(reduxStore);
			}
		};

		const observer = new MutationObserver(callback);
		observer.observe(ctrEl, config);
		
	});

}

export async function waitForReduxStore() {
	return await reduxObserver;
}

export async function cleanUpFakeStatuses(ids: { realId: string; fakeId: string }[]) {
	const store = await waitForReduxStore();
	store?.dispatch((dispatch, getState) => {
		const statuses = getState().get('statuses');
		ids.filter(pair => statuses.has(pair.realId) && statuses.has(pair.fakeId)).forEach(({ fakeId: id }) => dispatch({
			type: 'TIMELINE_DELETE',
			id,
			accountId: getState().getIn(['statuses', id, 'account']),
			references: getState().get('statuses').filter((status: any) => status.get('reblog') === id).map((status: any) => status.get(
				'id',
			)),
			reblogOf: getState().getIn(['statuses', id, 'reblog'], null),
		}));
	});
}

export async function updateRemoteStatusCounts(mapping: RemoteMapping, counts: StatusCounts) {
	
	const patch = pick(counts, ['replies_count', 'reblogs_count', 'favourites_count']);
	if (mapping.localId) patchStatus(mapping.localId, patch);
	
	const store = await waitForReduxStore();
	const fakeId = `s:s:${mapping.remoteHost}:${mapping.remoteId}`;
	for (let attempt = 0; attempt < 20; attempt++) {
		if (await new Promise<boolean>(resolve => {
			store?.dispatch((dispatch, getState) => {
		
				const localReal = maybe(mapping.localId, id => getState().getIn(['statuses', id]));
				// console.log(localReal?.get('isLoading'), status);
				if (localReal?.get('isLoading')) return setTimeout(() => resolve(false), 100);
				const localFake = maybe(fakeId, id => getState().getIn(['statuses', id]));
		
				const updated = [localReal, localFake].filter(o => !!o).map(local => ({
					...local.toObject(),
					...patch,
				}));
		
				if (updated.length) {
					// console.log({ type: 'STATUSES_IMPORT', statuses: updated });
					dispatch({ type: 'STATUSES_IMPORT', statuses: updated });
				}
				
				resolve(true);
				
			});
		})) break;
	}
	
}

export async function maybeUpdateStatusReplyTo(mapping: LocalMapping, patch: Pick<Status, 'in_reply_to_id' | 'in_reply_to_account_id'>) {

	patchStatus(mapping.localId, patch);
	
	const store = await waitForReduxStore();
	for (let attempt = 0; attempt < 20; attempt++) {
		if (await new Promise<boolean>(resolve => {
			store?.dispatch((dispatch, getState) => {
				
				const status = getState().getIn(['statuses', mapping.localId]);
				// console.log(status.get('isLoading'), status);
				if (status.get('isLoading')) return setTimeout(() => resolve(false), 100);
				if (status.get('in_reply_to_id')) return resolve(true);
				
				const updated = {
					...status.toObject(),
					...patch,
				};
				dispatch({ type: 'STATUSES_IMPORT', statuses: [updated] });
				resolve(true);
				
			});
		})) break;
	}
	
}

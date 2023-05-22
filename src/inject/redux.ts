import { Maybe, RemoteMapping, StatusCounts } from '../types.js';
import { maybe, pick } from '../util.js';

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

export function getReduxStore() {
	return reduxStore;
}

export function cleanUpFakeStatuses(ids: { realId: string; fakeId: string }[]) {
	reduxStore?.dispatch((dispatch, getState) => {
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

export function updateRemoteStatusCounts(mapping: RemoteMapping, counts: StatusCounts) {
	const fakeId = `s:s:${mapping.remoteHost}:${mapping.remoteId}`;
	reduxStore?.dispatch((dispatch, getState) => {
		
		const localReal = maybe(mapping.localId, id => getState().getIn(['statuses', id]));
		const localFake = maybe(fakeId, id => getState().getIn(['statuses', id]));
		
		const updated = [localReal, localFake].filter(o => !!o).map(local => ({
			...local.toObject(),
			...pick(counts, ['replies_count', 'reblogs_count', 'favourites_count']),
		}));
		
		if (updated.length) {
			dispatch({ type: 'STATUSES_IMPORT', statuses: updated });
		}
		
	});
	
}

// @ts-nocheck

import { Maybe, RemoteMapping, StatusCounts } from '../types.js';
import { maybe, pick } from '../util.js';

interface ReduxStore {
	dispatch(arg: any): void;
	getState(): any;
}

let reduxStore: Maybe<ReduxStore> = null;

function findReduxStore(ctrEl: HTMLElement) {
	const ctrProp = Object.getOwnPropertyNames(ctrEl).find(s => s.match(/^__reactContainer.*\$.*/));
	const ctr = ctrEl[ctrProp];
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

export function observeForRedux() {
	
	const ctrEl = document.getElementById('mastodon');
	if (!ctrEl || !window.MutationObserver) return;
	
	const config = { attributes: true, childList: true, subtree: true };
	const started = Date.now();
	
	const callback = (mutationList, observer) => {
		if (!reduxStore) findReduxStore(ctrEl);
		if (reduxStore || Date.now() - started > 5000) observer.disconnect();
	};

	const observer = new MutationObserver(callback);
	observer.observe(ctrEl, config);

}

export function getReduxStore() {
	return reduxStore;
}

export function cleanUpFakeStatuses(ids: { realId: string; fakeId: string }[]) {
	reduxStore?.dispatch((dispatch, getState) => {
		const statuses = getState().get('statuses');
		ids.filter(pair => statuses.has(pair.realId) && statuses.has(pair.fakeId)).forEach(({ fakeId: id }) => store.dispatch({
			type: 'TIMELINE_DELETE',
			id,
			accountId: getState().getIn(['statuses', id, 'account']),
			references: getState().get('statuses').filter(status => status.get('reblog') === id).map(status => status.get(
				'id',
			)),
			reblogOf: getState().getIn(['statuses', id, 'reblog'], null),
		}));
	});
}

export async function updateRemoteStatus(mapping: RemoteMapping, counts: StatusCounts) {
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

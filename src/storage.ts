// Basic IndexedDB storage wrapper

import { DBSchema, IDBPDatabase, openDB } from 'idb/with-async-ittr';
import {
	AccountMapping,
	ContextResponse,
	InstanceInfo,
	isLocalMapping,
	LocalMapping,
	Maybe,
	RemoteMapping,
	StatusCounts,
	StatusMapping,
} from './types.js';

export interface Storage extends DBSchema {
	localStatusMapping: {
		key: string;
		value: LocalMapping<StatusMapping>;
	};
	remoteStatusMapping: {
		key: string;
		value: RemoteMapping<StatusMapping>;
	};
	remoteContextCache: {
		key: string;
		value: {
			key: string;
			fetched: number;
			context: ContextResponse;
		};
	};
	localStatusCounts: {
		key: string;
		value: StatusCounts;
	};
	instances: {
		key: string;
		value: InstanceInfo;
	};
	localAccountMapping: {
		key: string;
		value: LocalMapping<AccountMapping>;
	};
	remoteAccountMapping: {
		key: string;
		value: RemoteMapping<AccountMapping>;
	};
}

let db: IDBPDatabase<Storage>;
let dbLoaded: Maybe<Promise<IDBPDatabase<Storage>>> = null;

export async function initStorage() {
	dbLoaded = openDB<Storage>('substitoot', 5_00_02, {
		upgrade: async (db, v, _nv, tx) => {
		
			const now = Date.now();
		
			if (v < 3_00_00) db.createObjectStore('localStatusMapping', { keyPath: 'localReference' } );
			if (v < 3_00_00) db.createObjectStore('remoteStatusMapping', { keyPath: 'remoteReference' } );
			
			if (v < 3_00_01) db.createObjectStore('remoteContextCache', { keyPath: 'key' } );
			
			// screwed up previous release
			if (v < 4_00_00 && !db.objectStoreNames.contains('instances')) db.createObjectStore('instances', { keyPath: 'host' } );
			
			if (v < 4_01_02) db.createObjectStore('remoteAccountMapping', { keyPath: 'remoteReference' } );
			
			if (v < 4_03_00 && !db.objectStoreNames.contains('localAccountMapping')) db.createObjectStore('localAccountMapping', { keyPath: 'localReference' } );
			
			if (v < 4_03_04) for await (const entry of tx.objectStore('remoteAccountMapping').iterate()) {
				const { value } = entry;
				value.updated ??= now;
				value.remoteId = value.remoteId?.replace(/^@/, '');
				value.remoteReference = `${value.localHost}:${value.remoteHost}:${value.remoteId}`;
				await entry.delete();
				tx.objectStore('remoteAccountMapping').put(value);
				if (isLocalMapping(value)) {
					value.localReference = `${value.localHost}:${value.localId}`;
					tx.objectStore('localAccountMapping').put(value);
				}
			}
			
			if (v < 4_03_01) for (const store of ['localStatusMapping', 'remoteStatusMapping'] as const) for await (const entry of tx.objectStore(store).iterate()) {
				await entry.update({ ...entry.value, updated: now });
			}
			
			if (v < 5_00_02) db.createObjectStore('localStatusCounts', { keyPath: 'localReference' } );
			
		},
	});
	db = await dbLoaded;
}

export async function provideStorage() {
	if (!dbLoaded) await initStorage();
	await dbLoaded;
	return getStorage();
}

export function getStorage() {
	if (!db) throw new Error('Storage not ready');
	return db;
}

export async function clearCache() {
	await db.clear('remoteContextCache');
}

export async function clearMetadata() {
	await Promise.all(([
		'localStatusMapping',
		'remoteStatusMapping',
		'remoteContextCache',
		'instances',
	] as const).map(s => db.clear(s)));
}

// Basic IndexedDB storage wrapper

import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { InstanceInfo, Maybe, StatusUriTriple } from './types.js';
import { anyBrowser } from './browsers/any.js';

export interface Storage extends DBSchema {
	instances: {
		key: string;
		value: InstanceInfo;
	};
	instanceStatusUris: {
		key: string;
		value: StatusUriTriple & { key: string };
	};
}

let db: IDBPDatabase<Storage>;
let dbLoaded: Maybe<Promise<IDBPDatabase<Storage>>> = null;

const clearableStores = [
	'instances',
	'instanceStatusUris',
] as const;

export async function initStorage() {
	dbLoaded = openDB<Storage>('substitoot', 7_00_02, {
		upgrade: async (db, v, _nv, tx) => {
			console.log('ups?');
			
			if (v < 4_00_00 && !db.objectStoreNames.contains('instances')) db.createObjectStore('instances', { keyPath: 'host' } );
			
			if (v < 7_00_00) {
			
				for (const name of [
					'localAccountMapping',
					'localStatusMapping',
					'localStatusCounts',
					'remoteAccountMapping',
					'remoteStatusMapping',
					'remoteContextCache',
				] as any[]) {
					if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
				}
				
				if (!db.objectStoreNames.contains('instanceStatusUris')) db.createObjectStore('instanceStatusUris', { keyPath: 'uri' });
				
				for (const s of clearableStores) await tx.objectStore(s).clear();
				
			}
			
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

export async function clearMetadata() {
	for (const s of clearableStores) { await db.clear(s); }
}

let lastUpdated: Maybe<number>;
export async function getLastUpdated() {
	if (lastUpdated) return lastUpdated;
	lastUpdated = await anyBrowser.storage.local.get('lastUpdated').then(r => r.lastUpdated);
	return lastUpdated!;
}

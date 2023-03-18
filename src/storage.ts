import { DBSchema, IDBPDatabase, openDB } from 'idb/with-async-ittr';
import { ContextResponse, StatusMapping } from './types.js';

export interface Storage extends DBSchema {
	localStatusMapping: {
		key: string;
		value: StatusMapping;
	};
	remoteStatusMapping: {
		key: string;
		value: StatusMapping;
	};
	remoteContextCache: {
		key: string;
		value: {
			key: string;
			fetched: number;
			context: ContextResponse;
		};
	};
}

let db: IDBPDatabase<Storage>;

export async function initStorage() {
	db = await openDB<Storage>('substitoot', 3_00_01, {
		upgrade: (db, v) => {
			if (v < 3_00_00) db.createObjectStore('localStatusMapping', { keyPath: 'localReference' } );
			if (v < 3_00_00) db.createObjectStore('remoteStatusMapping', { keyPath: 'remoteReference' } );
			if (v < 3_00_01) db.createObjectStore('remoteContextCache', { keyPath: 'key' } );
		},
	});
}

export function getStorage() {
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
	] as const).map(s => db.clear(s)));
}

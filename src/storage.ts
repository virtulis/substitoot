import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { StatusMapping } from './types.js';

export interface Storage extends DBSchema {
	localStatusMapping: {
		key: string;
		value: StatusMapping;
	};
	remoteStatusMapping: {
		key: string;
		value: StatusMapping;
	};
}

let db: IDBPDatabase<Storage>;

export async function initStorage() {
	db = await openDB<Storage>('substitoot', 3_00_00, {
		upgrade: (db, v) => {
			if (v < 3_00_00) db.createObjectStore('localStatusMapping', { keyPath: 'localReference' } );
			if (v < 3_00_00) db.createObjectStore('remoteStatusMapping', { keyPath: 'remoteReference' } );
		},
	});
}

export function getStorage() {
	return db;
}

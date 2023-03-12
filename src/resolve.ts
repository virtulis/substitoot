interface Thing {
	id: string;
	url: string;
}

export interface Status extends Thing {
	uri: string;
	account?: Account;
	content: string;
	in_reply_to_id?: string;
	in_reply_to_account_id?: string;
}

export interface Account extends Thing {
	username?: string;
}

export interface StatusInfoRecord {
	hostname: string;
	id: string | null;
	account: string | null;
}

export const statusInfoCache = new Map<string, StatusInfoRecord>();
export const statusInfoAwaiters = new Map<string, Array<(s: StatusInfoRecord) => void>>();
export const getStatusRecord = async (key: string) => {
	return statusInfoCache.get(key) ?? await new Promise<StatusInfoRecord | null>(resolve => {
		
		const queue = statusInfoAwaiters.get(key);
		
		if (queue) queue.push(resolve);
		else statusInfoAwaiters.set(key, [resolve]);
		
		setTimeout(() => resolve(null), 1_000);
		setTimeout(() => statusInfoAwaiters.delete(key), 60_000);
		
	});
};
export const contextLists = ['ancestors', 'descendants'] as const;
export const remapIdFields = ['in_reply_to_id', 'in_reply_to_account_id'] as const;

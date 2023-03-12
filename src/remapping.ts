import * as DOMPurify from 'dompurify';
import { Account, ContextResponse, Status, StatusInfoRecord } from './types.js';

import { fetchRemoteStatusOnServer } from './fetch';

export const contextLists = ['ancestors', 'descendants'] as const;
export const remapIdFields = ['in_reply_to_id', 'in_reply_to_account_id'] as const;
export const remoteToLocalCache = new Map<string, string | null | Promise<string | null>>();

export async function mergeContextResponses({ localId, localURL, record, localResponse, remoteResponse }: {
	localId: string;
	localURL: URL;
	record: StatusInfoRecord;
	localResponse: ContextResponse;
	remoteResponse: ContextResponse;
}) {
	
	const local = new Map<string, Status>;
	const accounts = new Map<string, Account>;
	const remapIds = new Map<string, string>;
	
	for (const list of contextLists) for (const status of localResponse[list] as Status[]) {
		const { uri, account } = status;
		local.set(uri, status);
		if (account) accounts.set(account.url, account);
	}
	
	remapIds.set(record.id!, localId);
	
	for (const list of contextLists) for (const status of remoteResponse[list] as Status[]) {
		
		const { uri, account } = status;
		
		if (local.has(uri)) {
			console.log('got status', uri);
			remapIds.set(status.id, local.get(uri)!.id);
			continue;
		}
		
		const parsed = new URL(uri);
		if (parsed.hostname == localURL.hostname) {
			const match = localURL.pathname.match(/\/statuses\/([^/]+)$/);
			const localId = match?.[1];
			console.log('local status', localId, uri);
			if (localId) remapIds.set(status.id, localId);
		}
		else {
			const origId = status.id;
			status.id = `stt:s:${parsed.hostname}:${encodeURIComponent(parsed.pathname.slice(1))}`;
			remapIds.set(origId, status.id);
		}
		
		const accKey = account?.url;
		if (accKey && accounts.has(accKey)) {
			status.account = accounts.get(accKey);
			console.log('got acct', accKey);
		}
		else if (accKey) {
			const accUrl = new URL(account.url);
			account.id = `stt:a:${accUrl.hostname}:${encodeURIComponent(accUrl.pathname.slice(1))}`;
			accounts.set(accKey, account);
			console.log('new acct', accKey);
		}
		
		status.content = DOMPurify.sanitize(status.content);
		
		console.log('new status', uri, status.id);
		localResponse[list].push(status);
		
	}
	
	for (const list of contextLists) for (const status of localResponse[list] as Status[]) {
		for (const key of remapIdFields) {
			const orig = status[key];
			if (orig && remapIds.has(orig)) status[key] = remapIds.get(orig);
		}
	}
	
	return localResponse;

}

export async function getRedirFromNav(url: string) {
	
	const { hostname, pathname } = new URL(url);
	const match = pathname.match(/\/stt:s:([^:]+):([^:]+)(.*?)$/);
	if (!match) return null;
	
	const [refHost, refPath] = [...match].slice(1);
	const ref = `https://${refHost}/${decodeURIComponent(refPath)}`;
	
	const id = await fetchRemoteStatusOnServer(hostname, ref);
	if (!id) return null;
	
	return `https://${hostname}/${pathname.split('/')[1]}/${id}`;
	
}

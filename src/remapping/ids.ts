// Telling apart fake IDs from real IDs and not-IDs-at-all

import { MappingData, Maybe } from '../types.js';

export function parseId(localHost: string, id: string): Maybe<MappingData> {
	const match = id.match(/^s:(.):([^:/]+):([^:/]+)$/);
	if (!match && !id.match(/^\d+$/)) return null; // TODO Pleroma/Akkoma?
	if (!match) return {
		localHost,
		localId: id,
		remoteHost: null,
		remoteId: null,
	};
	return {
		type: match[1],
		localHost,
		localId: null,
		remoteHost: match[2],
		remoteId: decodeURIComponent(match[3]).replace(/^@/, ''),
	};
}

export const contextLists = ['ancestors', 'descendants'] as const;
export const remapIdFields = ['in_reply_to_id', 'in_reply_to_account_id'] as const;

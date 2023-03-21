export type None = undefined | null;
export type Maybe<T> = T | None;
export type Some<T> = NonNullable<T>;

export interface Thing {
	id: string;
	url: string;
}

export interface Status extends Thing {
	uri: string;
	account?: Maybe<Account>;
	content: string;
	in_reply_to_id?: Maybe<string>;
	in_reply_to_account_id?: Maybe<string>;
}

export interface Account extends Thing {
	username?: Maybe<string>;
	acct?: Maybe<string>;
}

export interface MappingData {
	type?: Maybe<'s' | 'a' | string>;
	localHost: string;
	localId?: Maybe<string>;
	remoteHost?: Maybe<string>;
	remoteId?: Maybe<string>;
}
export interface Mapping extends MappingData {
	
	/**
	 * localHost:localId
	 */
	localReference: Maybe<string>;
	
	/**
	 * localHost:remoteHost:remoteId
	 *
	 * Used to look up existing local status (if any) by localHost and the remote reference.
	 */
	remoteReference: Maybe<string>;
	
}
export interface StatusMapping extends Mapping {
	uri?: string;
	username?: Maybe<string>;
}

export type LocalMapping<T extends MappingData = MappingData> = T & { localId: string };
export type RemoteMapping<T extends MappingData = MappingData> = T & { remoteId: string; remoteHost: string };
export type FullMapping<T extends MappingData = MappingData> = LocalMapping<RemoteMapping<T>>;

export function isLocalMapping<T extends MappingData>(it: Maybe<T>): it is LocalMapping<T> {
	return !!it?.localId;
}
export function isRemoteMapping<T extends MappingData>(it: Maybe<T>): it is RemoteMapping<T> {
	return !!it?.remoteHost && !!it?.remoteId;
}
export function isFullMapping<T extends MappingData>(it: Maybe<T>): it is FullMapping<T> {
	return isLocalMapping(it) && isRemoteMapping(it);
}

export interface ContextResponse {
	ancestors: Status[];
	descendants: Status[];
}

export interface InstanceInfo {
	host: string;
	checked?: Maybe<number>;
	isMastodon?: Maybe<boolean>;
	software?: Maybe<string>;
	version?: Maybe<string>;
	lastRequest?: Maybe<number>; // timestamp
	anyRequestSucceeded?: Maybe<boolean>;
	lastRequestSucceeded?: Maybe<boolean>;
	lastErrorCode?: Maybe<number>;
	canRequestContext?: Maybe<boolean>;
}

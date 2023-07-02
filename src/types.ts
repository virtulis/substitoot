// Type definitions.


/*

The meaning of "local" vs "remote" can be quite mind-bending.

Everywhere in the extension "local" and "remote" is used from the perspective of the specific instance. In case of Mastodon each instance has its own ID for each entity known to it, local or remote, so we need to be able to determine the existing mapping between the two.

So "local" means "local to an instance". For example *every* status gets a localStatusMapping entry *for its instance*.
If it's not a home instance status, but it's known on the home instance it will get *two* entries - one for home instance with its ID, one for the *original* instance with the original ID.

Remote mappings are always a tuple of (local instance, remote instance, remote ID). This is used to resolve existing mappings on the "local" instance for the "remote" instance, so when we get a status from a remote instance we can substitute the (real) local IDs in right away.

I.e. if on home "A" we fetch context for "j" from "B" (where it's known as "k") which returns a reply "l" originating from "C", we'll add/update these mappings:

A:j -> B:k
B:k
C:l
A:B:k -> A:j
A:C:l -> ?

If user then clicks on the injected C:l toot (that will have a fake ID like "s:s:C:l"), the extension will attempt to fetch it via the search API. If that succeeds, A will assign it a new ID "m" and we'll add:

A:m -> C:l
A:C:l -> A:m

This looked way easier when I started.

 */

export type None = undefined | null;
export type Maybe<T> = T | None;
export type Some<T> = NonNullable<T>;

export interface Thing {
	id: string;
	url: string;
}

export interface Status extends Thing {

	uri: string;
	account: Account;
	content: string;
	created_at: string;
	in_reply_to_id?: Maybe<string>;
	in_reply_to_account_id?: Maybe<string>;
	
	application?: Maybe<{ name?: Maybe<string> }>;
	
	reblog?: Maybe<Status>;
	
	replies_count?: number;
	reblogs_count?: number;
	favourites_count?: number;
	
	substitoot_fake_id?: Maybe<string>;
	
}

export interface StatusCounts {
	updated: number;
	localReference: string;
	replies_count?: number;
	reblogs_count?: number;
	favourites_count?: number;
}

export interface Account extends Thing {
	username?: Maybe<string>;
	acct: string;
}

export interface MappingData {
	type?: Maybe<'s' | 'a' | string>;
	uri?: string;
	localHost: string;
	localId?: Maybe<string>;
	remoteHost?: Maybe<string>;
	remoteId?: Maybe<string>;
	actualId?: Maybe<string>;
}
export interface Mapping extends MappingData {

	updated: number;
	
	/**
	 * localHost:localId
	 */
	localReference?: Maybe<string>;
	
	/**
	 * localHost:remoteHost:remoteId
	 *
	 * Used to look up existing local status (if any) by localHost and the remote reference.
	 */
	remoteReference?: Maybe<string>;
	
}
export interface StatusMapping extends Mapping {
	username?: Maybe<string>;
	reblog?: Maybe<StatusMapping>;
}
export interface AccountMapping extends Mapping {
	followedSince?: Maybe<number>;
}

export type LocalMapping<T extends MappingData = MappingData> = T & { localId: string } & (T extends Mapping ? { localReference: string } : {});
export type RemoteMapping<T extends MappingData = MappingData> = T & { remoteId: string; remoteHost: string } & (T extends Mapping ? { remoteReference: string } : {});
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
	isCompatible?: Maybe<boolean>;
	software?: Maybe<string>;
	version?: Maybe<string>;
	lastRequest?: Maybe<number>; // timestamp
	anyRequestSucceeded?: Maybe<boolean>;
	lastRequestSucceeded?: Maybe<boolean>;
	lastErrorCode?: Maybe<number>;
	canRequestContext?: Maybe<boolean>;
}

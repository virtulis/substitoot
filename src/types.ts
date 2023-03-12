import { doFetch } from './requests';

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

import type { API, APIMethod } from './impl.js';
import { Maybe } from '../types.js';

export type { API, APIMethod } from './impl.js';

export interface APIRequest<K extends APIMethod = APIMethod> {
	id: number;
	method: K;
	arguments: Parameters<API[K]>;
}

export interface APIResponse<K extends APIMethod = APIMethod> {
	id: number;
	error?: Maybe<string>;
	result?: Maybe<Awaited<ReturnType<API[K]>>>;
}

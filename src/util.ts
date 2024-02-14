import { version } from '../package.json';
import { Maybe, None, Some } from './types.js';

export const packageVersion: string = version;
export const intVersion = version.split('.').slice(0, 3).reduce((a, n) => a + Number(n) * 100, 0);

type MaybeCB<A, B> = (it: Some<A>) => B;

export function isNone(it: any): it is None {
	return it === null || it === undefined;
}

export function isSome<T>(it: T): it is Some<T> {
	return it !== null && it !== undefined;
}

export function maybe<IT, RT>(it: IT, action: MaybeCB<IT, RT>): RT | Extract<IT, null | undefined> {
	if (!isSome(it)) return it as Extract<IT, null | undefined>;
	return action(it);
}

export function pick<T, K extends keyof T>(obj: T, ...keys: readonly (K | readonly K[])[]): Pick<T, K> {
	const out: any = {};
	for (const k of keys.flat(1) as K[]) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
	return out;
}

export function omit<T, K extends keyof T>(obj: T, ...keys: readonly (K | readonly K[])[]): Omit<T, K> {
	const out: any = {};
	const flat = keys.flat(1);
	for (const k in obj) if (!flat.includes(k as any)) out[k] = obj[k];
	return out;
}

/**
 * Checks whether value is an element of the list and asserts that the value is of the element-type for that list.
 * E.g. if (isIn(value, ['a', 'b'] as const)) then value: 'a' | 'b'
 */
export function isIn<V, const T extends readonly (V | string | number)[]>(value: V, list: T): value is V & T[number] {
	return list.includes(value);
}

export function sleep<T>(ms: number, value: T): Promise<T>;
export function sleep(ms: number): Promise<null>;
export function sleep(ms: number, value = null) {
	return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export const reportAndNull = (e: any) => {
	console.error(e);
	return null;
};

export class ActiveRequestMap<T> {

	static nextId = 1;

	map = new Map<string, { id: number; promise: Promise<Maybe<T>> }>;
	timeout: () => Maybe<number>;
	
	constructor({ timeout }: { timeout: () => Maybe<number> }) {
		this.timeout = timeout;
	}
	
	private wrapAndAdd(
		key: string,
		id: number,
		promise: Promise<Maybe<T>>,
		timeout: Maybe<number>,
	) {
		const wrapped = (timeout ? Promise.race([promise, sleep(timeout)]) : promise)
			.finally(() => this.map.delete(key));
		this.map.set(key, { id, promise: wrapped });
		return wrapped;
	}
	
	add(
		key: string,
		promise: Promise<Maybe<T>>,
		timeout = this.timeout()
	) {
		if (this.map.has(key)) throw new Error(`Request already active: ${key}`);
		return this.wrapAndAdd(key, ActiveRequestMap.nextId++, promise, timeout);
	}
	
	get(key: string) {
		return this.map.get(key)?.promise;
	}
	
	perform(
		key: string,
		action: (isActive: () => boolean) => Promise<Maybe<T>>,
		timeout = this.timeout()
	) {
		const active = this.map.get(key);
		if (active) return active.promise;
		const id = ActiveRequestMap.nextId++;
		const promise = action(() => this.map.get(key)?.id == id).catch(reportAndNull);
		return this.wrapAndAdd(key, id, promise, timeout);
	}

}

export function decideRequestDelay(res: Response, min = 100, max = 5000) {
	const limit = Number(res.headers.get('x-ratelimit-remaining')) - 5;
	const now = new Date(res.headers.get('date')!);
	const until = new Date(res.headers.get('x-ratelimit-reset')!);
	const diff = until.getTime() - now.getTime();
	const delay = Math.min(max, Math.max(min, diff / limit));
	console.log('delay = ', delay, { limit, now, until, diff });
	return delay;
}

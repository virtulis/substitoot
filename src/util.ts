export function sleep<T>(ms: number, value: T): Promise<T>;
export function sleep(ms: number): Promise<null>;
export function sleep(ms: number, value = null) {
	return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export const reportAndNull = (e: any) => {
	console.error(e);
	return null;
};

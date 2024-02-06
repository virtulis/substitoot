import { Maybe } from '../types.js';

let toast: HTMLElement;
let dot: HTMLElement;
let text: HTMLElement;
let cancelPrevious: Maybe<() => any> = null;

export function showToast(cancel: () => any) {
	cancelPrevious?.();
	cancelPrevious = cancel;
	toast.classList.add('substitoast--visible');
	const hide = () => {
		if (cancelPrevious == cancel) toast.classList.remove('substitoast--visible');
	};
	return { toast, dot, text, hide };
}

export function cancelToast() {
	cancelPrevious?.();
	cancelPrevious = null;
	toast.classList.remove('substitoast--visible');
}

export function injectToast() {

	toast = document.createElement('div');
	toast.className = 'substitoast';
	
	dot = document.createElement('div');
	dot.className = 'substitoast__dot';
	toast.appendChild(dot);
	
	text = document.createElement('div');
	toast.appendChild(text);
	
	document.body.appendChild(toast);
	
}

export const toastColors = {
	init: '#999',
	initMore: '#aaa',
	success: '#3c3',
	localSuccess: '#cc9',
	partSuccess: '#9a0',
	inProgress: '#dd0',
	partFailed: '#e90',
	failed: '#c66',
};

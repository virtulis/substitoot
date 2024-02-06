// This script is injected into the page (in the page context!)
// It wraps all XHR requests and calls the background script via the function provided by content.ts

import { wrapWebSocket, wrapXHR } from './inject/xhr.js';
import { wrapHistory } from './inject/navigation.js';
import { injectToast } from './inject/toast.js';

wrapXHR();
wrapWebSocket();
wrapHistory();
injectToast();

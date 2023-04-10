// This script is injected into the page (in the page context!)
// It wraps all XHR requests and calls the background script via the function provided by content.ts

import { wrapXHR } from './inject/xhr.js';
import { observeForRedux } from './inject/redux.js';
import { maybeFixOnLoad } from './inject/navigation.js';

wrapXHR();
observeForRedux();
maybeFixOnLoad();

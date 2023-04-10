export const maybeFirefox = (typeof browser == 'object' ? browser : null);
export const maybeChrome = (typeof chrome == 'object' ? chrome : null);
export const anyBrowser = (typeof browser == 'object' ? browser : chrome) as (typeof chrome | typeof browser);
export const asFirefox = (typeof browser == 'object' ? browser : chrome) as (typeof browser);
export const asChrome = (typeof browser == 'object' ? browser : chrome) as (typeof chrome);

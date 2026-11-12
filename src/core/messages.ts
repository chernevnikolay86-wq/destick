// Message protocol between content script, service worker and options page.
import type { EngineStatus } from './types';

/** content script → service worker */
export type ContentToSw =
  | { ks: 'hello'; origin: string }
  | { ks: 'badge'; status: EngineStatus };

/** service worker → content script */
export type SwToContent =
  | { ks: 'toggle' }
  | { ks: 'pick' }
  | { ks: 'whoami' }
  | { ks: 'getState' }
  | { ks: 'timings' };

/** options page → service worker */
export type OptionsToSw =
  | { ks: 'getRegistry' }
  | { ks: 'focusAndPick'; tabId: number; windowId: number };

export interface WhoamiResponse {
  supported: boolean;
  origin: string;
  state: EngineStatus['state'];
}

export interface RegistryEntry {
  tabId: number;
  windowId: number;
  origin: string;
}

export const STORAGE_PREFIX = 'site:';

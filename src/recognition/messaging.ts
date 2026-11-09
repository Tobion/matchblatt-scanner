import type { RecognitionInput, RecognitionResult } from './claude';

/**
 * Recognition requests go from the content script to the background script
 * through a long-lived port: requests from the click-tt page itself would be
 * CORS requests, and the open port keeps Chrome's service worker alive.
 */
export const RECOGNITION_PORT = 'recognize';
export const KEEP_ALIVE_INTERVAL_MS = 10_000;

export type PortRequest = { type: 'recognize'; input: RecognitionInput } | { type: 'ping' };

export type PortResponse = { type: 'result'; result: RecognitionResult } | { type: 'error'; message: string };

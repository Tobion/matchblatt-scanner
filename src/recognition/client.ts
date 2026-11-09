import { browser } from 'wxt/browser';
import type { RecognitionInput, RecognitionResult } from './claude';
import { RecognitionError } from './errors';
import { KEEP_ALIVE_INTERVAL_MS, RECOGNITION_PORT, type PortRequest, type PortResponse } from './messaging';

/** Content-script side: asks the background script to recognize a sheet. */
export function requestRecognition(input: RecognitionInput): Promise<RecognitionResult> {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: RECOGNITION_PORT });
    const keepAlive = setInterval(() => port.postMessage({ type: 'ping' } satisfies PortRequest), KEEP_ALIVE_INTERVAL_MS);
    const finish = () => {
      clearInterval(keepAlive);
      port.disconnect();
    };

    port.onMessage.addListener((message: unknown) => {
      const response = message as PortResponse;
      finish();
      if (response.type === 'result') resolve(response.result);
      else reject(new RecognitionError(response.message));
    });
    port.onDisconnect.addListener(() => {
      clearInterval(keepAlive);
      reject(new RecognitionError('Die Verbindung zur Erweiterung wurde unterbrochen. Bitte nochmals versuchen.'));
    });
    port.postMessage({ type: 'recognize', input } satisfies PortRequest);
  });
}

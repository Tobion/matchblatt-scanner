import { defineBackground } from 'wxt/utils/define-background';
import { browser, type Browser } from 'wxt/browser';
import { recognizeSheet } from '../src/recognition/claude';
import { RECOGNITION_PORT, type PortRequest, type PortResponse } from '../src/recognition/messaging';
import { loadSettings } from '../src/settings';

export default defineBackground(() => {
  // Content scripts cannot open the options page themselves.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string } | null)?.type === 'openOptions') {
      void browser.runtime.openOptionsPage();
    }
  });

  // Toolbar icon opens the settings.
  (browser.action ?? browser.browserAction).onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== RECOGNITION_PORT) return;
    port.onMessage.addListener((message: unknown) => {
      const request = message as PortRequest;
      if (request.type === 'recognize') void handleRecognition(port, request.input);
      // 'ping' messages only keep the service worker alive.
    });
  });
});

async function handleRecognition(
  port: Browser.runtime.Port,
  input: Extract<PortRequest, { type: 'recognize' }>['input'],
): Promise<void> {
  let response: PortResponse;
  try {
    const settings = await loadSettings();
    const result = await recognizeSheet(input, {
      apiKey: settings.apiKey,
      model: settings.model,
      effort: settings.effort,
    });
    response = { type: 'result', result };
  } catch (error) {
    response = { type: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  try {
    port.postMessage(response);
  } catch {
    // The page was closed or reloaded in the meantime.
  }
}

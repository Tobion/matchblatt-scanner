import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';

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
});

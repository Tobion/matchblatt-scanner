import { defineConfig } from 'wxt';

export default defineConfig({
  // Browsers are started manually (WSL cannot launch the Windows browser).
  webExt: { disabled: true },
  manifest: {
    name: 'Matchblatt-Scanner',
    description:
      'Matchblatt fotografieren – Aufstellung und Resultate der Tischtennis-Mannschaftsmeisterschaft automatisch in click-tt erfassen.',
    permissions: ['storage'],
    host_permissions: ['https://api.anthropic.com/*'],
    action: { default_title: 'Matchblatt-Scanner – Einstellungen' },
    browser_specific_settings: {
      gecko: { id: 'matchblatt-scanner@matchblatt-scanner', data_collection_permissions: { required: ['none'] } },
    },
  },
  hooks: {
    // Development builds also run on the saved click-tt pages served from localhost.
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.mode !== 'development') return;
      for (const script of manifest.content_scripts ?? []) {
        script.matches = [...(script.matches ?? []), 'http://localhost/*', 'http://127.0.0.1/*'];
      }
    },
  },
});

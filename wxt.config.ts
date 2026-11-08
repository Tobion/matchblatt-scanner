import { defineConfig } from 'wxt';

export default defineConfig({
  // Browsers are started manually (WSL cannot launch the Windows browser).
  webExt: { disabled: true },
  manifest: {
    name: 'Matchblatt-Foto für click-tt',
    description:
      'Liest ein Foto des Tischtennis-Matchblatts (Mannschaftsmeisterschaft) und trägt Aufstellung und Resultate in click-tt ein.',
    permissions: ['storage'],
    host_permissions: ['https://api.anthropic.com/*'],
    action: { default_title: 'Matchblatt-Foto – Einstellungen' },
    browser_specific_settings: {
      gecko: { id: 'matchblatt-foto@tt-foto-matcherfassung', data_collection_permissions: { required: ['none'] } },
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

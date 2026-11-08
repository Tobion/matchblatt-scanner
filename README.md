# Matchblatt-Foto für click-tt

Browser-Erweiterung (Chrome, Edge, Firefox): Foto des ausgefüllten Matchblatts der Mannschaftsmeisterschaft
auswählen → Aufstellung und Satzresultate werden automatisch in click-tt eingetragen. Prüfen und bestätigen
macht der Captain selbst.

- Erkennung durch Claude (Anthropic) mit **eigenem API-Key**; das Foto geht direkt vom Browser an die API,
  es gibt keinen Server.
- Nicht eindeutig erkannte Spieler oder Resultate werden auf der click-tt-Seite rot markiert.
- Zuordnungen „Name auf dem Matchblatt → click-tt-Spieler“ werden lokal gelernt.

Details zu Konzept und Aufbau: [PLAN.md](PLAN.md).

## Entwicklung

Voraussetzung: Node.js ≥ 22. In dieser WSL-Umgebung liegt Node unter `~/.local/opt/node`:

```bash
export PATH="$HOME/.local/opt/node/bin:$PATH"   # z.B. in ~/.bashrc eintragen
npm install
```

| Befehl | Zweck |
|---|---|
| `npm test` | Unit-Tests und DOM-Tests gegen die gespeicherten click-tt-Seiten (`fixtures/`) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run build` / `npm run build:firefox` | Produktions-Build nach `.output/chrome-mv3` bzw. `.output/firefox-mv2` |
| `npm run build:dev` / `npm run build:dev:firefox` | Entwicklungs-Build, läuft zusätzlich auf `localhost` |
| `npm run serve:fixtures` | Gespeicherte click-tt-Seiten unter http://localhost:8080 |
| `npm run recognize -- <foto> --expect <json>` | Erkennung eines Fotos auf der Kommandozeile testen |
| `npm run zip` / `npm run zip:firefox` | Paket für Chrome Web Store / addons.mozilla.org |

### Erkennung testen (ohne Browser)

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run recognize -- fixtures/example_filled_matchresult.jpg \
  --expect test/data/example-sheet.json
```

Zeigt Dauer, Token-Verbrauch, Plausibilitätsprobleme und Abweichungen zur manuellen Abschrift. Optionen:
`--model claude-sonnet-5-5`, `--effort low|medium|high`, `--rosters kader.json`. Das Ergebnis landet in
`scripts/out/` (nicht im Git, enthält Namen).

### Erweiterung im Browser laden

Der Build-Ordner liegt in WSL; Windows erreicht ihn z.B. über
`\\wsl$\Ubuntu\home\tobion\tt-foto-matcherfassung\.output\chrome-mv3`.

**Chrome/Edge:** `chrome://extensions` → Entwicklermodus ein → „Entpackte Erweiterung laden“ → Build-Ordner
wählen. Nach jedem neuen Build bei der Erweiterung auf ↻ klicken und die Seite neu laden.

**Firefox:** `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden…“ → `manifest.json` im
Ordner `.output/firefox-mv2` wählen (bleibt bis zum Neustart von Firefox).

Danach auf das Symbol der Erweiterung klicken und den Claude-API-Key eintragen.

### Sicher ausprobieren

1. **Lokal:** `npm run build:dev` + `npm run serve:fixtures`, den Ordner `.output/chrome-mv3-dev` laden und
   http://localhost:8080 öffnen. Abschicken („Weiter“, „Löschen“) erreicht dort nie click-tt.
2. **click-tt, ohne zu speichern:** Begegnung „erfassen“, Foto einlesen, Schritte 1 und 2 durchlaufen lassen,
   in Schritt 3 vergleichen und **Abbrechen** klicken.
3. **Erste echte Erfassung**, dann den Spielbericht mit dem Papier vergleichen.

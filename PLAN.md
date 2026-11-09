# Plan: Matchblatt-Scanner – Matchblatt-Foto → click-tt (Browser-Erweiterung)

## Context
Resultate der Mannschaftsmeisterschaft werden auf Papier (Matchblatt) festgehalten und danach vom Heim-Captain manuell in click-tt.ch übertragen: Spieleraufstellung (Positionen A/B/C, X/Y/Z, Doppel) und alle Sätze der 10 Spiele. Ziel: Foto auswählen → Daten werden erkannt, geprüft und automatisch in die click-tt-Formulare eingetragen. Das Tool soll für alle interessierten Captains nutzbar sein, **ohne eigenen Server** (Datenschutz).

Entscheide (mit User geklärt):
- **Browser-Erweiterung** (WebExtension Manifest V3) für **Chrome + Firefox** (läuft auch in Edge/Brave).
- Erkennung über **Claude Vision API mit eigenem API-Key** des Nutzers; Foto geht direkt Browser → Anthropic, kein Server von uns. Lokaler Modus evtl. später.
- Login und Auswahl der Begegnung macht der Nutzer selbst; die finale Bestätigung (Schritt 3 „Kontrolle“) klickt der Nutzer immer selbst.
- **Keine separate Review-Phase in der Erweiterung**: Daten werden direkt bestmöglich in click-tt eingetragen; das click-tt-Formular selbst ist die Review. Nur nicht zuordenbare/unsichere Werte werden **direkt auf der click-tt-Seite markiert**.

## Erkenntnisse aus den Beispielen
- Matchblatt (`example_filled_matchresult.jpg`): Heim A/B/C, Gast X/Y/Z, je 2 Doppelspieler (meist als Positionsbuchstaben, z.B. A+C / X+Z; es können aber auch Spieler sein, die nur Doppel spielen – auch gemischt mit einem Einzelspieler. Diese werden in Schritt 1 zusätzlich eingefügt, ohne Einzelposition, nur mit Doppel-Markierung). 10 Spiele in fixer Reihenfolge: A‑X, B‑Y, C‑Z, B‑X, A‑Z, C‑Y, Doppel, B‑Z, C‑X, A‑Y. Bis 5 Sätze, Format `11:5`, Verlängerung (`18:16`). Spalten Sieger, Sätze, Punkte, Total.
- Stolpersteine: nur (Spitz-)Vornamen, durchgestrichene Korrekturen (Y „OLI“→„FABIAN“), „w.o.“ ohne Satzresultate, fehlende Lizenznummern.
- click-tt Schritt 1 „Mannschaftsaufstellung“ (`click-tt-single-match-report-part-1.png`): pro Team Stammspieler vorausgewählt (Rang, „Nachname, Vorname“, Klassierung), Dropdowns *Einzel* (Position) und *Doppel*, Löschen-Checkbox, Liste weiterer Spieler + „<< Einfügen“.
- click-tt Schritt 2 „Erfassung“ (`…-part-2.png`): Spielende (Uhrzeit), „Sieger wegen Nichtantretens“, pro Spiel Spieler-Dropdowns (Doppel: 2 pro Team), wo/ret-Dropdown pro Seite (Markierung beim Verlierer/Aufgebenden), 5 Satzfelder `0:0`; Bemerkungen-Radios + Textfeld.
- Gleiche Spielreihenfolge in Blatt und click-tt → direkte 1:1-Abbildung.

## Architektur
```
extension/
  manifest.json            # MV3; host_permissions: click-tt.ch, api.anthropic.com
  src/content/             # Content-Script auf Ergebniserfassungs-Seiten
    detect-step.ts         # erkennt Schritt 1 / 2 / 3 anhand DOM
    read-roster.ts         # liest Spieler (aufgestellt + Liste) beider Teams aus Schritt 1
    fill-lineup.ts         # Schritt 1: Zustandsmaschine löschen → einfügen → Positionen/Doppel → Weiter
    fill-results.ts        # Schritt 2: Spieler-Dropdowns prüfen, Sätze, wo/ret, Spielende
    launcher.ts            # Knopf „Foto einlesen…“ + Statuszeile (Shadow DOM), kein Review-UI
    highlight.ts           # markiert unsichere/fehlende Felder auf der click-tt-Seite (Rahmen + Hinweistext)
  src/recognition/
    claude.ts              # API-Call (fetch, Header anthropic-dangerous-direct-browser-access)
    schema.ts              # JSON-Schema des Matchblatts (structured output / tool use)
    prompt.ts              # Prompt inkl. Regeln (Durchstreichungen, w.o., Reihenfolge)
    image.ts               # Verkleinern/Komprimieren (Canvas, ~2000px lange Seite, JPEG), EXIF-Rotation
  src/domain/
    model.ts               # Typen: MatchSheet, Game, SetScore, Lineup
    validate.ts            # Plausibilitätsprüfungen
    match-names.ts         # Vorname ↔ click-tt-Spieler (fuzzy + gespeicherte Zuordnungen)
  src/options/             # Einstellungen: API-Key, Modell, Datenschutzhinweis
  test/                    # Vitest-Unit-Tests + gespeicherte click-tt-HTML-Fixtures
```
Stack (entschieden: TypeScript statt JS/Rust): TypeScript, Vite + WXT (oder `vite-plugin-web-extension`) für Chrome/Firefox-Builds, Vitest, kein UI-Framework nötig (oder Preact, klein).

## Ablauf für den Nutzer
1. In click-tt einloggen, Begegnung „erfassen“ wählen → Schritt 1.
2. Knopf der Erweiterung auf der Seite: „Foto einlesen…“ → Datei wählen.
3. Erweiterung liest **zuerst die Kader beider Teams aus der Seite** (aufgestellt + Auswahlliste) und schickt Foto + Kandidatennamen an Claude → strukturiertes JSON → lokale Validierung + Namenszuordnung.
4. **Schritt 1 direkt ausfüllen**: löschen/einfügen, Positionen, Doppel.
   - Alles eindeutig → automatisch „Weiter“.
   - Spieler nicht zuordenbar → **anhalten**, betroffene Zeile/Auswahlliste markieren mit Hinweis („Matchblatt: ‚Dane‘ auf Position A – nicht gefunden“). Nutzer korrigiert selbst und klickt „Weiter“; die Erweiterung setzt in Schritt 2 fort.
5. **Schritt 2 direkt ausfüllen**: Sätze, wo/ret. Unsichere oder unplausible Werte (Validierung schlägt fehl, Modell unsicher) werden markiert; ungültige Sätze werden nicht eingetragen (sonst `alert()` der Seite), sondern als leeres, markiertes Feld mit gelesenem Wert als Hinweis. Kein automatisches Abschicken.
6. Statuszeile oben: „10 Spiele eingetragen, 2 Felder markiert – bitte prüfen“.
7. Nutzer prüft im click-tt-Formular, klickt „Weiter“, kontrolliert Schritt 3 und bestätigt selbst.
8. Lernen: Beim Verlassen von Schritt 2 werden die tatsächlich gewählten Spieler gelesen und die Zuordnung „Name auf Matchblatt → click-tt-Spieler“ lokal gespeichert (auch manuelle Korrekturen).

## Erkennung (Claude)
- Modell in den Einstellungen wählbar: Default Claude Sonnet 5.5 (am Beispielfoto fehlerfrei wie Opus, halb so teuer, schneller), alternativ Opus 5.5 / Haiku 5.5 (Haiku las zwei Sätze falsch, ohne sie als unsicher zu markieren); Gründlichkeit (effort) low/medium/high, Default medium. Offizielles SDK `@anthropic-ai/sdk` mit `dangerouslyAllowBrowser`, Structured Outputs (`betaZodOutputFormat`) und serverseitigem Refusal-Fallback (`fallbacks: "default"`).
- Der API-Aufruf läuft im Hintergrund-Script (Service-Worker), das Content-Script schickt Foto und Kader über einen Port mit Pings (hält den Service-Worker am Leben). Anthropic behandelt jede Anfrage aus dem Browser (auch aus Erweiterungen) als CORS-Anfrage; sie braucht den Header `anthropic-dangerous-direct-browser-access`. Organisationen mit eigener Datenaufbewahrung (z.B. Zero Data Retention) lässt Anthropic dafür nicht zu → klare Fehlermeldung, Nutzer braucht einen Key aus einer anderen Organisation. Diese Regel wird bewusst nicht umgangen.
- Ausgabe-Schema: `home/guest {team, players:{A,B,C}|{X,Y,Z} (gelesener Name, crossedOut[]), doubles:[pos,pos]}`, `games[10] {sets:[{home,guest}|null]×5, walkover?:'home'|'guest', retired?, winnerText, setsWon}`, `total`, `confidence` pro Feld, `notes`.
- Kandidatennamen aus click-tt im Prompt → Modell darf zuordnen, finale Zuordnung trotzdem lokal validiert.
- Nur gültiges JSON akzeptieren, bei Schemafehler einmal retry.

## Validierung (`validate.ts`) – Kern der Zuverlässigkeit
- Satz gültig: Sieger ≥11, bei >11 Differenz genau 2; sonst Differenz ≥2.
- Spiel: genau 3 Gewinnsätze, keine Sätze nach Entscheidung; Abgleich mit Spalte „Sätze“ und „Sieger“-Name.
- Total = Summe Punkte; Siegermannschaft konsistent.
- Doppel: je 2 verschiedene Positionen; jeder Spieler max. 1× pro Position.
- Redundanz (Sätze ↔ Sätze-Spalte ↔ Sieger ↔ Total) nutzen, um Lesefehler automatisch zu markieren.

## Namenszuordnung (`match-names.ts`)
- Normalisieren (Umlaute, Gross/Klein), Vergleich gegen Vorname (und Nachname) aller Kandidaten, Spitznamen-Präfix („Dane“→„Daniel“?) per Ähnlichkeit (Jaro-Winkler).
- Eindeutig → automatisch; mehrdeutig/kein Treffer → auf der click-tt-Seite markieren (siehe Ablauf Schritt 4).
- Bestätigte Zuordnungen lokal speichern (`storage.local`, pro Verein), damit es beim nächsten Mal automatisch klappt.

## click-tt-Automatisierung (aus den gespeicherten HTML-Seiten)
Allgemein: nuLiga/WebObjects. Fast alle `name`-Attribute sind **dynamische Element-IDs** (`0.1.63.5.1.13…`), die sich pro Sitzung ändern → nie hart codieren. Jede Aktion (Löschen, Einfügen, Weiter) ist ein **Form-Submit mit Seiten-Reload** → Ablauf als Zustandsmaschine, Zustand in `storage.session`, Content-Script setzt nach jedem Laden fort.

Schritt-Erkennung: `ol.progress > li.progress-selected` (Text „Mannschaftsaufstellung“ / „Erfassung“ / „Kontrolle“), Begegnung aus `#content-row1 h1` (Liga, Heim, Gast, Datum) → gespeicherte Daten nur auf die passende Begegnung anwenden.

**Schritt 1** (`form[name=playerFormationForm]`, Fixture `click-tt-single-match-report-part-1.html`):
- Zwei Team-Abschnitte, getrennt über `<h2>`-Zeilen (Heim zuerst, dann Gast).
- Spielerzeile: Einzel-Position `select[name^=homeSingleFormationPos-]` / `guestSingleFormationPos-` (stabil!), Optionen `0/1/2` = A/B/C bzw. X/Y/Z; Spielername in der 4. Zelle („Nachname, Vorname“); Doppel-Select in derselben Zeile (Option `0` = „Doppel“); Löschen-Checkbox in derselben Zeile.
- Auswahlliste: `select[multiple]` pro Team, Optionstexte mit Präfix („4.1 Schäfer, Christian“, „E …“, „S …“) → Präfix für Namensabgleich entfernen.
- Buttons pro Team: `input[type=submit][value=Löschen]` und `[value="<< Einfügen"]` (n-tes Vorkommen je Abschnitt); `[value="Weiter >>"]`.
- Ablauf: (1) falsche Stammspieler per Checkbox + „Löschen“ entfernen → Reload; (2) Ersatzspieler in Liste markieren + „Einfügen“ → Reload; (3) Positionen + Doppel setzen; (4) „Weiter“.

**Schritt 2** (`form[name=form1]`, Fixture `…-part-2.html`):
- Spieler sind aus Schritt 1 bereits korrekt vorausgewählt → nur **verifizieren** (Option `selected` per Text vergleichen), bei Abweichung Warnung.
- Zeilen über erste Zelle identifizieren: „A-X“, „B-Y“, …, „Doppel“ (Doppel hat 2 Selects pro Team).
- wo/ret: stabile IDs `#matchN_home` / `#matchN_guest` (N = 1..10), Werte `0`=-, `1`=wo, `2`=ret; Markierung beim Verlierer/Aufgebenden.
- Sätze: 5 Inputs pro Zeile (`id=set1..set5`, IDs mehrfach vorhanden → innerhalb der Zeile suchen), Format `11:5`. Seite deaktiviert Satz 4/5 per JS (`disableSets`), aktiviert sie beim Submit (`enableSets`). Wir setzen Werte, setzen `disabled=false` wo nötig und lösen `blur` aus, damit die Seitenlogik (`expandGameResult`) mitläuft. Seitenvalidierung zeigt bei ungültigen Sätzen `alert()` → deshalb vorher selbst validieren.
- Optional: „Spielende“ (Uhrzeit, steht nicht auf dem Matchblatt → leer lassen, Nutzer trägt bei Bedarf selbst ein), Nichtantreten-Select, Bemerkungen.
- Schritt 2 wird ausgefüllt, aber **nicht automatisch abgeschickt**: Nutzer prüft, klickt „Weiter“ und bestätigt in Schritt 3.
- Offen, in Live-Test klären: welche Satzwerte click-tt bei „wo“ erwartet (0:0 lassen oder 11:0 ×3).

Bei unerwartetem DOM: abbrechen und klar melden. Diagnose-Knopf „Formularstruktur exportieren“ für andere Ligen/Formulare. HTML-Fixtures vor Veröffentlichung anonymisieren (Namen, E-Mail, Sitzungs-URLs).

## Datenschutz & Verteilung
- API-Key nur in `storage.local`; kein Tracking; Foto nur an api.anthropic.com. Klarer Hinweis in den Optionen.
- Veröffentlichung: Chrome Web Store + addons.mozilla.org, Quellcode auf GitHub; kurze Anleitung (API-Key erstellen, Kosten).

## Umsetzungsphasen
1. **Erkennungs-Prototyp** (Node-Skript): Foto → JSON + Validierung, am Beispielfoto und weiteren Fotos testen. Ergebnis: Genauigkeit einschätzen.
2. **Domain-Logik**: Modell, Validierung, Namenszuordnung mit Unit-Tests.
3. **Extension-Gerüst**: Manifest, Optionen-Seite, Knopf + Statuszeile auf click-tt, Foto-Auswahl, Markierung von Feldern.
4. **click-tt Schritt 1 + 2 ausfüllen** anhand HTML-Fixtures, dann live an einer echten Begegnung.
5. Firefox-Build, Feinschliff, Anleitung, Store-Publikation.

## Verifikation
- Unit-Tests (Vitest): Validierung, Namenszuordnung, Mapping Blatt→Formularwerte.
- DOM-Tests (jsdom; happy-dom liest vorausgewählte Optionen in grossen Seiten falsch) gegen `click-tt-single-match-report-part-1.html` und `…-part-2.html`: Kader auslesen, Positionen/Doppel setzen, Sätze + wo eintragen, Ergebnis-Formdaten prüfen (`new FormData(form)`).
- Erkennung: Beispielfoto muss exakt die erwarteten Werte liefern (Golden-File aus `example_filled_matchresult.jpg`, z.B. Spiel 1: 11:5, 11:3, 11:13, 11:3; Total 7:3; Spiel 3 w.o.).
- End-to-End: Extension unpacked in Chrome und Firefox laden, echte offene Begegnung bis Schritt 3 „Kontrolle“ ausfüllen lassen und mit Papier vergleichen, ohne zu bestätigen.

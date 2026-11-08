# Changelog – Eqiva Smart Lock (ESPHome)

Alle Dateien mit derselben Versionsnummer gehören zusammen:
`eqiva-smart-lock-1.yaml`, `-fingerprint.yaml`, `-status-led.yaml`, `-stats.yaml`, `-schedule.yaml`, `-simulation.yaml`,
`eqiva-smart-lock-app.js` (bis 2.3.0: `eqiva-smart-lock-guide.js`) und der Ordner `eqiva_components/`.
Die Version steht in jeder Datei oben in der Kopfzeile, in der Web-App unter Einstellungen → Diagnose
und im Start-Log (`patched v…`).

## Versionsnummern

**Hauptversion.Nebenversion.Korrektur**, z. B. 1.3.0:

| Stelle | Wird erhöht bei | Was du tun musst |
|---|---|---|
| Korrektur (1.3.**1**) | Fehlerbehebung, kleine Ergänzung | Dateien ersetzen, flashen |
| Nebenversion (1.**4**.0) | neue Funktion oder neues Paket, Einstellungen bleiben | Dateien ersetzen, flashen |
| Hauptversion (**2**.0.0) | neu pairen, neu verkabeln, Einstellungen gehen verloren oder eigene YAMLs müssen angepasst werden | siehe „⚠️ Handlungsbedarf“ |

Versionen mit **„⚠️ Handlungsbedarf“** verlangen mehr als Ersetzen und Flashen.
Die Nummern bis 1.3.0 wurden nicht ganz nach diesen Regeln vergeben; der Handlungsbedarf ist dort nachgetragen.

**Eigene Kopien der Hauptdatei** (z. B. `eqiva-smart-lock-2.yaml`) nie durch die neue Hauptdatei ersetzen –
dort nur die unter „Handlungsbedarf“ genannten Stellen übernehmen. Pakete, `app.js` und `eqiva_components/`
werden von allen Schlössern gemeinsam genutzt und einfach ersetzt.

## 3.3.1 – 2026-11-08

### Behoben (Web-App)
- Expertenansicht war nach dem Umschalten leer bzw. unvollständig und erst nach Neuladen (F5) komplett.
  Die ESPHome-Tabelle wird jetzt nicht mehr entfernt, sondern nur ausgeblendet; sie erhält beim Laden das
  Startpaket des ESP und ist beim Umschalten sofort vollständig.

### Für eigene Kopien der Hauptdatei
- `config_version: "3.3.1"` setzen und die neue `eqiva-smart-lock-app.js` übernehmen.

## 3.3.0 – 2026-11-08

### Behoben
- **Abgebrochenes Pairing mit einem anderen Schloss verstellte die MAC-Adresse dauerhaft.** „BLE Pair _Start_“ hat die MAC
  aus dem QR-Text sofort gespeichert; nach einem Neustart verband sich der ESP dann mit dem falschen Schloss.
  Jetzt wird die MAC erst gespeichert, wenn das Schloss das Pairing bestätigt.
- Fingerprint im Sparmodus bei nicht erreichbarem Schloss: Der Ring blieb beim erneuten Auflegen dauerhaft blau,
  scheinbar passierte nichts. Jetzt bleibt die laufende Anzeige stehen, ignorierte Scans zählen nicht als Fehlversuch
  und lösen keine Klingel aus.

### Neu
- **„Pairing abbrechen“** (Button, in der App im Pairing-Assistenten): bricht sofort ab, die bisherige Kopplung bleibt.
- **„⚠️ Schloss nicht erreichbar seit HH:MM“** im Einrichtungsstatus und in der App nach zwei gescheiterten
  Verbindungsversuchen, dazu Einträge „⚠️ Schloss nicht erreichbar“ / „✓ Schloss wieder erreichbar“ in „Ereignisse“.
- Fingerprint: Ring **türkis atmend** = verbinde mit dem Schloss; „Letzte Aktion“ zeigt sofort „Verbinde mit Schloss …“.
  Die Status-Abfrage für „Umschalten“ endet, sobald der Verbindungsversuch scheitert, statt die vollen 20 s zu warten.
- Zeitgrenze für einen Verbindungsversuch einstellbar: `ble_connect_timeout` (Standard jetzt 12 s statt 20 s).

### ⚠️ Handlungsbedarf für eigene Kopien der Hauptdatei
- `config_version: "3.3.0"` setzen.
- **Wichtig (sonst bleibt der MAC-Fehler):** den Button-Block „BLE Pair _Start_“ (`name: BLE Pair _Start_`) und unter
  `eqiva_key_ble:` → `on_paired:` den neuen `text.set` für `mac_address` aus `eqiva-smart-lock-1.yaml` übernehmen.
- Optional: Button „Pairing abbrechen“ (`id: ble_pair_cancel`), Block `esp32_ble:` mit `connection_timeout` plus
  Substitution `ble_connect_timeout`, im „Einrichtungsstatus“ die Abfrage `unreachable_since()`.

## 3.2.2 – 2026-11-08

### Behoben (Web-App)
- Anlern-Assistent blieb bei „Wird gestartet …“ stehen, wenn dieselbe Meldung zweimal in derselben Minute kam
  (z. B. derselbe Finger zweimal hintereinander unter anderem Namen → zweimal „Abgebrochen: … schon angelernt …“).
  Die App zählt jetzt jede Meldung des ESP statt Texte zu vergleichen; ebenso beim Pairing-Assistenten.
- Knöpfe blieben gesperrt, wenn eine Anfrage an den ESP nicht zurückkam. Jeder Befehl hat jetzt eine Zeitgrenze
  von 8 s („Keine Antwort vom ESP – bitte nochmal versuchen“), danach ist alles wieder bedienbar.
- „Anlernen abbrechen“ schließt den Assistenten sofort, auch wenn der ESP nichts mehr abzubrechen hat.

### Für eigene Kopien der Hauptdatei
- `config_version: "3.2.2"` setzen und die neue `eqiva-smart-lock-app.js` übernehmen.

## 3.2.1 – 2026-11-07

### Behoben
- **Pairing-Absicherung:** Neuer Schlüssel und User-ID werden erst gespeichert, wenn das Schloss das Pairing bestätigt.
  Scheitert ein erneutes Pairing (Pairing-Modus vorbei, keine Bestätigung innerhalb von 60 s), bleibt die bisherige
  Kopplung erhalten („✗ Pairing nicht bestätigt – bisherige Kopplung bleibt“). Vorher war danach gar keine Kopplung mehr
  gültig und es kam „User ID … eingestellt, gekoppelt wurde User …“.
- Nach erfolgreichem Pairing fragt der ESP sofort den Schlosszustand ab (Einrichtungsstatus sofort ✅).
- Einrichtungsstatus im Sparmodus: „✅ Gekoppelt (Sparsam) – Zustand folgt beim nächsten Verbinden“ statt der
  irreführenden Meldung „Keine Verbindung … neu pairen“, wenn der Zustand noch nicht gelesen wurde.
- Ereignisprotokoll: „🔗 Gekoppelt (User N)“.

### Web-App
- Ausgewählte Optionen deutlich hervorgehoben (kräftiger blauer Rahmen, hinterlegt, fett), nicht ausgewählte mit
  sichtbarem grauem Rahmen – hell und dunkel.
- Pairing-Assistent fragt nach, wenn das Schloss schon gekoppelt ist, und erkennt ein nicht bestätigtes Pairing sofort
  (mit Hinweis zum Pairing-Modus).

### Für eigene Kopien der Hauptdatei
- `config_version: "3.2.1"` setzen.
- Optional: im Text-Sensor „Einrichtungsstatus“ den Block `if (id(ble_state).state != "ESTABLISHED") { … }`
  aus `eqiva-smart-lock-1.yaml` übernehmen (neue Meldung im Sparmodus).

## 3.2.0 – 2026-11-07

### Neu
- **„Kopplung entfernen“** (Web-App: Einstellungen → Einrichtung, mit Rückfrage; Expertenansicht: Button „Kopplung entfernen“):
  Der ESP trennt die Verbindung, vergisst MAC-Adresse, User Key und Pairing-Info und verbindet sich nicht mehr.
  Gedacht zum **Tauschen des Schlosses**: danach das neue Schloss koppeln.
  Der Benutzer bleibt im alten Schloss angelernt – dort per Eqiva-App (Benutzerverwaltung) oder Werksreset austragen.
- Startseite der App: „Nicht gekoppelt“ statt Schlosszustand, solange kein Schloss gekoppelt ist.

### Geändert
- Sparmodus: keine periodische Status-Abfrage mehr, solange nicht gekoppelt.

### Für eigene Kopien der Hauptdatei
- `config_version: "3.2.0"` setzen.
- Optional für „Kopplung entfernen“: den Button-Block `id: ble_unpair` aus `eqiva-smart-lock-1.yaml`
  (unter `button:`, nach „BLE Settings _Disconnect_“) übernehmen. Ohne ihn blendet die App den Knopf aus.

## 3.1.0 – 2026-11-07

### Neu (Web-App)
- **Schloss koppeln (Pairing) in der App** (Einstellungen → Einrichtung): QR-Text der Keycard einfügen (mit der
  Handy-Kamera oder Google Lens scannen und kopieren), MAC-Adresse und Seriennummer werden zur Kontrolle angezeigt,
  Hinweis zum Pairing-Modus, „Pairing starten“ mit Live-Status. Passt die eingestellte User-ID nicht,
  übernimmt ein Knopf die gekoppelte. Der Card Key wird nur zum Pairing an den ESP geschickt, nicht im Browser gespeichert.
- **Schlossantrieb einstellen** (Schließrichtung, Schlüsselposition, Umdrehungen, „Am Schloss übernehmen“).
- **ESP neu starten** (mit Rückfrage).
- Startseite: Hinweis „Jetzt koppeln“, solange das Schloss nicht eingerichtet ist.

### Geändert
- Überschriften und Feldbezeichnungen in der App deutlicher hervorgehoben (farbig, fett, Trennlinie).

### Für eigene Kopien der Hauptdatei
- `config_version: "3.1.0"` setzen und die neue `eqiva-smart-lock-app.js` übernehmen.

## 3.0.0 – 2026-11-06

### ⚠️ Handlungsbedarf
- Die Anleitung steckt nicht mehr in der Firmware, sondern liegt auf GitHub:
  [docs/ANLEITUNG.md](https://github.com/2nice4u/esphome-components-eqiva/blob/main/docs/ANLEITUNG.md).
  `eqiva-smart-lock-guide.js` entfällt.
- **Eigene Kopien der Hauptdatei** (z. B. `eqiva-smart-lock-2.yaml`): unter `web_server:` die Zeile
  `js_include: eqiva-smart-lock-guide.js` ersetzen durch `js_include: eqiva-smart-lock-app.js`
  und `config_version: "3.0.0"` setzen. Die Datei `eqiva-smart-lock-app.js` neben die YAML legen.

### Neu
- **Web-App** statt ESPHome-Tabelle, direkt auf dem ESP (läuft auch ohne Internet), für Handy und PC:
  - **Schloss:** großer Zustand, Buttons Zu · Auf · Öffnen, Batterie, Empfang, Energiemodus, „Ereignisse“ als Liste.
  - **Fingerprint:** Personen als Karten mit ihren Fingern und Aktion; Finger antippen = Aktion ändern, neu anlernen,
    löschen; Person umbenennen/zusammenführen; Plätze ohne Zuordnung zuordnen oder löschen;
    Anlern-Assistent mit Live-Fortschritt (Prüfung, Bild 1 von N, fertig).
  - **Zeitplan:** Uhrzeit, Wochentage zum Antippen, Aktion, Ein/Aus.
  - **Einstellungen:** Schloss, Fingerprint, Sabotage-Erkennung, Testmodus, Diagnose.
  - **Darstellung Automatisch · Hell · Dunkel** (wird im Browser gemerkt).
  - Rotes Band bei Sabotage-Alarm mit „Quittieren“, Hinweis bei Versionskonflikt.
  - **Expertenansicht** = bisherige ESPHome-Tabelle (Pairing, BLE- und Schloss-Einstellungen, Log-Stufe, Neustart).
  - Auf Android über Chrome „Zum Startbildschirm hinzufügen“.
- Diagnose-Entität **„Fingerprint Zuordnung“** (vollständige Zuordnung für die Web-App; in HA standardmäßig deaktiviert,
  da länger als 255 Zeichen möglich).

### Speicher
- Die Web-App belegt im Flash ca. 16 KB (ESPHome speichert sie gzip-komprimiert), die Anleitung vorher ca. 9 KB.

## 2.3.1 – 2026-11-06

### Geändert
- **Doppelt-Prüfung beim Anlernen strenger:** Wird der Finger beim Prüf-Scan nicht erkannt, heißt es
  „Nicht erkannt – noch einmal auflegen“. Erst wenn auch der zweite Scan nicht erkannt wird, gilt er als neu
  (vorher reichte ein schief aufgelegter Finger, um einen bekannten Finger als neu anzulernen).
- **Nachprüfung nach dem Anlernen:** Der Sensor vergleicht das fertige Muster mit allen anderen Plätzen.
  Ist der Finger dort schon gespeichert, wird der neue Platz sofort wieder gelöscht
  („Doppelt: dieser Finger ist schon St R-Daumen (#0) – nicht gespeichert“, Ring rot).

### Behoben
- Nach „Anlernen abbrechen“ stand „Anlernen fehlgeschlagen“ – jetzt „Anlernen abgebrochen“, Ring aus.
- Compiler-Warnung „suggest braces around empty body“ (Klingel-Pause).

## 2.3.0 – 2026-11-06

### Neu
- **Ereignisprotokoll** „Ereignisse“: die letzten 10 Ereignisse mit Uhrzeit, neueste zuerst – wer auf-/zugeschlossen
  oder geöffnet hat (Person + Finger, „Zeitplan 1“, „HA/Web“), **🖐 von Hand** (Schlüssel, Knauf, Taste am Schloss),
  ✗ nicht ausgeführte Befehle mit Grund, 🔔 Klingel, ⛔ abgewiesene Finger, ❓ unbekannte Finger, ⚠️ Sabotage.
  Läuft in der Komponente, also auch ohne Fingerprint-Paket.
- **Doppelt anlernen verhindert:** Nach „Finger anlernen“ den Finger einmal zur Prüfung auflegen (Ring blau atmend).
  Ist er schon gespeichert – auch unter anderem Namen –, wird abgebrochen mit „schon angelernt als … (#Platz)“.
- **Sabotage-Erkennung** (neue Gruppe „Sabotage-Erkennung“, jede einzeln abschaltbar):
  Sensor antwortet nicht · Belegung im Sensor verändert · Fremder Sensor (Notizspeicher anders, auch nach Neustart) ·
  Unmöglicher Treffer (Platz laut Sensor leer, nichts wird ausgeführt) · Berührungsleitung dauerhaft aktiv ·
  Alarm bei Fehlversuch-Sperre (Standard aus). Einstellbar: „Sabotage-Prüfintervall“ (10 min),
  „Max. Berührungsdauer“ (60 s), „Bei Sabotage Fingerprint sperren“ (an).
- Binärsensor **„Fingerprint Sabotage“** (Manipulation, für HA-Automationen) und Button **„Sabotage quittieren“**
  (getrennt von „Fingerprint Sperre aufheben“). Der Alarm bleibt bis zum Quittieren, auch über einen Neustart.
- Anleitung: roter Hinweis **„⚠️ Sabotage – siehe Fingerprint“** im Anleitungsbalken, neuer Abschnitt
  **„11. Sicherheit“** (Montage, Sensor-Passwort, Namen im Sensor, Sabotage-Erkennung), Abschnitt zu „Ereignisse“.
- Testmodus: Button **„Simulation: von Hand drehen“**.

### Geändert
- Der Sensor wird für die Sabotage-Prüfung alle 10 Minuten kurz eingeschaltet (nur wenn nichts passiert).
  Wer das nicht möchte: die ersten drei Sabotage-Erkennungen abschalten.
- „Speicherplatz löschen“ frischt die Belegungstabelle jetzt auch bei Plätzen ohne Zuordnung auf.

### Behoben
- Compiler-Warnung beim Pairing-Datum (`snprintf` … `date`) in der Hauptdatei.

### Optional für eigene Kopien der Hauptdatei
- `config_version: "2.3.0"` setzen (Pflicht, sonst Versionskonflikt beim Kompilieren).
- Für „Ereignisse“ unter `text_sensor:` → `- platform: eqiva_key_ble` ergänzen:
  ```yaml
      events:
        name: "Ereignisse"
        id: events_txt
        web_server:
          sorting_group_id: sg_lock
  ```
- Warnung beim Pairing-Datum beseitigen: `char date[16]` → `char date[24]`.

## 2.2.1 – 2026-11-06

### Behoben
- Anlernen schlug mit „No response received from reader“ fehl, wenn der Sensor zum Erstellen des Musters
  länger brauchte (vor allem bei kleinen Fingern, z. B. von Kindern): Der Ring-Befehl nach dem letzten Bild
  kam dem Sensor dazwischen. Nach dem letzten Bild wird jetzt kein Lichtbefehl mehr gesendet;
  „Letzte Aktion“ zeigt „Muster wird erstellt …“.

### Anleitung
- Tipp für schwierige Finger (Anlern-Scans 4, Finger mittig und flach auflegen).

## 2.2.0 – 2026-11-04

### Neu
- **Versionsprüfung beim Kompilieren:** Jedes Paket und die Komponente (`eqiva_components`) vergleichen ihre
  Version mit `config_version` der Hauptdatei. Bei Abweichung bricht ESPHome ab, z. B.
  `Versionskonflikt: eqiva-smart-lock-fingerprint.yaml ist 2.2.0, Hauptdatei ist 2.1.0`.
  Abschaltbar mit `version_check: "false"` (nur für Tests).
- Diagnose-Entität **„Konfiguration Version“**.
- **Anleitung in der Web-GUI** vergleicht ihre Version mit der Firmware und zeigt bei Abweichung
  „⚠️ Firmware v… – Anleitung v…“ im Anleitungsbalken.
- Anleitung „Wenn es nicht klappt“: Hinweis zum Versionskonflikt.

### Optional für eigene Kopien der Hauptdatei
- `version_check: "true"` unter `substitutions` sowie die Entität „Konfiguration Version“ und die Zeile
  `component.update: cfg_version_txt` im `on_boot` übernehmen. Ohne diese Zeilen prüfen die Pakete trotzdem
  (Standard `version_check: "true"`), nur die Komponente und der Hinweis in der Anleitung fehlen.
- **Wichtig:** In eigenen Kopien muss `config_version` zur Version der Pakete passen, sonst bricht das Kompilieren ab.

## 2.1.0 – 2026-11-04

### Neu
- **„Person umbenennen“** mit Feld **„Neuer Name“**: alle Finger der Person behalten Platz, Hand, Finger und Aktion.
- Existiert der neue Name schon: Rückfrage, erneut drücken innerhalb von 10 s **führt beide Personen zusammen**.
  Haben beide denselben Finger (Hand + Finger), wird abgelehnt mit Angabe der Plätze („erst einen davon löschen“).
- Wird ein Name länger und passt die Sicherung im Sensor nicht mehr, wird abgelehnt.

## 2.0.0 – 2026-11-04

### Neu
- **16 Personen** (vorher 8), Zuordnung für **alle Plätze 0–199** des R503 (vorher 0–39).
- Wie viele Finger zugeordnet werden können, bestimmt die Sicherung im Notizspeicher (512 Byte):
  ca. 55 bei kurzen Namen. **Passt eine neue Zuordnung nicht mehr hinein, wird das Anlernen abgelehnt** –
  schon vor dem Scannen (ebenso beim Zuordnen).
- **Warnung bei unter 10 % Rest** (Personen, Sicherung im Sensor, Plätze im R503): ⚠️ in „Letzte Aktion“,
  „⚠️ fast voll“ am Ende der Übersicht, Warnung im Log.
- Nach dem Anlernen zeigt „Letzte Aktion“, wie viele Finger noch möglich sind.
- Beim Anlernen werden nur Plätze genommen, die auch im Sensor frei sind (alte Abdrücke ohne Zuordnung
  werden nicht mehr überschrieben).

### Geändert
- „Angelernte Finger“ nach Speicherplatz sortiert: `#0 St R-Daumen ⇄ · #1 St L-Daumen ⇄ · #8 ohne Zuordnung`.
  Passt nicht alles in 255 Zeichen, endet die Zeile mit „+N weitere (siehe Log)“.
- Speicherformat im Notizspeicher **FP2** (Person als Hex-Ziffer 0–F). FP1 wird weiterhin gelesen.

### ⚠️ Handlungsbedarf
- Das Speicherformat auf dem ESP ist neu – nach dem Flashen ist die Zuordnung dort zunächst leer und wird
  beim Start **automatisch aus dem Notizspeicher des Sensors übernommen** (seit 1.9.0 dort gesichert).
  Nach dem Update prüfen, ob „Angelernte Finger“ wieder vollständig ist; sonst „Zuordnung aus Sensor laden“ drücken.

## 1.10.1 – 2026-11-04

### Geändert
- Anlernen mit klarer Ring-Rückmeldung: **lila atmend** = Finger auflegen, **2× grün** = Bild ok
  (abheben und erneut auflegen), **2× gelb** = schief aufgelegt. Vorher durchgehend lila.
- „Fingerprint: Letzte Aktion“ zeigt beim Anlernen den Fortschritt („Bild 2 von 5 ok“).

## 1.10.0 – 2026-11-04

### Geändert
- „Angelernte Finger“ kompakter: je Person und Finger, beide Hände mit gleicher Aktion zusammengefasst –
  z. B. `Max: Daumen L+R ⇄ · Anna: Daumen L+R ⇄`. Speicherplätze stehen weiterhin im Log.

### Entfernt
- Web-Export/-Import der Zuordnung („Zuordnung exportieren“, „Zuordnung (Export)“, „Zuordnung (Import)“,
  „Zuordnung importieren“) – ersetzt durch den Notizspeicher des R503 (am echten Sensor bestätigt).

### Hinweis
- In Home Assistant erscheinen die vier entfernten Entitäten danach als „nicht verfügbar“ und können dort gelöscht werden.

## 1.9.0 – 2026-11-04

### Neu
- Zuordnung wird zusätzlich im **Notizspeicher des R503** gesichert (512 Byte, Befehle 0x18/0x19 laut
  Handbuch V1.4.1) – automatisch einige Sekunden nach jeder Änderung, nur wenn sich etwas geändert hat.
  Schläft der Sensor, wird er kurz geweckt; klappt es nicht, wird beim nächsten Scan nachgeholt.
- Beim Start liest der ESP den Notizspeicher: **ESP ohne Zuordnung übernimmt die des Sensors** automatisch
  (Sensor an neuen ESP umziehen ohne Handgriff). Hat der ESP eine Zuordnung, gilt diese und wird im Sensor gesichert.
- Button **„Zuordnung aus Sensor laden“**.
- **Belegungstabelle** des R503 (Befehl 0x1F): „Angelernte Finger“ zeigt auch belegte Plätze ohne Zuordnung
  (`ohne Zuordnung: #3, #5`).

### Hinweise
- Die Sensor-Befehle laufen direkt über die serielle Leitung (an ESPHome vorbei) und blockieren kurz
  (bis ca. 1 s beim Sichern). Eine Log-Warnung „took a long time“ ist dabei unbedenklich.
- Der Fingerabdruck-Export (Rohdaten) wurde bewusst **nicht** umgesetzt (biometrische Daten).

## 1.8.0 – 2026-11-04

### Neu
- Fingerzuordnung **exportieren/importieren** in der Web-GUI (für ESP-Wechsel oder als Sicherung):
  „Zuordnung exportieren“ → Text in „Zuordnung (Export)“ (und im Log),
  „Zuordnung (Import)“ + „Zuordnung importieren (2× drücken)“.
  Format: `FP1|Name0,Name1,…|Platz:PersonHandFingerAktion,…` – passt bis ca. 20 Finger in 255 Zeichen.
- Personennamen dürfen kein `,` oder `|` enthalten (wird automatisch durch Leerzeichen ersetzt).

## 1.7.0 – 2026-11-04

### Neu
- **„Klingel-Pause“** einstellbar (0–600 s, Standard 30 s), vorher fest 30 s.
- R503-Ring zeigt auch Bedienung **ohne Finger** (HA, Web-GUI, Zeitplan, Schlüssel/Knauf):
  grün atmend = zugeschlossen, rot atmend = aufgeschlossen, blau atmend = geöffnet (je 2×).
  Abschaltbar mit „Ring-Anzeige bei Bedienung ohne Finger“ (Standard an).

## 1.6.0 – 2026-11-04

### Neu
- Auswahl **„Klingel-Anzeige“** (Fingerprint Einstellungen): Regenbogen (Standard), Weiß atmen,
  Blau blinken, Rot/Blau Wechsel, Gelb/Grün Wechsel oder Aus. Jeweils ca. 3 s.

## 1.5.4 – 2026-11-04

### Geändert
- Klingel am R503-Ring als **Regenbogen** (rot, gelb, grün, cyan, blau, lila – 2 Durchläufe, ca. 3 s)
  statt weiß atmend.

## 1.5.3 – 2026-11-04

### Geändert
- R503: Die 2-s-Bestätigung nach der Motorfahrt zeigt jetzt das Ergebnis –
  **grün = verriegelt**, **rot = aufgeschlossen/geöffnet** (vorher immer grün).
- Status-LED am ESP passend dazu: **grün = verriegelt**, **rot = aufgeschlossen** (vorher umgekehrt),
  blau = geöffnet, orange pulsierend = Motor läuft, unbekannt jetzt lila blinkend (vorher rot).
- Anleitung: Ring-Farben und Status-LED aktualisiert.

## 1.5.2 – 2026-11-04

### Behoben
- Beim Anlernen wurde ein schief aufgelegter Finger als „unbekannt“ gewertet und die Klingel vorgemerkt
  (nur die Klingel-Pause hat sie verhindert). Während des Anlernens wird jetzt nie geklingelt,
  eine vorgemerkte Klingel wird beim Start des Anlernens verworfen.
- Beim Anlernen überschrieb das blaue „Finger wird gelesen“ das lila Anlern-Licht. Jetzt bleibt es lila.

## 1.5.1 – 2026-11-03

### Behoben
- Testmodus, Energiemodus „Sparsam“: Die simulierte Verbindung wurde direkt nach dem Verbinden wieder
  getrennt (Zeit-Unterlauf), dadurch dauerte „Umschalten“ unnötig länger.

### Geändert
- Klingel wird auch bei **schlecht aufgelegtem** Finger (gelb) vorgemerkt – mit derselben Verzögerung,
  ein danach erkannter Finger bricht sie ab.
- HA-Event `esphome.eqiva_smart_lock_fingerprint` ist jetzt optional (`fp_ha_events`, Standard `"false"`).
  Damit verschwinden die Warnungen „event dropped“. Für die Klingel reicht die Entität „Klingel“.

### Optional
- Wer das HA-Event nutzt: `fp_ha_events: "true"` unter `substitutions` der Hauptdatei setzen und in HA bei der
  ESPHome-Integration „Dem Gerät erlauben, Home-Assistant-Aktionen auszuführen“ einschalten.

## 1.5.0 – 2026-11-03

### Neu
- **Klingel bei unbekanntem Finger** (Schalter, Standard aus) mit **„Klingel-Verzögerung“** (Standard 5 s):
  wird in dieser Zeit ein bekannter Finger erkannt, klingelt es nicht (eigener Finger schlecht gelesen).
  Danach 30 s Klingel-Pause.
- Event-Entität **„Klingel“** (`device_class: doorbell`) – kommt in Home Assistant ohne Zusatzrechte an.
  Das bisherige HA-Event `esphome.eqiva_smart_lock_fingerprint` bleibt zusätzlich bestehen.

### Geändert
- R503-Ring: blau = Finger wird gelesen, grün atmend = erkannt/Aktion läuft (für alle Aktionen),
  grün 2 s = bestätigt, rot atmend = nicht erkannt, rot blinkend = Fehler, lila blinkend = abgewiesen/gesperrt,
  gelb blinkend = schlecht aufgelegt, weiß atmend = Klingel.
- „Nur Klingel“-Finger lösen dieselbe Klingel aus (Entität + Event).
- Anleitung: Ring-Farben und Klingel aktualisiert.

## 1.4.0 – 2026-11-03

### Neu
- **Testmodus** ohne Schloss: `use_simulation: "true"` in der Hauptdatei. Die Komponente
  (`simulate: true`) baut keine BLE-Verbindung auf und bildet das Schloss nach – Zuschließen,
  Aufschließen, Öffnen mit MOVING und Fahrzeit, Sparmodus mit simuliertem Verbindungsaufbau.
- Paket `eqiva-smart-lock-simulation.yaml` (nur im Testmodus geladen): „Simulation: Fahrzeit“ und
  „Simulation: Schloss erreichbar“ (aus = Befehle verfallen, testet die Fehleranzeige).
- „Einrichtungsstatus“ zeigt im Testmodus 🧪 TESTMODUS.
- Anleitung: Abschnitt „10. Testmodus“.

### Optional für eigene Kopien der Hauptdatei
- Testmodus nutzen: `use_simulation: "false"` unter `substitutions`, `simulate: ${use_simulation}`
  unter `eqiva_key_ble:` und den Paket-Eintrag für `eqiva-smart-lock-simulation.yaml` übernehmen.
  Ohne diese Zeilen läuft alles wie bisher.

## 1.3.1 – 2026-11-03

### Dokumentation
- Grenzen dokumentiert (Anleitung in der Web-GUI, README, Kopf der Fingerprint-YAML):
  8 Personen, 40 Finger mit Zuordnung, 200 Abdrücke im R503, Übersicht ab ca. 12 Fingern gekürzt.
- Hinweis: für Haushalte gedacht, nicht als Zutrittskontrolle für Firmen.

## 1.3.0 – 2026-11-03

### Neu
- Pakete oben in der Hauptdatei per Schalter ein-/ausschalten:
  `use_fingerprint`, `use_status_led`, `use_stats`, `use_schedule` (`true`/`false`).
  Technisch über `!include` mit `condition:` – ein ausgeschaltetes Paket wird gar nicht geladen.

### Geändert
- `packages:` als Liste mit Bedingung statt einzelner Zeilen zum Auskommentieren.
  **Benötigt eine ESPHome-Version mit `condition` für Pakete.**

### ⚠️ Handlungsbedarf
- In eigenen Kopien der Hauptdatei den kompletten `packages:`-Block durch den neuen ersetzen
  und oben unter `substitutions` die vier Zeilen `use_fingerprint` … `use_schedule` ergänzen.

## 1.2.4 – 2026-11-03

### Neu
- Web-GUI: **„Speicherplatz löschen“** mit Feld „Speicherplatz (Nr.)“ – löscht jeden Platz 0–199,
  auch alte Finger ohne Zuordnung.
- Web-GUI: **„Alle Finger löschen (2× drücken)“** – Sicherung: zweiter Druck innerhalb von 10 s.

## 1.2.3 – 2026-11-03

### Neu
- „Angelernte Finger“ zeigt den Speicherplatz (`R-Daumen ⇄ #3`).
- Ausführliche Liste Platz → Person/Hand/Finger/Aktion im Log nach jedem Start und jeder Änderung.

## 1.2.2 – 2026-11-03

### Neu
- Fingerprint: Button **„Letzten Finger zuordnen“** – früher angelernte Finger ohne Zuordnung
  (Anzeige „Platz X (ohne Zuordnung)“) nachträglich Person/Hand/Finger/Aktion zuweisen, ohne neu anzulernen.
- Anleitung um den Ablauf ergänzt.

## 1.2.1 – 2026-11-03

### Behoben
- Kompilierfehler „call of overloaded RestoringGlobalsComponent … is ambiguous“ bei den
  Fingerprint-Globals `fp_map` und `fp_persons` (Startwert jetzt mit Typ angegeben).

### Geändert
- Web-GUI-Anmeldung mit `type: digest` statt `basic` (Passwort nicht mehr im Klartext übers Netz).

### Empfohlen
- In eigenen Kopien der Hauptdatei unter `web_server:` → `auth:` die Zeile `type: digest` ergänzen
  (sonst nur eine Warnung; ab ESPHome 2027.1 ohnehin Standard).

## 1.2.0 – 2026-11-02

### Neu
- Paket **Zeitplan** (`eqiva-smart-lock-schedule.yaml`): zwei Zeitpläne mit Uhrzeit, Wochentagen
  (Text, z. B. `Mo-Fr`, `Sa,So`, `täglich`) und Aktion (Zuschließen/Aufschließen), alles in der Web-GUI.
- Anzeige „Zeitplan“: nächster Termin und letztes Ergebnis (✓/✗), nur bei Änderung gesendet.
- Bis zu 3 Wiederholungen im Minutenabstand, wenn das Schloss nicht bestätigt.
- Uhrzeit per SNTP (Zeitzone/Server als Substitution), ersatzweise von Home Assistant.
- Anleitung: Abschnitt „9. Zeitplan“.

### ⚠️ Handlungsbedarf
- Neue Datei `eqiva-smart-lock-schedule.yaml` in den ESPHome-Ordner kopieren.
- In eigenen Kopien der Hauptdatei unter `packages:` die Zeile für das Zeitplan-Paket ergänzen
  (ab 1.3.0 ersetzt durch den neuen `packages:`-Block).

## 1.1.1 – 2026-11-02

### Neu
- Pinbelegung aller Pakete zentral als `substitutions` in der Hauptdatei
  (R503, Status-LED, reserviert: Reedkontakt GPIO4, Taster GPIO3, Wiegand GPIO0/1).
- R503-Stromabschaltung über PNP-Transistor (BC559C/BC327): `sensor_power_pin` (invertiert),
  Sensor nur bei Berührung an, `idle_period_to_sleep: 40s`.
- Status-LED: mehrere WS2812 in Reihe über `status_led_count`.

### Geändert
- Standard-Pins R503: TX GPIO20, RX GPIO21, WAKEUP GPIO6, Strom GPIO7.

### ⚠️ Handlungsbedarf
- Pinbelegung prüfen: Wer den R503 noch nach 1.0.0 verkabelt hat (TX GPIO7, RX GPIO6, WAKEUP GPIO5),
  muss die Pins in den Substitutions der Hauptdatei anpassen oder umverkabeln.
- Ohne PNP-Transistor: in `eqiva-smart-lock-fingerprint.yaml` `sensor_power_pin` und `idle_period_to_sleep` entfernen.
- In eigenen Kopien der Hauptdatei den Pin-Block unter `substitutions` übernehmen.

## 1.1.0 – 2026-11-02

### Neu
- Fingerprint: Anlernen über **Person + Hand + Finger** statt Speicherplatz-Nummer.
  Gleiche Auswahl erneut anlernen überschreibt denselben Platz.
- Aktion pro Finger: Standard, Umschalten, Aufschließen, Zuschließen, Öffnen, Nur Klingel, Gesperrt.
- **Umschalten**: zu → öffnen (beachtet „Türgriff außen“), offen → zuschließen;
  ohne Verbindung wird zuerst der aktuelle Status geholt.
- Ring-Rückmeldung: atmen in Aktionsfarbe während der Ausführung, 2 s Dauerlicht bei Bestätigung,
  rot blinkend bei Fehler/Zeitüberschreitung (35 s).
- Scan-Pause nach einer Aktion (einstellbar, Standard 3 s) – kein doppeltes Umschalten.
- Text-Sensoren „Angelernte Finger“ (Übersicht) und „Fingerprint: Letzte Aktion“ (mit Uhrzeit).
- Buttons „Aktion übernehmen“ und „Finger löschen“; HA-Aktion `fp_enroll` mit Person/Hand/Finger/Aktion.
- HA-Event enthält den Fingernamen; neues Ergebnis `doorbell`.
- Anleitung: Abschnitt „8. Fingerprint“ mit Aktionen und Ring-Farben.

### Geändert
- „Aktion bei gültigem Finger“ → „Standard-Aktion (Finger ohne Zuordnung)“ (neu einstellen, Standard „Öffnen“).
- „Letzte Finger-ID“ und „Letzte Übereinstimmung“ in die Diagnose verschoben.

### Entfernt
- „Anlern-Slot (Finger-ID)“ und „Finger in Slot löschen“ (ersetzt durch die Finger-Auswahl).

### ⚠️ Handlungsbedarf
- „Standard-Aktion (Finger ohne Zuordnung)“ prüfen – steht nach dem Update auf „Öffnen“.
- Vorhandene Finger laufen als „ohne Zuordnung“ weiter; zuordnen (ab 1.2.2 „Letzten Finger zuordnen“)
  oder neu anlernen.
- Automationen in HA, die die entfernten Entitäten nutzen, anpassen (das Event enthält `finger_id` weiterhin).

## 1.0.0 – 2026-11-02

Erste versionierte Fassung.

### Komponente (eqiva_key_ble, gepatcht)
- Sicherer User Key aus dem Hardware-Zufallsgenerator.
- Befehle verfallen nach `command_timeout`, haben Vorrang vor Status-Abfragen.
- Watchdog: Nonce-Retry, Write-Timeout, Neuaushandeln nach Auth-Fehler, Reset beim Disconnect.
- Speicherfehler behoben (Initialwerte, `delete` statt `free`, Null-Checks, Längenprüfung).
- Keine Schlüssel mehr im Log; Sensoren nur bei Änderung veröffentlicht.
- Klare Meldungen „nicht im Pairing-Modus“ / „nicht angelernt“, kein Dauer-Reconnect.
- Energiemodi Schnell/Ausgewogen/Sparsam, live umschaltbar; schneller Verbindungsaufbau.
- Optionaler RSSI-Sensor; Auslöser `on_paired`.
- Pairing mit anderem Schloss trennt zuerst die alte Verbindung.

### Konfiguration
- MAC/Keys nur in der Web-GUI, Auto-Übernahme nach dem Pairing, Pairing-Info und Einrichtungsstatus.
- Auswahl „Türgriff außen“ (Knauf/Türklinke) für die Öffnen-Funktion.
- Pakete: R503-Fingerprint, WS2812-Status-LED, Statistik.
- Flash-schonend (`flash_write_interval: 5min`, Statistik im RAM), wenig HA-Traffic.
- Log-Stufe zur Laufzeit umschaltbar.
- Anleitung als aufklappbarer Text in der Web-GUI (ohne Entitäten).

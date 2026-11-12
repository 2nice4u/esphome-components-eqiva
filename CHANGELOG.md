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

## 3.5.12 – 2026-11-12

### Neu
- **Ereignisse und Reaktionszeiten überleben einen Neustart:** Die letzten 10 Einträge werden im Flash gespeichert
  (nur bei einem neuen Eintrag; ESPHome bündelt die Schreibvorgänge). Nach Flashen oder Neustart sind beide Listen wieder da.
- **Hinweis bei langsamem Verbindungsaufbau:** Liegt „Ø Verbindung“ über 6 s (mind. 2 Messungen mit Verbindungsaufbau),
  zeigt die Bluetooth-Kachel „Verbindung langsam – Batterie oder Empfang prüfen“.

### Geändert
- **„Ø Verbindung“** wird nur noch über Messungen mit echtem Verbindungsaufbau gemittelt, darunter „aus X von Y“;
  ohne Verbindungsaufbau steht „–“ / „immer verbunden“. Ø gesamt und Max gesamt bleiben über alle Messungen.
- **Fingerprint-Anteil nur bei Berührung:** Bei HA/Web und Zeitplan gibt es keinen Rest mehr – die kurze Vorlaufzeit bis der
  Verbindungsaufbau startet zählt zur Verbindung (ohne Verbindungsaufbau zum Motor). Die Anteile werden so gerundet,
  dass sie genau die Gesamtzeit ergeben.

### Behoben
- **Fingerprint mit langem Verbindungsaufbau ohne Verbindungszeit gemessen:** Die Berührung galt nur 5 s als Auslöser; dauerte
  der Verbindungsaufbau länger (z. B. 5,3 s), begann die Messung erst beim Senden des Befehls („0,2 s, Verbindung 0,0 s“).
  Bei erkanntem Finger bleibt die Berührung jetzt bis 35 s gültig; unbekannte Finger verfallen weiter nach 5 s.

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- Eigene Hauptdateien: nur `config_version: "3.5.12"`.

## 3.5.11 – 2026-11-12

### Geändert
- **Reaktionszeit in der Ereignisliste aufgeschlüsselt** (so wie als Variante B gewählt): Jede Bedienung mit Messung bekommt
  eigene, an beiden Enden runde Kapseln mit Lücke – **Verbindung** (violett), **Fingerprint** (grau, Finger lesen +
  Statusabfrage, ab 0,1 s) und **Motor** (grün, Befehl gesendet → Motor dreht) –, darunter die Anteile in Sekunden
  („· war verbunden“, wenn kein Verbindungsaufbau nötig war). Rechts die Gesamtzeit in Ampelfarbe.
- **Kacheln oben:** Ø gesamt · Ø Verbindung · Max gesamt. Der Einzelbalken für die letzte Messung aus 3.5.10 entfällt.
- Die App ordnet jedes Ereignis der passenden Messung zu (Aktion, Gesamtzeit, Quelle); der Ereignistext in Home Assistant
  bleibt unverändert.

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- Eigene Hauptdateien: nur `config_version: "3.5.11"`.

## 3.5.10 – 2026-11-12

### Neu
- **Reaktionszeit-Messung überarbeitet:** Der Auslöser ist jetzt bei Fingerprint „Umschalten“ die **Berührung**
  (Finger aufgelegt), nicht erst das fertige Erkennen – unbekannte Finger ohne Schließbefehl erzeugen keine Messung.
  Zusätzlich wird ein Verbindungsaufbau, der schon während der Statusabfrage lief, korrekt mitgerechnet (vorher
  stand bei Fingerprint „Umschalten“ praktisch immer ~0,2 s, weil die Verbindungszeit außerhalb der Messung lag).
- **Aufschlüsselung der Reaktionszeit** in drei Anteile: **Verbindung** (violett, echter Verbindungsaufbau bis die
  Session steht), **Finger/Status** (Finger lesen + Statusabfrage) und **Schloss** (Befehl gesendet → Motor dreht).
  Die Startseiten-Karte zeigt die letzte Messung als breiten Balken mit zwei abgerundeten Kapseln (Verbindung/Schloss)
  mit Lücke, die Anteile darunter ausgeschrieben, sowie drei Kacheln Ø gesamt (mit Maximum) · Ø Verbindung · Ø Schloss.
- **Animierte Leiterbahnen am Haus:** Während eines echten Verbindungsaufbaus oder solange der Motor läuft, leuchten
  Knoten und Leiterbahnen nacheinander als Welle auf. Bei „Bewegung reduzieren“ bleiben nur die Bahnen hervorgehoben,
  ohne Animation.
- **Update-Prüfung ohne Zwischenspeicher:** Die Web-App fragt GitHub jetzt bei jedem Laden sofort nach der neuesten
  Release, statt das Ergebnis bis zu 12 Stunden im Browser zu behalten.

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- Eigene Hauptdateien: nur `config_version: "3.5.10"`.

## 3.5.9 – 2026-11-12

### Neu
- **Smarthome-Haus:** Das Bedienfeld ist jetzt ein Haus mit Leiterbahnen (Kontur in der Zustandsfarbe, helle Füllung,
  Knoten als Ringe). Zu und Auf haben einen farbigen **Doppelring mit Abstand**, die Haustür („Öffnen“) einen Ring in der Hausfarbe.
- **„Stand: vor … min“ wieder über dem Haus**, immer sichtbar, mit **Aktualisieren** daneben („gerade eben“, „vor 6 min“ …).
  Gelb, wenn keine Verbindung besteht und der Stand älter als 5 Minuten ist. Die Angabe „seit … · Quelle“ entfällt (steht in den Ereignissen).
- **Schlossantrieb einstellen:** Erklärung der drei Werte, Hinweis, danach über die Tasten am Schloss einmal zu- und wieder
  aufzuschließen (Kalibrierung), und eine Warnung, wenn die Einstellung mehrmals hintereinander übernommen wurde.
- **Warnung bei langem Motorlauf:** Läuft der Motor länger als 10 s (Öffnen 15 s), steht im Ereignisprotokoll
  „⚠️ Motor lief … s – Schlossantrieb prüfen/kalibrieren“ – typisch für falsche Antriebs-Werte oder fehlende Kalibrierung.

### Behoben
- **Falsche Reaktionszeiten** (z. B. 65,5 s): Eine Messung wird jetzt verworfen, wenn das Schloss den Befehl ohne Motorlauf
  beantwortet, innerhalb von 15 s nach dem Senden kein Motorlauf kommt, eine Handbedienung dazwischenkommt oder der Befehl
  ohne Messung abgeschlossen wurde. Bisher blieb die Messung offen und die nächste Bewegung (z. B. per Taste am Schloss) wurde mitgezählt.

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- Eigene Hauptdateien: nur `config_version: "3.5.9"`.

## 3.5.8 – 2026-11-12

### Neu
- **Bedienfeld als Haus (Startseite):** Das Haus färbt sich nach dem Zustand (grün verriegelt, rot aufgeschlossen, blau geöffnet,
  grau Motor läuft, gelb unbekannt), die **Haustür ist der Knopf „Öffnen“**, darunter **Zu** und **Auf** – der Knopf des aktuellen
  Zustands ist kräftig gefüllt. Über dem Dach steht, seit wann und wodurch (z. B. „seit 22:14 · Zeitplan 1“). „Stand: vor … min“,
  der Türgriff-Hinweis und die Erklärung bei „unbekannt“ stehen unter dem Haus.
- **Zustandsfarben tauschbar:** neue Auswahl **„Zustandsfarben“** (Einstellungen → Schloss): „Verriegelt grün“ (Standard) oder
  „Verriegelt rot“. Gilt für die Web-App, die Status-LED und die Bestätigung am Fingerprint-Ring. Grün/Rot für gut/schlecht
  (Reaktionszeit, Bluetooth, ✓/✗, Finger erkannt/abgewiesen) bleibt.
- **Version in der Kopfzeile:** Chip neben dem Zustand (z. B. „v3.5.8 ↗“), öffnet die Release-Übersicht auf GitHub. Gibt es eine
  neuere Release, leuchtet und pulsiert der Rahmen. Die Prüfung macht der Browser höchstens alle 12 Stunden über die
  GitHub-Schnittstelle – der ESP braucht dafür kein Internet; ohne Internet bleibt der Chip normal.

### Geändert
- **Fingerprint wartet bis 30 s auf die Verbindung** („Umschalten“ im Sparmodus), auch über gescheiterte Verbindungsversuche und
  die Meldung „nicht erreichbar“ hinweg (bisher 20 s bzw. Abbruch nach zwei Fehlversuchen). Kommt keine Verbindung zustande, wird
  nichts ausgeführt – auch nicht später.
- **Bluetooth:** Läuft nach einem Fehler schon der nächste Versuch, meldet der Sensor „Verbindungsfehler – neuer Versuch …“
  (Kachel: „Verbindungsfehler“, darunter „neuer Versuch …“, Symbol pulsiert).

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- Eigene Hauptdateien: `config_version: "3.5.8"`. Optional unter `select:` die Auswahl „Zustandsfarben“ aus
  `eqiva-smart-lock-1.yaml` übernehmen – ohne sie bleibt es bei verriegelt = grün, die Auswahl fehlt dann in der App:
  ```yaml
    - platform: template
      name: "Zustandsfarben"
      id: state_colors
      icon: "mdi:palette"
      options: ["Verriegelt grün", "Verriegelt rot"]
      initial_option: "Verriegelt grün"
      optimistic: true
      restore_value: true
      entity_category: config
      web_server:
        sorting_group_id: sg_lock_cfg
      on_value:
        - lambda: |-
            id(key_ble)->set_state_colors_swapped(i == 1);
            const std::string st = id(lock_status).state;   // LED und Fingerprint-Ring gleich in den neuen Farben
            if (!st.empty()) id(lock_status).publish_state(st);
  ```

## 3.5.7 – 2026-11-11

### Neu
- **Ereignisliste als Diagramm:** Jede Bedienung mit Messung zeigt ihre Reaktionszeit als Balken direkt in der Zeile
  (grün bis 4 s, gelb bis 8 s, rot darüber), Bedienungen von Hand stehen mit ✋ „von Hand“ dazwischen. Jede Zeile beginnt mit einem
  Piktogramm. So gibt die Liste lückenlos wieder, was am Schloss passiert ist. Das Balkendiagramm darüber entfällt.
- **zuletzt / Ø Mittel / Maximum als drei farbige Kacheln.** Die Farbe richtet sich nach dem jeweiligen Wert (gleiche Ampel wie die Balken).
- **Darstellung in der Kopfzeile** (Auto / Hell / Dunkel) als drei runde Knöpfe, der gewählte mit blauem Ring.
- **„⚙️ Schlossantrieb übernommen“** im Ereignisprotokoll: Das Schloss bestätigt „Schlossantrieb einstellen“ (Antwort 0x85),
  das wird jetzt erkannt und protokolliert.

### Geändert
- **Zustand „unbekannt“ wird entprellt:** Meldet das Schloss kurz „unbekannt“ (z. B. zwischen zwei Statusmeldungen), wird das erst nach
  3 Sekunden übernommen und der Zustand danach einmal neu abgefragt. In Home Assistant erscheint dadurch kein kurzes „Blockiert“ mehr.
- **Nach dem Pairing** fragt die Komponente den Zustand nach dem erneuten Verbinden selbst noch einmal ab (nach 8 und 16 s, falls noch keine
  Meldung kam). Der Einrichtungsstatus lautet „✅ Gekoppelt – Zustand wird abgefragt …“. Die Web-App weist darauf hin, dass ein neu
  gekoppeltes Schloss „unbekannt“ meldet, bis es sich einmal bewegt hat. „Fertig“ bleibt wie bisher sofort klickbar.
- **Fingerprint wartet auf den zweiten Verbindungsversuch:** Nach einem Verbindungsfehler (z. B. GATT-Fehler 133 bei schwachem Empfang)
  gibt der Fingerprint nicht mehr sofort auf, sondern wartet, bis die Komponente das Schloss als nicht erreichbar meldet (höchstens 20 s).

### Behoben
- **„Letzte Statusmeldung“** wurde mit Ortszeit, aber als UTC (`+00:00`) gesendet – in Home Assistant war die Zeit um 1–2 Stunden
  verschoben. Jetzt in UTC (`…Z`).

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- Eigene Hauptdateien: nur `config_version: "3.5.7"`. Keine neuen Pflichtblöcke. Wer mag, übernimmt aus `eqiva-smart-lock-1.yaml`
  den neuen Text „✅ Gekoppelt – Zustand wird abgefragt …“ (bisher „⏳ Verbunden, warte auf Antwort vom Schloss …“).

## 3.5.6 – 2026-11-10

### Neu
- **„Stand: vor … min“ auf der Startseite:** Besteht keine Verbindung und ist die letzte Statusmeldung des Schlosses älter als 5 Minuten,
  steht unter dem Zustand, wie alt er ist, mit dem Knopf **Aktualisieren**. So sieht man im Sparmodus, dass der Zustand veraltet sein kann
  (z. B. von Hand aufgeschlossen). Neuer Sensor **„Letzte Statusmeldung“** (Komponente, `last_status`) und Knopf **„Status abfragen“**.
- **Fingerprint im Sparmodus: Verbindung schon beim Auflegen.** Die Berührung startet den Verbindungsaufbau (nur Statusabfrage, kein
  Schließbefehl), während der Finger gelesen wird. Höchstens einmal pro Minute, nicht bei Sabotage-Alarm, Fehlversuch-Sperre oder beim
  Anlernen. Abschaltbar mit **„Bei Berührung vorab verbinden“** (Fingerprint Einstellungen, Standard an).

### Behoben
- Der Einrichtungsstatus zeigte während des Verbindungsaufbaus schon „🔄 Keine Verbindung: Empfang prüfen …“ (z. B. direkt nach
  Neustart oder Moduswechsel). Jetzt steht dort „🔄 Verbinde mit dem Schloss …“, die Warnung erst, wenn keine Verbindung zustande kommt.

### Hinweis
- Nach dem Verbindungsaufbau fragt die Komponente den Zustand schon immer sofort ab, wenn kein Befehl wartet (in allen Energiemodi,
  auch nach Neustart oder Abbruch). Daran ändert sich nichts.

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`), flashen.
- **⚠️ Handlungsbedarf für eigene Hauptdateien** (beide Blöcke stehen in `eqiva-smart-lock-1.yaml`):
  - unter `text_sensor:` beim Platform `eqiva_key_ble`:
    ```yaml
        last_status:
          name: "Letzte Statusmeldung"
          id: last_status_txt
          web_server:
            sorting_group_id: sg_diag
    ```
  - unter `button:`:
    ```yaml
      - platform: template
        name: "Status abfragen"
        id: status_btn
        icon: "mdi:refresh"
        web_server:
          sorting_group_id: sg_lock
        on_press:
          - eqiva_key_ble.status:
    ```
  Ohne die Blöcke fehlt nur die Anzeige „Stand: vor … min“. Dazu `config_version: "3.5.6"`.

## 3.5.5 – 2026-11-10

### Neu
- **Neue Kopfzeile in der Web-App** (auf allen Seiten): links das Schloss-Symbol in der Farbe des Zustands und der Zustand als Wort,
  rechts der Umschalter Automatisch · Hell · Dunkel und darunter die Uhrzeit des ESP. Ohne gültige Uhrzeit steht dort „⚠ --:--“
  (Zeitplan pausiert). Die Auswahl „Darstellung“ unter Einstellungen entfällt.
- **Kachel „Bluetooth“ auf der Startseite** neben „Energie“: Verbunden, Verbindungsaufbau, Idle, Schloss nicht gefunden, Verbindungsfehler –
  immer mit Bluetooth-Symbol, der Zustand über Farbe und Text. Im Sparmodus steht unter „Idle“ „verbindet bei Bedarf“.
  Dazu der neue Sensor **„Bluetooth“** in der Komponente (`ble_status`), auch in Home Assistant nutzbar.
- **Neuer Sensor „ESP Uhrzeit“** im Zeitplan-Paket (HH:MM, leer ohne gültige Uhrzeit).
- **Energiemodus erklärt:** unter der Auswahl in den Einstellungen eine kurze Erklärung zum gewählten Modus
  (bei Sparsam: der erste Befehl dauert ca. 3–5 s).

### Geändert
- In der großen Schloss-Kachel entfällt die Zeile „Verbunden“ bzw. „Sparsam – verbindet bei Bedarf“ (steht jetzt in der Bluetooth-Kachel).

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen (im Release `components/`, lokal laut `path:`, meist `eqiva_components/`), flashen.
- **⚠️ Handlungsbedarf für eigene Hauptdateien:** neuer Block unter `text_sensor:` beim Platform `eqiva_key_ble` übernehmen:
  ```yaml
      ble_status:
        name: "Bluetooth"
        id: ble_status_txt
        icon: "mdi:bluetooth"
        web_server:
          sorting_group_id: sg_lock
  ```
  Ohne den Block fehlt die Bluetooth-Kachel, sonst funktioniert alles. Dazu `config_version: "3.5.5"`.

## 3.5.4 – 2026-11-09

### Behoben
- **Öffnen wurde als Fehlschlag protokolliert**, wenn das Schloss danach nur „auf“ und nie „geöffnet“ meldet
  (z. B. am Tisch ohne Tür und Zylinder): nach 60 s stand „✗ öffnen … (keine Bestätigung)“ statt „🚪 …“.
  Jetzt zählt das Öffnen als ausgeführt, wenn 10 s nach „auf“ kein „geöffnet“ kommt (Zeitpunkt = Meldung „auf“).
- **Kurze Blockade durch die Sabotage-Prüfung** des Fingerprint-Sensors („interval took a long time“, bis ca. 1,5 s):
  Die Prüfung läuft nicht mehr im 1-s-Intervall und wartet, bis das Schloss nicht beschäftigt ist
  (Motor läuft, Verbindung wird aufgebaut). Der Sensorzugriff selbst blockiert weiterhin kurz, aber nicht mehr während einer Schlossaktion.
- **„Reaktionszeiten“ lief in der Expertenansicht über den Rand:** Die Einträge sind jetzt mit `; ` (Semikolon + Leerzeichen)
  getrennt, damit der Text umbricht. Die Web-App liest beide Schreibweisen.

### Neu
- **Fingerprint: 2× kurz grün direkt nach dem Erkennen**, auch wenn danach erst verbunden wird (türkis). Der Befehl geht dabei sofort raus.
- **Türgriff außen deutlicher erklärt:** Bei „Knauf“ steht auf der Startseite ein gelber Hinweis unter den Knöpfen
  („Öffnen“ und der Finger mit Umschalten/Öffnen ziehen die Falle, die Tür wird komplett geöffnet; „Auf“ schließt nur auf),
  in den Einstellungen eine Erklärung unter der Auswahl. Die Beschreibungen der Finger-Aktionen „Umschalten“ und „Öffnen“
  passen sich der Einstellung an.

### Update
- Pakete, `app.js` und den Komponenten-Ordner ersetzen, flashen. Im Release-ZIP bzw. Repo heißt der Ordner `components/`
  (darin `eqiva_ble/` und `eqiva_key_ble/`); lokal heißt er so, wie bei `path:` unter `external_components` eingetragen,
  in der Vorlage `eqiva_components/`.
- Eigene Hauptdatei: nur `config_version: "3.5.4"` setzen, sonst nichts ändern.

## 3.5.3 – 2026-11-09

### Neu
- **Zeitpläne mit zufälliger Abweichung:** pro Zeitplan „Genau“, „Früher“, „Später“ oder „Beides“ und 1–60 Minuten.
  Die Zeit wird einmal am Tag neu ausgewürfelt. Im Textfeld z. B. `an 22:00 Mo-So zu ±10`, `+15` (nur später) oder `-5` (nur früher).
  Die Anzeige „Zeitplan“ zeigt die heute ausgewürfelte Zeit, z. B. „Nächstes: Fr 22:07 zuschließen (22:00 ±10)“.
- **Mehr Kontrast in der Web-App:** dunklerer Hintergrund, Kacheln mit kräftigerem Rand und leichtem Schatten,
  Überschriften als farbige Titelleiste (hell und dunkel).

### Geändert
- **Handbedienung direkt nach einem Befehl wird erkannt** (z. B. zugeschlossen und gleich wieder von Hand aufgedreht).
  Das bisherige 40-s-Fenster nach jedem Befehl entfällt. Nur 10 s nach „Öffnen“ (Falle springt zurück) und nach einem
  nicht ausgeführten Befehl zählt eine Drehung nicht als „von Hand“.
- Die Startseiten-Karte heißt immer „Ereignisse und Reaktionszeit“, auch direkt nach einem Neustart
  (vorher zunächst nur „Ereignisse“). Ohne Einträge steht dort „Noch keine Ereignisse und Messungen seit dem Start.“

### Update
- Pakete, `app.js` und `eqiva_components/` ersetzen, flashen.
- Eigene Hauptdatei: nur `config_version: "3.5.3"` setzen, sonst nichts ändern.

## 3.5.2 – 2026-11-09

### Neu
- **Startseite: Karte „Ereignisse und Reaktionszeit“.** Oben zuletzt, Ø und max mit den 10 Balken und Piktogrammen,
  darunter wie bisher alle Ereignisse mit Uhrzeit (auch Handbedienung, Klingel, Abweisungen, Fehler).
  Bei Bedienungen mit Messung steht rechts die Reaktionszeit in Ampelfarbe.
- Die Ereignisse enthalten die Reaktionszeit jetzt auch im Text, z. B. `18:05 🔒 Zeitplan 1 (2,4 s)` (auch in Home Assistant sichtbar).
  Wegen der Grenze von 255 Zeichen passt dadurch eventuell ein Ereignis weniger in die Liste.
- Die Karte „Reaktionszeit“ unter Einstellungen und die Kachel „Reaktion“ auf der Startseite entfallen (Werte stehen jetzt in der neuen Karte).

### Update
- Pakete, `app.js` und `eqiva_components/` ersetzen, flashen.
- Eigene Hauptdatei: nur `config_version: "3.5.2"` setzen, sonst nichts ändern.

## 3.5.1 – 2026-11-09

### Neu
- **Reaktionszeiten zeigen, was passiert ist:** jeder Eintrag speichert jetzt die Aktion (zu, auf oder öffnen) und die Quelle (z. B. HA/Web, Zeitplan, Fingerprint, Taster), nicht nur die Dauer.
- Web-App: Die Balken der Reaktionszeit haben Piktogramme (zu = ausgefülltes Schloss, auf = offenes Schloss, öffnen = Tür).
  Darunter steht die Liste der letzten 10 Bedienungen, neueste oben, mit Aktion, Quelle und Ampelfarbe.

### Update
- Der Textsensor „Reaktionszeiten“ hat ein neues Format (`aktion|sekunden|quelle;…`). Die Web-App 3.5.1 kann nur dieses Format lesen, daher Komponente und App gemeinsam ersetzen.
- Eigene Hauptdatei: nur `config_version: "3.5.1"` setzen, sonst nichts ändern.

## 3.5.0 – 2026-11-08

### Neu
- **Reaktionszeit:** gemessen wird vom Absetzen des Befehls bis das Schloss meldet, dass der Motor läuft.
  - Sensor „Reaktionszeit“ (Sekunden, mit Verlauf in Home Assistant)
  - Textsensor „Reaktionszeiten“ mit den letzten 10 Werten
  - Web-App: Kachel „Reaktion“ auf der Startseite und Karte „Reaktionszeit“ unter Einstellungen mit Ø, max und Balken.
    Farben: grün bis 4 s, gelb bis 8 s, rot darüber.
- Die Messung gilt für alle Bedienungen (App, HA, Fingerprint, Zeitplan). Handbedienung wird nicht gemessen.

### Update
- Pakete, `app.js` und `eqiva_components/` ersetzen, flashen.
- **⚠️ Handlungsbedarf für eigene Hauptdateien:** Die Hauptdatei enthält jetzt zwei neue Blöcke.
  Wer eine eigene Kopie hat, übernimmt bitte:
  - unter `sensor:` beim Platform `eqiva_key_ble` den Eintrag `reaction_time:` (Name „Reaktionszeit“)
  - unter `text_sensor:` beim Platform `eqiva_key_ble` den Eintrag `reaction_list:` (Name „Reaktionszeiten“)
  Beide stehen in `eqiva-smart-lock-1.yaml`. Dazu `config_version: "3.5.0"`.
- Die Beispiel-YAML im Fork lädt die Komponente jetzt fest über den Release-Tag `@v3.5.0` statt `@main`.
  So passen YAML und Komponente immer zusammen; ein Update ist ein bewusster Schritt (Nummer hochsetzen).

## 3.4.0 – 2026-11-08

### Neu
- **Bis zu 6 Zeitpläne** statt 2. Jeder Zeitplan ist ein einziges Textfeld „Zeitplan 1“ … „Zeitplan 6“,
  z. B. `an 22:00 Mo-Fr zu` oder `aus 09:00 Sa,So auf` (leer = nicht belegt). Das spart Entitäten
  (6 statt bisher 8 für 2 Zeitpläne) und ist in HA/Expertenansicht von Hand bearbeitbar.
  Unlesbare Einträge meldet „Zeitplan“ als „Zeitplan N ungültig!“.
- Web-App: Zeitplan als kompakte Liste (Aktion, Uhrzeit, Wochentage, Schalter). Antippen öffnet
  ein Bearbeitungsfenster mit Uhrzeit, Aktion, Wochentagen, Schnellwahl (Mo–Fr, Sa+So, Täglich) und Löschen;
  „+ Zeitplan“ legt einen neuen an.

### Geändert
- Die Entitäten „Zeitplan N aktiv / Uhrzeit / Wochentage / Aktion“ sind entfallen (nur noch intern zum Übernehmen).
  Wer sie in Home-Assistant-Automationen oder Dashboards benutzt, muss auf „Zeitplan 1“ … „Zeitplan 6“ umstellen.

### Update
- Pakete, `app.js` und `eqiva_components/` ersetzen, flashen. In der eigenen Hauptdatei nur `config_version: "3.4.0"`.
  Die bisherigen Zeitpläne 1 und 2 übernimmt der ESP beim ersten Start automatisch (Log: „Zeitplan 1 übernommen: …“).

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

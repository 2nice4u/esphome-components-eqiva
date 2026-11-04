# Änderungen in diesem Fork

**Version 2.1.0** (2026-11-04) – Komponente, Beispiel-YAMLs und Anleitung tragen dieselbe Versionsnummer.
1.1.0: Fingerprint-Paket mit Zuordnung Person/Hand/Finger, Aktion pro Finger (inkl. Umschalten), Ring-Rückmeldung und Scan-Pause.
1.1.1: Pinbelegung als Substitutions, R503-Stromabschaltung per PNP-Transistor (sensor_power_pin), mehrere Status-LEDs.
1.2.0: Paket Zeitplan (2 Zeitpläne mit Uhrzeit, Wochentagen und Aktion, SNTP).
1.2.1: Kompilierfehler bei den Fingerprint-Globals behoben, Web-Login mit Digest.
1.2.2: Button „Letzten Finger zuordnen“ für früher angelernte Finger.
1.2.3: Speicherplatz in der Übersicht, ausführliche Liste im Log.
1.2.4: Speicherplatz per Nummer löschen, „Alle Finger löschen“ in der Web-GUI (2× drücken).
1.3.0: Pakete per use_…-Schalter (true/false) in den Substitutions ein-/ausschalten.
1.3.1: Grenzen (Personen, Finger) in Anleitung, README und Fingerprint-YAML dokumentiert.
1.4.0: Testmodus `simulate: true` – Schloss wird nachgebildet (kein BLE), zum Testen von Fingerprint, LED und Zeitplan.
1.5.0: Neue Ring-Farben (blau lesen, grün erkannt, rot nicht erkannt), Klingel bei unbekanntem Finger mit Verzögerung, Event-Entität „Klingel“.
1.5.1: Testmodus trennte im Sparmodus sofort nach dem Verbinden (behoben); Klingel auch bei schlecht aufgelegtem Finger; HA-Event optional.
1.5.2: Beim Anlernen keine Klingel und kein blaues Scan-Licht mehr.
1.5.3: Farben: grün = verriegelt, rot = aufgeschlossen (R503-Bestätigung und Status-LED).
1.5.4: Klingel am Ring als Regenbogen (2 Durchläufe).
1.6.0: Klingel-Anzeige am Ring in der Web-GUI wählbar.
1.7.0: Klingel-Pause einstellbar; Ring zeigt auch Bedienung ohne Finger (grün/rot/blau atmend).
1.8.0: Fingerzuordnung in der Web-GUI exportieren/importieren.
1.9.0: Zuordnung im Notizspeicher des R503 (zieht mit dem Sensor um), Belegungstabelle zeigt Plätze ohne Zuordnung.
1.10.0: Web-Export/-Import entfernt (Notizspeicher ersetzt ihn), kompaktere Übersicht „Angelernte Finger“.
1.10.1: Anlernen mit Ring-Rückmeldung je Bild (lila atmen, 2× grün, 2× gelb).
2.0.0: 16 Personen, Plätze 0–199, Speicherformat FP2, Anlernen wird abgelehnt wenn die Sicherung im Sensor voll wäre, Warnung unter 10 %, Übersicht nach Speicherplatz sortiert.
2.1.0: Person umbenennen (mit Zusammenführen nach Rückfrage).

Basis: github.com/digaus/esphome-components-eqiva, Stand `main` vom 22.08.2026 (Fix für ESPHome 2026.8).

## Installation

```yaml
external_components:
  - source: github://2nice4u/esphome-components-eqiva@main
    refresh: 1d
```

Vollständiges Beispiel mit Web-GUI, Energiemodi, Pairing-Info, optionalem R503-Fingerprint und Status-LED:
Ordner [`examples/`](examples/).

Wer vorher die Original-Komponente genutzt hat, sollte **neu pairen** (siehe Punkt 1 unten).

Optionen unter `eqiva_key_ble:`:

```yaml
eqiva_key_ble:
  id: key_ble
  command_timeout: 30s        # wartende Befehle verfallen danach (Standard 20 s)
  on_paired:                  # nach bestätigtem Pairing, Variable: user_id
    - logger.log:
        format: "Gekoppelt als User %d"
        args: [user_id]
```

## Änderungen

| # | Problem im Original | Auswirkung | Fix |
|---|---|---|---|
| 1 | User Key per `rand()` mit `srand(time(NULL))`, nur Zeichen `0-9a-z` | Schlüssel ist aus der Uhrzeit bzw. Uptime beim Pairing erratbar | 16 Bytes aus dem Hardware-Zufallsgenerator (`esp_fill_random`) |
| 2 | Wartender Befehl wird nie verworfen | Ein „open“ vom Fingerprint kann Minuten später ausgeführt werden, sobald die Verbindung wieder steht | Verfällt nach `command_timeout` (Standard 20 s) |
| 3 | Nur ein Platz für wartende Nachrichten, wird überschrieben | Ein Status-Poll kann ein wartendes „open“ verdrängen, das dann verloren geht | Befehle haben Vorrang vor Status-Abfragen |
| 4 | Retry nur, wenn der nächste Befehl kommt | Bei verlorener Nonce oder verlorenem Write-ACK bleibt die Kommunikation bis zum nächsten Poll (bis 4 min) stehen | Watchdog alle 500 ms: Nonce-Retry (3×, danach Reconnect), Write-Timeout, Neuaushandeln nach Auth-Fehler |
| 5 | Queue/Session beim Disconnect nicht geleert | Alte, mit der alten Nonce verschlüsselte Fragmente werden nach dem Reconnect gesendet | Reset bei DISCONNECT/CLOSE |
| 6 | Member nicht initialisiert (`currentMsg`, `requestPair`, `sending` …) | Zufälliges Verhalten nach dem Boot, im schlimmsten Fall Absturz | Initialwerte |
| 7 | `free()` auf mit `new` erzeugte Objekte | Undefiniertes Verhalten, Speicherleck bei jeder Nachricht | `delete` + virtueller Destruktor |
| 8 | Kein Null-Check bei den Characteristics | Absturz, wenn die Service-Discovery unvollständig ist | Prüfung + Reconnect |
| 9 | Security-Counter als `signed char` gelesen | Auf ESP32 (Xtensa) falscher Zähler ab Byte ≥ 0x80 → Auth-Fehler | Explizit als `uint8_t` lesen (beim C3/RISC-V war das schon korrekt) |
| 10 | Wartender Status-Poll blockiert das Pairing | Pairing hängt | Pairing hat Vorrang |
| 11 | `substr()` auf zu kurzem Card Key | Absturz bei Tippfehler | Längenprüfung |
| 12 | User/Card Key im Klartext im Log (`dump_config`, Pairing) | Schlüssel landen in Logs und im Web-Log | Nur „gesetzt“ bzw. VERBOSE |
| 13 | MAC- und BLE-Status bei jedem GATT-Event veröffentlicht, ohne Null-Check | Unnötiger Traffic, Absturz wenn ein Sensor fehlt | Nur bei Änderung, mit Null-Check |
| 14 | Jahr im Status-Request falsch berechnet (`tm_year - 2000`) | Falsche Uhrzeit ans Schloss | `tm_year - 100` |
| 15 | Write-Fehler (`status != OK`) ignoriert | Halbe Nachricht, Session kaputt | Session neu aushandeln |
| 16 | Nicht angelernter ESP verbindet alle ~6 s neu | Batterie im Schloss wird leergezogen, Ursache im Log unklar | Klare Meldung, automatisches Verbinden pausiert, bis Pair/Connect gedrückt wird |
| 17 | Pair Start ohne Pairing-Modus am Schloss | Pairing schlägt still fehl | Meldung „nicht im Pairing-Modus“, neuer Versuch bei jeder Verbindung (max. 2 min) |
| 18 | (neu) | – | Optionaler Sensor `rssi`: Empfang der aktiven Verbindung, alle 15 s, ohne MAC im YAML |
| 19 | (neu) | – | Energiemodi Schnell/Ausgewogen/Sparsam, live umschaltbar (siehe unten) |
| 20 | Keepalive nur über YAML-`interval` | Im Sparmodus würde der 4-min-Poll ständig neu verbinden | Keepalive/Status-Abfrage in der Komponente, abhängig vom Modus |
| 21 | Service Discovery mit ESP-IDF-Standardabstand | Verbindungsaufbau 2–4 s langsamer | 7,5 ms Abstand während Verbindungsaufbau/Discovery |
| 22 | Sparmodus wartet auf Scan-Ergebnis | Mehrere Sekunden Zusatzverzögerung | Direktes Verbinden bei Befehl |
| 23 | (neu) | – | Auslöser `on_paired` (Variable `user_id`), feuert nach bestätigtem Pairing |
| 24 | Pairing mit anderem Schloss bei bestehender Verbindung | Pairing-Versuch ging zuerst ans alte Schloss | Alte Verbindung wird bei neuer MAC zuerst getrennt |

Neuer Sensor:

```yaml
sensor:
  - platform: eqiva_key_ble
    rssi:
      name: "Schloss Signal"
```

## Energiemodi

Aus Lambdas aufrufbar (z. B. aus einem Template-Select):

```cpp
id(key_ble)->set_power_mode(0);              // 0 = schnell, 1 = ausgewogen, 2 = sparsam
id(key_ble)->set_balanced_interval_ms(100);  // Verbindungsabstand im Modus "ausgewogen"
id(key_ble)->set_idle_timeout(30000);        // Sparsam: trennen nach x ms Leerlauf (min. 5 s)
id(key_ble)->set_eco_poll_interval(1800000); // Sparsam: Status-Abfrage alle x ms (min. 1 min)
```

| Modus | Verbindung | Verbindungsabstand | Status |
|---|---|---|---|
| Schnell | dauerhaft | 30–50 ms | Keepalive nach 4 min Leerlauf |
| Ausgewogen | dauerhaft | einstellbar (Standard 100–120 ms) | Keepalive nach 4 min Leerlauf |
| Sparsam | nur bei Bedarf, trennt nach Leerlauf | 30–50 ms während der Verbindung | periodisch (Standard 30 min) |

Ob das Schloss längere Abstände annimmt, steht im Log: ESPHome meldet abgelehnte Parameter als
`Conn param update failed`.

Protokoll, Verschlüsselung und Nachrichtenformate sind unverändert.

## Getestet

- Syntaxprüfung mit g++ gegen nachgebaute ESPHome-Header (kein echter ESPHome-Build möglich).
- Simulation mit Address-/UB-Sanitizer: Befehl während Disconnect, Verfall nach Timeout,
  Nonce-Verlust mit Reconnect, Write-ACK-Verlust, Auth-Fehler, Counter ≥ 0x80, Pairing mit wartendem Poll,
  nicht angelernter ESP, Pairing-Modus, RSSI, alle drei Energiemodi, on_paired, Schlosswechsel (17 Szenarien).
- Am echten Schloss (ESP32-C3, ESPHome 2026.10, ESP-IDF 5.5) getestet: Pairing, Auf-/Zuschließen, Öffnen,
  Sparmodus, RSSI, Pairing-Erkennung. Modus „Ausgewogen“ und R503-Paket noch ohne Praxistest.

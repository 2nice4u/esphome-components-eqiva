# Eqiva Key-BLE – gepatchte Version

**Version 3.4.0** (2026-11-08) – Komponente mit Testmodus (simulate) und Ereignisprotokoll (`events`), passend zu den Beispiel-YAMLs und der Anleitung mit gleicher Version.

Basis: github.com/digaus/esphome-components-eqiva, Stand `main` vom 22.08.2026 (Fix für ESPHome 2026.8).

## Installation

1. Den Ordner `eqiva_components/` (mit `eqiva_ble/` und `eqiva_key_ble/` darin) in den ESPHome-Konfigordner
   von Home Assistant kopieren, also neben `eqiva-smart-lock-1.yaml` (meist `/config/esphome/`).
2. In der YAML:

   ```yaml
   external_components:
     - source:
         type: local
         path: eqiva_components
   ```

3. Optional: `command_timeout: 20s` unter `eqiva_key_ble:` (Standardwert 20 s).
4. **Danach neu pairen**, siehe Punkt 1 unten.

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
| 21 | Pairing mit anderem Schloss bei bestehender Verbindung | Pairing-Versuch ging zuerst ans alte Schloss | Alte Verbindung wird bei neuer MAC zuerst getrennt |
| 22 | (neu) | – | Testmodus `simulate: true`: kein BLE, Schloss wird nachgebildet (Fahrzeit, Sparmodus-Verbindung, „nicht erreichbar“) |
| 23 | (neu) | – | Ereignisprotokoll: optionaler Text-Sensor `events` (letzte 10 Ereignisse), Auslöser je Befehl (`set_cmd_source()`, sonst „HA/Web“), Erkennung „von Hand“, eigene Einträge über `log_event()` |
| 24 | (neu) | – | `forget_pairing()`: Kopplung vergessen (trennen, Schlüssel löschen, nicht mehr verbinden), z. B. beim Tausch des Schlosses |
| 25 | Pairing überschrieb Schlüssel/User-ID sofort | Gescheitertes Neu-Pairing machte eine funktionierende Kopplung ungültig | Neue Daten erst nach Bestätigung, sonst alte Kopplung wiederhergestellt; Status-Abfrage direkt nach dem Pairing |
| 26 | (neu) | – | `cancel_pair()`, Erreichbarkeit `unreachable_since()` (ab 2 gescheiterten Verbindungsversuchen), Ereignisse „Schloss nicht/wieder erreichbar“ |

Ereignisprotokoll (optional):

```yaml
text_sensor:
  - platform: eqiva_key_ble
    events:
      name: "Ereignisse"
```

Aus Lambdas: `id(key_ble)->set_cmd_source("Zeitplan 1");` direkt vor einem Befehl (gilt 3 s) und
`id(key_ble)->log_event("🔔 Klingel");` für eigene Einträge.

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
  nicht angelernter ESP, Pairing-Modus, RSSI, alle drei Energiemodi, on_paired, Schlosswechsel (17 Szenarien) und Testmodus (10 Szenarien).
- **Nicht** am echten Schloss getestet.

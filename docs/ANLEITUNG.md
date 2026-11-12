# Eqiva Smart Lock – Anleitung & Hilfe

Gilt für Version 3.5.9 (Komponente, Pakete und Web-App mit gleicher Versionsnummer).
Änderungen: [CHANGELOG.md](../CHANGELOG.md)

## Die Web-App

Unter `http://<IP des ESP>/` öffnet sich die Web-App (nach Benutzername und Passwort aus der `secrets.yaml`).
Sie läuft direkt auf dem ESP, auch ohne Internet, am Handy und am PC.

| Bereich | Inhalt |
|---|---|
| **Schloss** | Bedienfeld als Haus (Zustand, Haustür = Öffnen, Zu · Auf), Batterie, Empfang, Energiemodus, Bluetooth, „Ereignisse und Reaktionszeit“ |
| **Fingerprint** | Personen mit ihren Fingern; Finger antippen = Aktion ändern, neu anlernen, löschen; Stift = Person umbenennen; „+ Anlernen“ = Assistent |
| **Zeitplan** | bis zu 6 Zeitpläne als Liste: antippen = bearbeiten, Schalter Ein/Aus, + Zeitplan |
| **Einstellungen** | Einrichtung (Pairing, Schlossantrieb, Neustart), Energiemodus, Zustandsfarben, Türgriff, Fingerprint, Sabotage-Erkennung, Diagnose |

- **Kopfzeile** (auf allen Seiten): links das Schloss-Symbol in der Farbe des Zustands (grün zu, rot auf, blau geöffnet, grau Motor läuft) und der Zustand als Wort, daneben die **Version** (z. B. „v3.5.9 ↗“, öffnet die Release-Übersicht auf GitHub; leuchtet blau und pulsiert, wenn es eine neuere Version gibt); rechts der Umschalter **Automatisch · Hell · Dunkel** (drei runde Knöpfe, der gewählte mit blauem Ring) und darunter die **Uhrzeit des ESP**. Steht dort ein gelbes „⚠ --:--“, kennt der ESP keine Uhrzeit – der Zeitplan pausiert dann.
- **Bedienfeld (Startseite):** ein Smarthome-Haus mit Leiterbahnen in der Farbe des Zustands – grün verriegelt, rot aufgeschlossen, blau geöffnet, grau Motor läuft (Symbol dreht sich), gelb unbekannt. Die **Haustür ist der Knopf „Öffnen“**, darunter **Zu** und **Auf** mit farbigem Doppelring (der Knopf des aktuellen Zustands ist kräftig gefüllt).
- **Zustandsfarben** (Einstellungen → Schloss): „Verriegelt grün“ (Standard) oder „Verriegelt rot“. Gilt für Haus, Knöpfe, Kopfzeile, Ereignis-Symbole, Status-LED und die Bestätigung am Fingerprint-Ring. Grün/Rot für gut/schlecht (Reaktionszeit, Bluetooth, ✓/✗, Finger erkannt/abgewiesen) bleibt.
- **Update-Hinweis:** Die Web-App fragt höchstens alle 12 Stunden bei GitHub nach der neuesten veröffentlichten Release (das macht der Browser, nicht der ESP – der ESP braucht kein Internet). Ohne Internet bleibt der Versions-Chip einfach normal.
- **Kachel „Bluetooth“** (Startseite): **Verbunden** (grün) · **Verbindungsaufbau** (blau, Symbol pulsiert) · **Idle** (grau; im Sparmodus mit „verbindet bei Bedarf“ – das ist dort der Normalzustand) · **Schloss nicht gefunden** (gelb: ein Befehl kam bis zum Zeitlimit nicht zum Schloss durch) · **Verbindungsfehler** (rot: der Verbindungsaufbau ist gescheitert). Ein Fehler bleibt stehen, bis eine Verbindung klappt oder ein neuer Befehl kommt; läuft schon der nächste Versuch, steht darunter „neuer Versuch …“ (in Home Assistant: „Verbindungsfehler – neuer Versuch …“). In Home Assistant heißt der Sensor „Bluetooth“.
- **„Stand: vor … min“** (Startseite, über dem Haus): wie alt die letzte Statusmeldung des Schlosses ist („gerade eben“, „vor 6 min“ …), daneben **Aktualisieren** (fragt den Zustand sofort ab). Gelb, wenn keine Verbindung besteht und der Stand älter als 5 Minuten ist – der Zustand könnte dann veraltet sein (z. B. von Hand aufgeschlossen). Grundlage: Sensor „Letzte Statusmeldung“, Knopf „Status abfragen“.
- **Auf dem Handy wie eine App:** in Chrome die Seite öffnen, Menü ⋮ → „Zum Startbildschirm hinzufügen“.
- **Einrichtung** (Einstellungen): Schloss koppeln (Pairing-Assistent), Kopplung entfernen, Schlossantrieb einstellen, ESP neu starten.
- **Expertenansicht** (Einstellungen, ganz unten): die bisherige ESPHome-Tabelle mit allen Entitäten –
  für BLE-Einstellungen von Hand und die Log-Stufe.
  Sie wird aus dem Internet geladen. Zurück mit „← Zur App“.
- Die Bezeichnungen in dieser Anleitung („BLE Pair Card Key“, „Anlern-Scans“ …) sind die Namen der
  Entitäten in der Expertenansicht und in Home Assistant.

## 1. Werksreset (optional)

> Nötig, wenn das Schloss neu eingerichtet werden soll. Alle Benutzer und Einstellungen gehen verloren.

1. Batteriedeckel abziehen und **eine** Batterie herausnehmen.
2. Taste **Verriegeln** gedrückt halten und dabei die Batterie wieder einsetzen. Halten, bis die LED **schnell orange blinkt** (ca. 4 s), dann loslassen.
3. **Verriegeln** erneut ca. 4 s halten, bis die LED **grün** leuchtet.
4. Das Schloss fährt einmal auf „offen“ und startet neu.

## 2. Pairing (Schloss mit dem ESP koppeln)

**In der Web-App:** Einstellungen → Einrichtung → **„Schloss koppeln (Pairing)“**. QR-Code der Keycard mit der Handy-Kamera
oder Google Lens scannen, den Text kopieren und einfügen; der Assistent führt durch die Schritte.

**In der Expertenansicht:**

1. QR-Code der **Keycard** mit einer beliebigen QR-App scannen.
2. Den **kompletten Text** (beginnt mit `M001A…`) bei **BLE Pair Card Key** (Expertenansicht) einfügen und mit Enter bestätigen. Die MAC-Adresse wird daraus automatisch übernommen.
3. Am Schloss die Taste **Öffnen** ca. 5 s halten, bis die LED **schnell orange blinkt**.
4. Sofort **BLE Pair _Start_** drücken.
5. Fertig, wenn der **Einrichtungsstatus** ✅ zeigt („✅ Gekoppelt – Zustand wird abgefragt …“). Das Schloss trennt nach dem Pairing kurz die Verbindung; danach fragt der ESP den Zustand selbst ab.

> Ein neu gekoppeltes (oder zurückgesetztes) Schloss meldet **„unbekannt“**, bis es sich einmal bewegt hat. Dann einmal **Zu** oder **Auf** drücken.

**Pairing abbrechen:** Im Assistenten „Pairing abbrechen“ (Expertenansicht: Button „Pairing abbrechen“). Ein abgebrochenes
oder nicht bestätigtes Pairing ändert nichts: MAC-Adresse, Schlüssel und User-ID bleiben, auch nach einem Neustart.

**Schloss tauschen / Kopplung entfernen:** Einstellungen → Einrichtung → **„Kopplung entfernen“** (zweimal bestätigen).
Der ESP vergisst MAC-Adresse und Schlüssel und verbindet sich nicht mehr. Danach das neue Schloss wie oben koppeln.
Der ESP bleibt im alten Schloss als Benutzer angelernt – dort per Eqiva-App (Benutzerverwaltung) oder Werksreset austragen.

## 3. Nach einem Werksreset: Schloss einstellen

In der Web-App: Einstellungen → **„Schlossantrieb einstellen“**, dann „Am Schloss übernehmen“. In der Expertenansicht:

Unter **Schloss Einstellungen** Schließrichtung, Schlüsselposition und Umdrehungen wählen, dann **Lock Settings _Apply_** drücken.

Bestätigt das Schloss die Einstellung, steht in den Ereignissen **„⚙️ Schlossantrieb übernommen“**.

Die drei Werte werden immer zusammen geschickt:
- **Schließrichtung:** Richtung, in die der Knauf zum Zuschließen gedreht wird (von innen gesehen).
- **Schlüsselposition:** Stellung des Schlüssels, in der er sich abziehen lässt.
- **Umdrehungen:** volle Umdrehungen von ganz auf bis ganz zu.

> **Danach kalibrieren:** Im eingebauten Zustand einmal über die **Tasten am Schloss** zu- und wieder aufschließen – erst dann kennt das Schloss seine Endpunkte. Falsche Werte oder mehrfaches Übernehmen hintereinander bringen das Schloss durcheinander: „Auf“ reagiert nicht oder verzögert, der Motor läuft sehr lange. Dann Werte prüfen, **einmal** übernehmen und kalibrieren. Läuft der Motor länger als 10 s (Öffnen 15 s), steht in den Ereignissen „⚠️ Motor lief … s – Schlossantrieb prüfen/kalibrieren“.

## 4. Bedienung: Zuschließen, Aufschließen, Öffnen

| Button | Was passiert |
|---|---|
| **Zuschließen** | Riegel wird zugeschlossen |
| **Aufschließen** | Riegel wird aufgeschlossen, die Tür bleibt zu (Klinke drücken zum Öffnen) |
| **Öffnen** | aufschließen und **Tür komplett öffnen** (Schloss zieht die Falle kurz zurück) – Tür lässt sich auch mit Knauf aufziehen |

Was „Öffnen“ macht, hängt von der Auswahl **„Türgriff außen“** (Schloss Einstellungen) ab:

| Türgriff außen | „Öffnen“ bewirkt |
|---|---|
| **Knauf** (Standard) | Tür wird **komplett geöffnet** und lässt sich von außen aufziehen |
| **Türklinke** | wie „Aufschließen“ – die Klinke drückt man selbst. Ist das Schloss schon auf, passiert nichts. |

> Gilt für alle Wege: Web-GUI, Home Assistant (`lock.open`) und Fingerprint mit Aktion „Öffnen“ oder „Umschalten“. Bei „Knauf“ zeigt die Startseite das als gelben Hinweis unter den Knöpfen, die Einstellungen erklären es unter der Auswahl. Beim kompletten Öffnen meldet „Lock Status“ kurz **OPENED**, beim reinen Aufschließen nicht.

> **Am Tisch (ohne Tür und Zylinder)** findet das Schloss beim Öffnen keinen Anschlag: Der Motor dreht dann lange (ca. 25 s) und meldet danach nur „auf“. Die Ereignisse zeigen trotzdem „🚪 …“, sobald 10 s nach „auf“ kein OPENED kommt. Zum Testen am Tisch „Türgriff außen“ auf **Türklinke** stellen.

**Ereignisse** zeigt die letzten 10 Ereignisse, neueste zuerst, z. B. `18:42 🔓 Max R-Daumen (1,6 s) · 18:05 🔒 Zeitplan 1 (2,4 s) · 17:30 🖐 🔓 von Hand · 06.11. 22:10 🔔 unbekannter Finger`. **HA/Web** = Home Assistant oder die Web-GUI · **🖐 von Hand** = Schlüssel, Drehknauf oder Taste am Schloss · **✗** = Befehl nicht ausgeführt (Grund in Klammern) · ⛔ abgewiesen · ❓ unbekannter Finger · ⚠️ Sabotage. Ältere Einträge fallen weg, wenn die 255 Zeichen von Home Assistant voll sind; alle stehen im Log. „Von Hand“ erkennt der ESP, sobald das Schloss den neuen Zustand meldet – auch direkt nach einem Befehl (z. B. zugeschlossen und gleich wieder von Hand aufgedreht). Nur 10 s nach „Öffnen“ (Falle springt zurück) und nach einem nicht ausgeführten Befehl zählt eine Drehung nicht. Im Energiemodus „Sparsam“ meldet das Schloss nur, solange die Verbindung besteht (nach einem Befehl standardmäßig 30 s); sonst sieht der ESP die Handbedienung erst beim nächsten Verbinden und nur den Endzustand. Nach einem Neustart ist die Liste leer.

## 5. Eqiva-App zusätzlich nutzen

Das Schloss erlaubt nur **eine** Bluetooth-Verbindung gleichzeitig. Vor der App **BLE Settings _Disconnect_** drücken, danach **BLE Settings _Save_**.

## 6. Energiemodus (Batterie im Schloss)

- **Schnell**: Dauerverbindung, Tür öffnet am schnellsten, höchster Batterieverbrauch.
- **Ausgewogen**: Dauerverbindung mit längerem Verbindungsabstand (Standard 100 ms). Spart Batterie, Befehle brauchen etwas länger.
- **Sparsam**: Verbindet nur bei Bedarf und trennt nach Leerlauf (Standard 30 s). Der erste Befehl dauert ca. 3–5 s. Mit Fingerprint baut der ESP die Verbindung schon beim Auflegen auf („Bei Berührung vorab verbinden“, Fingerprint Einstellungen, Standard an, höchstens einmal pro Minute) – der Befehl geht dann schneller raus. Der Status wird periodisch abgefragt (Standard alle 30 min). Wird das Schloss von Hand bedient, sieht Home Assistant das erst bei der nächsten Abfrage.

> Umschalten wirkt sofort, ohne neu zu flashen. In der Web-App steht unter der Auswahl eine kurze Erklärung zum gewählten Modus.

## 7. Bluetooth-Empfang („Schloss Signal“)

| Wert | Bewertung | Erwartung |
|---|---|---|
| -70 dBm und besser | 🟢 gut | zuverlässig, schnelle Verbindung |
| -70 bis -85 dBm | 🟡 mittel | funktioniert, gelegentlich längere Verbindungszeiten |
| schlechter als -85 dBm | 🔴 schlecht | Fehlversuche und lange Wartezeiten wahrscheinlich |

> Je näher an 0, desto besser (-60 ist besser als -80). Der Wert wird während einer Verbindung alle 15 s gemessen; im Sparmodus bleibt nach dem Trennen der letzte Wert stehen.

## 7a. Reaktionszeit

Gemessen wird die Zeit vom Absetzen des Befehls (App, HA, Fingerprint, Zeitplan) bis das Schloss meldet, dass der Motor läuft. Im Sparmodus ist der Verbindungsaufbau mit dabei, bei bestehender Verbindung nicht.

- **Startseite → Ereignisse und Reaktionszeit:** oben drei Kacheln **zuletzt · Ø Mittel · Maximum** der letzten 10 Bedienungen, jede in der Ampelfarbe ihres Werts.
- Darunter alle Ereignisse mit Uhrzeit und Piktogramm (zu = ausgefülltes Schloss, auf = offenes Schloss, öffnen = Tür; auch Klingel, Abweisungen, Fehler). Bedienungen mit Messung haben einen Balken mit der Reaktionszeit, Handbedienung steht als ✋ „von Hand“ dazwischen – die Liste ist zugleich das Diagramm.
- Farben: **grün** bis 4 s · **gelb** bis 8 s · **rot** darüber.
- Der Sensor „Reaktionszeit“ (Sekunden) ist in Home Assistant mit Verlauf verfügbar. Die Liste „Reaktionszeiten“ enthält die letzten 10 Bedienungen mit Aktion, Dauer und Quelle. Die Ereignisse enthalten die Reaktionszeit im Text, z. B. „18:05 🔒 Zeitplan 1 (2,4 s)“. Nach einem Neustart sind beide Listen leer.
- Keine Messung gibt es, wenn das Schloss den Befehl ohne Motorlauf beantwortet (z. B. schon im Zielzustand), innerhalb von 15 s nach dem Senden kein Motorlauf kommt oder zwischendurch eine Handbedienung erkannt wird – so landen keine falschen Werte (z. B. 65 s) in der Statistik.

Der Motorlauf bis zum Endzustand (ca. 3–4 s) ist Mechanik und nicht enthalten.

## 8. Fingerprint (nur mit R503)

**In der Web-App:** Fingerprint → **„+ Anlernen“** führt Schritt für Schritt (Person, Finger, Aktion, dann Auflegen mit Fortschrittsanzeige).

**Anlernen in der Expertenansicht / Home Assistant** (Gruppe „Fingerprint Anlernen“):

1. **Person** eintragen, **Hand** und **Finger** wählen.
2. **Aktion dieses Fingers** wählen (siehe Tabelle).
3. **Finger anlernen** drücken. Ring **blau atmend**: Finger **einmal zur Prüfung** auflegen. Ist er schon gespeichert (auch unter anderem Namen), wird abgebrochen und „Letzte Aktion“ zeigt, als wer („schon angelernt als Max R-Daumen (#3)“). Wird er nicht erkannt, kommt „Nicht erkannt – noch einmal auflegen“: ein zweites Mal auflegen (ein schief aufgelegter Finger wird sonst für neu gehalten). Ist er neu (oder genau dieser Finger soll neu angelernt werden), geht es weiter. Liegt noch kein Finger im Sensor, entfällt die Prüfung.
4. Den Finger so oft auflegen, wie „Anlern-Scans“ angibt. Ring **lila atmend** = Finger auflegen · **2× grün** = Bild ok, abheben und erneut auflegen · **2× gelb** = schief aufgelegt, nochmal · **grün atmend** = fertig. „Letzte Aktion“ zeigt „Bild 2 von 5 ok“. Danach vergleicht der Sensor das fertige Muster mit allen anderen Plätzen: Ist der Finger dort schon gespeichert, wird er **nicht** übernommen („Doppelt: dieser Finger ist schon …“).

Die Übersicht **„Angelernte Finger“** zeigt alle Finger, z. B. `#0 St R-Daumen ⇄ · #1 St L-Daumen ⇄ · #8 ohne Zuordnung` (# = Speicherplatz im Sensor). Passt nicht alles hinein, endet sie mit „+N weitere (siehe Log)“. Kurze Namen (z. B. „St“) zeigen mehr Finger.

- **Finger wird schlecht erkannt:** dieselbe Person/Hand/Finger wählen und erneut **Finger anlernen** – der alte Abdruck wird überschrieben.
- **Person umbenennen** (z. B. „Maximilian“ → „Max“): bei **Person** den alten, bei **Neuer Name** den neuen Namen eintragen, **Person umbenennen** drücken. Finger, Plätze und Aktionen bleiben, nichts neu anlernen. Gibt es den neuen Namen schon, fragt der ESP nach: innerhalb von 10 s erneut drücken führt beide Personen zusammen. Haben beide denselben Finger (z. B. beide R-Daumen), wird abgelehnt – erst einen davon löschen.
- **Aktion ändern:** Finger auswählen, neue Aktion wählen, **Aktion übernehmen**.
- **Entfernen:** Finger auswählen, **Finger löschen**. Einzelnen Platz per Nummer (auch ohne Zuordnung): **Speicherplatz (Nr.)** eintragen, **Speicherplatz löschen**. **Alle Finger löschen**: innerhalb von 10 s zweimal drücken.
- **Schon früher angelernte Finger** (Anzahl: „Fingerabdrücke gespeichert“): **Fingerprint aktiv** ausschalten, Finger auflegen – „Letzte Aktion“ zeigt „Platz X (ohne Zuordnung)“. Dann Person/Hand/Finger/Aktion wählen und **Letzten Finger zuordnen** drücken. Danach **Fingerprint aktiv** wieder einschalten.

| Aktion | Was passiert |
|---|---|
| ⇄ **Umschalten** | Schloss zu → öffnen (wie Button „Öffnen“, beachtet „Türgriff außen“); Schloss offen → zuschließen. Ohne Verbindung wird zuerst der aktuelle Status geholt. |
| 🔓 **Aufschließen** | nur aufschließen |
| 🔒 **Zuschließen** | nur zuschließen |
| 🚪 **Öffnen** | wie Button „Öffnen“ |
| 🔔 **Nur Klingel** | keine Schlossaktion, löst die Klingel aus (siehe unten) |
| ⛔ **Gesperrt** | Finger vorübergehend deaktiviert, ohne ihn zu löschen |
| **Standard** | nutzt „Standard-Aktion“ (Fingerprint Einstellungen) |

**Ring-Farben:**

| Ring | Bedeutung |
|---|---|
| 🔵 blau | Finger wird gelesen |
| 🟢 2× kurz grün | Finger erkannt (kommt sofort, auch wenn erst noch verbunden wird) |
| 🟢 grün atmend | Aktion läuft. Finger darf weg. |
| 🟢 grün, 2 s an | bestätigt: **verriegelt** (bei Zustandsfarben „Verriegelt rot“: rot) |
| 🔴 rot, 2 s an | bestätigt: **aufgeschlossen / geöffnet** (bei „Verriegelt rot“: grün) |
| 🔴 rot atmend | Finger nicht erkannt |
| 🔴 rot blinkend | Fehler: Schloss nicht erreicht oder Status unbekannt · beim Anlernen: Finger schon angelernt · schnell (6×): Sabotage-Alarm |
| 🔵 blau atmend | Anlernen: Finger einmal zur Prüfung auflegen |
| 🩵 türkis atmend | verbinde mit dem Schloss (Sparmodus, „Umschalten“ holt zuerst den Zustand) – Finger darf weg |
| 🟣 lila blinkend | abgewiesen (Fingerprint aus, Sperre nach Fehlversuchen, Übereinstimmung zu gering, Finger gesperrt, Sabotage-Alarm) |
| 🟡 gelb blinkend | Finger schlecht aufgelegt – nochmal versuchen |
| 🌈 Regenbogen (Standard) | Klingel – Muster wählbar unter „Klingel-Anzeige“: Regenbogen, Weiß atmen, Blau blinken, Rot/Blau, Gelb/Grün oder Aus |
| 🟣 lila atmend | Anlernen: Finger auflegen (nach 2× grün: abheben und erneut auflegen) |
| 🟢 / 🔴 / 🔵 atmend (2×) | Schloss wurde **ohne Finger** bedient (HA, Web-GUI, Zeitplan, Schlüssel): grün = zugeschlossen, rot = aufgeschlossen, blau = geöffnet. Abschaltbar: „Ring-Anzeige bei Bedienung ohne Finger“. |

**Status-LED am ESP** (WS2812): 🟢 grün = verriegelt · 🔴 rot = aufgeschlossen (bei Zustandsfarben „Verriegelt rot“ umgekehrt) · 🔵 blau = geöffnet · 🟠 orange pulsierend = Motor läuft · 🟣 lila blinkend = unbekannt.

**Klingel:** Mit **„Klingel bei unbekanntem Finger“** (Fingerprint Einstellungen) klingelt ein nicht erkannter Finger, ebenso Finger mit der Aktion „Nur Klingel“. In Home Assistant erscheint das als Entität **„Klingel“** (für Automationen, z. B. Push-Nachricht). Damit es nicht klingelt, wenn der eigene Finger einmal schlecht gelesen wird, wartet der ESP die **„Klingel-Verzögerung“** (Standard 5 s): Wird in dieser Zeit ein bekannter Finger erkannt, klingelt es nicht. Danach folgt die einstellbare **„Klingel-Pause“** (Standard 30 s). Auch ein schlecht aufgelegter Finger (gelb) löst die Klingel nach der Verzögerung aus.

**Zuordnung sichern / umziehen:** Die Abdrücke liegen im R503, die Zuordnung (Person, Hand, Finger, Aktion) auf dem ESP **und zusätzlich im Notizspeicher des R503** (wird nach jeder Änderung automatisch gesichert). Kommt der Sensor an einen neuen ESP ohne Zuordnung, übernimmt dieser sie beim Start von selbst. Von Hand: **Zuordnung aus Sensor laden**. Die vollständige Liste mit Speicherplätzen steht nach jedem Start und jeder Änderung im Log.

„Angelernte Finger“ zeigt auch Plätze, die im Sensor belegt sind, aber keine Zuordnung haben (*ohne Zuordnung: #3*) – zuordnen mit „Letzten Finger zuordnen“ oder löschen mit „Speicherplatz löschen“.

**Grenzen:** max. **16 Personen**, Plätze 0–199. Wie viele Finger zugeordnet werden können, bestimmt die Sicherung im Sensor (512 Byte): ca. **55 Finger** bei kurzen Namen, mit langen etwas weniger. Passt eine neue Zuordnung nicht mehr hinein, wird das Anlernen **abgelehnt**. Wird eine Grenze knapp (unter 10 %), steht ⚠️ in „Letzte Aktion“ und „⚠️ fast voll“ am Ende der Übersicht. Gedacht für Haushalte, nicht als Zutrittskontrolle für Firmen.

> Den Finger nach dem Erkennen einfach abnehmen. Solange eine Aktion läuft und noch „Scan-Pause nach Aktion“ (Standard 3 s) danach, werden weitere Scans ignoriert – so schaltet „Umschalten“ nie zweimal. Was zuletzt passiert ist, steht in **„Fingerprint: Letzte Aktion“**.

## 9. Zeitplan

Bis zu **6 Zeitpläne**, z. B. „täglich 22:00 zuschließen“, „Mo–Fr 07:45 zuschließen“, „Sa+So 09:00 aufschließen“.

**In der Web-App** (Reiter Zeitplan): jede Zeile zeigt Aktion (🔒 grün = zuschließen, 🔓 rot = aufschließen), Uhrzeit und Wochentage, rechts der Schalter Ein/Aus. Zeile antippen = bearbeiten (Uhrzeit, Aktion, Wochentage oder Schnellwahl Mo–Fr / Sa+So / Täglich, zufällige Abweichung, Löschen). **+ Zeitplan** legt einen neuen an.

**Zufällige Abweichung:** damit nicht jeden Tag auf die Minute genau geschlossen wird. Im Bearbeitungsfenster **Genau · Früher · Später · Beides** wählen und die Minuten (1–60) mit − / + oder per Eingabe einstellen. Darunter steht der Zeitraum im Klartext, z. B. „Zuschließen zufällig zwischen 21:50 und 22:10 Uhr“. Die Zeit wird für jeden Zeitplan einmal am Tag neu ausgewürfelt; in der Liste steht die Abweichung unter der Uhrzeit (z. B. „±10 min“). Für „auf“ empfiehlt sich **Später**, dann öffnet das Schloss nie vor der eingestellten Zeit.

**Von Hand** (Expertenansicht, Home Assistant): jeder Zeitplan ist ein Textfeld **„Zeitplan 1“ … „Zeitplan 6“**:

| Text | Bedeutung |
|---|---|
| `an 22:00 Mo-So zu` | täglich 22:00 zuschließen |
| `an 07:45 Mo-Fr zu` | werktags 07:45 zuschließen |
| `aus 09:00 Sa,So auf` | ausgeschaltet (bleibt gespeichert) |
| `an 22:00 Mo-So zu ±10` | täglich zufällig zwischen 21:50 und 22:10 zuschließen (`+-10` geht auch) |
| `an 06:30 Mo-Fr auf +15` | werktags zufällig zwischen 06:30 und 06:45 aufschließen (nie früher) |
| `an 07:45 Mo-Fr zu -5` | werktags zufällig zwischen 07:40 und 07:45 zuschließen (nie später) |
| *(leer)* | nicht belegt |

`an`/`aus` (ohne Angabe: an) · Uhrzeit `HH:MM` · Wochentage · `zu`/`auf` (ohne Angabe: zu) · optional Zufall `+N` / `-N` / `±N` (N = 1–60 Minuten). Ein Zeitraum über Mitternacht wird bei 00:00 bzw. 23:59 gekappt. Reihenfolge und Groß-/Kleinschreibung egal. Ist ein Text nicht lesbar, steht in „Zeitplan“ **„Zeitplan N ungültig!“** und die App zeigt die Zeile gelb.

| Wochentage | Bedeutung |
|---|---|
| `Mo-So` oder `täglich` (oder weglassen) | jeden Tag |
| `Mo-Fr` | Montag bis Freitag |
| `Sa,So` | Wochenende |
| `Mo-Do,So` | Montag bis Donnerstag und Sonntag |
| `Fr-Mo` | Freitag bis Montag (über das Wochenende) |

Fallen zwei Zeitpläne auf dieselbe Minute, gilt der mit der kleineren Nummer. Beim Update von einer Version vor 3.4.0 übernimmt der ESP die bisherigen Zeitpläne 1 und 2 beim ersten Start automatisch.

Die Anzeige **„Zeitplan“** zeigt den nächsten Termin (mit Zufall: die heute ausgewürfelte Zeit, z. B. „Fr 22:07 zuschließen (22:00 ±10)“) und das letzte Ergebnis (✓ bestätigt, ✗ Schloss hat nicht reagiert). Ohne Bestätigung wird bis zu 3× im Minutenabstand wiederholt.

> Die Uhrzeit kommt per SNTP aus dem Internet, ersatzweise von Home Assistant – der Zeitplan läuft also auch ohne HA. Ohne gültige Uhrzeit pausiert er (Meldung in „Zeitplan“).

## 10. Testmodus (ohne Schloss)

Zum Testen von Fingerprint, LEDs und Zeitplan, ohne das Schloss zu belasten: in der YAML `use_simulation: "true"` setzen und flashen. Das Schloss wird nachgebildet, „Einrichtungsstatus“ zeigt 🧪 TESTMODUS.

- **Simulation: Fahrzeit** – wie lange der „Motor“ läuft (MOVING).
- **Simulation: Schloss erreichbar** – aus = Schloss nicht erreichbar, Befehle verfallen (testet die rote Fehleranzeige).
- **Simulation: von Hand drehen** – als würde jemand den Schlüssel drehen („🖐 von Hand“ in „Ereignisse“).
- Energiemodus „Sparsam“ simuliert auch den Verbindungsaufbau (ca. 2 s).

> Für den Betrieb am Schloss wieder `use_simulation: "false"` setzen. Angelernte Finger und Einstellungen bleiben erhalten.

## 11. Sicherheit

**Montage:** Nur der Sensor gehört nach außen. ESP, Transistor und das Kabel zum Sensor bleiben innen und dürfen von außen nicht erreichbar sein – wer an das Kabel kommt, kann dem ESP einen „erkannten Finger“ vorspielen. Den Sensor von innen verschrauben bzw. verkleben, sodass er sich von außen nicht herausziehen lässt.

**Sensor-Passwort** (empfohlen): Ohne Passwort kann jeder, der den Sensor abschraubt, ihn an einem eigenen Gerät auslesen oder Finger hinzufügen. So setzen Sie eines (8 Hex-Ziffern, z. B. `0x1A2B3C4D`):

1. In `eqiva-smart-lock-fingerprint.yaml` bei `fingerprint_grow:` die Zeile `new_password: 0x…` aktivieren und flashen. Der ESP schreibt das Passwort einmalig in den Sensor.
2. Danach `new_password` wieder auskommentieren, denselben Wert bei `password: 0x…` eintragen und erneut flashen.
3. Prüfen: Finger auflegen muss weiter funktionieren. Das Passwort sicher aufbewahren (Passwortmanager) – ohne es lässt sich der Sensor an einem anderen ESP nicht mehr verwenden.

**Namen im Sensor:** Die Zuordnung (Personennamen, Hand, Finger) liegt zusätzlich im Notizspeicher des Sensors und ist damit mit dem Sensor auslesbar. Kürzel statt voller Namen verwenden (z. B. „St“, „Kind1“); mit Sensor-Passwort ist das Auslesen deutlich erschwert.

**Sabotage-Erkennung** (Gruppe „Sabotage-Erkennung“, jede einzeln abschaltbar):

| Erkennung | Löst aus, wenn … |
|---|---|
| Sensor antwortet nicht | der Sensor bei der regelmäßigen Prüfung zweimal nicht antwortet (Kabel getrennt, Sensor entfernt) |
| Belegung verändert | im Sensor ein Abdruck dazugekommen oder verschwunden ist, ohne dass er über die Web-GUI angelernt oder gelöscht wurde |
| Fremder Sensor | der Notizspeicher nicht mehr die gesicherte Zuordnung enthält (Sensor getauscht) – wird auch nach einem Neustart erkannt |
| Unmöglicher Treffer | ein „erkannter Finger“ auf einem Platz gemeldet wird, der im Sensor leer ist. Es wird nichts ausgeführt. |
| Berührungsleitung dauerhaft | der Sensor länger als „Max. Berührungsdauer“ (Standard 60 s) Berührung meldet (Kurzschluss, blockierter Sensor) |
| Alarm bei Fehlversuch-Sperre | „Max. Fehlversuche“ erreicht wurde (Standard **aus**, da das auch bei Besuchern oder Kindern passiert) |

Bei einem Alarm: **„Fingerprint Sabotage“** wird „an“ (in Home Assistant als Manipulationssensor für Automationen, z. B. Push-Nachricht), in der Web-App erscheint oben ein rotes Band **Sabotage-Alarm** (mit „Quittieren“), der Grund steht in „Letzte Aktion“ und „Ereignisse“, und – solange **„Bei Sabotage Fingerprint sperren“** an ist – öffnet kein Finger mehr. Der Alarm bleibt auch nach einem Neustart, bis Sie den Sensor geprüft und **„Sabotage quittieren“** gedrückt haben (unabhängig von „Fingerprint Sperre aufheben“). Was dabei im Sensor vorgefunden wurde, gilt danach als richtig. Wurde der Sensor bewusst getauscht: quittieren, dann „Alle Finger löschen“ und neu anlernen.

> Die Prüfung läuft alle „Sabotage-Prüfintervall“ Minuten (Standard 10) und nur, wenn am Sensor gerade nichts passiert. Der Sensor wird dafür kurz eingeschaltet (Ring geht dabei kurz aus).

## Wenn es nicht klappt

- **„⚠️ Schloss nicht erreichbar seit …“** (Einrichtungsstatus, App, „Ereignisse“): zwei Verbindungsversuche hintereinander
  gescheitert. Batterien des Schlosses und Abstand zum ESP prüfen. Sobald eine Verbindung wieder klappt, steht dort
  „✓ Schloss wieder erreichbar“. Ein Verbindungsversuch dauert höchstens `ble_connect_timeout` (Standard 12 s).
  Der Fingerprint („Umschalten“ im Sparmodus) wartet bis zu 30 s auf die Verbindung, auch über gescheiterte Versuche (z. B. GATT-Fehler 133 bei schwachem Empfang) hinweg; der Ring atmet dabei türkis. Kommt bis dahin keine Verbindung zustande, wird nichts ausgeführt – auch nicht später.

- **Zustand „unbekannt“:** Kurze „unbekannt“-Meldungen übernimmt der ESP erst nach 3 s und fragt dann einmal nach. Bleibt es dabei, steht das Schloss wirklich zwischen zwei Positionen (halbe Drehung, Riegel klemmt) oder ist frisch gekoppelt – einmal **Zu** oder **Auf** drücken.

- **„Versionskonflikt …“ beim Kompilieren** oder **„Firmware v… – App v…: Dateien passen nicht zusammen“** in der Web-App: Dateien unterschiedlicher Versionen gemischt. Alle Pakete, `eqiva-smart-lock-app.js` und den Ordner `eqiva_components` aus derselben Version verwenden (in eigenen Kopien der Hauptdatei `config_version` anpassen). Für Tests: `version_check: "false"`.
- **Sabotage-Alarm ohne Grund** (z. B. „Sensor antwortet nicht“ bei Wackelkontakt): Kabel prüfen, quittieren. Tritt er wiederholt auf, die betreffende Erkennung in „Sabotage-Erkennung“ abschalten und im Log (`[fp]`) nachsehen.
- **Anlernen klappt nicht** (z. B. bei Kinderfingern): „Anlern-Scans“ auf 4 stellen, Finger mittig und flach mit der Kuppe auflegen und zwischen den Bildern nur leicht versetzen. Trockene Haut kurz anhauchen.
- **„nicht im Pairing-Modus“** im Log: Öffnen-Taste länger halten, bis die LED orange blinkt.
- **„Card key fehlt oder ungültig“**: Nicht der komplette QR-Text eingefügt. Das Feld ist nach jedem Neustart leer.
- **„nicht (mehr) angelernt“**: Neu pairen (Schritt 2).
- **Einrichtungsstatus ⚠️ „User ID … eingestellt, gekoppelt wurde User …“**: Bei **BLE Settings User ID** die Nummer aus **Pairing-Info** eintragen und **BLE Settings _Save_** drücken.
- **Schloss Signal unter -85 dBm**: ESP näher ans Schloss, Antenne ausrichten oder bessere Antenne.

> Keycard bzw. QR-Text sicher aufbewahren (z. B. Passwortmanager). Ohne ihn ist nach einem Reset kein Pairing möglich.

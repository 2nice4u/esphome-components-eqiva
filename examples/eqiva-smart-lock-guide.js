// Anleitung für die ESPHome-Web-GUI des Eqiva Smart Lock.
// Version 2.1.0 (2026-11-04) – alle Dateien mit gleicher Version gehören zusammen (inkl. eqiva_components)
// Wird über "web_server: js_include: eqiva-smart-lock-guide.js" in die Firmware eingebettet
// und als aufklappbarer Textblock über der Web-GUI angezeigt (keine Entitäten).

const GUIDE_VERSION = "2.1.0";

const GUIDE_HTML = `
<summary>📖 Anleitung &amp; Hilfe <span class="eg-ver">v${GUIDE_VERSION}</span></summary>
<div class="eg-body">

  <h3>1. Werksreset (optional)</h3>
  <p class="eg-note">Nötig, wenn das Schloss neu eingerichtet werden soll. Alle Benutzer und Einstellungen gehen verloren.</p>
  <ol>
    <li>Batteriedeckel abziehen und <b>eine</b> Batterie herausnehmen.</li>
    <li>Taste <b>Verriegeln</b> gedrückt halten und dabei die Batterie wieder einsetzen.
        Halten, bis die LED <b>schnell orange blinkt</b> (ca. 4&nbsp;s), dann loslassen.</li>
    <li><b>Verriegeln</b> erneut ca. 4&nbsp;s halten, bis die LED <b>grün</b> leuchtet.</li>
    <li>Das Schloss fährt einmal auf „offen“ und startet neu.</li>
  </ol>

  <h3>2. Pairing (Schloss mit dem ESP koppeln)</h3>
  <ol>
    <li>QR-Code der <b>Keycard</b> mit einer beliebigen QR-App scannen.</li>
    <li>Den <b>kompletten Text</b> (beginnt mit <code>M001A…</code>) unten bei
        <b>BLE Pair Card Key</b> einfügen und mit Enter bestätigen.
        Die MAC-Adresse wird daraus automatisch übernommen.</li>
    <li>Am Schloss die Taste <b>Öffnen</b> ca. 5&nbsp;s halten, bis die LED <b>schnell orange blinkt</b>.</li>
    <li>Sofort <b>BLE Pair _Start_</b> drücken.</li>
    <li>Fertig, wenn der <b>Einrichtungsstatus</b> ✅ zeigt und <b>Lock Status</b> einen Zustand anzeigt.</li>
  </ol>

  <h3>3. Nach einem Werksreset: Schloss einstellen</h3>
  <p>Unter <b>Schloss Einstellungen</b> Schließrichtung, Schlüsselposition und Umdrehungen wählen,
     dann <b>Lock Settings _Apply_</b> drücken.</p>

  <h3>4. Bedienung: Zuschließen, Aufschließen, Öffnen</h3>
  <table class="eg-table">
    <tr><th>Button</th><th>Was passiert</th></tr>
    <tr><td><b>Zuschließen</b></td><td>Riegel wird zugeschlossen</td></tr>
    <tr><td><b>Aufschließen</b></td><td>Riegel wird aufgeschlossen, die Tür bleibt zu (Klinke drücken zum Öffnen)</td></tr>
    <tr><td><b>Öffnen</b></td><td>aufschließen und <b>Tür komplett öffnen</b> (Schloss zieht die Falle kurz zurück) –
        Tür lässt sich auch mit Knauf aufziehen</td></tr>
  </table>
  <p>Was „Öffnen“ macht, hängt von der Auswahl <b>„Türgriff außen“</b> (Schloss Einstellungen) ab:</p>
  <table class="eg-table">
    <tr><th>Türgriff außen</th><th>„Öffnen“ bewirkt</th></tr>
    <tr><td><b>Knauf</b> (Standard)</td><td>Tür wird <b>komplett geöffnet</b> und lässt sich von außen aufziehen</td></tr>
    <tr><td><b>Türklinke</b></td><td>wie „Aufschließen“ – die Klinke drückt man selbst. Ist das Schloss schon auf, passiert nichts.</td></tr>
  </table>
  <p class="eg-note">Gilt für alle Wege: Web-GUI, Home Assistant (<code>lock.open</code>) und Fingerprint
     mit Aktion „Öffnen“. Beim kompletten Öffnen meldet „Lock Status“ kurz <b>OPENED</b>, beim reinen Aufschließen nicht.</p>

  <h3>5. Eqiva-App zusätzlich nutzen</h3>
  <p>Das Schloss erlaubt nur <b>eine</b> Bluetooth-Verbindung gleichzeitig.
     Vor der App <b>BLE Settings _Disconnect_</b> drücken, danach <b>BLE Settings _Save_</b>.</p>

  <h3>6. Energiemodus (Batterie im Schloss)</h3>
  <ul>
    <li><b>Schnell</b>: Dauerverbindung, Tür öffnet am schnellsten, höchster Batterieverbrauch.</li>
    <li><b>Ausgewogen</b>: Dauerverbindung mit längerem Verbindungsabstand (Standard 100&nbsp;ms).
        Spart Batterie, Befehle brauchen etwas länger.</li>
    <li><b>Sparsam</b>: Verbindet nur bei Bedarf und trennt nach Leerlauf (Standard 30&nbsp;s).
        Der erste Befehl dauert ca. 3–5&nbsp;s. Der Status wird periodisch abgefragt (Standard alle 30&nbsp;min).
        Wird das Schloss von Hand bedient, sieht Home Assistant das erst bei der nächsten Abfrage.</li>
  </ul>
  <p class="eg-note">Umschalten wirkt sofort, ohne neu zu flashen.</p>

  <h3>7. Bluetooth-Empfang („Schloss Signal“)</h3>
  <table class="eg-table">
    <tr><th>Wert</th><th>Bewertung</th><th>Erwartung</th></tr>
    <tr><td>-70 dBm und besser</td><td>🟢 gut</td><td>zuverlässig, schnelle Verbindung</td></tr>
    <tr><td>-70 bis -85 dBm</td><td>🟡 mittel</td><td>funktioniert, gelegentlich längere Verbindungszeiten</td></tr>
    <tr><td>schlechter als -85 dBm</td><td>🔴 schlecht</td><td>Fehlversuche und lange Wartezeiten wahrscheinlich</td></tr>
  </table>
  <p class="eg-note">Je näher an 0, desto besser (-60 ist besser als -80). Der Wert wird während einer
     Verbindung alle 15&nbsp;s gemessen; im Sparmodus bleibt nach dem Trennen der letzte Wert stehen.</p>

  <h3>8. Fingerprint (nur mit R503)</h3>
  <p><b>Anlernen</b> (Gruppe „Fingerprint Anlernen“):</p>
  <ol>
    <li><b>Person</b> eintragen, <b>Hand</b> und <b>Finger</b> wählen.</li>
    <li><b>Aktion dieses Fingers</b> wählen (siehe Tabelle).</li>
    <li><b>Finger anlernen</b> drücken und den Finger so oft auflegen, wie „Anlern-Scans“ angibt.
        Ring <b>lila atmend</b> = Finger auflegen · <b>2× grün</b> = Bild ok, abheben und erneut auflegen ·
        <b>2× gelb</b> = schief aufgelegt, nochmal · <b>grün atmend</b> = fertig. „Letzte Aktion“ zeigt „Bild 2 von 5 ok“.</li>
  </ol>
  <p>Die Übersicht <b>„Angelernte Finger“</b> zeigt alle Finger, z. B. <code>#0 St R-Daumen ⇄ · #1 St L-Daumen ⇄ · #8 ohne Zuordnung</code> (#&nbsp;= Speicherplatz im Sensor).
     Passt nicht alles hinein, endet sie mit „+N weitere (siehe Log)“. Kurze Namen (z.&nbsp;B. „St“) zeigen mehr Finger.</p>
  <ul>
    <li><b>Finger wird schlecht erkannt:</b> dieselbe Person/Hand/Finger wählen und erneut <b>Finger anlernen</b> –
        der alte Abdruck wird überschrieben.</li>
    <li><b>Person umbenennen</b> (z.&nbsp;B. „Stephan“ → „St“): bei <b>Person</b> den alten, bei <b>Neuer Name</b> den
        neuen Namen eintragen, <b>Person umbenennen</b> drücken. Finger, Plätze und Aktionen bleiben, nichts neu anlernen.
        Gibt es den neuen Namen schon, fragt der ESP nach: innerhalb von 10&nbsp;s erneut drücken führt beide Personen
        zusammen. Haben beide denselben Finger (z.&nbsp;B. beide R-Daumen), wird abgelehnt – erst einen davon löschen.</li>
    <li><b>Aktion ändern:</b> Finger auswählen, neue Aktion wählen, <b>Aktion übernehmen</b>.</li>
    <li><b>Entfernen:</b> Finger auswählen, <b>Finger löschen</b>. Einzelnen Platz per Nummer
        (auch ohne Zuordnung): <b>Speicherplatz (Nr.)</b> eintragen, <b>Speicherplatz löschen</b>.
        <b>Alle Finger löschen</b>: innerhalb von 10&nbsp;s zweimal drücken.</li>
    <li><b>Schon früher angelernte Finger</b> (Anzahl: „Fingerabdrücke gespeichert“):
        <b>Fingerprint aktiv</b> ausschalten, Finger auflegen – „Letzte Aktion“ zeigt „Platz X (ohne Zuordnung)“.
        Dann Person/Hand/Finger/Aktion wählen und <b>Letzten Finger zuordnen</b> drücken.
        Danach <b>Fingerprint aktiv</b> wieder einschalten.</li>
  </ul>
  <table class="eg-table">
    <tr><th>Aktion</th><th>Was passiert</th></tr>
    <tr><td>⇄ <b>Umschalten</b></td><td>Schloss zu → öffnen (wie Button „Öffnen“, beachtet „Türgriff außen“);
        Schloss offen → zuschließen. Ohne Verbindung wird zuerst der aktuelle Status geholt.</td></tr>
    <tr><td>🔓 <b>Aufschließen</b></td><td>nur aufschließen</td></tr>
    <tr><td>🔒 <b>Zuschließen</b></td><td>nur zuschließen</td></tr>
    <tr><td>🚪 <b>Öffnen</b></td><td>wie Button „Öffnen“</td></tr>
    <tr><td>🔔 <b>Nur Klingel</b></td><td>keine Schlossaktion, löst die Klingel aus (siehe unten)</td></tr>
    <tr><td>⛔ <b>Gesperrt</b></td><td>Finger vorübergehend deaktiviert, ohne ihn zu löschen</td></tr>
    <tr><td><b>Standard</b></td><td>nutzt „Standard-Aktion“ (Fingerprint Einstellungen)</td></tr>
  </table>
  <p><b>Ring-Farben:</b></p>
  <table class="eg-table">
    <tr><th>Ring</th><th>Bedeutung</th></tr>
    <tr><td>🔵 blau</td><td>Finger wird gelesen</td></tr>
    <tr><td>🟢 grün atmend</td><td>erkannt – Aktion läuft. Finger darf weg.</td></tr>
    <tr><td>🟢 grün, 2&nbsp;s an</td><td>bestätigt: <b>verriegelt</b></td></tr>
    <tr><td>🔴 rot, 2&nbsp;s an</td><td>bestätigt: <b>aufgeschlossen / geöffnet</b></td></tr>
    <tr><td>🔴 rot atmend</td><td>Finger nicht erkannt</td></tr>
    <tr><td>🔴 rot blinkend</td><td>Fehler: Schloss nicht erreicht oder Status unbekannt</td></tr>
    <tr><td>🟣 lila blinkend</td><td>abgewiesen (Fingerprint aus, Sperre nach Fehlversuchen, Übereinstimmung zu gering, Finger gesperrt)</td></tr>
    <tr><td>🟡 gelb blinkend</td><td>Finger schlecht aufgelegt – nochmal versuchen</td></tr>
    <tr><td>🌈 Regenbogen (Standard)</td><td>Klingel – Muster wählbar unter „Klingel-Anzeige“:
        Regenbogen, Weiß atmen, Blau blinken, Rot/Blau, Gelb/Grün oder Aus</td></tr>
    <tr><td>🟣 lila atmend</td><td>Anlernen: Finger auflegen (nach 2× grün: abheben und erneut auflegen)</td></tr>
    <tr><td>🟢 / 🔴 / 🔵 atmend (2×)</td><td>Schloss wurde <b>ohne Finger</b> bedient (HA, Web-GUI, Zeitplan, Schlüssel):
        grün = zugeschlossen, rot = aufgeschlossen, blau = geöffnet. Abschaltbar:
        „Ring-Anzeige bei Bedienung ohne Finger“.</td></tr>
  </table>
  <p><b>Status-LED am ESP</b> (WS2812): 🟢 grün = verriegelt · 🔴 rot = aufgeschlossen ·
     🔵 blau = geöffnet · 🟠 orange pulsierend = Motor läuft · 🟣 lila blinkend = unbekannt.</p>
  <p><b>Klingel:</b> Mit <b>„Klingel bei unbekanntem Finger“</b> (Fingerprint Einstellungen) klingelt ein
     nicht erkannter Finger, ebenso Finger mit der Aktion „Nur Klingel“. In Home Assistant erscheint das als
     Entität <b>„Klingel“</b> (für Automationen, z.&nbsp;B. Push-Nachricht). Damit es nicht klingelt, wenn der
     eigene Finger einmal schlecht gelesen wird, wartet der ESP die <b>„Klingel-Verzögerung“</b>
     (Standard 5&nbsp;s): Wird in dieser Zeit ein bekannter Finger erkannt, klingelt es nicht. Danach folgt die einstellbare <b>„Klingel-Pause“</b> (Standard 30&nbsp;s).
     Auch ein schlecht aufgelegter Finger (gelb) löst die Klingel nach der Verzögerung aus.</p>
  <p><b>Zuordnung sichern / umziehen:</b> Die Abdrücke liegen im R503, die Zuordnung (Person, Hand, Finger,
     Aktion) auf dem ESP <b>und zusätzlich im Notizspeicher des R503</b> (wird nach jeder Änderung automatisch
     gesichert). Kommt der Sensor an einen neuen ESP ohne Zuordnung, übernimmt dieser sie beim Start von selbst.
     Von Hand: <b>Zuordnung aus Sensor laden</b>. Die vollständige Liste mit Speicherplätzen steht nach jedem
     Start und jeder Änderung im Log.</p>
  <p>„Angelernte Finger“ zeigt auch Plätze, die im Sensor belegt sind, aber keine Zuordnung haben
     (<i>ohne Zuordnung: #3</i>) – zuordnen mit „Letzten Finger zuordnen“ oder löschen mit „Speicherplatz löschen“.</p>
  <p><b>Grenzen:</b> max. <b>16 Personen</b>, Plätze 0–199. Wie viele Finger zugeordnet werden können, bestimmt die
     Sicherung im Sensor (512 Byte): ca. <b>55 Finger</b> bei kurzen Namen, mit langen etwas weniger. Passt eine neue
     Zuordnung nicht mehr hinein, wird das Anlernen <b>abgelehnt</b>. Wird eine Grenze knapp (unter 10&nbsp;%), steht
     ⚠️ in „Letzte Aktion“ und „⚠️ fast voll“ am Ende der Übersicht. Gedacht für Haushalte, nicht als
     Zutrittskontrolle für Firmen.</p>
  <p class="eg-note">Den Finger nach dem Erkennen einfach abnehmen. Solange eine Aktion läuft und noch
     „Scan-Pause nach Aktion“ (Standard 3&nbsp;s) danach, werden weitere Scans ignoriert – so schaltet
     „Umschalten“ nie zweimal. Was zuletzt passiert ist, steht in <b>„Fingerprint: Letzte Aktion“</b>.</p>

  <h3>9. Zeitplan</h3>
  <p>Zwei Zeitpläne, z.&nbsp;B. „täglich 22:00 zuschließen“ und „Mo–Fr 07:45 zuschließen“ (Gruppe „Zeitplan“):</p>
  <ol>
    <li><b>Uhrzeit</b>, <b>Wochentage</b> und <b>Aktion</b> (Zuschließen/Aufschließen) einstellen.</li>
    <li><b>Zeitplan … aktiv</b> einschalten.</li>
  </ol>
  <table class="eg-table">
    <tr><th>Wochentage</th><th>Bedeutung</th></tr>
    <tr><td><code>Mo-So</code> oder <code>täglich</code></td><td>jeden Tag</td></tr>
    <tr><td><code>Mo-Fr</code></td><td>Montag bis Freitag</td></tr>
    <tr><td><code>Sa,So</code></td><td>Wochenende</td></tr>
    <tr><td><code>Mo-Do,So</code></td><td>Montag bis Donnerstag und Sonntag</td></tr>
    <tr><td><code>Fr-Mo</code></td><td>Freitag bis Montag (über das Wochenende)</td></tr>
  </table>
  <p>Die Anzeige <b>„Zeitplan“</b> zeigt den nächsten Termin und das letzte Ergebnis
     (✓ bestätigt, ✗ Schloss hat nicht reagiert). Ohne Bestätigung wird bis zu 3× im Minutenabstand wiederholt.</p>
  <p class="eg-note">Die Uhrzeit kommt per SNTP aus dem Internet, ersatzweise von Home Assistant – der Zeitplan
     läuft also auch ohne HA. Ohne gültige Uhrzeit pausiert er (Meldung in „Zeitplan“).</p>

  <h3>10. Testmodus (ohne Schloss)</h3>
  <p>Zum Testen von Fingerprint, LEDs und Zeitplan, ohne das Schloss zu belasten:
     in der YAML <code>use_simulation: "true"</code> setzen und flashen. Das Schloss wird nachgebildet,
     „Einrichtungsstatus“ zeigt 🧪&nbsp;TESTMODUS.</p>
  <ul>
    <li><b>Simulation: Fahrzeit</b> – wie lange der „Motor“ läuft (MOVING).</li>
    <li><b>Simulation: Schloss erreichbar</b> – aus = Schloss nicht erreichbar, Befehle verfallen
        (testet die rote Fehleranzeige).</li>
    <li>Energiemodus „Sparsam“ simuliert auch den Verbindungsaufbau (ca. 2&nbsp;s).</li>
  </ul>
  <p class="eg-note">Für den Betrieb am Schloss wieder <code>use_simulation: "false"</code> setzen.
     Angelernte Finger und Einstellungen bleiben erhalten.</p>

  <h3>Wenn es nicht klappt</h3>
  <ul>
    <li><b>„nicht im Pairing-Modus“</b> im Log: Öffnen-Taste länger halten, bis die LED orange blinkt.</li>
    <li><b>„Card key fehlt oder ungültig“</b>: Nicht der komplette QR-Text eingefügt.
        Das Feld ist nach jedem Neustart leer.</li>
    <li><b>„nicht (mehr) angelernt“</b>: Neu pairen (Schritt 2).</li>
    <li><b>Einrichtungsstatus ⚠️ „User ID … eingestellt, gekoppelt wurde User …“</b>:
        Bei <b>BLE Settings User ID</b> die Nummer aus <b>Pairing-Info</b> eintragen und
        <b>BLE Settings _Save_</b> drücken.</li>
    <li><b>Schloss Signal unter -85 dBm</b>: ESP näher ans Schloss, Antenne ausrichten oder bessere Antenne.</li>
  </ul>
  <p class="eg-note">Keycard bzw. QR-Text sicher aufbewahren (z.&nbsp;B. Passwortmanager).
     Ohne ihn ist nach einem Reset kein Pairing möglich.</p>
</div>
`;

const GUIDE_CSS = `
#eqiva-guide {
  --eg-bg: #f6f7f9; --eg-fg: #1d2330; --eg-muted: #5b6475; --eg-border: #d9dde5; --eg-accent: #0b6bcb;
  max-width: 1100px; margin: 12px auto; padding: 0 16px; box-sizing: border-box;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--eg-fg);
}
@media (prefers-color-scheme: dark) {
  #eqiva-guide { --eg-bg: #1f232b; --eg-fg: #e6e9ef; --eg-muted: #a3abba; --eg-border: #343a46; --eg-accent: #6cb4ff; }
}
#eqiva-guide > summary {
  cursor: pointer; list-style: none; padding: 12px 16px; border-radius: 10px;
  background: var(--eg-bg); border: 1px solid var(--eg-border); font-weight: 600;
}
#eqiva-guide > summary::-webkit-details-marker { display: none; }
#eqiva-guide > summary::after { content: "▸"; float: right; color: var(--eg-muted); }
#eqiva-guide[open] > summary { border-radius: 10px 10px 0 0; }
#eqiva-guide[open] > summary::after { content: "▾"; }
#eqiva-guide .eg-body {
  background: var(--eg-bg); border: 1px solid var(--eg-border); border-top: none;
  border-radius: 0 0 10px 10px; padding: 4px 20px 16px; line-height: 1.5;
}
#eqiva-guide h3 { font-size: 1rem; margin: 18px 0 6px; color: var(--eg-accent); }
#eqiva-guide ol, #eqiva-guide ul { margin: 6px 0; padding-left: 22px; }
#eqiva-guide li { margin: 3px 0; }
#eqiva-guide p { margin: 6px 0; }
#eqiva-guide .eg-note { color: var(--eg-muted); font-size: 0.92em; }
#eqiva-guide .eg-table { border-collapse: collapse; margin: 6px 0; font-size: 0.95em; }
#eqiva-guide .eg-table th, #eqiva-guide .eg-table td { border: 1px solid var(--eg-border); padding: 4px 10px; text-align: left; }
#eqiva-guide .eg-table th { color: var(--eg-muted); font-weight: 600; }
#eqiva-guide .eg-ver { color: var(--eg-muted); font-weight: 400; font-size: 0.85em; margin-left: 6px; }
#eqiva-guide code { background: var(--eg-border); padding: 1px 5px; border-radius: 4px; }
`;

function addEqivaGuide() {
  if (document.getElementById("eqiva-guide")) return;
  const style = document.createElement("style");
  style.textContent = GUIDE_CSS;
  document.head.appendChild(style);

  const guide = document.createElement("details");
  guide.id = "eqiva-guide";
  guide.innerHTML = GUIDE_HTML;
  const app = document.querySelector("esp-app");
  document.body.insertBefore(guide, app || null);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addEqivaGuide);
} else {
  addEqivaGuide();
}

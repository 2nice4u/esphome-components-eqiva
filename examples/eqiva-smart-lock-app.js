// Eqiva Smart Lock – Web-App für die ESPHome-Web-GUI
// Version 3.5.6 (2026-11-10) – alle Dateien mit gleicher Version gehören zusammen (inkl. eqiva_components)
// Wird über "web_server: js_include: eqiva-smart-lock-app.js" in die Firmware eingebettet (gzip, ca. 15 KB).
// Liest alle Werte live über /events (Server-Sent Events) und bedient über die REST-Schnittstelle
// des ESP (POST /<domain>/<Name>/<aktion>). Läuft ohne Internet. Die ESPHome-Tabelle bleibt als
// "Expertenansicht" erreichbar (die lädt ESPHome bei local: false aus dem Internet).
// Fehlt ein Paket (Fingerprint, Zeitplan, …), blendet die App den Bereich einfach aus.
(function () {
  'use strict';
  const APP_VERSION = '3.5.6';
  const GUIDE_URL = 'https://github.com/2nice4u/esphome-components-eqiva/blob/main/docs/ANLEITUNG.md';

  // ---------------------------------------------------------------- Zustand
  const E = {};                      // "domain/Name" -> letzter JSON-Stand vom ESP
  const S = {
    tab: 'start', title: '', conn: 'connecting', expert: false,
    theme: load('eqa-theme', 'auto'),
    wiz: null,                       // Anlern-/Zuordnungs-Assistent
    pair: null,                      // Pairing-Assistent (Card Key nur im Speicher der Seite)
    sheet: null,                     // geöffnetes Detailfenster (Finger, Person, Platz)
    confirm: '',                     // Schlüssel einer Aktion, die auf "wirklich?" wartet
    busy: false, toast: ''
  };
  function load(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privat/gesperrt */ } }

  const has = (id) => Object.prototype.hasOwnProperty.call(E, id);
  const val = (id, d) => (has(id) && E[id].value !== undefined && E[id].value !== null ? E[id].value : d);
  const txt = (id, d) => { const v = val(id, null); return v === null || v === '' ? (d === undefined ? '' : d) : String(v); };
  const on = (id) => val(id, false) === true || txt(id) === 'ON';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stripTime = (s) => String(s || '').replace(/^\d\d:\d\d /, '');
  const seq = (id) => (has(id) ? E[id]._seq || 0 : 0);

  // ---------------------------------------------------------------- ESP-Zugriff
  async function post(id, action, params) {
    const i = id.indexOf('/');
    let url = '/' + id.slice(0, i) + '/' + encodeURIComponent(id.slice(i + 1)) + '/' + action;
    if (params) url += '?' + new URLSearchParams(params).toString();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);   // nie endlos warten
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', signal: ctl.signal });
      if (!r.ok) throw new Error(id + ' ' + action + ': HTTP ' + r.status);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Keine Antwort vom ESP – bitte nochmal versuchen');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
  async function run(steps, okText) {
    if (S.busy) return;
    S.busy = true; draw();
    try {
      for (const st of steps) await post(st[0], st[1], st[2]);
      if (okText) toast(okText);
    } catch (e) {
      toast(/^Keine Antwort/.test(e.message) ? e.message : 'Fehler: ' + e.message);
    } finally {
      S.busy = false; draw();
    }
  }
  function toast(t) {
    S.toast = t; draw();
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { S.toast = ''; draw(); }, 3500);
  }

  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('open', () => { S.conn = 'ok'; draw(); });
    es.addEventListener('error', () => { S.conn = 'lost'; draw(); });
    es.addEventListener('ping', (ev) => {
      try { const j = JSON.parse(ev.data); if (j.title) S.title = j.title; } catch (e) { /* leer */ }
      S.conn = 'ok'; draw();
    });
    es.addEventListener('state', (ev) => {
      let j;
      try { j = JSON.parse(ev.data); } catch (e) { return; }
      if (!j || !j.id) return;
      E[j.id] = Object.assign(E[j.id] || {}, j);
      E[j.id]._seq = (E[j.id]._seq || 0) + 1;   // jede Meldung zählt, auch mit gleichem Text
      draw();
    });
  }

  // ---------------------------------------------------------------- Daten aufbereiten
  const LOCK = {
    LOCKED: { label: 'Verriegelt', cls: 'st-locked', icon: 'lock' },
    UNLOCKED: { label: 'Aufgeschlossen', cls: 'st-unlocked', icon: 'unlock' },
    OPENED: { label: 'Geöffnet', cls: 'st-opened', icon: 'door' },
    MOVING: { label: 'Motor läuft …', cls: 'st-moving', icon: 'spin' },
    UNKNOWN: { label: 'Unbekannt / blockiert', cls: 'st-unknown', icon: 'alert' }
  };
  const ACTIONS = ['Standard', 'Umschalten', 'Aufschließen', 'Zuschließen', 'Öffnen', 'Nur Klingel', 'Gesperrt'];
  const ACTION_HINT = ['nutzt die Standard-Aktion', 'zu → öffnen, offen → zuschließen', 'nur aufschließen',
    'nur zuschließen', 'aufschließen und Falle ziehen', 'keine Schlossaktion, nur Klingel', 'vorübergehend deaktiviert'];
  // Beschreibung passend zu "Türgriff außen": bei Türklinke schließen Umschalten/Öffnen nur auf
  const knauf = () => txt('select/Türgriff außen') !== 'Türklinke';
  const actionHint = (i) => i === 1 ? (knauf() ? 'zu → öffnen (Falle ziehen), offen → zuschließen' : 'zu → aufschließen, offen → zuschließen') :
    i === 4 ? (knauf() ? 'aufschließen und Falle ziehen' : 'nur aufschließen (Türgriff außen = Türklinke)') : ACTION_HINT[i];
  const FINGERS = ['Daumen', 'Zeigefinger', 'Mittelfinger', 'Ringfinger', 'Kleiner Finger'];
  const FSHORT = ['Daumen', 'Zeige', 'Mittel', 'Ring', 'Klein'];
  const HANDS = ['Links', 'Rechts'];
  const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  function events() {
    const raw = txt('text_sensor/Ereignisse');
    if (!raw || raw === '–') return [];
    return raw.split(' · ').map((e) => {
      const m = e.match(/^(?:(\d\d\.\d\d\.) )?(?:(\d\d:\d\d) )?(.*)$/) || [];
      let t = m[3] || e, kind = 'info', rt = NaN;
      const d = t.match(/^(.*) \((\d+),(\d) s\)$/);    // Reaktionszeit am Ende, z. B. "🔒 HA/Web (2,4 s)"
      if (d) { t = d[1]; rt = +(d[2] + '.' + d[3]); }
      let label = t;
      const rules = [
        [/^🖐\s*🔒/, 'locked', 'Zu · von Hand'], [/^🖐\s*🔓/, 'unlocked', 'Auf · von Hand'], [/^🖐\s*🚪/, 'opened', 'Geöffnet · von Hand'],
        [/^🔒\s*/, 'locked', 'Zu · '], [/^🔓\s*/, 'unlocked', 'Auf · '], [/^🚪\s*/, 'opened', 'Geöffnet · '],
        [/^🔔\s*/, 'bell', 'Klingel · '], [/^⛔\s*/, 'deny', 'Abgewiesen · '], [/^❓\s*/, 'deny', 'Unbekannter Finger'],
        [/^⚠️?\s*/, 'alert', ''], [/^✗\s*/, 'alert', 'Nicht ausgeführt · '], [/^✓\s*/, 'ok', ''], [/^🔗\s*/, 'info', '']
      ];
      for (const [re, k, pre] of rules) {
        if (re.test(t)) {
          kind = k;
          const rest = t.replace(re, '');
          label = /von Hand|Unbekannter/.test(pre) ? pre : pre + rest;
          break;
        }
      }
      return { day: m[1] || '', time: m[2] || '', kind, label, rt };
    });
  }

  // "FP2|Namen|Platz:PHFA,…|ohne Zuordnung" -> Personen mit Fingern
  function fpData() {
    const raw = txt('text_sensor/Fingerprint Zuordnung');
    const res = { persons: [], unmapped: [], count: 0, bytes: 0, ok: false };
    if (!raw || !/^FP[12]\|/.test(raw)) return res;
    const parts = raw.split('|');
    const names = parts[1] ? parts[1].split(',') : [];
    res.bytes = (parts[0] + '|' + parts[1] + '|' + (parts[2] || '')).length + 1;
    const per = names.map((n, i) => ({ idx: i, name: n, fingers: [] }));
    (parts[2] || '').split(',').filter(Boolean).forEach((t) => {
      const m = t.match(/^(\d+):([0-9A-F])([LR])(\d)(\d)$/);
      if (!m) return;
      const p = per[parseInt(m[2], 16)];
      if (!p) return;
      p.fingers.push({ slot: +m[1], hand: m[3] === 'R' ? 1 : 0, finger: +m[4], action: +m[5] });
      res.count++;
    });
    res.persons = per.filter((p) => p.name && p.fingers.length);
    res.persons.forEach((p) => p.fingers.sort((a, b) => b.hand - a.hand || a.finger - b.finger));
    res.unmapped = (parts[3] || '').split(',').filter(Boolean).map(Number);
    res.ok = true;
    return res;
  }

  function daysMask(s) {
    s = String(s || '').toLowerCase().replace(/\s/g, '');
    if (!s) return 0;
    if (/^(täglich|taeglich|alle)$/.test(s)) return 0x7F;
    const n = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
    let mask = 0;
    for (const tok of s.split(',').filter(Boolean)) {
      const [a, b] = tok.split('-');
      const ia = n.indexOf(a), ib = b === undefined ? ia : n.indexOf(b);
      if (ia < 0 || ib < 0) return -1;
      for (let i = ia; ; i = (i + 1) % 7) { mask |= 1 << i; if (i === ib) break; }
    }
    return mask;
  }
  function daysText(mask) {
    if (mask === 0x7F) return 'Mo-So';
    const out = [];
    for (let i = 0; i < 7;) {
      if (!(mask & (1 << i))) { i++; continue; }
      let j = i;
      while (j + 1 < 7 && (mask & (1 << (j + 1)))) j++;
      out.push(j - i >= 2 ? DAYS[i] + '-' + DAYS[j] : (j > i ? DAYS[i] + ',' + DAYS[j] : DAYS[i]));
      i = j + 1;
    }
    return out.join(',');
  }

  // ---------------------------------------------------------------- Symbole (Linien-SVG)
  const P = {
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
    door: '<path d="M6 21V4h12v17"/><path d="M3 21h18"/><path d="M14 12h.5"/>',
    lockF: '<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    spin: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4"/><path d="M12 17v.5"/>',
    finger: '<path d="M6.5 6.3A8 8 0 0 1 20 12v1.5"/><path d="M4 12a8 8 0 0 1 1-3.9"/><path d="M4.5 16.5c.3-1 .5-2 .5-3.5"/><path d="M8 12a4 4 0 0 1 8 0v1.5a13 13 0 0 1-1.2 5.5"/><path d="M12 12v1.5a9 9 0 0 1-2.4 6.2"/><path d="M19.5 17a16 16 0 0 0 .4-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    bt: '<path d="M7 7l10 10-5 5V2l5 5L7 17"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'
  };
  const icon = (n, size, label) => '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
    (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') + '>' + P[n] + '</svg>';

  // ---------------------------------------------------------------- Bausteine
  const btn = (a, label, cls, x, extra) => '<button type="button" class="' + (cls || 'b') + '" data-a="' + a + '"' +
    (x !== undefined ? ' data-x="' + esc(x) + '"' : '') + (S.busy ? ' disabled' : '') + (extra || '') + '>' + label + '</button>';
  const card = (inner, cls) => '<section class="card ' + (cls || '') + '">' + inner + '</section>';
  const row = (k, v) => '<div class="row"><span>' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';

  function toggle(id, label) {
    if (!has(id)) return '';
    const v = on(id);
    return '<div class="row"><span>' + esc(label || E[id].name || id) + '</span>' +
      '<button type="button" class="sw' + (v ? ' on' : '') + '" role="switch" aria-checked="' + v + '" aria-label="' + esc(label || id) +
      '" data-a="sw" data-x="' + esc(id) + '"' + (S.busy ? ' disabled' : '') + '><span></span></button></div>';
  }
  function choice(id, label) {
    if (!has(id)) return '';
    const opts = E[id].option || [];
    const cur = txt(id);
    if (opts.length && opts.length <= 3) {
      return '<div class="fld"><span class="lbl">' + esc(label || E[id].name) + '</span><div class="seg">' +
        opts.map((o) => '<button type="button" class="' + (o === cur ? 'sel' : '') + '" data-a="opt" data-x="' + esc(id) + '" data-v="' + esc(o) + '">' + esc(o) + '</button>').join('') +
        '</div></div>';
    }
    return '<label class="fld"><span class="lbl">' + esc(label || E[id].name) + '</span><select data-c="opt" data-x="' + esc(id) + '">' +
      (opts.length ? opts : [cur]).map((o) => '<option' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></label>';
  }
  function num(id, label) {
    if (!has(id)) return '';
    const e = E[id];
    return '<label class="row"><span>' + esc(label || e.name) + '</span><span class="numw"><input type="number" inputmode="decimal" data-c="num" data-x="' + esc(id) +
      '" data-k="' + esc(id) + '" value="' + esc(val(id, '')) + '" min="' + esc(e.min_value || '') + '" max="' + esc(e.max_value || '') + '" step="' + esc(e.step || 1) + '">' +
      (e.uom ? '<span class="uom">' + esc(e.uom) + '</span>' : '') + '</span></label>';
  }

  // ---------------------------------------------------------------- Ansichten
  const rtClass = (v) => v <= 4 ? 'g' : v <= 8 ? 'y' : 'r';
  // Reaktionszeit-Kopf der Startseiten-Karte: zuletzt/Ø/max und Balken mit Piktogrammen.
  // "Reaktionszeiten" je Eintrag: Aktion|Sekunden|Quelle, durch ";" getrennt (z = zu, a = auf, o = öffnen)
  function reactionHead() {
    if (!has('text_sensor/Reaktionszeiten')) return '';
    const RA = { z: ['lockF', 'zu'], a: ['unlock', 'auf'], o: ['door', 'öffnen'] };
    const r = txt('text_sensor/Reaktionszeiten').split(/;\s*/).map((s) => { const p = s.split('|'); return { act: p[0], v: Number(p[1]), src: p[2] || '' }; })
      .filter((e) => RA[e.act] && isFinite(e.v));
    if (!r.length) return '';
    const f = (v) => v.toFixed(1).replace('.', ',') + ' s', vals = r.map((e) => e.v), last = r[r.length - 1];
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length, mx = Math.max(...vals), top = Math.max(mx, 5);
    return '<p class="muted small">Reaktionszeit: Befehl abgeschickt → Motor dreht · letzte ' + r.length + ' Bedienungen</p>' +
      '<div class="rtnum"><b class="' + rtClass(last.v) + '">' + f(last.v) + '</b><span>zuletzt</span><b class="' + rtClass(avg) + '">' + f(avg) + '</b><span>Ø</span><b class="' + rtClass(mx) + '">' + f(mx) + '</b><span>max</span></div>' +
      '<div class="rtbars" role="img" aria-label="Reaktionszeiten">' + r.map((e) => '<div class="' + rtClass(e.v) + '" style="height:' + Math.max(6, e.v / top * 100) + '%" title="' + RA[e.act][1] + ' · ' + f(e.v) + (e.src ? ' · ' + esc(e.src) : '') + '"><i>' + e.v.toFixed(1).replace('.', ',') + '</i></div>').join('') + '</div>' +
      '<div class="rtic-row">' + r.map((e) => '<span>' + icon(RA[e.act][0], 15) + '</span>').join('') + '</div>' +
      '<div class="rtax"><span>älter</span><span>neu</span></div>';
  }
  function viewStart() {
    const st = txt('text_sensor/Lock Status', '');
    const unpaired = /^[①②]/.test(txt('text_sensor/Einrichtungsstatus'));
    const L = unpaired ? { label: 'Nicht gekoppelt', cls: 'st-unknown', icon: 'unlock' } :
      (st ? (LOCK[st] || LOCK.UNKNOWN) : { label: 'Lade …', cls: 'st-moving', icon: 'spin' });
    const ble = txt('text_sensor/Lock BLE State');
    const eco = /Sparsam/.test(txt('select/Energiemodus'));
    const sub = unpaired ? 'Bitte zuerst das Schloss koppeln' : st === 'MOVING' ? 'Befehl wird ausgeführt' :
      has('text_sensor/Bluetooth') ? '' :   // Verbindung zeigt die Kachel "Bluetooth"
      (ble === 'ESTABLISHED' ? 'Verbunden' : (eco ? 'Sparsam – verbindet bei Bedarf' : 'Keine Verbindung (' + (ble || '–') + ')'));
    // Wie aktuell ist der Zustand? Ohne Verbindung und ab 5 min: "Stand: vor … min" mit Knopf zum Abfragen
    let stale = '';
    const lsT = Date.parse(txt('text_sensor/Letzte Statusmeldung'));
    if (!unpaired && ble !== 'ESTABLISHED' && isFinite(lsT) && has('button/Status abfragen')) {
      const m = Math.floor((Date.now() - lsT) / 60000);
      if (m >= 5) {
        const age = m < 60 ? 'vor ' + m + ' min' : m < 1440 ? 'vor ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min' :
          'seit ' + new Date(lsT).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        stale = '<div class="stale">' + icon('clock', 15) + '<span>Stand: ' + age + '</span>' + btn('press', icon('spin', 15) + 'Aktualisieren', 'b sm', 'button/Status abfragen') + '</div>';
      }
    }
    const hero = card(
      '<div class="hero ' + L.cls + '"><div class="ring">' + icon(L.icon, 56, L.label) + '</div>' +
      '<div class="hl">' + esc(L.label) + '</div>' + (sub ? '<div class="muted">' + esc(sub) + '</div>' : '') + stale + '</div>' +
      (unpaired ? '' : '<div class="acts">' +
      btn('lock', icon('lock', 20) + 'Zu', 'big g') +
      btn('unlock', icon('unlock', 20) + 'Auf', 'big r') +
      btn('open', icon('door', 20) + 'Öffnen', 'big bl') +
      '</div>') +
      (txt('select/Türgriff außen') === 'Türklinke' ? '<p class="note">Türgriff außen = Türklinke: „Öffnen“ schließt nur auf.</p>' :
        txt('select/Türgriff außen') === 'Knauf' ? '<div class="knauf">' + icon('alert', 22) + '<div><b>Türgriff außen = Knauf</b><span>„Öffnen“ und der Finger (Umschalten/Öffnen) ziehen die Falle – die Tür wird komplett geöffnet. „Auf“ schließt nur auf.</span></div></div>' : ''));
    const tiles = [];
    if (has('binary_sensor/Batterie schwach')) tiles.push(['Batterie', on('binary_sensor/Batterie schwach') ? 'Schwach' : 'OK', on('binary_sensor/Batterie schwach') ? 'warn' : '']);
    if (has('sensor/Schloss Signal')) { const v = Number(val('sensor/Schloss Signal', NaN)); tiles.push(['Signal', isFinite(v) ? Math.round(v) + ' dBm' : '–', '']); }
    if (has('select/Energiemodus')) tiles.push(['Energie', txt('select/Energiemodus'), '']);
    if (has('text_sensor/Bluetooth')) {   // immer Bluetooth-Symbol, Zustand über Farbe und Text
      const b = txt('text_sensor/Bluetooth');
      const c = { 'Verbunden': 'g', 'Verbindungsaufbau': 'bl', 'Idle': 'n', 'Schloss nicht gefunden': 'y', 'Verbindungsfehler': 'r' }[b] || 'n';
      tiles.push(['Bluetooth', b || '–', 'bt ' + c, 'bt', b === 'Idle' && eco ? 'verbindet bei Bedarf' : '']);
    }
    const tilesHtml = tiles.length ? '<div class="tiles">' + tiles.map((t) => '<div class="tile ' + t[2] + '"><span>' + (t[3] ? icon(t[3], 14) : '') + esc(t[0]) + '</span><b>' + esc(t[1]) + '</b>' +
      (t[4] ? '<small>' + esc(t[4]) + '</small>' : '') + '</div>').join('') + '</div>' : '';
    const ev = events(), rtHead = reactionHead();
    const f1 = (v) => v.toFixed(1).replace('.', ',') + ' s';
    const withRt = has('text_sensor/Reaktionszeiten');   // Titel bleibt gleich, auch ohne Messung (z. B. nach Neustart)
    const evHtml = has('text_sensor/Ereignisse') || withRt ? card('<h2>' + (withRt ? 'Ereignisse und Reaktionszeit' : 'Ereignisse') + '</h2>' + rtHead +
      (withRt && !rtHead && ev.length ? '<p class="muted small">Reaktionszeit: noch keine Messung seit dem Start.</p>' : '') +
      (ev.length ? '<ul class="ev evrt">' + ev.map((e) =>
        '<li><span class="dot k-' + e.kind + '"></span><span class="et">' + esc(e.label) + '<small>' + esc((e.day ? e.day + ' ' : '') + e.time) + '</small></span>' +
        '<span class="rtv ' + (isFinite(e.rt) ? rtClass(e.rt) : '') + '">' + (isFinite(e.rt) ? f1(e.rt) : '') + '</span></li>').join('') + '</ul>'
        : '<p class="muted">' + (withRt && !rtHead ? 'Noch keine Ereignisse und Messungen seit dem Start.' : 'Noch keine Ereignisse seit dem Start.') + '</p>')) : '';
    const setup = txt('text_sensor/Einrichtungsstatus');
    const setupHtml = setup && !/^✅/.test(setup) && !/TESTMODUS/.test(setup) ? card('<span class="lbl">Einrichtung</span><p>' + esc(setup) + '</p>' +
      (has('button/BLE Pair _Start_') && /^[①②]/.test(setup) ? '<div class="foot">' + btn('pair', 'Jetzt koppeln', 'b pri') + '</div>' :
        (/User ID/.test(setup) ? '<div class="foot">' + btn('tab', 'Zur Einrichtung', 'b pri', 'more') + '</div>' : '')), /nicht erreichbar/.test(setup) ? 'warnc' : 'info') : '';
    return '<div class="grid2"><div class="col">' + hero + tilesHtml + setupHtml + '</div><div class="col">' + evHtml + '</div></div>';
  }

  function personChip(p) {
    return '<article class="card person"><div class="ph"><span class="av">' + esc(p.name.slice(0, 2)) + '</span><div class="pn"><b>' + esc(p.name) + '</b><span class="muted">' +
      p.fingers.length + ' Finger</span></div>' +
      '<button type="button" class="ib" data-a="sheet-person" data-x="' + esc(p.name) + '" aria-label="' + esc(p.name) + ' bearbeiten">' + icon('edit', 18) + '</button></div>' +
      '<div class="chips">' + p.fingers.map((f) =>
        '<button type="button" class="chip" data-a="sheet-finger" data-x="' + esc(p.name + '|' + f.hand + '|' + f.finger + '|' + f.action + '|' + f.slot) + '">' +
        '<b>' + (f.hand ? 'R-' : 'L-') + FSHORT[f.finger] + '</b><span class="badge a' + f.action + '">' + ACTIONS[f.action] + '</span><span class="muted">#' + f.slot + '</span></button>').join('') +
      '</div></article>';
  }

  function viewFinger() {
    if (S.wiz) return viewWizard();
    const d = fpData();
    let h = '';
    if (on('binary_sensor/Fingerprint gesperrt')) h += card('<div class="rowx"><span><b>Fingerprint gesperrt</b> – zu viele Fehlversuche</span>' + btn('press', 'Aufheben', 'b sm', 'button/Fingerprint Sperre aufheben') + '</div>', 'warnc');
    h += '<div class="headrow"><div><h2>Personen &amp; Finger</h2><span class="muted">' + (d.ok ? d.count + ' Finger · noch ca. ' + Math.max(0, Math.floor((512 - d.bytes) / 8)) + ' möglich' : 'Zuordnung wird geladen …') + '</span></div>' +
      btn('wiz', '+ Anlernen', 'b pri') + '</div>';
    if (d.ok && !d.persons.length && !d.unmapped.length) h += card('<p class="muted">Noch keine Finger angelernt. Mit „+ Anlernen“ geht es los.</p>');
    h += '<div class="cards">' + d.persons.map(personChip).join('') + '</div>';
    if (d.unmapped.length) {
      h += card('<h3>Im Sensor ohne Zuordnung</h3><p class="muted">Abdrücke, zu denen keine Person gespeichert ist.</p><div class="chips">' +
        d.unmapped.map((s) => '<button type="button" class="chip" data-a="sheet-slot" data-x="' + s + '"><b>Platz ' + s + '</b></button>').join('') + '</div>');
    }
    if (has('text_sensor/Fingerprint: Letzte Aktion')) h += card('<span class="lbl">Letzte Aktion</span><p class="la">' + esc(txt('text_sensor/Fingerprint: Letzte Aktion', '–')) + '</p>');
    if (has('switch/Fingerprint aktiv')) h += card(toggle('switch/Fingerprint aktiv', 'Fingerprint aktiv'));
    return h;
  }

  // Assistent: mode 'enroll' (anlernen) oder 'assign' (vorhandenen Abdruck zuordnen)
  function viewWizard() {
    const w = S.wiz;
    const d = fpData();
    const title = w.mode === 'assign' ? 'Platz ' + w.slot + ' zuordnen' : 'Finger anlernen';
    const total = 4;
    let body = '';
    if (w.step === 1) {
      body = '<p class="q">Wer?</p><div class="chips">' + d.persons.map((p) =>
        '<button type="button" class="pick' + (w.person === p.name ? ' sel' : '') + '" data-a="w-person" data-x="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('') + '</div>' +
        '<label class="fld"><span class="lbl">Neue Person (Kürzel empfohlen, max. 15 Zeichen)</span><input type="text" maxlength="15" data-c="w-newperson" data-k="w-newperson" value="' +
        esc(d.persons.some((p) => p.name === w.person) ? '' : w.person) + '" placeholder="z. B. Kind2"></label>';
    } else if (w.step === 2) {
      body = '<p class="q">Welcher Finger?</p><div class="seg">' + HANDS.map((h, i) =>
        '<button type="button" class="' + (w.hand === i ? 'sel' : '') + '" data-a="w-hand" data-x="' + i + '">' + h + '</button>').join('') + '</div>' +
        '<div class="chips">' + FINGERS.map((f, i) => {
          const taken = d.persons.some((p) => p.name === w.person && p.fingers.some((x) => x.hand === w.hand && x.finger === i));
          return '<button type="button" class="pick' + (w.finger === i ? ' sel' : '') + '" data-a="w-finger" data-x="' + i + '">' + f + (taken ? ' <small>(vorhanden)</small>' : '') + '</button>';
        }).join('') + '</div>';
    } else if (w.step === 3) {
      body = '<p class="q">Was soll der Finger tun?</p><div class="list">' + ACTIONS.map((a, i) =>
        '<button type="button" class="opt' + (w.action === i ? ' sel' : '') + '" data-a="w-action" data-x="' + i + '"><b>' + a + '</b><span>' + actionHint(i) + '</span></button>').join('') + '</div>';
    } else if (w.step === 4 && w.mode === 'assign') {
      body = '<div class="live"><div class="ring2 rs-blue">' + icon('finger', 44) + '</div>' +
        '<p><b>Jetzt den Finger von Platz ' + w.slot + ' auflegen</b></p>' +
        '<p class="muted">Am besten vorher „Fingerprint aktiv“ ausschalten, damit am Schloss nichts passiert. „Letzte Aktion“ muss „Platz ' + w.slot + ' (ohne Zuordnung)“ zeigen.</p>' +
        '<p class="la">' + esc(stripTime(txt('text_sensor/Fingerprint: Letzte Aktion', '–'))) + '</p>' +
        (has('switch/Fingerprint aktiv') ? toggle('switch/Fingerprint aktiv', 'Fingerprint aktiv') : '') + '</div>';
    } else if (w.step === 4) {
      body = '<div class="sum">' + row('Person', w.person) + row('Finger', HANDS[w.hand] + ', ' + FINGERS[w.finger]) + row('Aktion', ACTIONS[w.action]) + '</div>' +
        num('number/Anlern-Scans', 'Anzahl Bilder (Kinderfinger: 4)') +
        '<p class="muted">Nach dem Start zuerst einmal zur Prüfung auflegen (Ring blau), dann die Bilder (Ring lila).</p>';
    } else {
      body = liveEnroll(w);
    }
    const canNext = (w.step === 1 && w.person) || w.step === 2 || w.step === 3;
    let foot = '';
    if (w.step <= 4) {
      foot = btn(w.step === 1 ? 'w-close' : 'w-back', w.step === 1 ? 'Abbrechen' : 'Zurück', 'b') +
        (w.step < 4 ? btn('w-next', 'Weiter', 'b pri' + (canNext ? '' : ' dis'), undefined, canNext ? '' : ' aria-disabled="true"') :
          (w.mode === 'assign' ? btn('w-assign', 'Zuordnen', 'b pri') : btn('w-start', 'Anlernen starten', 'b pri')));
    } else {
      foot = w.result ? btn('w-close', 'Fertig', 'b pri') + (w.result !== 'ok' ? btn('w-retry', 'Nochmal', 'b') : '') : btn('w-cancel', 'Anlernen abbrechen', 'b');
    }
    return card('<div class="headrow"><h2>' + title + '</h2><span class="muted">Schritt ' + Math.min(w.step, total) + ' von ' + total + '</span></div>' +
      '<div class="prog"><div style="width:' + (Math.min(w.step, total) / total * 100) + '%"></div></div>' + body + '<div class="foot">' + foot + '</div>', 'wiz');
  }

  // Live-Anzeige während das ESP anlernt – liest "Fingerprint: Letzte Aktion"
  function liveEnroll(w) {
    const msg = stripTime(txt('text_sensor/Fingerprint: Letzte Aktion'));
    const fresh = seq('text_sensor/Fingerprint: Letzte Aktion') > w.seenSeq;
    let phase = 'wait', head = 'Wird gestartet …', ring = 'rs-blue', pct = 0;
    if (fresh || w.result) {
      let m;
      if (/^Prüfung:/.test(msg)) { phase = 'check'; head = 'Finger einmal zur Prüfung auflegen'; }
      else if (/^Nicht erkannt/.test(msg)) { phase = 'check'; head = 'Nicht erkannt – abheben und noch einmal auflegen'; }
      else if ((m = msg.match(/Bild (\d+) von (\d+)/))) { phase = 'img'; ring = 'rs-purple'; pct = +m[1] / +m[2] * 100; head = /Muster/.test(msg) ? 'Muster wird erstellt …' : 'Bild ' + m[1] + ' von ' + m[2] + ' ok – abheben, erneut auflegen'; }
      else if (/Finger ist neu|Gleicher Finger|^Anlernen:|^Neu anlernen:/.test(msg)) { phase = 'img'; ring = 'rs-purple'; head = 'Finger auflegen (Ring lila)'; }
      else if (/^(⚠️ )?Angelernt/.test(msg)) { w.result = 'ok'; }
      else if (/^Abgebrochen: dieser Finger|^Doppelt:/.test(msg)) { w.result = 'dup'; }
      else if (/^Anlernen abgebrochen/.test(msg)) { w.result = 'cancel'; }
      else if (/fehlgeschlagen|^Kein |^Bitte /.test(msg)) { w.result = 'fail'; }
    }
    if (w.result === 'ok') return '<div class="live"><div class="ring2 rs-ok">' + icon('check', 48) + '</div><p class="hl2">Angelernt</p><p>' + esc(msg) + '</p></div>';
    if (w.result) return '<div class="live"><div class="ring2 rs-err">' + icon(w.result === 'cancel' ? 'x' : 'alert', 44) + '</div><p class="hl2">' +
      (w.result === 'dup' ? 'Schon angelernt' : (w.result === 'cancel' ? 'Abgebrochen' : 'Hat nicht geklappt')) + '</p><p>' + esc(msg) + '</p></div>';
    return '<div class="live"><div class="ring2 ' + ring + (phase !== 'wait' ? ' pulse' : '') + '">' + icon('finger', 44) + '</div><p class="hl2">' + esc(head) + '</p>' +
      (phase === 'img' ? '<div class="prog"><div style="width:' + pct + '%"></div></div>' : '') +
      '<p class="muted">' + esc(msg || '…') + '</p></div>';
  }

  function viewSheet() {
    const s = S.sheet;
    if (!s) return '';
    let h = '';
    if (s.type === 'finger') {
      h = '<h2>' + esc(s.person) + ' · ' + HANDS[s.hand] + ', ' + FINGERS[s.finger] + '</h2><p class="muted">Speicherplatz ' + s.slot + '</p>' +
        '<p class="q">Aktion</p><div class="list">' + ACTIONS.map((a, i) =>
          '<button type="button" class="opt' + (s.action === i ? ' sel' : '') + '" data-a="f-action" data-x="' + i + '"><b>' + a + '</b><span>' + actionHint(i) + '</span></button>').join('') + '</div>' +
        '<div class="foot">' + btn('f-reenroll', 'Neu anlernen', 'b') +
        (S.confirm === 'del' ? btn('f-delete', 'Wirklich löschen', 'b danger') : btn('ask-del', 'Löschen', 'b')) + '</div>';
    } else if (s.type === 'person') {
      h = '<h2>' + esc(s.person) + ' umbenennen</h2><p class="muted">Finger, Plätze und Aktionen bleiben. Gibt es den neuen Namen schon, werden beide Personen nach Rückfrage zusammengeführt.</p>' +
        '<label class="fld"><span class="lbl">Neuer Name</span><input type="text" maxlength="15" data-c="p-new" data-k="p-new" value="' + esc(s.newName || '') + '"></label>' +
        '<p class="la">' + esc(stripTime(txt('text_sensor/Fingerprint: Letzte Aktion'))) + '</p>' +
        '<div class="foot">' + btn('p-rename', /existiert bereits/.test(txt('text_sensor/Fingerprint: Letzte Aktion')) ? 'Zusammenführen bestätigen' : 'Umbenennen', 'b pri') + '</div>';
    } else if (s.type === 'sched') {
      h = sheetSched(s);
    } else if (s.type === 'slot') {
      h = '<h2>Platz ' + s.slot + '</h2><p class="muted">Im Sensor gespeichert, aber keiner Person zugeordnet.</p>' +
        '<div class="foot">' + btn('s-assign', 'Zuordnen …', 'b pri') +
        (S.confirm === 'slot' ? btn('s-delete', 'Wirklich löschen', 'b danger') : btn('ask-slot', 'Löschen', 'b')) + '</div>';
    }
    return '<div class="scrim" data-a="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true">' +
      '<button type="button" class="ib close" data-a="sheet-close" aria-label="Schließen">' + icon('x', 20) + '</button>' + h + '</div>';
  }

  // Zeitplan-Zeile "an 22:00 Mo-Fr zu" (gleiche Regeln wie im ESP)
  const SCHED_N = 6;
  function parseSched(t) {
    const r = { empty: false, valid: false, on: true, time: '', mask: 0x7F, act: 2, rdir: '', rmin: 0 };
    const days = [];
    const toks = String(t || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) { r.empty = true; return r; }
    for (const k of toks) {
      let m;
      if (/^(an|ein|on)$/.test(k)) r.on = true;
      else if (/^(aus|off)$/.test(k)) r.on = false;
      else if (/^(zu|zuschlie(ß|ss)en|lock)$/.test(k)) r.act = 2;
      else if (/^(auf|aufschlie(ß|ss)en|unlock)$/.test(k)) r.act = 1;
      // Zufall: +N nur später, -N nur früher, ±N oder +-N beides (N = 0…60, 0 = aus)
      else if ((m = k.match(/^(±|\+-|\+|-)(\d{1,2})$/)) && +m[2] <= 60) { r.rmin = +m[2]; r.rdir = !r.rmin ? '' : m[1] === '+' ? 'p' : m[1] === '-' ? 'm' : 'b'; }
      else if ((m = k.match(/^(\d{1,2}):(\d{1,2})(:00)?$/)) && +m[1] < 24 && +m[2] < 60) r.time = String(+m[1]).padStart(2, '0') + ':' + String(+m[2]).padStart(2, '0');
      else days.push(k);
    }
    const d = days.join(',').replace(/,-|-,/g, '-');
    r.mask = !d || /^(mo-so)$/.test(d) ? 0x7F : daysMask(d);
    r.valid = !!r.time && r.mask > 0;
    return r;
  }
  const RSYM = { p: '+', m: '-', b: '±' };
  const buildSched = (o) => (o.on ? 'an' : 'aus') + ' ' + o.time + ' ' + daysText(o.mask) + ' ' + (o.act === 1 ? 'auf' : 'zu') + (o.rdir && o.rmin ? ' ' + RSYM[o.rdir] + o.rmin : '');
  const schedId = (n) => 'text/Zeitplan ' + n;

  function viewPlan() {
    let h = '<div class="headrow"><h2>Zeitplan</h2></div>';
    if (has('text_sensor/Zeitplan')) h += '<p class="muted">' + esc(txt('text_sensor/Zeitplan')) + '</p>';
    const list = [];
    let free = 0, firstFree = 0;
    for (let n = 1; n <= SCHED_N; n++) {
      if (!has(schedId(n))) continue;
      const raw = txt(schedId(n)), p = parseSched(raw);
      if (p.empty) { free++; if (!firstFree) firstFree = n; continue; }
      list.push({ n, raw, p });
    }
    list.sort((a, b) => (b.p.valid - a.p.valid) || a.p.time.localeCompare(b.p.time) || a.n - b.n);
    h += '<div class="slist">';
    for (const { n, raw, p } of list) {
      if (!p.valid) {
        h += '<div class="srow bad"><button type="button" class="smain" data-a="sched-edit" data-x="' + n + '">' +
          '<span class="sic warn">' + icon('alert', 20) + '</span><span class="sbad"><b>Zeitplan ' + n + ' ungültig</b><small>„' + esc(raw) + '“ – antippen zum Korrigieren</small></span></button></div>';
        continue;
      }
      const what = p.act === 1 ? 'Aufschließen' : 'Zuschließen';
      h += '<div class="srow' + (p.on ? '' : ' off') + '"><button type="button" class="smain" data-a="sched-edit" data-x="' + n + '" aria-label="Zeitplan ' + n + ': ' + p.time + ' ' + daysText(p.mask) + ' ' + what + ' – bearbeiten">' +
        '<span class="sic ' + (p.act === 1 ? 'unl' : 'lck') + '">' + icon(p.act === 1 ? 'unlock' : 'lock', 20) + '</span>' +
        '<span class="stime">' + p.time + (p.rdir ? '<small class="srnd">' + RSYM[p.rdir] + p.rmin + ' min</small>' : '') + '</span><span class="sdays" aria-hidden="true">' +
        'MDMDFSS'.split('').map((d, i) => '<span' + (p.mask & (1 << i) ? ' class="on"' : '') + '>' + d + '</span>').join('') + '</span></button>' +
        '<button type="button" class="sw' + (p.on ? ' on' : '') + '" role="switch" aria-checked="' + p.on + '" aria-label="Zeitplan ' + n + ' aktiv" data-a="sched-tog" data-x="' + n + '"' + (S.busy ? ' disabled' : '') + '><span></span></button></div>';
    }
    if (!list.length) h += '<p class="muted">Noch kein Zeitplan angelegt.</p>';
    if (free) h += '<button type="button" class="sadd" data-a="sched-new" data-x="' + firstFree + '">+ Zeitplan (' + list.length + ' von ' + (list.length + free) + ')</button>';
    return h + '</div>';
  }
  // Klartext unter der Zufallsauswahl, z. B. "Zuschließen zufällig zwischen 21:50 und 22:10 Uhr …"
  function rndPreview(s) {
    const what = s.act === 1 ? 'Aufschließen' : 'Zuschließen';
    if (!s.rdir || !s.time) return what + ' genau um ' + esc(s.time || '–') + ' Uhr.';
    const [h, m] = s.time.split(':').map(Number), t = h * 60 + m;
    const lo = Math.max(0, t - (s.rdir === 'p' ? 0 : s.rmin)), hi = Math.min(1439, t + (s.rdir === 'm' ? 0 : s.rmin));
    const f = (x) => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
    return what + ' zufällig zwischen <b>' + f(lo) + '</b> und <b>' + f(hi) + '</b> Uhr, jeden Tag neu ausgewürfelt.';
  }
  function sheetSched(s) {
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const pre = [[0x1F, 'Mo–Fr'], [0x60, 'Sa+So'], [0x7F, 'Täglich']];
    return '<h2>Zeitplan ' + s.n + (s.isNew ? ' anlegen' : ' bearbeiten') + '</h2>' +
      '<input type="time" class="bigtime stbig" data-c="sc-time" data-k="sc-time" value="' + esc(s.time) + '" aria-label="Uhrzeit">' +
      '<div class="fld"><span class="lbl">Aktion</span><div class="seg">' +
      [[2, 'lock', 'Zuschließen'], [1, 'unlock', 'Aufschließen']].map((a) => '<button type="button" class="' + (s.act === a[0] ? 'sel' : '') + '" data-a="sc-act" data-x="' + a[0] + '" aria-pressed="' + (s.act === a[0]) + '">' + icon(a[1], 16) + ' ' + a[2] + '</button>').join('') + '</div></div>' +
      '<div class="fld"><span class="lbl">Wochentage</span><div class="days">' +
      days.map((d, i) => '<button type="button" class="' + (s.mask & (1 << i) ? 'sel' : '') + '" data-a="sc-day" data-x="' + i + '" aria-pressed="' + !!(s.mask & (1 << i)) + '">' + d + '</button>').join('') + '</div>' +
      '<div class="presets">' + pre.map((p) => '<button type="button" class="chip' + (s.mask === p[0] ? ' sel' : '') + '" data-a="sc-pre" data-x="' + p[0] + '">' + p[1] + '</button>').join('') + '</div></div>' +
      (s.mask ? '' : '<p class="note">Mindestens einen Wochentag wählen.</p>') +
      '<div class="fld"><span class="lbl">Zufällige Abweichung</span><div class="seg">' +
      [['', 'Genau'], ['m', 'Früher'], ['p', 'Später'], ['b', 'Beides']].map((d) => '<button type="button" class="' + (s.rdir === d[0] ? 'sel' : '') + '" data-a="sc-rdir" data-x="' + d[0] + '" aria-pressed="' + (s.rdir === d[0]) + '">' + d[1] + '</button>').join('') + '</div>' +
      (s.rdir ? '<div class="rstep"><button type="button" class="b sm" data-a="sc-rmin" data-x="' + (s.rmin - 1) + '" aria-label="1 Minute weniger"' + (s.rmin <= 1 ? ' disabled' : '') + '>−</button>' +
        '<label><span>' + RSYM[s.rdir] + '</span><input type="number" inputmode="numeric" min="1" max="60" data-c="sc-rmin" data-k="sc-rmin" value="' + s.rmin + '" aria-label="Minuten"><span>min</span></label>' +
        '<button type="button" class="b sm" data-a="sc-rmin" data-x="' + (s.rmin + 1) + '" aria-label="1 Minute mehr"' + (s.rmin >= 60 ? ' disabled' : '') + '>+</button></div>' : '') +
      '<p class="muted small rprev">' + rndPreview(s) + '</p></div>' +
      '<div class="foot">' + (s.isNew ? '' : (S.confirm === 'sched' ? btn('sc-del', 'Wirklich löschen', 'b danger') : btn('ask-sched', 'Löschen', 'b'))) +
      '<button type="button" class="b pri" data-a="sc-save"' + (s.mask && s.time && !S.busy ? '' : ' disabled') + '>Speichern</button></div>';
  }

  // QR-Text der Keycard: M<MAC 12 Hex>K<Card Key 32 Hex><Seriennummer>
  function parseCardKey(raw) {
    const k = String(raw || '').replace(/\s+/g, '');
    const m = k.match(/^M([0-9A-Fa-f]{12})K([0-9A-Fa-f]{32})(.*)$/);
    if (!m) return null;
    return { key: k, mac: m[1].toUpperCase().match(/../g).join(':'), sn: m[3] || '?' };
  }
  function choiceMap(id, label, names) {
    if (!has(id)) return '';
    const cur = txt(id);
    return '<div class="fld"><span class="lbl">' + esc(label) + '</span><div class="seg">' +
      (E[id].option || Object.keys(names)).map((o) => '<button type="button" class="' + (o === cur ? 'sel' : '') + '" data-a="opt" data-x="' + esc(id) +
        '" data-v="' + esc(o) + '">' + esc(names[o] || o) + '</button>').join('') + '</div></div>';
  }
  function viewSetup() {
    let h = '';
    if (has('button/BLE Pair _Start_')) {
      const st = txt('text_sensor/Einrichtungsstatus', '–');
      const uid = (txt('text_sensor/Einrichtungsstatus').match(/gekoppelt wurde User (\d+)/) || [])[1];
      h += card('<h3>Einrichtung</h3>' + row('Status', st) + (has('text_sensor/Pairing-Info') ? row('Pairing', txt('text_sensor/Pairing-Info', '–')) : '') +
        (uid !== undefined ? '<p class="note">Die eingestellte User-ID passt nicht zum Pairing.</p><div class="foot">' + btn('fixuid', 'User ' + uid + ' übernehmen', 'b pri', uid) + '</div>' : '') +
        '<div class="foot">' + btn('pair', 'Schloss koppeln (Pairing)', 'b' + (/^[①②]/.test(st) ? ' pri' : '')) + '</div>' +
        (has('button/Kopplung entfernen') && !/^①/.test(st) ?
          (S.confirm === 'unpair'
            ? '<p class="note">Der ESP vergisst Schlüssel und MAC-Adresse und verbindet sich nicht mehr mit dem Schloss. ' +
              'Im Schloss bleibt er als Benutzer angelernt – dort per Eqiva-App (Benutzerverwaltung) oder Werksreset austragen.</p>' +
              '<div class="foot">' + btn('unpair', 'Wirklich entfernen', 'b danger') + '</div>'
            : '<div class="foot">' + btn('ask-unpair', 'Kopplung entfernen', 'b') + '</div>') : ''));
    }
    if (has('button/Lock Settings _Apply_')) {
      h += card('<h3>Schlossantrieb einstellen</h3><p class="muted">Nach einem Werksreset nötig. Das Schloss muss verbunden sein.</p>' +
        choiceMap('select/Lock Settings Close Direction', 'Schließrichtung', { Left: 'Links', Right: 'Rechts' }) +
        choiceMap('select/Lock Settings Key Position', 'Schlüsselposition', { Vertical: 'Senkrecht', Horizontal: 'Waagerecht' }) +
        choiceMap('select/Lock Settings Turns', 'Umdrehungen', { 1: '1', 2: '2', 3: '3', 4: '4' }) +
        '<div class="foot">' + btn('press', 'Am Schloss übernehmen', 'b pri', 'button/Lock Settings _Apply_') + '</div>');
    }
    return h;
  }
  function viewPair() {
    const w = S.pair;
    const ck = parseCardKey(w.key);
    let body = '', foot = '';
    if (w.step === 0) {
      body = '<p class="q">Schloss ist bereits gekoppelt</p><div class="sum">' + row('Pairing', txt('text_sensor/Pairing-Info', '–')) + '</div>' +
        '<p>Erneut koppeln legt im Schloss einen <b>weiteren Benutzer</b> an (das Schloss hat nur wenige Plätze, User 0–7).</p>' +
        '<p class="muted">Für ein <b>anderes Schloss</b> vorher „Kopplung entfernen“. Scheitert das neue Pairing, bleibt die bisherige Kopplung erhalten.</p>';
      foot = btn('p-close', 'Abbrechen', 'b') + btn('p-force', 'Trotzdem koppeln', 'b pri');
    } else if (w.step === 1) {
      body = '<p class="q">Card Key eintragen</p>' +
        '<ol class="steps"><li>QR-Code auf der Keycard mit der Handy-Kamera oder Google Lens scannen.</li><li>Den Text (beginnt mit <b>M001A…</b>) kopieren.</li><li>Hier einfügen (lange tippen → Einfügen).</li></ol>' +
        '<label class="fld"><span class="lbl">QR-Text der Keycard</span><textarea rows="3" data-c="pair-key" data-k="pair-key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="M001A…">' + esc(w.key) + '</textarea></label>' +
        (ck ? '<div class="sum">' + row('MAC-Adresse', ck.mac) + row('Seriennummer', ck.sn) + '</div>' :
          (w.key.trim() ? '<p class="note">Das ist kein vollständiger QR-Text – er beginnt mit „M“, enthält ein „K“ an Stelle 14 und ist mindestens 46 Zeichen lang.</p>' : ''));
      foot = btn('p-close', 'Abbrechen', 'b') + btn('p-next', 'Weiter', 'b pri' + (ck ? '' : ' dis'), undefined, ck ? '' : ' aria-disabled="true"');
    } else if (w.step === 2) {
      body = '<p class="q">Schloss in den Pairing-Modus bringen</p>' +
        '<div class="live"><div class="ring2 rs-orange pulse">' + icon('lock', 44) + '</div>' +
        '<p>Am Schloss die Taste <b>Öffnen</b> ca. <b>5 s</b> halten, bis die LED <b>schnell orange blinkt</b>.</p>' +
        '<p class="muted">Dann sofort „Pairing starten“ drücken (der Pairing-Modus endet nach kurzer Zeit).</p></div>';
      foot = btn('p-back', 'Zurück', 'b') + btn('p-start', 'Pairing starten', 'b pri');
    } else {
      const info = txt('text_sensor/Pairing-Info'), st = txt('text_sensor/Einrichtungsstatus');
      const age = Date.now() - w.started;
      const ev = txt('text_sensor/Ereignisse'), top = ev.split(' · ')[0];
      const evNew = seq('text_sensor/Ereignisse') > w.seenEvSeq;
      const done = (info && info !== w.seenInfo) || (evNew && /🔗 Gekoppelt/.test(top));
      if (done && !w.result) { w.result = 'ok'; w.key = ''; }
      if (!w.result && evNew && /✗ Pairing nicht bestätigt/.test(top)) { w.result = 'timeout'; w.kept = /bisherige Kopplung bleibt/.test(top); }
      if (!w.result && age > 70000) w.result = 'timeout';
      if (w.result === 'ok') {
        const uid = (st.match(/gekoppelt wurde User (\d+)/) || [])[1];
        body = '<div class="live"><div class="ring2 rs-ok">' + icon('check', 48) + '</div><p class="hl2">Gekoppelt</p><p>' + esc(info) + '</p>' +
          '<p class="muted">' + esc(st) + '</p></div>' +
          (uid !== undefined ? '<p class="note">Die eingestellte User-ID passt nicht – bitte übernehmen.</p>' + '<div class="foot">' + btn('fixuid', 'User ' + uid + ' übernehmen', 'b pri', uid) + '</div>' : '');
        foot = btn('p-close', 'Fertig', 'b pri');
      } else if (w.result === 'timeout') {
        body = '<div class="live"><div class="ring2 rs-err">' + icon('alert', 44) + '</div><p class="hl2">Pairing nicht bestätigt</p>' +
          '<p>Vermutlich war der Pairing-Modus schon vorbei. Öffnen-Taste erneut ca. 5 s halten, bis die LED schnell orange blinkt, und <b>sofort</b> „Pairing starten“ drücken. Der ESP sollte nah am Schloss sein.</p>' +
          (w.kept ? '<p class="muted">Die bisherige Kopplung ist erhalten geblieben.</p>' : '') +
          '<p class="muted">' + esc(st) + '</p></div>';
        foot = btn('p-close', 'Schließen', 'b') + btn('p-retry', 'Nochmal versuchen', 'b pri');
      } else {
        body = '<div class="live"><div class="ring2 pulse">' + icon('spin', 44) + '</div><p class="hl2">Pairing läuft …</p>' +
          '<p class="muted">' + esc(st || '…') + '</p><p class="muted small">' + Math.round(age / 1000) + ' s</p></div>';
        foot = has('button/Pairing abbrechen') ? btn('p-cancel', 'Pairing abbrechen', 'b') : btn('p-close', 'Ausblenden', 'b');
      }
    }
    return card('<div class="headrow"><h2>Schloss koppeln</h2><span class="muted">' + (w.step ? 'Schritt ' + w.step + ' von 3' : '') + '</span></div>' +
      '<div class="prog"><div style="width:' + (w.step / 3 * 100) + '%"></div></div>' + body + '<div class="foot">' + foot + '</div>', 'wiz');
  }

  function viewMore() {
    if (S.pair) return viewPair();
    const grp = (title, items) => { const inner = items.filter(Boolean).join(''); return inner ? card('<h3>' + title + '</h3>' + inner) : ''; };
    let h = '<h2>Einstellungen</h2><div class="cards">';
    h += viewSetup();
    if (has('switch/Simulation: Schloss erreichbar')) h += grp('Testmodus (Simulation)', [toggle('switch/Simulation: Schloss erreichbar', 'Schloss erreichbar'),
      num('number/Simulation: Fahrzeit', 'Fahrzeit'), has('button/Simulation: von Hand drehen') ? '<div class="foot">' + btn('press', 'Von Hand drehen', 'b', 'button/Simulation: von Hand drehen') + '</div>' : '']);
    const EM = { 'Schnell': 'Dauerverbindung – das Schloss reagiert sofort. Höchster Batterieverbrauch im Schloss.',
      'Ausgewogen': 'Dauerverbindung mit längerem Abstand – etwas langsamer, spart Batterie.',
      'Sparsam': 'Verbindet nur bei Bedarf – der erste Befehl dauert ca. 3–5 s, weil erst die Verbindung aufgebaut wird. Handbedienung sieht der ESP erst bei der nächsten Statusabfrage.' };
    const emHint = EM[txt('select/Energiemodus')] ? '<p class="muted small">' + EM[txt('select/Energiemodus')] + '</p>' : '';
    h += grp('Schloss', [choice('select/Energiemodus', 'Energiemodus'), emHint, choice('select/Türgriff außen', 'Türgriff außen'),
      (!has('select/Türgriff außen') ? '' : knauf() ? '<div class="knauf sm">' + icon('alert', 18) + '<span>„Öffnen“ und „Umschalten“ per Finger ziehen die Falle. Der Motor dreht über „auf“ hinaus, bis die Tür frei ist – ohne eingebautes Schloss läuft er dabei lange.</span></div>' :
        '<p class="muted small">„Öffnen“ und „Umschalten“ schließen nur auf, die Klinke drückt man selbst.</p>'),
      num('number/Ausgewogen: Verbindungsabstand', 'Ausgewogen: Abstand'), num('number/Sparsam: Trennen nach Leerlauf', 'Sparsam: trennen nach'),
      num('number/Sparsam: Status-Abfrage alle', 'Sparsam: Status alle')]);
    h += grp('Fingerprint', [choice('select/Standard-Aktion (Finger ohne Zuordnung)', 'Standard-Aktion'), toggle('switch/Klingel bei unbekanntem Finger', 'Klingel bei unbekanntem Finger'),
      toggle('switch/Bei Berührung vorab verbinden', 'Bei Berührung vorab verbinden (Sparmodus)'),
      has('switch/Bei Berührung vorab verbinden') ? '<p class="muted small">Baut schon beim Auflegen die Verbindung zum Schloss auf – der Befehl geht dann schneller raus. Höchstens einmal pro Minute.</p>' : '',
      choice('select/Klingel-Anzeige', 'Klingel-Anzeige'), num('number/Klingel-Verzögerung', 'Klingel-Verzögerung'), num('number/Klingel-Pause', 'Klingel-Pause'),
      toggle('switch/Ring-Anzeige bei Bedienung ohne Finger', 'Ring bei Bedienung ohne Finger'), num('number/Max. Fehlversuche', 'Max. Fehlversuche'),
      num('number/Sperrzeit nach Fehlversuchen', 'Sperrzeit'), num('number/Min. Übereinstimmung', 'Min. Übereinstimmung'),
      num('number/Scan-Pause nach Aktion', 'Scan-Pause nach Aktion'), num('number/Anlern-Scans', 'Anlern-Scans')]);
    h += grp('Sabotage-Erkennung', ['Sensor antwortet nicht', 'Belegung verändert', 'Fremder Sensor', 'Unmöglicher Treffer', 'Berührungsleitung dauerhaft',
      'Alarm bei Fehlversuch-Sperre'].map((n) => toggle('switch/Sabotage: ' + n, n)).concat([toggle('switch/Bei Sabotage Fingerprint sperren', 'Bei Sabotage Fingerprint sperren'),
      num('number/Sabotage-Prüfintervall', 'Prüfintervall'), num('number/Max. Berührungsdauer', 'Max. Berührungsdauer')]));
    const diag = [];
    const add = (id, label, f) => { if (!has(id)) return; const v = val(id, null); diag.push(row(label, f && v !== null && isFinite(Number(v)) ? f(v) : (txt(id) || '–'))); };
    diag.push(row('App', APP_VERSION));
    add('text_sensor/Konfiguration Version', 'Firmware');
    add('text_sensor/Lock BLE State', 'Bluetooth');
    add('sensor/Schloss Signal', 'Schloss Signal', (v) => Math.round(v) + ' dBm');
    add('sensor/WLAN Signal', 'WLAN Signal', (v) => Math.round(v) + ' dBm');
    add('sensor/ESP Temperatur', 'ESP Temperatur', (v) => (+v).toFixed(1) + ' °C');
    add('sensor/Uptime', 'Laufzeit', (v) => { v = +v; const d = Math.floor(v / 86400), hh = Math.floor(v % 86400 / 3600), mm = Math.floor(v % 3600 / 60); return (d ? d + ' T ' : '') + hh + ' h ' + mm + ' min'; });
    add('text_sensor/Pairing-Info', 'Pairing');
    add('sensor/Fingerabdrücke gespeichert', 'Fingerabdrücke', (v) => Math.round(v));
    h += card('<h3>Diagnose</h3>' + diag.join(''));
    h += '<div class="links"><a class="b lnk" href="' + GUIDE_URL + '" target="_blank" rel="noopener">' + icon('book', 18) + 'Anleitung</a>' +
      btn('expert', icon('table', 18) + 'Expertenansicht', 'b lnk') + '</div>';
    if (has('button/ESP Restart')) h += card('<h3>ESP</h3><p class="muted">Startet den ESP neu (ca. 15 s). Einstellungen und Finger bleiben erhalten.</p><div class="foot">' +
      (S.confirm === 'restart' ? btn('restart', 'Wirklich neu starten', 'b danger') : btn('ask-restart', 'ESP neu starten', 'b')) + '</div>');
    h += '<p class="muted small">BLE-Einstellungen von Hand und Log-Stufe: Expertenansicht (ESPHome-Tabelle, braucht Internet).</p>';
    return h + '</div>';
  }

  // ---------------------------------------------------------------- Gesamtseite
  function tabs() {
    const t = [['start', 'lock', 'Schloss']];
    if (has('text_sensor/Fingerprint: Letzte Aktion')) t.push(['finger', 'finger', 'Fingerprint']);
    if (has('text/Zeitplan 1')) t.push(['plan', 'clock', 'Zeitplan']);
    t.push(['more', 'sliders', 'Einstellungen']);
    return t;
  }

  function page() {
    const T = tabs();
    if (!T.some((x) => x[0] === S.tab)) S.tab = 'start';
    const nav = T.map((x) => '<button type="button" class="' + (S.tab === x[0] ? 'act' : '') + '" data-a="tab" data-x="' + x[0] + '"' + (S.tab === x[0] ? ' aria-current="page"' : '') + '>' +
      icon(x[1], 22) + '<span>' + x[2] + '</span></button>').join('');
    const fw = txt('text_sensor/Konfiguration Version');
    const conn = S.conn === 'ok' ? '' : '<div class="ban warn">' + (S.conn === 'lost' ? 'Verbindung zum ESP unterbrochen – verbinde neu …' : 'Verbinde …') + '</div>';
    const sab = on('binary_sensor/Fingerprint Sabotage') ? '<div class="ban sab">' + icon('alert', 22) + '<div><b>Sabotage-Alarm</b><span>' +
      esc(stripTime(txt('text_sensor/Fingerprint: Letzte Aktion')).replace(/^⚠️ /, '')) + '</span></div>' + btn('press', 'Quittieren', 'b ghost', 'button/Sabotage quittieren') + '</div>' : '';
    const ver = fw && fw !== APP_VERSION ? '<div class="ban warn">Firmware v' + esc(fw) + ' – App v' + APP_VERSION + ': Dateien passen nicht zusammen.</div>' : '';
    const sim = has('switch/Simulation: Schloss erreichbar') ? '<span class="pill sim">Testmodus</span>' : '';
    const views = { start: viewStart, finger: viewFinger, plan: viewPlan, more: viewMore };
    // Kopfzeile: Schloss-Symbol und Zustand links, Darstellung und Uhrzeit des ESP rechts
    const lst = txt('text_sensor/Lock Status', ''), unp = /^[①②]/.test(txt('text_sensor/Einrichtungsstatus'));
    const LS = unp ? { label: 'Nicht gekoppelt', icon: 'unlock' } : (LOCK[lst] || (lst ? LOCK.UNKNOWN : { label: 'Lade …', icon: 'spin' }));
    const sk = unp ? 'wr' : ({ LOCKED: 'lk', UNLOCKED: 'ul', OPENED: 'op', MOVING: 'mv' }[lst] || (lst ? 'wr' : 'mv'));
    const TH = [['auto', 'auto', 'Darstellung automatisch'], ['light', 'sun', 'Hell'], ['dark', 'moon', 'Dunkel']];
    const seg = '<div class="hseg" role="group" aria-label="Darstellung">' + TH.map((t) => '<button type="button" class="' + (S.theme === t[0] ? 'sel' : '') +
      '" data-a="theme" data-x="' + t[0] + '" aria-label="' + t[2] + '" aria-pressed="' + (S.theme === t[0]) + '">' + icon(t[1], 17) + '</button>').join('') + '</div>';
    let clock = '';
    if (has('text_sensor/ESP Uhrzeit')) {
      const tm = txt('text_sensor/ESP Uhrzeit'), ok = /^\d\d:\d\d$/.test(tm);
      clock = '<span class="hclock' + (ok ? '' : ' bad') + '" title="' + (ok ? 'Uhrzeit des ESP' : 'ESP kennt keine Uhrzeit – Zeitplan pausiert') + '">' +
        icon(ok ? 'clock' : 'alert', 14) + (ok ? tm : '--:--') + '</span>';
    }
    return '<header><span class="hlock k' + sk + '" title="' + esc(LS.label) + '">' + icon(LS.icon, 25) + '</span>' +
      '<div class="brand"><h1>' + esc(S.title || 'Schloss') + '</h1><span class="hstate t' + sk + '">' + esc(LS.label) + '</span></div>' + sim +
      '<nav class="top" aria-label="Bereiche">' + nav + '</nav><div class="hright">' + seg + clock + '</div></header>' + conn + sab + ver +
      '<main>' + views[S.tab]() + '</main><nav class="bottom" aria-label="Bereiche">' + nav + '</nav>' +
      viewSheet() + (S.toast ? '<div class="toast" role="status">' + esc(S.toast) + '</div>' : '');
  }

  let root, pending = false, held = false;
  function draw() {
    if (!root || pending) return;
    // Offene Auswahlliste / Zeitwähler nicht durch Neuzeichnen schließen – nach dem Verlassen nachholen
    const ae = document.activeElement;
    if (ae && root.contains(ae) && (ae.tagName === 'SELECT' || ae.type === 'time')) { held = true; return; }
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      // Fokus und Cursor im gerade bearbeiteten Feld behalten
      const a = document.activeElement;
      const key = a && root.contains(a) && a.dataset ? a.dataset.k : null;
      const sel = key && a.selectionStart !== undefined ? [a.selectionStart, a.selectionEnd] : null;
      const keepVal = key ? a.value : null;
      const sy = root.scrollTop;
      root.innerHTML = page();
      root.scrollTop = sy;
      if (key) {
        const n = root.querySelector('[data-k="' + CSS.escape(key) + '"]');
        if (n) { n.value = keepVal; n.focus(); try { if (sel) n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* time/number */ } }
      }
    });
  }

  // ---------------------------------------------------------------- Bedienung
  const fpSetup = (person, hand, finger, action) => {
    const st = [['text/Person', 'set', { value: person }], ['select/Hand', 'set', { option: HANDS[hand] }], ['select/Finger', 'set', { option: FINGERS[finger] }]];
    if (action !== undefined) st.push(['select/Aktion dieses Fingers', 'set', { option: ACTIONS[action] }]);
    return st;
  };

  function onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || !root.contains(b) || b.disabled) return;
    const a = b.dataset.a, x = b.dataset.x, w = S.wiz;
    if (!/^(ask-del|ask-slot|f-delete|s-delete|ask-restart|restart|ask-unpair|unpair)$/.test(a)) S.confirm = '';
    switch (a) {
      case 'tab': S.tab = x; S.sheet = null; root.scrollTop = 0; break;
      case 'lock': return run([['lock/Schloss', 'lock']]);
      case 'unlock': return run([['lock/Schloss', 'unlock']]);
      case 'open': return run([['lock/Schloss', 'open']]);
      case 'press': return run([[x, 'press']]);
      case 'sw': return run([[x, 'toggle']]);
      case 'opt': return run([[x, 'set', { option: b.dataset.v }]]);
      case 'sched-edit': case 'sched-new': {
        const n = +x, p = parseSched(txt(schedId(n))), isNew = a === 'sched-new' || p.empty;
        S.confirm = '';
        S.sheet = { type: 'sched', n, isNew, on: isNew ? true : p.on, time: p.time || '22:00', act: p.act, mask: p.mask > 0 ? p.mask : 0x7F, rdir: p.rdir || '', rmin: p.rmin || 10 };
        break;
      }
      case 'sched-tog': {
        const n = +x, p = parseSched(txt(schedId(n)));
        if (!p.valid) return;
        p.on = !p.on;
        return run([[schedId(n), 'set', { value: buildSched(p) }]], 'Zeitplan ' + (p.on ? 'eingeschaltet' : 'ausgeschaltet'));
      }
      case 'sc-act': S.sheet.act = +x; break;
      case 'sc-rdir': S.sheet.rdir = x; break;
      case 'sc-rmin': S.sheet.rmin = Math.min(60, Math.max(1, +x || 1)); break;
      case 'sc-day': S.sheet.mask ^= 1 << +x; break;
      case 'sc-pre': S.sheet.mask = +x; break;
      case 'ask-sched': S.confirm = 'sched'; break;
      case 'sc-del': { const s = S.sheet; S.sheet = null; S.confirm = ''; return run([[schedId(s.n), 'set', { value: '' }]], 'Zeitplan gelöscht'); }
      case 'sc-save': {
        const s = S.sheet;
        if (!s.mask || !s.time) return;
        S.sheet = null;
        return run([[schedId(s.n), 'set', { value: buildSched(s) }]], 'Zeitplan gespeichert: ' + s.time + ' ' + daysText(s.mask) + ' ' + (s.act === 1 ? 'aufschließen' : 'zuschließen'));
      }
      case 'theme': S.theme = x; save('eqa-theme', x); applyTheme(); break;
      case 'expert': setExpert(true); return;
      // Pairing
      case 'pair': {
        const st = txt('text_sensor/Einrichtungsstatus');
        const paired = st && !/^[①②]/.test(st) && !/TESTMODUS/.test(st);
        S.tab = 'more'; S.pair = { step: paired ? 0 : 1, key: '' }; root.scrollTop = 0; break;
      }
      case 'p-force': S.pair.step = 1; break;
      case 'p-cancel': S.pair = null; draw(); return run([['button/Pairing abbrechen', 'press']], 'Pairing abgebrochen – bisherige Kopplung bleibt');
      case 'p-next': if (!parseCardKey(S.pair.key)) return; S.pair.step = 2; break;
      case 'p-back': S.pair.step = 1; break;
      case 'p-close': S.pair = null; break;
      case 'p-retry': S.pair.step = 2; S.pair.result = null; break;
      case 'p-start': {
        const w = S.pair, ck = parseCardKey(w.key);
        if (!ck) return;
        Object.assign(w, { step: 3, result: null, kept: false, started: Date.now(), seenInfo: txt('text_sensor/Pairing-Info'), seenEvSeq: seq('text_sensor/Ereignisse') });
        return run([['text/BLE Pair Card Key', 'set', { value: ck.key }], ['button/BLE Pair _Start_', 'press']]);
      }
      case 'fixuid': return run([['number/BLE Settings User ID', 'set', { value: x }], ['button/BLE Settings _Save_', 'press']], 'User-ID ' + x + ' übernommen');
      case 'ask-restart': S.confirm = 'restart'; break;
      case 'ask-unpair': S.confirm = 'unpair'; break;
      case 'unpair': S.confirm = ''; return run([['button/Kopplung entfernen', 'press']], 'Kopplung entfernt – Benutzer im Schloss per Eqiva-App oder Werksreset austragen');
      case 'restart': S.confirm = ''; return run([['button/ESP Restart', 'press']], 'ESP startet neu …');
      // Assistent
      case 'wiz': S.wiz = { mode: 'enroll', step: 1, person: '', hand: 1, finger: 0, action: 1 }; break;
      case 'w-person': w.person = x; break;
      case 'w-hand': w.hand = +x; break;
      case 'w-finger': w.finger = +x; break;
      case 'w-action': w.action = +x; break;
      case 'w-next': if (w.step === 1 && !w.person) return; w.step++; break;
      case 'w-back': w.step--; break;
      case 'w-close': S.wiz = null; break;
      case 'w-retry': Object.assign(w, { step: 4, result: null }); break;
      case 'w-start':
        w.seenSeq = seq('text_sensor/Fingerprint: Letzte Aktion'); w.result = null; w.step = 5;
        return run(fpSetup(w.person, w.hand, w.finger, w.action).concat([['button/Finger anlernen', 'press']]));
      case 'w-cancel': S.wiz = null; draw(); return run([['button/Anlernen abbrechen', 'press']], 'Anlernen abgebrochen');
      case 'w-assign': {
        const p = w.person, hh = w.hand, ff = w.finger;
        S.wiz = null;
        return run(fpSetup(p, hh, ff, w.action).concat([['button/Letzten Finger zuordnen', 'press']]), 'Zugeordnet: ' + p + ' ' + (hh ? 'R-' : 'L-') + FSHORT[ff]);
      }
      // Detailfenster
      case 'sheet-close': S.sheet = null; break;
      case 'sheet-finger': { const v = x.split('|'); S.sheet = { type: 'finger', person: v[0], hand: +v[1], finger: +v[2], action: +v[3], slot: +v[4] }; break; }
      case 'sheet-person': S.sheet = { type: 'person', person: x, newName: '' }; break;
      case 'sheet-slot': S.sheet = { type: 'slot', slot: +x }; break;
      case 'f-action': { const s = S.sheet; s.action = +x; return run(fpSetup(s.person, s.hand, s.finger, s.action).concat([['button/Aktion übernehmen', 'press']]), 'Aktion geändert: ' + ACTIONS[s.action]); }
      case 'f-reenroll': { const s = S.sheet; S.sheet = null; S.wiz = { mode: 'enroll', step: 4, person: s.person, hand: s.hand, finger: s.finger, action: s.action }; break; }
      case 'ask-del': S.confirm = 'del'; break;
      case 'f-delete': { const s = S.sheet; S.sheet = null; S.confirm = ''; return run(fpSetup(s.person, s.hand, s.finger).concat([['button/Finger löschen', 'press']]), 'Gelöscht'); }
      case 'p-rename': { const s = S.sheet; const n = (s.newName || '').trim(); if (!n) { toast('Bitte einen neuen Namen eintragen'); return; }
        return run([['text/Person', 'set', { value: s.person }], ['text/Neuer Name', 'set', { value: n }], ['button/Person umbenennen', 'press']]); }
      case 'ask-slot': S.confirm = 'slot'; break;
      case 's-delete': { const s = S.sheet; S.sheet = null; S.confirm = ''; return run([['number/Speicherplatz (Nr.)', 'set', { value: s.slot }], ['button/Speicherplatz löschen', 'press']], 'Platz ' + s.slot + ' gelöscht'); }
      case 's-assign': { const s = S.sheet; S.sheet = null; S.wiz = { mode: 'assign', slot: s.slot, step: 1, person: '', hand: 1, finger: 0, action: 1 }; break; }
      default: return;
    }
    draw();
  }

  function onInput(e) {
    const n = e.target;
    if (!n.dataset) return;
    if (n.dataset.c === 'w-newperson' && S.wiz) { S.wiz.person = n.value.replace(/[,|]/g, ' ').trim(); draw(); }
    if (n.dataset.c === 'p-new' && S.sheet) S.sheet.newName = n.value;
    if (n.dataset.c === 'sc-time' && S.sheet && n.value) {   // nicht neu zeichnen (Zeitwähler bliebe sonst nicht offen)
      S.sheet.time = n.value.slice(0, 5);
      const pv = document.querySelector('#eqa .rprev'); if (pv) pv.innerHTML = rndPreview(S.sheet);
    }
    if (n.dataset.c === 'sc-rmin' && S.sheet && n.value) { S.sheet.rmin = Math.min(60, Math.max(1, Math.round(+n.value) || 1)); draw(); }
    if (n.dataset.c === 'pair-key' && S.pair) { S.pair.key = n.value; draw(); }
  }
  function onChange(e) {
    const n = e.target, c = n.dataset && n.dataset.c;
    if (c === 'opt') run([[n.dataset.x, 'set', { option: n.value }]]);
    else if (c === 'num' && n.value !== '') run([[n.dataset.x, 'set', { value: n.value }]]);
    else if (c === 'time' && n.value) run([[n.dataset.x, 'set', { value: n.value.length === 5 ? n.value + ':00' : n.value }]]);
    else if (c === 'w-newperson') { n.blur(); draw(); }
  }

  // ---------------------------------------------------------------- Darstellung, Expertenansicht
  function applyTheme() {
    document.documentElement.setAttribute('data-eqa-theme', S.theme);
    const dark = S.theme === 'dark' || (S.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = dark ? '#171A21' : '#FFFFFF';
  }
  // Die ESPHome-Tabelle (<esp-app>) bleibt immer eingehängt und wird nur ausgeblendet: Sie baut ihre
  // Zeilen aus dem Startpaket, das der ESP einmal nach dem Verbinden schickt. Neu eingehängt
  // hätte sie dieses Paket verpasst und bliebe bis zum Neuladen leer.
  function setExpert(v) {
    S.expert = v;
    document.documentElement.classList.toggle('eqa-expert', v);
    save('eqa-expert', v ? '1' : '');
    if (v && !document.querySelector('esp-app')) document.body.insertBefore(document.createElement('esp-app'), document.body.firstChild);
  }

  const CSS_TEXT = `
#eqa{--bg:#E4E7EC;--card:#FFF;--fg:#111827;--muted:#4B5563;--line:#D3D8E0;--bline:#C7CCD4;--soft:#F3F4F6;--acc:#1D4ED8;--accs:#EFF6FF;--acci:#1E3A8A;
--lk:#15803D;--lkb:#DCFCE7;--ul:#B91C1C;--ulb:#FEE2E2;--op:#1D4ED8;--opb:#DBEAFE;--mv:#374151;--mvb:#E5E7EB;--wr:#92400E;--wrb:#FEF3C7;--pu:#6D28D9;--pub:#EDE9FE;
color-scheme:light;position:fixed;inset:0;overflow-y:auto;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;z-index:10;-webkit-tap-highlight-color:transparent}
@media (prefers-color-scheme:dark){html:not([data-eqa-theme=light]) #eqa{color-scheme:dark;--bg:#08090C;--card:#1B1F27;--fg:#E6E9EF;--muted:#9AA3B2;--line:#333A48;--soft:#20242D;--acc:#6EA0FF;--accs:#1E2F57;--acci:#D6E4FF;--bline:#46506A;
--lk:#4ADE80;--lkb:#12301F;--ul:#F87171;--ulb:#3A1717;--op:#7AA7FF;--opb:#172645;--mv:#CBD5E1;--mvb:#252A33;--wr:#FCD34D;--wrb:#3A2E10;--pu:#C4B5FD;--pub:#2A2142}}
html[data-eqa-theme=dark] #eqa{color-scheme:dark;--bg:#08090C;--card:#1B1F27;--fg:#E6E9EF;--muted:#9AA3B2;--line:#333A48;--soft:#20242D;--acc:#6EA0FF;--accs:#1E2F57;--acci:#D6E4FF;--bline:#46506A;
--lk:#4ADE80;--lkb:#12301F;--ul:#F87171;--ulb:#3A1717;--op:#7AA7FF;--opb:#172645;--mv:#CBD5E1;--mvb:#252A33;--wr:#FCD34D;--wrb:#3A2E10;--pu:#C4B5FD;--pub:#2A2142}
html:not(.eqa-expert) esp-app{display:none}html.eqa-expert #eqa{display:none}
#eqa-back{position:fixed;right:16px;bottom:16px;z-index:20;display:none;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#1D4ED8;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
html.eqa-expert #eqa-back{display:block}
#eqa *{box-sizing:border-box}#eqa h1{margin:0;font-size:20px;font-weight:700}#eqa h2{margin:0 0 8px;font-size:17px;font-weight:700}#eqa h3{margin:0 0 10px;padding-bottom:8px;border-bottom:2px solid var(--accs);font-size:16px;font-weight:700;color:var(--acci)}
#eqa p{margin:6px 0}#eqa .muted{color:var(--muted)}#eqa .small{font-size:12px}#eqa .note{font-size:13px;color:var(--wr)}#eqa .knauf{display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--wrb);color:var(--wr);border:1.5px solid var(--wr)}#eqa .knauf b{display:block;font-size:15px;margin-bottom:2px}#eqa .knauf span{font-size:14px;line-height:1.35}#eqa .knauf svg{flex:none;margin-top:1px}#eqa .knauf.sm{margin-top:8px;padding:10px 12px}#eqa .knauf.sm span{font-size:13px}
#eqa header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--card);border-bottom:1px solid var(--line)}
#eqa .stale{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--wr)}#eqa .stale svg{flex:none}#eqa .stale .b{min-height:34px;padding:0 12px;font-size:13px}
#eqa .hlock{width:46px;height:46px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none}#eqa .hlock.klk{background:var(--lkb);color:var(--lk)}#eqa .hlock.kul{background:var(--ulb);color:var(--ul)}#eqa .hlock.kop{background:var(--opb);color:var(--op)}#eqa .hlock.kmv{background:var(--mvb);color:var(--mv)}#eqa .hlock.kwr{background:var(--wrb);color:var(--wr)}#eqa .hstate{font:700 13px system-ui,sans-serif}#eqa .hstate.tlk{color:var(--lk)}#eqa .hstate.tul{color:var(--ul)}#eqa .hstate.top{color:var(--op)}#eqa .hstate.tmv{color:var(--mv)}#eqa .hstate.twr{color:var(--wr)}#eqa .hright{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}#eqa .hseg{display:flex;border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px;background:var(--soft)}#eqa .hseg button{width:34px;height:32px;border:0;border-radius:999px;background:transparent;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}#eqa .hseg button.sel{background:var(--card);color:var(--acci);box-shadow:0 1px 3px rgba(0,0,0,.15)}#eqa .hclock{display:inline-flex;align-items:center;gap:5px;font:700 13px system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--muted)}#eqa .hclock.bad{color:var(--wr)}#eqa .tile.bt{min-width:0}#eqa .tile.bt span{display:flex;align-items:center;gap:5px}#eqa .tile.bt span svg{flex:none}#eqa .tile.bt b{white-space:normal;font-size:13px;line-height:1.25;overflow-wrap:break-word}#eqa .tile.bt small{font-size:11px;color:var(--muted)}#eqa .tile.bt.g b,#eqa .tile.bt.g span svg{color:var(--lk)}#eqa .tile.bt.bl b{color:var(--op)}#eqa .tile.bt.bl span svg{color:var(--op);animation:eqpulse 1.2s ease-in-out infinite}@keyframes eqpulse{50%{opacity:.25}}#eqa .tile.bt.n b{color:var(--muted)}#eqa .tile.bt.y{background:var(--wrb);border-color:var(--wr)}#eqa .tile.bt.y b,#eqa .tile.bt.y span{color:var(--wr)}#eqa .tile.bt.r{background:var(--ulb);border-color:var(--ul)}#eqa .tile.bt.r b,#eqa .tile.bt.r span{color:var(--ul)}
#eqa .brand{display:flex;flex-direction:column;flex:1;min-width:0}#eqa .brand h1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#eqa main{max-width:1100px;margin:0 auto;padding:16px 16px 96px}
#eqa nav.top{display:none;gap:4px}#eqa nav.bottom{position:fixed;left:0;right:0;bottom:0;z-index:5;display:flex;background:var(--card);border-top:1px solid var(--line);padding:4px 6px calc(6px + env(safe-area-inset-bottom))}
#eqa nav button{flex:1;min-height:54px;border:0;background:transparent;color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 11px system-ui,sans-serif;cursor:pointer;border-radius:10px}
#eqa nav button.act{color:var(--acc)}
@media (min-width:900px){#eqa nav.bottom{display:none}#eqa nav.top{display:flex;margin:0 8px 0 auto}#eqa .brand{flex:0 1 auto;min-width:200px}#eqa nav.top button{flex-direction:row;gap:8px;font-size:14px;padding:0 14px;min-height:44px}
#eqa nav.top button.act{background:var(--accs);color:var(--acci)}#eqa main{padding-bottom:32px}#eqa .grid2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#eqa .cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
#eqa .grid2{display:grid;gap:16px}#eqa .col{display:flex;flex-direction:column;gap:16px;min-width:0}#eqa .cards{display:grid;gap:14px;margin-bottom:14px}
#eqa .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;min-width:0;overflow:hidden}
#eqa .card,#eqa .tile,#eqa .srow{box-shadow:0 1px 2px rgba(16,24,40,.06),0 4px 14px rgba(16,24,40,.07)}
#eqa .card>h2:first-child,#eqa .card>h3:first-child{margin:-16px -16px 14px;padding:12px 16px;background:var(--accs);color:var(--acci);border-bottom:1px solid var(--line);font-size:16px;font-weight:800}
#eqa .card.info{border-color:var(--op)}#eqa .card.warnc{background:var(--wrb);border-color:transparent;color:var(--wr);margin-bottom:14px}
#eqa .hero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0 16px}
#eqa .ring{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:6px}
#eqa .hl{font-size:26px;font-weight:700}
#eqa .st-locked .ring{background:var(--lkb);color:var(--lk)}#eqa .st-locked .hl{color:var(--lk)}
#eqa .st-unlocked .ring{background:var(--ulb);color:var(--ul)}#eqa .st-unlocked .hl{color:var(--ul)}
#eqa .st-opened .ring{background:var(--opb);color:var(--op)}#eqa .st-opened .hl{color:var(--op)}
#eqa .st-moving .ring,#eqa .st-unknown .ring{background:var(--mvb);color:var(--mv)}#eqa .st-moving .ring svg{animation:eqspin 1.2s linear infinite}
@keyframes eqspin{to{transform:rotate(360deg)}}
#eqa .acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#eqa .big{min-height:64px;border:0;border-radius:14px;color:#fff;font:600 15px system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer}
#eqa .big.g{background:#15803D}#eqa .big.r{background:#B91C1C}#eqa .big.bl{background:#1D4ED8}#eqa .big:active{transform:scale(.97)}
#eqa button:disabled{opacity:.55;cursor:default}
#eqa .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#eqa .rtnum{display:grid;grid-template-columns:repeat(3,auto);justify-content:start;column-gap:22px;margin:10px 0 12px}#eqa .rtnum b{font-size:22px;font-variant-numeric:tabular-nums;grid-row:1}#eqa .rtnum b.g{color:var(--lk)}#eqa .rtnum b.y{color:#B7791F}#eqa .rtnum b.r{color:var(--ul)}#eqa .rtnum span{grid-row:2;font-size:12px;color:var(--muted)}
#eqa .rtbars{display:flex;align-items:flex-end;gap:6px;height:96px;padding-top:16px;border-bottom:1px solid var(--line)}
#eqa .rtbars div{flex:1;border-radius:5px 5px 0 0;position:relative}#eqa .rtbars div.g{background:var(--lk)}#eqa .rtbars div.y{background:#D69E2E}#eqa .rtbars div.r{background:var(--ul)}
#eqa .rtbars i{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font:600 10px system-ui,sans-serif;font-style:normal;color:var(--muted)}
#eqa .rtax{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px}
#eqa .evrt{margin-top:12px}#eqa .evrt li{align-items:center}#eqa .evrt .et small{display:block;font-size:12px;color:var(--muted)}#eqa .evrt .rtv{font-weight:600;font-variant-numeric:tabular-nums;min-width:48px;text-align:right}#eqa .evrt .rtv.g{color:var(--lk)}#eqa .evrt .rtv.y{color:#B7791F}#eqa .evrt .rtv.r{color:var(--ul)}
#eqa .rtic-row{display:flex;gap:6px;margin-top:6px}#eqa .rtic-row span{flex:1;display:flex;justify-content:center;color:var(--muted)}
#eqa .tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;min-width:0}
#eqa .tile span{font-size:12px;color:var(--muted)}#eqa .tile b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#eqa .tile.g b{color:var(--lk)}#eqa .tile.y b{color:#B7791F}#eqa .tile.r b{color:var(--ul)}#eqa .tile.warn{background:var(--wrb);color:var(--wr)}#eqa .tile.warn span{color:inherit}
#eqa .ev{list-style:none;margin:0;padding:0}#eqa .ev li{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
#eqa .ev .et{flex:1;min-width:0}#eqa .ev .tm{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
#eqa .dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--muted)}
#eqa .k-locked{background:var(--lk)}#eqa .k-unlocked{background:var(--ul)}#eqa .k-opened{background:var(--op)}#eqa .k-bell{background:#D97706}#eqa .k-deny{background:var(--pu)}#eqa .k-alert{background:var(--ul);box-shadow:0 0 0 3px var(--ulb)}#eqa .k-ok{background:var(--lk)}
#eqa .ban{display:flex;align-items:center;gap:12px;padding:12px 16px;font-size:14px}#eqa .ban.warn{background:var(--wrb);color:var(--wr)}
#eqa .ban.sab{background:#B91C1C;color:#fff}#eqa .ban.sab div{flex:1;display:flex;flex-direction:column}#eqa .ban.sab span{font-size:12px}
#eqa .b{min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--fg);font:600 14px system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
#eqa .b.pri{background:#1D4ED8;border-color:#1D4ED8;color:#fff}#eqa .b.pri.dis{opacity:.5}#eqa .b.danger{background:#B91C1C;border-color:#B91C1C;color:#fff}
#eqa .b.ghost{background:transparent;border-color:#fff;color:#fff}#eqa .b.sm{min-height:40px;padding:0 12px}
#eqa .ib{width:44px;height:44px;border:0;border-radius:10px;background:var(--soft);color:var(--fg);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
#eqa .headrow,#eqa .rowx{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}#eqa .rowx{margin:0}
#eqa .person{display:flex;flex-direction:column;gap:10px}#eqa .ph{display:flex;align-items:center;gap:12px}
#eqa .av{width:40px;height:40px;border-radius:50%;background:var(--accs);color:var(--acci);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}
#eqa .pn{flex:1;display:flex;flex-direction:column;min-width:0}#eqa .pn .muted{font-size:12px}
#eqa .chips{display:flex;flex-wrap:wrap;gap:8px}
#eqa .chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--soft);color:var(--fg);font:13px system-ui,sans-serif;cursor:pointer}
#eqa .chip .muted{font-size:11px}
#eqa .badge{padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:var(--mvb);color:var(--mv)}
#eqa .a1{background:var(--accs);color:var(--acci)}#eqa .a2{background:var(--ulb);color:var(--ul)}#eqa .a3{background:var(--lkb);color:var(--lk)}#eqa .a4{background:var(--opb);color:var(--op)}#eqa .a5{background:var(--wrb);color:var(--wr)}
#eqa .lbl{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--acci);margin-bottom:8px}#eqa .la{font-size:14px;margin:0}
#eqa .row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;border-top:1px solid var(--line)}#eqa h3+.row,#eqa .sum .row:first-child{border-top:0}
#eqa .row>span:first-child{font-weight:600}#eqa .row .v{font-weight:400;color:var(--muted);text-align:right;overflow-wrap:anywhere}
#eqa .fld{display:block;padding:8px 0}
#eqa input[type=text],#eqa input[type=number],#eqa select{min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif;width:100%}
#eqa .numw{display:flex;align-items:center;gap:6px;flex:none}#eqa .numw input{width:96px;text-align:right}#eqa .uom{font-size:13px;color:var(--muted)}
#eqa .seg{display:grid;grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:6px}
#eqa .seg button{min-height:42px;border:1px solid var(--bline);border-radius:10px;background:transparent;color:var(--fg);font:600 13px system-ui,sans-serif;cursor:pointer}
#eqa .seg button.sel,#eqa .pick.sel,#eqa .opt.sel,#eqa .days button.sel{border-color:var(--acc);box-shadow:0 0 0 1.5px var(--acc);background:var(--accs);color:var(--acci);font-weight:800}
#eqa .sw{flex:none;width:52px;height:30px;border:0;border-radius:999px;padding:3px;background:#9CA3AF;display:flex;cursor:pointer}
#eqa .sw span{width:24px;height:24px;border-radius:50%;background:#fff;display:block;transition:transform .15s}#eqa .sw.on{background:#1D4ED8}#eqa .sw.on span{transform:translateX(22px)}
#eqa .q{font-weight:700;font-size:16px;color:var(--acci);margin:4px 0 10px}
#eqa .pick{min-height:44px;padding:0 16px;border:1px solid var(--bline);border-radius:12px;background:var(--card);color:var(--fg);font:600 14px system-ui,sans-serif;cursor:pointer}
#eqa .pick small{font-weight:400}
#eqa .list{display:flex;flex-direction:column;gap:8px}
#eqa .opt{min-height:52px;padding:6px 14px;border:1px solid var(--bline);border-radius:12px;background:var(--card);color:var(--fg);text-align:left;display:flex;flex-direction:column;justify-content:center;font:14px system-ui,sans-serif;cursor:pointer}
#eqa .opt span{font-size:12px;opacity:.85}
#eqa .wiz .seg{margin-bottom:12px}#eqa .prog{height:6px;border-radius:999px;background:var(--line);overflow:hidden;margin:4px 0 16px}#eqa .prog div{height:6px;background:var(--acc);transition:width .3s}
#eqa .foot{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}#eqa .foot .b{flex:1}
#eqa .live{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:8px 0}#eqa .live .prog{width:100%}
#eqa .ring2{width:96px;height:96px;border-radius:50%;border:6px solid var(--acc);display:flex;align-items:center;justify-content:center;color:var(--acc)}
#eqa .rs-purple{border-color:var(--pu);color:var(--pu)}#eqa .rs-ok{border-color:var(--lk);background:var(--lkb);color:var(--lk)}#eqa .rs-err{border-color:var(--ul);background:var(--ulb);color:var(--ul)}
#eqa .pulse{animation:eqpulse 2s ease-in-out infinite}@keyframes eqpulse{50%{opacity:.45}}
#eqa .hl2{font-size:17px;font-weight:700;margin:0}
#eqa textarea{width:100%;min-height:76px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:15px ui-monospace,Menlo,Consolas,monospace;resize:vertical;word-break:break-all}
#eqa .steps{margin:0 0 8px;padding-left:20px}#eqa .steps li{margin:4px 0}
#eqa .rs-orange{border-color:#EA8A0C;color:#EA8A0C}
#eqa .slist{display:flex;flex-direction:column;gap:10px;margin-top:12px}
#eqa .srow{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:6px 12px 6px 6px}
#eqa .srow.off .smain{opacity:.5}#eqa .srow.bad{border-color:var(--wr)}
#eqa .smain{flex:1;min-width:0;display:flex;align-items:center;gap:12px;border:0;background:transparent;color:var(--fg);padding:6px;border-radius:12px;cursor:pointer;text-align:left;font:inherit}
#eqa .sic{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}
#eqa .sic.lck{background:var(--lkb);color:var(--lk)}#eqa .sic.unl{background:var(--ulb);color:var(--ul)}#eqa .sic.warn{background:var(--wrb);color:var(--wr)}
#eqa .stime{font:700 24px system-ui,sans-serif;font-variant-numeric:tabular-nums;min-width:72px}
#eqa .sdays{display:flex;gap:2px;flex:1;min-width:0}#eqa .sdays span{width:17px;text-align:center;font:700 12px system-ui,sans-serif;color:var(--bline)}#eqa .sdays span.on{color:var(--acci)}
#eqa .sbad{display:flex;flex-direction:column;min-width:0}#eqa .sbad small{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#eqa .sadd{min-height:52px;border:1.5px dashed var(--bline);border-radius:16px;background:transparent;color:var(--acci);font:700 15px system-ui,sans-serif;cursor:pointer}
#eqa .stbig{display:block;width:100%;text-align:center;font-size:44px;margin:4px 0 8px}
#eqa .presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}#eqa .presets .chip{min-height:34px;font-weight:600}
#eqa .srnd{display:block;font:600 11px system-ui,sans-serif;color:var(--muted)}#eqa .rprev{margin:10px 0 0}#eqa .rprev b{color:var(--fg)}
#eqa .rstep{display:flex;align-items:center;gap:10px;margin-top:10px}#eqa .rstep .b{min-width:48px;min-height:44px;font-size:20px}#eqa .rstep label{display:flex;align-items:center;gap:6px;font:700 18px system-ui,sans-serif}#eqa .rstep input{width:72px;min-height:44px;text-align:center;font:700 20px system-ui,sans-serif;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg)}
#eqa .presets .chip.sel{border-color:var(--acc);background:var(--accs);color:var(--acci)}
#eqa .seg button svg{vertical-align:-3px}
#eqa .plan.off{opacity:.7}#eqa .bigtime{font:700 30px system-ui,sans-serif;border:0;background:transparent;color:var(--fg);padding:0;font-variant-numeric:tabular-nums}
#eqa .days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:12px 0 4px}
#eqa .days button{min-height:44px;border:1px solid var(--bline);border-radius:10px;background:var(--card);color:var(--fg);font:600 13px system-ui,sans-serif;cursor:pointer}

#eqa .links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#eqa .lnk{width:100%}
#eqa .pill{padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700}#eqa .pill.sim{background:var(--wrb);color:var(--wr)}
#eqa .scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:30}
#eqa .sheet{position:fixed;left:0;right:0;bottom:0;z-index:31;max-height:88vh;overflow-y:auto;background:var(--card);border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom))}
@media (min-width:640px){#eqa .sheet{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%);width:520px;border-radius:20px}}
#eqa .sheet .close{position:absolute;right:12px;top:12px}#eqa .sheet h2{padding-right:48px}
#eqa .toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:40;max-width:calc(100% - 32px);padding:10px 16px;border-radius:12px;background:#111827;color:#fff;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
#eqa button:focus-visible,#eqa a:focus-visible,#eqa input:focus-visible,#eqa select:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
`;

  function start() {
    if (document.getElementById('eqa')) return;
    if (!document.querySelector('meta[name="viewport"]')) {
      const v = document.createElement('meta'); v.name = 'viewport'; v.content = 'width=device-width, initial-scale=1'; document.head.appendChild(v);
    }
    const st = document.createElement('style'); st.textContent = CSS_TEXT; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'eqa';
    document.body.appendChild(root);
    const back = document.createElement('button'); back.id = 'eqa-back'; back.type = 'button'; back.textContent = '← Zur App';
    back.addEventListener('click', () => { setExpert(false); draw(); });
    document.body.appendChild(back);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('focusout', () => { if (held) { held = false; setTimeout(draw, 0); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) { S.sheet = null; draw(); } });
    if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    applyTheme();
    setExpert(load('eqa-expert', '') === '1');
    draw();
    connect();
    setInterval(() => { if (S.pair && S.pair.step === 3 && !S.pair.result) draw(); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

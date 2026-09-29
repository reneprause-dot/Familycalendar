'use strict';
/* Familienplaner – Kalender, Wetter, Erinnerungen, Profile, Familie-Tab, Kindermodus, lokaler App-Speicher */

const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const plug = n => (cap && cap.Plugins && cap.Plugins[n]) || null;
const FILE = 'familienplaner.json';
const MAX_PHOTOS = 40;
const COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#38D9A9', '#4DABF7', '#748FFC', '#DA77F2', '#F783AC', '#A9866B'];
const EMOJIS = ['👩', '👨', '👧', '👦', '👶', '👵', '👴', '🧑', '🐶', '🐱', '🐰', '🦊', '🐻', '🦁', '🐼', '🐸', '🦄', '🐝', '🦋', '⚽', '🎨', '🎸', '🚀', '🌈', '🍕', '🌻'];
const THEMES = {
  sun: { n: 'Sonnenschein', e: '☀️', c: '#FFB020' },
  sea: { n: 'Meer', e: '🌊', c: '#29A5C9' },
  meadow: { n: 'Wiese', e: '🌿', c: '#6CC04A' },
  berry: { n: 'Beere', e: '🍓', c: '#F472A6' },
  night: { n: 'Nacht', e: '🌙', c: '#8B93FF' }
};
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DOWL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const SCHOOLDAYS = [['mon', 'Montag'], ['tue', 'Dienstag'], ['wed', 'Mittwoch'], ['thu', 'Donnerstag'], ['fri', 'Freitag']];
const REPEAT = { none: 'Einmalig', daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' };
const CHORE_REPEAT = { daily: 'täglich', weekly: 'wöchentlich', once: 'einmalig' };
const REMIND = [[-1, 'Keine Erinnerung'], [-2, 'Am Vorabend (18 Uhr)'], [0, 'Zum Beginn'], [10, '10 Min. vorher'], [30, '30 Min. vorher'], [60, '1 Std. vorher'], [1440, '1 Tag vorher']];
const DURS = [[30, '30 Min.'], [60, '1 Std.'], [90, '1,5 Std.'], [120, '2 Std.'], [180, '3 Std.'], [240, '4 Std.']];

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => FP.ymd(new Date());
const tomorrow = () => FP.ymd(FP.addDays(new Date(), 1));
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');
const inkOn = hex => { const n = parseInt(safeColor(hex).slice(1), 16); return ((0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255) > 0.6 ? '#2b2b2b' : '#fff'; };
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0);

function defaultTemplates() {
  return [
    { id: 't1', emoji: '🩺', title: 'Arzttermin', time: '09:00', allDay: false, dur: 60, remind: 60, repeat: 'none', notes: '', members: [] },
    { id: 't2', emoji: '⚽', title: 'Training', time: '17:00', allDay: false, dur: 90, remind: 30, repeat: 'weekly', notes: '', members: [] },
    { id: 't3', emoji: '🏫', title: 'Elternabend', time: '19:30', allDay: false, dur: 120, remind: 60, repeat: 'none', notes: '', members: [] },
    { id: 't4', emoji: '🎈', title: 'Geburtstagsfeier', time: '15:00', allDay: false, dur: 180, remind: 60, repeat: 'none', notes: '', members: [] }
  ];
}
function defaultState() {
  return {
    members: [
      { id: 'm1', name: 'Mama', emoji: '👩', color: COLORS[8], birthday: '', notify: true },
      { id: 'm2', name: 'Papa', emoji: '👨', color: COLORS[5], birthday: '', notify: true },
      { id: 'm3', name: 'Kind', emoji: '🧒', color: COLORS[3], birthday: '', notify: true }
    ],
    events: [], tasks: [], chores: [], starLog: [], notes: [], countdowns: [], templates: defaultTemplates(), bring: {}, photos: [],
    settings: { familyName: '', theme: 'sun', manual: false, city: '', lat: null, lon: null, remind: 30, dreamTitles: true, dreamPhotos: true, kidMode: '' },
    weather: null
  };
}
let S = defaultState();
const ui = { tab: 'cal', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), sel: today(), weatherErr: '', weatherDetail: '', loading: false };

/* Ältere Daten auf das neue Format bringen und Altlasten aufräumen */
function migrate(s) {
  const d = defaultState();
  s = Object.assign(d, s, { settings: Object.assign(d.settings, (s && s.settings) || {}) });
  s.members = (s.members || []).map((m, i) => ({
    id: m.id, name: m.name || 'Person', emoji: m.emoji || EMOJIS[i % EMOJIS.length], color: safeColor(m.color || COLORS[i % COLORS.length]),
    birthday: m.birthday || '', notify: m.notify !== false, gifts: m.gifts || '', goal: Math.max(0, Number(m.goal) || 0), reward: m.reward || '',
    plan: m.plan && typeof m.plan === 'object' ? m.plan : {}
  }));
  if (!s.members.length) s.members = defaultState().members;
  const legacyAll = s.members.find(m => m.id === 'm0' && m.name === 'Alle');
  s.events = (s.events || []).map(e => {
    if (!Array.isArray(e.members)) e.members = e.member && !(legacyAll && e.member === 'm0') ? [e.member] : [];
    delete e.member;
    e.dur = Number(e.dur) || 60; e.bring = e.bring || ''; e.pick = e.pick || '';
    return e;
  });
  ['tasks', 'chores', 'starLog', 'notes', 'countdowns', 'photos'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  if (!Array.isArray(s.templates) || !s.templates.length) s.templates = defaultTemplates();
  if (!s.bring || typeof s.bring !== 'object') s.bring = {};
  const cut = FP.ymd(FP.addDays(new Date(), -120)), yest = FP.ymd(FP.addDays(new Date(), -1));
  s.starLog = s.starLog.filter(l => l.date >= cut);
  Object.keys(s.bring).forEach(k => { if (k.split('|')[0] < yest) delete s.bring[k]; });
  if (!THEMES[s.settings.theme]) s.settings.theme = 'sun';
  if (s.settings.kidMode && !s.members.some(m => m.id === s.settings.kidMode)) s.settings.kidMode = '';
  return s;
}

/* ---------- Speicher (interner App-Speicher: Directory.Data) ---------- */
async function load() {
  const fs = plug('Filesystem');
  if (native && fs) {
    try { const r = await fs.readFile({ path: FILE, directory: 'DATA', encoding: 'utf8' }); return JSON.parse(r.data); } catch (e) { /* noch keine Datei */ }
  }
  try { const t = localStorage.getItem('fp'); if (t) return JSON.parse(t); } catch (e) { }
  return null;
}
async function persist() {
  const json = JSON.stringify(S);
  try { localStorage.setItem('fp', json); } catch (e) { }
  const fs = plug('Filesystem');
  if (native && fs) {
    try { await fs.writeFile({ path: FILE, directory: 'DATA', data: json, encoding: 'utf8' }); }
    catch (e) { toast('Speichern fehlgeschlagen'); }
  }
}
async function save() { await persist(); scheduleNotifications(); render(); }
const allEvents = () => FP.withBirthdays(S.events, S.members);
function applyTheme() { const r = document.documentElement; if (r && r.setAttribute) r.setAttribute('data-theme', S.settings.theme); }

/* ---------- Benachrichtigungen ---------- */
async function scheduleNotifications(test) {
  const ln = plug('LocalNotifications');
  if (!native || !ln) return;
  try {
    let perm = await ln.checkPermissions();
    if (perm.display !== 'granted') perm = await ln.requestPermissions();
    if (perm.display !== 'granted') { if (test) toast('Benachrichtigungen sind nicht erlaubt'); return; }
    const pend = await ln.getPending();
    if (pend.notifications && pend.notifications.length) await ln.cancel({ notifications: pend.notifications });
    const list = FP.buildNotifications(allEvents(), S.tasks, S.members, new Date());
    const items = list.map((n, i) => ({ id: i + 1, title: n.title, body: n.body || ' ', schedule: { at: n.at.toISOString(), allowWhileIdle: true } }));
    if (test) items.push({ id: 9999, title: 'Familienplaner', body: 'Test: Benachrichtigungen funktionieren 🎉', schedule: { at: new Date(Date.now() + 5000).toISOString(), allowWhileIdle: true } });
    if (items.length) await ln.schedule({ notifications: items });
    if (test) toast('Testmeldung kommt in 5 Sekunden');
  } catch (e) { console.warn(e); if (test) toast('Fehler bei Benachrichtigungen'); }
}

/* ---------- Wetter (Open-Meteo, ohne API-Key) ---------- */
const WMO = c => c === 0 ? ['☀️', 'Klar'] : c <= 2 ? ['🌤️', 'Heiter'] : c === 3 ? ['☁️', 'Bedeckt'] : c <= 48 ? ['🌫️', 'Nebel'] :
  c <= 57 ? ['🌦️', 'Nieselregen'] : c <= 67 ? ['🌧️', 'Regen'] : c <= 77 ? ['❄️', 'Schnee'] : c <= 82 ? ['🌧️', 'Schauer'] :
    c <= 86 ? ['🌨️', 'Schneeschauer'] : ['⛈️', 'Gewitter'];

async function getJSON(url, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms || 12000);
  try {
    const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'Zeitüberschreitung' : (e && e.message) || String(e));
  } finally { clearTimeout(timer); }
}
async function reverse(lat, lon) {
  try {
    const j = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=de`, 8000);
    return j.city || j.locality || '';
  } catch (e) { return ''; }
}
/* Ortssuche: mehrere Schreibweisen, dann zweiter Dienst als Ersatz */
async function geocode(q) {
  let netErr = null;
  for (const c of FP.placeCandidates(q)) {
    try {
      const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=8&language=de&format=json`);
      const r = j.results || [];
      if (r.length) { const p = r.find(x => x.country_code === 'DE') || r[0]; return { name: p.name, lat: p.latitude, lon: p.longitude }; }
    } catch (e) { netErr = e; }
  }
  try {
    const j = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=de`);
    const f = (j.features || [])[0];
    if (f) return { name: f.properties.name || q, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  } catch (e) { netErr = netErr || e; }
  if (netErr) throw netErr;
  return null;
}
/* Standort: App-GPS → Browser-GPS → grob über die Internetadresse */
async function locate() {
  const g = plug('Geolocation');
  let pos = null, lastErr = null;
  if (native && g) {
    try { try { await g.requestPermissions(); } catch (e) { } pos = await g.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }); } catch (e) { lastErr = e; }
  }
  if (!pos && navigator.geolocation) {
    try { pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, maximumAge: 600000 })); } catch (e) { lastErr = e; }
  }
  if (pos) {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    return { lat, lon, place: (await reverse(lat, lon)) || 'Aktueller Standort' };
  }
  try {
    const j = await getJSON('https://ipwho.is/', 8000);
    if (j.success !== false && j.latitude != null) return { lat: j.latitude, lon: j.longitude, place: (j.city || 'Ungefährer Standort') + ' (ungefähr)' };
  } catch (e) { }
  throw new Error('Kein Standort (' + ((lastErr && (lastErr.message || lastErr)) || 'nicht verfügbar') + ')');
}
async function fetchWeather(force) {
  const w = S.weather;
  if (!force && w && Date.now() - w.ts < 30 * 60 * 1000) return;
  if (ui.loading) return;
  ui.loading = true; ui.weatherErr = ''; ui.weatherDetail = ''; render();
  try {
    const loc = S.settings.manual && S.settings.lat != null ? { lat: S.settings.lat, lon: S.settings.lon, place: S.settings.city } : await locate();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`;
    const j = await getJSON(url);
    if (!j.current) throw new Error(j.reason || 'Keine Wetterdaten erhalten');
    S.weather = { ts: Date.now(), place: loc.place, lat: loc.lat, lon: loc.lon, cur: j.current, daily: j.daily };
    await persist();
  } catch (e) {
    ui.weatherErr = S.settings.manual ? 'Das Wetter konnte nicht geladen werden.' : 'Dein Standort konnte nicht ermittelt werden.';
    ui.weatherDetail = String((e && e.message) || e);
  }
  ui.loading = false; render();
}

/* ---------- Darstellung: Bausteine ---------- */
const memberById = id => S.members.find(m => m.id === id);
const evMembers = ev => FP.memberIds(ev).map(memberById).filter(Boolean);
const nameOf = id => (memberById(id) || {}).name || '';
const fmtDate = ds => { const d = FP.parse(ds); return `${DOWL[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const fmtShort = ds => { const d = FP.parse(ds); return `${d.getDate()}.${d.getMonth() + 1}.`; };
const rel = ds => { if (ds === today()) return 'Heute'; if (ds === tomorrow()) return 'Morgen'; return fmtDate(ds); };
const chipHTML = m => `<span class="chip" style="background:${safeColor(m.color)};color:${inkOn(m.color)}">${esc(m.emoji)} ${esc(m.name)}</span>`;
const avatarHTML = (m, big) => `<span class="avatar ${big ? 'big' : ''}" style="background:${safeColor(m.color)}">${esc(m.emoji)}</span>`;
const memberOptions = (sel, empty) => (empty ? `<option value="">${empty}</option>` : '') + S.members.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('');

function weatherTip(w) {
  const p = (w.daily.precipitation_probability_max || [0])[0] || 0, t = w.daily.temperature_2m_max[0];
  if (p >= 50) return '☔ Regenschirm einpacken!';
  if (t >= 26) return '🧴 Sonnencreme und viel trinken!';
  if (t <= 3) return '🧤 Mütze und Handschuhe nicht vergessen!';
  return '';
}
function weatherHTML() {
  const w = S.weather;
  let body;
  if (w) {
    const [ico, txt] = WMO(w.cur.weather_code);
    const days = w.daily.time.slice(0, 4).map((t, k) => {
      const d = FP.parse(t), pr = (w.daily.precipitation_probability_max || [])[k];
      return `<div class="w-day"><b>${k === 0 ? 'Heute' : DOW[(d.getDay() + 6) % 7]}</b>${WMO(w.daily.weather_code[k])[0]}<br>${Math.round(w.daily.temperature_2m_max[k])}° / ${Math.round(w.daily.temperature_2m_min[k])}°${pr != null ? `<br>💧${pr}%` : ''}</div>`;
    }).join('');
    const tip = weatherTip(w);
    body = `<div class="w-top"><div class="w-ico">${ico}</div>
      <div><div class="w-temp">${Math.round(w.cur.temperature_2m)}°C</div>
      <div class="w-meta">${esc(txt)} · gefühlt ${Math.round(w.cur.apparent_temperature)}° · Wind ${Math.round(w.cur.wind_speed_10m)} km/h</div>
      <div class="w-meta">📍 ${esc(w.place)}</div></div>
      <button class="w-refresh" data-a="weather" aria-label="Aktualisieren">${ui.loading ? '⏳' : '🔄'}</button></div>
      ${tip ? `<div class="w-tip">${tip}</div>` : ''}<div class="w-days">${days}</div>`;
  } else {
    body = `<div class="w-top"><div class="w-ico">🌍</div><div class="w-meta">${ui.loading ? 'Wetter wird geladen…' : 'Wetter für deinen Ort'}</div>
      <button class="w-refresh" data-a="weather">${ui.loading ? '⏳' : '🔄'}</button></div>`;
  }
  const err = ui.weatherErr ? `<div class="err">${esc(ui.weatherErr)}<small>${esc(ui.weatherDetail)}</small>
    <button class="linkbtn" data-a="tab" data-t="more">📍 Ort festlegen</button></div>` : '';
  return `<div class="card weather">${body}${err}</div>`;
}
function headerHTML() {
  const h = new Date().getHours(), hi = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend', fam = S.settings.familyName;
  return `<div class="hello"><div><div class="hi">${hi}${fam ? ', ' + esc(fam) : ''} 👋</div><div class="date">${fmtDate(today())}</div></div>
    <div class="avatars">${S.members.slice(0, 5).map(m => avatarHTML(m)).join('')}</div></div>${weatherHTML()}`;
}

function noteHTML(n, del) {
  const m = memberById(n.member), c = m ? safeColor(m.color) : '#FFD43B';
  return `<div class="zettel" style="background:${c};color:${inkOn(c)}"><span>📌 ${esc(n.text)}</span>${m ? `<small>${esc(m.emoji)} ${esc(m.name)}</small>` : ''}${del ? `<button data-a="delnote" data-id="${esc(n.id)}" aria-label="Entfernen">✕</button>` : ''}</div>`;
}
function itemHTML(ev, ds) {
  const mems = evMembers(ev);
  const cols = mems.map(m => safeColor(m.color));
  const bar = cols.length > 1 ? `linear-gradient(${cols.join(',')})` : (cols[0] || 'var(--primary)');
  const who = ev.virtual ? '' : (mems.length ? mems.map(chipHTML).join('') : '<span class="chip all">👨‍👩‍👧‍👦 Alle</span>');
  const drive = [ev.bring ? '🚗 bringt ' + esc(nameOf(ev.bring)) : '', ev.pick ? 'holt ' + esc(nameOf(ev.pick)) : ''].filter(Boolean).join(' · ');
  const bell = ev.remind != null && ev.remind !== -1 && !ev.virtual;
  const extra = [ev.virtual ? '' : REPEAT[ev.repeat] !== 'Einmalig' ? REPEAT[ev.repeat] : '', bell ? '🔔' : '', drive].filter(Boolean).join(' · ');
  const act = ev.virtual ? `data-a="editmember" data-id="${esc(mems[0] ? mems[0].id : '')}"` : `data-a="edit" data-id="${esc(ev.id)}"`;
  const when = ev.virtual ? 'Geburtstag' : ev.allDay ? 'Ganztägig' : ev.time;
  return `<button class="item" ${act}><div class="bar" style="background:${bar}"></div>
    <div class="body"><div class="t">${esc(FP.displayTitle(ev, ds))}</div>
    <div class="s">${when}${extra ? ' · ' + extra : ''}${ev.notes ? ' · ' + esc(ev.notes) : ''}${ev.virtual && ev.gifts ? '<br>🎁 ' + esc(ev.gifts) : ''}</div>
    ${who ? `<div class="chips">${who}</div>` : ''}</div></button>`;
}
function taskHTML(t) {
  const m = memberById(t.member);
  return `<div class="item ${t.done ? 'done' : ''}" style="align-items:center"><button class="check" data-a="toggle" data-id="${esc(t.id)}">${t.done ? '✓' : ''}</button>
    <div class="body"><div class="t">${esc(t.text)}</div>
    ${t.due ? `<div class="s">Fällig: ${fmtDate(t.due)}</div>` : ''}${m ? `<div class="chips">${chipHTML(m)}</div>` : ''}</div>
    <button data-a="deltask" data-id="${esc(t.id)}" aria-label="Löschen">🗑️</button></div>`;
}
function choreHTML(c, del) {
  const m = memberById(c.member), done = !FP.choreOpen(c, today());
  return `<div class="item ${done ? 'done' : ''}" style="align-items:center"><button class="check" data-a="chore" data-id="${esc(c.id)}">${done ? '✓' : ''}</button>
    <div class="body"><div class="t">${esc(c.text)} <span class="stars">${'⭐'.repeat(Math.max(1, Math.min(5, c.stars)))}</span></div>
    <div class="s">${CHORE_REPEAT[c.repeat] || ''}</div>${m ? `<div class="chips">${chipHTML(m)}</div>` : ''}</div>
    ${del ? `<button data-a="delchore" data-id="${esc(c.id)}" aria-label="Löschen">🗑️</button>` : ''}</div>`;
}
function progressHTML(m) {
  const n = FP.starsThisWeek(S.starLog, m.id, today()), g = m.goal, c = safeColor(m.color);
  return `<div class="card"><div class="prog-head">${avatarHTML(m)}<b>${esc(m.name)}</b><span>⭐ ${n}${g ? '/' + g : ''}</span></div>
    ${g ? `<div class="prog"><i style="width:${pct(n, g)}%;background:${c}"></i></div>` : ''}
    ${g && m.reward ? `<div class="s">${n >= g ? '🎉 Geschafft: ' : '🎁 Ziel: '}${esc(m.reward)}</div>` : ''}</div>`;
}
function bringRows(m, ds) {
  const items = FP.bringFor(m, ds), key = ds + '|' + m.id, got = S.bring[key] || [];
  return items.map((it, i) => `<div class="item ${got.includes(it) ? 'done' : ''}" style="align-items:center;padding:6px 0"><button class="check" data-a="bringtoggle" data-k="${esc(key)}" data-n="${i}">${got.includes(it) ? '✓' : ''}</button><div class="body t">🎒 ${esc(it)}</div></div>`).join('');
}

/* ---------- Ansichten ---------- */
function calendarHTML() {
  const y = ui.month.getFullYear(), mo = ui.month.getMonth(), evAll = allEvents();
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, mo, 1 - offset + i), ds = FP.ymd(d);
    const cols = [...new Set(FP.eventsOn(evAll, ds).flatMap(e => { const c = evMembers(e).map(m => safeColor(m.color)); return c.length ? c : ['#9AA0B5']; }))].slice(0, 4);
    cells += `<button class="day ${d.getMonth() !== mo ? 'other' : ''} ${ds === today() ? 'today' : ''} ${ds === ui.sel ? 'sel' : ''}" data-a="sel" data-d="${ds}">
      ${d.getDate()}<div class="dots">${cols.map(c => `<i class="dot" style="background:${c}"></i>`).join('')}</div></button>`;
  }
  const evs = FP.eventsOn(evAll, ui.sel), tasks = S.tasks.filter(t => t.due === ui.sel);
  const notes = S.notes.slice(-3).reverse();
  return `<div class="quick"><input id="quick" placeholder="✨ Schnell: „Freitag 16 Uhr Zahnarzt Lena“" maxlength="120" enterkeyhint="done">
      <button class="btn primary" data-a="quick" aria-label="Eintragen">→</button></div>
    <div class="hint" style="margin:-2px 4px 8px">🎤 Tipp: Mit dem Mikrofon der Tastatur kannst du diktieren.</div>
    ${notes.length ? `<div class="zettel-row">${notes.map(n => noteHTML(n, false)).join('')}</div>` : ''}
    <div class="cal-head"><button class="icon-btn" data-a="prev">‹</button>
    <h1>${MONTHS[mo]} ${y}</h1><button class="icon-btn" data-a="next">›</button></div>
    <div class="grid">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>
    <h2>${rel(ui.sel)}${ui.sel === today() ? ' · ' + fmtDate(ui.sel) : ''}</h2>
    <div class="card">${evs.length || tasks.length ? evs.map(e => itemHTML(e, ui.sel)).join('') + tasks.map(taskHTML).join('') : '<div class="empty">Noch nichts geplant – mit ＋ hinzufügen 🌈</div>'}</div>`;
}
function agendaHTML() {
  let out = '', any = false;
  const evAll = allEvents();
  for (let i = 0; i < 30; i++) {
    const ds = FP.ymd(FP.addDays(new Date(), i));
    const evs = FP.eventsOn(evAll, ds), tasks = S.tasks.filter(t => t.due === ds && !t.done);
    if (!evs.length && !tasks.length) continue;
    any = true;
    out += `<h2>${rel(ds)}</h2><div class="card">${evs.map(e => itemHTML(e, ds)).join('')}${tasks.map(taskHTML).join('')}</div>`;
  }
  return any ? out : '<div class="card empty">Die nächsten 30 Tage sind frei 🎉</div>';
}
function listHTML() {
  const open = S.tasks.filter(t => !t.done), done = S.tasks.filter(t => t.done);
  return `<h2>Aufgaben &amp; Einkauf</h2>
    <div class="card"><div class="row"><input id="newTask" placeholder="Neuer Eintrag…" maxlength="120"><button class="btn primary" style="flex:none;padding:0 20px" data-a="addtask">＋</button></div>
    <div class="row"><div><label>Fällig am (optional, mit Erinnerung)</label><input type="date" id="newDue"></div>
    <div><label>Für</label><select id="newWho">${memberOptions('', 'Alle')}</select></div></div></div>
    <div class="card">${open.length ? open.map(taskHTML).join('') : '<div class="empty">Alles erledigt ✨</div>'}</div>
    ${done.length ? `<h2>Erledigt</h2><div class="card">${done.map(taskHTML).join('')}</div><button class="btn" style="width:100%" data-a="cleardone">Erledigte löschen</button>` : ''}`;
}

function familyHTML() {
  const t = today(), tm = tomorrow();
  let h = `<h2>📌 Pinnwand</h2><div class="card"><div class="row"><input id="noteText" placeholder="Zettel schreiben…" maxlength="120">
    <select id="noteWho" style="flex:none;width:42%">${memberOptions('', 'Alle')}</select></div>
    <div class="btns" style="margin-top:8px"><button class="btn primary" data-a="addnote">Anpinnen</button></div></div>
    ${S.notes.length ? `<div class="zettel-col">${S.notes.slice().reverse().map(n => noteHTML(n, true)).join('')}</div>` : ''}`;

  const vis = S.chores.filter(c => FP.choreVisible(c, t));
  h += `<h2>⭐ Ämtchen &amp; Sterne</h2>${S.members.filter(m => m.goal > 0 || S.chores.some(c => c.member === m.id)).map(progressHTML).join('')}
    <div class="card">${vis.length ? vis.map(c => choreHTML(c, true)).join('') : '<div class="empty">Noch keine Ämtchen – unten anlegen</div>'}</div>
    <div class="card"><label style="margin-top:0">Neues Ämtchen</label>
      <input id="choreText" placeholder="z. B. Tisch decken" maxlength="60">
      <div class="row"><div><label>Sterne</label><select id="choreStars">${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${'⭐'.repeat(n)}</option>`).join('')}</select></div>
      <div><label>Wer?</label><select id="choreWho">${memberOptions('')}</select></div>
      <div><label>Wie oft?</label><select id="choreRep">${Object.entries(CHORE_REPEAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
      <div class="btns"><button class="btn primary" data-a="addchore">Ämtchen anlegen</button></div>
      <div class="hint">Wochenziel und Belohnung stellst du im Profil der Person ein.</div></div>`;

  const bring = S.members.filter(m => FP.bringFor(m, tm).length);
  if (bring.length) h += `<h2>🎒 Schulsachen für morgen</h2><div class="card">${bring.map(m => `<div style="margin-top:6px">${chipHTML(m)}</div>${bringRows(m, tm)}`).join('')}</div>`;

  const cds = S.countdowns.filter(c => FP.daysUntil(c.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  h += `<h2>⏳ Countdown</h2><div class="card">${cds.length ? cds.map(c => {
    const d = FP.daysUntil(c.date);
    return `<div class="item" style="align-items:center"><span class="cd-ico">${esc(c.emoji || '🎉')}</span><div class="body"><div class="t">${esc(c.title)}</div>
      <div class="s">${fmtDate(c.date)}</div></div><b class="cd-days">${d === 0 ? 'Heute!' : d === 1 ? 'Morgen!' : 'noch ' + d + ' Tage'}</b>
      <button data-a="delcd" data-id="${esc(c.id)}" aria-label="Löschen">🗑️</button></div>`;
  }).join('') : '<div class="empty">Worauf freut ihr euch?</div>'}</div>
    <div class="card"><div class="row"><input id="cdEmoji" value="🏖️" maxlength="4" style="flex:none;width:64px;font-size:1.3rem;text-align:center"><input id="cdTitle" placeholder="z. B. Urlaub" maxlength="40"></div>
      <div class="row"><input type="date" id="cdDate"><button class="btn primary" style="flex:none;padding:0 20px" data-a="addcd">Hinzufügen</button></div></div>`;

  const bs = FP.birthdaysSoon(S.members, new Date(), 30);
  if (bs.length) h += `<h2>🎂 Bald Geburtstag</h2><div class="card">${bs.map(b => `<button class="item" style="align-items:center" data-a="editmember" data-id="${esc(b.member.id)}">${avatarHTML(b.member, true)}
    <div class="body"><div class="t">${esc(b.member.name)}${b.age ? ' wird ' + b.age : ''}</div>
    <div class="s">${b.inDays === 0 ? 'Heute! 🎉' : b.inDays === 1 ? 'Morgen' : 'in ' + b.inDays + ' Tagen'}${b.member.gifts ? ' · 🎁 ' + esc(b.member.gifts) : ''}</div></div></button>`).join('')}</div>`;
  return h;
}

function kidHTML(m) {
  const t = today(), tm = tomorrow(), col = safeColor(m.color);
  const evs = FP.eventsOn(allEvents(), t).filter(e => { const ids = FP.memberIds(e); return !ids.length || ids.includes(m.id); });
  const chores = S.chores.filter(c => c.member === m.id && FP.choreVisible(c, t));
  const n = FP.starsThisWeek(S.starLog, m.id, t), subj = FP.subjectsFor(m, t), bring = bringRows(m, tm);
  const w = S.weather ? `${WMO(S.weather.cur.weather_code)[0]} ${Math.round(S.weather.cur.temperature_2m)}°` : '';
  return `<div class="kid-top"><div>${avatarHTML(m, true)}</div><div style="flex:1"><div class="kid-hi">Hallo ${esc(m.name)}!</div><div class="date">${fmtDate(t)} ${w}</div></div>
      <button class="lock" data-a="kidexit" aria-label="Eltern">🔒</button></div>
    <div class="card kid-stars"><div class="prog-head"><b>Meine Sterne</b><span>⭐ ${n}${m.goal ? '/' + m.goal : ''}</span></div>
      ${m.goal ? `<div class="prog big"><i style="width:${pct(n, m.goal)}%;background:${col}"></i></div>` : ''}
      ${m.goal && m.reward ? `<div class="s">${n >= m.goal ? '🎉 Geschafft: ' : '🎁 Ziel: '}${esc(m.reward)}</div>` : ''}</div>
    <h2>Heute</h2><div class="card">${evs.length ? evs.map(e => `<div class="kid-ev"><b>${e.allDay || e.virtual ? '☀️' : esc(e.time)}</b> ${esc(FP.displayTitle(e, t))}</div>`).join('') : '<div class="empty">Heute ist nichts geplant 🎈</div>'}</div>
    ${subj.length ? `<h2>In der Schule</h2><div class="card kid-ev">📚 ${subj.map(esc).join(' · ')}</div>` : ''}
    ${chores.length ? `<h2>Meine Ämtchen</h2><div class="card">${chores.map(c => choreHTML(c, false)).join('')}</div>` : ''}
    ${bring ? `<h2>Morgen einpacken</h2><div class="card">${bring}</div>` : ''}`;
}

function moreHTML() {
  const s = S.settings;
  const bd = m => { if (!m.birthday) return ''; const d = FP.parse(m.birthday); return `🎂 ${d.getDate()}.${d.getMonth() + 1}.`; };
  return `<h2>Unsere Familie</h2><div class="card">
      <label style="margin-top:0">Familienname (für die Begrüßung)</label>
      <input id="familyName" placeholder="z. B. Familie Muster" maxlength="30" value="${esc(s.familyName)}"></div>
    <h2>Farbwelt</h2><div class="card"><div class="themes">
      ${Object.entries(THEMES).map(([k, t]) => `<button class="theme-btn ${s.theme === k ? 'on' : ''}" data-a="theme" data-t="${k}"><i style="background:${t.c}"></i>${t.e} ${t.n}</button>`).join('')}</div></div>
    <h2>Personen</h2><div class="card">
      ${S.members.map(m => `<button class="person" data-a="editmember" data-id="${esc(m.id)}">${avatarHTML(m, true)}
        <div style="flex:1"><div class="n">${esc(m.name)}</div><div class="s">${[bd(m), m.goal ? '⭐ Ziel ' + m.goal : '', m.notify ? '🔔' : '🔕'].filter(Boolean).join(' · ')}</div></div><span>✏️</span></button>`).join('')}
      <div class="btns"><button class="btn primary" data-a="addmember">＋ Person hinzufügen</button></div></div>
    <h2>Kindermodus</h2><div class="card">
      <div class="hint" style="margin:0">Eine einfache Ansicht mit großen Symbolen nur für ein Kind. Zurück geht es mit einer kleinen Rechenaufgabe für Eltern.</div>
      <div class="row"><select id="kidWho">${memberOptions('')}</select><button class="btn primary" style="flex:none;padding:0 18px" data-a="kidstart">Starten</button></div></div>
    <h2>Terminvorlagen</h2><div class="card">
      ${S.templates.length ? `<div class="pickrow">${S.templates.map(t => `<span class="pick tplchip">${esc(t.emoji || '📌')} ${esc(t.title)} <button data-a="deltpl" data-id="${esc(t.id)}" aria-label="Vorlage löschen">✕</button></span>`).join('')}</div>` : '<div class="empty">Keine Vorlagen</div>'}
      <div class="hint">Neue Vorlagen legst du beim Erstellen eines Termins an („Als Vorlage merken“).</div></div>
    <h2>Wetter-Ort</h2><div class="card">
      <label style="margin-top:0">Ort oder Postleitzahl</label>
      <div class="row"><input id="city" placeholder="z. B. Köln oder 50667" value="${esc(s.manual ? s.city : '')}"><button class="btn primary" style="flex:none;padding:0 18px" data-a="setcity">Suchen</button></div>
      <div class="hint">${s.manual ? '📍 Fester Ort: ' + esc(s.city) : 'Aktuell wird der GPS-Standort genutzt.'}</div>
      <div class="btns"><button class="btn" data-a="usegps">📡 GPS-Standort nutzen</button></div></div>
    <h2>Erinnerungen</h2><div class="card">
      <label style="margin-top:0">Standard für neue Termine</label>
      <select id="defRemind">${REMIND.map(([v, t]) => `<option value="${v}" ${s.remind === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="btns"><button class="btn" data-a="testnotify">🔔 Testmeldung</button></div></div>
    <h2>Bildschirmschoner</h2><div class="card">
      <div class="hint" style="margin:0">Zeigt Uhr, Wetter, Termine, Countdown und Pinnwand, solange das Gerät ruht. Ein Tipp blendet den Familienplan ein.</div>
      <label class="check-l" style="margin-top:14px"><input type="checkbox" id="dreamTitles" ${s.dreamTitles !== false ? 'checked' : ''}> Termintitel und Zettel anzeigen (auch bei gesperrtem Gerät)</label>
      <label class="check-l"><input type="checkbox" id="dreamPhotos" ${s.dreamPhotos !== false ? 'checked' : ''}> Familienfotos als Diashow zeigen</label>
      ${S.photos.length ? `<div class="thumbs">${S.photos.map(n => `<div class="thumb"><img data-photo="${esc(n)}" alt=""><button data-a="delphoto" data-n="${esc(n)}" aria-label="Foto löschen">✕</button></div>`).join('')}</div>` : ''}
      <div class="btns"><button class="btn" data-a="addphotos">📷 Fotos hinzufügen (${S.photos.length}/${MAX_PHOTOS})</button></div>
      <div class="hint">Einschalten: Android-Einstellungen → Display → Bildschirmschoner → „Familienplaner“ wählen und „Beim Laden“ einstellen. Fotos werden verkleinert und nur in der App gespeichert.</div></div>
    <h2>App-Version</h2><div class="card">
      <div class="hint" style="margin:0" id="updMsg">${appVersion ? 'Installiert: Version ' + esc(appVersion.build) : 'Versionsnummer unbekannt.'}</div>
      <div class="btns"><button class="btn" data-a="checkupdate">🔄 Nach Updates suchen</button></div>
      <div class="hint">Ein Update wird im Browser heruntergeladen und über die bestehende App installiert. Deine Daten bleiben erhalten.</div></div>
    <h2>Daten</h2><div class="card">
      <div class="hint" style="margin:0">Alle Daten liegen im internen App-Speicher deines Geräts.</div>
      <div class="btns"><button class="btn" data-a="export">Sicherung</button><button class="btn" data-a="import">Wiederherstellen</button></div>
      <div class="btns"><button class="btn" data-a="importics">📥 Kalender importieren (.ics), z. B. Müllkalender</button></div></div>`;
}

function render() {
  applyTheme();
  const kid = S.settings.kidMode && memberById(S.settings.kidMode);
  const keep = $('main') ? $('main').scrollTop : 0;
  if (kid) { $('#app').innerHTML = `<main class="kidmain">${kidHTML(kid)}</main>`; if ($('main')) $('main').scrollTop = keep; return; }
  const tab = ui.tab;
  const main = tab === 'cal' ? calendarHTML() : tab === 'agenda' ? '<h2>Die nächsten Tage</h2>' + agendaHTML() : tab === 'list' ? listHTML() : tab === 'family' ? familyHTML() : moreHTML();
  $('#app').innerHTML = `<header>${headerHTML()}</header><main>${main}</main>
    ${tab === 'cal' || tab === 'agenda' ? '<button class="fab" data-a="add" aria-label="Termin hinzufügen">＋</button>' : ''}
    <nav>${[['cal', '📅', 'Kalender'], ['agenda', '🗒️', 'Agenda'], ['list', '✅', 'Listen'], ['family', '🏡', 'Familie'], ['more', '⚙️', 'Mehr']]
      .map(([k, i, t]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-t="${k}"><span>${i}</span>${t}</button>`).join('')}</nav>`;
  if ($('main')) $('main').scrollTop = keep;
  if (tab === 'more') hydratePhotos();
}

/* ---------- Formulare ---------- */
function openSheet(id, prefill) {
  const ev = id ? S.events.find(e => e.id === id) : null;
  const base = { title: '', date: ui.sel, time: '09:00', allDay: false, members: [], repeat: 'none', remind: S.settings.remind, notes: '', dur: 60, bring: '', pick: '' };
  const e = ev || Object.assign(base, prefill || {});
  const sel = FP.memberIds(e);
  $('#sheet').innerHTML = `<div class="sheet-body"><h2 style="margin-top:0">${ev ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
    ${!ev && S.templates.length ? `<label style="margin-top:0">Vorlage</label><div class="pickrow">${S.templates.map(t => `<button type="button" class="pick" data-a="tpl" data-id="${esc(t.id)}">${esc(t.emoji || '📌')} ${esc(t.title)}</button>`).join('')}</div>` : ''}
    <label>Titel</label><input id="f_title" value="${esc(e.title)}" maxlength="100" placeholder="z. B. Elternabend">
    <div class="row"><div><label>Datum</label><input type="date" id="f_date" value="${esc(e.date)}"></div>
    <div><label>Uhrzeit</label><input type="time" id="f_time" value="${esc(e.time || '09:00')}" ${e.allDay ? 'disabled' : ''}></div></div>
    <div class="row"><label class="check-l"><input type="checkbox" id="f_all" ${e.allDay ? 'checked' : ''}> Ganztägig</label>
    <div><select id="f_dur" aria-label="Dauer">${DURS.map(([v, t]) => `<option value="${v}" ${v === (Number(e.dur) || 60) ? 'selected' : ''}>Dauer: ${t}</option>`).join('')}</select></div></div>
    <label>Für wen? <span style="font-weight:400">(nichts gewählt = alle)</span></label>
    <div class="pickrow">${S.members.map(m => `<button type="button" class="pick ${sel.includes(m.id) ? 'on' : ''}" data-a="pickm" data-id="${esc(m.id)}" style="--c:${safeColor(m.color)}">${esc(m.emoji)} ${esc(m.name)}</button>`).join('')}</div>
    <div class="row"><div><label>🚗 Bringt</label><select id="f_bring">${memberOptions(e.bring, '–')}</select></div>
    <div><label>🚗 Holt ab</label><select id="f_pick">${memberOptions(e.pick, '–')}</select></div></div>
    <div class="row"><div><label>Wiederholung</label><select id="f_repeat">${Object.entries(REPEAT).map(([k, t]) => `<option value="${k}" ${k === e.repeat ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Erinnerung</label><select id="f_remind">${REMIND.map(([v, t]) => `<option value="${v}" ${v === e.remind ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <label>Notiz</label><textarea id="f_notes" rows="2" maxlength="300">${esc(e.notes)}</textarea>
    ${ev ? '' : '<label class="check-l" style="margin-top:12px"><input type="checkbox" id="f_tpl"> Als Vorlage merken</label>'}
    <div class="btns">${ev ? '<button class="btn danger" data-a="delevent" data-id="' + esc(ev.id) + '">Löschen</button>' : ''}
    <button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="saveevent" data-id="${ev ? esc(ev.id) : ''}">Speichern</button></div></div>`;
  $('#sheet').classList.remove('hidden');
  $('#f_all').onchange = () => { $('#f_time').disabled = $('#f_all').checked; };
}
function applyTemplate(t) {
  $('#f_title').value = t.title; $('#f_time').value = t.time || '09:00'; $('#f_all').checked = !!t.allDay; $('#f_time').disabled = !!t.allDay;
  $('#f_dur').value = String(t.dur || 60); $('#f_remind').value = String(t.remind); $('#f_repeat').value = t.repeat || 'none'; $('#f_notes').value = t.notes || '';
  document.querySelectorAll('.pick[data-a="pickm"]').forEach(b => b.classList.toggle('on', (t.members || []).includes(b.dataset.id)));
}
function openMemberSheet(id) {
  const n = S.members.length;
  const m = (id && memberById(id)) || { name: '', emoji: EMOJIS[n % EMOJIS.length], color: COLORS[n % COLORS.length], birthday: '', notify: true, gifts: '', goal: 0, reward: '', plan: {} };
  const editing = !!(id && memberById(id));
  const plan = m.plan || {};
  $('#sheet').innerHTML = `<div class="sheet-body"><h2 style="margin-top:0">${editing ? 'Profil bearbeiten' : 'Neue Person'}</h2>
    <label>Name</label><input id="p_name" value="${esc(m.name)}" maxlength="30" placeholder="z. B. Oma Lisa">
    <label>Symbol (Emoji – eigenes eintippen oder auswählen)</label>
    <input id="p_emoji" value="${esc(m.emoji)}" maxlength="8" style="font-size:1.4rem">
    <div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="emo" data-a="pickemoji" data-e="${e}">${e}</button>`).join('')}</div>
    <label>Farbe</label>
    <div class="swatches">${COLORS.map(c => `<button type="button" class="sw" data-a="pickcolor" data-c="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('')}
      <input type="color" id="p_color" value="${safeColor(m.color)}" aria-label="Eigene Farbe"></div>
    <label>Geburtstag (optional)</label><input type="date" id="p_bday" value="${esc(m.birthday)}">
    <div class="hint">Geburtsjahr unbekannt? Wähle 1900 – dann wird kein Alter angezeigt.</div>
    <label>🎁 Geschenkideen (Erinnerung eine Woche vor dem Geburtstag)</label>
    <textarea id="p_gifts" rows="2" maxlength="200" placeholder="z. B. Puzzle, Lego, Malbuch">${esc(m.gifts)}</textarea>
    <div class="row"><div><label>⭐ Wochenziel (Sterne)</label><input type="number" id="p_goal" min="0" max="99" value="${Number(m.goal) || 0}"></div>
    <div><label>🎁 Belohnung</label><input id="p_reward" maxlength="40" placeholder="z. B. Kinoabend" value="${esc(m.reward)}"></div></div>
    <details><summary>📚 Stundenplan &amp; Schulsachen</summary>
      ${SCHOOLDAYS.map(([k, name]) => `<label>${name}</label><input id="pl_${k}_s" placeholder="Fächer, z. B. Mathe, Deutsch" maxlength="120" value="${esc((plan[k] || {}).subjects)}">
        <input id="pl_${k}_b" placeholder="Mitnehmen, z. B. Sportbeutel, Flöte" maxlength="120" style="margin-top:6px" value="${esc((plan[k] || {}).bring)}">`).join('')}
    </details>
    <label class="check-l" style="margin-top:14px"><input type="checkbox" id="p_notify" ${m.notify ? 'checked' : ''}> Erinnerungen für diese Person anzeigen</label>
    <div class="btns">${editing && S.members.length > 1 ? '<button class="btn danger" data-a="delmember" data-id="' + esc(m.id) + '">Löschen</button>' : ''}
    <button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="savemember" data-id="${editing ? esc(m.id) : ''}">Speichern</button></div></div>`;
  $('#sheet').classList.remove('hidden');
}
const closeSheet = () => $('#sheet').classList.add('hidden');
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 3200); }

/* ---------- Fotos für den Bildschirmschoner ---------- */
const thumbCache = {};
async function hydratePhotos() {
  const fs = plug('Filesystem');
  if (!native || !fs) return;
  for (const img of document.querySelectorAll('img[data-photo]')) {
    const n = img.dataset.photo;
    try {
      if (!thumbCache[n]) { const r = await fs.readFile({ path: 'fotos/' + n, directory: 'DATA' }); thumbCache[n] = 'data:image/jpeg;base64,' + r.data; }
      img.src = thumbCache[n];
    } catch (e) { /* Foto fehlt */ }
  }
}
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}
function addPhotos() {
  const fs = plug('Filesystem');
  if (!native || !fs) return toast('Fotos gehen nur in der installierten App');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = async () => {
    let added = 0;
    for (const f of [...inp.files]) {
      if (S.photos.length >= MAX_PHOTOS) { toast(`Maximal ${MAX_PHOTOS} Fotos`); break; }
      try {
        const name = `p${Date.now().toString(36)}${added}.jpg`;
        await fs.writeFile({ path: 'fotos/' + name, directory: 'DATA', data: await shrink(f), recursive: true });
        S.photos.push(name); added++;
      } catch (e) { console.warn(e); }
    }
    if (added) { await persist(); render(); toast(`${added} Foto${added > 1 ? 's' : ''} hinzugefügt ✔`); }
  };
  inp.click();
}

/* ---------- Kalender importieren (.ics) ---------- */
function importICS() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.ics,text/calendar';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const list = FP.parseICS(await f.text(), { now: new Date() }).slice(0, 500);
      if (!list.length) return toast('Keine Termine in der Datei gefunden');
      if (!confirm(`${list.length} Termine gefunden. Jetzt importieren?\nMüll-Termine bekommen eine Erinnerung am Vorabend.`)) return;
      const waste = /müll|tonne|abfall|entsorg|gelber sack|wertstoff|sperr|biotonne|papier/i;
      const have = new Set(S.events.map(e => [e.title, e.date, e.time].join('|')));
      let added = 0;
      for (const e of list) {
        if (have.has([e.title, e.date, e.time].join('|'))) continue;
        S.events.push({ id: uid(), title: e.title.slice(0, 100), date: e.date, time: e.time || '09:00', allDay: !!e.allDay, members: [], repeat: e.repeat || 'none', until: e.until || '',
          remind: waste.test(e.title) ? -2 : S.settings.remind, notes: e.notes || '', dur: 60, bring: '', pick: '' });
        added++;
      }
      await save(); toast(`${added} Termine importiert ✔`);
    } catch (e) { toast('Datei konnte nicht gelesen werden'); }
  };
  inp.click();
}

/* ---------- Aktionen ---------- */
/* ---------- Update-Suche (GitHub Releases) ---------- */
let appVersion = null;
async function loadVersion() {
  try { const r = await fetch('version.json', { cache: 'no-store' }); if (r.ok) appVersion = await r.json(); } catch (e) { }
}
function updMsg(html) { const el = $('#updMsg'); if (el) el.innerHTML = html; }
async function checkUpdate(silent) {
  if (!appVersion || !appVersion.repo) { if (!silent) updMsg('Diese Version wurde ohne Update-Info gebaut.'); return; }
  if (!silent) updMsg('Suche läuft …');
  try {
    const r = await fetch('https://api.github.com/repos/' + appVersion.repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) { if (!silent) updMsg('Noch kein Release gefunden (Repository öffentlich?).'); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json();
    if (FP.isNewer(appVersion.build, rel.tag_name)) {
      const asset = (rel.assets || []).find(x => /\.apk$/i.test(x.name));
      ui.update = { tag: rel.tag_name, url: asset ? asset.browser_download_url : rel.html_url };
      updMsg('Neue Version ' + esc(FP.buildOf(rel.tag_name)) + ' verfügbar (installiert: ' + esc(appVersion.build) + ').<div class="btns"><button class="btn" data-a="installupdate">⬇️ Update herunterladen</button></div>');
      if (silent) toast('Update verfügbar: Mehr → App-Version');
    } else if (!silent) updMsg('Du hast die neueste Version (' + esc(appVersion.build) + ').');
  } catch (e) { if (!silent) updMsg('Suche fehlgeschlagen. Ist das Gerät online?'); }
}
async function doExport() {
  const fs = plug('Filesystem');
  const name = `Familienplaner/sicherung-${today()}.json`;
  try {
    if (native && fs) {
      await fs.writeFile({ path: name, directory: 'DOCUMENTS', data: JSON.stringify(S), encoding: 'utf8', recursive: true });
      toast('Gespeichert in Dokumente/' + name + ' (ohne Fotos)');
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = 'familienplaner-sicherung.json'; a.click();
    }
  } catch (e) { toast('Sicherung nicht möglich (Speicherrechte)'); }
}
function doQuick() {
  const inp = $('#quick'), text = inp ? inp.value.trim() : '';
  if (!text) return toast('Schreib zum Beispiel: Freitag 16 Uhr Zahnarzt');
  const r = FP.parseQuick(text, S.members, new Date());
  if (!r.title) return toast('Ich habe keinen Titel gefunden');
  openSheet(null, { title: r.title, date: r.date || ui.sel, time: r.time || '09:00', allDay: r.allDay, members: r.members, repeat: r.repeat });
}
async function toggleChore(id) {
  const c = S.chores.find(x => x.id === id); if (!c) return;
  const t = today(), before = FP.starsThisWeek(S.starLog, c.member, t), m = memberById(c.member);
  if (FP.choreOpen(c, t)) {
    c.lastDone = t; S.starLog.push({ date: t, member: c.member, n: c.stars, chore: c.id });
    if (m && m.goal > 0 && before < m.goal && before + c.stars >= m.goal) toast(`🎉 ${m.name} hat das Wochenziel erreicht!${m.reward ? ' ' + m.reward : ''}`);
    else toast(`⭐ +${c.stars}${m ? ' für ' + m.name : ''}`);
  } else {
    const i = S.starLog.map(l => l.chore).lastIndexOf(c.id);
    if (i >= 0) S.starLog.splice(i, 1);
    c.lastDone = '';
  }
  await save();
}

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'tab') { ui.tab = b.dataset.t; render(); }
  else if (a === 'prev' || a === 'next') { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + (a === 'next' ? 1 : -1), 1); render(); }
  else if (a === 'sel') { ui.sel = b.dataset.d; const d = FP.parse(ui.sel); if (d.getMonth() !== ui.month.getMonth()) ui.month = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
  else if (a === 'add') openSheet();
  else if (a === 'edit') openSheet(id);
  else if (a === 'quick') doQuick();
  else if (a === 'close') closeSheet();
  else if (a === 'weather') fetchWeather(true);
  else if (a === 'pickm') b.classList.toggle('on');
  else if (a === 'pickemoji') $('#p_emoji').value = b.dataset.e;
  else if (a === 'pickcolor') $('#p_color').value = b.dataset.c;
  else if (a === 'tpl') { const t = S.templates.find(x => x.id === id); if (t) applyTemplate(t); }
  else if (a === 'deltpl') { S.templates = S.templates.filter(x => x.id !== id); await save(); }
  else if (a === 'saveevent') {
    const title = $('#f_title').value.trim(), date = $('#f_date').value;
    if (!title || !date) return toast('Titel und Datum werden benötigt');
    const members = [...document.querySelectorAll('.pick.on[data-a="pickm"]')].map(x => x.dataset.id);
    const data = { title, date, allDay: $('#f_all').checked, time: $('#f_time').value || '09:00', dur: Number($('#f_dur').value) || 60, members,
      bring: $('#f_bring').value, pick: $('#f_pick').value,
      repeat: $('#f_repeat').value, remind: Number($('#f_remind').value), notes: $('#f_notes').value.trim() };
    const rep = FP.conflictReport(S.events.filter(e => e.id !== id), Object.assign({ id: id || 'new' }, data), 3);
    if (rep.length) {
      const lines = rep.map(r => `${fmtShort(r.date)}: ` + r.events.map(e => `${e.title} (${e.time})`).join(', ')).join('\n');
      if (!confirm('⚠️ Überschneidung mit:\n' + lines + '\n\nTrotzdem speichern?')) return;
    }
    if (id) Object.assign(S.events.find(e => e.id === id), data); else S.events.push(Object.assign({ id: uid() }, data));
    const tplBox = $('#f_tpl');
    if (!id && tplBox && tplBox.checked) S.templates.push({ id: uid(), emoji: '📌', title, time: data.time, allDay: data.allDay, dur: data.dur, remind: data.remind, repeat: data.repeat, notes: data.notes, members });
    ui.sel = date; closeSheet(); await save(); toast('Gespeichert ✔');
  }
  else if (a === 'delevent') { S.events = S.events.filter(e => e.id !== id); closeSheet(); await save(); }
  else if (a === 'addmember') openMemberSheet();
  else if (a === 'editmember') { if (id) openMemberSheet(id); }
  else if (a === 'savemember') {
    const name = $('#p_name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    const plan = {};
    SCHOOLDAYS.forEach(([k]) => { const s = $('#pl_' + k + '_s').value.trim(), br = $('#pl_' + k + '_b').value.trim(); if (s || br) plan[k] = { subjects: s, bring: br }; });
    const data = { name, emoji: $('#p_emoji').value.trim() || '🙂', color: safeColor($('#p_color').value), birthday: $('#p_bday').value || '', notify: $('#p_notify').checked,
      gifts: $('#p_gifts').value.trim(), goal: Math.max(0, Math.min(99, Number($('#p_goal').value) || 0)), reward: $('#p_reward').value.trim(), plan };
    if (id) Object.assign(memberById(id), data); else S.members.push(Object.assign({ id: uid() }, data));
    closeSheet(); await save(); toast('Profil gespeichert ✔');
  }
  else if (a === 'delmember') {
    const m = memberById(id);
    if (!m || !confirm(`„${m.name}“ wirklich löschen? Die Termine bleiben erhalten.`)) return;
    S.members = S.members.filter(x => x.id !== id);
    S.events.forEach(e => { e.members = FP.memberIds(e).filter(x => x !== id); if (e.bring === id) e.bring = ''; if (e.pick === id) e.pick = ''; });
    S.tasks.forEach(t => { if (t.member === id) t.member = ''; });
    S.chores = S.chores.filter(c => c.member !== id); S.starLog = S.starLog.filter(l => l.member !== id);
    if (S.settings.kidMode === id) S.settings.kidMode = '';
    closeSheet(); await save();
  }
  else if (a === 'addtask') {
    const text = $('#newTask').value.trim(); if (!text) return;
    S.tasks.push({ id: uid(), text, done: false, due: $('#newDue').value || '', member: $('#newWho').value }); await save();
  }
  else if (a === 'toggle') { const t = S.tasks.find(t => t.id === id); t.done = !t.done; await save(); }
  else if (a === 'deltask') { S.tasks = S.tasks.filter(t => t.id !== id); await save(); }
  else if (a === 'cleardone') { S.tasks = S.tasks.filter(t => !t.done); await save(); }
  else if (a === 'addnote') {
    const text = $('#noteText').value.trim(); if (!text) return toast('Was soll auf den Zettel?');
    S.notes.push({ id: uid(), text, member: $('#noteWho').value, ts: Date.now() });
    if (S.notes.length > 30) S.notes.shift();
    await save();
  }
  else if (a === 'delnote') { S.notes = S.notes.filter(n => n.id !== id); await save(); }
  else if (a === 'addchore') {
    const text = $('#choreText').value.trim(), who = $('#choreWho').value;
    if (!text || !who) return toast('Ämtchen und Person werden benötigt');
    S.chores.push({ id: uid(), text, stars: Number($('#choreStars').value) || 1, member: who, repeat: $('#choreRep').value, lastDone: '' }); await save();
  }
  else if (a === 'chore') toggleChore(id);
  else if (a === 'delchore') { S.chores = S.chores.filter(c => c.id !== id); await save(); }
  else if (a === 'bringtoggle') {
    const key = b.dataset.k, [ds, mid] = key.split('|'), m = memberById(mid); if (!m) return;
    const it = FP.bringFor(m, ds)[Number(b.dataset.n)]; if (!it) return;
    const got = S.bring[key] || [];
    S.bring[key] = got.includes(it) ? got.filter(x => x !== it) : got.concat(it);
    await persist(); render();
  }
  else if (a === 'addcd') {
    const title = $('#cdTitle').value.trim(), date = $('#cdDate').value;
    if (!title || !date) return toast('Titel und Datum werden benötigt');
    S.countdowns.push({ id: uid(), title, date, emoji: $('#cdEmoji').value.trim() || '🎉' }); await save();
  }
  else if (a === 'delcd') { S.countdowns = S.countdowns.filter(c => c.id !== id); await save(); }
  else if (a === 'kidstart') { const w = $('#kidWho').value; if (!w) return toast('Bitte ein Kind auswählen'); S.settings.kidMode = w; await persist(); render(); }
  else if (a === 'kidexit') {
    const x = 2 + Math.floor(Math.random() * 8), y = 3 + Math.floor(Math.random() * 7);
    const ans = prompt(`🔒 Nur für Eltern: ${x} + ${y} = ?`);
    if (ans !== null && Number(ans) === x + y) { S.settings.kidMode = ''; await persist(); render(); } else if (ans !== null) toast('Leider falsch');
  }
  else if (a === 'theme') { S.settings.theme = b.dataset.t; await persist(); render(); }
  else if (a === 'setcity') {
    const q = $('#city').value.trim();
    if (!q) return toast('Bitte einen Ort oder eine Postleitzahl eingeben');
    toast('Suche „' + q + '“ …');
    try {
      const r = await geocode(q);
      if (!r) return toast('„' + q + '“ nicht gefunden – probiere nur den Stadtnamen');
      Object.assign(S.settings, { manual: true, city: r.name, lat: r.lat, lon: r.lon });
      S.weather = null; await persist(); render(); toast('Ort gesetzt: ' + r.name); fetchWeather(true);
    } catch (e) { toast('Keine Verbindung zur Ortssuche (' + ((e && e.message) || e) + ')'); }
  }
  else if (a === 'usegps') { Object.assign(S.settings, { manual: false, city: '', lat: null, lon: null }); S.weather = null; await persist(); render(); fetchWeather(true); }
  else if (a === 'testnotify') scheduleNotifications(true);
  else if (a === 'addphotos') addPhotos();
  else if (a === 'delphoto') {
    const n = b.dataset.n, fs = plug('Filesystem');
    try { if (native && fs) await fs.deleteFile({ path: 'fotos/' + n, directory: 'DATA' }); } catch (e) { }
    S.photos = S.photos.filter(x => x !== n); delete thumbCache[n]; await save();
  }
  else if (a === 'checkupdate') checkUpdate(false);
  else if (a === 'installupdate') { if (ui.update) window.location.href = ui.update.url; }
  else if (a === 'export') doExport();
  else if (a === 'import') $('#importFile').click();
  else if (a === 'importics') importICS();
});
document.addEventListener('change', async ev => {
  const id = ev.target.id;
  if (id === 'defRemind') { S.settings.remind = Number(ev.target.value); await persist(); }
  if (id === 'dreamTitles') { S.settings.dreamTitles = ev.target.checked; await persist(); }
  if (id === 'dreamPhotos') { S.settings.dreamPhotos = ev.target.checked; await persist(); }
  if (id === 'familyName') { S.settings.familyName = ev.target.value.trim(); await persist(); render(); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'quick') { ev.preventDefault(); doQuick(); }
});
$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!Array.isArray(j.events) || !Array.isArray(j.members)) throw new Error('format');
    S = migrate(j); await save(); toast('Wiederhergestellt ✔');
  } catch (e) { toast('Datei ungültig'); }
  ev.target.value = '';
});
$('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') closeSheet(); });

/* ---------- Start ---------- */
(async function init() {
  const saved = await load();
  S = saved ? migrate(saved) : defaultState();
  await loadVersion();
  render();
  scheduleNotifications();
  fetchWeather(false);
  checkUpdate(true);
})();

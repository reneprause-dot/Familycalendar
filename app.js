'use strict';
/* Familienplaner – Kalender, Wetter, Erinnerungen, Profile, lokaler App-Speicher */

const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const plug = n => (cap && cap.Plugins && cap.Plugins[n]) || null;
const FILE = 'familienplaner.json';
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
const REPEAT = { none: 'Einmalig', daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' };
const REMIND = [[-1, 'Keine Erinnerung'], [0, 'Zum Beginn'], [10, '10 Min. vorher'], [30, '30 Min. vorher'], [60, '1 Std. vorher'], [1440, '1 Tag vorher']];

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => FP.ymd(new Date());
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');
const inkOn = hex => { const n = parseInt(safeColor(hex).slice(1), 16); return ((0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255) > 0.6 ? '#2b2b2b' : '#fff'; };

function defaultState() {
  return {
    members: [
      { id: 'm1', name: 'Mama', emoji: '👩', color: COLORS[8], birthday: '', notify: true },
      { id: 'm2', name: 'Papa', emoji: '👨', color: COLORS[5], birthday: '', notify: true },
      { id: 'm3', name: 'Kind', emoji: '🧒', color: COLORS[3], birthday: '', notify: true }
    ],
    events: [], tasks: [],
    settings: { familyName: '', theme: 'sun', manual: false, city: '', lat: null, lon: null, remind: 30 },
    weather: null
  };
}
let S = defaultState();
const ui = { tab: 'cal', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), sel: today(), weatherErr: '', weatherDetail: '', loading: false };

/* Ältere Daten (vor Profil-Update) auf das neue Format bringen */
function migrate(s) {
  const d = defaultState();
  s = Object.assign(d, s, { settings: Object.assign(d.settings, (s && s.settings) || {}) });
  s.members = (s.members || []).map((m, i) => ({
    id: m.id, name: m.name || 'Person', emoji: m.emoji || EMOJIS[i % EMOJIS.length], color: safeColor(m.color || COLORS[i % COLORS.length]),
    birthday: m.birthday || '', notify: m.notify !== false
  }));
  if (!s.members.length) s.members = defaultState().members;
  const legacyAll = s.members.find(m => m.id === 'm0' && m.name === 'Alle');
  s.events = (s.events || []).map(e => {
    if (!Array.isArray(e.members)) e.members = e.member && !(legacyAll && e.member === 'm0') ? [e.member] : [];
    delete e.member;
    return e;
  });
  if (!THEMES[s.settings.theme]) s.settings.theme = 'sun';
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
    S.weather = { ts: Date.now(), place: loc.place, cur: j.current, daily: j.daily };
    await persist();
  } catch (e) {
    ui.weatherErr = S.settings.manual ? 'Das Wetter konnte nicht geladen werden.' : 'Dein Standort konnte nicht ermittelt werden.';
    ui.weatherDetail = String((e && e.message) || e);
  }
  ui.loading = false; render();
}

/* ---------- Darstellung ---------- */
const memberById = id => S.members.find(m => m.id === id);
const evMembers = ev => FP.memberIds(ev).map(memberById).filter(Boolean);
const fmtDate = ds => { const d = FP.parse(ds); return `${DOWL[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const rel = ds => { if (ds === today()) return 'Heute'; if (ds === FP.ymd(FP.addDays(new Date(), 1))) return 'Morgen'; return fmtDate(ds); };
const chipHTML = m => `<span class="chip" style="background:${safeColor(m.color)};color:${inkOn(m.color)}">${esc(m.emoji)} ${esc(m.name)}</span>`;
const avatarHTML = (m, big) => `<span class="avatar ${big ? 'big' : ''}" style="background:${safeColor(m.color)}">${esc(m.emoji)}</span>`;

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

function itemHTML(ev, ds) {
  const mems = evMembers(ev);
  const cols = mems.map(m => safeColor(m.color));
  const bar = cols.length > 1 ? `linear-gradient(${cols.join(',')})` : (cols[0] || 'var(--primary)');
  const who = ev.virtual ? '' : (mems.length ? mems.map(chipHTML).join('') : '<span class="chip all">👨‍👩‍👧‍👦 Alle</span>');
  const extra = [ev.virtual ? '' : REPEAT[ev.repeat] !== 'Einmalig' ? REPEAT[ev.repeat] : '', ev.remind >= 0 && !ev.virtual ? '🔔' : ''].filter(Boolean).join(' · ');
  const act = ev.virtual ? `data-a="editmember" data-id="${esc(mems[0] ? mems[0].id : '')}"` : `data-a="edit" data-id="${esc(ev.id)}"`;
  const when = ev.virtual ? 'Geburtstag' : ev.allDay ? 'Ganztägig' : ev.time;
  return `<button class="item" ${act}><div class="bar" style="background:${bar}"></div>
    <div class="body"><div class="t">${esc(FP.displayTitle(ev, ds))}</div>
    <div class="s">${when}${extra ? ' · ' + extra : ''}${ev.notes ? ' · ' + esc(ev.notes) : ''}</div>
    ${who ? `<div class="chips">${who}</div>` : ''}</div></button>`;
}
function taskHTML(t) {
  const m = memberById(t.member);
  return `<div class="item ${t.done ? 'done' : ''}" style="align-items:center"><button class="check" data-a="toggle" data-id="${esc(t.id)}">${t.done ? '✓' : ''}</button>
    <div class="body"><div class="t">${esc(t.text)}</div>
    ${t.due ? `<div class="s">Fällig: ${fmtDate(t.due)}</div>` : ''}${m ? `<div class="chips">${chipHTML(m)}</div>` : ''}</div>
    <button data-a="deltask" data-id="${esc(t.id)}" aria-label="Löschen">🗑️</button></div>`;
}

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
  return `<div class="cal-head"><button class="icon-btn" data-a="prev">‹</button>
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
    <div><label>Für</label><select id="newWho"><option value="">Alle</option>${S.members.map(m => `<option value="${esc(m.id)}">${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}</select></div></div></div>
    <div class="card">${open.length ? open.map(taskHTML).join('') : '<div class="empty">Alles erledigt ✨</div>'}</div>
    ${done.length ? `<h2>Erledigt</h2><div class="card">${done.map(taskHTML).join('')}</div><button class="btn" style="width:100%" data-a="cleardone">Erledigte löschen</button>` : ''}`;
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
        <div style="flex:1"><div class="n">${esc(m.name)}</div><div class="s">${[bd(m), m.notify ? '🔔 Erinnerungen an' : '🔕 Erinnerungen aus'].filter(Boolean).join(' · ')}</div></div><span>✏️</span></button>`).join('')}
      <div class="btns"><button class="btn primary" data-a="addmember">＋ Person hinzufügen</button></div></div>
    <h2>Wetter-Ort</h2><div class="card">
      <label style="margin-top:0">Ort oder Postleitzahl</label>
      <div class="row"><input id="city" placeholder="z. B. Köln oder 50667" value="${esc(s.manual ? s.city : '')}"><button class="btn primary" style="flex:none;padding:0 18px" data-a="setcity">Suchen</button></div>
      <div class="hint">${s.manual ? '📍 Fester Ort: ' + esc(s.city) : 'Aktuell wird der GPS-Standort genutzt.'}</div>
      <div class="btns"><button class="btn" data-a="usegps">📡 GPS-Standort nutzen</button></div></div>
    <h2>Erinnerungen</h2><div class="card">
      <label style="margin-top:0">Standard für neue Termine</label>
      <select id="defRemind">${REMIND.map(([v, t]) => `<option value="${v}" ${s.remind === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="btns"><button class="btn" data-a="testnotify">🔔 Testmeldung</button></div></div>
    <h2>Daten</h2><div class="card">
      <div class="hint" style="margin:0">Alle Daten liegen im internen App-Speicher deines Geräts.</div>
      <div class="btns"><button class="btn" data-a="export">Sicherung</button><button class="btn" data-a="import">Wiederherstellen</button></div></div>`;
}

function render() {
  applyTheme();
  const tab = ui.tab;
  const main = tab === 'cal' ? calendarHTML() : tab === 'agenda' ? '<h2>Die nächsten Tage</h2>' + agendaHTML() : tab === 'list' ? listHTML() : moreHTML();
  const keep = $('main') ? $('main').scrollTop : 0;
  $('#app').innerHTML = `<header>${headerHTML()}</header><main>${main}</main>
    ${tab === 'cal' || tab === 'agenda' ? '<button class="fab" data-a="add" aria-label="Termin hinzufügen">＋</button>' : ''}
    <nav>${[['cal', '📅', 'Kalender'], ['agenda', '🗒️', 'Agenda'], ['list', '✅', 'Listen'], ['more', '⚙️', 'Mehr']]
      .map(([k, i, t]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-t="${k}"><span>${i}</span>${t}</button>`).join('')}</nav>`;
  if ($('main')) $('main').scrollTop = keep;
}

/* ---------- Formulare ---------- */
function openSheet(id) {
  const ev = id ? S.events.find(e => e.id === id) : null;
  const e = ev || { title: '', date: ui.sel, time: '09:00', allDay: false, members: [], repeat: 'none', remind: S.settings.remind, notes: '' };
  const sel = FP.memberIds(e);
  $('#sheet').innerHTML = `<div class="sheet-body"><h2 style="margin-top:0">${ev ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
    <label>Titel</label><input id="f_title" value="${esc(e.title)}" maxlength="100" placeholder="z. B. Elternabend">
    <div class="row"><div><label>Datum</label><input type="date" id="f_date" value="${esc(e.date)}"></div>
    <div><label>Uhrzeit</label><input type="time" id="f_time" value="${esc(e.time || '09:00')}" ${e.allDay ? 'disabled' : ''}></div></div>
    <label class="check-l"><input type="checkbox" id="f_all" ${e.allDay ? 'checked' : ''}> Ganztägig</label>
    <label>Für wen? <span style="font-weight:400">(nichts gewählt = alle)</span></label>
    <div class="pickrow">${S.members.map(m => `<button type="button" class="pick ${sel.includes(m.id) ? 'on' : ''}" data-a="pickm" data-id="${esc(m.id)}" style="--c:${safeColor(m.color)}">${esc(m.emoji)} ${esc(m.name)}</button>`).join('')}</div>
    <div class="row"><div><label>Wiederholung</label><select id="f_repeat">${Object.entries(REPEAT).map(([k, t]) => `<option value="${k}" ${k === e.repeat ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Erinnerung</label><select id="f_remind">${REMIND.map(([v, t]) => `<option value="${v}" ${v === e.remind ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <label>Notiz</label><textarea id="f_notes" rows="2" maxlength="300">${esc(e.notes)}</textarea>
    <div class="btns">${ev ? '<button class="btn danger" data-a="delevent" data-id="' + esc(ev.id) + '">Löschen</button>' : ''}
    <button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="saveevent" data-id="${ev ? esc(ev.id) : ''}">Speichern</button></div></div>`;
  $('#sheet').classList.remove('hidden');
  $('#f_all').onchange = () => { $('#f_time').disabled = $('#f_all').checked; };
}
function openMemberSheet(id) {
  const n = S.members.length;
  const m = (id && memberById(id)) || { name: '', emoji: EMOJIS[n % EMOJIS.length], color: COLORS[n % COLORS.length], birthday: '', notify: true };
  const editing = !!(id && memberById(id));
  $('#sheet').innerHTML = `<div class="sheet-body"><h2 style="margin-top:0">${editing ? 'Profil bearbeiten' : 'Neue Person'}</h2>
    <label>Name</label><input id="p_name" value="${esc(m.name)}" maxlength="30" placeholder="z. B. Oma Lisa">
    <label>Symbol (Emoji – eigenes eintippen oder auswählen)</label>
    <input id="p_emoji" value="${esc(m.emoji)}" maxlength="8" style="font-size:1.4rem">
    <div class="emoji-grid">${EMOJIS.map(e => `<button type="button" class="emo" data-a="pickemoji" data-e="${e}">${e}</button>`).join('')}</div>
    <label>Farbe</label>
    <div class="swatches">${COLORS.map(c => `<button type="button" class="sw" data-a="pickcolor" data-c="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('')}
      <input type="color" id="p_color" value="${safeColor(m.color)}" aria-label="Eigene Farbe"></div>
    <label>Geburtstag (optional)</label><input type="date" id="p_bday" value="${esc(m.birthday)}">
    <div class="hint">Das Geburtsjahr unbekannt? Wähle 1900 – dann wird kein Alter angezeigt.</div>
    <label class="check-l" style="margin-top:14px"><input type="checkbox" id="p_notify" ${m.notify ? 'checked' : ''}> Erinnerungen für diese Person anzeigen</label>
    <div class="btns">${editing && S.members.length > 1 ? '<button class="btn danger" data-a="delmember" data-id="' + esc(m.id) + '">Löschen</button>' : ''}
    <button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="savemember" data-id="${editing ? esc(m.id) : ''}">Speichern</button></div></div>`;
  $('#sheet').classList.remove('hidden');
}
const closeSheet = () => $('#sheet').classList.add('hidden');
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 3200); }

/* ---------- Aktionen ---------- */
async function doExport() {
  const fs = plug('Filesystem');
  const name = `Familienplaner/sicherung-${today()}.json`;
  try {
    if (native && fs) {
      await fs.writeFile({ path: name, directory: 'DOCUMENTS', data: JSON.stringify(S), encoding: 'utf8', recursive: true });
      toast('Gespeichert in Dokumente/' + name);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = 'familienplaner-sicherung.json'; a.click();
    }
  } catch (e) { toast('Sicherung nicht möglich (Speicherrechte)'); }
}

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'tab') { ui.tab = b.dataset.t; render(); }
  else if (a === 'prev' || a === 'next') { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + (a === 'next' ? 1 : -1), 1); render(); }
  else if (a === 'sel') { ui.sel = b.dataset.d; const d = FP.parse(ui.sel); if (d.getMonth() !== ui.month.getMonth()) ui.month = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
  else if (a === 'add') openSheet();
  else if (a === 'edit') openSheet(id);
  else if (a === 'close') closeSheet();
  else if (a === 'weather') fetchWeather(true);
  else if (a === 'pickm') b.classList.toggle('on');
  else if (a === 'pickemoji') $('#p_emoji').value = b.dataset.e;
  else if (a === 'pickcolor') $('#p_color').value = b.dataset.c;
  else if (a === 'saveevent') {
    const title = $('#f_title').value.trim(), date = $('#f_date').value;
    if (!title || !date) return toast('Titel und Datum werden benötigt');
    const members = [...document.querySelectorAll('.pick.on')].map(x => x.dataset.id);
    const data = { title, date, allDay: $('#f_all').checked, time: $('#f_time').value || '09:00', members,
      repeat: $('#f_repeat').value, remind: Number($('#f_remind').value), notes: $('#f_notes').value.trim() };
    if (id) Object.assign(S.events.find(e => e.id === id), data); else S.events.push(Object.assign({ id: uid() }, data));
    ui.sel = date; closeSheet(); await save(); toast('Gespeichert ✔');
  }
  else if (a === 'delevent') { S.events = S.events.filter(e => e.id !== id); closeSheet(); await save(); }
  else if (a === 'addmember') openMemberSheet();
  else if (a === 'editmember') { if (id) openMemberSheet(id); }
  else if (a === 'savemember') {
    const name = $('#p_name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    const data = { name, emoji: $('#p_emoji').value.trim() || '🙂', color: safeColor($('#p_color').value), birthday: $('#p_bday').value || '', notify: $('#p_notify').checked };
    if (id) Object.assign(memberById(id), data); else S.members.push(Object.assign({ id: uid() }, data));
    closeSheet(); await save(); toast('Profil gespeichert ✔');
  }
  else if (a === 'delmember') {
    const m = memberById(id);
    if (!m || !confirm(`„${m.name}“ wirklich löschen? Die Termine bleiben erhalten.`)) return;
    S.members = S.members.filter(x => x.id !== id);
    S.events.forEach(e => { e.members = FP.memberIds(e).filter(x => x !== id); });
    S.tasks.forEach(t => { if (t.member === id) t.member = ''; });
    closeSheet(); await save();
  }
  else if (a === 'addtask') {
    const text = $('#newTask').value.trim(); if (!text) return;
    S.tasks.push({ id: uid(), text, done: false, due: $('#newDue').value || '', member: $('#newWho').value }); await save();
  }
  else if (a === 'toggle') { const t = S.tasks.find(t => t.id === id); t.done = !t.done; await save(); }
  else if (a === 'deltask') { S.tasks = S.tasks.filter(t => t.id !== id); await save(); }
  else if (a === 'cleardone') { S.tasks = S.tasks.filter(t => !t.done); await save(); }
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
  else if (a === 'export') doExport();
  else if (a === 'import') $('#importFile').click();
});
document.addEventListener('change', async ev => {
  if (ev.target.id === 'defRemind') { S.settings.remind = Number(ev.target.value); await persist(); }
  if (ev.target.id === 'familyName') { S.settings.familyName = ev.target.value.trim(); await persist(); render(); }
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
  render();
  scheduleNotifications();
  fetchWeather(false);
})();

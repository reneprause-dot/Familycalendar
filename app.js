'use strict';
/* Familienplaner – Kalender, Wetter, Erinnerungen, lokaler App-Speicher */

const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const plug = n => (cap && cap.Plugins && cap.Plugins[n]) || null;
const FILE = 'familienplaner.json';
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DOWL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const REPEAT = { none: 'Einmalig', daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' };
const REMIND = [[-1, 'Keine Erinnerung'], [0, 'Zum Beginn'], [10, '10 Min. vorher'], [30, '30 Min. vorher'], [60, '1 Std. vorher'], [1440, '1 Tag vorher']];

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => FP.ymd(new Date());

function defaultState() {
  return {
    members: [
      { id: 'm0', name: 'Alle', color: '#6366f1' },
      { id: 'm1', name: 'Mama', color: '#ec4899' },
      { id: 'm2', name: 'Papa', color: '#3b82f6' },
      { id: 'm3', name: 'Kinder', color: '#10b981' }
    ],
    events: [], tasks: [],
    settings: { manual: false, city: '', lat: null, lon: null, remind: 30 },
    weather: null
  };
}
let S = defaultState();
const ui = { tab: 'cal', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), sel: today(), weatherErr: '', loading: false };

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
    const list = FP.buildNotifications(S.events, S.tasks, S.members, new Date());
    const items = list.map((n, i) => ({ id: i + 1, title: n.title, body: n.body || ' ', schedule: { at: n.at.toISOString(), allowWhileIdle: true } }));
    if (test) items.push({ id: 9999, title: 'Familienplaner', body: 'Test: Benachrichtigungen funktionieren', schedule: { at: new Date(Date.now() + 5000).toISOString(), allowWhileIdle: true } });
    if (items.length) await ln.schedule({ notifications: items });
    if (test) toast('Testmeldung kommt in 5 Sekunden');
  } catch (e) { console.warn(e); if (test) toast('Fehler bei Benachrichtigungen'); }
}

/* ---------- Wetter (Open-Meteo, ohne API-Key) ---------- */
const WMO = c => c === 0 ? ['☀️', 'Klar'] : c <= 2 ? ['🌤️', 'Heiter'] : c === 3 ? ['☁️', 'Bedeckt'] : c <= 48 ? ['🌫️', 'Nebel'] :
  c <= 57 ? ['🌦️', 'Nieselregen'] : c <= 67 ? ['🌧️', 'Regen'] : c <= 77 ? ['❄️', 'Schnee'] : c <= 82 ? ['🌧️', 'Schauer'] :
    c <= 86 ? ['🌨️', 'Schneeschauer'] : ['⛈️', 'Gewitter'];

async function reverse(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=de`);
    const j = await r.json(); return j.city || j.locality || '';
  } catch (e) { return ''; }
}
async function position() {
  const g = plug('Geolocation');
  if (native && g) {
    try { await g.requestPermissions(); } catch (e) { }
    return g.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000 });
  }
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000 }));
}
async function fetchWeather(force) {
  const w = S.weather;
  if (!force && w && Date.now() - w.ts < 30 * 60 * 1000) return;
  ui.loading = true; ui.weatherErr = ''; render();
  try {
    let lat, lon, place = S.settings.city || '';
    if (S.settings.manual && S.settings.lat != null) { lat = S.settings.lat; lon = S.settings.lon; }
    else {
      const pos = await position();
      lat = pos.coords.latitude; lon = pos.coords.longitude;
      place = (await reverse(lat, lon)) || 'Aktueller Standort';
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`;
    const j = await (await fetch(url)).json();
    if (!j.current) throw new Error('keine Daten');
    S.weather = { ts: Date.now(), place, cur: j.current, daily: j.daily };
    await persist();
  } catch (e) {
    ui.weatherErr = S.settings.manual ? 'Wetter nicht erreichbar (Internet?).' : 'Standort nicht verfügbar. Erlaube den Standort oder stelle unter „Mehr“ einen Ort ein.';
  }
  ui.loading = false; render();
}

/* ---------- Darstellung ---------- */
const memberOf = id => S.members.find(m => m.id === id) || S.members[0] || { name: '', color: '#888' };
const fmtDate = ds => { const d = FP.parse(ds); return `${DOWL[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const rel = ds => { const t = today(); if (ds === t) return 'Heute'; if (ds === FP.ymd(FP.addDays(new Date(), 1))) return 'Morgen'; return fmtDate(ds); };

function weatherHTML() {
  const w = S.weather;
  let body;
  if (w) {
    const [ico, txt] = WMO(w.cur.weather_code);
    const days = w.daily.time.slice(1, 4).map((t, i) => {
      const d = FP.parse(t), k = i + 1;
      return `<div class="w-day"><b>${DOW[(d.getDay() + 6) % 7]}</b>${WMO(w.daily.weather_code[k])[0]}<br>${Math.round(w.daily.temperature_2m_max[k])}° / ${Math.round(w.daily.temperature_2m_min[k])}°</div>`;
    }).join('');
    body = `<div class="w-top"><div class="w-ico">${ico}</div>
      <div><div class="w-temp">${Math.round(w.cur.temperature_2m)}°C</div>
      <div class="w-meta">${esc(txt)} · gefühlt ${Math.round(w.cur.apparent_temperature)}° · Wind ${Math.round(w.cur.wind_speed_10m)} km/h</div>
      <div class="w-meta">📍 ${esc(w.place)}</div></div>
      <button class="w-refresh" data-a="weather" aria-label="Aktualisieren">${ui.loading ? '⏳' : '🔄'}</button></div>
      <div class="w-days">${days}</div>`;
  } else {
    body = `<div class="w-top"><div class="w-ico">🌍</div><div class="w-meta">${ui.loading ? 'Wetter wird geladen…' : 'Wetter für deinen Standort'}</div>
      <button class="w-refresh" data-a="weather">${ui.loading ? '⏳' : 'Laden'}</button></div>`;
  }
  return `<div class="card weather">${body}${ui.weatherErr ? `<div class="err">${esc(ui.weatherErr)}</div>` : ''}</div>`;
}

function itemHTML(ev, ds) {
  const m = memberOf(ev.member);
  const when = ev.allDay ? 'Ganztägig' : ev.time;
  const extra = [REPEAT[ev.repeat] !== 'Einmalig' ? REPEAT[ev.repeat] : '', ev.remind >= 0 ? '🔔' : ''].filter(Boolean).join(' · ');
  return `<button class="item" data-a="edit" data-id="${ev.id}"><div class="bar" style="background:${m.color}"></div>
    <div><div class="t">${esc(ev.title)}<span class="chip" style="background:${m.color}">${esc(m.name)}</span></div>
    <div class="s">${when}${extra ? ' · ' + extra : ''}${ev.notes ? ' · ' + esc(ev.notes) : ''}</div></div></button>`;
}
function taskHTML(t) {
  const m = memberOf(t.member);
  return `<div class="item ${t.done ? 'done' : ''}"><button class="check" data-a="toggle" data-id="${t.id}">${t.done ? '✓' : ''}</button>
    <div style="flex:1"><div class="t">${esc(t.text)}${t.member ? `<span class="chip" style="background:${m.color}">${esc(m.name)}</span>` : ''}</div>
    ${t.due ? `<div class="s">Fällig: ${fmtDate(t.due)}</div>` : ''}</div>
    <button data-a="deltask" data-id="${t.id}" aria-label="Löschen">🗑️</button></div>`;
}

function calendarHTML() {
  const y = ui.month.getFullYear(), mo = ui.month.getMonth();
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, mo, 1 - offset + i), ds = FP.ymd(d);
    const evs = FP.eventsOn(S.events, ds);
    const cols = [...new Set(evs.map(e => memberOf(e.member).color))].slice(0, 4);
    cells += `<button class="day ${d.getMonth() !== mo ? 'other' : ''} ${ds === today() ? 'today' : ''} ${ds === ui.sel ? 'sel' : ''}" data-a="sel" data-d="${ds}">
      ${d.getDate()}<div class="dots">${cols.map(c => `<i class="dot" style="background:${c}"></i>`).join('')}</div></button>`;
  }
  const evs = FP.eventsOn(S.events, ui.sel);
  const tasks = S.tasks.filter(t => t.due === ui.sel);
  return `<div class="cal-head"><button class="icon-btn" data-a="prev">‹</button>
    <h1>${MONTHS[mo]} ${y}</h1><button class="icon-btn" data-a="next">›</button></div>
    <div class="grid">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>
    <h2>${rel(ui.sel)}${ui.sel === today() ? ' · ' + fmtDate(ui.sel) : ''}</h2>
    <div class="card">${evs.length || tasks.length ? evs.map(e => itemHTML(e, ui.sel)).join('') + tasks.map(taskHTML).join('') : '<div class="empty">Keine Einträge – mit ＋ hinzufügen</div>'}</div>`;
}

function agendaHTML() {
  let out = '', any = false;
  for (let i = 0; i < 30; i++) {
    const ds = FP.ymd(FP.addDays(new Date(), i));
    const evs = FP.eventsOn(S.events, ds), tasks = S.tasks.filter(t => t.due === ds && !t.done);
    if (!evs.length && !tasks.length) continue;
    any = true;
    out += `<h2>${rel(ds)}</h2><div class="card">${evs.map(e => itemHTML(e, ds)).join('')}${tasks.map(taskHTML).join('')}</div>`;
  }
  return any ? out : '<div class="card empty">Die nächsten 30 Tage sind frei 🎉</div>';
}

function listHTML() {
  const open = S.tasks.filter(t => !t.done), done = S.tasks.filter(t => t.done);
  return `<h2>Aufgaben &amp; Einkauf</h2>
    <div class="card"><div class="row"><input id="newTask" placeholder="Neuer Eintrag…" maxlength="120"><button class="btn primary" style="flex:none;padding:0 18px" data-a="addtask">＋</button></div>
    <div class="row"><div><label>Fällig am (optional, mit Erinnerung)</label><input type="date" id="newDue"></div>
    <div><label>Für</label><select id="newWho"><option value="">–</option>${S.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div></div></div>
    <div class="card">${open.length ? open.map(taskHTML).join('') : '<div class="empty">Alles erledigt ✨</div>'}</div>
    ${done.length ? `<h2>Erledigt</h2><div class="card">${done.map(taskHTML).join('')}</div><button class="btn" style="width:100%" data-a="cleardone">Erledigte löschen</button>` : ''}`;
}

function moreHTML() {
  const s = S.settings;
  return `<h2>Familie</h2><div class="card members">
      ${S.members.map(m => `<div class="item"><div class="bar" style="background:${m.color}"></div><div class="t" style="flex:1">${esc(m.name)}</div>
        ${S.members.length > 1 ? `<button data-a="delmember" data-id="${m.id}">🗑️</button>` : ''}</div>`).join('')}
      <div class="row" style="margin-top:8px"><input id="newMember" placeholder="Name hinzufügen" maxlength="30"><button class="btn primary" style="flex:none;padding:0 18px" data-a="addmember">＋</button></div></div>
    <h2>Wetter-Standort</h2><div class="card">
      <label><input type="checkbox" id="manual" ${s.manual ? 'checked' : ''}> Festen Ort statt GPS verwenden</label>
      <div class="row"><input id="city" placeholder="z. B. Köln" value="${esc(s.city)}"><button class="btn primary" style="flex:none;padding:0 18px" data-a="setcity">OK</button></div></div>
    <h2>Erinnerungen</h2><div class="card">
      <label>Standard für neue Termine</label>
      <select id="defRemind">${REMIND.map(([v, t]) => `<option value="${v}" ${s.remind === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="btns"><button class="btn" data-a="testnotify">🔔 Testmeldung</button></div></div>
    <h2>Daten</h2><div class="card">
      <div class="s" style="color:var(--muted);font-size:.85rem">Alle Daten liegen im internen App-Speicher deines Geräts.</div>
      <div class="btns"><button class="btn" data-a="export">Sicherung</button><button class="btn" data-a="import">Wiederherstellen</button></div></div>`;
}

function render() {
  const titles = { cal: '', agenda: '', list: '', more: '' };
  const tab = ui.tab;
  const main = tab === 'cal' ? calendarHTML() : tab === 'agenda' ? '<h2>Die nächsten Tage</h2>' + agendaHTML() : tab === 'list' ? listHTML() : moreHTML();
  const keep = $('main') ? $('main').scrollTop : 0;
  $('#app').innerHTML = `<header>${weatherHTML()}</header><main>${main}</main>
    ${tab === 'cal' || tab === 'agenda' ? '<button class="fab" data-a="add" aria-label="Termin hinzufügen">＋</button>' : ''}
    <nav>${[['cal', '📅', 'Kalender'], ['agenda', '🗒️', 'Agenda'], ['list', '✅', 'Listen'], ['more', '⚙️', 'Mehr']]
      .map(([k, i, t]) => `<button class="${tab === k ? 'on' : ''}" data-a="tab" data-t="${k}"><span>${i}</span>${t}</button>`).join('')}</nav>`;
  if ($('main')) $('main').scrollTop = keep;
}

/* ---------- Formular ---------- */
function openSheet(id) {
  const ev = id ? S.events.find(e => e.id === id) : null;
  const e = ev || { title: '', date: ui.sel, time: '09:00', allDay: false, member: S.members[0].id, repeat: 'none', remind: S.settings.remind, notes: '' };
  $('#sheet').innerHTML = `<div class="sheet-body"><h2 style="margin-top:0">${ev ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
    <label>Titel</label><input id="f_title" value="${esc(e.title)}" maxlength="100" placeholder="z. B. Elternabend">
    <div class="row"><div><label>Datum</label><input type="date" id="f_date" value="${e.date}"></div>
    <div><label>Uhrzeit</label><input type="time" id="f_time" value="${e.time || '09:00'}" ${e.allDay ? 'disabled' : ''}></div></div>
    <label><input type="checkbox" id="f_all" ${e.allDay ? 'checked' : ''}> Ganztägig</label>
    <div class="row"><div><label>Für</label><select id="f_member">${S.members.map(m => `<option value="${m.id}" ${m.id === e.member ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div><label>Wiederholung</label><select id="f_repeat">${Object.entries(REPEAT).map(([k, t]) => `<option value="${k}" ${k === e.repeat ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <label>Erinnerung</label><select id="f_remind">${REMIND.map(([v, t]) => `<option value="${v}" ${v === e.remind ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label>Notiz</label><textarea id="f_notes" rows="2" maxlength="300">${esc(e.notes)}</textarea>
    <div class="btns">${ev ? '<button class="btn danger" data-a="delevent" data-id="' + ev.id + '">Löschen</button>' : ''}
    <button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="saveevent" data-id="${ev ? ev.id : ''}">Speichern</button></div></div>`;
  $('#sheet').classList.remove('hidden');
  $('#f_all').onchange = () => { $('#f_time').disabled = $('#f_all').checked; };
}
const closeSheet = () => $('#sheet').classList.add('hidden');
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2600); }

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
  else if (a === 'saveevent') {
    const title = $('#f_title').value.trim(), date = $('#f_date').value;
    if (!title || !date) return toast('Titel und Datum werden benötigt');
    const data = { title, date, allDay: $('#f_all').checked, time: $('#f_time').value || '09:00', member: $('#f_member').value,
      repeat: $('#f_repeat').value, remind: Number($('#f_remind').value), notes: $('#f_notes').value.trim() };
    if (id) Object.assign(S.events.find(e => e.id === id), data); else S.events.push(Object.assign({ id: uid() }, data));
    ui.sel = date; closeSheet(); await save(); toast('Gespeichert');
  }
  else if (a === 'delevent') { S.events = S.events.filter(e => e.id !== id); closeSheet(); await save(); }
  else if (a === 'addtask') {
    const text = $('#newTask').value.trim(); if (!text) return;
    S.tasks.push({ id: uid(), text, done: false, due: $('#newDue').value || '', member: $('#newWho').value }); await save();
  }
  else if (a === 'toggle') { const t = S.tasks.find(t => t.id === id); t.done = !t.done; await save(); }
  else if (a === 'deltask') { S.tasks = S.tasks.filter(t => t.id !== id); await save(); }
  else if (a === 'cleardone') { S.tasks = S.tasks.filter(t => !t.done); await save(); }
  else if (a === 'addmember') {
    const name = $('#newMember').value.trim(); if (!name) return;
    S.members.push({ id: uid(), name, color: COLORS[S.members.length % COLORS.length] }); await save();
  }
  else if (a === 'delmember') { S.members = S.members.filter(m => m.id !== id); await save(); }
  else if (a === 'setcity') {
    S.settings.manual = $('#manual').checked; const q = $('#city').value.trim();
    if (S.settings.manual && q) {
      try {
        const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=de`)).json();
        if (!j.results || !j.results.length) return toast('Ort nicht gefunden');
        const r = j.results[0]; Object.assign(S.settings, { city: r.name, lat: r.latitude, lon: r.longitude });
      } catch (e) { return toast('Ortssuche nicht erreichbar'); }
    }
    S.weather = null; await persist(); render(); fetchWeather(true);
  }
  else if (a === 'testnotify') scheduleNotifications(true);
  else if (a === 'export') doExport();
  else if (a === 'import') $('#importFile').click();
});
document.addEventListener('change', async ev => {
  if (ev.target.id === 'defRemind') { S.settings.remind = Number(ev.target.value); await persist(); }
});
$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!Array.isArray(j.events) || !Array.isArray(j.members)) throw new Error('format');
    S = Object.assign(defaultState(), j); await save(); toast('Wiederhergestellt');
  } catch (e) { toast('Datei ungültig'); }
  ev.target.value = '';
});
$('#sheet').addEventListener('click', ev => { if (ev.target.id === 'sheet') closeSheet(); });

/* ---------- Start ---------- */
(async function init() {
  const saved = await load();
  if (saved) S = Object.assign(defaultState(), saved, { settings: Object.assign(defaultState().settings, saved.settings) });
  render();
  scheduleNotifications();
  fetchWeather(false);
})();

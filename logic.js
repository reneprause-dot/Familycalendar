/* Reine Logik ohne DOM: Wiederholungen, Geburtstage, Erinnerungen, Schnelleingabe, ICS, Konflikte, Ämtchen. */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const REMIND_NONE = -1, REMIND_EVE = -2; /* -2 = am Vorabend um 18 Uhr */

  /* Personen eines Termins (leer = für alle). Alte Daten hatten nur "member". */
  const memberIds = ev => Array.isArray(ev.members) ? ev.members : (ev.member ? [ev.member] : []);

  /* Geburtstage der Profile als jährlich wiederkehrende Ganztagstermine. */
  function birthdayEvents(members) {
    return members.filter(m => m.birthday).map(m => ({
      id: 'bd-' + m.id, title: m.name, name: m.name, date: m.birthday, time: '', allDay: true,
      repeat: 'yearly', remind: 0, members: [m.id], notes: '', gifts: m.gifts || '', birthday: true, virtual: true
    }));
  }
  const withBirthdays = (events, members) => events.concat(birthdayEvents(members));

  function displayTitle(ev, ds) {
    if (!ev.birthday) return ev.title;
    const by = Number(ev.date.slice(0, 4)), age = Number(ds.slice(0, 4)) - by;
    return by > 1900 && age > 0 ? `🎂 ${ev.name} wird ${age}` : `🎂 ${ev.name} hat Geburtstag`;
  }

  function occursOn(ev, ds) {
    if (ds < ev.date) return false;
    const rep = ev.repeat || 'none';
    if (rep === 'none') return ds === ev.date;
    if (ev.until && ds > ev.until) return false;
    const s = parse(ev.date), d = parse(ds);
    if (rep === 'daily') return true;
    if (rep === 'weekly') return Math.round((d - s) / 864e5) % 7 === 0;
    if (rep === 'monthly') return d.getDate() === s.getDate();
    if (rep === 'yearly') return d.getDate() === s.getDate() && d.getMonth() === s.getMonth();
    return false;
  }

  function eventsOn(events, ds) {
    return events
      .filter(e => occursOn(e, ds))
      .sort((a, b) => (a.allDay ? '' : a.time || '').localeCompare(b.allDay ? '' : b.time || '') || a.title.localeCompare(b.title));
  }

  function startOf(ev, ds) {
    const [h, m] = ev.allDay || !ev.time ? [9, 0] : ev.time.split(':').map(Number);
    const d = parse(ds);
    d.setHours(h, m, 0, 0);
    return d;
  }

  /* Nächste Erinnerungen (nach Zeit sortiert, begrenzt). events bitte inkl. Geburtstage übergeben. */
  function buildNotifications(events, tasks, members, now, opts) {
    const o = Object.assign({ limit: 60, horizonDays: 90 }, opts || {});
    const byId = id => members.find(m => m.id === id) || {};
    const mName = id => byId(id).name || '';
    const silent = ev => { const ids = memberIds(ev); return ids.length > 0 && ids.every(id => byId(id).notify === false); };
    const out = [];
    for (let i = 0; i <= o.horizonDays; i++) {
      const ds = ymd(addDays(now, i));
      for (const ev of events) {
        if (ev.remind == null || ev.remind === REMIND_NONE || silent(ev)) continue;
        if (occursOn(ev, ds)) {
          const start = startOf(ev, ds);
          let at;
          if (ev.remind === REMIND_EVE) { at = parse(ds); at.setDate(at.getDate() - 1); at.setHours(18, 0, 0, 0); }
          else at = ev.allDay ? start : new Date(start.getTime() - ev.remind * 60000);
          if (at > now) {
            const ids = memberIds(ev);
            const body = ev.birthday
              ? 'Heute wird gefeiert 🎉'
              : [ev.remind === REMIND_EVE ? 'Morgen' : '', ev.allDay ? 'Ganztägig' : ev.time, ids.map(mName).filter(Boolean).join(', '),
                ev.bring ? '🚗 bringt ' + mName(ev.bring) : '', ev.pick ? 'holt ' + mName(ev.pick) : '', ev.notes].filter(Boolean).join(' · ');
            out.push({ key: ev.id + '@' + ds, at, title: displayTitle(ev, ds), body });
          }
        }
        /* Eine Woche vor dem Geburtstag: Erinnerung an die Geschenkideen */
        if (ev.birthday && ev.gifts) {
          const ds7 = ymd(addDays(parse(ds), 7));
          if (occursOn(ev, ds7)) {
            const at = parse(ds); at.setHours(9, 0, 0, 0);
            if (at > now) out.push({ key: ev.id + '#gift@' + ds, at, title: '🎁 In 7 Tagen: ' + displayTitle(ev, ds7).replace('🎂 ', ''), body: 'Geschenkideen: ' + ev.gifts });
          }
        }
      }
      for (const t of tasks || []) {
        if (t.done || t.due !== ds) continue;
        const at = parse(ds); at.setHours(8, 0, 0, 0);
        if (at <= now) continue;
        out.push({ key: t.id + '@' + ds, at, title: 'Fällig: ' + t.text, body: mName(t.member) });
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out.slice(0, o.limit);
  }

  /* Suchvarianten für die Ortssuche: "50667 Köln", "Köln, Deutschland", "Köln (Rhein)" … */
  function placeCandidates(q) {
    const raw = String(q || '').trim();
    if (!raw) return [];
    const out = [];
    const add = s => { s = String(s).replace(/\s+/g, ' ').trim(); if (s && !out.includes(s)) out.push(s); };
    const plz = raw.match(/\b\d{5}\b/);
    const noPlz = s => s.replace(/\b\d{5}\b/g, '');
    const parts = raw.split(/[,;\/]/);
    add(raw);
    add(noPlz(parts[0]));
    add(raw.replace(/\(.*?\)/g, ''));
    parts.forEach(p => add(noPlz(p)));
    if (plz) add(plz[0]);
    return out;
  }

  /* ---------- Schnelleingabe: "Freitag 16 Uhr Zahnarzt Lena" ---------- */
  const WD = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6, sonntag: 0 };
  const WD_RE = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag';
  const MON_RE = 'jan(?:uar)?|feb(?:ruar)?|mär(?:z)?|maer(?:z)?|apr(?:il)?|mai|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|dez(?:ember)?';
  const monthIndex = w => {
    w = w.toLowerCase();
    if (w.startsWith('mär') || w.startsWith('mae')) return 2;
    return { jan: 0, feb: 1, apr: 3, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dez: 11 }[w.slice(0, 3)];
  };
  const validDate = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d; };

  function parseQuick(input, members, now) {
    now = now || new Date();
    let s = String(input || '').trim();
    const res = { title: '', date: null, time: '', allDay: false, members: [], repeat: 'none' };
    const B = '(^|\\s)', E = '(?=\\s|$|[.,;!?])';
    const rx = p => new RegExp(B + p + E, 'i');
    const grab = re => { const m = s.match(re); if (m) s = s.replace(re, ' '); return m; };
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWd = (wd, strict) => { let n = (wd - today.getDay() + 7) % 7; if (n === 0 && strict) n = 7; return addDays(today, n); };
    let m;

    if ((m = grab(rx('(?:jeden|jede|jeder)\\s+(' + WD_RE + ')')))) { res.repeat = 'weekly'; res.date = ymd(nextWd(WD[m[2].toLowerCase()], false)); }
    else if (grab(rx('(?:täglich|jeden\\s+tag)'))) res.repeat = 'daily';
    else if (grab(rx('(?:wöchentlich|jede\\s+woche)'))) res.repeat = 'weekly';
    else if (grab(rx('(?:monatlich|jeden\\s+monat)'))) res.repeat = 'monthly';
    else if (grab(rx('(?:jährlich|jedes\\s+jahr)'))) res.repeat = 'yearly';
    if (grab(rx('(?:ganztägig|ganztags|den\\s+ganzen\\s+tag)'))) res.allDay = true;

    if (!res.date) {
      if (grab(rx('übermorgen'))) res.date = ymd(addDays(today, 2));
      else if (grab(rx('morgen'))) res.date = ymd(addDays(today, 1));
      else if (grab(rx('heute'))) res.date = ymd(today);
    }
    if (!res.date && (m = grab(rx('(?:am\\s+|nächsten\\s+|nächste\\s+|kommenden\\s+)?(' + WD_RE + ')')))) res.date = ymd(nextWd(WD[m[2].toLowerCase()], true));

    let t = null;
    if ((m = grab(rx('(?:um\\s+|ab\\s+|gegen\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*uhr')))) t = [+m[2], m[3] ? +m[3] : 0];
    else if ((m = grab(rx('(?:um\\s+|ab\\s+|gegen\\s+)?(\\d{1,2}):(\\d{2})')))) t = [+m[2], +m[3]];
    if (t && t[0] <= 23 && t[1] <= 59) res.time = pad(t[0]) + ':' + pad(t[1]);

    if (!res.date) {
      const num = new RegExp(B + '(?:am\\s+|den\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{2,4})?' + E, 'i');
      const nm = new RegExp(B + '(?:am\\s+|den\\s+)?(\\d{1,2})\\.?\\s*(' + MON_RE + ')\\.?(\\d{2,4})?' + E, 'i');
      let day, mon, yr;
      if ((m = s.match(num)) && +m[2] >= 1 && +m[3] <= 12 && +m[2] <= 31) { day = +m[2]; mon = +m[3] - 1; yr = m[4]; s = s.replace(num, ' '); }
      else if ((m = s.match(nm))) { day = +m[2]; mon = monthIndex(m[3]); yr = m[4]; s = s.replace(nm, ' '); }
      if (day) {
        let y = yr ? (yr.length === 2 ? 2000 + +yr : +yr) : today.getFullYear();
        if (validDate(y, mon, day)) {
          if (!yr && new Date(y, mon, day) < today) y += 1;
          res.date = ymd(new Date(y, mon, day));
        }
      }
    }

    const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const mem of members || []) {
      const name = (mem.name || '').trim();
      if (!name) continue;
      const re = new RegExp(B + escRe(name) + '(?:s)?' + E, 'i');
      if (re.test(s)) { res.members.push(mem.id); s = s.replace(re, ' '); }
    }

    const FILL = new Set(['am', 'um', 'den', 'ab', 'gegen', 'für', 'mit', 'bei', 'jeden', 'jede', 'nächsten', 'nächste', 'kommenden', 'und']);
    const words = s.replace(/^[,;:.\s-]+|[,;:\s-]+$/g, ' ').split(/\s+/).filter(Boolean);
    while (words.length && FILL.has(words[0].toLowerCase())) words.shift();
    while (words.length && FILL.has(words[words.length - 1].toLowerCase())) words.pop();
    res.title = words.join(' ');
    if (res.title) res.title = res.title[0].toUpperCase() + res.title.slice(1);

    if (!res.date && res.time) {
      const nowHM = pad(now.getHours()) + ':' + pad(now.getMinutes());
      res.date = ymd(res.time > nowHM ? today : addDays(today, 1));
    }
    return res;
  }

  /* ---------- Konflikte ---------- */
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const shares = (a, b) => { const A = memberIds(a), B = memberIds(b); return !A.length || !B.length || A.some(x => B.includes(x)); };
  /* Überschneidungen eines (neuen) Termins am Tag ds; leere Personenliste = alle */
  function findConflicts(events, cand, ds) {
    if (cand.allDay || !cand.time) return [];
    const s = toMin(cand.time), e = s + (Number(cand.dur) || 60);
    return events.filter(ev => ev.id !== cand.id && !ev.allDay && !ev.virtual && ev.time && occursOn(ev, ds) && shares(ev, cand))
      .filter(ev => { const s2 = toMin(ev.time), e2 = s2 + (Number(ev.dur) || 60); return s < e2 && s2 < e; });
  }
  function conflictReport(events, cand, maxDates) {
    const out = [];
    const last = cand.repeat && cand.repeat !== 'none' ? 60 : 0;
    for (let i = 0; i <= last && out.length < (maxDates || 5); i++) {
      const ds = ymd(addDays(parse(cand.date), i));
      if (!occursOn(cand, ds)) continue;
      const hit = findConflicts(events, cand, ds);
      if (hit.length) out.push({ date: ds, events: hit });
    }
    return out;
  }

  /* ---------- Ämtchen, Sterne, Schulplan ---------- */
  const weekStart = ds => { const d = parse(ds); return ymd(addDays(d, -((d.getDay() + 6) % 7))); };
  /* Ist das Ämtchen noch zu erledigen? (täglich: heute, wöchentlich: diese Woche, einmalig: nie erledigt) */
  function choreOpen(c, ds) {
    if (!c.lastDone) return true;
    if (c.repeat === 'daily') return c.lastDone !== ds;
    if (c.repeat === 'weekly') return c.lastDone < weekStart(ds);
    return false;
  }
  /* Anzeigen, solange offen oder in der laufenden Periode erledigt */
  function choreVisible(c, ds) {
    if (choreOpen(c, ds)) return true;
    if (c.repeat === 'weekly') return c.lastDone >= weekStart(ds);
    return c.lastDone === ds;
  }
  const starsThisWeek = (log, memberId, ds) => { const ws = weekStart(ds); return (log || []).filter(l => l.member === memberId && l.date >= ws).reduce((a, l) => a + l.n, 0); };

  const WKEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const splitList = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const planFor = (member, ds) => ((member.plan || {})[WKEYS[parse(ds).getDay()]]) || {};
  const subjectsFor = (member, ds) => splitList(planFor(member, ds).subjects);
  const bringFor = (member, ds) => splitList(planFor(member, ds).bring);

  const daysUntil = (ds, now) => dayDiff(ymd(now || new Date()), ds);
  /* Geburtstage in den nächsten n Tagen */
  function birthdaysSoon(members, now, days) {
    const t = ymd(now), out = [];
    for (const m of members) {
      if (!m.birthday) continue;
      const by = Number(m.birthday.slice(0, 4));
      let y = now.getFullYear(), ds = y + m.birthday.slice(4);
      if (ds < t) { y += 1; ds = y + m.birthday.slice(4); }
      const inDays = dayDiff(t, ds);
      if (inDays <= days) out.push({ member: m, date: ds, inDays, age: by > 1900 ? y - by : null });
    }
    return out.sort((a, b) => a.inDays - b.inDays);
  }

  /* ---------- ICS-Import (z. B. Müllkalender) ---------- */
  function unescapeICS(s) { return String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim(); }
  function icsDate(val, params) {
    const m = String(val).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    if (m[4] === undefined) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '', allDay: true };
    let d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (m[7]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), allDay: false };
  }
  function parseRRule(v) {
    const r = {};
    String(v).split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) r[p.slice(0, i).toUpperCase()] = p.slice(i + 1); });
    const days = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    return {
      freq: r.FREQ, interval: Number(r.INTERVAL) || 1, count: Number(r.COUNT) || 0,
      until: r.UNTIL ? (icsDate(r.UNTIL.slice(0, 8)) || {}).date || '' : '',
      byday: r.BYDAY ? r.BYDAY.split(',').map(x => days[x.slice(-2)]).filter(x => x !== undefined) : []
    };
  }
  function expandRRule(start, rule, exdates, from, to, max) {
    const out = [], s = parse(start), end = parse(to), interval = rule.interval || 1;
    const wdSet = rule.byday.length ? rule.byday : [s.getDay()];
    const monday0 = addDays(s, -((s.getDay() + 6) % 7));
    let matched = 0;
    for (let d = new Date(s), i = 0; d <= end && i < 3660; d = addDays(d, 1), i++) {
      const ds = ymd(d);
      if (rule.until && ds > rule.until) break;
      let ok = false;
      if (rule.freq === 'DAILY') ok = Math.round((d - s) / 864e5) % interval === 0;
      else if (rule.freq === 'WEEKLY') ok = Math.floor(Math.round((d - monday0) / 864e5) / 7) % interval === 0 && wdSet.includes(d.getDay());
      else if (rule.freq === 'MONTHLY') ok = ((d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth()) % interval === 0 && d.getDate() === s.getDate();
      else if (rule.freq === 'YEARLY') ok = (d.getFullYear() - s.getFullYear()) % interval === 0 && d.getMonth() === s.getMonth() && d.getDate() === s.getDate();
      if (!ok) continue;
      matched++;
      if (rule.count && matched > rule.count) break;
      if (ds >= from && !(exdates || []).includes(ds)) { out.push(ds); if (out.length >= max) break; }
    }
    return out;
  }
  /* Ergebnis: [{title,date,time,allDay,notes,repeat,until}] – vergangene Einzeltermine werden übersprungen */
  function parseICS(text, opts) {
    const now = (opts && opts.now) || new Date(), from = ymd(now), horizon = ymd(addDays(now, 400));
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const raw = []; let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') cur = {};
      else if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; }
      else if (cur) {
        const i = line.indexOf(':'); if (i < 0) continue;
        const key = line.slice(0, i), name = key.split(';')[0].toUpperCase();
        (cur[name] = cur[name] || []).push({ val: line.slice(i + 1), params: key.slice(name.length) });
      }
    }
    const out = [];
    for (const e of raw) {
      const st = e.DTSTART && icsDate(e.DTSTART[0].val.trim(), e.DTSTART[0].params);
      if (!st) continue;
      const base = { title: unescapeICS(e.SUMMARY && e.SUMMARY[0].val) || 'Termin', time: st.time, allDay: st.allDay, notes: unescapeICS(e.DESCRIPTION && e.DESCRIPTION[0].val).slice(0, 300) };
      if (!e.RRULE) { if (st.date >= from) out.push(Object.assign(base, { date: st.date, repeat: 'none' })); continue; }
      const rule = parseRRule(e.RRULE[0].val);
      const ex = (e.EXDATE || []).flatMap(x => x.val.split(',')).map(v => (icsDate(v.trim()) || {}).date).filter(Boolean);
      const simple = rule.interval === 1 && !rule.count && !ex.length && ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq)
        && (!rule.byday.length || (rule.freq === 'WEEKLY' && rule.byday.length === 1 && rule.byday[0] === parse(st.date).getDay()));
      if (simple) { out.push(Object.assign(base, { date: st.date, repeat: rule.freq.toLowerCase(), until: rule.until || '' })); continue; }
      expandRRule(st.date, rule, ex, from, horizon, 120).forEach(ds => out.push(Object.assign({}, base, { date: ds, repeat: 'none' })));
    }
    return out;
  }

  /** Tag wie "v12" -> 12; sonst NaN. */
  function buildOf(tag) { const m = /(\d+)\s*$/.exec(String(tag == null ? '' : tag)); return m ? parseInt(m[1], 10) : NaN; }
  /** true, wenn der Release-Tag neuer ist als die installierte Build-Nummer. */
  function isNewer(installed, tag) { const a = Number(installed), b = buildOf(tag); return isFinite(a) && isFinite(b) && b > a; }

  const api = {
    buildOf, isNewer, pad, ymd, parse, addDays, dayDiff, memberIds, birthdayEvents, withBirthdays, displayTitle, occursOn, eventsOn, buildNotifications,
    placeCandidates, parseQuick, findConflicts, conflictReport, weekStart, choreOpen, choreVisible, starsThisWeek, WKEYS, splitList,
    planFor, subjectsFor, bringFor, daysUntil, birthdaysSoon, parseICS, REMIND_NONE, REMIND_EVE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FP = api;
})(typeof window !== 'undefined' ? window : globalThis);

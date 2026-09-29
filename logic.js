/* Reine Logik ohne DOM: Wiederholungen, Tagesansicht, Geburtstage, Erinnerungen, Ortsnamen. */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

  /* Personen eines Termins (leer = für alle). Alte Daten hatten nur "member". */
  const memberIds = ev => Array.isArray(ev.members) ? ev.members : (ev.member ? [ev.member] : []);

  /* Geburtstage der Profile als jährlich wiederkehrende Ganztagstermine. */
  function birthdayEvents(members) {
    return members.filter(m => m.birthday).map(m => ({
      id: 'bd-' + m.id, title: m.name, name: m.name, date: m.birthday, time: '', allDay: true,
      repeat: 'yearly', remind: 0, members: [m.id], notes: '', birthday: true, virtual: true
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
    const out = [];
    for (let i = 0; i <= o.horizonDays; i++) {
      const ds = ymd(addDays(now, i));
      for (const ev of events) {
        if (ev.remind == null || ev.remind < 0 || !occursOn(ev, ds)) continue;
        const ids = memberIds(ev);
        if (ids.length && ids.every(id => byId(id).notify === false)) continue;
        const start = startOf(ev, ds);
        const at = ev.allDay ? start : new Date(start.getTime() - ev.remind * 60000);
        if (at <= now) continue;
        const body = ev.birthday
          ? 'Heute wird gefeiert 🎉'
          : [ev.allDay ? 'Ganztägig' : ev.time, ids.map(mName).filter(Boolean).join(', '), ev.notes].filter(Boolean).join(' · ');
        out.push({ key: ev.id + '@' + ds, at, title: displayTitle(ev, ds), body });
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

  const api = { pad, ymd, parse, addDays, memberIds, birthdayEvents, withBirthdays, displayTitle, occursOn, eventsOn, buildNotifications, placeCandidates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FP = api;
})(typeof window !== 'undefined' ? window : globalThis);

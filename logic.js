/* Reine Logik ohne DOM: Wiederholungen, Tagesansicht, Erinnerungen. */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

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

  /* Liefert die nächsten Erinnerungen (nach Zeit sortiert, begrenzt). */
  function buildNotifications(events, tasks, members, now, opts) {
    const o = Object.assign({ limit: 60, horizonDays: 90 }, opts || {});
    const mName = id => (members.find(m => m.id === id) || {}).name || '';
    const out = [];
    for (let i = 0; i <= o.horizonDays; i++) {
      const ds = ymd(addDays(now, i));
      for (const ev of events) {
        if (ev.remind == null || ev.remind < 0 || !occursOn(ev, ds)) continue;
        const start = startOf(ev, ds);
        const at = ev.allDay ? start : new Date(start.getTime() - ev.remind * 60000);
        if (at <= now) continue;
        const who = mName(ev.member);
        const when = ev.allDay ? 'Ganztägig' : ev.time;
        out.push({ key: ev.id + '@' + ds, at, title: ev.title, body: [when, who, ev.notes].filter(Boolean).join(' · ') });
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

  const api = { pad, ymd, parse, addDays, occursOn, eventsOn, buildNotifications };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FP = api;
})(typeof window !== 'undefined' ? window : globalThis);

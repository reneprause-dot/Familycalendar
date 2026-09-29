const assert = require('assert');
const FP = require('./logic.js');

const ev = (o) => Object.assign({ id: 'e', title: 'T', date: '2026-10-01', time: '10:00', allDay: false, repeat: 'none', remind: 30, member: 'm1' }, o);

// Wiederholungen
assert(FP.occursOn(ev({}), '2026-10-01'));
assert(!FP.occursOn(ev({}), '2026-10-02'));
assert(!FP.occursOn(ev({ repeat: 'weekly' }), '2026-09-24'), 'nicht vor Startdatum');
assert(FP.occursOn(ev({ repeat: 'weekly' }), '2026-10-29'), 'wöchentlich ueber Zeitumstellung (25.10.)');
assert(!FP.occursOn(ev({ repeat: 'weekly' }), '2026-10-28'));
assert(FP.occursOn(ev({ repeat: 'monthly' }), '2026-12-01'));
assert(FP.occursOn(ev({ repeat: 'yearly' }), '2030-10-01'));
assert(!FP.occursOn(ev({ repeat: 'yearly' }), '2030-10-02'));
assert(!FP.occursOn(ev({ repeat: 'daily', until: '2026-10-05' }), '2026-10-06'));

// Sortierung
const list = FP.eventsOn([ev({ id: 'a', time: '12:00' }), ev({ id: 'b', time: '08:00' }), ev({ id: 'c', allDay: true })], '2026-10-01');
assert.deepStrictEqual(list.map(x => x.id), ['c', 'b', 'a']);

// Erinnerungen
const members = [{ id: 'm1', name: 'Mama' }];
const now = new Date(2026, 8, 29, 11, 0);
const n = FP.buildNotifications([ev({ remind: 30 })], [], members, now);
assert.strictEqual(n.length, 1);
assert.strictEqual(n[0].at.getHours(), 9);
assert.strictEqual(n[0].at.getMinutes(), 30);
assert(n[0].body.includes('Mama'));

// Vergangene Erinnerungen entfallen, deaktivierte auch
assert.strictEqual(FP.buildNotifications([ev({ date: '2026-09-01' })], [], members, now).length, 0);
assert.strictEqual(FP.buildNotifications([ev({ remind: -1 })], [], members, now).length, 0);

// Ganztägig: 09:00 am Tag selbst
const ad = FP.buildNotifications([ev({ allDay: true })], [], members, now);
assert.strictEqual(ad[0].at.getHours(), 9);

// Aufgaben: 08:00 am Fälligkeitstag, erledigte nicht
const tk = FP.buildNotifications([], [{ id: 't1', text: 'Müll', due: '2026-10-02', done: false }, { id: 't2', text: 'x', due: '2026-10-02', done: true }], members, now);
assert.strictEqual(tk.length, 1);
assert.strictEqual(tk[0].at.getHours(), 8);

// Limit und Sortierung
const many = FP.buildNotifications([ev({ repeat: 'daily' })], [], members, now, { limit: 10 });
assert.strictEqual(many.length, 10);
for (let i = 1; i < many.length; i++) assert(many[i].at > many[i - 1].at);

console.log('Alle Logik-Tests bestanden');

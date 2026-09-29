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

// Mehrere Personen / alte Daten
assert.deepStrictEqual(FP.memberIds({ member: 'a' }), ['a']);
assert.deepStrictEqual(FP.memberIds({ members: ['a', 'b'] }), ['a', 'b']);
assert.deepStrictEqual(FP.memberIds({}), []);

// Geburtstage: jährlich, mit Alter, Jahr 1900 = unbekannt
const kids = [{ id: 'k', name: 'Lena', birthday: '2019-10-02', notify: true }, { id: 'o', name: 'Oma', birthday: '1900-10-03', notify: true }];
const all = FP.withBirthdays([], kids);
assert.strictEqual(FP.displayTitle(all[0], '2026-10-02'), '🎂 Lena wird 7');
assert.strictEqual(FP.displayTitle(all[1], '2026-10-03'), '🎂 Oma hat Geburtstag');
assert.strictEqual(FP.eventsOn(all, '2026-10-02').length, 1);
assert.strictEqual(FP.eventsOn(all, '2018-10-02').length, 0, 'nicht vor Geburt');
const bn = FP.buildNotifications(all, [], kids, now);
assert.strictEqual(bn[0].title, '🎂 Lena wird 7');
assert.strictEqual(bn[0].at.getHours(), 9);

// Erinnerungen pro Person abschaltbar
const quiet = [{ id: 'k', name: 'Lena', notify: false }];
assert.strictEqual(FP.buildNotifications([ev({ members: ['k'] })], [], quiet, now).length, 0);
assert.strictEqual(FP.buildNotifications([ev({ members: [] })], [], quiet, now).length, 1, 'ohne Person = für alle');

// Ortssuche: Zusätze und Postleitzahl
assert.deepStrictEqual(FP.placeCandidates('Köln'), ['Köln']);
assert(FP.placeCandidates('Köln, Deutschland').includes('Köln'));
assert(FP.placeCandidates('50667 Köln').includes('Köln'));
assert(FP.placeCandidates('50667 Köln').includes('50667'));
assert(FP.placeCandidates('Neuss (Rhein)').includes('Neuss'));
assert.deepStrictEqual(FP.placeCandidates('  '), []);

// ---------- Schnelleingabe ----------
const mem = [{ id: 'k', name: 'Lena' }, { id: 'p', name: 'Papa' }];
const q = t => FP.parseQuick(t, mem, now); // now = Di 29.09.2026 11:00
let r = q('Freitag 16 Uhr Zahnarzt Lena');
assert.deepStrictEqual([r.date, r.time, r.title, r.members], ['2026-10-02', '16:00', 'Zahnarzt', ['k']]);
r = q('morgen 8:30 Elternabend'); assert.deepStrictEqual([r.date, r.time, r.title], ['2026-09-30', '08:30', 'Elternabend']);
assert.strictEqual(q('Übermorgen Schwimmen').date, '2026-10-01');
assert.strictEqual(q('am 5. Oktober Kinoabend').date, '2026-10-05');
assert.strictEqual(q('am 5. Oktober Kinoabend').title, 'Kinoabend');
r = q('15.10. Zahnarzt Papa'); assert.deepStrictEqual([r.date, r.title, r.members], ['2026-10-15', 'Zahnarzt', ['p']]);
assert.strictEqual(q('3.3. Geburtstag Oma').date, '2027-03-03', 'vergangenes Datum -> nächstes Jahr');
r = q('jeden Montag 17 Uhr Training'); assert.deepStrictEqual([r.repeat, r.date, r.time, r.title], ['weekly', '2026-10-05', '17:00', 'Training']);
assert.strictEqual(q('Zahnarzt um 9 Uhr').date, '2026-09-30', 'Uhrzeit vorbei -> morgen');
assert.strictEqual(q('Zahnarzt um 15 Uhr').date, '2026-09-29', 'Uhrzeit kommt noch -> heute');
assert.strictEqual(q('ganztägig Ausflug Freitag').allDay, true);
r = q('für Lena Arzt'); assert.deepStrictEqual([r.title, r.members], ['Arzt', ['k']]);
assert.strictEqual(q('16.30 Uhr Chor').time, '16:30');
assert.strictEqual(q('Schwimmen').date, null, 'ohne Datum bleibt es offen');
assert.strictEqual(q('   ').title, '');

// ---------- Konflikte ----------
const A = { id: 'a', title: 'A', date: '2026-10-05', time: '10:00', dur: 60, members: ['k'], repeat: 'none' };
const cf = (c) => FP.findConflicts([A], Object.assign({ id: 'n', date: '2026-10-05', dur: 60, repeat: 'none' }, c), '2026-10-05').length;
assert.strictEqual(cf({ time: '10:30', members: ['k'] }), 1);
assert.strictEqual(cf({ time: '10:30', members: ['p'] }), 0, 'andere Person');
assert.strictEqual(cf({ time: '10:30', members: [] }), 1, 'für alle');
assert.strictEqual(cf({ time: '11:00', members: ['k'] }), 0, 'direkt danach ist ok');
assert.strictEqual(cf({ time: '09:30', members: ['k'], dur: 30 }), 0);
assert.strictEqual(cf({ time: '09:30', members: ['k'], dur: 60 }), 1);
assert.strictEqual(cf({ time: '', allDay: true, members: ['k'] }), 0);
const rep = FP.conflictReport([A], { id: 'w', title: 'W', date: '2026-09-28', time: '10:15', dur: 60, members: ['k'], repeat: 'weekly' });
assert.strictEqual(rep.length, 1); assert.strictEqual(rep[0].date, '2026-10-05');

// ---------- Ämtchen, Sterne, Schulplan ----------
assert(FP.choreOpen({ repeat: 'daily', lastDone: '2026-09-28' }, '2026-09-29'));
assert(!FP.choreOpen({ repeat: 'daily', lastDone: '2026-09-29' }, '2026-09-29'));
assert(!FP.choreOpen({ repeat: 'weekly', lastDone: '2026-09-28' }, '2026-09-29'), 'Woche beginnt Montag');
assert(FP.choreOpen({ repeat: 'weekly', lastDone: '2026-09-28' }, '2026-10-05'));
assert(!FP.choreOpen({ repeat: 'once', lastDone: '2026-09-01' }, '2026-09-29'));
assert(FP.choreVisible({ repeat: 'once', lastDone: '2026-09-29' }, '2026-09-29') && !FP.choreVisible({ repeat: 'once', lastDone: '2026-09-28' }, '2026-09-29'));
const log = [{ member: 'k', date: '2026-09-27', n: 5 }, { member: 'k', date: '2026-09-28', n: 2 }, { member: 'k', date: '2026-09-29', n: 3 }, { member: 'p', date: '2026-09-29', n: 9 }];
assert.strictEqual(FP.starsThisWeek(log, 'k', '2026-09-29'), 5, 'Sonntag zählt zur Vorwoche');
const kid = { plan: { tue: { subjects: 'Mathe, Deutsch', bring: 'Sportbeutel, Flöte' } } };
assert.deepStrictEqual(FP.bringFor(kid, '2026-09-29'), ['Sportbeutel', 'Flöte']);
assert.deepStrictEqual(FP.subjectsFor(kid, '2026-09-29'), ['Mathe', 'Deutsch']);
assert.deepStrictEqual(FP.bringFor(kid, '2026-09-30'), []);

// ---------- Countdown, Geburtstage bald ----------
assert.strictEqual(FP.daysUntil('2026-10-11', now), 12);
assert.strictEqual(FP.daysUntil('2026-09-29', now), 0);
const soon = FP.birthdaysSoon([{ id: 'a', name: 'A', birthday: '2019-10-05' }, { id: 'b', name: 'B', birthday: '2019-09-01' }, { id: 'c', name: 'C', birthday: '1900-09-30' }], now, 30);
assert.deepStrictEqual(soon.map(x => [x.member.id, x.inDays, x.age]), [['c', 1, null], ['a', 6, 7]]);

// ---------- Vorabend- und Geschenk-Erinnerung, Fahrdienst ----------
const eve = FP.buildNotifications([ev({ allDay: true, date: '2026-10-02', remind: -2 })], [], members, now);
assert.strictEqual(eve.length, 1);
assert.deepStrictEqual([eve[0].at.getDate(), eve[0].at.getHours()], [1, 18]);
assert(eve[0].body.includes('Morgen'));
const gift = FP.withBirthdays([], [{ id: 'k', name: 'Lena', birthday: '2019-10-08', gifts: 'Puzzle', notify: true }]);
const gn = FP.buildNotifications(gift, [], [{ id: 'k', name: 'Lena', notify: true }], now);
assert(gn.some(n => n.title === '🎁 In 7 Tagen: Lena wird 7' && n.body.includes('Puzzle') && n.at.getDate() === 1 && n.at.getHours() === 9), 'Geschenk-Erinnerung fehlt');
const drive = FP.buildNotifications([ev({ bring: 'm1', pick: 'm1' })], [], members, now);
assert(drive[0].body.includes('bringt Mama') && drive[0].body.includes('holt Mama'));

// ---------- ICS-Import ----------
const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261007', 'SUMMARY:Restmüll', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260901', 'SUMMARY:Vergangen', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261001', 'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3', 'SUMMARY:Biotonne\\, gelb', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261003T093000', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Chor', 'DESCRIPTION:Probe\\nBitte', '  pünktlich', 'END:VEVENT',
  'END:VCALENDAR'].join('\r\n');
const imp = FP.parseICS(ics, { now });
assert.strictEqual(imp.length, 5, 'Anzahl importierter Termine: ' + imp.length);
assert.deepStrictEqual(imp.filter(e => e.title === 'Biotonne, gelb').map(e => e.date), ['2026-10-01', '2026-10-15', '2026-10-29']);
const chor = imp.find(e => e.title === 'Chor');
assert.deepStrictEqual([chor.date, chor.time, chor.repeat, chor.allDay], ['2026-10-03', '09:30', 'weekly', false]);
assert(chor.notes.includes('Bitte pünktlich'), 'gefaltete Zeile');
assert(imp.find(e => e.title === 'Restmüll').allDay);

console.log('Alle Logik-Tests bestanden');

assert.strictEqual(FP.buildOf('v12'), 12);
assert(isNaN(FP.buildOf('abc')));
assert(FP.isNewer(11, 'v12') && !FP.isNewer(12, 'v12') && !FP.isNewer(13, 'v12') && !FP.isNewer('x', 'v12') && !FP.isNewer(5, 'foo'));
console.log('update-vergleich ok');

// Rauchtest: rendert alle Tabs gegen eine minimale DOM-Attrappe und prüft auf Laufzeitfehler.
const vm = require('vm'), fs = require('fs');
const els = {};
const mk = (id) => els[id] || (els[id] = { id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, click() {}, value: '', style: {}, scrollTop: 0 });
const store = {};
const ctx = {
  console, setTimeout, clearTimeout, Date, Math, JSON, Promise, Array, Object, Set, Number, String,
  fetch: async () => { throw new Error('offline'); },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  navigator: {}, URL: {}, Blob: function () {},
  document: { querySelector: s => (s === 'main' ? null : mk(s)), addEventListener() {}, createElement: () => mk('a') },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('logic.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('app.js', 'utf8') + `
;S.events.push({id:'x',title:'Zahnarzt <b>',date:FP.ymd(new Date()),time:'10:00',allDay:false,member:'m1',repeat:'weekly',remind:30,notes:'n'});
S.tasks.push({id:'t',text:'Milch',done:false,due:FP.ymd(new Date()),member:'m2'});
S.weather={ts:Date.now(),place:'Köln',cur:{temperature_2m:14.2,apparent_temperature:12,weather_code:61,wind_speed_10m:9},
 daily:{time:['a','2026-09-30','2026-10-01','2026-10-02'],weather_code:[0,1,3,95],temperature_2m_max:[1,2,3,4],temperature_2m_min:[0,1,2,3]}};
for (const t of ['cal','agenda','list','more']) { ui.tab=t; render(); globalThis.__out = globalThis.__out||{}; globalThis.__out[t]=document.querySelector('#app').innerHTML; }
openSheet(); openSheet('x');
`, ctx);
setTimeout(() => {
  const o = ctx.__out;
  const ok = (c, m) => { if (!c) { console.error('FEHLER:', m); process.exit(1); } };
  ok(o.cal.includes('Zahnarzt &lt;b&gt;'), 'Titel wird nicht escaped');
  ok(o.cal.includes('14°C') || o.cal.includes('14°'), 'Wetter fehlt');
  ok(o.agenda.includes('Heute'), 'Agenda leer');
  ok(o.list.includes('Milch'), 'Aufgabe fehlt');
  ok(o.more.includes('Testmeldung'), 'Mehr-Tab fehlt');
  console.log('Rauchtest bestanden');
}, 50);

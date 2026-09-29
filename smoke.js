// Rauchtest: rendert alle Ansichten und Formulare gegen eine minimale DOM-Attrappe.
const vm = require('vm'), fs = require('fs');
const els = {};
const mk = (id) => els[id] || (els[id] = { id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, click() {}, value: '', style: {}, scrollTop: 0 });
const store = {};
const ctx = {
  console, setTimeout, clearTimeout, Date, Math, JSON, Promise, Array, Object, Set, Number, String, AbortController,
  fetch: async () => { throw new Error('offline'); },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  navigator: {}, URL: {}, Blob: function () {}, confirm: () => true,
  document: { querySelector: s => (s === 'main' ? null : mk(s)), querySelectorAll: () => [], addEventListener() {}, createElement: () => mk('a'), documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } } },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('logic.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('app.js', 'utf8') + `
;const td = FP.ymd(new Date());
S.members.push({id:'k',name:'Lena <3',emoji:'🦄',color:'#DA77F2',birthday:'2019'+td.slice(4),notify:true});
S.events.push({id:'x',title:'Zahnarzt <b>',date:td,time:'10:00',allDay:false,members:['m1','k'],repeat:'weekly',remind:30,notes:'n'});
S.events.push({id:'old',title:'Altdaten',date:td,time:'11:00',allDay:false,member:'m2',repeat:'none',remind:-1,notes:''});
S.tasks.push({id:'t',text:'Milch',done:false,due:td,member:'m2'});
S.settings.familyName='Familie Test'; S.settings.theme='sea';
S.weather={ts:Date.now(),place:'Köln',cur:{temperature_2m:14.2,apparent_temperature:12,weather_code:61,wind_speed_10m:9},
 daily:{time:[td,'2026-09-30','2026-10-01','2026-10-02'],weather_code:[61,1,3,95],temperature_2m_max:[16,2,3,4],temperature_2m_min:[8,1,2,3],precipitation_probability_max:[70,10,0,40]}};
globalThis.__out = {};
for (const t of ['cal','agenda','list','more']) { ui.tab=t; render(); globalThis.__out[t]=document.querySelector('#app').innerHTML; }
globalThis.__theme=document.documentElement.attrs['data-theme'];
ui.weatherErr='Dein Standort konnte nicht ermittelt werden.'; ui.weatherDetail='x'; render(); globalThis.__out.err=document.querySelector('#app').innerHTML;
openSheet(); globalThis.__out.ev=document.querySelector('#sheet').innerHTML;
openSheet('x'); globalThis.__out.evEdit=document.querySelector('#sheet').innerHTML; openMemberSheet(); globalThis.__out.pf=document.querySelector('#sheet').innerHTML; openMemberSheet('k');
globalThis.__mig = migrate({members:[{id:'m0',name:'Alle',color:'#6366f1'},{id:'m1',name:'Mama',color:'bad'}],events:[{id:'a',title:'t',date:td,member:'m0'},{id:'b',title:'u',date:td,member:'m1'}]});
`, ctx);
setTimeout(() => {
  const o = ctx.__out, ok = (c, m) => { if (!c) { console.error('FEHLER:', m); process.exit(1); } };
  ok(o.cal.includes('Zahnarzt &lt;b&gt;'), 'Titel wird nicht escaped');
  ok(o.cal.includes('Lena &lt;3'), 'Personenname wird nicht escaped');
  ok(o.cal.includes('Familie Test'), 'Begrüßung fehlt');
  ok(o.cal.includes('🎂 Lena &lt;3 wird 7'), 'Geburtstag fehlt');
  ok(o.cal.includes('Altdaten'), 'Altdaten-Termin fehlt');
  ok(o.cal.includes('14°C') && o.cal.includes('Regenschirm'), 'Wetter/Tipp fehlt');
  ok(o.err.includes('Ort festlegen'), 'Fehlerhinweis ohne Ort-Button');
  ok(o.agenda.includes('Heute'), 'Agenda leer');
  ok(o.list.includes('Milch'), 'Aufgabe fehlt');
  ok(o.more.includes('Farbwelt') && o.more.includes('Meer') && o.more.includes('Person hinzufügen'), 'Mehr-Tab unvollständig');
  ok(o.ev.includes('Für wen?') && o.ev.includes('data-a="pickm"') && !o.ev.includes('pick on'), 'Neuer Termin: Personenwahl falsch');
  ok(o.evEdit.includes('pick on'), 'Bearbeiten: gewählte Personen nicht markiert');
  ok(o.pf.includes('p_emoji') && o.pf.includes('p_color') && o.pf.includes('p_bday'), 'Profilformular unvollständig');
  ok(ctx.__theme === 'sea', 'Theme nicht gesetzt');
  const m = ctx.__mig;
  ok(m.events[0].members.length === 0 && m.events[1].members[0] === 'm1', 'Migration alter Termine falsch');
  ok(m.members[1].color === '#888888' && m.members[1].emoji, 'Migration Profile falsch');
  console.log('Rauchtest bestanden');
}, 50);

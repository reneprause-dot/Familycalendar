// Rauchtest: rendert alle Ansichten, spielt Klick-Aktionen durch und prüft den Bildschirmschoner (minimale DOM-Attrappe).
const vm = require('vm'), fs = require('fs');
const ok = (c, m) => { if (!c) { console.error('FEHLER:', m); process.exit(1); } };

/* ============ Teil 1: die App (index.html + app.js) ============ */
async function appTest() {
  const els = {}, listeners = {};
  const mk = (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, click() {}, value: '', checked: false, style: {}, scrollTop: 0 });
  const store = {};
  const ctx = {
    console, setTimeout, clearTimeout, Date, Math, JSON, Promise, Array, Object, Set, Number, String, AbortController,
    fetch: async () => { throw new Error('offline'); },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    navigator: {}, URL: {}, Blob: function () { }, __confirmAnswer: true, __confirmMsg: '', __promptAnswer: null,
    confirm(m) { ctx.__confirmMsg = m; return ctx.__confirmAnswer; },
    prompt() { return ctx.__promptAnswer; },
    document: {
      querySelector: s => (s === 'main' ? null : mk(s)), querySelectorAll: () => [],
      addEventListener: (t, f) => { listeners[t] = f; }, createElement: () => mk('a'),
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }
    },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('logic.js', 'utf8'), ctx);
  await new Promise(r => setTimeout(r, 0));
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), ctx);
  await new Promise(r => setTimeout(r, 30)); // Start-Routine der App abwarten
  const run = code => vm.runInContext(code, ctx);
  const click = async (a, data) => { await listeners.click({ target: { closest: () => ({ dataset: Object.assign({ a }, data || {}), classList: { toggle() { } } }) } }); await new Promise(r => setTimeout(r, 5)); };
  const app = () => mk('#app').innerHTML;

  // Testdaten
  run(`
    const td = FP.ymd(new Date()), tm = FP.ymd(FP.addDays(new Date(), 1));
    S.members.push({id:'k',name:'Lena <3',emoji:'🦄',color:'#DA77F2',birthday:'2019'+td.slice(4),notify:true,gifts:'Puzzle',goal:5,reward:'Kinoabend',plan:{}});
    S.members.find(m=>m.id==='k').plan[FP.WKEYS[new Date().getDay()]] = {subjects:'Mathe, Deutsch', bring:''};
    S.members.find(m=>m.id==='k').plan[FP.WKEYS[FP.addDays(new Date(),1).getDay()]] = {subjects:'Sport', bring:'Sportbeutel, Flöte'};
    S.events.push({id:'x',title:'Zahnarzt <b>',date:td,time:'10:00',dur:60,allDay:false,members:['m1','k'],bring:'m2',pick:'m1',repeat:'weekly',remind:30,notes:'n'});
    S.events.push({id:'old',title:'Altdaten',date:td,time:'11:30',allDay:false,member:'m2',repeat:'none',remind:-1,notes:''});
    S.tasks.push({id:'t',text:'Milch',done:false,due:td,member:'m2'});
    S.chores.push({id:'c1',text:'Tisch decken',stars:3,member:'k',repeat:'daily',lastDone:''});
    S.notes.push({id:'n1',text:'Bin um 18 Uhr zurück',member:'m1',ts:1});
    S.countdowns.push({id:'cd1',title:'Urlaub',emoji:'🏖️',date:FP.ymd(FP.addDays(new Date(), 12))});
    S.photos.push('p1.jpg');
    S.settings.familyName='Familie Test'; S.settings.theme='sea';
    S.weather={ts:Date.now(),place:'Köln',lat:1,lon:2,cur:{temperature_2m:14.2,apparent_temperature:12,weather_code:61,wind_speed_10m:9},
     daily:{time:[td,tm,tm,tm],weather_code:[61,1,3,95],temperature_2m_max:[16,2,3,4],temperature_2m_min:[8,1,2,3],precipitation_probability_max:[70,10,0,40]}};
  `);
  const pages = {};
  for (const t of ['cal', 'agenda', 'list', 'family', 'more']) { run(`ui.tab='${t}'; render();`); pages[t] = app(); }
  const theme = ctx.document.documentElement.attrs['data-theme'];

  ok(pages.cal.includes('Zahnarzt &lt;b&gt;') && pages.cal.includes('Lena &lt;3'), 'Escaping fehlt');
  ok(pages.cal.includes('Familie Test') && pages.cal.includes('id="quick"'), 'Begrüßung oder Schnelleingabe fehlt');
  ok(pages.cal.includes('🎂 Lena &lt;3 wird 7') && pages.cal.includes('🎁 Puzzle'), 'Geburtstag mit Geschenkidee fehlt');
  ok(pages.cal.includes('🚗 bringt Papa') && pages.cal.includes('holt Mama'), 'Fahrdienst fehlt');
  ok(pages.cal.includes('Bin um 18 Uhr zurück'), 'Pinnwand fehlt auf der Startseite');
  ok(pages.cal.includes('Altdaten') && pages.cal.includes('14°C') && pages.cal.includes('Regenschirm'), 'Altdaten/Wetter fehlt');
  ok(theme === 'sea', 'Theme nicht gesetzt');
  ok(pages.agenda.includes('Heute') && pages.list.includes('Milch'), 'Agenda/Liste fehlt');
  ok(/data-t="family"/.test(pages.cal), 'Tab Familie fehlt');
  ok(pages.family.includes('Pinnwand') && pages.family.includes('Tisch decken') && pages.family.includes('Kinoabend'), 'Familie: Pinnwand/Ämtchen/Ziel fehlt');
  ok(pages.family.includes('Schulsachen für morgen') && pages.family.includes('Sportbeutel') && pages.family.includes('Flöte'), 'Familie: Schulsachen fehlen');
  ok(pages.family.includes('noch 12 Tage') && pages.family.includes('Urlaub'), 'Familie: Countdown fehlt');
  ok(pages.family.includes('Bald Geburtstag') && pages.family.includes('Heute! 🎉'), 'Familie: Geburtstage fehlen');
  ok(pages.more.includes('Kindermodus') && pages.more.includes('Terminvorlagen') && pages.more.includes('Arzttermin') && pages.more.includes('data-photo="p1.jpg"') && pages.more.includes('importics'), 'Mehr-Tab unvollständig');

  // Formulare
  run(`openSheet();`); const evForm = mk('#sheet').innerHTML;
  ok(evForm.includes('data-a="tpl"') && evForm.includes('f_dur') && evForm.includes('f_bring') && evForm.includes('f_tpl') && evForm.includes('Am Vorabend'), 'Terminformular unvollständig');
  run(`openSheet('x');`); ok(mk('#sheet').innerHTML.includes('pick on'), 'Bearbeiten: Personen nicht markiert');
  run(`openMemberSheet('k');`); const pf = mk('#sheet').innerHTML;
  ok(pf.includes('p_gifts') && pf.includes('p_goal') && pf.includes('pl_mon_s') && pf.includes('Sportbeutel'), 'Profilformular unvollständig');

  // Schnelleingabe -> vorausgefülltes Formular
  mk('#quick').value = 'Freitag 16 Uhr Zahnarzt Lena <3'; run(`doQuick();`);
  const q = mk('#sheet').innerHTML;
  ok(q.includes('value="Zahnarzt"') && q.includes('value="16:00"'), 'Schnelleingabe füllt das Formular nicht');
  ok(q.includes('pick on'), 'Schnelleingabe wählt die Person nicht');

  // Ämtchen: abhaken, Sterne, rückgängig
  await click('chore', { id: 'c1' });
  ok(run('S').starLog.length === 1 && run('S').chores[0].lastDone, 'Ämtchen abhaken zählt keine Sterne');
  await click('chore', { id: 'c1' });
  ok(run('S').starLog.length === 0 && !run('S').chores[0].lastDone, 'Ämtchen rückgängig funktioniert nicht');

  // Zettel, Countdown, Schulsachen abhaken
  mk('#noteText').value = 'Milch kaufen'; mk('#noteWho').value = ''; await click('addnote');
  ok(run('S').notes.length === 2, 'Zettel nicht angelegt');
  mk('#cdTitle').value = 'Zoo'; mk('#cdDate').value = '2030-01-01'; mk('#cdEmoji').value = '🦁'; await click('addcd');
  ok(run('S').countdowns.length === 2, 'Countdown nicht angelegt');
  const key = run(`FP.ymd(FP.addDays(new Date(), 1)) + '|k'`);
  await click('bringtoggle', { k: key, n: '0' });
  ok((run('S').bring[key] || []).includes('Sportbeutel'), 'Schulsache nicht abgehakt');

  // Konfliktwarnung beim Speichern
  const set = (o) => Object.entries(o).forEach(([k, v]) => { mk('#' + k).value = v; });
  const today = run('td');
  set({ f_title: 'Elternabend', f_date: today, f_time: '10:30', f_dur: '60', f_bring: '', f_pick: '', f_repeat: 'none', f_remind: '-2', f_notes: '' });
  mk('#f_all').checked = false;
  const before = run('S').events.length;
  ctx.__confirmAnswer = false; await click('saveevent', { id: '' });
  ok(run('S').events.length === before && ctx.__confirmMsg.includes('Zahnarzt'), 'Konfliktwarnung fehlt oder speichert trotz „Nein“');
  ctx.__confirmAnswer = true; await click('saveevent', { id: '' });
  ok(run('S').events.length === before + 1 && run('S').events[run('S').events.length - 1].remind === -2, 'Speichern nach „Trotzdem“ fehlgeschlagen');

  // Kindermodus mit Eltern-Sperre
  mk('#kidWho').value = 'k'; await click('kidstart');
  const kid = app();
  ok(kid.includes('Hallo Lena &lt;3!') && kid.includes('Meine Sterne') && kid.includes('Tisch decken') && kid.includes('Mathe') && kid.includes('Morgen einpacken') && !kid.includes('<nav>'), 'Kindermodus unvollständig');
  ctx.__promptAnswer = '0'; await click('kidexit'); ok(run('S').settings.kidMode === 'k', 'Kindermodus ohne richtige Antwort verlassen');
  const origPrompt = ctx.prompt; ctx.prompt = (m) => { const n = m.match(/(\d+) \+ (\d+)/); return String(Number(n[1]) + Number(n[2])); };
  await click('kidexit'); ok(run('S').settings.kidMode === '', 'Eltern-Rechenaufgabe funktioniert nicht'); ctx.prompt = origPrompt;

  // Migration alter Daten
  const m = run(`migrate({members:[{id:'m0',name:'Alle',color:'#6366f1'},{id:'m1',name:'Mama',color:'bad'}],events:[{id:'a',title:'t',date:td,member:'m0'},{id:'b',title:'u',date:td,member:'m1'}]})`);
  ok(m.events[0].members.length === 0 && m.events[1].members[0] === 'm1' && m.events[1].dur === 60, 'Migration alter Termine falsch');
  ok(m.members[1].color === '#888888' && m.members[1].plan && Array.isArray(m.chores) && Array.isArray(m.photos) && m.templates.length > 0, 'Migration Profile/neue Felder falsch');
  console.log('App-Test bestanden');
}

/* ============ Teil 2: Bildschirmschoner (dream.html) ============ */
function dreamTest() {
  const html = fs.readFileSync('dream.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(scripts.length === 1, 'dream.html braucht genau ein Inline-Skript');
  const nodes = {};
  const node = id => nodes[id] || (nodes[id] = {
    id, textContent: '', innerHTML: '', src: '', style: { setProperty() { } },
    classList: { s: new Set(id === 'panel' ? ['hidden'] : []), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } }
  });
  const d = new Date(), td = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const in5 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 5), cdDate = in5.getFullYear() + '-' + String(in5.getMonth() + 1).padStart(2, '0') + '-' + String(in5.getDate()).padStart(2, '0');
  const data = (titles) => JSON.stringify({
    members: [{ id: 'm1', name: 'Mama', emoji: '👩', color: '#F783AC', birthday: '2019' + td.slice(4) }],
    events: [{ id: 'e', title: 'Zahnarzt <b>', date: td, time: '23:59', allDay: false, members: ['m1'], repeat: 'none', remind: 30, notes: '' }],
    tasks: [{ id: 't', text: 'Milch', done: false, due: td, member: 'm1' }],
    notes: [{ id: 'n', text: 'Bin um 18 Uhr zurück', member: 'm1' }],
    countdowns: [{ id: 'c', title: 'Urlaub', emoji: '🏖️', date: cdDate }],
    settings: { theme: 'night', familyName: 'Familie Test', dreamTitles: titles, dreamPhotos: true },
    weather: { ts: Date.now(), place: 'Köln', lat: 50.9, lon: 6.9, cur: { temperature_2m: 14.2, weather_code: 61 }, daily: { time: [td, td, td, td], weather_code: [61, 1, 3, 95], temperature_2m_max: [16, 2, 3, 4], temperature_2m_min: [8, 1, 2, 3] } }
  });
  function run(titles, android) {
    const listeners = {};
    const c = {
      console, setTimeout: () => 0, clearTimeout() { }, setInterval: () => 0, Date, Math, JSON, Promise, Array, Object, Set, Number, String,
      fetch: async () => { throw new Error('offline'); },
      localStorage: { getItem: () => data(titles) },
      document: { getElementById: node, addEventListener: (t, f) => { listeners[t] = f; } },
    };
    if (android) c.Android = {
      readData: () => data(titles), listPhotos: () => '["a.jpg","b.jpg"]', readPhoto: n => 'data:image/jpeg;base64,' + n,
      openApp() { c.__opened = true; }, exit() { c.__exited = true; }
    };
    c.window = c; c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync('logic.js', 'utf8'), c);
    Object.keys(nodes).forEach(k => delete nodes[k]);
    vm.runInContext(scripts[0], c);
    return { c, click: id => listeners.click({ target: { id } }) };
  }

  let r = run(true, true);
  ok(/^\d\d:\d\d$/.test(nodes.clock.textContent), 'Uhr fehlt');
  ok(nodes.wx.textContent.includes('14°C') && nodes.wx.textContent.includes('Köln'), 'Wetter fehlt');
  ok(nodes.next.innerHTML.includes('Zahnarzt &lt;b&gt;'), 'Nächster Termin fehlt/nicht escaped');
  ok(nodes.cd.textContent.includes('Noch 5 Tage bis Urlaub'), 'Countdown fehlt: ' + nodes.cd.textContent);
  ok(nodes.note.textContent.includes('Bin um 18 Uhr zurück'), 'Pinnwand fehlt');
  ok(node('panel').classList.contains('hidden'), 'Panel sollte anfangs versteckt sein');
  // Diashow: Uhr -> Foto -> Uhr
  r.c.__dream.cycle();
  ok(nodes.photo.classList.contains('on') && nodes.pimg.src.includes('a.jpg'), 'Diashow zeigt kein Foto');
  r.c.__dream.cycle();
  ok(!nodes.photo.classList.contains('on'), 'Diashow kehrt nicht zur Uhr zurück');
  r.c.__dream.cycle();
  ok(nodes.pimg.src.includes('b.jpg'), 'Diashow springt nicht zum nächsten Foto');
  // Tippen -> Familienplan
  r.click('amb');
  ok(!node('panel').classList.contains('hidden'), 'Tippen zeigt den Familienplan nicht');
  ok(nodes.pbody.innerHTML.includes('Zahnarzt &lt;b&gt;') && nodes.pbody.innerHTML.includes('Milch') && nodes.pbody.innerHTML.includes('🎂 Mama wird 7'), 'Familienplan unvollständig');
  ok(nodes.pbody.innerHTML.includes('Pinnwand') && nodes.pbody.innerHTML.includes('Noch 5 Tage bis Urlaub'), 'Panel ohne Pinnwand/Countdown');
  ok(nodes.ptitle.textContent.includes('Familie Test'), 'Familienname fehlt im Titel');
  r.click('pOpen'); ok(r.c.__opened, 'App öffnen ruft die Brücke nicht auf');
  r.click('pExit'); ok(r.c.__exited, 'Beenden ruft die Brücke nicht auf');
  r.click('pClose'); ok(node('panel').classList.contains('hidden'), 'Schließen versteckt das Panel nicht');

  // Datenschutz-Modus: keine Titel, Zettel, Countdown; Fotos bleiben eine eigene Einstellung
  r = run(false, false);
  ok(!nodes.next.innerHTML.includes('Zahnarzt') && nodes.next.textContent.includes('Einträge heute'), 'Titel trotz Datenschutz-Schalter sichtbar');
  ok(nodes.cd.textContent === '' && nodes.note.textContent === '', 'Zettel/Countdown trotz Datenschutz-Schalter sichtbar');
  console.log('Bildschirmschoner-Test bestanden');
}

(async () => { await appTest(); dreamTest(); console.log('Rauchtest bestanden'); })().catch(e => { console.error(e); process.exit(1); });

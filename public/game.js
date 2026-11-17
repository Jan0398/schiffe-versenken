/* Schiffe versenken – Oberfläche. Die Spiellogik läuft auf dem Server (auch gegen den Computer). */
(function () {
  const { FLEET, LEN, COUNTRIES, shipSVG, flagSVG } = Ships;
  const N = 10, ROWS = 'ABCDEFGHIJ';
  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const K = (r, c) => r + ',' + c;
  const coord = (r, c) => ROWS[r] + (c + 1);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const rand = n => Math.floor(Math.random() * n);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const inB = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  };
  const sess = {
    get() { try { return JSON.parse(sessionStorage.getItem('sv_sess') || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem('sv_sess', JSON.stringify(v)); } catch { } },
    clear() { try { sessionStorage.removeItem('sv_sess'); } catch { } },
  };
  const shipInfo = (cc, key) => (COUNTRIES[cc] || COUNTRIES.de).ships[key];
  const shipName = s => shipInfo(s.cc, s.key).name + (String(s.id).startsWith('cap') ? ' (gekapert)' : '');

  const S = {
    name: store.get('sv_name', ''), country: store.get('sv_country', 'de'), diff: store.get('sv_diff', 'normal'),
    pmode: store.get('sv_pmode', 'classic'), events: store.get('sv_events') === '1', size: +store.get('sv_size', '2') === 3 ? 3 : 2,
    screen: 'scrMenu', code: null, pid: null, tcode: null, tour: null, solo: false,
    // Partie
    seats: [], mySeat: 0, msize: 2, powerups: false, mevents: false, nPowers: 0, tround: null,
  };
  if (!COUNTRIES[S.country]) S.country = 'de';

  /* ================= Sound ================= */
  const Sound = {
    ctx: null, on: store.get('sv_sound') !== '0',
    ac() {
      if (!this.on) return null;
      if (!this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; this.ctx = new A(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    noise(dur, o = {}) {
      const ac = this.ac(); if (!ac) return;
      const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(), t = ac.currentTime + (o.delay || 0);
      f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q || 1;
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain || .4, t + (o.attack || .005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(ac.destination); src.start(t);
    },
    tone(f0, f1, dur, gain = .25, type = 'sine', delay = 0) {
      const ac = this.ac(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
    },
    shot() { this.noise(.2, { type: 'highpass', freq: 800, gain: .22 }); this.tone(150, 45, .18, .35); },
    splash() { this.noise(.75, { type: 'bandpass', freq: 1500, freqEnd: 350, q: .7, gain: .35, attack: .04 }); },
    boom() { this.noise(1, { type: 'lowpass', freq: 1000, freqEnd: 100, gain: .85 }); this.tone(95, 28, .7, .5); },
    sunk() { this.boom(); this.noise(1.8, { type: 'lowpass', freq: 320, freqEnd: 50, gain: .6, attack: .15, delay: .26 }); },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, .3, .18, 'triangle', i * .15)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * .97, .4, .18, 'triangle', i * .22)); },
    click() { this.tone(700, 500, .05, .06, 'square'); },
    err() { this.tone(170, 120, .15, .12, 'square'); },
    ping() { this.tone(1200, 1150, .5, .12, 'sine'); },
    emp() { this.tone(2400, 60, .9, .18, 'sawtooth'); this.noise(.8, { type: 'bandpass', freq: 3000, freqEnd: 300, q: 2, gain: .25 }); this.tone(60, 40, .5, .2, 'square', .2); },
    radar() { [0, .35, .7].forEach(t => this.tone(1500, 1450, .35, .12, 'sine', t)); },
    nuke() { this.noise(2.8, { type: 'lowpass', freq: 1400, freqEnd: 40, gain: 1, attack: .01 }); this.tone(70, 18, 2.2, .7); this.noise(2.2, { type: 'lowpass', freq: 400, freqEnd: 40, gain: .7, attack: .3, delay: .4 }); },
    fanfare() { [392, 523, 392, 659].forEach((f, i) => this.tone(f, f, .18, .14, 'square', i * .13)); },
    iceberg() { this.noise(1.6, { type: 'highpass', freq: 2500, freqEnd: 600, gain: .3, attack: .3 }); [0, .25, .4].forEach(t => this.noise(.25, { type: 'bandpass', freq: 1800, q: 4, gain: .5, delay: 1.2 + t })); this.tone(70, 30, 1.2, .35, 'sine', 1.3); },
    pirates() { this.tone(220, 220, .35, .18, 'sawtooth'); this.tone(277, 277, .35, .18, 'sawtooth', .35); this.tone(330, 330, .6, .18, 'sawtooth', .7); [1.4, 1.7, 2.0].forEach(t => { this.noise(.4, { type: 'lowpass', freq: 900, freqEnd: 100, gain: .6, delay: t }); }); },
    storm() { this.noise(3.2, { type: 'bandpass', freq: 400, freqEnd: 1600, q: .6, gain: .5, attack: .8 }); this.noise(2.5, { type: 'bandpass', freq: 900, freqEnd: 300, q: .8, gain: .3, attack: .5, delay: .6 }); },
    diarrhea() { [0, .18, .36].forEach((t, i) => this.tone(180 - i * 30, 60, .25, .22, 'sawtooth', t)); this.tone(90, 40, .9, .25, 'square', .7); this.noise(.6, { type: 'lowpass', freq: 300, gain: .3, delay: 1.6 }); },
    whale() { this.tone(180, 90, 1.4, .3, 'sine'); this.tone(240, 120, 1.2, .2, 'sine', .3); this.noise(1.2, { type: 'highpass', freq: 1500, gain: .3, attack: .2, delay: 1.2 }); },
    parrot() { [0, .15, .3, .5].forEach((t, i) => this.tone(1800 + i * 300, 900, .12, .15, 'square', t)); },
    rum() { [523, 587, 659, 587, 523].forEach((f, i) => this.tone(f, f, .18, .12, 'triangle', i * .18)); this.tone(200, 120, .3, .2, 'sine', 1.1); },
    repair() { [0, .25, .5, .75].forEach(t => { this.noise(.08, { type: 'highpass', freq: 3000, gain: .5, delay: t }); this.tone(900, 700, .06, .1, 'square', t); }); },
    fog() { this.noise(3, { type: 'lowpass', freq: 300, freqEnd: 150, gain: .3, attack: 1 }); this.tone(110, 108, 2.5, .12, 'sine', .3); },
    siren() { [659, 784, 880, 784, 659, 523].forEach((f, i) => this.tone(f, f * 1.01, .35, .1, 'sine', i * .25)); },
    bottle() { this.tone(800, 400, .15, .2, 'square'); this.noise(.3, { type: 'highpass', freq: 2000, gain: .3, delay: .1 }); [784, 988, 1175].forEach((f, i) => this.tone(f, f, .2, .12, 'triangle', .5 + i * .12)); },
    fish() { for (let i = 0; i < 10; i++) this.tone(600 + rand(900), 300, .08, .06, 'sine', i * .12); },
    mutiny() { [0, .3, .6].forEach(t => { this.noise(.15, { type: 'bandpass', freq: 2500, q: 3, gain: .4, delay: t }); this.tone(1400, 900, .1, .1, 'square', t); }); this.tone(150, 100, .6, .25, 'sawtooth', .9); },
    wave() { this.noise(3, { type: 'lowpass', freq: 600, freqEnd: 150, gain: .7, attack: .8 }); this.noise(1.5, { type: 'highpass', freq: 1500, gain: .25, attack: .3, delay: 1 }); },
    kraken() { this.tone(55, 30, 2.5, .5, 'sawtooth'); this.tone(82, 40, 2.2, .3, 'sine', .2); this.noise(2.4, { type: 'lowpass', freq: 500, freqEnd: 60, gain: .55, attack: .6, delay: .8 }); },
  };
  function updateSoundBtn() { $('btnSound').textContent = Sound.on ? '🔊' : '🔇'; }
  $('btnSound').onclick = () => { Sound.on = !Sound.on; store.set('sv_sound', Sound.on ? '1' : '0'); updateSoundBtn(); };
  updateSoundBtn();

  /* ================= UI-Helfer ================= */
  function show(id) {
    ['scrMenu', 'scrLobby', 'scrPlace', 'scrBattle', 'scrTourney'].forEach(s => $(s).classList.toggle('hidden', s !== id));
    S.screen = id; window.scrollTo({ top: 0 });
  }
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function modal(html, wide = false) { $('modalBox').innerHTML = html; $('modalBox').classList.toggle('wide', wide); $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); $('modalBox').classList.remove('wide'); }
  function shake(node) { if (!node) return; node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }
  const seatName = s => (S.seats[s] || {}).name || '?';

  /* ================= Menü ================= */
  function countryGrid(box, onPick) {
    box.innerHTML = '';
    for (const [title, fic] of [['Echte Marinen', false], ['Fiktive Flotten · Weltraum', true]]) {
      box.appendChild(el('div', 'c-group', title));
      for (const [cc, C] of Object.entries(COUNTRIES)) {
        if (!!C.fictional !== fic) continue;
        const d = el('div', 'country' + (cc === S.country ? ' on' : '') + (fic ? ' fic' : ''), `${flagSVG(cc)}<b>${C.name}</b><small>${C.navy}</small>`);
        d.onclick = () => onPick(cc);
        box.appendChild(d);
      }
    }
  }
  function renderCountries() {
    countryGrid($('countries'), cc => { S.country = cc; store.set('sv_country', cc); Sound.click(); renderCountries(); renderFleetPreview(); });
  }
  function renderFleetPreview() {
    const box = $('fleetPreview'); box.innerHTML = '';
    for (const f of FLEET) {
      const s = shipInfo(S.country, f.key);
      box.appendChild(el('div', 'fp-item', `<div class="fp-img" style="width:${f.len * 26}px">${shipSVG(S.country, f.key, true)}</div>` +
        `<div class="fp-txt">${esc(s.name)} <small>${esc(s.type)} · ${esc(s.id)} · ${f.len} Felder</small></div>`));
    }
  }
  function getName() {
    const n = $('inName').value.trim().slice(0, 18);
    if (!n) { $('inName').focus(); shake($('inName')); toast('Bitte gib zuerst deinen Namen ein.'); Sound.err(); return null; }
    S.name = n; store.set('sv_name', n); return n;
  }
  $('inName').value = S.name;
  function segBind(id, key, storeKey, after) {
    $$(`#${id} button`).forEach(b => b.onclick = () => {
      S[key] = key === 'size' ? +b.dataset.v : b.dataset.v; store.set(storeKey, String(S[key])); Sound.click(); renderOptions(); if (after) after();
    });
  }
  segBind('segDiff', 'diff', 'sv_diff');
  segBind('segMode', 'pmode', 'sv_pmode');
  segBind('segSize', 'size', 'sv_size');
  $('chkEvents').onchange = e => { S.events = e.target.checked; store.set('sv_events', S.events ? '1' : '0'); renderOptions(); };
  function renderOptions() {
    $$('#segDiff button').forEach(x => x.classList.toggle('on', x.dataset.v === S.diff));
    $$('#segMode button').forEach(x => x.classList.toggle('on', x.dataset.v === S.pmode));
    $$('#segSize button').forEach(x => x.classList.toggle('on', +x.dataset.v === S.size));
    $('chkEvents').checked = S.events;
    const parts = [];
    parts.push(S.size === 3 ? 'Jeder gegen jeden: Du schießt pro Schuss frei auf einen der beiden Gegner. Wer zuletzt noch schwimmt, gewinnt.' : 'Klassisch 1 gegen 1.');
    if (S.pmode === 'power') parts.push(`Power-ups: ${S.size === 3 ? 'zwei' : 'eines'} pro Spieler (EMP, Artilleriebeschuss ×2, Nuke, Radar).`);
    if (S.events) parts.push('Zufallsereignisse sind an – etwa 2–3 pro Partie.');
    parts.push('Gilt für Spiele gegen den Computer und für Räume/Turniere, die du erstellst (Turniere immer 1 gegen 1).');
    $('modeHint').textContent = parts.join(' ');
    $('btnHost').textContent = S.size === 3 ? '3er-Raum erstellen & Link teilen' : 'Raum erstellen & Link teilen';
  }
  renderOptions();
  $('brandHome').onclick = () => { if (S.screen === 'scrMenu') return; if (S.screen === 'scrLobby') return toMenu(true); confirmLeave(); };

  /* ================= Spielfeld ================= */
  function makeBoard(host, enemy = false, space = false) {
    host.innerHTML = ''; host.className = 'board-wrap' + (enemy ? ' enemy locked' : '');
    const top = el('div', 'lbl-top'), left = el('div', 'lbl-left');
    for (let i = 0; i < N; i++) { top.appendChild(el('span', null, i + 1)); left.appendChild(el('span', null, ROWS[i])); }
    const board = el('div', 'board' + (space ? ' space' : '')), ships = el('div', 'layer ships'), pegs = el('div', 'layer pegs grid10'), cellsL = el('div', 'layer cells grid10');
    const cells = [], pegArr = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const ce = el('div', 'cell'); ce.dataset.r = r; ce.dataset.c = c; cellsL.appendChild(ce); cells.push(ce);
      const p = el('div', 'peg'); pegs.appendChild(p); pegArr.push(p);
    }
    if (enemy) board.appendChild(el('div', 'radar'));
    board.append(ships, pegs, cellsL);
    const fx = el('div', 'fx-over');
    host.append(el('div'), top, left, board, fx);
    const at = e => { const ce = e.target.closest('.cell'); return ce ? [+ce.dataset.r, +ce.dataset.c] : null; };
    return { host, board, fx, ships, cellsL, cells, at, cell: (r, c) => cells[r * N + c], peg: (r, c) => pegArr[r * N + c] };
  }
  function shipEl(cc, key, r, c, h, extra = '', id = '') {
    const len = LEN[key], d = el('div', 'ship ' + extra);
    d.style.left = c * 10 + '%'; d.style.top = r * 10 + '%';
    d.style.width = (h ? len : 1) * 10 + '%'; d.style.height = (h ? 1 : len) * 10 + '%';
    d.dataset.key = key; d.dataset.id = id || key;
    d.innerHTML = shipSVG(cc, key, h);
    return d;
  }
  function setPeg(bd, r, c, type, anim) {
    const p = bd.peg(r, c);
    p.className = 'peg ' + type + (anim ? ' new' : '');
    bd.cell(r, c).classList.add('shot');
    if (anim && type !== 'miss' && type !== 'unk') { const fx = el('div', 'fx-boom'); p.appendChild(fx); setTimeout(() => fx.remove(), 700); }
  }
  const pegType = v => v === 'unknown' ? 'unk' : v === 'miss' ? 'miss' : 'hit';

  /* ================= Aufstellung ================= */
  const cellsOf = (key, r, c, h) => Array.from({ length: LEN[key] }, (_, i) => h ? [r, c + i] : [r + i, c]);
  function keyAt(placed, r, c) {
    for (const [k, p] of Object.entries(placed)) if (cellsOf(k, p.r, p.c, p.h).some(([a, b]) => a === r && b === c)) return k;
    return null;
  }
  function canPlace(placed, key, r, c, h) {
    const cs = cellsOf(key, r, c, h);
    if (cs.some(([a, b]) => !inB(a, b))) return false;
    for (const [k, p] of Object.entries(placed)) {
      if (k === key) continue;
      const occ = new Set(cellsOf(k, p.r, p.c, p.h).map(([a, b]) => K(a, b)));
      if (cs.some(([a, b]) => occ.has(K(a, b)))) return false;
    }
    return true;
  }
  function randomFleet() {
    for (; ;) {
      const placed = {}; let ok = true;
      for (const f of FLEET) {
        let done = false;
        for (let t = 0; t < 300 && !done; t++) {
          const h = Math.random() < .5, r = rand(h ? N : N - f.len + 1), c = rand(h ? N - f.len + 1 : N);
          if (canPlace(placed, f.key, r, c, h)) { placed[f.key] = { r, c, h }; done = true; }
        }
        if (!done) { ok = false; break; }
      }
      if (ok) return placed;
    }
  }

  const POWERS = {
    emp: { icon: '⚡', name: 'EMP', desc: 'Ein Gegner schießt 5 Züge lang blind – seine Zielanzeige ist gestört.', target: false },
    artillery: { icon: '💥', name: 'Artilleriebeschuss', desc: 'Trifft 3 Felder nebeneinander – 2× einsetzbar. Drehen mit R.', target: true },
    nuke: { icon: '☢️', name: 'Nuke', desc: 'Trifft ein Quadrat von 4×4 Feldern mit einem Schlag.', target: true },
    radar: { icon: '📡', name: 'Radar', desc: 'Zeigt in einem 2×2-Feld, ob dort ein feindliches Schiff liegt.', target: true },
  };
  const EVENTS = {
    iceberg: { icon: '🧊', title: 'EISBERG!', txt: s => `Ein Eisberg rammt ein Schiff von ${s}!` },
    pirates: { icon: '🏴‍☠️', title: 'PIRATENANGRIFF!', txt: (s, f) => `Piraten kapern ein Schiff von ${f} – es segelt jetzt für ${s}!` },
    storm: { icon: '🌪️', title: 'ORKANBÖEN!', txt: s => `Ein Orkan wirbelt die unbeschädigten Schiffe von ${s} durcheinander!` },
    diarrhea: { icon: '🚽', title: 'DURCHFALL VOM KAPITÄN!', txt: s => `Der Kapitän von ${s} muss dringend … ein Aushilfsschütze übernimmt: die nächsten 3 Schüsse gehen ein Feld daneben!` },
    kraken: { icon: '🐙', title: 'DER KRAKEN!', txt: s => `Ein Riesenkraken zieht ein Schiff von ${s} in die Tiefe!` },
    whale: { icon: '🐋', title: 'WAL-SICHTUNG!', txt: s => `Ein Wal taucht bei ${s} auf – seine Fontäne verrät ein 3×3-Gebiet!` },
    parrot: { icon: '🦜', title: 'PLAPPERNDER PAPAGEI!', txt: s => `Der Papagei von ${s} kreischt eine Schiffsposition heraus!` },
    rum: { icon: '🍺', title: 'RUM-PARTY!', txt: s => `Die Mannschaft von ${s} feiert – ${s} setzt den nächsten Zug aus!` },
    repair: { icon: '🛠️', title: 'REPARATURTRUPP!', txt: s => `Die Werft flickt ein beschädigtes Schiff von ${s} – ein Treffer ist repariert!` },
    fog: { icon: '🌫️', title: 'DICHTER NEBEL!', txt: s => `Nebel zieht über das Gebiet von ${s} – 3 Runden lang sieht niemand die Stecker!` },
    siren: { icon: '🧜', title: 'SIRENENGESANG!', txt: s => `Sirenen verzaubern ${s} – der nächste Schuss landet irgendwo!` },
    bottle: { icon: '🍾', title: 'FLASCHENPOST!', txt: (s, f, b) => `${s} findet eine Flaschenpost: ${b === 'radar' ? 'ein Radar-Power-up!' : 'einen Extraschuss!'}` },
    fish: { icon: '🐟', title: 'FISCHSCHWARM!', txt: s => `Ein Fischschwarm stört das Sonar von ${s} – der nächste Treffer wird erst später erkannt!` },
    mutiny: { icon: '⚔️', title: 'MEUTEREI!', txt: s => `Tumult an Bord bei ${s}! Zwei Schiffe lichten die Anker und verschwinden an neue Plätze.` },
    wave: { icon: '🌊', title: 'MONSTERWELLE!', txt: s => `Eine Monsterwelle rollt durch das Gebiet von ${s}!` },
  };

  const P = { placed: {}, sel: null, h: true, hover: null, board: null, locked: false, powers: [] };
  function nextUnplaced() { const f = FLEET.find(f => !P.placed[f.key]); return f ? f.key : null; }

  function initPlacement() {
    closeModal();
    P.placed = {}; P.sel = 'carrier'; P.h = true; P.hover = null; P.locked = false; P.powers = [];
    buildPlaceBoard();
    $('waitMsg').classList.add('hidden');
    show('scrPlace');
    renderPlace();
  }
  function renderPlaceVs() {
    const opps = S.seats.filter(s => s.seat !== S.mySeat);
    $('placeVs').innerHTML = `${S.tcode && S.tround ? `<span class="mode-badge t-badge">🏆 Runde ${S.tround}</span> ` : ''}` +
      `<span class="mode-badge">${S.powerups ? '⚡ Power-ups' : '⚓ Klassisch'}${S.mevents ? ' · 🎲 Ereignisse' : ''}</span> ` +
      `${flagSVG(S.country)} <span>${esc(S.name)}</span> <b style="color:var(--red)">VS</b> ` +
      opps.map(o => `${flagSVG(o.country)} <span>${esc(o.name)}${o.ready ? ' ✔' : ''}</span>`).join(' <b style="color:var(--red)">&amp;</b> ');
  }
  function buildPlaceBoard() {
    P.board = makeBoard($('placeBoard'), false, !!COUNTRIES[S.country].space);
    const L = P.board.cellsL;
    L.addEventListener('mousemove', e => { const a = P.board.at(e); if (a && (!P.hover || a[0] !== P.hover[0] || a[1] !== P.hover[1])) { P.hover = a; renderPlace(); } });
    L.addEventListener('mouseleave', () => { P.hover = null; renderPlace(); });
    L.addEventListener('click', e => { const a = P.board.at(e); if (a) placeAt(a[0], a[1]); });
    L.addEventListener('contextmenu', e => { e.preventDefault(); rotate(); });
    renderPlaceVs();
  }
  function renderPlace() {
    if (!P.board) return;
    const L = P.board.ships; L.innerHTML = '';
    for (const [k, p] of Object.entries(P.placed)) L.appendChild(shipEl(S.country, k, p.r, p.c, p.h));
    P.board.cells.forEach(c => c.classList.remove('pv-ok', 'pv-bad'));
    if (P.sel && P.hover && !P.locked) {
      const [r, c] = P.hover, ok = canPlace(P.placed, P.sel, r, c, P.h);
      const cs = cellsOf(P.sel, r, c, P.h);
      cs.forEach(([a, b]) => { if (inB(a, b)) P.board.cell(a, b).classList.add(ok ? 'pv-ok' : 'pv-bad'); });
      if (cs.every(([a, b]) => inB(a, b))) L.appendChild(shipEl(S.country, P.sel, r, c, P.h, 'ghost' + (ok ? '' : ' bad')));
    }
    renderDock();
    renderPowerPick();
    $('btnReady').disabled = Object.keys(P.placed).length < FLEET.length || P.locked || (S.nPowers && P.powers.length !== S.nPowers);
    ['btnRotate', 'btnRandom', 'btnClear', 'btnFaction'].forEach(b => $(b).disabled = P.locked);
  }
  function renderPowerPick() {
    const box = $('powerPick');
    box.classList.toggle('hidden', !S.nPowers);
    if (!S.nPowers) return;
    box.innerHTML = `<div class="pp-title">Wähle ${S.nPowers === 2 ? '2 Power-ups' : 'dein Power-up'} <small>(${P.powers.length}/${S.nPowers})</small></div>` +
      Object.entries(POWERS).map(([k, v]) => `<div class="pp-card${P.powers.includes(k) ? ' on' : ''}${P.locked ? ' locked' : ''}" data-k="${k}"><span>${v.icon}</span><div><b>${v.name}</b><small>${v.desc}</small></div></div>`).join('');
    box.querySelectorAll('.pp-card').forEach(c => c.onclick = () => {
      if (P.locked) return;
      const k = c.dataset.k;
      if (P.powers.includes(k)) P.powers = P.powers.filter(x => x !== k);
      else { P.powers.push(k); if (P.powers.length > S.nPowers) P.powers.shift(); }
      Sound.click(); renderPlace();
    });
  }
  function renderDock() {
    const box = $('dock'); box.innerHTML = '';
    for (const f of FLEET) {
      const s = shipInfo(S.country, f.key);
      const d = el('div', 'dock-item' + (P.sel === f.key ? ' sel' : '') + (P.placed[f.key] ? ' done' : ''),
        `<div class="di-img">${shipSVG(S.country, f.key, true)}</div><div class="di-txt">${esc(s.name)}<small>${esc(s.type)}</small></div>` +
        `<div class="di-len">${'<i></i>'.repeat(f.len)}</div>`);
      d.onclick = () => {
        if (P.locked) return;
        if (P.placed[f.key]) { P.h = P.placed[f.key].h; delete P.placed[f.key]; }
        P.sel = f.key; Sound.click(); renderPlace();
      };
      box.appendChild(d);
    }
  }
  function placeAt(r, c) {
    if (P.locked) return;
    const k = keyAt(P.placed, r, c);
    if (k) { P.sel = k; P.h = P.placed[k].h; delete P.placed[k]; P.hover = [r, c]; Sound.click(); renderPlace(); return; }
    if (!P.sel) return;
    if (canPlace(P.placed, P.sel, r, c, P.h)) { P.placed[P.sel] = { r, c, h: P.h }; P.sel = nextUnplaced(); Sound.tone(300, 500, .08, .12, 'triangle'); }
    else { Sound.err(); shake(P.board.board); }
    renderPlace();
  }
  function rotate() { if (P.locked) return; P.h = !P.h; Sound.click(); renderPlace(); }
  $('btnRotate').onclick = rotate;
  $('btnRandom').onclick = () => { if (P.locked) return; P.placed = randomFleet(); P.sel = null; Sound.click(); renderPlace(); };
  $('btnClear').onclick = () => { if (P.locked) return; P.placed = {}; P.sel = 'carrier'; renderPlace(); };
  $('btnReady').onclick = () => {
    if (Object.keys(P.placed).length < FLEET.length) return;
    if (S.nPowers && P.powers.length !== S.nPowers) { toast(`Bitte ${S.nPowers === 2 ? '2 Power-ups' : 'ein Power-up'} wählen.`); return; }
    P.locked = true; P.sel = null; P.hover = null; renderPlace(); Sound.click();
    socket.emit('ready', { ships: FLEET.map(f => ({ key: f.key, ...P.placed[f.key] })), powers: P.powers });
    showWait();
  };
  function showWait() {
    const w = $('waitMsg'); w.classList.remove('hidden');
    const missing = S.seats.filter(s => s.seat !== S.mySeat && !s.ready).map(s => s.name);
    w.querySelector('span').textContent = missing.length ? `Warte auf ${missing.join(' und ')} …` : 'Alle bereit – gleich geht\'s los …';
  }
  function openFactionPicker() {
    if (P.locked) { toast('Nach „Bereit“ kann die Fraktion nicht mehr gewechselt werden.'); return; }
    modal(`<h2 style="font-size:28px">Fraktion wählen</h2><p>Deine Aufstellung bleibt erhalten.</p><div class="countries modal-countries" id="mCountries"></div><button class="btn ghost" id="mClose">Schließen</button>`, true);
    countryGrid($('mCountries'), cc => {
      closeModal();
      if (cc === S.country) return;
      S.country = cc; store.set('sv_country', cc); Sound.click();
      if (S.seats[S.mySeat]) S.seats[S.mySeat].country = cc;
      socket.emit('setCountry', { country: cc });
      buildPlaceBoard(); renderPlace(); renderCountries(); renderFleetPreview();
      toast(`Du kommandierst jetzt: ${COUNTRIES[cc].name}`);
    });
    $('mClose').onclick = closeModal;
  }
  $('btnFaction').onclick = openFactionPicker;

  /* ================= Schlacht ================= */
  let G = null;
  const opps = () => G ? G.order.map(s => G.opp[s]) : [];

  function newGame(myShips) {
    G = {
      ships: myShips.map(s => ({ ...s, cells: shipCellsArr(s), hits: new Set((s.hits || []).map(([r, c]) => K(r, c))), sunk: !!s.sunk })),
      incoming: new Map(), opp: {}, order: S.seats.filter(s => s.seat !== S.mySeat).map(s => s.seat),
      turn: null, myTurn: false, busy: false, over: false, out: false, log: [], stats: { shots: 0, hits: 0 },
      powers: [], arm: null, armH: true, blind: 0, drunk: 0, animUntil: 0, lastHover: null,
      fog: {}, siren: 0, fish: 0, extra: 0, skip: 0,
    };
    for (const s of G.order) G.opp[s] = { seat: s, shots: new Map(), known: [], scans: [], bd: null, blind: 0, drunk: 0, skip: 0 };
  }
  function shipCellsArr(s) { return Array.from({ length: s.len }, (_, i) => s.h ? K(s.r, s.c + i) : K(s.r + i, s.c)); }

  function renderBattle() {
    show('scrBattle');
    const box = $('battle'); box.innerHTML = '';
    box.className = 'battle' + (S.msize === 3 ? ' three' : '');
    const mk = (id, cls) => {
      const side = el('div', 'side ' + cls); side.id = id;
      side.append(el('div', 'plate'), el('div', 'bwrap'), el('div', 'fleet-list'));
      box.appendChild(side); return side;
    };
    const me = mk('side-me', 'me');
    G.bd = makeBoard(me.querySelector('.bwrap'), false, !!COUNTRIES[S.country].space);
    for (const s of G.order) {
      const side = mk('side-' + s, 'opp');
      const O = G.opp[s];
      O.side = side;
      O.bd = makeBoard(side.querySelector('.bwrap'), true, !!COUNTRIES[S.seats[s].country].space);
      const L = O.bd.cellsL;
      L.addEventListener('click', e => { const a = O.bd.at(e); if (a) onBoardClick(s, a[0], a[1]); });
      L.addEventListener('mousemove', e => { const a = O.bd.at(e); if (a) previewArm(s, a[0], a[1]); });
      L.addEventListener('mouseleave', () => previewArm(s, null));
      L.addEventListener('contextmenu', e => { if (G.arm && G.arm.type === 'artillery') { e.preventDefault(); G.armH = !G.armH; refreshPreview(); } });
    }
    drawMyBoard();
    for (const s of G.order) drawOppBoard(s);
    renderAll();
  }
  function drawMyBoard() {
    G.bd.ships.innerHTML = '';
    for (const s of G.ships) G.bd.ships.appendChild(shipEl(s.cc, s.key, s.r, s.c, s.h, s.sunk ? 'sunk' : '', s.id));
    for (const [k, v] of G.incoming) { const [r, c] = k.split(',').map(Number); setPeg(G.bd, r, c, v === 'miss' ? 'miss' : 'hit'); }
    for (const s of G.ships) for (const k of s.hits) { const [r, c] = k.split(',').map(Number); setPeg(G.bd, r, c, 'hit'); }
  }
  function drawOppBoard(s) {
    const O = G.opp[s];
    for (const [k, v] of O.shots) { const [r, c] = k.split(',').map(Number); setPeg(O.bd, r, c, pegType(v)); }
    for (const sh of O.known) O.bd.ships.appendChild(shipEl(sh.cc, sh.key, sh.r, sh.c, sh.h, 'sunk', sh.id));
    for (const sc of O.scans) drawScan(O, sc);
  }
  function renderAll() { updateEmp(); renderPowerBar(); renderSides(); renderLog(); setTurnUI(); }

  function renderSides() {
    if (!G) return;
    const badges = (blind, drunk, seat) => (blind > 0 ? ` <span class="emp-badge">⚡ blind (${blind})</span>` : '') + (drunk > 0 ? ` <span class="drunk-badge">🚽 ${drunk}</span>` : '') +
      ((seat === S.mySeat ? G.skip : (G.opp[seat] || {}).skip) ? ' <span class="drunk-badge">🍺 setzt aus</span>' : '') +
      (S.seats[seat] && S.seats[seat].online === false ? ' <span class="off">● offline</span>' : '') + (S.seats[seat] && S.seats[seat].bot ? ' <i class="bot">BOT</i>' : '');
    const meSide = $('side-me');
    const myLeft = G.ships.filter(s => !s.sunk).length;
    meSide.querySelector('.plate').innerHTML = `${flagSVG(S.country)}<div class="p-name">${esc(S.name)}${badges(G.blind, G.drunk, S.mySeat)}<small>Deine Flotte · ${COUNTRIES[S.country].navy}</small></div><div class="p-count"><b>${myLeft}</b>/${G.ships.length}<br>Schiffe</div>`;
    meSide.querySelector('.plate').classList.toggle('active', G.turn === S.mySeat && !G.over);
    meSide.classList.toggle('out', G.out);
    meSide.querySelector('.fleet-list').innerHTML = G.ships.map(s => `<div class="fl-item${s.sunk ? ' sunk' : ''}"><div class="fl-img">${shipSVG(s.cc, s.key, true)}</div><span>${esc(shipName(s))}</span></div>`).join('');
    for (const s of G.order) {
      const O = G.opp[s], st = S.seats[s];
      const total = st.ships, left = Math.max(0, total - O.known.length);
      O.side.querySelector('.plate').innerHTML = `${flagSVG(st.country)}<div class="p-name">${esc(st.name)}${badges(O.blind, O.drunk, s)}<small>${st.out ? (st.place ? `ausgeschieden · Platz ${st.place}` : 'ausgeschieden') : 'Feindgebiet · ' + COUNTRIES[st.country].navy}${st.used && st.used.length ? ' · ' + st.used.map(t => POWERS[t].icon).join('') : ''}</small></div><div class="p-count"><b>${st.out ? 0 : left}</b>/${total}<br>Schiffe</div>`;
      O.side.querySelector('.plate').classList.toggle('active', G.turn === s && !G.over);
      O.side.classList.toggle('out', !!st.out);
      O.side.querySelector('.fleet-list').innerHTML = (O.known.length ? O.known.map(sh => `<div class="fl-item sunk"><div class="fl-img">${shipSVG(sh.cc, sh.key, true)}</div><span>${esc(shipName(sh))}</span></div>`).join('') : '') +
        `<div class="fl-note">${O.known.length ? '' : 'Noch kein Schiff versenkt · '}${left} ${left === 1 ? 'Schiff' : 'Schiffe'} übrig</div>`;
    }
  }

  function setTurnUI() {
    if (!G) return;
    const mine = G.turn === S.mySeat && !G.over && !G.out;
    G.myTurn = mine;
    for (const s of G.order) G.opp[s].bd.host.classList.toggle('locked', !mine || G.busy || S.seats[s].out);
    const st = $('status');
    if (G.over) return;
    st.className = 'status ' + (mine ? 'mine' : 'theirs');
    let txt;
    if (G.out) txt = `👀 Du bist ausgeschieden – ${seatName(G.turn)} ist am Zug.`;
    else if (mine) {
      txt = G.again ? '🔥 Treffer! Du darfst nochmal schießen!' : (S.msize === 3 ? '🎯 Du bist am Zug – schieß auf einen deiner Gegner!' : '🎯 Du bist am Zug – wähle ein Ziel im Feindgebiet!');
      if (G.blind > 0) txt = `⚡ Du schießt blind! (EMP – noch ${G.blind} ${G.blind === 1 ? 'Zug' : 'Züge'})`;
      if (G.drunk > 0) txt += ` · 🚽 Aushilfsschütze: dein Schuss geht daneben (noch ${G.drunk})`;
      if (G.siren) txt += ' · 🧜 Sirenen: dieser Schuss landet irgendwo!';
      if (G.fish) txt += ' · 🐟 Fischschwarm stört dein Sonar';
      if (G.extra) txt += ' · 🍾 Extraschuss auf Vorrat';
    } else txt = G.again ? `🔥 ${seatName(G.turn)} hat getroffen und schießt nochmal …` : `⏳ ${seatName(G.turn)} ist am Zug …`;
    st.textContent = txt;
    $('side-me').style.opacity = mine || G.out ? .8 : 1;
    renderPowerBar(); renderSides();
  }

  function updateEmp() {
    if (!G) return;
    for (const s of G.order) {
      const O = G.opp[s];
      O.bd.board.classList.toggle('emp', G.blind > 0);
      let lab = O.bd.fx.querySelector('.emp-label');
      if (G.blind > 0) {
        if (!lab) { lab = el('div', 'emp-label'); O.bd.fx.appendChild(lab); }
        lab.innerHTML = `⚡ EMP – Sensoren gestört<br><small>noch ${G.blind} ${G.blind === 1 ? 'Zug' : 'Züge'} blind</small>`;
      } else if (lab) lab.remove();
    }
  }

  /* ----- Power-ups ----- */
  function renderPowerBar() {
    const bar = $('powerBar');
    if (!G || !G.powers.length) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const can = G.myTurn && !G.busy && !G.over;
    bar.innerHTML = G.powers.map((p, i) => {
      const def = POWERS[p.type], armed = G.arm && G.arm.idx === i;
      return `<div class="pw-me${p.uses <= 0 ? ' used' : ''}${armed ? ' armed' : ''}"><span class="pw-ic">${def.icon}</span>
        <div class="pw-txt"><b>${def.name}${(p.max || 1) > 1 ? ` <small class="uses">${p.uses}/${p.max}</small>` : ''}</b><small>${p.uses <= 0 ? 'Eingesetzt' : armed ? (def.target ? 'Ziel auf einem Feindfeld wählen …' : 'Gegner anklicken, der geblendet werden soll …') + (p.type === 'artillery' ? ' (R dreht)' : '') : def.desc}</small></div>
        ${p.uses <= 0 ? '' : armed ? `${p.type === 'artillery' ? '<button class="btn small" data-rot="1">↻</button>' : ''}<button class="btn ghost small" data-cancel="1">Abbrechen</button>` : `<button class="btn primary small" data-use="${i}" ${can ? '' : 'disabled'}>Einsetzen</button>`}</div>`;
    }).join('');
    bar.querySelectorAll('[data-use]').forEach(b => b.onclick = () => armPower(+b.dataset.use));
    bar.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => { G.arm = null; clearPreview(); renderPowerBar(); });
    bar.querySelectorAll('[data-rot]').forEach(b => b.onclick = () => { G.armH = !G.armH; refreshPreview(); });
  }
  function armPower(i) {
    const p = G.powers[i];
    if (!G.myTurn || G.busy || G.over || !p || p.uses <= 0) { Sound.err(); return; }
    Sound.click();
    const alive = G.order.filter(s => !S.seats[s].out);
    if (!POWERS[p.type].target && alive.length === 1) return firePower(p.type, alive[0], 0, 0, true);
    G.arm = { idx: i, type: p.type }; G.armH = true; renderPowerBar();
    toast(POWERS[p.type].target ? 'Wähle das Zielgebiet auf einem Feindfeld.' : 'Klicke auf das Feld des Gegners, der geblendet werden soll.');
  }
  function areaCells(type, r, c, h) {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v)), out = [];
    if (type === 'artillery') { if (h) { c = cl(c, 1, N - 2); for (let i = -1; i <= 1; i++) out.push([r, c + i]); } else { r = cl(r, 1, N - 2); for (let i = -1; i <= 1; i++) out.push([r + i, c]); } }
    else if (type === 'nuke') { const r0 = cl(r - 1, 0, N - 4), c0 = cl(c - 1, 0, N - 4); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push([r0 + i, c0 + j]); }
    else if (type === 'radar') { const r0 = cl(r, 0, N - 2), c0 = cl(c, 0, N - 2); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out.push([r0 + i, c0 + j]); }
    else if (type === 'emp') { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) out.push([i, j]); }
    return out;
  }
  function clearPreview() { for (const s of G.order) G.opp[s].bd.cells.forEach(x => x.classList.remove('pv-arm')); }
  function previewArm(s, r, c) {
    if (!G) return;
    clearPreview();
    if (r == null) { G.lastHover = null; return; }
    G.lastHover = [s, r, c];
    if (!G.arm || !G.myTurn || S.seats[s].out) return;
    for (const [a, b] of areaCells(G.arm.type, r, c, G.armH)) G.opp[s].bd.cell(a, b).classList.add('pv-arm');
  }
  function refreshPreview() { if (G.lastHover) previewArm(...G.lastHover); }
  function onBoardClick(s, r, c) {
    if (!G || G.over || !G.myTurn || G.busy || S.seats[s].out) return;
    if (G.arm) return firePower(G.arm.type, s, r, c, G.armH);
    if (G.opp[s].shots.has(K(r, c))) { Sound.err(); return; }
    G.busy = true; setTurnUI(); Sound.shot();
    socket.emit('shoot', { target: s, r, c });
    armTimeout();
  }
  function firePower(type, s, r, c, h) {
    G.arm = null; clearPreview();
    G.busy = true; setTurnUI();
    socket.emit('power', { type, target: s, r, c, h });
    armTimeout();
  }
  function armTimeout() {
    clearTimeout(G.busyT);
    G.busyT = setTimeout(() => { if (G && G.busy) { G.busy = false; setTurnUI(); toast('Keine Antwort vom Server – nochmal versuchen.'); } }, 9000);
  }

  /* ----- Nachrichten-Warteschlange (für saubere Animationen) ----- */
  let Q = Promise.resolve();
  function enqueue(fn) { Q = Q.then(async () => { try { const ms = await fn(); if (ms) await sleep(ms); } catch (e) { console.error(e); } }); }

  function logAdd(t, cls = '') { if (!G) return; G.log.unshift({ t, cls }); G.log.length = Math.min(G.log.length, 40); renderLog(); }
  function renderLog() { if (G) $('log').innerHTML = G.log.slice(0, 5).map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join(''); }

  function myShipById(id) { return G.ships.find(s => s.id === id); }

  function onShot(m) {
    const by = m.by, t = m.target;
    if (G.opp[by] && G.opp[by].drunk > 0) G.opp[by].drunk--;
    if (G.opp[by] && G.opp[by].blind > 0) G.opp[by].blind--;
    if (G.opp[t]) G.opp[t].bd.ships.querySelectorAll(`.mark[data-k="${K(m.r, m.c)}"]`).forEach(e => e.remove());
    if (by === S.mySeat) {
      clearTimeout(G.busyT);
      const O = G.opp[t];
      G.drunk = m.drunkLeft || 0;
      if (m.siren) G.siren = 0;
      if (m.res === 'hit' || m.res === 'sunk') G.fish = 0;
      for (const s of G.order) clearMarks(G.opp[s], 'whale');
      if (G.blind > 0) G.blind--;
      O.shots.set(K(m.r, m.c), m.res); G.stats.shots++;
      if (m.aimed) driftFx(O.bd, m.aimed, [m.r, m.c], m.siren ? '🎶' : '🎯');
      if (m.res === 'unknown') { setPeg(O.bd, m.r, m.c, 'unk', true); Sound.tone(300, 120, .2, .1, 'sawtooth'); logAdd(`Du → ${seatName(t)}: ${coord(m.r, m.c)} – Ergebnis unbekannt (EMP).`); updateEmp(); return 500; }
      if (m.res !== 'miss') G.stats.hits++;
      setPeg(O.bd, m.r, m.c, m.res === 'miss' ? 'miss' : 'hit', true);
      const pre = `Du${S.msize === 3 ? ' → ' + seatName(t) : ''}: ${coord(m.r, m.c)}${m.siren ? ' (verzaubert!)' : m.aimed ? ' (verzogen!)' : ''}`;
      if (m.res === 'miss') { Sound.splash(); logAdd(`${pre} – daneben.`); updateEmp(); renderSides(); return 450; }
      if (m.res === 'hit') { Sound.boom(); shake(O.bd.board); logAdd(`${pre} – Treffer!`, 'l-hit'); updateEmp(); renderSides(); return 500; }
      O.known.push(m.ship);
      const se = shipEl(m.ship.cc, m.ship.key, m.ship.r, m.ship.c, m.ship.h, 'sunk sunk-enemy', m.ship.id);
      setTimeout(() => O.bd.ships.appendChild(se), 450);
      megaBoom(O.bd, m.ship);
      logAdd(`${pre} – Versenkt! ${shipName(m.ship)} geht unter.`, 'l-sunk');
      toast(`💥 ${shipName(m.ship)} versenkt!`);
      updateEmp(); renderSides();
      return 2400;
    }
    if (t === S.mySeat) {
      const name = seatName(by);
      if (m.aimed) driftFx(G.bd, m.aimed, [m.r, m.c], m.siren ? '🎶' : '🎯');
      const ship = m.shipId ? myShipById(m.shipId) : null;
      G.incoming.set(K(m.r, m.c), m.res);
      setPeg(G.bd, m.r, m.c, m.res === 'miss' ? 'miss' : 'hit', true);
      if (ship) { ship.hits.add(K(m.r, m.c)); if (m.res === 'sunk') ship.sunk = true; }
      if (m.res === 'miss') { Sound.splash(); logAdd(`${name}: ${coord(m.r, m.c)} – daneben.`); renderSides(); return 450; }
      if (m.res === 'hit') { Sound.boom(); shake(G.bd.board); logAdd(`${name}: ${coord(m.r, m.c)} – Treffer auf ${shipName(ship)}!`, 'l-hit'); renderSides(); return 500; }
      const se = G.bd.ships.querySelector(`[data-id="${ship.id}"]`); if (se) setTimeout(() => se.classList.add('sunk'), 450);
      megaBoom(G.bd, ship);
      logAdd(`${name}: ${coord(m.r, m.c)} – ${shipName(ship)} wurde versenkt!`, 'l-sunk');
      renderSides();
      return 2400;
    }
    // Dritter Spieler: sieht den Schuss mit
    const O = G.opp[t];
    if (!O || m.r == null || m.res == null) { logAdd(`${seatName(by)} schießt auf ${seatName(t)}.`); return 200; }
    if (m.aimed) driftFx(O.bd, m.aimed, [m.r, m.c], m.siren ? '🎶' : '🎯');
    if (!O.shots.has(K(m.r, m.c)) || O.shots.get(K(m.r, m.c)) === 'unknown') O.shots.set(K(m.r, m.c), m.res);
    O.bd.ships.querySelectorAll(`.mark[data-k="${K(m.r, m.c)}"]`).forEach(e => e.remove());
    const pre = `${seatName(by)} → ${seatName(t)}: ${coord(m.r, m.c)}`;
    if (m.res === 'unknown') { setPeg(O.bd, m.r, m.c, 'unk', true); logAdd(`${pre} – Ergebnis unbekannt (EMP).`); return 300; }
    setPeg(O.bd, m.r, m.c, m.res === 'miss' ? 'miss' : 'hit', true);
    if (m.res === 'miss') { Sound.tone(500, 300, .12, .06, 'sine'); logAdd(`${pre} – daneben.`); return 350; }
    if (m.res === 'hit') { Sound.tone(140, 60, .25, .2); shake(O.bd.board); logAdd(`${pre} – Treffer!`, 'l-hit'); renderSides(); return 450; }
    if (m.ship && !O.known.some(x => x.id === m.ship.id)) {
      O.known.push(m.ship);
      setTimeout(() => O.bd.ships.appendChild(shipEl(m.ship.cc, m.ship.key, m.ship.r, m.ship.c, m.ship.h, 'sunk sunk-enemy', m.ship.id)), 450);
      megaBoom(O.bd, m.ship);
    }
    logAdd(`${pre} – versenkt ${m.ship ? shipName(m.ship) : 'ein Schiff'}!`, 'l-sunk');
    toast(`💥 ${seatName(by)} versenkt ${m.ship ? shipName(m.ship) : 'ein Schiff'} von ${seatName(t)}!`);
    renderSides();
    return 2400;
  }

  function onPower(m) {
    const by = m.by, t = m.target, def = POWERS[m.type];
    if (S.seats[by]) S.seats[by].used = [...(S.seats[by].used || []), m.type];
    if (G.opp[by] && G.opp[by].blind > 0) G.opp[by].blind--;
    if (by === S.mySeat) {
      clearTimeout(G.busyT);
      for (const s of G.order) clearMarks(G.opp[s], 'whale');
      const pw = G.powers.find(p => p.type === m.type && p.uses > 0); if (pw) pw.uses--;
      if (G.blind > 0) G.blind--;
      const O = G.opp[t];
      logAdd(`Du setzt ${def.icon} ${def.name}${S.msize === 3 ? ' gegen ' + seatName(t) : ''} ein!`, 'l-sunk');
      renderPowerBar();
      if (m.type === 'emp') { O.blind = m.blind; fxEmp(O.bd); Sound.emp(); logAdd(`${seatName(t)} ist ${m.blind} Züge lang blind!`); renderSides(); return 1300; }
      if (m.type === 'radar') {
        fxRadar(O.bd, m.scan); Sound.radar();
        setTimeout(() => {
          O.scans.push(m.scan); drawScan(O, m.scan);
          logAdd(m.scan.contact ? `📡 Radar ${coord(m.scan.r, m.scan.c)}: KONTAKT – dort liegt ein Schiff!` : `📡 Radar ${coord(m.scan.r, m.scan.c)}: Gebiet ist frei.`, m.scan.contact ? 'l-hit' : '');
          if (m.scan.contact) Sound.tone(880, 880, .25, .15, 'square');
        }, 1200);
        return 1600;
      }
      return barrage(m, O.bd, sh => {
        O.shots.set(K(sh.r, sh.c), sh.res); G.stats.shots++;
        if (sh.res === 'unknown') return setPeg(O.bd, sh.r, sh.c, 'unk', true);
        if (sh.res !== 'miss') G.stats.hits++;
        setPeg(O.bd, sh.r, sh.c, sh.res === 'miss' ? 'miss' : 'hit', true);
        if (sh.res === 'hit') logAdd(`Du: ${coord(sh.r, sh.c)} – Treffer!`, 'l-hit');
        if (sh.res === 'sunk') {
          O.known.push(sh.ship);
          setTimeout(() => O.bd.ships.appendChild(shipEl(sh.ship.cc, sh.ship.key, sh.ship.r, sh.ship.c, sh.ship.h, 'sunk sunk-enemy', sh.ship.id)), 450);
          megaBoom(O.bd, sh.ship); logAdd(`Versenkt! ${shipName(sh.ship)} geht unter.`, 'l-sunk');
        }
        renderSides();
      });
    }
    if (t === S.mySeat) {
      toast(`${def.icon} ${seatName(by)} setzt ${def.name} gegen dich ein!`);
      logAdd(`${seatName(by)} setzt ${def.icon} ${def.name} gegen dich ein!`, 'l-sunk');
      if (m.type === 'emp') { G.blind = m.blind; for (const s of G.order) fxEmp(G.opp[s].bd); Sound.emp(); updateEmp(); renderSides(); logAdd(`Deine Sensoren sind ${m.blind} Züge lang gestört!`, 'l-hit'); return 1400; }
      if (m.type === 'radar') { fxRadar(G.bd, m.scan); Sound.radar(); logAdd(`${seatName(by)} durchsucht ${coord(m.scan.r, m.scan.c)} mit Radar.`); return 1600; }
      return barrage(m, G.bd, sh => {
        const ship = sh.shipId ? myShipById(sh.shipId) : null;
        G.incoming.set(K(sh.r, sh.c), sh.res);
        setPeg(G.bd, sh.r, sh.c, sh.res === 'miss' ? 'miss' : 'hit', true);
        if (ship) { ship.hits.add(K(sh.r, sh.c)); if (sh.res === 'sunk') { ship.sunk = true; const se = G.bd.ships.querySelector(`[data-id="${ship.id}"]`); if (se) setTimeout(() => se.classList.add('sunk'), 450); megaBoom(G.bd, ship); logAdd(`${shipName(ship)} wurde versenkt!`, 'l-sunk'); } }
        renderSides();
      });
    }
    if (m.type === 'emp' && G.opp[t]) G.opp[t].blind = m.blind;
    logAdd(`${seatName(by)} setzt ${def.icon} ${def.name} gegen ${seatName(t)} ein!`, 'l-sunk');
    toast(`${def.icon} ${seatName(by)} setzt ${def.name} gegen ${seatName(t)} ein!`);
    const O = G.opp[t];
    if (O && m.shots && m.cells) {
      return barrage(m, O.bd, sh => {
        if (sh.res == null) return;
        O.shots.set(K(sh.r, sh.c), sh.res);
        if (sh.res === 'unknown') return setPeg(O.bd, sh.r, sh.c, 'unk', true);
        setPeg(O.bd, sh.r, sh.c, sh.res === 'miss' ? 'miss' : 'hit', true);
        if (sh.res === 'sunk' && sh.ship && !O.known.some(x => x.id === sh.ship.id)) {
          O.known.push(sh.ship);
          setTimeout(() => O.bd.ships.appendChild(shipEl(sh.ship.cc, sh.ship.key, sh.ship.r, sh.ship.c, sh.ship.h, 'sunk sunk-enemy', sh.ship.id)), 450);
          megaBoom(O.bd, sh.ship); logAdd(`${seatName(by)} versenkt ${shipName(sh.ship)} von ${seatName(t)}!`, 'l-sunk');
        }
        renderSides();
      });
    }
    if (O && m.type === 'emp') fxEmp(O.bd);
    if (O && m.type === 'radar' && m.scan) fxRadar(O.bd, m.scan);
    renderSides();
    return 700;
  }

  function barrage(m, bd, apply) {
    const shots = m.shots || [];
    const anySunk = shots.some(x => x.res === 'sunk');
    if (m.type === 'nuke') {
      const [r0, c0] = m.cells[0];
      Sound.nuke();
      const f = el('div', 'screen-flash nuke-flash'); document.body.appendChild(f); setTimeout(() => f.remove(), 1400);
      boomRect(bd, r0, c0, 4, 4, 'NUKE!', true);
      setTimeout(() => shots.forEach(apply), 650);
      return 3200 + (anySunk ? 900 : 0);
    }
    m.cells.forEach(([r, c], i) => setTimeout(() => { Sound.shot(); setTimeout(() => Sound.boom(), 120); shellFx(bd, r, c); }, i * 280));
    shots.forEach(sh => { const i = m.cells.findIndex(([a, b]) => a === sh.r && b === sh.c); setTimeout(() => apply(sh), i * 280 + 200); });
    return 1300 + (anySunk ? 1900 : 0);
  }

  /* ----- Zufallsereignisse ----- */
  function eventBanner(type, txt, affectedMe) {
    const E = EVENTS[type];
    const d = el('div', 'event-card ev-' + type + (affectedMe ? ' me' : ''), `<div class="ev-icon">${E.icon}</div><div class="ev-title">${E.title}</div><div class="ev-txt">${esc(txt)}</div>`);
    $('eventLayer').appendChild(d);
    setTimeout(() => d.classList.add('out'), 3300);
    setTimeout(() => d.remove(), 3900);
    Sound.fanfare();
  }
  function boardOf(seat) { return seat === S.mySeat ? G.bd : G.opp[seat] && G.opp[seat].bd; }
  function onEvent(m) {
    const E = EVENTS[m.type], me = m.seat === S.mySeat;
    const who = me ? 'dir' : seatName(m.seat);
    const whoNom = me ? 'dir' : seatName(m.seat);
    const subj = me ? 'dir' : seatName(m.seat);
    let txt = m.type === 'pirates' ? E.txt(me ? 'dich' : seatName(m.seat), m.from === S.mySeat ? 'dir' : seatName(m.from))
      : m.type === 'bottle' ? E.txt(me ? 'Du' : seatName(m.seat), null, m.bonus) : E.txt(whoNom);
    const own = { diarrhea: 'Dein Kapitän muss dringend … ein Aushilfsschütze übernimmt: deine nächsten 3 Schüsse gehen ein Feld daneben!',
      rum: 'Deine Mannschaft feiert eine Rum-Party – du setzt den nächsten Zug aus!', siren: 'Sirenen verzaubern dich – dein nächster Schuss landet irgendwo auf dem Zielfeld!',
      fish: 'Ein Fischschwarm stört dein Sonar – dein nächster Treffer wird dir zuerst als „Wasser“ gemeldet!',
      whale: 'Ein Wal taucht bei dir auf – deine Gegner sehen kurz, was in diesem Gebiet liegt!', parrot: 'Dein Papagei plappert eine deiner Schiffspositionen aus!' };
    if (me && own[m.type]) txt = own[m.type];
    eventBanner(m.type, txt, me || m.from === S.mySeat);
    logAdd(`${E.icon} ${E.title} ${txt}`, 'l-event');
    const bd = boardOf(m.seat);
    if (m.type === 'iceberg') {
      Sound.iceberg();
      if (me) {
        const ship = myShipById(m.ship.id);
        icebergFx(bd, m.cells[0]);
        setTimeout(() => {
          for (const [r, c] of m.cells) { ship.hits.add(K(r, c)); setPeg(bd, r, c, 'hit', true); }
          if (m.sunk) { ship.sunk = true; const se = bd.ships.querySelector(`[data-id="${ship.id}"]`); if (se) se.classList.add('sunk'); megaBoom(bd, ship); }
          shake(bd.board); renderSides();
        }, 1300);
      } else if (bd) {
        icebergFx(bd, m.wreck ? [m.wreck.r, m.wreck.c] : [rand(N), rand(N)]);
        if (m.wreck) setTimeout(() => revealWreckOn(m.seat, m.wreck), 1300);
      }
      return 3800;
    }
    if (m.type === 'kraken') {
      Sound.kraken();
      const w = m.wreck;
      if (bd) krakenFx(bd, w);
      setTimeout(() => {
        if (me) {
          const ship = myShipById(w.id);
          ship.cells.forEach(k => { ship.hits.add(k); const [r, c] = k.split(',').map(Number); setPeg(bd, r, c, 'hit', true); });
          ship.sunk = true;
          const se = bd.ships.querySelector(`[data-id="${ship.id}"]`); if (se) se.classList.add('sunk', 'dragged');
          renderSides();
        } else if (bd) revealWreckOn(m.seat, w);
      }, 1600);
      return 4200;
    }
    if (m.type === 'pirates') {
      Sound.pirates();
      if (S.seats[m.seat]) S.seats[m.seat].ships++;
      if (S.seats[m.from]) S.seats[m.from].ships--;
      if (me) {
        const s = { ...m.ship, cells: shipCellsArr(m.ship), hits: new Set(), sunk: false };
        pirateFx(bd, s, true);
        setTimeout(() => { G.ships.push(s); bd.ships.appendChild(shipEl(s.cc, s.key, s.r, s.c, s.h, 'captured', s.id)); renderSides(); }, 1500);
        if (G.opp[m.from]) pirateFx(G.opp[m.from].bd, null, false);
      } else if (m.from === S.mySeat) {
        const ship = myShipById(m.lostId);
        pirateFx(G.bd, ship, false);
        setTimeout(() => { const se = G.bd.ships.querySelector(`[data-id="${m.lostId}"]`); if (se) { se.classList.add('stolen'); setTimeout(() => se.remove(), 1200); } G.ships = G.ships.filter(s => s.id !== m.lostId); renderSides(); }, 900);
        if (G.opp[m.seat]) pirateFx(G.opp[m.seat].bd, null, true);
      } else {
        if (G.opp[m.from]) pirateFx(G.opp[m.from].bd, null, false);
        if (G.opp[m.seat]) pirateFx(G.opp[m.seat].bd, null, true);
      }
      renderSides();
      return 4000;
    }
    if (m.type === 'storm') {
      Sound.storm();
      if (bd) stormFx(bd);
      if (me) {
        const moved = new Set(m.moved);
        bd.ships.querySelectorAll('.ship').forEach(e => { if (moved.has(e.dataset.id)) e.classList.add('blown'); });
        setTimeout(() => {
          for (const ns of m.ships) { const s = myShipById(ns.id); if (s && moved.has(s.id)) Object.assign(s, { r: ns.r, c: ns.c, h: ns.h, cells: shipCellsArr(ns) }); }
          bd.ships.innerHTML = '';
          for (const s of G.ships) bd.ships.appendChild(shipEl(s.cc, s.key, s.r, s.c, s.h, (s.sunk ? 'sunk' : '') + (moved.has(s.id) ? ' landed' : ''), s.id));
        }, 1500);
      }
      return 3800;
    }
    if (m.type === 'whale') {
      Sound.whale();
      const [r0, c0] = m.area;
      if (bd) whaleFx(bd, r0, c0);
      if (!me && G.opp[m.seat]) setTimeout(() => {
        const O = G.opp[m.seat];
        clearMarks(O, 'whale');
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const occ = m.occupied.some(([a, b]) => a === r0 + i && b === c0 + j);
          addMark(O, r0 + i, c0 + j, occ ? 'whale occ' : 'whale empty', occ ? '🐋' : '');
        }
        logAdd(`🐋 Wal-Sichtung bei ${seatName(m.seat)}: ${m.occupied.length ? m.occupied.map(([a, b]) => coord(a, b)).join(', ') : 'keine Schiffe'} im Gebiet ${coord(r0, c0)}–${coord(r0 + 2, c0 + 2)}.`, 'l-event');
      }, 1500);
      return 3600;
    }
    if (m.type === 'parrot') {
      Sound.parrot();
      if (bd) parrotFx(bd, m.cell);
      if (!me && G.opp[m.seat]) setTimeout(() => { addMark(G.opp[m.seat], m.cell[0], m.cell[1], 'parrot', '🦜'); logAdd(`🦜 Der Papagei verrät: ${seatName(m.seat)} hat ein Schiff auf ${coord(m.cell[0], m.cell[1])}!`, 'l-event'); }, 1600);
      else if (me) setTimeout(() => logAdd(`🦜 Dein Papagei hat ${coord(m.cell[0], m.cell[1])} verraten.`, 'l-event'), 1600);
      return 3400;
    }
    if (m.type === 'rum') {
      Sound.rum();
      if (bd) rumFx(bd);
      if (me) G.skip = 1; else if (G.opp[m.seat]) G.opp[m.seat].skip = 1;
      renderSides();
      return 3400;
    }
    if (m.type === 'repair') {
      Sound.repair();
      const [r, c] = m.cell;
      if (bd) repairFx(bd, r, c);
      setTimeout(() => {
        if (me) { const ship = myShipById(m.shipId); if (ship) ship.hits.delete(K(r, c)); G.incoming.delete(K(r, c)); clearPeg(bd, r, c); }
        else if (G.opp[m.seat]) { G.opp[m.seat].shots.delete(K(r, c)); clearPeg(G.opp[m.seat].bd, r, c); logAdd(`🛠️ ${coord(r, c)} bei ${seatName(m.seat)} ist wieder repariert – du kannst nochmal draufschießen!`, 'l-event'); }
        renderSides();
      }, 1400);
      return 3200;
    }
    if (m.type === 'fog') {
      Sound.fog();
      G.fog[m.seat] = 1; applyFog();
      return 3000;
    }
    if (m.type === 'siren') {
      Sound.siren();
      if (me) { G.siren = 1; for (const s of G.order) sirenFx(G.opp[s].bd); } else sirenFx(G.bd);
      setTurnUI();
      return 3400;
    }
    if (m.type === 'bottle') {
      Sound.bottle();
      if (bd) bottleFx(bd);
      if (me) {
        if (m.bonus === 'radar') { const r = G.powers.find(p => p.type === 'radar'); if (r) { r.uses++; r.max = Math.max(r.max || 1, r.uses); } else G.powers.push({ type: 'radar', uses: 1, max: 1 }); renderPowerBar(); }
        else G.extra = (G.extra || 0) + 1;
      }
      setTurnUI();
      return 3200;
    }
    if (m.type === 'fish') {
      Sound.fish();
      if (me) { G.fish = 1; for (const s of G.order) fishFx(G.opp[s].bd); }
      else fishFx(G.bd);
      setTurnUI();
      return 3200;
    }
    if (m.type === 'mutiny') {
      Sound.mutiny();
      if (bd) mutinyFx(bd);
      if (me) {
        const moved = new Set(m.moved);
        bd.ships.querySelectorAll('.ship').forEach(e => { if (moved.has(e.dataset.id)) e.classList.add('blown'); });
        setTimeout(() => {
          for (const ns of m.ships) {
            const sh = myShipById(ns.id); if (!sh || !moved.has(sh.id)) continue;
            sh.cells.forEach(k => { if (sh.hits.has(k)) { const [r, c] = k.split(',').map(Number); clearPeg(bd, r, c); G.incoming.delete(k); } });
            Object.assign(sh, { r: ns.r, c: ns.c, h: ns.h, cells: shipCellsArr(ns) });
            sh.hits = new Set(ns.hits.map(([r, c]) => K(r, c)));
          }
          bd.ships.innerHTML = '';
          for (const sh of G.ships) bd.ships.appendChild(shipEl(sh.cc, sh.key, sh.r, sh.c, sh.h, (sh.sunk ? 'sunk' : '') + (moved.has(sh.id) ? ' landed' : ''), sh.id));
          for (const [k, v] of G.incoming) { const [r, c] = k.split(',').map(Number); setPeg(bd, r, c, v === 'miss' ? 'miss' : 'hit'); }
          for (const sh of G.ships) for (const k of sh.hits) { const [r, c] = k.split(',').map(Number); setPeg(bd, r, c, 'hit'); }
        }, 1500);
      } else if (G.opp[m.seat]) {
        setTimeout(() => {
          const O = G.opp[m.seat];
          for (const [r, c] of m.cleared || []) { O.shots.delete(K(r, c)); clearPeg(O.bd, r, c); }
          if ((m.cleared || []).length) logAdd(`⚔️ Die getroffenen Schiffe von ${seatName(m.seat)} sind weg – deine Treffer dort sind verschwunden!`, 'l-event');
        }, 1500);
      }
      return 3600;
    }
    if (m.type === 'wave') {
      Sound.wave();
      if (bd) waveFx(bd, m.row, m.idx);
      setTimeout(() => {
        if (me) {
          for (const [r, c, id] of m.hits) { const sh = myShipById(id); if (sh) sh.hits.add(K(r, c)); setPeg(bd, r, c, 'hit', true); }
          for (const w of m.wrecks) { const sh = myShipById(w.id); if (sh) { sh.sunk = true; const se = bd.ships.querySelector(`[data-id="${w.id}"]`); if (se) se.classList.add('sunk'); megaBoom(bd, sh); } }
          if (m.hits.length) shake(bd.board);
          logAdd(m.hits.length ? `🌊 Die Welle hat ${m.hits.length} deiner Schiffe beschädigt!` : '🌊 Glück gehabt – die Welle hat keins deiner Schiffe erwischt.', 'l-event');
        } else {
          for (const w of m.wrecks) revealWreckOn(m.seat, w);
          logAdd(`🌊 Die Welle trifft ${m.count} Schiff${m.count === 1 ? '' : 'e'} von ${seatName(m.seat)}.`, 'l-event');
        }
        renderSides();
      }, 1300);
      return 3600 + (m.wrecks && m.wrecks.length ? 1500 : 0);
    }
    if (m.type === 'diarrhea') {
      Sound.diarrhea();
      if (me) { G.drunk = m.shots; for (const s of G.order) diarrheaFx(G.opp[s].bd); }
      else if (G.opp[m.seat]) { G.opp[m.seat].drunk = m.shots; diarrheaFx(G.bd); }
      renderSides(); setTurnUI();
      return 3500;
    }
    return 3000;
  }
  function addMark(O, r, c, cls, html) {
    const d = el('div', 'mark ' + cls, html);
    Object.assign(d.style, { left: c * 10 + '%', top: r * 10 + '%' });
    d.dataset.k = K(r, c);
    O.bd.ships.appendChild(d);
  }
  function clearMarks(O, cls) { O.bd.ships.querySelectorAll('.mark.' + cls).forEach(e => e.remove()); }
  function clearPeg(bd, r, c) { const p = bd.peg(r, c); p.className = 'peg'; p.innerHTML = ''; bd.cell(r, c).classList.remove('shot'); }
  function applyFog() {
    if (!G) return;
    G.bd.board.classList.toggle('fog', (G.fog[S.mySeat] || 0) > 0);
    for (const s of G.order) G.opp[s].bd.board.classList.toggle('fog', (G.fog[s] || 0) > 0);
  }
  function revealWreckOn(seat, w) {
    const O = G.opp[seat]; if (!O) return;
    if (!O.known.some(x => x.id === w.id)) O.known.push(w);
    const cells = shipCellsArr(w);
    cells.forEach(k => { if (O.shots.get(k) !== 'miss') O.shots.set(k, 'hit'); const [r, c] = k.split(',').map(Number); setPeg(O.bd, r, c, 'hit', true); });
    O.bd.ships.appendChild(shipEl(w.cc, w.key, w.r, w.c, w.h, 'sunk sunk-enemy', w.id));
    renderSides();
  }

  function onEliminated(m) {
    const st = S.seats[m.seat]; if (st) { st.out = true; st.place = m.place; }
    if (m.seat === S.mySeat) {
      G.out = true;
      if (S.msize === 3 && m.place > 1) {
        logAdd(`💀 Deine Flotte ist versenkt – Platz ${m.place}.`, 'l-hit');
        modal(`<h2 class="lose" style="font-size:36px">AUSGESCHIEDEN</h2><p>Deine Flotte liegt am Meeresgrund – <b>Platz ${m.place}</b>${m.forfeit ? ' (aufgegeben)' : ''}. Die anderen kämpfen weiter.</p>
          <div class="modal-btns"><button class="btn primary" id="mWatch">👀 Weiter zuschauen</button><button class="btn" id="mMenu">Hauptmenü</button></div>`);
        $('mWatch').onclick = closeModal; $('mMenu').onclick = () => toMenu(true);
        Sound.lose();
      }
    } else {
      const O = G.opp[m.seat];
      if (O) for (const s of m.ships || []) if (!O.known.some(x => x.id === s.id)) O.bd.ships.appendChild(shipEl(s.cc, s.key, s.r, s.c, s.h, 'reveal', s.id));
      logAdd(`💀 ${seatName(m.seat)} ist ${m.forfeit ? 'ausgestiegen' : 'ausgeschieden'}${S.msize === 3 ? ` (Platz ${m.place})` : ''}.`, 'l-sunk');
      if (S.msize === 3 && !G.over) toast(`💀 ${seatName(m.seat)} ist raus!`, 3000);
    }
    renderSides(); setTurnUI();
    return 600;
  }

  function onGameover(m) {
    G.over = true; G.busy = false; G.arm = null; clearTimeout(G.busyT);
    if (m.forfeit) G.forfeit = true;
    for (const s of G.order) {
      const O = G.opp[s];
      for (const [r, c, v] of (m.reveal && m.reveal[s]) || []) if (O.shots.get(K(r, c)) === 'unknown') { O.shots.set(K(r, c), v); setPeg(O.bd, r, c, pegType(v)); }
      for (const sh of (m.ships && m.ships[s]) || []) if (!O.known.some(x => x.id === sh.id) && !O.bd.ships.querySelector(`[data-id="${sh.id}"]`)) O.bd.ships.appendChild(shipEl(sh.cc, sh.key, sh.r, sh.c, sh.h, 'reveal', sh.id));
      O.bd.host.classList.add('locked');
    }
    m.places.forEach((p, i) => { if (S.seats[i]) S.seats[i].place = p; });
    const won = m.winner === S.mySeat;
    const st = $('status');
    st.className = 'status ' + (won ? 'win' : 'lose');
    st.textContent = won ? '🏆 Sieg! Alle feindlichen Flotten sind vernichtet.' : `💀 ${m.winner != null ? seatName(m.winner) + ' gewinnt.' : 'Spiel beendet.'}`;
    $('side-me').style.opacity = 1;
    renderPowerBar(); renderSides();
    if (!(G.out && S.msize === 3 && !won)) won ? Sound.win() : Sound.lose();
    setTimeout(() => showEnd(won), 1300);
    return 0;
  }

  function showEnd(won) {
    const acc = G.stats.shots ? Math.round(G.stats.hits / G.stats.shots * 100) : 0;
    const stats = `<div class="stats"><div><b>${G.stats.shots}</b><small>Schüsse</small></div><div><b>${G.stats.hits}</b><small>Treffer</small></div><div><b>${acc}%</b><small>Quote</small></div></div>`;
    const ranking = S.msize === 3 ? `<div class="ranking">${S.seats.slice().sort((a, b) => (a.place || 9) - (b.place || 9)).map(s => `<div class="rk${s.seat === S.mySeat ? ' me' : ''}"><span>${['🥇', '🥈', '🥉'][(s.place || 3) - 1]}</span>${flagSVG(s.country)}<b>${esc(s.name)}</b></div>`).join('')}</div>` : '';
    const title = won ? 'SIEG!' : S.msize === 3 && S.seats[S.mySeat].place === 2 ? 'PLATZ 2' : 'VERLOREN';
    if (S.tcode) {
      modal(`<h2 class="${won ? 'win' : 'lose'}">${title}</h2>
        <p>${won ? `Stark, Kapitän ${esc(S.name)}! Du bist eine Runde weiter.${G.forfeit ? ' (Dein Gegner hat aufgegeben.)' : ''}` : `${esc(seatName(G.order[0]))} war stärker – du bist leider ausgeschieden.`}</p>
        ${stats}<button class="btn primary" id="mTour">🏆 Zur Turnierübersicht</button><button class="btn ghost small" id="mView">Spielfeld ansehen</button>`);
      $('mTour').onclick = () => { closeModal(); showTourney(); };
      $('mView').onclick = () => { closeModal(); const b = el('button', 'btn small', 'Turnierübersicht'); b.style.marginLeft = '10px'; b.onclick = () => showTourney(); $('status').appendChild(b); };
      return;
    }
    const winnerName = S.seats.find(s => s.place === 1);
    modal(`<h2 class="${won ? 'win' : 'lose'}">${title}</h2>
      <p>${won ? `Glückwunsch, Kapitän ${esc(S.name)}!` : `${esc(winnerName ? winnerName.name : '?')} hat gewonnen.`}</p>
      ${ranking}${stats}
      <p class="small-hint">Bei der Revanche kannst du vor dem Aufstellen deine Fraktion neu wählen.</p>
      <div class="modal-btns"><button class="btn primary" id="mRematch">Revanche</button><button class="btn" id="mMenu">Hauptmenü</button></div>
      <button class="btn ghost small" id="mView">Spielfeld ansehen</button>`);
    $('mRematch').onclick = () => {
      socket.emit('rematch');
      if (!S.solo) { $('mRematch').disabled = true; $('mRematch').textContent = 'Warte auf die anderen …'; }
    };
    $('mMenu').onclick = () => toMenu(true);
    $('mView').onclick = () => { closeModal(); const b = el('button', 'btn small', 'Ergebnis'); b.style.marginLeft = '10px'; b.onclick = () => showEnd(won); $('status').appendChild(b); };
  }

  $('btnSurrender').onclick = () => {
    if (!G || G.over || G.out) return;
    modal(`<h2 style="font-size:30px">Aufgeben?</h2><p>${S.tcode ? 'Dein Gegner gewinnt und du scheidest aus dem Turnier aus.' : S.msize === 3 ? 'Du scheidest aus, die anderen spielen weiter.' : S.solo ? 'Die Partie wird als Niederlage gewertet.' : 'Du verlässt das Online-Spiel.'}</p>
      <div class="modal-btns"><button class="btn danger" id="mYes">Aufgeben</button><button class="btn" id="mNo">Weiterspielen</button></div>`);
    $('mNo').onclick = closeModal;
    $('mYes').onclick = () => {
      closeModal();
      if (S.tcode || S.msize === 3) { socket.emit('leave'); return; }
      if (S.solo) { toMenu(true); return; }
      toMenu(true);
    };
  };
  function confirmLeave() {
    modal(`<h2 style="font-size:30px">Zum Hauptmenü?</h2><p>${S.tcode ? 'Du verlässt das Turnier.' : 'Das laufende Spiel wird beendet.'}</p>
      <div class="modal-btns"><button class="btn danger" id="mYes">Verlassen</button><button class="btn" id="mNo">Bleiben</button></div>`);
    $('mNo').onclick = closeModal; $('mYes').onclick = () => toMenu(true);
  }
  function toMenu(leave) {
    closeModal();
    if (leave && socket) { if (S.tcode) socket.emit('tleave'); else if (S.code) socket.emit('leave'); }
    sess.clear(); S.code = null; S.pid = null; S.tcode = null; S.tour = null; S.tround = null; S.solo = false; G = null; P.board = null;
    show('scrMenu');
  }

  /* ================= Effekte ================= */
  function megaBoom(bd, s) { const len = s.len || LEN[s.key]; boomRect(bd, s.r, s.c, s.h ? len : 1, s.h ? 1 : len, 'VERSENKT!', false); }
  function boomRect(bd, r0, c0, w, h, label, nuke) {
    const cell = bd.board.clientWidth / N, len = Math.max(w, h);
    const box = el('div', 'fx-sink' + (nuke ? ' nuke' : ''));
    Object.assign(box.style, { left: c0 * 10 + '%', top: r0 * 10 + '%', width: w * 10 + '%', height: h * 10 + '%' });
    box.style.setProperty('--cell', cell + 'px');
    box.appendChild(el('div', 'core'));
    const nfb = nuke ? 26 : len * 4;
    for (let i = 0; i < nfb; i++) {
      const f = el('div', 'fb');
      let x, y;
      if (nuke) { x = 10 + Math.random() * 80; y = 10 + Math.random() * 80; }
      else { const t = ((i % len) + .2 + Math.random() * .6) / len, j = 25 + Math.random() * 50; x = w > 1 ? t * 100 : j; y = w > 1 ? j : t * 100; }
      f.style.setProperty('--x', x + '%'); f.style.setProperty('--y', y + '%');
      f.style.setProperty('--d', (nuke ? rand(500) : Math.floor(i / len) * 160 + (i % len) * 90 + rand(60)) + 'ms');
      f.style.setProperty('--s', ((nuke ? 1.3 : .8) + Math.random() * 1.1).toFixed(2));
      box.appendChild(f);
    }
    for (let i = 0; i < 3; i++) { const r = el('div', 'ring'); r.style.setProperty('--d', i * 180 + 'ms'); r.style.setProperty('--rs', (len + (nuke ? 6 : 2.5) - i * .6) * cell + 'px'); box.appendChild(r); }
    for (let i = 0; i < (nuke ? 40 : 26); i++) {
      const p = el('div', 'sp');
      p.style.setProperty('--a', rand(360) + 'deg'); p.style.setProperty('--dist', ((.8 + Math.random() * 1.8) * cell * (1 + len / 3)) + 'px');
      p.style.setProperty('--d', rand(350) + 'ms'); box.appendChild(p);
    }
    const nsm = nuke ? 10 : len * 2;
    for (let i = 0; i < nsm; i++) {
      const m = el('div', 'smoke'), t = (i + .5) / nsm;
      m.style.setProperty('--x', (nuke ? 15 + Math.random() * 70 : w > 1 ? t * 100 : 50) + '%'); m.style.setProperty('--y', (nuke ? 30 + Math.random() * 50 : w > 1 ? 50 : t * 100) + '%');
      m.style.setProperty('--d', (500 + rand(500)) + 'ms'); m.style.setProperty('--dx', (rand(40) - 20) + 'px');
      box.appendChild(m);
    }
    if (nuke) box.appendChild(el('div', 'mushroom', '<i class="stem"></i><i class="cap"></i>'));
    const banner = el('div', 'sunk-banner' + (nuke ? ' nuke-banner' : ''), label);
    bd.fx.append(box, banner);
    const flash = el('div', 'screen-flash'); document.body.appendChild(flash);
    const battle = $('battle'); battle.classList.remove('shake-big'); void battle.offsetWidth; battle.classList.add('shake-big');
    if (!nuke) { for (let i = 0; i < Math.min(len, 4); i++) setTimeout(() => Sound.boom(), i * 170); setTimeout(() => Sound.sunk(), 250); }
    setTimeout(() => { box.remove(); banner.remove(); flash.remove(); }, nuke ? 3600 : 3200);
  }
  function fxEmp(bd) {
    const d = el('div', 'fx-emp', '<i></i><i></i><i></i>');
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 1600);
    const f = el('div', 'screen-flash emp-flash'); document.body.appendChild(f); setTimeout(() => f.remove(), 700);
  }
  function fxRadar(bd, sc) {
    const d = el('div', 'fx-radar', '<i></i>');
    Object.assign(d.style, { left: sc.c * 10 + '%', top: sc.r * 10 + '%', width: '20%', height: '20%' });
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 1500);
  }
  function drawScan(O, sc) {
    const d = el('div', 'scan ' + (sc.contact ? 'contact' : 'clear'), `<span>${sc.contact ? 'KONTAKT' : 'FREI'}</span>`);
    Object.assign(d.style, { left: sc.c * 10 + '%', top: sc.r * 10 + '%', width: '20%', height: '20%' });
    O.bd.ships.appendChild(d);
  }
  function shellFx(bd, r, c) {
    const d = el('div', 'fx-shell');
    Object.assign(d.style, { left: c * 10 + '%', top: r * 10 + '%', width: '10%', height: '10%' });
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 700);
  }
  function driftFx(bd, [ar, ac], [r, c], icon = '🎯') {
    const d = el('div', 'fx-drift', icon);
    Object.assign(d.style, { left: ac * 10 + '%', top: ar * 10 + '%' });
    d.style.setProperty('--dx', (c - ac) * 100 + '%'); d.style.setProperty('--dy', (r - ar) * 100 + '%');
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 1200);
  }
  function icebergFx(bd, [r, c]) {
    const d = el('div', 'fx-iceberg', '<div class="berg"></div><div class="crack"></div>');
    Object.assign(d.style, { left: c * 10 + '%', top: r * 10 + '%' });
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 3600);
  }
  function krakenFx(bd, w) {
    const d = el('div', 'fx-kraken');
    const len = w.len, ww = w.h ? len : 1, hh = w.h ? 1 : len;
    Object.assign(d.style, { left: w.c * 10 + '%', top: w.r * 10 + '%', width: ww * 10 + '%', height: hh * 10 + '%' });
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = el('i', 'tentacle');
      const along = (i + .5) / n * 100, side = i % 2 ? -1 : 1;
      t.style.left = (w.h ? along : 50 + side * 38) + '%'; t.style.top = (w.h ? 50 + side * 38 : along) + '%';
      t.style.setProperty('--rot', (w.h ? (side > 0 ? 180 : 0) : (side > 0 ? 90 : -90)) + rand(30) - 15 + 'deg');
      t.style.setProperty('--d', i * 120 + 'ms');
      d.appendChild(t);
    }
    d.appendChild(el('div', 'whirl'));
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 4000);
  }
  function pirateFx(bd, ship, arriving) {
    if (!bd) return;
    const d = el('div', 'fx-pirate' + (arriving ? ' arrive' : ' leave'), '<div class="psail">🏴‍☠️</div>');
    if (ship) Object.assign(d.style, { left: ship.c * 10 + '%', top: ship.r * 10 + '%' });
    else Object.assign(d.style, { left: '45%', top: '45%' });
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 3200);
  }
  function stormFx(bd) {
    const d = el('div', 'fx-storm', '<i></i><i></i><i></i><i></i><i></i><div class="vortex">🌪️</div>');
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 3500);
    bd.board.classList.add('stormy'); setTimeout(() => bd.board.classList.remove('stormy'), 3200);
  }
  function fxIcon(bd, cls, html, ms = 3300, pos) {
    const d = el('div', 'fx-ev ' + cls, html);
    if (pos) Object.assign(d.style, pos);
    bd.fx.appendChild(d); setTimeout(() => d.remove(), ms);
    return d;
  }
  function whaleFx(bd, r0, c0) {
    fxIcon(bd, 'fx-whale', '<div class="whale">🐋</div><div class="spout"></div>', 3400, { left: c0 * 10 + '%', top: r0 * 10 + '%', width: '30%', height: '30%' });
  }
  function parrotFx(bd, [r, c]) {
    fxIcon(bd, 'fx-parrot', '<div class="bird">🦜</div><div class="squawk">KRÄÄH!</div>', 3200, { left: c * 10 + '%', top: r * 10 + '%', width: '10%', height: '10%' });
  }
  function rumFx(bd) {
    fxIcon(bd, 'fx-rum', '<span>🍺</span><span>🍻</span><span>🍺</span><div class="hic">hicks!</div>', 3200);
    bd.board.classList.add('tipsy'); setTimeout(() => bd.board.classList.remove('tipsy'), 3000);
  }
  function repairFx(bd, r, c) {
    fxIcon(bd, 'fx-repair', '<div class="tool">🔧</div><i></i><i></i><i></i><i></i>', 2600, { left: c * 10 + '%', top: r * 10 + '%', width: '10%', height: '10%' });
  }
  function sirenFx(bd) { fxIcon(bd, 'fx-siren', '<div class="mermaid">🧜‍♀️</div><span>🎵</span><span>🎶</span><span>🎵</span>', 3300); }
  function bottleFx(bd) { fxIcon(bd, 'fx-bottle', '<div class="btl">🍾</div><div class="scroll">📜</div>', 3100); }
  function fishFx(bd) { fxIcon(bd, 'fx-fish', '<span>🐟</span><span>🐠</span><span>🐟</span><span>🐡</span><span>🐟</span><span>🐠</span><span>🐟</span>', 3100); }
  function mutinyFx(bd) {
    fxIcon(bd, 'fx-mutiny', '<div class="swords">⚔️</div><div class="flag">🏴</div>', 3300);
    bd.board.classList.add('tipsy'); setTimeout(() => bd.board.classList.remove('tipsy'), 1500);
  }
  function waveFx(bd, row, idx) {
    const pos = row ? { left: '0', top: idx * 10 + '%', width: '100%', height: '10%' } : { left: idx * 10 + '%', top: '0', width: '10%', height: '100%' };
    fxIcon(bd, 'fx-wave ' + (row ? 'row' : 'col'), '<div class="crest"></div><div class="wv">🌊</div>', 3200, pos);
  }
  function diarrheaFx(bd) {
    const d = el('div', 'fx-diarrhea', '<div class="dia-icon">🚽</div><div class="dia-wave"></div>');
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 3200);
  }

  /* ================= Online ================= */
  const socket = (!window.__noSocket && window.io) ? window.io() : null;
  const params = new URLSearchParams(location.search);
  const inviteCode = (params.get('room') || '').toUpperCase().slice(0, 5);
  if (!socket) {
    $('onlineHint').textContent = 'Das Spiel muss über den Server laufen (Link öffnen).';
    ['btnHost', 'btnJoin', 'btnCpu', 'btnTourney'].forEach(b => $(b).disabled = true);
  }
  function setInviteMode(on) {
    $('joinInvite').classList.toggle('hidden', !on);
    $('modeField').classList.toggle('hidden', on);
    document.querySelector('.modes').classList.toggle('hidden', on);
  }
  const modeTxt = (pu, ev, size) => `${size === 3 ? '🔱 3 Spieler · ' : ''}${pu ? '⚡ Mit Power-ups' : '⚓ Klassisch'}${ev ? ' · 🎲 Zufallsereignisse' : ''}`;
  if (inviteCode && socket) {
    setInviteMode(true); $('inviteCode').textContent = inviteCode; $('inCode').value = inviteCode;
    socket.emit('peek', { code: inviteCode }, res => {
      if (!res.ok) { $('inviteInfo').innerHTML = `<span class="err">${esc(res.error)}</span>`; $('btnAcceptInvite').disabled = true; return; }
      S.inviteTourney = !!res.tourney;
      $('inviteInfo').innerHTML = (res.tourney
        ? `🏆 <b>Turnier</b> von ${flagSVG(res.hostCountry)} <b>${esc(res.host)}</b> · ${res.count} Spieler angemeldet`
        : `${flagSVG(res.hostCountry)} <b>${esc(res.host)}</b> fordert dich heraus${res.size === 3 ? ` · 3-Spieler-Partie (${res.count}/3)` : ''}`) +
        `<br>Regeln: <b>${modeTxt(res.powerups, res.events, res.size)}</b> <small>(vom Gastgeber festgelegt)</small>`;
    });
  }
  $('btnIgnoreInvite').onclick = () => { setInviteMode(false); $('inCode').value = ''; history.replaceState(null, '', location.pathname); };

  $('btnCpu').onclick = () => {
    if (!getName() || !socket) return;
    Sound.click();
    socket.emit('solo', { name: S.name, country: S.country, diff: S.diff, size: S.size, powerups: S.pmode === 'power', events: S.events }, res => {
      if (!res.ok) return toast('Spiel konnte nicht gestartet werden.');
      S.code = res.code; S.pid = res.pid; S.solo = true;
      sess.set({ code: S.code, pid: S.pid });
    });
  };
  function joinRoom(code) {
    if (!getName() || !socket) return;
    code = (code || '').toUpperCase().trim();
    if (code.length < 5) { toast('Bitte den 5-stelligen Code eingeben.'); return; }
    socket.emit('join', { code, name: S.name, country: S.country }, res => {
      if (!res.ok && res.tourney) return joinTourney(code);
      if (!res.ok) { toast(res.error || 'Beitritt fehlgeschlagen.'); Sound.err(); return; }
      S.code = res.code; S.pid = res.pid; S.solo = false;
      sess.set({ code: S.code, pid: S.pid });
      history.replaceState(null, '', location.pathname);
      setInviteMode(false);
      if (res.size === 3) showLobby(res.size, false);
    });
  }
  $('btnJoin').onclick = () => joinRoom($('inCode').value);
  $('inCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('inCode').value); });
  $('btnHost').onclick = () => {
    if (!getName() || !socket) return;
    Sound.click();
    socket.emit('create', { name: S.name, country: S.country, size: S.size, powerups: S.pmode === 'power', events: S.events }, res => {
      if (!res.ok) return toast('Raum konnte nicht erstellt werden.');
      S.code = res.code; S.pid = res.pid; S.solo = false;
      sess.set({ code: S.code, pid: S.pid });
      showLobby(res.size, true);
    });
  };
  function showLobby(size, host) {
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    $('lobbyTitle').textContent = host ? (size === 3 ? '3er-Raum erstellt' : 'Raum erstellt') : 'Beigetreten – warte auf Mitspieler';
    $('lobbyCode').textContent = S.code; $('lobbyLink').value = link;
    $('btnShare').classList.toggle('hidden', !navigator.share);
    $('lobbyMode').textContent = host ? 'Regeln: ' + modeTxt(S.pmode === 'power', S.events, size) : '';
    $('lobbyWait').textContent = size === 3 ? 'Warte auf Mitspieler (3 werden gebraucht) …' : 'Warte auf Gegner …';
    show('scrLobby');
  }
  socket && socket.on('lobby', L => {
    if (S.screen !== 'scrLobby') showLobby(L.size, L.isHost);
    $('lobbyMode').textContent = 'Regeln: ' + modeTxt(L.powerups, L.events, L.size);
    $('lobbyPlayers').innerHTML = L.size === 3 ? L.players.map(p => `<div class="t-part${p.me ? ' me' : ''}">${flagSVG(p.country)}<span>${esc(p.name)}${p.me ? ' <i>(du)</i>' : ''}</span></div>`).join('') + (L.players.length < 3 ? '<div class="t-part ghost">⏳ <span>freier Platz</span></div>' : '') : '';
    $('btnFillBots').classList.toggle('hidden', !(L.isHost && L.size === 3 && L.players.length === 2));
  });
  $('btnFillBots').onclick = () => { Sound.click(); socket.emit('fillBots'); };
  $('btnCopy').onclick = async () => {
    const v = $('lobbyLink').value;
    try { await navigator.clipboard.writeText(v); } catch { $('lobbyLink').select(); document.execCommand('copy'); }
    toast('Link kopiert!');
  };
  $('btnShare').onclick = () => navigator.share({ title: 'Schiffe versenken', text: `${S.name} fordert dich zu einer Partie Schiffe versenken heraus!`, url: $('lobbyLink').value }).catch(() => { });
  $('btnLobbyCancel').onclick = () => toMenu(true);

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.key === 'r' || e.key === 'R') && S.screen === 'scrPlace') rotate();
    if (S.screen === 'scrBattle' && G && G.arm) {
      if (e.key === 'Escape') { G.arm = null; clearPreview(); renderPowerBar(); }
      if ((e.key === 'r' || e.key === 'R') && G.arm.type === 'artillery') { G.armH = !G.armH; refreshPreview(); }
    }
  });

  function applyMatched(m) {
    S.seats = m.seats; S.mySeat = m.mySeat; S.msize = m.size; S.powerups = m.powerups; S.mevents = m.events; S.nPowers = m.nPowers;
    S.tround = m.tourney ? m.round : null; S.solo = !!m.solo; S.code = m.code || S.code;
    if (m.seats[m.mySeat]) { S.country = m.seats[m.mySeat].country; S.name = m.seats[m.mySeat].name; }
  }

  if (socket) {
    socket.on('connect', () => {
      const ss = sess.get();
      if (!ss) return;
      socket.emit('rejoin', ss, res => {
        if (!res.ok) { if (S.code || S.tcode) { toast('Das Spiel existiert nicht mehr.'); toMenu(false); } else sess.clear(); return; }
        S.pid = ss.pid;
        if (res.tourney) {
          S.tcode = ss.tcode; S.tour = res.tourney;
          if (res.state) applySync(res.state);
          else if (!['scrPlace', 'scrBattle'].includes(S.screen) || !G) showTourney();
          return;
        }
        if (res.lobby) { S.code = res.code; if (S.screen !== 'scrLobby') showLobby(res.size, false); return; }
        applySync(res.state);
      });
    });
    socket.on('disconnect', () => { if (S.code || S.tcode) toast('Verbindung unterbrochen – verbinde neu …', 4000); });
    socket.on('matched', m => {
      applyMatched(m);
      G = null; Q = Promise.resolve(); initPlacement(); Sound.ping();
      if (m.tourney) { diceFx(); toast(`🎲 Runde ${m.round} ausgelost – dein Gegner: ${m.seats.find(s => s.seat !== m.mySeat).name}`, 4000); }
      else if (!m.solo) toast(m.size === 3 ? 'Alle an Bord! Stellt eure Flotten auf.' : `${m.seats.find(s => s.seat !== m.mySeat).name} ist an Bord! Stellt eure Flotten auf.`);
    });
    socket.on('oppCountry', ({ seat, country }) => {
      if (!S.seats[seat] || !COUNTRIES[country]) return;
      S.seats[seat].country = country;
      if (S.screen === 'scrPlace') renderPlaceVs();
      toast(`${S.seats[seat].name} kommandiert jetzt: ${COUNTRIES[country].name}`);
    });
    socket.on('oppReady', ({ seat }) => {
      if (S.seats[seat]) S.seats[seat].ready = true;
      if (S.screen === 'scrPlace') { renderPlaceVs(); if (P.locked) showWait(); }
    });
    socket.on('start', ({ turn }) => {
      newGame(FLEET.map(f => ({ id: f.key, key: f.key, cc: S.country, len: f.len, ...P.placed[f.key] })));
      G.powers = P.powers.map(t => ({ type: t, uses: t === 'artillery' ? 2 : 1, max: t === 'artillery' ? 2 : 1 }));
      G.turn = turn;
      renderBattle();
      logAdd(turn === S.mySeat ? 'Das Los hat entschieden: Du beginnst!' : `Das Los hat entschieden: ${seatName(turn)} beginnt.`);
      if (turn === S.mySeat) Sound.ping();
    });
    socket.on('turn', ({ turn, again, extra, fog }) => enqueue(() => {
      if (!G) return 0;
      G.busy = false; G.turn = turn; G.again = again;
      if (fog) { G.fog = fog; applyFog(); }
      if (extra && turn === S.mySeat) { G.extra = Math.max(0, (G.extra || 0) - 1); G.again = false; toast('🍾 Extraschuss aus der Flaschenpost – du bist nochmal dran!'); }
      if (G.skip && turn !== S.mySeat) { /* bleibt bis 'skipped' */ }
      setTurnUI();
      if (turn === S.mySeat && !again) Sound.ping();
      return 0;
    }));
    socket.on('shot', m => enqueue(() => G ? onShot(m) : 0));
    socket.on('power', m => enqueue(() => G ? onPower(m) : 0));
    socket.on('event', m => enqueue(() => G ? onEvent(m) : 0));
    socket.on('eliminated', m => enqueue(() => G ? onEliminated(m) : 0));
    socket.on('gameover', m => enqueue(() => G ? onGameover(m) : 0));
    socket.on('skipped', ({ seat }) => enqueue(() => {
      if (!G) return 0;
      if (seat === S.mySeat) G.skip = 0; else if (G.opp[seat]) G.opp[seat].skip = 0;
      const msg = seat === S.mySeat ? '🍺 Du setzt diesen Zug aus – Kater nach der Rum-Party!' : `🍺 ${seatName(seat)} setzt aus – Kater nach der Rum-Party!`;
      logAdd(msg, 'l-event'); toast(msg, 2500); Sound.tone(300, 150, .4, .15, 'triangle');
      const bd = boardOf(seat); if (bd) rumFx(bd);
      renderSides();
      return 1400;
    }));
    socket.on('fishReveal', ({ target, r, c, res, ship }) => enqueue(() => {
      if (!G || !G.opp[target]) return 0;
      const O = G.opp[target];
      O.shots.set(K(r, c), res); G.stats.hits++; G.fish = 0;
      setPeg(O.bd, r, c, 'hit', true); Sound.boom();
      logAdd(`🐟 Die Fische sind weg: ${coord(r, c)} war doch ein Treffer!`, 'l-hit');
      toast(`🐟 Die Fische sind weg – ${coord(r, c)} war doch ein Treffer!`, 3500);
      if (res === 'sunk' && ship && !O.known.some(x => x.id === ship.id)) { O.known.push(ship); O.bd.ships.appendChild(shipEl(ship.cc, ship.key, ship.r, ship.c, ship.h, 'sunk sunk-enemy', ship.id)); megaBoom(O.bd, ship); }
      renderSides(); setTurnUI();
      return res === 'sunk' ? 2400 : 800;
    }));
    socket.on('empEnd', ({ target, reveal, sunk }) => enqueue(() => {
      if (!G) return 0;
      const O = G.opp[target];
      for (const [r, c, v] of reveal) { if (O.shots.get(K(r, c)) !== 'unknown') continue; O.shots.set(K(r, c), v); if (v !== 'miss') G.stats.hits++; setPeg(O.bd, r, c, pegType(v), v !== 'miss'); }
      for (const s of sunk) if (!O.known.some(x => x.id === s.id)) { O.known.push(s); O.bd.ships.appendChild(shipEl(s.cc, s.key, s.r, s.c, s.h, 'sunk sunk-enemy', s.id)); logAdd(`Aufklärung: ${shipName(s)} wurde während des EMP versenkt!`, 'l-sunk'); }
      logAdd('⚡ EMP vorbei – deine Sensoren sind wieder online.'); toast('⚡ Sensoren wieder online – Ergebnisse aufgedeckt!');
      G.blind = 0; updateEmp(); renderSides(); setTurnUI();
      return 600;
    }));
    socket.on('oppRematch', ({ seat }) => {
      toast(`${seatName(seat)} will eine Revanche!`);
      const b = $('mRematch'); if (b && !b.disabled) b.textContent = 'Revanche annehmen';
    });
    socket.on('oppStatus', ({ seat, online }) => {
      if (S.seats[seat]) S.seats[seat].online = online;
      toast(online ? `${seatName(seat)} ist wieder verbunden.` : `${seatName(seat)} hat die Verbindung verloren – warte bis zu 2 Minuten …`, 3500);
      if (G && S.screen === 'scrBattle') renderSides();
    });
    socket.on('oppLeft', () => {
      if (!S.code) return;
      sess.clear();
      modal(`<h2 style="font-size:30px">Spiel beendet</h2><p>Ein Mitspieler hat das Spiel verlassen.</p><button class="btn primary" id="mMenu">Zum Hauptmenü</button>`);
      $('mMenu').onclick = () => toMenu(false);
    });
    socket.on('errorMsg', m => { toast(m); if (P.locked && S.screen === 'scrPlace') { P.locked = false; renderPlace(); $('waitMsg').classList.add('hidden'); } });
    socket.on('tstate', st => {
      const prev = S.tour;
      S.tour = st;
      if (S.screen === 'scrTourney') renderTourney();
      if (st.phase === 'done' && (!prev || prev.phase !== 'done')) setTimeout(showChampion, S.screen === 'scrBattle' ? 2500 : 300);
    });
  }

  function applySync(st) {
    applyMatched(st);
    S.code = st.code;
    if (st.phase === 'placing') {
      if (S.screen !== 'scrPlace' || !P.board) initPlacement();
      const meSeat = st.seats[st.mySeat];
      if (meSeat.ready && st.myShips) {
        P.placed = Object.fromEntries(st.myShips.map(s => [s.key, { r: s.r, c: s.c, h: s.h }]));
        P.powers = (st.myPowers || []).map(p => p.type); P.locked = true; P.sel = null; renderPlace(); showWait();
      }
      return;
    }
    const oldLog = G ? G.log : [];
    newGame(st.myShips || []);
    G.log = oldLog; G.turn = st.turn;
    G.powers = (st.myPowers || []).map(p => ({ type: p.type, uses: p.uses, max: Math.max(p.uses, p.type === 'artillery' ? 2 : 1) }));
    G.blind = st.blind || 0; G.drunk = st.drunk || 0;
    G.siren = st.siren || 0; G.fish = st.fish || 0; G.extra = st.extra || 0; G.skip = st.skip || 0; G.fog = st.fog || {};
    for (const [r, c, v] of st.incoming) G.incoming.set(K(r, c), v);
    for (const s of G.order) {
      const O = G.opp[s];
      for (const [r, c, v] of st.shots[s] || []) { O.shots.set(K(r, c), v); G.stats.shots++; if (v === 'hit' || v === 'sunk') G.stats.hits++; }
      O.known = st.known[s] || [];
      O.scans = (st.scans || []).filter(x => x.target === s);
    }
    G.out = !!st.seats[st.mySeat].out;
    Q = Promise.resolve();
    closeModal();
    renderBattle(); applyFog();
    if (st.phase === 'over') {
      G.over = true;
      const won = st.winner === S.mySeat;
      $('status').className = 'status ' + (won ? 'win' : 'lose');
      $('status').textContent = won ? '🏆 Sieg!' : 'Spiel beendet.';
      showEnd(won);
      if (st.myRematch) { const b = $('mRematch'); if (b) { b.disabled = true; b.textContent = 'Warte auf die anderen …'; } }
    }
  }

  /* ================= Turnier ================= */
  function joinTourney(code) {
    if (!getName() || !socket) return;
    socket.emit('tjoin', { code, name: S.name, country: S.country }, res => {
      if (!res.ok) { toast(res.error || 'Beitritt fehlgeschlagen.'); Sound.err(); return; }
      S.tcode = res.code; S.pid = res.pid;
      sess.set({ tcode: S.tcode, pid: S.pid });
      history.replaceState(null, '', location.pathname);
      setInviteMode(false);
      showTourney();
    });
  }
  $('btnAcceptInvite').onclick = () => S.inviteTourney ? joinTourney(inviteCode) : joinRoom(inviteCode);
  $('btnTourney').onclick = () => {
    if (!getName() || !socket) return;
    Sound.click();
    socket.emit('tcreate', { name: S.name, country: S.country, powerups: S.pmode === 'power', events: S.events }, res => {
      if (!res.ok) return toast('Turnier konnte nicht erstellt werden.');
      S.tcode = res.code; S.pid = res.pid;
      sess.set({ tcode: S.tcode, pid: S.pid });
      showTourney();
    });
  };
  function showTourney() { closeModal(); show('scrTourney'); renderTourney(); }
  function renderTourney() {
    const T = S.tour;
    if (!T) { $('tMsg').textContent = 'Lade Turnier …'; return; }
    $('tCode').textContent = T.code;
    $('tMode').textContent = modeTxt(T.powerups, T.events, 2);
    const lobby = T.phase === 'lobby';
    $('tInvite').classList.toggle('hidden', !lobby);
    $('tLink').value = `${location.origin}${location.pathname}?room=${T.code}`;
    $('btnTShare').classList.toggle('hidden', !navigator.share);
    const humans = T.parts.filter(p => !p.bot).length;
    let msg;
    if (lobby) msg = T.isHost
      ? `Teile den Link und starte, sobald alle da sind. ${humans % 2 ? 'Bei ungerader Spielerzahl kommt automatisch ein Bot (Normal) dazu.' : ''} Die Paarungen werden ausgelost.`
      : `Warte, bis ${esc(T.hostName || 'der Gastgeber')} das Turnier startet …`;
    else if (T.phase === 'done') msg = T.champion ? `🏆 <b>${esc(T.champion.name)}</b> ist Turniersieger!` : 'Das Turnier ist beendet.';
    else if (T.myStatus === 'waiting') msg = '✅ Du bist weiter! Sobald alle Partien der Runde fertig sind, wird neu ausgelost …';
    else if (T.myStatus === 'out') msg = '❌ Du bist ausgeschieden – du kannst den Spielplan weiter verfolgen.';
    else if (T.myStatus === 'playing') msg = '⚔️ Deine Partie läuft.';
    else msg = '';
    $('tMsg').innerHTML = msg;
    $('tMsg').className = 't-msg ' + (T.phase === 'done' ? 'champ' : T.myStatus || '');
    const statusTxt = { waiting: lobby ? 'bereit' : 'weiter', playing: 'spielt', out: 'ausgeschieden', champion: '🏆 Sieger' };
    $('tParts').innerHTML = T.parts.map(p => `<div class="t-part ${p.status}${p.me ? ' me' : ''}">${flagSVG(p.country)}<span>${esc(p.name)}${p.bot ? ' <i class="bot">BOT</i>' : ''}${p.me ? ' <i>(du)</i>' : ''}${p.online ? '' : ' <i class="off">offline</i>'}</span><small>${statusTxt[p.status] || ''}</small></div>`).join('')
      + (lobby && humans % 2 ? '<div class="t-part ghost">🤖 <span>+ Bot (Normal) beim Start</span></div>' : '');
    const pl = x => x ? `${flagSVG(x.country)}<span>${esc(x.name)}${x.bot ? ' <i class="bot">BOT</i>' : ''}</span>` : '?';
    $('tBracket').innerHTML = T.rounds.length ? T.rounds.map((rd, i) => `<div class="t-round"><div class="t-rtitle">🎲 Runde ${i + 1}${rd.length === 1 && i === T.rounds.length - 1 ? ' · Finale' : ''}</div>` +
      rd.map(m => `<div class="t-match${m.a && m.a.me || m.b && m.b.me ? ' mine' : ''}"><div class="t-p ${m.winner === 'a' ? 'win' : m.winner ? 'lose' : ''}">${pl(m.a)}</div><b class="t-vs">vs</b><div class="t-p ${m.winner === 'b' ? 'win' : m.winner ? 'lose' : ''}">${pl(m.b)}</div><small>${m.winner ? (m.forfeit ? 'kampflos' : '✔') : 'läuft …'}</small></div>`).join('') + '</div>').reverse().join('')
      : '<p class="muted">Noch nicht ausgelost.</p>';
    $('btnTStart').classList.toggle('hidden', !(lobby && T.isHost));
    $('btnTStart').disabled = T.parts.length < 2;
    $('btnTLeave').textContent = T.phase === 'done' ? 'Zum Hauptmenü' : 'Turnier verlassen';
  }
  $('btnTStart').onclick = () => { Sound.click(); socket.emit('tstart'); };
  $('btnTLeave').onclick = () => { if (S.tour && S.tour.phase === 'done') return toMenu(true); confirmLeave(); };
  $('btnTCopy').onclick = async () => {
    const v = $('tLink').value;
    try { await navigator.clipboard.writeText(v); } catch { $('tLink').select(); document.execCommand('copy'); }
    toast('Link kopiert!');
  };
  $('btnTShare').onclick = () => navigator.share({ title: 'Schiffe-versenken-Turnier', text: `${S.name} lädt dich zu einem Schiffe-versenken-Turnier ein!`, url: $('tLink').value }).catch(() => { });
  function showChampion() {
    const T = S.tour; if (!T || !T.champion) return;
    const me = T.champion.me;
    if (me) Sound.win();
    modal(`<h2 class="${me ? 'win' : ''}" style="font-size:40px">🏆 ${me ? 'TURNIERSIEG!' : 'Turnier beendet'}</h2>
      <p>${flagSVG(T.champion.country)} <b>${esc(T.champion.name)}</b> ${me ? '– das bist du! Unbesiegt auf allen Meeren.' : 'gewinnt das Turnier.'}</p>
      <div class="modal-btns"><button class="btn primary" id="mTour">Spielplan ansehen</button><button class="btn" id="mMenu">Hauptmenü</button></div>`);
    $('mTour').onclick = () => showTourney();
    $('mMenu').onclick = () => toMenu(true);
  }
  function diceFx() {
    const d = el('div', 'dice-fx', '🎲'); document.body.appendChild(d); setTimeout(() => d.remove(), 1600);
    [0, 120, 240, 360].forEach(t => setTimeout(() => Sound.tone(500 + rand(500), 300, .06, .08, 'square'), t));
  }

  /* ================= Start ================= */
  renderCountries();
  renderFleetPreview();
  show('scrMenu');
})();

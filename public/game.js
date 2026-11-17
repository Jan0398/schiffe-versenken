/* Schiffe versenken – Spiellogik & Oberfläche */
(function () {
  const { FLEET, LEN, COUNTRIES, shipSVG, flagSVG } = Ships;
  const N = 10, ROWS = 'ABCDEFGHIJ';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const K = (r, c) => r + ',' + c;
  const coord = (r, c) => ROWS[r] + (c + 1);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const rand = n => Math.floor(Math.random() * n);
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  };
  const sess = {
    get() { try { return JSON.parse(sessionStorage.getItem('sv_sess') || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem('sv_sess', JSON.stringify(v)); } catch { } },
    clear() { try { sessionStorage.removeItem('sv_sess'); } catch { } },
  };
  const shipInfo = (cc, key) => COUNTRIES[cc].ships[key];

  const S = {
    name: store.get('sv_name', ''), country: store.get('sv_country', 'de'), diff: store.get('sv_diff', 'normal'),
    bonus: true, pmode: store.get('sv_pmode', 'classic'), powerups: false, mode: null, opp: null, code: null, pid: null,
    oppOnline: true, oppReady: false, screen: 'scrMenu',
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
      const f = ac.createBiquadFilter(), t = ac.currentTime;
      f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q || 1;
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain || .4, t + (o.attack || .005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(ac.destination); src.start(t);
    },
    tone(f0, f1, dur, gain = .25, type = 'sine') {
      const ac = this.ac(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
    },
    shot() { this.noise(.2, { type: 'highpass', freq: 800, gain: .22 }); this.tone(150, 45, .18, .35); },
    splash() { this.noise(.75, { type: 'bandpass', freq: 1500, freqEnd: 350, q: .7, gain: .35, attack: .04 }); },
    boom() { this.noise(1, { type: 'lowpass', freq: 1000, freqEnd: 100, gain: .85 }); this.tone(95, 28, .7, .5); },
    sunk() { this.boom(); setTimeout(() => this.noise(1.8, { type: 'lowpass', freq: 320, freqEnd: 50, gain: .6, attack: .15 }), 260); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, .3, .18, 'triangle'), i * 150)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, f * .97, .4, .18, 'triangle'), i * 220)); },
    click() { this.tone(700, 500, .05, .06, 'square'); },
    err() { this.tone(170, 120, .15, .12, 'square'); },
    ping() { this.tone(1200, 1150, .5, .12, 'sine'); },
    emp() { this.tone(2400, 60, .9, .18, 'sawtooth'); this.noise(.8, { type: 'bandpass', freq: 3000, freqEnd: 300, q: 2, gain: .25 }); setTimeout(() => this.tone(60, 40, .5, .2, 'square'), 200); },
    radar() { [0, 350, 700].forEach(t => setTimeout(() => this.tone(1500, 1450, .35, .12, 'sine'), t)); },
    nuke() { this.noise(2.8, { type: 'lowpass', freq: 1400, freqEnd: 40, gain: 1, attack: .01 }); this.tone(70, 18, 2.2, .7); setTimeout(() => this.noise(2.2, { type: 'lowpass', freq: 400, freqEnd: 40, gain: .7, attack: .3 }), 400); },
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
  function modal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); }
  function shake(node) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }

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
  $$('#segDiff button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === S.diff);
    b.onclick = () => { S.diff = b.dataset.v; store.set('sv_diff', S.diff); $$('#segDiff button').forEach(x => x.classList.toggle('on', x === b)); Sound.click(); };
  });
  function $$(sel) { return [...document.querySelectorAll(sel)]; }
  $('brandHome').onclick = () => { if (S.screen === 'scrMenu') return; if (S.screen === 'scrLobby') return toMenu(true); confirmLeave(); };

  const MODE_HINT = { classic: 'Klassische Regeln: Wer trifft, darf nochmal schießen.', power: 'Wie klassisch – plus ein Power-up pro Spieler: EMP, Artilleriebeschuss, Nuke oder Radar. Einmal einsetzbar, ersetzt deinen Schuss.' };
  const MODE_NOTE = ' Gilt für Spiele gegen den Computer und für Räume, die du erstellst – beim Beitreten legt der Gastgeber den Modus fest.';
  function renderMode() {
    $$('#segMode button').forEach(x => x.classList.toggle('on', x.dataset.v === S.pmode));
    $('modeHint').textContent = MODE_HINT[S.pmode] + MODE_NOTE;
  }
  $$('#segMode button').forEach(b => b.onclick = () => { S.pmode = b.dataset.v; store.set('sv_pmode', S.pmode); Sound.click(); renderMode(); });
  renderMode();

  const DIFF_LABEL = { easy: 'Leicht', normal: 'Normal', hard: 'Schwer' };
  $('btnCpu').onclick = () => {
    if (!getName()) return;
    Sound.click();
    const others = Object.keys(COUNTRIES).filter(c => c !== S.country);
    S.mode = 'cpu'; S.powerups = S.pmode === 'power'; S.opp = { name: 'Computer (' + DIFF_LABEL[S.diff] + ')', country: others[rand(others.length)] };
    S.oppOnline = true; S.oppReady = true;
    initPlacement();
  };

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
  function shipEl(cc, key, r, c, h, extra = '') {
    const len = LEN[key], d = el('div', 'ship ' + extra);
    d.style.left = c * 10 + '%'; d.style.top = r * 10 + '%';
    d.style.width = (h ? len : 1) * 10 + '%'; d.style.height = (h ? 1 : len) * 10 + '%';
    d.dataset.key = key;
    d.innerHTML = shipSVG(cc, key, h);
    return d;
  }
  function setPeg(bd, r, c, type, anim) {
    const p = bd.peg(r, c);
    p.className = 'peg ' + type + (anim ? ' new' : '');
    bd.cell(r, c).classList.add('shot');
    if (anim && type !== 'miss') {
      const fx = el('div', 'fx-boom'); p.appendChild(fx); setTimeout(() => fx.remove(), 700);
    }
  }

  /* ================= Aufstellung ================= */
  const cellsOf = (key, r, c, h) => Array.from({ length: LEN[key] }, (_, i) => h ? [r, c + i] : [r + i, c]);
  const inB = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
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

  const P = { placed: {}, sel: null, h: true, hover: null, board: null, locked: false };
  function nextUnplaced() { const f = FLEET.find(f => !P.placed[f.key]); return f ? f.key : null; }

  function initPlacement() {
    closeModal();
    P.placed = {}; P.sel = 'carrier'; P.h = true; P.hover = null; P.locked = false; P.power = null; S.oppReady = S.mode === 'cpu';
    buildPlaceBoard();
    $('waitMsg').classList.add('hidden');
    show('scrPlace');
    renderPlace();
  }
  function renderPlaceVs() {
    $('placeVs').innerHTML = `${S.tcode && S.tround ? `<span class="mode-badge t-badge">🏆 Runde ${S.tround}</span> ` : ''}<span class="mode-badge">${S.powerups ? '⚡ Power-ups' : '⚓ Klassisch'}</span> ${flagSVG(S.country)} <span>${esc(S.name)}</span> <b style="color:var(--red)">VS</b> ${flagSVG(S.opp.country)} <span>${esc(S.opp.name)}</span>`;
  }
  function buildPlaceBoard() {
    P.board = makeBoard($('placeBoard'), false, !!COUNTRIES[S.country].space);
    const L = P.board.cellsL;
    L.addEventListener('mousemove', e => { const a = P.board.at(e); if (a && (!P.hover || a[0] !== P.hover[0] || a[1] !== P.hover[1])) { P.hover = a; renderPlace(); } });
    L.addEventListener('mouseleave', () => { P.hover = null; renderPlace(); });
    L.addEventListener('click', e => { const a = P.board.at(e); if (a) placeAt(a[0], a[1]); });
    L.addEventListener('contextmenu', e => { e.preventDefault(); rotate(); });
    renderPlaceVs();
    $('btnFaction').disabled = P.locked;
  }
  function openFactionPicker() {
    if (P.locked) { toast('Nach „Bereit“ kann die Fraktion nicht mehr gewechselt werden.'); return; }
    modal(`<h2 style="font-size:28px">Fraktion wählen</h2><p>Deine Aufstellung bleibt erhalten.</p><div class="countries modal-countries" id="mCountries"></div><button class="btn ghost" id="mClose">Schließen</button>`);
    $('modalBox').classList.add('wide');
    countryGrid($('mCountries'), cc => {
      closeModal(); $('modalBox').classList.remove('wide');
      if (cc === S.country) return;
      S.country = cc; store.set('sv_country', cc); Sound.click();
      if (S.mode === 'online' && socket) socket.emit('setCountry', { country: cc });
      buildPlaceBoard(); renderPlace(); renderCountries(); renderFleetPreview();
      toast(`Du kommandierst jetzt: ${COUNTRIES[cc].name}`);
    });
    $('mClose').onclick = () => { closeModal(); $('modalBox').classList.remove('wide'); };
  }
  $('btnFaction').onclick = openFactionPicker;
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
    $('btnReady').disabled = Object.keys(P.placed).length < FLEET.length || P.locked || (S.powerups && !P.power);
    ['btnRotate', 'btnRandom', 'btnClear', 'btnFaction'].forEach(b => $(b).disabled = P.locked);
  }
  function renderPowerPick() {
    const box = $('powerPick');
    box.classList.toggle('hidden', !S.powerups);
    if (!S.powerups) return;
    box.innerHTML = '<div class="pp-title">Wähle dein Power-up <small>(nur eines, einmal einsetzbar)</small></div>' +
      Object.entries(POWERS).map(([k, v]) => `<div class="pp-card${P.power === k ? ' on' : ''}${P.locked ? ' locked' : ''}" data-k="${k}"><span>${v.icon}</span><div><b>${v.name}</b><small>${v.desc}</small></div></div>`).join('');
    box.querySelectorAll('.pp-card').forEach(c => c.onclick = () => { if (P.locked) return; P.power = c.dataset.k; Sound.click(); renderPlace(); });
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
    if (canPlace(P.placed, P.sel, r, c, P.h)) {
      P.placed[P.sel] = { r, c, h: P.h }; P.sel = nextUnplaced(); Sound.tone(300, 500, .08, .12, 'triangle');
    } else { Sound.err(); shake(P.board.board); }
    renderPlace();
  }
  function rotate() { if (P.locked) return; P.h = !P.h; Sound.click(); renderPlace(); }
  $('btnRotate').onclick = rotate;
  $('btnRandom').onclick = () => { if (P.locked) return; P.placed = randomFleet(); P.sel = null; Sound.click(); renderPlace(); };
  $('btnClear').onclick = () => { if (P.locked) return; P.placed = {}; P.sel = 'carrier'; renderPlace(); };
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.key === 'r' || e.key === 'R') && S.screen === 'scrPlace') rotate();
    if (S.screen === 'scrBattle' && B && B.arm) {
      if (e.key === 'Escape') { B.arm = null; previewArm(null); renderPowerBar(); }
      if ((e.key === 'r' || e.key === 'R') && B.arm === 'artillery') { B.armH = !B.armH; previewArm(B.lastHover && B.lastHover[0], B.lastHover && B.lastHover[1]); }
    }
  });
  $('btnReady').onclick = () => {
    if (Object.keys(P.placed).length < FLEET.length) return;
    if (S.powerups && !P.power) { toast('Bitte zuerst ein Power-up wählen.'); return; }
    P.locked = true; P.sel = null; P.hover = null; renderPlace(); Sound.click();
    if (S.mode === 'cpu') return startCpuBattle();
    socket.emit('ready', { ships: FLEET.map(f => ({ key: f.key, ...P.placed[f.key] })), power: P.power });
    showWait();
  };
  function showWait() {
    const w = $('waitMsg'); w.classList.remove('hidden');
    w.querySelector('span').textContent = S.oppReady ? `${S.opp.name} ist bereit – gleich geht's los …` : `Warte, bis ${S.opp.name} die Flotte aufgestellt hat …`;
  }

  /* ================= Schlacht ================= */
  let B = null, myBd = null, enBd = null;
  const POWERS = {
    emp: { icon: '⚡', name: 'EMP', desc: 'Das gegnerische Feld ist 5 Züge lang verdeckt – der Gegner schießt blind.', target: false },
    artillery: { icon: '💥', name: 'Artilleriebeschuss', desc: 'Trifft 3 Felder nebeneinander. Drehen mit R oder Rechtsklick.', target: true },
    nuke: { icon: '☢️', name: 'Nuke', desc: 'Trifft ein Quadrat von 4×4 Feldern mit einem Schlag.', target: true },
    radar: { icon: '📡', name: 'Radar', desc: 'Zeigt in einem 2×2-Feld, ob dort ein feindliches Schiff liegt.', target: true },
  };
  const EMP_TURNS = 5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function areaCells(type, r, c, h) {
    const out = [];
    if (type === 'artillery') {
      if (h) { c = clamp(c, 1, N - 2); for (let i = -1; i <= 1; i++) out.push([r, c + i]); }
      else { r = clamp(r, 1, N - 2); for (let i = -1; i <= 1; i++) out.push([r + i, c]); }
    } else if (type === 'nuke') {
      const r0 = clamp(r - 1, 0, N - 4), c0 = clamp(c - 1, 0, N - 4);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push([r0 + i, c0 + j]);
    } else if (type === 'radar') {
      const r0 = clamp(r, 0, N - 2), c0 = clamp(c, 0, N - 2);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out.push([r0 + i, c0 + j]);
    }
    return out;
  }
  const pubShip = s => ({ key: s.key, r: s.r, c: s.c, h: s.h, len: s.len });

  function buildShips(placed) {
    return FLEET.map(f => {
      const p = placed[f.key];
      return { key: f.key, len: f.len, r: p.r, c: p.c, h: p.h, cells: cellsOf(f.key, p.r, p.c, p.h).map(([a, b]) => K(a, b)), hits: new Set(), sunk: false };
    });
  }
  function strike(ships, r, c) {
    const k = K(r, c), ship = ships.find(s => s.cells.includes(k));
    if (!ship) return { res: 'miss', ship: null };
    ship.hits.add(k);
    if (ship.hits.size === ship.len) { ship.sunk = true; return { res: 'sunk', ship }; }
    return { res: 'hit', ship };
  }
  function newBattle(placed) {
    B = { myShips: buildShips(placed), incoming: new Map(), outgoing: new Map(), enemySunk: [], myTurn: false, over: false, busy: false,
      stats: { shots: 0, hits: 0 }, cpu: null, log: [],
      power: S.powerups ? { type: P.power, used: false } : null, oppPower: S.powerups ? { type: null, used: false } : null,
      blind: 0, oppBlind: 0, scans: [], arm: null, armH: true, hiddenTruth: new Map(), cpuUnk: new Set(), cpuHiddenSunk: new Set(),
      cpuTurns: 0, animUntil: 0 };
  }

  function startCpuBattle() {
    newBattle(P.placed);
    const types = Object.keys(POWERS);
    B.cpu = { ships: buildShips(randomFleet()), power: S.powerups ? types[rand(types.length)] : null, used: false,
      useAt: 3 + rand(9), queue: [], clear: new Set() };
    renderBattle();
    const first = Math.random() < .5;
    logAdd(first ? 'Münzwurf: Du beginnst!' : `Münzwurf: ${S.opp.name} beginnt.`);
    setTurn(first);
  }

  function pegType(v) { return v === 'unknown' ? 'unk' : v === 'miss' ? 'miss' : 'hit'; }

  function renderBattle() {
    show('scrBattle');
    myBd = makeBoard($('myBoard'), false, !!COUNTRIES[S.country].space);
    enBd = makeBoard($('enemyBoard'), true, !!COUNTRIES[S.opp.country].space);
    for (const s of B.myShips) myBd.ships.appendChild(shipEl(S.country, s.key, s.r, s.c, s.h, s.sunk ? 'sunk' : ''));
    for (const [k, v] of B.incoming) { const [r, c] = k.split(',').map(Number); setPeg(myBd, r, c, pegType(v)); }
    for (const [k, v] of B.outgoing) { const [r, c] = k.split(',').map(Number); setPeg(enBd, r, c, pegType(v)); }
    for (const s of B.enemySunk) enBd.ships.appendChild(shipEl(S.opp.country, s.key, s.r, s.c, s.h, 'sunk'));
    for (const sc of B.scans) drawScan(sc);
    const L = enBd.cellsL;
    L.addEventListener('click', e => { const a = enBd.at(e); if (a) fire(a[0], a[1]); });
    L.addEventListener('mousemove', e => { const a = enBd.at(e); if (a) previewArm(a[0], a[1]); });
    L.addEventListener('mouseleave', () => previewArm(null));
    L.addEventListener('contextmenu', e => { if (B && B.arm === 'artillery') { e.preventDefault(); B.armH = !B.armH; previewArm(B.lastHover && B.lastHover[0], B.lastHover && B.lastHover[1]); } });
    updateEmp(); renderPowerBar(); renderLog(); renderSides();
  }

  function renderSides() {
    const myLeft = B.myShips.filter(s => !s.sunk).length, enLeft = FLEET.length - B.enemySunk.length;
    const badge = n => n > 0 ? ` <span class="emp-badge">⚡ blind (${n})</span>` : '';
    $('plateMe').innerHTML = `${flagSVG(S.country)}<div class="p-name">${esc(S.name)}${badge(B.blind)}<small>Deine Flotte · ${COUNTRIES[S.country].navy}</small></div><div class="p-count"><b>${myLeft}</b>/5<br>Schiffe</div>`;
    $('plateEnemy').innerHTML = `${flagSVG(S.opp.country)}<div class="p-name">${esc(S.opp.name)}${S.oppOnline ? '' : ' <span class="off">● offline</span>'}${badge(B.oppBlind)}<small>Feindgebiet · ${COUNTRIES[S.opp.country].navy}</small></div><div class="p-count"><b>${enLeft}</b>/5<br>Schiffe</div>`;
    const list = (cc, isSunk) => FLEET.map(f => {
      const s = shipInfo(cc, f.key);
      return `<div class="fl-item${isSunk(f.key) ? ' sunk' : ''}"><div class="fl-img">${shipSVG(cc, f.key, true)}</div><span>${esc(s.name)}</span></div>`;
    }).join('');
    $('myFleet').innerHTML = list(S.country, k => B.myShips.find(s => s.key === k).sunk);
    $('enemyFleet').innerHTML = list(S.opp.country, k => B.enemySunk.some(s => s.key === k));
  }

  function updateEmp() {
    if (!enBd) return;
    enBd.board.classList.toggle('emp', B.blind > 0);
    let lab = enBd.fx.querySelector('.emp-label');
    if (B.blind > 0) {
      if (!lab) { lab = el('div', 'emp-label'); enBd.fx.appendChild(lab); }
      lab.innerHTML = `⚡ EMP – Sensoren gestört<br><small>noch ${B.blind} ${B.blind === 1 ? 'Zug' : 'Züge'} blind</small>`;
    } else if (lab) lab.remove();
    renderSides();
  }

  function renderPowerBar() {
    const bar = $('powerBar');
    if (!B.power) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const P0 = POWERS[B.power.type], used = B.power.used, armed = !!B.arm;
    const op = B.oppPower;
    bar.innerHTML = `<div class="pw-me${used ? ' used' : ''}${armed ? ' armed' : ''}"><span class="pw-ic">${P0.icon}</span>
      <div class="pw-txt"><b>${P0.name}</b><small>${used ? 'Eingesetzt' : armed ? 'Ziel im Feindgebiet wählen …' + (B.arm === 'artillery' ? ' (R dreht)' : '') : P0.desc}</small></div>
      ${used ? '' : armed ? `${B.arm === 'artillery' ? '<button class="btn small" id="pwRot">↻ Drehen</button>' : ''}<button class="btn ghost small" id="pwCancel">Abbrechen</button>` : '<button class="btn primary small" id="pwUse">Einsetzen</button>'}</div>
      <div class="pw-opp">Gegner: ${op.used && op.type ? `${POWERS[op.type].icon} ${POWERS[op.type].name} <small>(eingesetzt)</small>` : '❓ <small>unbekanntes Power-up</small>'}</div>`;
    const u = $('pwUse'); if (u) u.onclick = armPower;
    const c = $('pwCancel'); if (c) c.onclick = () => { B.arm = null; previewArm(null); renderPowerBar(); };
    const rt = $('pwRot'); if (rt) rt.onclick = () => { B.armH = !B.armH; previewArm(B.lastHover && B.lastHover[0], B.lastHover && B.lastHover[1]); };
  }
  function armPower() {
    if (!B || B.over || !B.myTurn || B.busy || B.power.used) { Sound.err(); toast('Du kannst das Power-up nur einsetzen, wenn du am Zug bist.'); return; }
    Sound.click();
    if (!POWERS[B.power.type].target) return firePower(0, 0);
    B.arm = B.power.type; B.armH = true; renderPowerBar();
    toast('Wähle das Zielgebiet im Feindgebiet.');
  }
  function previewArm(r, c) {
    if (!enBd) return;
    enBd.cells.forEach(x => x.classList.remove('pv-arm'));
    if (r == null || !B || !B.arm || !B.myTurn) { if (r != null) B.lastHover = [r, c]; return; }
    B.lastHover = [r, c];
    for (const [a, b] of areaCells(B.arm, r, c, B.armH)) enBd.cell(a, b).classList.add('pv-arm');
  }

  function setTurn(mine, again = false) {
    if (!B || B.over) return;
    B.myTurn = mine; B.busy = false;
    enBd.host.classList.toggle('locked', !mine || B.over);
    $('sideMe').style.opacity = mine ? .78 : 1;
    $('sideEnemy').style.opacity = mine ? 1 : .78;
    const st = $('status');
    st.className = 'status ' + (mine ? 'mine' : 'theirs');
    let txt = mine ? (again ? '🔥 Treffer! Du darfst nochmal schießen!' : '🎯 Du bist am Zug – wähle ein Ziel im Feindgebiet!')
      : (again ? `🔥 ${S.opp.name} hat getroffen und schießt nochmal …` : `⏳ ${S.opp.name} zielt …`);
    if (mine && B.blind > 0) txt = `⚡ Du schießt blind! (EMP – noch ${B.blind} ${B.blind === 1 ? 'Zug' : 'Züge'})`;
    st.textContent = txt;
    if (mine && !again) Sound.ping();
    renderPowerBar();
    if (!mine && S.mode === 'cpu') setTimeout(cpuMove, (B.lastSunk ? 2200 : 750) + Math.random() * 700);
    B.lastSunk = false;
  }

  /* ----- eigene Schüsse ----- */
  function fire(r, c) {
    if (!B || B.over || !B.myTurn || B.busy) return;
    if (B.arm) return firePower(r, c);
    if (B.outgoing.has(K(r, c))) { Sound.err(); return; }
    B.busy = true; enBd.host.classList.add('locked');
    Sound.shot();
    if (S.mode === 'cpu') {
      const blind = B.blind > 0;
      const { res, ship } = strike(B.cpu.ships, r, c);
      setTimeout(() => {
        if (blind) { B.hiddenTruth.set(K(r, c), res); onResult(r, c, 'unknown', null); }
        else onResult(r, c, res, ship ? pubShip(ship) : null);
        afterMyLocal(!blind && res !== 'miss', blind);
      }, 380);
    } else {
      socket.emit('shoot', { r, c });
      B.shotTimer = setTimeout(() => { if (B && B.busy) { B.busy = false; enBd.host.classList.remove('locked'); toast('Keine Antwort vom Server – nochmal versuchen.'); } }, 8000);
    }
  }
  function afterMyLocal(keep, wasBlind) {
    if (wasBlind) { B.blind--; if (B.blind === 0) revealLocal(); updateEmp(); }
    if (B.cpu.ships.every(s => s.sunk)) return setTimeout(() => endGame(true, B.cpu.ships), Math.max(0, B.animUntil - Date.now()));
    setTurn(keep, keep);
  }
  function revealLocal() {
    revealBlind([...B.hiddenTruth].map(([k, v]) => [...k.split(',').map(Number), v]), B.cpu.ships.filter(s => s.sunk).map(pubShip));
    B.hiddenTruth.clear();
  }
  function revealBlind(list, sunk) {
    for (const [r, c, v] of list) {
      if (B.outgoing.get(K(r, c)) !== 'unknown') continue;
      B.outgoing.set(K(r, c), v); if (v !== 'miss') B.stats.hits++;
      setPeg(enBd, r, c, pegType(v), v !== 'miss');
    }
    for (const s of sunk || []) if (!B.enemySunk.some(x => x.key === s.key)) {
      B.enemySunk.push(s); enBd.ships.appendChild(shipEl(S.opp.country, s.key, s.r, s.c, s.h, 'sunk sunk-enemy'));
      logAdd(`Aufklärung: ${shipInfo(S.opp.country, s.key).name} wurde während des EMP versenkt!`, 'l-sunk');
    }
    B.blind = 0;
    if (list.length) { logAdd('⚡ EMP vorbei – deine Sensoren sind wieder online.'); toast('⚡ Sensoren wieder online – Ergebnisse aufgedeckt!'); }
    updateEmp();
  }

  function onResult(r, c, res, ship, quiet = false) {
    clearTimeout(B.shotTimer);
    B.outgoing.set(K(r, c), res); B.stats.shots++;
    if (res === 'unknown') {
      setPeg(enBd, r, c, 'unk', true);
      if (!quiet) { Sound.tone(300, 120, .2, .1, 'sawtooth'); logAdd(`Du: ${coord(r, c)} – Ergebnis unbekannt (EMP).`); }
      return;
    }
    if (res !== 'miss') B.stats.hits++;
    setPeg(enBd, r, c, res === 'miss' ? 'miss' : 'hit', true);
    if (res === 'miss') { if (!quiet) { Sound.splash(); logAdd(`Du: ${coord(r, c)} – daneben.`); } }
    else if (res === 'hit') { if (!quiet) { Sound.boom(); shake(enBd.board); } logAdd(`Du: ${coord(r, c)} – Treffer!`, 'l-hit'); }
    else {
      B.enemySunk.push(ship); B.lastSunk = true;
      const se = shipEl(S.opp.country, ship.key, ship.r, ship.c, ship.h, 'sunk sunk-enemy');
      setTimeout(() => enBd.ships.appendChild(se), 450);
      megaBoom(enBd, ship);
      logAdd(`Du: ${coord(r, c)} – Versenkt! ${shipInfo(S.opp.country, ship.key).name} geht unter.`, 'l-sunk');
      toast(`💥 ${shipInfo(S.opp.country, ship.key).name} versenkt!`);
    }
    renderSides();
  }

  function onIncoming(r, c, quiet = false) {
    const { res, ship } = strike(B.myShips, r, c);
    B.incoming.set(K(r, c), res);
    setPeg(myBd, r, c, res === 'miss' ? 'miss' : 'hit', true);
    if (res === 'miss') { if (!quiet) { Sound.splash(); logAdd(`${S.opp.name}: ${coord(r, c)} – daneben.`); } }
    else if (res === 'hit') { if (!quiet) { Sound.boom(); shake(myBd.board); } logAdd(`${S.opp.name}: ${coord(r, c)} – Treffer auf ${shipInfo(S.country, ship.key).name}!`, 'l-hit'); }
    else {
      B.lastSunk = true;
      const se = myBd.ships.querySelector(`[data-key="${ship.key}"]`); if (se) setTimeout(() => se.classList.add('sunk'), 450);
      megaBoom(myBd, ship);
      logAdd(`${S.opp.name}: ${coord(r, c)} – ${shipInfo(S.country, ship.key).name} wurde versenkt!`, 'l-sunk');
    }
    renderSides();
    return { res, ship };
  }

  /* ----- Power-ups ----- */
  function firePower(r, c) {
    const type = B.power.type, h = B.armH;
    B.arm = null; previewArm(null);
    B.busy = true; B.power.used = true; enBd.host.classList.add('locked'); renderPowerBar();
    if (S.mode !== 'cpu') { socket.emit('power', { type, r, c, h }); return; }
    const blind = B.blind > 0;
    if (type === 'emp') {
      B.oppBlind = EMP_TURNS;
      return myPowerFx({ type }, () => afterMyLocal(false, blind));
    }
    const cells = areaCells(type, r, c, h);
    if (type === 'radar') {
      const contact = B.cpu.ships.some(s => cells.some(([a, b]) => s.cells.includes(K(a, b))));
      return myPowerFx({ type, scan: { r: cells[0][0], c: cells[0][1], contact } }, () => afterMyLocal(false, blind));
    }
    const shots = cells.filter(([a, b]) => !B.outgoing.has(K(a, b))).map(([a, b]) => {
      const { res, ship } = strike(B.cpu.ships, a, b);
      if (blind) { B.hiddenTruth.set(K(a, b), res); return { r: a, c: b, res: 'unknown', ship: null }; }
      return { r: a, c: b, res, ship: res === 'sunk' ? pubShip(ship) : null };
    });
    const anyHit = shots.some(x => x.res === 'hit' || x.res === 'sunk');
    myPowerFx({ type, cells, shots }, () => afterMyLocal(!blind && anyHit, blind));
  }

  function myPowerFx(m, then) {
    const P0 = POWERS[m.type];
    logAdd(`Du setzt ${P0.icon} ${P0.name} ein!`, 'l-sunk');
    let wait = 900;
    if (m.type === 'emp') {
      fxEmp(enBd); Sound.emp();
      logAdd(`${S.opp.name} ist ${EMP_TURNS} Züge lang blind!`);
      renderSides();
    } else if (m.type === 'radar') {
      fxRadar(enBd, m.scan); Sound.radar(); wait = 1500;
      setTimeout(() => {
        B.scans.push(m.scan); drawScan(m.scan);
        logAdd(m.scan.contact ? `📡 Radar ${coord(m.scan.r, m.scan.c)}: KONTAKT – dort liegt ein Schiff!` : `📡 Radar ${coord(m.scan.r, m.scan.c)}: Gebiet ist frei.`, m.scan.contact ? 'l-hit' : '');
        if (m.scan.contact) Sound.tone(880, 880, .25, .15, 'square');
      }, 1200);
    } else {
      wait = applyBarrage(m, enBd, sh => onResult(sh.r, sh.c, sh.res, sh.ship, true));
    }
    B.animUntil = Date.now() + wait;
    setTimeout(then, wait);
  }

  function applyBarrage(m, bd, apply) {
    const anySunk = (m.shots || []).some(x => x.res === 'sunk' || x.key && x.res === 'sunk');
    if (m.type === 'nuke') {
      const [r0, c0] = m.cells[0];
      nukeFx(bd, r0, c0);
      setTimeout(() => { (m.shots || []).forEach(apply); }, 650);
      return 3000 + (anySunk ? 900 : 0);
    }
    // Artillerie: drei Einschläge nacheinander
    m.cells.forEach(([r, c], i) => setTimeout(() => { Sound.shot(); setTimeout(() => Sound.boom(), 120); shellFx(bd, r, c); }, i * 280));
    (m.shots || []).forEach((sh, i) => {
      const idx = m.cells.findIndex(([a, b]) => a === sh.r && b === sh.c);
      setTimeout(() => apply(sh), idx * 280 + 200);
    });
    return 1200 + (anySunk ? 1800 : 0);
  }

  function oppPowerFx(m, then) {
    const P0 = POWERS[m.type];
    if (B.oppPower) { B.oppPower.used = true; B.oppPower.type = m.type; }
    renderPowerBar();
    logAdd(`${S.opp.name} setzt ${P0.icon} ${P0.name} ein!`, 'l-sunk');
    toast(`${P0.icon} ${S.opp.name} setzt ${P0.name} ein!`);
    let wait = 1000; const results = [];
    if (m.type === 'emp') {
      B.blind = m.blind || EMP_TURNS; fxEmp(enBd); Sound.emp(); updateEmp();
      logAdd(`Deine Sensoren sind ${B.blind} Züge lang gestört – du schießt blind!`, 'l-hit');
      wait = 1300;
    } else if (m.type === 'radar') {
      fxRadar(myBd, m.scan); Sound.radar(); wait = 1500;
      logAdd(`${S.opp.name} hat das Gebiet ${coord(m.scan.r, m.scan.c)} mit Radar abgesucht.`);
    } else {
      wait = applyBarrage(m, myBd, sh => results.push(onIncoming(sh.r, sh.c, true)));
    }
    B.animUntil = Date.now() + wait;
    setTimeout(() => then(results), wait);
  }

  function drawScan(sc) {
    const d = el('div', 'scan ' + (sc.contact ? 'contact' : 'clear'), `<span>${sc.contact ? 'KONTAKT' : 'FREI'}</span>`);
    Object.assign(d.style, { left: sc.c * 10 + '%', top: sc.r * 10 + '%', width: '20%', height: '20%' });
    enBd.ships.appendChild(d);
  }

  /* ----- Effekte ----- */
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
  function shellFx(bd, r, c) {
    const d = el('div', 'fx-shell');
    Object.assign(d.style, { left: c * 10 + '%', top: r * 10 + '%', width: '10%', height: '10%' });
    bd.fx.appendChild(d); setTimeout(() => d.remove(), 700);
  }
  function nukeFx(bd, r0, c0) {
    Sound.nuke();
    const f = el('div', 'screen-flash nuke-flash'); document.body.appendChild(f); setTimeout(() => f.remove(), 1400);
    boomRect(bd, r0, c0, 4, 4, 'NUKE!', true);
  }

  function megaBoom(bd, s) {
    const len = s.len || LEN[s.key];
    boomRect(bd, s.r, s.c, s.h ? len : 1, s.h ? 1 : len, 'VERSENKT!', false);
  }
  function boomRect(bd, r0, c0, w, h, label, nuke) {
    const cell = bd.board.clientWidth / N, len = Math.max(w, h), area = w * h;
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
    const battle = document.querySelector('.battle'); battle.classList.remove('shake-big'); void battle.offsetWidth; battle.classList.add('shake-big');
    if (!nuke) { for (let i = 0; i < Math.min(len, 4); i++) setTimeout(() => Sound.boom(), i * 170); setTimeout(() => Sound.sunk(), 250); }
    setTimeout(() => { box.remove(); banner.remove(); flash.remove(); }, nuke ? 3600 : 3200);
  }

  /* ----- Computer-Zug ----- */
  function cpuView() {
    const shots = new Map(B.incoming);
    for (const k of B.cpuUnk) shots.set(k, 'unk');
    const ships = B.myShips.map(s => ({ ...s, sunk: s.sunk && !B.cpuHiddenSunk.has(s.key) }));
    return { shots, ships };
  }
  function cpuMove() {
    if (!B || B.over || B.myTurn || S.mode !== 'cpu') return;
    B.cpuTurns++;
    const cpu = B.cpu, blind = B.oppBlind > 0, v = cpuView();
    if (cpu.power && !cpu.used && cpuWantsPower(v)) return cpuUsePower(v, blind);
    const [r, c] = AI.pick(S.diff, v.shots, v.ships, cpu);
    Sound.shot();
    setTimeout(() => {
      if (!B || B.over) return;
      const { res, ship } = onIncoming(r, c);
      if (blind) { B.cpuUnk.add(K(r, c)); if (res === 'sunk') B.cpuHiddenSunk.add(ship.key); }
      cpuAfter(!blind && res !== 'miss', blind);
    }, 380);
  }
  function cpuAfter(keep, wasBlind) {
    if (wasBlind) {
      B.oppBlind--;
      if (B.oppBlind === 0) { B.cpuUnk.clear(); B.cpuHiddenSunk.clear(); logAdd(`${S.opp.name}: Sensoren wieder online.`); }
      renderSides();
    }
    if (B.myShips.every(s => s.sunk)) return setTimeout(() => endGame(false, B.cpu.ships), Math.max(0, B.animUntil - Date.now()));
    setTimeout(() => setTurn(!keep, keep), B.lastSunk ? 1600 : 0);
  }
  function cpuWantsPower(v) {
    const cpu = B.cpu, t = B.cpuTurns;
    const open = [...v.shots].some(([k, x]) => (x === 'hit') && !v.ships.some(s => s.sunk && s.cells.includes(k)));
    if (cpu.power === 'artillery') return (open && t >= 2) || t >= cpu.useAt + 4;
    if (cpu.power === 'radar') return !open && t >= cpu.useAt;
    return t >= cpu.useAt;
  }
  function cpuUsePower(v, blind) {
    const cpu = B.cpu, type = cpu.power; cpu.used = true;
    if (type === 'emp') return oppPowerFx({ type, blind: EMP_TURNS }, () => cpuAfter(false, blind));
    let [r, c] = AI.pick(S.diff === 'easy' ? 'normal' : S.diff, v.shots, v.ships, cpu);
    let h = Math.random() < .5;
    if (type === 'artillery') {
      // entlang einer erkannten Trefferlinie ausrichten
      const hits = [...v.shots].filter(([, x]) => x === 'hit').map(([k]) => k.split(',').map(Number));
      if (hits.some(([a, b]) => hits.some(([a2, b2]) => a2 === a && Math.abs(b2 - b) === 1))) h = true;
      else if (hits.some(([a, b]) => hits.some(([a2, b2]) => b2 === b && Math.abs(a2 - a) === 1))) h = false;
    }
    const cells = areaCells(type, r, c, h);
    if (type === 'radar') {
      const contact = B.myShips.some(s => cells.some(([a, b]) => s.cells.includes(K(a, b))));
      const free = cells.filter(([a, b]) => !B.incoming.has(K(a, b)));
      if (contact) cpu.queue.push(...free); else free.forEach(([a, b]) => cpu.clear.add(K(a, b)));
      return oppPowerFx({ type, scan: { r: cells[0][0], c: cells[0][1] } }, () => cpuAfter(false, blind));
    }
    const shots = cells.filter(([a, b]) => !B.incoming.has(K(a, b))).map(([a, b]) => ({ r: a, c: b }));
    Sound.shot();
    oppPowerFx({ type, cells, shots }, results => {
      results.forEach((x, i) => { if (blind) { B.cpuUnk.add(K(shots[i].r, shots[i].c)); if (x.res === 'sunk') B.cpuHiddenSunk.add(x.ship.key); } });
      cpuAfter(!blind && results.some(x => x.res !== 'miss'), blind);
    });
  }

  function logAdd(t, cls = '') { if (!B) return; B.log.unshift({ t, cls }); B.log.length = Math.min(B.log.length, 30); renderLog(); }
  function renderLog() { $('log').innerHTML = B.log.slice(0, 5).map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join(''); }

  function endGame(won, oppShips, silent = false) {
    if (S.mode === 'cpu' && B.hiddenTruth.size) revealLocal();
    B.over = true; B.busy = false; B.arm = null;
    enBd.host.classList.add('locked');
    $('sideMe').style.opacity = 1; $('sideEnemy').style.opacity = 1;
    if (oppShips) for (const s of oppShips) {
      if (!B.enemySunk.some(x => x.key === s.key)) enBd.ships.appendChild(shipEl(S.opp.country, s.key, s.r, s.c, s.h, 'reveal'));
    }
    const st = $('status');
    st.className = 'status ' + (won ? 'win' : 'lose');
    st.textContent = won ? '🏆 Sieg! Die feindliche Flotte ist vernichtet.' : '💀 Niederlage – deine Flotte wurde versenkt.';
    renderPowerBar();
    if (!silent) won ? Sound.win() : Sound.lose();
    setTimeout(() => showEnd(won), silent ? 0 : 1300);
  }
  function showEnd(won) {
    const acc = B.stats.shots ? Math.round(B.stats.hits / B.stats.shots * 100) : 0;
    if (S.tcode) {
      modal(`<h2 class="${won ? 'win' : 'lose'}">${won ? 'SIEG!' : 'VERLOREN'}</h2>
        <p>${won ? `Stark, Kapitän ${esc(S.name)}! Du bist eine Runde weiter.${B.forfeit ? ' (Dein Gegner hat aufgegeben.)' : ''}` : `${esc(S.opp.name)} war stärker – du bist leider ausgeschieden.`}</p>
        <div class="stats"><div><b>${B.stats.shots}</b><small>Schüsse</small></div><div><b>${B.stats.hits}</b><small>Treffer</small></div><div><b>${acc}%</b><small>Quote</small></div></div>
        <button class="btn primary" id="mTour">🏆 Zur Turnierübersicht</button>
        <button class="btn ghost small" id="mView">Spielfeld ansehen</button>`);
      $('mTour').onclick = () => { closeModal(); showTourney(); };
      $('mView').onclick = () => {
        closeModal();
        const b = el('button', 'btn small', 'Turnierübersicht'); b.style.marginLeft = '10px';
        b.onclick = () => showTourney(); $('status').appendChild(b);
      };
      return;
    }
    modal(`<h2 class="${won ? 'win' : 'lose'}">${won ? 'SIEG!' : 'VERLOREN'}</h2>
      <p>${won ? `Glückwunsch, Kapitän ${esc(S.name)}! Du hast ${esc(S.opp.name)} besiegt.` : `${esc(S.opp.name)} hat deine Flotte versenkt.`}</p>
      <div class="stats"><div><b>${B.stats.shots}</b><small>Schüsse</small></div><div><b>${B.stats.hits}</b><small>Treffer</small></div><div><b>${acc}%</b><small>Quote</small></div></div>
      <p class="small-hint">Bei der Revanche kannst du vor dem Aufstellen deine Fraktion neu wählen.</p>
      <div class="modal-btns"><button class="btn primary" id="mRematch">Revanche</button><button class="btn" id="mMenu">Hauptmenü</button></div>
      <button class="btn ghost small" id="mView">Spielfeld ansehen</button>`);
    $('mRematch').onclick = () => {
      if (S.mode === 'cpu') return initPlacement();
      socket.emit('rematch');
      $('mRematch').disabled = true; $('mRematch').textContent = `Warte auf ${S.opp.name} …`;
    };
    $('mMenu').onclick = () => toMenu(true);
    $('mView').onclick = () => {
      closeModal();
      const b = el('button', 'btn small', 'Ergebnis'); b.style.marginLeft = '10px';
      b.onclick = () => showEnd(won); $('status').appendChild(b);
    };
  }

  $('btnSurrender').onclick = () => {
    if (!B || B.over) return;
    modal(`<h2 style="font-size:30px">Aufgeben?</h2><p>${S.mode === 'cpu' ? 'Die Partie wird als Niederlage gewertet.' : S.tcode ? 'Dein Gegner gewinnt und du scheidest aus dem Turnier aus.' : 'Du verlässt das Online-Spiel. Dein Gegner gewinnt.'}</p>
      <div class="modal-btns"><button class="btn danger" id="mYes">Aufgeben</button><button class="btn" id="mNo">Weiterspielen</button></div>`);
    $('mNo').onclick = closeModal;
    $('mYes').onclick = () => { closeModal(); if (S.mode === 'cpu') endGame(false, B.cpu.ships); else if (S.tcode) { socket.emit('leave'); endGame(false, null); } else toMenu(true); };
  };

  function confirmLeave() {
    modal(`<h2 style="font-size:30px">Zum Hauptmenü?</h2><p>${S.tcode ? 'Du verlässt das Turnier.' : 'Das laufende Spiel wird beendet.'}</p>
      <div class="modal-btns"><button class="btn danger" id="mYes">Verlassen</button><button class="btn" id="mNo">Bleiben</button></div>`);
    $('mNo').onclick = closeModal; $('mYes').onclick = () => toMenu(true);
  }
  function toMenu(leave) {
    closeModal();
    if (leave && S.tcode && socket) socket.emit('tleave');
    else if (leave && S.mode === 'online' && socket) socket.emit('leave');
    sess.clear(); S.mode = null; S.code = null; S.pid = null; S.tcode = null; S.tour = null; S.tround = null; B = null; P.board = null;
    show('scrMenu');
  }

  /* ================= Computer-Gegner ================= */
  const AI = {
    pick(diff, shots, ships, cpu = {}) {
      const clear = cpu.clear || new Set(), queue = cpu.queue || [];
      const sunkCells = new Set(ships.filter(s => s.sunk).flatMap(s => s.cells));
      const isHit = v => v === 'hit' || v === 'sunk';
      const open = [...shots].filter(([k, v]) => isHit(v) && !sunkCells.has(k)).map(([k]) => k.split(',').map(Number));
      const free = (r, c) => inB(r, c) && !shots.has(K(r, c));
      const all0 = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (free(r, c)) all0.push([r, c]);
      const pool = all0.filter(([r, c]) => !clear.has(K(r, c)));
      const all = pool.length ? pool : all0;
      const any = arr => arr[rand(arr.length)];
      if (!open.length) { const q = queue.filter(([r, c]) => free(r, c)); if (q.length) return any(q); }
      if (diff === 'easy') {
        if (open.length && Math.random() < .5) { const n = this.neighbors(open, free); if (n.length) return any(n); }
        return any(all);
      }
      if (diff === 'normal') {
        if (open.length) { const t = this.target(open, free); if (t.length) return any(t); }
        const par = all.filter(([r, c]) => (r + c) % 2 === 0);
        return any(par.length ? par : all);
      }
      const lens = ships.filter(s => !s.sunk).map(s => s.len);
      const blocked = (r, c) => { const v = shots.get(K(r, c)); return v === 'miss' || v === 'unk' || sunkCells.has(K(r, c)) || clear.has(K(r, c)); };
      const openSet = new Set(open.map(([r, c]) => K(r, c)));
      const score = Array(N * N).fill(0);
      for (const L of lens) for (const h of [true, false]) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cs = Array.from({ length: L }, (_, i) => h ? [r, c + i] : [r + i, c]);
        if (cs.some(([a, b]) => !inB(a, b) || blocked(a, b))) continue;
        const hc = cs.filter(([a, b]) => openSet.has(K(a, b))).length;
        const w = hc ? Math.pow(40, hc) : (open.length ? 0.02 : 1);
        for (const [a, b] of cs) if (free(a, b)) score[a * N + b] += w;
      }
      let best = -1, cand = [];
      for (const [r, c] of all) {
        const v = score[r * N + c] + ((r + c) % 2 === 0 ? 0.01 : 0);
        if (v > best + 1e-9) { best = v; cand = [[r, c]]; } else if (Math.abs(v - best) < 1e-9) cand.push([r, c]);
      }
      return any(cand.length ? cand : all);
    },
    neighbors(open, free) {
      const out = [];
      for (const [r, c] of open) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(r + dr, c + dc)) out.push([r + dr, c + dc]);
      return out;
    },
    target(open, free) {
      const set = new Set(open.map(([r, c]) => K(r, c))), line = [];
      for (const [r, c] of open) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          if (!set.has(K(r + dr, c + dc)) && !set.has(K(r - dr, c - dc))) continue;
          let a = r, b = c; while (set.has(K(a + dr, b + dc))) { a += dr; b += dc; }
          if (free(a + dr, b + dc)) line.push([a + dr, b + dc]);
          a = r; b = c; while (set.has(K(a - dr, b - dc))) { a -= dr; b -= dc; }
          if (free(a - dr, b - dc)) line.push([a - dr, b - dc]);
        }
      }
      return line.length ? line : this.neighbors(open, free);
    },
  };

  /* ================= Online ================= */
  const socket = (!window.__noSocket && window.io) ? window.io() : null;
  const params = new URLSearchParams(location.search);
  const inviteCode = (params.get('room') || '').toUpperCase().slice(0, 5);

  if (!socket) {
    $('onlineHint').textContent = 'Online-Modus nur verfügbar, wenn das Spiel über den Server läuft.';
    ['btnHost', 'btnJoin'].forEach(b => $(b).disabled = true);
  }
  function setInviteMode(on) {
    $('joinInvite').classList.toggle('hidden', !on);
    $('modeField').classList.toggle('hidden', on);
    document.querySelector('.modes').classList.toggle('hidden', on);
  }
  if (inviteCode && socket) {
    setInviteMode(true); $('inviteCode').textContent = inviteCode; $('inCode').value = inviteCode;
    socket.emit('peek', { code: inviteCode }, res => {
      if (!res.ok) { $('inviteInfo').innerHTML = `<span class="err">${esc(res.error)}</span>`; $('btnAcceptInvite').disabled = true; return; }
      S.inviteTourney = !!res.tourney;
      $('inviteInfo').innerHTML = res.tourney
        ? `🏆 <b>Turnier</b> von ${flagSVG(res.hostCountry)} <b>${esc(res.host)}</b> · ${res.count} ${res.count === 1 ? 'Spieler' : 'Spieler'} angemeldet<br>Spielmodus: <b>${res.powerups ? '⚡ Mit Power-ups' : '⚓ Klassisch'}</b> <small>(vom Gastgeber festgelegt)</small>`
        : `${flagSVG(res.hostCountry)} <b>${esc(res.host)}</b> fordert dich heraus<br>Spielmodus: <b>${res.powerups ? '⚡ Mit Power-ups' : '⚓ Klassisch'}</b> <small>(vom Gastgeber festgelegt)</small>`;
    });
  }
  $('btnIgnoreInvite').onclick = () => { setInviteMode(false); $('inCode').value = ''; history.replaceState(null, '', location.pathname); };

  function joinRoom(code) {
    if (!getName() || !socket) return;
    code = (code || '').toUpperCase().trim();
    if (code.length < 5) { toast('Bitte den 5-stelligen Code eingeben.'); return; }
    socket.emit('join', { code, name: S.name, country: S.country }, res => {
      if (!res.ok && res.tourney) return joinTourney(code);
      if (!res.ok) { toast(res.error || 'Beitritt fehlgeschlagen.'); Sound.err(); return; }
      S.mode = 'online'; S.code = res.code; S.pid = res.pid; S.bonus = true; S.powerups = !!res.powerups;
      sess.set({ code: S.code, pid: S.pid });
      history.replaceState(null, '', location.pathname);
      setInviteMode(false);
    });
  }
  $('btnJoin').onclick = () => joinRoom($('inCode').value);
  $('inCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('inCode').value); });

  $('btnHost').onclick = () => {
    if (!getName() || !socket) return;
    Sound.click();
    socket.emit('create', { name: S.name, country: S.country, powerups: S.pmode === 'power' }, res => {
      if (!res.ok) return toast('Raum konnte nicht erstellt werden.');
      S.mode = 'online'; S.code = res.code; S.pid = res.pid;
      sess.set({ code: S.code, pid: S.pid });
      showLobby();
    });
  };
  function showLobby() {
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    $('lobbyCode').textContent = S.code; $('lobbyLink').value = link;
    $('lobbyMode').textContent = 'Modus: ' + (S.pmode === 'power' && S.mode === 'online' ? '⚡ Mit Power-ups' : '⚓ Klassisch');
    $('btnShare').classList.toggle('hidden', !navigator.share);
    show('scrLobby');
  }
  $('btnCopy').onclick = async () => {
    const v = $('lobbyLink').value;
    try { await navigator.clipboard.writeText(v); } catch { $('lobbyLink').select(); document.execCommand('copy'); }
    toast('Link kopiert!');
  };
  $('btnShare').onclick = () => navigator.share({ title: 'Schiffe versenken', text: `${S.name} fordert dich zu einer Partie Schiffe versenken heraus!`, url: $('lobbyLink').value }).catch(() => { });
  $('btnLobbyCancel').onclick = () => toMenu(true);

  if (socket) {
    socket.on('connect', () => {
      const ss = sess.get();
      if (!ss) return;
      socket.emit('rejoin', ss, res => {
        if (!res.ok) { if (S.mode === 'online' || S.tcode) { toast('Das Spiel existiert nicht mehr.'); toMenu(false); } else sess.clear(); return; }
        S.pid = ss.pid;
        if (res.tourney) {
          S.tcode = ss.tcode; S.tour = res.tourney; S.powerups = res.tourney.powerups;
          if (res.state) applySync(res.state);
          else if (!['scrPlace', 'scrBattle'].includes(S.screen) || !B) showTourney();
          return;
        }
        applySync(res.state);
      });
    });
    socket.on('disconnect', () => { if (S.mode === 'online') toast('Verbindung unterbrochen – verbinde neu …', 4000); });
    socket.on('matched', ({ opp, powerups, tourney, round }) => {
      S.opp = opp; S.bonus = true; S.powerups = !!powerups; S.oppOnline = true; S.oppReady = false; S.mode = 'online';
      S.tround = tourney ? round : null;
      B = null; initPlacement(); Sound.ping();
      if (tourney) { diceFx(); toast(`🎲 Runde ${round} ausgelost – dein Gegner: ${opp.name}`, 4000); }
      else toast(`${opp.name} ist an Bord! Stellt eure Flotten auf.`);
    });
    socket.on('tstate', st => {
      const prev = S.tour;
      S.tour = st; S.powerups = st.powerups;
      if (S.screen === 'scrTourney') renderTourney();
      if (st.phase === 'done' && (!prev || prev.phase !== 'done')) setTimeout(showChampion, S.screen === 'scrBattle' ? 2500 : 300);
    });
    socket.on('oppCountry', ({ country }) => {
      if (!S.opp || !COUNTRIES[country]) return;
      S.opp.country = country;
      if (S.screen === 'scrPlace') renderPlaceVs();
      toast(`${S.opp.name} kommandiert jetzt: ${COUNTRIES[country].name}`);
    });
    socket.on('oppReady', () => {
      S.oppReady = true;
      if (P.locked) showWait(); else toast(`${S.opp.name} ist bereit!`);
    });
    socket.on('start', ({ myTurn }) => {
      newBattle(P.placed); renderBattle();
      logAdd(myTurn ? 'Das Los hat entschieden: Du beginnst!' : `Das Los hat entschieden: ${S.opp.name} beginnt.`);
      setTurn(myTurn);
    });
    socket.on('result', ({ r, c, res, ship, myTurn, blind }) => {
      if (!B || B.outgoing.has(K(r, c))) return;
      onResult(r, c, res, ship);
      B.blind = blind || 0; updateEmp();
      if (B.over || res === 'sunk' && B.enemySunk.length === FLEET.length) { B.busy = false; return; }
      setTurn(myTurn, myTurn && (res === 'hit' || res === 'sunk'));
    });
    socket.on('incoming', ({ r, c, myTurn }) => {
      if (!B || B.incoming.has(K(r, c))) return;
      if (B.oppBlind > 0) B.oppBlind--;
      const { res } = onIncoming(r, c);
      if (!B.myShips.every(s => s.sunk)) setTurn(myTurn, !myTurn && res !== 'miss');
    });
    socket.on('powerResult', m => {
      if (!B) return;
      clearTimeout(B.shotTimer);
      if (m.type === 'emp') B.oppBlind = EMP_TURNS;
      myPowerFx(m, () => { B.blind = m.blind || 0; updateEmp(); setTurn(m.myTurn, m.myTurn); });
    });
    socket.on('powerIncoming', m => {
      if (!B) return;
      if (B.oppBlind > 0) B.oppBlind--;
      oppPowerFx(m, results => { if (!B.myShips.every(s => s.sunk)) setTurn(m.myTurn, !m.myTurn && results.some(x => x.res !== 'miss')); });
    });
    socket.on('empEnd', ({ reveal, sunk }) => {
      if (!B) return;
      setTimeout(() => revealBlind(reveal, sunk), Math.max(0, B.animUntil - Date.now()));
    });
    socket.on('gameover', ({ won, oppShips, reveal, forfeit }) => {
      if (!B || B.over) return;
      if (forfeit) { B.forfeit = true; toast(`${S.opp.name} hat aufgegeben bzw. die Verbindung verloren.`, 4000); }
      setTimeout(() => {
        if (reveal) revealBlind(reveal.filter(([r, c]) => B.outgoing.get(K(r, c)) === 'unknown'), []);
        endGame(won, oppShips);
      }, Math.max(0, B.animUntil - Date.now()));
    });
    socket.on('oppRematch', () => {
      toast(`${S.opp.name} will eine Revanche!`);
      const b = $('mRematch'); if (b && !b.disabled) b.textContent = 'Revanche annehmen';
    });
    socket.on('oppStatus', ({ online }) => {
      S.oppOnline = online;
      toast(online ? `${S.opp.name} ist wieder verbunden.` : `${S.opp.name} hat die Verbindung verloren – warte bis zu 2 Minuten …`, 3500);
      if (B && S.screen === 'scrBattle') renderSides();
    });
    socket.on('oppLeft', () => {
      if (S.mode !== 'online') return;
      sess.clear();
      modal(`<h2 style="font-size:30px">Spiel beendet</h2><p>${esc(S.opp ? S.opp.name : 'Dein Gegner')} hat das Spiel verlassen.</p><button class="btn primary" id="mMenu">Zum Hauptmenü</button>`);
      $('mMenu').onclick = () => toMenu(false);
    });
    socket.on('errorMsg', m => toast(m));
  }

  function applySync(st) {
    S.mode = 'online'; S.code = st.code; S.bonus = true; S.powerups = !!st.powerups; if (st.tourney) S.tround = st.round;
    if (st.me) { S.name = st.me.name; S.country = st.me.country; }
    if (st.opp) { S.opp = st.opp; S.oppOnline = st.opp.online !== false; }
    S.oppReady = st.oppReady;
    if (st.phase === 'lobby') return showLobby();
    const fromList = list => Object.fromEntries(list.map(s => [s.key, { r: s.r, c: s.c, h: s.h }]));
    if (st.phase === 'placing') {
      if (!st.ready) { if (S.screen !== 'scrPlace' || !P.board) initPlacement(); return; }
      if (S.screen !== 'scrPlace' || !P.board) initPlacement();
      P.placed = fromList(st.myShips); P.power = st.myPower; P.locked = true; P.sel = null; renderPlace(); showWait();
      return;
    }
    const oldLog = B ? B.log : [];
    P.placed = fromList(st.myShips); P.power = st.myPower;
    newBattle(P.placed); B.log = oldLog;
    for (const [r, c] of st.incoming) { const { res } = strike(B.myShips, r, c); B.incoming.set(K(r, c), res); }
    for (const [r, c, res] of st.outgoing) { B.outgoing.set(K(r, c), res); B.stats.shots++; if (res === 'hit' || res === 'sunk') B.stats.hits++; }
    B.enemySunk = st.enemySunk;
    if (B.power) { B.power.used = !!st.myPowerUsed; B.oppPower = { type: st.oppPower, used: !!st.oppPowerUsed }; }
    B.blind = st.blind || 0; B.oppBlind = st.oppBlind || 0; B.scans = st.scans || [];
    closeModal();
    renderBattle();
    if (st.phase === 'over') { endGame(st.won, st.oppShips, true); if (st.myRematch) { const b = $('mRematch'); b.disabled = true; b.textContent = `Warte auf ${S.opp.name} …`; } }
    else setTurn(st.myTurn);
  }

  /* ================= Turnier ================= */
  function joinTourney(code) {
    if (!getName() || !socket) return;
    socket.emit('tjoin', { code, name: S.name, country: S.country }, res => {
      if (!res.ok) { toast(res.error || 'Beitritt fehlgeschlagen.'); Sound.err(); return; }
      S.tcode = res.code; S.pid = res.pid; S.powerups = !!res.powerups;
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
    socket.emit('tcreate', { name: S.name, country: S.country, powerups: S.pmode === 'power' }, res => {
      if (!res.ok) return toast('Turnier konnte nicht erstellt werden.');
      S.tcode = res.code; S.pid = res.pid; S.powerups = S.pmode === 'power';
      sess.set({ tcode: S.tcode, pid: S.pid });
      showTourney();
    });
  };
  function showTourney() { closeModal(); show('scrTourney'); renderTourney(); }
  function renderTourney() {
    const T = S.tour;
    if (!T) { $('tMsg').textContent = 'Lade Turnier …'; return; }
    $('tCode').textContent = T.code;
    $('tMode').textContent = T.powerups ? '⚡ Mit Power-ups' : '⚓ Klassisch';
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

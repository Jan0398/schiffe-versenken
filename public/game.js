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
    bonus: true, mode: null, opp: null, code: null, pid: null,
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
  };
  function updateSoundBtn() { $('btnSound').textContent = Sound.on ? '🔊' : '🔇'; }
  $('btnSound').onclick = () => { Sound.on = !Sound.on; store.set('sv_sound', Sound.on ? '1' : '0'); updateSoundBtn(); };
  updateSoundBtn();

  /* ================= UI-Helfer ================= */
  function show(id) {
    ['scrMenu', 'scrLobby', 'scrPlace', 'scrBattle'].forEach(s => $(s).classList.toggle('hidden', s !== id));
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
  function renderCountries() {
    const box = $('countries'); box.innerHTML = '';
    for (const [cc, C] of Object.entries(COUNTRIES)) {
      const d = el('div', 'country' + (cc === S.country ? ' on' : ''), `${flagSVG(cc)}<b>${C.name}</b><small>${C.navy}</small>`);
      d.onclick = () => { S.country = cc; store.set('sv_country', cc); Sound.click(); renderCountries(); renderFleetPreview(); };
      box.appendChild(d);
    }
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
  $('brandHome').onclick = () => { if (S.screen === 'scrMenu') return; confirmLeave(); };

  const DIFF_LABEL = { easy: 'Leicht', normal: 'Normal', hard: 'Schwer' };
  $('btnCpu').onclick = () => {
    if (!getName()) return;
    Sound.click();
    const others = Object.keys(COUNTRIES).filter(c => c !== S.country);
    S.mode = 'cpu'; S.opp = { name: 'Computer (' + DIFF_LABEL[S.diff] + ')', country: others[rand(others.length)] };
    S.oppOnline = true; S.oppReady = true;
    initPlacement();
  };

  /* ================= Spielfeld ================= */
  function makeBoard(host, enemy = false) {
    host.innerHTML = ''; host.className = 'board-wrap' + (enemy ? ' enemy locked' : '');
    const top = el('div', 'lbl-top'), left = el('div', 'lbl-left');
    for (let i = 0; i < N; i++) { top.appendChild(el('span', null, i + 1)); left.appendChild(el('span', null, ROWS[i])); }
    const board = el('div', 'board'), ships = el('div', 'layer ships'), pegs = el('div', 'layer pegs grid10'), cellsL = el('div', 'layer cells grid10');
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
    P.placed = {}; P.sel = 'carrier'; P.h = true; P.hover = null; P.locked = false; S.oppReady = S.mode === 'cpu';
    P.board = makeBoard($('placeBoard'));
    const L = P.board.cellsL;
    L.addEventListener('mousemove', e => { const a = P.board.at(e); if (a && (!P.hover || a[0] !== P.hover[0] || a[1] !== P.hover[1])) { P.hover = a; renderPlace(); } });
    L.addEventListener('mouseleave', () => { P.hover = null; renderPlace(); });
    L.addEventListener('click', e => { const a = P.board.at(e); if (a) placeAt(a[0], a[1]); });
    L.addEventListener('contextmenu', e => { e.preventDefault(); rotate(); });
    $('placeVs').innerHTML = `${flagSVG(S.country)} <span>${esc(S.name)}</span> <b style="color:var(--red)">VS</b> ${flagSVG(S.opp.country)} <span>${esc(S.opp.name)}</span>`;
    $('waitMsg').classList.add('hidden');
    show('scrPlace');
    renderPlace();
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
    $('btnReady').disabled = Object.keys(P.placed).length < FLEET.length || P.locked;
    ['btnRotate', 'btnRandom', 'btnClear'].forEach(b => $(b).disabled = P.locked);
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
  });
  $('btnReady').onclick = () => {
    if (Object.keys(P.placed).length < FLEET.length) return;
    P.locked = true; P.sel = null; P.hover = null; renderPlace(); Sound.click();
    if (S.mode === 'cpu') return startCpuBattle();
    socket.emit('ready', { ships: FLEET.map(f => ({ key: f.key, ...P.placed[f.key] })) });
    showWait();
  };
  function showWait() {
    const w = $('waitMsg'); w.classList.remove('hidden');
    w.querySelector('span').textContent = S.oppReady ? `${S.opp.name} ist bereit – gleich geht's los …` : `Warte, bis ${S.opp.name} die Flotte aufgestellt hat …`;
  }

  /* ================= Schlacht ================= */
  let B = null, myBd = null, enBd = null;

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
      stats: { shots: 0, hits: 0 }, cpu: null, log: [] };
  }

  function startCpuBattle() {
    newBattle(P.placed);
    B.cpu = { ships: buildShips(randomFleet()) };
    renderBattle();
    const first = Math.random() < .5;
    logAdd(first ? 'Münzwurf: Du beginnst!' : `Münzwurf: ${S.opp.name} beginnt.`);
    setTurn(first);
  }

  function renderBattle() {
    show('scrBattle');
    myBd = makeBoard($('myBoard'));
    enBd = makeBoard($('enemyBoard'), true);
    for (const s of B.myShips) myBd.ships.appendChild(shipEl(S.country, s.key, s.r, s.c, s.h, s.sunk ? 'sunk' : ''));
    for (const [k, v] of B.incoming) { const [r, c] = k.split(',').map(Number); setPeg(myBd, r, c, v === 'miss' ? 'miss' : 'hit'); }
    for (const [k, v] of B.outgoing) { const [r, c] = k.split(',').map(Number); setPeg(enBd, r, c, v === 'miss' ? 'miss' : 'hit'); }
    for (const s of B.enemySunk) enBd.ships.appendChild(shipEl(S.opp.country, s.key, s.r, s.c, s.h, 'sunk'));
    enBd.cellsL.addEventListener('click', e => { const a = enBd.at(e); if (a) fire(a[0], a[1]); });
    renderLog(); renderSides();
  }

  function renderSides() {
    const myLeft = B.myShips.filter(s => !s.sunk).length, enLeft = FLEET.length - B.enemySunk.length;
    $('plateMe').innerHTML = `${flagSVG(S.country)}<div class="p-name">${esc(S.name)}<small>Deine Flotte · ${COUNTRIES[S.country].navy}</small></div><div class="p-count"><b>${myLeft}</b>/5<br>Schiffe</div>`;
    $('plateEnemy').innerHTML = `${flagSVG(S.opp.country)}<div class="p-name">${esc(S.opp.name)}${S.oppOnline ? '' : ' <span class="off">● offline</span>'}<small>Feindgewässer · ${COUNTRIES[S.opp.country].navy}</small></div><div class="p-count"><b>${enLeft}</b>/5<br>Schiffe</div>`;
    const list = (cc, isSunk) => FLEET.map(f => {
      const s = shipInfo(cc, f.key);
      return `<div class="fl-item${isSunk(f.key) ? ' sunk' : ''}"><div class="fl-img">${shipSVG(cc, f.key, true)}</div><span>${esc(s.name)}</span></div>`;
    }).join('');
    $('myFleet').innerHTML = list(S.country, k => B.myShips.find(s => s.key === k).sunk);
    $('enemyFleet').innerHTML = list(S.opp.country, k => B.enemySunk.some(s => s.key === k));
  }

  function setTurn(mine, again = false) {
    B.myTurn = mine; B.busy = false;
    enBd.host.classList.toggle('locked', !mine || B.over);
    $('sideMe').style.opacity = mine ? .78 : 1;
    $('sideEnemy').style.opacity = mine ? 1 : .78;
    const st = $('status');
    st.className = 'status ' + (mine ? 'mine' : 'theirs');
    st.textContent = mine ? (again ? '🔥 Treffer! Du darfst nochmal schießen!' : '🎯 Du bist am Zug – wähle ein Ziel im Feindgewässer!')
      : (again ? `🔥 ${S.opp.name} hat getroffen und schießt nochmal …` : `⏳ ${S.opp.name} zielt …`);
    if (mine && !again) Sound.ping();
    if (!mine && S.mode === 'cpu' && !B.over) setTimeout(cpuMove, (B.lastSunk ? 2200 : 750) + Math.random() * 700);
    B.lastSunk = false;
  }

  function fire(r, c) {
    if (!B || B.over || !B.myTurn || B.busy) return;
    if (B.outgoing.has(K(r, c))) { Sound.err(); return; }
    B.busy = true; enBd.host.classList.add('locked');
    Sound.shot();
    if (S.mode === 'cpu') {
      const { res, ship } = strike(B.cpu.ships, r, c);
      setTimeout(() => {
        onResult(r, c, res, ship ? { key: ship.key, r: ship.r, c: ship.c, h: ship.h, len: ship.len } : null);
        if (B.cpu.ships.every(s => s.sunk)) return endGame(true, B.cpu.ships);
        if (res === 'sunk') B.lastSunk = true;
        setTurn(res !== 'miss', res !== 'miss');
      }, 380);
    } else {
      socket.emit('shoot', { r, c });
      B.shotTimer = setTimeout(() => { if (B && B.busy) { B.busy = false; enBd.host.classList.remove('locked'); toast('Keine Antwort vom Server – nochmal versuchen.'); } }, 8000);
    }
  }

  function onResult(r, c, res, ship) {
    clearTimeout(B.shotTimer);
    B.outgoing.set(K(r, c), res); B.stats.shots++;
    if (res !== 'miss') B.stats.hits++;
    setPeg(enBd, r, c, res === 'miss' ? 'miss' : 'hit', true);
    if (res === 'miss') { Sound.splash(); logAdd(`Du: ${coord(r, c)} – Wasser.`); }
    else if (res === 'hit') { Sound.boom(); shake(enBd.board); logAdd(`Du: ${coord(r, c)} – Treffer!`, 'l-hit'); }
    else {
      B.enemySunk.push(ship);
      const se = shipEl(S.opp.country, ship.key, ship.r, ship.c, ship.h, 'sunk sunk-enemy');
      setTimeout(() => enBd.ships.appendChild(se), 450);
      megaBoom(enBd, ship);
      logAdd(`Du: ${coord(r, c)} – Versenkt! ${shipInfo(S.opp.country, ship.key).name} geht unter.`, 'l-sunk');
      toast(`💥 ${shipInfo(S.opp.country, ship.key).name} versenkt!`);
    }
    renderSides();
  }

  function onIncoming(r, c) {
    const { res, ship } = strike(B.myShips, r, c);
    B.incoming.set(K(r, c), res);
    setPeg(myBd, r, c, res === 'miss' ? 'miss' : 'hit', true);
    if (res === 'miss') { Sound.splash(); logAdd(`${S.opp.name}: ${coord(r, c)} – Wasser.`); }
    else if (res === 'hit') { Sound.boom(); shake(myBd.board); logAdd(`${S.opp.name}: ${coord(r, c)} – Treffer auf ${shipInfo(S.country, ship.key).name}!`, 'l-hit'); }
    else {
      const se = myBd.ships.querySelector(`[data-key="${ship.key}"]`); if (se) setTimeout(() => se.classList.add('sunk'), 450);
      megaBoom(myBd, ship);
      logAdd(`${S.opp.name}: ${coord(r, c)} – ${shipInfo(S.country, ship.key).name} wurde versenkt!`, 'l-sunk');
    }
    renderSides();
    return res;
  }

  function megaBoom(bd, s) {
    const cell = bd.board.clientWidth / N, len = s.len || LEN[s.key];
    const w = (s.h ? len : 1), h = (s.h ? 1 : len);
    const box = el('div', 'fx-sink');
    Object.assign(box.style, { left: s.c * 10 + '%', top: s.r * 10 + '%', width: w * 10 + '%', height: h * 10 + '%' });
    box.style.setProperty('--cell', cell + 'px');
    box.appendChild(el('div', 'core'));
    for (let i = 0; i < len * 4; i++) {
      const f = el('div', 'fb'), t = ((i % len) + .2 + Math.random() * .6) / len, j = 25 + Math.random() * 50;
      f.style.setProperty('--x', (s.h ? t * 100 : j) + '%'); f.style.setProperty('--y', (s.h ? j : t * 100) + '%');
      f.style.setProperty('--d', (Math.floor(i / len) * 160 + (i % len) * 90 + rand(60)) + 'ms');
      f.style.setProperty('--s', (.8 + Math.random() * 1.1).toFixed(2));
      box.appendChild(f);
    }
    for (let i = 0; i < 3; i++) { const r = el('div', 'ring'); r.style.setProperty('--d', i * 180 + 'ms'); r.style.setProperty('--rs', (len + 2.5 - i * .6) * cell + 'px'); box.appendChild(r); }
    for (let i = 0; i < 26; i++) {
      const p = el('div', 'sp');
      p.style.setProperty('--a', rand(360) + 'deg'); p.style.setProperty('--dist', ((.8 + Math.random() * 1.8) * cell * (1 + len / 3)) + 'px');
      p.style.setProperty('--d', rand(350) + 'ms'); box.appendChild(p);
    }
    for (let i = 0; i < len * 2; i++) {
      const m = el('div', 'smoke'), t = (i + .5) / (len * 2);
      m.style.setProperty('--x', (s.h ? t * 100 : 50) + '%'); m.style.setProperty('--y', (s.h ? 50 : t * 100) + '%');
      m.style.setProperty('--d', (500 + rand(500)) + 'ms'); m.style.setProperty('--dx', (rand(40) - 20) + 'px');
      box.appendChild(m);
    }
    const banner = el('div', 'sunk-banner', 'VERSENKT!');
    bd.fx.append(box, banner);
    const flash = el('div', 'screen-flash'); document.body.appendChild(flash);
    const battle = document.querySelector('.battle'); battle.classList.remove('shake-big'); void battle.offsetWidth; battle.classList.add('shake-big');
    for (let i = 0; i < Math.min(len, 4); i++) setTimeout(() => Sound.boom(), i * 170);
    setTimeout(() => Sound.sunk(), 250);
    setTimeout(() => { box.remove(); banner.remove(); flash.remove(); }, 3200);
  }

  function cpuMove() {
    if (!B || B.over || B.myTurn || S.mode !== 'cpu') return;
    const [r, c] = AI.pick(S.diff, B.incoming, B.myShips);
    Sound.shot();
    setTimeout(() => {
      if (!B || B.over) return;
      const res = onIncoming(r, c);
      if (B.myShips.every(s => s.sunk)) return endGame(false, B.cpu.ships);
      if (res === 'sunk') B.lastSunk = true;
      setTimeout(() => setTurn(res === 'miss', res !== 'miss'), res === 'sunk' ? 1600 : 0);
    }, 380);
  }

  function logAdd(t, cls = '') { if (!B) return; B.log.unshift({ t, cls }); B.log.length = Math.min(B.log.length, 30); renderLog(); }
  function renderLog() { $('log').innerHTML = B.log.slice(0, 5).map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join(''); }

  function endGame(won, oppShips, silent = false) {
    B.over = true; B.busy = false;
    enBd.host.classList.add('locked');
    $('sideMe').style.opacity = 1; $('sideEnemy').style.opacity = 1;
    if (oppShips) for (const s of oppShips) {
      if (!B.enemySunk.some(x => x.key === s.key)) enBd.ships.appendChild(shipEl(S.opp.country, s.key, s.r, s.c, s.h, 'reveal'));
    }
    const st = $('status');
    st.className = 'status ' + (won ? 'win' : 'lose');
    st.textContent = won ? '🏆 Sieg! Die feindliche Flotte liegt am Meeresgrund.' : '💀 Niederlage – deine Flotte wurde versenkt.';
    if (!silent) won ? Sound.win() : Sound.lose();
    setTimeout(() => showEnd(won), silent ? 0 : 1300);
  }
  function showEnd(won) {
    const acc = B.stats.shots ? Math.round(B.stats.hits / B.stats.shots * 100) : 0;
    modal(`<h2 class="${won ? 'win' : 'lose'}">${won ? 'SIEG!' : 'VERLOREN'}</h2>
      <p>${won ? `Glückwunsch, Kapitän ${esc(S.name)}! Du hast ${esc(S.opp.name)} besiegt.` : `${esc(S.opp.name)} hat deine Flotte versenkt.`}</p>
      <div class="stats"><div><b>${B.stats.shots}</b><small>Schüsse</small></div><div><b>${B.stats.hits}</b><small>Treffer</small></div><div><b>${acc}%</b><small>Quote</small></div></div>
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
    modal(`<h2 style="font-size:30px">Aufgeben?</h2><p>${S.mode === 'cpu' ? 'Die Partie wird als Niederlage gewertet.' : 'Du verlässt das Online-Spiel. Dein Gegner gewinnt.'}</p>
      <div class="modal-btns"><button class="btn danger" id="mYes">Aufgeben</button><button class="btn" id="mNo">Weiterspielen</button></div>`);
    $('mNo').onclick = closeModal;
    $('mYes').onclick = () => { closeModal(); if (S.mode === 'cpu') endGame(false, B.cpu.ships); else toMenu(true); };
  };

  function confirmLeave() {
    modal(`<h2 style="font-size:30px">Zum Hauptmenü?</h2><p>Das laufende Spiel wird beendet.</p>
      <div class="modal-btns"><button class="btn danger" id="mYes">Verlassen</button><button class="btn" id="mNo">Bleiben</button></div>`);
    $('mNo').onclick = closeModal; $('mYes').onclick = () => toMenu(true);
  }
  function toMenu(leave) {
    closeModal();
    if (leave && S.mode === 'online' && socket) socket.emit('leave');
    sess.clear(); S.mode = null; S.code = null; S.pid = null; B = null; P.board = null;
    show('scrMenu');
  }

  /* ================= Computer-Gegner ================= */
  const AI = {
    pick(diff, shots, myShips) {
      const sunkCells = new Set(myShips.filter(s => s.sunk).flatMap(s => s.cells));
      const open = [...shots].filter(([k, v]) => v !== 'miss' && !sunkCells.has(k)).map(([k]) => k.split(',').map(Number));
      const free = (r, c) => inB(r, c) && !shots.has(K(r, c));
      const all = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (free(r, c)) all.push([r, c]);
      const any = arr => arr[rand(arr.length)];
      if (diff === 'easy') {
        if (open.length && Math.random() < .5) { const n = this.neighbors(open, free); if (n.length) return any(n); }
        return any(all);
      }
      if (diff === 'normal') {
        if (open.length) { const t = this.target(open, free); if (t.length) return any(t); }
        const par = all.filter(([r, c]) => (r + c) % 2 === 0);
        return any(par.length ? par : all);
      }
      // schwer: Wahrscheinlichkeitsdichte
      const lens = myShips.filter(s => !s.sunk).map(s => s.len);
      const blocked = (r, c) => { const v = shots.get(K(r, c)); return v === 'miss' || sunkCells.has(K(r, c)); };
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
  if (inviteCode && socket) {
    $('joinInvite').classList.remove('hidden'); $('inviteCode').textContent = inviteCode; $('inCode').value = inviteCode;
  }

  function joinRoom(code) {
    if (!getName() || !socket) return;
    code = (code || '').toUpperCase().trim();
    if (code.length < 5) { toast('Bitte den 5-stelligen Code eingeben.'); return; }
    socket.emit('join', { code, name: S.name, country: S.country }, res => {
      if (!res.ok) { toast(res.error || 'Beitritt fehlgeschlagen.'); Sound.err(); return; }
      S.mode = 'online'; S.code = res.code; S.pid = res.pid; S.bonus = true;
      sess.set({ code: S.code, pid: S.pid });
      history.replaceState(null, '', location.pathname);
      $('joinInvite').classList.add('hidden');
    });
  }
  $('btnAcceptInvite').onclick = () => joinRoom(inviteCode);
  $('btnJoin').onclick = () => joinRoom($('inCode').value);
  $('inCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('inCode').value); });

  $('btnHost').onclick = () => {
    if (!getName() || !socket) return;
    Sound.click();
    socket.emit('create', { name: S.name, country: S.country, bonusShot: S.bonus }, res => {
      if (!res.ok) return toast('Raum konnte nicht erstellt werden.');
      S.mode = 'online'; S.code = res.code; S.pid = res.pid;
      sess.set({ code: S.code, pid: S.pid });
      showLobby();
    });
  };
  function showLobby() {
    const link = `${location.origin}${location.pathname}?room=${S.code}`;
    $('lobbyCode').textContent = S.code; $('lobbyLink').value = link;
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
        if (!res.ok) { if (S.mode === 'online') { toast('Das Spiel existiert nicht mehr.'); toMenu(false); } else sess.clear(); return; }
        S.pid = ss.pid; applySync(res.state);
      });
    });
    socket.on('disconnect', () => { if (S.mode === 'online') toast('Verbindung unterbrochen – verbinde neu …', 4000); });
    socket.on('matched', ({ opp, bonusShot }) => {
      S.opp = opp; S.bonus = true; S.oppOnline = true; S.oppReady = false; S.mode = 'online';
      B = null; initPlacement(); Sound.ping();
      toast(`${opp.name} ist an Bord! Stellt eure Flotten auf.`);
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
    socket.on('result', ({ r, c, res, ship, myTurn }) => {
      if (!B || B.outgoing.has(K(r, c))) return;
      onResult(r, c, res, ship);
      if (B.over || res === 'sunk' && B.enemySunk.length === FLEET.length) { B.busy = false; return; }
      setTurn(myTurn, myTurn && res !== 'miss');
    });
    socket.on('incoming', ({ r, c, myTurn }) => {
      if (!B || B.incoming.has(K(r, c))) return;
      const res = onIncoming(r, c);
      if (!B.myShips.every(s => s.sunk)) setTurn(myTurn, !myTurn && res !== 'miss');
    });
    socket.on('gameover', ({ won, oppShips }) => { if (B && !B.over) endGame(won, oppShips); });
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
    S.mode = 'online'; S.code = st.code; S.bonus = true;
    if (st.me) { S.name = st.me.name; S.country = st.me.country; }
    if (st.opp) { S.opp = st.opp; S.oppOnline = st.opp.online !== false; }
    S.oppReady = st.oppReady;
    if (st.phase === 'lobby') return showLobby();
    const fromList = list => Object.fromEntries(list.map(s => [s.key, { r: s.r, c: s.c, h: s.h }]));
    if (st.phase === 'placing') {
      if (!st.ready) { if (S.screen !== 'scrPlace' || !P.board) initPlacement(); return; }
      if (S.screen !== 'scrPlace' || !P.board) initPlacement();
      P.placed = fromList(st.myShips); P.locked = true; P.sel = null; renderPlace(); showWait();
      return;
    }
    const oldLog = B ? B.log : [];
    P.placed = fromList(st.myShips);
    newBattle(P.placed); B.log = oldLog;
    for (const [r, c] of st.incoming) { const { res } = strike(B.myShips, r, c); B.incoming.set(K(r, c), res); }
    for (const [r, c, res] of st.outgoing) { B.outgoing.set(K(r, c), res); B.stats.shots++; if (res !== 'miss') B.stats.hits++; }
    B.enemySunk = st.enemySunk;
    closeModal();
    renderBattle();
    if (st.phase === 'over') { endGame(st.won, st.oppShips, true); if (st.myRematch) { const b = $('mRematch'); b.disabled = true; b.textContent = `Warte auf ${S.opp.name} …`; } }
    else setTurn(st.myTurn);
  }

  /* ================= Start ================= */
  renderCountries();
  renderFleetPreview();
  show('scrMenu');
})();

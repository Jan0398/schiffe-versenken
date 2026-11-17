// Schiffe versenken – Online-Server (Express + Socket.io)
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 30000 });

const N = 10;
const FLEET = { carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2 };
const COUNTRIES = ['de', 'us', 'uk', 'fr', 'jp', 'ru', 'it', 'al', 'un', 'te', 'pi'];
const POWERS = ['emp', 'artillery', 'nuke', 'radar'];
const EMP_TURNS = 5;
const MAX_TOURNEY = 16;
const BOT_NAMES = ['Bot Klabautermann', 'Bot Seebär', 'Bot Smutje', 'Bot Ahoi', 'Bot Blechbart', 'Bot Kielholer', 'Bot Sturmflut', 'Bot Leuchtturm'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = n => crypto.randomInt(n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

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
const GRACE_MS = 120000; // Zeit für Wiederverbindung
const rooms = new Map();
const tourneys = new Map();

const cleanName = n => String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 18) || 'Kapitän';
const cleanCountry = c => (COUNTRIES.includes(c) ? c : 'de');

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[rnd(A.length)]).join(''); } while (rooms.has(c) || tourneys.has(c));
  return c;
}

function basePlayer(pid, sid, name, country, bot = false) {
  return { pid, sid, name: cleanName(name), country: cleanCountry(country), bot,
    ships: null, shots: new Map(), rematch: false, online: true, timer: null,
    power: null, powerUsed: false, blind: 0, hidden: [], scans: [] };
}
const newPlayer = (socket, name, country) => basePlayer(crypto.randomUUID(), socket.id, name, country);

const pub = s => ({ key: s.key, r: s.r, c: s.c, h: s.h, len: s.len });

function buildShips(list) {
  if (!Array.isArray(list) || list.length !== 5) return null;
  const seen = new Set(), occ = new Set(), ships = [];
  for (const s of list) {
    const len = FLEET[s && s.key];
    if (!len || seen.has(s.key)) return null;
    seen.add(s.key);
    const r = s.r | 0, c = s.c | 0, h = !!s.h;
    const cells = [];
    for (let i = 0; i < len; i++) {
      const rr = h ? r : r + i, cc = h ? c + i : c;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) return null;
      const k = rr + ',' + cc;
      if (occ.has(k)) return null;
      occ.add(k); cells.push(k);
    }
    ships.push({ key: s.key, r, c, h, len, cells, hits: new Set(), sunk: false });
  }
  return ships;
}
function randomFleetList() {
  for (; ;) {
    const list = [], occ = new Set(); let ok = true;
    for (const [key, len] of Object.entries(FLEET)) {
      let done = false;
      for (let t = 0; t < 300 && !done; t++) {
        const h = rnd(2) === 0, r = rnd(h ? N : N - len + 1), c = rnd(h ? N - len + 1 : N);
        const cells = Array.from({ length: len }, (_, i) => h ? r + ',' + (c + i) : (r + i) + ',' + c);
        if (cells.some(k => occ.has(k))) continue;
        cells.forEach(k => occ.add(k)); list.push({ key, r, c, h }); done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (ok) return list;
  }
}

function emitTo(p, ev, data) { if (p && !p.bot && p.sid) io.to(p.sid).emit(ev, data); }

function syncState(room, i) {
  const me = room.players[i], op = room.players[1 - i];
  const list = m => [...m].map(([k, v]) => [...k.split(',').map(Number), v]);
  return {
    code: room.code, phase: room.phase, bonusShot: room.bonusShot, tourney: room.tourney || null, round: room.round || null,
    me: { name: me.name, country: me.country },
    opp: op ? { name: op.name, country: op.country, online: op.online } : null,
    myShips: me.ships ? me.ships.map(pub) : null,
    ready: !!me.ships, oppReady: !!(op && op.ships),
    myTurn: room.turn === i,
    outgoing: list(me.shots).map(([r, c, v]) => me.hidden.includes(r + ',' + c) && room.phase !== 'over' ? [r, c, 'unknown'] : [r, c, v]),
    enemySunk: op && op.ships ? op.ships.filter(s => s.sunk && (room.phase === 'over' || !s.cells.some(k => me.hidden.includes(k)))).map(pub) : [],
    incoming: op ? list(op.shots) : [],
    won: room.winner === null ? null : room.winner === i,
    oppShips: room.phase === 'over' && op && op.ships ? op.ships.map(pub) : null,
    myRematch: me.rematch, oppRematch: !!(op && op.rematch),
    powerups: room.powerups, myPower: me.power, myPowerUsed: me.powerUsed,
    oppPowerUsed: !!(op && op.powerUsed), oppPower: op && op.powerUsed ? op.power : null,
    blind: me.blind, oppBlind: op ? op.blind : 0, scans: me.scans,
  };
}

function startPlacing(room) {
  room.phase = 'placing'; room.turn = null; room.winner = null;
  room.players.forEach(p => { p.ships = null; p.shots.clear(); p.rematch = false; p.power = null; p.powerUsed = false; p.blind = 0; p.hidden = []; p.scans = []; });
  room.players.forEach((p, i) => {
    const op = room.players[1 - i];
    emitTo(p, 'matched', { opp: { name: op.name, country: op.country }, bonusShot: room.bonusShot, powerups: room.powerups,
      tourney: room.tourney || null, round: room.round || null });
  });
  room.players.forEach((p, i) => { if (p.bot) setTimeout(() => readyPlayer(room, i, buildShips(randomFleetList()), null), 600); });
}

function readyPlayer(room, idx, ships, power) {
  const me = room.players[idx], op = room.players[1 - idx];
  if (rooms.get(room.code) !== room || room.phase !== 'placing' || me.ships) return;
  me.ships = ships; me.power = power;
  if (op && op.ships) {
    room.phase = 'playing';
    room.turn = rnd(2);
    if (room.players.every(p => p.bot)) return simulateBots(room);
    room.players.forEach((p, i) => emitTo(p, 'start', { myTurn: room.turn === i }));
    maybeBot(room);
  } else emitTo(op, 'oppReady', {});
}

function closeRoom(room, reason) {
  room.players.forEach(p => { if (p.timer) clearTimeout(p.timer); });
  room.players.forEach(p => emitTo(p, 'oppLeft', { reason }));
  rooms.delete(room.code);
}

/* ---------- Spielzüge ---------- */
function finishTurn(room, idx, over, keepTurn) {
  if (over) { room.phase = 'over'; room.winner = idx; room.turn = null; }
  else room.turn = keepTurn ? idx : 1 - idx;
}
function afterShots(room, idx, over) {
  const me = room.players[idx], op = room.players[1 - idx];
  if (over) {
    emitTo(me, 'gameover', { won: true, oppShips: op.ships.map(pub), reveal: [...me.shots].map(([k, v]) => [...k.split(',').map(Number), v]) });
    emitTo(op, 'gameover', { won: false, oppShips: me.ships.map(pub), reveal: [...op.shots].map(([k, v]) => [...k.split(',').map(Number), v]) });
    me.hidden = []; op.hidden = [];
    matchFinished(room);
    return;
  }
  if (me.blindEnded) {
    me.blindEnded = false;
    emitTo(me, 'empEnd', {
      reveal: me.hidden.map(k => [...k.split(',').map(Number), me.shots.get(k)]),
      sunk: op.ships.filter(s => s.sunk).map(pub),
    });
    me.hidden = [];
  }
  maybeBot(room);
}
function strike(me, op, r, c) {
  const k = r + ',' + c;
  if (me.shots.has(k)) return null;
  const ship = op.ships.find(s => s.cells.includes(k));
  let res = 'miss';
  if (ship) { ship.hits.add(k); res = ship.hits.size === ship.len ? 'sunk' : 'hit'; if (res === 'sunk') ship.sunk = true; }
  me.shots.set(k, res);
  if (me.blind > 0) me.hidden.push(k);
  return { r, c, res, ship };
}
function useBlindTurn(me) {
  if (me.blind > 0) { me.blind--; if (me.blind === 0) me.blindEnded = true; return true; }
  return false;
}

function doShoot(room, idx, r, c) {
  const me = room.players[idx], op = room.players[1 - idx];
  if (room.phase !== 'playing' || room.turn !== idx || !op) return false;
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= N || c >= N) return false;
  const blind = me.blind > 0;
  const s = strike(me, op, r, c);
  if (!s) return false;
  useBlindTurn(me);
  const over = op.ships.every(x => x.sunk);
  finishTurn(room, idx, over, !blind && s.res !== 'miss');
  emitTo(me, 'result', { r, c, res: blind ? 'unknown' : s.res, ship: !blind && s.res === 'sunk' ? pub(s.ship) : null, myTurn: room.turn === idx, blind: me.blind });
  emitTo(op, 'incoming', { r, c, res: s.res, key: s.ship ? s.ship.key : null, myTurn: room.turn === 1 - idx });
  afterShots(room, idx, over);
  return true;
}

function doPower(room, idx, data) {
  const me = room.players[idx], op = room.players[1 - idx];
  if (!room.powerups || room.phase !== 'playing' || room.turn !== idx || !op) return;
  const type = data && data.type;
  if (type !== me.power || me.powerUsed) return;
  const r = clamp(data.r | 0, 0, N - 1), c = clamp(data.c | 0, 0, N - 1), h = !!data.h;
  const blind = me.blind > 0;
  me.powerUsed = true;
  if (type === 'emp') {
    useBlindTurn(me);
    op.blind = EMP_TURNS; op.hidden = [];
    finishTurn(room, idx, false, false);
    emitTo(me, 'powerResult', { type, myTurn: false, blind: me.blind });
    emitTo(op, 'powerIncoming', { type, myTurn: true, blind: op.blind });
    return afterShots(room, idx, false);
  }
  const cells = areaCells(type, r, c, h);
  if (type === 'radar') {
    const contact = op.ships.some(sh => cells.some(([a, b]) => sh.cells.includes(a + ',' + b)));
    const scan = { r: cells[0][0], c: cells[0][1], contact };
    me.scans.push(scan);
    useBlindTurn(me);
    finishTurn(room, idx, false, false);
    emitTo(me, 'powerResult', { type, scan, myTurn: false, blind: me.blind });
    emitTo(op, 'powerIncoming', { type, scan: { r: scan.r, c: scan.c }, myTurn: true });
    return afterShots(room, idx, false);
  }
  const shots = cells.map(([a, b]) => strike(me, op, a, b)).filter(Boolean);
  useBlindTurn(me);
  const over = op.ships.every(x => x.sunk);
  const anyHit = shots.some(x => x.res !== 'miss');
  finishTurn(room, idx, over, !blind && anyHit);
  emitTo(me, 'powerResult', { type, cells, myTurn: room.turn === idx, blind: me.blind,
    shots: shots.map(x => ({ r: x.r, c: x.c, res: blind ? 'unknown' : x.res, ship: !blind && x.res === 'sunk' ? pub(x.ship) : null })) });
  emitTo(op, 'powerIncoming', { type, cells, myTurn: room.turn === 1 - idx,
    shots: shots.map(x => ({ r: x.r, c: x.c, res: x.res, key: x.ship ? x.ship.key : null })) });
  afterShots(room, idx, over);
}

/* ---------- Bot (mittlere Schwierigkeit) ---------- */
function botPick(room, idx) {
  const me = room.players[idx], op = room.players[1 - idx];
  const known = k => !me.hidden.includes(k);
  const shot = k => me.shots.has(k);
  const sunkCells = new Set(op.ships.filter(s => s.sunk && s.cells.every(known)).flatMap(s => s.cells));
  const open = [...me.shots].filter(([k, v]) => known(k) && (v === 'hit' || v === 'sunk') && !sunkCells.has(k)).map(([k]) => k.split(',').map(Number));
  const free = (r, c) => r >= 0 && c >= 0 && r < N && c < N && !shot(r + ',' + c);
  const any = a => a[rnd(a.length)];
  if (open.length) {
    const set = new Set(open.map(([r, c]) => r + ',' + c)), line = [];
    const has = (r, c) => set.has(r + ',' + c);
    for (const [r, c] of open) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      if (!has(r + dr, c + dc) && !has(r - dr, c - dc)) continue;
      let a = r, b = c; while (has(a + dr, b + dc)) { a += dr; b += dc; }
      if (free(a + dr, b + dc)) line.push([a + dr, b + dc]);
      a = r; b = c; while (has(a - dr, b - dc)) { a -= dr; b -= dc; }
      if (free(a - dr, b - dc)) line.push([a - dr, b - dc]);
    }
    if (line.length) return any(line);
    const nb = [];
    for (const [r, c] of open) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(r + dr, c + dc)) nb.push([r + dr, c + dc]);
    if (nb.length) return any(nb);
  }
  const all = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (free(r, c)) all.push([r, c]);
  const par = all.filter(([r, c]) => (r + c) % 2 === 0);
  return any(par.length ? par : all);
}
function maybeBot(room) {
  if (room.phase !== 'playing' || !room.players[room.turn].bot) return;
  const idx = room.turn;
  setTimeout(() => {
    if (rooms.get(room.code) !== room || room.phase !== 'playing' || room.turn !== idx) return;
    const [r, c] = botPick(room, idx);
    doShoot(room, idx, r, c);
  }, 900 + rnd(700));
}
function simulateBots(room) {
  let guard = 0;
  while (room.phase === 'playing' && guard++ < 400) {
    const idx = room.turn, [r, c] = botPick(room, idx), me = room.players[idx], op = room.players[1 - idx];
    const s = strike(me, op, r, c);
    const over = op.ships.every(x => x.sunk);
    finishTurn(room, idx, over, s.res !== 'miss');
  }
  if (room.phase !== 'over') { room.phase = 'over'; room.winner = rnd(2); }
  matchFinished(room);
}

/* ---------- Turnier ---------- */
function tPart(T, pid) { return T.parts.find(p => p.pid === pid); }
function tState(T, pid) {
  const me = tPart(T, pid);
  const view = p => p ? { name: p.name, country: p.country, bot: !!p.bot, me: p.pid === pid } : null;
  return {
    code: T.code, phase: T.phase, powerups: T.powerups, isHost: T.host === pid, hostName: (tPart(T, T.host) || {}).name,
    parts: T.parts.filter(p => !p.left || T.phase !== 'lobby').map(p => ({ ...view(p), status: p.status, online: p.bot || p.online })),
    rounds: T.rounds.map(rd => rd.map(m => ({ a: view(tPart(T, m.a)), b: view(tPart(T, m.b)), winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : null, forfeit: !!m.forfeit }))),
    round: T.rounds.length, myStatus: me ? me.status : null, champion: T.champion ? view(tPart(T, T.champion)) : null,
  };
}
function tBroadcast(T) { for (const p of T.parts) if (!p.bot && !p.left && p.sid) io.to(p.sid).emit('tstate', tState(T, p.pid)); }
function socketOf(p) { return p && p.sid ? io.sockets.sockets.get(p.sid) : null; }

function tStartRound(T) {
  for (const rd of T.rounds) for (const m of rd) { const r = rooms.get(m.code); if (r && r.phase === 'over') rooms.delete(m.code); }
  const alive = T.parts.filter(p => p.status === 'waiting' || p.status === 'playing');
  if (alive.length <= 1) {
    T.phase = 'done'; T.champion = alive[0] ? alive[0].pid : null;
    if (alive[0]) alive[0].status = 'champion';
    tBroadcast(T);
    return;
  }
  shuffle(alive);
  if (alive.length % 2 === 1) {
    const bot = { pid: 'bot-' + crypto.randomUUID(), bot: true, name: BOT_NAMES[T.botCount++ % BOT_NAMES.length], country: COUNTRIES[rnd(COUNTRIES.length)], status: 'waiting', online: true };
    T.parts.push(bot);
    alive.splice(rnd(alive.length + 1), 0, bot);
  }
  const round = [], roundNo = T.rounds.length + 1;
  T.rounds.push(round);
  for (let i = 0; i < alive.length; i += 2) {
    const A = alive[i], Bp = alive[i + 1];
    const room = { code: newCode(), players: [], phase: 'lobby', turn: null, winner: null, bonusShot: true, powerups: T.powerups,
      created: Date.now(), tourney: T.code, round: roundNo };
    room.players = [A, Bp].map(p => {
      const pl = basePlayer(p.pid, p.bot ? null : p.sid, p.name, p.country, !!p.bot);
      pl.online = p.bot ? true : p.online;
      return pl;
    });
    rooms.set(room.code, room);
    round.push({ code: room.code, a: A.pid, b: Bp.pid, winner: null });
    for (const p of [A, Bp]) {
      p.status = 'playing'; p.matchCode = room.code;
      const so = socketOf(p); if (so && so.data) so.data.code = room.code;
    }
    startPlacing(room);
    room.players.forEach((pl, i) => { if (!pl.bot && !pl.online) armForfeit(room, i); });
  }
  tBroadcast(T);
}
function armForfeit(room, idx) {
  const me = room.players[idx];
  if (me.timer) clearTimeout(me.timer);
  me.timer = setTimeout(() => { if (!me.online && rooms.get(room.code) === room) forfeit(room, idx); }, GRACE_MS);
}
function forfeit(room, idx) {
  if (room.phase === 'over') return;
  const op = room.players[1 - idx];
  room.phase = 'over'; room.winner = 1 - idx; room.turn = null; room.forfeit = true;
  emitTo(op, 'gameover', { won: true, forfeit: true, oppShips: room.players[idx].ships ? room.players[idx].ships.map(pub) : [], reveal: [...op.shots].map(([k, v]) => [...k.split(',').map(Number), v]) });
  matchFinished(room);
}
function matchFinished(room) {
  room.players.forEach(p => { if (p.timer) { clearTimeout(p.timer); p.timer = null; } });
  if (!room.tourney) return;
  const T = tourneys.get(room.tourney);
  if (!T) return;
  const rd = T.rounds[T.rounds.length - 1], m = rd && rd.find(x => x.code === room.code);
  if (!m || m.winner) return;
  const w = room.players[room.winner], l = room.players[1 - room.winner];
  m.winner = w.pid; m.forfeit = !!room.forfeit;
  const wp = tPart(T, w.pid), lp = tPart(T, l.pid);
  if (wp) { wp.status = 'waiting'; wp.matchCode = null; }
  if (lp) { lp.status = 'out'; lp.matchCode = null; }
  tBroadcast(T);
  if (rd.every(x => x.winner)) setTimeout(() => { if (tourneys.get(T.code) === T) tStartRound(T); }, 7000);
}

function ctx(socket) {
  const d = socket.data || {};
  const room = d.code && rooms.get(d.code);
  if (!room) return {};
  const idx = room.players.findIndex(p => p.pid === d.pid);
  if (idx < 0) return {};
  return { room, idx, me: room.players[idx], op: room.players[1 - idx] };
}
function tctx(socket) {
  const d = socket.data || {};
  const T = d.tcode && tourneys.get(d.tcode);
  if (!T) return {};
  return { T, part: tPart(T, d.pid) };
}

io.on('connection', socket => {
  socket.on('create', (data, cb) => {
    if (typeof cb !== 'function') return;
    const p = newPlayer(socket, data && data.name, data && data.country);
    const code = newCode();
    const room = { code, players: [p], phase: 'lobby', turn: null, winner: null, bonusShot: true, powerups: !!(data && data.powerups), created: Date.now() };
    rooms.set(code, room);
    socket.data = { code, pid: p.pid };
    cb({ ok: true, code, pid: p.pid });
  });

  socket.on('join', (data, cb) => {
    if (typeof cb !== 'function') return;
    const code = String((data && data.code) || '').toUpperCase().trim();
    if (tourneys.has(code)) return cb({ ok: false, tourney: true });
    const room = rooms.get(code);
    if (!room || room.tourney) return cb({ ok: false, error: 'Raum nicht gefunden. Ist der Link/Code richtig?' });
    if (room.players.length >= 2 || room.phase !== 'lobby') return cb({ ok: false, error: 'Dieser Raum ist schon voll.' });
    const p = newPlayer(socket, data.name, data.country);
    room.players.push(p);
    socket.data = { code, pid: p.pid };
    cb({ ok: true, code, pid: p.pid, bonusShot: room.bonusShot, powerups: room.powerups });
    startPlacing(room);
  });

  socket.on('peek', (data, cb) => {
    if (typeof cb !== 'function') return;
    const code = String((data && data.code) || '').toUpperCase().trim();
    const T = tourneys.get(code);
    if (T) {
      if (T.phase !== 'lobby') return cb({ ok: false, error: 'Dieses Turnier hat schon begonnen.' });
      const host = tPart(T, T.host) || {};
      return cb({ ok: true, tourney: true, powerups: T.powerups, host: host.name, hostCountry: host.country, count: T.parts.filter(p => !p.left).length });
    }
    const room = rooms.get(code);
    if (!room || room.tourney) return cb({ ok: false, error: 'Raum nicht gefunden – der Link ist abgelaufen oder falsch.' });
    if (room.players.length >= 2 || room.phase !== 'lobby') return cb({ ok: false, error: 'Dieser Raum ist schon voll.' });
    cb({ ok: true, powerups: room.powerups, host: room.players[0].name, hostCountry: room.players[0].country });
  });

  /* --- Turnier --- */
  socket.on('tcreate', (data, cb) => {
    if (typeof cb !== 'function') return;
    const code = newCode(), pid = crypto.randomUUID();
    const T = { code, host: pid, powerups: !!(data && data.powerups), phase: 'lobby', parts: [], rounds: [], botCount: rnd(BOT_NAMES.length), created: Date.now() };
    T.parts.push({ pid, sid: socket.id, name: cleanName(data && data.name), country: cleanCountry(data && data.country), status: 'waiting', online: true });
    tourneys.set(code, T);
    socket.data = { tcode: code, pid };
    cb({ ok: true, code, pid });
    tBroadcast(T);
  });
  socket.on('tjoin', (data, cb) => {
    if (typeof cb !== 'function') return;
    const T = tourneys.get(String((data && data.code) || '').toUpperCase().trim());
    if (!T) return cb({ ok: false, error: 'Turnier nicht gefunden.' });
    if (T.phase !== 'lobby') return cb({ ok: false, error: 'Dieses Turnier hat schon begonnen.' });
    if (T.parts.filter(p => !p.left).length >= MAX_TOURNEY) return cb({ ok: false, error: `Das Turnier ist voll (max. ${MAX_TOURNEY}).` });
    const pid = crypto.randomUUID();
    T.parts.push({ pid, sid: socket.id, name: cleanName(data.name), country: cleanCountry(data.country), status: 'waiting', online: true });
    socket.data = { tcode: T.code, pid };
    cb({ ok: true, code: T.code, pid, powerups: T.powerups });
    tBroadcast(T);
  });
  socket.on('tstart', () => {
    const { T, part } = tctx(socket);
    if (!T || !part || T.host !== part.pid || T.phase !== 'lobby') return;
    T.parts = T.parts.filter(p => !p.left);
    if (T.parts.length < 2) return socket.emit('errorMsg', 'Für ein Turnier braucht es mindestens 2 Spieler.');
    T.phase = 'running';
    tStartRound(T);
  });
  socket.on('tleave', () => {
    const { T, part } = tctx(socket);
    socket.data = {};
    if (!T || !part) return;
    if (T.phase === 'lobby') {
      part.left = true;
      T.parts = T.parts.filter(p => !p.left);
      if (!T.parts.length) { tourneys.delete(T.code); return; }
      if (T.host === part.pid) T.host = T.parts[0].pid;
      return tBroadcast(T);
    }
    part.left = true; part.online = false;
    const room = part.matchCode && rooms.get(part.matchCode);
    if (room && room.phase !== 'over') { const idx = room.players.findIndex(p => p.pid === part.pid); if (idx >= 0) forfeit(room, idx); }
    else if (part.status === 'waiting') part.status = 'out';
    tBroadcast(T);
  });

  socket.on('rejoin', (data, cb) => {
    if (typeof cb !== 'function') return;
    if (data && data.tcode) {
      const T = tourneys.get(String(data.tcode));
      const part = T && tPart(T, data.pid);
      if (!part || part.left) return cb({ ok: false });
      part.sid = socket.id; part.online = true;
      const room = part.matchCode && rooms.get(part.matchCode);
      socket.data = { tcode: T.code, pid: part.pid, code: room ? room.code : null };
      let state = null;
      if (room) {
        const idx = room.players.findIndex(p => p.pid === part.pid);
        const p = room.players[idx];
        if (p.timer) { clearTimeout(p.timer); p.timer = null; }
        p.sid = socket.id; p.online = true;
        state = syncState(room, idx);
        emitTo(room.players[1 - idx], 'oppStatus', { online: true });
      }
      cb({ ok: true, tourney: tState(T, part.pid), state });
      return tBroadcast(T);
    }
    const room = data && rooms.get(String(data.code || ''));
    const idx = room ? room.players.findIndex(p => p.pid === data.pid) : -1;
    if (idx < 0) return cb({ ok: false });
    const p = room.players[idx];
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    p.sid = socket.id; p.online = true;
    socket.data = { code: room.code, pid: p.pid };
    cb({ ok: true, state: syncState(room, idx) });
    emitTo(room.players[1 - idx], 'oppStatus', { online: true });
  });

  socket.on('ready', data => {
    const { room, idx, me } = ctx(socket);
    if (!room || room.phase !== 'placing' || me.ships) return;
    const ships = buildShips(data && data.ships);
    if (!ships) return socket.emit('errorMsg', 'Ungültige Aufstellung.');
    let power = null;
    if (room.powerups) {
      if (!POWERS.includes(data.power)) return socket.emit('errorMsg', 'Bitte zuerst ein Power-up wählen.');
      power = data.power;
    }
    readyPlayer(room, idx, ships, power);
  });

  socket.on('shoot', data => {
    const { room, idx } = ctx(socket);
    if (room) doShoot(room, idx, data && data.r, data && data.c);
  });
  socket.on('power', data => {
    const { room, idx } = ctx(socket);
    if (room) doPower(room, idx, data);
  });

  socket.on('setCountry', data => {
    const { room, me, op } = ctx(socket);
    if (!room || room.phase !== 'placing' || me.ships) return;
    me.country = cleanCountry(data && data.country);
    emitTo(op, 'oppCountry', { country: me.country });
    const { T, part } = tctx(socket);
    if (T && part) { part.country = me.country; tBroadcast(T); }
  });

  socket.on('rematch', () => {
    const { room, me, op } = ctx(socket);
    if (!room || room.tourney || room.phase !== 'over' || !op) return;
    me.rematch = true;
    if (op.rematch) startPlacing(room);
    else emitTo(op, 'oppRematch', {});
  });

  socket.on('leave', () => {
    const { room, idx } = ctx(socket);
    if (room && room.tourney) { if (room.phase !== 'over') forfeit(room, idx); return; }
    socket.data = {};
    if (room) closeRoom(room, 'left');
  });

  socket.on('disconnect', () => {
    const { T, part } = tctx(socket);
    if (T && part && part.sid === socket.id) {
      part.online = false;
      if (T.phase === 'lobby') {
        setTimeout(() => {
          if (part.online || tourneys.get(T.code) !== T || T.phase !== 'lobby') return;
          part.left = true; T.parts = T.parts.filter(p => !p.left);
          if (!T.parts.length) return tourneys.delete(T.code);
          if (T.host === part.pid) T.host = T.parts[0].pid;
          tBroadcast(T);
        }, GRACE_MS);
      }
      tBroadcast(T);
    }
    const { room, idx, me, op } = ctx(socket);
    if (!room || me.sid !== socket.id) return;
    me.online = false;
    emitTo(op, 'oppStatus', { online: false });
    if (room.tourney) return armForfeit(room, idx);
    me.timer = setTimeout(() => { if (!me.online && rooms.get(room.code) === room) closeRoom(room, 'timeout'); },
      room.phase === 'lobby' ? 10 * 60000 : GRACE_MS);
  });
});

// Alte Räume und Turniere aufräumen
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (now - room.created > 8 * 3600000) closeRoom(room, 'timeout');
  for (const T of tourneys.values()) if (now - T.created > 10 * 3600000) tourneys.delete(T.code);
}, 15 * 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Schiffe versenken läuft auf http://localhost:${PORT}`));

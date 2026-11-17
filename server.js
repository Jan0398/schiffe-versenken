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
const GRACE_MS = 120000; // Zeit für Wiederverbindung
const rooms = new Map();

const cleanName = n => String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 18) || 'Kapitän';
const cleanCountry = c => (COUNTRIES.includes(c) ? c : 'de');

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}

function newPlayer(socket, name, country) {
  return { pid: crypto.randomUUID(), sid: socket.id, name: cleanName(name), country: cleanCountry(country),
    ships: null, shots: new Map(), rematch: false, online: true, timer: null,
    power: null, powerUsed: false, blind: 0, hidden: [], scans: [] };
}

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

function emitTo(p, ev, data) { if (p) io.to(p.sid).emit(ev, data); }

function syncState(room, i) {
  const me = room.players[i], op = room.players[1 - i];
  const list = m => [...m].map(([k, v]) => [...k.split(',').map(Number), v]);
  return {
    code: room.code, phase: room.phase, bonusShot: room.bonusShot,
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
    emitTo(p, 'matched', { opp: { name: op.name, country: op.country }, bonusShot: room.bonusShot, powerups: room.powerups });
  });
}

function closeRoom(room, reason) {
  room.players.forEach(p => { if (p.timer) clearTimeout(p.timer); });
  room.players.forEach(p => emitTo(p, 'oppLeft', { reason }));
  rooms.delete(room.code);
}

function ctx(socket) {
  const d = socket.data || {};
  const room = d.code && rooms.get(d.code);
  if (!room) return {};
  const idx = room.players.findIndex(p => p.pid === d.pid);
  if (idx < 0) return {};
  return { room, idx, me: room.players[idx], op: room.players[1 - idx] };
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
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Raum nicht gefunden. Ist der Link/Code richtig?' });
    if (room.players.length >= 2 || room.phase !== 'lobby') return cb({ ok: false, error: 'Dieser Raum ist schon voll.' });
    const p = newPlayer(socket, data.name, data.country);
    room.players.push(p);
    socket.data = { code, pid: p.pid };
    cb({ ok: true, code, pid: p.pid, bonusShot: room.bonusShot, powerups: room.powerups });
    startPlacing(room);
  });

  socket.on('peek', (data, cb) => {
    if (typeof cb !== 'function') return;
    const room = rooms.get(String((data && data.code) || '').toUpperCase().trim());
    if (!room) return cb({ ok: false, error: 'Raum nicht gefunden – der Link ist abgelaufen oder falsch.' });
    if (room.players.length >= 2 || room.phase !== 'lobby') return cb({ ok: false, error: 'Dieser Raum ist schon voll.' });
    cb({ ok: true, powerups: room.powerups, host: room.players[0].name, hostCountry: room.players[0].country });
  });

  socket.on('rejoin', (data, cb) => {
    if (typeof cb !== 'function') return;
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
    const { room, idx, me, op } = ctx(socket);
    if (!room || room.phase !== 'placing' || me.ships) return;
    const ships = buildShips(data && data.ships);
    if (!ships) return socket.emit('errorMsg', 'Ungültige Aufstellung.');
    if (room.powerups) {
      if (!POWERS.includes(data.power)) return socket.emit('errorMsg', 'Bitte zuerst ein Power-up wählen.');
      me.power = data.power;
    }
    me.ships = ships;
    if (op && op.ships) {
      room.phase = 'playing';
      room.turn = crypto.randomInt(2);
      room.players.forEach((p, i) => emitTo(p, 'start', { myTurn: room.turn === i }));
    } else emitTo(op, 'oppReady', {});
  });

  function finishTurn(room, idx, me, op, over, keepTurn) {
    if (over) { room.phase = 'over'; room.winner = idx; room.turn = null; }
    else room.turn = keepTurn ? idx : 1 - idx;
  }
  function afterShots(room, idx, me, op, over) {
    if (over) {
      emitTo(me, 'gameover', { won: true, oppShips: op.ships.map(pub), reveal: [...me.shots].map(([k, v]) => [...k.split(',').map(Number), v]) });
      emitTo(op, 'gameover', { won: false, oppShips: me.ships.map(pub), reveal: [...op.shots].map(([k, v]) => [...k.split(',').map(Number), v]) });
      me.hidden = []; op.hidden = [];
    } else if (me.blindEnded) {
      me.blindEnded = false;
      emitTo(me, 'empEnd', {
        reveal: me.hidden.map(k => [...k.split(',').map(Number), me.shots.get(k)]),
        sunk: op.ships.filter(s => s.sunk).map(pub),
      });
      me.hidden = [];
    }
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

  socket.on('shoot', data => {
    const { room, idx, me, op } = ctx(socket);
    if (!room || room.phase !== 'playing' || room.turn !== idx || !op) return;
    const r = data && data.r, c = data && data.c;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= N || c >= N) return;
    const blind = me.blind > 0;
    const s = strike(me, op, r, c);
    if (!s) return;
    useBlindTurn(me);
    const over = op.ships.every(x => x.sunk);
    finishTurn(room, idx, me, op, over, !blind && s.res !== 'miss');
    emitTo(me, 'result', { r, c, res: blind ? 'unknown' : s.res, ship: !blind && s.res === 'sunk' ? pub(s.ship) : null, myTurn: room.turn === idx, blind: me.blind });
    emitTo(op, 'incoming', { r, c, res: s.res, key: s.ship ? s.ship.key : null, myTurn: room.turn === 1 - idx });
    afterShots(room, idx, me, op, over);
  });

  socket.on('power', data => {
    const { room, idx, me, op } = ctx(socket);
    if (!room || !room.powerups || room.phase !== 'playing' || room.turn !== idx || !op) return;
    const type = data && data.type;
    if (type !== me.power || me.powerUsed) return;
    const r = clamp(data.r | 0, 0, N - 1), c = clamp(data.c | 0, 0, N - 1), h = !!data.h;
    const blind = me.blind > 0;
    me.powerUsed = true;
    if (type === 'emp') {
      useBlindTurn(me);
      op.blind = EMP_TURNS; op.hidden = [];
      finishTurn(room, idx, me, op, false, false);
      emitTo(me, 'powerResult', { type, myTurn: false, blind: me.blind });
      emitTo(op, 'powerIncoming', { type, myTurn: true, blind: op.blind });
      return afterShots(room, idx, me, op, false);
    }
    const cells = areaCells(type, r, c, h);
    if (type === 'radar') {
      const contact = op.ships.some(sh => cells.some(([a, b]) => sh.cells.includes(a + ',' + b)));
      const scan = { r: cells[0][0], c: cells[0][1], contact };
      me.scans.push(scan);
      useBlindTurn(me);
      finishTurn(room, idx, me, op, false, false);
      emitTo(me, 'powerResult', { type, scan, myTurn: false, blind: me.blind });
      emitTo(op, 'powerIncoming', { type, scan: { r: scan.r, c: scan.c }, myTurn: true });
      return afterShots(room, idx, me, op, false);
    }
    const shots = cells.map(([a, b]) => strike(me, op, a, b)).filter(Boolean);
    useBlindTurn(me);
    const over = op.ships.every(x => x.sunk);
    const anyHit = shots.some(x => x.res !== 'miss');
    finishTurn(room, idx, me, op, over, !blind && anyHit);
    emitTo(me, 'powerResult', { type, cells, myTurn: room.turn === idx, blind: me.blind,
      shots: shots.map(x => ({ r: x.r, c: x.c, res: blind ? 'unknown' : x.res, ship: !blind && x.res === 'sunk' ? pub(x.ship) : null })) });
    emitTo(op, 'powerIncoming', { type, cells, myTurn: room.turn === 1 - idx,
      shots: shots.map(x => ({ r: x.r, c: x.c, res: x.res, key: x.ship ? x.ship.key : null })) });
    afterShots(room, idx, me, op, over);
  });

  socket.on('setCountry', data => {
    const { room, me, op } = ctx(socket);
    if (!room || room.phase !== 'placing' || me.ships) return;
    me.country = cleanCountry(data && data.country);
    emitTo(op, 'oppCountry', { country: me.country });
  });

  socket.on('rematch', () => {
    const { room, me, op } = ctx(socket);
    if (!room || room.phase !== 'over' || !op) return;
    me.rematch = true;
    if (op.rematch) startPlacing(room);
    else emitTo(op, 'oppRematch', {});
  });

  socket.on('leave', () => {
    const { room } = ctx(socket);
    socket.data = {};
    if (room) closeRoom(room, 'left');
  });

  socket.on('disconnect', () => {
    const { room, me, op } = ctx(socket);
    if (!room || me.sid !== socket.id) return;
    me.online = false;
    emitTo(op, 'oppStatus', { online: false });
    me.timer = setTimeout(() => { if (!me.online && rooms.get(room.code) === room) closeRoom(room, 'timeout'); },
      room.phase === 'lobby' ? 10 * 60000 : GRACE_MS);
  });
});

// Alte Räume aufräumen
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (now - room.created > 8 * 3600000) closeRoom(room, 'timeout');
}, 15 * 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Schiffe versenken läuft auf http://localhost:${PORT}`));

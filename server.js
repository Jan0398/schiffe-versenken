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
const COUNTRIES = ['de', 'us', 'uk', 'fr', 'jp', 'ru', 'it'];
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
    ships: null, shots: new Map(), rematch: false, online: true, timer: null };
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
    outgoing: list(me.shots),
    enemySunk: op && op.ships ? op.ships.filter(s => s.sunk).map(pub) : [],
    incoming: op ? list(op.shots) : [],
    won: room.winner === null ? null : room.winner === i,
    oppShips: room.phase === 'over' && op && op.ships ? op.ships.map(pub) : null,
    myRematch: me.rematch, oppRematch: !!(op && op.rematch),
  };
}

function startPlacing(room) {
  room.phase = 'placing'; room.turn = null; room.winner = null;
  room.players.forEach(p => { p.ships = null; p.shots.clear(); p.rematch = false; });
  room.players.forEach((p, i) => {
    const op = room.players[1 - i];
    emitTo(p, 'matched', { opp: { name: op.name, country: op.country }, bonusShot: room.bonusShot });
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
    const room = { code, players: [p], phase: 'lobby', turn: null, winner: null, bonusShot: true, created: Date.now() };
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
    cb({ ok: true, code, pid: p.pid, bonusShot: room.bonusShot });
    startPlacing(room);
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
    me.ships = ships;
    if (op && op.ships) {
      room.phase = 'playing';
      room.turn = crypto.randomInt(2);
      room.players.forEach((p, i) => emitTo(p, 'start', { myTurn: room.turn === i }));
    } else emitTo(op, 'oppReady', {});
  });

  socket.on('shoot', data => {
    const { room, idx, me, op } = ctx(socket);
    if (!room || room.phase !== 'playing' || room.turn !== idx || !op) return;
    const r = data && data.r, c = data && data.c;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= N || c >= N) return;
    const k = r + ',' + c;
    if (me.shots.has(k)) return;
    const ship = op.ships.find(s => s.cells.includes(k));
    let res = 'miss';
    if (ship) {
      ship.hits.add(k);
      res = ship.hits.size === ship.len ? 'sunk' : 'hit';
      if (res === 'sunk') ship.sunk = true;
    }
    me.shots.set(k, res);
    const over = op.ships.every(s => s.sunk);
    if (over) { room.phase = 'over'; room.winner = idx; room.turn = null; }
    else if (res === 'miss' || !room.bonusShot) room.turn = 1 - idx;
    emitTo(me, 'result', { r, c, res, ship: res === 'sunk' ? pub(ship) : null, myTurn: room.turn === idx });
    emitTo(op, 'incoming', { r, c, res, key: ship ? ship.key : null, myTurn: room.turn === 1 - idx });
    if (over) {
      emitTo(me, 'gameover', { won: true, oppShips: op.ships.map(pub) });
      emitTo(op, 'gameover', { won: false, oppShips: me.ships.map(pub) });
    }
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

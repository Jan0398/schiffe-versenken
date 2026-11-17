// Schiffe versenken – Online-Server (Express + Socket.io)
// Die komplette Spiellogik läuft hier – auch für Spiele gegen den Computer.
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
const POWER_USES = { artillery: 2 };
const EMP_TURNS = 5;
const DIARRHEA_SHOTS = 3;
const EVENT_CFG = { chance: +(process.env.EV_CHANCE || 0.08), cooldown: +(process.env.EV_CD || 9), max: +(process.env.EV_MAX || 3) };
const EVENTS = ['iceberg', 'pirates', 'storm', 'diarrhea', 'kraken', 'whale', 'parrot', 'rum', 'repair', 'fog', 'siren', 'bottle', 'fish', 'mutiny', 'wave'];
const MAX_TOURNEY = 16;
const GRACE_MS = 120000;
const BOT_NAMES = ['Bot Klabautermann', 'Bot Seebär', 'Bot Smutje', 'Bot Ahoi', 'Bot Blechbart', 'Bot Kielholer', 'Bot Sturmflut', 'Bot Leuchtturm'];
const DIFFS = ['easy', 'normal', 'hard'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = n => crypto.randomInt(n);
const pick = a => a[rnd(a.length)];
const K = (r, c) => r + ',' + c;
const unK = k => k.split(',').map(Number);
const inB = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
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

/* ================= Räume & Spieler ================= */
function newRoom(o) {
  const room = { code: newCode(), size: o.size === 3 ? 3 : 2, players: [], phase: 'lobby', turn: null, winner: null,
    powerups: !!o.powerups, events: !!o.events, tourney: o.tourney || null, round: o.round || null, solo: !!o.solo,
    created: Date.now(), turnCount: 0, lastEvent: -99, eventCount: 0, capN: 0, animUntil: 0, sim: false };
  rooms.set(room.code, room);
  return room;
}
function mkPlayer(o) {
  return { pid: o.pid || crypto.randomUUID(), sid: o.sid || null, name: cleanName(o.name), country: cleanCountry(o.country),
    bot: o.bot || null, seat: -1, online: true, timer: null, rematch: false,
    ships: null, shots: new Map(), hidden: new Map(), known: new Map(), powers: [], used: [], blind: 0, drunk: 0, scans: [],
    out: false, place: null, ai: null };
}
function addPlayer(room, p) { p.seat = room.players.length; room.players.push(p); return p; }
function botPlayer(diff, name) {
  return mkPlayer({ pid: 'bot-' + crypto.randomUUID(), name: name || pick(BOT_NAMES), country: pick(COUNTRIES), bot: { diff: DIFFS.includes(diff) ? diff : 'normal' } });
}
function resetPlayer(room, p) {
  p.ships = null; p.shots = new Map(); p.hidden = new Map(); p.known = new Map();
  for (const o of room.players) if (o !== p) { p.shots.set(o.seat, new Map()); p.hidden.set(o.seat, new Set()); p.known.set(o.seat, new Set()); }
  p.powers = []; p.used = []; p.blind = 0; p.drunk = 0; p.scans = []; p.out = false; p.place = null; p.rematch = false;
  p.skip = 0; p.siren = 0; p.extra = 0; p.fish = 0; p.fishPending = null; p.fog = 0;
  p.ai = { useAt: 3 + rnd(9), turns: 0, queue: new Map(), clear: new Map() };
}
const nPowers = room => (room.powerups ? (room.size === 3 ? 2 : 1) : 0);
const alive = room => room.players.filter(p => !p.out);

function emitTo(p, ev, data) { if (p && !p.bot && p.sid) io.to(p.sid).emit(ev, data); }
function emitAll(room, ev, fn) { for (const p of room.players) { const d = typeof fn === 'function' ? fn(p) : fn; if (d) emitTo(p, ev, d); } }

const pub = s => ({ id: s.id, key: s.key, cc: s.cc, r: s.r, c: s.c, h: s.h, len: s.len });
function shipCells(len, r, c, h) { return Array.from({ length: len }, (_, i) => h ? K(r, c + i) : K(r + i, c)); }

function buildShips(list, cc) {
  if (!Array.isArray(list) || list.length !== 5) return null;
  const seen = new Set(), occ = new Set(), ships = [];
  for (const s of list) {
    const len = FLEET[s && s.key];
    if (!len || seen.has(s.key)) return null;
    seen.add(s.key);
    const r = s.r | 0, c = s.c | 0, h = !!s.h;
    const cells = shipCells(len, r, c, h);
    for (const k of cells) { const [a, b] = unK(k); if (!inB(a, b) || occ.has(k)) return null; occ.add(k); }
    ships.push({ id: s.key, key: s.key, cc, r, c, h, len, cells, hits: new Set(), sunk: false });
  }
  return ships;
}
function randomPlacement(len, blocked) {
  for (let t = 0; t < 500; t++) {
    const h = rnd(2) === 0, r = rnd(h ? N : N - len + 1), c = rnd(h ? N - len + 1 : N);
    const cells = shipCells(len, r, c, h);
    if (cells.some(k => blocked.has(k))) continue;
    return { r, c, h, cells };
  }
  return null;
}
function randomFleetList() {
  for (; ;) {
    const list = [], occ = new Set(); let ok = true;
    for (const [key, len] of Object.entries(FLEET)) {
      const p = randomPlacement(len, occ);
      if (!p) { ok = false; break; }
      p.cells.forEach(k => occ.add(k)); list.push({ key, r: p.r, c: p.c, h: p.h });
    }
    if (ok) return list;
  }
}

function seatsPublic(room, viewer) {
  return room.players.map(p => ({
    seat: p.seat, name: p.name, country: p.country, bot: !!p.bot, online: p.bot ? true : p.online, out: p.out, place: p.place,
    ready: !!p.ships, used: p.used.slice(),
    ships: p.ships ? p.ships.length : 5,
    sunkKnown: viewer && viewer !== p && p.ships ? (viewer.known.get(p.seat) || new Set()).size : p.ships ? p.ships.filter(s => s.sunk).length : 0,
  }));
}

/* ================= Ablauf ================= */
function startPlacing(room) {
  room.phase = 'placing'; room.turn = null; room.winner = null; room.turnCount = 0; room.lastEvent = -99; room.eventCount = 0;
  room.players.forEach(p => resetPlayer(room, p));
  for (const p of room.players) emitTo(p, 'matched', matchedInfo(room, p));
  for (const p of room.players) if (p.bot) setTimeout(() => {
    const powers = shuffle(POWERS.slice()).slice(0, nPowers(room));
    readyPlayer(room, p.seat, buildShips(randomFleetList(), p.country), powers);
  }, 500 + rnd(800));
}
function matchedInfo(room, p) {
  return { mySeat: p.seat, seats: seatsPublic(room, p), size: room.size, powerups: room.powerups, events: room.events,
    nPowers: nPowers(room), tourney: room.tourney, round: room.round, solo: room.solo, code: room.code };
}
function readyPlayer(room, seat, ships, powers) {
  const me = room.players[seat];
  if (rooms.get(room.code) !== room || room.phase !== 'placing' || me.ships || !ships) return;
  me.ships = ships;
  me.powers = (powers || []).map(t => ({ type: t, uses: POWER_USES[t] || 1 }));
  emitAll(room, 'oppReady', p => p !== me && { seat });
  if (room.players.every(p => p.ships)) {
    room.phase = 'playing';
    room.turn = rnd(room.size);
    if (room.players.every(p => p.bot)) return simulateBots(room);
    emitAll(room, 'start', { turn: room.turn });
    scheduleBot(room);
  }
}
function nextSeat(room, seat) {
  for (let i = 1; i <= room.size; i++) { const s = (seat + i) % room.size; if (!room.players[s].out) return s; }
  return seat;
}
function emitTurn(room, again, extra = false) {
  const fog = Object.fromEntries(room.players.map(p => [p.seat, p.fog || 0]));
  emitAll(room, 'turn', { turn: room.turn, again: !!again, extra, fog });
  scheduleBot(room);
}

function strike(me, tg, r, c) {
  const k = K(r, c), map = me.shots.get(tg.seat);
  if (map.has(k)) return null;
  const ship = tg.ships.find(s => s.cells.includes(k));
  let res = 'miss';
  if (ship) { ship.hits.add(k); if (ship.hits.size >= ship.len) ship.sunk = true; res = ship.sunk ? 'sunk' : 'hit'; }
  map.set(k, res);
  if (me.blind > 0) me.hidden.get(tg.seat).add(k);
  else if (res === 'sunk') me.known.get(tg.seat).add(ship.id);
  return { r, c, res, ship };
}
// 3er-Modus: alle anderen Spieler sehen jeden Schuss mit
function observe(room, me, tg, r, c, res, ship) {
  const k = K(r, c), out = new Map();
  for (const o of room.players) {
    if (o === me || o === tg) continue;
    const m = o.shots.get(tg.seat);
    if (!m) continue;
    if (!m.has(k)) {
      m.set(k, res);
      if (o.blind > 0) o.hidden.get(tg.seat).add(k);
      else if (res === 'sunk' && ship) o.known.get(tg.seat).add(ship.id);
    }
    const blind = o.blind > 0;
    out.set(o.seat, { res: blind ? 'unknown' : res, ship: !blind && res === 'sunk' && ship ? pub(ship) : null });
  }
  return out;
}
function deflect(me, tg, r, c) {
  const map = me.shots.get(tg.seat);
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => inB(a, b));
  const fresh = nb.filter(([a, b]) => !map.has(K(a, b)));
  return fresh.length ? pick(fresh) : null;
}

function act(room, seat, a) {
  if (room.phase !== 'playing' || room.turn !== seat || !a) return false;
  const me = room.players[seat], tg = room.players[a.target];
  if (!tg || tg === me || tg.out) return false;
  const blind = me.blind > 0;
  let again = false, anim = 600;
  if (a.kind === 'shoot') {
    let r = a.r, c = a.c, aimed = null;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inB(r, c) || me.shots.get(tg.seat).has(K(r, c))) return false;
    let siren = false;
    if (me.siren > 0) {
      me.siren = 0; siren = true;
      const m = me.shots.get(tg.seat), free = [];
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!m.has(K(x, y)) && !(x === r && y === c)) free.push([x, y]);
      if (free.length) { aimed = [r, c]; [r, c] = pick(free); }
    } else if (me.drunk > 0) { me.drunk--; const d = deflect(me, tg, r, c); if (d) { aimed = [r, c]; [r, c] = d; } }
    const s = strike(me, tg, r, c);
    let shown = blind ? 'unknown' : s.res, fake = false;
    if (!blind && me.fish > 0 && s.res !== 'miss') {
      me.fish = 0; fake = true; shown = 'miss';
      me.fishPending = { t: tg.seat, k: K(r, c), at: room.turnCount };
      if (s.res === 'sunk') me.known.get(tg.seat).delete(s.ship.id);
    }
    again = !blind && !fake && s.res !== 'miss';
    if (s.res === 'sunk') anim = 2600;
    const obs = observe(room, me, tg, r, c, s.res, s.ship);
    emitAll(room, 'shot', p => {
      const base = { by: seat, target: tg.seat, r, c, aimed, siren, drunkLeft: me.drunk };
      if (p === me) return { ...base, res: shown, ship: shown === 'sunk' ? pub(s.ship) : null };
      if (p === tg) return { ...base, res: s.res, shipId: s.ship ? s.ship.id : null };
      const ov = obs.get(p.seat) || { res: null, ship: null };
      return { ...base, res: ov.res, ship: ov.ship, observer: true };
    });
  } else if (a.kind === 'power') {
    const pw = me.powers.find(x => x.type === a.type && x.uses > 0);
    if (!pw) return false;
    pw.uses--; me.used.push(a.type);
    const r = clamp(a.r | 0, 0, N - 1), c = clamp(a.c | 0, 0, N - 1), h = !!a.h;
    if (a.type === 'emp') {
      tg.blind = EMP_TURNS; for (const s of tg.hidden.values()) s.clear();
      anim = 1500;
      emitAll(room, 'power', { by: seat, target: tg.seat, type: 'emp', blind: EMP_TURNS });
    } else if (a.type === 'radar') {
      const cells = areaCells('radar', r, c, h);
      const contact = tg.ships.some(sh => !sh.sunk && cells.some(([x, y]) => sh.cells.includes(K(x, y))));
      const scan = { target: tg.seat, r: cells[0][0], c: cells[0][1], contact };
      me.scans.push(scan); anim = 1700;
      emitAll(room, 'power', p => p === me ? { by: seat, target: tg.seat, type: 'radar', scan }
        : { by: seat, target: tg.seat, type: 'radar', scan: p === tg ? { r: scan.r, c: scan.c } : null });
    } else {
      const cells = areaCells(a.type, r, c, h);
      const shots = cells.map(([x, y]) => strike(me, tg, x, y)).filter(Boolean);
      const obsAll = shots.map(x => observe(room, me, tg, x.r, x.c, x.res, x.ship));
      again = !blind && shots.some(x => x.res !== 'miss');
      anim = a.type === 'nuke' ? 3400 : 1500 + (shots.some(x => x.res === 'sunk') ? 1800 : 0);
      emitAll(room, 'power', p => {
        const base = { by: seat, target: tg.seat, type: a.type, cells };
        if (p === me) return { ...base, shots: shots.map(x => ({ r: x.r, c: x.c, res: blind ? 'unknown' : x.res, ship: !blind && x.res === 'sunk' ? pub(x.ship) : null })) };
        if (p === tg) return { ...base, shots: shots.map(x => ({ r: x.r, c: x.c, res: x.res, shipId: x.ship ? x.ship.id : null })) };
        return { ...base, observer: true, shots: shots.map((x, i) => { const ov = obsAll[i].get(p.seat) || {}; return { r: x.r, c: x.c, res: ov.res, ship: ov.ship }; }) };
      });
    }
  } else return false;
  room.animUntil = Date.now() + anim;
  // EMP-Blindheit abbauen
  if (me.blind > 0) {
    me.blind--;
    if (me.blind === 0) {
      for (const [t, set] of me.hidden) {
        const o = room.players[t];
        const reveal = [...set].map(k => [...unK(k), me.shots.get(t).get(k)]);
        const sunk = o.ships.filter(s => s.sunk && s.cells.some(k => set.has(k)));
        sunk.forEach(s => me.known.get(t).add(s.id));
        if (reveal.length) emitTo(me, 'empEnd', { target: t, reveal, sunk: sunk.map(pub) });
        set.clear();
      }
    }
  }
  checkElim(room, tg);
  if (room.phase !== 'playing') return true;
  if (again && !me.out) emitTurn(room, true);
  else if (me.extra > 0 && !me.out) { me.extra--; emitTurn(room, true, true); }
  else passTurn(room);
  return true;
}
function revealFish(room) {
  for (const p of room.players) {
    const f = p.fishPending;
    if (!f || room.turnCount < f.at + 2) continue;
    p.fishPending = null;
    const res = p.shots.get(f.t).get(f.k);
    if (!res) continue;
    const o = room.players[f.t];
    const [r, c] = unK(f.k);
    const ship = o.ships.find(s => s.cells.includes(f.k));
    if (res === 'sunk' && ship) p.known.get(f.t).add(ship.id);
    emitTo(p, 'fishReveal', { target: f.t, r, c, res, ship: res === 'sunk' && ship ? pub(ship) : null });
  }
}

function passTurn(room) {
  room.turn = nextSeat(room, room.turn);
  room.turnCount++;
  for (const p of room.players) if (p.fog > 0) p.fog--;
  revealFish(room);
  if (room.events && room.eventCount < EVENT_CFG.max && room.turnCount - room.lastEvent >= EVENT_CFG.cooldown && Math.random() < EVENT_CFG.chance) {
    triggerEvent(room);
    if (room.phase !== 'playing') return;
    if (room.players[room.turn].out) room.turn = nextSeat(room, room.turn);
  }
  let guard = 0;
  while (room.phase === 'playing' && room.players[room.turn].skip > 0 && alive(room).length > 1 && guard++ < room.size) {
    const p = room.players[room.turn];
    p.skip--;
    emitAll(room, 'skipped', { seat: p.seat });
    room.animUntil = Math.max(room.animUntil, Date.now()) + 1500;
    room.turn = nextSeat(room, room.turn);
    room.turnCount++;
    revealFish(room);
  }
  emitTurn(room, false);
}

function checkElim(room, p) {
  if (p.out || !p.ships || p.ships.some(s => !s.sunk)) return;
  p.out = true;
  p.place = alive(room).length + 1;
  emitAll(room, 'eliminated', { seat: p.seat, place: p.place, ships: p.ships.map(pub) });
  const al = alive(room);
  if (al.length <= 1) endMatch(room, al[0] ? al[0].seat : null);
}
function endMatch(room, winnerSeat, forfeit = false) {
  if (room.phase === 'over') return;
  room.phase = 'over'; room.turn = null; room.winner = winnerSeat; room.forfeit = forfeit;
  if (winnerSeat !== null) room.players[winnerSeat].place = 1;
  const ships = Object.fromEntries(room.players.map(p => [p.seat, p.ships ? p.ships.map(pub) : []]));
  for (const p of room.players) {
    const reveal = Object.fromEntries([...p.shots].map(([t, m]) => [t, [...m].map(([k, v]) => [...unK(k), v])]));
    emitTo(p, 'gameover', { winner: winnerSeat, places: room.players.map(x => x.place), ships, reveal, forfeit });
  }
  room.players.forEach(p => { if (p.timer) { clearTimeout(p.timer); p.timer = null; } });
  matchFinished(room);
}

/* ================= Zufallsereignisse ================= */
function triggerEvent(room) {
  const order = shuffle(EVENTS.slice());
  for (const type of order) {
    for (const P of shuffle(alive(room))) {
      if (applyEvent(room, type, P)) { room.eventCount++; room.lastEvent = room.turnCount; room.animUntil = Date.now() + 4200; return true; }
    }
  }
  return false;
}
function revealWreck(room, P, ship) {
  for (const o of room.players) if (o !== P) {
    const m = o.shots.get(P.seat);
    ship.cells.forEach(k => { if (!m.has(k) || m.get(k) !== 'miss') m.set(k, 'hit'); });
    o.known.get(P.seat).add(ship.id);
  }
}
function shotAt(room, P) { const s = new Set(); for (const o of room.players) if (o !== P) for (const k of o.shots.get(P.seat).keys()) s.add(k); return s; }

function applyEvent(room, type, P) {
  if (type === 'iceberg') {
    const cand = P.ships.filter(s => !s.sunk && s.hits.size < s.len);
    if (!cand.length) return false;
    const ship = pick(cand);
    const free = shuffle(ship.cells.filter(k => !ship.hits.has(k)));
    const cells = free.slice(0, Math.min(free.length, 1 + rnd(2)));
    cells.forEach(k => ship.hits.add(k));
    if (ship.hits.size >= ship.len) { ship.sunk = true; revealWreck(room, P, ship); }
    emitAll(room, 'event', p => p === P ? { type, seat: P.seat, ship: pub(ship), cells: cells.map(unK), sunk: ship.sunk }
      : { type, seat: P.seat, wreck: ship.sunk ? pub(ship) : null });
    checkElim(room, P);
    return true;
  }
  if (type === 'kraken') {
    const cand = P.ships.filter(s => !s.sunk);
    if (!cand.length) return false;
    const ship = pick(cand);
    ship.cells.forEach(k => ship.hits.add(k)); ship.sunk = true;
    revealWreck(room, P, ship);
    emitAll(room, 'event', { type, seat: P.seat, wreck: pub(ship) });
    checkElim(room, P);
    return true;
  }
  if (type === 'pirates') {
    const opts = [];
    for (const O of alive(room)) if (O !== P) for (const s of O.ships) if (!s.sunk && s.hits.size === 0) opts.push([O, s]);
    if (!opts.length) return false;
    const [O, S] = pick(opts);
    if (O.ships.filter(s => !s.sunk).length <= 1) return false; // nicht das letzte Schiff kapern
    const blocked = shotAt(room, P);
    P.ships.forEach(s => s.cells.forEach(k => blocked.add(k)));
    const pl = randomPlacement(S.len, blocked);
    if (!pl) return false;
    O.ships = O.ships.filter(s => s !== S);
    const ns = { id: 'cap' + (++room.capN), key: S.key, cc: S.cc, r: pl.r, c: pl.c, h: pl.h, len: S.len, cells: pl.cells, hits: new Set(), sunk: false };
    P.ships.push(ns);
    emitAll(room, 'event', p => p === P ? { type, seat: P.seat, from: O.seat, ship: pub(ns), origKey: S.key, origCc: S.cc }
      : p === O ? { type, seat: P.seat, from: O.seat, lostId: S.id, origKey: S.key, origCc: S.cc }
        : { type, seat: P.seat, from: O.seat, origKey: S.key, origCc: S.cc });
    return true;
  }
  if (type === 'storm') {
    const movable = P.ships.filter(s => !s.sunk && s.hits.size === 0);
    if (!movable.length) return false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const blocked = shotAt(room, P);
      P.ships.filter(s => !movable.includes(s)).forEach(s => s.cells.forEach(k => blocked.add(k)));
      const plan = [];
      let ok = true;
      for (const s of movable) {
        const pl = randomPlacement(s.len, blocked);
        if (!pl) { ok = false; break; }
        pl.cells.forEach(k => blocked.add(k)); plan.push([s, pl]);
      }
      if (!ok) continue;
      for (const [s, pl] of plan) Object.assign(s, { r: pl.r, c: pl.c, h: pl.h, cells: pl.cells });
      emitAll(room, 'event', p => p === P ? { type, seat: P.seat, ships: P.ships.map(pub), moved: movable.map(s => s.id) } : { type, seat: P.seat, count: movable.length });
      return true;
    }
    return false;
  }
  if (type === 'whale') {
    const r0 = rnd(N - 2), c0 = rnd(N - 2), occupied = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const k = K(r0 + i, c0 + j);
      if (P.ships.some(sh => !sh.sunk && sh.cells.includes(k) && !sh.hits.has(k))) occupied.push([r0 + i, c0 + j]);
    }
    botHint(room, P, occupied);
    emitAll(room, 'event', p => p === P ? { type, seat: P.seat, area: [r0, c0] } : { type, seat: P.seat, area: [r0, c0], occupied });
    return true;
  }
  if (type === 'parrot') {
    const cand = [];
    P.ships.forEach(sh => { if (!sh.sunk) sh.cells.forEach(k => { if (!sh.hits.has(k)) cand.push(k); }); });
    if (!cand.length) return false;
    const cell = unK(pick(cand));
    botHint(room, P, [cell]);
    emitAll(room, 'event', { type, seat: P.seat, cell });
    return true;
  }
  if (type === 'rum') {
    if (P.skip > 0 || alive(room).length < 2) return false;
    P.skip = 1;
    emitAll(room, 'event', { type, seat: P.seat });
    return true;
  }
  if (type === 'repair') {
    const cand = P.ships.filter(sh => !sh.sunk && sh.hits.size > 0);
    if (!cand.length) return false;
    const ship = pick(cand), k = pick([...ship.hits]);
    ship.hits.delete(k);
    for (const o of room.players) if (o !== P) {
      o.shots.get(P.seat).delete(k); o.hidden.get(P.seat).delete(k);
      if (o.fishPending && o.fishPending.t === P.seat && o.fishPending.k === k) o.fishPending = null;
    }
    emitAll(room, 'event', p => ({ type, seat: P.seat, cell: unK(k), shipId: p === P ? ship.id : undefined }));
    return true;
  }
  if (type === 'fog') {
    if (P.fog > 0) return false;
    P.fog = 3 * room.size;
    emitAll(room, 'event', { type, seat: P.seat, turns: 3 });
    return true;
  }
  if (type === 'siren') {
    if (P.siren > 0) return false;
    P.siren = 1;
    emitAll(room, 'event', { type, seat: P.seat });
    return true;
  }
  if (type === 'bottle') {
    const bonus = rnd(2) ? 'extra' : 'radar';
    if (bonus === 'radar') { const r = P.powers.find(x => x.type === 'radar'); if (r) r.uses++; else P.powers.push({ type: 'radar', uses: 1 }); }
    else P.extra = (P.extra || 0) + 1;
    emitAll(room, 'event', { type, seat: P.seat, bonus });
    return true;
  }
  if (type === 'fish') {
    if (P.fish > 0 || P.fishPending) return false;
    P.fish = 1;
    emitAll(room, 'event', { type, seat: P.seat });
    return true;
  }
  if (type === 'mutiny') {
    const movers = shuffle(P.ships.filter(sh => !sh.sunk)).slice(0, 2);
    if (!movers.length || P.ships.filter(sh => !sh.sunk).length < 2) return false;
    const moverCells = new Set(movers.flatMap(sh => sh.cells));
    for (let attempt = 0; attempt < 40; attempt++) {
      const blocked = new Set([...shotAt(room, P)].filter(k => !moverCells.has(k)));
      P.ships.filter(sh => !movers.includes(sh)).forEach(sh => sh.cells.forEach(k => blocked.add(k)));
      const plan = []; let ok = true;
      for (const sh of movers) {
        const pl = randomPlacement(sh.len, blocked);
        if (!pl) { ok = false; break; }
        pl.cells.forEach(k => blocked.add(k)); plan.push([sh, pl]);
      }
      if (!ok) continue;
      const cleared = [];
      for (const o of room.players) if (o !== P) {
        const m = o.shots.get(P.seat);
        for (const k of moverCells) if (m.has(k)) { m.delete(k); o.hidden.get(P.seat).delete(k); cleared.push(k); }
        if (o.fishPending && o.fishPending.t === P.seat && moverCells.has(o.fishPending.k)) o.fishPending = null;
      }
      for (const [sh, pl] of plan) {
        const idx = sh.cells.map((k, i) => sh.hits.has(k) ? i : -1).filter(i => i >= 0);
        Object.assign(sh, { r: pl.r, c: pl.c, h: pl.h, cells: pl.cells });
        sh.hits = new Set(idx.map(i => pl.cells[i]));
      }
      emitAll(room, 'event', p => p === P
        ? { type, seat: P.seat, ships: P.ships.map(sh => ({ ...pub(sh), hits: [...sh.hits].map(unK), sunk: sh.sunk })), moved: movers.map(sh => sh.id) }
        : { type, seat: P.seat, cleared: [...new Set(cleared)].map(unK) });
      return true;
    }
    return false;
  }
  if (type === 'wave') {
    const row = rnd(2) === 0, idx = rnd(N);
    const line = Array.from({ length: N }, (_, i) => row ? K(idx, i) : K(i, idx));
    const hits = [], wrecks = [];
    for (const sh of P.ships) {
      if (sh.sunk) continue;
      const inter = sh.cells.filter(k => line.includes(k) && !sh.hits.has(k));
      if (!inter.length) continue;
      const k = pick(inter);
      sh.hits.add(k); hits.push([...unK(k), sh.id]);
      if (sh.hits.size >= sh.len) { sh.sunk = true; revealWreck(room, P, sh); wrecks.push(pub(sh)); }
    }
    emitAll(room, 'event', p => p === P ? { type, seat: P.seat, row, idx, hits, wrecks } : { type, seat: P.seat, row, idx, wrecks, count: hits.length });
    checkElim(room, P);
    return true;
  }
  if (type === 'diarrhea') {
    if (P.drunk > 0) return false;
    P.drunk = DIARRHEA_SHOTS;
    emitAll(room, 'event', { type, seat: P.seat, shots: DIARRHEA_SHOTS });
    return true;
  }
  return false;
}

/* ================= Bots ================= */
function botHint(room, P, cells) {
  for (const o of room.players) if (o !== P && o.bot && o.ai) {
    if (!o.ai.queue.has(P.seat)) { o.ai.queue.set(P.seat, new Set()); o.ai.clear.set(P.seat, new Set()); }
    cells.forEach(([r, c]) => o.ai.queue.get(P.seat).add(K(r, c)));
  }
}
function botView(me, tg) {
  const shots = new Map();
  const hid = me.hidden.get(tg.seat);
  for (const [k, v] of me.shots.get(tg.seat)) shots.set(k, hid.has(k) ? 'unk' : (me.fishPending && me.fishPending.t === tg.seat && me.fishPending.k === k) ? 'miss' : v);
  const known = me.known.get(tg.seat);
  const sunkShips = tg.ships.filter(s => known.has(s.id));
  const sunkCells = new Set(sunkShips.flatMap(s => s.cells));
  const lens = tg.ships.filter(s => !known.has(s.id)).map(s => s.len);
  const open = [...shots].filter(([k, v]) => (v === 'hit' || v === 'sunk') && !sunkCells.has(k)).map(([k]) => unK(k));
  return { shots, sunkCells, lens, open };
}
function aiPick(diff, v, queue, clear) {
  const { shots, sunkCells, lens, open } = v;
  const free = (r, c) => inB(r, c) && !shots.has(K(r, c));
  const all0 = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (free(r, c)) all0.push([r, c]);
  if (!all0.length) return null;
  const pool = all0.filter(([r, c]) => !clear.has(K(r, c)));
  const all = pool.length ? pool : all0;
  if (!open.length) { const q = [...queue].map(unK).filter(([r, c]) => free(r, c)); if (q.length) return pick(q); }
  const neighbors = () => { const o = []; for (const [r, c] of open) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(r + dr, c + dc)) o.push([r + dr, c + dc]); return o; };
  const target = () => {
    const set = new Set(open.map(([r, c]) => K(r, c))), line = [];
    for (const [r, c] of open) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      if (!set.has(K(r + dr, c + dc)) && !set.has(K(r - dr, c - dc))) continue;
      let a = r, b = c; while (set.has(K(a + dr, b + dc))) { a += dr; b += dc; }
      if (free(a + dr, b + dc)) line.push([a + dr, b + dc]);
      a = r; b = c; while (set.has(K(a - dr, b - dc))) { a -= dr; b -= dc; }
      if (free(a - dr, b - dc)) line.push([a - dr, b - dc]);
    }
    return line.length ? line : neighbors();
  };
  if (diff === 'easy') {
    if (open.length && Math.random() < .5) { const n = neighbors(); if (n.length) return pick(n); }
    return pick(all);
  }
  if (diff === 'normal') {
    if (open.length) { const t = target(); if (t.length) return pick(t); }
    const par = all.filter(([r, c]) => (r + c) % 2 === 0);
    return pick(par.length ? par : all);
  }
  const blocked = (r, c) => { const x = shots.get(K(r, c)); return x === 'miss' || x === 'unk' || sunkCells.has(K(r, c)) || clear.has(K(r, c)); };
  const openSet = new Set(open.map(([r, c]) => K(r, c)));
  const score = new Array(N * N).fill(0);
  for (const L of lens) for (const h of [true, false]) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const cs = Array.from({ length: L }, (_, i) => h ? [r, c + i] : [r + i, c]);
    if (cs.some(([a, b]) => !inB(a, b) || blocked(a, b))) continue;
    const hc = cs.filter(([a, b]) => openSet.has(K(a, b))).length;
    const w = hc ? Math.pow(40, hc) : (open.length ? 0.02 : 1);
    for (const [a, b] of cs) if (free(a, b)) score[a * N + b] += w;
  }
  let best = -1, cand = [];
  for (const [r, c] of all) {
    const val = score[r * N + c] + ((r + c) % 2 === 0 ? 0.01 : 0);
    if (val > best + 1e-9) { best = val; cand = [[r, c]]; } else if (Math.abs(val - best) < 1e-9) cand.push([r, c]);
  }
  return pick(cand.length ? cand : all);
}
function botDecide(room, seat) {
  const me = room.players[seat];
  const opps = alive(room).filter(p => p !== me);
  if (!opps.length) return null;
  const views = opps.map(o => ({ o, v: botView(me, o) }));
  let tgt = views.find(x => x.v.open.length);
  if (!tgt) tgt = me.ai.lastTarget != null && views.find(x => x.o.seat === me.ai.lastTarget && Math.random() < .6) || pick(views);
  me.ai.lastTarget = tgt.o.seat;
  const { o, v } = tgt;
  const diff = me.bot.diff, ai = me.ai;
  if (!ai.queue.has(o.seat)) { ai.queue.set(o.seat, new Set()); ai.clear.set(o.seat, new Set()); }
  const queue = ai.queue.get(o.seat), clear = ai.clear.get(o.seat);
  ai.turns++;
  for (const pw of me.powers.filter(p => p.uses > 0)) {
    const t = ai.turns, open = v.open.length > 0;
    let use;
    if (pw.type === 'artillery') use = (open && t >= 2) || t >= ai.useAt + 4;
    else if (pw.type === 'radar') use = !open && t >= ai.useAt;
    else use = t >= ai.useAt;
    if (!use) continue;
    if (pw.type === 'emp') return { kind: 'power', type: 'emp', target: o.seat };
    const p = aiPick(diff === 'easy' ? 'normal' : diff, v, queue, clear) || [0, 0];
    let h = Math.random() < .5;
    if (pw.type === 'artillery') {
      const hits = v.open;
      if (hits.some(([a, b]) => hits.some(([a2, b2]) => a2 === a && Math.abs(b2 - b) === 1))) h = true;
      else if (hits.some(([a, b]) => hits.some(([a2, b2]) => b2 === b && Math.abs(a2 - a) === 1))) h = false;
    }
    if (pw.type === 'radar') {
      const cells = areaCells('radar', p[0], p[1]);
      const contact = o.ships.some(sh => !sh.sunk && cells.some(([a, b]) => sh.cells.includes(K(a, b))));
      const fr = cells.filter(([a, b]) => !v.shots.has(K(a, b))).map(([a, b]) => K(a, b));
      if (contact) fr.forEach(k => queue.add(k)); else fr.forEach(k => clear.add(k));
    }
    return { kind: 'power', type: pw.type, target: o.seat, r: p[0], c: p[1], h };
  }
  const p = aiPick(diff, v, queue, clear);
  if (!p) return null;
  return { kind: 'shoot', target: o.seat, r: p[0], c: p[1] };
}
function fallbackShot(room, seat) {
  const p = room.players[seat];
  for (const o of alive(room)) if (o !== p) {
    const m = p.shots.get(o.seat);
    const free = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!m.has(K(r, c))) free.push([r, c]);
    if (free.length) { const [r, c] = pick(free); if (act(room, seat, { kind: 'shoot', target: o.seat, r, c })) return true; }
  }
  return false;
}
function scheduleBot(room) {
  if (room.sim || room.phase !== 'playing') return;
  const seat = room.turn, p = room.players[seat];
  if (!p.bot) return;
  const wait = process.env.FAST ? 5 : Math.max(900 + rnd(700), room.animUntil - Date.now() + 700);
  clearTimeout(room.botTimer);
  room.botTimer = setTimeout(() => {
    if (rooms.get(room.code) !== room || room.phase !== 'playing' || room.turn !== seat) return;
    const a = botDecide(room, seat);
    if (!a || !act(room, seat, a)) fallbackShot(room, seat);
  }, wait);
}
function simulateBots(room) {
  room.sim = true;
  let guard = 0;
  while (room.phase === 'playing' && guard++ < 2000) {
    const a = botDecide(room, room.turn);
    if (!a || !act(room, room.turn, a)) { if (!fallbackShot(room, room.turn)) break; }
  }
  if (room.phase !== 'over') { const al = alive(room); endMatch(room, al[rnd(al.length)].seat); }
}

/* ================= Sync ================= */
function syncState(room, seat) {
  const me = room.players[seat];
  const over = room.phase === 'over';
  const shots = {}, known = {};
  for (const [t, m] of me.shots) {
    const hid = me.hidden.get(t);
    shots[t] = [...m].map(([k, v]) => [...unK(k), over ? v : hid.has(k) ? 'unknown' : (me.fishPending && me.fishPending.t === t && me.fishPending.k === k) ? 'miss' : v]);
    const o = room.players[t];
    known[t] = o.ships ? o.ships.filter(s => over || o.out || me.known.get(t).has(s.id)).map(pub) : [];
  }
  const incoming = new Map();
  for (const o of room.players) if (o !== me && o.shots.get(seat)) for (const [k, v] of o.shots.get(seat)) if (!incoming.has(k) || v !== 'miss') incoming.set(k, v);
  return {
    ...matchedInfo(room, me), phase: room.phase, turn: room.turn, winner: room.winner,
    myShips: me.ships ? me.ships.map(s => ({ ...pub(s), hits: [...s.hits].map(unK), sunk: s.sunk })) : null,
    myPowers: me.powers, blind: me.blind, drunk: me.drunk, scans: me.scans,
    siren: me.siren, fish: me.fish || (me.fishPending ? 1 : 0), extra: me.extra, skip: me.skip,
    fog: Object.fromEntries(room.players.map(p => [p.seat, p.fog || 0])),
    shots, known, incoming: [...incoming].map(([k, v]) => [...unK(k), v]),
    places: room.players.map(p => p.place), myRematch: me.rematch,
  };
}

/* ================= Turnier ================= */
function tPart(T, pid) { return T.parts.find(p => p.pid === pid); }
function tState(T, pid) {
  const me = tPart(T, pid);
  const view = p => p ? { name: p.name, country: p.country, bot: !!p.bot, me: p.pid === pid } : null;
  return {
    code: T.code, phase: T.phase, powerups: T.powerups, events: T.events, isHost: T.host === pid, hostName: (tPart(T, T.host) || {}).name,
    parts: T.parts.filter(p => !p.left || T.phase !== 'lobby').map(p => ({ ...view(p), status: p.status, online: p.bot || p.online })),
    rounds: T.rounds.map(rd => rd.map(m => ({ a: view(tPart(T, m.a)), b: view(tPart(T, m.b)), winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : null, forfeit: !!m.forfeit }))),
    round: T.rounds.length, myStatus: me ? me.status : null, champion: T.champion ? view(tPart(T, T.champion)) : null,
  };
}
function tBroadcast(T) { for (const p of T.parts) if (!p.bot && !p.left && p.sid) io.to(p.sid).emit('tstate', tState(T, p.pid)); }
function socketOf(p) { return p && p.sid ? io.sockets.sockets.get(p.sid) : null; }

function tStartRound(T) {
  for (const rd of T.rounds) for (const m of rd) { const r = rooms.get(m.code); if (r && r.phase === 'over') rooms.delete(m.code); }
  const al = T.parts.filter(p => p.status === 'waiting' || p.status === 'playing');
  if (al.length <= 1) {
    T.phase = 'done'; T.champion = al[0] ? al[0].pid : null;
    if (al[0]) al[0].status = 'champion';
    return tBroadcast(T);
  }
  shuffle(al);
  if (al.length % 2 === 1) {
    const bot = { pid: 'bot-' + crypto.randomUUID(), bot: true, name: BOT_NAMES[T.botCount++ % BOT_NAMES.length], country: pick(COUNTRIES), status: 'waiting', online: true };
    T.parts.push(bot);
    al.splice(rnd(al.length + 1), 0, bot);
  }
  const round = [], roundNo = T.rounds.length + 1;
  T.rounds.push(round);
  for (let i = 0; i < al.length; i += 2) {
    const A = al[i], Bp = al[i + 1];
    const room = newRoom({ size: 2, powerups: T.powerups, events: T.events, tourney: T.code, round: roundNo });
    for (const p of [A, Bp]) {
      const pl = addPlayer(room, mkPlayer({ pid: p.pid, sid: p.bot ? null : p.sid, name: p.name, country: p.country, bot: p.bot ? { diff: 'normal' } : null }));
      pl.online = p.bot ? true : p.online;
      p.status = 'playing'; p.matchCode = room.code;
      const so = socketOf(p); if (so && so.data) so.data.code = room.code;
    }
    round.push({ code: room.code, a: A.pid, b: Bp.pid, winner: null });
    startPlacing(room);
    room.players.forEach(pl => { if (!pl.bot && !pl.online) armForfeit(room, pl.seat); });
  }
  tBroadcast(T);
}
function armForfeit(room, seat) {
  const me = room.players[seat];
  if (me.timer) clearTimeout(me.timer);
  me.timer = setTimeout(() => { if (!me.online && rooms.get(room.code) === room) forfeit(room, seat); }, GRACE_MS);
}
function forfeit(room, seat) {
  const p = room.players[seat];
  if (room.phase === 'over' || p.out) return;
  p.out = true; p.place = alive(room).length + 1;
  if (!p.ships) p.ships = [];
  emitAll(room, 'eliminated', { seat, place: p.place, ships: p.ships.map(pub), forfeit: true });
  const al = alive(room);
  if (al.length <= 1) return endMatch(room, al[0] ? al[0].seat : null, true);
  if (room.phase === 'playing' && room.turn === seat) { room.turn = nextSeat(room, seat); emitTurn(room, false); }
}
function matchFinished(room) {
  if (!room.tourney) return;
  const T = tourneys.get(room.tourney);
  if (!T) return;
  const rd = T.rounds[T.rounds.length - 1], m = rd && rd.find(x => x.code === room.code);
  if (!m || m.winner) return;
  const w = room.players[room.winner !== null ? room.winner : 0], l = room.players.find(p => p !== w);
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
  const me = room.players.find(p => p.pid === d.pid);
  if (!me) return {};
  return { room, me, seat: me.seat };
}
function tctx(socket) {
  const d = socket.data || {};
  const T = d.tcode && tourneys.get(d.tcode);
  if (!T) return {};
  return { T, part: tPart(T, d.pid) };
}
function lobbyBroadcast(room) {
  emitAll(room, 'lobby', p => ({ size: room.size, powerups: room.powerups, events: room.events, isHost: room.players[0] === p,
    players: room.players.map(x => ({ name: x.name, country: x.country, bot: !!x.bot, me: x === p })) }));
}
function closeRoom(room, reason) {
  clearTimeout(room.botTimer);
  room.players.forEach(p => { if (p.timer) clearTimeout(p.timer); });
  room.players.forEach(p => emitTo(p, 'oppLeft', { reason }));
  rooms.delete(room.code);
}

io.on('connection', socket => {
  socket.on('create', (data, cb) => {
    if (typeof cb !== 'function') return;
    const room = newRoom({ size: data && data.size, powerups: data && data.powerups, events: data && data.events });
    const p = addPlayer(room, mkPlayer({ sid: socket.id, name: data && data.name, country: data && data.country }));
    socket.data = { code: room.code, pid: p.pid };
    cb({ ok: true, code: room.code, pid: p.pid, size: room.size });
    lobbyBroadcast(room);
  });

  socket.on('solo', (data, cb) => {
    if (typeof cb !== 'function') return;
    const room = newRoom({ size: data && data.size, powerups: data && data.powerups, events: data && data.events, solo: true });
    const p = addPlayer(room, mkPlayer({ sid: socket.id, name: data && data.name, country: data && data.country }));
    const names = shuffle(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrott']);
    while (room.players.length < room.size) {
      const b = botPlayer(data && data.diff, 'Computer ' + names.pop());
      const taken = room.players.map(x => x.country);
      const free = COUNTRIES.filter(c => !taken.includes(c));
      b.country = pick(free.length ? free : COUNTRIES);
      addPlayer(room, b);
    }
    socket.data = { code: room.code, pid: p.pid };
    cb({ ok: true, code: room.code, pid: p.pid });
    startPlacing(room);
  });

  socket.on('join', (data, cb) => {
    if (typeof cb !== 'function') return;
    const code = String((data && data.code) || '').toUpperCase().trim();
    if (tourneys.has(code)) return cb({ ok: false, tourney: true });
    const room = rooms.get(code);
    if (!room || room.tourney || room.solo) return cb({ ok: false, error: 'Raum nicht gefunden. Ist der Link/Code richtig?' });
    if (room.players.length >= room.size || room.phase !== 'lobby') return cb({ ok: false, error: 'Dieser Raum ist schon voll.' });
    const p = addPlayer(room, mkPlayer({ sid: socket.id, name: data.name, country: data.country }));
    socket.data = { code, pid: p.pid };
    cb({ ok: true, code, pid: p.pid, size: room.size, powerups: room.powerups, events: room.events });
    if (room.players.length >= room.size) startPlacing(room); else lobbyBroadcast(room);
  });

  socket.on('fillBots', () => {
    const { room, me } = ctx(socket);
    if (!room || room.phase !== 'lobby' || room.players[0] !== me || room.players.length < 2) return;
    while (room.players.length < room.size) addPlayer(room, botPlayer('normal'));
    startPlacing(room);
  });

  socket.on('peek', (data, cb) => {
    if (typeof cb !== 'function') return;
    const code = String((data && data.code) || '').toUpperCase().trim();
    const T = tourneys.get(code);
    if (T) {
      if (T.phase !== 'lobby') return cb({ ok: false, error: 'Dieses Turnier hat schon begonnen.' });
      const host = tPart(T, T.host) || {};
      return cb({ ok: true, tourney: true, powerups: T.powerups, events: T.events, host: host.name, hostCountry: host.country, count: T.parts.filter(p => !p.left).length });
    }
    const room = rooms.get(code);
    if (!room || room.tourney || room.solo) return cb({ ok: false, error: 'Raum nicht gefunden – der Link ist abgelaufen oder falsch.' });
    if (room.players.length >= room.size || room.phase !== 'lobby') return cb({ ok: false, error: 'Dieser Raum ist schon voll.' });
    cb({ ok: true, size: room.size, count: room.players.length, powerups: room.powerups, events: room.events, host: room.players[0].name, hostCountry: room.players[0].country });
  });

  /* --- Turnier --- */
  socket.on('tcreate', (data, cb) => {
    if (typeof cb !== 'function') return;
    const code = newCode(), pid = crypto.randomUUID();
    const T = { code, host: pid, powerups: !!(data && data.powerups), events: !!(data && data.events), phase: 'lobby', parts: [], rounds: [], botCount: rnd(BOT_NAMES.length), created: Date.now() };
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
    cb({ ok: true, code: T.code, pid, powerups: T.powerups, events: T.events });
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
    if (room && room.phase !== 'over') { const pl = room.players.find(p => p.pid === part.pid); if (pl) forfeit(room, pl.seat); }
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
        const p = room.players.find(x => x.pid === part.pid);
        if (p.timer) { clearTimeout(p.timer); p.timer = null; }
        p.sid = socket.id; p.online = true;
        state = syncState(room, p.seat);
        emitAll(room, 'oppStatus', x => x !== p && { seat: p.seat, online: true });
      }
      cb({ ok: true, tourney: tState(T, part.pid), state });
      return tBroadcast(T);
    }
    const room = data && rooms.get(String(data.code || ''));
    const p = room && room.players.find(x => x.pid === data.pid);
    if (!p) return cb({ ok: false });
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    p.sid = socket.id; p.online = true;
    socket.data = { code: room.code, pid: p.pid };
    if (room.phase === 'lobby') { cb({ ok: true, lobby: true, code: room.code, size: room.size }); return lobbyBroadcast(room); }
    cb({ ok: true, state: syncState(room, p.seat) });
    emitAll(room, 'oppStatus', x => x !== p && { seat: p.seat, online: true });
  });

  socket.on('ready', data => {
    const { room, me } = ctx(socket);
    if (!room || room.phase !== 'placing' || me.ships) return;
    const ships = buildShips(data && data.ships, me.country);
    if (!ships) return socket.emit('errorMsg', 'Ungültige Aufstellung.');
    let powers = [];
    if (room.powerups) {
      powers = Array.isArray(data.powers) ? [...new Set(data.powers)].filter(t => POWERS.includes(t)) : [];
      if (powers.length !== nPowers(room)) return socket.emit('errorMsg', `Bitte ${nPowers(room)} Power-up${nPowers(room) > 1 ? 's' : ''} wählen.`);
    }
    readyPlayer(room, me.seat, ships, powers);
  });

  socket.on('shoot', data => {
    const { room, seat } = ctx(socket);
    if (room && data) act(room, seat, { kind: 'shoot', target: data.target | 0, r: data.r, c: data.c });
  });
  socket.on('power', data => {
    const { room, seat } = ctx(socket);
    if (room && data) act(room, seat, { kind: 'power', type: data.type, target: data.target | 0, r: data.r, c: data.c, h: data.h });
  });

  socket.on('setCountry', data => {
    const { room, me } = ctx(socket);
    if (!room || room.phase !== 'placing' || me.ships) return;
    me.country = cleanCountry(data && data.country);
    emitAll(room, 'oppCountry', p => p !== me && { seat: me.seat, country: me.country });
    const { T, part } = tctx(socket);
    if (T && part) { part.country = me.country; tBroadcast(T); }
  });

  socket.on('rematch', () => {
    const { room, me } = ctx(socket);
    if (!room || room.tourney || room.phase !== 'over') return;
    me.rematch = true;
    room.players.forEach(p => { if (p.bot) p.rematch = true; });
    if (room.players.every(p => p.rematch)) startPlacing(room);
    else emitAll(room, 'oppRematch', p => p !== me && { seat: me.seat });
  });

  socket.on('leave', () => {
    const { room, me } = ctx(socket);
    if (!room) { socket.data = {}; return; }
    if (room.tourney) { forfeit(room, me.seat); return; }
    socket.data = {};
    if (room.solo) { clearTimeout(room.botTimer); rooms.delete(room.code); return; }
    if (room.phase === 'lobby') {
      room.players = room.players.filter(p => p !== me); room.players.forEach((p, i) => p.seat = i);
      if (!room.players.length) rooms.delete(room.code); else lobbyBroadcast(room);
      return;
    }
    if (room.size === 3 && room.phase === 'playing' && alive(room).length > 2) { me.online = false; forfeit(room, me.seat); return; }
    closeRoom(room, 'left');
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
    const { room, me } = ctx(socket);
    if (!room || me.sid !== socket.id) return;
    me.online = false;
    emitAll(room, 'oppStatus', p => p !== me && { seat: me.seat, online: false });
    if (room.tourney || (room.size === 3 && room.phase === 'playing')) return armForfeit(room, me.seat);
    me.timer = setTimeout(() => {
      if (me.online || rooms.get(room.code) !== room) return;
      if (room.solo) { clearTimeout(room.botTimer); rooms.delete(room.code); return; }
      closeRoom(room, 'timeout');
    }, room.phase === 'lobby' || room.solo ? 10 * 60000 : GRACE_MS);
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

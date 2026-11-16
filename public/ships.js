/* Schiffe versenken – Flotten & Schiffsgrafiken (Draufsicht, SVG) */
(function (global) {
  const FLEET = [
    { key: 'carrier', len: 5 },
    { key: 'battleship', len: 4 },
    { key: 'cruiser', len: 3 },
    { key: 'submarine', len: 3 },
    { key: 'destroyer', len: 2 },
  ];
  const LEN = Object.fromEntries(FLEET.map(f => [f.key, f.len]));

  const COUNTRIES = {
    de: {
      name: 'Deutschland', navy: 'Deutsche Marine', hull: '#a7afb4', deck: '#5f686f',
      ships: {
        carrier: { name: 'Berlin', type: 'Einsatzgruppenversorger', id: 'A 1411', kind: 'supply' },
        battleship: { name: 'Baden-Württemberg', type: 'Fregatte F125', id: 'F 222', kind: 'frigate' },
        cruiser: { name: 'Sachsen', type: 'Fregatte F124', id: 'F 219', kind: 'destroyer', opts: { aegis: true } },
        submarine: { name: 'U 31', type: 'U-Boot Klasse 212A', id: 'S 181', kind: 'sub', opts: { xRudder: true } },
        destroyer: { name: 'Braunschweig', type: 'Korvette K130', id: 'F 260', kind: 'corvette' },
      },
    },
    us: {
      name: 'USA', navy: 'U.S. Navy', hull: '#8e969d', deck: '#50575d',
      ships: {
        carrier: { name: 'USS Gerald R. Ford', type: 'Flugzeugträger', id: 'CVN-78', kind: 'carrier', opts: { num: '78' } },
        battleship: { name: 'USS Missouri', type: 'Schlachtschiff, Iowa-Klasse', id: 'BB-63', kind: 'battleship' },
        cruiser: { name: 'USS Ticonderoga', type: 'Lenkwaffenkreuzer', id: 'CG-47', kind: 'cruiser', opts: { aegis: true } },
        submarine: { name: 'USS Virginia', type: 'Jagd-U-Boot (nuklear)', id: 'SSN-774', kind: 'sub' },
        destroyer: { name: 'USS Arleigh Burke', type: 'Lenkwaffenzerstörer', id: 'DDG-51', kind: 'corvette', opts: { vls: true, aegis: true } },
      },
    },
    uk: {
      name: 'Großbritannien', navy: 'Royal Navy', hull: '#959ca1', deck: '#555c62',
      ships: {
        carrier: { name: 'HMS Queen Elizabeth', type: 'Flugzeugträger', id: 'R08', kind: 'carrier', opts: { num: 'R08', skiJump: true, twoIslands: true, noAngle: true } },
        battleship: { name: 'HMS Daring', type: 'Zerstörer Type 45', id: 'D32', kind: 'destroyer', opts: { mastBig: true } },
        cruiser: { name: 'HMS Glasgow', type: 'Fregatte Type 26', id: 'F88', kind: 'frigate' },
        submarine: { name: 'HMS Astute', type: 'Jagd-U-Boot (nuklear)', id: 'S119', kind: 'sub' },
        destroyer: { name: 'HMS Forth', type: 'Patrouillenschiff', id: 'P222', kind: 'corvette' },
      },
    },
    fr: {
      name: 'Frankreich', navy: 'Marine nationale', hull: '#a2a8ac', deck: '#5a6166',
      ships: {
        carrier: { name: 'Charles de Gaulle', type: 'Flugzeugträger (nuklear)', id: 'R91', kind: 'carrier', opts: { num: '91' } },
        battleship: { name: 'Mistral', type: 'Hubschrauberträger', id: 'L9013', kind: 'lhd', opts: { num: '13' } },
        cruiser: { name: 'Aquitaine', type: 'Fregatte FREMM', id: 'D650', kind: 'frigate', opts: { mastBig: true } },
        submarine: { name: 'Suffren', type: 'Jagd-U-Boot (nuklear)', id: 'S635', kind: 'sub', opts: { xRudder: true } },
        destroyer: { name: 'La Fayette', type: 'Fregatte (Stealth)', id: 'F710', kind: 'corvette' },
      },
    },
    jp: {
      name: 'Japan', navy: 'JMSDF', hull: '#8b949b', deck: '#4f575d',
      ships: {
        carrier: { name: 'JS Izumo', type: 'Hubschrauberträger', id: 'DDH-183', kind: 'lhd', opts: { num: '183' } },
        battleship: { name: 'Yamato', type: 'Schlachtschiff (historisch)', id: '大和', kind: 'battleship', opts: { yamato: true } },
        cruiser: { name: 'JS Kongō', type: 'Lenkwaffenzerstörer', id: 'DDG-173', kind: 'destroyer', opts: { aegis: true } },
        submarine: { name: 'JS Taigei', type: 'U-Boot', id: 'SS-513', kind: 'sub', opts: { xRudder: true } },
        destroyer: { name: 'JS Mogami', type: 'Mehrzweckfregatte', id: 'FFM-1', kind: 'corvette' },
      },
    },
    ru: {
      name: 'Russland', navy: 'Seekriegsflotte', hull: '#80898f', deck: '#4a5257',
      ships: {
        carrier: { name: 'Admiral Kusnezow', type: 'Flugzeugträgerkreuzer', id: '063', kind: 'carrier', opts: { num: '063', skiJump: true } },
        battleship: { name: 'Pjotr Weliki', type: 'Schwerer Raketenkreuzer', id: '099', kind: 'cruiser', opts: { heavy: true } },
        cruiser: { name: 'Admiral Gorschkow', type: 'Fregatte', id: '454', kind: 'frigate' },
        submarine: { name: 'Sewerodwinsk', type: 'Atom-U-Boot, Jasen-Klasse', id: 'K-560', kind: 'sub', opts: { missiles: true } },
        destroyer: { name: 'Grad Swijaschsk', type: 'Korvette Bujan-M', id: '652', kind: 'corvette', opts: { vls: true } },
      },
    },
    it: {
      name: 'Italien', navy: 'Marina Militare', hull: '#9ba4aa', deck: '#575f65',
      ships: {
        carrier: { name: 'Cavour', type: 'Flugzeugträger', id: 'C550', kind: 'carrier', opts: { num: '550', skiJump: true, noAngle: true } },
        battleship: { name: 'Andrea Doria', type: 'Zerstörer Horizon', id: 'D553', kind: 'destroyer', opts: { mastBig: true } },
        cruiser: { name: 'Carlo Bergamini', type: 'Fregatte FREMM', id: 'F590', kind: 'frigate' },
        submarine: { name: 'Salvatore Todaro', type: 'U-Boot 212A', id: 'S526', kind: 'sub', opts: { xRudder: true } },
        destroyer: { name: 'Thaon di Revel', type: 'Patrouillenfregatte', id: 'P430', kind: 'corvette' },
      },
    },
    al: {
      name: 'Xyl’Tharr-Schwarm', navy: 'Außerirdische', hull: '#5b4a7a', deck: '#3a2f52', space: true, fictional: true,
      ships: {
        carrier: { name: 'Vorrr’ak', type: 'Mutterschiff', id: 'Ω-1', kind: 'alien', opts: { mother: true } },
        battleship: { name: 'Kh’zzaar', type: 'Schlachtschale', id: 'Ω-7', kind: 'alien' },
        cruiser: { name: 'Ixxa-Ul', type: 'Biokreuzer', id: 'Ω-12', kind: 'alien', opts: { spines: true } },
        submarine: { name: 'Sporr', type: 'Tarnspore', id: 'Ω-31', kind: 'alien', opts: { stealth: true } },
        destroyer: { name: 'Zib', type: 'Späher-Untertasse', id: 'Ω-99', kind: 'alien', opts: { saucer: true } },
      },
    },
    un: {
      name: 'Einhorn-Armada', navy: 'Regenbogenflotte', hull: '#ff8fd0', deck: '#ffc2e6', space: true, fictional: true,
      ships: {
        carrier: { name: 'Glitzerhorn', type: 'Sternenträgerin', id: '★ 1', kind: 'unicorn', opts: { big: true } },
        battleship: { name: 'Funkelmähne', type: 'Regenbogen-Schlachtschiff', id: '★ 2', kind: 'unicorn' },
        cruiser: { name: 'Zuckerwolke', type: 'Glitzerkreuzer', id: '★ 3', kind: 'unicorn' },
        submarine: { name: 'Schimmerschleicher', type: 'Tarn-Pony', id: '★ 4', kind: 'unicorn', opts: { lavender: true } },
        destroyer: { name: 'Kleines Wunder', type: 'Fohlen-Jäger', id: '★ 5', kind: 'unicorn' },
      },
    },
    te: {
      name: 'Terranische Union', navy: 'Raumflotte der Erde', hull: '#c3cfdb', deck: '#6f8499', space: true, fictional: true,
      ships: {
        carrier: { name: 'TUS Gaia', type: 'Raumträger', id: 'CV-01', kind: 'terra', opts: { carrier: true } },
        battleship: { name: 'TUS Unbeugsam', type: 'Schlachtkreuzer', id: 'BC-07', kind: 'terra', opts: { turrets: 3 } },
        cruiser: { name: 'TUS Morgenröte', type: 'Lenkwaffenfregatte', id: 'FF-21', kind: 'terra', opts: { turrets: 1 } },
        submarine: { name: 'TUS Schatten', type: 'Tarnkorvette', id: 'SK-04', kind: 'terra', opts: { stealth: true } },
        destroyer: { name: 'TUS Pfeil', type: 'Abfangboot', id: 'IB-33', kind: 'terra', opts: { turrets: 0 } },
      },
    },
    pi: {
      name: 'Schrottpiraten vom Ring', navy: 'Freibeuter', hull: '#8a5a3a', deck: '#5a3a24', space: true, fictional: true,
      ships: {
        carrier: { name: 'Rostige Rosi', type: 'Schrottträger', id: 'XXL', kind: 'pirate', opts: { crane: true } },
        battleship: { name: 'Dicke Brummer', type: 'Kanonenfrachter', id: 'BUMM', kind: 'pirate', opts: { guns: 3 } },
        cruiser: { name: 'Blechbüchse', type: 'Enterkreuzer', id: '???', kind: 'pirate', opts: { guns: 1 } },
        submarine: { name: 'Leise Lotte', type: 'Schmuggelkapsel', id: 'PSST', kind: 'pirate', opts: { dark: true } },
        destroyer: { name: 'Funkenflug', type: 'Raketen-Jolle', id: 'ZACK', kind: 'pirate', opts: { rocket: true } },
      },
    },
  };

  /* ---------- Hilfen ---------- */
  let uid = 0;
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
  }

  function flagBody(cc) {
    switch (cc) {
      case 'de': return '<rect width="60" height="40" fill="#000"/><rect y="13.3" width="60" height="13.4" fill="#DD0000"/><rect y="26.7" width="60" height="13.3" fill="#FFCE00"/>';
      case 'fr': return '<rect width="60" height="40" fill="#fff"/><rect width="20" height="40" fill="#002395"/><rect x="40" width="20" height="40" fill="#ED2939"/>';
      case 'it': return '<rect width="60" height="40" fill="#fff"/><rect width="20" height="40" fill="#009246"/><rect x="40" width="20" height="40" fill="#CE2B37"/>';
      case 'ru': return '<rect width="60" height="40" fill="#fff"/><rect y="13.3" width="60" height="13.4" fill="#0039A6"/><rect y="26.7" width="60" height="13.3" fill="#D52B1E"/>';
      case 'jp': return '<rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="12" fill="#BC002D"/>';
      case 'uk': return '<rect width="60" height="40" fill="#012169"/><path d="M0 0L60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/><path d="M30 0V40M0 20H60" stroke="#fff" stroke-width="13"/><path d="M30 0V40M0 20H60" stroke="#C8102E" stroke-width="8"/>';
      case 'al': return '<rect width="60" height="40" fill="#2a1840"/><ellipse cx="30" cy="23" rx="20" ry="6" fill="#7d6aa8"/><ellipse cx="30" cy="19" rx="9" ry="7" fill="#9dff7a"/><circle cx="18" cy="24" r="1.6" fill="#9dff7a"/><circle cx="30" cy="26" r="1.6" fill="#9dff7a"/><circle cx="42" cy="24" r="1.6" fill="#9dff7a"/>';
      case 'un': { const c = ['#ff4d4d', '#ff9a3d', '#ffe14d', '#5fd96a', '#4da3ff', '#a46bff']; let r = ''; c.forEach((f, i) => r += `<rect y="${i * 6.67}" width="60" height="6.8" fill="${f}"/>`); return r + '<path d="M22 32 L38 8 L32 33 Z" fill="#fff4c2" stroke="#d4a017" stroke-width="1.2"/><path d="M26 27 L35 23 M28 21 L36 17" stroke="#d4a017" stroke-width="1"/>'; }
      case 'te': return '<rect width="60" height="40" fill="#0d2a5c"/><ellipse cx="30" cy="20" rx="22" ry="6" fill="none" stroke="#e8f0ff" stroke-width="1.6" transform="rotate(-15 30 20)"/><circle cx="30" cy="20" r="9" fill="#2e7dff"/><path d="M24 17 q4 -4 8 0 q3 3 -1 6 q-5 2 -7 -2 Z" fill="#4fcf6a"/><path d="M8 20 a22 6 0 0 0 44 -0" fill="none" stroke="#e8f0ff" stroke-width="1.6" transform="rotate(-15 30 20)"/>';
      case 'pi': return '<rect width="60" height="40" fill="#151515"/><path d="M16 30 L44 10 M16 10 L44 30" stroke="#e8e2d0" stroke-width="3.5" stroke-linecap="round"/><circle cx="30" cy="17" r="8" fill="#e8e2d0"/><rect x="25" y="21" width="10" height="6" rx="1.5" fill="#e8e2d0"/><circle cx="27" cy="17" r="2.2" fill="#151515"/><circle cx="33" cy="17" r="2.2" fill="#151515"/>';
      case 'us': {
        let s = '<rect width="60" height="40" fill="#fff"/>';
        for (let i = 0; i < 7; i++) s += `<rect y="${i * 6.15}" width="60" height="3.08" fill="#B22234"/>`;
        s += '<rect width="26" height="21.5" fill="#3C3B6E"/>';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) s += `<circle cx="${3 + x * 5}" cy="${3 + y * 5}" r="1" fill="#fff"/>`;
        return s;
      }
    }
    return '';
  }
  function flagSVG(cc, cls = '') {
    return `<svg class="flag ${cls}" viewBox="0 0 60 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${flagBody(cc)}</svg>`;
  }
  function miniFlag(cc, x, y, w, h) {
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 60 40" preserveAspectRatio="none">${flagBody(cc)}<rect width="60" height="40" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/></svg>`;
  }

  function hullPath(W, top, bot, bow) {
    return `M 8 ${top} L ${W - bow} ${top} C ${W - bow * 0.45} ${top} ${W - 10} ${50 - (50 - top) * 0.45} ${W - 3} 50 ` +
      `C ${W - 10} ${50 + (bot - 50) * 0.45} ${W - bow * 0.45} ${bot} ${W - bow} ${bot} L 8 ${bot} Q 3 ${bot} 3 ${bot - 5} L 3 ${top + 5} Q 3 ${top} 8 ${top} Z`;
  }
  function hull(W, top, bot, bow, u) {
    const d = hullPath(W, top, bot, bow);
    return `<path d="${d}" fill="url(#${u}h)" stroke="#1d2328" stroke-width="1.5" filter="url(#${u}f)"/>` +
      `<path d="${d}" fill="url(#${u}d)" transform="translate(${W * 0.012} 50) scale(0.976 0.86) translate(0 -50)"/>`;
  }
  function gun(x, y, dir = 1, s = 1, col = '#c9cfd3') {
    return `<g transform="translate(${x} ${y}) scale(${dir * s} ${s})"><rect x="2" y="-1.6" width="22" height="3.2" rx="1.2" fill="#2b3136"/>` +
      `<path d="M -8 -7 L 3 -7 Q 10 -5 10 0 Q 10 5 3 7 L -8 7 Z" fill="${col}" stroke="#2b3136" stroke-width="1"/></g>`;
  }
  function vls(x, y, cols, rows, cell = 7) {
    let s = `<rect x="${x}" y="${y}" width="${cols * cell + 2}" height="${rows * cell + 2}" rx="1.5" fill="#3a4147" stroke="#262c30"/>`;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
      s += `<rect x="${x + 1.5 + i * cell}" y="${y + 1.5 + j * cell}" width="${cell - 1.6}" height="${cell - 1.6}" fill="#59626a"/>`;
    return s;
  }
  function heliDeck(x0, x1, top, bot) {
    const cx = (x0 + x1) / 2, r = Math.min(x1 - x0, bot - top) * 0.36;
    return `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${bot - top}" rx="3" fill="#3d4449"/>` +
      `<circle cx="${cx}" cy="50" r="${r}" fill="none" stroke="#e8d36a" stroke-width="1.6"/>` +
      `<path d="M ${cx - r * 0.38} ${50 - r * 0.5} v ${r} M ${cx + r * 0.38} ${50 - r * 0.5} v ${r} M ${cx - r * 0.38} 50 h ${r * 0.76}" stroke="#f2f2f2" stroke-width="2"/>` +
      `<line x1="${x0 + 2}" y1="50" x2="${x1 - 2}" y2="50" stroke="#f2f2f2" stroke-width=".8" stroke-dasharray="4 3" opacity=".6"/>`;
  }
  function jet(x, y, rot, col) {
    return `<path transform="translate(${x} ${y}) rotate(${rot}) scale(.95)" fill="${col}" stroke="#2a2f33" stroke-width=".6" ` +
      `d="M 12 0 L 3 -1.8 L -1 -9 L -4 -9 L -2.5 -2 L -8 -2 L -11 -6 L -12.5 -6 L -11.5 0 L -12.5 6 L -11 6 L -8 2 L -2.5 2 L -4 9 L -1 9 L 3 1.8 Z"/>`;
  }

  /* ---------- Schiffstypen ---------- */
  function warship(W, C, o, u, cc, kind) {
    const corv = W <= 200;
    const top = corv ? 31 : 30, bot = 100 - top;
    const bow = Math.min(W * 0.3, 95);
    const light = shade(C.hull, 0.28), mid = shade(C.hull, 0.1);
    let s = hull(W, top, bot, bow, u);
    const helEnd = corv ? 52 : W >= 400 ? 78 : 64;
    s += heliDeck(9, helEnd, top + 5, bot - 5);
    const hang0 = helEnd, hang1 = helEnd + (corv ? 18 : 30);
    s += `<rect x="${hang0}" y="${top + 4}" width="${hang1 - hang0}" height="${bot - top - 8}" rx="2" fill="${mid}" stroke="#30373c"/>`;
    // Superstruktur
    const gunX = W - bow + (corv ? 18 : 14);
    const hasVls = kind !== 'corvette' || o.vls;
    let supEnd = gunX - (hasVls ? (corv ? 40 : 58) : 22);
    if (kind === 'cruiser') supEnd = gunX - (W <= 300 ? 50 : 64);
    let supStart = hang1;
    let aftGunX = null, aftVlsX = null;
    if (kind === 'cruiser') { const sm = W <= 300; aftVlsX = hang1 + 4; aftGunX = hang1 + (sm ? 32 : 40); supStart = hang1 + (sm ? 42 : 54); }
    s += `<rect x="${supStart}" y="${top + 6}" width="${supEnd - supStart}" height="${bot - top - 12}" rx="4" fill="${light}" stroke="#30373c"/>`;
    s += `<rect x="${supStart + 6}" y="${top + 11}" width="${(supEnd - supStart) - 14}" height="${bot - top - 22}" rx="3" fill="${shade(C.hull, 0.38)}"/>`;
    // Brückenfenster
    s += `<rect x="${supEnd - 7}" y="${top + 9}" width="4" height="${bot - top - 18}" rx="1" fill="#1e2a33"/>`;
    // Schornstein
    const fx = supStart + (supEnd - supStart) * 0.38;
    s += `<rect x="${fx - 9}" y="43" width="18" height="14" rx="5" fill="#3b4247"/><rect x="${fx - 6}" y="46" width="12" height="8" rx="3" fill="#15191c"/>`;
    // Mast
    const mx = supStart + (supEnd - supStart) * 0.7;
    const mr = o.mastBig ? 9 : 5.5;
    s += `<circle cx="${mx}" cy="50" r="${mr}" fill="${shade(C.hull, -0.15)}" stroke="#2b3136"/>`;
    s += `<path d="M ${mx} ${50 - mr - 6} V ${50 + mr + 6} M ${mx - 4} ${50 - mr - 3} H ${mx + 4} M ${mx - 4} ${50 + mr + 3} H ${mx + 4}" stroke="#2b3136" stroke-width="1.3"/>`;
    if (o.mastBig) s += `<circle cx="${mx}" cy="50" r="${mr - 4}" fill="#2b3136"/>`;
    // Aegis-Panele
    if (o.aegis) {
      s += `<rect x="${supEnd - 18}" y="${top + 5}" width="10" height="3" fill="#2a3036"/><rect x="${supEnd - 18}" y="${bot - 8}" width="10" height="3" fill="#2a3036"/>`;
      s += `<rect x="${supStart + 4}" y="${top + 5}" width="10" height="3" fill="#2a3036"/><rect x="${supStart + 4}" y="${bot - 8}" width="10" height="3" fill="#2a3036"/>`;
    }
    // VLS + Geschütz vorn
    if (hasVls) {
      const cols = o.heavy ? 6 : corv ? 3 : 4;
      s += vls(supEnd + 6, 50 - (o.heavy ? 18 : 12), cols, o.heavy ? 5 : 3, o.heavy ? 6.5 : 7);
    }
    if (o.heavy) {
      // Kirow: Raketensilos
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) s += `<circle cx="${supEnd + 58 + i * 9}" cy="${42 + j * 16}" r="3.4" fill="#2f363b" stroke="#596168"/>`;
    }
    s += gun(Math.min(gunX, W - 34), 50, 1, corv ? 0.9 : 1.1, light);
    if (aftVlsX) s += vls(aftVlsX, 39, W <= 300 ? 3 : 4, 3, 7) + gun(aftGunX, 50, -1, 1, light);
    // Ensign
    s += miniFlag(cc, 12, top + 7, 14, 9);
    return s;
  }

  function battleship(W, C, o, u, cc) {
    const top = 24, bot = 76, bow = 120;
    const d = hullPath(W, top, bot, bow);
    let s = `<path d="${d}" fill="url(#${u}h)" stroke="#1d2328" stroke-width="1.5" filter="url(#${u}f)"/>`;
    s += `<path d="${d}" fill="url(#${u}t)" transform="translate(${W * 0.012} 50) scale(0.976 0.88) translate(0 -50)"/>`;
    const g = shade(C.hull, 0.2), dk = shade(C.hull, -0.25);
    const turret = (x, dir, sc) => `<g transform="translate(${x} 50) scale(${dir * sc} ${sc})">` +
      `<rect x="6" y="-8.5" width="40" height="3" rx="1" fill="#2a2f33"/><rect x="6" y="-1.5" width="42" height="3" rx="1" fill="#2a2f33"/><rect x="6" y="5.5" width="40" height="3" rx="1" fill="#2a2f33"/>` +
      `<path d="M -16 -13 L 6 -13 Q 16 -10 16 0 Q 16 10 6 13 L -16 13 Q -19 13 -19 10 L -19 -10 Q -19 -13 -16 -13 Z" fill="${g}" stroke="#262b2f" stroke-width="1.2"/>` +
      `<circle cx="-8" cy="0" r="3" fill="${dk}"/></g>`;
    s += turret(W - 128, 1, 1.0) + turret(W - 175, 1, 1.12) + turret(78, -1, 1.0);
    // Aufbauten
    const x0 = 112, x1 = W - 200;
    s += `<rect x="${x0}" y="33" width="${x1 - x0}" height="34" rx="6" fill="${g}" stroke="#262b2f"/>`;
    s += `<rect x="${x0 + 10}" y="38" width="${x1 - x0 - 20}" height="24" rx="5" fill="${shade(C.hull, 0.32)}"/>`;
    if (o.yamato) {
      s += `<ellipse cx="${x0 + 52}" cy="50" rx="16" ry="10" fill="#33393e"/><ellipse cx="${x0 + 52}" cy="50" rx="9" ry="6" fill="#121518"/>`;
    } else {
      s += `<ellipse cx="${x0 + 30}" cy="50" rx="11" ry="9" fill="#33393e"/><ellipse cx="${x0 + 30}" cy="50" rx="6" ry="5" fill="#121518"/>`;
      s += `<ellipse cx="${x0 + 62}" cy="50" rx="11" ry="9" fill="#33393e"/><ellipse cx="${x0 + 62}" cy="50" rx="6" ry="5" fill="#121518"/>`;
    }
    s += `<circle cx="${x1 - 10}" cy="50" r="9" fill="${shade(C.hull, -0.1)}" stroke="#262b2f"/><circle cx="${x1 - 10}" cy="50" r="4" fill="#262b2f"/>`;
    // Mittelartillerie
    for (const [x, y] of [[x0 + 8, 30], [x0 + 8, 70], [x1 - 22, 30], [x1 - 22, 70], [x0 + 40, 28], [x0 + 40, 72]])
      s += `<circle cx="${x}" cy="${y}" r="4.5" fill="${g}" stroke="#262b2f"/><rect x="${x}" y="${y - 0.8}" width="9" height="1.6" fill="#2a2f33"/>`;
    s += miniFlag(cc, 14, 44, 16, 11);
    return s;
  }

  function carrier(W, C, o, u, cc) {
    let s = hull(W, 20, 80, 110, u);
    const deckCol = '#4a4f55';
    const pts = o.noAngle
      ? [[6, 16], [W * 0.75, 14], [W - 40, 22], [W - 8, 40], [W - 8, 60], [W - 40, 82], [40, 86], [6, 80]]
      : [[6, 24], [40, 9], [W * 0.6, 5], [W * 0.68, 20], [W - 55, 20], [W - 8, 38], [W - 8, 62], [W - 55, 84], [30, 87], [6, 77]];
    s += `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${deckCol}" stroke="#23272b" stroke-width="1.5" filter="url(#${u}f)"/>`;
    if (o.skiJump) {
      s += `<defs><linearGradient id="${u}sk" x1="0" x2="1"><stop offset="0" stop-color="${deckCol}"/><stop offset="1" stop-color="#7a8086"/></linearGradient></defs>`;
      s += `<polygon points="${W - 70},${o.noAngle ? 17 : 21} ${W - 40},${o.noAngle ? 22 : 21} ${W - 8},40 ${W - 8},60 ${W - 40},${o.noAngle ? 64 : 64} ${W - 70},64" fill="url(#${u}sk)" opacity=".9"/>`;
      for (let i = 0; i < 4; i++) s += `<line x1="${W - 64 + i * 14}" y1="${24 + i * 3}" x2="${W - 64 + i * 14}" y2="${62 - i * 1}" stroke="#9aa0a5" stroke-width=".7" opacity=".5"/>`;
    }
    // Markierungen
    if (!o.noAngle) {
      s += `<line x1="18" y1="64" x2="${W * 0.62}" y2="15" stroke="#fff" stroke-width="1.4" stroke-dasharray="9 6" opacity=".85"/>`;
      s += `<line x1="10" y1="54" x2="${W * 0.58}" y2="8" stroke="#e9e9e9" stroke-width=".9" opacity=".7"/>`;
      s += `<line x1="28" y1="74" x2="${W * 0.66}" y2="22" stroke="#e9e9e9" stroke-width=".9" opacity=".7"/>`;
      for (let i = 0; i < 4; i++) s += `<line x1="${60 + i * 16}" y1="${62 - i * 2.4}" x2="${66 + i * 16}" y2="${56 - i * 2.4}" stroke="#ffd34d" stroke-width="1.3"/>`;
    } else {
      s += `<line x1="12" y1="${o.skiJump ? 40 : 50}" x2="${W - 72}" y2="40" stroke="#fff" stroke-width="1.3" stroke-dasharray="9 6" opacity=".85"/>`;
    }
    if (!o.skiJump) {
      s += `<line x1="${W * 0.62}" y1="36" x2="${W - 14}" y2="40" stroke="#c9ced2" stroke-width="1"/><line x1="${W * 0.55}" y1="58" x2="${W - 14}" y2="56" stroke="#c9ced2" stroke-width="1"/>`;
    }
    // Aufzüge
    s += `<rect x="${W * 0.72}" y="78" width="26" height="8" fill="#3a3e43" stroke="#2a2e32"/><rect x="${W * 0.45}" y="80" width="24" height="7" fill="#3a3e43" stroke="#2a2e32"/>`;
    // Insel(n)
    const island = (x, w) => `<rect x="${x}" y="72" width="${w}" height="16" rx="2" fill="${shade(C.hull, 0.18)}" stroke="#2a2f33"/>` +
      `<rect x="${x + 4}" y="75" width="${w - 8}" height="9" rx="1.5" fill="${shade(C.hull, 0.36)}"/>` +
      `<circle cx="${x + w * 0.55}" cy="79.5" r="3.5" fill="#2e3439"/><rect x="${x + w - 6}" y="74" width="3" height="12" fill="#1f262c"/>`;
    if (o.twoIslands) s += island(W * 0.33, 34) + island(W * 0.56, 34);
    else s += island(W * 0.56, 52);
    // Flugzeuge
    const jc = shade(C.hull, 0.15);
    const jets = [[W * 0.74, 70, 200], [W * 0.78, 70, 200], [W * 0.82, 70, 200], [W * 0.5, 70, 200], [W * 0.43, 70, 200],
      [W * 0.86, 30, 160], [W * 0.18, 76, 340], [W * 0.24, 77, 340], [W * 0.3, 28, 20]];
    for (const [x, y, r] of jets) s += jet(x, y, r, jc);
    if (o.num) s += `<text x="${W - (o.skiJump ? 100 : 70)}" y="56" font-family="Arial Black,Arial" font-weight="900" font-size="20" fill="#f4f4f4" opacity=".85" text-anchor="middle">${o.num}</text>`;
    return s;
  }

  function lhd(W, C, o, u, cc) {
    let s = hull(W, 20, 80, 100, u);
    s += `<polygon points="6,17 ${W - 60},15 ${W - 12},34 ${W - 12},66 ${W - 60},85 6,83" fill="#4c5157" stroke="#23272b" stroke-width="1.5" filter="url(#${u}f)"/>`;
    s += `<line x1="10" y1="50" x2="${W - 18}" y2="50" stroke="#f3d34a" stroke-width="1.2" stroke-dasharray="10 6" opacity=".8"/>`;
    let n = 1;
    for (let x = 48; x < W - 60; x += 66) {
      s += `<circle cx="${x}" cy="33" r="11" fill="none" stroke="#f2f2f2" stroke-width="1.3" opacity=".85"/><text x="${x}" y="37" font-size="11" font-family="Arial" font-weight="700" text-anchor="middle" fill="#f2f2f2" opacity=".85">${n++}</text>`;
    }
    const ix = W * 0.55;
    s += `<rect x="${ix}" y="70" width="${W * 0.16}" height="18" rx="2" fill="${shade(C.hull, 0.18)}" stroke="#2a2f33"/>`;
    s += `<rect x="${ix + 5}" y="73" width="${W * 0.16 - 10}" height="11" rx="1.5" fill="${shade(C.hull, 0.36)}"/>`;
    s += `<circle cx="${ix + W * 0.1}" cy="78.5" r="4" fill="#2e3439"/>`;
    s += `<rect x="18" y="58" width="34" height="22" fill="#3b4045" stroke="#2a2e32"/>`;
    // Hubschrauber
    const heli = (x, y) => `<g transform="translate(${x} ${y})"><ellipse rx="7" ry="3.5" fill="${shade(C.hull, 0.1)}" stroke="#2a2f33" stroke-width=".6"/><rect x="-16" y="-0.8" width="10" height="1.6" fill="${shade(C.hull, 0.1)}"/>` +
      `<path d="M -12 -12 L 12 12 M 12 -12 L -12 12" stroke="#1f2428" stroke-width="1.1" opacity=".75"/></g>`;
    s += heli(W * 0.3, 66) + heli(W * 0.42, 66) + heli(W * 0.82, 66);
    if (o.num) s += `<text x="${W - 70}" y="58" font-family="Arial Black,Arial" font-weight="900" font-size="18" fill="#f4f4f4" opacity=".85" text-anchor="middle">${o.num}</text>`;
    s += miniFlag(cc, 60, 59, 14, 9);
    return s;
  }

  function sub(W, C, o, u, cc) {
    const d = `M 6 50 C 30 43 60 37 100 37 L ${W - 50} 37 C ${W - 16} 37 ${W - 4} 44 ${W - 4} 50 C ${W - 4} 56 ${W - 16} 63 ${W - 50} 63 L 100 63 C 60 63 30 57 6 50 Z`;
    let s = `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14181b"/><stop offset=".5" stop-color="#3f484f"/><stop offset="1" stop-color="#101315"/></linearGradient></defs>`;
    s += `<path d="${d}" fill="url(#${u}s)" stroke="#0b0d0f" stroke-width="1.5" filter="url(#${u}f)"/>`;
    s += `<line x1="40" y1="50" x2="${W - 20}" y2="50" stroke="#59636b" stroke-width="1" opacity=".55"/>`;
    // Ruder
    if (o.xRudder) s += `<path d="M 10 40 L 26 47 M 10 60 L 26 53 M 10 40 L 4 37 M 10 60 L 4 63" stroke="#1d2226" stroke-width="3.2" stroke-linecap="round"/>`;
    else s += `<path d="M 16 34 L 16 66 M 6 50 L 28 50" stroke="#1d2226" stroke-width="3.2" stroke-linecap="round"/>`;
    s += `<ellipse cx="8" cy="50" rx="3" ry="5" fill="#6b5a3a"/>`;
    // Turm
    const sx = W * 0.62;
    s += `<rect x="${sx}" y="43" width="46" height="14" rx="7" fill="#272d31" stroke="#0e1113"/><rect x="${sx + 8}" y="46.5" width="28" height="7" rx="3.5" fill="#3b444a"/>`;
    s += `<circle cx="${sx + 34}" cy="50" r="1.6" fill="#8b979e"/><circle cx="${sx + 28}" cy="50" r="1.6" fill="#8b979e"/>`;
    if (o.missiles) for (let i = 0; i < 8; i++) s += `<rect x="${sx - 74 + i * 8.5}" y="44" width="6" height="12" rx="1.5" fill="#2a3135" stroke="#4d575e" stroke-width=".7"/>`;
    for (const x of [W * 0.3, W * 0.82]) s += `<circle cx="${x}" cy="50" r="2.4" fill="#2a3135" stroke="#59636b" stroke-width=".7"/>`;
    return s;
  }

  function supply(W, C, o, u, cc) {
    const top = 24, bot = 76;
    let s = hull(W, top, bot, 100, u);
    const light = shade(C.hull, 0.28);
    s += heliDeck(10, 74, top + 5, bot - 5);
    s += `<rect x="74" y="${top + 4}" width="86" height="${bot - top - 8}" rx="3" fill="${light}" stroke="#30373c"/>`;
    s += `<rect x="82" y="${top + 9}" width="70" height="${bot - top - 18}" rx="3" fill="${shade(C.hull, 0.38)}"/>`;
    s += `<rect x="150" y="${top + 8}" width="4" height="${bot - top - 16}" fill="#1e2a33"/>`;
    s += `<rect x="96" y="43" width="20" height="14" rx="5" fill="#3b4247"/><rect x="99" y="46" width="14" height="8" rx="3" fill="#15191c"/>`;
    s += `<circle cx="134" cy="50" r="6" fill="${shade(C.hull, -0.15)}" stroke="#2b3136"/>`;
    // Versorgungsmasten + Container
    const cols = ['#b4683b', '#3f6f8f', '#5f7d4c', '#9a8a4a', '#8a4a4a'];
    let ci = 0;
    for (let x = 175; x < W - 140; x += 26) {
      for (const y of [32, 52]) s += `<rect x="${x}" y="${y}" width="22" height="16" fill="${cols[ci++ % cols.length]}" stroke="#262b2f" stroke-width=".8"/>`;
    }
    for (const x of [200, 280, 330]) s += `<rect x="${x}" y="${top + 1}" width="5" height="${bot - top - 2}" fill="#d6d9dc" stroke="#2b3136" stroke-width=".8"/><circle cx="${x + 2.5}" cy="${top + 3}" r="3" fill="#2b3136"/><circle cx="${x + 2.5}" cy="${bot - 3}" r="3" fill="#2b3136"/>`;
    s += gun(W - 92, 50, 1, 0.9, light);
    s += `<circle cx="${W - 130}" cy="50" r="7" fill="${light}" stroke="#2b3136"/><rect x="${W - 130}" y="48.5" width="28" height="3" fill="#e0b84a" stroke="#2b3136" stroke-width=".5"/>`;
    s += miniFlag(cc, 14, top + 7, 14, 9);
    return s;
  }


  /* ---------- Fiktive Raumschiffe ---------- */
  function sparkle(x, y, r, col = '#fff') {
    return `<path d="M ${x} ${y - r} L ${x + r * .25} ${y - r * .25} L ${x + r} ${y} L ${x + r * .25} ${y + r * .25} L ${x} ${y + r} L ${x - r * .25} ${y + r * .25} L ${x - r} ${y} L ${x - r * .25} ${y - r * .25} Z" fill="${col}"/>`;
  }
  function engineGlow(x, y, r, col, u, id) {
    return `<defs><radialGradient id="${u}${id}"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}${id})"/>`;
  }

  function alien(W, C, o, u) {
    let s = `<defs><radialGradient id="${u}a" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#9c88c9"/><stop offset=".6" stop-color="#5b4a7a"/><stop offset="1" stop-color="#241a38"/></radialGradient>
      <radialGradient id="${u}g"><stop offset="0" stop-color="#eaffd8"/><stop offset=".35" stop-color="#8dff5a"/><stop offset="1" stop-color="#3ddc2a" stop-opacity="0"/></radialGradient></defs>`;
    if (o.saucer) {
      s += `<ellipse cx="${W / 2}" cy="50" rx="${W / 2 - 4}" ry="34" fill="url(#${u}a)" stroke="#1a1228" stroke-width="2" filter="url(#${u}f)"/>`;
      s += `<ellipse cx="${W / 2}" cy="50" rx="${W / 2 - 22}" ry="22" fill="none" stroke="#a894d6" stroke-width="1.5" opacity=".6"/>`;
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; s += `<circle cx="${W / 2 + Math.cos(a) * (W / 2 - 13)}" cy="${50 + Math.sin(a) * 26}" r="3.2" fill="#8dff5a"/>`; }
      s += `<circle cx="${W / 2}" cy="50" r="24" fill="url(#${u}g)"/><ellipse cx="${W / 2}" cy="50" rx="15" ry="12" fill="#b7ff9a" stroke="#2f6d1e" stroke-width="1.5" opacity=".9"/>`;
      return s;
    }
    const top = o.stealth ? 26 : 16, bot = 100 - top;
    const d = `M 4 50 C ${W * 0.12} ${top - 6} ${W * 0.3} ${top} ${W * 0.55} ${top} C ${W * 0.85} ${top} ${W - 6} 38 ${W - 3} 50 C ${W - 6} 62 ${W * 0.85} ${bot} ${W * 0.55} ${bot} C ${W * 0.3} ${bot} ${W * 0.12} ${bot + 6} 4 50 Z`;
    s += `<path d="${d}" fill="url(#${u}a)" stroke="#1a1228" stroke-width="2" filter="url(#${u}f)" ${o.stealth ? 'opacity=".9"' : ''}/>`;
    for (let x = 40; x < W - 30; x += 34) s += `<path d="M ${x} ${top + 6} Q ${x + 14} 50 ${x} ${bot - 6}" fill="none" stroke="#a894d6" stroke-width="1.6" opacity=".45"/>`;
    if (o.spines || o.mother) for (let x = 30; x < W - 40; x += 46) s += `<path d="M ${x} ${top + 2} L ${x + 10} ${top - 9} L ${x + 18} ${top + 3} M ${x} ${bot - 2} L ${x + 10} ${bot + 9} L ${x + 18} ${bot - 3}" fill="#3a2f52" stroke="#1a1228" stroke-width="1.2"/>`;
    s += `<path d="M 6 50 Q -2 38 2 28 M 6 50 Q -2 62 2 72" stroke="#5b4a7a" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    const n = Math.max(1, Math.round(W / 110));
    for (let i = 0; i < n; i++) {
      const x = W * (0.25 + 0.55 * (n === 1 ? .5 : i / (n - 1)));
      s += `<circle cx="${x}" cy="50" r="${o.mother ? 26 : 20}" fill="url(#${u}g)"/><ellipse cx="${x}" cy="50" rx="${o.mother ? 12 : 9}" ry="${o.mother ? 10 : 8}" fill="#b7ff9a" stroke="#2f6d1e" stroke-width="1.2"/>`;
    }
    for (let x = 24; x < W - 20; x += 22) s += `<circle cx="${x}" cy="${top + 9}" r="2" fill="#8dff5a" opacity=".85"/><circle cx="${x}" cy="${bot - 9}" r="2" fill="#8dff5a" opacity=".85"/>`;
    s += `<path d="M ${W - 30} 44 Q ${W - 14} 50 ${W - 30} 56" fill="none" stroke="#8dff5a" stroke-width="2.5"/>`;
    return s;
  }

  function unicorn(W, C, o, u) {
    const top = 26, bot = 74;
    const base = o.lavender ? '#c9a2ff' : '#ff8fd0', dark = o.lavender ? '#7a4fc2' : '#c2338a';
    let s = `<defs><linearGradient id="${u}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(base, -0.2)}"/><stop offset=".45" stop-color="${shade(base, 0.45)}"/><stop offset="1" stop-color="${shade(base, -0.3)}"/></linearGradient>
      <linearGradient id="${u}h2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffd84a"/><stop offset="1" stop-color="#e0a816"/></linearGradient></defs>`;
    // Regenbogen-Schweif
    const rb = ['#ff4d4d', '#ff9a3d', '#ffe14d', '#5fd96a', '#4da3ff', '#a46bff'];
    rb.forEach((c, i) => { const y = 35 + i * 6; s += `<path d="M 30 ${y} Q 14 ${y - 6} 2 ${y + 3}" stroke="${c}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`; });
    const d = hullPath(W, top, bot, Math.min(80, W * 0.3));
    s += `<path d="${d}" transform="translate(14 0) scale(${(W - 14) / W} 1)" fill="url(#${u}p)" stroke="${dark}" stroke-width="2" filter="url(#${u}f)"/>`;
    rb.forEach((c, i) => s += `<rect x="30" y="${41 + i * 3}" width="${W - 110}" height="3.1" fill="${c}" opacity=".9"/>`);
    // Kabinen-Kuppel
    s += `<ellipse cx="${W * 0.35}" cy="50" rx="${Math.min(30, W * 0.1)}" ry="13" fill="#ffffff" stroke="${dark}" stroke-width="1.5" opacity=".95"/><ellipse cx="${W * 0.35 - 4}" cy="46" rx="7" ry="4" fill="#bfe8ff"/>`;
    // Horn
    s += `<path d="M ${W - 70} 43 L ${W - 70} 57 L ${W - 3} 50 Z" fill="url(#${u}h2)" stroke="#b8860b" stroke-width="1.2"/>`;
    for (let x = W - 64; x < W - 12; x += 11) s += `<path d="M ${x} ${43 + (x - W + 70) * 0.1} L ${x + 6} ${57 - (x - W + 70) * 0.1}" stroke="#b8860b" stroke-width="1.1"/>`;
    // Herzen & Glitzer
    for (let x = 60; x < W - 90; x += 52) s += `<path transform="translate(${x} 33) scale(.9)" d="M 0 3 C 0 -1 5 -1 5 3 C 5 -1 10 -1 10 3 C 10 7 5 10 5 11 C 5 10 0 7 0 3 Z" fill="#fff" opacity=".9"/>` + `<path transform="translate(${x + 18} 61) scale(.9)" d="M 0 3 C 0 -1 5 -1 5 3 C 5 -1 10 -1 10 3 C 10 7 5 10 5 11 C 5 10 0 7 0 3 Z" fill="#fff" opacity=".9"/>`;
    for (let i = 0, x = 26; x < W - 20; x += 37, i++) s += sparkle(x, i % 2 ? 22 : 78, 5, i % 3 ? '#fff' : '#ffe14d');
    return s;
  }

  function terra(W, C, o, u) {
    let s = `<defs><linearGradient id="${u}t2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c7f93"/><stop offset=".45" stop-color="#e3ebf3"/><stop offset="1" stop-color="#55677a"/></linearGradient></defs>`;
    const t = o.stealth ? 30 : 24, b = 100 - t;
    const pts = [[12, t + 8], [W * 0.22, t], [W - 46, t + 6], [W - 3, 50], [W - 46, b - 6], [W * 0.22, b], [12, b - 8]];
    // Triebwerke
    const n = W >= 400 ? 3 : 2;
    for (let i = 0; i < n; i++) { const y = 50 + (i - (n - 1) / 2) * (b - t - 16) / Math.max(1, n - 1) * (n > 1 ? 1 : 0); s += `<rect x="4" y="${y - 6}" width="16" height="12" rx="2" fill="#3a4654" stroke="#1d242c"/>` + engineGlow(5, y, 11, '#5fb4ff', u, 'e' + i); }
    s += `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${o.stealth ? '#3b4655' : `url(#${u}t2)`}" stroke="#1d242c" stroke-width="2" filter="url(#${u}f)"/>`;
    // Paneele
    for (let x = W * 0.2; x < W - 60; x += 28) s += `<line x1="${x}" y1="${t + 5}" x2="${x}" y2="${b - 5}" stroke="#1d242c" stroke-width=".8" opacity=".35"/>`;
    s += `<line x1="22" y1="50" x2="${W - 20}" y2="50" stroke="#2e6cff" stroke-width="4" opacity=".85"/>`;
    if (o.carrier) {
      s += `<rect x="${W * 0.15}" y="${t + 6}" width="${W * 0.55}" height="10" fill="#2b3440"/><rect x="${W * 0.15}" y="${b - 16}" width="${W * 0.55}" height="10" fill="#2b3440"/>`;
      for (let x = W * 0.17; x < W * 0.7; x += 18) s += `<rect x="${x}" y="${t + 9}" width="9" height="2" fill="#ffd34d"/><rect x="${x}" y="${b - 11}" width="9" height="2" fill="#ffd34d"/>`;
    }
    const tw = o.stealth ? 0 : (o.turrets ?? 2);
    for (let i = 0; i < tw; i++) {
      const x = W - 80 - i * 46;
      s += `<g transform="translate(${x} 50)"><circle r="9" fill="#9fb0c2" stroke="#1d242c" stroke-width="1.2"/><rect x="4" y="-4.5" width="22" height="2.6" fill="#1d242c"/><rect x="4" y="1.9" width="22" height="2.6" fill="#1d242c"/></g>`;
    }
    const bx = o.carrier ? W * 0.78 : W * 0.38;
    s += `<rect x="${bx - 18}" y="40" width="36" height="20" rx="4" fill="#f0f5fa" stroke="#1d242c" stroke-width="1.2"/><rect x="${bx + 8}" y="43" width="6" height="14" rx="1.5" fill="#1f3550"/>`;
    s += `<circle cx="${bx - 6}" cy="50" r="5" fill="#2e7dff" stroke="#e8f0ff" stroke-width="1.2"/>`;
    if (o.stealth) s += `<path d="M ${W * 0.3} ${t + 4} L ${W - 30} 50 L ${W * 0.3} ${b - 4}" fill="none" stroke="#5fb4ff" stroke-width="1.4" opacity=".7"/>`;
    return s;
  }

  function pirate(W, C, o, u) {
    let s = `<defs><linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2e1b"/><stop offset=".5" stop-color="#a06a40"/><stop offset="1" stop-color="#3d2616"/></linearGradient></defs>`;
    const t = o.dark ? 30 : 26, b = 100 - t;
    for (let i = 0; i < 2; i++) s += `<rect x="3" y="${i ? b - 18 : t + 6}" width="14" height="12" rx="3" fill="#3a3a3a" stroke="#111"/>` + engineGlow(4, i ? b - 12 : t + 12, 10, '#ff8a2a', u, 'e' + i);
    s += `<path d="${hullPath(W, t, b, Math.min(70, W * 0.28))}" transform="translate(10 0) scale(${(W - 10) / W} 1)" fill="${o.dark ? '#2d2d33' : `url(#${u}r)`}" stroke="#1b120b" stroke-width="2" filter="url(#${u}f)"/>`;
    // Flickbleche
    const cols = ['#6f7a80', '#9a5b2e', '#7d8c5a', '#5b6570', '#a87a3a'];
    let k = 0;
    for (let x = 30; x < W - 70; x += 38) {
      const y = (k % 2) ? 52 : t + 6, h = (k % 2) ? b - 58 : 46 - t;
      s += `<rect x="${x}" y="${y}" width="30" height="${Math.max(10, h)}" fill="${cols[k % cols.length]}" stroke="#1b120b" stroke-width="1" transform="rotate(${(k % 3 - 1) * 3} ${x + 15} ${y + 8})"/>`;
      for (const [rx, ry] of [[3, 3], [27, 3]]) s += `<circle cx="${x + rx}" cy="${y + ry}" r="1.2" fill="#2a1a0f"/>`;
      k++;
    }
    // Schornsteine
    for (let x = 50; x < W * 0.6; x += 90) s += `<circle cx="${x}" cy="50" r="9" fill="#2b2b2b" stroke="#111"/><circle cx="${x}" cy="50" r="5" fill="#0b0b0b"/><circle cx="${x - 8}" cy="44" r="7" fill="#555" opacity=".45"/>`;
    if (o.crane) s += `<circle cx="${W * 0.7}" cy="50" r="8" fill="#d9a520" stroke="#111"/><rect x="${W * 0.7}" y="47" width="${W * 0.18}" height="6" fill="#d9a520" stroke="#111"/><path d="M ${W * 0.7} 47 L ${W * 0.88} 53" stroke="#111"/>`;
    for (let i = 0; i < (o.guns || 0); i++) {
      const x = W - 92 - i * 50;
      s += `<g transform="translate(${x} 50) rotate(${(i % 2 ? 1 : -1) * 6})"><rect x="-8" y="-8" width="16" height="16" rx="3" fill="#5d5d5d" stroke="#111"/><rect x="6" y="-2.5" width="26" height="5" fill="#222"/></g>`;
    }
    if (o.rocket) s += `<rect x="${W * 0.45}" y="40" width="${W * 0.3}" height="20" rx="10" fill="#c43b2a" stroke="#111"/><rect x="${W * 0.5}" y="40" width="6" height="20" fill="#f0e6d0"/>`;
    // Totenkopf-Farbe
    const sx = W - 58;
    s += `<g transform="translate(${sx} 50) scale(.8)"><path d="M -10 -10 L 10 10 M -10 10 L 10 -10" stroke="#e8e2d0" stroke-width="3.5" stroke-linecap="round"/><circle cy="-2" r="7.5" fill="#e8e2d0"/><rect x="-4.5" y="2" width="9" height="5" rx="1" fill="#e8e2d0"/><circle cx="-2.6" cy="-2.5" r="2" fill="#1b120b"/><circle cx="2.6" cy="-2.5" r="2" fill="#1b120b"/></g>`;
    return s;
  }

  const KINDS = {
    carrier, lhd, battleship, sub, supply, alien, unicorn, terra, pirate,
    frigate: (W, C, o, u, cc) => warship(W, C, o, u, cc, 'frigate'),
    destroyer: (W, C, o, u, cc) => warship(W, C, o, u, cc, 'destroyer'),
    cruiser: (W, C, o, u, cc) => warship(W, C, o, u, cc, 'cruiser'),
    corvette: (W, C, o, u, cc) => warship(W, C, o, u, cc, 'corvette'),
  };

  function defs(u, C) {
    const h = C.hull, d = C.deck;
    return `<defs>
<linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(h, -0.4)}"/><stop offset=".5" stop-color="${shade(h, 0.12)}"/><stop offset="1" stop-color="${shade(h, -0.5)}"/></linearGradient>
<linearGradient id="${u}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(d, -0.15)}"/><stop offset=".5" stop-color="${shade(d, 0.1)}"/><stop offset="1" stop-color="${shade(d, -0.2)}"/></linearGradient>
<pattern id="${u}t" width="46" height="5" patternUnits="userSpaceOnUse"><rect width="46" height="5" fill="#b8955f"/><rect y="4.3" width="46" height=".7" fill="#7d5f36"/><rect x="23" width=".7" height="5" fill="#8d6c40"/></pattern>
<filter id="${u}f" x="-5%" y="-30%" width="110%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity=".55"/></filter>
</defs>`;
  }

  function shipSVG(cc, key, horiz = true, cls = '') {
    const C = COUNTRIES[cc] || COUNTRIES.de;
    const S = C.ships[key];
    const W = LEN[key] * 100;
    const o = S.opts || {};
    const u = 'sv' + (++uid);
    const fy = { carrier: 1.17, lhd: 1.33, sub: 3.5, battleship: 1.8, supply: 1.8, alien: o.saucer ? 1.3 : o.stealth ? 1.85 : 1.3, unicorn: 1.85, terra: o.stealth ? 2.2 : 1.75, pirate: o.dark ? 2.2 : 1.9 }[S.kind] || 2.3;
    const body = `<g transform="translate(0 50) scale(1 ${fy}) translate(0 -50)">${KINDS[S.kind](W, C, S.opts || {}, u, cc)}</g>`;
    const vb = horiz ? `0 0 ${W} 100` : `0 0 100 ${W}`;
    const g = horiz ? body : `<g transform="translate(100 0) rotate(90)">${body}</g>`;
    return `<svg class="ship-svg ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${defs(u, C)}${g}</svg>`;
  }

  global.Ships = { FLEET, LEN, COUNTRIES, shipSVG, flagSVG, shade };
})(typeof window !== 'undefined' ? window : globalThis);

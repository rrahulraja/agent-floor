'use strict';
// Builds a flat-vector character SVG (60 x 80, seated, seen from the front) from a small description.
// Every theme in public/themes is generated from data files next to this one: `npm run build:themes`.

const esc = (s) => String(s).replace(/[<&"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));

const STYLE = `
.ink{fill:#1E2235}.line{fill:none;stroke:#1E2235;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.bob{animation:bob 2.6s ease-in-out infinite}@keyframes bob{50%{transform:translateY(-.8px)}}
.tl{animation:tap .45s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:top}
.tr{animation:tap .45s ease-in-out infinite alternate-reverse;transform-box:fill-box;transform-origin:top}
@keyframes tap{to{transform:rotate(-7deg)}}
.wave{animation:wave .9s ease-in-out infinite alternate;transform-origin:44px 44px}@keyframes wave{to{transform:rotate(16deg)}}
.sway{animation:sway 2.4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}@keyframes sway{from{transform:rotate(-6deg)}to{transform:rotate(7deg)}}
.trunk{animation:trunk 3s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:top}@keyframes trunk{to{transform:rotate(-8deg)}}
.notes text{animation:note 3s ease-out infinite;opacity:0}.notes text:nth-child(2){animation-delay:1s}.notes text:nth-child(3){animation-delay:2s}
@keyframes note{15%{opacity:1}100%{opacity:0;transform:translate(8px,-22px)}}
.pull{animation:pull 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:right}@keyframes pull{50%{transform:translateX(-3px)}}
.spark{animation:spark 1s steps(2) infinite}@keyframes spark{50%{opacity:.25}}
.glow{animation:glow 2s ease-in-out infinite}@keyframes glow{50%{opacity:.55}}
.flicker{animation:flick 2.2s steps(3) infinite}@keyframes flick{40%{opacity:.75}60%{opacity:.95}}
.pop{animation:pop 1.4s ease-in-out infinite}@keyframes pop{50%{transform:translateY(-2px)}}
.dots circle{animation:dot 1.2s infinite;opacity:.2}.dots circle:nth-child(2){animation-delay:.2s}.dots circle:nth-child(3){animation-delay:.4s}@keyframes dot{40%{opacity:1}}
.scribble{stroke-dasharray:18;stroke-dashoffset:18;animation:scr 2.4s linear infinite}@keyframes scr{60%,100%{stroke-dashoffset:0}}
.zz text{animation:zz 2.6s ease-out infinite;opacity:0}.zz text:nth-child(2){animation-delay:1.3s}@keyframes zz{20%{opacity:1}100%{opacity:0;transform:translate(6px,-14px)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.notes text,.zz text{opacity:0}.scribble{stroke-dashoffset:0}}`;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- body ----------
function torso(o, skin) {
  const col = o.color || '#3B6FD8', acc = o.accent || shade(col, -0.25);
  const base = `<path d="M11 80 V51 q0 -13 19 -13 q19 0 19 13 V80 Z" fill="${o.style === 'bare' ? skin : col}"/>`;
  switch (o.style) {
    case 'robe': return base + `<path d="M23 38 L30 52 L37 38 Z" fill="${acc}"/><path d="M30 52 V80" stroke="${acc}" stroke-width="2"/>`;
    case 'shawl': return base + `<path d="M13 46 Q32 58 49 72 V80 H40 Q26 62 11 55 Z" fill="${acc}"/>`;
    case 'armor': return base + `<rect x="19" y="47" width="22" height="20" rx="5" fill="${acc}"/><circle cx="14" cy="47" r="5" fill="${acc}"/><circle cx="46" cy="47" r="5" fill="${acc}"/>`;
    case 'jacket': return base + `<path d="M24 38 L30 60 L36 38" fill="${o.inner || '#F4F1E8'}"/><path d="M24 38 L30 60 M36 38 L30 60" stroke="${acc}" stroke-width="1.6"/><circle cx="30" cy="66" r="1.2" fill="${acc}"/><circle cx="30" cy="72" r="1.2" fill="${acc}"/>`;
    case 'tunic': return base + `<rect x="11" y="62" width="38" height="4" fill="${acc}"/>`;
    case 'bare': return base + `<path d="M13 44 Q30 60 48 70" stroke="${acc}" stroke-width="3.5" fill="none"/><path d="M11 72 h38 V80 H11Z" fill="${o.color || '#C8352E'}"/>`;
    case 'cloak': return base + `<path d="M11 51 q0 -13 19 -13 q19 0 19 13 V80 H42 V54 q-12 -6 -24 0 V80 H11Z" fill="${acc}"/>`;
    default: return base;
  }
}

const sleeve = (o, skin) => (o.style === 'bare' ? skin : o.color || '#3B6FD8');
function arms(pose, o, skin) {
  const s = sleeve(o, skin);
  const arm = (d, cls = '') => `<g class="${cls}"><path d="${d}" fill="none" stroke="${s}" stroke-width="6.5" stroke-linecap="round"/></g>`;
  const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${skin}"/>`;
  switch (pose) {
    case 'typing': return arm('M16 44 q-4 10 6 16', 'tl') + arm('M44 44 q4 10 -6 16', 'tr');
    case 'raise': return arm('M16 44 q-6 10 -2 20') + `<g class="wave">${arm('M44 44 q10 -8 8 -22')}${hand(52, 20)}</g>`;
    case 'hold': return arm('M16 44 q-5 10 8 14') + arm('M44 44 q5 10 -8 14') + hand(24, 58) + hand(36, 58);
    case 'flute': return arm('M16 44 q-3 -6 10 -14') + arm('M44 44 q8 -4 0 -16') + hand(27, 30) + hand(43, 28);
    case 'blow': return arm('M16 44 q-2 -4 8 -12') + arm('M44 44 q2 -4 -8 -12') + hand(25, 32) + hand(35, 32);
    case 'bow': return arm('M16 44 q-6 -2 -10 -8') + hand(6, 36) + `<g class="pull">${arm('M44 44 q-8 -4 -16 -8')}${hand(28, 32)}</g>`;
    case 'staff': return arm('M16 44 q-5 10 -1 20') + arm('M44 44 q6 8 6 14') + hand(50, 58);
    case 'mug': return arm('M16 44 q-6 10 -2 20') + arm('M44 44 q2 10 -8 13') + '<rect x="28" y="50" width="8" height="9" rx="1.5" fill="#F4F1E8" stroke="#8A6A4E" stroke-width=".9"/><path d="M36 52 q3.5 1.5 0 4.5" fill="none" stroke="#8A6A4E" stroke-width=".9"/>' + hand(36, 57);
    case 'chin': return arm('M16 44 q-6 10 -2 20') + arm('M44 44 q4 -2 -10 -12') + hand(34, 33);
    default: return arm('M16 44 q-6 10 -2 20') + arm('M44 44 q6 10 2 20');
  }
}

// ---------- props, placed for the pose ----------
function prop(p) {
  if (!p) return '';
  const c = p.color;
  switch (p.type) {
    case 'flute': return `<line x1="20" y1="31" x2="56" y2="27" stroke="${c || '#9A5B2A'}" stroke-width="3" stroke-linecap="round"/><g fill="#3E2412"><circle cx="46" cy="28" r=".8"/><circle cx="50" cy="27.6" r=".8"/></g><g class="notes" fill="#3B5FAF" font-size="7" font-family="serif"><text x="52" y="22">♪</text><text x="55" y="25">♫</text><text x="50" y="24">♪</text></g>`;
    case 'bow': return `<path d="M6 14 Q-2 36 6 58" fill="none" stroke="${c || '#7A4A26'}" stroke-width="2.2"/><line x1="6" y1="14" x2="6" y2="58" stroke="#E8DCC0" stroke-width=".8"/><line x1="6" y1="36" x2="30" y2="32" stroke="#5A3A20" stroke-width="1.2"/>`;
    case 'mace': return `<line x1="50" y1="58" x2="56" y2="26" stroke="#8B5A2B" stroke-width="2.5"/><circle cx="56" cy="22" r="6" fill="${c || '#E8B830'}"/><circle cx="56" cy="22" r="2" fill="${shade(c || '#E8B830', -0.3)}"/>`;
    case 'staff': return `<line x1="50" y1="80" x2="52" y2="8" stroke="${c || '#7A4A26'}" stroke-width="2.4" stroke-linecap="round"/>${p.top === 'orb' ? '<circle class="glow" cx="52" cy="7" r="4" fill="#9FD3F2"/>' : ''}`;
    case 'scroll': return `<rect x="18" y="55" width="24" height="7" rx="2" fill="#EAD7A2"/><line class="scribble" x1="21" y1="58.5" x2="39" y2="58.5" stroke="#6B4A2A" stroke-width=".9"/>`;
    case 'book': return `<path d="M18 54 h12 v9 h-12z M30 54 h12 v9 h-12z" fill="${c || '#C8352E'}"/><path d="M19 55 h10 v7 h-10z M31 55 h10 v7 h-10z" fill="#F4F1E8"/>`;
    case 'quill': return `<path d="M38 58 q8 -12 14 -18 q-4 8 -12 18z" fill="#F4F1E8" stroke="#8A8F9E" stroke-width=".6"/><rect x="18" y="56" width="20" height="6" rx="1" fill="#EAD7A2"/><line class="scribble" x1="20" y1="59" x2="35" y2="59" stroke="#3E2412" stroke-width=".8"/>`;
    case 'conch': return `<path d="M24 26 q6 -6 14 -2 q2 5 -4 9 q-7 2 -10 -7z" fill="#F7F2E4" stroke="#C9BFA8" stroke-width=".8"/><path d="M28 27 q4 -2 7 0" stroke="#D8A27A" fill="none" stroke-width=".8"/><g class="notes" fill="#D8A27A" font-size="8" font-family="sans-serif"><text x="44" y="22">)</text><text x="47" y="24">)</text><text x="50" y="26">)</text></g>`;
    case 'wand': return `<line x1="36" y1="58" x2="54" y2="40" stroke="${c || '#5A3A20'}" stroke-width="1.6" stroke-linecap="round"/><g class="spark" fill="#FFE27A"><circle cx="55" cy="38" r="2"/><circle cx="58" cy="34" r="1"/><circle cx="52" cy="35" r="1"/></g>`;
    case 'crystal': return `<circle class="glow" cx="30" cy="54" r="7" fill="${c || '#9FC8F2'}"/><circle cx="27" cy="51" r="2" fill="#fff" opacity=".7"/><rect x="24" y="60" width="12" height="3" rx="1" fill="#8B5A2B"/>`;
    case 'cauldron': return `<path d="M17 58 h26 q0 10 -13 10 q-13 0 -13 -10z" fill="#3A3F55"/><ellipse cx="30" cy="58" rx="13" ry="2.5" fill="${c || '#5CC793'}"/><g class="notes" fill="${c || '#5CC793'}" font-size="7"><text x="26" y="54">○</text><text x="32" y="52">○</text><text x="29" y="50">○</text></g>`;
    case 'hammer': return `<line x1="50" y1="58" x2="52" y2="36" stroke="#8B5A2B" stroke-width="2.4"/><rect x="45" y="31" width="14" height="6" rx="1" fill="${c || '#8A90A6'}"/>`;
    case 'beam': return `<rect x="26" y="52" width="4" height="9" rx="1" fill="#8A90A6"/><rect class="glow" x="27" y="18" width="2.4" height="34" rx="1.2" fill="${c || '#5CC7F2'}"/>`;
    case 'walkie': return `<rect x="31" y="22" width="7" height="12" rx="1.5" fill="#3A3F55"/><line x1="33" y1="22" x2="33" y2="15" stroke="#3A3F55" stroke-width="1.4"/><circle class="spark" cx="35" cy="27" r="1" fill="#F2B825"/>`;
    case 'map': return `<path d="M17 52 l8 -2 l8 2 l9 -2 v12 l-9 2 l-8 -2 l-8 2z" fill="#EAD7A2" stroke="#B89A5A" stroke-width=".6"/><path class="scribble" d="M20 58 q6 -4 10 0 t10 -2" stroke="#C8352E" stroke-width=".9" fill="none" stroke-dasharray="2 1.5"/>`;
    case 'flask': return `<path d="M26 46 h8 M27.5 46 v5 l-5 9 h15 l-5 -9 v-5" fill="#E9F6EE" stroke="#3A3F55" stroke-width="1"/><path d="M24 58 h12 l-1.5 -3 h-9z" fill="${c || '#5CC793'}" class="glow"/>`;
    case 'laptop': return `<rect x="17" y="50" width="26" height="14" rx="1.5" fill="${c || '#C7CCD8'}"/><rect class="glow" x="19" y="52" width="22" height="10" fill="#9FD3F2"/>`;
    case 'lights': return `<g class="spark"><circle cx="8" cy="10" r="1.8" fill="#F2545B"/><circle cx="20" cy="6" r="1.8" fill="#F2B825"/><circle cx="40" cy="6" r="1.8" fill="#5CC793"/><circle cx="52" cy="10" r="1.8" fill="#3B6FD8"/></g><path d="M8 10 Q30 0 52 10" fill="none" stroke="#2F3A2E" stroke-width=".6"/>`;
    case 'cards': return `<rect x="18" y="53" width="10" height="13" rx="1" fill="#F4F1E8" stroke="#8A8F9E" stroke-width=".6" transform="rotate(-10 23 60)"/><rect x="31" y="53" width="10" height="13" rx="1" fill="#F4F1E8" stroke="#8A8F9E" stroke-width=".6" transform="rotate(10 36 60)"/><text x="21" y="62" font-size="6" fill="#C8352E" font-family="serif">♦</text><text x="33" y="62" font-size="6" fill="#1E2235" font-family="serif">♠</text>`;
    case 'dice': return `<rect x="22" y="55" width="8" height="8" rx="1.5" fill="#F2545B"/><rect x="32" y="55" width="8" height="8" rx="1.5" fill="#9B4DCA"/><circle cx="26" cy="59" r="1" fill="#fff"/><circle cx="34" cy="57" r="1" fill="#fff"/><circle cx="38" cy="61" r="1" fill="#fff"/>`;
    case 'lotus': return `<path d="M30 52 q-6 4 -8 10 q8 0 8 -10z M30 52 q6 4 8 10 q-8 0 -8 -10z M30 50 q-3 6 0 12 q3 -6 0 -12z" fill="#F29EB8"/>`;
    case 'sandals': return `<g fill="#B07650"><ellipse cx="24" cy="58" rx="4" ry="6"/><ellipse cx="36" cy="58" rx="4" ry="6"/></g>`;
    case 'bowlfood': return `<path d="M20 57 h20 q0 7 -10 7 q-10 0 -10 -7z" fill="#B0603A"/><g fill="#FFF3DC"><circle cx="26" cy="56" r="2.5"/><circle cx="31" cy="55" r="2.8"/><circle cx="35" cy="56.5" r="2.3"/></g>`;
    case 'garland': return `<g fill="#F2B825"><circle cx="18" cy="56" r="2"/><circle cx="23" cy="60" r="2"/><circle cx="30" cy="62" r="2"/><circle cx="37" cy="60" r="2"/><circle cx="42" cy="56" r="2"/></g>`;
    case 'compass': return `<circle cx="30" cy="57" r="6" fill="#E8B830"/><circle cx="30" cy="57" r="4.5" fill="#F4F1E8"/><path class="sway" d="M30 53 l1.2 4 l-1.2 4 l-1.2 -4z" fill="#C8352E"/>`;
    case 'medal': return `<path d="M26 40 l4 8 l4 -8" fill="#3B6FD8"/><circle class="glow" cx="30" cy="51" r="4" fill="#E8B830"/>`;
    case 'bike': return `<g fill="none" stroke="#3A3F55" stroke-width="1.6"><circle cx="16" cy="70" r="7"/><circle cx="44" cy="70" r="7"/><path d="M16 70 l10 -10 h10 l8 10 M26 60 l4 10"/></g>`;
    case 'joystick': return `<rect x="20" y="58" width="20" height="7" rx="2" fill="#3A3F55"/><line class="sway" x1="27" y1="58" x2="27" y2="50" stroke="#1E2235" stroke-width="1.6"/><circle cx="27" cy="50" r="2" fill="#F2545B"/><circle class="spark" cx="35" cy="61" r="1.3" fill="#5CC793"/>`;
    case 'holo': return `<path class="flicker" d="M18 62 l12 -16 l12 16z" fill="#5CC7F2" opacity=".35"/><circle class="flicker" cx="30" cy="54" r="4" fill="#5CC7F2" opacity=".6"/>`;
    case 'wrench': return `<path d="M44 58 l8 -16 a4 4 0 1 1 3 2 l-8 16z" fill="${c || '#8A90A6'}"/>`;
    case 'thali': return `<ellipse cx="30" cy="60" rx="12" ry="3.5" fill="#E8B830"/><path class="glow" d="M30 52 q-2 3 0 5 q2 -2 0 -5z" fill="#FFB347"/>`;
    case 'arrows': return `<g stroke="#7A4A26" stroke-width="1.1"><line x1="8" y1="70" x2="18" y2="40"/><line x1="52" y1="70" x2="42" y2="38"/><line x1="4" y1="64" x2="20" y2="46"/><line x1="56" y1="64" x2="40" y2="44"/></g><g fill="#9AA0B5"><path d="M18 40 l-2 3 h4z"/><path d="M42 38 l-2 3 h4z"/></g>`;
    default: return '';
  }
}

// ---------- heads ----------
function hair(h, skin) {
  if (!h || h.style === 'none') return { back: '', front: '' };
  const c = h.color || '#2B1D14';
  switch (h.style) {
    case 'long': return { back: `<path d="M17 20 q0 -14 13 -14 q13 0 13 14 v20 q-4 4 -6 0 v-14 h-14 v14 q-2 4 -6 0z" fill="${c}"/>`, front: `<path d="M19 20 q0 -11 11 -11 q11 0 11 11 q-4 -6 -11 -6 q-7 0 -11 6z" fill="${c}"/>` };
    case 'bun': return { back: `<circle cx="30" cy="7" r="5" fill="${c}"/>`, front: `<path d="M19 20 q0 -12 11 -12 q11 0 11 12 q-4 -6 -11 -6 q-7 0 -11 6z" fill="${c}"/>` };
    case 'topknot': return { back: `<path d="M27 2 q3 -4 6 0 v8 h-6z" fill="${c}"/>`, front: `<path d="M19 19 q0 -11 11 -11 q11 0 11 11 q-5 -4 -11 -4 q-6 0 -11 4z" fill="${c}"/>` };
    case 'curly': return { back: [14, 20, 26, 34, 40, 46].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 12 : 16}" r="5" fill="${c}"/>`).join('') + `<circle cx="30" cy="10" r="6" fill="${c}"/>`, front: '' };
    case 'pony': return { back: `<path d="M40 18 q8 4 4 18 q-4 -6 -6 -10z" fill="${c}"/>`, front: `<path d="M19 20 q0 -12 11 -12 q11 0 11 12 q-4 -6 -11 -6 q-7 0 -11 6z" fill="${c}"/>` };
    case 'buzz': return { back: '', front: `<path d="M19.5 19 q0 -10 10.5 -10 q10.5 0 10.5 10 q-4 -4 -10.5 -4 q-6.5 0 -10.5 4z" fill="${c}" opacity=".85"/>` };
    case 'fluffy': return { back: `<path d="M16 22 q-2 -16 14 -16 q16 0 14 16 q-2 -8 -14 -8 q-12 0 -14 8z" fill="${c}"/>`, front: `<path d="M18 18 q2 -8 12 -8 q10 0 12 8 q-3 -3 -6 -1 q-3 -3 -6 0 q-3 -3 -6 0 q-3 -2 -6 1z" fill="${c}"/>` };
    default: return { back: '', front: `<path d="M19 20 q0 -12 11 -12 q11 0 11 12 q-4 -6 -11 -6 q-7 0 -11 6z" fill="${c}"/>` };
  }
}

function face(f, skin, extra = {}) {
  const eyes = {
    smile: '<circle cx="26" cy="22" r="1.4" class="ink"/><circle cx="34" cy="22" r="1.4" class="ink"/>',
    closed: '<path d="M24.5 22 q1.5 1.2 3 0" class="line"/><path d="M32.5 22 q1.5 1.2 3 0" class="line"/>',
    focus: '<circle cx="26" cy="23" r="1.3" class="ink"/><circle cx="34" cy="23" r="1.3" class="ink"/><path d="M24 19.5 h4 M32 19.5 h4" class="line"/>',
    stern: '<circle cx="26" cy="23" r="1.3" class="ink"/><circle cx="34" cy="23" r="1.3" class="ink"/><path d="M23.5 19 l4 1.5 M36.5 19 l-4 1.5" class="line"/>',
    wide: '<circle cx="26" cy="22" r="2" fill="#fff"/><circle cx="26" cy="22" r="1.2" class="ink"/><circle cx="34" cy="22" r="2" fill="#fff"/><circle cx="34" cy="22" r="1.2" class="ink"/>',
  }[f.eyes || 'smile'];
  const mouth = { smile: '<path d="M26.5 27 q3.5 3 7 0" class="line"/>', flat: '<path d="M27 28 h6" class="line"/>', o: '<circle cx="30" cy="28" r="1.5" class="ink"/>', none: '' }[f.mouth || 'smile'];
  let out = eyes + mouth;
  if (f.cheeks !== false) out += `<ellipse cx="22.5" cy="26" rx="2.2" ry="1.3" fill="#E86A8F" opacity=".25"/><ellipse cx="37.5" cy="26" rx="2.2" ry="1.3" fill="#E86A8F" opacity=".25"/>`;
  if (f.tilak === 'u') out += '<path d="M28 12 L30 18 L32 12" fill="none" stroke="#FFF3B0" stroke-width="1.2"/><circle cx="30" cy="16" r=".9" fill="#D8343A"/>';
  if (f.tilak === 'line') out += '<path d="M30 12 v5" stroke="#D8343A" stroke-width="1.4"/>';
  if (f.tilak === 'ash') out += '<path d="M25 14 h10 M25.5 16 h9" stroke="#F4F1E8" stroke-width="1"/><circle cx="30" cy="15" r=".9" fill="#D8343A"/>';
  if (f.glasses === 'round') out += '<g fill="none" stroke="#3A3F55" stroke-width="1"><circle cx="26" cy="22.5" r="3"/><circle cx="34" cy="22.5" r="3"/><path d="M29 22.5 h2"/></g>';
  if (f.glasses === 'half') out += '<g fill="none" stroke="#C9A15A" stroke-width="1"><path d="M23 23 q3 3 6 0 M31 23 q3 3 6 0"/></g>';
  if (f.glasses === 'visor') out += '<rect x="20" y="19" width="20" height="6" rx="3" fill="#5CC7F2" opacity=".75"/>';
  if (f.scar) out += '<path d="M33 13 l-2 3 l2 1 l-2 3" class="line" stroke="#C8352E"/>';
  return out;
}

function beard(b) {
  if (!b) return '';
  const c = b.color || '#F2F2F2';
  if (b.style === 'long') return `<path d="M19 24 q0 18 11 26 q11 -8 11 -26 q-3 6 -11 6 q-8 0 -11 -6z" fill="${c}"/><path d="M25 28 q5 -2 10 0" stroke="${shade(c, -0.15)}" fill="none"/>`;
  if (b.style === 'mustache') return `<path d="M24 26.5 q6 -2.5 12 0 q-6 1.5 -12 0z" fill="${c}"/>`;
  return `<path d="M20 25 q1 11 10 12 q9 -1 10 -12 q-3 4 -10 4 q-7 0 -10 -4z" fill="${c}"/>`;
}

function headwear(w) {
  if (!w) return { back: '', front: '' };
  const c = w.color || '#E8B830', g = w.gem || '#D8343A';
  switch (w.type) {
    case 'mukut': return { back: '', front: `<path d="M17 15 L19 2 L24 8 L30 -1 L36 8 L41 2 L43 15 Z" fill="${c}"/><rect x="16" y="12" width="28" height="5" rx="1.5" fill="${shade(c, -0.2)}"/><circle cx="30" cy="6" r="2.2" fill="${g}"/><circle cx="22" cy="10" r="1.2" fill="#2E9E6A"/><circle cx="38" cy="10" r="1.2" fill="#2E9E6A"/>` };
    case 'tall-mukut': return { back: '', front: `<path d="M18 15 L20 -6 Q30 -14 40 -6 L42 15 Z" fill="${c}"/><rect x="17" y="11" width="26" height="5" rx="1.5" fill="${shade(c, -0.2)}"/><path d="M21 2 H39 M21 -3 H39" stroke="${shade(c, -0.2)}" stroke-width="1.2"/><circle cx="30" cy="-9" r="2" fill="${c}"/><circle cx="30" cy="7" r="2" fill="${g}"/>` };
    case 'tiara': return { back: '', front: `<path d="M20 13 q10 -8 20 0 l-2 2 q-8 -5 -16 0z" fill="${c}"/><circle cx="30" cy="9" r="1.6" fill="${g}"/>` };
    case 'wizard': return { back: '', front: `<path d="M14 15 Q30 9 46 15 L33 -14 Q30 -16 28 -12 Z" fill="${c}"/><path d="M14 15 Q30 10 46 15 Q30 19 14 15z" fill="${shade(c, -0.25)}"/>${w.stars ? '<g fill="#FFE27A"><circle cx="27" cy="2" r="1"/><circle cx="33" cy="-4" r=".8"/><circle cx="31" cy="8" r=".8"/></g>' : ''}` };
    case 'hood': return { back: `<path d="M14 26 q-2 -22 16 -22 q18 0 16 22 v14 h-32z" fill="${c}"/>`, front: `<path d="M17 18 q2 -12 13 -12 q11 0 13 12 q-4 -6 -13 -6 q-9 0 -13 6z" fill="${shade(c, -0.15)}"/>` };
    case 'cap': return { back: '', front: `<path d="M18 15 q0 -9 12 -9 q12 0 12 9z" fill="${c}"/><path d="M30 15 h16 q-2 3 -16 2z" fill="${shade(c, -0.2)}"/>` };
    case 'helmet': return { back: `<path d="M15 24 q-1 -20 15 -20 q16 0 15 20 v6 h-30z" fill="${c}"/>`, front: `<rect x="19" y="10" width="22" height="3" rx="1.5" fill="${g}"/>` };
    case 'headband': return { back: '', front: `<rect x="18" y="12" width="24" height="3" rx="1.5" fill="${c}"/>` };
    case 'turban': return { back: '', front: `<path d="M17 16 q0 -12 13 -12 q13 0 13 12 q-13 -5 -26 0z" fill="${c}"/><circle cx="30" cy="9" r="2" fill="${g}"/>` };
    case 'sheriff': return { back: '', front: `<path d="M12 15 q18 -6 36 0 q-4 3 -7 2 q-1 -10 -11 -10 q-10 0 -11 10 q-3 1 -7 -2z" fill="${c}"/><path d="M28 9 l2 -2 l2 2 l-2 2z" fill="#E8B830"/>` };
    case 'pointy-ears': return { back: `<path d="M18 22 l-8 -6 l7 10z M42 22 l8 -6 l-7 10z" fill="${w.skin || '#8CB070'}"/>`, front: '' };
    default: return { back: '', front: '' };
  }
}

function feather(f) {
  if (!f) return '';
  return `<g class="sway"><path d="M36 6 Q38 -6 42 -14" stroke="#2E6B3A" stroke-width="1.2" fill="none"/><ellipse cx="42" cy="-16" rx="5" ry="9" fill="#1E8E5A" transform="rotate(20 42 -16)"/><ellipse cx="42" cy="-16" rx="3.4" ry="6" fill="#1DA1A0" transform="rotate(20 42 -16)"/><ellipse cx="42.5" cy="-17" rx="2.2" ry="3" fill="#1C3F9E" transform="rotate(20 42 -16)"/><circle cx="42.6" cy="-17.5" r="1" fill="#E9B23A"/></g>`;
}

function head(c) {
  const kind = c.head || 'human';
  const h = headInner(c);
  // Animals and droids can wear crowns and hats too (Hanuman, Sugriva…).
  return kind !== 'human' && c.wear ? h + headwear(c.wear).front : h;
}
function headInner(c) {
  const skin = c.skin || '#F2C9A0';
  const kind = c.head || 'human';
  if (kind === 'elephant') {
    const ear = shade(skin, 0.15), inner = '#E98A87';
    return `<g class="trunkear"><path d="M18 14 Q-2 8 -1 26 Q0 42 18 34 Z" fill="${ear}"/><path d="M16 18 Q4 15 4 26 Q5 36 16 31 Z" fill="${inner}"/><path d="M42 14 Q62 8 61 26 Q60 42 42 34 Z" fill="${ear}"/><path d="M44 18 Q56 15 56 26 Q55 36 44 31 Z" fill="${inner}"/></g>` +
      `<circle cx="30" cy="22" r="13" fill="${skin}"/>` +
      `<g class="trunk"><path d="M30 26 Q28 40 33 46 Q38 51 42 46" fill="none" stroke="${shade(skin, -0.22)}" stroke-width="9" stroke-linecap="round"/><path d="M30 26 Q28 40 33 46 Q38 51 42 46" fill="none" stroke="${shade(skin, 0.08)}" stroke-width="7" stroke-linecap="round"/><path d="M28 32 h5 M29 37 h5 M31 42 h4" stroke="${shade(skin, -0.15)}" stroke-width=".8"/></g>` +
      `<path d="M35 30 q5 2 6 -3" stroke="#FFFDF5" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M25 30 q-2 1 -2.5 -0.5" stroke="#FFFDF5" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="25" cy="21" rx="1.5" ry="1.8" class="ink"/><ellipse cx="35" cy="21" rx="1.5" ry="1.8" class="ink"/>`;
  }
  if (kind === 'monkey') {
    const fur = c.fur || '#B5733A', muzzle = c.muzzle || '#F2C9A0';
    return `<circle cx="16" cy="22" r="5" fill="${fur}"/><circle cx="44" cy="22" r="5" fill="${fur}"/><circle cx="16" cy="22" r="2.6" fill="${muzzle}"/><circle cx="44" cy="22" r="2.6" fill="${muzzle}"/>` +
      `<circle cx="30" cy="21" r="12" fill="${fur}"/><path d="M21 22 q0 -8 9 -8 q9 0 9 8 q0 10 -9 10 q-9 0 -9 -10z" fill="${muzzle}"/>` +
      `<circle cx="26" cy="20" r="1.4" class="ink"/><circle cx="34" cy="20" r="1.4" class="ink"/><path d="M26.5 27 q3.5 2.5 7 0" class="line"/><ellipse cx="30" cy="24" rx="2" ry="1" class="ink"/>`;
  }
  if (kind === 'bear') {
    const fur = c.fur || '#4A3426';
    return `<circle cx="19" cy="11" r="5" fill="${fur}"/><circle cx="41" cy="11" r="5" fill="${fur}"/><circle cx="30" cy="22" r="13" fill="${fur}"/>` +
      `<ellipse cx="30" cy="27" rx="7" ry="5.5" fill="#C9A27A"/><ellipse cx="30" cy="25" rx="2.4" ry="1.6" class="ink"/><circle cx="25" cy="20" r="1.4" class="ink"/><circle cx="35" cy="20" r="1.4" class="ink"/>`;
  }
  if (kind === 'bird') {
    const feathers = c.fur || '#5A4A3A';
    return `<circle cx="30" cy="22" r="12" fill="${feathers}"/>${c.bald ? '<circle cx="30" cy="18" r="8" fill="#E8A27A"/>' : ''}` +
      `<circle cx="25" cy="19" r="4" fill="#fff"/><circle cx="35" cy="19" r="4" fill="#fff"/><circle cx="25" cy="19" r="2" class="ink"/><circle cx="35" cy="19" r="2" class="ink"/>` +
      `<path d="M27 24 l3 6 l3 -6z" fill="#E8B830"/>${c.tufts ? `<path d="M19 12 l-3 -8 l7 5z M41 12 l3 -8 l-7 5z" fill="${feathers}"/>` : ''}`;
  }
  if (kind === 'dome') {
    return `<path d="M17 24 q0 -14 13 -14 q13 0 13 14z" fill="${c.color || '#C7CCD8'}"/><rect x="22" y="14" width="6" height="4" rx="1" fill="#3B6FD8"/><circle cx="33" cy="17" r="3" class="ink"/><circle class="spark" cx="33" cy="17" r="1.2" fill="#F2545B"/>`;
  }
  if (kind === 'gold') {
    const g = c.color || '#D4A84A';
    return `<rect x="26" y="31" width="8" height="8" fill="${shade(g, -0.2)}"/><ellipse cx="30" cy="21" rx="11" ry="12" fill="${g}"/><circle class="glow" cx="25.5" cy="21" r="2.6" fill="#FFE27A"/><circle class="glow" cx="34.5" cy="21" r="2.6" fill="#FFE27A"/><rect x="26" y="27" width="8" height="1.6" rx=".8" fill="${shade(g, -0.35)}"/>`;
  }
  if (kind === 'hat-only') {
    // A talking hat (no person).
    const hc = c.color || '#6B4A33';
    return `<path d="M8 46 Q30 36 52 46 Q30 56 8 46z" fill="${shade(hc, -0.15)}"/><path d="M14 44 Q30 40 46 44 L36 6 Q32 -2 26 10 Q20 22 14 44z" fill="${hc}"/><path d="M22 30 q4 -2 6 0 M32 28 q4 -2 6 0" class="line"/><path d="M24 38 q6 4 12 0" class="line"/>`;
  }
  // human
  const h = hair(c.hair, skin), w = headwear(c.wear);
  return w.back + h.back + `<rect x="26" y="30" width="8" height="9" fill="${shade(skin, -0.08)}"/><circle cx="30" cy="22" r="11" fill="${skin}"/>` +
    h.front + beard(c.beard) + face(c.face || {}, skin) + w.front + feather(c.feather) +
    (c.earrings ? `<circle cx="19" cy="27" r="1.6" fill="${c.earrings}"/><circle cx="41" cy="27" r="1.6" fill="${c.earrings}"/>` : '');
}

// ---------- the whole character ----------
function bubble(kind) {
  if (!kind) return '';
  const b = { waiting: ['#F29E1F', '!'], asking: ['#3B6FD8', '?'], done: ['#fff', '✓'] }[kind];
  if (!b) return '';
  const [fill, ch] = b;
  return `<g class="pop"><rect x="40" y="-2" width="18" height="14" rx="5" fill="${fill}" stroke="#1E2235" stroke-width="1"/><text x="49" y="9" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="10" fill="${fill === '#fff' ? '#23845A' : '#fff'}">${ch}</text></g>`;
}

function character(c) {
  const skin = c.skin || '#F2C9A0';
  const o = c.outfit || {};
  let body;
  if (c.head === 'dome') {
    body = `<rect x="16" y="24" width="28" height="56" rx="6" fill="${c.color || '#F4F1E8'}"/><rect x="21" y="34" width="18" height="10" rx="2" fill="#3B6FD8"/><rect x="21" y="48" width="8" height="5" rx="1" fill="#3B6FD8"/><circle class="spark" cx="35" cy="51" r="1.4" fill="#5CC793"/><rect x="10" y="40" width="6" height="30" rx="2" fill="#C7CCD8"/><rect x="44" y="40" width="6" height="30" rx="2" fill="#C7CCD8"/>`;
  } else if (c.head === 'hat-only') {
    body = '';
  } else {
    body = torso(o, c.head === 'human' || !c.head ? skin : c.bodySkin || c.fur || skin) + (c.necklace ? `<path d="M22 40 q8 10 16 0" fill="none" stroke="${c.necklace}" stroke-width="2.2"/>` : '') +
      (c.thread ? '<path d="M18 42 Q30 56 44 70" stroke="#FFF7E8" stroke-width="1.2" fill="none"/>' : '');
  }
  const front = c.head === 'dome' || c.head === 'hat-only' ? '' : arms(c.pose || 'down', o, c.head && c.head !== 'human' ? (c.handSkin || c.fur || skin) : skin);
  const p = prop(c.prop);
  const behindProps = c.prop && ['bow', 'staff', 'arrows', 'lights', 'bike'].includes(c.prop.type);
  const sleep = c.sleep ? '<g class="zz" fill="#3B5FAF" font-family="Arial,sans-serif" font-weight="700"><text x="44" y="10" font-size="8">z</text><text x="48" y="6" font-size="6">z</text></g>' : '';
  const think = c.think ? '<g class="dots"><circle cx="44" cy="6" r="1.6" fill="#3B5FAF"/><circle cx="49" cy="4" r="1.9" fill="#3B5FAF"/><circle cx="54" cy="2" r="2.2" fill="#3B5FAF"/></g>' : '';
  const inner = `${behindProps ? p : ''}<g class="bob">${body}${head(c)}${front}${behindProps ? '' : p}</g>${sleep}${think}${bubble(c.bubble)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -16 60 96"><title>${esc(c.title || '')}</title><style>${STYLE}</style>${inner}</svg>\n`;
}

module.exports = { character, shade, esc };

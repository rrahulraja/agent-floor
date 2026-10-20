'use strict';
// Ramayana: a forest ashram at Panchavati, with the sea and Rama Setu through the trees.

const GOLD = '#E8B830', SAFFRON = '#E07B2A', RED = '#C8352E', RAMA = '#3E6FB8';

module.exports = {
  id: 'ramayana',
  name: 'Ramayana',
  description: 'A forest ashram by the sea. Valmiki writes, Rama runs commands, Lakshmana tests, Nala builds the bridge, Hanuman deploys, Kumbhakarna sleeps.',
  defaultRole: 'thinking',
  header: { title: 'Panchavati', font: 'tiro-sanskrit', clockFont: 'cinzel', colors: { bar: '#1F3A24', ink: '#F2E8C9', accent: '#E8B830', muted: '#B8C9A0' }, phases: { dawn: 'Brahma muhurta', morning: 'Pratah', afternoon: 'Madhyahna', evening: 'Sandhya', night: 'Ratri' } },
  cast: {
    planning: { name: 'Vasishtha', label: 'Vasishtha · Planning', skin: '#D9A27A', hair: { style: 'topknot', color: '#EDEDED' }, beard: { style: 'long', color: '#EDEDED' },
      face: { eyes: 'closed', tilak: 'ash' }, outfit: { style: 'robe', color: '#F2C27A', accent: '#C98F3A' }, pose: 'staff', prop: { type: 'staff', color: '#7A4A26' } },
    writing: { name: 'Valmiki', skin: '#B0794E', hair: { style: 'topknot', color: '#DADADA' }, beard: { style: 'long', color: '#DADADA' },
      face: { eyes: 'focus', tilak: 'ash' }, outfit: { style: 'robe', color: '#F4E7C8', accent: '#D9C48F' }, pose: 'typing', prop: { type: 'quill' } },
    reading: { name: 'Vibhishana', label: "Vibhishana · Reading Lanka's secrets", skin: '#7A6A8E', hair: { style: 'short', color: '#1E1A2A' }, beard: { style: 'short', color: '#1E1A2A' },
      wear: { type: 'mukut', color: GOLD, gem: '#5CC793' }, face: { eyes: 'focus' }, outfit: { style: 'robe', color: '#3C3F72', accent: GOLD }, pose: 'hold', prop: { type: 'book', color: '#3C3F72' } },
    running: { name: 'Rama', skin: RAMA, hair: { style: 'long', color: '#14182A' }, wear: { type: 'mukut', color: GOLD, gem: RED },
      face: { eyes: 'focus', tilak: 'u' }, outfit: { style: 'shawl', color: '#F2B825', accent: SAFFRON }, necklace: '#E84A5F', pose: 'bow', prop: { type: 'bow' } },
    tests: { name: 'Lakshmana', label: 'Lakshmana · Drawing the line (tests)', skin: '#E8B48A', hair: { style: 'long', color: '#2B1D14' }, wear: { type: 'mukut', color: GOLD, gem: '#2E9E6A' },
      face: { eyes: 'stern', tilak: 'u' }, outfit: { style: 'armor', color: '#F2B825', accent: '#C8352E' }, pose: 'chin', prop: { type: 'arrows' } },
    build: { name: 'Nala', label: 'Nala · Building the bridge', head: 'monkey', fur: '#8A6A4E', muzzle: '#E8CFA8', outfit: { style: 'bare', color: '#5A6B7D', accent: GOLD }, pose: 'staff', prop: { type: 'hammer', color: '#8A90A6' } },
    deploy: { name: 'Hanuman', label: 'Hanuman · Leaping to Lanka (deploy)', head: 'monkey', fur: '#C46A2A', muzzle: '#F4C99A', wear: { type: 'mukut', color: GOLD, gem: RED },
      outfit: { style: 'bare', color: RED, accent: GOLD }, pose: 'staff', prop: { type: 'mace', color: GOLD } },
    data: { name: 'Jambavan', label: 'Jambavan · Remembering everything (data)', head: 'bear', fur: '#4A3426', outfit: { style: 'robe', color: '#8B5A2B', accent: '#5E3A1A' }, pose: 'hold', prop: { type: 'crystal', color: '#9FC8F2' } },
    review: { name: 'Vishwamitra', skin: '#C98F62', hair: { style: 'topknot', color: '#BDBDBD' }, beard: { style: 'long', color: '#BDBDBD' },
      face: { eyes: 'stern', tilak: 'ash' }, outfit: { style: 'robe', color: SAFFRON, accent: '#B85A1A' }, pose: 'hold', prop: { type: 'scroll' } },
    git: { name: 'Angada', label: 'Angada · Standing firm (git)', head: 'monkey', fur: '#A85A2A', muzzle: '#F0C69A', wear: { type: 'tiara', color: GOLD, gem: '#3B6FD8' },
      outfit: { style: 'bare', color: '#3B6FD8', accent: GOLD }, pose: 'hold', prop: { type: 'compass' } },
    delegating: { name: 'Sugriva', label: 'Sugriva · Sending out search parties', head: 'monkey', fur: '#9A6A3A', muzzle: '#EFD2A8', wear: { type: 'mukut', color: GOLD, gem: '#2E9E6A' },
      outfit: { style: 'shawl', color: '#2E9E6A', accent: GOLD }, pose: 'hold', prop: { type: 'scroll' } },
    browsing: { name: 'Sampati', label: 'Sampati · Seeing far', head: 'bird', fur: '#6B5A4A', bald: true, outfit: { style: 'cloak', color: '#5A4A3A', accent: '#3E3226' }, pose: 'down' },
    thinking: { name: 'Bharata', label: 'Bharata · Thinking', skin: '#E2B38E', hair: { style: 'long', color: '#2B1D14' }, face: { eyes: 'closed', tilak: 'u' },
      outfit: { style: 'robe', color: '#E9D7A5', accent: '#B89A5A' }, pose: 'hold', prop: { type: 'sandals' }, think: true },
    waiting: { name: 'Shabari', label: 'Shabari · Waiting for you', skin: '#8E5A3A', hair: { style: 'bun', color: '#E0E0E0' }, face: { eyes: 'smile' },
      outfit: { style: 'robe', color: '#C98F3A', accent: '#8E5A1A' }, pose: 'raise', bubble: 'waiting' },
    asking: { name: 'Sita', label: 'Sita · Has a question', skin: '#E8B48A', hair: { style: 'long', color: '#2B1D14' }, wear: { type: 'tiara', color: GOLD, gem: RED },
      face: { eyes: 'smile', tilak: 'line' }, earrings: GOLD, outfit: { style: 'shawl', color: '#E8A2B8', accent: RED }, pose: 'raise', bubble: 'asking' },
    idle: { name: 'Kumbhakarna', label: 'Kumbhakarna · Asleep', skin: '#6E7A5A', hair: { style: 'fluffy', color: '#1E1A14' }, beard: { style: 'mustache', color: '#1E1A14' },
      face: { eyes: 'closed', mouth: 'o' }, outfit: { style: 'bare', color: '#5B4A86', accent: GOLD }, pose: 'down', sleep: true },
    done: { name: 'Rama', label: 'Rama · Home to Ayodhya (done)', skin: RAMA, hair: { style: 'long', color: '#14182A' }, wear: { type: 'mukut', color: GOLD, gem: RED },
      face: { eyes: 'smile', tilak: 'u' }, outfit: { style: 'shawl', color: '#F2B825', accent: SAFFRON }, necklace: '#E84A5F', pose: 'hold', prop: { type: 'thali' }, bubble: 'done' },
    helper: { name: 'Vanara', head: 'monkey', fur: '#B5733A', muzzle: '#F2C9A0', outfit: { style: 'bare', color: '#2E9E6A', accent: GOLD } },
  },
  room: { wall: 'wall.svg', floor: 'floor.svg', desk: 'desk.svg', lounge: 'lounge.svg', wallColor: '#4E7A4A', floorColor: '#C9A86A' },
  room3d: { floor: { color: '#C9A86A', alt: '#B8955A' }, wall: { color: '#4E7A4A' }, desk: { top: '#8B6A3E', body: '#6B4E2E', leg: '#5A3E22', item: 'diya', screen: '#FFB347' }, lounge: { kind: 'hut', color: '#D9B97A', accent: '#B8955A' } },
  celebration: { push: 'leap.svg', pr: 'diya.svg' },
  files: {
    'wall.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 58"><style>.w{animation:w 3s ease-in-out infinite alternate}.w2{animation-duration:2.1s;animation-direction:alternate-reverse}@keyframes w{to{transform:translateX(4px)}}.bd{animation:bd 14s linear infinite}@keyframes bd{from{transform:translateX(-20px)}to{transform:translateX(140px)}}.bd path{animation:fl .5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}@keyframes fl{to{transform:scaleY(-.6)}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect width="120" height="58" fill="#9FD3E8"/><rect y="26" width="120" height="14" fill="#3E8AB8"/><g class="w" stroke="#9FD3E8" stroke-width=".8"><path d="M6 31 q3 -2 6 0 M40 35 q3 -2 6 0 M78 30 q3 -2 6 0"/></g><g class="w w2" stroke="#7FBEDC" stroke-width=".7" fill="none"><path d="M22 37 q3 -2 6 0 M58 29 q3 -2 6 0 M96 37 q3 -2 6 0 M110 30 q3 -2 6 0"/></g><g class="bd" fill="none" stroke="#3A4A5A" stroke-width=".7"><path d="M0 10 q2 -2 4 0 q2 -2 4 0"/><path style="animation-delay:-.25s" d="M8 15 q1.5 -1.5 3 0 q1.5 -1.5 3 0"/></g>
<path d="M30 34 h60" stroke="#8A6A4E" stroke-width="3"/><g fill="#7A5A3E"><circle cx="38" cy="34" r="2"/><circle cx="50" cy="34" r="2"/><circle cx="62" cy="34" r="2"/><circle cx="74" cy="34" r="2"/><circle cx="86" cy="34" r="2"/></g>
<rect y="40" width="120" height="18" fill="#4E7A4A"/><g fill="#3E6A3A"><circle cx="8" cy="16" r="12"/><circle cx="112" cy="14" r="13"/><rect x="5" y="20" width="5" height="22" fill="#6B4A33"/><rect x="109" y="20" width="5" height="22" fill="#6B4A33"/></g>
<path d="M0 50 h120" stroke="#3E6A3A" stroke-width="4"/><g fill="#F29EB8"><circle cx="30" cy="46" r="1.6"/><circle cx="56" cy="47" r="1.6"/><circle cx="96" cy="46" r="1.6"/></g></svg>`,
    'floor.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#C9A86A"/><path d="M0 6 h24 M0 18 h24" stroke="#B8955A" stroke-width=".8"/><circle cx="6" cy="12" r=".8" fill="#A8854A"/><circle cx="18" cy="2" r=".8" fill="#A8854A"/></svg>`,
    'desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><style>.fl{animation:f .4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}@keyframes f{to{transform:scale(.85,1.15)}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<path d="M6 16 q8 -10 18 0z" fill="#3E8A5A"/><path d="M14 16 v-8" stroke="#2E6B3A"/><path d="M46 13 q5 3 10 0 l-1.5 3 h-7z" fill="#B0603A"/><path class="fl" d="M51 12 q-2.5 -4 0 -7 q2.5 3 0 7z" fill="#FFB347"/>
<rect x="0" y="16" width="64" height="5" rx="2" fill="#8B6A3E"/><rect x="2" y="21" width="60" height="11" fill="#6B4E2E"/><path d="M4 24 h56 M4 28 h56" stroke="#5A3E22" stroke-width=".8"/>
<rect x="5" y="32" width="5" height="8" fill="#5A3E22"/><rect x="54" y="32" width="5" height="8" fill="#5A3E22"/></svg>`,
    'lounge.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 60"><style>.lf{animation:lf .4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}@keyframes lf{to{transform:scale(.8,1.18)}}.lg{animation:lg 1.6s ease-in-out infinite}@keyframes lg{50%{opacity:.18}}.sm path{animation:sm 3s ease-out infinite;opacity:0}.sm path:nth-child(2){animation-delay:1.5s}@keyframes sm{20%{opacity:.8}100%{opacity:0;transform:translate(3px,-8px)}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style><path d="M4 22 L44 2 L84 22 Z" fill="#B8955A"/><path d="M4 22 L44 2 L84 22" fill="none" stroke="#8A6A3E" stroke-width="2"/>
<rect x="10" y="22" width="68" height="34" fill="#D9B97A"/><rect x="34" y="32" width="20" height="24" fill="#6B4A33"/><ellipse class="lg" cx="44" cy="48" rx="8" ry="7" fill="#FFB347" opacity=".35"/><path d="M40 52 q4 3 8 0 l-1 2 h-6z" fill="#B0603A"/><path class="lf" d="M44 51.6 q-1.8 -3 0 -5.5 q1.8 2.5 0 5.5z" fill="#FFD27A"/><g class="sm" fill="none" stroke="#E8E2D6" stroke-width="1.2" stroke-linecap="round"><path d="M58 6 q-2 -3 0 -6"/><path d="M60 6 q2 -3 0 -6"/></g><rect x="0" y="54" width="88" height="6" rx="2" fill="#8A6A3E"/><g fill="#3E8A5A"><circle cx="6" cy="46" r="6"/><circle cx="82" cy="46" r="6"/></g></svg>`,
    'leap.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M2 28 Q14 2 30 8" fill="none" stroke="#F2B825" stroke-width="2" stroke-dasharray="3 2"/><circle cx="27" cy="9" r="5" fill="#C46A2A"/><circle cx="27" cy="9.5" r="3" fill="#F4C99A"/><path d="M22 12 q-4 2 -6 6" stroke="#C46A2A" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`,
    'diya.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.f{animation:f .35s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}@keyframes f{to{transform:scale(.8,1.15)}}</style><g transform="translate(0 2)"><path d="M6 20 q10 8 20 0 l-3 5 h-14z" fill="#B0603A"/><path class="f" d="M16 18 q-4 -6 0 -12 q4 6 0 12z" fill="#FFB347"/></g><g transform="translate(-8 8) scale(.6)"><path d="M6 20 q10 8 20 0 l-3 5 h-14z" fill="#B0603A"/><path class="f" d="M16 18 q-4 -6 0 -12 q4 6 0 12z" fill="#FFB347"/></g><g transform="translate(20 8) scale(.6)"><path d="M6 20 q10 8 20 0 l-3 5 h-14z" fill="#B0603A"/><path class="f" d="M16 18 q-4 -6 0 -12 q4 6 0 12z" fill="#FFB347"/></g></svg>`,
  },
};

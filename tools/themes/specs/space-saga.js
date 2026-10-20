'use strict';
// Space saga: a rebel base hangar with starfighters through the viewport. Original characters (inspired, not copied).

const ORANGE = '#E0702A', WHITE = '#EDEFF5';

module.exports = {
  id: 'space-saga',
  name: 'Space saga',
  description: 'A starship hangar. The Admiral plans, the Robot writes, the Mechanic builds, the Starfighter launches your deploys. Original characters.',
  defaultRole: 'thinking',
  header: { title: 'Hangar Bay', font: 'orbitron', clockFont: 'orbitron', clock: 'digital', era: 'stardate', colors: { bar: '#0C1024', ink: '#D8E4FF', accent: '#5CC7F2', muted: '#8A9AC0' }, phases: { dawn: 'Dawn cycle', morning: 'Day cycle', afternoon: 'Day cycle', evening: 'Dusk cycle', night: 'Night cycle' } },
  cast: {
    planning: { name: 'The Admiral', skin: '#8E5A3A', hair: { style: 'buzz', color: '#BDBDBD' }, face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#2F4F6E', accent: '#1E3550', inner: '#C7CCD8' }, necklace: '#E8B830', pose: 'hold', prop: { type: 'holo' } },
    writing: { name: 'Robot clerk', label: 'Robot clerk · Writing code', head: 'gold', color: '#8FB8B0', outfit: { style: 'armor', color: '#8FB8B0', accent: '#5A8A80' }, handSkin: '#8FB8B0', pose: 'typing', prop: { type: 'laptop', color: '#8A90A6' } },
    reading: { name: 'The Archivist', skin: '#C98F62', hair: { style: 'buzz', color: '#1B1B1B' }, face: { eyes: 'focus' }, outfit: { style: 'robe', color: '#5A6B7D', accent: '#3A4A5A' }, pose: 'hold', prop: { type: 'holo' } },
    running: { name: 'Hotshot pilot', label: 'Pilot · Running', skin: '#E2B38E', hair: { style: 'short', color: '#6B3E1F' }, wear: { type: 'helmet', color: ORANGE, gem: '#F4F1E8' }, face: { eyes: 'smile' }, outfit: { style: 'armor', color: ORANGE, accent: '#F4F1E8' }, pose: 'typing', prop: { type: 'joystick' } },
    tests: { name: 'Test bot', label: 'Test bot · Testing', head: 'dome', color: '#5A6B7D' },
    build: { name: 'The Mechanic', skin: '#D9A27A', hair: { style: 'bun', color: '#2B1D14' }, face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#6B7A5A', accent: '#4A5A3A', inner: '#E8E0C8' }, pose: 'staff', prop: { type: 'wrench' } },
    deploy: { name: 'Starfighter launch', label: 'Starfighter · Launching (deploy)', skin: '#E2B38E', hair: { style: 'short', color: '#2B1D14' }, wear: { type: 'helmet', color: WHITE, gem: '#C8352E' }, face: { eyes: 'focus', glasses: 'visor' }, outfit: { style: 'armor', color: ORANGE, accent: WHITE }, pose: 'typing', prop: { type: 'joystick' } },
    data: { name: 'Data bot', label: 'Data bot · Plugged into the data port', head: 'dome', color: '#E07B2A' },
    review: { name: 'The Inspector', label: 'Inspector · Reviewing', skin: '#E0C8A8', hair: { style: 'short', color: '#D0D0D0' }, beard: { style: 'short', color: '#D0D0D0' }, wear: { type: 'headband', color: '#5CC7F2' }, face: { eyes: 'closed' }, outfit: { style: 'jacket', color: '#5A6B7D', accent: '#3A4A5A', inner: '#E8E0C8' }, pose: 'hold', prop: { type: 'holo' } },
    git: { name: 'The Navigator', label: 'Navigator · Plotting the route (git)', skin: '#8E5A3A', hair: { style: 'buzz', color: '#1B1B1B' }, face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#2F4F6E', accent: '#1E3550', inner: '#C7CCD8' }, pose: 'hold', prop: { type: 'map' } },
    delegating: { name: 'Squadron leader', label: 'Squadron leader · Handing off', skin: '#C98F62', hair: { style: 'short', color: '#1B1B1B' }, beard: { style: 'short', color: '#1B1B1B' }, face: { eyes: 'smile' }, outfit: { style: 'armor', color: ORANGE, accent: WHITE }, pose: 'hold', prop: { type: 'walkie' } },
    browsing: { name: 'The Scout', label: 'Scout · Scanning', skin: '#E8B48A', hair: { style: 'pony', color: '#2B1D14' }, wear: { type: 'headband', color: '#5A6B7D' }, face: { eyes: 'wide', glasses: 'visor' }, outfit: { style: 'tunic', color: '#6B7A5A', accent: '#4A5A3A' }, pose: 'hold', prop: { type: 'holo' } },
    thinking: { name: 'Ship AI', label: 'Ship AI · Thinking', skin: '#B8A2E8', hair: { style: 'none' }, face: { eyes: 'closed', cheeks: false }, outfit: { style: 'robe', color: '#7A62B8', accent: '#5A4298' }, pose: 'chin', think: true },
    waiting: { name: 'Hologram call', label: 'Incoming hologram · Needs you', skin: '#8FD3F2', hair: { style: 'bun', color: '#5CA8D2' }, face: { eyes: 'smile', cheeks: false }, outfit: { style: 'robe', color: '#8FD3F2', accent: '#5CA8D2' }, pose: 'raise', bubble: 'waiting' },
    asking: { name: 'Data bot', label: 'Data bot · Beeping a question', head: 'dome', color: '#E07B2A', bubble: 'asking' },
    idle: { name: 'Galley break', label: 'Galley break', head: 'human', skin: '#C27A92', hair: { style: 'fluffy', color: '#5A2A4A' }, face: { eyes: 'closed' }, outfit: { style: 'jacket', color: '#6B4A33', accent: '#4A3020', inner: '#E8E0C8' }, pose: 'mug', sleep: true },
    done: { name: 'Medal ceremony', label: 'Medal ceremony · Done', skin: '#E8B48A', hair: { style: 'short', color: '#C9A15A' }, face: { eyes: 'smile' }, outfit: { style: 'jacket', color: '#F4F1E8', accent: '#C7CCD8', inner: '#E8E0C8' }, pose: 'hold', prop: { type: 'medal' }, bubble: 'done' },
    helper: { name: 'Little bot', head: 'dome', color: '#8FB8B0' },
  },
  room: { wall: 'wall.svg', floor: 'floor.svg', desk: 'desk.svg', lounge: 'lounge.svg', wallColor: '#2A2F45', floorColor: '#5A5F70' },
  celebration: { push: 'jump.svg', pr: 'medal.svg' },
  size: { helper: 12 },
  files: {
    'wall.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 58"><style>.s{animation:s 2s linear infinite}@keyframes s{to{transform:translateX(-12px)}}.b{animation:b 1.4s steps(2) infinite}@keyframes b{50%{opacity:.3}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect width="120" height="58" fill="#3A3F55"/><rect x="10" y="6" width="100" height="36" rx="10" fill="#0C1024"/><clipPath id="v"><rect x="12" y="8" width="96" height="32" rx="9"/></clipPath>
<g clip-path="url(#v)"><g class="s" fill="#E8EBFF"><circle cx="20" cy="14" r=".7"/><circle cx="34" cy="30" r=".6"/><circle cx="50" cy="12" r=".8"/><circle cx="64" cy="26" r=".6"/><circle cx="80" cy="16" r=".7"/><circle cx="96" cy="32" r=".6"/><circle cx="108" cy="12" r=".7"/><circle cx="118" cy="24" r=".6"/></g>
<circle cx="88" cy="22" r="9" fill="#C9608A"/><path d="M78 24 q10 -5 20 0" stroke="#F2945A" stroke-width="1.2" fill="none"/><path d="M30 26 l10 -4 l10 4 l-10 3z" fill="#C7CCD8"/><path d="M38 22 h4 v-3 h-4z" fill="#C7CCD8"/></g>
<g fill="#5A5F70"><rect x="0" y="44" width="120" height="14"/></g><g class="b" fill="#F2545B"><circle cx="6" cy="20" r="1.4"/><circle cx="114" cy="20" r="1.4"/></g><path d="M0 46 h120" stroke="#F2B825" stroke-width="1.2" stroke-dasharray="6 4"/></svg>`,
    'floor.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#5A5F70"/><rect x=".5" y=".5" width="23" height="23" fill="none" stroke="#4A4F60"/><circle cx="3" cy="3" r=".8" fill="#7A7F90"/><circle cx="21" cy="21" r=".8" fill="#7A7F90"/></svg>`,
    'desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><style>.b{animation:b 1.1s steps(2) infinite}@keyframes b{50%{opacity:.3}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect x="18" y="2" width="28" height="14" rx="2" fill="#2A2F45"/><rect x="20" y="4" width="24" height="10" fill="#0C3A4A"/><path d="M22 11 l5 -4 l4 3 l5 -5 l6 4" stroke="#5CC7F2" fill="none" stroke-width=".8"/>
<rect x="0" y="16" width="64" height="5" rx="2" fill="#9AA0B5"/><rect x="2" y="21" width="60" height="11" fill="#6E7385"/><g class="b"><circle cx="8" cy="26" r="1.2" fill="#5CC793"/><circle cx="12" cy="26" r="1.2" fill="#F2B825"/></g><rect x="5" y="32" width="5" height="8" fill="#4A4F60"/><rect x="54" y="32" width="5" height="8" fill="#4A4F60"/></svg>`,
    'lounge.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 60"><rect x="0" y="30" width="88" height="30" rx="6" fill="#6E5A4A"/><rect x="6" y="24" width="76" height="12" rx="6" fill="#8A6A4E"/><rect x="34" y="4" width="20" height="22" rx="3" fill="#2A2F45"/><circle cx="44" cy="14" r="5" fill="#F2945A"/><rect x="60" y="40" width="16" height="10" rx="2" fill="#3A3F55"/><circle cx="64" cy="44" r="1.5" fill="#5CC7F2"/><circle cx="70" cy="44" r="1.5" fill="#F2545B"/></svg>`,
    'jump.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g stroke="#E8EBFF" stroke-width="1.2" stroke-linecap="round"><path d="M2 8 h10 M2 16 h14 M2 24 h10 M6 12 h8 M6 20 h8"/></g><path d="M18 16 l10 -5 l2 5 l-2 5z" fill="#C7CCD8"/><path d="M18 16 l-3 -3 v6z" fill="#5CC7F2"/></svg>`,
    'medal.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M10 2 l6 12 l6 -12" fill="#3B6FD8"/><circle cx="16" cy="20" r="8" fill="#E8B830"/><circle cx="16" cy="20" r="5" fill="#F2D06A"/><path d="M16 16 l1.2 2.6 l2.8 .3 l-2.1 1.9 l.6 2.8 l-2.5 -1.4 l-2.5 1.4 l.6 -2.8 l-2.1 -1.9 l2.8 -.3z" fill="#B8862A"/></svg>`,
  },
};

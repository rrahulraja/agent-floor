'use strict';
// Small town, 1980s: a basement HQ with bikes, walkie-talkies and something strange in the woods. Original characters.

module.exports = {
  id: 'small-town-80s',
  name: 'Small town, 1980s',
  description: 'A basement HQ in a small town. The Game master plans, the Science teacher tests, the Ham-radio kid builds, the Chief reviews.',
  defaultRole: 'thinking',
  header: { title: 'HQ', font: 'vt323', clockFont: 'vt323', clock: 'lcd', colors: { bar: '#2A1E14', ink: '#F2E6C8', accent: '#F2545B', muted: '#C9B08A' } },
  cast: {
    planning: { name: 'The Game master', label: 'Game master · Planning the campaign', skin: '#E2B38E', hair: { style: 'fluffy', color: '#2B1D14' }, face: { eyes: 'focus' }, outfit: { style: 'tunic', color: '#3B6FD8', accent: '#F2B825' }, pose: 'hold', prop: { type: 'dice' } },
    writing: { name: 'The Note-taker', skin: '#C98F62', hair: { style: 'curly', color: '#1B1B1B' }, face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#C8352E', accent: '#8E2020', inner: '#F2B825' }, pose: 'typing', prop: { type: 'quill' } },
    reading: { name: 'The Librarian', skin: '#F2C9A0', hair: { style: 'bun', color: '#8C4A2A' }, face: { eyes: 'focus', glasses: 'round' }, outfit: { style: 'jacket', color: '#7A5A8E', accent: '#5A3E6E', inner: '#F4E7C8' }, pose: 'hold', prop: { type: 'book', color: '#2E9E6A' } },
    running: { name: 'The Rider', label: 'Bike kid · Running', skin: '#F2C9A0', hair: { style: 'short', color: '#C9A15A' }, wear: { type: 'cap', color: '#2E9E6A' }, face: { eyes: 'smile' }, outfit: { style: 'tunic', color: '#F2B825', accent: '#C8352E' }, pose: 'down', prop: { type: 'bike' } },
    tests: { name: 'Science teacher', label: 'Science teacher · Testing', skin: '#F0C8A6', hair: { style: 'short', color: '#6B3E1F' }, beard: { style: 'short', color: '#6B3E1F' }, face: { eyes: 'focus', glasses: 'round' }, outfit: { style: 'jacket', color: '#F4F1E8', accent: '#C7CCD8', inner: '#3B6FD8' }, pose: 'hold', prop: { type: 'flask', color: '#5CC793' } },
    build: { name: 'Ham-radio kid', label: 'Ham-radio kid · Building the antenna', skin: '#8E5A3A', hair: { style: 'buzz', color: '#1B1B1B' }, face: { eyes: 'focus' }, outfit: { style: 'tunic', color: '#E07B2A', accent: '#8E4A1A' }, pose: 'staff', prop: { type: 'wrench' } },
    deploy: { name: 'The Bike gang', label: 'Bike gang · Riding out (deploy)', skin: '#E8B48A', hair: { style: 'fluffy', color: '#6B3E1F' }, face: { eyes: 'wide' }, outfit: { style: 'jacket', color: '#3B6FD8', accent: '#2A4E9E', inner: '#F4F1E8' }, pose: 'down', prop: { type: 'bike' } },
    data: { name: 'Arcade whiz', label: 'Arcade whiz · Crunching data', skin: '#F2C9A0', hair: { style: 'curly', color: '#C9541E' }, face: { eyes: 'focus' }, outfit: { style: 'tunic', color: '#9B4DCA', accent: '#F2545B' }, pose: 'typing', prop: { type: 'joystick' } },
    review: { name: 'The Chief', label: 'Police chief · Reviewing', skin: '#E2B38E', hair: { style: 'short', color: '#6B4A33' }, beard: { style: 'short', color: '#6B4A33' }, wear: { type: 'sheriff', color: '#8A6A4E' }, face: { eyes: 'stern' }, outfit: { style: 'jacket', color: '#C9B08A', accent: '#8A6A4E', inner: '#E8E0C8' }, pose: 'chin' },
    git: { name: 'The Trail-finder', label: 'Trail-finder · Mapping the paths (git)', skin: '#C98F62', hair: { style: 'short', color: '#1B1B1B' }, wear: { type: 'headband', color: '#C8352E' }, face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#6B7A5A', accent: '#4A5A3A', inner: '#E8E0C8' }, pose: 'hold', prop: { type: 'compass' } },
    delegating: { name: 'Party leader', label: 'Party leader · Handing out tasks', skin: '#F2C9A0', hair: { style: 'fluffy', color: '#1B1B1B' }, face: { eyes: 'smile' }, outfit: { style: 'tunic', color: '#2A4E9E', accent: '#F2B825' }, pose: 'hold', prop: { type: 'walkie' } },
    browsing: { name: 'Radio operator', label: 'Radio operator · Scanning', skin: '#E8B48A', hair: { style: 'pony', color: '#E8D8A8' }, face: { eyes: 'wide' }, outfit: { style: 'jacket', color: '#F2545B', accent: '#B83A3F', inner: '#F4F1E8' }, pose: 'hold', prop: { type: 'walkie' } },
    thinking: { name: 'The Wall of lights', label: 'Talking to the lights · Thinking', skin: '#F2C9A0', hair: { style: 'long', color: '#6B3E1F' }, face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#8A6A4E', accent: '#6A4A2E', inner: '#E8A2B8' }, pose: 'chin', prop: { type: 'lights' }, think: true },
    waiting: { name: 'Walkie check', label: 'Walkie check · Needs you, over', skin: '#C98F62', hair: { style: 'curly', color: '#1B1B1B' }, face: { eyes: 'smile' }, outfit: { style: 'tunic', color: '#F2B825', accent: '#C8352E' }, pose: 'raise', prop: { type: 'walkie' }, bubble: 'waiting' },
    asking: { name: 'The Curious kid', label: 'Curious kid · Has a question', skin: '#F2D7BE', hair: { style: 'buzz', color: '#8C5A2A' }, face: { eyes: 'wide' }, outfit: { style: 'jacket', color: '#E8A2B8', accent: '#C27A92', inner: '#F4F1E8' }, pose: 'raise', bubble: 'asking' },
    idle: { name: 'Basement couch', label: 'Basement couch · Resting', skin: '#E8B48A', hair: { style: 'fluffy', color: '#C9A15A' }, face: { eyes: 'closed' }, outfit: { style: 'tunic', color: '#2E9E6A', accent: '#1F7A50' }, pose: 'mug', sleep: true },
    done: { name: 'The Party', label: 'Quest complete · Done', skin: '#E2B38E', hair: { style: 'fluffy', color: '#2B1D14' }, face: { eyes: 'smile' }, outfit: { style: 'tunic', color: '#3B6FD8', accent: '#F2B825' }, pose: 'hold', prop: { type: 'cards' }, bubble: 'done' },
    helper: { name: 'Little critter', head: 'bear', fur: '#6E7A5A', outfit: { style: 'cloak', color: '#6E7A5A', accent: '#4E5A3A' } },
  },
  room: { wall: 'wall.svg', floor: 'floor.svg', desk: 'desk.svg', lounge: 'lounge.svg', wallColor: '#7A6A5A', floorColor: '#8A6A4E' },
  celebration: { push: 'bike.svg', pr: 'tape.svg' },
  files: {
    'wall.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 58"><style>.l{animation:l 1.6s steps(2) infinite}.l2{animation-delay:.8s}@keyframes l{50%{opacity:.25}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect width="120" height="58" fill="#C9B08A"/><g stroke="#B8986A" stroke-width=".8"><path d="M10 0 v50 M30 0 v50 M50 0 v50 M70 0 v50 M90 0 v50 M110 0 v50"/></g>
<rect x="44" y="4" width="32" height="14" fill="#2A3A2A"/><path d="M44 18 l6 -6 l6 4 l8 -8 l12 10" fill="none" stroke="#6E7A5A" stroke-width="1.2"/>
<path d="M4 26 Q30 20 60 26 T116 26" fill="none" stroke="#2F3A2E" stroke-width=".6"/>
<g class="l"><circle cx="10" cy="25" r="1.6" fill="#F2545B"/><circle cx="34" cy="22" r="1.6" fill="#5CC793"/><circle cx="58" cy="26" r="1.6" fill="#F2B825"/><circle cx="82" cy="24" r="1.6" fill="#3B6FD8"/><circle cx="106" cy="26" r="1.6" fill="#F2545B"/></g>
<g class="l l2"><circle cx="22" cy="23" r="1.6" fill="#F2B825"/><circle cx="46" cy="24" r="1.6" fill="#3B6FD8"/><circle cx="70" cy="25" r="1.6" fill="#F2545B"/><circle cx="94" cy="24" r="1.6" fill="#5CC793"/></g>
<g font-family="Arial,sans-serif" font-weight="700" font-size="5" fill="#2F3A2E"><text x="8" y="34">A B C D E F G</text><text x="62" y="34">R S T U V W</text></g>
<rect x="88" y="36" width="20" height="12" fill="#2E5A8E"/><text x="98" y="44" text-anchor="middle" font-size="4" fill="#F2B825" font-family="Arial">ARCADE</text><rect y="50" width="120" height="8" fill="#6B5A4A"/></svg>`,
    'floor.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#8A6A4E"/><path d="M0 4 h24 M0 12 h24 M0 20 h24" stroke="#7A5A3E" stroke-width="1"/><path d="M8 4 v8 M18 12 v8" stroke="#7A5A3E" stroke-width=".8"/></svg>`,
    'desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><style>.g{animation:g 2s ease-in-out infinite}@keyframes g{50%{opacity:.6}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect x="18" y="0" width="28" height="16" rx="2" fill="#D9CDB0"/><rect class="g" x="21" y="2" width="22" height="11" fill="#1E3A2A"/><text x="23" y="9" font-size="4" fill="#5CC793" font-family="monospace">C:\\&gt;_</text><rect x="48" y="10" width="10" height="6" rx="1" fill="#3A3F55"/><rect x="50" y="11" width="6" height="2" fill="#F2545B"/>
<rect x="0" y="16" width="64" height="5" rx="1" fill="#B88F5E"/><rect x="2" y="21" width="60" height="11" fill="#9A7448"/><rect x="5" y="32" width="5" height="8" fill="#7A5A3E"/><rect x="54" y="32" width="5" height="8" fill="#7A5A3E"/></svg>`,
    'lounge.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 60"><rect x="0" y="36" width="88" height="24" rx="4" fill="#B8862A"/><rect x="4" y="26" width="80" height="14" rx="5" fill="#8E6A2A"/><g fill="#C8352E"><rect x="10" y="30" width="10" height="8" rx="2"/></g><rect x="60" y="6" width="22" height="18" rx="2" fill="#5A4A3A"/><rect x="62" y="8" width="18" height="12" fill="#3B6FD8"/><rect x="66" y="24" width="10" height="4" fill="#5A4A3A"/></svg>`,
    'bike.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="none" stroke="#C8352E" stroke-width="2"><circle cx="8" cy="22" r="6"/><circle cx="24" cy="22" r="6"/><path d="M8 22 l6 -8 h8 l2 8 M14 14 l2 8"/></g><path d="M2 10 h8 M0 14 h6" stroke="#9AA0B5" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    'tape.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="8" width="26" height="17" rx="2" fill="#3A3F55"/><rect x="6" y="10" width="20" height="6" rx="1" fill="#F2B825"/><circle cx="11" cy="20" r="2.5" fill="#E8EBFF"/><circle cx="21" cy="20" r="2.5" fill="#E8EBFF"/><text x="16" y="15" text-anchor="middle" font-size="4" fill="#3A3F55" font-family="Arial" font-weight="700">MIX</text></svg>`,
  },
};

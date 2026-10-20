'use strict';
// Superheroes: a hero HQ high above a night city. Original heroes (inspired by the genre, not copied from any comic).

const RED = '#C8352E', GOLD = '#F2B825', NAVY = '#1E2A5A', WHITE = '#F4F1E8';

module.exports = {
  id: 'superheroes',
  name: 'Superheroes',
  description: 'A hero HQ above a night city. Captain Nova plans, Gizmo writes, Blitz runs commands, Bulwark tests, Beacon calls for you. Rookies are the helpers. Original heroes.',
  defaultRole: 'thinking',
  header: { title: 'Hero HQ', font: 'orbitron', clockFont: 'orbitron', clock: 'digital', colors: { bar: '#141A3A', ink: '#F2F4FF', accent: GOLD, muted: '#9AA6D8' }, phases: { dawn: 'Dawn patrol', morning: 'Day watch', afternoon: 'Day watch', evening: 'Dusk patrol', night: 'Night watch' } },
  tint: false,
  cast: {
    planning: { name: 'Captain Nova', label: 'Captain Nova · Planning the mission', skin: '#E2B38E', hair: { style: 'short', color: '#6B3E1F' }, cape: { color: RED }, emblem: { shape: 'star', color: GOLD },
      face: { eyes: 'focus' }, outfit: { style: 'tunic', color: '#2F5FC4', accent: GOLD }, pose: 'hold', prop: { type: 'holo' } },
    writing: { name: 'Gizmo', label: 'Gizmo · Writing code', skin: '#8E5A3A', hair: { style: 'bun', color: '#1B1B1B' }, emblem: { shape: 'diamond', color: GOLD },
      face: { eyes: 'focus', glasses: 'visor' }, outfit: { style: 'armor', color: '#2E8A8A', accent: '#C7CCD8' }, pose: 'typing', prop: { type: 'laptop', color: '#8A90A6' } },
    reading: { name: 'The Sage', label: 'The Sage · Reading', skin: '#C98F62', hair: { style: 'long', color: '#E8E6E0' }, cape: { color: '#1F7A7A' }, emblem: { shape: 'circle', color: '#9FE8D8' },
      face: { eyes: 'focus' }, outfit: { style: 'robe', color: '#6A3E9A', accent: '#4A2A7A' }, pose: 'hold', prop: { type: 'book', color: '#4A2A7A' } },
    running: { name: 'Blitz', label: 'Blitz · Running at speed', skin: '#F2C9A0', hair: { style: 'buzz', color: '#C9A15A' }, mask: { color: '#1F6A3A' }, emblem: { shape: 'bolt', color: WHITE },
      face: { eyes: 'wide' }, outfit: { style: 'tunic', color: '#2E9E6A', accent: '#1F6A3A' }, pose: 'typing', prop: { type: 'laptop', color: '#C7CCD8' } },
    tests: { name: 'Bulwark', label: 'Bulwark · Testing the defences', skin: '#7A4E2E', hair: { style: 'pony', color: '#1B1B1B' }, wear: { type: 'headband', color: '#2E9E6A' },
      face: { eyes: 'stern' }, outfit: { style: 'armor', color: '#5A6B7D', accent: '#2E9E6A' }, pose: 'hold', prop: { type: 'shield', color: '#2E9E6A' } },
    build: { name: 'Tremor', label: 'Tremor · Building', skin: '#B9784E', hair: { style: 'buzz', color: '#1B1B1B' }, beard: { style: 'short', color: '#1B1B1B' }, emblem: { shape: 'diamond', color: '#3A3F55' },
      face: { eyes: 'focus' }, outfit: { style: 'tunic', color: '#E07B2A', accent: '#3A3F55' }, pose: 'staff', prop: { type: 'hammer', color: '#8A90A6' } },
    deploy: { name: 'Skyrocket', label: 'Skyrocket · Launching (deploy)', skin: '#E8B48A', hair: { style: 'short', color: '#8C2F1C' }, wear: { type: 'helmet', color: WHITE, gem: '#3B6FD8' }, emblem: { shape: 'bolt', color: GOLD },
      face: { eyes: 'focus', glasses: 'visor' }, outfit: { style: 'armor', color: '#3B6FD8', accent: WHITE }, pose: 'typing', prop: { type: 'joystick' } },
    data: { name: 'Cipher', label: 'Cipher · Cracking the data', skin: '#D9A27A', hair: { style: 'short', color: '#2B1D14' }, wear: { type: 'hood', color: '#3A2F5A' },
      face: { eyes: 'focus', glasses: 'visor' }, outfit: { style: 'cloak', color: '#2A2440', accent: '#3A2F5A' }, pose: 'hold', prop: { type: 'crystal', color: '#5CE8C0' } },
    review: { name: 'The Inspector', label: 'The Inspector · Reviewing', skin: '#E0C8A8', hair: { style: 'short', color: '#4A3426' }, beard: { style: 'mustache', color: '#4A3426' }, mask: { color: '#1E2235' },
      face: { eyes: 'focus' }, outfit: { style: 'jacket', color: '#8A6A4E', accent: '#6B4E36', inner: '#E8E0C8' }, pose: 'hold', prop: { type: 'magnifier', color: '#C9A15A' } },
    git: { name: 'Wayfinder', label: 'Wayfinder · Charting branches (git)', skin: '#C98F62', hair: { style: 'pony', color: '#2B1D14' }, cape: { color: '#1F7A7A' }, emblem: { shape: 'star', color: WHITE },
      face: { eyes: 'focus' }, outfit: { style: 'tunic', color: RED, accent: '#8E2F2F' }, pose: 'hold', prop: { type: 'compass' } },
    delegating: { name: 'The Commander', label: 'The Commander · Handing off', skin: '#8E5A3A', hair: { style: 'buzz', color: '#D0D0D0' }, beard: { style: 'short', color: '#D0D0D0' }, emblem: { shape: 'star', color: '#C7CCD8' },
      face: { eyes: 'smile' }, outfit: { style: 'jacket', color: NAVY, accent: '#141A3A', inner: '#C7CCD8' }, pose: 'hold', prop: { type: 'walkie' } },
    browsing: { name: 'Lookout', label: 'Lookout · Scanning the city', skin: '#E2B38E', hair: { style: 'long', color: '#2B1D14' }, mask: { color: '#5A3E8A' }, cape: { color: '#5A3E8A' }, emblem: { shape: 'diamond', color: '#9FD3F2' },
      face: { eyes: 'wide' }, outfit: { style: 'tunic', color: '#2A2F5A', accent: '#5A3E8A' }, pose: 'hold', prop: { type: 'holo' } },
    thinking: { name: 'Mindwave', label: 'Mindwave · Thinking', skin: '#F2D7BE', hair: { style: 'long', color: '#8C2F1C' }, wear: { type: 'headband', color: '#B8A2E8' }, emblem: { shape: 'circle', color: '#B8A2E8' },
      face: { eyes: 'closed', mouth: 'flat' }, outfit: { style: 'robe', color: '#7A62B8', accent: '#5A4298' }, pose: 'chin', think: true },
    waiting: { name: 'Beacon', label: 'Beacon · Needs you', skin: '#A8714A', hair: { style: 'curly', color: '#1B1B1B' }, cape: { color: GOLD }, emblem: { shape: 'star', color: RED },
      face: { eyes: 'smile' }, outfit: { style: 'tunic', color: '#E8EBFF', accent: GOLD }, pose: 'raise', bubble: 'waiting' },
    asking: { name: 'Sidekick', label: 'Sidekick · Has a question', skin: '#F2C9A0', hair: { style: 'buzz', color: '#C9541E' }, mask: { color: RED }, emblem: { shape: 'circle', color: GOLD },
      face: { eyes: 'wide' }, outfit: { style: 'tunic', color: '#F2B825', accent: RED }, pose: 'raise', bubble: 'asking' },
    idle: { name: 'Off duty', label: 'Off duty · Resting', skin: '#D9A27A', hair: { style: 'fluffy', color: '#2B1D14' }, cape: { color: RED },
      face: { eyes: 'closed' }, outfit: { style: 'jacket', color: '#5A6B7D', accent: '#3A4A5A', inner: '#E8E0C8' }, pose: 'mug', sleep: true },
    done: { name: 'Hero of the day', label: 'Hero of the day · Done', skin: '#E8B48A', hair: { style: 'short', color: '#1B1B1B' }, cape: { color: RED },
      face: { eyes: 'smile' }, outfit: { style: 'tunic', color: '#2F5FC4', accent: GOLD }, pose: 'hold', prop: { type: 'medal' }, bubble: 'done' },
    helper: { name: 'Rookie', skin: '#C98F62', hair: { style: 'short', color: '#1B1B1B' }, mask: { color: '#2F5FC4' }, emblem: { shape: 'circle', color: GOLD },
      face: { eyes: 'focus' }, outfit: { style: 'tunic', color: '#E07B2A', accent: '#2F5FC4' }, pose: 'down' },
  },
  room: { wall: 'wall.svg', floor: 'floor.svg', desk: 'desk.svg', lounge: 'lounge.svg', wallColor: '#2A3050', floorColor: '#4A5070' },
  room3d: { floor: { color: '#4A5070', alt: '#414763' }, wall: { color: '#2A3050' }, desk: { top: '#9AA0B5', body: '#3A3F55', leg: '#2A2F45', item: 'monitor', screen: '#0C2A4A' }, lounge: { kind: 'sofa', color: RED, accent: '#8E2F2F' } },
  celebration: { push: 'pow.svg', pr: 'signal.svg' },
  files: {
    'wall.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 58"><style>.sl{animation:sl 7s ease-in-out infinite alternate;transform-origin:30px 44px}.sl2{animation-duration:9s;animation-direction:alternate-reverse;transform-origin:96px 44px}@keyframes sl{from{transform:rotate(-24deg)}to{transform:rotate(24deg)}}.wn{animation:wn 3.2s steps(1) infinite}@keyframes wn{40%{opacity:.2}70%{opacity:1}}.sg{animation:sg 3s ease-in-out infinite}@keyframes sg{50%{opacity:.6}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect width="120" height="58" fill="#2A3050"/><rect y="50" width="120" height="8" fill="#1E2440"/><path d="M0 50 h120" stroke="${GOLD}" stroke-width="1"/>
<rect x="6" y="4" width="108" height="42" rx="3" fill="#8A90A6"/><clipPath id="w"><rect x="8" y="6" width="104" height="38" rx="2"/></clipPath>
<g clip-path="url(#w)"><rect x="8" y="6" width="104" height="38" fill="#141A3A"/><rect x="8" y="30" width="104" height="14" fill="#2A2050" opacity=".7"/>
<g fill="#F2F4FF"><circle cx="18" cy="11" r=".6"/><circle cx="44" cy="9" r=".5"/><circle cx="88" cy="12" r=".6"/><circle cx="104" cy="9" r=".5"/></g>
<g class="sl" opacity=".22"><path d="M30 44 L22 4 H38 Z" fill="#FFF3B0"/></g><g class="sl sl2" opacity=".18"><path d="M96 44 L88 4 H104 Z" fill="#FFF3B0"/></g>
<ellipse cx="64" cy="14" rx="13" ry="5" fill="#3A3F66" opacity=".8"/><g class="sg"><circle cx="64" cy="14" r="4.6" fill="#FFF3B0" opacity=".9"/><path d="M64 10.6 l1 2.3 l2.5 .2 l-1.9 1.6 l.6 2.5 l-2.2 -1.4 l-2.2 1.4 l.6 -2.5 l-1.9 -1.6 l2.5 -.2z" fill="#141A3A"/></g>
<g fill="#0C1024"><rect x="8" y="26" width="12" height="18"/><rect x="20" y="20" width="9" height="24"/><rect x="29" y="30" width="10" height="14"/><rect x="39" y="16" width="8" height="28"/><path d="M42 16 v-5 h2 v5z"/><rect x="47" y="28" width="12" height="16"/><rect x="59" y="22" width="10" height="22"/><rect x="69" y="32" width="9" height="12"/><rect x="78" y="18" width="11" height="26"/><rect x="89" y="27" width="10" height="17"/><rect x="99" y="21" width="13" height="23"/></g>
<g fill="#FFD27A"><rect x="11" y="29" width="1.6" height="1.6"/><rect x="15" y="33" width="1.6" height="1.6" class="wn"/><rect x="23" y="24" width="1.6" height="1.6"/><rect x="25" y="30" width="1.6" height="1.6" class="wn" style="animation-delay:-1.1s"/><rect x="41" y="20" width="1.6" height="1.6" class="wn" style="animation-delay:-2s"/><rect x="43" y="28" width="1.6" height="1.6"/><rect x="50" y="32" width="1.6" height="1.6"/><rect x="62" y="26" width="1.6" height="1.6" class="wn" style="animation-delay:-.6s"/><rect x="65" y="34" width="1.6" height="1.6"/><rect x="81" y="22" width="1.6" height="1.6"/><rect x="84" y="30" width="1.6" height="1.6" class="wn" style="animation-delay:-2.6s"/><rect x="92" y="31" width="1.6" height="1.6"/><rect x="102" y="25" width="1.6" height="1.6" class="wn" style="animation-delay:-1.6s"/><rect x="106" y="33" width="1.6" height="1.6"/></g></g>
<path d="M60 4 V46" stroke="#8A90A6" stroke-width="1.6"/></svg>`,
    'floor.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#4A5070"/><path d="M0 0 h24 v24 h-24z" fill="none" stroke="#414763" stroke-width="1"/><circle cx="12" cy="12" r="1" fill="#5A6088"/></svg>`,
    'desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><style>.rd{animation:rd 2.4s linear infinite;transform-origin:32px 9px}@keyframes rd{to{transform:rotate(360deg)}}.bl{animation:bl 1.2s steps(1) infinite}@keyframes bl{50%{opacity:.25}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect x="18" y="0" width="28" height="16" rx="2" fill="#2A2F45"/><rect x="20" y="2" width="24" height="12" fill="#0C2A4A"/><clipPath id="sc"><rect x="20" y="2" width="24" height="12"/></clipPath>
<g clip-path="url(#sc)"><circle cx="32" cy="9" r="5" fill="none" stroke="#2E7A9A" stroke-width=".6"/><circle cx="32" cy="9" r="2.5" fill="none" stroke="#2E7A9A" stroke-width=".5"/><path class="rd" d="M32 9 L37 9 A5 5 0 0 0 35.5 5.5 Z" fill="#5CE8C0" opacity=".55"/><circle class="bl" cx="35" cy="7" r=".8" fill="#F2545B"/></g>
<rect x="49" y="10" width="8" height="6" rx="1.5" fill="${RED}"/><path d="M53 10 l.7 1.5 l1.6 .1 l-1.2 1 l.4 1.6 l-1.5 -.9 l-1.5 .9 l.4 -1.6 l-1.2 -1 l1.6 -.1z" fill="${GOLD}"/>
<rect x="0" y="16" width="64" height="5" rx="2" fill="#9AA0B5"/><rect x="2" y="21" width="60" height="11" fill="#3A3F55"/><path d="M6 26 h52" stroke="${GOLD}" stroke-width=".8"/><g class="bl"><circle cx="8" cy="29" r="1" fill="#5CE8C0"/></g>
<rect x="5" y="32" width="5" height="8" fill="#2A2F45"/><rect x="54" y="32" width="5" height="8" fill="#2A2F45"/></svg>`,
    'lounge.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 60"><style>.bg{animation:bg 2.6s ease-in-out infinite alternate;transform-origin:78px 2px}@keyframes bg{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}.tr{animation:tr 2s ease-in-out infinite}@keyframes tr{50%{opacity:.5}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect x="28" y="2" width="22" height="18" rx="2" fill="#2A2F45"/><path d="M33 16 h12 l-2 -4 h-8z" fill="${GOLD}"/><path class="tr" d="M39 4 l1.4 3 l3.2 .3 l-2.4 2.1 l.7 3.1 l-2.9 -1.7 l-2.9 1.7 l.7 -3.1 l-2.4 -2.1 l3.2 -.3z" fill="${GOLD}"/>
<g class="bg"><line x1="78" y1="0" x2="78" y2="8" stroke="#8A90A6" stroke-width="1"/><rect x="73" y="8" width="10" height="22" rx="4" fill="${RED}"/><rect x="73" y="16" width="10" height="2" fill="#8E2F2F"/></g>
<rect x="0" y="34" width="64" height="26" rx="5" fill="${RED}"/><rect x="4" y="24" width="56" height="14" rx="6" fill="#A82A24"/><rect x="0" y="30" width="10" height="20" rx="4" fill="#8E2F2F"/><rect x="54" y="30" width="10" height="20" rx="4" fill="#8E2F2F"/></svg>`,
    'pow.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 1 l3 7 l7 -4 l-2 8 l7 2 l-7 4 l4 7 l-8 -2 l-1 8 l-4 -7 l-6 5 l1 -8 l-8 -1 l6 -5 l-5 -6 l8 1z" fill="${GOLD}" stroke="#1E2235" stroke-width="1"/><text x="16" y="19" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="8" fill="${RED}" stroke="#1E2235" stroke-width=".4">POW!</text></svg>`,
    'signal.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 30 L6 6 H26 Z" fill="#FFF3B0" opacity=".45"/><circle cx="16" cy="10" r="8" fill="#FFF3B0" stroke="#1E2235" stroke-width="1"/><path d="M16 4.6 l1.6 3.4 l3.8 .4 l-2.9 2.5 l.9 3.7 l-3.4 -2 l-3.4 2 l.9 -3.7 l-2.9 -2.5 l3.8 -.4z" fill="#141A3A"/></svg>`,
  },
};

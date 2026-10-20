'use strict';
// Mahabharata: a pavilion at Kurukshetra. The character at each desk shows what that agent is doing.

const BLUE = '#4F79D9', GOLD = '#E8B830', SAFFRON = '#E07B2A', WHITE = '#F4F1E8', RED = '#C8352E';

module.exports = {
  id: 'mahabharata',
  name: 'Mahabharata',
  description: 'A pavilion at Kurukshetra. Krishna plans, Ganesha writes, Arjuna runs commands, Drona tests, Bhishma waits for you. Pandava foot soldiers are the helpers.',
  defaultRole: 'thinking',
  header: { title: 'Kurukshetra', font: 'cinzel', clockFont: 'cinzel', colors: { bar: '#5A1E14', ink: '#F7E7C4', accent: '#E8B830', muted: '#D9B98A' }, phases: { dawn: 'Brahma muhurta', morning: 'Pratah', afternoon: 'Madhyahna', evening: 'Sandhya', night: 'Ratri' } },
  tint: false,
  cast: {
    planning: { name: 'Krishna', skin: BLUE, hair: { style: 'long', color: '#14182A' }, wear: { type: 'mukut', color: GOLD, gem: RED }, feather: true,
      face: { eyes: 'closed', tilak: 'u' }, outfit: { style: 'shawl', color: '#F2B825', accent: '#E07B2A' }, necklace: '#E84A5F', pose: 'flute', prop: { type: 'flute' } },
    writing: { name: 'Ganesha', head: 'elephant', skin: '#F0A07C', wear: { type: 'tall-mukut', color: GOLD, gem: '#2E9E6A' }, thread: true,
      outfit: { style: 'bare', color: RED, accent: '#F2B825' }, pose: 'typing', prop: { type: 'quill' } },
    reading: { name: 'Vyasa', skin: '#8E5A3A', hair: { style: 'topknot', color: '#E8E6E0' }, beard: { style: 'long', color: '#E8E6E0' },
      face: { eyes: 'focus', tilak: 'ash' }, outfit: { style: 'robe', color: '#F4E7C8', accent: '#D9C48F' }, pose: 'hold', prop: { type: 'book', color: '#B0603A' } },
    tests: { name: 'Drona', skin: '#D9A27A', hair: { style: 'topknot', color: '#F2F2F2' }, beard: { style: 'long', color: '#F2F2F2' },
      face: { eyes: 'stern', tilak: 'ash' }, outfit: { style: 'robe', color: SAFFRON, accent: '#B85A1A' }, pose: 'chin', prop: { type: 'arrows' } },
    build: { name: 'Bhima', skin: '#B9784E', hair: { style: 'short', color: '#1B1B1B' }, beard: { style: 'mustache', color: '#1B1B1B' }, wear: { type: 'headband', color: GOLD },
      face: { eyes: 'focus' }, outfit: { style: 'bare', color: '#8E2F2F', accent: GOLD }, pose: 'staff', prop: { type: 'mace', color: GOLD } },
    deploy: { name: 'Maya', label: 'Maya the architect · Deploying', skin: '#7A5A8E', hair: { style: 'short', color: '#2A1D33' }, wear: { type: 'turban', color: '#3C3F72', gem: '#5CC7F2' },
      face: { eyes: 'focus' }, outfit: { style: 'robe', color: '#5B4A86', accent: '#E8B830' }, pose: 'hold', prop: { type: 'map' } },
    data: { name: 'Sahadeva', skin: '#C98F62', hair: { style: 'short', color: '#1B1B1B' }, wear: { type: 'tiara', color: GOLD, gem: '#2E9E6A' },
      face: { eyes: 'focus', tilak: 'line' }, outfit: { style: 'shawl', color: '#2E9E6A', accent: '#1F7A50' }, pose: 'hold', prop: { type: 'crystal', color: '#9FC8F2' } },
    review: { name: 'Kripacharya', skin: '#D9A27A', hair: { style: 'topknot', color: '#D0D0D0' }, beard: { style: 'short', color: '#D0D0D0' },
      face: { eyes: 'stern', tilak: 'ash' }, outfit: { style: 'robe', color: WHITE, accent: '#C9BFA8' }, pose: 'hold', prop: { type: 'scroll' } },
    git: { name: 'Nakula', skin: '#E2B38E', hair: { style: 'long', color: '#2B1D14' }, wear: { type: 'tiara', color: GOLD, gem: '#3B6FD8' },
      face: { eyes: 'focus' }, outfit: { style: 'shawl', color: '#3B6FD8', accent: '#2A4E9E' }, pose: 'hold', prop: { type: 'compass' } },
    running: { name: 'Arjuna', skin: '#E8B48A', hair: { style: 'long', color: '#2B1D14' }, wear: { type: 'mukut', color: GOLD, gem: '#3B6FD8' },
      face: { eyes: 'focus' }, outfit: { style: 'armor', color: WHITE, accent: '#C8352E' }, pose: 'bow', prop: { type: 'bow' } },
    delegating: { name: 'Yudhishthira', skin: '#E2B38E', hair: { style: 'short', color: '#2B1D14' }, beard: { style: 'short', color: '#2B1D14' }, wear: { type: 'tall-mukut', color: GOLD, gem: RED },
      face: { eyes: 'smile' }, outfit: { style: 'shawl', color: '#F4F1E8', accent: GOLD }, necklace: GOLD, pose: 'hold', prop: { type: 'scroll' } },
    browsing: { name: 'Sanjaya', label: 'Sanjaya · Seeing far', skin: '#D9A27A', hair: { style: 'short', color: '#2B1D14' }, wear: { type: 'turban', color: '#F2B825', gem: RED },
      face: { eyes: 'wide' }, outfit: { style: 'tunic', color: '#B0603A', accent: '#7A3E1E' }, pose: 'hold', prop: { type: 'holo' } },
    thinking: { name: 'Vidura', skin: '#C98F62', hair: { style: 'short', color: '#8A8A8A' }, beard: { style: 'short', color: '#8A8A8A' }, wear: { type: 'turban', color: '#F4F1E8', gem: '#2E9E6A' },
      face: { eyes: 'closed', mouth: 'flat' }, outfit: { style: 'robe', color: '#E9D7A5', accent: '#B89A5A' }, pose: 'chin', think: true },
    waiting: { name: 'Bhishma', label: 'Bhishma · Needs you', skin: '#E2B38E', hair: { style: 'long', color: '#F7F7F7' }, beard: { style: 'long', color: '#F7F7F7' },
      face: { eyes: 'smile' }, outfit: { style: 'robe', color: WHITE, accent: '#D0D0D0' }, pose: 'raise', prop: { type: 'arrows' }, bubble: 'waiting' },
    asking: { name: 'Kunti', label: 'Kunti · Has a question', skin: '#E8B48A', hair: { style: 'bun', color: '#2B1D14' }, wear: { type: 'tiara', color: GOLD, gem: RED },
      face: { eyes: 'smile', tilak: 'line' }, earrings: GOLD, outfit: { style: 'shawl', color: '#F4F1E8', accent: RED }, pose: 'raise', bubble: 'asking' },
    idle: { name: 'Balarama', label: 'Balarama · Resting', skin: '#F1D2B0', hair: { style: 'long', color: '#1B1B1B' }, wear: { type: 'mukut', color: GOLD, gem: '#3B6FD8' },
      face: { eyes: 'closed' }, outfit: { style: 'shawl', color: '#2F4F9E', accent: '#1E3570' }, pose: 'down', prop: { type: 'staff', color: '#8B5A2B' }, sleep: true },
    done: { name: 'Balarama', label: 'Balarama · Done', skin: '#F1D2B0', hair: { style: 'long', color: '#1B1B1B' }, wear: { type: 'mukut', color: GOLD, gem: '#3B6FD8' },
      face: { eyes: 'smile' }, outfit: { style: 'shawl', color: '#2F4F9E', accent: '#1E3570' }, pose: 'hold', prop: { type: 'garland' }, bubble: 'done' },
    helper: { name: 'Pandava foot soldier', skin: '#C98F62', hair: { style: 'short', color: '#1B1B1B' }, beard: { style: 'mustache', color: '#1B1B1B' },
      wear: { type: 'helmet', color: '#8A90A6', gem: GOLD }, face: { eyes: 'focus' }, outfit: { style: 'armor', color: '#8E2F2F', accent: GOLD }, pose: 'staff', prop: { type: 'spear' } },
  },
  room: { wall: 'wall.svg', floor: 'floor.svg', desk: 'desk.svg', lounge: 'lounge.svg', wallColor: '#A6452E', floorColor: '#D9B98A' },
  room3d: { floor: { color: '#D9B98A', alt: '#CFAE7E' }, wall: { color: '#A6452E' }, desk: { top: '#A86F3C', body: '#8B5A2B', leg: '#6B4426', item: 'scroll', screen: '#EAD7A2' }, lounge: { kind: 'sofa', color: '#C8352E', accent: '#E8B830' } },
  celebration: { push: 'conch.svg', pr: 'flag.svg' },
  files: {
    'wall.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 58"><style>.fl{animation:f .9s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:left}@keyframes f{from{transform:skewY(-6deg) scaleX(1)}to{transform:skewY(8deg) scaleX(.85)}}.sun{animation:sun 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes sun{50%{transform:scale(1.2);opacity:.85}}.dy{animation:dy .5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}@keyframes dy{to{transform:scale(.75,1.2)}}.dust{animation:dust 6s linear infinite}@keyframes dust{from{transform:translateX(-20px)}to{transform:translateX(90px)}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect width="120" height="58" fill="#A6452E"/><rect y="48" width="120" height="3" fill="#D9A441"/><rect y="51" width="120" height="7" fill="#8C3824"/>
<path d="M22 46 V22 Q22 6 60 6 Q98 6 98 22 V46 Z" fill="#D9A441"/>
<clipPath id="a"><path d="M26 44 V23 Q26 10 60 10 Q94 10 94 23 V44 Z"/></clipPath>
<g clip-path="url(#a)"><rect x="20" y="8" width="80" height="12" fill="#4B4F9A"/><rect x="20" y="20" width="80" height="8" fill="#C9608A"/><rect x="20" y="28" width="80" height="6" fill="#F2945A"/><circle class="sun" cx="72" cy="30" r="5" fill="#FFB347"/>
<rect x="20" y="34" width="80" height="12" fill="#C8A06A"/><g class="dust" fill="#E8D2A6" opacity=".7"><ellipse cx="20" cy="43" rx="5" ry="1.6"/><ellipse cx="28" cy="44" rx="3" ry="1"/></g>
<g fill="#4A3426"><rect x="34" y="35" width="10" height="4" rx="1"/><circle cx="36" cy="40" r="1.6"/><circle cx="42" cy="40" r="1.6"/><rect x="38.5" y="27" width="1" height="8"/></g><path class="fl" d="M39.5 27 h5 l-1.5 2 h-3.5z" fill="#F2B825"/>
<g fill="#4A3426"><rect x="66" y="36" width="9" height="4" rx="1"/><circle cx="68" cy="41" r="1.5"/><circle cx="73" cy="41" r="1.5"/><rect x="70" y="29" width="1" height="7"/></g><path class="fl" d="M71 29 h5 l-1.5 2 h-3.5z" fill="#C8352E"/>
<g fill="#5A5A5A"><rect x="80" y="35" width="10" height="5" rx="2"/><rect x="88" y="37" width="2" height="4"/><rect x="81" y="39" width="2" height="3"/><rect x="87" y="39" width="2" height="3"/></g></g>
<path d="M60 6 V44" stroke="#D9A441" stroke-width="2"/><g fill="#E8B830"><circle cx="8" cy="20" r="2"/><circle cx="112" cy="20" r="2"/></g><path d="M4 30 h12 M104 30 h12" stroke="#D9A441" stroke-width="1"/><g transform="translate(6 44)"><path d="M-3 3 q3 2.5 6 0 l-1 1.6 h-4z" fill="#B0603A"/><path class="dy" style="animation-delay:-0.00s" d="M0 2.6 q-1.3 -2 0 -4 q1.3 2 0 4z" fill="#FFB347"/></g><g transform="translate(14 44)"><path d="M-3 3 q3 2.5 6 0 l-1 1.6 h-4z" fill="#B0603A"/><path class="dy" style="animation-delay:-0.13s" d="M0 2.6 q-1.3 -2 0 -4 q1.3 2 0 4z" fill="#FFB347"/></g><g transform="translate(106 44)"><path d="M-3 3 q3 2.5 6 0 l-1 1.6 h-4z" fill="#B0603A"/><path class="dy" style="animation-delay:-0.26s" d="M0 2.6 q-1.3 -2 0 -4 q1.3 2 0 4z" fill="#FFB347"/></g><g transform="translate(114 44)"><path d="M-3 3 q3 2.5 6 0 l-1 1.6 h-4z" fill="#B0603A"/><path class="dy" style="animation-delay:-0.39s" d="M0 2.6 q-1.3 -2 0 -4 q1.3 2 0 4z" fill="#FFB347"/></g></svg>`,
    'floor.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#D9B98A"/><rect width="12" height="12" fill="#CFAE7E"/><rect x="12" y="12" width="12" height="12" fill="#CFAE7E"/><circle cx="12" cy="12" r="1.2" fill="#B88F5E"/></svg>`,
    'desk.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><style>.fl{animation:f .4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}@keyframes f{to{transform:scale(.85,1.15)}}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
<rect x="8" y="10" width="24" height="5" rx="2" fill="#EAD7A2"/><path d="M10 12.5 h20" stroke="#B89A5A" stroke-width=".6"/>
<path d="M48 13 q5 3 10 0 l-1.5 3 h-7z" fill="#B0603A"/><path class="fl" d="M53 12 q-2.5 -4 0 -7 q2.5 3 0 7z" fill="#FFB347"/>
<rect x="0" y="16" width="64" height="5" rx="2" fill="#A86F3C"/><rect x="2" y="21" width="60" height="11" fill="#8B5A2B"/><path d="M6 26 h52" stroke="#D9A441" stroke-width="1"/>
<rect x="5" y="32" width="5" height="8" fill="#6B4426"/><rect x="54" y="32" width="5" height="8" fill="#6B4426"/></svg>`,
    'lounge.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 60"><rect x="0" y="16" width="88" height="44" rx="4" fill="#7A2E4A"/><rect x="3" y="19" width="82" height="38" rx="3" fill="none" stroke="#D9A441" stroke-width="1.2"/>
<rect x="8" y="10" width="72" height="14" rx="7" fill="#C8352E"/><rect x="8" y="10" width="72" height="3" rx="1.5" fill="#E8B830"/><circle cx="14" cy="17" r="7" fill="#B02A25"/><circle cx="74" cy="17" r="7" fill="#B02A25"/>
<g transform="translate(70 40)"><rect x="-5" y="0" width="10" height="12" rx="2" fill="#B07650"/><path d="M0 0 q-8 -12 0 -18 q8 6 0 18z" fill="#3E8A5A"/><path d="M0 -4 q-5 -6 -2 -12" stroke="#2E6B3A" fill="none"/></g></svg>`,
    'conch.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M6 20 q6 -14 18 -10 q4 8 -6 14 q-9 3 -12 -4z" fill="#F7F2E4" stroke="#C9BFA8" stroke-width="1"/><path d="M11 18 q5 -5 11 -4 M13 21 q4 -3 8 -3" stroke="#D8A27A" fill="none" stroke-width=".9"/><path d="M24 6 q3 3 0 6 M27 3 q5 6 0 12" stroke="#E8B830" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
    'flag.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><line x1="8" y1="2" x2="8" y2="30" stroke="#6B4426" stroke-width="2"/><path d="M9 3 h18 l-5 6 l5 6 h-18z" fill="#F29E1F"/><circle cx="16" cy="9" r="3.2" fill="#E8B830"/><g stroke="#E8B830" stroke-width="1"><path d="M16 3.6 v1.6 M16 12.8 v1.6 M10.6 9 h1.6 M19.8 9 h1.6"/></g></svg>`,
  },
};

#!/usr/bin/env node
'use strict';
// Writes a contact sheet SVG of a theme's whole cast, for reviewing art in one picture.
// Usage: node tools/themes/sheet.js <theme-folder> <out.svg>

const fs = require('fs');
const path = require('path');

const [dir, out] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'));
const roles = Object.entries(m.roles).filter(([k]) => k !== 'default');
const cols = 6, cw = 70, ch = 122;
const rows = Math.ceil(roles.length / cols);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cw} ${rows * ch + 40}"><rect width="100%" height="100%" fill="${(m.room && m.room.floorColor) || '#EFE6D6'}"/>`;
svg += `<text x="6" y="14" font-size="11" font-family="Arial" font-weight="700">${m.name}</text>`;
roles.forEach(([role, f], i) => {
  const x = (i % cols) * cw + 5, y = Math.floor(i / cols) * ch + 26;
  const inner = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<style>[\s\S]*?<\/style>/, '');
  const label = (m.labels[role] || role).split(' · ');
  svg += `<svg x="${x}" y="${y}" width="60" height="96" viewBox="0 -16 60 96" overflow="visible">${inner}</svg>`;
  svg += `<text x="${x + 30}" y="${y + 104}" font-size="7" text-anchor="middle" font-family="Arial" font-weight="700">${label[0]}</text>`;
  if (label[1]) svg += `<text x="${x + 30}" y="${y + 112}" font-size="6" text-anchor="middle" font-family="Arial">${label[1].slice(0, 26)}</text>`;
});
fs.writeFileSync(out, svg + '</svg>\n');

// Fuzzy matching for the command palette (Cmd+K).
const wordStart = (s, i) => i === 0 || !/[a-z0-9]/.test(s[i - 1]);
// 0 = no match. The query's letters must appear in order; letters that start a word or follow the
// previous match score higher. Each place the first letter appears is tried as a start.
export function score(query, text) {
  const q = String(query).toLowerCase().replace(/\s+/g, ''), s = String(text).toLowerCase();
  if (!q) return 1;
  let best = 0;
  for (let start = s.indexOf(q[0]); start >= 0; start = s.indexOf(q[0], start + 1)) {
    let total = 0, at = start - 1, ok = true;
    for (const ch of q) {
      const i = s.indexOf(ch, at + 1);
      if (i < 0) { ok = false; break; }
      total += 1 + (wordStart(s, i) ? 2 : 0) + (i === at + 1 ? 1 : 0);
      at = i;
    }
    if (!ok) break; // a later start can't match either
    best = Math.max(best, total);
  }
  return best;
}
// Items are { label, keywords? }; non-matches drop out, ties keep their order.
export function rank(query, items) {
  if (!String(query).trim()) return items.slice();
  return items
    .map((it, i) => ({ it, i, sc: Math.max(score(query, it.label), it.keywords ? score(query, `${it.label} ${it.keywords}`) : 0) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || a.i - b.i)
    .map((x) => x.it);
}

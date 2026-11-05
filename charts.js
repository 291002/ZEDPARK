'use strict';
/* Small SVG chart kit: one-axis bar/line/area charts with crosshair tooltips,
   keyboard stepping, a table view, and HTML bar lists. Colours come from CSS tokens. */
window.CH = (() => {
  const specs = new Map();
  let uid = 0;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
    const n = f <= 1 ? 1 : f <= 1.2 ? 1.2 : f <= 1.6 ? 1.6 : f <= 2 ? 2 : f <= 2.4 ? 2.4 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
    return n * p;
  }
  const short = v => Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? +(v / 1e3).toFixed(0) + 'k' : Math.abs(v) >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(+v.toFixed(1));

  /* Placeholder markup; the chart draws itself after insertion (CH.hydrate). */
  function xy(spec) {
    const id = 'c' + (++uid);
    specs.set(id, spec);
    const legend = spec.series.length + (spec.target ? 1 : 0) >= 2 ? legendHTML(spec) : '';
    return `${legend}<div class="chart" id="${id}" data-chart="${id}" tabindex="0" role="img" aria-label="${esc(spec.aria || spec.title || 'Chart')}. Use left and right arrow keys to read values." style="height:${spec.height || 220}px"></div>`;
  }
  function legendHTML(spec) {
    const items = spec.series.map(s => `<span class="lg"><i class="sw ${s.kind === 'line' ? 'sw-line' : ''}" style="--c:${s.color}"></i>${esc(s.name)}</span>`);
    if (spec.target) items.push(`<span class="lg"><i class="sw sw-target"></i>${esc(spec.target.name || 'Target')}</span>`);
    return `<div class="legend">${items.join('')}</div>`;
  }

  function draw(el) {
    const spec = specs.get(el.dataset.chart); if (!spec) return;
    const W = Math.max(200, el.clientWidth), H = el.clientHeight || spec.height || 220;
    const n = spec.labels.length;
    const fmt = spec.fmt || (v => v.toLocaleString('en-US'));
    const bars = spec.series.filter(s => s.kind !== 'line' && s.kind !== 'area');
    const lines = spec.series.filter(s => s.kind === 'line' || s.kind === 'area');
    const tv = i => spec.target ? (Array.isArray(spec.target.values) ? spec.target.values[i] : spec.target.value) : null;
    let max = 0;
    for (let i = 0; i < n; i++) {
      if (spec.stacked) max = Math.max(max, bars.reduce((a, s) => a + (s.values[i] || 0), 0));
      else bars.forEach(s => max = Math.max(max, s.values[i] || 0));
      lines.forEach(s => max = Math.max(max, s.values[i] || 0));
      if (tv(i) != null) max = Math.max(max, tv(i));
    }
    max = spec.yMax || niceMax(max * 1.04);
    const ticks = [0, .25, .5, .75, 1].map(f => f * max);
    const yl = ticks.map(t => (spec.yFmt || short)(t));
    const m = { l: Math.max(...yl.map(s => s.length)) * 6.6 + 12, r: 10, t: 10, b: 24 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const band = pw / n;
    const x = i => m.l + band * (i + .5);
    const y = v => m.t + ph * (1 - v / max);
    let g = '';
    ticks.forEach((t, k) => { g += `<line class="grid${k === 0 ? ' base' : ''}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="yl" x="${m.l - 8}" y="${y(t) + 4}">${yl[k]}</text>`; });
    const every = Math.max(1, Math.ceil(n * (spec.xw || 44) / pw));
    spec.labels.forEach((l, i) => { if (i % every === 0) g += `<text class="xl" x="${x(i)}" y="${H - 6}">${esc(spec.xFmt ? spec.xFmt(l, i) : l)}</text>`; });
    // bars
    const groupW = Math.min(band * .72, spec.stacked ? 34 : 18 * bars.length + 4);
    const bw = spec.stacked ? groupW : Math.max(2, (groupW - 2 * (bars.length - 1)) / Math.max(1, bars.length));
    for (let i = 0; i < n; i++) {
      let acc = 0;
      bars.forEach((s, k) => {
        const v = s.values[i]; if (v == null || v <= 0) return;
        const bx = spec.stacked ? x(i) - groupW / 2 : x(i) - groupW / 2 + k * (bw + 2);
        const y0 = y(acc), y1 = y(acc + v);
        const top = spec.stacked ? bars.slice(k + 1).every(o => !(o.values[i] > 0)) : true;
        const hgt = Math.max(1, y0 - y1 - (spec.stacked && acc > 0 ? 2 : 0));
        const yy = y0 - (spec.stacked && acc > 0 ? 2 : 0) - hgt;
        g += barPath(bx, yy, bw, hgt, top ? Math.min(4, bw / 2, hgt) : 0, s.color, s.dim && s.dim[i], i);
        if (spec.stacked) acc += v;
      });
    }
    // target
    if (spec.target) {
      if (Array.isArray(spec.target.values)) {
        g += `<path class="target" d="${pathFor(spec.target.values, x, y, spec.target.step ? band : 0)}"/>`;
      } else {
        g += `<line class="target" x1="${m.l}" x2="${W - m.r}" y1="${y(spec.target.value)}" y2="${y(spec.target.value)}"/>`;
      }
    }
    // lines
    lines.forEach(s => {
      const d = pathFor(s.values, x, y);
      if (s.kind === 'area') g += `<path class="area" style="--c:${s.color}" d="${areaFor(s.values, x, y, y(0))}"/>`;
      g += `<path class="line" pathLength="1" style="--c:${s.color}" d="${d}"/>`;
      if (s.marker !== false) s.values.forEach((v, i) => { if (v != null && (s.values[i - 1] == null && s.values[i + 1] == null)) g += `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="3.5" style="--c:${s.color}"/>`; });
    });
    if (spec.now != null && spec.now >= 0 && spec.now < n) g += `<line class="nowline" x1="${x(spec.now)}" x2="${x(spec.now)}" y1="${m.t}" y2="${m.t + ph}"/><text class="nowtx" x="${x(spec.now) + 4}" y="${m.t + 10}">Now</text>`;
    g += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}"/><g class="hl"></g><rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/>`;
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg>`;
    el._geo = { x, y, band, m, n, W, H, ph, fmt, lines, bars, tv };
  }
  function barPath(x, y, w, h, r, c, dim, i) {
    const d = r > 0 ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z` : `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
    return `<path class="bar${dim ? ' dim' : ''}" data-i="${i}" style="--c:${c}" d="${d}"/>`;
  }
  function pathFor(vals, x, y, step) {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      if (step) { d += `${pen ? 'L' : 'M'}${x(i) - step / 2},${y(v)}H${x(i) + step / 2}`; pen = true; return; }
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`; pen = true;
    });
    return d;
  }
  function areaFor(vals, x, y, y0) {
    let d = '', run = [];
    const flush = () => { if (run.length) { d += `M${x(run[0][0])},${y0}` + run.map(([i, v]) => `L${x(i)},${y(v)}`).join('') + `L${x(run[run.length - 1][0])},${y0}Z`; run = []; } };
    vals.forEach((v, i) => v == null ? flush() : run.push([i, v])); flush();
    return d;
  }

  /* hover / keyboard layer */
  const tip = () => document.getElementById('tip');
  function show(el, i, cx, cy) {
    const s = specs.get(el.dataset.chart), G = el._geo; if (!s || !G) return;
    i = Math.max(0, Math.min(G.n - 1, i)); el._i = i;
    const svg = el.querySelector('svg');
    const xh = svg.querySelector('.xh'); xh.setAttribute('x1', G.x(i)); xh.setAttribute('x2', G.x(i)); xh.classList.add('on');
    let hl = '';
    G.lines.forEach(l => { const v = l.values[i]; if (v != null) hl += `<circle class="hdot" cx="${G.x(i)}" cy="${G.y(v)}" r="5" style="--c:${l.color}"/>`; });
    svg.querySelector('.hl').innerHTML = hl;
    svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('hov', +b.dataset.i === i));
    svg.classList.toggle('picking', !!svg.querySelector('.bar.hov'));
    const rows = s.series.map(se => `<div class="tr"><i class="sw ${se.kind === 'line' || se.kind === 'area' ? 'sw-line' : ''}" style="--c:${se.color}"></i><span>${esc(se.name)}</span><b>${se.values[i] == null ? (s.nullText || '—') : esc(G.fmt(se.values[i]))}</b></div>`);
    if (G.tv(i) != null) rows.push(`<div class="tr"><i class="sw sw-target"></i><span>${esc(s.target.name || 'Target')}</span><b>${esc(G.fmt(G.tv(i)))}</b></div>`);
    if (s.tipExtra) { const e = s.tipExtra(i); if (e) rows.push(`<div class="tnote">${esc(e)}</div>`); }
    rows.push('<div class="tnote tpick">Click for details</div>');
    const t = tip();
    t.innerHTML = `<div class="th">${esc(s.tipLabel ? s.tipLabel(s.labels[i], i) : s.labels[i])}</div>${rows.join('')}`;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.left + G.x(i), py = cy ?? r.top + 20;
    place(t, px, py);
  }
  function place(t, px, py) {
    t.hidden = false;
    const tw = t.offsetWidth, th = t.offsetHeight;
    let lx = px + 14, ly = py - th - 10;
    if (lx + tw > innerWidth - 8) lx = px - tw - 14;
    if (ly < 8) ly = py + 18;
    t.style.left = Math.max(8, lx) + 'px'; t.style.top = Math.min(innerHeight - th - 8, ly) + 'px';
  }
  function hide(el) {
    tip().hidden = true;
    if (el && el._geo) { const svg = el.querySelector('svg'); svg?.querySelector('.xh')?.classList.remove('on'); const hl = svg?.querySelector('.hl'); if (hl) hl.innerHTML = ''; svg?.classList.remove('picking'); svg?.querySelectorAll('.bar.hov').forEach(b => b.classList.remove('hov')); }
  }
  function idxAt(el, clientX) { const G = el._geo; const r = el.getBoundingClientRect(); return Math.floor((clientX - r.left - G.m.l) / G.band); }

  const ro = new ResizeObserver(entries => entries.forEach(e => { const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height); if (e.target._w !== w || e.target._h !== h) { e.target._w = w; e.target._h = h; draw(e.target); } }));
  function hydrate(root) {
    root.querySelectorAll('[data-chart]').forEach(el => {
      if (el._bound) return; el._bound = true;
      draw(el); ro.observe(el);
      el.addEventListener('pointermove', e => { if (el._geo) show(el, idxAt(el, e.clientX), e.clientX, e.clientY); });
      el.addEventListener('pointerleave', () => hide(el));
      const pick = i => { if (!el._geo || i == null || i < 0 || i >= el._geo.n) return; hide(el); el.dispatchEvent(new CustomEvent('chartpick', { bubbles: true, detail: { id: el.dataset.chart, i } })); };
      el.addEventListener('click', e => { if (el._geo) pick(idxAt(el, e.clientX)); });
      el.addEventListener('focus', () => show(el, el._i ?? el._geo?.n - 1));
      el.addEventListener('blur', () => hide(el));
      el.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(el, (el._i ?? 0) + (e.key === 'ArrowRight' ? 1 : -1)); }
        if (e.key === 'Home') { e.preventDefault(); show(el, 0); }
        if (e.key === 'End') { e.preventDefault(); show(el, el._geo.n - 1); }
        if (e.key === 'Escape') hide(el);
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el._i ?? el._geo?.n - 1); }
      });
    });
  }
  function prune() { for (const id of specs.keys()) if (!document.getElementById(id)) specs.delete(id); }

  /* table view of an xy spec */
  function table(spec) {
    const fmt = spec.fmt || (v => v.toLocaleString('en-US'));
    const cols = spec.series.map(s => s.name).concat(spec.target ? [spec.target.name || 'Target'] : []);
    const rows = spec.labels.map((l, i) => `<tr><th scope="row">${esc(spec.tipLabel ? spec.tipLabel(l, i) : l)}</th>${spec.series.map(s => `<td class="num">${s.values[i] == null ? '—' : esc(fmt(s.values[i]))}</td>`).join('')}${spec.target ? `<td class="num">${(() => { const v = Array.isArray(spec.target.values) ? spec.target.values[i] : spec.target.value; return v == null ? '—' : esc(fmt(v)); })()}</td>` : ''}</tr>`);
    return `<div class="tscroll"><table class="tbl compact"><thead><tr><th scope="col">${esc(spec.xName || '')}</th>${cols.map(c => `<th scope="col" class="num">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  const tableFor = id => { const s = specs.get(id); return s ? table(s) : ''; };

  /* HTML bar list: rows {label, value, display, color, sub, open, target, nc} */
  function bars(rows, o = {}) {
    if (!rows.length) return '';
    const max = o.max || niceMax(Math.max(...rows.map(r => Math.max(r.value || 0, r.target || 0)))) || 1;
    return `<ul class="hbars">${rows.map(r => {
      const w = r.value == null ? 0 : Math.max(.5, r.value / max * 100);
      const tgt = r.target != null ? `<i class="hb-tgt" style="left:${Math.min(100, r.target / max * 100)}%" aria-hidden="true"></i>` : '';
      const inner = `<span class="hb-l">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="hb-v">${r.value == null ? `<span class="nc">${esc(r.nullText || 'Not connected')}</span>` : esc(r.display ?? r.value.toLocaleString('en-US'))}</span><span class="hb-track">${r.value == null ? '' : `<i class="hb-fill" style="width:${w}%;--c:${r.color || 'var(--s1)'}"></i>`}${tgt}</span>`;
      return `<li>${r.open ? `<button class="hb-row" data-open="${esc(r.open)}">${inner}</button>` : `<div class="hb-row">${inner}</div>`}</li>`;
    }).join('')}</ul>`;
  }

  /* single 100% stacked bar with 2px gaps; parts {label, value, color} */
  function stack(parts, fmt = v => v.toLocaleString('en-US')) {
    const tot = parts.reduce((a, p) => a + (p.value || 0), 0) || 1;
    return `<div class="stack" role="img" aria-label="${esc(parts.map(p => `${p.label} ${Math.round(p.value / tot * 100)}%`).join(', '))}">${parts.filter(p => p.value > 0).map(p => `<i style="flex:${p.value};--c:${p.color}" data-tip="${esc(`${p.label}: ${fmt(p.value)} (${Math.round(p.value / tot * 100)}%)`)}"></i>`).join('')}</div>
      <div class="legend stack-lg">${parts.map(p => `<span class="lg"><i class="sw" style="--c:${p.color}"></i>${esc(p.label)} <b>${Math.round(p.value / tot * 100)}%</b></span>`).join('')}</div>`;
  }

  return { xy, hydrate, prune, spec: id => specs.get(id), table: tableFor, bars, stack, niceMax, short, place, hide, esc };
})();

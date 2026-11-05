'use strict';
/* ZED Park dashboard — views, filters, drawer and state. Data comes from data.js (ZP). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = CH.esc;
  const { ZONE, ZONES, RIDES, OPEN, CLOSE, HOURS, sum, hm } = ZP;

  /* ---------- formatting ---------- */
  const n = v => v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US');
  const n1 = v => v == null ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const egpC = v => v == null ? '—' : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e3)}k` : n(v);
  const egp = v => v == null ? '—' : `EGP ${n(v)}`;
  const egpT = v => v == null || Math.abs(v) < 1e5 ? egp(v) : `<span title="${egp(v)}">EGP ${Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1e3).toFixed(1) + 'k'}</span>`; // table cells stay short so columns fit; full value on hover
  const pct = (v, d = 0) => v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`;
  const zname = id => ZONE[id]?.name || id;
  const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const dayLabel = (iso, o = { weekday: 'short', day: 'numeric', month: 'short' }) => ZP.parse(iso).toLocaleDateString('en-GB', o);
  const short = v => CH.short(v);

  /* ---------- one status vocabulary for every screen ---------- */
  const ST = {
    operating: ['Operating', 'good', 'check'], limited: ['Limited', 'warning', 'minus'], down: ['Down', 'critical', 'x'],
    maintenance: ['Maintenance', 'serious', 'wrench'], closed: ['Closed', 'neutral', 'moon'],
    on: ['On', 'good', 'bulb'], off: ['Off', 'neutral', 'dot'], fault: ['Fault', 'critical', 'alert'], offline: ['Offline', 'muted', 'plug'], unknown: ['No data', 'muted', 'minus'],
    running: ['Running', 'good', 'check'], standby: ['Standby', 'neutral', 'dot'],
    'v-open': ['Watering', 'good', 'drop'], 'v-closed': ['Closed', 'neutral', 'dot'],
    'i-open': ['Open', 'critical', 'alert'], investigating: ['Investigating', 'warning', 'clock'], 'i-closed': ['Closed', 'good', 'check'],
    'c-open': ['Open', 'warning', 'alert'], 'in-progress': ['In progress', 'info', 'clock'], resolved: ['Resolved', 'good', 'check'],
    'w-open': ['Open', 'warning', 'dot'], overdue: ['Overdue', 'critical', 'clock'], done: ['Done', 'good', 'check'], scheduled: ['Scheduled', 'neutral', 'calendar'],
    completed: ['Completed', 'good', 'check'], cancelled: ['Cancelled', 'muted', 'x'], 'e-live': ['In progress', 'info', 'clock'],
    pass: ['Pass', 'good', 'check'], notes: ['Pass with notes', 'warning', 'info'], due: ['Due', 'neutral', 'clock'], 'not-performed': ['Not performed', 'muted', 'minus'],
    ok: ['Normal', 'good', 'check'], dry: ['Dry', 'serious', 'alert'], wet: ['Waterlogged', 'warning', 'drop'], low: ['Low level', 'warning', 'alert'], normal: ['Normal', 'good', 'check'],
    connected: ['Connected', 'good', 'check'], nc: ['Not connected', 'muted', 'plug'],
    'p-good': ['Good', 'good', 'check'], 'p-fair': ['Fair', 'warning', 'info'], 'p-attn': ['Needs attention', 'serious', 'alert'],
    'svc-ok': ['On target', 'good', 'check'], 'svc-slow': ['Slow', 'warning', 'clock'], 'svc-closed': ['Closed', 'neutral', 'moon'],
    critical: ['Critical', 'critical', 'alert'], serious: ['Serious', 'serious', 'alert'], warning: ['Warning', 'warning', 'info'], info: ['Info', 'info', 'info'],
    low_s: ['Low', 'neutral', 'dot'], med_s: ['Medium', 'warning', 'dot'], high_s: ['High', 'critical', 'dot'],
  };
  const pill = k => { const s = ST[k] || ST.unknown; return `<span class="pill t-${s[1]}">${icon(s[2])}${s[0]}</span>`; };
  const sevKey = s => ({ Low: 'low_s', Medium: 'med_s', High: 'high_s' }[s]);
  const evKey = s => s === 'in-progress' ? 'e-live' : s;

  /* ---------- state ---------- */
  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'visitors', label: 'Visitors & Tickets', icon: 'ticket' },
    { id: 'rides', label: 'Rides & Ferris Wheel', icon: 'wheel' },
    { id: 'revenue', label: 'Revenue', icon: 'coins' },
    { id: 'food', label: 'Food & Retail', icon: 'cup' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'guest', label: 'Guest Experience', icon: 'smile' },
    { id: 'safety', label: 'Safety & Maintenance', icon: 'shield' },
    { id: 'utilities', label: 'Utilities', icon: 'bolt' },
    { id: 'landscape', label: 'Landscape & Lighting', icon: 'leaf' },
  ];
  const PERIODS = { day: { label: 'Day', days: 1 }, '7d': { label: '7 days', days: 7 }, '30d': { label: '30 days', days: 30 } };
  const S = { tab: 'overview', date: ZP.todayISO(), period: 'day', zone: 'all', ride: 'all', sort: {}, woFilter: 'active', lsub: 'soil', rstream: 'all', fcat: 'all', updated: new Date(), fail: new URLSearchParams(location.search).get('fail'), loading: false };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable: theme still applies for this visit */ } },
  };

  /* ---------- theme ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $$('.theme-toggle').forEach(b => {
      b.innerHTML = `${icon(t === 'dark' ? 'sun' : 'moon')}<span class="sr">${t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}</span>`;
      b.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      b.dataset.tip = t === 'dark' ? 'Light theme' : 'Dark theme';
    });
    $$('[data-chart]').forEach(el => { el._w = 0; }); // charts read tokens via CSS; nothing to redraw
  }
  const theme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  function toggleTheme() { const t = theme() === 'dark' ? 'light' : 'dark'; store.set('zedpark-theme', t); applyTheme(t); }
  addEventListener('storage', e => { if (e.key === 'zedpark-theme' && e.newValue) applyTheme(e.newValue); });

  /* ---------- landing ---------- */
  const video = $('#heroVideo'), landing = $('#landing'), pp = $('#heroPP');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  function setPP(playing) {
    pp.setAttribute('aria-pressed', String(!playing));
    pp.innerHTML = `${icon(playing ? 'pause' : 'play')}<span class="pp-label">${playing ? 'Pause video' : 'Play video'}</span>`;
    pp.setAttribute('aria-label', playing ? 'Pause background video' : 'Play background video');
  }
  function stillMode() { landing.classList.add('still'); video.pause(); setPP(false); }
  function startVideo() {
    landing.classList.remove('still');
    const p = video.play();
    if (p && p.catch) p.then(() => setPP(true)).catch(() => stillMode());
  }
  video.addEventListener('error', () => { stillMode(); pp.hidden = true; }, true);
  video.querySelector('source').addEventListener('error', () => { stillMode(); pp.hidden = true; });
  pp.addEventListener('click', () => video.paused ? startVideo() : stillMode());
  reduce.addEventListener?.('change', () => reduce.matches ? stillMode() : null);

  function showLanding() {
    $('#app').hidden = true; landing.hidden = false; landing.classList.remove('leaving');
    closeDrawer(true);
    if (reduce.matches) stillMode(); else startVideo();
    setTimeout(() => $('#enterBtn').focus({ preventScroll: true }), 50);
  }
  function enter(tab) {
    S.tab = TABS.some(t => t.id === tab) ? tab : 'overview';
    landing.classList.add('leaving');
    setTimeout(() => { landing.hidden = true; video.pause(); }, reduce.matches ? 0 : 650);
    const app = $('#app'); app.hidden = false; app.classList.add('entering'); tabIn = true;
    setTimeout(() => app.classList.remove('entering'), 800);
    if (location.hash !== '#' + S.tab) history.replaceState(null, '', '#' + S.tab);
    renderAll(true, 650);
    setTimeout(() => $('#main').focus({ preventScroll: true }), 60);
  }
  $('#enterBtn').addEventListener('click', () => enter('overview'));

  /* ---------- data context ---------- */
  function ctx() {
    const days = PERIODS[S.period].days;
    const dates = Array.from({ length: days }, (_, i) => ZP.addDays(S.date, -(days - 1 - i)));
    const all = dates.map(ZP.day);
    const live = all.filter(d => d.state !== 'future');
    return { dates, all, live, m: ZP.day(S.date), multi: days > 1, days };
  }
  const zOk = z => S.zone === 'all' || S.zone === z;
  const rOk = id => S.ride === 'all' || S.ride === id;
  const ridesF = m => m.rides.filter(r => zOk(r.zone) && rOk(r.id));
  const vTarget = d => d.state === 'today' ? d.targetToDate : d.targetVisitors;
  const rTarget = d => d.state === 'today' ? d.revTargetToDate : d.revTarget;
  const STREAM_BUDGET = { tickets: .6, rides: .2, commission: .11, rent: .013, events: .057, parking: .02 };
  const STREAMS = [['tickets', 'Ticketing'], ['rides', 'Ride tickets & add-ons'], ['commission', 'Tenant commission'], ['rent', 'Tenant rent'], ['events', 'Events & bookings'], ['parking', 'Parking']];

  function stampText(m) {
    if (m.state === 'today') return `Updated ${S.updated.toLocaleTimeString('en-GB')}`;
    if (m.state === 'past') return `Final figures · ${dayLabel(m.date)}`;
    return `Bookings only · ${dayLabel(m.date)}`;
  }
  const snapText = m => m.state === 'today' ? `Live status at ${hm(m.nowH)}` : m.state === 'past' ? 'Status at 23:00' : 'No live status';

  /* ---------- alerts ---------- */
  const SEV = { critical: 0, serious: 1, warning: 2, info: 3 };
  function buildAlerts(m) {
    const out = [];
    if (m.state === 'future') return out;
    m.rides.forEach(r => {
      if (!zOk(r.zone) || !rOk(r.id)) return;
      if (r.status === 'down') { const w = r.down.find(x => m.snap >= x.start && m.snap < x.end); out.push({ sev: 'critical', title: `${r.name} is down`, meta: `${w.reason} · ${zname(r.zone)}`, t: w.start, open: `ride:${r.id}`, src: 'Rides' }); }
      if (r.status === 'maintenance') out.push({ sev: 'info', title: `${r.name} closed for planned maintenance`, meta: `All day · ${zname(r.zone)}`, t: OPEN, open: `ride:${r.id}`, src: 'Rides' });
      if (r.status === 'limited') out.push({ sev: 'warning', title: `${r.name} at reduced capacity`, meta: `${r.limitNote} · ${zname(r.zone)}`, t: OPEN, open: `ride:${r.id}`, src: 'Rides' });
      if (r.queueNow >= 40) out.push({ sev: 'warning', title: `${r.queueNow}-minute queue at ${r.name}`, meta: `Above the 40-minute guest promise · ${zname(r.zone)}`, t: m.snap, open: `ride:${r.id}`, src: 'Queues' });
    });
    if (S.ride === 'all') {
      m.incidents.filter(i => i.status !== 'closed' && zOk(i.zone)).forEach(i => out.push({ sev: i.status === 'open' ? 'serious' : 'warning', title: `${i.type} — ${i.status === 'open' ? 'open' : 'investigating'}`, meta: `${i.id} · ${zname(i.zone)}`, t: i.time, open: `incident:${i.id}`, src: 'Safety' }));
      if (m.insideNow != null && m.insideNow / m.capacity >= .9) out.push({ sev: 'serious', title: `Park at ${pct(m.insideNow / m.capacity)} of capacity`, meta: 'Consider pausing gate sales', t: m.snap, open: 'tab:visitors', src: 'Visitors' });
      const u = ZP.utilities(m.date), L = ZP.lighting(m.date), G = ZP.landscape(m.date);
      u.leaks.filter(l => zOk(l.zone)).forEach(l => out.push({ sev: 'critical', title: `Suspected leak — ${zname(l.zone)} potable water`, meta: l.note, t: 5, open: `meter:${l.meter}`, src: 'Utilities' }));
      u.pumps.filter(p => p.status === 'fault' && zOk(p.zone)).forEach(p => out.push({ sev: 'serious', title: `${p.name} in fault`, meta: p.note || 'Pump fault', t: 2, open: `pump:${p.id}`, src: 'Utilities' }));
      u.tanks.filter(t => t.level != null && t.level < t.low).forEach(t => S.zone === 'all' && out.push({ sev: 'warning', title: `${t.name} low — ${t.level}%`, meta: `Low-level alarm at ${t.low}%`, t: m.snap, open: `tank:${t.id}`, src: 'Utilities' }));
      ZP.abnormal(m.date).filter(a => zOk(a.zone)).forEach(a => out.push({ sev: 'warning', title: `Abnormal overnight ${a.label.toLowerCase()} — ${zname(a.zone)}`, meta: `${n1(a.today)} ${a.unit} vs ${n1(a.base)} ${a.unit} baseline (+${Math.round((a.ratio - 1) * 100)}%)`, t: 7, open: 'tab:utilities', src: 'Utilities' }));
      u.meters.filter(x => !x.connected && zOk(x.zone)).forEach(x => out.push({ sev: 'info', title: `Meter ${x.id} not connected`, meta: `${x.type} · ${zname(x.zone)} — readings unavailable`, t: 0, open: `meter:${x.id}`, src: 'Utilities' }));
      L.circuits.filter(c => (c.status === 'fault' || c.status === 'offline') && zOk(c.zone)).forEach(c => out.push({ sev: c.status === 'fault' ? 'serious' : 'warning', title: `${c.name} — ${c.status === 'fault' ? 'fault' : 'controller offline'}`, meta: `${c.id} · ${c.fault.note}`, t: 17, open: `circuit:${c.id}`, src: 'Lighting' }));
      G.sensors.filter(s => s.status === 'dry' && zOk(s.zone)).forEach(s => out.push({ sev: 'warning', title: `Dry soil — ${s.area}`, meta: `${s.id} at ${n1(s.vwc)}% (dry below 18%)`, t: m.snap, open: `sensor:${s.id}`, src: 'Landscape' }));
      G.valves.filter(v => v.status === 'fault' && zOk(v.zone)).forEach(v => out.push({ sev: 'serious', title: `Irrigation valve ${v.id} fault`, meta: `${v.area} · ${v.note}`, t: v.start, open: `valve:${v.id}`, src: 'Landscape' }));
      const od = ZP.workOrders(m.date).filter(w => w.status === 'overdue' && zOk(w.zone));
      if (od.length) out.push({ sev: 'warning', title: `${od.length} maintenance work order${od.length > 1 ? 's' : ''} overdue`, meta: od.slice(0, 2).map(w => w.title).join(' · '), t: 8, open: 'tab:safety', src: 'Maintenance' });
      if (m.visitors && m.revTotal < m.revTargetToDate * .9) out.push({ sev: 'info', title: `Revenue ${pct(1 - m.revTotal / m.revTargetToDate)} below target pace`, meta: `${egp(m.revTotal)} vs ${egp(m.revTargetToDate)} target to date`, t: m.snap, open: 'tab:revenue', src: 'Revenue' });
    }
    return out.sort((a, b) => SEV[a.sev] - SEV[b.sev] || b.t - a.t);
  }
  const SEV_IC = { critical: 'alert', serious: 'alert', warning: 'info', info: 'info' };

  /* ---------- building blocks ---------- */
  function panel(o) {
    const acts = (o.tags || []).map(t => `<span class="tag ${t.cls || ''}"${t.tip ? ` data-tip="${esc(t.tip)}"` : ''}>${t.icon ? icon(t.icon) : ''}${esc(t.text)}</span>`).join('') + (o.table ? `<button type="button" class="tview" data-action="tview" aria-pressed="false">${icon('table')}<span>Table</span></button>` : '') + (o.actions || '');
    return `<section class="panel span-${o.span || 12} ${o.cls || ''}" aria-labelledby="${o.id}-h" id="${o.id}">
      <header class="ph"><div><h2 id="${o.id}-h">${esc(o.title)}</h2>${o.sub ? `<p class="psub">${o.sub}</p>` : ''}</div>${acts ? `<div class="pact">${acts}</div>` : ''}</header>
      <div class="pb ${o.flush ? 'flush' : ''}">${o.body}</div>
      ${o.foot === false ? '' : `<footer class="pf"><span class="stamp">${icon('clock')}${esc(o.foot || stampText(o.m))}</span>${o.src ? `<span>${esc(o.src)}</span>` : ''}</footer>`}
    </section>`;
  }
  function chart(spec) {
    const html = CH.xy(spec);
    const id = html.match(/data-chart="(c\d+)"/)[1];
    return `<div class="cv"><div class="cv-chart">${html}</div><div class="cv-table" hidden>${CH.table(id)}</div></div>`;
  }
  function kpi(o) {
    const tag = o.open ? 'button' : 'div';
    return `<${tag} class="kpi ${o.cls || ''}" ${o.open ? `type="button" data-open="${o.open}"` : ''}>
      <span class="k-l">${icon(o.icon)}${esc(o.label)}</span>
      <span class="k-v">${o.value}</span>
      ${o.meter != null ? `<span class="meter" aria-hidden="true"><i style="width:${Math.min(100, o.meter * 100)}%;--c:${o.meterColor || 'var(--accent)'}"></i></span>` : ''}
      <span class="k-d">${o.detail || ''}</span></${tag}>`;
  }
  function delta(actual, target, { invert = false, suffix = 'vs target' } = {}) {
    if (!target || actual == null) return `<span class="delta flat">—</span>`;
    const d = actual / target - 1;
    const good = invert ? d <= 0 : d >= 0;
    const cls = Math.abs(d) < .005 ? 'flat' : good ? 'pos' : 'neg';
    return `<span class="delta ${cls}">${icon(d >= 0 ? 'up' : 'down')}${Math.abs(d * 100).toFixed(1)}%</span><span>${suffix}</span>`;
  }
  /* Sortable table. cols: {k, label, num, fmt(row), val(row), sort:false} */
  function table(id, cols, rows, o = {}) {
    if (!rows.length) return emptyMini(o.empty || 'Nothing to show for these filters.', o.emptyIcon);
    const st = S.sort[id];
    if (st) { const c = cols.find(x => x.k === st.k); if (c) { const v = c.val || (r => r[c.k]); rows = rows.slice().sort((a, b) => { const x = v(a), y = v(b); return (x == null) - (y == null) || (typeof x === 'string' ? x.localeCompare(y) : x - y) * (st.dir === 'asc' ? 1 : -1); }); } }
    const head = cols.map(c => `<th scope="col" class="${c.num ? 'num' : ''}">${c.sort === false ? esc(c.label) : `<button type="button" class="sort" data-action="sort" data-table="${id}" data-k="${c.k}" ${st && st.k === c.k ? `data-dir="${st.dir}"` : ''}>${esc(c.label)}</button>`}</th>`).join('');
    const body = rows.map(r => {
      const op = o.open ? o.open(r) : null;
      return `<tr${op ? ` class="click" tabindex="0" data-open="${op}"` : ''}>${cols.map((c, i) => { const v = c.fmt ? c.fmt(r) : esc(r[c.k] ?? '—'); return i === 0 ? `<th scope="row" class="${c.num ? 'num' : ''}">${v}</th>` : `<td class="${c.num ? 'num' : ''}">${v}</td>`; }).join('')}</tr>`;
    }).join('');
    return `<div class="tscroll ${o.max ? 'tmax' : ''}"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${o.foot ? `<tfoot>${o.foot}</tfoot>` : ''}</table></div>`;
  }
  const emptyMini = (t, ic = 'check') => `<div class="empty-mini">${icon(ic)}<span>${esc(t)}</span></div>`;
  const stateBlock = (ic, h, p, extra = '', cls = '') => `<div class="state ${cls}"><span class="s-ic">${icon(ic)}</span><h3>${esc(h)}</h3><p>${p}</p>${extra}</div>`;
  const nc = (t = 'Not connected') => `<span class="nc">${esc(t)}</span>`;
  const RO = { text: 'Read-only', icon: 'lock', cls: 'tag-ro', tip: 'Monitoring only. Equipment commands are disabled by default.' };
  const PW = { text: 'Park-wide', tip: 'This figure covers the whole park; the zone filter does not apply.' };
  const hourLabels = HOURS.map(h => `${String(h).padStart(2, '0')}:00`);
  const nowIdx = m => m.state === 'today' && m.nowH >= OPEN ? Math.min(HOURS.length - 1, Math.floor(m.nowH) - OPEN) : null;
  const dateTick = (l, i) => dayLabel(l, { day: 'numeric', month: 'short' });

  function guard(m, what = 'visitor and operations data', allDay = false) {
    if (m.state === 'future') return stateBlock('calendar', 'No data for this date yet', `${esc(dayLabel(m.date, { weekday: 'long', day: 'numeric', month: 'long' }))} is in the future, so there is no ${what}. Scheduled bookings are in the Events tab.`, `<div class="hero-actions" style="margin-top:6px"><button class="btn btn-sm" data-open="tab:events">Open Events</button><button class="btn btn-sm" data-action="today">Back to today</button></div>`);
    if (!allDay && m.state === 'today' && m.nowH < OPEN) return stateBlock('clock', 'The park opens at 10:00', 'Live figures start when the gates open. Pick yesterday to see a full day.', `<button class="btn btn-sm" data-action="yesterday">Show yesterday</button>`);
    return null;
  }

  /* ================= VIEWS ================= */
  const V = {};

  /* Overview: a live hub. Every branch opens its tab; the Rides branch fans out to each ride,
     and the selected ride shows its photo and data on the right (layout from the owner's design image). */
  V.overview = c => {
    const m = c.m, g = guard(m); if (g) return g;
    const vis = sum(c.live.map(d => d.visitors)), vt = sum(c.live.map(vTarget));
    const rev = sum(c.live.map(d => d.revTotal)), rt = sum(c.live.map(rTarget));
    const rf = ridesF(m), opr = rf.filter(r => r.status === 'operating' || r.status === 'limited');
    const qNow = r => m.state === 'today' ? r.queueNow : r.queueAvg;
    const qMax = rf.filter(r => qNow(r) != null).sort((a, b) => qNow(b) - qNow(a))[0];
    const resp = sum(c.live.map(d => d.responses));
    const csat = resp ? sum(c.live.map(d => (d.csat || 0) * d.responses)) / resp : null;
    const active = m.incidents.filter(i => i.status !== 'closed' && zOk(i.zone));
    const ins = m.state === 'today' ? m.insideNow : m.insidePeak;
    const us = c.live.map(d => ZP.utilities(d.date));
    const kwh = sum(us.map(u => u.kwh)), water = sum(us.map(u => u.potableM3 + u.irrM3));
    const L = ZP.lighting(m.date), G = ZP.landscape(m.date), U = ZP.utilities(m.date);
    const circ = L.circuits.filter(x => zOk(x.zone)), lightsOn = circ.filter(x => x.status === 'on').length;
    const la = landscapeAlerts(G);
    const outs = c.live.flatMap(d => d.outlets).filter(o => zOk(o.zone));
    const evs = m.events.filter(e => zOk(e.zone) && e.status !== 'cancelled');
    const wo = ZP.workOrders(m.date).filter(w => (w.status === 'overdue' || w.status === 'open' || w.status === 'in-progress') && zOk(w.zone));
    const alerts = buildAlerts(m);
    const per = c.multi ? ` · ${PERIODS[S.period].label}` : '';
    const u = (v, unit) => `${v}<small>${unit}</small>`;

    const NODES = [
      { tab: 'visitors', icon: 'users', label: 'Visitors', value: n(vis), sub: `${m.state === 'today' ? 'Guests inside' : 'Peak inside'}: ${n(ins)}`, warn: ins / m.capacity >= .9 },
      { tab: 'revenue', icon: 'coins', label: 'Revenue', value: `<small class="pre">EGP</small>${egpC(rev)}`, sub: rt ? `${pct(rev / rt)} of target${per}` : 'No target set', warn: rt && rev < rt * .9 },
      { tab: 'food', icon: 'cup', label: 'Food & Retail', value: `<small class="pre">EGP</small>${egpC(sum(outs.map(o => o.sales)))}`, sub: `Tenant sales · ${new Set(outs.map(o => o.id)).size} outlets` },
      { tab: 'events', icon: 'calendar', label: 'Events', value: u(evs.length, 'today'), sub: evs.length ? `${n(sum(evs.map(e => e.booked)))} guests booked` : 'No bookings' },
      { tab: 'rides', icon: 'wheel', label: 'Rides', value: `${opr.length}<small>/ ${rf.length}</small>`, sub: qMax ? `Longest queue: ${esc(qMax.name)} ${qNow(qMax)} min` : 'No rides running', hub: true, warn: rf.some(r => r.status === 'down') },
      { tab: 'guest', icon: 'smile', label: 'Guests', value: csat == null ? '—' : `${csat.toFixed(2)}<small>/ 5</small>`, sub: `${n(resp)} survey responses`, warn: csat != null && csat < 4.2 },
      { tab: 'safety', icon: 'shield', label: 'Safety & Maint.', value: u(wo.length, 'due'), sub: `Active incidents: ${active.length}`, warn: wo.some(w => w.status === 'overdue') || active.some(i => i.status === 'open') },
      { tab: 'utilities', icon: 'bolt', label: 'Utilities', value: u(n(kwh), 'kWh'), sub: `Water: ${n(water)} m³`, warn: U.leaks.length > 0 },
      { tab: 'landscape', icon: 'leaf', label: 'Landscape', value: circ.length ? pct(lightsOn / circ.length) : '—', sub: `Lights on · ${la.length} grounds alert${la.length === 1 ? '' : 's'}`, warn: la.length > 0 },
    ];
    const node = (x, i) => `<button type="button" class="hn${x.hub ? ' is-hub' : ''}${x.warn ? ' warn' : ''}" data-open="tab:${x.tab}" data-k="${x.tab}" style="--n:${i}" aria-label="${esc(x.label)}: open the ${esc(TABS.find(t => t.id === x.tab).label)} tab">
        <span class="hn-ic">${icon(x.icon)}</span><span class="hn-b"><span class="hn-r"><b>${esc(x.label)}</b><span class="hn-v">${x.value}</span></span><small>${x.sub}</small></span></button>`;

    if (!rf.some(r => r.id === S.ovRide)) S.ovRide = (rf.find(r => r.id === 'FW') || rf[0] || {}).id;
    const rideNode = (r, i) => {
      const q = qNow(r), st = ST[r.status] || ST.unknown;
      return `<button type="button" class="hr" data-action="ovride" data-k="${r.id}" aria-pressed="${r.id === S.ovRide}" style="--n:${i}">
        <img src="assets/rides/${ZP.RIDE_INFO[r.id].photo.file}" alt="" loading="lazy" decoding="async"><span class="hr-b"><b>${esc(r.name)}</b><small><i class="sd t-${st[1]}" aria-hidden="true"></i>${st[0]}${q == null ? '' : ` · ${q} min`}</small></span></button>`;
    };

    EXTRA.set('alerts', { title: 'Alerts', sub: snapText(m), body: alerts.length ? `<ul class="alerts">${alerts.map(alertItem).join('')}</ul>` : emptyMini('No active alerts for these filters.') });
    const crit = alerts.filter(a => a.sev === 'critical' || a.sev === 'serious').length;
    const core = `<div class="hub-core-wrap"><button type="button" class="hub-core" data-open="extra:alerts" aria-label="ZED Park live overview — ${alerts.length} alerts. Open the alert list.">
        <span class="hc-ic">${icon('wheel')}</span><span class="hc-t">ZED PARK</span><span class="hc-s">Live overview</span>
        <span class="hc-a${crit ? ' hot' : ''}">${icon(crit ? 'alert' : 'check')}${alerts.length ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'}` : 'All clear'}</span></button></div>`;

    const legend = `<div class="hub-legend" aria-hidden="true"><span><i class="sd t-good"></i>Running</span><span><i class="sd t-warning"></i>Limited</span><span><i class="sd t-serious"></i>Service</span><span><i class="sd t-critical"></i>Down</span></div>`;
    const hub = `<section class="hub" aria-label="Park overview. Each branch opens its tab; each ride shows its photo and data.">
        <div class="hub-bg" aria-hidden="true"></div><svg class="hub-links" aria-hidden="true"></svg>
        ${core}
        <nav class="hub-nodes" aria-label="Dashboard sections">${NODES.map(node).join('')}</nav>
        <div class="hub-rides" role="group" aria-label="Rides — select one to see its photo and data">${rf.length ? rf.map(rideNode).join('') : emptyMini(`No rides in ${zname(S.zone)}.`, 'wheel')}</div>
        <p class="hub-stamp">${icon('clock')}${esc(stampText(m))}</p>${legend}
      </section>`;
    const r = rf.find(x => x.id === S.ovRide);
    return `<div class="grid ov-grid">${hub}${r ? rideFocus(m, r) : ''}</div>`;
  };
  const alertItem = a => `<li><button type="button" class="alert t-${ST[a.sev][1]}" data-open="${a.open}"><span class="sev">${icon(SEV_IC[a.sev])}</span><span><b>${esc(a.title)}</b><span class="a-m">${esc(a.src)} · ${esc(a.meta)}</span></span><time>${a.t == null ? '' : hm(a.t)}</time></button></li>`;

  /* ---------- per-ride derived figures (demo model) ---------- */
  // Electricity per hour: rated power × hours running × load (busier = closer to rated).
  const rideKwh = (m, r) => r.hourly.map((h, i) => m.frac[i] > 0 ? +(r.kw * h.avail * m.frac[i] * (.55 + .45 * Math.min(1, h.util))).toFixed(1) : null);
  const rideRunH = (m, r) => sum(r.hourly.map((h, i) => h.avail * m.frac[i]));
  // Planned service every 30 days, phase fixed per ride, so the countdown moves one day per day.
  const dayNo = iso => Math.round(ZP.parse(iso) / 864e5);
  const serviceIn = (date, id) => { const ph = [...id].reduce((a, ch) => a + ch.charCodeAt(0) * 7, 0) % 30; return ((ph - dayNo(date)) % 30 + 30) % 30 || 30; };
  function rideNote(m, r) {
    const dueIn = serviceIn(m.date, r.id);
    if (r.status === 'down') { const w = r.down[r.down.length - 1]; return ['critical', 'alert', `Down since ${hm(w.start)} — ${w.reason}`]; }
    if (r.status === 'maintenance') return ['serious', 'wrench', 'Closed today for planned maintenance'];
    if (r.status === 'limited') return ['warning', 'info', r.limitNote];
    if (dueIn <= 10) return ['warning', 'wrench', `Service due in ${dueIn} day${dueIn === 1 ? '' : 's'}`];
    if (r.status === 'closed') return ['neutral', 'moon', 'Park closed'];
    return ['good', 'check', `Running normally · next service in ${dueIn} days`];
  }
  function rideFocus(m, r) {
    const info = ZP.RIDE_INFO[r.id], ph = info.photo, st = r.status || 'unknown';
    const kw = rideKwh(m, r), kTot = sum(kw.filter(v => v != null)), q = m.state === 'today' ? r.queueNow : r.queueAvg;
    const chk = m.inspections.filter(x => x.ride === r.id).sort((a, b) => a.time - b.time)[0];
    const dueIn = serviceIn(m.date, r.id), [tone, nic, note] = rideNote(m, r);
    const stat = (ic, l, v) => `<div class="rf-stat"><span class="rf-l">${icon(ic)}${l}</span><span class="rf-v">${v}</span></div>`;
    return `<section class="panel rfocus" id="p-focus" aria-labelledby="p-focus-h" aria-live="polite">
      <div class="rf-photo">
        <img src="assets/rides/${ph.file}" alt="Representative photo of a ${esc(info.type.toLowerCase())}" decoding="async">
        <div class="rf-cap"><span class="rf-type">${esc(info.type)} · ${esc(zname(r.zone))}</span><h2 id="p-focus-h">${esc(r.name)}</h2></div>
        ${pill(st)}
        <button type="button" class="rf-zoom" data-open="ride:${r.id}" aria-label="Open the photo and full data for ${esc(r.name)}"><span>${icon('table')}Photo &amp; full data</span></button>
      </div>
      <p class="rf-credit">Representative photo, not taken at ZED Park · <a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.artist)}, ${esc(ph.lic)}</a></p>
      <div class="rf-stats">
        ${stat('bolt', 'Energy', `${n(kTot)}<small>kWh</small>`)}${stat('clock', 'Run time', `${n1(rideRunH(m, r))}<small>h</small>`)}
        ${stat('users', 'Riders', n(r.riders))}${stat('clock', m.state === 'today' ? 'Queue' : 'Avg queue', q == null ? '—' : `${q}<small>min</small>`)}
      </div>
      <div class="rf-chart"><div class="rf-h"><h3>Electricity today</h3><span class="tag">Total ${n(kTot)} kWh · rated ${n1(r.kw)} kW</span></div>
        ${chart({ labels: hourLabels, xName: 'Hour', aria: `${r.name} electricity use by hour`, series: [{ name: 'Electricity (kWh)', kind: 'area', color: 'var(--s1)', values: kw }], fmt: v => n1(v) + ' kWh', now: nowIdx(m), height: 140, xw: 44, nullText: 'Not running' })}</div>
      <div class="rf-maint"><h3>${icon('wrench')}Maintenance plan</h3>
        <div class="rf-row"><span>Daily safety check</span><span class="muted">${chk ? `Today ${hm(chk.time)}` : '—'}</span>${chk ? pill(chk.result) : ''}</div>
        <div class="rf-row"><span>Planned service</span><span class="muted">${esc(dayLabel(ZP.addDays(m.date, dueIn), { day: 'numeric', month: 'short', year: 'numeric' }))}</span>${pill('scheduled')}</div>
      </div>
      <div class="rf-note t-${tone}">${icon(nic)}<span>${esc(note)}</span></div>
      <button type="button" class="btn rf-cta" data-open="ride:${r.id}">View ride details${icon('arrow')}</button>
    </section>`;
  }
  function selectRide(id) {
    S.ovRide = id;
    const m = ZP.day(S.date), r = ridesF(m).find(x => x.id === id), old = $('#p-focus');
    if (!r || !old) return;
    old.outerHTML = rideFocus(m, r);
    CH.prune(); CH.hydrate($('#main'));
    $$('#main .hr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === id)));
    markLinks();
  }
  /* Ride performance view: full-screen page for one ride (layout from the owner's screenshot).
     Opened from a ride on the Overview hub; the list on the left switches between rides. */
  function spark(vals, color = 'var(--accent)') {
    const pts = vals.filter(v => v != null); // hours with data only, spread across the card
    if (pts.length < 2) return '';
    const W = 120, H = 40, n = pts.length - 1, lo = Math.min(...pts), hi = Math.max(...pts), rg = hi - lo || 1;
    const xy = pts.map((v, i) => [+(i / n * W).toFixed(1), +(H - 3 - (v - lo) / rg * (H - 8)).toFixed(1)]);
    const d = xy.map((p, k) => `${k ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
    return `<svg class="rv-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="--c:${color}"><path class="sp-a" d="${d}L${W},${H}L0,${H}Z"/><path class="sp-l" d="${d}" pathLength="1"/></svg>`;
  }
  function donut(f) {
    const C = 2 * Math.PI * 52, v = f == null ? 0 : Math.max(0, Math.min(1, f));
    return `<svg class="rv-donut" viewBox="0 0 128 128" aria-hidden="true"><circle class="dn-t" cx="64" cy="64" r="52"/><circle class="dn-v" cx="64" cy="64" r="52" stroke-dasharray="${(v * C).toFixed(1)} ${C.toFixed(1)}" style="--len:${(v * C).toFixed(1)}"/></svg>`;
  }
  function rideView(m, r) {
    const info = ZP.RIDE_INFO[r.id], ph = info.photo, st = ST[r.status] || ST.unknown, today = m.state === 'today';
    const pm = ZP.day(ZP.addDays(m.date, -1)), pr = pm.rides.find(x => x.id === r.id);
    const live = i => m.frac[i] > 0;
    // prior day measured over the same hours as this day, so a part-day compares fairly
    const cyc = (rr, frac) => Math.round(sum(rr.hourly.map((h, i) => h.avail * frac[i])) * 60 / r.cycle);
    const cycH = r.hourly.map((h, i) => live(i) ? +(h.avail * m.frac[i] * 60 / r.cycle).toFixed(1) : null);
    const rides = cyc(r, m.frac), pRides = pr ? cyc(pr, m.frac) : null;
    const guests = r.riders, pGuests = pr ? Math.round(sum(pr.hourly.map((h, i) => h.riders * m.frac[i]))) : null;
    const qH = r.hourly.map((h, i) => live(i) ? h.queue : null), idx = nowIdx(m);
    const q = today ? r.queueNow : r.queueAvg;
    const pq = !pr ? null : today ? (idx == null ? null : pr.hourly[idx].queue) : pr.queueAvg;
    const offered = sum(r.hourly.map((h, i) => r.cap * h.avail * m.frac[i])), util = offered ? guests / offered : null;
    const seats = Math.round(r.cap * r.cycle / 60), cur = today && idx != null ? r.hourly[idx] : null;
    const load = cur && cur.avail > 0 && (r.status === 'operating' || r.status === 'limited') ? Math.round(seats * Math.min(1, cur.util)) : null;
    const dmin = (a, b) => { if (a == null || b == null) return '<span class="delta flat">—</span><span>vs. prior day</span>'; const d = a - b; return `<span class="delta ${d === 0 ? 'flat' : d < 0 ? 'pos' : 'neg'}">${icon(d > 0 ? 'up' : 'down')}${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} min</span><span>vs. prior day</span>`; };
    const dpct = (a, b) => { if (a == null || !b) return '<span class="delta flat">—</span><span>vs. prior day</span>'; const d = a / b - 1; return `<span class="delta ${Math.abs(d) < .005 ? 'flat' : d > 0 ? 'pos' : 'neg'}">${icon(d >= 0 ? 'up' : 'down')}${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(Math.round(d * 100))}%</span><span>vs. prior day</span>`; };
    const card = (l, v, d, sp) => `<div class="rv-kpi"><span class="rv-kl">${l}</span><span class="rv-kv">${v}</span><span class="rv-kd">${d}</span>${sp || ''}</div>`;
    const list = ridesF(m).map(x => { const s = ST[x.status] || ST.unknown, xq = today ? x.queueNow : x.queueAvg;
      return `<button type="button" class="rv-item" data-action="rvride" data-k="${x.id}" aria-pressed="${x.id === r.id}"><img src="assets/rides/${ZP.RIDE_INFO[x.id].photo.file}" alt="" decoding="async"><span><b>${esc(x.name)}</b><small><i class="sd t-${s[1]}" aria-hidden="true"></i>${s[0]}${xq == null ? '' : ` · ${xq} min`}</small></span></button>`; }).join('');
    const chH = Math.round(Math.max(150, Math.min(340, innerHeight * .36)));
    const hrs = hourLabels.map(l => { const h = +l.slice(0, 2); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; });
    return `<aside class="rv-list" aria-label="Rides"><h3>Rides (${ridesF(m).length})</h3><div class="rv-items">${list}</div></aside>
      <div class="rv-main">
        <header class="rv-h"><span class="rv-ic">${icon('wheel')}</span><div><h2 id="rvTitle">${esc(r.name)}</h2><p>Ride performance overview · ${esc(dayLabel(m.date))}${today ? ` · ${esc(snapText(m))}` : ''}</p></div>
          <button class="icon-btn rv-x" type="button" data-action="rvclose" aria-label="Close ride view">${icon('x')}</button></header>
        <div class="rv-top">
          ${card(today ? 'Wait time' : 'Average wait', q == null ? '—' : `${q}<small>min</small>`, dmin(q, pq), spark(qH))}
          ${card('Status', `<span class="rv-st"><i class="sd t-${st[1]}" aria-hidden="true"></i>${st[0]}</span>`, `<span>${today ? 'Uptime today' : 'Uptime'}</span><b>${r.availability == null ? '—' : pct(r.availability, 1)}</b>`, `<p class="rv-note">${esc(rideNote(m, r)[2])}</p>`)}
          ${card(today ? 'Rides today' : 'Rides run', n(rides), dpct(rides, pRides), spark(cycH))}
          ${card(today ? 'Guests today' : 'Guests', n(guests), dpct(guests, pGuests), spark(r.hourly.map((h, i) => live(i) ? h.riders : null)))}
          <figure class="rv-photo"><img src="assets/rides/${ph.file}" alt="Representative photo of a ${esc(info.type.toLowerCase())}" decoding="async"><figcaption>${esc(info.type)} · representative photo, not ZED Park · ${esc(ph.artist)}, ${esc(ph.lic)}</figcaption></figure>
        </div>
        <div class="rv-bot">
          <section class="rv-card rv-cap"><h3>Capacity utilization</h3>
            <div class="rv-dn">${donut(util)}<div class="rv-dv"><b>${util == null ? '—' : pct(util)}</b><span>Capacity utilization</span></div></div>
            <p class="rv-load"><span>${load != null ? 'Current load' : 'Seats per cycle'}</span><b>${load != null ? `${n(load)} / ${n(seats)} guests` : `${n(seats)} guests`}</b></p></section>
          <section class="rv-card"><h3>Hourly guests</h3>${chart({ labels: hrs, xName: 'Hour', aria: `${r.name} guests by hour`, series: [{ name: 'Guests', kind: 'bar', color: 'var(--accent)', values: r.hourly.map((h, i) => live(i) ? h.riders : null) }], fmt: v => `${n(v)} guests`, height: chH, nullText: 'Not yet' })}</section>
          <section class="rv-card"><h3>Wait time trend</h3>${chart({ labels: hrs, xName: 'Hour', aria: `${r.name} wait time by hour`, series: [{ name: 'Wait time', kind: 'area', color: 'var(--accent)', values: qH }], fmt: v => `${n(v)} min`, now: idx, height: chH, nullText: 'Not running' })}</section>
        </div>
      </div>`;
  }
  let rvFocus = null;
  function openRideView(id) {
    const m = ZP.day(S.date), r = ridesF(m).find(x => x.id === id); if (!r) return;
    const box = $('#rv'), wrap = $('#rideView'), was = !wrap.hidden;
    if (!was) rvFocus = document.activeElement;
    box.innerHTML = rideView(m, r); wrap.hidden = false;
    box.classList.remove('rv-in'); void box.offsetWidth; if (!reduce.matches) box.classList.add('rv-in');
    CH.prune(); CH.hydrate(box);
    (was ? $(`#rv .rv-item[data-k="${id}"]`) : box)?.focus({ preventScroll: true });
    $(`#rv .rv-item[aria-pressed="true"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function closeRideView() {
    const wrap = $('#rideView'); if (wrap.hidden) return;
    wrap.hidden = true; $('#rv').innerHTML = ''; CH.hide(); CH.prune();
    if (rvFocus && document.contains(rvFocus)) rvFocus.focus({ preventScroll: true });
  }
  /* Connector lines: measured from layout (offsets ignore entrance transforms), redrawn on resize. */
  function drawHub() {
    const hub = $('#main .hub'), svg = hub && $('.hub-links', hub);
    if (!svg || getComputedStyle(svg).display === 'none') return;
    const W = hub.clientWidth, H = hub.clientHeight;
    const box = el => { let x = 0, y = 0, e = el; while (e && e !== hub) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
    const curve = (x1, y1, x2, y2) => { const dx = Math.max(24, (x2 - x1) * .55); return `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + dx).toFixed(1)},${y1.toFixed(1)} ${(x2 - dx).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; };
    const link = (k, d, i, x2, y2) => `<path class="lk" data-k="${k}" d="${d}"/><path class="lk-flow" data-k="${k}" pathLength="1" style="--d:${i}" d="${d}"/><circle class="lk-dot" data-k="${k}" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="3.5"/>`;
    const c = box($('.hub-core', hub)), cx = c.x + c.w, cy = c.y + c.h / 2;
    let out = '';
    $$('.hn', hub).forEach((nd, i) => { const b = box(nd); out += link(nd.dataset.k, curve(cx, cy, b.x, b.y + b.h / 2), i, b.x, b.y + b.h / 2); });
    const rn = $('.hn.is-hub', hub);
    if (rn) { const b = box(rn), x1 = b.x + b.w, y1 = b.y + b.h / 2; $$('.hr', hub).forEach((h, i) => { const t = box(h); out += link('ride-' + h.dataset.k, curve(x1, y1, t.x, t.y + t.h / 2), i, t.x, t.y + t.h / 2); }); out += `<circle class="lk-dot hubdot" cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4.5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    markLinks();
  }
  function markLinks(hot) {
    $$('#main .hub-links [data-k]').forEach(p => {
      const k = p.dataset.k;
      p.classList.toggle('sel', k === 'ride-' + S.ovRide || k === 'rides');
      p.classList.toggle('hot', !!hot && (k === hot || (hot.startsWith('ride-') && k === 'rides')));
    });
  }
  const hubHover = e => { const t = e.target.closest?.('#main .hn, #main .hr'); markLinks(t ? (t.classList.contains('hr') ? 'ride-' : '') + t.dataset.k : null); };
  document.addEventListener('pointerover', hubHover);
  document.addEventListener('focusin', hubHover);
  function landscapeAlerts(G) {
    const a = [];
    G.sensors.filter(s => s.status === 'dry' && zOk(s.zone)).forEach(s => a.push({ short: `${s.id} dry`, sev: 'warning', title: `Soil dry — ${s.area}`, meta: `${s.id} · ${zname(s.zone)}${s.vwc == null ? '' : ' · ' + n1(s.vwc) + '% moisture'}`, open: `sensor:${s.id}`, src: 'Soil sensors' }));
    G.valves.filter(v => v.status === 'fault' && zOk(v.zone)).forEach(v => a.push({ short: `${v.id} fault`, sev: 'serious', title: `Valve fault — ${v.area}`, meta: `${v.id} · ${zname(v.zone)}`, open: `valve:${v.id}`, src: 'Irrigation valves' }));
    G.leaks.filter(l => zOk(l.zone)).forEach(l => a.push({ short: 'Leak suspected', sev: 'critical', title: `Suspected leak — ${zname(l.zone)}`, meta: l.note, open: `meter:${l.meter}`, src: 'Leak detection' }));
    G.tasks.filter(t => t.status === 'overdue' && zOk(t.zone)).forEach(t => a.push({ short: 'Task overdue', sev: 'warning', title: `Overdue — ${t.task}`, meta: `${zname(t.zone)} · ${t.team}`, open: `ltask:${t.id}`, src: 'Landscape tasks' }));
    return a;
  }

  V.visitors = c => {
    const m = c.m, g = guard(m); if (g) return g;
    const vis = sum(c.live.map(d => d.visitors)), vt = sum(c.live.map(vTarget));
    const tk = ZP.TICKETS.map(t => ({ ...t, count: sum(c.live.map(d => d.tickets.find(x => x.id === t.id).count)), revenue: sum(c.live.map(d => d.tickets.find(x => x.id === t.id).revenue)) }));
    const tRev = sum(tk.map(t => t.revenue));
    const ch = ['online', 'gate', 'group'].map(id => ({ id, name: m.channels.find(x => x.id === id).name, count: sum(c.live.map(d => d.channels.find(x => x.id === id).count)) }));
    const peakDay = c.live.reduce((a, d) => d.insidePeak > (a?.insidePeak || 0) ? d : a, null);
    const pk = peakDay ? peakDay.inside.indexOf(peakDay.insidePeak) : -1;
    const kpis = `<div class="kpis">
      ${kpi({ icon: 'users', label: 'Visitors', value: n(vis), detail: delta(vis, vt, { suffix: m.state === 'today' && !c.multi ? 'vs target pace' : 'vs target' }) })}
      ${kpi({ icon: 'ticket', label: 'Ticket revenue', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(tRev)}`, detail: `${egp(vis ? tRev / vis : null)} average yield` })}
      ${kpi({ icon: 'database', label: 'Online pre-booked', value: pct(ch[0].count / vis), detail: `${n(ch[0].count)} tickets` })}
      ${kpi({ icon: 'wheel', label: 'Wristband share', value: pct(tk.find(t => t.id === 'WRB').count / vis), detail: 'Unlimited rides' })}
      ${kpi({ icon: 'users', label: 'Peak guests inside', value: `${n(peakDay?.insidePeak)}<small>/ ${n(m.capacity)}</small>`, meter: (peakDay?.insidePeak || 0) / m.capacity, detail: peakDay ? `${hourLabels[pk]} · ${c.multi ? dayLabel(peakDay.date) : pct(peakDay.insidePeak / m.capacity) + ' of capacity'}` : '—' })}
    </div>`;
    const pace = c.multi
      ? chart({ labels: c.dates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: 'Visitors', kind: 'bar', color: 'var(--s1)', values: c.all.map(d => d.state === 'future' ? null : d.visitors) }], target: { name: 'Daily target', values: c.all.map(d => d.targetVisitors), step: true }, height: 260 })
      : chart({ labels: hourLabels, xName: 'Hour', aria: 'Cumulative visitors against target pace', series: [{ name: 'Visitors (cumulative)', kind: 'area', color: 'var(--s1)', values: m.arrivals.map((_, i) => m.frac[i] > 0 ? sum(m.arrivals.slice(0, i + 1)) : null) }], target: { name: 'Target pace', values: m.targetCum }, now: nowIdx(m), height: 260, xw: 40 });
    const occ = chart({ labels: hourLabels, xName: 'Hour', aria: 'Guests inside by hour', series: [{ name: 'Guests inside', kind: 'area', color: 'var(--s2)', values: m.inside }], target: { name: 'Comfort limit (90%)', value: m.capacity * .9 }, yMax: CH.niceMax(m.capacity), now: nowIdx(m), height: 220, xw: 40, tipExtra: i => m.inside[i] == null ? '' : `${pct(m.inside[i] / m.capacity)} of capacity` });
    const trendDates = Array.from({ length: 30 }, (_, i) => ZP.addDays(S.date, i - 29));
    const trendDays = trendDates.map(ZP.day);
    const trend = chart({ labels: trendDates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: 'Visitors', kind: 'bar', color: 'var(--s1)', values: trendDays.map(d => d.state === 'future' ? null : d.visitors), dim: trendDays.map(d => d.dow === 5 || d.dow === 6 ? false : true) }], target: { name: 'Daily target', values: trendDays.map(d => d.targetVisitors), step: true }, height: 220, tipExtra: i => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][trendDays[i].dow] + (trendDays[i].dow >= 5 ? ' · weekend' : '') });
    const tTable = table('tickets', [
      { k: 'name', label: 'Ticket type' }, { k: 'price', label: 'Price', num: true, fmt: r => r.price ? egp(r.price) : 'Free' },
      { k: 'count', label: 'Sold', num: true, fmt: r => n(r.count) }, { k: 'share', label: 'Share', num: true, val: r => r.count, fmt: r => pct(r.count / vis, 1) },
      { k: 'revenue', label: 'Revenue', num: true, fmt: r => egpT(r.revenue) }], tk, { foot: `<tr><th scope="row">Total</th><td></td><td class="num">${n(vis)}</td><td class="num">100%</td><td class="num">${egpT(tRev)}</td></tr>` });
    const chBody = CH.stack(ch.map((x, i) => ({ label: x.name, value: x.count, color: `var(--s${i + 1})` })), v => n(v)) + CH.bars(ch.map((x, i) => ({ label: x.name, value: x.count, display: n(x.count), color: `var(--s${i + 1})`, sub: pct(x.count / vis) })));
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-pace', span: 5, title: c.multi ? 'Visitors against target' : 'Visitors against target pace', sub: c.multi ? 'Daily visitors; dashed line is the daily target' : 'Cumulative tickets scanned at the gates; dashed line is the target pace', body: pace, table: true, m, src: 'Source: ticketing (demo)' })}
      ${panel({ id: 'p-occ', span: 4, title: 'Guests inside the park', sub: `${c.multi ? dayLabel(m.date) + ' · ' : ''}Capacity ${n(m.capacity)}; dashed line is the 90% comfort limit`, body: occ, table: true, m })}
      ${panel({ id: 'p-ch', span: 3, title: 'Sales channels', sub: 'Where visitors bought tickets', body: chBody, m })}
      ${panel({ id: 'p-trend', span: 6, title: '30-day visitor trend', sub: 'Weekend days (Fri–Sat) at full strength; weekdays lighter', body: trend, table: true, m })}
      ${panel({ id: 'p-tk', span: 6, title: 'Ticket sales by type', sub: c.multi ? PERIODS[S.period].label + ' ending ' + dayLabel(S.date) : dayLabel(S.date), body: tTable, flush: true, m })}
    </div>`;
  };

  V.rides = c => {
    const m = c.m, g = guard(m, 'ride data'); if (g) return g;
    const rf = ridesF(m);
    const showFW = rf.some(r => r.id === 'FW');
    const agg = id => { const rs = c.live.map(d => d.rides.find(x => x.id === id)); return { riders: sum(rs.map(x => x.riders)), downMin: sum(rs.map(x => x.downMin)), avail: rs.length ? sum(rs.map(x => x.availability ?? 1)) / rs.length : null, qAvg: (() => { const q = rs.map(x => x.queueAvg).filter(v => v != null); return q.length ? Math.round(sum(q) / q.length) : null; })() }; };
    const rows = rf.map(r => ({ ...r, ...(c.multi ? agg(r.id) : { avail: r.availability, qAvg: r.queueAvg }) }));
    const opr = rf.filter(r => r.status === 'operating' || r.status === 'limited');
    const qs = rf.map(r => m.state === 'today' ? r.queueNow : r.queueAvg).filter(q => q != null);
    const kpis = `<div class="kpis">
      ${kpi({ icon: 'wheel', label: 'Operating rides', value: `${opr.length}<small>/ ${rf.length}</small>`, detail: snapText(m) })}
      ${kpi({ icon: 'clock', label: m.state === 'today' ? 'Average queue now' : 'Average queue', value: qs.length ? `${Math.round(sum(qs) / qs.length)}<small>min</small>` : '—', detail: '40-minute guest promise' })}
      ${kpi({ icon: 'users', label: 'Riders', value: n(sum(rows.map(r => r.riders))), detail: c.multi ? PERIODS[S.period].label : 'Today so far' })}
      ${kpi({ icon: 'check', label: 'Availability', value: pct(rows.length ? sum(rows.map(r => r.avail ?? 1)) / rows.length : null, 1), detail: 'Of scheduled operating time' })}
      ${kpi({ icon: 'wrench', label: 'Downtime', value: `${n(sum(rows.map(r => r.downMin)))}<small>min</small>`, detail: 'Unplanned stops and maintenance' })}
    </div>`;
    if (!rf.length) return `<div class="grid">${kpis}${stateBlock('wheel', `No rides in ${zname(S.zone)}`, 'Rides are in Family Rides, Thrill Rides and Ferris Wheel Plaza. Change the zone filter to see them.', `<button class="btn btn-sm" data-action="clear-zone">Show all zones</button>`)}</div>`;
    const rTable = table('rides', [
      { k: 'name', label: 'Ride', fmt: r => `${esc(r.name)}<span class="sub">${esc(zname(r.zone))}</span>` },
      { k: 'status', label: 'Status', fmt: r => pill(r.status || 'unknown') },
      { k: 'queueNow', label: m.state === 'today' ? 'Queue now' : 'Queue at 23:00', num: true, val: r => r.queueNow, fmt: r => r.queueNow == null ? '—' : `${r.queueNow} min` },
      { k: 'riders', label: 'Riders', num: true, fmt: r => n(r.riders) },
      { k: 'avail', label: 'Availability', num: true, fmt: r => pct(r.avail, 1) },
      { k: 'downMin', label: 'Downtime', num: true, fmt: r => r.downMin ? `${n(r.downMin)} min` : '—' }], rows, { open: r => `ride:${r.id}` });
    const qSeries = (S.ride !== 'all' ? rf : rf.filter(r => ['FW', 'CST', 'SWG'].includes(r.id))).slice(0, 3);
    const qChart = chart({ labels: hourLabels, xName: 'Hour', aria: 'Queue time by hour', series: qSeries.map((r, i) => ({ name: r.name, kind: 'line', color: `var(--s${i + 1})`, values: r.hourly.map(h => h.queue) })), target: { name: 'Guest promise (40 min)', value: 40 }, fmt: v => `${v} min`, yFmt: v => `${v}`, now: nowIdx(m), height: 240, xw: 40, nullText: 'Not running' });
    const riders = CH.bars(rows.slice().sort((a, b) => b.riders - a.riders).map(r => ({ label: r.name, value: r.riders, display: n(r.riders), color: 'var(--s1)', sub: c.multi ? '' : `${pct(r.riders / Math.max(1, sum(r.hourly.map((h, i) => r.cap * h.avail * m.frac[i]))))} of capacity`, open: `ride:${r.id}` })));
    const log = [];
    c.live.forEach(d => d.rides.filter(r => zOk(r.zone) && rOk(r.id)).forEach(r => { r.down.forEach(w => log.push({ date: d.date, ride: r.name, id: r.id, start: w.start, end: Math.min(w.end, d.nowH), reason: w.reason, live: d.state === 'today' && d.nowH < w.end })); if (r.maintenance) log.push({ date: d.date, ride: r.name, id: r.id, start: OPEN, end: Math.min(CLOSE, d.nowH), live: d.state === 'today' && d.nowH < CLOSE, reason: 'Planned maintenance — closed all day', planned: true }); }));
    log.sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start);
    const logTable = table('downlog', [
      { k: 'ride', label: 'Ride', fmt: r => `${esc(r.ride)}${c.multi ? `<span class="sub">${esc(dayLabel(r.date))}</span>` : ''}` },
      { k: 'start', label: 'From', num: true, fmt: r => hm(r.start) }, { k: 'end', label: 'To', num: true, fmt: r => r.live ? 'Ongoing' : hm(r.end) },
      { k: 'dur', label: 'Duration', num: true, val: r => r.end - r.start, fmt: r => `${Math.round((r.end - r.start) * 60)} min` },
      { k: 'reason', label: 'Reason', fmt: r => r.planned ? `${pill('maintenance')} ${esc(r.reason)}` : esc(r.reason) }], log, { open: r => `ride:${r.id}`, empty: 'No downtime recorded — every ride ran its full schedule.', max: true });
    const logBtn = extra('downlog', 'Downtime log', 'Unplanned stops and planned maintenance', logTable, `Downtime log${log.length ? ` (${log.length})` : ''}`);
    return `<div class="grid">${kpis}
      ${showFW ? ferrisPanel(m) : panel({ id: 'p-riders', span: 5, title: 'Riders by ride', sub: c.multi ? PERIODS[S.period].label : 'Today and share of available capacity', body: riders, m })}
      ${panel({ id: 'p-rt', span: 7, cls: 'row-2', title: 'Ride availability', sub: `${snapText(m)} · select a ride for detail`, body: rTable, flush: true, m, tags: [RO], actions: logBtn })}
      ${panel({ id: 'p-q', span: 5, title: 'Queue time by hour', sub: S.ride !== 'all' ? esc(RIDES.find(r => r.id === S.ride).name) + (c.multi ? ' · ' + dayLabel(m.date) : '') : `Most popular rides${c.multi ? ' · ' + dayLabel(m.date) : ''}; pick an attraction to focus`, body: qChart, table: true, m })}
    </div>`;
  };
  function ferrisPanel(m) {
    const r = m.rides.find(x => x.id === 'FW'), f = r.ferris;
    const L = ZP.lighting(m.date).circuits.find(c => c.id === 'LC-FWP-01');
    const cabs = Array.from({ length: f.cabins }, (_, i) => { const a = i / f.cabins * Math.PI * 2; const out = i >= f.inService; const vip = !out && i % 18 === 0; return `<rect class="cab ${out ? 'out' : vip ? 'vip' : ''}" x="${120 + Math.cos(a) * 92 - 5}" y="${110 + Math.sin(a) * 92 - 5}" width="10" height="10" rx="3"/>`; }).join('');
    const spokes = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI; return `<line class="spoke" x1="${120 + Math.cos(a) * 92}" y1="${110 + Math.sin(a) * 92}" x2="${120 - Math.cos(a) * 92}" y2="${110 - Math.sin(a) * 92}"/>`; }).join('');
    const spinning = r.status === 'operating' || r.status === 'limited';
    const wheel = `<svg class="wheel ${spinning ? 'spin' : ''}" viewBox="0 0 240 236" role="img" aria-label="Ferris Wheel: ${f.inService} of ${f.cabins} cabins in service"><g class="rot"><circle class="rim" cx="120" cy="110" r="92"/><circle class="rim" cx="120" cy="110" r="60"/>${spokes}${cabs}</g><circle cx="120" cy="110" r="7" fill="var(--ink-3)"/><line class="leg" x1="120" y1="110" x2="78" y2="228"/><line class="leg" x1="120" y1="110" x2="162" y2="228"/><line class="leg" x1="58" y1="230" x2="182" y2="230"/></svg>`;
    const fact = (l, v, s = '') => `<div class="fact"><div class="f-l">${esc(l)}</div><div class="f-v">${v}</div>${s ? `<div class="f-s">${s}</div>` : ''}</div>`;
    const windPct = f.wind / f.windLimit;
    const body = `<div class="ferris">${wheel}<div>
      <div class="fw-st" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;font-size:12.5px">${pill(r.status || 'unknown')}<span class="muted">${esc(r.limitNote || (r.status === 'down' ? r.down.find(w => m.snap >= w.start && m.snap < w.end)?.reason : r.status === 'maintenance' ? 'Planned maintenance today' : 'Normal rotation'))} · inspected ${f.lastInspection}, passed</span></div>
      <div class="facts">
        ${fact(m.state === 'today' ? 'Queue now' : 'Queue at 23:00', r.queueNow == null ? '—' : `${r.queueNow}<small>min</small>`, `Avg ${r.queueAvg ?? '—'} · peak ${r.queueMax ?? '—'} min`)}
        ${fact('Riders today', n(r.riders), `Utilisation ${pct(f.utilisation)}`)}
        ${fact('Cabins in service', `${f.inService}<small>/ ${f.cabins}</small>`, `${f.vipCabins} VIP · ${f.rotation}-min turn`)}
        ${fact('Wind at hub', `${n1(f.wind)}<small>m/s</small>`, `<span class="meter" style="display:block;margin:4px 0"><i style="width:${windPct * 100}%;--c:${windPct > .8 ? 'var(--serious)' : 'var(--s2)'}"></i></span>Hold at ${f.windLimit} m/s`)}
      </div>
      <p class="fw-led" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;font-size:12px;color:var(--ink-2)">LED show ${pill(L.status)}${typeof L.brightness === 'number' && L.status === 'on' ? ` ${L.brightness}%` : ''}<span>· Occupancy sensors ${nc()}</span></p></div></div>`;
    return panel({ id: 'p-fw', span: 5, title: 'Ferris Wheel', sub: `${snapText(m)} · Ferris Wheel Plaza`, body, m, tags: [RO], actions: `<button class="tview" type="button" data-open="ride:FW">Details${icon('chev')}</button>` });
  }

  function revHourly(m) {
    return HOURS.map((h, i) => {
      const t = m.visitors ? m.arrivals[i] * m.revenue.tickets / m.visitors : 0;
      const rd = sum(m.rides.map(r => r.hourly[i].riders * (1 - m.wristShare) * r.ppr));
      const ten = sum(m.outlets.map(o => o.hourly[i] * o.comm)) + (i === 0 && m.frac[0] > 0 ? m.revenue.rent : 0);
      const ev = sum(m.events.filter(e => e.status !== 'scheduled' && e.status !== 'cancelled' && Math.floor(e.start) === h).map(e => e.revenue)) + (m.visitors ? m.arrivals[i] * m.revenue.parking / m.visitors : 0);
      return m.frac[i] > 0 ? { t, rd, ten, ev } : null;
    });
  }
  V.revenue = c => {
    const m = c.m, g = guard(m, 'revenue'); if (g) return g;
    const rev = sum(c.live.map(d => d.revTotal)), rt = sum(c.live.map(rTarget));
    const vis = sum(c.live.map(d => d.visitors));
    const st = Object.fromEntries(STREAMS.map(([k]) => [k, sum(c.live.map(d => d.revenue[k]))]));
    const tenantSales = sum(c.live.map(d => d.tenantSales));
    const kpis = `<div class="kpis">
      ${kpi({ icon: 'coins', label: 'Park revenue', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(rev)}`, detail: delta(rev, rt, { suffix: m.state === 'today' && !c.multi ? 'vs target pace' : 'vs target' }) })}
      ${kpi({ icon: 'coins', label: 'Target', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(rt)}`, detail: m.state === 'today' && !c.multi ? `Pace to now · full day EGP ${egpC(m.revTarget)}` : 'Sum of daily targets' })}
      ${kpi({ icon: 'users', label: 'Revenue per visitor', value: `<small style="margin:0 4px 0 0">EGP</small>${n(vis ? rev / vis : null)}`, detail: delta(vis ? rev / vis : null, 345, { suffix: 'vs EGP 345' }) })}
      ${kpi({ icon: 'ticket', label: 'Ticketing share', value: pct(st.tickets / rev), detail: `Non-ticket income EGP ${egpC(rev - st.tickets)}` })}
      ${kpi({ icon: 'cup', label: 'Park income from tenants', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(st.commission + st.rent)}`, detail: `On EGP ${egpC(tenantSales)} tenant sales` })}
    </div>`;
    let main;
    const SER = [['t', 'Ticketing'], ['rd', 'Ride tickets'], ['ten', 'Tenant income'], ['ev', 'Events & parking']];
    // each column shows one measure in one colour; the buttons pick which (total, or a single stream)
    const rs = SER.some(([k]) => k === S.rstream) ? S.rstream : 'all', rsi = SER.findIndex(([k]) => k === rs);
    const rName = rs === 'all' ? 'Total park revenue' : SER[rsi][1], rCol = rs === 'all' ? 'var(--accent)' : `var(--s${rsi + 1})`;
    const pickV = v => v ? Math.round(rs === 'all' ? v.t + v.rd + v.ten + v.ev : v[rs]) : null;
    const parts = vs => i => vs[i] ? SER.map(([k, l], j) => ({ label: l, value: Math.round(vs[i][k]), color: `var(--s${j + 1})` })) : null;
    const rSeg = `<div class="cseg"><div class="seg" role="group" aria-label="Revenue shown">${[['all', 'All revenue'], ...SER].map(([k, l]) => `<button type="button" data-action="rstream" data-k="${k}" aria-pressed="${rs === k}">${l}</button>`).join('')}</div></div>`;
    if (c.multi) {
      const vals = c.all.map(d => d.state === 'future' ? null : { t: d.revenue.tickets, rd: d.revenue.rides, ten: d.revenue.commission + d.revenue.rent, ev: d.revenue.events + d.revenue.parking });
      main = chart({ labels: c.dates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: rName, kind: 'bar', color: rCol, values: vals.map(pickV) }], target: rs === 'all' ? { name: 'Daily target', values: c.all.map(d => d.revTarget), step: true } : null, breakdown: rs === 'all' ? parts(vals) : null, fmt: v => egp(v), height: 240 });
    } else {
      const hv = revHourly(m);
      main = chart({ labels: hourLabels, xName: 'Hour', series: [{ name: rName, kind: 'bar', color: rCol, values: hv.map(pickV) }], breakdown: rs === 'all' ? parts(hv) : null, fmt: v => egp(v), now: nowIdx(m), height: 240, xw: 40 });
    }
    main = rSeg + main;
    const sTable = table('streams', [
      { k: 'label', label: 'Stream' }, { k: 'actual', label: 'Actual', num: true, fmt: r => egpT(r.actual) }, { k: 'target', label: 'Target', num: true, fmt: r => egpT(r.target) },
      { k: 'var', label: 'Variance', num: true, val: r => r.actual / r.target - 1, fmt: r => `<span class="delta ${r.actual >= r.target ? 'pos' : 'neg'}">${icon(r.actual >= r.target ? 'up' : 'down')}${Math.abs((r.actual / r.target - 1) * 100).toFixed(1)}%</span>` },
      { k: 'share', label: 'Share', num: true, val: r => r.actual, fmt: r => pct(r.actual / rev, 1) }],
      STREAMS.map(([k, l]) => ({ label: l, actual: st[k], target: rt * STREAM_BUDGET[k] })),
      { foot: `<tr><th scope="row">Total park revenue</th><td class="num">${egpT(rev)}</td><td class="num">${egpT(rt)}</td><td class="num">${delta(rev, rt, { suffix: '' })}</td><td class="num">100%</td></tr>` });
    const tenants = ZP.OUTLETS.map(o => { const ds = c.live.map(d => d.outlets.find(x => x.id === o.id)); return { ...o, sales: sum(ds.map(x => x.sales)), commission: sum(ds.map(x => x.commission)), rent: sum(ds.map(x => x.rentDay)) }; }).filter(o => zOk(o.zone));
    const tsplit = `<div class="ten-strip">
      <div><span class="ts-l">Tenant gross sales <span class="tag" data-tip="Reported by tenants' point-of-sale systems. This is the tenants' money, not park revenue." tabindex="0">Not park revenue</span></span><b>${egpT(sum(tenants.map(t => t.sales)))}</b></div>
      <div><span class="ts-l">Park income from tenants</span><b>${egpT(sum(tenants.map(t => t.commission + t.rent)))}</b><small>Commission ${egpT(sum(tenants.map(t => t.commission)))} · rent ${egpT(sum(tenants.map(t => t.rent)))}</small></div></div>`;
    const tTable = table('tenants', [
      { k: 'name', label: 'Tenant', fmt: r => `${esc(r.name)}<span class="sub" title="${esc(r.cat)} · ${esc(zname(r.zone))}">${esc(r.cat)} · ${esc(zname(r.zone))}</span>` },
      { k: 'sales', label: 'Tenant sales', num: true, fmt: r => egpT(r.sales) },
      { k: 'commission', label: 'Commission', num: true, fmt: r => `${egpT(r.commission)}<span class="sub">${pct(r.comm)} rate</span>` }, { k: 'rent', label: 'Rent', num: true, fmt: r => egpT(r.rent) },
      { k: 'park', label: 'Park income', num: true, val: r => r.commission + r.rent, fmt: r => `<b>${egpT(r.commission + r.rent)}</b>` }], tenants, { open: r => `outlet:${r.id}`, empty: `No tenants in ${zname(S.zone)}.` });
    const tdates = Array.from({ length: 30 }, (_, i) => ZP.addDays(S.date, i - 29)), tdays = tdates.map(ZP.day);
    const trend = chart({ labels: tdates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: 'Park revenue', kind: 'line', color: 'var(--s1)', values: tdays.map(d => d.state === 'future' ? null : d.revTotal) }], target: { name: 'Daily target', values: tdays.map(d => d.revTarget), step: true }, fmt: v => egp(v), height: 220 });
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-rmain', span: 8, title: c.multi ? 'Daily revenue by stream' : 'Revenue by hour', sub: c.multi ? (rs === 'all' ? 'Total park revenue per day; dashed line is the daily target' : `${rName} per day`) : (rs === 'all' ? 'Total park revenue earned each hour · select a column for its streams' : `${rName} earned each hour`), body: main, table: true, m, tags: [PW] })}
      ${panel({ id: 'p-rtrend', span: 4, title: '30-day revenue', sub: 'Daily park revenue against target', body: trend, table: true, m })}
      ${panel({ id: 'p-streams', span: 5, title: 'Revenue against target by stream', sub: 'Targets split from the daily budget', body: sTable, flush: true, m })}
      ${panel({ id: 'p-ten', span: 7, title: 'Tenant sales and park income', sub: 'Tenant sales are kept separate from the park’s commission and rental income', body: tsplit + tTable, m, src: 'Source: tenant POS (demo)' })}
    </div>`;
  };

  V.food = c => {
    const m = c.m, g = guard(m, 'sales data'); if (g) return g;
    const outs = ZP.OUTLETS.filter(o => zOk(o.zone)).map(o => {
      const ds = c.live.map(d => d.outlets.find(x => x.id === o.id));
      const cur = m.outlets.find(x => x.id === o.id);
      const sales = sum(ds.map(x => x.sales)), txns = sum(ds.map(x => x.txns));
      const svc = m.state === 'today' ? cur.svcNow : cur.svcAvg;
      return { ...o, sales, txns, avgTkt: txns ? sales / txns : null, commission: sum(ds.map(x => x.commission)), svc, svcAvg: cur.svcAvg, svcState: svc == null ? 'svc-closed' : svc > o.svc * 1.2 ? 'svc-slow' : 'svc-ok', hourly: cur.hourly };
    });
    const vis = sum(c.live.map(d => d.visitors));
    const tot = sum(outs.map(o => o.sales)), tx = sum(outs.map(o => o.txns));
    const svcW = outs.filter(o => o.svc != null);
    const avgSvc = svcW.length ? sum(svcW.map(o => o.svc * o.txns)) / Math.max(1, sum(svcW.map(o => o.txns))) : null;
    const avgTgt = svcW.length ? sum(svcW.map(o => o.svc_t = o.svc_t || ZP.OUTLETS.find(x => x.id === o.id).svc * o.txns)) / Math.max(1, sum(svcW.map(o => o.txns))) : null;
    const kpis = `<div class="kpis">
      ${kpi({ icon: 'cup', label: 'Tenant sales', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(tot)}`, detail: 'Tenants’ gross — not park revenue' })}
      ${kpi({ icon: 'ticket', label: 'Transactions', value: n(tx), detail: `Average ticket ${egp(tx ? tot / tx : null)}` })}
      ${kpi({ icon: 'users', label: 'Spend per visitor', value: `<small style="margin:0 4px 0 0">EGP</small>${n(vis ? tot / vis : null)}`, detail: S.zone === 'all' ? 'All outlets' : `Outlets in ${esc(zname(S.zone))}` })}
      ${kpi({ icon: 'clock', label: m.state === 'today' ? 'Service time now' : 'Average service time', value: avgSvc == null ? '—' : `${n1(avgSvc)}<small>min</small>`, detail: delta(avgSvc, avgTgt, { invert: true, suffix: `vs ${n1(avgTgt)} min target` }) })}
      ${kpi({ icon: 'coins', label: 'Park commission', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(sum(outs.map(o => o.commission)))}`, detail: 'Earned on tenant sales' })}
    </div>`;
    if (!outs.length) return `<div class="grid">${kpis}${stateBlock('cup', `No outlets in ${zname(S.zone)}`, 'Food and retail outlets are in the Food Court, Retail Promenade, Ferris Wheel Plaza and Central Garden.', `<button class="btn btn-sm" data-action="clear-zone">Show all zones</button>`)}</div>`;
    const oTable = table('outlets', [
      { k: 'name', label: 'Outlet', fmt: r => `${esc(r.name)}<span class="sub">${esc(r.cat)} · ${esc(zname(r.zone))}</span>` },
      { k: 'sales', label: 'Sales', num: true, fmt: r => egpT(r.sales) }, { k: 'txns', label: 'Transactions', num: true, fmt: r => n(r.txns) },
      { k: 'avgTkt', label: 'Avg ticket', num: true, fmt: r => egp(r.avgTkt) },
      { k: 'svc', label: m.state === 'today' ? 'Service now' : 'Service time', num: true, fmt: r => `${r.svc == null ? '—' : `${n1(r.svc)} min`}<span class="sub">target ${ZP.OUTLETS.find(x => x.id === r.id).svc} min</span>` },
      { k: 'svcState', label: 'Service', fmt: r => pill(r.svcState) }], outs, { open: r => `outlet:${r.id}` });
    const cats = ['Food & beverage', 'Retail'];
    const fc = cats.includes(S.fcat) ? S.fcat : 'all', fci = cats.indexOf(fc);
    const fName = fc === 'all' ? 'All tenant sales' : fc, fCol = fc === 'all' ? 'var(--accent)' : `var(--s${fci + 1})`, fIn = ct => fc === 'all' || ct === fc;
    const per = (os, ct) => cats.map((x, j) => ({ label: x, color: `var(--s${j + 1})`, value: ct(x) }));
    const dCat = (d, ct) => sum(d.outlets.filter(o => o.cat === ct && zOk(o.zone)).map(o => o.sales)), hCat = (k, ct) => sum(outs.filter(o => o.cat === ct).map(o => o.hourly[k]));
    const fSeg = `<div class="cseg"><div class="seg" role="group" aria-label="Sales shown">${[['all', 'All sales'], ...cats.map(x => [x, x])].map(([k, l]) => `<button type="button" data-action="fcat" data-k="${esc(k)}" aria-pressed="${fc === k}">${esc(l)}</button>`).join('')}</div></div>`;
    const sChart = fSeg + (c.multi
      ? chart({ labels: c.dates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: fName, kind: 'bar', color: fCol, values: c.all.map(d => d.state === 'future' ? null : sum(cats.filter(fIn).map(ct => dCat(d, ct)))) }], breakdown: fc === 'all' ? i => c.all[i].state === 'future' ? null : per(null, ct => dCat(c.all[i], ct)) : null, fmt: v => egp(v), height: 220 })
      : chart({ labels: hourLabels, xName: 'Hour', series: [{ name: fName, kind: 'bar', color: fCol, values: HOURS.map((_, k) => m.frac[k] > 0 ? sum(cats.filter(fIn).map(ct => hCat(k, ct))) : null) }], breakdown: fc === 'all' ? k => m.frac[k] > 0 ? per(null, ct => hCat(k, ct)) : null : null, fmt: v => egp(v), now: nowIdx(m), height: 220, xw: 40 }));
    const svcBars = CH.bars(outs.filter(o => o.svc != null).sort((a, b) => b.svc / ZP.OUTLETS.find(x => x.id === b.id).svc - a.svc / ZP.OUTLETS.find(x => x.id === a.id).svc).map(o => ({ label: o.name, value: o.svc, display: `${n1(o.svc)} min`, target: ZP.OUTLETS.find(x => x.id === o.id).svc, color: o.svcState === 'svc-slow' ? 'var(--s3)' : 'var(--s1)', open: `outlet:${o.id}` })));
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-sales', span: 7, title: c.multi ? 'Daily tenant sales' : 'Tenant sales by hour', sub: fc === 'all' ? `All tenant sales ${c.multi ? 'per day' : 'each hour'} · select a column for food vs retail` : `${fc} sales ${c.multi ? 'per day' : 'each hour'}`, body: sChart, table: true, m, src: 'Source: tenant POS (demo)' })}
      ${panel({ id: 'p-svc', span: 5, cls: 'row-2', title: 'Service time against target', sub: `Minutes from order to hand-over; tick marks the target${m.state === 'today' ? ' · live' : ''}`, body: svcBars || emptyMini('All outlets closed.', 'moon'), m })}
      ${panel({ id: 'p-out', span: 7, title: 'Outlet performance', sub: 'Select an outlet for its tenant terms and hourly sales', body: oTable, flush: true, m })}
    </div>`;
  };

  const EVTYPES = ['Birthday party', 'School trip', 'Corporate evening', 'Live music night'];
  V.events = c => {
    const m = c.m;
    const evs = c.all.flatMap(d => d.events.map(e => ({ ...e, date: d.date }))).filter(e => zOk(e.zone));
    const today = m.events.filter(e => zOk(e.zone));
    const booked = sum(evs.filter(e => e.status !== 'cancelled').map(e => e.booked));
    const attended = evs.filter(e => e.att != null);
    const live = evs.filter(e => e.status !== 'cancelled');
    const byType = f => EVTYPES.map((t, i) => ({ label: t, rows: live.filter(e => e.type === t), color: `var(--s${i + 1})` })).filter(x => x.rows.length).map(x => ({ ...x, ...f(x.rows) }));
    EXTRA.set('ev-booked', { title: 'Guests booked', sub: 'By event type, against event capacity', body: CH.bars(byType(r => ({ value: sum(r.map(e => e.booked)), target: sum(r.map(e => e.cap)) })).map(x => ({ label: x.label, sub: `${x.rows.length} event${x.rows.length > 1 ? 's' : ''}`, value: x.value, target: x.target, display: `${n(x.value)} / ${n(x.target)}`, color: x.color }))) || emptyMini('No bookings in this period.', 'calendar') });
    EXTRA.set('ev-att', { title: 'Attendance', sub: 'Guests who arrived, per started event', body: attended.length ? CH.bars(attended.map(e => ({ label: e.name, sub: `${hm(e.start)} · ${e.venue}`, value: e.att, target: e.booked, display: `${n(e.att)} of ${n(e.booked)} · ${pct(e.att / Math.max(1, e.booked))}`, color: `var(--s${EVTYPES.indexOf(e.type) + 1})`, open: `event:${e.id}` }))) : emptyMini('No events have started yet.', 'clock') });
    EXTRA.set('ev-rev', { title: m.state === 'future' ? 'Booked value' : 'Event revenue', sub: 'By event type · package price × guests booked', body: CH.bars(byType(r => ({ value: sum(r.map(e => e.revenue)) })).map(x => ({ label: x.label, sub: `${x.rows.length} event${x.rows.length > 1 ? 's' : ''}`, value: x.value, display: egp(x.value), color: x.color }))) || emptyMini('No event revenue in this period.', 'coins') });
    const kpis = `<div class="kpis">
      ${kpi({ open: 'extra:ev-list', icon: 'calendar', label: c.multi ? 'Events' : 'Events on this day', value: n(evs.length), detail: `${evs.filter(e => e.status === 'completed').length} completed · ${evs.filter(e => e.status === 'scheduled').length} scheduled` })}
      ${kpi({ open: 'extra:ev-booked', icon: 'users', label: 'Guests booked', value: n(booked), detail: `${pct(booked / Math.max(1, sum(evs.map(e => e.cap))))} of event capacity` })}
      ${kpi({ open: 'extra:ev-att', icon: 'check', label: 'Attendance', value: attended.length ? n(sum(attended.map(e => e.att))) : '—', detail: attended.length ? `${pct(sum(attended.map(e => e.att)) / sum(attended.map(e => e.booked)))} show rate` : 'No events started yet' })}
      ${kpi({ open: 'extra:ev-rev', icon: 'coins', label: m.state === 'future' ? 'Booked value' : 'Event revenue', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(sum(evs.map(e => e.revenue)))}`, detail: 'Package price × guests booked' })}
    </div>`;
    // timeline for the selected day
    const venues = [...new Set(today.map(e => e.venue))];
    const xp = h => ((h - OPEN) / (CLOSE - OPEN) * 100).toFixed(2);
    const col = t => `var(--s${EVTYPES.indexOf(t) + 1})`;
    const tl = today.length ? `<div class="legend">${EVTYPES.map((t, i) => `<span class="lg"><i class="sw" style="--c:var(--s${i + 1})"></i>${t}</span>`).join('')}</div><div class="tl">
      <div class="tl-axis"><span></span><div class="tl-ticks">${[10, 12, 14, 16, 18, 20, 22, 24].map(h => `<span style="left:${xp(h)}%">${String(h % 24).padStart(2, '0')}:00</span>`).join('')}</div></div>
      ${venues.map(v => `<div class="tl-row"><div class="tl-v">${esc(v)}</div><div class="tl-lane">${today.filter(e => e.venue === v).map(e => `<button type="button" class="tl-ev ${e.status === 'cancelled' ? 'cancelled' : ''}" style="left:${xp(e.start)}%;width:${(xp(Math.min(CLOSE, e.end)) - xp(e.start)).toFixed(2)}%;--c:${col(e.type)}" data-open="event:${e.id}" data-tip="${esc(`${e.name} · ${hm(e.start)}–${hm(e.end)} · ${e.booked} booked · ${ST[evKey(e.status)][0]}`)}">${esc(e.name)}</button>`).join('')}${m.state === 'today' && m.nowH >= OPEN ? `<span class="tl-now" style="left:${xp(m.nowH)}%"></span>` : ''}</div></div>`).join('')}
    </div>` : emptyMini('No events booked on this day.', 'calendar');
    const eTable = table('events', [
      { k: 'start', label: 'Time', num: true, val: r => r.date + hm(r.start), fmt: r => `${hm(r.start)}${c.multi ? `<span class="sub">${esc(dayLabel(r.date))}</span>` : ''}` },
      { k: 'name', label: 'Event', fmt: r => `${esc(r.name)}<span class="sub">${esc(r.type)}</span>` }, { k: 'venue', label: 'Venue', fmt: r => `${esc(r.venue)}<span class="sub">${esc(zname(r.zone))}</span>` },
      { k: 'booked', label: 'Booked', num: true, fmt: r => `${n(r.booked)} / ${n(r.cap)}` }, { k: 'att', label: 'Attended', num: true, fmt: r => r.att == null ? '—' : n(r.att) },
      { k: 'revenue', label: 'Value', num: true, fmt: r => egp(r.revenue) }, { k: 'status', label: 'Status', fmt: r => pill(evKey(r.status)) }], evs, { open: r => `event:${r.id}`, empty: 'No events in this period.', max: true });
    EXTRA.set('ev-list', { title: c.multi ? 'Events in period' : 'Events on this day', sub: 'Select an event for detail', body: eTable });
    const up = Array.from({ length: 14 }, (_, i) => ZP.addDays(S.date, i)), upd = up.map(ZP.day);
    const upChart = chart({ labels: up, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', stacked: true, series: EVTYPES.map((t, i) => ({ name: t, kind: 'bar', color: `var(--s${i + 1})`, values: upd.map(d => sum(d.events.filter(e => e.type === t && zOk(e.zone) && e.status !== 'cancelled').map(e => e.booked))) })), fmt: v => `${n(v)} guests`, height: 240 });
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-tl', span: 12, title: `Schedule · ${dayLabel(m.date, { weekday: 'long', day: 'numeric', month: 'long' })}`, sub: 'Bookings by venue from opening to close; select an event for detail', body: tl, m })}
      ${panel({ id: 'p-up', span: 5, title: 'Bookings — next 14 days', sub: 'Guests booked per day by event type', body: upChart, table: true, m, foot: 'Bookings as entered · demo data' })}
      ${panel({ id: 'p-ev', span: 7, title: c.multi ? 'Events in period' : 'Event list', sub: 'Bookings, capacity and attendance', body: eTable, flush: true, m, src: 'Source: booking system (demo)' })}
    </div>`;
  };

  V.guest = c => {
    const m = c.m, g = guard(m, 'guest feedback'); if (g) return g;
    const resp = sum(c.live.map(d => d.responses)), vis = sum(c.live.map(d => d.visitors));
    const csat = resp ? sum(c.live.map(d => (d.csat || 0) * d.responses)) / resp : null;
    const nps = resp ? Math.round(sum(c.live.map(d => (d.nps || 0) * d.responses)) / resp) : null;
    const comps = c.live.flatMap(d => d.complaints.map(x => ({ ...x, date: d.date }))).filter(x => zOk(x.zone));
    const open = m.complaints.filter(x => x.status !== 'resolved' && zOk(x.zone));
    const kpis = `<div class="kpis">
      ${kpi({ icon: 'smile', label: 'Guest satisfaction', value: csat == null ? '—' : `${csat.toFixed(2)}<small>/ 5</small>`, detail: delta(csat, 4.5, { suffix: 'vs 4.50 target' }) })}
      ${kpi({ icon: 'users', label: 'Net promoter score', value: nps == null ? '—' : (nps > 0 ? '+' : '') + nps, detail: delta(nps, 45, { suffix: 'vs +45 target' }) })}
      ${kpi({ icon: 'ticket', label: 'Survey responses', value: n(resp), detail: `${pct(resp / Math.max(1, vis), 1)} of visitors` })}
      ${kpi({ icon: 'alert', label: 'Complaints', value: n(comps.length), detail: `${n1(comps.length / Math.max(1, vis) * 1000)} per 1,000 visitors` })}
      ${kpi({ icon: 'clock', label: 'Open complaints', value: m.state === 'today' ? n(open.length) : '0', detail: m.state === 'today' ? `${open.filter(x => x.status === 'open').length} new · ${open.filter(x => x.status === 'in-progress').length} in progress` : 'All resolved' })}
    </div>`;
    const tdates = Array.from({ length: 30 }, (_, i) => ZP.addDays(S.date, i - 29)), tdays = tdates.map(ZP.day);
    const trend = chart({ labels: tdates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: 'Satisfaction (out of 5)', kind: 'line', color: 'var(--s1)', values: tdays.map(d => d.csat == null ? null : +d.csat.toFixed(2)) }], target: { name: 'Target 4.50', value: 4.5 }, yMax: 5, fmt: v => v.toFixed(2), yFmt: v => v.toFixed(2), height: 230 });
    const CATS = ['Queues & waiting', 'Ride closures', 'Cleanliness', 'Prices', 'Staff', 'Facilities', 'Food quality'];
    const catBars = CH.bars(CATS.map(ct => ({ label: ct, value: comps.filter(x => x.cat === ct).length })).filter(r => r.value).sort((a, b) => b.value - a.value).map(r => ({ ...r, display: `${r.value} · ${pct(r.value / comps.length)}`, color: 'var(--s4)' })));
    const p5 = Math.max(.25, Math.min(.75, .35 + (csat - 4) * .55)), p4 = .26, p3 = .14 - (csat - 4) * .08, p2 = .05, p1 = Math.max(.02, 1 - p5 - p4 - p3 - p2);
    const dist = [[5, p5], [4, p4], [3, Math.max(.03, p3)], [2, p2], [1, p1]];
    const dsum = sum(dist.map(d => d[1]));
    const distBars = CH.bars(dist.map(([s, p]) => ({ label: `${s} star${s > 1 ? 's' : ''}`, value: Math.round(resp * p / dsum), display: `${n(Math.round(resp * p / dsum))} · ${pct(p / dsum)}`, color: s >= 4 ? 'var(--s1)' : s === 3 ? 'var(--s3)' : 'var(--s4)' })));
    const cTable = table('complaints', [
      { k: 'time', label: 'Time', num: true, val: r => r.date + hm(r.time), fmt: r => `${hm(r.time)}${c.multi ? `<span class="sub">${esc(dayLabel(r.date))}</span>` : ''}` },
      { k: 'text', label: 'Complaint', fmt: r => `${esc(r.text)}<span class="sub">${esc(r.cat)}</span>` }, { k: 'zone', label: 'Zone', fmt: r => esc(zname(r.zone)) },
      { k: 'channel', label: 'Channel' }, { k: 'status', label: 'Status', fmt: r => pill(r.status === 'open' ? 'c-open' : r.status) }], comps.sort((a, b) => b.date.localeCompare(a.date) || b.time - a.time), { open: r => `complaint:${r.id}|${r.date}`, empty: 'No complaints recorded for these filters.', max: true });
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-csat', span: 7, title: 'Satisfaction trend', sub: 'Daily average from post-visit surveys, last 30 days', body: trend, table: true, m, tags: [PW] })}
      ${panel({ id: 'p-dist', span: 5, title: 'Rating distribution', sub: `${n(resp)} responses`, body: distBars, m, tags: [PW] })}
      ${panel({ id: 'p-cat', span: 5, title: 'Complaints by category', sub: c.multi ? PERIODS[S.period].label : dayLabel(S.date), body: catBars || emptyMini('No complaints.'), m })}
      ${panel({ id: 'p-clog', span: 7, title: 'Complaint log', sub: 'Guest desk, app, survey and social media', body: cTable, flush: true, m, src: 'Source: guest feedback (demo)' })}
    </div>`;
  };

  V.safety = c => {
    const m = c.m, g = guard(m, 'safety records'); if (g) return g;
    const inc = c.live.flatMap(d => d.incidents.map(x => ({ ...x, date: d.date }))).filter(x => zOk(x.zone) && (S.ride === 'all' || x.ride === S.ride));
    const active = m.incidents.filter(x => x.status !== 'closed' && zOk(x.zone));
    const ins = m.inspections.filter(x => zOk(x.zone) && (S.ride === 'all' || x.ride === S.ride));
    const done = ins.filter(x => x.result === 'pass' || x.result === 'notes');
    const wos = ZP.workOrders(m.date).filter(w => zOk(w.zone) && (S.ride === 'all' || w.ride === S.ride));
    const openW = wos.filter(w => w.status !== 'done');
    const kpis = `<div class="kpis">
      ${kpi({ icon: 'shield', label: 'Active incidents', value: m.state === 'today' ? n(active.length) : '0', detail: m.state === 'today' ? `${active.filter(i => i.status === 'open').length} open · ${active.filter(i => i.status === 'investigating').length} investigating` : 'All closed' })}
      ${kpi({ icon: 'alert', label: c.multi ? 'Incidents in period' : 'Incidents today', value: n(inc.length), detail: `${inc.filter(i => i.sev !== 'Low').length} medium or high severity` })}
      ${kpi({ icon: 'check', label: 'Inspections done', value: `${done.length}<small>/ ${ins.length}</small>`, meter: ins.length ? done.length / ins.length : 0, detail: `${ins.filter(x => x.result === 'due').length} due · ${ins.filter(x => x.result === 'notes').length} with notes` })}
      ${kpi({ icon: 'wrench', label: 'Open work orders', value: n(openW.length), detail: `${openW.filter(w => w.priority === 'High').length} high priority` })}
      ${kpi({ icon: 'clock', label: 'Overdue work orders', value: n(wos.filter(w => w.status === 'overdue').length), detail: 'Past their due date' })}
    </div>`;
    const iTable = table('incidents', [
      { k: 'time', label: 'Time', num: true, val: r => r.date + hm(r.time), fmt: r => `${hm(r.time)}${c.multi ? `<span class="sub">${esc(dayLabel(r.date))}</span>` : ''}` },
      { k: 'type', label: 'Incident', fmt: r => `${esc(r.type)}<span class="sub">${esc(r.id)}</span>` }, { k: 'zone', label: 'Zone', fmt: r => esc(zname(r.zone)) },
      { k: 'sev', label: 'Severity', val: r => ['Low', 'Medium', 'High'].indexOf(r.sev), fmt: r => pill(sevKey(r.sev)) },
      { k: 'status', label: 'Status', fmt: r => pill(r.status === 'open' ? 'i-open' : r.status === 'closed' ? 'i-closed' : r.status) }], inc.sort((a, b) => b.date.localeCompare(a.date) || b.time - a.time), { open: r => `incident:${r.id}|${r.date}`, empty: 'No incidents recorded — a quiet day.', max: true });
    const inTable = table('inspections', [
      { k: 'time', label: 'Due', num: true, fmt: r => hm(r.time) }, { k: 'item', label: 'Inspection', fmt: r => `${esc(r.item)}<span class="sub">${esc(zname(r.zone))}</span>` },
      { k: 'result', label: 'Result', fmt: r => pill(r.result) }], ins, { open: r => r.ride ? `ride:${r.ride}` : null, max: true, empty: 'No inspections scheduled.' });
    const WF = { active: ['Active', w => w.status !== 'done'], overdue: ['Overdue', w => w.status === 'overdue'], open: ['Open', w => w.status === 'open'], 'in-progress': ['In progress', w => w.status === 'in-progress'], done: ['Done', w => w.status === 'done'], all: ['All', () => true] };
    const seg = `<div class="seg" role="group" aria-label="Work order status">${Object.entries(WF).map(([k, [l]]) => `<button type="button" data-action="wof" data-k="${k}" aria-pressed="${S.woFilter === k}">${l} <span class="muted">${wos.filter(WF[k][1]).length}</span></button>`).join('')}</div>`;
    const wTable = table('wos', [
      { k: 'id', label: 'Work order', fmt: r => `${esc(r.title)}<span class="sub">${esc(r.id)} · ${esc(r.type)} · ${esc(r.team)}</span>` },
      { k: 'zone', label: 'Zone', fmt: r => esc(zname(r.zone)) }, { k: 'priority', label: 'Priority', val: r => ['Low', 'Medium', 'High'].indexOf(r.priority), fmt: r => pill(sevKey(r.priority)) },
      { k: 'due', label: 'Due', num: true, fmt: r => esc(dayLabel(r.due, { day: 'numeric', month: 'short' })) },
      { k: 'status', label: 'Status', fmt: r => pill(r.status === 'open' ? 'w-open' : r.status) }], wos.filter(WF[S.woFilter][1]), { open: r => `wo:${r.id}`, max: true, empty: 'No work orders with this status.' });
    const TYPES = ['First aid — minor', 'Lost child', 'Slip / trip', 'Security', 'Heat exhaustion', 'Ride stoppage'];
    const byType = CH.bars(TYPES.map(t => ({ label: t, value: inc.filter(i => i.type === t).length })).filter(r => r.value).sort((a, b) => b.value - a.value).map(r => ({ ...r, display: String(r.value), color: 'var(--s4)' })));
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-inc', span: 8, title: 'Incident log', sub: 'Guest and operational incidents · select one for detail', body: iTable, flush: true, m })}
      ${panel({ id: 'p-itype', span: 4, title: 'Incidents by type', sub: c.multi ? PERIODS[S.period].label : dayLabel(S.date), body: byType || emptyMini('No incidents.'), m })}
      ${panel({ id: 'p-insp', span: 5, title: 'Inspections', sub: `${dayLabel(m.date)} · pre-opening checks, rounds and post-fault checks`, body: inTable, flush: true, m })}
      ${panel({ id: 'p-wo', span: 7, title: 'Maintenance work orders', sub: 'Rolling 14 days', body: `<div style="padding:0 18px 10px;overflow-x:auto">${seg}</div>${wTable}`, flush: true, m, src: 'Source: CMMS (demo)' })}
    </div>`;
  };

  V.utilities = c => {
    const m = c.m, g = guard(m, 'meter readings', true); if (g) return g;
    const U = ZP.utilities(m.date), us = c.live.map(d => ZP.utilities(d.date));
    const zones = ZONES.filter(z => zOk(z.id));
    const zk = (u, key, z) => u[key][z][0] == null ? null : sum(u[key][z]);
    const elecZ = zones.map(z => ({ z, v: U.connectedElecZones.includes(z.id) ? sum(us.map(u => zk(u, 'elec', z.id))) : null }));
    const kwh = sum(elecZ.map(x => x.v)), pot = sum(zones.map(z => sum(us.map(u => zk(u, 'potable', z.id))))), irrZ = zones.map(z => ({ z, v: U.meters.find(x => x.id === 'IM-' + z.id) ? (U.meters.find(x => x.id === 'IM-' + z.id).connected ? sum(us.map(u => zk(u, 'irr', z.id))) : null) : 0 }));
    const irr = sum(irrZ.map(x => x.v)), T = ZP.TARIFF;
    const cost = kwh * T.kwh + pot * T.potable + irr * T.irrigation;
    const dz = h => sum(zones.filter(z => U.connectedElecZones.includes(z.id)).map(z => U.elec[z.id][h] ?? 0));
    const dem = U.hours.map(h => U.elec[ZONES[0].id][h] == null ? null : Math.round(dz(h)));
    const pk = Math.max(...dem.filter(v => v != null)), pkH = dem.indexOf(pk);
    const ncZ = zones.filter(z => !U.connectedElecZones.includes(z.id));
    const kpis = `<div class="kpis">
      ${kpi({ open: 'extra:u-elec', icon: 'bolt', label: 'Electricity', value: `${n(kwh)}<small>kWh</small>`, detail: ncZ.length ? `${ncZ.map(z => z.name).join(', ')} meter not connected` : 'All meters reporting' })}
      ${kpi({ open: 'extra:u-peak', icon: 'bolt', label: 'Peak demand', value: `${n(pk)}<small>kW</small>`, detail: pkH >= 0 ? `At ${String(pkH).padStart(2, '0')}:00 · ${dayLabel(m.date)}` : '—' })}
      ${kpi({ open: U.leaks.some(l => zOk(l.zone)) ? 'extra:u-issues' : 'extra:wzones', icon: 'drop', label: 'Potable water', value: `${n(pot)}<small>m³</small>`, detail: U.leaks.some(l => zOk(l.zone)) ? '<span class="delta neg">Leak suspected</span>' : 'No leaks detected' })}
      ${kpi({ open: 'extra:u-irr', icon: 'leaf', label: 'Irrigation water', value: `${n(irr)}<small>m³</small>`, detail: irrZ.some(x => x.v == null) ? '1 irrigation meter not connected' : 'Treated water' })}
      ${kpi({ open: 'extra:u-cost', icon: 'coins', label: 'Estimated cost', value: `<small style="margin:0 4px 0 0">EGP</small>${egpC(cost)}`, detail: `<span data-tip="${esc(`Assumed tariffs: electricity EGP ${T.kwh}/kWh, potable water EGP ${T.potable}/m³, irrigation water EGP ${T.irrigation}/m³. Replace with contract tariffs when live meters are connected.`)}" tabindex="0">At assumed tariffs ${icon('info')}</span>` })}
    </div>`;
    const demChart = c.multi
      ? chart({ labels: c.dates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', series: [{ name: 'Electricity (kWh)', kind: 'bar', color: 'var(--s3)', values: c.all.map(d => d.state === 'future' ? null : Math.round(sum(zones.filter(z => U.connectedElecZones.includes(z.id)).map(z => sum(ZP.utilities(d.date).elec[z.id]))))) }], fmt: v => `${n(v)} kWh`, height: 240 })
      : chart({ labels: U.hours.map(h => `${String(h).padStart(2, '0')}:00`), xName: 'Hour', series: [{ name: 'Demand (kW)', kind: 'area', color: 'var(--s3)', values: dem }], fmt: v => `${n(v)} kW`, now: m.state === 'today' ? Math.floor(m.nowH) : null, height: 240, xw: 40, tipExtra: i => i >= OPEN ? 'Park open' : 'Park closed — base load and irrigation' });
    const eBars = CH.bars(elecZ.sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map(x => ({ label: x.z.name, value: x.v, display: `${n(x.v)} kWh`, color: 'var(--s3)', sub: x.v == null ? '' : pct(x.v / kwh), open: `meter:EM-${x.z.id}` })));
    const wChart = c.multi
      ? chart({ labels: c.dates, xFmt: dateTick, tipLabel: l => dayLabel(l), xName: 'Date', stacked: true, series: [['potable', 'Potable', 'var(--s2)'], ['irr', 'Irrigation', 'var(--s1)']].map(([k, l, col]) => ({ name: l, kind: 'bar', color: col, values: c.all.map(d => d.state === 'future' ? null : +sum(zones.map(z => zk(ZP.utilities(d.date), k, z.id) || 0)).toFixed(1)) })), fmt: v => `${n1(v)} m³`, height: 230 })
      : chart({ labels: U.hours.map(h => `${String(h).padStart(2, '0')}:00`), xName: 'Hour', stacked: true, series: [['potable', 'Potable', 'var(--s2)'], ['irr', 'Irrigation', 'var(--s1)']].map(([k, l, col]) => ({ name: l, kind: 'bar', color: col, values: U.hours.map(h => U[k][ZONES[0].id][h] == null ? null : +sum(zones.map(z => U[k][z.id][h] || 0)).toFixed(1)) })), fmt: v => `${n1(v)} m³`, now: m.state === 'today' ? Math.floor(m.nowH) : null, height: 230, xw: 40 });
    const wTable = table('wzones', [
      { k: 'name', label: 'Zone' }, { k: 'pot', label: 'Potable m³', num: true, fmt: r => n1(r.pot) },
      { k: 'irr', label: 'Irrigation m³', num: true, fmt: r => r.irr == null ? nc() : r.irr ? n1(r.irr) : '—' },
      { k: 'cost', label: 'Est. cost', num: true, fmt: r => egp(r.pot * T.potable + (r.irr || 0) * T.irrigation) }],
      zones.map(z => ({ id: z.id, name: z.name, pot: sum(us.map(u => zk(u, 'potable', z.id))), irr: irrZ.find(x => x.z.id === z.id).v })), { open: r => `meter:WM-${r.id}` });
    const tanks = `<div class="tanks">${U.tanks.map(t => `<button type="button" class="tank" data-open="tank:${t.id}"><span class="t-body" aria-hidden="true"><i class="t-fill" style="height:${t.level ?? 0}%;${t.level < t.low ? 'background:color-mix(in oklab,var(--serious) 60%,transparent)' : ''}"></i><i class="t-low" style="bottom:${t.low}%"></i></span><span class="t-v">${t.level == null ? '—' : t.level + '%'}</span><span class="t-n">${esc(t.name)}</span>${t.level < t.low ? pill('low') : `<span class="muted" style="font-size:12px">${n(t.cap * (t.level || 0) / 100)} of ${n(t.cap)} m³</span>`}</button>`).join('')}</div>`;
    const pTable = table('pumps', [
      { k: 'name', label: 'Pump', fmt: r => `${esc(r.name)}<span class="sub">${esc(r.id)} · ${esc(zname(r.zone))}</span>` }, { k: 'status', label: 'Status', fmt: r => pill(r.status) },
      { k: 'flow', label: 'Flow m³/h', num: true, fmt: r => r.flow == null ? '—' : r.flow ? n1(r.flow) : '0.0' }, { k: 'pressure', label: 'Pressure bar', num: true, fmt: r => r.pressure == null ? '—' : n1(r.pressure) }],
      U.pumps.filter(p => zOk(p.zone)), { open: r => `pump:${r.id}`, empty: `No pumps in ${zname(S.zone)}.` });
    const abn = ZP.abnormal(m.date).filter(a => zOk(a.zone));
    const issues = [...U.leaks.filter(l => zOk(l.zone)).map(l => ({ sev: 'critical', title: `Suspected leak — ${zname(l.zone)}`, meta: `${l.meter} · since ${dayLabel(l.since)} · ${l.note}`, open: `meter:${l.meter}`, src: 'Leak detection' })),
      ...abn.map(a => ({ sev: 'warning', title: `Abnormal overnight ${a.label.toLowerCase()} — ${zname(a.zone)}`, meta: `${n1(a.today)} ${a.unit} vs ${n1(a.base)} ${a.unit} 14-day baseline (+${Math.round((a.ratio - 1) * 100)}%)`, open: `meter:${a.label === 'Electricity' ? 'EM' : 'WM'}-${a.zone}`, src: 'Consumption check' })),
      ...U.pumps.filter(p => p.status === 'fault' && zOk(p.zone)).map(p => ({ sev: 'serious', title: `${p.name} in fault`, meta: p.note, open: `pump:${p.id}`, src: 'Pumps' }))];
    const issueBody = issues.length ? `<ul class="alerts">${issues.map(a => alertItem({ ...a, t: null })).join('')}</ul>` : emptyMini('No leaks or abnormal consumption.');
    const mTable = table('meters', [
      { k: 'id', label: 'Meter', fmt: r => `${esc(r.id)}<span class="sub">${esc(r.type)}</span>` }, { k: 'zone', label: 'Zone', fmt: r => esc(zname(r.zone)) },
      { k: 'reading', label: 'Reading', num: true, fmt: r => r.reading == null ? nc() : `${n(r.reading)} ${r.unit}` },
      { k: 'today', label: m.state === 'today' ? 'Today so far' : 'Day total', num: true, fmt: r => r.today == null ? nc() : `${n1(r.today)} ${r.unit}` },
      { k: 'lastRead', label: 'Last read', num: true, fmt: r => r.lastRead || '—' }, { k: 'connected', label: 'Link', val: r => r.connected ? 1 : 0, fmt: r => pill(r.connected ? 'connected' : 'nc') }], U.meters.filter(x => zOk(x.zone)), { open: r => `meter:${r.id}`, max: true });
    // drawers behind the KPI cards
    const hr = h => `${String(h).padStart(2, '0')}:00`;
    extra('u-elec', 'Electricity by zone', c.multi ? PERIODS[S.period].label : 'Today so far', eBars);
    extra('u-peak', 'Peak demand', `Busiest hours · ${dayLabel(m.date)}`, `${dl([['Peak', `${n(pk)} kW`], ['At', pkH >= 0 ? hr(pkH) : '—'], ['Meters', `${U.connectedElecZones.length} of ${ZONES.length} zones connected`]])}${CH.bars(dem.map((v, h) => ({ h, v })).filter(x => x.v != null).sort((a, b) => b.v - a.v).slice(0, 8).map(x => ({ label: hr(x.h), value: x.v, display: `${n(x.v)} kW`, color: 'var(--s3)', sub: x.h >= OPEN ? 'Park open' : 'Park closed' })))}`);
    extra('u-issues', 'Leaks & abnormal use', 'Night-flow and 14-day baseline checks', issueBody);
    extra('u-irr', 'Irrigation meters', c.multi ? PERIODS[S.period].label : 'Today so far', `${CH.bars(irrZ.filter(x => x.v !== 0).map(x => ({ label: x.z.name, value: x.v, display: `${n1(x.v)} m³`, color: 'var(--s1)', open: `meter:IM-${x.z.id}` })))}<p class="muted" style="margin:14px 0 0;font-size:12.5px">Treated water for lawns and planting · EGP ${T.irrigation}/m³ (assumed tariff).</p>`);
    extra('u-cost', 'Estimated cost', 'At assumed tariffs', `${dl([['Electricity', `${egp(kwh * T.kwh)} <span class="muted">· ${n(kwh)} kWh × EGP ${T.kwh}</span>`], ['Potable water', `${egp(pot * T.potable)} <span class="muted">· ${n(pot)} m³ × EGP ${T.potable}</span>`], ['Irrigation water', `${egp(irr * T.irrigation)} <span class="muted">· ${n(irr)} m³ × EGP ${T.irrigation}</span>`], ['Total', `<b>${egp(cost)}</b>`]])}<p class="muted" style="margin:14px 0 0;font-size:12.5px">Replace with contract tariffs when live meters are connected. Meters that are not connected are not included.</p>`);
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-dem', span: 5, title: c.multi ? 'Daily electricity' : 'Electricity demand', sub: c.multi ? 'kWh per day from connected meters' : `kW by hour · ${U.connectedElecZones.length} of ${ZONES.length} zone meters connected`, body: demChart, table: true, m, src: 'Source: BMS meters (demo)', actions: extra('meters', 'Meter readings', 'Cumulative register and consumption · read-only', mTable, 'Meters') })}
      ${panel({ id: 'p-water', span: 4, title: c.multi ? 'Daily water use' : 'Water use by hour', sub: 'Potable and irrigation, m³', body: wChart, table: true, m, actions: extra('wzones', 'Water by zone', c.multi ? PERIODS[S.period].label : 'Today so far', wTable, 'By zone') })}
      ${panel({ id: 'p-issues', span: 3, title: 'Leaks & abnormal use', sub: 'Night-flow and 14-day baseline checks', body: issueBody, flush: true, m })}
      ${panel({ id: 'p-ez', span: 3, title: 'Electricity by zone', sub: c.multi ? PERIODS[S.period].label : 'Today so far', body: eBars, m })}
      ${panel({ id: 'p-tanks', span: 4, title: 'Tank levels', sub: 'Dashed line marks the low-level alarm', body: tanks, m, tags: [RO] })}
      ${panel({ id: 'p-pumps', span: 5, title: 'Pump status', sub: snapText(m), body: pTable, flush: true, m, tags: [RO] })}
    </div>`;
  };

  const GSEG = [['soil', 'Soil'], ['valves', 'Valves'], ['pumps', 'Pumps & leaks'], ['plants', 'Plants'], ['tasks', 'Tasks']];
  let MK = 1; // map height stretch, set from the panel's shape after render (fitMap)
  V.landscape = c => {
    const m = c.m, g = guard(m, 'lighting and irrigation status', true); if (g) return g;
    const L = ZP.lighting(m.date), G = ZP.landscape(m.date), U = ZP.utilities(m.date);
    const circ = L.circuits.filter(x => zOk(x.zone));
    const on = circ.filter(x => x.status === 'on'), fault = circ.filter(x => x.status === 'fault'), off = circ.filter(x => x.status === 'offline');
    const sens = G.sensors.filter(s => zOk(s.zone)), la = landscapeAlerts(G);
    const kpis = `<div class="kpis">
      ${kpi({ open: 'extra:l-on', icon: 'bulb', label: 'Circuits on', value: `${on.length}<small>/ ${circ.length}</small>`, detail: `${snapText(m)} · sunset ${hm(L.sunset)}` })}
      ${kpi({ open: fault.length === 1 ? `circuit:${fault[0].id}` : 'extra:l-fault', icon: 'alert', label: 'Lighting faults', value: n(fault.length), detail: fault.length ? fault.map(x => x.id).join(', ') : 'None' })}
      ${kpi({ open: off.length === 1 ? `circuit:${off[0].id}` : 'extra:l-off', icon: 'plug', label: 'Offline circuits', value: n(off.length), detail: off.length ? 'Controller not connected' : 'All controllers online' })}
      ${kpi({ open: 'extra:l-energy', icon: 'bolt', label: 'Lighting energy', value: `${n(sum(circ.map(x => x.kwh)))}<small>kWh</small>`, detail: off.length ? 'Excludes offline circuits' : 'All circuits metered' })}
      ${kpi({ open: 'extra:l-alerts', icon: 'leaf', label: 'Landscape alerts', value: n(la.length), detail: la.length ? la.slice(0, 2).map(a => a.short).join(' · ') : 'Grounds healthy' })}
    </div>`;
    // map
    const mk = cc => {
      let [x, y] = cc.pos; y *= MK; const [zx, zy0] = ZONE[cc.zone].rect, zy = zy0 * MK;
      if (x < zx + 170 && y < zy + 72) y = zy + 92; // keep markers clear of the zone label
      const shape = cc.status === 'fault' ? `<path class="mk" d="M${x},${y - 9} L${x + 9},${y + 7} L${x - 9},${y + 7}Z"/>` : cc.status === 'offline' ? `<rect class="mk" x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3"/>` : `<circle class="mk" cx="${x}" cy="${y}" r="7.5"/>`;
      return `<g class="lc lc-${cc.status}" tabindex="0" role="button" data-open="circuit:${cc.id}" aria-label="${esc(`${cc.id} ${cc.name}: ${ST[cc.status][0]}`)}" data-tip="${esc(`${cc.id} · ${cc.name} · ${ST[cc.status][0]}${typeof cc.brightness === 'number' && cc.status === 'on' ? ' · ' + cc.brightness + '%' : ''}`)}">${cc.status === 'on' ? `<circle class="halo" cx="${x}" cy="${y}" r="${12 + (typeof cc.brightness === 'number' ? cc.brightness / 12 : 6)}"/>` : ''}${shape}</g>`;
    };
    const zoneEl = z => { const [x, y0, w, h0] = z.rect, y = y0 * MK, h = h0 * MK; const zc = L.circuits.filter(cc => cc.zone === z.id); const issues = zc.filter(cc => cc.status === 'fault' || cc.status === 'offline').length; return `<rect class="zone ${z.id === 'GAR' || z.id === 'EVL' ? 'garden' : ''} ${S.zone === z.id ? 'sel' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="22" tabindex="0" role="button" aria-pressed="${S.zone === z.id}" data-action="mapzone" data-k="${z.id}" aria-label="${esc(`${z.name}: ${zc.filter(cc => cc.status === 'on').length} of ${zc.length} circuits on${issues ? ', ' + issues + ' with issues' : ''}`)}"/><text class="zl" x="${x + 18}" y="${y + 34}">${esc(z.name)}</text><text class="zs" x="${x + 18}" y="${y + 56}">${zc.filter(cc => cc.status === 'on').length}/${zc.length} on${issues ? ` · ${issues} issue${issues > 1 ? 's' : ''}` : ''}</text>`; };
    const map = `<div class="mapwrap"><svg class="parkmap" viewBox="0 0 1000 ${600 * MK}" role="group" aria-label="Park zone map. Select a zone to filter; select a circuit marker for detail.">
      <path class="path" d="M60 ${412 * MK} H970 M327 ${30 * MK} V${580 * MK} M672 ${30 * MK} V${580 * MK}"/>
      ${ZONES.map(zoneEl).join('')}
      <ellipse class="water" cx="500" cy="${215 * MK}" rx="62" ry="38"/>
      <circle class="deco" cx="835" cy="${300 * MK}" r="46"/><path class="deco" d="M835 ${300 * MK} L812 ${300 * MK + 60} M835 ${300 * MK} L858 ${300 * MK + 60}"/>
      ${L.circuits.map(mk).join('')}
    </svg>
    <div class="maplegend"><span><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="var(--gold)"/></svg>On</span><span><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="var(--ink-3)" stroke-width="2"/></svg>Off (scheduled)</span><span><svg viewBox="0 0 16 16"><path d="M8 1.5 15 14H1z" fill="var(--critical)"/></svg>Fault</span><span><svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="3 2"/></svg>Offline — not connected</span>${S.zone !== 'all' ? `<button type="button" class="tview" data-action="clear-zone" style="margin-left:auto">Show all zones</button>` : ''}</div></div>`;
    const zoneSel = S.zone === 'all' ? null : ZONE[S.zone];
    const bri = cc => cc.brightness === 'na' ? '<span class="muted">Not supported</span>' : cc.brightness == null ? nc() : cc.status !== 'on' ? '—' : `<span style="display:inline-flex;gap:8px;align-items:center;justify-content:flex-end">${cc.brightness}%<span class="meter" style="width:48px;margin:0"><i style="width:${cc.brightness}%;--c:var(--gold)"></i></span></span>`;
    const cCols = [
      { k: 'name', label: 'Circuit', fmt: r => `${esc(r.name)}<span class="sub">${esc(r.id)}${S.zone === 'all' ? ' · ' + esc(zname(r.zone)) : ''}</span>` },
      { k: 'status', label: 'Status', fmt: r => pill(r.status) }, { k: 'brightness', label: 'Brightness', num: true, val: r => typeof r.brightness === 'number' ? r.brightness : -1, fmt: bri },
      { k: 'kwh', label: 'Energy', num: true, fmt: r => r.kwh == null ? nc() : `${n(r.kwh)} kWh` }];
    const cTable = table('circuits', cCols, circ.slice().sort((a, b) => ['fault', 'offline', 'unknown', 'on', 'off'].indexOf(a.status) - ['fault', 'offline', 'unknown', 'on', 'off'].indexOf(b.status)), { open: r => `circuit:${r.id}` });
    const zoneSummary = zoneSel ? (() => { const zc = circ; return `<dl class="dl"><dt>Circuits</dt><dd>${zc.length} · ${zc.filter(x => x.status === 'on').length} on</dd><dt>Connected load</dt><dd>${n1(sum(zc.map(x => x.kw)))} kW</dd><dt>Energy today</dt><dd>${n(sum(zc.map(x => x.kwh)))} kWh</dd><dt>Dimmable (DALI)</dt><dd>${zc.filter(x => x.dali).length} of ${zc.length}</dd><dt>Soil sensors</dt><dd>${sens.length ? sens.map(s => `${s.id} ${s.vwc == null ? 'not connected' : n1(s.vwc) + '%'}`).join(' · ') : 'None in this zone'}</dd><dt>Irrigation valves</dt><dd>${G.valves.filter(v => v.zone === S.zone).map(v => v.id).join(', ') || 'None'}</dd></dl>`; })() : '';
    const soilV = x => x.status === 'ok' ? `${n1(x.vwc)}%` : `<span class="pill t-${ST[x.status][1]}">${icon(ST[x.status][2])}${ST[x.status][0]}${x.vwc == null ? '' : ' · ' + n1(x.vwc) + '%'}</span>`;
    const soil = sens.length ? `<ul class="soil-list">${sens.map(x => `<li><button type="button" class="soil-row" data-open="sensor:${x.id}"><span class="sr-n">${esc(x.area)}<small>${esc(x.id)}</small></span><span class="s-track">${x.vwc == null ? '' : `<i class="s-mk" style="left:${Math.min(100, x.vwc / 50 * 100)}%"></i>`}</span><span class="sr-v">${soilV(x)}</span></button></li>`).join('')}</ul>` : emptyMini(`No soil sensors in ${zname(S.zone)}.`, 'leaf');
    const vTable = table('valves', [
      { k: 'id', label: 'Valve', fmt: r => `${esc(r.area)}<span class="sub">${esc(r.id)} · ${esc(zname(r.zone))}</span>` }, { k: 'start', label: 'Schedule', fmt: r => `${esc(r.schedule.replace('Daily ', ''))}<span class="sub">Next ${esc(r.next.toLowerCase())}</span>` },
      { k: 'status', label: 'Status', fmt: r => pill(r.status === 'open' ? 'v-open' : r.status === 'closed' ? 'v-closed' : r.status) }], G.valves.filter(v => zOk(v.zone)), { open: r => `valve:${r.id}`, empty: `No irrigation valves in ${zname(S.zone)}.` });
    const ipumps = U.pumps.filter(p => ['P-03', 'P-04', 'P-05'].includes(p.id) && zOk(p.zone));
    const pumpList = ipumps.length || G.leaks.length ? `<ul class="alerts">${ipumps.map(p => `<li><button type="button" class="alert" data-open="pump:${p.id}"><span class="sev t-${ST[p.status][1]}">${icon(ST[p.status][2])}</span><span><b>${esc(p.name)}</b><span class="a-m">${esc(p.id)} · ${p.note ? esc(p.note) : p.flow ? n1(p.flow) + ' m³/h' : 'Idle'}</span></span>${pill(p.status)}</button></li>`).join('')}${G.leaks.filter(l => zOk(l.zone)).map(l => `<li><button type="button" class="alert" data-open="meter:${l.meter}"><span class="sev t-critical">${icon('drop')}</span><span><b>Suspected leak — ${esc(zname(l.zone))}</b><span class="a-m">${esc(l.note)}</span></span>${pill('fault')}</button></li>`).join('')}</ul>` : emptyMini('No irrigation pumps in this zone.');
    const plTable = table('plants', [
      { k: 'area', label: 'Area', fmt: r => `${esc(r.area)}<span class="sub">${esc(zname(r.zone))}</span>` }, { k: 'note', label: 'Finding', fmt: r => `<span style="font-size:12.5px">${esc(r.note)}</span><span class="sub">Inspected ${esc(dayLabel(r.date, { day: 'numeric', month: 'short' }))}</span>` }, { k: 'cond', label: 'Condition', fmt: r => pill(r.cond === 'Good' ? 'p-good' : r.cond === 'Fair' ? 'p-fair' : 'p-attn') }], G.plants.filter(p => zOk(p.zone)), { open: r => `plant:${r.id}`, empty: 'No plant inspections in this zone.' });
    const tkTable = table('ltasks', [
      { k: 'task', label: 'Task', fmt: r => `${esc(r.task)}<span class="sub">${esc(zname(r.zone))} · ${esc(r.team)}</span>` },
      { k: 'due', label: 'Due', num: true, fmt: r => esc(dayLabel(r.due, { day: 'numeric', month: 'short' })) },
      { k: 'status', label: 'Status', fmt: r => pill(r.status) }], G.tasks.filter(t => zOk(t.zone)), { open: r => `ltask:${r.id}`, empty: 'No landscape tasks in this zone.' });
    const eBars = CH.bars(ZONES.filter(z => zOk(z.id)).map(z => ({ z, v: sum(L.circuits.filter(cc => cc.zone === z.id).map(cc => cc.kwh)) })).sort((a, b) => b.v - a.v).map(x => ({ label: x.z.name, value: x.v, display: `${n(x.v)} kWh`, color: 'var(--s3)', sub: `${L.circuits.filter(cc => cc.zone === x.z.id).length} circuits`, open: `lzone:${x.z.id}` })));
    // drawers behind the KPI cards
    extra('l-on', 'Circuits on', `${snapText(m)} · sunset ${hm(L.sunset)}`, table('circ-on', cCols, on, { open: r => `circuit:${r.id}`, empty: 'No circuits are on right now. Lights switch on at sunset.', max: true }));
    extra('l-fault', 'Lighting faults', snapText(m), table('circ-fault', cCols, fault, { open: r => `circuit:${r.id}`, empty: 'No lighting faults.', max: true }));
    extra('l-off', 'Offline circuits', 'Controller not connected', table('circ-off', cCols, off, { open: r => `circuit:${r.id}`, empty: 'All controllers online.', max: true }));
    extra('l-energy', 'Lighting energy by zone', 'Today so far', eBars);
    extra('l-alerts', 'Landscape alerts', snapText(m), la.length ? `<ul class="alerts">${la.map(a => alertItem({ ...a, t: null })).join('')}</ul>` : emptyMini('Grounds healthy. No landscape alerts.', 'leaf'));
    return `<div class="grid">${kpis}
      ${panel({ id: 'p-map', span: 7, cls: 'row-2', title: 'Lighting & grounds map', sub: `${snapText(m)} · select a zone to filter every panel`, body: map, m, tags: [RO], actions: zoneSel ? extra('zone', zoneSel.name, 'Zone summary', zoneSummary, 'Zone summary') : extra('lenergy', 'Lighting energy by zone', 'Today so far', eBars, 'Energy by zone') })}
      ${panel({ id: 'p-circ', span: 5, title: 'Lighting circuits', sub: `${circ.length} circuits · select one for its schedule`, body: cTable, flush: true, m, src: 'Source: lighting controllers (demo)' })}
      ${panel({ id: 'p-grounds', span: 5, title: 'Irrigation & grounds', sub: 'Automatic schedule · read-only', body: `<div class="psegs"><div class="seg" role="group" aria-label="Grounds view">${GSEG.map(([k, l]) => `<button type="button" data-action="lsub" data-k="${k}" aria-pressed="${S.lsub === k}">${l}</button>`).join('')}</div></div>${{ soil, valves: vTable, pumps: pumpList, plants: plTable, tasks: tkTable }[S.lsub]}`, flush: true, m })}
    </div>`;
  };

  /* Secondary content that would push a tab past one screen opens in the drawer instead. */
  const EXTRA = new Map();
  const extra = (key, title, sub, body, label) => { EXTRA.set(key, { title, sub, body }); return `<button class="tview" type="button" data-open="extra:${key}">${icon('table')}<span>${esc(label || title)}</span></button>`; };

  /* Every chart column / point is clickable: it opens that day or hour in the drawer. */
  document.addEventListener('chartpick', e => {
    const s = CH.spec(e.detail.id), i = e.detail.i; if (!s) return;
    const el = e.target, fmt = s.fmt || (v => v.toLocaleString('en-US'));
    const lab = s.labels[i], isDay = /^\d{4}-\d{2}-\d{2}$/.test(lab);
    const where = el.closest('.panel, .rv-card')?.querySelector('h2, h3')?.textContent.trim() || $('#drawerTitle')?.textContent.trim() || 'Chart';
    const multi = s.series.length > 1, stacked = !!s.stacked;
    const tot = v => v.some(x => x != null) ? sum(v.filter(x => x != null)) : null;
    const at = k => stacked ? tot(s.series.map(se => se.values[k])) : s.series[0].values[k];
    const isHour = /^\d{2}:00$/.test(lab), unit = isDay ? 'days' : isHour ? 'hours' : 'points';
    const dd = h => `<span class="dd-d">${h}</span>`;
    const v = at(i), all = s.labels.map((_, k) => at(k)).filter(x => x != null);
    const tv = !s.target ? null : Array.isArray(s.target.values) ? s.target.values[i] : s.target.value;
    const avg = all.length ? sum(all) / all.length : null, rank = v == null ? null : all.filter(x => x > v).length + 1;
    const ord = r => r + (r % 100 >= 11 && r % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][r % 10] || 'th');
    const rows = s.series.map(se => [se.name, se.values[i] == null ? esc(s.nullText || '—') : `${esc(fmt(se.values[i]))}${stacked && multi && v ? ` <span class="muted">· ${pct(se.values[i] / v)}</span>` : ''}`]);
    if (stacked && multi) rows.push(['Total', v == null ? '—' : `<b>${esc(fmt(v))}</b>`]);
    if (tv != null) rows.push([s.target.name || 'Target', `${esc(fmt(tv))} ${v == null ? '' : dd(delta(v, tv, { suffix: 'vs target' }))}`]);
    if (v != null && all.length > 1) rows.push([`Compared with the ${all.length} ${unit} shown`, `${dd(delta(v, avg, { suffix: `vs average ${fmt(avg)}` }))}<br><span class="muted">${rank === 1 ? 'Highest' : ord(rank)} of ${all.length}</span>`]);
    const bp = s.breakdown && v ? s.breakdown(i) : null;
    const brk = bp ? `<div><h3>Breakdown</h3>${CH.bars(bp.filter(p => p.value > 0).map(p => ({ label: p.label, value: p.value, display: `${fmt(p.value)} · ${pct(p.value / v)}`, color: p.color })).sort((a, b) => b.value - a.value))}</div>` : stacked && multi && v ? `<div><h3>Breakdown</h3>${CH.bars(s.series.filter(se => se.values[i] > 0).map(se => ({ label: se.name, value: se.values[i], display: `${fmt(se.values[i])} · ${pct(se.values[i] / v)}`, color: se.color })).sort((a, b) => b.value - a.value))}</div>` : '';
    const go = isDay && (lab !== S.date || S.period !== 'day') ? `<button class="btn" type="button" data-action="pickday" data-k="${lab}">${icon('calendar')}<span>Show ${esc(dayLabel(lab, { weekday: 'short', day: 'numeric', month: 'short' }))} across the dashboard</span></button>` : '';
    EXTRA.set('pick', { title: esc(s.tipLabel ? s.tipLabel(lab, i) : lab), sub: esc(where), body: `${v == null ? `<div class="note">${icon('info')}<span>No reading for this ${isDay ? 'day' : isHour ? 'hour' : 'point'}${s.nullText ? ` — ${esc(s.nullText)}` : ''}.</span></div>` : ''}${dl(rows)}${s.tipExtra && s.tipExtra(i) ? `<p class="muted" style="margin:0">${esc(s.tipExtra(i))}</p>` : ''}${brk}${go}` });
    openDrawer('extra:pick');
  });

  /* ================= DRAWER ================= */
  let lastFocus = null;
  function openDrawer(key) {
    const [kind, rest] = key.split(':'); const [id, d] = (rest || '').split('|');
    const m = ZP.day(d || S.date);
    const html = drawerHTML(kind, id, m);
    if (!html) return;
    lastFocus = document.activeElement;
    const dr = $('#drawer');
    dr.innerHTML = `<header class="dh"><div><h2 id="drawerTitle">${html.title}</h2><p>${html.sub || ''}</p></div><button class="icon-btn" type="button" data-action="close" aria-label="Close details">${icon('x')}</button></header><div class="db">${html.body}</div>`;
    $('#drawerWrap').hidden = false;
    CH.hydrate(dr);
    dr.focus();
  }
  function closeDrawer(silent) {
    if ($('#drawerWrap').hidden) return;
    $('#drawerWrap').hidden = true; $('#drawer').innerHTML = ''; CH.hide();
    if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  const dl = rows => `<dl class="dl">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const roNote = '<div class="note ro">' + icon('lock') + '<span>Read-only monitoring. Commands to equipment are disabled by default; changes are made at the local controller.</span></div>';
  function drawerHTML(kind, id, m) {
    if (kind === 'ride') {
      const r = m.rides.find(x => x.id === id); if (!r) return null;
      const wos = ZP.workOrders(m.date).filter(w => w.ride === id && w.status !== 'done');
      const ins = m.inspections.filter(x => x.ride === id);
      const info = ZP.RIDE_INFO[r.id], ph = info.photo, sp = info.spec, kw = rideKwh(m, r);
      const facts = [['Ride type', esc(info.type)], ...(info.facts || []).map(([k, v]) => [k, esc(v)]),
        ...(sp ? [['Manufacturer model', esc(sp.model)], ['Riders per cycle', esc(sp.riders)], ['Hourly capacity', esc(sp.hourly)], ['Height', esc(sp.height)], ['Footprint', esc(sp.footprint)], ['Ride time', esc(sp.rideTime)], ['Rider height', esc(sp.minHeight)], ['Rated power', esc(sp.power)]] : [])];
      return { title: esc(r.name), sub: `${esc(info.type)} · ${esc(zname(r.zone))} · ${snapText(m)}`, body: `
        <figure class="d-photo"><img src="assets/rides/${ph.file}" alt="Representative photo of a ${esc(info.type.toLowerCase())}"><figcaption>Representative photo, not taken at ZED Park — <a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.title)}</a> by ${esc(ph.artist)}, ${esc(ph.lic)}</figcaption></figure>
        <div>${pill(r.status || 'unknown')} ${r.limitNote ? `<span class="muted">${esc(r.limitNote)}</span>` : ''}</div>
        <p style="margin:0">${esc(info.blurb)}</p>
        <div><h3>Ride facts</h3>${dl(facts)}
          <p class="d-src">${sp ? 'Technical figures are the manufacturer’s published data for this ride type; ZED Park has not published its exact model.' : 'ZED Park has not published technical figures for this ride.'} Sources: ${info.src.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(' · ')}</p></div>
        <div><h3>Today’s operation <span class="tag">Demo data</span></h3>
        ${dl([['Queue now', r.queueNow == null ? '—' : r.queueNow + ' min'], ['Average / peak queue', `${r.queueAvg ?? '—'} / ${r.queueMax ?? '—'} min`], ['Riders', n(r.riders)], ['Hourly capacity', n(r.cap) + ' riders'], ['Ride cycle', r.cycle + ' min'], ['Availability', pct(r.availability, 1)], ['Downtime', r.downMin ? r.downMin + ' min' : 'None'], ['Pay-per-ride price', egp(r.ppr)], ['Ride revenue', egp(r.revenue)], ['Electricity', `${n(sum(kw.filter(v => v != null)))} kWh · ${n1(rideRunH(m, r))} h running`], ['Next planned service', esc(dayLabel(ZP.addDays(m.date, serviceIn(m.date, r.id)), { weekday: 'short', day: 'numeric', month: 'short' }))]])}</div>
        <div><h3>Electricity by hour</h3>${chart({ labels: hourLabels, xName: 'Hour', series: [{ name: 'Electricity (kWh)', kind: 'area', color: 'var(--s1)', values: kw }], fmt: v => n1(v) + ' kWh', now: nowIdx(m), height: 150, xw: 44, nullText: 'Not running' })}</div>
        <div><h3>Queue by hour</h3>${chart({ labels: hourLabels, xName: 'Hour', series: [{ name: 'Queue (min)', kind: 'line', color: 'var(--s1)', values: r.hourly.map(h => h.queue) }], target: { name: '40-min promise', value: 40 }, fmt: v => v + ' min', now: nowIdx(m), height: 170, xw: 44, nullText: 'Not running' })}</div>
        <div><h3>Stops today</h3>${r.down.length ? dl(r.down.map(w => [`${hm(w.start)}–${m.nowH < w.end ? 'ongoing' : hm(w.end)}`, esc(w.reason)])) : r.maintenance ? '<p>Closed all day for planned maintenance.</p>' : '<p class="muted">No unplanned stops.</p>'}</div>
        <div><h3>Inspections</h3>${dl(ins.map(x => [hm(x.time), `${pill(x.result)} ${esc(x.item.split(' — ')[1] || x.item)}`]))}</div>
        <div><h3>Open work orders</h3>${wos.length ? dl(wos.map(w => [w.id, `${esc(w.title)} ${pill(w.status === 'open' ? 'w-open' : w.status)}`])) : '<p class="muted">None.</p>'}</div>
        ${roNote}` };
    }
    if (kind === 'outlet') {
      const o = m.outlets.find(x => x.id === id); if (!o) return null;
      return { title: esc(o.name), sub: `${esc(o.cat)} · ${esc(zname(o.zone))}`, body: `
        ${dl([['Tenant sales', egp(o.sales)], ['Transactions', n(o.txns)], ['Average ticket', egp(o.sales / Math.max(1, o.txns))], ['Service time', o.svcNow != null ? n1(o.svcNow) + ' min now' : o.svcAvg != null ? n1(o.svcAvg) + ' min average' : '—'], ['Service target', o.svc + ' min'], ['Commission rate', pct(o.comm)], ['Park commission', egp(o.commission)], ['Monthly rent', egp(o.rent)], ['Rent accrued today', egp(o.rentDay)]])}
        <div><h3>Sales by hour</h3>${chart({ labels: hourLabels, xName: 'Hour', series: [{ name: 'Sales', kind: 'bar', color: 'var(--s1)', values: o.hourly.map((v, i) => m.frac[i] > 0 ? v : null) }], fmt: v => egp(v), now: nowIdx(m), height: 170, xw: 44 })}</div>
        <div class="note">${icon('info')}<span>Tenant sales belong to the tenant. The park's income is the commission plus rent.</span></div>` };
    }
    if (kind === 'event') {
      const e = m.events.find(x => x.id === id) || ctx().all.flatMap(d => d.events).find(x => x.id === id); if (!e) return null;
      return { title: esc(e.name), sub: `${esc(e.type)} · ${esc(e.venue)}`, body: `<div>${pill(evKey(e.status))}</div>${dl([['Date', esc(dayLabel(m.date, { weekday: 'long', day: 'numeric', month: 'long' }))], ['Time', `${hm(e.start)}–${hm(e.end)}`], ['Zone', esc(zname(e.zone))], ['Capacity', n(e.cap)], ['Booked', `${n(e.booked)} (${pct(e.booked / e.cap)})`], ['Checked in', e.att == null ? '—' : n(e.att)], ['Package price', egp(e.price) + ' per guest'], ['Booking value', egp(e.revenue)], ['Booking reference', e.id]])}` };
    }
    if (kind === 'incident') {
      const x = m.incidents.find(i => i.id === id); if (!x) return null;
      return { title: esc(x.type), sub: `${esc(x.id)} · ${esc(zname(x.zone))}`, body: `<div>${pill(x.status === 'open' ? 'i-open' : x.status === 'closed' ? 'i-closed' : x.status)} ${pill(sevKey(x.sev))}</div>${dl([['Reported', `${hm(x.time)} · ${esc(dayLabel(m.date))}`], ['Zone', esc(zname(x.zone))], ['Outcome', esc(x.outcome)], x.ride ? ['Ride', `<button class="tview" data-open="ride:${x.ride}">${esc(ZP.RIDE[x.ride].name)}${icon('chev')}</button>`] : null, ['Responder', x.type === 'Ride stoppage' ? 'Ride technicians' : x.type === 'Security' ? 'Security team' : 'First-aid team']])}` };
    }
    if (kind === 'complaint') {
      const x = m.complaints.find(i => i.id === id); if (!x) return null;
      return { title: esc(x.text), sub: `${esc(x.cat)} · ${esc(x.id)}`, body: `<div>${pill(x.status === 'open' ? 'c-open' : x.status)}</div>${dl([['Received', `${hm(x.time)} · ${esc(dayLabel(m.date))}`], ['Channel', esc(x.channel)], ['Zone', esc(zname(x.zone))], ['Resolution time', x.status === 'resolved' ? x.resMin + ' min' : '—']])}` };
    }
    if (kind === 'wo') {
      const w = ZP.workOrders(m.date).find(x => x.id === id); if (!w) return null;
      return { title: esc(w.title), sub: `${esc(w.id)} · ${esc(w.cat)}`, body: `<div>${pill(w.status === 'open' ? 'w-open' : w.status)} ${pill(sevKey(w.priority))}</div>${dl([['Type', esc(w.type)], ['Team', esc(w.team)], ['Zone', esc(zname(w.zone))], ['Created', esc(dayLabel(w.created))], ['Due', esc(dayLabel(w.due))], ['Completed', w.status === 'done' ? esc(dayLabel(w.doneOn)) : '—'], w.ride ? ['Ride', `<button class="tview" data-open="ride:${w.ride}">${esc(ZP.RIDE[w.ride].name)}${icon('chev')}</button>`] : null])}` };
    }
    if (kind === 'meter') {
      const u = ZP.utilities(m.date), x = u.meters.find(i => i.id === id); if (!x) return null;
      const key = x.type === 'Electricity' ? 'elec' : x.type === 'Potable water' ? 'potable' : 'irr';
      const leak = u.leaks.find(l => l.meter === id);
      return { title: esc(x.id), sub: `${esc(x.type)} meter · ${esc(zname(x.zone))}`, body: `<div>${pill(x.connected ? 'connected' : 'nc')}</div>
        ${dl([['Register reading', x.reading == null ? nc() : `${n(x.reading)} ${x.unit}`], ['Consumption', x.today == null ? nc() : `${n1(x.today)} ${x.unit}`], ['Last read', x.lastRead || '—'], ['Tariff (assumed)', `EGP ${key === 'elec' ? ZP.TARIFF.kwh : key === 'potable' ? ZP.TARIFF.potable : ZP.TARIFF.irrigation} / ${x.unit}`]])}
        ${leak ? `<div class="note">${icon('drop')}<span><b>Suspected leak since ${esc(dayLabel(leak.since))}.</b> ${esc(leak.note)}</span></div>` : ''}
        ${x.connected ? `<div><h3>By hour</h3>${chart({ labels: u.hours.map(h => String(h).padStart(2, '0') + ':00'), xName: 'Hour', series: [{ name: `${x.type} (${x.unit})`, kind: 'bar', color: key === 'elec' ? 'var(--s3)' : key === 'potable' ? 'var(--s2)' : 'var(--s1)', values: u[key][x.zone] }], fmt: v => `${n1(v)} ${x.unit}`, height: 170, xw: 44 })}</div>` : `<div class="note">${icon('plug')}<span>This meter is not connected, so its readings are shown as “Not connected” and left out of totals.</span></div>`}
        ${roNote}` };
    }
    if (kind === 'circuit') {
      const x = ZP.lighting(m.date).circuits.find(i => i.id === id); if (!x) return null;
      return { title: esc(x.name), sub: `${esc(x.id)} · ${esc(zname(x.zone))}`, body: `<div>${pill(x.status)}</div>
        ${dl([['Fixture type', esc(x.type)], ['Connected load', x.kw + ' kW'], ['Brightness', x.brightness === 'na' ? 'Not supported (on/off only)' : x.brightness == null ? nc() : x.status === 'on' ? x.brightness + '%' : '—'], ['Control', x.dali ? 'DALI dimmable' : 'Contactor on/off'], ['Schedule', esc(x.schedule)], ['Dimming', x.dali ? '100% to 22:00 · 80% to 23:00 · 60% after' : '—'], ['Energy today', x.kwh == null ? nc() : x.kwh + ' kWh'], x.fault ? ['Issue', `${esc(x.fault.note)} · since ${esc(dayLabel(x.faultSince))}`] : null])}
        ${roNote}` };
    }
    if (kind === 'lzone') {
      const z = ZONE[id], L = ZP.lighting(m.date); if (!z) return null;
      const zc = L.circuits.filter(x => x.zone === id);
      return { title: `${esc(z.name)} lighting`, sub: `${zc.length} circuits · ${snapText(m)}`, body: `${dl([['Circuits on', `${zc.filter(x => x.status === 'on').length} of ${zc.length}`], ['Connected load', n1(sum(zc.map(x => x.kw))) + ' kW'], ['Energy', `${n(sum(zc.map(x => x.kwh)))} kWh`], ['Dimmable (DALI)', `${zc.filter(x => x.dali).length} of ${zc.length}`]])}
        <div><h3>Circuits</h3><ul class="alerts">${zc.map(x => `<li><button type="button" class="alert" data-open="circuit:${x.id}"><span class="sev t-${ST[x.status][1]}">${icon(ST[x.status][2])}</span><span><b>${esc(x.name)}</b><span class="a-m">${esc(x.id)} · ${x.kwh == null ? 'Not connected' : n(x.kwh) + ' kWh'}</span></span>${pill(x.status)}</button></li>`).join('')}</ul></div>
        <button class="btn" type="button" data-action="mapzone" data-k="${id}">${icon('pin')}<span>Filter the dashboard to ${esc(z.name)}</span></button>${roNote}` };
    }
    if (kind === 'plant') {
      const G = ZP.landscape(m.date), x = G.plants.find(i => i.id === id); if (!x) return null;
      const near = G.sensors.filter(s => s.zone === x.zone), vs = G.valves.filter(v => v.zone === x.zone);
      return { title: esc(x.area), sub: `Plant inspection · ${esc(zname(x.zone))}`, body: `<div>${pill(x.cond === 'Good' ? 'p-good' : x.cond === 'Fair' ? 'p-fair' : 'p-attn')}</div>
        ${dl([['Finding', esc(x.note)], ['Inspected', esc(dayLabel(x.date, { weekday: 'short', day: 'numeric', month: 'short' }))], ['Record', esc(x.id)], ['Soil sensors in zone', near.length ? near.map(s => `${esc(s.id)} ${s.vwc == null ? 'not connected' : n1(s.vwc) + '%'}`).join(' · ') : 'None'], ['Irrigation valves in zone', vs.map(v => esc(v.id)).join(', ') || 'None']])}
        ${G.tasks.filter(t => t.zone === x.zone && t.status !== 'done').length ? `<div><h3>Open tasks in this zone</h3><ul class="alerts">${G.tasks.filter(t => t.zone === x.zone && t.status !== 'done').map(t => `<li><button type="button" class="alert" data-open="ltask:${t.id}"><span class="sev t-${ST[t.status][1]}">${icon(ST[t.status][2])}</span><span><b>${esc(t.task)}</b><span class="a-m">${esc(t.team)} · due ${esc(dayLabel(t.due, { day: 'numeric', month: 'short' }))}</span></span>${pill(t.status)}</button></li>`).join('')}</ul></div>` : ''}` };
    }
    if (kind === 'ltask') {
      const G = ZP.landscape(m.date), t = G.tasks.find(i => i.id === id); if (!t) return null;
      const late = t.status === 'overdue' ? Math.round((new Date(m.date) - new Date(t.due)) / 864e5) : 0;
      return { title: esc(t.task), sub: `Landscape task · ${esc(zname(t.zone))}`, body: `<div>${pill(t.status)}</div>
        ${dl([['Due', esc(dayLabel(t.due, { weekday: 'short', day: 'numeric', month: 'short' })) + (late > 0 ? ` <span class="delta neg">${late} day${late > 1 ? 's' : ''} late</span>` : '')], ['Team', esc(t.team)], ['Zone', esc(zname(t.zone))], ['Task', esc(t.id)]])}
        ${G.plants.filter(x => x.zone === t.zone).length ? `<div><h3>Plant inspections in this zone</h3><ul class="alerts">${G.plants.filter(x => x.zone === t.zone).map(x => `<li><button type="button" class="alert" data-open="plant:${x.id}"><span class="sev t-${x.cond === 'Good' ? 'good' : x.cond === 'Fair' ? 'warning' : 'serious'}">${icon('leaf')}</span><span><b>${esc(x.area)}</b><span class="a-m">${esc(x.note)}</span></span></button></li>`).join('')}</ul></div>` : ''}
        <div class="note">${icon('info')}<span>Tasks come from the grounds work plan (demo). Updates are made in the CMMS.</span></div>` };
    }
    if (kind === 'valve') {
      const v = ZP.landscape(m.date).valves.find(i => i.id === id); if (!v) return null;
      return { title: `${esc(v.id)} · ${esc(v.area)}`, sub: `Irrigation valve · ${esc(zname(v.zone))}`, body: `<div>${pill(v.status === 'open' ? 'v-open' : v.status === 'closed' ? 'v-closed' : v.status)}</div>${dl([['Schedule', esc(v.schedule)], ['Last run', esc(v.lastRun || '—')], ['Next run', esc(v.next)], ['Design flow', v.flow + ' m³/h'], v.note ? ['Issue', esc(v.note)] : null])}${roNote}` };
    }
    if (kind === 'sensor') {
      const s = ZP.landscape(m.date).sensors.find(i => i.id === id); if (!s) return null;
      return { title: `${esc(s.id)} · ${esc(s.area)}`, sub: `Soil moisture sensor · ${esc(zname(s.zone))}`, body: `<div>${pill(s.status)}</div>${dl([['Moisture (VWC)', s.vwc == null ? nc() : n1(s.vwc) + '%'], ['Normal band', '18–38%'], ['Linked valve', s.valve]])}${s.status === 'offline' ? `<div class="note">${icon('plug')}<span>Sensor not connected — no reading.</span></div>` : ''}` };
    }
    if (kind === 'pump') {
      const p = ZP.utilities(m.date).pumps.find(i => i.id === id); if (!p) return null;
      return { title: esc(p.name), sub: `${esc(p.id)} · ${esc(zname(p.zone))}`, body: `<div>${pill(p.status)}</div>${dl([['Flow', p.flow == null ? '—' : n1(p.flow) + ' m³/h'], ['Discharge pressure', p.pressure == null ? '—' : n1(p.pressure) + ' bar'], ['Run hours', n(p.hours)], p.note ? ['Issue', esc(p.note)] : null])}${roNote}` };
    }
    if (kind === 'tank') {
      const t = ZP.utilities(m.date).tanks.find(i => i.id === id); if (!t) return null;
      return { title: esc(t.name), sub: esc(t.id), body: `<div>${pill(t.level < t.low ? 'low' : 'normal')}</div>${dl([['Level', t.level == null ? '—' : t.level + '%'], ['Volume', t.level == null ? '—' : `${n(t.cap * t.level / 100)} of ${n(t.cap)} m³`], ['Low-level alarm', t.low + '%']])}${t.id === 'T-3' ? '<div class="note">' + icon('info') + '<span>The irrigation tank draws down during the 02:00–06:00 irrigation cycle and refills through the day.</span></div>' : ''}${roNote}` };
    }
    if (kind === 'extra' || kind === 'panel') {
      const x = kind === 'extra' ? EXTRA.get(id) : FULL.get(id); if (!x) return null;
      return { title: esc(x.title), sub: x.sub || '', body: `<div class="dfull">${x.body}</div>` };
    }
    if (kind === 'sources') {
      const u = ZP.utilities(S.date), L = ZP.lighting(S.date);
      const ncM = u.meters.filter(x => !x.connected).map(x => x.id).join(', ');
      const off = L.circuits.filter(x => x.status === 'offline').map(x => x.id).join(', ');
      return { title: 'Data sources', sub: 'Every figure is demo data until these systems are connected', body: `${dl([['Ticketing & gates', pill('nc') + ' Demo feed'], ['Tenant POS', pill('nc') + ' Demo feed'], ['Ride controllers', pill('nc') + ' Demo feed · read-only'], ['BMS & utility meters', `${pill('nc')} Demo feed${ncM ? ` · ${ncM} not connected` : ''}`], ['Lighting controllers', `${pill('nc')} Demo feed${off ? ` · ${off} offline` : ''}`], ['Irrigation controller', pill('nc') + ' Demo feed'], ['Guest feedback', pill('nc') + ' Demo feed'], ['CMMS (work orders)', pill('nc') + ' Demo feed']])}
        <div class="note">${icon('info')}<span>The demo data is generated from the date, so every tab agrees. Missing readings show as “Not connected”. Live connections replace the functions in <code>data.js</code>.</span></div>${roNote}` };
    }
    return null;
  }

  /* ================= SHELL ================= */
  function renderTabs() {
    const m = ZP.day(S.date);
    const al = buildAlerts(m);
    const counts = { overview: al.filter(a => a.sev === 'critical').length };
    const html = (vertical) => TABS.map(t => `<button type="button" class="tab" role="tab" id="${vertical ? 't' : 'mt'}-${t.id}" aria-selected="${S.tab === t.id}" tabindex="${S.tab === t.id ? 0 : -1}" data-tab="${t.id}" aria-controls="main">${icon(t.icon)}<span>${t.label}</span>${vertical && counts[t.id] ? `<span class="cnt" aria-label="${counts[t.id]} critical alerts">${counts[t.id]}</span>` : ''}</button>`).join('');
    const was = ['#tabs', '#mtabs'].map(sel => $(sel + ' .tab[aria-selected="true"]')?.getBoundingClientRect());
    $('#tabs').innerHTML = html(true);
    $('#mtabs').innerHTML = html(false);
    ['#tabs', '#mtabs'].forEach((sel, i) => {
      const now = $(sel + ' .tab[aria-selected="true"]'), r0 = was[i];
      if (!now || !r0 || reduce.matches || !now.animate) return;
      const r1 = now.getBoundingClientRect(); if (!r1.width || (r0.top === r1.top && r0.left === r1.left)) return;
      now.animate([{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px)`, width: r0.width + 'px' }, { transform: 'none', width: r1.width + 'px' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::before' });
    });
    const mt = $('#mt-' + S.tab); if (mt) mt.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function renderFilters() {
    const rideOpts = RIDES.filter(r => zOk(r.zone));
    if (S.ride !== 'all' && !rideOpts.some(r => r.id === S.ride)) S.ride = 'all';
    const dirty = S.date !== ZP.todayISO() || S.period !== 'day' || S.zone !== 'all' || S.ride !== 'all';
    $('#filters').innerHTML = `
      <div class="fld f-date"><label for="fDate">Date</label><div class="date-grp"><button type="button" class="icon-btn" data-action="prev" aria-label="Previous day">${icon('chevl')}</button><input class="ctl" type="date" id="fDate" value="${S.date}" min="${ZP.addDays(ZP.todayISO(), -365)}" max="${ZP.addDays(ZP.todayISO(), 60)}"><button type="button" class="icon-btn" data-action="next" aria-label="Next day">${icon('chev')}</button></div></div>
      <div class="fld"><span class="lbl" id="perL">Period</span><div class="seg" role="group" aria-labelledby="perL">${Object.entries(PERIODS).map(([k, p]) => `<button type="button" data-action="period" data-k="${k}" aria-pressed="${S.period === k}">${p.label}</button>`).join('')}</div></div>
      <div class="fld"><label for="fZone">Zone</label><select class="ctl" id="fZone"><option value="all">All zones</option>${ZONES.map(z => `<option value="${z.id}" ${S.zone === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>
      <div class="fld"><label for="fRide">Attraction</label><select class="ctl" id="fRide"><option value="all">All attractions</option>${rideOpts.map(r => `<option value="${r.id}" ${S.ride === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      ${dirty ? `<button type="button" class="btn btn-sm reset" data-action="reset">${icon('refresh')}Reset filters</button>` : ''}`;
  }
  function renderMeta() {
    const m = ZP.day(S.date);
    const t = TABS.find(x => x.id === S.tab);
    $('#pageTitle').textContent = t.label;
    document.title = `${t.label} · ZED Park Dashboard`;
    const range = S.period === 'day' ? dayLabel(S.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : `${PERIODS[S.period].label} to ${dayLabel(S.date, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const live = m.state === 'today' ? (m.open ? `<span class="live">Park open · ${snapText(m)}</span>` : '<span>Park closed</span>') : m.state === 'past' ? '<span>Final figures</span>' : '<span>Future date — bookings only</span>';
    $('#topMeta').innerHTML = `<span>${esc(range)}</span>${live}<span>${m.state === 'today' ? `Last updated ${S.updated.toLocaleTimeString('en-GB')}` : ''}</span>`;
    $('#footStamp').textContent = `Demo data · generated ${S.updated.toLocaleString('en-GB')}`;
  }
  function skeleton() {
    const b = (h, span = 12) => `<div class="sk-panel span-${span}"><div class="sk" style="height:14px;width:38%"></div><div class="sk" style="height:${h}px"></div></div>`;
    return `<div class="grid" aria-busy="true"><div class="kpis">${Array.from({ length: 5 }, () => `<div class="kpi"><div class="sk" style="height:12px;width:55%"></div><div class="sk" style="height:28px;width:70%"></div><div class="sk" style="height:10px;width:45%"></div></div>`).join('')}</div>${b(250, 7)}${b(250, 5)}${b(180, 12)}</div><span class="sr" role="status">Loading ${esc(TABS.find(t => t.id === S.tab).label)}…</span>`;
  }
  function renderMain() {
    const main = $('#main');
    const fk = focusKey();
    if (S.fail && (S.fail === S.tab || S.fail === 'all')) {
      main.innerHTML = `<div class="grid">${stateBlock('plug', `Couldn’t load ${TABS.find(t => t.id === S.tab).label}`, 'The data service did not respond (simulated by the <code>?fail=</code> link). Nothing on screen is out of date — try again.', `<button class="btn btn-sm" data-action="retry">${icon('refresh')}Try again</button>`, 'err')}</div>`;
      return;
    }
    let html;
    try { html = V[S.tab](ctx()); } catch (e) {
      console.error(e);
      html = `<div class="grid">${stateBlock('alert', 'Something went wrong building this view', esc(e.message), `<button class="btn btn-sm" data-action="retry">${icon('refresh')}Try again</button>`, 'err')}</div>`;
    }
    main.innerHTML = html;
    CH.prune(); CH.hydrate(main); fitLists(); requestAnimationFrame(() => fitLists());
    if (fitMap()) { main.innerHTML = V[S.tab](ctx()); CH.prune(); CH.hydrate(main); fitLists(); }
    drawHub();
    if (tabIn) playTabIn(main);
    restoreFocus(fk);
  }
  /* Tab entrance: panels rise in reading order, charts draw from their baseline, KPI figures count up,
     and park lights switch on one by one. Only on a tab change, never on filter refreshes. */
  let tabIn = false, tabInTimer = null;
  function playTabIn(main) {
    tabIn = false;
    if (reduce.matches) return;
    $$('#main > .grid > *').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
    $$('.parkmap .lc-on', main).forEach((el, i) => el.style.setProperty('--i', i));
    $$('.chart', main).forEach(c => $$('.bar', c).forEach((b, i, all) => b.style.setProperty('--bi', i / Math.max(1, all.length - 1))));
    main.classList.remove('tab-in'); void main.offsetWidth; main.classList.add('tab-in');
    clearTimeout(tabInTimer); tabInTimer = setTimeout(() => main.classList.remove('tab-in'), 1600);
    $$('.kpi .k-v', main).forEach(countUp);
  }
  function countUp(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node; while ((node = w.nextNode()) && !/\d/.test(node.nodeValue));
    if (!node) return;
    const m = node.nodeValue.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s); if (!m) return;
    const final = node.nodeValue, target = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, comma = m[2].includes(',') || target >= 1000;
    if (!target) return;
    const fmt = v => (comma ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const t0 = performance.now(), dur = 750;
    const step = now => {
      if (!node.isConnected) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.nodeValue = k < 1 ? m[1] + fmt(target * e) + m[3] : final;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /* One-screen layout: lists show the rows that fit their panel; the rest open in the drawer. */
  const FIT = matchMedia('(min-width: 961px) and (min-height: 720px)');
  const FULL = new Map();
  function fitLists() {
    FULL.clear();
    $$('#main .panel').forEach(p => {
      const pb = $('.pb', p); if (!pb) return;
      $$('[data-clip]', pb).forEach(x => { x.hidden = false; delete x.dataset.clip; });
      $('.more', p)?.remove();
      if (!FIT.matches) return;
      const items = $$('tbody > tr, ul.alerts > li, ul.hbars > li, ul.soil-list > li', pb).filter(x => !x.closest('.cv-table'));
      const boxes = [pb, ...$$('.tscroll, .alert-list', pb)];
      const over = () => boxes.some(b => b.scrollHeight > b.clientHeight + 1);
      if (items.length < 2 || !over()) return;
      FULL.set(p.id, { title: $('h2', p).textContent, sub: esc($('.psub', p)?.textContent || ''), body: pb.innerHTML });
      const more = document.createElement('div'); more.className = 'more'; p.append(more);
      let k = items.length;
      const label = () => { more.innerHTML = `<button type="button" data-open="panel:${p.id}">View all ${items.length}<span class="muted">· ${items.length - k} more</span>${icon('chev')}</button>`; };
      do { items[--k].hidden = true; items[k].dataset.clip = '1'; label(); } while (k > 0 && over());
      // hiding rows can rebalance table columns and shrink the rest, so give back whatever now fits
      while (k < items.length) { items[k].hidden = false; if (over()) { items[k].hidden = true; break; } delete items[k].dataset.clip; k++; label(); }
      if (k === items.length) { more.remove(); FULL.delete(p.id); }
    });
  }
  function fitMap() { // true when the map needs a redraw at a new stretch
    const w = $('#main .mapwrap'); if (!w) return false;
    const svg = $('svg', w), r = svg.getBoundingClientRect();
    const k = FIT.matches && r.width ? Math.max(1, Math.min(1.8, Math.round(r.height / r.width * 1000 / 600 * 20) / 20)) : 1;
    if (k === MK) return false; MK = k; return true;
  }
  document.fonts?.ready.then(() => { if (!$('#app').hidden) { fitLists(); drawHub(); } }); // row heights change once web fonts arrive
  let fitTimer = null;
  addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => { if (!$('#app').hidden) { if (fitMap()) renderMain(); else { fitLists(); drawHub(); } } }, 150); });
  let loadTimer = null;
  function renderAll(withLoading = true, delay = 320) {
    renderTabs(); renderFilters(); renderMeta();
    clearTimeout(loadTimer);
    if (withLoading) { $('#main').innerHTML = skeleton(); loadTimer = setTimeout(renderMain, delay); }
    else renderMain();
  }
  function focusKey() {
    const a = document.activeElement; if (!a || a === document.body) return null;
    if (a.id) return '#' + a.id;
    for (const at of ['data-open', 'data-tab']) if (a.getAttribute(at)) return `[${at}="${a.getAttribute(at)}"]`;
    if (a.dataset.action) return `[data-action="${a.dataset.action}"]${a.dataset.k ? `[data-k="${a.dataset.k}"]` : ''}${a.dataset.table ? `[data-table="${a.dataset.table}"]` : ''}`;
    return null;
  }
  function restoreFocus(k) { if (!k) return; try { const el = $(k); if (el && document.activeElement === document.body) el.focus({ preventScroll: true }); } catch (e) { /* selector not valid any more */ } }

  function setTab(id, focusTab) {
    if (!TABS.some(t => t.id === id)) return;
    S.tab = id; history.replaceState(null, '', '#' + id);
    tabIn = true;
    closeDrawer(true); closeRideView();
    renderAll(true);
    scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    if (focusTab) $(`[data-tab="${id}"]${matchMedia('(max-width: 960px)').matches ? '.tab[id^="mt-"]' : '.tab[id^="t-"]'}`)?.focus();
  }
  function setFilter(k, v) { S[k] = v; S.updated = new Date(); renderAll(true, 260); }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab],[data-open],[data-action]');
    if (!t) return;
    if (t.dataset.tab) return setTab(t.dataset.tab);
    if (t.dataset.open) {
      const k = t.dataset.open;
      if (k.startsWith('tab:')) { closeDrawer(true); return setTab(k.slice(4)); }
      return openDrawer(k);
    }
    const a = t.dataset.action, k = t.dataset.k;
    switch (a) {
      case 'theme': return toggleTheme();
      case 'home': history.replaceState(null, '', '#welcome'); return showLanding();
      case 'close': return closeDrawer();
      case 'refresh': S.updated = new Date(); return renderAll(true, 400);
      case 'retry': S.fail = null; history.replaceState(null, '', location.pathname + location.hash); return renderAll(true, 500);
      case 'prev': return setFilter('date', ZP.addDays(S.date, -1));
      case 'next': return setFilter('date', ZP.addDays(S.date, 1));
      case 'today': return setFilter('date', ZP.todayISO());
      case 'yesterday': return setFilter('date', ZP.addDays(ZP.todayISO(), -1));
      case 'period': return setFilter('period', k);
      case 'clear-zone': return setFilter('zone', 'all');
      case 'mapzone': if (t.closest('#drawer')) { closeDrawer(true); return setFilter('zone', k); } return setFilter('zone', S.zone === k ? 'all' : k);
      case 'reset': Object.assign(S, { date: ZP.todayISO(), period: 'day', zone: 'all', ride: 'all' }); return renderAll(true, 260);
      case 'wof': S.woFilter = k; return renderMain();
      case 'lsub': S.lsub = k; return renderMain();
      case 'rstream': S.rstream = k; return renderMain();
      case 'fcat': S.fcat = k; return renderMain();
      case 'ovride': selectRide(k); return openRideView(k);
      case 'rvride': selectRide(k); return openRideView(k);
      case 'rvclose': return closeRideView();
      case 'pickday': closeDrawer(true); S.period = 'day'; return setFilter('date', k);
      case 'sort': { const id = t.dataset.table, cur = S.sort[id]; S.sort[id] = { k, dir: cur && cur.k === k && cur.dir === 'desc' ? 'asc' : 'desc' }; return renderMain(); }
      case 'tview': {
        const p = t.closest('.panel'), on = t.getAttribute('aria-pressed') !== 'true';
        t.setAttribute('aria-pressed', String(on)); t.innerHTML = `${icon(on ? 'bars' : 'table')}<span>${on ? 'Chart' : 'Table'}</span>`;
        $$('.cv', p).forEach(cv => { $('.cv-chart', cv).hidden = on; $('.cv-table', cv).hidden = !on; });
        return;
      }
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'fDate' && e.target.value) setFilter('date', e.target.value);
    if (e.target.id === 'fZone') setFilter('zone', e.target.value);
    if (e.target.id === 'fRide') setFilter('ride', e.target.value);
  });
  document.addEventListener('keydown', e => {
    if (!$('#drawerWrap').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); return closeDrawer(); }
      if (e.key === 'Tab') { // keep focus inside the drawer
        const f = $$('#drawer button, #drawer [tabindex="0"], #drawer a[href]').filter(x => !x.hidden && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === $('#drawer'))) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    if (!$('#rideView').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); return closeRideView(); }
      if (e.key === 'Tab') { // keep focus inside the ride view
        const f = $$('#rv button, #rv [tabindex="0"]').filter(x => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === $('#rv'))) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    const t = e.target;
    if (t.matches?.('[role="tab"]') && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const i = TABS.findIndex(x => x.id === t.dataset.tab), N = TABS.length;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? (i + 1) % N : (i - 1 + N) % N;
      return setTab(TABS[j].id, true);
    }
    if ((e.key === 'Enter' || e.key === ' ') && (t.matches?.('tr[data-open]') || t.matches?.('g[data-open]') || t.matches?.('rect[data-action]'))) { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  // generic tooltips for [data-tip]
  const tipShow = el => { const t = $('#tip'); t.innerHTML = `<div>${esc(el.dataset.tip)}</div>`; const r = el.getBoundingClientRect(); CH.place(t, r.left + r.width / 2, r.top); };
  document.addEventListener('pointerover', e => { const el = e.target.closest?.('[data-tip]'); if (el && !el.closest('[data-chart]')) tipShow(el); });
  document.addEventListener('pointerout', e => { const el = e.target.closest?.('[data-tip]'); if (el && !el.contains(e.relatedTarget)) $('#tip').hidden = true; });
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el && !el.closest('[data-chart]')) tipShow(el); });
  document.addEventListener('focusout', e => { if (e.target.closest?.('[data-tip]')) $('#tip').hidden = true; });
  addEventListener('scroll', () => { if (!document.activeElement?.closest?.('[data-chart]')) $('#tip').hidden = true; }, { passive: true });

  addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h === 'welcome' || !h) return showLanding();
    if ($('#app').hidden) enter(h); else if (h !== S.tab) setTab(h);
  });
  // live refresh for today's figures; never steals focus or opens skeletons
  setInterval(() => {
    if ($('#app').hidden || document.hidden || S.date !== ZP.todayISO() || !$('#drawerWrap').hidden || !$('#rideView').hidden) return;
    S.updated = new Date(); renderTabs(); renderMeta();
    const y = scrollY; renderMain(); scrollTo(0, y);
  }, 30000);
  // midnight rollover keeps "today" honest
  let lastToday = ZP.todayISO();
  setInterval(() => { const t = ZP.todayISO(); if (t !== lastToday) { if (S.date === lastToday) S.date = t; lastToday = t; if (!$('#app').hidden) renderAll(false); } }, 60000);

  /* ---------- boot ---------- */
  applyTheme(theme());
  const h0 = location.hash.slice(1);
  if (TABS.some(t => t.id === h0)) { landing.hidden = true; enter(h0); }
  else showLanding();
})();

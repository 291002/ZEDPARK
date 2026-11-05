'use strict';
/* ZED Park demo data model.
   Every figure is generated deterministically from the date, so all tabs agree with each
   other and with the clock. Replace the functions below with live feeds when connected. */
window.ZP = (() => {
  const OPEN = 10, CLOSE = 24;
  const HOURS = Array.from({ length: CLOSE - OPEN }, (_, i) => OPEN + i); // 10..23
  const CAPACITY = 7000;
  const TARIFF = { kwh: 2.34, potable: 18.5, irrigation: 4.75 }; // EGP, assumed demo tariffs

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const todayISO = () => iso(new Date());
  const sum = a => a.reduce((x, y) => x + (y || 0), 0);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = Math.round;
  const hm = h => { const m = round(h * 60); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  /* ---------- static park definition ---------- */
  const ZONES = [
    { id: 'EVL', name: 'Events Lawn',        rect: [30, 30, 290, 190] },
    { id: 'GAR', name: 'Central Garden',     rect: [335, 30, 330, 375] },
    { id: 'THR', name: 'Thrill Rides',       rect: [680, 30, 290, 190] },
    { id: 'FCT', name: 'Food Court',         rect: [30, 235, 290, 170] },
    { id: 'FWP', name: 'Ferris Wheel Plaza', rect: [680, 235, 290, 170] },
    { id: 'FAM', name: 'Family Rides',       rect: [30, 420, 290, 150] },
    { id: 'ENT', name: 'Entrance Plaza',     rect: [335, 420, 330, 150] },
    { id: 'RET', name: 'Retail Promenade',   rect: [680, 420, 290, 150] },
  ];
  const ZONE = Object.fromEntries(ZONES.map(z => [z.id, z]));

  const RIDES = [
    // Ride names follow ZED Park's published lineup (Nawy park guide); capacity and power use manufacturer data where the ride type is known.
    { id: 'FW',  name: 'Ferris Wheel',  zone: 'FWP', cap: 1080, pop: .30, cycle: 12, kw: 75,  ppr: 120 },
    { id: 'CAR', name: 'Carousel',      zone: 'FAM', cap: 600,  pop: .10, cycle: 4,  kw: 22,  ppr: 60 },
    { id: 'CUP', name: 'Mini Teacups',  zone: 'FAM', cap: 480,  pop: .08, cycle: 3,  kw: 2,   ppr: 60 },
    { id: 'BMP', name: 'Bumper Cars',   zone: 'FAM', cap: 400,  pop: .09, cycle: 4,  kw: 45,  ppr: 60 },
    { id: 'TRN', name: 'Circus Train',  zone: 'FAM', cap: 350,  pop: .06, cycle: 6,  kw: 15,  ppr: 60 },
    { id: 'SWG', name: 'Flying Chairs', zone: 'THR', cap: 720,  pop: .11, cycle: 3,  kw: 90,  ppr: 60 },
    { id: 'DRP', name: 'Samba Balloon', zone: 'THR', cap: 640,  pop: .10, cycle: 2,  kw: 7.5, ppr: 60 },
    { id: 'CST', name: 'Karting',       zone: 'THR', cap: 300,  pop: .13, cycle: 6,  kw: 60,  ppr: 90 },
    { id: 'PEN', name: 'Galleon 42',    zone: 'THR', cap: 630,  pop: .09, cycle: 3,  kw: 46,  ppr: 60 },
  ];
  const RIDE = Object.fromEntries(RIDES.map(r => [r.id, r]));
  /* Researched ride facts. "spec" is manufacturer data for the ride type; ZED Park has not published its exact models.
     Photos are representative (Wikimedia Commons, free licences), not photos taken at ZED Park. */
  const SRC_LINEUP = { label: 'Nawy — ZED Park guide', url: 'https://www.nawy.com/blog/112002-zed-park-the-young-the-adult-magical-space' };
  const SRC_OPEN = { label: 'Daily News Egypt — Naguib Sawiris opens ZED Park', url: 'https://www.dailynewsegypt.com/?p=719000' };
  const RIDE_INFO = {
    FW: { type: 'Giant Ferris wheel', blurb: 'The park’s landmark wheel, with views across ZED Park and Sheikh Zayed.',
      facts: [['Height', '45 m, as reported at the park’s opening (one listing says 55 m)'], ['Opening', 'Announced with Cairo Winter Wonderland, January 2020']],
      src: [SRC_OPEN, SRC_LINEUP],
      photo: { file: 'fw.jpg', title: 'Illuminated Ferris wheel at dusk in Vientiane, Laos', artist: 'Basile Morin', lic: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Illuminated_Ferris_wheel_at_dusk_in_Vientiane,_Laos.jpg' } },
    CAR: { type: 'Classic carousel', blurb: 'A horse carousel for all ages, one of the rides open since the park launched.',
      facts: [], src: [SRC_LINEUP, SRC_OPEN],
      photo: { file: 'car.jpg', title: 'Carousel, 6th of October City, Egypt', artist: 'Faris El-Gwely', lic: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Carousel,_6th_of_October_City,_Egypt.JPG' } },
    CUP: { type: 'Spinning teacups (family)', blurb: 'Small spinning cups for young children, ridden with or without an adult.',
      spec: { model: 'Zamperla Tea Cup Mini', riders: '24 per cycle', hourly: '480 riders/h', height: '3 m', footprint: 'Ø 7.5 m', rideTime: '120 s', minHeight: '75 cm with an adult · 105 cm alone', power: '2 kW' },
      src: [SRC_LINEUP, { label: 'Zamperla — Tea Cup Mini', url: 'https://zamperla.com/product/tea-cup-mini' }],
      photo: { file: 'cup.jpg', title: 'Seibuen Amusement Park — teacups', artist: 'Tomohiro Ohtake', lic: 'CC BY 2.0', page: 'https://commons.wikimedia.org/wiki/File:Seibuen_Amusement_Park_(9996422995).jpg' } },
    BMP: { type: 'Bumper cars (dodgems)', blurb: 'Electric bumper cars on a covered floor.',
      facts: [], src: [SRC_LINEUP],
      photo: { file: 'bmp.jpg', title: 'Radiobilarna, Liseberg', artist: 'Albin Olsson', lic: 'CC BY-SA 3.0', page: 'https://commons.wikimedia.org/wiki/File:Radiobilarna_Liseberg_2013-04-28_2.jpg' } },
    TRN: { type: 'Children’s circus train', blurb: 'A slow, circus-themed train ride looping through the family area.',
      facts: [], src: [SRC_LINEUP],
      photo: { file: 'trn.jpg', title: 'Children’s train ride', artist: 'Dzherikhov Vladimir', lic: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Children%27s_train_ride,_%D0%BF%D0%B0%D1%80%D0%BE%D0%B2%D0%BE%D0%B7%D0%B8%D0%BA_%D0%B4%D0%B5%D1%82%D1%81%D0%BA%D0%B8%D0%B9_%D0%B0%D1%82%D1%82%D1%80%D0%B0%D0%BA%D1%86%D0%B8%D0%BE%D0%BD,_%D0%BC%D0%B0%D0%B9_2015.jpg' } },
    SWG: { type: 'Chair swing ride', blurb: 'Seats hung on chains swing outward as the canopy spins.',
      facts: [], src: [SRC_LINEUP, SRC_OPEN],
      photo: { file: 'swg.jpg', title: 'Swing ride', artist: 'Tiia Monto', lic: 'CC BY 4.0', page: 'https://commons.wikimedia.org/wiki/File:Swing_ride.jpg' } },
    DRP: { type: 'Rotating balloon ride (family)', blurb: 'Hot-air-balloon baskets that turn around a central mast.',
      spec: { model: 'Zamperla Samba Balloon 8', riders: '32 children, or 16 children + 8 adults', hourly: '640 riders/h', height: '5.3 m', footprint: 'Ø 10.9 m', rideTime: '120 s', minHeight: '90 cm · 105 cm alone', power: '7.5 kW' },
      src: [SRC_LINEUP, { label: 'Zamperla — Samba Balloon 8', url: 'https://www.zamperla.com/product/samba-balloon8' }],
      photo: { file: 'drp.jpg', title: 'Samba Balloon', artist: 'Corey Coyle', lic: 'CC BY 3.0', page: 'https://commons.wikimedia.org/wiki/File:Samba_Balloon_-_panoramio.jpg' } },
    CST: { type: 'Go-kart track', blurb: 'Timed laps on a kart circuit. Some games are charged on top of the entry ticket.',
      facts: [], src: [SRC_LINEUP, { label: 'Property Finder — ZED Park guide', url: 'https://www.propertyfinder.eg/blog/?p=12538' }],
      photo: { file: 'cst.jpg', title: 'Aviemore Centre go-kart track', artist: 'David Dixon', lic: 'CC BY-SA 2.0', page: 'https://commons.wikimedia.org/wiki/File:Aviemore_Centre,_Go-Kart_Track_-_geograph.org.uk_-_2281543.jpg' } },
    PEN: { type: 'Swinging pirate ship', blurb: 'A galleon that swings like a pendulum; the name matches Zamperla’s 42-seat Galleon.',
      spec: { model: 'Zamperla Galleon (42 seats)', riders: '42 adults', hourly: '630 riders/h', height: '14 m', footprint: '19 × 8 m', rideTime: '120 s', minHeight: '105 cm · 120 cm alone', power: '46 kW' },
      src: [SRC_LINEUP, { label: 'Zamperla — Galleon', url: 'https://www.zamperla.com/product/galleon' }],
      photo: { file: 'pen.jpg', title: 'Pattaya Park Galleon', artist: 'Suansanookthai', lic: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Pattaya_Park_Galleon.jpg' } },
  };

  const TICKETS = [
    { id: 'GEN', name: 'General admission',         price: 150, share: .50 },
    { id: 'CHD', name: 'Child (under 12)',          price: 90,  share: .22 },
    { id: 'WRB', name: 'Unlimited-rides wristband', price: 450, share: .17 },
    { id: 'GRP', name: 'Group & school',            price: 110, share: .07 },
    { id: 'CMP', name: 'Complimentary',             price: 0,   share: .04 },
  ];

  const OUTLETS = [
    { id: 'O01', name: 'Olive & Ember Grill',  zone: 'FCT', cat: 'Food & beverage', comm: .15, rent: 180000, w: .16, svc: 9, tkt: 185 },
    { id: 'O02', name: 'Koshary Station',      zone: 'FCT', cat: 'Food & beverage', comm: .12, rent: 95000,  w: .12, svc: 5, tkt: 95 },
    { id: 'O03', name: 'Shawarma Yard',        zone: 'FCT', cat: 'Food & beverage', comm: .13, rent: 110000, w: .13, svc: 6, tkt: 120 },
    { id: 'O04', name: 'Fresh Press Juices',   zone: 'FCT', cat: 'Food & beverage', comm: .18, rent: 60000,  w: .07, svc: 4, tkt: 70 },
    { id: 'O08', name: 'Sweet Dune Desserts',  zone: 'FCT', cat: 'Food & beverage', comm: .16, rent: 70000,  w: .07, svc: 4, tkt: 85 },
    { id: 'O05', name: 'Karak Corner Café',    zone: 'FWP', cat: 'Food & beverage', comm: .16, rent: 75000,  w: .09, svc: 4, tkt: 75 },
    { id: 'O06', name: 'Gelato Garden',        zone: 'GAR', cat: 'Food & beverage', comm: .18, rent: 55000,  w: .08, svc: 3, tkt: 65 },
    { id: 'O07', name: 'Crêpe Lane',           zone: 'RET', cat: 'Food & beverage', comm: .15, rent: 50000,  w: .06, svc: 6, tkt: 90 },
    { id: 'O09', name: 'ZED Souvenirs',        zone: 'RET', cat: 'Retail',          comm: .20, rent: 85000,  w: .08, svc: 3, tkt: 260 },
    { id: 'O10', name: 'Toy Harbour',          zone: 'RET', cat: 'Retail',          comm: .18, rent: 65000,  w: .06, svc: 3, tkt: 230 },
    { id: 'O11', name: 'Lantern Photo Studio', zone: 'FWP', cat: 'Retail',          comm: .22, rent: 40000,  w: .04, svc: 7, tkt: 300 },
  ];
  const OUTLET_W = sum(OUTLETS.map(o => o.w));

  // [id, name, zone, fixture type, kW, dimmable (DALI), map position]
  const CIRCUITS = [
    ['LC-ENT-01', 'Entrance gateway floodlights', 'ENT', 'Floodlight', 18, true,  [395, 465]],
    ['LC-ENT-02', 'Plaza bollards',               'ENT', 'Bollard',    6,  false, [605, 465]],
    ['LC-ENT-03', 'Ticket hall canopy',           'ENT', 'Canopy',     9,  true,  [500, 540]],
    ['LC-FWP-01', 'Ferris wheel LED show',        'FWP', 'RGB show',   32, true,  [835, 300]],
    ['LC-FWP-02', 'Wheel plaza uplights',         'FWP', 'Uplight',    8,  true,  [720, 375]],
    ['LC-FWP-03', 'Plaza pathway bollards',       'FWP', 'Bollard',    5,  false, [935, 375]],
    ['LC-FAM-01', 'Carousel canopy',              'FAM', 'Decorative', 7,  true,  [80, 465]],
    ['LC-FAM-02', 'Family rides pathway',         'FAM', 'Bollard',    5,  false, [175, 545]],
    ['LC-FAM-03', 'Family area floodlights',      'FAM', 'Floodlight', 14, false, [285, 465]],
    ['LC-THR-01', 'Coaster track lighting',       'THR', 'Decorative', 12, true,  [730, 80]],
    ['LC-THR-02', 'Thrill zone floodlights',      'THR', 'Floodlight', 20, false, [925, 80]],
    ['LC-THR-03', 'Queue line lighting',          'THR', 'Linear',     4,  true,  [825, 190]],
    ['LC-FCT-01', 'Food court canopy',            'FCT', 'Canopy',     15, true,  [80, 280]],
    ['LC-FCT-02', 'Seating festoons',             'FCT', 'Festoon',    6,  false, [275, 370]],
    ['LC-RET-01', 'Shopfront wash lights',        'RET', 'Linear',     10, true,  [730, 465]],
    ['LC-RET-02', 'Promenade festoons',           'RET', 'Festoon',    6,  false, [925, 540]],
    ['LC-GAR-01', 'Palm uplights — north',        'GAR', 'Uplight',    11, true,  [385, 80]],
    ['LC-GAR-02', 'Palm uplights — south',        'GAR', 'Uplight',    11, true,  [615, 360]],
    ['LC-GAR-03', 'Garden path bollards',         'GAR', 'Bollard',    7,  false, [385, 330]],
    ['LC-GAR-04', 'Fountain lighting',            'GAR', 'RGB show',   5,  true,  [560, 215]],
    ['LC-EVL-01', 'Lawn floodlights',             'EVL', 'Floodlight', 24, true,  [80, 80]],
    ['LC-EVL-02', 'Stage perimeter',              'EVL', 'Linear',     8,  true,  [275, 80]],
    ['LC-EVL-03', 'Lawn bollards',                'EVL', 'Bollard',    5,  false, [175, 190]],
  ].map(([id, name, zone, type, kw, dali, pos]) => ({ id, name, zone, type, kw, dali, pos }));

  // Faults are dated relative to today so the demo always shows a recent history.
  const CIRCUIT_FAULT = {
    'LC-GAR-03': { kind: 'fault',   since: -2, note: 'Earth-leakage breaker tripped' },
    'LC-FAM-03': { kind: 'fault',   since: 0,  note: 'Lamp failure — 3 of 12 fittings out' },
    'LC-RET-02': { kind: 'offline', since: -1, note: 'Lighting controller not responding' },
  };

  const VALVES = [
    ['V-01', 'GAR', 'Central lawn north', 2.0, 60], ['V-02', 'GAR', 'Central lawn south', 3.0, 60],
    ['V-03', 'GAR', 'Palm grove drip', 4.0, 45],    ['V-04', 'ENT', 'Entrance beds', 2.0, 40],
    ['V-05', 'EVL', 'Events lawn east', 2.5, 55],   ['V-06', 'EVL', 'Events lawn west', 3.5, 55],
    ['V-07', 'EVL', 'Stage hedges', 4.5, 30],       ['V-08', 'FWP', 'Wheel plaza beds', 2.0, 45],
    ['V-09', 'FAM', 'Family area planters', 3.0, 35], ['V-10', 'THR', 'Thrill zone palms', 4.0, 40],
  ].map(([id, zone, area, start, dur]) => ({ id, zone, area, start, dur }));

  const SENSORS = [
    ['SM-01', 'GAR', 'Central lawn north', 'V-01'], ['SM-02', 'GAR', 'Central lawn south', 'V-02'],
    ['SM-03', 'GAR', 'Palm grove', 'V-03'],         ['SM-04', 'ENT', 'Entrance beds', 'V-04'],
    ['SM-05', 'EVL', 'Events lawn east', 'V-05'],   ['SM-06', 'EVL', 'Events lawn west', 'V-06'],
    ['SM-07', 'EVL', 'Stage hedges', 'V-07'],       ['SM-08', 'FWP', 'Wheel plaza beds', 'V-08'],
  ].map(([id, zone, area, valve]) => ({ id, zone, area, valve }));

  /* ---------- time helpers ---------- */
  function clock(date) {
    const t = todayISO();
    const state = date > t ? 'future' : date === t ? 'today' : 'past';
    const n = new Date();
    const nowH = state === 'today' ? n.getHours() + n.getMinutes() / 60 : state === 'past' ? 24 : 0;
    // Snapshot for "status" values: now for today, 23:00 (evening peak close) for past days.
    const snap = state === 'today' ? nowH : state === 'past' ? 23 : null;
    return { state, nowH, snap, open: snap != null && snap >= OPEN && snap < CLOSE };
  }
  const slotFrac = (nowH, h) => clamp(nowH - h, 0, 1);
  const sunset = date => { const d = parse(date); const doy = (d - new Date(d.getFullYear(), 0, 0)) / 864e5; return 17.9 + 1.1 * Math.sin(2 * Math.PI * (doy - 80) / 365); };
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  /* ---------- the day model ---------- */
  const cache = new Map();
  function day(date) {
    const ck = clock(date);
    const key = date + '|' + (ck.state === 'today' ? Math.floor(ck.nowH * 12) : ck.state);
    if (cache.has(key)) return cache.get(key);
    const r = rng(hash('zed|' + date));
    const d = parse(date), dow = d.getDay();
    const { state, nowH, snap } = ck;

    // Visitors: Egyptian weekend (Fri/Sat) peaks; evening arrivals dominate.
    const dowF = [1.05, .92, .9, .95, 1.22, 1.6, 1.42][dow];
    const targetVisitors = [9500, 8500, 8500, 9000, 11000, 14500, 13000][dow];
    const fullVisitors = round(9000 * dowF * (.9 + r() * .18));
    const W = [2, 3, 4, 5, 5, 6, 8, 11, 13, 13, 11, 9, 6, 4].map(w => w * (.92 + r() * .16));
    const Wsum = sum(W);
    const arrFull = W.map(w => fullVisitors * w / Wsum);
    let acc = 0; const cumW = W.map(w => (acc += w / Wsum));
    const frac = HOURS.map(h => slotFrac(nowH, h));
    const arrivals = arrFull.map((a, i) => round(a * frac[i]));
    const visitors = sum(arrivals);
    const insideFull = []; let ins = 0;
    arrFull.forEach((a, i) => { ins = ins * .82 + a; insideFull[i] = ins; });
    const inside = insideFull.map((v, i) => frac[i] >= 1 ? round(v) : frac[i] > 0 ? round((i ? insideFull[i - 1] : 0) * (1 - .18 * frac[i]) + arrFull[i] * frac[i]) : null);
    const hourIdx = snap == null ? -1 : clamp(Math.floor(snap) - OPEN, -1, HOURS.length - 1);
    const insideNow = state === 'today' ? (ck.open && hourIdx >= 0 ? inside[hourIdx] : 0) : null;
    const insidePeak = Math.max(0, ...inside.filter(v => v != null));
    const cumShare = HOURS.reduce((a, h, i) => a + W[i] / Wsum * frac[i], 0);
    const targetToDate = round(targetVisitors * cumShare);

    // Tickets
    const tickets = TICKETS.map(t => ({ ...t, count: round(visitors * t.share * (.93 + r() * .14)) }));
    const diff = visitors - sum(tickets.map(t => t.count)); tickets[0].count += diff;
    tickets.forEach(t => t.revenue = t.count * t.price);
    const grp = tickets.find(t => t.id === 'GRP').count;
    const online = round((visitors - grp) * (.31 + r() * .1));
    const channels = [
      { id: 'online', name: 'Online pre-booked', count: online },
      { id: 'gate', name: 'Gate kiosk & counter', count: visitors - grp - online },
      { id: 'group', name: 'Group & corporate', count: grp },
    ];
    const wristShare = tickets.find(t => t.id === 'WRB').count / Math.max(1, visitors);

    // Rides: planned maintenance, unplanned stops, queues, riders
    const maintRide = r() < .45 ? RIDES[1 + Math.floor(r() * 8)].id : null;
    const wind = 3 + r() * 6;
    const rides = RIDES.map(def => {
      const rr = rng(hash('ride|' + date + def.id));
      const down = [];
      if (def.id !== maintRide && rr() < .32) {
        const s = 11 + rr() * 11, du = .25 + rr() * .9;
        down.push({ start: s, end: Math.min(CLOSE, s + du), reason: pick(rr, def.id === 'FW' ? ['Wind hold', 'Cabin door sensor', 'Drive inverter alarm'] : ['Restraint sensor fault', 'Power trip', 'Guest illness clean-up', 'Brake pressure alarm', 'Safety stop — e-stop pressed']) });
      }
      const limited = def.id !== maintRide && rr() < .12;
      const limitNote = limited ? (def.id === 'FW' ? '2 cabins out of service' : pick(rr, ['Running one train', 'Reduced seats — 2 rows closed', 'Slower cycle — operator training'])) : null;
      const capF = limited ? (def.id === 'FW' ? 34 / 36 : .75) : 1;
      const hourly = HOURS.map((h, i) => {
        const avail = def.id === maintRide ? 0 : 1 - sum(down.map(w => overlap(h, h + 1, w.start, w.end)));
        const demand = insideFull[i] * def.pop * .45;
        const capH = def.cap * avail * capF;
        const util = capH > 0 ? demand / capH : 0;
        const queue = avail > 0 ? Math.min(75, round(def.cycle + 55 * Math.min(util, 1.3) ** 2)) : null;
        return { h, avail, riders: round(Math.min(capH, demand) * frac[i]), queue: frac[i] > 0 ? queue : null, util };
      });
      const st = snap == null ? null
        : !ck.open ? 'closed'
          : def.id === maintRide ? 'maintenance'
            : down.some(w => snap >= w.start && snap < w.end) ? 'down'
              : limited ? 'limited' : 'operating';
      const cur = hourIdx >= 0 ? hourly[hourIdx] : null;
      const sched = Math.max(0, Math.min(nowH, CLOSE) - OPEN) * 60;
      const downMin = def.id === maintRide ? sched : round(sum(down.map(w => overlap(OPEN, Math.min(nowH, CLOSE), w.start, w.end))) * 60);
      const riders = sum(hourly.map(x => x.riders));
      const queues = hourly.map(x => x.queue).filter(q => q != null);
      return {
        ...def, status: st, maintenance: def.id === maintRide, down: down.filter(w => w.start < nowH), limitNote,
        hourly, riders, queueNow: (st === 'operating' || st === 'limited') && cur ? cur.queue : null,
        queueAvg: queues.length ? round(sum(queues) / queues.length) : null, queueMax: queues.length ? Math.max(...queues) : null,
        downMin, availability: sched ? clamp(1 - downMin / sched, 0, 1) : null,
        revenue: round(riders * (1 - wristShare) * def.ppr),
      };
    });
    const fw = rides.find(x => x.id === 'FW');
    fw.ferris = {
      cabins: 36, inService: fw.status === 'maintenance' ? 0 : fw.limitNote ? 34 : 36, rotation: 12, vipCabins: 2,
      wind: +wind.toFixed(1), windLimit: 15, lastInspection: '09:10', inspectionResult: 'Pass',
      utilisation: (() => { const cap = sum(fw.hourly.map((x, i) => fw.cap * x.avail * frac[i])); return cap ? fw.riders / cap : null; })(),
    };

    // Food & retail — tenant sales are NOT park revenue; the park earns commission + rent.
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const spend = 205 * (.94 + r() * .12);
    const outlets = OUTLETS.map(o => {
      const orr = rng(hash('out|' + date + o.id));
      const hourly = HOURS.map((h, i) => round((insideFull[i] / sum(insideFull)) * fullVisitors * spend * o.w / OUTLET_W * (.9 + orr() * .2) * frac[i]));
      const sales = sum(hourly);
      const peakLoad = Math.max(...insideFull) / CAPACITY;
      const svcNow = state === 'today' && hourIdx >= 0 && ck.open ? +(o.svc * (.8 + .6 * insideFull[hourIdx] / CAPACITY) * (.9 + orr() * .2)).toFixed(1) : null;
      return {
        ...o, hourly, sales, txns: round(sales / o.tkt), commission: round(sales * o.comm), rentDay: round(o.rent / daysInMonth),
        svcAvg: sales ? +(o.svc * (.85 + .45 * peakLoad) * (.92 + orr() * .16)).toFixed(1) : null, svcNow,
      };
    });

    // Events (bookings exist for future dates too)
    const evr = rng(hash('ev|' + date));
    const events = [];
    const addEv = (type, name, zone, venue, start, dur, cap, booked, price) => {
      const cancelled = state === 'past' && evr() < .04;
      const end = start + dur;
      const status = cancelled ? 'cancelled' : state === 'future' ? 'scheduled' : state === 'past' ? 'completed'
        : nowH >= end ? 'completed' : nowH >= start ? 'in-progress' : 'scheduled';
      const att = status === 'completed' ? round(booked * (.86 + evr() * .12)) : status === 'in-progress' ? round(booked * clamp((nowH - start + .5) / 1, .3, .95)) : null;
      events.push({ id: `EV-${date.replace(/-/g, '').slice(2)}-${pad(events.length + 1)}`, type, name, zone, venue, start, end, cap, booked, att, price, status, revenue: cancelled ? 0 : booked * price });
    };
    const nB = 1 + Math.floor(evr() * 3);
    for (let i = 0; i < nB; i++) addEv('Birthday party', `${pick(evr, ['Malak', 'Youssef', 'Farida', 'Omar', 'Laila', 'Adam', 'Jana', 'Seif'])}'s birthday`, 'EVL', `Pavilion ${'AB'[i % 2]}`, 15 + i * 1.5 + round(evr()), 2.5, 80, 30 + round(evr() * 50), 250);
    if (dow <= 4 && evr() < .5) addEv('School trip', pick(evr, ['Nile Valley School — Grade 4', 'Green Hills Academy — KG', 'Future Language School — Grade 6']), 'FAM', 'Family Rides meeting point', 10.5, 3.5, 260, 120 + round(evr() * 130), 80);
    if (dow <= 4 && evr() < .4) addEv('Corporate evening', pick(evr, ['Delta Pharma staff night', 'Horizon Telecom team event', 'Atlas Bank family day']), 'EVL', 'Main tent', 19.5, 3, 300, 150 + round(evr() * 150), 450);
    if (dow >= 4) addEv('Live music night', pick(evr, ['Oud & Strings under the Wheel', 'Retro Hits Night', 'Sunset Jazz Sessions', 'Shaabi Night']), 'EVL', 'Main stage', 20.5, 2.5, 1500, 700 + round(evr() * 800), 300);
    events.sort((a, b) => a.start - b.start);

    // Incidents and complaints
    const ir = rng(hash('inc|' + date));
    const incidents = [];
    const nInc = state === 'future' ? 0 : round(fullVisitors / 2600 + ir() * 1.5);
    const TYPES = [['First aid — minor', 'Low', 'Guest treated at first-aid post'], ['Lost child', 'Medium', 'Child reunited with family'], ['Slip / trip', 'Low', 'Guest assisted, area inspected'], ['Security', 'Medium', 'Security team attended'], ['Heat exhaustion', 'Medium', 'Guest rested and rehydrated']];
    for (let i = 0; i < nInc; i++) {
      const t = OPEN + .5 + ir() * 13; if (t > nowH) continue;
      const [type, sev, outcome] = pick(ir, TYPES);
      incidents.push({ time: t, type, sev, zone: pick(ir, ZONES).id, outcome });
    }
    rides.forEach(x => x.down.forEach(w => incidents.push({ time: w.start, type: 'Ride stoppage', sev: 'Medium', zone: x.zone, ride: x.id, outcome: `${x.name}: ${w.reason}` })));
    incidents.sort((a, b) => a.time - b.time);
    incidents.forEach((x, i) => {
      x.id = `INC-${date.replace(/-/g, '').slice(2)}-${pad(i + 1)}`;
      const age = (nowH - x.time) * 60;
      x.status = state !== 'today' ? 'closed' : age < 45 ? 'open' : age < 120 ? 'investigating' : 'closed';
    });

    const downCount = sum(rides.map(x => x.down.length)) + (maintRide ? 1 : 0);
    const peakQueue = Math.max(0, ...rides.map(x => x.queueMax || 0));
    const csat = visitors ? clamp(4.78 - .009 * peakQueue - .05 * downCount - .02 * incidents.length + (r() - .5) * .12, 3.6, 4.85) : null;
    const responses = round(visitors * .028);
    const cr = rng(hash('cmp|' + date));
    const CATS = ['Queues & waiting', 'Ride closures', 'Cleanliness', 'Prices', 'Staff', 'Facilities', 'Food quality'];
    const catW = [1 + peakQueue / 25, .3 + downCount * .5, .8, .9, .5, .6, .6];
    const nComp = round(visitors * .0031 + (visitors ? downCount * 2 : 0));
    const complaints = [];
    const TXT = {
      'Queues & waiting': ['Long wait for the Ferris wheel', 'Queue line has no shade', 'Fast-pass queue not respected'],
      'Ride closures': ['Ride closed without notice', 'No refund offered for closed ride'],
      'Cleanliness': ['Toilets near food court need attention', 'Litter bins overflowing'],
      'Prices': ['Food prices too high', 'Wristband price not clear at gate'],
      'Staff': ['Rude staff at ticket counter', 'Staff could not give directions'],
      'Facilities': ['Not enough seating', 'Baby changing room locked', 'Card machine not working'],
      'Food quality': ['Food served cold', 'Order took too long'],
    };
    const wsum = sum(catW);
    for (let i = 0; i < nComp; i++) {
      let x = cr() * wsum, c = 0; while (x > catW[c]) { x -= catW[c]; c++; }
      const cat = CATS[Math.min(c, CATS.length - 1)];
      const t = OPEN + cr() * Math.max(.1, Math.min(nowH, CLOSE) - OPEN);
      const age = (nowH - t) * 60;
      complaints.push({ id: `CMP-${date.replace(/-/g, '').slice(4)}-${pad(i + 1)}`, time: t, cat, text: pick(cr, TXT[cat]), zone: pick(cr, ZONES).id, channel: pick(cr, ['Survey', 'Guest desk', 'App', 'Social media']), status: state !== 'today' ? 'resolved' : age < 40 ? 'open' : age < 90 ? 'in-progress' : 'resolved', resMin: 15 + round(cr() * 70) });
    }
    complaints.sort((a, b) => b.time - a.time);

    // Inspections
    const inspections = [];
    RIDES.forEach(def => {
      const x = rides.find(y => y.id === def.id);
      inspections.push({ time: 9 + RIDES.indexOf(def) * .08, item: `${def.name} — daily pre-opening check`, zone: def.zone, ride: def.id, result: state === 'future' || nowH < 9.1 ? 'due' : x.maintenance ? 'not-performed' : (rng(hash('ins|' + date + def.id))() < .12 ? 'notes' : 'pass') });
      x.down.forEach(w => inspections.push({ time: w.end, item: `${def.name} — post-fault inspection`, zone: def.zone, ride: def.id, result: nowH >= w.end + .25 ? 'pass' : 'due' }));
    });
    [14, 18, 22].forEach(h => inspections.push({ time: h, item: 'Ferris Wheel — wind & cabin round', zone: 'FWP', ride: 'FW', result: state === 'future' || nowH < h ? 'due' : 'pass' }));
    inspections.push({ time: 9.5, item: 'Food court — fire extinguishers & hoods', zone: 'FCT', result: state === 'future' || nowH < 9.5 ? 'due' : 'pass' });
    inspections.push({ time: 11, item: 'Playground surfacing — Family Rides', zone: 'FAM', result: state === 'future' || nowH < 11 ? 'due' : 'pass' });
    inspections.sort((a, b) => a.time - b.time);

    // Revenue (park income only)
    const ticketRev = sum(tickets.map(t => t.revenue));
    const rideRev = sum(rides.map(x => x.revenue));
    const tenantSales = sum(outlets.map(o => o.sales));
    const commission = sum(outlets.map(o => o.commission));
    const rent = state === 'future' ? 0 : sum(outlets.map(o => o.rentDay));
    const eventRev = state === 'future' ? 0 : sum(events.filter(e => e.status !== 'scheduled').map(e => e.revenue));
    const parkingCars = round(visitors / 3.1 * .62);
    const parking = parkingCars * 30;
    const revenue = { tickets: ticketRev, rides: rideRev, commission, rent, events: eventRev, parking };
    const revTotal = sum(Object.values(revenue));
    const revTarget = targetVisitors * 345;
    const revTargetToDate = round(revTarget * cumShare);

    const m = {
      date, dow, state, nowH, snap, open: ck.open, hours: HOURS, frac,
      visitors, fullVisitors, targetVisitors, targetToDate, targetCum: cumW.map(x => round(targetVisitors * x)), cumW, arrivals, inside, insideNow, insidePeak, capacity: CAPACITY,
      tickets, channels, wristShare, rides, maintRide, outlets, tenantSales, events, incidents, complaints, inspections,
      csat, responses, nps: csat == null ? null : round((csat - 3.6) * 55), revenue, revTotal, revTarget, revTargetToDate, parkingCars,
      sunset: sunset(date),
    };
    cache.set(key, m);
    return m;
  }

  /* ---------- utilities (24 h, metered) ---------- */
  const NOT_CONNECTED = { 'EM-EVL': true, 'IM-FAM': true };
  const ELEC_BASE = { ENT: 25, FWP: 20, FAM: 18, THR: 22, FCT: 60, RET: 30, GAR: 8, EVL: 6 };
  const ELEC_OPEN = { ENT: 30, FWP: 15, FAM: 10, THR: 10, FCT: 140, RET: 70, GAR: 5, EVL: 10 };
  const WATER_SHARE = { ENT: .2, FWP: .08, FAM: .1, THR: .07, FCT: .35, RET: .1, GAR: .05, EVL: .05 };
  const leakStart = () => addDays(todayISO(), -2);
  const pumpFaultStart = () => addDays(todayISO(), -1);

  const ucache = new Map();
  function utilities(date) {
    const m = day(date);
    const key = date + '|' + (m.state === 'today' ? Math.floor(m.nowH * 12) : m.state);
    if (ucache.has(key)) return ucache.get(key);
    const r = rng(hash('util|' + date));
    const H24 = Array.from({ length: 24 }, (_, h) => h);
    const f = H24.map(h => slotFrac(m.nowH, h));
    const lit = lighting(date);
    const leak = date >= leakStart();
    const hvacLeftOn = date === todayISO();
    const elec = {}, potable = {}, irr = {};
    ZONES.forEach(z => {
      elec[z.id] = H24.map(h => {
        const open = h >= OPEN;
        const i = h - OPEN;
        let kw = ELEC_BASE[z.id] + (open ? ELEC_OPEN[z.id] : 0);
        if (open) m.rides.filter(x => x.zone === z.id).forEach(x => { const hr = x.hourly[i]; kw += x.kw * hr.avail * (.55 + .45 * Math.min(1, hr.util)); });
        if (open && z.id === 'EVL') kw += m.events.some(e => e.zone === 'EVL' && h + .5 >= e.start && h + .5 < e.end && e.status !== 'cancelled') ? 80 : 0;
        kw += sum(lit.circuits.filter(c => c.zone === z.id).map(c => c.kw * c.briAt(h + .5)));
        if (hvacLeftOn && z.id === 'RET' && h < 8) kw += 45;
        return +(kw * (.95 + r() * .1)).toFixed(1);
      });
      potable[z.id] = H24.map(h => {
        let v = .25;
        if (h >= OPEN) v += (m.inside[h - OPEN] ?? (h - OPEN < 14 ? 0 : 0)) * .0045 * WATER_SHARE[z.id] * 2.2 + (z.id === 'FCT' ? 3 : 0);
        if (leak && z.id === 'FCT') v += 1.4;
        return +(v * (.94 + r() * .12)).toFixed(2);
      });
      irr[z.id] = H24.map(h => +sum(VALVES.filter(v => v.zone === z.id).map(v => valveFlow(v, date) * overlap(h, h + 1, v.start, v.start + v.dur / 60))).toFixed(2));
    });
    // full-day values are stable; cut to "now"
    const cut = o => Object.fromEntries(Object.entries(o).map(([k, a]) => [k, a.map((v, h) => f[h] > 0 ? +(v * f[h]).toFixed(2) : null)]));
    const E = cut(elec), P = cut(potable), I = cut(irr);
    const meters = [];
    ZONES.forEach(z => {
      const nc = NOT_CONNECTED['EM-' + z.id];
      meters.push({ id: 'EM-' + z.id, type: 'Electricity', unit: 'kWh', zone: z.id, connected: !nc, today: nc ? null : sum(E[z.id]) });
      meters.push({ id: 'WM-' + z.id, type: 'Potable water', unit: 'm³', zone: z.id, connected: true, today: sum(P[z.id]) });
      if (VALVES.some(v => v.zone === z.id)) { const nci = NOT_CONNECTED['IM-' + z.id]; meters.push({ id: 'IM-' + z.id, type: 'Irrigation', unit: 'm³', zone: z.id, connected: !nci, today: nci ? null : sum(I[z.id]) }); }
    });
    const epoch = parse('2025-01-01'), days = Math.round((parse(date) - epoch) / 864e5);
    meters.forEach(mt => {
      const daily = mt.type === 'Electricity' ? sum(elec[mt.zone]) : mt.type === 'Potable water' ? sum(potable[mt.zone]) : sum(irr[mt.zone]);
      mt.reading = mt.connected ? round(10000 + hash(mt.id) % 40000 + days * daily + (mt.today || 0)) : null;
      mt.lastRead = mt.connected ? (m.state === 'today' ? hm(Math.floor(m.nowH * 4) / 4) : m.state === 'past' ? '23:45' : null) : null;
    });
    const connZones = ZONES.filter(z => !NOT_CONNECTED['EM-' + z.id]).map(z => z.id);
    const demand = H24.map(h => E[connZones[0]][h] == null ? null : +sum(connZones.map(z => elec[z][h])).toFixed(0));
    const kwh = sum(connZones.map(z => sum(E[z])));
    const potableM3 = sum(ZONES.map(z => sum(P[z.id])));
    const irrConn = ZONES.filter(z => !NOT_CONNECTED['IM-' + z.id]).map(z => z.id);
    const irrM3 = sum(irrConn.map(z => sum(I[z])));

    // tanks & pumps follow the irrigation cycle
    const hNow = m.state === 'today' ? m.nowH : m.state === 'past' ? 23.75 : null;
    const irrTank = hNow == null ? null : hNow < 2 ? 88 : hNow < 6.5 ? 88 - (hNow - 2) * 13.5 : Math.min(90, 27 + (hNow - 6.5) * 6.2);
    const tanks = [
      { id: 'T-1', name: 'Potable tank 1', cap: 300, level: hNow == null ? null : round(72 + 8 * Math.sin(hNow / 3)), low: 30 },
      { id: 'T-2', name: 'Potable tank 2', cap: 300, level: hNow == null ? null : round(66 + 7 * Math.cos(hNow / 4)), low: 30 },
      { id: 'T-3', name: 'Irrigation tank', cap: 800, level: irrTank == null ? null : round(irrTank), low: 30 },
      { id: 'T-4', name: 'Fire reserve tank', cap: 450, level: hNow == null ? null : 97, low: 90 },
    ];
    const irrRunning = hNow != null && VALVES.some(v => hNow >= v.start && hNow < v.start + v.dur / 60);
    const pumpFault = date >= pumpFaultStart();
    const pumps = [
      { id: 'P-01', name: 'Potable booster 1', zone: 'ENT', status: 'running', flow: 14.2, pressure: 4.1, hours: 18240 },
      { id: 'P-02', name: 'Potable booster 2', zone: 'ENT', status: 'standby', flow: 0, pressure: null, hours: 17110 },
      { id: 'P-03', name: 'Irrigation pump 1', zone: 'GAR', status: irrRunning ? 'running' : 'standby', flow: irrRunning ? 62 : 0, pressure: irrRunning ? 3.4 : null, hours: 9620 },
      { id: 'P-04', name: 'Irrigation pump 2', zone: 'GAR', status: pumpFault ? 'fault' : irrRunning ? 'running' : 'standby', flow: 0, pressure: null, hours: 9480, note: pumpFault ? 'Motor overload trip — duty moved to pump 1' : null },
      { id: 'P-05', name: 'Garden fountain pump', zone: 'GAR', status: hNow != null && hNow >= OPEN ? 'running' : 'standby', flow: hNow != null && hNow >= OPEN ? 38 : 0, pressure: hNow != null && hNow >= OPEN ? 1.8 : null, hours: 12950 },
      { id: 'P-06', name: 'Stormwater sump pump', zone: 'FCT', status: 'standby', flow: 0, pressure: null, hours: 2140 },
    ].map(p => hNow == null ? { ...p, status: 'unknown', flow: null, pressure: null } : p);

    const leaks = leak && m.state !== 'future' ? [{ id: 'LK-01', meter: 'WM-FCT', zone: 'FCT', since: leakStart(), night: 1.8, base: .4, note: 'Night flow 01:00–05:00 is 1.8 m³/h against a 0.4 m³/h baseline' }] : [];
    const res = { date, hours: H24, frac: f, elec: E, potable: P, irr: I, elecFull: elec, meters, demand, peakDemand: Math.max(0, ...demand.filter(v => v != null)), kwh, potableM3, irrM3, tanks, pumps, leaks, tariff: TARIFF, connectedElecZones: connZones };
    ucache.set(key, res);
    return res;
  }
  function valveFlow(v, date) { // m³/h when open; V-07 fault stops the stage hedges
    if (v.id === 'V-07' && date >= pumpFaultStart()) return 0;
    return { GAR: 34, ENT: 9, EVL: 16, FWP: 10, FAM: 6, THR: 6 }[v.zone] || 5;
  }

  // Overnight (00:00–07:00) use per zone vs the 14-day baseline. Night use does not depend on
  // visitor numbers, so it is where leaks and equipment left running show up.
  function abnormal(date) {
    const m = day(date);
    if (m.state === 'future' || (m.state === 'today' && m.nowH < 7)) return [];
    const u = utilities(date);
    const prior = Array.from({ length: 14 }, (_, i) => utilities(addDays(date, -1 - i)));
    const night = a => sum(a.slice(0, 7));
    const out = [];
    [['Electricity', 'kWh', 'elec'], ['Potable water', 'm³', 'potable']].forEach(([label, unit, k]) => ZONES.forEach(z => {
      if (u[k][z.id][0] == null) return;
      const t = night(u[k][z.id]);
      const base = sum(prior.map(p => night(p[k][z.id]))) / prior.length;
      if (base > 0 && t / base > 1.25) out.push({ zone: z.id, label, unit, today: t, base, ratio: t / base });
    }));
    return out;
  }

  /* ---------- lighting & landscape ---------- */
  function lighting(date) {
    const m = day(date);
    const ss = m.sunset;
    const eveningEvent = m.events.some(e => e.zone === 'EVL' && e.start >= 17 && e.status !== 'cancelled');
    const t = todayISO();
    const circuits = CIRCUITS.map(c => {
      const flt = CIRCUIT_FAULT[c.id];
      const faulty = flt && date >= addDays(t, flt.since) && m.state !== 'future';
      let sched, on, off;
      if (c.id === 'LC-FWP-01' || c.id === 'LC-GAR-04') { sched = 'Show programme 18:00–23:30'; on = 18; off = 23.5; }
      else if (c.id === 'LC-EVL-01' || c.id === 'LC-EVL-02') { sched = eveningEvent ? 'Event schedule — sunset to 23:30' : 'Event schedule — no event tonight'; on = eveningEvent ? ss : null; off = 23.5; }
      else { sched = `Astronomical — sunset (${hm(ss)}) to 00:30`; on = ss; off = 24.5; }
      const bri = h => (h < 22 ? 1 : h < 23 ? .8 : .6);
      const isOn = h => on != null && ((h >= on && h < off) || (off > 24 && h < off - 24));
      const briAt = h => (faulty && flt.kind === 'fault' && c.id !== 'LC-FAM-03') ? 0 : isOn(h) ? (c.dali ? bri(h) : 1) * (c.id === 'LC-FAM-03' && faulty ? .75 : 1) : 0;
      const snap = m.snap;
      let status;
      if (snap == null) status = 'unknown';
      else if (faulty) status = flt.kind;
      else status = isOn(snap) ? 'on' : 'off';
      const brightness = status === 'offline' ? null : !c.dali ? 'na' : status === 'on' ? round(bri(snap) * 100) : 0;
      const hoursUntil = m.state === 'today' ? m.nowH : 24;
      let kwhDay = 0; for (let h = 0; h < hoursUntil; h += .25) kwhDay += c.kw * briAt(h) * .25;
      return { ...c, status, brightness, schedule: sched, onAt: on, offAt: off, kwh: status === 'offline' ? null : round(kwhDay), briAt, fault: faulty ? flt : null, faultSince: faulty ? addDays(t, flt.since) : null };
    });
    return { circuits, sunset: ss };
  }

  function landscape(date) {
    const m = day(date); const u = utilities(date);
    const h = m.snap == null ? null : m.state === 'past' ? 23.75 : m.nowH;
    const valveFault = date >= pumpFaultStart() && m.state !== 'future';
    const valves = VALVES.map(v => {
      const running = h != null && h >= v.start && h < v.start + v.dur / 60;
      const status = h == null ? 'unknown' : v.id === 'V-07' && valveFault ? 'fault' : running ? 'open' : 'closed';
      const lastRun = h == null ? null : h >= v.start + v.dur / 60 ? `Today ${hm(v.start)}` : `Yesterday ${hm(v.start)}`;
      return { ...v, status, lastRun, next: h != null && h < v.start ? `Today ${hm(v.start)}` : `Tomorrow ${hm(v.start)}`, schedule: `Daily ${hm(v.start)} · ${v.dur} min`, flow: valveFlow(v, date), note: v.id === 'V-07' && valveFault ? 'Solenoid not responding — last 2 cycles missed' : null };
    });
    const sensors = SENSORS.map(s => {
      const sr = rng(hash('sm|' + date + s.id));
      if (s.id === 'SM-06') return { ...s, vwc: null, status: 'offline' };
      if (h == null) return { ...s, vwc: null, status: 'unknown' };
      const v = VALVES.find(x => x.id === s.valve);
      const missed = s.valve === 'V-07' && valveFault;
      const sinceRun = ((h - (v.start + v.dur / 60)) + 24) % 24;
      const peak = missed ? 19 : 33 + sr() * 3;
      const vwc = +(peak - sinceRun * (missed ? .22 : .5) - (s.zone === 'EVL' ? 1.5 : 0)).toFixed(1);
      return { ...s, vwc, status: vwc < 18 ? 'dry' : vwc > 38 ? 'wet' : 'ok' };
    });
    const pr = rng(hash('plant|' + date.slice(0, 7)));
    const PL = [['GAR', 'Date palm grove (48 palms)', 'Good', 'Fronds healthy; no red palm weevil signs'], ['GAR', 'Central lawn', 'Fair', 'Two dry patches near the fountain path'], ['EVL', 'Stage hedges (Ficus)', 'Needs attention', 'Leaf drop on east side — irrigation missed'], ['ENT', 'Entrance flower beds', 'Good', 'Seasonal planting established'], ['FWP', 'Wheel plaza planters', 'Good', 'Bougainvillea in flower'], ['FAM', 'Family area shade trees', 'Fair', 'Low branches over carousel queue — pruning booked'], ['THR', 'Thrill zone palms', 'Good', 'Uplight fittings clear of fronds'], ['RET', 'Promenade planters', 'Good', 'Drip lines checked']];
    const plants = PL.map(([zone, area, cond, note], i) => ({ id: `PI-${pad(i + 1)}`, zone, area, cond, note, date: addDays(date, -Math.floor(pr() * 9)) }));
    const TASKS = [['Mow central lawn', 'GAR', 0], ['Hedge trimming — stage', 'EVL', -1], ['Palm pruning — grove', 'GAR', 3], ['Fertilise entrance beds', 'ENT', 1], ['Pest control round', 'GAR', -4], ['Replant dry patches', 'GAR', 2], ['Prune shade trees', 'FAM', -2], ['Clean fountain filters', 'GAR', 0], ['Check drip lines', 'RET', 5]];
    const tr = rng(hash('ltask|' + date));
    const tasks = TASKS.map(([task, zone, off], i) => {
      const due = addDays(date, off);
      const done = off < 0 ? tr() < .6 : off === 0 ? (m.state === 'past' || (m.state === 'today' && m.nowH > 12)) && tr() < .5 : false;
      return { id: `LT-${pad(i + 1)}`, task, zone, due, status: done ? 'done' : off < 0 ? 'overdue' : off === 0 ? 'in-progress' : 'scheduled', team: pick(tr, ['Garden crew A', 'Garden crew B', 'Palm specialist (contractor)']) };
    });
    const leaks = u.leaks.slice();
    return { valves, sensors, plants, tasks, leaks };
  }

  /* ---------- maintenance work orders (rolling 14 days) ---------- */
  function workOrders(date) {
    const out = [];
    for (let k = 13; k >= 0; k--) {
      const c = addDays(date, -k);
      if (c > todayISO()) continue;
      const wr = rng(hash('wo|' + c));
      const n = 1 + Math.floor(wr() * 3);
      const CAT = [['Rides', 'Ride technicians'], ['Electrical', 'Electrical team'], ['Plumbing', 'MEP team'], ['Lighting', 'Electrical team'], ['F&B equipment', 'Tenant contractor'], ['Civil', 'Facilities team']];
      const TXT = { Rides: ['Lubrication schedule — {r}', 'Replace worn restraint pad — {r}', 'Monthly NDT inspection — {r}'], Electrical: ['Thermal scan of main switchboard', 'Replace UPS batteries — ticket hall'], Plumbing: ['Fix dripping tap — food court toilets', 'Service potable booster pumps'], Lighting: ['Replace failed bollard driver', 'Re-aim palm uplights'], 'F&B equipment': ['Service grease trap — food court', 'Repair walk-in chiller door seal'], Civil: ['Repair paving joint near carousel', 'Repaint queue-line handrails'] };
      for (let i = 0; i < n; i++) {
        const [cat, team] = pick(wr, CAT);
        const ride = pick(wr, RIDES);
        const dueIn = 1 + Math.floor(wr() * 6), doneIn = Math.floor(wr() * 9);
        out.push({ id: `WO-${c.replace(/-/g, '').slice(4)}${i + 1}`, created: c, due: addDays(c, dueIn), doneOn: addDays(c, doneIn), cat, team, type: cat === 'Rides' && wr() < .5 ? 'Planned' : wr() < .5 ? 'Planned' : 'Corrective', priority: pick(wr, ['Low', 'Medium', 'Medium', 'High']), title: pick(wr, TXT[cat]).replace('{r}', ride.name), zone: cat === 'Rides' ? ride.zone : pick(wr, ZONES).id, ride: cat === 'Rides' ? ride.id : null });
      }
      day(c).rides.forEach(x => x.down.forEach((w, j) => out.push({ id: `WO-${c.replace(/-/g, '').slice(4)}R${j + 1}${x.id}`, created: c, due: addDays(c, 1), doneOn: addDays(c, w.reason.includes('clean') ? 0 : 1), cat: 'Rides', team: 'Ride technicians', type: 'Corrective', priority: 'High', title: `Corrective — ${x.name}: ${w.reason}`, zone: x.zone, ride: x.id })));
    }
    out.forEach(w => { w.status = w.doneOn <= date && w.doneOn < todayISO() ? 'done' : w.due < date ? 'overdue' : w.created === date ? 'open' : 'in-progress'; });
    return out.sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.created.localeCompare(a.created));
  }

  return { OPEN, CLOSE, HOURS, CAPACITY, ZONES, ZONE, RIDES, RIDE, RIDE_INFO, TICKETS, OUTLETS, CIRCUITS, TARIFF, day, utilities, abnormal, lighting, landscape, workOrders, iso, parse, addDays, todayISO, hm, sum, clamp };
})();

// 蹦蹦車 共用資料層：司機 App（index.html）與管理平台（admin.html）共用
// 有 Firebase 設定時使用雲端 Firestore；沒有時使用本機示範模式（同一瀏覽器的分頁互相連動）。
(function () {
  'use strict';

  // ---------- 高雄市 38 區地標（名稱, 緯度, 經度） ----------
  const KHH = [
    { d: '左營區', p: [['高鐵左營站', 22.6875, 120.3080], ['蓮池潭', 22.6810, 120.2950], ['漢神巨蛋', 22.6690, 120.3025]] },
    { d: '楠梓區', p: [['高雄大學', 22.7340, 120.2840], ['楠梓車站', 22.7270, 120.3255]] },
    { d: '鼓山區', p: [['中山大學', 22.6270, 120.2660], ['高雄市立美術館', 22.6560, 120.2860], ['西子灣', 22.6230, 120.2650]] },
    { d: '三民區', p: [['高雄車站', 22.6395, 120.3020], ['高雄醫學大學附設醫院', 22.6460, 120.3100]] },
    { d: '鹽埕區', p: [['駁二藝術特區', 22.6200, 120.2820]] },
    { d: '前金區', p: [['中央公園', 22.6245, 120.3010]] },
    { d: '新興區', p: [['美麗島捷運站', 22.6315, 120.3020], ['新堀江商圈', 22.6215, 120.3035]] },
    { d: '苓雅區', p: [['文化中心', 22.6270, 120.3175], ['85 大樓', 22.6115, 120.3005]] },
    { d: '前鎮區', p: [['夢時代購物中心', 22.5950, 120.3070], ['高雄展覽館', 22.6080, 120.2990]] },
    { d: '旗津區', p: [['旗津渡輪站', 22.6130, 120.2680]] },
    { d: '小港區', p: [['高雄國際機場', 22.5771, 120.3500], ['小港醫院', 22.5650, 120.3600]] },
    { d: '鳳山區', p: [['鳳山車站', 22.6273, 120.3570], ['大東文化藝術中心', 22.6250, 120.3640]] },
    { d: '大寮區', p: [['大寮區公所', 22.6053, 120.3950]] },
    { d: '鳥松區', p: [['澄清湖', 22.6550, 120.3540]] },
    { d: '林園區', p: [['林園區公所', 22.5004, 120.3953]] },
    { d: '仁武區', p: [['仁武區公所', 22.6992, 120.3480]] },
    { d: '大樹區', p: [['義守大學', 22.7330, 120.4040], ['佛光山', 22.7560, 120.4430]] },
    { d: '大社區', p: [['大社區公所', 22.7300, 120.3471]] },
    { d: '岡山區', p: [['岡山車站', 22.7920, 120.2995]] },
    { d: '路竹區', p: [['路竹車站', 22.8565, 120.2620]] },
    { d: '橋頭區', p: [['橋頭糖廠', 22.7581, 120.3115]] },
    { d: '梓官區', p: [['蚵仔寮漁港', 22.7560, 120.2500]] },
    { d: '彌陀區', p: [['彌陀區公所', 22.7826, 120.2470]] },
    { d: '永安區', p: [['永安區公所', 22.8186, 120.2259]] },
    { d: '燕巢區', p: [['燕巢區公所', 22.7937, 120.3617]] },
    { d: '田寮區', p: [['月世界', 22.8803, 120.3889]] },
    { d: '阿蓮區', p: [['阿蓮區公所', 22.8838, 120.3266]] },
    { d: '茄萣區', p: [['興達港', 22.8676, 120.2142]] },
    { d: '湖內區', p: [['湖內區公所', 22.9050, 120.2124]] },
    { d: '旗山區', p: [['旗山老街', 22.8880, 120.4830]] },
    { d: '美濃區', p: [['美濃客家文物館', 22.9030, 120.5470]] },
    { d: '內門區', p: [['內門區公所', 22.9430, 120.4620]] },
    { d: '杉林區', p: [['杉林區公所', 22.9707, 120.5393]] },
    { d: '甲仙區', p: [['甲仙區公所', 23.0835, 120.5880]] },
    { d: '六龜區', p: [['六龜區公所', 22.9973, 120.6334]] },
    { d: '茂林區', p: [['茂林區公所', 22.8862, 120.6630]] },
    { d: '桃源區', p: [['桃源區公所', 23.1590, 120.7623]] },
    { d: '那瑪夏區', p: [['那瑪夏區公所', 23.2160, 120.7010]] }
  ];
  const ALL_SPOTS = KHH.flatMap(a => a.p.map(p => ({ d: a.d, n: p[0], c: [p[1], p[2]] })));

  function distKm(a, b) {
    const t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  function areaCenter(area) {
    const a = KHH.find(x => x.d === area) || KHH.find(x => x.d === '三民區');
    return [a.p[0][1], a.p[0][2]];
  }
  // 地址 → 座標：符合地標就用地標，否則用行政區代表點
  function locate(text, area) {
    const s = ALL_SPOTS.find(p => p.n === text) || ALL_SPOTS.find(p => text.includes(p.n));
    return s ? { d: s.d, c: s.c } : { d: area, c: areaCenter(area) };
  }

  // ---------- 計價：起跳 50、每公里 20、每分鐘 2、最低 100（跳表每次 5 元） ----------
  const RATE = { base: 50, perKm: 20, perMin: 2, min: 100 };
  const meterAmount = (km, min) => Math.floor((RATE.base + km * RATE.perKm + min * RATE.perMin) / 5) * 5;
  const finalFare = (km, min) => Math.max(RATE.min, meterAmount(km, min));
  // 下車地點可不填：沒有下車地點就沒有預估，完全依跳表計費
  const toText = r => r && r.to ? ((r.toArea ? r.toArea + ' ' : '') + r.to) : '未指定（依乘客指示）';
  const hasDest = r => !!(r && r.to);
  // fromC / toC：精準座標 [緯度, 經度]（有的話優先使用）
  function estimateTrip(fromText, fromArea, toText, toArea, kmOverride, fromC, toC) {
    const f = fromC ? { d: fromArea, c: fromC } : locate(fromText, fromArea);
    if (!toText) return { fromArea: f.d, toArea: '', km: kmOverride > 0 ? kmOverride : null, mins: null, estFare: null };
    const t = toC ? { d: toArea, c: toC } : locate(toText, toArea);
    const km = kmOverride > 0 ? kmOverride : Math.max(1.5, distKm(f.c, t.c) * 1.3);
    const mins = Math.max(5, Math.round(km / (km > 15 ? 45 : 25) * 60 + 2));
    return { fromArea: f.d, toArea: t.d, km: Math.round(km * 10) / 10, mins, estFare: Math.max(RATE.min, Math.round(meterAmount(km, mins) / 5) * 5) };
  }

  // 依座標判斷在高雄哪一區（找最近的地標所在區）
  function areaOf(lat, lng) {
    let best = null, bd = 1e9;
    ALL_SPOTS.forEach(s => { const d = distKm(s.c, [lat, lng]); if (d < bd) { bd = d; best = s.d; } });
    return best;
  }
  const inKhh = (lat, lng) => lat > 22.43 && lat < 23.48 && lng > 120.15 && lng < 121.05;

  // ---------- 地址搜尋（OpenStreetMap 資料，不需金鑰） ----------
  // Photon 適合邊打邊搜；找不到時再用 Nominatim 補一次
  const houseNo = h => !h ? '' : /號$/.test(h) ? h : h + '號';
  function pickArea(fields, lat, lng) {
    const hit = fields.find(v => v && KHH.some(k => k.d === v));
    return hit || areaOf(lat, lng);
  }
  async function geoSearch(q, area, signal) {
    const out = [];
    const query = (area && !q.includes(area) ? area + ' ' : '') + q;
    try {
      const u = 'https://photon.komoot.io/api/?limit=10&lat=22.65&lon=120.32&bbox=120.15,22.43,121.05,23.48&q=' + encodeURIComponent('高雄 ' + query);
      const j = await (await fetch(u, { signal })).json();
      (j.features || []).forEach(f => {
        const [lng, lat] = f.geometry.coordinates, p = f.properties || {};
        if (!inKhh(lat, lng)) return;
        const road = (p.street || '') + houseNo(p.housenumber);
        const name = p.name || road || p.locality || p.district;
        if (!name) return;
        const a = pickArea([p.district, p.city, p.county, p.locality], lat, lng);
        out.push({ label: name === road || !road ? name : name, sub: ['高雄市' + a, road && road !== name ? road : ''].filter(Boolean).join(' · '), lat, lng, area: a });
      });
    } catch (e) { if (e.name === 'AbortError') throw e; }
    if (!out.length) {
      try {
        const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=tw&accept-language=zh-TW&bounded=1&viewbox=120.15,23.48,121.05,22.43&q=' + encodeURIComponent('高雄市 ' + query);
        const j = await (await fetch(u, { signal })).json();
        (j || []).forEach(r => {
          const lat = +r.lat, lng = +r.lon, ad = r.address || {};
          if (!inKhh(lat, lng)) return;
          const road = (ad.road || '') + houseNo(ad.house_number);
          const a = pickArea([ad.suburb, ad.city_district, ad.town, ad.district, ad.village], lat, lng);
          out.push({ label: r.name || road || (r.display_name || '').split(',')[0], sub: ['高雄市' + a, road && road !== r.name ? road : ''].filter(Boolean).join(' · '), lat, lng, area: a });
        });
      } catch (e) { if (e.name === 'AbortError') throw e; }
    }
    // 去掉重複，選定區域的排前面
    const seen = new Set();
    return out.filter(x => { const k = x.label + '|' + x.lat.toFixed(4) + x.lng.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.area === area) - (a.area === area));
  }
  // 某一區所有有名字的道路（OpenStreetMap / Overpass），存在瀏覽器 30 天
  const ROAD_RANK = { trunk: 0, primary: 1, secondary: 2, tertiary: 3, unclassified: 4, residential: 5, living_street: 6, service: 7 };
  const ROADS_MEM = {};
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const HW = '["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"]["name"]';
  // 快的查法：直接找這個區的界線（只在高雄範圍內找），找不到再用「高雄市裡面叫這個名字的區」
  const roadQueries = area => [
    `[out:json][timeout:25];rel["boundary"="administrative"]["name"="${area}"](22.4,120.1,23.5,121.1);map_to_area->.d;way(area.d)${HW};out tags center;`,
    `[out:json][timeout:40];area["name"="高雄市"]["boundary"="administrative"]->.city;rel(area.city)["boundary"="administrative"]["name"="${area}"];map_to_area->.d;way(area.d)${HW};out tags center;`
  ];
  function rankRoads(by) {
    // 一條路由很多段組成：取各段中心的平均當作這條路的位置
    return Object.values(by).map(x => ({ name: x.name, lat: +(x.sl / x.n).toFixed(5), lng: +(x.sg / x.n).toFixed(5), rank: x.rank }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'zh-Hant'));
  }
  function addRoad(by, n, lat, lng, rank) {
    n = (n || '').trim(); if (!n || !isFinite(lat) || !isFinite(lng)) return;
    const cur = by[n];
    if (!cur) by[n] = { name: n, rank, n: 1, sl: lat, sg: lng };
    else { cur.n++; cur.sl += lat; cur.sg += lng; cur.rank = Math.min(cur.rank, rank); }
  }
  async function fetchTimeout(url, opt, ms) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, Object.assign({}, opt || {}, { signal: ac.signal })); } finally { clearTimeout(t); }
  }
  async function roadsFromOverpass(area) {
    let lastErr; const end = Date.now() + 30000;   // 最多等 30 秒，之後改用備用方法
    for (const q of roadQueries(area)) {
      for (const url of OVERPASS) {
        const left = end - Date.now(); if (left < 1500) throw lastErr || new Error('timeout');
        try {
          const res = await fetchTimeout(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, Math.min(15000, left));
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const by = {};
          ((await res.json()).elements || []).forEach(e => e.tags && e.center && addRoad(by, e.tags.name, e.center.lat, e.center.lon, ROAD_RANK[e.tags.highway] ?? 9));
          const list = rankRoads(by);
          if (list.length) return list;
          lastErr = new Error('empty'); break;      // 這個查法找不到這個區，換下一種查法
        } catch (e) { lastErr = e; }
      }
    }
    throw lastErr || new Error('overpass');
  }
  // 備用：用 Photon 搜「區名＋路／街」，把結果裡的道路名稱收集起來（比較不完整，但幾乎一定拿得到）
  async function roadsFromPhoton(area) {
    const pts = ALL_SPOTS.filter(s => s.d === area).map(s => s.c);
    const c = pts.length ? [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length] : [22.65, 120.32];
    const by = {};
    const words = ['路', '街', '大道', '大路', '一路', '二路', '巷'];
    await Promise.all(words.map(async w => {
      try {
        const u = `https://photon.komoot.io/api/?limit=50&osm_tag=highway&lat=${c[0]}&lon=${c[1]}&bbox=${c[1] - 0.12},${c[0] - 0.12},${c[1] + 0.12},${c[0] + 0.12}&q=` + encodeURIComponent('高雄市' + area + ' ' + w);
        const j = await (await fetchTimeout(u, null, 12000)).json();
        (j.features || []).forEach(f => {
          const [lng, lat] = f.geometry.coordinates, p = f.properties || {};
          const inArea = (p.district || p.city || p.locality || '').includes(area) || areaOf(lat, lng) === area;
          if (inArea && /[路街道巷]$|[路街]\S{0,3}段$/.test(p.name || '')) addRoad(by, p.name, lat, lng, ROAD_RANK[p.osm_value] ?? 9);
        });
      } catch (e) {}
    }));
    return rankRoads(by);
  }
  // 內建路名（不用連網，馬上出現）：大路／大道排前面，再來是路、街，其他（巷、地名）排最後
  function staticRoads(area) {
    const names = (window.BBC_KHH_ROADS || {})[area];
    if (!names || !names.length) return null;
    let coords = {};
    try { const c = JSON.parse(localStorage.getItem('bbc_roads_' + area) || 'null'); if (c && c.list) c.list.forEach(r => { coords[r.name] = r; }); } catch (e) {}
    const rank = n => /大道$|大路$/.test(n) ? 1 : /[一二三四五六七八九十]路$/.test(n) ? 2 : /路$/.test(n) ? 3 : /街$/.test(n) ? 5 : 7;
    return names.map(n => ({ name: n, lat: coords[n] ? coords[n].lat : null, lng: coords[n] ? coords[n].lng : null, rank: rank(n) }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'zh-Hant'));
  }
  // 查某條路的位置：先看存過的，再用 Photon 找這一區裡的這條路，都找不到就用這一區的中心
  async function roadCoord(area, name) {
    const key = 'bbc_rc_' + area + name;
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c) return c; } catch (e) {}
    const ctr = areaCenter(area);
    let best = null;
    try {
      const u = `https://photon.komoot.io/api/?limit=15&lat=${ctr[0]}&lon=${ctr[1]}&bbox=${ctr[1] - 0.15},${ctr[0] - 0.15},${ctr[1] + 0.15},${ctr[0] + 0.15}&q=` + encodeURIComponent('高雄市' + area + name);
      const j = await (await fetchTimeout(u, null, 10000)).json();
      const fs = (j.features || []).map(f => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], p: f.properties || {} }))
        .filter(f => areaOf(f.lat, f.lng) === area || (f.p.district || '').includes(area));
      best = fs.find(f => f.p.name === name && f.p.osm_key === 'highway') || fs.find(f => f.p.name === name) || fs.find(f => f.p.street === name);
    } catch (e) {}
    if (!best) return { lat: ctr[0], lng: ctr[1], approx: true };
    const r = { lat: +best.lat.toFixed(6), lng: +best.lng.toFixed(6) };
    try { localStorage.setItem(key, JSON.stringify(r)); } catch (e) {}
    return r;
  }
  // 讀取順序：記憶體 → 這台瀏覽器（30 天）→ 雲端資料庫（所有管理員共用，只要有人載過一次）→ OpenStreetMap → Photon 備用
  async function districtRoads(area, opts) {
    opts = opts || {};
    if (!area) return [];
    if (ROADS_MEM[area] && !opts.force) return ROADS_MEM[area];
    if (!opts.force && !opts.online) { const st = staticRoads(area); if (st) return (ROADS_MEM[area] = st); }
    const save = (list, full) => {
      try { localStorage.setItem('bbc_roads_' + area, JSON.stringify({ t: Date.now(), list, full })); } catch (e) {}
      if (full) window.BBC.db.set('settings', 'roads_' + area, { list, updatedAt: Date.now() }).catch(() => {});
      return (ROADS_MEM[area] = list);
    };
    if (!opts.force) {
      try {
        const c = JSON.parse(localStorage.getItem('bbc_roads_' + area) || 'null');
        if (c && c.list.length && Date.now() - c.t < (c.full === false ? 86400000 : 30 * 86400000)) return (ROADS_MEM[area] = c.list);
      } catch (e) {}
      try {
        const doc = await Promise.race([window.BBC.db.get('settings', 'roads_' + area), new Promise(r => setTimeout(r, 5000))]);
        if (doc && doc.list && doc.list.length) {
          try { localStorage.setItem('bbc_roads_' + area, JSON.stringify({ t: Date.now(), list: doc.list, full: true })); } catch (e) {}
          return (ROADS_MEM[area] = doc.list);
        }
      } catch (e) {}
    }
    try { return save(await roadsFromOverpass(area), true); }
    catch (e) {
      console.warn('overpass', area, e);
      const list = await roadsFromPhoton(area);
      if (list.length) return save(list, false);
      throw e;
    }
  }

  async function geoReverse(lat, lng) {
    try {
      const j = await (await fetch('https://photon.komoot.io/reverse?lat=' + lat + '&lon=' + lng)).json();
      const p = ((j.features || [])[0] || {}).properties || {};
      const road = (p.street || '') + houseNo(p.housenumber);
      return p.name && road ? p.name + '（' + road + '）' : (p.name || road || '');
    } catch (e) { return ''; }
  }
  // 導航連結（Google 地圖，iPhone 有裝 App 會直接開 App）
  function navUrl(lat, lng, text, area) {
    const dest = lat != null ? lat + ',' + lng : encodeURIComponent('高雄市' + (area || '') + (text || ''));
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + dest;
  }
  const fromCoord = r => r && r.fromLat != null ? [r.fromLat, r.fromLng] : null;
  const toCoord = r => r && r.toLat != null ? [r.toLat, r.toLng] : null;

  // ---------- 小工具 ----------
  async function hashPw(id, pw) {
    const data = new TextEncoder().encode('bbc:' + id + ':' + pw);
    try {
      const b = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) { return 'plain:' + pw; }
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rideNo = () => 'R' + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
  const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function ago(t) {
    if (!t) return '—';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + ' 秒前';
    if (s < 3600) return Math.floor(s / 60) + ' 分鐘前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小時前';
    return Math.floor(s / 86400) + ' 天前';
  }
  const hhmm = t => t ? new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  const ONLINE_STALE_MS = 90 * 1000;   // 超過 90 秒沒回報視為斷線
  // 有名字和手機的才是真正的司機帳號
  const isRealDriver = d => !!(d && d.name && (d.phone || /^09\d{8}$/.test(d.id)));
  function driverState(d) {
    if (!d || d.active === false) return 'disabled';
    if (!d.status || d.status === 'offline') return 'offline';
    if (Date.now() - (d.lastSeen || 0) > ONLINE_STALE_MS) return 'lost';
    return d.status; // online | busy
  }

  // ---------- 本機示範後端（localStorage，分頁之間以 storage 事件同步） ----------
  function localBackend() {
    const KEY = c => 'bbcdb:' + c;
    const listeners = {};
    const read = c => { try { return JSON.parse(localStorage.getItem(KEY(c)) || '{}'); } catch (e) { return mem[c] || {}; } };
    const mem = {};
    function write(c, obj) {
      mem[c] = obj;
      try { localStorage.setItem(KEY(c), JSON.stringify(obj)); } catch (e) {}
      emit(c);
    }
    function emit(c) {
      const obj = read(c);
      const list = Object.keys(obj).map(id => Object.assign({ id }, obj[id]));
      (listeners[c] || []).forEach(fn => { try { fn(list); } catch (e) { console.error(e); } });
    }
    window.addEventListener('storage', e => {
      if (e.key && e.key.startsWith('bbcdb:')) emit(e.key.slice(6));
    });
    return {
      mode: 'local',
      watch(c, fn, where) {
        const f = where ? list => fn(list.filter(x => x[where[0]] === where[1])) : fn;
        (listeners[c] = listeners[c] || []).push(f);
        setTimeout(() => emit(c), 0);  // 示範模式沒有快取問題
        return () => { listeners[c] = listeners[c].filter(x => x !== f); };
      },
      async get(c, id) { if (!id) throw new Error('資料編號錯誤'); const o = read(c); return o[id] ? Object.assign({ id }, o[id]) : null; },
      async set(c, id, data) { if (!id) throw new Error('資料編號錯誤'); const o = read(c); o[id] = Object.assign({}, o[id] || {}, data); write(c, o); },
      async add(c, data) { const id = rideNo(); const o = read(c); o[id] = data; write(c, o); return id; },
      async remove(c, id) { const o = read(c); delete o[id]; write(c, o); },
      async adjustBalance(phone, delta, entry, opts) {
        opts = opts || {};
        const D = read('drivers'), d = D[phone];
        if (!d) throw Object.assign(new Error('找不到司機帳號'), { code: 'not-found' });
        if (opts.rideId && opts.flag) { const R = read('rides'); if (R[opts.rideId] && R[opts.rideId][opts.flag]) return { skipped: true }; }
        const before = d.balance || 0, after = before + delta;
        if (opts.noNegative && after < 0) throw Object.assign(new Error('點數不足'), { code: 'insufficient', balance: before });
        d.balance = after; write('drivers', D);
        const id = rideNo(), L = read('ledger');
        L[id] = Object.assign({}, entry, { driverPhone: phone, amount: delta, before, after, createdAt: Date.now() }); write('ledger', L);
        if (opts.rideId && opts.flag) { const R = read('rides'); if (R[opts.rideId]) { R[opts.rideId][opts.flag] = id; write('rides', R); } }
        return { before, after, id };
      }
    };
  }

  // ---------- Firebase Firestore 後端 ----------
  function firebaseBackend(cfg) {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const fs = firebase.firestore();
    const col = c => fs.collection('bbc_' + c);
    // 沒有編號時 Firestore 會自動產生新文件，這裡直接擋下，避免產生沒有名字的幽靈資料
    const ref = (c, id) => { if (!id || typeof id !== 'string') throw new Error('資料編號錯誤'); return col(c).doc(id); };
    // Firestore 不接受 undefined 欄位，先清掉
    const clean = o => JSON.parse(JSON.stringify(o));
    // Firestore 不接受「陣列裡的陣列」，路線點 [緯度, 經度] 要轉成 {lat, lng} 才存得進去
    const enc = o => { const c = clean(o); if (Array.isArray(c.track)) c.track = c.track.map(p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : p); return c; };
    const dec = (id, data) => { const o = Object.assign({ id }, data); if (Array.isArray(o.track)) o.track = o.track.map(p => p && !Array.isArray(p) && p.lat != null ? [p.lat, p.lng] : p); return o; };
    return {
      mode: 'cloud',
      watch(c, fn, where) {
        return (where ? col(c).where(where[0], '==', where[1]) : col(c)).onSnapshot(
          s => fn(s.docs.map(d => dec(d.id, d.data())), { fromCache: s.metadata.fromCache }),
          err => { console.error('Firestore', err); if (window.BBC.onError) window.BBC.onError(err); }
        );
      },
      async get(c, id) { const d = await ref(c, id).get(); return d.exists ? dec(d.id, d.data()) : null; },
      async set(c, id, data) { await ref(c, id).set(enc(data), { merge: true }); },
      async add(c, data) { const id = rideNo(); await ref(c, id).set(enc(data)); return id; },
      async remove(c, id) { await ref(c, id).delete(); },
      // 點數增減用交易處理：同時更新餘額與寫入明細；同一趟行程只扣（或退）一次；可要求餘額不得為負
      async adjustBalance(phone, delta, entry, opts) {
        opts = opts || {};
        const dref = ref('drivers', phone), lref = ref('ledger', rideNo());
        const rref = opts.rideId && opts.flag ? ref('rides', opts.rideId) : null;
        return fs.runTransaction(async t => {
          const ds = await t.get(dref);
          if (!ds.exists) throw Object.assign(new Error('找不到司機帳號'), { code: 'not-found' });
          if (rref) { const rs = await t.get(rref); if (rs.exists && rs.data()[opts.flag]) return { skipped: true }; }
          const before = ds.data().balance || 0, after = before + delta;
          if (opts.noNegative && after < 0) throw Object.assign(new Error('點數不足'), { code: 'insufficient', balance: before });
          t.set(dref, { balance: after }, { merge: true });
          t.set(lref, enc(Object.assign({}, entry, { driverPhone: phone, amount: delta, before, after, createdAt: Date.now() })));
          if (rref) t.set(rref, { [opts.flag]: lref.id }, { merge: true });
          return { before, after, id: lref.id };
        });
      }
    };
  }

  // ---------- 路線地圖（Leaflet + OpenStreetMap） ----------
  // track: [[緯度, 經度], ...]
  // 底圖：OpenStreetMap（不需金鑰、有中文路名）；載入失敗太多次自動改用 Esri 街道圖
  const TILE_SOURCES = [
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: '© OpenStreetMap' } },
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', opt: { maxZoom: 19, attribution: '© Esri' } }
  ];
  function addTiles(map, idx) {
    idx = idx || 0;
    const src = TILE_SOURCES[idx];
    const layer = L.tileLayer(src.url, src.opt).addTo(map);
    let errors = 0, loaded = 0;
    layer.on('tileload', () => { loaded++; });
    layer.on('tileerror', () => {
      errors++;
      if (errors >= 4 && loaded === 0 && idx + 1 < TILE_SOURCES.length) { map.removeLayer(layer); addTiles(map, idx + 1); }
    });
    return layer;
  }
  const ROUTE_RED = '#E5352B';
  // 紅色大頭針
  function pinIcon(color) {
    return L.divIcon({
      className: '', iconSize: [30, 42], iconAnchor: [15, 40], tooltipAnchor: [0, -36],
      html: `<svg width="30" height="42" viewBox="0 0 30 42" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"><path d="M15 41 C15 41 27 25 27 15 A12 12 0 0 0 3 15 C3 25 15 41 15 41Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>`
    });
  }
  // 地圖下方的車資摘要（大字車資、時間、公里）
  function clock(min) {
    const s = Math.max(0, Math.round((min || 0) * 60)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    const p2 = n => String(n).padStart(2, '0');
    return h ? `${h}:${p2(m)}:${p2(ss)}` : `${p2(m)}:${p2(ss)}`;
  }
  function tripSummaryHTML(fare, min, km, label) {
    const cell = 'display:flex;justify-content:space-between;align-items:center;gap:6px;padding:10px 14px;min-width:0';
    const big = 'font-size:clamp(22px,7vw,30px);font-weight:300;font-variant-numeric:tabular-nums;color:#1F2A33;line-height:1.1;white-space:nowrap';
    const rate = 'text-align:right;font-size:12px;line-height:1.35;color:#5B6560;white-space:nowrap';
    return `<div style="background:#fff;color:#1F2A33">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:10px 16px 6px">
        <span style="font-size:clamp(32px,11vw,42px);font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.5px;white-space:nowrap">NT$${fmt(fare)}</span>
        <span style="font-size:12px;color:#5B6560;text-align:right">${label || ''}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #E4E7E3">
        <div style="${cell};border-right:1px solid #E4E7E3"><span style="${big}">${clock(min)}</span><span style="${rate}">NT$${RATE.perMin}<br>/ 分鐘</span></div>
        <div style="${cell}"><span style="${big}">${(Math.round((km || 0) * 10) / 10).toFixed(1)}</span><span style="${rate}">NT$${RATE.perKm}<br>/ 公里</span></div>
      </div></div>`;
  }

  // track: [[緯度, 經度], ...]；opts.live = 行程進行中，opts.current = 司機目前位置
  // 同一個容器再呼叫一次會就地更新（不重建地圖、不重設縮放）
  function drawRoute(el, track, opts) {
    if (!el) return null;
    opts = opts || {};
    track = track || [];
    const cur = opts.current && opts.current[0] != null ? opts.current : null;
    // 行程已結束但路線不到兩個點（沒移動或沒有 GPS）：改標示單一位置，不要整塊灰色
    let single = null, singleNote = '';
    if (!opts.live && track.length < 2) {
      if (track.length === 1) { single = track[0]; singleNote = '這趟沒有移動，只顯示 GPS 位置'; }
      else if (opts.fallback) { single = opts.fallback; singleNote = '這趟沒有 GPS 紀錄，顯示上車地址的大約位置'; }
    }
    const enough = track.length >= 2 || single || (opts.live && (track.length || cur));
    const reset = () => { if (el._map) { try { el._map.remove(); } catch (e) {} } el._map = null; el._st = null; };
    if (!enough) {
      reset();
      el.innerHTML = '<div style="height:100%;display:grid;place-items:center;text-align:center;padding:12px;font-size:13px;color:#5B6560;background:#EEF0EC">' +
        (opts.live ? '還沒收到司機的 GPS 位置<br>（請司機允許定位並保持 App 開著）' : '這趟沒有 GPS 路線<br>（未開啟定位、訊號不足或使用示範快轉）') + '</div>';
      return null;
    }
    if (!window.L) { reset(); el.innerHTML = '<div style="height:100%;display:grid;place-items:center;font-size:13px;color:#5B6560;background:#EEF0EC">地圖載入失敗，請檢查網路</div>'; return null; }
    let st = el._st;
    if (!st) {
      el.innerHTML = '';
      const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
      addTiles(map);
      const note = L.control({ position: 'bottomleft' });
      note.onAdd = () => { const d = L.DomUtil.create('div'); d.style.cssText = 'background:#fff;padding:6px 10px;border-radius:8px;font-size:12px;color:#121A17;box-shadow:0 1px 4px rgba(0,0,0,.2)'; st.noteEl = d; return d; };
      st = el._st = { map, line: null, a: null, b: null, car: null, fitted: false, noteEl: null };
      note.addTo(map);
      el._map = map;
    }
    const map = st.map;
    const pin = (p, label) => L.marker(p, { icon: pinIcon(ROUTE_RED), keyboard: false }).addTo(map).bindTooltip(label, { direction: 'top' });
    if (track.length >= 2) {
      // 白色外框 + 紅色粗線，在任何底圖上都看得清楚
      if (!st.line) { st.casing = L.polyline(track, { color: '#fff', weight: 11, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map); st.line = L.polyline(track, { color: ROUTE_RED, weight: 7, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(map); }
      else { st.casing.setLatLngs(track); st.line.setLatLngs(track); }
    }
    if (single) { if (!st.a) st.a = pin(single, '上車'); else st.a.setLatLng(single); }
    else if (track.length) { if (!st.a) st.a = pin(track[0], '上車'); else st.a.setLatLng(track[0]); }
    if (!opts.live && track.length >= 2) { if (!st.b) st.b = pin(track[track.length - 1], '下車'); else st.b.setLatLng(track[track.length - 1]); }
    const carPos = opts.live ? (cur || track[track.length - 1]) : null;
    if (carPos) { if (!st.car) st.car = L.circleMarker(carPos, { radius: 9, color: '#fff', weight: 3, fillColor: '#2459D6', fillOpacity: 1 }).addTo(map).bindTooltip('司機目前位置', { permanent: true, direction: 'top', offset: [0, -8] }); else st.car.setLatLng(carPos); }
    if (st.noteEl) {
      const msg = single ? singleNote : opts.live && track.length < 2 ? '司機還沒移動，開始移動後會畫出路線' : opts.live ? '每 3 秒自動更新' : '';
      st.noteEl.textContent = msg; st.noteEl.style.display = msg ? '' : 'none';
    }
    const pts = single ? [single] : track.slice(); if (carPos) pts.push(carPos);
    const fit = () => { if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 17 }); else map.setView(pts[0], 16); };
    if (!st.fitted) { st.fitted = true; fit(); setTimeout(() => { try { map.invalidateSize(); fit(); } catch (e) {} }, 250); }
    return map;
  }
  // 路線點太多時平均抽樣，避免資料過大
  function thinTrack(track, max) {
    if (!track || track.length <= max) return track || [];
    const step = (track.length - 1) / (max - 1), out = [];
    for (let i = 0; i < max; i++) out.push(track[Math.round(i * step)]);
    return out;
  }

  let db;
  const cfg = window.BBC_FIREBASE_CONFIG;
  try {
    db = (cfg && cfg.apiKey && cfg.projectId && window.firebase && firebase.firestore) ? firebaseBackend(cfg) : localBackend();
  } catch (e) {
    console.error('Firebase 初始化失敗，改用示範模式', e);
    db = localBackend();
  }

  window.BBC = {
    VERSION: '2026.11.03-24',
    db, mode: db.mode, KHH, ALL_SPOTS, RATE,
    distKm, areaCenter, locate, toText, hasDest, areaOf, geoSearch, geoReverse, districtRoads, roadCoord, navUrl, fromCoord, toCoord, meterAmount, finalFare, estimateTrip,
    drawRoute, thinTrack, addTiles, pinIcon, tripSummaryHTML, clock, ROUTE_RED, hashPw, esc, fmt, ago, hhmm, startOfDay, driverState, isRealDriver, ONLINE_STALE_MS,
    LEDGER_TEXT: { topup: '儲值', commission: '行程回金', refund: '退還回金', deduct: '扣點', adjust: '調整' },
    DEFAULT_RATE: 10,
    DEFAULT_DISPATCH_MIN: 15,   // 只派給開車 15 分鐘內到得了上車點的司機
    // 直線距離 → 大約開車分鐘：實際道路約是直線的 1.35 倍，市區平均時速約 30 公里（約每公里 2.7 分鐘）
    etaMin: km => km == null ? null : Math.max(1, Math.round(km * 1.35 / 30 * 60)),   // 每 100 元車資回 10 點
    // 回金 = 車資 × 每百元回金 ÷ 100，小數捨去（例：車資 155、每百元 10 點 → 15 點）
    commissionOf: (fare, rate) => Math.max(0, Math.floor((Number(fare) || 0) * (Number(rate) || 0) / 100)),
    // 舊行程用固定點數（commission），新行程用每百元比例（commissionRate）
    rideRate: r => r && r.commissionRate != null ? Number(r.commissionRate) : null,
    STATUS_TEXT: { pending: '待派單', assigned: '已派單', pickup: '前往上車', trip: '載客中', done: '已完成', cancelled: '已取消' },
    DRIVER_TEXT: { online: '線上空車', busy: '載客中', offline: '離線', lost: '斷線', disabled: '已停用' }
  };
})();

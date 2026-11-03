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
  function estimateTrip(fromText, fromArea, toText, toArea, kmOverride) {
    if (!toText) { const f = locate(fromText, fromArea); return { fromArea: f.d, toArea: '', km: kmOverride > 0 ? kmOverride : null, mins: null, estFare: null }; }
    const f = locate(fromText, fromArea), t = locate(toText, toArea);
    const km = kmOverride > 0 ? kmOverride : Math.max(1.5, distKm(f.c, t.c) * 1.3);
    const mins = Math.max(5, Math.round(km / (km > 15 ? 45 : 25) * 60 + 2));
    return { fromArea: f.d, toArea: t.d, km: Math.round(km * 10) / 10, mins, estFare: Math.max(RATE.min, Math.round(meterAmount(km, mins) / 5) * 5) };
  }

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
      watch(c, fn) {
        (listeners[c] = listeners[c] || []).push(fn);
        setTimeout(() => emit(c), 0);  // 示範模式沒有快取問題
        return () => { listeners[c] = listeners[c].filter(f => f !== fn); };
      },
      async get(c, id) { if (!id) throw new Error('資料編號錯誤'); const o = read(c); return o[id] ? Object.assign({ id }, o[id]) : null; },
      async set(c, id, data) { if (!id) throw new Error('資料編號錯誤'); const o = read(c); o[id] = Object.assign({}, o[id] || {}, data); write(c, o); },
      async add(c, data) { const id = rideNo(); const o = read(c); o[id] = data; write(c, o); return id; },
      async remove(c, id) { const o = read(c); delete o[id]; write(c, o); }
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
      watch(c, fn) {
        return col(c).onSnapshot(
          s => fn(s.docs.map(d => dec(d.id, d.data())), { fromCache: s.metadata.fromCache }),
          err => { console.error('Firestore', err); if (window.BBC.onError) window.BBC.onError(err); }
        );
      },
      async get(c, id) { const d = await ref(c, id).get(); return d.exists ? dec(d.id, d.data()) : null; },
      async set(c, id, data) { await ref(c, id).set(enc(data), { merge: true }); },
      async add(c, data) { const id = rideNo(); await ref(c, id).set(enc(data)); return id; },
      async remove(c, id) { await ref(c, id).delete(); }
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
    const enough = track.length >= 2 || (opts.live && (track.length || cur));
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
    if (track.length) { if (!st.a) st.a = pin(track[0], '上車'); else st.a.setLatLng(track[0]); }
    if (!opts.live && track.length >= 2) { if (!st.b) st.b = pin(track[track.length - 1], '下車'); else st.b.setLatLng(track[track.length - 1]); }
    const carPos = opts.live ? (cur || track[track.length - 1]) : null;
    if (carPos) { if (!st.car) st.car = L.circleMarker(carPos, { radius: 9, color: '#fff', weight: 3, fillColor: '#2459D6', fillOpacity: 1 }).addTo(map).bindTooltip('司機目前位置', { permanent: true, direction: 'top', offset: [0, -8] }); else st.car.setLatLng(carPos); }
    if (st.noteEl) {
      const msg = opts.live && track.length < 2 ? '司機還沒移動，開始移動後會畫出路線' : opts.live ? '每 8 秒自動更新' : '';
      st.noteEl.textContent = msg; st.noteEl.style.display = msg ? '' : 'none';
    }
    const pts = track.slice(); if (carPos) pts.push(carPos);
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
    VERSION: '2026.11.03-15',
    db, mode: db.mode, KHH, ALL_SPOTS, RATE,
    distKm, areaCenter, locate, toText, hasDest, meterAmount, finalFare, estimateTrip,
    drawRoute, thinTrack, addTiles, pinIcon, tripSummaryHTML, clock, ROUTE_RED, hashPw, esc, fmt, ago, hhmm, startOfDay, driverState, isRealDriver, ONLINE_STALE_MS,
    STATUS_TEXT: { pending: '待派單', assigned: '已派單', pickup: '前往上車', trip: '載客中', done: '已完成', cancelled: '已取消' },
    DRIVER_TEXT: { online: '線上空車', busy: '載客中', offline: '離線', lost: '斷線', disabled: '已停用' }
  };
})();

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
    const a = KHH.find(x => x.d === area) || KHH[0];
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
  function estimateTrip(fromText, fromArea, toText, toArea, kmOverride) {
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
      async get(c, id) { const o = read(c); return o[id] ? Object.assign({ id }, o[id]) : null; },
      async set(c, id, data) { const o = read(c); o[id] = Object.assign({}, o[id] || {}, data); write(c, o); },
      async add(c, data) { const id = rideNo(); const o = read(c); o[id] = data; write(c, o); return id; },
      async remove(c, id) { const o = read(c); delete o[id]; write(c, o); }
    };
  }

  // ---------- Firebase Firestore 後端 ----------
  function firebaseBackend(cfg) {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const fs = firebase.firestore();
    const col = c => fs.collection('bbc_' + c);
    return {
      mode: 'cloud',
      watch(c, fn) {
        return col(c).onSnapshot(
          s => fn(s.docs.map(d => Object.assign({ id: d.id }, d.data())), { fromCache: s.metadata.fromCache }),
          err => { console.error('Firestore', err); if (window.BBC.onError) window.BBC.onError(err); }
        );
      },
      async get(c, id) { const d = await col(c).doc(id).get(); return d.exists ? Object.assign({ id: d.id }, d.data()) : null; },
      async set(c, id, data) { await col(c).doc(id).set(data, { merge: true }); },
      async add(c, data) { const id = rideNo(); await col(c).doc(id).set(data); return id; },
      async remove(c, id) { await col(c).doc(id).delete(); }
    };
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
    VERSION: '2026.11.03-3',
    db, mode: db.mode, KHH, ALL_SPOTS, RATE,
    distKm, areaCenter, locate, meterAmount, finalFare, estimateTrip,
    hashPw, esc, fmt, ago, hhmm, startOfDay, driverState, ONLINE_STALE_MS,
    STATUS_TEXT: { pending: '待派單', assigned: '已派單', pickup: '前往上車', trip: '載客中', done: '已完成', cancelled: '已取消' },
    DRIVER_TEXT: { online: '線上空車', busy: '載客中', offline: '離線', lost: '斷線', disabled: '已停用' }
  };
})();

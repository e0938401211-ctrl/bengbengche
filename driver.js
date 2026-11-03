// 蹦蹦車 司機端：接收管理平台派單、回報上線狀態與行程進度
(function () {
'use strict';
const { db, esc, fmt, KHH, ALL_SPOTS } = BBC;
const $ = id => document.getElementById(id);
const SECS = 30;                        // 派單接受倒數秒數
const HEARTBEAT_MS = 30 * 1000;
const RAINBOW = ['#D12A6E', '#E8590C', '#E0A500', '#1F8A3A', '#0E8A9E', '#2459D6', '#7B3FD1'];
const WEEK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

// 台灣市場常見廠牌與車型
const CARS = {
  'Toyota 豐田': ['Corolla Altis', 'Corolla Cross', 'Camry', 'Prius', 'Prius PHV', 'RAV4', 'Yaris', 'Yaris Cross', 'Vios', 'Sienta', 'Sienna', 'Alphard', 'Town Ace', 'bZ4X', 'Wish', 'Previa'],
  'Lexus 凌志': ['ES', 'IS', 'LS', 'UX', 'NX', 'RX', 'LBX', 'LM'],
  'Honda 本田': ['Fit', 'City', 'Civic', 'Accord', 'HR-V', 'CR-V', 'Odyssey'],
  'Nissan 日產': ['Sentra', 'Tiida', 'Teana', 'Kicks', 'X-Trail', 'Livina', 'Serena', 'Leaf'],
  'Mitsubishi 三菱': ['Colt Plus', 'Eclipse Cross', 'Outlander', 'Zinger', 'Grand Lancer'],
  'CMC 中華': ['Veryca 菱利', 'Delica 得利卡'],
  'Mazda 馬自達': ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-9'],
  'Subaru 速霸陸': ['Impreza', 'XV', 'Crosstrek', 'Forester', 'Outback', 'Levorg'],
  'Suzuki 鈴木': ['Swift', 'Ignis', 'Vitara', 'S-Cross', 'Jimny'],
  'Hyundai 現代': ['Elantra', 'Venue', 'Kona', 'Tucson L', 'Santa Fe', 'Custin', 'Staria', 'Ioniq 5', 'Ioniq 6'],
  'Kia 起亞': ['Picanto', 'Stonic', 'Niro', 'Sportage', 'Sorento', 'Carnival', 'EV6', 'EV9'],
  'Ford 福特': ['Fiesta', 'Focus', 'Kuga', 'Ranger', 'Tourneo Connect', 'Tourneo Custom', 'Mustang Mach-E'],
  'Volkswagen 福斯': ['Polo', 'Golf', 'T-Cross', 'T-Roc', 'Tiguan', 'Touran', 'Caddy', 'Multivan', 'ID.4'],
  'Škoda': ['Fabia', 'Scala', 'Kamiq', 'Karoq', 'Octavia', 'Superb', 'Kodiaq', 'Enyaq'],
  'Audi 奧迪': ['A3', 'A4', 'A6', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8 e-tron'],
  'BMW': ['1 系列', '2 系列', '3 系列', '5 系列', 'X1', 'X3', 'X5', 'i4', 'iX', 'iX1'],
  'MINI': ['Cooper', 'Countryman', 'Clubman'],
  'Mercedes-Benz 賓士': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'V-Class', 'EQA', 'EQB', 'EQE'],
  'Volvo 富豪': ['S60', 'S90', 'V60', 'XC40', 'XC60', 'XC90', 'EX30', 'EX40'],
  'Porsche 保時捷': ['Macan', 'Cayenne', 'Panamera', 'Taycan'],
  'Tesla 特斯拉': ['Model 3', 'Model Y', 'Model S', 'Model X'],
  'Luxgen 納智捷': ['S5', 'U5', 'U6', 'URX', 'M7', 'n7'],
  'Peugeot 寶獅': ['208', '2008', '308', '3008', '408', '5008', 'Rifter'],
  'Citroën 雪鐵龍': ['C3', 'C4', 'C5 Aircross', 'C5 X', 'Berlingo'],
  'MG': ['ZS', 'HS', 'MG4'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover Evoque', 'Range Rover Velar', 'Range Rover'],
  'Jeep': ['Renegade', 'Compass', 'Cherokee', 'Wrangler'],
  '其他廠牌': []
};

const LOGO = `<div class="logo"><div class="tile"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16v-3l2.5-4.5h13L21 13v3z"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M8 5.5c.8-1 1.6-1 2.4 0M13.6 5.5c.8-1 1.6-1 2.4 0"/></svg></div><div class="word"><span style="color:var(--pink)">蹦</span><span style="color:var(--blue)">蹦</span><span style="color:var(--purple)">車</span></div></div>`;
const ICON_X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// ---------- 本機小設定（只存在這支手機） ----------
const local = {
  get(k, d) { try { const v = localStorage.getItem('bbc_drv_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bbc_drv_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('bbc_drv_' + k); } catch (e) {} }
};

// ---------- 狀態 ----------
let ME = null;          // 目前登入的司機資料
let ONLINE = false;     // 是否上線接單
let RIDES = [];         // 所有行程（即時）
let CUR = null;         // 正在處理的行程
let S = { tab: 'home', status: 'offline', left: SECS, unread: 0 };  // status: offline | searching | request | pickup | trip | done
const AREA = '高雄市全區';   // 司機不分區，服務範圍為高雄市全部 38 區
let countT = null, meterT = null, beatT = null, unsubR = null, unsubD = null, unsubL = null;
let LEDGER = [], ACCEPTING = false;
let M = { rideId: null, min: 0, km: 0, lastPush: 0, lastTrack: 0 };
let SYNC_ERR_SHOWN = false;

// ---------- 小工具 ----------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}
const fail = e => { console.error(e); toast('連線失敗：' + ((e && (e.code || e.message)) || '請檢查網路後再試一次')); };
BBC.onError = err => toast('雲端連線錯誤：' + (err.code || err.message));
const meterFare = () => BBC.meterAmount(M.km, M.min);
function stopCountdown() { clearInterval(countT); countT = null; }
function stopMeter() { clearInterval(meterT); meterT = null; }

// ---------- 雲端寫入 ----------
function presence(extra) {
  if (!ME || !ME.phone) return Promise.resolve();
  const status = !ONLINE ? 'offline' : (CUR && ['pickup', 'trip'].includes(S.status) ? 'busy' : 'online');
  return db.set('drivers', ME.phone, Object.assign({ status, area: AREA, lastSeen: Date.now(), rideId: CUR && status === 'busy' ? CUR.id : '' }, locFields(), extra || {})).catch(fail);
}
function startHeartbeat() {
  clearInterval(beatT);
  beatT = setInterval(() => { if (ME && ONLINE) presence(); retryPending(); }, HEARTBEAT_MS);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ME && ONLINE) presence(); });

// ---------- 即時接收行程 ----------
function onRides(list, meta) {
  if (meta && meta.fromCache) return;   // 只相信雲端回來的資料，手機暫存的可能不完整
  RIDES = list;
  if (!ME) return;
  const mine = list
    .filter(r => r.driverPhone === ME.phone && ['assigned', 'pickup', 'trip'].includes(r.status))
    .sort((a, b) => (b.assignedAt || b.createdAt || 0) - (a.assignedAt || a.createdAt || 0));
  const r = mine[0] || null;

  if (CUR && (!r || r.id !== CUR.id) && S.status !== 'done') {
    const old = list.find(x => x.id === CUR.id);
    if (!old) { verifyCurrent(CUR.id); render(); return; }   // 清單裡暫時沒有，向雲端確認後再決定
    releaseCurrent(old);
  }
  if (r && S.status !== 'done') {
    CUR = r;
    if (r.status === 'assigned' && S.status !== 'request') startRequest();
    else if (r.status === 'pickup') S.status = 'pickup';
    else if (r.status === 'trip') { S.status = 'trip'; if (!meterT) startMeter(); }
    if (r.status !== 'assigned') stopCountdown();
    ONLINE = true;
  }
  render();
}
// 行程真的被取消或改派時，才讓司機回到等待派單
function releaseCurrent(old) {
  if (!CUR || old.id !== CUR.id) return;
  const stillMine = old.driverPhone === ME.phone && ['assigned', 'pickup', 'trip'].includes(old.status);
  if (stillMine) return;
  if (old.status === 'cancelled') toast('管理員已取消行程 ' + CUR.id);
  else if (old.status !== 'done') toast('行程 ' + CUR.id + ' 已改派給其他司機');
  CUR = null; stopCountdown(); stopMeter(); stopGPS(); closeChat();
  S.status = ONLINE ? 'searching' : 'offline';
  presence(); render();
}
function verifyCurrent(id) {
  db.get('rides', id).then(r => { if (r) releaseCurrent(r); }).catch(() => {});
}

function startRequest() {
  ONLINE = true;
  S.status = 'request'; S.left = SECS; S.declining = false;
  stopCountdown();
  countT = setInterval(() => {
    S.left -= 1;
    if (S.left <= 0) { A.decline('逾時未接'); toast('超過時間未接單，已退回給管理平台'); }
    else updateCountdown();
  }, 1000);
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
  speak('新的派單，' + (CUR ? CUR.from : ''));
}

// ---------- GPS 實際路線 ----------
let GEO = { rec: false, rideId: null, track: [], km: 0, lastT: 0, ok: false, err: '' }, wakeLock = null;
const r5 = n => Math.round(n * 1e5) / 1e5;
// ---------- 精準定位：上線期間持續追蹤手機 GPS ----------
let LOC = { watch: null, pos: null, err: '', sentAt: 0, sentPos: null };
function startLocate() {
  if (LOC.watch != null) return;
  if (!('geolocation' in navigator)) { LOC.err = '這支手機不支援定位'; return updateLocUI(); }
  LOC.watch = navigator.geolocation.watchPosition(onLoc, e => {
    LOC.err = e.code === 1 ? '定位被拒絕：請到 設定 › Safari › 位置 允許' : '抓不到 GPS，請到室外或靠窗';
    GEO.err = e.code === 1 ? '定位被拒絕：里程改用估算' : '暫時抓不到 GPS，里程先用估算';
    const s = $('mSrc'); if (s) s.textContent = GEO.err;
    updateLocUI();
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  updateLocUI();
}
function stopLocate() {
  if (LOC.watch != null) { try { navigator.geolocation.clearWatch(LOC.watch); } catch (e) {} }
  LOC.watch = null; LOC.pos = null; LOC.err = '';
  updateLocUI();
}
function onLoc(p) {
  const { latitude, longitude, accuracy } = p.coords;
  LOC.pos = { lat: latitude, lng: longitude, acc: Math.round(accuracy), t: p.timestamp };
  LOC.err = '';
  if (GEO.rec) onPos(p);
  updateLocUI();
  sendLoc(false);
}
// 回報位置給管理平台：移動超過 25 公尺最快每 8 秒一次，停著不動每 30 秒一次
function sendLoc(force) {
  if (!ME || !ME.phone || !LOC.pos) return;
  const now = Date.now(), p = [LOC.pos.lat, LOC.pos.lng];
  const moved = LOC.sentPos ? BBC.distKm(LOC.sentPos, p) * 1000 : Infinity;
  if (!force && !(now - LOC.sentAt > 30000 || (moved > 25 && now - LOC.sentAt > 8000))) return;
  LOC.sentAt = now; LOC.sentPos = p;
  db.set('drivers', ME.phone, { lat: r5(p[0]), lng: r5(p[1]), acc: LOC.pos.acc, locAt: now, lastSeen: now }).catch(() => {});
}
const locFields = () => LOC.pos ? { lat: r5(LOC.pos.lat), lng: r5(LOC.pos.lng), acc: LOC.pos.acc, locAt: Date.now() } : {};

// ---------- 地圖 ----------
let LM = null, MY_MK = null, ACC_C = null, TRACK_L = null, FOLLOW = true;
function initMap() {
  if (LM || !window.L) return;
  try {
    LM = L.map('lmap', { zoomControl: false, attributionControl: true }).setView([22.6273, 120.3014], 13);
    BBC.addTiles(LM);
    LM.on('dragstart', () => { FOLLOW = false; });
    document.querySelector('.map').hidden = true;     // 有真地圖就收起示意圖
  } catch (e) { console.error(e); LM = null; }
}
// 派單／前往上車／行程中：在地圖上標出上車點與下車點
let STOP_PINS = {}, STOP_FOR = '';
function showStopPins() {
  if (!LM) return;
  const r = CUR, active = r && ['request', 'pickup', 'trip'].includes(S.status);
  const want = {};
  if (active) {
    const f = BBC.fromCoord(r) || (r.from ? BBC.locate(r.from, r.fromArea).c : null);
    if (f && S.status !== 'trip') want.from = f;
    const t = BBC.toCoord(r) || (BBC.hasDest(r) ? BBC.locate(r.to, r.toArea).c : null);
    if (t && S.status === 'trip') want.to = t;
  }
  ['from', 'to'].forEach(k => {
    if (!want[k]) { if (STOP_PINS[k]) { LM.removeLayer(STOP_PINS[k]); delete STOP_PINS[k]; } return; }
    if (!STOP_PINS[k]) STOP_PINS[k] = L.marker(want[k], { icon: BBC.pinIcon(k === 'from' ? BBC.ROUTE_RED : '#121A17') }).addTo(LM).bindTooltip(k === 'from' ? '上車點' : '下車點', { permanent: true, direction: 'top' });
    else STOP_PINS[k].setLatLng(want[k]);
  });
  // 狀態改變時把地圖框到「我」和目的地
  const key = active ? r.id + S.status : '';
  if (key && key !== STOP_FOR) {
    STOP_FOR = key;
    const pts = Object.values(want); if (LOC.pos) pts.push([LOC.pos.lat, LOC.pos.lng]);
    if (pts.length > 1) { FOLLOW = false; LM.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 17 }); }
    else if (pts.length === 1) LM.setView(pts[0], 16);
  }
  if (!key) STOP_FOR = '';
}
function updateLocUI() {
  const chip = $('locText');
  if (chip) chip.textContent = LOC.pos ? 'GPS 精準定位 · 誤差 ±' + LOC.pos.acc + ' 公尺'
    : LOC.err ? LOC.err : LOC.watch != null ? 'GPS 定位中…' : '高雄市全區 · 上線後開始定位';
  if (!LM || !LOC.pos) return;
  const ll = [LOC.pos.lat, LOC.pos.lng];
  if (!MY_MK) {
    ACC_C = L.circle(ll, { radius: LOC.pos.acc, color: '#2459D6', weight: 1, fillOpacity: 0.12 }).addTo(LM);
    MY_MK = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#D12A6E', fillOpacity: 1 }).addTo(LM);
  } else { MY_MK.setLatLng(ll); ACC_C.setLatLng(ll).setRadius(LOC.pos.acc); }
  if (FOLLOW) LM.setView(ll, Math.max(LM.getZoom(), 16), { animate: true });
  if (GEO.rec && GEO.track.length > 1) {
    if (!TRACK_L) TRACK_L = L.polyline(GEO.track, { color: BBC.ROUTE_RED, weight: 7, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(LM);
    else TRACK_L.setLatLngs(GEO.track);
  } else if (TRACK_L && !GEO.rec) { LM.removeLayer(TRACK_L); TRACK_L = null; }
}
function recenter() {
  FOLLOW = true;
  if (LOC.watch == null) startLocate();
  if (LM && LOC.pos) LM.setView([LOC.pos.lat, LOC.pos.lng], 17, { animate: true });
  else toast(LOC.err || '正在取得 GPS 位置…');
}

// ---------- 行程路線記錄 ----------
function startGPS() {
  if (!CUR) return;
  if (GEO.rideId !== CUR.id) GEO = { rec: true, rideId: CUR.id, track: (CUR.track || []).slice(), km: CUR.gpsKm || 0, lastT: 0, ok: false, err: '' };
  GEO.rec = true;
  startLocate(); keepScreenOn();
}
function onPos(p) {
  const { latitude, longitude, accuracy } = p.coords;
  if (accuracy > (GEO.track.length ? 60 : 100)) return;        // 誤差太大的點不要（第一個點放寬，讓管理平台先看到起點）
  const pt = [r5(latitude), r5(longitude)];
  const last = GEO.track[GEO.track.length - 1];
  if (last) {
    const d = BBC.distKm(last, pt);
    if (d < 0.015) return;                                     // 小於 15 公尺視為原地
    const hrs = GEO.lastT ? (p.timestamp - GEO.lastT) / 3600000 : 0;
    if (hrs > 0 && d / hrs > 160) return;                      // 時速超過 160 是飄點
    GEO.km += d;
  }
  GEO.track.push(pt); GEO.lastT = p.timestamp; GEO.ok = true; GEO.err = '';
}
function stopGPS() {
  GEO.rec = false;
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  if (!ONLINE) stopLocate();
  updateLocUI();
}
async function keepScreenOn() {   // 行程中讓螢幕保持亮著，iPhone 鎖螢幕後網頁無法繼續記錄 GPS
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && GEO.rec) keepScreenOn(); if (!document.hidden && ME && ONLINE) { startLocate(); sendLoc(true); } });
const usingGps = () => GEO.ok && GEO.track.length > 1;

// ---------- 跳表 ----------
function startMeter() {
  stopMeter();
  if (!CUR) return;
  if (M.rideId !== CUR.id) M = { rideId: CUR.id, min: CUR.startedAt ? (Date.now() - CUR.startedAt) / 60000 : 0, km: 0, lastPush: 0, lastTrack: 0 };
  startGPS();
  const tick = () => {
    if (!CUR) return stopMeter();
    // 以開始跳表的時間計算經過分鐘，手機切到背景或計時器變慢都不會有誤差，管理平台也用同一個基準
    M.min = CUR.startedAt ? Math.max(0, (Date.now() - CUR.startedAt) / 60000) : M.min + 1 / 60;
    // 有 GPS 用實際里程；沒有 GPS 時，有下車地點就依預估距離隨時間累加，沒有下車地點就以市區平均時速 25 公里估算
    M.km = usingGps() ? GEO.km : CUR.km ? Math.min(CUR.km, CUR.km * M.min / (CUR.mins || 10)) : M.min * 25 / 60;
    const f = $('mFare');
    if (f) {
      f.textContent = fmt(meterFare());
      $('mKm').textContent = M.km.toFixed(1);
      $('mMin').textContent = Math.floor(M.min);
      $('mStat').textContent = statText();
      $('mSrc').textContent = srcText();
    }
    if (Date.now() - M.lastPush > 3000) {           // 每 3 秒回報一次跳表給管理平台
      M.lastPush = Date.now();
      const up = { meterFare: meterFare(), meterKm: Math.round(M.km * 100) / 100, meterMin: Math.round(M.min * 100) / 100, gpsKm: Math.round(GEO.km * 100) / 100, meterAt: Date.now(), distanceSource: usingGps() ? 'gps' : 'estimate' };
      if (Date.now() - M.lastTrack > 10000 && GEO.track.length) { M.lastTrack = Date.now(); up.track = BBC.thinTrack(GEO.track, 800); }   // 每 10 秒同步路線，管理平台可即時看
      db.set('rides', CUR.id, up).then(() => { SYNC_ERR_SHOWN = false; }).catch(e => { console.error(e); if (!SYNC_ERR_SHOWN) { SYNC_ERR_SHOWN = true; toast('跳表同步到管理平台失敗：' + (e.code || e.message)); } });
    }
  };
  tick();
  meterT = setInterval(tick, 1000);
}

// ---------- 動作 ----------
const A = {
  online() { ONLINE = true; S.status = 'searching'; FOLLOW = true; startLocate(); presence(); render(); },
  offline() { ONLINE = false; S.status = 'offline'; if (!GEO.rec) stopLocate(); presence(); render(); },
  async accept() {
    if (!CUR || ACCEPTING) return;
    const r = CUR;
    // 回金在行程結束才扣；接單時只確認點數夠扣這張單的預估回金
    const need = estNeed(r);
    if (need && balance() < need) {
      toast(`點數不足：這張單預估要扣 ${need} 點回金，你只剩 ${fmt(balance())} 點，請聯絡管理員儲值`);
      A.decline('點數不足'); return;
    }
    ACCEPTING = true; stopCountdown();
    ACCEPTING = false;
    if (!CUR || CUR.id !== r.id) return;   // 扣點時行程資料會更新，用編號比對
    S.status = 'pickup';
    db.set('rides', r.id, { status: 'pickup', acceptedAt: Date.now() }).then(() => presence()).catch(fail);
    render();
  },
  // 按「拒絕」先選原因（倒數照跑），選了才真的退回
  askDecline() { if (!CUR) return; S.declining = true; render(); },
  cancelDecline() { S.declining = false; render(); },
  decline(reason) {
    if (!CUR) return;
    stopCountdown(); S.declining = false;
    const r = CUR;
    CUR = null; S.status = ONLINE ? 'searching' : 'offline';
    const why = typeof reason === 'string' && reason ? reason : '司機拒絕';
    db.set('rides', r.id, {
      status: 'pending', driverPhone: '', driverName: '', plate: '', assignedAt: 0,
      declinedBy: (r.declinedBy || []).concat(ME.phone),
      declines: (r.declines || []).concat({ phone: ME.phone, name: ME.name || ME.phone, reason: why, at: Date.now() })
    }).then(() => presence()).catch(fail);
    if (why !== '逾時未接' && why !== '點數不足') toast('已拒絕，這張單退回給管理平台');
    render();
  },
  declineBusy() { A.decline('正在忙'); },
  declinePlain() { A.decline('拒絕'); },
  arrive() {
    if (!CUR) return;
    const now = Date.now();
    CUR.startedAt = now; CUR.track = []; CUR.gpsKm = 0; M = { rideId: CUR.id, min: 0, km: 0, lastPush: 0, lastTrack: 0 };
    GEO = { rec: false, rideId: null, track: [], km: 0, lastT: 0, ok: false, err: '' };
    S.status = 'trip';
    db.set('rides', CUR.id, { status: 'trip', startedAt: now, meterFare: BBC.RATE.base }).catch(fail);
    startMeter(); render();
  },
  complete() {
    if (!CUR) return;
    stopMeter(); stopGPS(); closeChat();
    const rec = buildRecord(CUR, M.km, M.min);
    const rate = BBC.rideRate(CUR);
    rec.commissionFee = rate != null ? BBC.commissionOf(rec.finalFare, rate) : 0;
    Object.assign(CUR, rec);
    S.status = 'done';
    saveLocalTrip(Object.assign({ id: CUR.id }, CUR));          // 先存一份在手機
    uploadTrip(CUR.id, rec).then(() => presence({ status: ONLINE ? 'online' : 'offline', rideId: '' }));
    if (rec.commissionFee > 0) chargeCommission(CUR.id, rec.commissionFee, rec.finalFare, rate, (CUR.fromArea ? CUR.fromArea + ' ' : '') + CUR.from);
    render();
  },
  detail(id) { openTrip(id); },
  points() { S.tab = 'points'; render(); },
  next() { CUR = null; S.status = ONLINE ? 'searching' : 'offline'; presence(); onRides(RIDES); },
  chat() { openChat(); },

};
const meterAmount = () => meterFare();
function statText() {
  if (!CUR || !CUR.mins) return '依乘客指示行駛';
  return M.min >= CUR.mins ? '已到預估時間' : '剩約 ' + Math.max(1, Math.ceil(CUR.mins - M.min)) + ' 分鐘';
}
function srcText() {
  if (usingGps()) return 'GPS 記錄中 · 已記錄 ' + GEO.track.length + ' 個點';
  return GEO.err || '等待 GPS 訊號…（請保持螢幕亮著）';
}

// ---------- 行程完整紀錄 ----------
let HF = 'today';   // 行程紀錄篩選：today | week | all
function buildRecord(r, km, min) {
  const R = BBC.RATE;
  const meter = BBC.meterAmount(km, min);
  const fare = BBC.finalFare(km, min);
  const now = Date.now();
  return {
    status: 'done', doneAt: now,
    startedAt: r.startedAt || now, acceptedAt: r.acceptedAt || r.startedAt || now,
    finalKm: Math.round(km * 10) / 10, finalMin: Math.round(min * 10) / 10,
    fareBase: R.base, fareKm: Math.round(km * R.perKm), fareTime: Math.round(min * R.perMin),
    meterFare: meter, minFareTopUp: Math.max(0, fare - meter), finalFare: fare,
    rate: { base: R.base, perKm: R.perKm, perMin: R.perMin, min: R.min },
    track: BBC.thinTrack(GEO.rideId === r.id ? GEO.track : (r.track || []), 1500), gpsKm: Math.round((GEO.rideId === r.id ? GEO.km : (r.gpsKm || 0)) * 100) / 100,
    distanceSource: usingGps() ? 'gps' : 'estimate',
    driverName: ME.name, driverPhone: ME.phone, plate: ME.plate || '',
    car: [ME.brand, ME.model].filter(Boolean).join(' '), carColor: ME.color || '', service: ME.service || ''
  };
}
// 手機備份（每位司機最多保留 300 筆）
const tripKey = () => 'trips_' + (ME ? ME.phone : '');
function localTrips() { return ME ? local.get(tripKey(), []) : []; }
function saveLocalTrip(t) {
  const list = localTrips().filter(x => x.id !== t.id);
  list.unshift(t); local.set(tripKey(), list.slice(0, 300));
}
const pendingKey = () => 'pending_' + (ME ? ME.phone : '');
function markPending(id, rec, on) {
  const p = local.get(pendingKey(), {});
  if (on) p[id] = rec; else delete p[id];
  local.set(pendingKey(), p);
  const el = $('saveState'); if (el) el.textContent = saveStateText(id);
}
function saveStateText(id) {
  return local.get(pendingKey(), {})[id] ? '已存在手機，等待上傳雲端…' : '已儲存到雲端';
}
function uploadTrip(id, rec) {
  markPending(id, rec, true);
  return db.set('rides', id, rec).then(() => markPending(id, rec, false))
    .catch(e => { console.error(e); toast('網路不穩，行程已先存在手機，連線後會自動上傳'); });
}
function retryPending() {
  if (!ME) return;
  const p = local.get(pendingKey(), {});
  Object.keys(p).forEach(id => db.set('rides', id, p[id]).then(() => markPending(id, p[id], false)).catch(() => {}));
  const f = local.get(feeKey(), {});
  Object.keys(f).forEach(id => chargeCommission(id, f[id].fee, f[id].fare, f[id].rate, f[id].address, true));
}
// ---------- 行程結束扣回金（同一趟只扣一次；網路不穩會先記在手機，連線後補扣） ----------
const feeKey = () => 'fee_' + (ME ? ME.phone : '');
function chargeCommission(rideId, fee, fare, rate, address, silent) {
  const f = local.get(feeKey(), {}); f[rideId] = { fee, fare, rate, address }; local.set(feeKey(), f);
  return db.adjustBalance(ME.phone, -fee,
    { type: 'commission', rideId, address, note: `車資 NT$${fare} · 每百元回 ${rate} 點` },
    { rideId, flag: 'commissionLedger' })
    .then(res => {
      const g = local.get(feeKey(), {}); delete g[rideId]; local.set(feeKey(), g);
      if (!res.skipped && !silent) toast(`已扣行程回金 ${fee} 點，剩餘 ${fmt(res.after)} 點`);
    })
    .catch(e => { console.error(e); if (!silent) toast('回金暫時沒扣到（' + (e.code || e.message) + '），連線後會自動補扣'); });
}
const dt = t => t ? new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
function receiptHTML(r, mapId) {
  const km = r.finalKm != null ? r.finalKm : 0, min = r.finalMin != null ? r.finalMin : 0;
  const base = r.fareBase != null ? r.fareBase : BBC.RATE.base;
  const kmFee = r.fareKm != null ? r.fareKm : Math.round(km * BBC.RATE.perKm);
  const tFee = r.fareTime != null ? r.fareTime : Math.round(min * BBC.RATE.perMin);
  const meter = r.meterFare != null ? r.meterFare : BBC.meterAmount(km, min);
  const top = r.minFareTopUp != null ? r.minFareTopUp : Math.max(0, (r.finalFare || 0) - meter);
  const L = (k, v) => `<div class="line" style="padding:9px 0"><span class="sub" style="font-size:14px">${k}</span><b style="text-align:right;max-width:65%;overflow-wrap:anywhere">${v}</b></div>`;
  return `<div class="panel" style="padding:4px 14px;background:var(--page)">
    ${mapId ? `<div style="margin:10px 0 4px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#fff"><div id="${mapId}" style="height:270px;background:#EEF0EC"></div>${BBC.tripSummaryHTML(r.finalFare, min, km, '實收')}</div>` : ''}
    ${L('行程編號', esc(r.id))}
    ${L('乘客', esc(r.riderName || '乘客') + (r.riderPhone ? ' · ' + esc(r.riderPhone) : ''))}
    ${L('上車', esc((r.fromArea || '') + ' ' + (r.from || '')))}
    ${L('下車', esc(BBC.toText(r)))}
    ${r.note ? L('備註', esc(r.note)) : ''}
    ${L('開始跳表', dt(r.startedAt))}
    ${L('結束', dt(r.doneAt))}
    ${L('里程／時間', esc(km) + ' 公里 · ' + esc(Math.round(min)) + ' 分鐘')}
    ${L('里程來源', r.distanceSource === 'gps' ? 'GPS 實際行駛' : '依路線估算')}
    ${L('起跳', 'NT$' + fmt(base))}
    ${L('里程費（每公里 ' + BBC.RATE.perKm + '）', 'NT$' + fmt(kmFee))}
    ${L('時間費（每分鐘 ' + BBC.RATE.perMin + '）', 'NT$' + fmt(tFee))}
    ${L('跳表金額', 'NT$' + fmt(meter))}
    ${top ? L('最低車資補足', '+NT$' + fmt(top)) : ''}
    <div class="line" style="padding:12px 0"><span style="font-weight:700">實收車資</span><b style="font-size:20px">NT$${fmt(r.finalFare)}</b></div>
    ${r.commissionFee ? L('平台回金（每 100 元 ' + BBC.rideRate(r) + ' 點）', '-' + fmt(r.commissionFee) + ' 點') : ''}
    ${L('車輛', esc([r.plate, r.car, r.carColor].filter(Boolean).join(' · ') || '—'))}
  </div>`;
}
function historyHTML() {
  const t0 = BBC.startOfDay(), w0 = BBC.startOfDay(Date.now() - 6 * 86400000);
  const all = myDone().sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const list = HF === 'today' ? all.filter(r => r.doneAt >= t0) : HF === 'week' ? all.filter(r => r.doneAt >= w0) : all;
  const sum = list.reduce((a, r) => a + (r.finalFare || 0), 0);
  const chip = (k, label) => `<button type="button" data-hf="${k}" aria-pressed="${HF === k}" style="height:34px;padding:0 14px;border-radius:17px;font-size:13px;font-weight:700;background:${HF === k ? 'var(--ink)' : 'var(--ground)'};color:${HF === k ? 'var(--white)' : 'var(--grey)'}">${label}</button>`;
  return `<div style="display:flex;flex-direction:column;gap:10px">
    <div class="row"><p class="h2" style="font-size:18px">行程紀錄</p><span class="sub">${list.length} 趟 · NT$${fmt(sum)}</span></div>
    <div style="display:flex;gap:8px">${chip('today', '今天')}${chip('week', '近 7 天')}${chip('all', '全部')}</div>
    <div class="panel" style="padding-block:4px">
      ${list.length ? list.slice(0, 200).map(r => `<button type="button" data-trip="${esc(r.id)}" class="line" style="width:100%;text-align:left;gap:10px;align-items:center;background:none;color:inherit;font-size:15px;padding:12px 0">
          <span style="min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:var(--grey)">${dt(r.doneAt)} · ${esc(r.finalKm != null ? r.finalKm : r.km)} 公里</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.from)} → ${esc(BBC.hasDest(r) ? r.to : '依乘客指示')}</span></span>
          <b style="flex-shrink:0">NT$${fmt(r.finalFare)} ›</b></button>`).join('')
        : `<div class="line"><span class="sub">${HF === 'today' ? '今天' : HF === 'week' ? '近 7 天' : '目前'}還沒有完成的行程</span></div>`}
    </div></div>`;
}
function openTrip(id) {
  const r = myDone().find(x => x.id === id);
  if (!r) return;
  $('tdBody').innerHTML = receiptHTML(r, 'tdMap');
  $('tdState').textContent = local.get(pendingKey(), {})[id] ? '已存在手機，等待上傳雲端' : '已儲存到雲端';
  $('tripDetail').hidden = false;
  BBC.drawRoute($('tdMap'), r.track, { fallback: BBC.fromCoord(r) || BBC.locate(r.from || '', r.fromArea || '').c });
}

// ---------- 點數（儲值與回金） ----------
const balance = () => (ME && ME.balance) || 0;
// 接單前的預估回金：有預估車資就用預估，沒有就以最低車資計
function estNeed(r) {
  const rate = BBC.rideRate(r);
  if (rate == null) return 0;
  return BBC.commissionOf(r.estFare || BBC.RATE.min, rate);
}
function pointsLine() {
  const b = balance(), need = BBC.commissionOf(BBC.RATE.min, BBC.DEFAULT_RATE);
  return `<div class="row" style="padding-top:2px"><span class="sub">點數餘額 <b style="color:${b < need ? '#B3261E' : 'var(--ink)'}">${fmt(b)} 點</b>${b < need ? '（偏低，接單可能不足）' : ''}</span><button class="outline" data-a="points" style="height:34px;font-size:13px">點數紀錄</button></div>`;
}
function pointsHTML() {
  const list = LEDGER.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 300);
  const md = t => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + '<br>' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const th = 'padding:8px 6px;border:1px solid var(--line);font-size:13px;font-weight:700;text-align:left;background:var(--white);position:sticky;top:0';
  const td = 'padding:10px 6px;border:1px solid var(--line);font-size:14px;vertical-align:middle;font-variant-numeric:tabular-nums';
  return `<div><p class="sub">目前餘額</p><div class="fare">${fmt(balance())} <span style="font-size:20px">點</span></div><p class="sub" style="font-size:12px">1 點 = 1 元 · 行程結束時依車資扣回金（每 100 元 10 點）</p></div>
    <div class="panel" style="padding:0;overflow:hidden">
      ${list.length ? `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead><tr><th style="${th};width:19%">日期</th><th style="${th};width:17%">入扣帳</th><th style="${th};width:16%">當時餘額</th><th style="${th};width:16%">結算餘額</th><th style="${th}">地址</th></tr></thead>
        <tbody>${list.map(x => `<tr>
          <td style="${td}">${md(x.createdAt)}</td>
          <td style="${td}"><b style="color:${x.amount >= 0 ? '#1F7A34' : '#B3261E'};font-size:16px">${x.amount >= 0 ? '+' : ''}${fmt(x.amount)}</b><div style="font-size:11px;color:var(--grey)">${esc(BBC.LEDGER_TEXT[x.type] || x.type)}</div></td>
          <td style="${td}">${fmt(x.before)}</td>
          <td style="${td}">${fmt(x.after)}</td>
          <td style="${td};font-size:13px;overflow-wrap:anywhere">${esc(x.address || x.note || '—')}</td></tr>`).join('')}</tbody></table>`
        : '<p class="sub" style="padding:16px">還沒有點數紀錄。管理員幫你儲值後就會出現在這裡。</p>'}
    </div>`;
}

// ---------- 畫面 ----------
function badge() { return S.unread ? `<span class="badge">${S.unread}</span>` : ''; }

function sheetHTML() {
  const r = CUR || {};
  switch (S.status) {
    case 'offline': return `<div class="offline-wrap"><button class="online" data-a="online">上線</button>
      <div class="card center">${LOGO}<p class="h2">${ME ? esc(ME.name) + '，' : ''}您目前離線</p><p class="sub">按「上線」開始接收管理平台的派單</p></div></div>`;
    case 'searching': return `<div class="card searching"><div class="track"><div class="fill"></div></div>
      <div class="row"><div><p class="h2">上線中，等待派單…</p><p class="sub">管理平台派單後會立即顯示在這裡</p></div><button class="outline" data-a="offline">下線</button></div>
      <button class="outline" data-a="chat" style="position:relative;align-self:flex-start">聯絡管理平台${badge()}</button>
      ${pointsLine()}</div>`;
    case 'request': return `<div class="req"><div class="row"><div class="chip">管理平台派單 · ${esc(r.id)}</div><div class="dim" id="cdText">剩 ${S.left} 秒</div></div>
      <div class="track" style="background:#2D3833"><div class="fill" id="cdBar" style="width:${S.left / SECS * 100}%;background:var(--yellow);transition:width 1s linear"></div></div>
      ${r.estFare == null
        ? `<div style="display:flex;align-items:baseline;gap:10px"><div class="fare">跳表計費</div><div class="dim">起跳 NT$${BBC.RATE.base}</div></div>
      <div class="dim" style="font-size:14px">${esc(r.riderName || '乘客')}${r.riderPhone ? ' · ' + esc(r.riderPhone) : ''} · 下車地點依乘客指示</div>`
        : `<div style="display:flex;align-items:baseline;gap:10px"><div class="fare">NT$${fmt(r.estFare)}</div><div class="dim">預估車資（跳表計費）</div></div>
      <div class="dim" style="font-size:14px">${esc(r.riderName || '乘客')}${r.riderPhone ? ' · ' + esc(r.riderPhone) : ''} · 約 ${esc(r.km)} 公里 / ${esc(r.mins)} 分鐘</div>`}
      ${BBC.rideRate(r) ? `<div class="dim" style="font-size:14px">行程結束扣回金：每 100 元 <b style="color:var(--yellow)">${fmt(BBC.rideRate(r))} 點</b>${r.estFare ? '（預估約 ' + estNeed(r) + ' 點）' : ''} · 目前餘額 ${fmt(balance())} 點${balance() < estNeed(r) ? '（不足，請先儲值）' : ''}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="stop"><div class="dot" style="background:#fff;border-radius:50%"></div><div>${esc(r.fromArea)} ${esc(r.from)}</div></div>
        <div class="stop"><div class="dot" style="background:var(--yellow)"></div><div>${esc(BBC.toText(r))}</div></div>
      </div>
      ${r.note ? `<div class="dim" style="font-size:14px;background:#2D3833;padding:8px 12px;border-radius:10px">備註：${esc(r.note)}</div>` : ''}
      ${S.declining
        ? `<div class="whyno"><p style="font-weight:700">選一個，這張單就會退回管理平台</p>
          <div class="whygrid"><button data-a="declineBusy">正在忙</button><button data-a="declinePlain">拒絕</button></div></div>`
        : `<div style="display:flex;gap:10px"><button class="nobtn" data-a="askDecline">${ICON_X}<span>拒絕</span></button>
      <button class="btn" style="background:var(--blue)" data-a="accept">接受</button></div>`}</div>`;
    case 'pickup': return `<div class="card"><div class="kicker">前往上車地點 · ${esc(r.id)}</div><p class="h2">${esc(r.fromArea)} ${esc(r.from)}</p>
      ${r.note ? `<p class="sub">備註：${esc(r.note)}</p>` : ''}
      <div style="display:flex;align-items:center;gap:12px"><div class="avatar">${esc((r.riderName || '乘')[0])}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:500">${esc(r.riderName || '乘客')}</div><div class="sub" style="font-size:13px">${esc(r.riderPhone || '未留電話')}</div></div>
        <button class="round flat" data-a="chat" aria-label="傳訊息給管理平台" style="position:relative"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#121A17" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>${badge()}</button>
      </div>
      <a class="navbtn" href="${BBC.navUrl(r.fromLat, r.fromLng, r.from, r.fromArea)}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>導航到上車點${r.fromLat != null ? '（精準位置）' : ''}</a>
      <button class="btn" style="background:var(--pink)" data-a="arrive">乘客已上車，開始跳表</button></div>`;
    case 'trip': {
      return `<div class="card"><div class="row"><div class="kicker">行程中 · ${esc(r.id)}</div><div class="kicker" id="mStat">${statText()}</div></div>
      <p class="h2">${BBC.hasDest(r) ? esc(BBC.toText(r)) : '下車地點：依乘客指示'}</p>
      <div class="meter" role="status" aria-label="跳表">
        <div class="meter-top"><span>蹦蹦車跳表</span><span class="live">計費中</span></div>
        <div class="meter-fare">NT$<span id="mFare">${fmt(meterFare())}</span></div>
        <div class="meter-sub"><span id="mKm">${M.km.toFixed(1)}</span> 公里 · <span id="mMin">${Math.floor(M.min)}</span> 分鐘</div>
        <div class="meter-rate" id="mSrc">${srcText()}</div>
        <div class="meter-rate">起跳 50 · 每公里 20 · 每分鐘 2 · 最低 100</div>
      </div>
      <div class="row"><p class="sub">乘客：${esc(r.riderName || '乘客')}</p>
        <button class="outline" data-a="chat" style="position:relative">聯絡管理平台${badge()}</button></div>
      ${BBC.hasDest(r) ? `<a class="navbtn" href="${BBC.navUrl(r.toLat, r.toLng, r.to, r.toArea)}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>導航到下車點</a>` : ''}
      <button class="btn" style="background:var(--ink)" data-a="complete">完成行程</button></div>`;
    }
    case 'done': return `<div class="card" style="gap:10px;max-height:calc(100vh - 200px);overflow:hidden">
      <div class="row"><div style="display:flex;align-items:center;gap:10px"><div class="check" style="width:36px;height:36px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><p class="h2">行程完成</p></div>
        <span class="kicker" id="saveState">${saveStateText(r.id)}</span></div>
      <p class="sub" style="margin-top:-4px">請向乘客收取 <b style="color:var(--ink);font-size:18px">NT$${fmt(r.finalFare)}</b>　今日累計 NT$${fmt(todayStats().sum)} · ${todayStats().count} 趟</p>
      <div style="overflow-y:auto;min-height:0;flex:1 1 auto;margin-inline:-4px;padding-inline:4px">${receiptHTML(r, 'doneMap')}</div>
      <button class="btn" style="background:var(--purple);flex-shrink:0" data-a="next">${ONLINE ? '繼續接單' : '完成'}</button></div>`;
  }
  return '';
}

function updateCountdown() {
  const t = $('cdText'), b = $('cdBar');
  if (t) t.textContent = '剩 ' + S.left + ' 秒';
  if (b) b.style.width = (S.left / SECS * 100) + '%';
}

function myDone() {
  if (!ME) return [];
  const map = {};
  localTrips().forEach(t => { map[t.id] = t; });                    // 手機備份
  RIDES.filter(r => r.driverPhone === ME.phone && r.status === 'done').forEach(r => { map[r.id] = r; });  // 雲端為準
  return Object.values(map);
}
function todayStats() {
  const t0 = BBC.startOfDay();
  const list = myDone().filter(r => (r.doneAt || 0) >= t0);
  return { list, count: list.length, sum: list.reduce((a, r) => a + (r.finalFare || 0), 0) };
}

function earnHTML() {
  const done = myDone();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const start = BBC.startOfDay(Date.now() - i * 86400000), end = start + 86400000;
    const v = done.filter(r => r.doneAt >= start && r.doneAt < end).reduce((a, r) => a + (r.finalFare || 0), 0);
    days.push({ v, label: i === 0 ? '今天' : WEEK[new Date(start).getDay()] });
  }
  const total = days.reduce((a, d) => a + d.v, 0), max = Math.max(1000, ...days.map(d => d.v));
  const week0 = BBC.startOfDay(Date.now() - 6 * 86400000);
  const weekTrips = done.filter(r => r.doneAt >= week0).length;
  const accepted = RIDES.filter(r => r.driverPhone === ME.phone && ['pickup', 'trip', 'done'].includes(r.status) && r.source !== 'driver').length;
  const declined = RIDES.filter(r => (r.declinedBy || []).includes(ME.phone)).length;
  const rate = accepted + declined ? Math.round(accepted / (accepted + declined) * 100) : 100;
  const td = todayStats();
  return `<div><p class="sub">最近 7 天收入</p><div class="fare">NT$${fmt(total)}</div></div>
    <div class="panel" style="padding-top:20px"><div class="chart">${days.map((d, i) => `<div class="bar"><span>${d.v ? fmt(d.v) : ''}</span><i style="height:${Math.max(4, Math.round(d.v / max * 130))}px;background:${RAINBOW[i]}"></i></div>`).join('')}</div>
    <div class="days">${days.map(d => `<span>${d.label}</span>`).join('')}</div></div>
    <div class="stats"><div class="stat"><span class="sub" style="font-size:13px">今日行程</span><b style="color:var(--pink)">${td.count}</b></div>
      <div class="stat"><span class="sub" style="font-size:13px">7 天行程</span><b style="color:var(--blue)">${weekTrips}</b></div>
      <div class="stat"><span class="sub" style="font-size:13px">接單率</span><b style="color:var(--purple)">${rate}%</b></div></div>
    ${historyHTML()}`;
}

function render() {
  const r = CUR;
  $('mapLbl2').textContent = '高雄市';
  showStopPins();
  $('mapLbl1').textContent = r && S.status === 'pickup' ? r.from : r && S.status === 'trip' ? (r.to || '') : '高雄車站';
  $('pill').textContent = 'NT$ ' + fmt(todayStats().sum);
  $('route').hidden = !(S.status === 'pickup' || S.status === 'trip');
  $('home').hidden = S.tab !== 'home';
  $('earn').hidden = S.tab !== 'earn';
  $('points').hidden = S.tab !== 'points';
  $('tab-points').setAttribute('aria-selected', S.tab === 'points');
  $('tab-home').setAttribute('aria-selected', S.tab === 'home');
  $('tab-earn').setAttribute('aria-selected', S.tab === 'earn');
  if (S.tab === 'home') {
    const sheet = $('sheet'), key = S.status + (r ? r.id : '') + S.unread + (S.declining ? 'd' : '');
    if (sheet.dataset.s === key && (S.status === 'request' || S.status === 'trip')) return;  // 倒數與跳表自己更新數字
    sheet.innerHTML = sheetHTML(); sheet.dataset.s = key;
    if (S.status === 'done' && CUR) BBC.drawRoute($('doneMap'), CUR.track, { fallback: BBC.fromCoord(CUR) || BBC.locate(CUR.from || '', CUR.fromArea || '').c });
  } else if (ME && S.tab === 'earn') $('earn').innerHTML = earnHTML();
  else if (ME && S.tab === 'points') $('points').innerHTML = pointsHTML();
}

// ---------- 登入 / 註冊 ----------
const cleanPhone = v => v.replace(/[\s-]/g, '');
function seg(mode) {
  $('seg-reg').setAttribute('aria-selected', mode === 'reg');
  $('seg-login').setAttribute('aria-selected', mode === 'login');
  $('regForm').hidden = mode !== 'reg';
  $('loginForm').hidden = mode !== 'login';
  $('regErr').textContent = ''; $('loginErr').textContent = '';
}
function showAuth(msg) {
  stopCountdown(); stopMeter(); clearInterval(beatT); GEO.rec = false; stopLocate();
  if (unsubR) unsubR(); if (unsubD) unsubD(); if (unsubL) unsubL(); unsubR = unsubD = unsubL = null; LEDGER = [];
  ME = null; CUR = null; ONLINE = false; MSG_SEEN = null; S = { tab: 'home', status: 'offline', left: SECS, unread: 0 };
  $('profile').hidden = true; $('auth').hidden = false;
  seg('login');
  if (msg) $('loginErr').textContent = msg;
  render();
}
const withPhone = d => Object.assign({}, d, { phone: d.phone || d.id });   // 手機號碼就是帳號編號
function enter(d) {
  ME = withPhone(d); local.set('session', d.phone);
  ONLINE = d.status === 'online' || d.status === 'busy';
  S = { tab: 'home', status: ONLINE ? 'searching' : 'offline', left: SECS, unread: 0 };
  $('auth').hidden = true;
  unsubD = db.watch('drivers', (list, meta) => {
    if (!ME) return;
    if (meta && meta.fromCache) return;   // 手機剛連上時會先收到本機暫存（可能是空的），只相信雲端回來的資料
    const me = list.find(x => x.id === ME.phone);
    if (!me) return;   // 名單裡暫時找不到自己時不登出（被刪除的帳號下次登入時會被擋下）
    if (me.active === false) { local.del('session'); return showAuth('帳號已被管理員停用，請聯絡管理員'); }
    ME = withPhone(me);
    onMsgs();
  });
  unsubR = db.watch('rides', onRides);
  unsubL = db.watch('ledger', list => { LEDGER = list; if (S.tab === 'points' || S.status === 'searching') render(); }, ['driverPhone', ME.phone]);
  initMap(); if (ONLINE) startLocate();
  presence(); startHeartbeat(); retryPending(); render();
}

$('regForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('regErr');
  const name = $('reg-name').value.trim();
  const phone = cleanPhone($('reg-phone').value);
  const plate = $('reg-plate').value.trim().toUpperCase().replace(/\s/g, '');
  const brand = $('reg-brand').value, modelSel = $('reg-model').value;
  const model = modelSel === '__other' ? $('reg-other').value.trim() : modelSel;
  const pw = $('reg-pw').value, pw2 = $('reg-pw2').value;
  if (!name) return err.textContent = '請輸入姓名';
  if (!/^09\d{8}$/.test(phone)) return err.textContent = '手機號碼要是 09 開頭的 10 位數字';
  if (!/^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}$/.test(plate)) return err.textContent = '車牌格式例如 ABC-1234，中間要有「-」';
  if (!brand) return err.textContent = '請選擇廠牌';
  if (!model) return err.textContent = modelSel === '__other' ? '請輸入車型' : '請選擇車型';
  if (pw.length < 6) return err.textContent = '密碼至少要 6 碼';
  if (pw !== pw2) return err.textContent = '兩次輸入的密碼不一樣';
  err.textContent = '建立中…';
  try {
    if (await db.get('drivers', phone)) return err.textContent = '這個手機號碼已經註冊過，請改用「登入」';
    const d = {
      name, phone, plate, brand, model, color: $('reg-color').value, seats: $('reg-seats').value,
      fuel: $('reg-fuel').value, service: $('reg-service').value,
      pw: await BBC.hashPw(phone, pw), active: true, status: 'offline', area: AREA, createdAt: Date.now(), lastSeen: Date.now()
    };
    await db.set('drivers', phone, d);
    e.target.reset(); fillModels();
    enter(Object.assign({ id: phone }, d));
  } catch (x) { console.error(x); err.textContent = '連線失敗，請檢查網路後再試一次'; }
});

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('loginErr');
  const phone = cleanPhone($('login-phone').value), pw = $('login-pw').value;
  if (!phone || !pw) return err.textContent = '請輸入手機號碼和密碼';
  err.textContent = '登入中…';
  try {
    const d = await db.get('drivers', phone);
    if (!d) return err.textContent = '找不到這個手機號碼，請先註冊或請管理員建立帳號';
    if (d.pw !== await BBC.hashPw(phone, pw)) return err.textContent = '密碼不正確，請再試一次';
    if (d.active === false) return err.textContent = '帳號已被管理員停用，請聯絡管理員';
    err.textContent = ''; e.target.reset();
    enter(d);
  } catch (x) { console.error(x); err.textContent = '連線失敗，請檢查網路後再試一次'; }
});

// 廠牌 → 車型
$('reg-brand').insertAdjacentHTML('beforeend', Object.keys(CARS).map(b => `<option>${b}</option>`).join(''));
function fillModels() {
  const list = CARS[$('reg-brand').value], sel = $('reg-model');
  if (!list) { sel.innerHTML = '<option value="">請先選擇廠牌</option>'; sel.disabled = true; }
  else {
    sel.innerHTML = (list.length ? '<option value="">請選擇車型</option>' : '') + list.map(m => `<option>${m}</option>`).join('') + '<option value="__other">其他（自行輸入）</option>';
    sel.disabled = false;
  }
  $('reg-other-wrap').hidden = sel.value !== '__other';
}
$('reg-brand').addEventListener('change', fillModels);
$('reg-model').addEventListener('change', () => { $('reg-other-wrap').hidden = $('reg-model').value !== '__other'; });
$('reg-seats').addEventListener('change', () => { if ($('reg-seats').value !== '5 人座') $('reg-service').value = '蹦蹦車大型（6 人以上）'; });
$('reg-fuel').addEventListener('change', () => { if ($('reg-fuel').value === '純電動') $('reg-service').value = '蹦蹦車綠能（電動車）'; });


// ---------- 和管理平台傳訊息（存在司機自己的資料裡：msgs，管理端也看得到） ----------
let VOICE = false, MSG_SEEN = null;
const QUICK = ['已到上車點，乘客還沒出現', '乘客聯絡不上', '路上塞車，會晚一點到', '乘客要更改下車地點', '收到'];
const myMsgs = () => (ME && ME.msgs) || [];
const unreadAdmin = () => myMsgs().filter(m => m.f === 'a' && m.at > ((ME && ME.readD) || 0)).length;
function speak(text) {
  if (!VOICE) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-TW'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (err) {}
}
function renderChat() {
  const box = $('msgs'), list = myMsgs();
  box.innerHTML = list.length
    ? list.map(m => `<div class="msg ${m.f === 'd' ? 'me' : 'them'}">${esc(m.t)}<span class="mt">${BBC.hhmm(m.at)}</span></div>`).join('')
    : '<p class="sub" style="text-align:center;margin:auto 0">還沒有訊息。有狀況可以在這裡通知管理平台，點下方常用語可以快速傳送。</p>';
  box.scrollTop = box.scrollHeight;
}
function markRead() { if (!ME) return; const now = Date.now(); ME.readD = now; db.set('drivers', ME.phone, { readD: now }).catch(() => {}); S.unread = 0; }
function openChat() { $('chatName').textContent = '管理平台'; $('chat').hidden = false; markRead(); renderChat(); render(); }
function closeChat() { $('chat').hidden = true; }
// 司機資料更新時呼叫：有新的管理員訊息就提醒
function onMsgs() {
  const list = myMsgs(), last = list.length ? list[list.length - 1].at : 0;
  if (MSG_SEEN != null) list.filter(m => m.f === 'a' && m.at > MSG_SEEN).forEach(m => { speak('管理平台說：' + m.t); if ($('chat').hidden) toast('管理平台：' + m.t); });
  MSG_SEEN = Math.max(MSG_SEEN || 0, last);
  if (!$('chat').hidden) { if (unreadAdmin()) markRead(); renderChat(); }
  const u = $('chat').hidden ? unreadAdmin() : 0;
  if (u !== S.unread) { S.unread = u; render(); }
}
function sendMsg(text) {
  text = text.trim(); if (!text || !ME) return;
  const m = { f: 'd', t: text.slice(0, 300), at: Date.now() };
  ME.msgs = myMsgs().concat(m).slice(-80); MSG_SEEN = m.at;
  renderChat();
  db.set('drivers', ME.phone, { msgs: ME.msgs, msgAtD: m.at, readD: m.at }).catch(fail);
}
$('quick').innerHTML = QUICK.map(q => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('');
$('chatForm').addEventListener('submit', e => { e.preventDefault(); sendMsg($('chatInput').value); $('chatInput').value = ''; });
if (!('speechSynthesis' in window)) $('voiceBtn').hidden = true;

// ---------- 點擊 ----------
document.addEventListener('click', e => {
  const tr = e.target.closest('[data-trip]'); if (tr) return openTrip(tr.dataset.trip);
  const hf = e.target.closest('[data-hf]'); if (hf) { HF = hf.dataset.hf; return render(); }
  if (e.target.closest('#tdClose') || e.target.id === 'tripDetail') { $('tripDetail').hidden = true; return; }
  const b = e.target.closest('[data-a]'); if (b) return A[b.dataset.a]();
  const q = e.target.closest('[data-q]'); if (q) return sendMsg(q.dataset.q);
  if (e.target.closest('#myLocBtn')) return recenter();
  if (e.target.closest('#tab-home')) { S.tab = 'home'; render(); if (LM) setTimeout(() => LM.invalidateSize(), 50); }
  if (e.target.closest('#tab-earn')) { S.tab = 'earn'; render(); }
  if (e.target.closest('#tab-points')) { S.tab = 'points'; render(); }
  if (e.target.closest('#seg-reg')) seg('reg');
  if (e.target.closest('#seg-login')) seg('login');
  if (e.target.closest('#profileBtn') && ME) {
    $('pfName').textContent = ME.name;
    $('pfPhone').textContent = ME.phone;
    $('pfPlate').textContent = ME.plate || '—';
    $('pfCar').textContent = [ME.brand, ME.model].filter(Boolean).join(' ') || '—';
    $('pfSpec').textContent = [ME.color, ME.seats, ME.fuel].filter(Boolean).join(' · ') || '—';
    $('pfType').textContent = ME.service || '—';
    $('pfMode').textContent = BBC.mode === 'cloud' ? '雲端即時連線' : '示範模式（同一瀏覽器）';
    $('profile').hidden = false;
  }
  if (e.target.closest('#pfClose') || e.target.id === 'profile') $('profile').hidden = true;
  if (e.target.closest('#logout')) {
    if (CUR && ['pickup', 'trip'].includes(S.status)) return toast('行程進行中，請先完成行程再登出');
    ONLINE = false; presence().then(() => { local.del('session'); showAuth(); });
  }
  if (e.target.closest('#chatClose')) { $('chat').hidden = true; render(); }
  if (e.target.closest('#voiceBtn')) {
    VOICE = !VOICE; $('voiceBtn').setAttribute('aria-pressed', VOICE);
    if (VOICE) speak('語音朗讀已開啟'); else try { speechSynthesis.cancel(); } catch (err) {}
  }
});

// ---------- 啟動 ----------
initMap(); updateLocUI();
$('authLogo').innerHTML = LOGO;
$('modeHint').textContent = BBC.mode === 'cloud'
  ? '已連線到雲端：帳號由管理平台統一管理，換手機也能登入。（版本 ' + BBC.VERSION + '）'
  : '示範模式：還沒設定 Firebase，資料只存在這個瀏覽器，只會和「同一個瀏覽器」打開的管理平台連動。（版本 ' + BBC.VERSION + '）';
(async function start() {
  const phone = local.get('session', null);
  if (!phone) return showAuth();
  try {
    const d = await db.get('drivers', phone);
    if (d && d.active !== false) enter(d); else { local.del('session'); showAuth(d ? '帳號已被管理員停用' : ''); }
  } catch (x) { console.error(x); showAuth('連線失敗，請檢查網路後重新整理'); }
})();
})();

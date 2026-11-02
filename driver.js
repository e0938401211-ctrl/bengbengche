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
let AREA = local.get('area', '左營區');
let countT = null, meterT = null, beatT = null, unsubR = null, unsubD = null;
let M = { rideId: null, min: 0, km: 0, lastPush: 0 }, SPEED = 1;

// ---------- 小工具 ----------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
}
const fail = e => { console.error(e); toast('連線失敗，請檢查網路後再試一次'); };
const meterFare = () => BBC.meterAmount(M.km, M.min);
function stopCountdown() { clearInterval(countT); countT = null; }
function stopMeter() { clearInterval(meterT); meterT = null; }

// ---------- 雲端寫入 ----------
function presence(extra) {
  if (!ME) return Promise.resolve();
  const status = !ONLINE ? 'offline' : (CUR && ['pickup', 'trip'].includes(S.status) ? 'busy' : 'online');
  return db.set('drivers', ME.phone, Object.assign({ status, area: AREA, lastSeen: Date.now(), rideId: CUR && status === 'busy' ? CUR.id : '' }, extra || {})).catch(fail);
}
function startHeartbeat() {
  clearInterval(beatT);
  beatT = setInterval(() => { if (ME && ONLINE) presence(); }, HEARTBEAT_MS);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ME && ONLINE) presence(); });

// ---------- 即時接收行程 ----------
function onRides(list) {
  RIDES = list;
  if (!ME) return;
  const mine = list
    .filter(r => r.driverPhone === ME.phone && ['assigned', 'pickup', 'trip'].includes(r.status))
    .sort((a, b) => (b.assignedAt || b.createdAt || 0) - (a.assignedAt || a.createdAt || 0));
  const r = mine[0] || null;

  if (CUR && (!r || r.id !== CUR.id) && S.status !== 'done') {
    const old = list.find(x => x.id === CUR.id);
    if (old && old.status === 'cancelled') toast('管理員已取消行程 ' + CUR.id);
    else if (old && old.status === 'done') { /* 已完成 */ }
    else toast('行程 ' + CUR.id + ' 已改派給其他司機');
    CUR = null; stopCountdown(); stopMeter(); closeChat();
    S.status = ONLINE ? 'searching' : 'offline';
    presence();
  }
  if (r && S.status !== 'done') {
    CUR = r;
    if (r.status === 'assigned' && S.status !== 'request') startRequest();
    else if (r.status === 'pickup') S.status = 'pickup';
    else if (r.status === 'trip') { S.status = 'trip'; if (!meterT) startMeter(); }
    if (r.status !== 'assigned') stopCountdown();
  }
  render();
}

function startRequest() {
  ONLINE = true;
  S.status = 'request'; S.left = SECS;
  stopCountdown();
  countT = setInterval(() => {
    S.left -= 1;
    if (S.left <= 0) { A.decline(); toast('超過時間未接單，已退回給管理平台'); }
    else updateCountdown();
  }, 1000);
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
  speak('新的派單，' + (CUR ? CUR.from : ''));
}

// ---------- 跳表 ----------
function startMeter() {
  stopMeter();
  if (!CUR) return;
  if (M.rideId !== CUR.id) M = { rideId: CUR.id, min: CUR.startedAt ? (Date.now() - CUR.startedAt) / 60000 : 0, km: 0, lastPush: 0 };
  const tick = () => {
    if (!CUR) return stopMeter();
    M.min += SPEED / 60;
    const est = CUR.km || 3, mins = CUR.mins || 10;
    M.km = Math.min(est, est * M.min / mins);       // 沒有 GPS：里程依預估距離隨時間累加
    const f = $('mFare');
    if (f) {
      f.textContent = fmt(meterFare());
      $('mKm').textContent = M.km.toFixed(1);
      $('mMin').textContent = Math.floor(M.min);
      $('mStat').textContent = M.min >= mins ? '已到預估時間' : '剩約 ' + Math.max(1, Math.ceil(mins - M.min)) + ' 分鐘';
    }
    if (Date.now() - M.lastPush > 5000) {           // 每 5 秒回報一次跳表金額給管理平台
      M.lastPush = Date.now();
      db.set('rides', CUR.id, { meterFare: meterFare(), meterKm: Math.round(M.km * 10) / 10, meterMin: Math.floor(M.min) }).catch(() => {});
    }
  };
  tick();
  meterT = setInterval(tick, 1000);
}

// ---------- 動作 ----------
const A = {
  online() { ONLINE = true; S.status = 'searching'; presence(); render(); },
  offline() { ONLINE = false; S.status = 'offline'; presence(); render(); },
  accept() {
    if (!CUR) return;
    stopCountdown();
    S.status = 'pickup'; S.unread = 0; CHAT = [];
    db.set('rides', CUR.id, { status: 'pickup', acceptedAt: Date.now() }).then(() => presence()).catch(fail);
    render();
  },
  decline() {
    if (!CUR) return;
    stopCountdown();
    const r = CUR;
    CUR = null; S.status = ONLINE ? 'searching' : 'offline';
    db.set('rides', r.id, { status: 'pending', driverPhone: '', driverName: '', plate: '', declinedBy: (r.declinedBy || []).concat(ME.phone) })
      .then(() => presence()).catch(fail);
    render();
  },
  arrive() {
    if (!CUR) return;
    const now = Date.now();
    CUR.startedAt = now; M = { rideId: CUR.id, min: 0, km: 0, lastPush: 0 };
    S.status = 'trip';
    db.set('rides', CUR.id, { status: 'trip', startedAt: now, meterFare: BBC.RATE.base }).catch(fail);
    startMeter(); render();
  },
  complete() {
    if (!CUR) return;
    stopMeter(); closeChat();
    const fare = BBC.finalFare(M.km, M.min);
    CUR.finalFare = fare;
    S.status = 'done';
    db.set('rides', CUR.id, { status: 'done', finalFare: fare, meterFare: meterAmount(), finalKm: Math.round(M.km * 10) / 10, finalMin: Math.round(M.min), doneAt: Date.now() })
      .then(() => presence({ status: ONLINE ? 'online' : 'offline', rideId: '' })).catch(fail);
    render();
  },
  next() { CUR = null; S.status = ONLINE ? 'searching' : 'offline'; presence(); onRides(RIDES); },
  chat() { openChat(); },
  speed() { SPEED = SPEED === 1 ? 20 : 1; toast(SPEED === 1 ? '跳表恢復正常速度' : '示範快轉：跳表速度 ×20'); render(); }
};
const meterAmount = () => meterFare();

// ---------- 畫面 ----------
function badge() { return S.unread ? `<span class="badge">${S.unread}</span>` : ''; }

function sheetHTML() {
  const r = CUR || {};
  switch (S.status) {
    case 'offline': return `<div class="offline-wrap"><button class="online" data-a="online">上線</button>
      <div class="card center">${LOGO}<p class="h2">${ME ? esc(ME.name) + '，' : ''}您目前離線</p><p class="sub">按「上線」開始接收管理平台的派單</p></div></div>`;
    case 'searching': return `<div class="card searching"><div class="track"><div class="fill"></div></div>
      <div class="row"><div><p class="h2">上線中，等待派單…</p><p class="sub">管理平台派單後會立即顯示在這裡</p></div><button class="outline" data-a="offline">下線</button></div></div>`;
    case 'request': return `<div class="req"><div class="row"><div class="chip">管理平台派單 · ${esc(r.id)}</div><div class="dim" id="cdText">剩 ${S.left} 秒</div></div>
      <div class="track" style="background:#2D3833"><div class="fill" id="cdBar" style="width:${S.left / SECS * 100}%;background:var(--yellow);transition:width 1s linear"></div></div>
      <div style="display:flex;align-items:baseline;gap:10px"><div class="fare">NT$${fmt(r.estFare)}</div><div class="dim">預估車資（跳表計費）</div></div>
      <div class="dim" style="font-size:14px">${esc(r.riderName || '乘客')}${r.riderPhone ? ' · ' + esc(r.riderPhone) : ''} · 約 ${esc(r.km)} 公里 / ${esc(r.mins)} 分鐘</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="stop"><div class="dot" style="background:#fff;border-radius:50%"></div><div>${esc(r.fromArea)} ${esc(r.from)}</div></div>
        <div class="stop"><div class="dot" style="background:var(--yellow)"></div><div>${esc(r.toArea)} ${esc(r.to)}</div></div>
      </div>
      ${r.note ? `<div class="dim" style="font-size:14px;background:#2D3833;padding:8px 12px;border-radius:10px">備註：${esc(r.note)}</div>` : ''}
      <div style="display:flex;gap:10px"><button class="decline" data-a="decline" aria-label="拒絕">${ICON_X}</button>
      <button class="btn" style="background:var(--blue)" data-a="accept">接受</button></div></div>`;
    case 'pickup': return `<div class="card"><div class="kicker">前往上車地點 · ${esc(r.id)}</div><p class="h2">${esc(r.fromArea)} ${esc(r.from)}</p>
      ${r.note ? `<p class="sub">備註：${esc(r.note)}</p>` : ''}
      <div style="display:flex;align-items:center;gap:12px"><div class="avatar">${esc((r.riderName || '乘')[0])}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:500">${esc(r.riderName || '乘客')}</div><div class="sub" style="font-size:13px">${esc(r.riderPhone || '未留電話')}</div></div>
        <button class="round flat" data-a="chat" aria-label="傳訊息給乘客" style="position:relative"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#121A17" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>${badge()}</button>
      </div><button class="btn" style="background:var(--pink)" data-a="arrive">乘客已上車，開始跳表</button></div>`;
    case 'trip': {
      const mins = r.mins || 10;
      return `<div class="card"><div class="row"><div class="kicker">行程中 · ${esc(r.id)}</div><div class="kicker" id="mStat">${M.min >= mins ? '已到預估時間' : '剩約 ' + Math.max(1, Math.ceil(mins - M.min)) + ' 分鐘'}</div></div>
      <p class="h2">${esc(r.toArea)} ${esc(r.to)}</p>
      <div class="meter" role="status" aria-label="跳表">
        <div class="meter-top"><span>蹦蹦車跳表</span><span class="live">計費中</span></div>
        <div class="meter-fare">NT$<span id="mFare">${fmt(meterFare())}</span></div>
        <div class="meter-sub"><span id="mKm">${M.km.toFixed(1)}</span> 公里 · <span id="mMin">${Math.floor(M.min)}</span> 分鐘</div>
        <div class="meter-rate">起跳 50 · 每公里 20 · 每分鐘 2 · 最低 100</div>
      </div>
      <div class="row"><p class="sub">乘客：${esc(r.riderName || '乘客')}</p>
        <div style="display:flex;gap:8px"><button class="outline" data-a="speed" style="font-size:13px;padding:0 12px">${SPEED === 1 ? '示範快轉' : '正常速度'}</button>
        <button class="outline" data-a="chat" style="position:relative">傳訊息${badge()}</button></div></div>
      <button class="btn" style="background:var(--ink)" data-a="complete">完成行程</button></div>`;
    }
    case 'done': return `<div class="card center" style="gap:8px"><div class="check"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <p class="sub">本趟車資（請向乘客收費）</p><div class="fare">NT$${fmt(r.finalFare)}</div><p class="sub">今日累計 NT$${fmt(todayStats().sum)} · ${todayStats().count} 趟</p>
      <button class="btn" style="background:var(--purple);margin-top:8px" data-a="next">${ONLINE ? '繼續接單' : '完成'}</button></div>`;
  }
  return '';
}

function updateCountdown() {
  const t = $('cdText'), b = $('cdBar');
  if (t) t.textContent = '剩 ' + S.left + ' 秒';
  if (b) b.style.width = (S.left / SECS * 100) + '%';
}

function myDone() { return ME ? RIDES.filter(r => r.driverPhone === ME.phone && r.status === 'done') : []; }
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
    <div class="panel" style="padding-block:6px">
      ${td.list.length ? td.list.sort((a, b) => b.doneAt - a.doneAt).map(r => `<div class="line"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${BBC.hhmm(r.doneAt)} ${esc(r.from)} → ${esc(r.to)}</span><b>NT$${fmt(r.finalFare)}</b></div>`).join('')
        : '<div class="line"><span class="sub">今天還沒有完成的行程</span></div>'}
    </div>`;
}

function render() {
  if (S.status !== 'pickup' && S.status !== 'trip') $('chat').hidden = true;
  const r = CUR, a = KHH.find(x => x.d === AREA);
  $('locText').textContent = '高雄市 ' + AREA;
  $('mapLbl2').textContent = '高雄市' + AREA;
  $('mapLbl1').textContent = r && S.status === 'pickup' ? r.from : r && S.status === 'trip' ? r.to : (a ? a.p[0][0] : '');
  $('pill').textContent = 'NT$ ' + fmt(todayStats().sum);
  $('route').hidden = !(S.status === 'pickup' || S.status === 'trip');
  $('home').hidden = S.tab !== 'home';
  $('earn').hidden = S.tab !== 'earn';
  $('tab-home').setAttribute('aria-selected', S.tab === 'home');
  $('tab-earn').setAttribute('aria-selected', S.tab === 'earn');
  if (S.tab === 'home') {
    const sheet = $('sheet'), key = S.status + (r ? r.id : '') + S.unread + SPEED;
    if (sheet.dataset.s === key && (S.status === 'request' || S.status === 'trip')) return;  // 倒數與跳表自己更新數字
    sheet.innerHTML = sheetHTML(); sheet.dataset.s = key;
  } else if (ME) $('earn').innerHTML = earnHTML();
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
  stopCountdown(); stopMeter(); clearInterval(beatT);
  if (unsubR) unsubR(); if (unsubD) unsubD(); unsubR = unsubD = null;
  ME = null; CUR = null; ONLINE = false; S = { tab: 'home', status: 'offline', left: SECS, unread: 0 };
  $('profile').hidden = true; $('auth').hidden = false;
  seg('login');
  if (msg) $('loginErr').textContent = msg;
  render();
}
function enter(d) {
  ME = d; local.set('session', d.phone);
  ONLINE = d.status === 'online' || d.status === 'busy';
  S = { tab: 'home', status: ONLINE ? 'searching' : 'offline', left: SECS, unread: 0 };
  $('auth').hidden = true;
  unsubD = db.watch('drivers', list => {
    if (!ME) return;
    const me = list.find(x => x.id === ME.phone);
    if (!me) return showAuth('這個帳號已被管理員刪除');
    if (me.active === false) { local.del('session'); return showAuth('帳號已被管理員停用，請聯絡管理員'); }
    ME = me;
  });
  unsubR = db.watch('rides', onRides);
  presence(); startHeartbeat(); render();
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

// ---------- 區域 ----------
$('areaGrid').innerHTML = KHH.map(a => `<button data-area="${a.d}">${a.d}</button>`).join('');

// ---------- 和乘客聊天（示範：乘客自動回覆） ----------
let CHAT = [], VOICE = false, riderT = null;
const QUICK = ['我到了，在路邊等您', '大約 3 分鐘到', '請問您穿什麼顏色的衣服？', '路上有點塞車，請稍等', '好的，收到'];
function riderReply(t) {
  if (/到了|路邊/.test(t)) return '好，我馬上出來！';
  if (/顏色|衣服/.test(t)) return '我穿藍色外套，站在便利商店前面';
  if (/塞車/.test(t)) return '沒關係，謝謝告知';
  if (/分鐘|稍等/.test(t)) return '好的，不急，慢慢來';
  if (/收到|好的/.test(t)) return '謝謝司機';
  return '好的，謝謝';
}
function speak(text) {
  if (!VOICE) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-TW'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (err) {}
}
function renderChat() {
  const box = $('msgs');
  box.innerHTML = CHAT.length
    ? CHAT.map(m => `<div class="msg ${m.me ? 'me' : 'them'}">${esc(m.text)}</div>`).join('')
    : '<p class="sub" style="text-align:center;margin:auto 0">還沒有訊息。點下方的常用語可以快速傳送。</p>';
  box.scrollTop = box.scrollHeight;
}
function openChat() { S.unread = 0; $('chatName').textContent = (CUR && CUR.riderName) || '乘客'; $('chat').hidden = false; renderChat(); render(); }
function closeChat() { $('chat').hidden = true; clearTimeout(riderT); }
function riderSay(text) {
  if (S.status !== 'pickup' && S.status !== 'trip') return;
  CHAT.push({ me: false, text });
  if ($('chat').hidden) { S.unread += 1; render(); } else renderChat();
  speak(((CUR && CUR.riderName) || '乘客') + '說：' + text);
}
function sendMsg(text) {
  text = text.trim(); if (!text) return;
  CHAT.push({ me: true, text }); renderChat();
  clearTimeout(riderT); riderT = setTimeout(() => riderSay(riderReply(text)), 1500);
}
$('quick').innerHTML = QUICK.map(q => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('');
$('chatForm').addEventListener('submit', e => { e.preventDefault(); sendMsg($('chatInput').value); $('chatInput').value = ''; });
if (!('speechSynthesis' in window)) $('voiceBtn').hidden = true;

// ---------- 點擊 ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (b) return A[b.dataset.a]();
  const q = e.target.closest('[data-q]'); if (q) return sendMsg(q.dataset.q);
  const ar = e.target.closest('[data-area]');
  if (ar) { AREA = ar.dataset.area; local.set('area', AREA); $('areaPick').hidden = true; presence(); return render(); }
  if (e.target.closest('#tab-home')) { S.tab = 'home'; render(); }
  if (e.target.closest('#tab-earn')) { S.tab = 'earn'; render(); }
  if (e.target.closest('#seg-reg')) seg('reg');
  if (e.target.closest('#seg-login')) seg('login');
  if (e.target.closest('#locBtn')) {
    document.querySelectorAll('#areaGrid button').forEach(x => x.setAttribute('aria-pressed', x.dataset.area === AREA));
    $('areaPick').hidden = false;
  }
  if (e.target.closest('#areaClose') || e.target.id === 'areaPick') $('areaPick').hidden = true;
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
$('authLogo').innerHTML = LOGO;
$('modeHint').textContent = BBC.mode === 'cloud'
  ? '已連線到雲端：帳號由管理平台統一管理，換手機也能登入。'
  : '示範模式：還沒設定 Firebase，資料只存在這個瀏覽器，只會和「同一個瀏覽器」打開的管理平台連動。';
(async function start() {
  const phone = local.get('session', null);
  if (!phone) return showAuth();
  try {
    const d = await db.get('drivers', phone);
    if (d && d.active !== false) enter(d); else { local.del('session'); showAuth(d ? '帳號已被管理員停用' : ''); }
  } catch (x) { console.error(x); showAuth('連線失敗，請檢查網路後重新整理'); }
})();
})();

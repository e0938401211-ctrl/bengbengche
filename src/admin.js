// 蹦蹦車 管理平台：手動派單、行程即時看板、司機動態與帳號管理
(function () {
'use strict';
const { db, esc, fmt, KHH, ALL_SPOTS, STATUS_TEXT, DRIVER_TEXT } = BBC;
const $ = id => document.getElementById(id);
const DEFAULT_ADMIN = { user: 'admin', pw: '123456' };
const ACTIVE = ['pending', 'offering', 'assigned', 'pickup', 'trip'];

let PENDING_SEEN = null, RIDES_ST = null, RIDES_SEEN = null, MSG_SEEN_A = {}, MSG_OPEN = null, MSG_RIDE = '';
let ADMIN = null, RIDES = [], DRIVERS = [], JUNK = [], LEDGER = [], SETTINGS = { commissionRate: BBC.DEFAULT_RATE, dispatchMin: BBC.DEFAULT_DISPATCH_MIN, dispatchKm: 0 };
let feeTouched = false, ledgerFilter = '';
let rideFilter = 'active', driverFilter = 'all';
let unsub = [];

const session = {
  get() { try { return localStorage.getItem('bbc_admin_session'); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem('bbc_admin_session', v); } catch (e) {} },
  del() { try { localStorage.removeItem('bbc_admin_session'); } catch (e) {} }
};
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
const fail = e => { console.error(e); toast('失敗：' + ((e && (e.code || e.message)) || '請檢查網路後再試一次')); };
BBC.onError = err => { if (err.code === 'permission-denied') { const b = document.getElementById('rulesBanner'); if (b) b.hidden = false; } toast('雲端資料庫拒絕存取：' + (err.code || err.message) + '（請檢查 Firestore 規則）'); };

// ---------- 登入 ----------
async function ensureDefaultAdmin() {
  const a = await db.get('admins', DEFAULT_ADMIN.user);
  if (!a) await db.set('admins', DEFAULT_ADMIN.user, { name: '總管理員', pw: await BBC.hashPw(DEFAULT_ADMIN.user, DEFAULT_ADMIN.pw), isDefaultPw: true, createdAt: Date.now() });
}
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('loginErr'), user = $('l-user').value.trim(), pw = $('l-pw').value;
  if (!user || !pw) return err.textContent = '請輸入帳號和密碼';
  err.textContent = '登入中…';
  try {
    await ensureDefaultAdmin();
    const a = await db.get('admins', user);
    if (!a || a.pw !== await BBC.hashPw(user, pw)) return err.textContent = '帳號或密碼不正確';
    err.textContent = ''; $('l-pw').value = '';
    session.set(user); enter(a);
  } catch (x) { console.error(x); err.textContent = '連線失敗：' + (x.code || x.message || '請檢查網路'); }
});
function showLogin() {
  unsub.forEach(f => f()); unsub = [];
  ADMIN = null;
  $('appView').hidden = true; $('loginView').hidden = false;
  $('loginHint').textContent = '第一次使用：帳號 admin，密碼 123456。登入後請立刻修改密碼。';
}
function enter(a) {
  ADMIN = a;
  $('loginView').hidden = true; $('appView').hidden = false;
  $('whoText').textContent = a.name || a.id;
  $('defaultPwBanner').hidden = !a.isDefaultPw;
  let dismissed = false; try { dismissed = sessionStorage.getItem('bbc_hide_localBanner') === '1'; } catch (e) {}
  $('localBanner').hidden = BBC.mode === 'cloud' || dismissed;
  // 舊行程的英文地址換成中文（每次開管理平台最多處理 10 筆）
  setTimeout(() => {
    RIDES.filter(r => (BBC.hasLatin(r.from) && r.fromLat != null) || (BBC.hasLatin(r.to) && r.toLat != null)).slice(0, 10).forEach(async r => {
      const up = {};
      for (const k of ['from', 'to']) { const v = r[k], lat = r[k + 'Lat'], lng = r[k + 'Lng']; if (BBC.hasLatin(v) && lat != null) { const x = { label: v, sub: '', lat, lng }; if (await BBC.zhFix(x) && !BBC.hasLatin(x.label)) up[k] = x.label; } }
      if (Object.keys(up).length) db.set('rides', r.id, up).catch(() => {});
    });
  }, 4000);
  unsub.push(db.watch('rides', l => {
    // 司機拒絕時跳通知
    if (RIDES_SEEN) l.forEach(r => { const n = (r.declines || []).length, o = RIDES_SEEN[r.id]; if (o != null && n > o && r.status !== 'offering') { const x = r.declines[n - 1]; toast(`${x.name} 沒接行程 ${r.id}（${x.reason}），` + (r.status === 'assigned' ? `已自動改派給 ${r.driverName}` : '沒有其他可派的司機，已回到待派單')); } });
    if (RIDES_ST) l.forEach(r => { const o = RIDES_ST[r.id]; if (o === 'offering' && r.status === 'pickup' && r.grabbed) toast(`🏁 ${r.driverName} 選 ${r.promisedMin} 分鐘最快，接下行程 ${r.id}（${(r.bids || []).map(b => b.name + ' ' + b.min + ' 分').join('、')}）`); });
    RIDES_ST = {}; l.forEach(r => { RIDES_ST[r.id] = r.status; });
    RIDES_SEEN = {}; l.forEach(r => { RIDES_SEEN[r.id] = (r.declines || []).length; });
    RIDES = l; renderAll();
  }));
  unsub.push(db.watch('drivers', l => {
    JUNK = l.filter(d => !BBC.isRealDriver(d)); DRIVERS = l.filter(BBC.isRealDriver);
    // 新司機自己註冊：跳通知請管理員核准
    DRIVERS.filter(d => d.approved === false).forEach(d => { if (PENDING_SEEN && !PENDING_SEEN.has(d.id)) toast(`🆕 新司機 ${d.name}（${d.id}）申請註冊，請到「司機」核准`); });
    PENDING_SEEN = new Set(DRIVERS.filter(d => d.approved === false).map(d => d.id));
    // 司機傳來新訊息：跳通知
    DRIVERS.forEach(d => { const at = d.msgAtD || 0, o = MSG_SEEN_A[d.id]; if (o != null && at > o && MSG_OPEN !== d.id) { const m = (d.msgs || []).filter(x => x.f === 'd').pop(); if (m) toast(`💬 ${d.name}${m.r ? '（行程 ' + m.r + '）' : ''}：${m.t}`); } MSG_SEEN_A[d.id] = at; });
    renderAll(); if (MSG_OPEN) renderMsgDialog();
  }));
  setTimeout(() => { loadRoads($('d-from-area').value); loadRoads($('d-to-area').value); }, 800);   // 先在背景載好預設區的道路
  unsub.push(db.watch('ledger', l => { LEDGER = l; $('rulesBanner').hidden = true; renderWallet(); }));
  unsub.push(db.watch('settings', l => { const m = l.find(x => x.id === 'main'); if (m) SETTINGS = Object.assign({ commissionRate: BBC.DEFAULT_RATE, dispatchMin: BBC.DEFAULT_DISPATCH_MIN }, m, { commissionRate: m.commissionRate != null ? m.commissionRate : BBC.DEFAULT_RATE, dispatchMin: m.dispatchMin > 0 ? m.dispatchMin : BBC.DEFAULT_DISPATCH_MIN, dispatchKm: m.dispatchKm > 0 ? m.dispatchKm : 0 }); applyFeeDefault(); renderWallet(); updateEstimate(); renderRides(); }));
  unsub.push(db.watch('admins', l => { const me = l.find(x => x.id === ADMIN.id); if (me) { ADMIN = me; $('defaultPwBanner').hidden = !me.isDefaultPw; } }));
  renderAll();
}

// ---------- 計算 ----------
const state = d => BBC.driverState(d);
const todayStart = () => BBC.startOfDay();
function available(excludePhones) {
  return DRIVERS.filter(d => state(d) === 'online' && !(excludePhones || []).includes(d.phone || d.id));
}
// feeNow：這張單的每百元回金點數；needFor：依預估車資（沒有就用最低車資）算出接單需要的點數
const feeNow = () => { const v = parseInt($('d-fee').value, 10); return v >= 0 ? v : (SETTINGS.commissionRate || 0); };
const needFor = (rate, estFare) => BBC.commissionOf(estFare || BBC.RATE.min, rate);
const enoughPoints = (d, need) => (d.balance || 0) >= (need || 0);
const curNeed = () => { const e = currentEstimate(); return needFor(feeNow(), e && e.estFare); };
// 司機的 GPS 位置 5 分鐘內有更新才算數
const freshLoc = d => d.lat != null && d.lng != null && Date.now() - (d.locAt || 0) < 5 * 60000;
const driverKm = (d, p) => freshLoc(d) ? BBC.distKm([d.lat, d.lng], p) : null;
// 派單範圍：司機開到上車點的大約分鐘數要在設定內（預設 15 分鐘）；沒有 GPS 位置的司機無法判斷，不派
const limitMin = () => SETTINGS.dispatchMin || BBC.DEFAULT_DISPATCH_MIN;
const driverEta = (d, p) => { const km = p ? driverKm(d, p) : null; return km == null ? null : BBC.etaMin(km); };
const grabKm = () => limitKm() || BBC.GRAB_KM;   // 搶單範圍：有設公里就用設定，沒設用 5 公里
const limitKm = () => SETTINGS.dispatchKm > 0 ? SETTINGS.dispatchKm : 0;   // 0 = 不限公里
const rangeLabel = () => limitMin() + ' 分鐘' + (limitKm() ? '、' + limitKm() + ' 公里' : '') + '車程內';
const driverRoadKm = (d, p) => { const km = p ? driverKm(d, p) : null; return km == null ? null : BBC.roadKm(km); };
const inRange = (d, p) => !rangeText(d, p) && driverEta(d, p) != null;
function rangeText(d, p) {
  const m = driverEta(d, p);
  if (m == null) return freshLoc(d) ? '' : '未定位，無法判斷距離';
  if (m > limitMin()) return '約 ' + m + ' 分鐘，超過 ' + limitMin() + ' 分鐘';
  const rk = driverRoadKm(d, p);
  if (limitKm() && rk > limitKm()) return '約 ' + rk + ' 公里，超過 ' + limitKm() + ' 公里';
  return '';
}
function nearestDriver(fromText, fromArea, exclude, feeArg, coords) {
  const p = coords || BBC.locate(fromText, fromArea).c;
  const fee = feeArg != null ? feeArg : curNeed();
  const list = available(exclude).filter(d => enoughPoints(d, fee) && inRange(d, p)).map(d => ({ d, km: driverKm(d, p) })).sort((a, b) => a.km - b.km);
  return list[0] ? list[0].d : null;
}
function driverOptions(sel, exclude, withAuto, fromText, fromArea, coords, needArg) {
  const need = needArg != null ? needArg : curNeed();
  const list = available(exclude);
  const p = coords || (fromText ? BBC.locate(fromText, fromArea).c : null);
  const rows = list.map(d => ({ d, km: p ? driverKm(d, p) : null })).sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));
  let html = withAuto ? `<option value="__auto">自動派給最近的司機（${rangeLabel()}）</option><option value="__grab">搶單：同時通知 ${grabKm()} 公里內的司機，選最少分鐘的人接</option><option value="">稍後指派（先放到待派單）</option>` : '<option value="">選擇司機…</option>';
  html += rows.length
    ? rows.map(({ d, km }) => { const far = p ? rangeText(d, p) : ''; return `<option value="${esc(d.id)}"${sel === d.id && !far ? ' selected' : ''}${far ? ' disabled' : ''}>${esc(d.name)} · ${esc(d.plate || '')}${km != null ? ' · 距上車點約 ' + BBC.roadKm(km) + ' 公里車程、' + BBC.etaMin(km) + ' 分鐘' : ''}${far && km == null ? ' · ' + far : ''}${far && km != null ? '（超出派單範圍，不能派）' : ''} · ${fmt(d.balance || 0)} 點${enoughPoints(d, need) ? '' : '（點數不足）'}</option>`; }).join('')
    : '<option value="" disabled>目前沒有線上空車的司機</option>';
  return html;
}

// ---------- 派單 ----------
// 全台灣：先選縣市，再選行政區（高雄的區值為「左營區」，其他縣市為「臺北市大安區」）
function fillAreas(k, city) {
  const c = BBC.TW.find(x => x.c === city);
  const list = city === '高雄市' ? KHH.map(a => a.d).concat(c ? c.d.filter(d => !KHH.some(a => a.d === d)) : []) : (c ? c.d : []);
  $('d-' + k + '-area').innerHTML = list.map(d => `<option value="${esc(BBC.makeArea(city, d))}">${esc(d)}</option>`).join('');
}
function setAreaSel(k, area) {
  if (!area) return;
  const city = BBC.cityOf(area);
  if ($('d-' + k + '-city').value !== city) { $('d-' + k + '-city').value = city; fillAreas(k, city); }
  $('d-' + k + '-area').value = area;
}
['from', 'to'].forEach(k => {
  $('d-' + k + '-city').innerHTML = BBC.TW.map(c => `<option>${esc(c.c)}</option>`).join('');
  $('d-' + k + '-city').value = '高雄市'; fillAreas(k, '高雄市'); $('d-' + k + '-area').value = '三民區';
  $('d-' + k + '-city').addEventListener('change', () => {
    fillAreas(k, $('d-' + k + '-city').value);
    $('d-' + k + '-area').dispatchEvent(new Event('change'));
    if (DPM && !PICK.from && !PICK.to) BBC.areaCenterAsync($('d-' + k + '-area').value).then(c => DPM && DPM.setView(c, 12));
  });
});
// ---------- 精準地址：邊打邊搜尋真實地點，地圖上可拖曳大頭針微調 ----------
const PICK = { from: null, to: null };      // { lat, lng, area }
const SUG = { from: [], to: [] };
let SUG_SEQ = { from: 0, to: 0 }, SUG_T = {}, SUG_AB = {};
let DPM = null, DPM_PIN = {}, MAP_TARGET = 'from';
const pickCoord = k => PICK[k] ? [PICK[k].lat, PICK[k].lng] : null;
// 下拉清單分三段：這一區的常用地標、這一區的道路、地址搜尋結果
const ROADS = {}, ROAD_STATE = {};       // ROADS[區] = 道路清單；ROAD_STATE[區] = 'loading' | 'error'
const ROADPICK = { from: null, to: null }; // 選了路名後，接著打門牌時先用這條路的位置
const ROAD_T0 = {};
function loadRoads(area, force) {
  if (!area || (ROADS[area] && !force) || ROAD_STATE[area] === 'loading') return;
  ROAD_STATE[area] = 'loading'; ROAD_T0[area] = Date.now();
  BBC.districtRoads(area, { force }).then(list => { ROADS[area] = list; ROAD_STATE[area] = ''; })
    .catch(e => { console.error('roads', area, e); ROAD_STATE[area] = 'error'; })
    // 載完後，只要清單還開著就馬上更新（不必再點一次）
    .then(() => ['from', 'to'].forEach(k => { if ($('d-' + k + '-area').value === area && !$('sug-' + k).hidden) buildSug(k, true); }));
}
// 載入中時，每秒更新「已等幾秒」
setInterval(() => ['from', 'to'].forEach(k => {
  const a = $('d-' + k + '-area').value, el = $('sug-' + k).querySelector('.roadwait');
  if (el && ROAD_STATE[a] === 'loading') el.textContent = Math.round((Date.now() - ROAD_T0[a]) / 1000) + ' 秒';
}), 1000);
function buildSug(k, keepRemote) {
  const q = $('d-' + k).value.trim(), area = $('d-' + k + '-area').value;
  const marks = ALL_SPOTS.filter(s => s.d === area && (!q || s.n.includes(q) || q.includes(s.n)))
    .map(s => ({ label: s.n, sub: '高雄市' + s.d + ' · 常用地標', lat: s.c[0], lng: s.c[1], area: s.d, kind: 'mark' }));
  const otherMarks = q ? ALL_SPOTS.filter(s => s.d !== area && (s.n.includes(q) || q.includes(s.n))).slice(0, 3)
    .map(s => ({ label: s.n, sub: '高雄市' + s.d + ' · 常用地標', lat: s.c[0], lng: s.c[1], area: s.d, kind: 'mark' })) : [];
  const all = ROADS[area] || [];
  const roads = all.filter(r => !q || r.name.includes(q) || q.startsWith(r.name)).slice(0, q ? 40 : 300)
    .map(r => ({ label: r.name, sub: BBC.fullArea(area) + ' · 道路（選了可以接著打門牌）', lat: r.lat, lng: r.lng, area, kind: 'road' }));
  const remote = keepRemote ? (SUG[k] || []).filter(x => x.kind === 'remote') : [];
  SUG[k] = marks.concat(roads, otherMarks, remote);
  const box = $('sug-' + k);
  const sec = (title, from, to) => from < to ? `<div class="sec">${title}</div>` + SUG[k].slice(from, to).map((x, i) => `<button type="button" role="option" data-sug="${k}:${from + i}"><b>${esc(x.label)}</b><span>${esc(x.sub || '')}</span></button>`).join('') : '';
  const n1 = marks.length, n2 = n1 + roads.length, n3 = n2 + otherMarks.length;
  const roadMsg = ROAD_STATE[area] === 'loading' ? `<div class="msg">正在載入${area}的道路…已等 <span class="roadwait">${Math.round((Date.now() - (ROAD_T0[area] || Date.now())) / 1000)} 秒</span>。第一次可能要等 10–30 秒，載好會存起來，之後馬上出現。也可以直接打路名搜尋。</div>`
    : ROAD_STATE[area] === 'error' ? `<div class="msg">${area}的道路清單暫時載入不到（地圖資料服務忙線）。可以直接打路名搜尋，或 <button type="button" class="linkbtn" data-reloadroads="${area}">重新載入</button></div>` : '';
  box.innerHTML = (area ? '' : '<div class="msg">先選右邊的行政區，就會列出那一區的道路</div>')
    + sec(area + ' 常用地標', 0, n1)
    + sec(area + ' 道路' + (all.length ? `（共 ${all.length} 條${q ? '，符合 ' + roads.length + ' 條' : ''}）` : ''), n1, n2) + roadMsg
    + sec('其他區的地標', n2, n3)
    + sec('地址搜尋結果', n3, SUG[k].length)
    + (SUG_MSG[k] ? `<div class="msg">${SUG_MSG[k]}</div>` : '')
    + '<div class="msg">找不到？按下方「在地圖上選」直接點位置</div>';
  box.hidden = false; $('d-' + k).setAttribute('aria-expanded', 'true');
}
const SUG_MSG = { from: '', to: '' }, SKIP_FOCUS = { from: false, to: false };
async function searchSug(k) {
  const q = $('d-' + k).value.trim(), area = $('d-' + k + '-area').value, my = ++SUG_SEQ[k];
  loadRoads(area);
  SUG_MSG[k] = q.length >= 2 ? '搜尋地址中…' : '';
  buildSug(k, false);
  if (q.length < 2) return;
  if (SUG_AB[k]) SUG_AB[k].abort();
  SUG_AB[k] = new AbortController();
  try {
    const remote = await BBC.geoSearch(q, area, SUG_AB[k].signal);
    if (my !== SUG_SEQ[k]) return;
    const have = new Set(SUG[k].map(x => x.label));
    const extra = remote.filter(x => !have.has(x.label)).slice(0, 8).map(x => Object.assign(x, { kind: 'remote' }));
    SUG_MSG[k] = remote.length ? '' : '地址資料庫找不到這個門牌，可以先選上面的道路，再拖地圖上的大頭針到正確位置';
    SUG[k] = SUG[k].filter(x => x.kind !== 'remote').concat(extra);
    buildSug(k, true);
    // 英文路名的結果：逐一換成中文後更新清單
    extra.filter(x => BBC.hasLatin(x.label + ' ' + x.sub)).slice(0, 5).forEach(x => BBC.zhFix(x).then(ok => { if (ok && my === SUG_SEQ[k] && !$('sug-' + k).hidden) buildSug(k, true); }));
  } catch (e) { if (e.name !== 'AbortError' && my === SUG_SEQ[k]) { SUG_MSG[k] = '地址搜尋暫時無法使用，請選道路或在地圖上選位置'; buildSug(k, false); } }
}
function choose(k, x) {
  SUG_SEQ[k]++; clearTimeout(SUG_T[k]); if (SUG_AB[k]) SUG_AB[k].abort();   // 取消還沒回來的搜尋，免得清單又被打開
  $('d-' + k).value = x.label;
  if (BBC.hasLatin(x.label)) { const was = x.label; BBC.zhFix(x).then(ok => { if (ok && $('d-' + k).value === was) $('d-' + k).value = x.label; }); }
  ROADPICK[k] = x.kind === 'road' ? x : null;
  $('sug-' + k).hidden = true; $('d-' + k).setAttribute('aria-expanded', 'false');
  if (x.kind === 'road' && x.lat == null) {
    // 內建路名還沒有座標：先放在這一區中心，查到這條路的位置後再移過去
    const c = BBC.areaCenter(x.area); x.lat = c[0]; x.lng = c[1]; x.pending = true;
    BBC.roadCoord(x.area, x.label).then(r => {
      x.lat = r.lat; x.lng = r.lng; x.pending = false;
      const rr = (ROADS[x.area] || []).find(y => y.name === x.label); if (rr) { rr.lat = r.lat; rr.lng = r.lng; }
      if (ROADPICK[k] === x && $('d-' + k).value.startsWith(x.label)) {
        setPick(k, x);
        $('pickNote').textContent = r.approx ? '找不到「' + x.label + '」的精確位置，請拖曳大頭針到正確位置' : '已定位到「' + x.label + '」，可接著輸入門牌號碼，或拖曳大頭針微調';
      }
    });
  }
  setPick(k, x);
  if (x.kind === 'road') { const inp = $('d-' + k); inp.value = x.label; SKIP_FOCUS[k] = document.activeElement !== inp; setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0); $('pickNote').textContent = '已選「' + x.label + '」，可接著輸入門牌號碼，或拖曳大頭針到正確位置'; }
}
function setPick(k, p) {
  const inK = p && p.lat > 22.43 && p.lat < 23.48 && p.lng > 120.15 && p.lng < 121.05;
  PICK[k] = p ? { lat: p.lat, lng: p.lng, area: p.area || (inK ? BBC.areaOf(p.lat, p.lng) : $('d-' + k + '-area').value) } : null;
  if (PICK[k]) setAreaSel(k, PICK[k].area);
  // 高雄以外用地圖選的點：查出是哪個縣市區
  if (p && !p.area && !inK) { const pk = PICK[k]; BBC.reverseArea(p.lat, p.lng).then(a => { if (a && PICK[k] === pk) { pk.area = a; setAreaSel(k, a); updateEstimate(); } }); }
  drawPickMap(); updateEstimate();
}
['from', 'to'].forEach(k => {
  const inp = $('d-' + k);
  inp.addEventListener('input', () => {
    PICK[k] = null;                       // 文字改了，原本的座標就不算數
    const v = inp.value.trim();
    const s = ALL_SPOTS.find(p => p.n === v);
    const rp = ROADPICK[k];
    if (s) setPick(k, { lat: s.c[0], lng: s.c[1], area: s.d });
    else if (rp && v.startsWith(rp.label)) setPick(k, rp);   // 路名後面接著打門牌：先用這條路的位置
    else { ROADPICK[k] = null; drawPickMap(); updateEstimate(); }
    buildSug(k, true);
    clearTimeout(SUG_T[k]); SUG_T[k] = setTimeout(() => searchSug(k), 350);
  });
  inp.addEventListener('focus', () => { MAP_TARGET = k; markTarget(); if (SKIP_FOCUS[k]) { SKIP_FOCUS[k] = false; return; } searchSug(k); });
  inp.addEventListener('blur', () => setTimeout(() => { $('sug-' + k).hidden = true; inp.setAttribute('aria-expanded', 'false'); }, 180));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('sug-' + k).hidden && SUG[k][0]) { e.preventDefault(); choose(k, SUG[k][0]); }
    if (e.key === 'Escape') $('sug-' + k).hidden = true;
  });
  $('sug-' + k).addEventListener('mousedown', e => {
    const rr = e.target.closest('[data-reloadroads]');
    if (rr) { e.preventDefault(); ROAD_STATE[rr.dataset.reloadroads] = ''; loadRoads(rr.dataset.reloadroads, true); buildSug(k, true); return; }
    const b = e.target.closest('[data-sug]'); if (!b) return;
    e.preventDefault(); const [kk, i] = b.dataset.sug.split(':'); choose(kk, SUG[kk][+i]);
  });
  $('d-' + k + '-area').addEventListener('change', () => {
    // 換了行政區：清掉不在這區的已選位置，並直接打開這一區的清單
    if (PICK[k] && PICK[k].area !== $('d-' + k + '-area').value) { PICK[k] = null; ROADPICK[k] = null; drawPickMap(); updateEstimate(); }
    loadRoads($('d-' + k + '-area').value); inp.focus();
  });
});
function markTarget() { document.querySelectorAll('[data-target]').forEach(b => b.setAttribute('aria-pressed', b.dataset.target === MAP_TARGET)); }
function drawPickMap() {
  const show = !!(PICK.from || PICK.to) || $('pickBox').dataset.open === '1';
  $('pickBox').hidden = !show; $('mapPickBtn').hidden = show;
  if (!show || !window.L) return;
  if (!DPM) {
    DPM = L.map('dMap', { scrollWheelZoom: false }).setView([22.6273, 120.3014], 12);
    BBC.addTiles(DPM);
    DPM.on('click', async e => {
      const k = MAP_TARGET, lat = +e.latlng.lat.toFixed(6), lng = +e.latlng.lng.toFixed(6);
      setPick(k, { lat, lng });
      $('d-' + k).value = '地圖選點';
      const name = await BBC.geoReverse(lat, lng);
      if (PICK[k] && PICK[k].lat === lat) $('d-' + k).value = name || '地圖選點（' + PICK[k].area + '）';
      updateEstimate();
    });
  }
  ['from', 'to'].forEach(k => {
    const p = PICK[k];
    if (!p) { if (DPM_PIN[k]) { DPM.removeLayer(DPM_PIN[k]); delete DPM_PIN[k]; } return; }
    if (!DPM_PIN[k]) {
      DPM_PIN[k] = L.marker([p.lat, p.lng], { draggable: true, icon: BBC.pinIcon(k === 'from' ? BBC.ROUTE_RED : '#121A17') }).addTo(DPM).bindTooltip(k === 'from' ? '上車' : '下車', { direction: 'top' });
      DPM_PIN[k].on('dragend', () => { const ll = DPM_PIN[k].getLatLng(); setPick(k, { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) }); $('pickNote').textContent = (k === 'from' ? '上車' : '下車') + '位置已微調'; });
    } else DPM_PIN[k].setLatLng([p.lat, p.lng]);
  });
  const pts = ['from', 'to'].map(pickCoord).filter(Boolean);
  setTimeout(() => { DPM.invalidateSize(); if (pts.length === 1) DPM.setView(pts[0], 17); else if (pts.length > 1) DPM.fitBounds(L.latLngBounds(pts), { padding: [30, 30] }); }, 30);
}
$('mapPickBtn').addEventListener('click', () => { $('pickBox').dataset.open = '1'; MAP_TARGET = 'from'; markTarget(); drawPickMap(); $('pickNote').textContent = '在地圖上點一下，設定上車位置'; });
document.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => { MAP_TARGET = b.dataset.target; markTarget(); $('pickNote').textContent = '在地圖上點一下，設定' + (MAP_TARGET === 'from' ? '上車' : '下車') + '位置'; }));
['d-from-area', 'd-to-area', 'd-km'].forEach(id => $(id).addEventListener('input', updateEstimate));
function currentEstimate() {
  const from = $('d-from').value.trim(), to = $('d-to').value.trim();
  if (!from) return null;
  return BBC.estimateTrip(from, $('d-from-area').value, to, $('d-to-area').value, parseFloat($('d-km').value), pickCoord('from'), to ? pickCoord('to') : null);
}
function updateEstimate() {
  const e = currentEstimate();
  $('estBox').innerHTML = e
    ? (e.estFare == null ? `<span>未填下車地點：依跳表計費</span><span>起跳 <b>NT$${BBC.RATE.base}</b></span>` : `<span>預估 ${e.km} 公里 · ${e.mins} 分鐘</span><span>預估車資 <b>NT$${fmt(e.estFare)}</b></span>`)
    : '<span>填好上車地址後會顯示預估（下車地點可不填）</span>';
  const keep = $('d-driver').dataset.touched ? $('d-driver').value : '__auto';   // 預設：自動派給最近的司機
  $('d-driver').innerHTML = driverOptions(keep, [], true, $('d-from').value.trim(), $('d-from-area').value, pickCoord('from'));
  if ([...$('d-driver').options].some(o => o.value === keep)) $('d-driver').value = keep;
}
$('d-driver').addEventListener('change', () => { $('d-driver').dataset.touched = '1'; });
$('dispatchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('dispatchErr');
  let from = $('d-from').value.trim(), to = $('d-to').value.trim(), kmTxt = $('d-km').value.trim();
  if (!from) return err.textContent = '請輸入上車地址';
  if (kmTxt && !(parseFloat(kmTxt) > 0)) return err.textContent = '公里數要大於 0';
  // 高雄以外的地址沒從清單選：自動查一次位置（距離、派單範圍、導航都需要座標）
  for (const k of ['from', 'to']) {
    const v = k === 'from' ? from : to, a = $('d-' + k + '-area').value;
    if (!v || PICK[k] || BBC.cityOf(a) === '高雄市') continue;
    err.textContent = '查詢「' + v + '」的位置…';
    const res = await BBC.geoSearch(v, a).catch(() => []);
    const hit = res.find(x => x.area === a) || res[0];
    if (!hit) return err.textContent = `找不到「${v}」的位置，請從下拉清單選，或按「在地圖上選上車點」直接點`;
    setPick(k, { lat: hit.lat, lng: hit.lng, area: hit.area || a });
  }
  // 還是英文的地址：送出前換成中文
  for (const k of ['from', 'to']) {
    const v = $('d-' + k).value.trim();
    if (v && PICK[k] && BBC.hasLatin(v)) { const x = { label: v, sub: '', lat: PICK[k].lat, lng: PICK[k].lng }; err.textContent = '地址換成中文…'; if (await BBC.zhFix(x)) $('d-' + k).value = x.label; }
  }
  err.textContent = '';
  const est = currentEstimate();
  let pick = $('d-driver').value, drv = null, grab = null;
  if (pick === '__grab') {
    const draft = { from, fromArea: $('d-from-area').value, fromLat: PICK.from ? PICK.from.lat : null, fromLng: PICK.from ? PICK.from.lng : null, commissionRate: feeNow(), estFare: est && est.estFare, declinedBy: [] };
    grab = BBC.grabCandidates(draft, DRIVERS, RIDES, grabKm());
    if (!grab.length) return err.textContent = `${grabKm()} 公里內沒有可以搶單的線上空車司機（要有 GPS 位置、點數足夠），可以改選「稍後指派」`;
  } else if (pick === '__auto') {
    drv = nearestDriver(from, $('d-from-area').value, [], curNeed(), pickCoord('from'));
    if (!drv) return err.textContent = `${rangeLabel()}沒有點數足夠的線上空車司機，可以改選「稍後指派」，等司機靠近再派`;
  } else if (pick) {
    drv = DRIVERS.find(d => d.id === pick);
    const far = drv && rangeText(drv, pickCoord('from') || BBC.locate(from, $('d-from-area').value).c);
    if (far) return err.textContent = `${drv.name} ${far}，不能派這張單。請選 ${rangeLabel()}的司機，或先放到待派單`;
  }
  const now = Date.now();
  const ride = Object.assign({
    source: 'admin', createdBy: ADMIN.id, riderName: $('d-rider').value.trim() || '乘客', riderPhone: $('d-phone').value.trim(),
    note: $('d-note').value.trim(), from, to, declinedBy: [], createdAt: now, commissionRate: feeNow(),
    fromLat: PICK.from ? PICK.from.lat : null, fromLng: PICK.from ? PICK.from.lng : null,
    toLat: to && PICK.to ? PICK.to.lat : null, toLng: to && PICK.to ? PICK.to.lng : null,
    rangeMin: limitMin(), rangeKm: limitKm(),
    status: grab ? 'offering' : drv ? 'assigned' : 'pending', offerTo: grab ? grab.map(d => d.id) : [], offerNames: grab ? grab.map(d => d.name) : [], offerAt: grab ? now : 0, offerSecs: BBC.GRAB_SECS, grabKm: grab ? grabKm() : 0,
    driverPhone: drv ? drv.id : '', driverName: drv ? (drv.name || drv.id) : '', plate: drv ? (drv.plate || '') : '',
    assignedAt: drv ? now : 0
  }, est);
  err.textContent = '建立中…';
  try {
    const id = await db.add('rides', ride);
    err.textContent = '';
    toast(grab ? `行程 ${id} 已同時通知 ${grab.length} 位司機搶單：${grab.map(d => d.name).join('、')}` : drv ? `行程 ${id} 已派給 ${drv.name}` : `行程 ${id} 已建立，放在待派單`);
    ['d-rider', 'd-phone', 'd-from', 'd-to', 'd-note', 'd-km'].forEach(i => { $(i).value = ''; });
    delete $('d-driver').dataset.touched;
    PICK.from = PICK.to = null; $('pickBox').dataset.open = ''; drawPickMap();
    feeTouched = false; applyFeeDefault();
    updateEstimate();
    if (isMobile()) { rideFilter = 'active'; setView('rides'); renderRides(); }
  } catch (x) { fail(x); err.textContent = '建立失敗：' + (x.code || x.message || '請再試一次'); }
});

async function assign(rideId, phone) {
  const r = RIDES.find(x => x.id === rideId); if (!r) return;
  if (phone === '__grab') {
    const g = BBC.grabCandidates(r, DRIVERS, RIDES, grabKm());
    if (!g.length) return toast(grabKm() + ' 公里內沒有可以搶單的線上空車司機');
    try { await db.set('rides', rideId, { status: 'offering', offerTo: g.map(d => d.id), offerNames: g.map(d => d.name), offerAt: Date.now(), offerSecs: BBC.GRAB_SECS, grabKm: grabKm(), driverPhone: '', driverName: '', plate: '', assignedAt: 0 }); toast(`已同時通知 ${g.length} 位司機搶單：${g.map(d => d.name).join('、')}`); } catch (x) { fail(x); }
    return;
  }
  let d = phone === '__auto' ? nearestDriver(r.from, r.fromArea, r.declinedBy, rideNeed(r), BBC.fromCoord(r)) : DRIVERS.find(x => x.id === phone);
  if (!d) return toast(phone === '__auto' ? rangeLabel() + '沒有可派的線上空車司機' : '請先選擇司機');
  { const far = rangeText(d, BBC.fromCoord(r) || BBC.locate(r.from, r.fromArea).c); if (far) return toast(`${d.name} ${far}，不能派這張單`); }
  if (state(d) !== 'online') return toast(d.name + ' 目前不是線上空車，無法派單');
  if (!enoughPoints(d, rideNeed(r))) return toast(`${d.name} 只剩 ${fmt(d.balance || 0)} 點，不夠這張單預估的回金 ${rideNeed(r)} 點，請先儲值`);
  try {
    await db.set('rides', rideId, { status: 'assigned', driverPhone: d.id, driverName: d.name || d.id, plate: d.plate || '', assignedAt: Date.now() });
    toast(`行程 ${rideId} 已派給 ${d.name}`);
  } catch (x) { fail(x); }
}
async function unassign(rideId) {
  try { await db.set('rides', rideId, { status: 'pending', driverPhone: '', driverName: '', plate: '' }); toast('已收回，行程回到待派單'); } catch (x) { fail(x); }
}
function cancelRide(rideId) {
  const r = RIDES.find(x => x.id === rideId); if (!r) return;
  modal(`<h3 id="modalTitle">取消行程 ${esc(r.id)}？</h3>
    <p class="sub">${esc(r.fromArea)} ${esc(r.from)} → ${esc(BBC.toText(r))}${r.driverName ? '<br>司機 ' + esc(r.driverName) + ' 的 App 會立即收到通知。' : ''}${r.commissionLedger ? '<br>司機已扣的回金 ' + fmt(r.commission) + ' 點會自動退還。' : ''}</p>
    <div class="mrow"><button class="sbtn" type="button" data-close>不要取消</button><button class="btn red" type="button" id="mOk">確定取消</button></div>`);
  $('mOk').onclick = async () => {
    try {
      await db.set('rides', rideId, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: ADMIN.id });
      let msg = '行程已取消';
      if (r.commissionLedger && r.driverPhone && r.commission) {
        const res = await db.adjustBalance(r.driverPhone, r.commission, { type: 'refund', rideId: r.id, address: (r.fromArea ? r.fromArea + ' ' : '') + r.from, note: '行程取消退還回金', by: ADMIN.id }, { rideId: r.id, flag: 'commissionRefundLedger' });
        if (!res.skipped) msg += `，已退還 ${r.driverName} ${r.commission} 點`;
      }
      closeModal(); toast(msg);
    } catch (x) { fail(x); }
  };
}

// ---------- 畫面：KPI ----------
function renderKpis() {
  const t0 = todayStart();
  const doneToday = RIDES.filter(r => r.status === 'done' && (r.doneAt || 0) >= t0);
  $('k-online').textContent = DRIVERS.filter(d => state(d) === 'online').length;
  $('k-busy').textContent = DRIVERS.filter(d => state(d) === 'busy').length;
  const pend = RIDES.filter(r => r.status === 'pending').length;
  $('k-pending').textContent = pend;
  $('tb-rides').hidden = !pend; $('tb-rides').textContent = pend;
  $('k-done').textContent = doneToday.length;
  $('k-rev').textContent = 'NT$' + fmt(doneToday.reduce((a, r) => a + (r.finalFare || 0), 0));
  $('modeBadge').className = 'mode ' + BBC.mode;
  $('modeBadge').textContent = BBC.mode === 'cloud' ? '雲端即時連線' : '示範模式';
}

// ---------- 畫面：行程 ----------
const RIDE_FILTERS = [
  ['active', '進行中', r => ACTIVE.includes(r.status)],
  ['pending', '待派單', r => r.status === 'pending'],
  ['done', '今日完成', r => r.status === 'done' && (r.doneAt || 0) >= todayStart()],
  ['cancelled', '已取消', r => r.status === 'cancelled'],
  ['all', '全部', () => true]
];
function renderRides() {
  $('rideFilters').innerHTML = RIDE_FILTERS.map(([k, label, fn]) =>
    `<button type="button" class="chip" data-rf="${k}" aria-pressed="${rideFilter === k}">${label}<i>${RIDES.filter(fn).length}</i></button>`).join('');
  const fn = RIDE_FILTERS.find(f => f[0] === rideFilter)[2];
  const order = { pending: 0, assigned: 1, pickup: 2, trip: 3, done: 4, cancelled: 5 };
  const list = RIDES.filter(fn).sort((a, b) => (order[a.status] - order[b.status]) || ((b.createdAt || 0) - (a.createdAt || 0))).slice(0, 100);
  if (!list.length) {
    $('rideList').innerHTML = `<div class="empty">${rideFilter === 'active' ? '目前沒有進行中的行程。用「派單」建立一筆，或等司機手動輸入。' : '沒有符合的行程'}</div>`;
    return;
  }
  // 保留使用者正在選的司機下拉，避免即時更新把選擇洗掉
  const keep = {};
  document.querySelectorAll('[data-pick]').forEach(s => { keep[s.dataset.pick] = s.value; });
  $('rideList').innerHTML = list.map(r => {
    const money = r.status === 'done' ? `<b>NT$${fmt(r.finalFare)}</b><span class="t">實收 · ${esc(r.finalKm != null ? r.finalKm : (r.km || 0))} km</span>`
      : r.status === 'trip' ? (lv => `<b>NT$${fmt(lv.fare)}</b><span class="t">跳表中 · ${lv.km.toFixed(1)} km · ${BBC.clock(lv.min)}</span>`)(liveMeter(r))
      : r.estFare == null ? `<b>跳表計費</b><span class="t">未指定下車地點</span>` : `<b>NT$${fmt(r.estFare)}</b><span class="t">預估 · ${esc(r.km)} km / ${esc(r.mins)} 分</span>`;
    let act = '';
    if (r.status === 'pending') {
      act = `<select data-pick="${esc(r.id)}" aria-label="選擇要派的司機">${driverOptions(keep[r.id], r.declinedBy, false, r.from, r.fromArea, BBC.fromCoord(r), rideNeed(r)).replace('<option value="">選擇司機…</option>', '<option value="">選擇司機…</option><option value="__grab">搶單（' + grabKm() + ' 公里內同時通知）</option><option value="__auto">自動派給最近的司機（' + rangeLabel() + '）</option>')}</select>
        <button class="sbtn primary" type="button" data-assign="${esc(r.id)}">派單</button>
        ${(r.declinedBy || []).length ? `<span class="t">已被 ${r.declinedBy.length} 位司機拒絕${(r.declines || []).length ? '：' + r.declines.map(x => esc(x.name) + '（' + esc(x.reason) + '）').join('、') : ''}</span>` : ''}
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'offering') {
      act = `<span class="t">搶單中：已通知 ${(r.offerTo || []).length} 位司機（${esc((r.offerNames || []).join('、'))}）<b data-left="${r.offerAt}" data-secs="${r.offerSecs || BBC.GRAB_SECS}"></b>
        ${(r.bids || []).length ? '<br>已選：' + r.bids.slice().sort((a, b) => a.min - b.min || a.at - b.at).map(b => esc(b.name) + ' ' + b.min + ' 分').join('、') : ''}${(r.declinedBy || []).length ? ' · ' + r.declinedBy.length + ' 位不搶' : ''}</span>
        <button class="sbtn" type="button" data-unassign="${esc(r.id)}">收回</button>
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'assigned') {
      act = `<span class="t">等待 ${esc(r.driverName)} 接單… <b data-left="${r.assignedAt || Date.now()}"></b>${r.autoNote === '自動改派' ? '（自動改派）' : ''}</span>
        <button class="sbtn" type="button" data-unassign="${esc(r.id)}">收回改派</button>
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'pickup' || r.status === 'trip') {
      act = `<span class="t">${r.status === 'pickup' ? '司機前往上車點' + (r.promisedMin ? `（搶單：承諾 ${r.promisedMin} 分鐘內到，${BBC.hhmm((r.acceptedAt || 0) + r.promisedMin * 60000)} 前）` : '') : '開始跳表 ' + BBC.hhmm(r.startedAt)}${r.source === 'driver' ? ' · 司機手動建立' : ''}</span>
        <button class="sbtn" type="button" data-route="${esc(r.id)}">即時位置與路線</button>
        <button class="sbtn" type="button" data-msg="${esc(r.driverPhone)}" data-msgride="${esc(r.id)}">傳訊息給司機${(d => d && unreadOf(d, r.id) ? '（' + unreadOf(d, r.id) + '）' : '')(DRIVERS.find(x => x.id === r.driverPhone))}</button>
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'done') {
      act = `<span class="t">完成 ${BBC.hhmm(r.doneAt)} · ${esc(Math.round(r.finalMin || 0))} 分鐘 · ${r.distanceSource === 'gps-road' ? 'GPS＋道路校正里程' : r.distanceSource === 'gps' ? 'GPS 實際里程' : '估算里程'}${r.source === 'driver' ? ' · 司機手動建立' : ''}</span>
        <button class="sbtn" type="button" data-route="${esc(r.id)}" style="margin-left:auto">路線與明細</button>`;
    } else {
      act = `<span class="t">取消於 ${BBC.hhmm(r.cancelledAt)}</span>`;
    }
    return `<article class="ride st-${r.status}">
      <div><div class="no">${esc(r.id)}</div><div class="t">${BBC.hhmm(r.createdAt)} 建立</div><div style="margin-top:6px"><span class="pill p-${r.status}">${STATUS_TEXT[r.status] || r.status}</span></div></div>
      <div class="route">
        <div><em>上</em><span>${esc(r.fromArea)} ${esc(r.from)}</span></div>
        <div><em class="to">下</em><span${BBC.hasDest(r) ? '' : ' style="color:var(--muted)"'}>${esc(BBC.toText(r))}</span></div>
        ${r.note ? `<div class="t">備註：${esc(r.note)}</div>` : ''}
      </div>
      <div class="who2">乘客 <b style="color:var(--ink)">${esc(r.riderName)}</b>${r.riderPhone ? ' · ' + esc(r.riderPhone) : ''}<br>司機 ${r.driverName ? `<b style="color:var(--ink)">${esc(r.driverName)}</b> · ${esc(r.plate)}` : '—'}</div>
      <div class="money">${money}${commissionText(r)}</div>
      <div class="actions">${act}</div>
    </article>`;
  }).join('');
  Object.keys(keep).forEach(id => { const s = document.querySelector(`[data-pick="${CSS.escape(id)}"]`); if (s && [...s.options].some(o => o.value === keep[id])) s.value = keep[id]; });
}

// ---------- 畫面：司機 ----------
const DRIVER_FILTERS = [
  ['all', '全部', () => true],
  ['pending', '待核准', d => state(d) === 'pending'],
  ['online', '線上空車', d => state(d) === 'online'],
  ['busy', '載客中', d => state(d) === 'busy'],
  ['offline', '離線／斷線', d => ['offline', 'lost'].includes(state(d))],
  ['disabled', '已停用', d => state(d) === 'disabled']
];
function renderDrivers() {
  renderDriverMap();
  $('junkBox').hidden = !JUNK.length;
  $('junkText').textContent = `發現 ${JUNK.length} 筆沒有名字的無效司機資料（舊版程式錯誤產生的），不影響真正的司機帳號。`;
  $('driverFilters').innerHTML = DRIVER_FILTERS.map(([k, label, fn]) =>
    `<button type="button" class="chip" data-df="${k}" aria-pressed="${driverFilter === k}">${label}<i>${DRIVERS.filter(fn).length}</i></button>`).join('');
  const fn = DRIVER_FILTERS.find(f => f[0] === driverFilter)[2];
  const order = { pending: -1, busy: 0, online: 1, lost: 2, offline: 3, disabled: 4 };   // 待核准排最上面
  const t0 = todayStart();
  const list = DRIVERS.filter(fn).sort((a, b) => (order[state(a)] - order[state(b)]) || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  if (!list.length) {
    $('driverRows').innerHTML = `<tr><td colspan="9"><div class="empty">${DRIVERS.length ? '沒有符合的司機' : '還沒有司機帳號。按右上角「新增司機帳號」，或請司機在 App 裡自行註冊。'}</div></td></tr>`;
    return;
  }
  $('driverRows').innerHTML = list.map(d => {
    const st = state(d);
    const cur = RIDES.find(r => r.driverPhone === d.id && ['assigned', 'pickup', 'trip'].includes(r.status));
    const done = RIDES.filter(r => r.driverPhone === d.id && r.status === 'done' && (r.doneAt || 0) >= t0);
    return `<tr>
      <td data-label="司機"><div class="name">${esc(d.name)}</div><div class="small">${esc(d.id)}</div></td>
      <td data-label="車輛"><div>${esc(d.plate || '—')}</div><div class="small">${esc([d.brand, d.model].filter(Boolean).join(' ') || '—')}${d.color ? ' · ' + esc(d.color) : ''}</div></td>
      <td data-label="服務類型"><div class="small" style="color:var(--ink)">${esc(d.service || '—')}</div><div class="small">${esc(d.seats || '')}</div></td>
      <td data-label="狀態"><span class="pill p-${st}">${DRIVER_TEXT[st]}</span></td>
      <td data-label="定位">${freshLoc(d) ? `<div>GPS ±${esc(d.acc || '?')} 公尺</div><div class="small">${BBC.ago(d.locAt)}更新</div>` : `<span class="small">${d.locAt ? '位置過舊（' + BBC.ago(d.locAt) + '）' : '未定位'}</span>`}</td>
      <td data-label="目前行程">${cur ? `<div class="name" style="font-weight:500">${esc(cur.id)} · ${STATUS_TEXT[cur.status]}</div><div class="small">${esc(cur.from)} → ${esc(BBC.toText(cur))}</div>` : '<span class="small">—</span>'}</td>
      <td data-label="今日" class="num">${done.length} 趟<div class="small">NT$${fmt(done.reduce((a, r) => a + (r.finalFare || 0), 0))}</div></td>
      <td data-label="最後回報" class="num small">${BBC.ago(d.lastSeen)}</td>
      <td data-label="帳號管理"><div class="rowact">
        <button class="sbtn${unreadOf(d) ? ' primary' : ''}" type="button" data-msg="${esc(d.id)}">訊息${unreadOf(d) ? '（' + unreadOf(d) + '）' : ''}</button>
        ${d.approved === false ? `<button class="sbtn primary" type="button" data-approve="${esc(d.id)}">核准</button>` : ''}
        <button class="sbtn" type="button" data-toggle="${esc(d.id)}">${d.active === false ? '啟用' : '停用'}</button>
        <button class="sbtn" type="button" data-resetpw="${esc(d.id)}">重設密碼</button>
        <button class="sbtn danger" type="button" data-deldrv="${esc(d.id)}">刪除</button>
      </div></td>
    </tr>`;
  }).join('');
}

function renderAll() {
  if (!ADMIN) return;
  renderKpis(); renderRides(); renderDrivers(); renderWallet();
  if (document.activeElement !== $('d-driver')) updateEstimate();
}
setInterval(() => { if (ADMIN) { renderKpis(); renderDrivers(); } }, 10000);
// 備援：司機手機沒回應（關機、沒網路）超過 30 秒＋緩衝，由管理平台記成逾時並自動改派下一位
const STALE_DONE = {};
setInterval(() => {
  if (!ADMIN) return;
  RIDES.filter(r => r.status === 'assigned' && r.assignedAt && Date.now() - r.assignedAt > (BBC.ACCEPT_SECS + 12) * 1000).forEach(r => {
    const k = r.id + ':' + r.assignedAt; if (STALE_DONE[k]) return; STALE_DONE[k] = 1;
    const d = DRIVERS.find(x => x.id === r.driverPhone) || { phone: r.driverPhone, name: r.driverName };
    const old = Date.now() - r.assignedAt > 10 * 60000;   // 很久以前的舊單只退回待派單，不自動改派
    BBC.declineAndReassign(r, { phone: d.id || d.phone, name: d.name }, '逾時未回應', old ? [] : DRIVERS, RIDES, { min: limitMin(), km: limitKm() }).catch(fail);
  });
  RIDES.filter(r => r.status === 'offering' && BBC.grabDone(r)).forEach(r => {
    const k = 'o:' + r.id + ':' + r.offerAt + ':' + (r.bids || []).length + ':' + (r.declinedBy || []).length + ':' + (Date.now() - r.offerAt > (r.offerSecs || BBC.GRAB_SECS) * 1000); if (STALE_DONE[k]) return; STALE_DONE[k] = 1;
    BBC.resolveGrab(r.id).then(p => { if (p && p.status === 'pending') toast(`行程 ${r.id} 搶單 ${r.offerSecs || BBC.GRAB_SECS} 秒內沒人選，已回到待派單`); }).catch(fail);
  });
  if (!$('rideList')) return;
  document.querySelectorAll('[data-left]').forEach(el => { const s = Math.max(0, (+el.dataset.secs || BBC.ACCEPT_SECS) - Math.floor((Date.now() - +el.dataset.left) / 1000)); el.textContent = s ? `剩 ${s} 秒` : el.dataset.secs ? '決定中…' : '逾時，改派中…'; });
}, 1000);   // 更新「最後回報」與斷線判斷

// ---------- 對話框 ----------
function modal(html) { $('modalCard').innerHTML = html; $('modal').hidden = false; const f = $('modalCard').querySelector('input,select,button'); if (f) f.focus(); }
function closeModal() { MSG_OPEN = null; MSG_RIDE = ''; clearInterval(ROUTE_T); const m = $('mMap'); if (m && m._map) { try { m._map.remove(); } catch (e) {} m._map = null; m._st = null; } $('modal').hidden = true; $('modalCard').innerHTML = ''; $('modalCard').style.width = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

$('brands').innerHTML = ['Toyota 豐田', 'Lexus 凌志', 'Honda 本田', 'Nissan 日產', 'Mitsubishi 三菱', 'CMC 中華', 'Mazda 馬自達', 'Subaru 速霸陸', 'Suzuki 鈴木', 'Hyundai 現代', 'Kia 起亞', 'Ford 福特', 'Volkswagen 福斯', 'Škoda', 'Audi 奧迪', 'BMW', 'MINI', 'Mercedes-Benz 賓士', 'Volvo 富豪', 'Porsche 保時捷', 'Tesla 特斯拉', 'Luxgen 納智捷', 'Peugeot 寶獅', 'Citroën 雪鐵龍', 'MG', 'Land Rover', 'Jeep'].map(b => `<option value="${b}">`).join('');

function addDriverDialog() {
  modal(`<h3 id="modalTitle">新增司機帳號</h3>
    <form class="form" id="addForm" novalidate>
      <div class="f2"><div class="field"><label for="a-name">姓名</label><input id="a-name" autocomplete="off"></div>
        <div class="field"><label for="a-phone">手機（登入帳號）</label><input id="a-phone" type="tel" inputmode="numeric" placeholder="0912345678" autocomplete="off"></div></div>
      <div class="f2"><div class="field"><label for="a-plate">車牌</label><input id="a-plate" placeholder="ABC-1234" autocomplete="off"></div>
        <div class="field"><label for="a-color">車色</label><select id="a-color"><option>白色</option><option>黑色</option><option>銀色</option><option>灰色</option><option>黃色</option><option>藍色</option><option>紅色</option><option>其他顏色</option></select></div></div>
      <div class="f2"><div class="field"><label for="a-brand">廠牌</label><input id="a-brand" list="brands" autocomplete="off"></div>
        <div class="field"><label for="a-model">車型</label><input id="a-model" autocomplete="off"></div></div>
      <div class="f2"><div class="field"><label for="a-service">服務類型</label><select id="a-service"><option>蹦蹦車標準</option><option>蹦蹦車舒適</option><option>蹦蹦車大型（6 人以上）</option><option>蹦蹦車綠能（電動車）</option><option>蹦蹦車無障礙</option></select></div>
        <div class="field"><label for="a-seats">座位</label><select id="a-seats"><option>5 人座</option><option>7 人座</option><option>8 人座以上</option></select></div></div>
      <div class="field"><label for="a-pw">初始密碼（至少 6 碼，請告訴司機）</label><input id="a-pw" autocomplete="off"></div>
      <p class="err" id="addErr" role="alert"></p>
      <div class="mrow"><button class="sbtn" type="button" data-close>取消</button><button class="btn blue" type="submit">建立帳號</button></div>
    </form>`);
  $('addForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('addErr');
    const name = $('a-name').value.trim(), phone = $('a-phone').value.replace(/[\s-]/g, ''), plate = $('a-plate').value.trim().toUpperCase().replace(/\s/g, ''), pw = $('a-pw').value;
    if (!name) return err.textContent = '請輸入姓名';
    if (!/^09\d{8}$/.test(phone)) return err.textContent = '手機號碼要是 09 開頭的 10 位數字';
    if (!/^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}$/.test(plate)) return err.textContent = '車牌格式例如 ABC-1234';
    if (pw.length < 6) return err.textContent = '密碼至少要 6 碼';
    try {
      if (await db.get('drivers', phone)) return err.textContent = '這個手機號碼已經有帳號了';
      await db.set('drivers', phone, {
        name, phone, plate, brand: $('a-brand').value.trim(), model: $('a-model').value.trim(), color: $('a-color').value,
        seats: $('a-seats').value, service: $('a-service').value, fuel: '', pw: await BBC.hashPw(phone, pw),
        active: true, status: 'offline', area: '', createdAt: Date.now(), createdBy: ADMIN.id, lastSeen: 0
      });
      closeModal(); toast(`已建立 ${name} 的帳號，登入帳號是 ${phone}`);
    } catch (x) { fail(x); }
  });
}
function resetPwDialog(id) {
  const d = DRIVERS.find(x => x.id === id); if (!d) return;
  modal(`<h3 id="modalTitle">重設 ${esc(d.name)} 的密碼</h3>
    <form class="form" id="rpForm" novalidate>
      <div class="field"><label for="rp-pw">新密碼（至少 6 碼）</label><input id="rp-pw" autocomplete="off"></div>
      <p class="err" id="rpErr" role="alert"></p>
      <div class="mrow"><button class="sbtn" type="button" data-close>取消</button><button class="btn blue" type="submit">重設密碼</button></div>
    </form>`);
  $('rpForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('rp-pw').value;
    if (pw.length < 6) return $('rpErr').textContent = '密碼至少要 6 碼';
    try { await db.set('drivers', id, { pw: await BBC.hashPw(id, pw) }); closeModal(); toast('密碼已重設，請告訴司機新密碼'); } catch (x) { fail(x); }
  });
}
function deleteDriverDialog(id) {
  const d = DRIVERS.find(x => x.id === id); if (!d) return;
  const busy = RIDES.some(r => r.driverPhone === id && ['assigned', 'pickup', 'trip'].includes(r.status));
  modal(`<h3 id="modalTitle">刪除 ${esc(d.name)} 的帳號？</h3>
    <p class="sub">${busy ? '這位司機還有進行中的行程，請先取消或等行程結束。' : '刪除後司機 App 會立刻登出，這個手機號碼可以重新註冊。過去的行程紀錄會保留。'}</p>
    <div class="mrow"><button class="sbtn" type="button" data-close>取消</button>${busy ? '' : '<button class="btn red" type="button" id="mOk">刪除帳號</button>'}</div>`);
  if (!busy) $('mOk').onclick = async () => { try { await db.remove('drivers', id); closeModal(); toast('帳號已刪除'); } catch (x) { fail(x); } };
}
// 核准自己註冊的司機（核准前不能上線、不會被派單）
async function approveDriver(id) {
  const d = DRIVERS.find(x => x.id === id); if (!d) return;
  try { await db.set('drivers', id, { approved: true, approvedAt: Date.now(), approvedBy: ADMIN.id }); toast(`已核准 ${d.name}，他現在可以上線接單了`); } catch (x) { fail(x); }
}
async function toggleDriver(id) {
  const d = DRIVERS.find(x => x.id === id); if (!d) return;
  const disable = d.active !== false;
  if (disable && RIDES.some(r => r.driverPhone === id && ['assigned', 'pickup', 'trip'].includes(r.status))) return toast('這位司機有進行中的行程，請先處理行程再停用');
  try {
    await db.set('drivers', id, disable ? { active: false, status: 'offline' } : { active: true });
    toast(disable ? `已停用 ${d.name}，司機 App 會被登出` : `已啟用 ${d.name}`);
  } catch (x) { fail(x); }
}
function adminPwDialog() {
  modal(`<h3 id="modalTitle">修改管理員密碼</h3>
    <form class="form" id="apForm" novalidate>
      <div class="field"><label for="ap-old">目前密碼</label><input id="ap-old" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="ap-new">新密碼（至少 8 碼）</label><input id="ap-new" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="ap-new2">再次輸入新密碼</label><input id="ap-new2" type="password" autocomplete="new-password"></div>
      <p class="err" id="apErr" role="alert"></p>
      <div class="mrow"><button class="sbtn" type="button" data-close>取消</button><button class="btn dark" type="submit">儲存新密碼</button></div>
    </form>`);
  $('apForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('apErr'), o = $('ap-old').value, n = $('ap-new').value, n2 = $('ap-new2').value;
    if (ADMIN.pw !== await BBC.hashPw(ADMIN.id, o)) return err.textContent = '目前密碼不正確';
    if (n.length < 8) return err.textContent = '新密碼至少要 8 碼';
    if (n !== n2) return err.textContent = '兩次輸入的新密碼不一樣';
    try { await db.set('admins', ADMIN.id, { pw: await BBC.hashPw(ADMIN.id, n), isDefaultPw: false }); closeModal(); toast('管理員密碼已更新'); } catch (x) { fail(x); }
  });
}

// ---------- 手機分頁 ----------
function setView(v) {
  $('main').dataset.view = v;
  document.querySelectorAll('[data-mt]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mt === v));
  try { localStorage.setItem('bbc_admin_view', v); } catch (e) {}
  window.scrollTo(0, 0);
  if (v === 'drivers' && DMAP) setTimeout(() => DMAP.invalidateSize(), 60);
}
try { const v = localStorage.getItem('bbc_admin_view'); if (v) setView(v); } catch (e) {}
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

function routeDialog(id) {
  const r = RIDES.find(x => x.id === id); if (!r) return;
  const done = r.status === 'done';
  const km = done ? r.finalKm : r.meterKm, fare = done ? r.finalFare : r.meterFare;
  const L = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--soft);font-size:14px"><span class="sub" style="font-size:14px">${k}</span><b style="text-align:right;overflow-wrap:anywhere">${v}</b></div>`;
  modal(`<h3 id="modalTitle">${done ? '行程路線與明細' : '即時路線'} · ${esc(r.id)}</h3>
    <div style="flex-shrink:0;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#fff"><div id="mMap" style="height:340px;background:var(--soft)"></div><div id="mSum"></div></div>
    <div>
      ${L('司機', esc(r.driverName || '—') + ' · ' + esc(r.plate || ''))}
      ${L('乘客', esc(r.riderName || '乘客') + (r.riderPhone ? ' · ' + esc(r.riderPhone) : ''))}
      ${L('上車', esc((r.fromArea || '') + ' ' + r.from))}
      ${L('下車', esc(BBC.toText(r)))}
      ${L('時間', BBC.hhmm(r.startedAt) + ' → ' + (done ? BBC.hhmm(r.doneAt) : '進行中'))}
      ${L('里程', '<span id="mKmVal">' + esc(km != null ? km : 0) + ' 公里</span>（' + (r.distanceSource === 'gps-road' ? 'GPS＋道路校正' : r.distanceSource === 'gps' || (r.track || []).length > 1 ? 'GPS' : '估算') + '）')}
      ${done ? L('車資明細', `起跳 ${fmt(r.fareBase)} ＋ 里程 ${fmt(r.fareKm)} ＋ 時間 ${fmt(r.fareTime)}${r.minFareTopUp ? ' ＋ 低消補足 ' + fmt(r.minFareTopUp) : ''}`) : ''}
      ${L(done ? '實收車資' : '目前跳表', '<span id="mFareVal">NT$' + fmt(fare) + '</span>')}
    </div>
    ${done ? '' : '<p class="sub">每 3 秒自動更新。時間依「開始跳表」的時間即時計算，金額用和司機 App 相同的公式，兩邊會一致（司機 App 需保持開著）。</p>'}
    <div class="mrow"><button class="btn dark" type="button" data-close>關閉</button></div>`);
  $('modalCard').style.width = 'min(640px, 100%)';
  const draw = () => {
    const rr = RIDES.find(x => x.id === id) || r;
    const live = rr.status === 'trip' || rr.status === 'pickup';
    const dv = DRIVERS.find(x => x.id === rr.driverPhone);
    BBC.drawRoute($('mMap'), rr.track, { live, current: live && dv && freshLoc(dv) ? [dv.lat, dv.lng] : null, fallback: BBC.fromCoord(rr) || BBC.locate(rr.from || '', rr.fromArea || '').c });
    const sum = $('mSum');
    const lv = liveMeter(rr);
    if (sum) sum.innerHTML = live ? BBC.tripSummaryHTML(lv.fare, lv.min, lv.km, lv.stale ? '司機 App 未回報（' + BBC.ago(rr.meterAt) + '）' : '跳表中 · 即時同步') : BBC.tripSummaryHTML(rr.finalFare, rr.finalMin, rr.finalKm, '實收車資');
    const kmEl = $('mKmVal'), fEl = $('mFareVal');
    if (kmEl) kmEl.textContent = (live ? lv.km.toFixed(1) : rr.finalKm) + ' 公里';
    if (fEl) fEl.textContent = 'NT$' + fmt(live ? lv.fare : rr.finalFare);
  };
  draw();
  clearInterval(ROUTE_T);
  if (!done) ROUTE_T = setInterval(() => { if (!$('mMap')) return clearInterval(ROUTE_T); draw(); }, 3000);
}
let ROUTE_T = null;
// 進行中行程的跳表：時間由開始跳表時間即時計算，里程用司機最後回報的值，金額套用同一個計價公式
function liveMeter(r) {
  const min = r.startedAt ? Math.max(0, (Date.now() - r.startedAt) / 60000) : (r.meterMin || 0);
  const km = r.meterKm || 0;
  return { min, km, fare: r.startedAt ? BBC.meterAmount(km, min) : (r.meterFare || BBC.RATE.base), stale: r.meterAt ? Date.now() - r.meterAt > 15000 : false };
}

// ---------- 司機即時位置地圖 ----------
let DMAP = null, DMK = {}, DMAP_FIT = false;
const STATE_COLOR = { online: '#1F7A34', busy: '#2459D6', lost: '#B3261E', offline: '#6B7570', disabled: '#6B7570' };
function renderDriverMap() {
  const el = $('drvMap'); if (!el) return;
  if (!window.L) { el.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:var(--muted);font-size:14px">地圖載入失敗，請檢查網路</div>'; $('drvMapNote').textContent = ''; return; }
  if (!DMAP) {
    DMAP = L.map(el, { scrollWheelZoom: false }).setView([22.6273, 120.3014], 12);
    BBC.addTiles(DMAP);
  }
  const shown = DRIVERS.filter(d => freshLoc(d) && state(d) !== 'disabled' && state(d) !== 'offline');
  const ids = new Set(shown.map(d => d.id));
  Object.keys(DMK).forEach(id => { if (!ids.has(id)) { DMAP.removeLayer(DMK[id]); delete DMK[id]; } });
  shown.forEach(d => {
    const st = state(d), ll = [d.lat, d.lng];
    const tip = `<b>${esc(d.name)}</b> · ${esc(d.plate || '')}<br>${DRIVER_TEXT[st]} · ±${esc(d.acc || '?')}m · ${BBC.ago(d.locAt)}`;
    if (!DMK[d.id]) DMK[d.id] = L.circleMarker(ll, { radius: 10, color: '#fff', weight: 3, fillColor: STATE_COLOR[st], fillOpacity: 1 }).addTo(DMAP).bindTooltip(tip, { direction: 'top', offset: [0, -8] });
    else { DMK[d.id].setLatLng(ll).setStyle({ fillColor: STATE_COLOR[st] }); DMK[d.id].setTooltipContent(tip); }
  });
  $('drvMapNote').textContent = shown.length ? `地圖上有 ${shown.length} 位司機（綠色：空車、藍色：載客中、紅色：斷線）。` : '目前沒有已定位的線上司機。司機上線並允許定位後就會出現在地圖上。';
  if (shown.length && !DMAP_FIT) { DMAP_FIT = true; DMAP.fitBounds(L.latLngBounds(shown.map(d => [d.lat, d.lng])), { padding: [40, 40], maxZoom: 15 }); }
}
function fitDriverMap() {
  if (!DMAP) return;
  DMAP.invalidateSize();
  const pts = Object.values(DMK).map(m => m.getLatLng());
  if (pts.length) DMAP.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
}

// ---------- 儲值與點數 ----------
function applyFeeDefault() {
  if (!$('d-fee')) return;
  if (!feeTouched) $('d-fee').value = SETTINGS.commissionRate;
  if (document.activeElement !== $('s-fee')) $('s-fee').value = SETTINGS.commissionRate;
  if ($('s-range') && document.activeElement !== $('s-range')) $('s-range').value = limitMin();
  if ($('s-km') && document.activeElement !== $('s-km')) $('s-km').value = limitKm() || '';
  $('feeHint').textContent = '預設每 100 元回 ' + SETTINGS.commissionRate + ' 點，行程結束才扣';
}
$('d-fee').addEventListener('input', () => { feeTouched = true; updateEstimate(); });
$('feeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = parseInt($('s-fee').value, 10), m = parseInt($('s-range').value, 10), kt = $('s-km').value.trim(), k = kt ? parseFloat(kt) : 0;
  if (!(k >= 0 && k <= 100)) return $('feeSaved').textContent = '公里範圍請輸入 0–100（留空 = 不限）';
  if (!(v >= 0)) return $('feeSaved').textContent = '回金請輸入 0 以上的整數';
  if (!(m >= 1 && m <= 120)) return $('feeSaved').textContent = '派單範圍請輸入 1–120 分鐘';
  try { await db.set('settings', 'main', { commissionRate: v, dispatchMin: m, dispatchKm: k, updatedAt: Date.now(), updatedBy: ADMIN.id }); $('feeSaved').textContent = `已儲存：每 100 元車資回 ${v} 點；只派給 ${m} 分鐘${k ? '、' + k + ' 公里' : ''}車程內的司機`; } catch (x) { fail(x); }
});
function renderWallet() {
  if (!ADMIN || !$('walletRows')) return;
  const t0 = todayStart();
  const rows = DRIVERS.slice().sort((a, b) => (a.balance || 0) - (b.balance || 0));
  $('walletRows').innerHTML = rows.length ? rows.map(d => {
    const mine = LEDGER.filter(x => x.driverPhone === d.id);
    const today = mine.filter(x => x.type === 'commission' && x.createdAt >= t0).reduce((a, x) => a - x.amount, 0);
    const top = mine.filter(x => x.type === 'topup').reduce((a, x) => a + x.amount, 0);
    const low = (d.balance || 0) < needFor(SETTINGS.commissionRate, 0);
    return `<tr>
      <td data-label="司機"><div class="name">${esc(d.name)}</div><div class="small">${esc(d.id)} · ${esc(d.plate || '')}</div></td>
      <td data-label="目前點數" class="num"><b class="${low ? 'bal-low' : ''}" style="font-size:18px">${fmt(d.balance || 0)}</b>${low ? '<div class="small bal-low">點數偏低</div>' : ''}</td>
      <td data-label="今日扣點" class="num">${fmt(today)}</td>
      <td data-label="累計儲值" class="num">${fmt(top)}</td>
      <td data-label="操作"><div class="rowact"><button class="sbtn primary" type="button" data-topup="${esc(d.id)}">儲值</button><button class="sbtn" type="button" data-deductpt="${esc(d.id)}">扣點</button><button class="sbtn" type="button" data-ledgerof="${esc(d.id)}">明細</button></div></td></tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty">還沒有司機帳號</div></td></tr>';
  const opts = '<option value="">全部司機</option>' + DRIVERS.map(d => `<option value="${esc(d.id)}">${esc(d.name)}（${esc(d.id)}）</option>`).join('');
  if ($('ledgerFilter').innerHTML !== opts) { $('ledgerFilter').innerHTML = opts; $('ledgerFilter').value = ledgerFilter; }
  const name = id => (DRIVERS.find(d => d.id === id) || {}).name || id;
  const list = LEDGER.filter(x => !ledgerFilter || x.driverPhone === ledgerFilter).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 300);
  const dt = t => new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  $('ledgerRows').innerHTML = list.length ? list.map(x => `<tr>
    <td data-label="日期" class="num">${dt(x.createdAt)}</td>
    <td data-label="司機">${esc(name(x.driverPhone))}</td>
    <td data-label="類型">${esc(BBC.LEDGER_TEXT[x.type] || x.type)}${x.rideId ? `<div class="small">${esc(x.rideId)}</div>` : ''}</td>
    <td data-label="入扣帳" class="num ${x.amount >= 0 ? 'amt-plus' : 'amt-minus'}">${x.amount >= 0 ? '+' : ''}${fmt(x.amount)}</td>
    <td data-label="當時餘額" class="num">${fmt(x.before)}</td>
    <td data-label="結算餘額" class="num">${fmt(x.after)}</td>
    <td data-label="地址／備註">${esc(x.address || '')}${x.address && x.note ? '<div class="small">' + esc(x.note) + '</div>' : esc(x.address ? '' : (x.note || '—'))}</td></tr>`).join('')
    : '<tr><td colspan="7"><div class="empty">還沒有點數紀錄</div></td></tr>';
}
$('ledgerFilter').addEventListener('change', () => { ledgerFilter = $('ledgerFilter').value; renderWallet(); });
function pointsDialog(id, mode) {
  const d = DRIVERS.find(x => x.id === id); if (!d) return;
  const add = mode === 'topup';
  modal(`<h3 id="modalTitle">${add ? '幫 ' + esc(d.name) + ' 儲值' : '扣 ' + esc(d.name) + ' 的點數'}</h3>
    <p class="sub">目前 ${fmt(d.balance || 0)} 點</p>
    <form class="form" id="ptForm" novalidate>
      ${add ? `<div class="chips">${[300, 500, 1000, 2000].map(v => `<button type="button" class="chip" data-quick="${v}">+${v}</button>`).join('')}</div>` : ''}
      <div class="field"><label for="pt-amt">${add ? '儲值點數' : '扣除點數'}</label><input id="pt-amt" type="number" inputmode="numeric" min="1" step="1"></div>
      <div class="field"><label for="pt-note">備註</label><input id="pt-note" placeholder="${add ? '例如 現金儲值、轉帳末五碼 12345' : '例如 違規扣點、修正錯誤'}" autocomplete="off"></div>
      <p class="err" id="ptErr" role="alert"></p>
      <div class="mrow"><button class="sbtn" type="button" data-close>取消</button><button class="btn ${add ? 'blue' : 'red'}" type="submit">${add ? '確認儲值' : '確認扣點'}</button></div>
    </form>`);
  $('modalCard').querySelectorAll('[data-quick]').forEach(b => b.onclick = () => { $('pt-amt').value = b.dataset.quick; });
  $('ptForm').addEventListener('submit', async e => {
    e.preventDefault();
    const v = parseInt($('pt-amt').value, 10), err = $('ptErr');
    if (!(v > 0)) return err.textContent = '請輸入大於 0 的整數';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const res = await db.adjustBalance(id, add ? v : -v, { type: add ? 'topup' : 'deduct', note: $('pt-note').value.trim() || (add ? '管理員儲值' : '管理員扣點'), by: ADMIN.id }, add ? {} : { noNegative: true });
      closeModal(); toast(`${d.name}：${add ? '+' : '-'}${v} 點，目前 ${fmt(res.after)} 點`);
    } catch (x) { btn.disabled = false; console.error(x); if (x.code === 'insufficient') return err.textContent = `只剩 ${fmt(x.balance)} 點，不能扣到負數`; err.textContent = (x.code === 'permission-denied' ? '雲端規則還沒更新（見上方說明）' : '失敗：' + (x.code || x.message)); if (x.code === 'permission-denied') $('rulesBanner').hidden = false; }
  });
}

// ---------- 和司機傳訊息（存在司機資料的 msgs 欄位） ----------
// 每張行程有自己的對話（訊息帶 r = 行程編號）；沒有行程時是「一般」對話
const unreadOf = (d, rid) => (d.msgs || []).filter(m => m.f === 'd' && m.at > (d.readA || 0) && (rid === undefined || (m.r || '') === rid)).length;
const activeRideOf = id => RIDES.find(r => r.driverPhone === id && ['assigned', 'pickup', 'trip'].includes(r.status));
const ADMIN_QUICK = ['收到', '請盡快前往上車點', '乘客已在路邊等候', '乘客取消了，請回到線上', '請回電給管理平台'];
function msgDialog(id, rideId) {
  const d = DRIVERS.find(x => x.id === id); if (!d) return;
  if (rideId === undefined) { const a = activeRideOf(id); rideId = a ? a.id : ''; }   // 從司機列表開：有進行中的行程就開那張單的對話
  MSG_OPEN = id; MSG_RIDE = rideId || '';
  const r = MSG_RIDE && RIDES.find(x => x.id === MSG_RIDE);
  modal(`<h3 id="modalTitle">和 ${esc(d.name)} 的訊息</h3><p class="sub">${esc(d.id)} · ${esc(d.plate || '')} · ${MSG_RIDE ? '行程 ' + esc(MSG_RIDE) + ' 專用對話' + (r ? '（' + esc(r.from) + '）' : '') : '一般對話（目前沒有行程）'}</p>
    <div class="amsgs" id="amsgs" aria-live="polite"></div>
    <div class="chips">${ADMIN_QUICK.map(q => `<button type="button" class="chip" data-aq="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="form" id="amForm" novalidate style="flex-direction:row;gap:8px">
      <label for="am-in" class="sr">輸入訊息</label><input id="am-in" placeholder="輸入要傳給司機的訊息…" autocomplete="off" style="flex:1;min-width:0">
      <button class="sbtn primary" type="submit">傳送</button>
    </form>
    <div class="mrow"><button class="sbtn" type="button" data-close>關閉</button></div>`);
  $('modalCard').querySelectorAll('[data-aq]').forEach(b => b.onclick = () => sendToDriver(id, b.dataset.aq));
  // 其他行程的對話不顯示在這裡
  $('amForm').addEventListener('submit', e => { e.preventDefault(); sendToDriver(id, $('am-in').value); $('am-in').value = ''; $('am-in').focus(); });
  renderMsgDialog(); $('am-in').focus();
}
function renderMsgDialog() {
  const d = DRIVERS.find(x => x.id === MSG_OPEN), box = $('amsgs'); if (!d || !box) return;
  const list = (d.msgs || []).filter(m => (m.r || '') === MSG_RIDE);
  box.innerHTML = list.length ? list.map(m => `<div class="am ${m.f === 'a' ? 'me' : ''}"><div>${esc(m.t)}</div><span>${m.f === 'a' ? esc(m.by || '管理員') + ' · ' : ''}${BBC.hhmm(m.at)}</span></div>`).join('')
    : '<p class="sub" style="text-align:center">還沒有訊息</p>';
  box.scrollTop = box.scrollHeight;
  if (unreadOf(d, MSG_RIDE)) { d.readA = Date.now(); db.set('drivers', d.id, { readA: d.readA }).catch(() => {}); }
}
async function sendToDriver(id, text) {
  text = (text || '').trim(); const d = DRIVERS.find(x => x.id === id); if (!text || !d) return;
  const m = { f: 'a', t: text.slice(0, 300), at: Date.now(), by: ADMIN.name || ADMIN.id, r: MSG_RIDE || '' };
  d.msgs = (d.msgs || []).concat(m).slice(-80); d.readA = m.at; renderMsgDialog();
  try { await db.set('drivers', id, { msgs: d.msgs, msgAtA: m.at, readA: m.at }); } catch (x) { fail(x); }
}

// 派單時預估要扣的點數（舊行程是固定點數）
function rideNeed(r) {
  const rate = BBC.rideRate(r);
  if (rate != null) return needFor(rate, r.estFare);
  return r.commission || 0;
}
function commissionText(r) {
  const rate = BBC.rideRate(r);
  if (rate != null) {
    if (r.status === 'done') return `<span class="t" style="display:block">回金 ${fmt(r.commissionFee || BBC.commissionOf(r.finalFare, rate))} 點${r.commissionLedger ? '（已扣）' : '（扣點中）'}</span>`;
    return rate ? `<span class="t" style="display:block">回金 每100元 ${fmt(rate)} 點</span>` : '';
  }
  if (!r.commission) return '';
  return `<span class="t" style="display:block">回金 ${fmt(r.commission)} 點${r.commissionRefundLedger ? '（已退還）' : r.commissionLedger ? '（已扣）' : ''}</span>`;
}

async function cleanJunk() {
  const list = JUNK.slice();
  if (!list.length) return;
  $('junkBtn').disabled = true; $('junkBtn').textContent = '清除中…';
  let ok = 0;
  for (const d of list) { try { await db.remove('drivers', d.id); ok++; } catch (x) { console.error(x); } }
  $('junkBtn').disabled = false; $('junkBtn').textContent = '一鍵清除';
  toast(`已清除 ${ok} 筆無效資料`);
}

// ---------- 點擊 ----------
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-close]') || t.id === 'modal') return closeModal();
  const dm = t.closest('[data-dismiss]');
  if (dm) { $(dm.dataset.dismiss).hidden = true; try { sessionStorage.setItem('bbc_hide_' + dm.dataset.dismiss, '1'); } catch (e) {} return; }
  const mt = t.closest('[data-mt]');
  if (mt) { setView(mt.dataset.mt); return; }
  const rf = t.closest('[data-rf]'); if (rf) { rideFilter = rf.dataset.rf; return renderRides(); }
  const df = t.closest('[data-df]'); if (df) { driverFilter = df.dataset.df; return renderDrivers(); }
  const as = t.closest('[data-assign]');
  if (as) { const s = document.querySelector(`[data-pick="${CSS.escape(as.dataset.assign)}"]`); return assign(as.dataset.assign, s ? s.value : ''); }
  const un = t.closest('[data-unassign]'); if (un) return unassign(un.dataset.unassign);
  const cc = t.closest('[data-cancel]'); if (cc) return cancelRide(cc.dataset.cancel);
  const mg = t.closest('[data-msg]'); if (mg) return msgDialog(mg.dataset.msg, mg.dataset.msgride);
  const tg = t.closest('[data-toggle]'); if (tg) return toggleDriver(tg.dataset.toggle);
  const rp = t.closest('[data-resetpw]'); if (rp) return resetPwDialog(rp.dataset.resetpw);
  const ap = t.closest('[data-approve]'); if (ap) return approveDriver(ap.dataset.approve);
  const dd = t.closest('[data-deldrv]'); if (dd) return deleteDriverDialog(dd.dataset.deldrv);
  const rt = t.closest('[data-route]'); if (rt) return routeDialog(rt.dataset.route);
  if (t.closest('#fitMapBtn')) return fitDriverMap();
  const tu = t.closest('[data-topup]'); if (tu) return pointsDialog(tu.dataset.topup, 'topup');
  const dp = t.closest('[data-deductpt]'); if (dp) return pointsDialog(dp.dataset.deductpt, 'deduct');
  const lo = t.closest('[data-ledgerof]'); if (lo) { ledgerFilter = lo.dataset.ledgerof; renderWallet(); $('ledgerFilter').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (t.closest('#addDriverBtn')) return addDriverDialog();
  if (t.closest('#junkBtn')) return cleanJunk();
  if (t.closest('#pwBtn') || t.closest('#bannerPwBtn')) return adminPwDialog();
  if (t.closest('#logoutBtn')) { session.del(); return showLogin(); }
});

// ---------- 啟動 ----------
(async function start() {
  const user = session.get();
  if (!user) return showLogin();
  try {
    const a = await db.get('admins', user);
    if (a) enter(a); else { session.del(); showLogin(); }
  } catch (x) { console.error(x); showLogin(); $('loginErr').textContent = '連線失敗，請檢查網路後重新整理'; }
})();
})();

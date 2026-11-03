// 蹦蹦車 管理平台：手動派單、行程即時看板、司機動態與帳號管理
(function () {
'use strict';
const { db, esc, fmt, KHH, ALL_SPOTS, STATUS_TEXT, DRIVER_TEXT } = BBC;
const $ = id => document.getElementById(id);
const DEFAULT_ADMIN = { user: 'admin', pw: '123456' };
const ACTIVE = ['pending', 'assigned', 'pickup', 'trip'];

let ADMIN = null, RIDES = [], DRIVERS = [], JUNK = [], LEDGER = [], SETTINGS = { commissionRate: BBC.DEFAULT_RATE };
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
  unsub.push(db.watch('rides', l => { RIDES = l; renderAll(); }));
  unsub.push(db.watch('drivers', l => { JUNK = l.filter(d => !BBC.isRealDriver(d)); DRIVERS = l.filter(BBC.isRealDriver); renderAll(); }));
  unsub.push(db.watch('ledger', l => { LEDGER = l; $('rulesBanner').hidden = true; renderWallet(); }));
  unsub.push(db.watch('settings', l => { const m = l.find(x => x.id === 'main'); if (m) SETTINGS = Object.assign({ commissionRate: BBC.DEFAULT_RATE }, m, { commissionRate: m.commissionRate != null ? m.commissionRate : BBC.DEFAULT_RATE }); applyFeeDefault(); renderWallet(); }));
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
function nearestDriver(fromText, fromArea, exclude, feeArg, coords) {
  const p = coords || BBC.locate(fromText, fromArea).c;
  const fee = feeArg != null ? feeArg : curNeed();
  const list = available(exclude).filter(d => enoughPoints(d, fee)).map(d => ({ d, km: driverKm(d, p) ?? 9999 })).sort((a, b) => a.km - b.km);
  return list[0] ? list[0].d : null;
}
function driverOptions(sel, exclude, withAuto, fromText, fromArea, coords, needArg) {
  const need = needArg != null ? needArg : curNeed();
  const list = available(exclude);
  const p = coords || (fromText ? BBC.locate(fromText, fromArea).c : null);
  const rows = list.map(d => ({ d, km: p ? driverKm(d, p) : null })).sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));
  let html = withAuto ? '<option value="">稍後指派（先放到待派單）</option><option value="__auto">自動派給最近的司機（GPS）</option>' : '<option value="">選擇司機…</option>';
  html += rows.length
    ? rows.map(({ d, km }) => `<option value="${esc(d.id)}"${sel === d.id ? ' selected' : ''}>${esc(d.name)} · ${esc(d.plate || '')}${km != null ? ' · 距上車點 ' + km.toFixed(1) + ' km（GPS）' : freshLoc(d) ? '' : ' · 未定位'} · ${fmt(d.balance || 0)} 點${enoughPoints(d, need) ? '' : '（點數不足）'}</option>`).join('')
    : '<option value="" disabled>目前沒有線上空車的司機</option>';
  return html;
}

// ---------- 派單 ----------
{
  const opts = KHH.map(a => `<option>${a.d}</option>`).join('');
  $('d-from-area').innerHTML = opts; $('d-to-area').innerHTML = opts;
  $('d-from-area').value = '三民區'; $('d-to-area').value = '三民區';
}
// ---------- 精準地址：邊打邊搜尋真實地點，地圖上可拖曳大頭針微調 ----------
const PICK = { from: null, to: null };      // { lat, lng, area }
const SUG = { from: [], to: [] };
let SUG_SEQ = { from: 0, to: 0 }, SUG_T = {}, SUG_AB = {};
let DPM = null, DPM_PIN = {}, MAP_TARGET = 'from';
const pickCoord = k => PICK[k] ? [PICK[k].lat, PICK[k].lng] : null;
function renderSug(k, msg) {
  const box = $('sug-' + k), q = $('d-' + k).value.trim();
  const items = SUG[k];
  box.innerHTML = items.map((x, i) => `<button type="button" role="option" data-sug="${k}:${i}"><b>${esc(x.label)}</b><span>${esc(x.sub || '')}</span></button>`).join('')
    + `<div class="msg">${msg || (items.length ? '' : '找不到符合的地點')}${q ? '　也可以按下方「在地圖上選」' : ''}</div>`;
  box.hidden = !q; $('d-' + k).setAttribute('aria-expanded', !box.hidden);
}
function localSug(q, area) {
  return ALL_SPOTS.filter(s => s.n.includes(q) || q.includes(s.n))
    .sort((a, b) => (b.d === area) - (a.d === area))
    .slice(0, 4).map(s => ({ label: s.n, sub: '高雄市' + s.d + ' · 常用地標', lat: s.c[0], lng: s.c[1], area: s.d }));
}
async function searchSug(k) {
  const q = $('d-' + k).value.trim(), area = $('d-' + k + '-area').value, my = ++SUG_SEQ[k];
  if (q.length < 2) { SUG[k] = []; $('sug-' + k).hidden = true; return; }
  SUG[k] = localSug(q, area); renderSug(k, '搜尋中…');
  if (SUG_AB[k]) SUG_AB[k].abort();
  SUG_AB[k] = new AbortController();
  try {
    const remote = await BBC.geoSearch(q, area, SUG_AB[k].signal);
    if (my !== SUG_SEQ[k]) return;
    const names = new Set(SUG[k].map(x => x.label));
    SUG[k] = SUG[k].concat(remote.filter(x => !names.has(x.label))).slice(0, 10);
    renderSug(k, remote.length ? '' : '地址資料庫找不到，可以換個寫法（例如只打路名），或在地圖上選');
  } catch (e) { if (e.name !== 'AbortError' && my === SUG_SEQ[k]) renderSug(k, '地址搜尋暫時無法使用，請在地圖上選位置'); }
}
function choose(k, x) {
  $('d-' + k).value = x.label;
  $('sug-' + k).hidden = true; $('d-' + k).setAttribute('aria-expanded', 'false');
  setPick(k, x);
}
function setPick(k, p) {
  PICK[k] = p ? { lat: p.lat, lng: p.lng, area: p.area || BBC.areaOf(p.lat, p.lng) } : null;
  if (PICK[k]) $('d-' + k + '-area').value = PICK[k].area;
  drawPickMap(); updateEstimate();
}
['from', 'to'].forEach(k => {
  const inp = $('d-' + k);
  inp.addEventListener('input', () => {
    PICK[k] = null;                       // 文字改了，原本的座標就不算數
    const s = ALL_SPOTS.find(p => p.n === inp.value.trim());
    if (s) setPick(k, { lat: s.c[0], lng: s.c[1], area: s.d }); else { drawPickMap(); updateEstimate(); }
    clearTimeout(SUG_T[k]); SUG_T[k] = setTimeout(() => searchSug(k), 350);
  });
  inp.addEventListener('focus', () => { MAP_TARGET = k; markTarget(); if (inp.value.trim().length >= 2 && !PICK[k]) searchSug(k); });
  inp.addEventListener('blur', () => setTimeout(() => { $('sug-' + k).hidden = true; inp.setAttribute('aria-expanded', 'false'); }, 180));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('sug-' + k).hidden && SUG[k][0]) { e.preventDefault(); choose(k, SUG[k][0]); }
    if (e.key === 'Escape') $('sug-' + k).hidden = true;
  });
  $('sug-' + k).addEventListener('mousedown', e => {
    const b = e.target.closest('[data-sug]'); if (!b) return;
    e.preventDefault(); const [kk, i] = b.dataset.sug.split(':'); choose(kk, SUG[kk][+i]);
  });
  $('d-' + k + '-area').addEventListener('change', () => { if (!PICK[k] && inp.value.trim().length >= 2) searchSug(k); });
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
  const keep = $('d-driver').value;
  $('d-driver').innerHTML = driverOptions(keep, [], true, $('d-from').value.trim(), $('d-from-area').value, pickCoord('from'));
  if ([...$('d-driver').options].some(o => o.value === keep)) $('d-driver').value = keep;
}
$('dispatchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('dispatchErr');
  const from = $('d-from').value.trim(), to = $('d-to').value.trim(), kmTxt = $('d-km').value.trim();
  if (!from) return err.textContent = '請輸入上車地址';
  if (kmTxt && !(parseFloat(kmTxt) > 0)) return err.textContent = '公里數要大於 0';
  const est = currentEstimate();
  let pick = $('d-driver').value, drv = null;
  if (pick === '__auto') {
    drv = nearestDriver(from, $('d-from-area').value, [], curNeed(), pickCoord('from'));
    if (!drv) return err.textContent = '目前沒有點數足夠的線上空車司機，可以改選「稍後指派」或先幫司機儲值';
  } else if (pick) drv = DRIVERS.find(d => d.id === pick);
  const now = Date.now();
  const ride = Object.assign({
    source: 'admin', createdBy: ADMIN.id, riderName: $('d-rider').value.trim() || '乘客', riderPhone: $('d-phone').value.trim(),
    note: $('d-note').value.trim(), from, to, declinedBy: [], createdAt: now, commissionRate: feeNow(),
    fromLat: PICK.from ? PICK.from.lat : null, fromLng: PICK.from ? PICK.from.lng : null,
    toLat: to && PICK.to ? PICK.to.lat : null, toLng: to && PICK.to ? PICK.to.lng : null,
    status: drv ? 'assigned' : 'pending', driverPhone: drv ? drv.id : '', driverName: drv ? (drv.name || drv.id) : '', plate: drv ? (drv.plate || '') : '',
    assignedAt: drv ? now : 0
  }, est);
  err.textContent = '建立中…';
  try {
    const id = await db.add('rides', ride);
    err.textContent = '';
    toast(drv ? `行程 ${id} 已派給 ${drv.name}` : `行程 ${id} 已建立，放在待派單`);
    ['d-rider', 'd-phone', 'd-from', 'd-to', 'd-note', 'd-km'].forEach(i => { $(i).value = ''; });
    PICK.from = PICK.to = null; $('pickBox').dataset.open = ''; drawPickMap();
    feeTouched = false; applyFeeDefault();
    updateEstimate();
    if (isMobile()) { rideFilter = 'active'; setView('rides'); renderRides(); }
  } catch (x) { fail(x); err.textContent = '建立失敗：' + (x.code || x.message || '請再試一次'); }
});

async function assign(rideId, phone) {
  const r = RIDES.find(x => x.id === rideId); if (!r) return;
  let d = phone === '__auto' ? nearestDriver(r.from, r.fromArea, r.declinedBy, rideNeed(r), BBC.fromCoord(r)) : DRIVERS.find(x => x.id === phone);
  if (!d) return toast(phone === '__auto' ? '目前沒有可派的線上司機' : '請先選擇司機');
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
      act = `<select data-pick="${esc(r.id)}" aria-label="選擇要派的司機">${driverOptions(keep[r.id], r.declinedBy, false, r.from, r.fromArea, BBC.fromCoord(r), rideNeed(r)).replace('<option value="">選擇司機…</option>', '<option value="">選擇司機…</option><option value="__auto">自動派給最近的司機（GPS）</option>')}</select>
        <button class="sbtn primary" type="button" data-assign="${esc(r.id)}">派單</button>
        ${(r.declinedBy || []).length ? `<span class="t">已被 ${r.declinedBy.length} 位司機拒絕</span>` : ''}
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'assigned') {
      act = `<span class="t">等待 ${esc(r.driverName)} 接單…</span>
        <button class="sbtn" type="button" data-unassign="${esc(r.id)}">收回改派</button>
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'pickup' || r.status === 'trip') {
      act = `<span class="t">${r.status === 'pickup' ? '司機前往上車點' : '開始跳表 ' + BBC.hhmm(r.startedAt)}${r.source === 'driver' ? ' · 司機手動建立' : ''}</span>
        <button class="sbtn" type="button" data-route="${esc(r.id)}">即時位置與路線</button>
        <button class="sbtn danger" type="button" data-cancel="${esc(r.id)}" style="margin-left:auto">取消行程</button>`;
    } else if (r.status === 'done') {
      act = `<span class="t">完成 ${BBC.hhmm(r.doneAt)} · ${esc(Math.round(r.finalMin || 0))} 分鐘 · ${r.distanceSource === 'gps' ? 'GPS 實際里程' : '估算里程'}${r.source === 'driver' ? ' · 司機手動建立' : ''}</span>
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
  const order = { busy: 0, online: 1, lost: 2, offline: 3, disabled: 4 };
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
setInterval(() => { if (ADMIN) { renderKpis(); renderDrivers(); } }, 10000);   // 更新「最後回報」與斷線判斷

// ---------- 對話框 ----------
function modal(html) { $('modalCard').innerHTML = html; $('modal').hidden = false; const f = $('modalCard').querySelector('input,select,button'); if (f) f.focus(); }
function closeModal() { clearInterval(ROUTE_T); const m = $('mMap'); if (m && m._map) { try { m._map.remove(); } catch (e) {} m._map = null; m._st = null; } $('modal').hidden = true; $('modalCard').innerHTML = ''; $('modalCard').style.width = ''; }
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
      ${L('里程', '<span id="mKmVal">' + esc(km != null ? km : 0) + ' 公里</span>（' + (r.distanceSource === 'gps' || (r.track || []).length > 1 ? 'GPS' : '估算') + '）')}
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
  $('feeHint').textContent = '預設每 100 元回 ' + SETTINGS.commissionRate + ' 點，行程結束才扣';
}
$('d-fee').addEventListener('input', () => { feeTouched = true; updateEstimate(); });
$('feeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = parseInt($('s-fee').value, 10);
  if (!(v >= 0)) return $('feeSaved').textContent = '請輸入 0 以上的整數';
  try { await db.set('settings', 'main', { commissionRate: v, updatedAt: Date.now(), updatedBy: ADMIN.id }); $('feeSaved').textContent = '已儲存：之後新派的單，每 100 元車資回 ' + v + ' 點'; } catch (x) { fail(x); }
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
  const tg = t.closest('[data-toggle]'); if (tg) return toggleDriver(tg.dataset.toggle);
  const rp = t.closest('[data-resetpw]'); if (rp) return resetPwDialog(rp.dataset.resetpw);
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

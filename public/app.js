'use strict';

/* ============================ State & helpers ============================ */

const State = { user: null, meta: null };
const charts = [];
const datepickers = [];

function destroyCharts() { while (charts.length) { try { charts.pop().destroy(); } catch (e) {} } }
function destroyDatepickers() { while (datepickers.length) { try { datepickers.pop().destroy(); } catch (e) {} } }

// Gắn bộ chọn lịch (flatpickr): bấm chọn từ lịch, hiển thị dd/mm/yyyy,
// nhưng giá trị bên trong vẫn là yyyy-mm-dd để lọc/lưu.
function initDatePicker(inp, defaultDate, onChange) {
  if (!window.flatpickr) { // dự phòng nếu thư viện không tải được
    inp.type = 'date';
    if (defaultDate) inp.value = defaultDate;
    if (onChange) inp.addEventListener('change', () => onChange(inp.value));
    return null;
  }
  const fp = flatpickr(inp, {
    dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: false,
    locale: (window.vn && window.vn.Vietnamese) || 'default',
    defaultDate: defaultDate || null,
    onChange: (sel, dateStr) => { if (onChange) onChange(dateStr); },
  });
  datepickers.push(fp);
  return fp;
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || 'Có lỗi xảy ra');
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

function toast(msg, type = 'ok') {
  const t = el('div', { class: 'toast ' + type }, msg);
  document.getElementById('toast-root').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2800);
}

function fmtDate(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; }
function fmtNum(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('vi-VN'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function statusBadge(s) {
  const map = { 'Đợi submit': 'amber', 'Chờ làm': 'gray', 'Đang làm': 'blue', 'Hoàn thành': 'green', 'Đã xong': 'green', 'Yêu cầu sửa': 'red', 'Hủy': 'darkred' };
  return el('span', { class: 'badge ' + (map[s] || 'gray') }, s);
}
function appStatusBadge(s) {
  const map = { 'Đang chạy': 'green', 'Đợi bàn giao': 'amber', 'Tạm dừng': 'gray', 'Dừng': 'red' };
  return el('span', { class: 'badge ' + (map[s] || 'gray') }, s);
}
function catPill(c) { return el('span', { class: 'cat-pill', title: c === 'video' ? 'Video' : 'Ảnh' }, c === 'video' ? '🎬' : '🖼️'); }
// Code app = "Mã - Tên app" (vd: QIP100 - Caller ID)
function appLabel(o) {
  if (o.app_code && o.app_name) return o.app_code + ' - ' + o.app_name;
  return o.app_code || o.app_name || '—';
}
// Nhãn loại editor
function editorTypeLabel(t) {
  return ({ graphic: 'Graphic Designer', video: 'Video Editor', video_lead: 'Video Editor Lead', uiux: 'UI/UX Designer', designer: 'Graphic Designer', both: 'Graphic+Video' })[t] || t || '';
}
// Vai trò "người order" (tạo + xem order của mình)
const ORDERER_ROLES = ['ua', 'aso', 'po', 'hr'];
const isOrdererRole = (r) => ORDERER_ROLES.includes(r);
const isLeadUser = (u) => u && u.role === 'editor' && u.editor_type === 'video_lead';
const SIMPLE_ROLE_LABEL = { ua: 'UA', aso: 'ASO', po: 'PO', hr: 'HR', admin: 'Admin' };
// Badge vai trò có màu riêng cho dễ phân biệt
function roleBadge(u) {
  const simple = { admin: 'red', ua: 'blue', aso: 'teal', po: 'indigo', hr: 'pink' };
  if (simple[u.role]) return el('span', { class: 'badge ' + simple[u.role] }, SIMPLE_ROLE_LABEL[u.role] || u.role);
  const map = { graphic: 'green', video: 'amber', video_lead: 'orange', uiux: 'purple' };
  return el('span', { class: 'badge ' + (map[u.editor_type] || 'green') }, editorTypeLabel(u.editor_type));
}
// Các vai trò user, mã hóa role[:editor_type]
const USER_ROLES = [
  ['ua', 'UA'],
  ['aso', 'ASO'],
  ['po', 'PO'],
  ['hr', 'HR'],
  ['editor:graphic', 'Graphic Designer'],
  ['editor:video', 'Video Editor'],
  ['editor:video_lead', 'Video Editor Lead'],
  ['editor:uiux', 'UI/UX Designer'],
  ['admin', 'Admin'],
];
function userRoleValue(u) {
  if (!u) return 'ua';
  if (u.role === 'editor') {
    const t = ['graphic', 'video', 'video_lead', 'uiux'].includes(u.editor_type) ? u.editor_type : 'graphic';
    return 'editor:' + t;
  }
  return u.role;
}

/* ============================ Modal ============================ */

function openModal({ title, body, footer, wide }) {
  const root = document.getElementById('modal-root');
  const close = () => { root.innerHTML = ''; };
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'modal' + (wide ? ' wide' : '') },
      el('div', { class: 'modal-head' }, el('h2', {}, title), el('button', { class: 'close', onclick: close }, '×')),
      el('div', { class: 'modal-body' }, body),
      footer ? el('div', { class: 'modal-foot' }, footer) : null,
    )
  );
  root.innerHTML = '';
  root.appendChild(overlay);
  return close;
}

function confirmDialog(message, onYes) {
  const close = openModal({
    title: 'Xác nhận',
    body: el('p', {}, message),
    footer: [
      el('button', { class: 'btn', onclick: () => close() }, 'Hủy'),
      el('button', { class: 'btn danger', onclick: async () => { close(); await onYes(); } }, 'Đồng ý'),
    ],
  });
}

/* ============================ Auth ============================ */

async function boot() {
  try {
    const { user } = await api('/me');
    State.user = user;
    State.meta = await api('/meta');
    if (!location.hash) location.hash = '#/dashboard';
    renderShell();
  } catch (e) {
    renderLogin();
  }
}

function renderLogin() {
  const app = document.getElementById('app');
  const form = el('form', { class: 'login-card' },
    el('div', { class: 'login-logo' }, '🎨'),
    el('h1', {}, 'Order Creatives'),
    el('div', { class: 'sub' }, 'Hệ thống quản lý order ảnh & video quảng cáo'),
    el('div', { class: 'field' }, el('label', {}, 'Tên đăng nhập'), el('input', { id: 'lg-user', autofocus: true, placeholder: 'vd: admin, manhvd, khai' })),
    el('div', { class: 'field' }, el('label', {}, 'Mật khẩu'), el('input', { id: 'lg-pass', type: 'password', placeholder: '••••••' })),
    el('button', { class: 'btn primary', type: 'submit', style: 'width:100%; justify-content:center; padding:11px;' }, 'Đăng nhập'),
    el('div', { class: 'login-hint' }, 'Demo: admin / admin123 — UA: manhvd / 123456 — Editor: khai / 123456'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('lg-user').value;
    const password = document.getElementById('lg-pass').value;
    try {
      const { user } = await api('/login', { method: 'POST', body: { username, password } });
      State.user = user;
      State.meta = await api('/meta');
      location.hash = '#/dashboard';
      renderShell();
    } catch (err) { toast(err.message, 'err'); }
  });
  app.innerHTML = '';
  app.appendChild(el('div', { class: 'login-wrap' }, form));
}

async function logout() {
  await api('/logout', { method: 'POST' });
  State.user = null; location.hash = '';
  renderLogin();
}

/* ============================ Shell & routing ============================ */

const NAV = {
  admin: [
    ['#/dashboard', '📊', 'Tổng quan'],
    ['#/orders', '📋', 'Quản lý Order'],
    ['#/apps', '📱', 'Quản lý App'],
    ['#/users', '👥', 'Quản lý User'],
    ['#/reports', '📈', 'Báo cáo'],
    ['#/settings', '⚙️', 'Cài đặt'],
  ],
  ua: [
    ['#/dashboard', '📊', 'Tổng quan'],
    ['#/new', '➕', 'Tạo Order'],
    ['#/orders', '📋', 'Order của tôi'],
  ],
  editor: [
    ['#/dashboard', '📊', 'Tổng quan'],
    ['#/orders', '📋', 'Order được giao'],
  ],
};
// ASO/PO/HR: giống UA — tạo order + xem order của mình
const ORDERER_NAV = [
  ['#/dashboard', '📊', 'Tổng quan'],
  ['#/new', '➕', 'Tạo Order'],
  ['#/orders', '📋', 'Order của tôi'],
];
['aso', 'po', 'hr'].forEach(r => { NAV[r] = ORDERER_NAV; });
// Lead: quản lý order như Admin + báo cáo team
const LEAD_NAV = [
  ['#/dashboard', '📊', 'Tổng quan'],
  ['#/orders', '📋', 'Quản lý Order'],
  ['#/reports', '📈', 'Báo cáo'],
];
function navFor(u) { return isLeadUser(u) ? LEAD_NAV : (NAV[u.role] || []); }

function renderShell() {
  const app = document.getElementById('app');
  const u = State.user;
  const nav = navFor(u);

  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' },
    el('div', { class: 'brand' }, '🎨 Creatives'),
    el('nav', {}, nav.map(([href, ico, label]) => el('a', { href, 'data-route': href }, el('span', {}, ico), el('span', {}, label)))),
    el('div', { class: 'user-box' },
      el('div', { class: 'name' }, u.full_name),
      el('div', { class: 'role' }, u.role === 'editor' ? editorTypeLabel(u.editor_type) : (SIMPLE_ROLE_LABEL[u.role] || u.role)),
      el('button', { class: 'btn sm', style: 'margin-top:10px; width:100%; justify-content:center;', onclick: logout }, 'Đăng xuất'),
    ),
  );

  const main = el('div', { class: 'main' },
    el('div', { class: 'topbar' },
      el('button', { class: 'hamburger', onclick: () => { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('backdrop').classList.toggle('show'); } }, '☰'),
      el('div', { class: 'page-title', id: 'page-title' }, ''),
    ),
    el('div', { class: 'content', id: 'content' }, el('div', { class: 'spinner' })),
  );

  app.innerHTML = '';
  app.appendChild(el('div', { class: 'layout' },
    sidebar, main,
    el('div', { class: 'overlay-backdrop', id: 'backdrop', onclick: () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('backdrop').classList.remove('show'); } }),
  ));
  route();
}

function setActiveNav(hash) {
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-route') === '#/' + hash.split('/')[1]);
  });
}

const ROUTES = {
  dashboard: viewDashboard,
  orders: viewOrders,
  new: viewNewOrder,
  apps: viewApps,
  users: viewUsers,
  reports: viewReports,
  settings: viewSettings,
};

async function refreshMeta() { State.meta = await api('/meta'); }

function route() {
  if (!State.user) return;
  destroyCharts();
  destroyDatepickers();
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('backdrop')?.classList.remove('show');
  const hash = location.hash.replace('#/', '') || 'dashboard';
  const key = hash.split('/')[0];
  const allowed = navFor(State.user).map(n => n[0].replace('#/', ''));
  const fn = ROUTES[key];
  if (!fn || (!allowed.includes(key) && key !== 'dashboard')) { location.hash = '#/dashboard'; return; }
  setActiveNav(location.hash);
  const content = document.getElementById('content');
  content.innerHTML = '<div class="spinner"></div>';
  Promise.resolve(fn(content)).catch(e => {
    content.innerHTML = '';
    content.appendChild(el('div', { class: 'empty' }, el('div', { class: 'ico' }, '⚠️'), e.message));
  });
}

window.addEventListener('hashchange', route);

function setTitle(t) { const n = document.getElementById('page-title'); if (n) n.textContent = t; }

/* ============================ Dashboard ============================ */

async function viewDashboard(c) {
  setTitle('Tổng quan');
  if (State.user.role === 'admin') return dashboardAdmin(c);
  if (isLeadUser(State.user)) return dashboardLead(c);
  if (State.user.role === 'editor') return dashboardEditor(c);
  return dashboardOrderer(c);
}

// Dashboard cho Lead: tổng quan toàn bộ order + khối lượng đang làm của team
async function dashboardLead(c) {
  const orders = await api('/orders');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name), el('span', { class: 'muted' }, '· Team Creatives')));
  const cnt = (s) => orders.filter(o => o.status === s).length;
  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Đợi submit', cnt('Đợi submit'), '📤'),
    statCard('Đang làm', cnt('Đang làm'), '🔨'),
    statCard('Chờ làm', cnt('Chờ làm'), '⏳'),
    statCard('Hoàn thành', cnt('Hoàn thành'), '✅'),
  ));

  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Khối lượng đang làm theo người', 'l-load'));
  g.appendChild(chartCard('Order theo trạng thái', 'l-status'));
  c.appendChild(g);

  // Khối lượng đang làm (Chờ làm/Đang làm/Yêu cầu sửa) theo editor
  const active = ['Chờ làm', 'Đang làm', 'Yêu cầu sửa'];
  const load = {};
  orders.forEach(o => { if (active.includes(o.status) && o.editor_name) load[o.editor_name] = (load[o.editor_name] || 0) + 1; });
  const byStatus = {};
  orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
  setTimeout(() => {
    drawBar('l-load', Object.keys(load), Object.values(load), 'Đang phụ trách', '#d97706');
    drawPie('l-status', Object.keys(byStatus), Object.values(byStatus));
  }, 0);
}

function rangeQuery(days) {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - days);
  return `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
}

async function dashboardAdmin(c) {
  const q = rangeQuery(30);
  const [summary, uaRep, edRep] = await Promise.all([
    api('/reports/summary?' + q), api('/reports/ua?' + q), api('/reports/editor?' + q),
  ]);
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Tổng quan'), el('span', { class: 'muted' }, '· 30 ngày gần nhất')));

  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Tổng order', summary.total_orders, '📋'),
    statCard('Tổng điểm', fmtNum(summary.total_points), '⭐'),
    statCard('Chưa giao', summary.unassigned, '📭'),
    statCard('Hoàn thành', (summary.byStatus.find(s => s.status === 'Hoàn thành') || {}).c || 0, '✅'),
  ));

  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Order theo trạng thái', 'ch-status'));
  g.appendChild(chartCard('Order theo loại (Ảnh/Video)', 'ch-cat'));
  c.appendChild(g);

  const g2 = el('div', { class: 'grid-2', style: 'margin-top:16px;' });
  g2.appendChild(chartCard('Top UA (số order)', 'ch-ua'));
  g2.appendChild(chartCard('Top Editor (điểm)', 'ch-ed'));
  c.appendChild(g2);

  c.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:16px;' },
    el('h3', {}, 'Đơn hàng theo ngày'),
    el('div', { class: 'chart-box' }, el('canvas', { id: 'ch-timeline' })),
  ));

  setTimeout(() => {
    drawPie('ch-status', summary.byStatus.map(s => s.status), summary.byStatus.map(s => s.c));
    drawPie('ch-cat', summary.byCategory.map(s => s.category === 'video' ? 'Video' : 'Ảnh'), summary.byCategory.map(s => s.c));
    drawBar('ch-ua', uaRep.perUser.slice(0, 8).map(u => u.full_name), uaRep.perUser.slice(0, 8).map(u => u.total_orders), 'Số order');
    drawBar('ch-ed', edRep.perUser.slice(0, 8).map(u => u.full_name), edRep.perUser.slice(0, 8).map(u => u.total_points || 0), 'Điểm', '#16a34a');
    drawLine('ch-timeline', uaRep.timeline.map(t => fmtDate(t.day)), uaRep.timeline.map(t => t.cnt));
  }, 0);
}

// Dashboard cho người order (UA/ASO/PO/HR) — tính từ order của chính mình
async function dashboardOrderer(c) {
  const orders = await api('/orders');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name),
    el('span', { class: 'spacer' }), el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order mới')));

  const cnt = (s) => orders.filter(o => o.status === s).length;
  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Tổng order đã tạo', orders.length, '📋'),
    statCard('Hoàn thành', cnt('Hoàn thành'), '✅'),
    statCard('Đợi submit', cnt('Đợi submit'), '📤'),
    statCard('Đang chờ/làm', orders.filter(o => o.status === 'Chờ làm' || o.status === 'Đang làm').length, '⏳'),
  ));

  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Order theo trạng thái', 'ch-st'));
  g.appendChild(chartCard('Breakdown theo loại order', 'ch-type'));
  c.appendChild(g);

  const byStatus = {}, byType = {};
  orders.forEach(o => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    const k = o.order_type_name || '—'; byType[k] = (byType[k] || 0) + 1;
  });
  setTimeout(() => {
    drawPie('ch-st', Object.keys(byStatus), Object.values(byStatus));
    drawBar('ch-type', Object.keys(byType).slice(0, 10), Object.values(byType).slice(0, 10), 'Số order');
  }, 0);
}

async function dashboardEditor(c) {
  const q = rangeQuery(30);
  const rep = await api('/reports/editor?' + q);
  const orders = await api('/orders');
  const mine = rep.perUser[0] || { total_orders: 0, done_orders: 0, total_points: 0, avg_days: null };
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name)));

  const todo = orders.filter(o => o.status === 'Chờ làm' || o.status === 'Yêu cầu sửa').length;
  const doing = orders.filter(o => o.status === 'Đang làm').length;
  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Được giao (30N)', mine.total_orders || 0, '📋'),
    statCard('Đã hoàn thành', mine.done_orders || 0, '✅'),
    statCard('Tổng điểm', fmtNum(mine.total_points), '⭐'),
    statCard('TG hoàn thành TB', mine.avg_days != null ? fmtNum(mine.avg_days) + ' ngày' : '—', '⏱️'),
  ));
  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Cần làm', todo, '📥'),
    statCard('Đang làm', doing, '🔨'),
  ));

  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Hoàn thành theo ngày', 'ch-tl'));
  g.appendChild(chartCard('Theo trạng thái', 'ch-st'));
  c.appendChild(g);
  setTimeout(() => {
    drawLine('ch-tl', rep.timeline.map(t => fmtDate(t.day)), rep.timeline.map(t => t.cnt));
    drawPie('ch-st', rep.byStatus.map(s => s.status), rep.byStatus.map(s => s.cnt));
  }, 0);
}

function statCard(label, value, icon) {
  return el('div', { class: 'stat' }, el('span', { class: 'icon' }, icon), el('div', { class: 'label' }, label), el('div', { class: 'value' }, String(value)));
}
function chartCard(title, canvasId) {
  return el('div', { class: 'card card-pad' }, el('h3', {}, title), el('div', { class: 'chart-box' }, el('canvas', { id: canvasId })));
}

/* ---- Chart helpers ---- */
const PALETTE = ['#4f46e5', '#16a34a', '#d97706', '#dc2626', '#0284c7', '#9333ea', '#db2777', '#0891b2', '#65a30d', '#ca8a04'];
function ctx(id) { const c = document.getElementById(id); return c ? c.getContext('2d') : null; }
function drawBar(id, labels, data, label, color) {
  const x = ctx(id); if (!x) return;
  charts.push(new Chart(x, { type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: color || '#4f46e5', borderRadius: 6 }] }, options: barOpts() }));
}
function drawLine(id, labels, data) {
  const x = ctx(id); if (!x) return;
  charts.push(new Chart(x, { type: 'line', data: { labels, datasets: [{ label: 'Số order', data, borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,.12)', fill: true, tension: .3, pointRadius: 3 }] }, options: barOpts() }));
}
function drawPie(id, labels, data) {
  const x = ctx(id); if (!x) return;
  charts.push(new Chart(x, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: PALETTE }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }));
}
function barOpts() { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }; }

/* ============================ Orders list ============================ */

let orderFilters = {};

async function viewOrders(c) {
  const role = State.user.role;
  const lead = isLeadUser(State.user);
  const canManage = role === 'admin' || lead;
  const title = lead ? 'Quản lý Order' : role === 'editor' ? 'Order được giao' : isOrdererRole(role) ? 'Order của tôi' : 'Quản lý Order';
  setTitle(title);

  const qs = new URLSearchParams(orderFilters).toString();
  const orders = await api('/orders' + (qs ? '?' + qs : ''));

  c.innerHTML = '';
  const head = el('div', { class: 'page-head' },
    el('h1', {}, title),
    el('span', { class: 'muted' }, '· ' + orders.length + ' order'),
    el('span', { class: 'spacer' }),
  );
  if (isOrdererRole(role)) head.appendChild(el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order'));
  if (role === 'admin') head.appendChild(el('button', { class: 'btn primary', onclick: () => openOrderForm(null) }, '➕ Tạo order'));
  c.appendChild(head);

  // Tab "Đợi submit" (có số lượng) cho Admin/Lead
  if (canManage) {
    let pending = 0;
    try { pending = (await api('/orders?status=' + encodeURIComponent('Đợi submit'))).length; } catch (e) {}
    const onPending = orderFilters.status === 'Đợi submit';
    c.appendChild(el('div', { class: 'tabs' },
      el('button', { class: onPending ? 'active' : '', onclick: () => { orderFilters.status = 'Đợi submit'; route(); } },
        '📤 Order Đợi submit', pending ? el('span', { class: 'tab-badge' }, String(pending)) : null),
      el('button', { class: !onPending ? 'active' : '', onclick: () => { delete orderFilters.status; route(); } }, 'Tất cả order'),
    ));
  }

  c.appendChild(renderOrderFilters());

  if (!orders.length) {
    c.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty' }, el('div', { class: 'ico' }, '📭'), 'Chưa có order nào')));
    return;
  }

  const showUA = role !== 'ua';

  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Loại'), el('th', {}, 'Mã'), el('th', {}, 'App'),
      showUA ? el('th', {}, 'Người order') : null, el('th', {}, 'Người làm'), el('th', {}, 'Trạng thái'), el('th', {}, 'Ngày order'), el('th', {}, 'Ngày hoàn thành'),
    )),
    el('tbody', {}, orders.map(o => {
      const tr = el('tr', { style: 'cursor:pointer', onclick: () => openOrderDetail(o.id) },
        el('td', {}, catPill(o.category)),
        el('td', {}, el('span', { class: 'code-cell' }, o.order_code)),
        el('td', {}, appLabel(o)),
        showUA ? el('td', {}, o.ua_name || '—') : null,
        el('td', {}, o.editor_name ? el('span', {}, o.editor_name) : el('span', { class: 'badge amber' }, 'Chưa giao')),
        el('td', {}, statusBadge(o.status)),
        el('td', { class: 'nowrap' }, fmtDate(o.order_date)),
        el('td', { class: 'nowrap' }, o.completed_at ? fmtDate(o.completed_at) : '—'),
      );
      return tr;
    })),
  );
  c.appendChild(el('div', { class: 'table-wrap' }, table));
}

function renderOrderFilters() {
  const wrap = el('div', { class: 'filters' });
  const meta = State.meta;
  const role = State.user.role;

  const apply = () => { route(); };

  wrap.appendChild(filterInput('search', 'Tìm kiếm', 'Mã / app / mô tả', apply));
  wrap.appendChild(filterSelect('status', 'Trạng thái', [['', 'Tất cả'], ...meta.statuses.map(s => [s, s])], apply));
  wrap.appendChild(filterSelect('category', 'Loại', [['', 'Tất cả'], ['image', 'Ảnh'], ['video', 'Video']], apply));
  if (role === 'admin' || isLeadUser(State.user)) {
    wrap.appendChild(filterSelect('ua_id', 'Người order', [['', 'Tất cả'], ...meta.uas.map(u => [u.id, u.full_name])], apply));
    wrap.appendChild(filterSelect('editor_id', 'Người làm', [['', 'Tất cả'], ['none', '— Chưa giao —'], ...meta.editors.map(u => [u.id, u.full_name])], apply));
  }
  wrap.appendChild(filterDate('from', 'Từ ngày', apply));
  wrap.appendChild(filterDate('to', 'Đến ngày', apply));
  if (Object.keys(orderFilters).length)
    wrap.appendChild(el('button', { class: 'btn sm', onclick: () => { orderFilters = {}; route(); } }, '✕ Xóa lọc'));
  return wrap;
}

function filterInput(key, label, ph, apply, type) {
  const inp = el('input', { type: type || 'text', placeholder: ph, value: orderFilters[key] || '' });
  inp.addEventListener('change', () => { if (inp.value) orderFilters[key] = inp.value; else delete orderFilters[key]; apply(); });
  if ((type || 'text') === 'text') inp.addEventListener('keydown', e => { if (e.key === 'Enter') { if (inp.value) orderFilters[key] = inp.value; else delete orderFilters[key]; apply(); } });
  return el('div', { class: 'field' }, el('label', {}, label), inp);
}
function filterSelect(key, label, options, apply) {
  const sel = el('select', {}, options.map(([v, t]) => el('option', { value: v, selected: String(orderFilters[key] || '') === String(v) }, t)));
  sel.addEventListener('change', () => { if (sel.value) orderFilters[key] = sel.value; else delete orderFilters[key]; apply(); });
  return el('div', { class: 'field' }, el('label', {}, label), sel);
}
// Ô chọn ngày bằng lịch (dd/mm/yyyy)
function filterDate(key, label, apply) {
  const inp = el('input', { type: 'text', placeholder: 'Chọn ngày', readonly: true });
  setTimeout(() => initDatePicker(inp, orderFilters[key] || null, (dateStr) => {
    if (dateStr) orderFilters[key] = dateStr; else delete orderFilters[key];
    apply();
  }), 0);
  return el('div', { class: 'field' }, el('label', {}, label), inp);
}

/* ============================ Order detail ============================ */

async function openOrderDetail(id) {
  const o = await api('/orders/' + id);
  const role = State.user.role;
  const meta = State.meta;

  const dl = el('dl', { class: 'detail-grid' });
  const add = (k, v) => { dl.appendChild(el('dt', {}, k)); dl.appendChild(el('dd', {}, v == null || v === '' ? '—' : v)); };
  add('Mã order', el('span', { class: 'code-cell' }, o.order_code));
  add('Loại', o.category === 'video' ? '🎬 Video' : '🖼️ Ảnh');
  add('App', appLabel(o));
  add('Đối tác', o.partner);
  add('Loại order', (o.order_type_name || '—') + (o.quantity_note ? ' · ' + o.quantity_note : ''));
  add('Người order', o.ua_name);
  add('Editor', o.editor_name || 'Chưa giao');
  add('Ngày order', fmtDate(o.order_date));
  add('Kích thước', o.size);
  if (o.category === 'video') add('Upload Youtube', o.need_youtube ? 'Có' : 'Không');
  add('Trạng thái', statusBadge(o.status));
  add('Điểm', fmtNum(o.points));
  if (o.completed_at) add('Hoàn thành', fmtDate(o.completed_at));
  add('Mô tả chi tiết', o.description);
  if (o.note_request) add('Lưu ý (UA)', o.note_request);
  if (o.ref_link) add('Ref link', el('a', { href: o.ref_link, target: '_blank' }, o.ref_link));
  if (o.link_figma) add('Link App/Figma', el('a', { href: o.link_figma, target: '_blank' }, o.link_figma));
  if (o.drive_link) add('Link Drive', el('a', { href: o.drive_link, target: '_blank' }, o.drive_link));
  if (o.youtube_link) add('Link Youtube', el('a', { href: o.youtube_link, target: '_blank' }, o.youtube_link));
  if (o.note) add('Note (Editor)', o.note);

  // Chỉ Hủy được khi chưa Hoàn thành và chưa Hủy
  const canCancel = o.status !== 'Hoàn thành' && o.status !== 'Hủy';
  const cancelOrder = () => confirmDialog('Hủy order ' + o.order_code + '? (không thể hoàn tác)', async () => {
    try { await api('/orders/' + o.id, { method: 'PUT', body: { status: 'Hủy' } }); toast('Đã hủy order'); closeM(); route(); }
    catch (e) { toast(e.message, 'err'); }
  });

  const isLead = isLeadUser(State.user);
  const footer = [];
  // Lead/Admin: giao việc & submit khi order đang "Đợi submit"
  if ((isLead || role === 'admin') && o.status === 'Đợi submit') {
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openSubmitDialog(o); } }, '✅ Giao việc & Submit'));
  }
  if (role === 'editor' && o.editor_id === State.user.id && o.status !== 'Đợi submit') footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openEditorUpdate(o); } }, '✏️ Cập nhật tiến độ'));
  if (role === 'admin' || isLead) {
    if (canCancel) footer.push(el('button', { class: 'btn danger', onclick: cancelOrder }, '🚫 Hủy order'));
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openOrderForm(o); } }, '✏️ Sửa'));
  }
  if (isOrdererRole(role) && o.ua_id === State.user.id) {
    if (o.status === 'Hoàn thành') footer.push(el('button', { class: 'btn', onclick: async () => { await api('/orders/' + o.id, { method: 'PUT', body: { status: 'Yêu cầu sửa' } }); toast('Đã gửi yêu cầu sửa'); closeM(); route(); } }, '↩️ Yêu cầu sửa'));
    if (canCancel) footer.push(el('button', { class: 'btn danger', onclick: cancelOrder }, '🚫 Hủy order'));
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openOrderForm(o); } }, '✏️ Sửa'));
  }
  footer.push(el('button', { class: 'btn', onclick: () => closeM() }, 'Đóng'));

  const closeM = openModal({ title: 'Chi tiết Order', body: dl, footer, wide: true });
}

/* ---- Editor quick update ---- */
function openEditorUpdate(o) {
  const meta = State.meta;
  const statusSel = el('select', { id: 'eu-status' }, meta.statuses.map(s => el('option', { value: s, selected: s === o.status }, s)));
  const drive = el('input', { id: 'eu-drive', value: o.drive_link || '', placeholder: 'https://drive.google.com/...' });
  const yt = el('input', { id: 'eu-yt', value: o.youtube_link || '', placeholder: 'https://youtu.be/...' });
  const note = el('textarea', { id: 'eu-note', placeholder: 'Ghi chú về output...' }, o.note || '');

  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Trạng thái'), statusSel),
    el('div', { class: 'field' }, el('label', {}, 'Link Drive (output)'), drive),
    o.need_youtube ? el('div', { class: 'field' }, el('label', {}, 'Link Youtube (output)'), yt) : null,
    el('div', { class: 'field' }, el('label', {}, 'Note'), note),
  );
  const save = async () => {
    if (statusSel.value === 'Hoàn thành') {
      if (!drive.value.trim()) return toast('Cần điền Link Drive trước khi Hoàn thành', 'err');
      if (o.need_youtube && !yt.value.trim()) return toast('Order này cần Link Youtube trước khi Hoàn thành', 'err');
    }
    try {
      await api('/orders/' + o.id, { method: 'PUT', body: { status: statusSel.value, drive_link: drive.value, youtube_link: yt.value, note: note.value } });
      toast('Đã cập nhật'); closeM(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: 'Cập nhật: ' + o.order_code, body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

/* ---- Lead/Admin: giao việc & submit ---- */
function openSubmitDialog(o) {
  const meta = State.meta;
  // chỉ cho chọn editor cùng loại creative (ảnh -> designer/uiux, video -> video/lead) + tất cả nếu muốn
  const editorSel = el('select', {}, el('option', { value: '' }, '— Chọn người làm —'),
    meta.editors.map(u => el('option', { value: u.id, selected: o.editor_id === u.id }, u.full_name + ' (' + editorTypeLabel(u.editor_type) + ')')));
  const body = el('div', {},
    el('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Chọn người thực hiện rồi bấm Submit. Sau khi submit, order chuyển sang "Chờ làm" và người được giao sẽ nhận được.'),
    el('div', { class: 'field' }, el('label', {}, 'Giao cho'), editorSel),
  );
  const submit = async () => {
    if (!editorSel.value) return toast('Vui lòng chọn người làm', 'err');
    try {
      await api('/orders/' + o.id, { method: 'PUT', body: { editor_id: Number(editorSel.value), status: 'Chờ làm' } });
      toast('Đã giao việc & submit'); closeM(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: 'Giao việc: ' + o.order_code, body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: submit }, '✅ Submit')] });
}

/* ============================ Order form (create/edit) ============================ */

async function viewNewOrder(c) {
  setTitle('Tạo Order');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Tạo Order mới')));
  const card = el('div', { class: 'card card-pad', style: 'max-width:760px' });
  c.appendChild(card);
  await buildOrderForm(card, null, true);
}

async function openOrderForm(order) {
  const body = el('div', {});
  const closeM = openModal({ title: order ? 'Sửa Order ' + order.order_code : 'Tạo Order mới', body, wide: true });
  await buildOrderForm(body, order, false, closeM);
}

// Dropdown có ô tìm kiếm. items: [{value, label}]. Trả { node, getValue }
function makeCombo(items, selectedValue, placeholder, onChange) {
  let value = (selectedValue != null && selectedValue !== '') ? String(selectedValue) : '';
  const wrap = el('div', { class: 'combo' });
  const display = el('button', { type: 'button', class: 'combo-display' });
  const panel = el('div', { class: 'combo-panel', style: 'display:none' });
  const search = el('input', { class: 'combo-search', placeholder: '🔍 Tìm app...' });
  const list = el('div', { class: 'combo-list' });
  panel.appendChild(search); panel.appendChild(list);
  wrap.appendChild(display); wrap.appendChild(panel);

  const labelFor = (v) => { const it = items.find(i => String(i.value) === String(v)); return it ? it.label : ''; };
  const renderDisplay = () => { display.textContent = value ? labelFor(value) : placeholder; display.classList.toggle('placeholder', !value); };
  const renderList = (filter) => {
    list.innerHTML = '';
    const f = (filter || '').trim().toLowerCase();
    const matched = items.filter(i => i.label.toLowerCase().includes(f));
    if (!matched.length) { list.appendChild(el('div', { class: 'combo-empty' }, 'Không tìm thấy')); return; }
    matched.forEach(i => {
      const opt = el('div', { class: 'combo-opt' + (String(i.value) === String(value) ? ' sel' : '') }, i.label);
      opt.addEventListener('click', () => { value = String(i.value); renderDisplay(); close(); if (onChange) onChange(value); });
      list.appendChild(opt);
    });
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) close(); };
  const open = () => { panel.style.display = ''; search.value = ''; renderList(''); setTimeout(() => search.focus(), 0); document.addEventListener('mousedown', onOutside, true); };
  const close = () => { panel.style.display = 'none'; document.removeEventListener('mousedown', onOutside, true); };
  display.addEventListener('click', (e) => { e.preventDefault(); panel.style.display === 'none' ? open() : close(); });
  search.addEventListener('input', () => renderList(search.value));
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  renderDisplay();
  return { node: wrap, getValue: () => value };
}

async function buildOrderForm(container, order, inline, closeM) {
  const meta = State.meta;
  const role = State.user.role;
  const isAdmin = role === 'admin' || isLeadUser(State.user);
  const apps = await api('/apps?active=1');
  const allApps = isAdmin && order ? await api('/apps') : apps;
  const appList = (order ? allApps : apps);

  const cat = el('select', {}, el('option', { value: 'image' }, '🖼️ Ảnh'), el('option', { value: 'video' }, '🎬 Video'));
  cat.value = order ? order.category : 'image';

  const typeSel = el('select', {});
  const fillTypes = () => {
    const cur = order ? order.order_type_id : null;
    typeSel.innerHTML = '';
    meta.orderTypes.filter(t => t.category === cat.value).forEach(t => {
      const label = t.name + (t.quantity_note && t.quantity_note !== '-' ? ' · ' + t.quantity_note : '');
      typeSel.appendChild(el('option', { value: t.id, selected: t.id === cur }, label));
    });
  };
  fillTypes();

  // App (bắt buộc) + ô tìm kiếm + link "Xem app" để kiểm tra đúng app
  const appHint = el('div', { style: 'margin-top:6px' });
  const updateAppLink = () => {
    appHint.innerHTML = '';
    const a = appList.find(x => x.id === Number(appCombo.getValue()));
    if (!a) return;
    if (a.link) appHint.appendChild(el('a', { class: 'app-view-link', href: a.link, target: '_blank' }, '🔗 Xem app'));
    else appHint.appendChild(el('span', { class: 'hint' }, 'App này chưa có link store'));
  };
  const appCombo = makeCombo(
    appList.map(a => ({ value: a.id, label: a.code + ' - ' + a.name })),
    order ? order.app_id : '',
    '— Chọn app —',
    () => updateAppLink()
  );

  // Order date = ngày tạo order, không cho chọn
  const orderDateDefault = order ? (order.order_date || '').slice(0, 10) : new Date().toISOString().slice(0, 10);
  const orderDateDisplay = el('input', { type: 'text', value: fmtDate(orderDateDefault), disabled: true });

  const desc = el('textarea', { placeholder: 'Mô tả chi tiết yêu cầu...' }, order ? order.description || '' : '');
  const ref = el('textarea', { placeholder: 'Dán một hoặc nhiều link (mỗi link một dòng)...', style: 'min-height:100px' }, order ? order.ref_link || '' : '');
  const noteReq = el('input', { value: order ? order.note_request || '' : '', placeholder: 'Lưu ý cho editor' });

  // Kích thước: Ảnh -> checkbox theo platform + Other; Video -> 3 lựa chọn (đa chọn)
  const initialSizes = order && order.size ? order.size.split(',').map(s => s.trim()).filter(Boolean) : [];
  let firstSizeRender = true;
  const sizeBox = el('div', {});
  const sizeCheckbox = (value, checked) => el('label', { class: 'size-check' },
    el('input', { type: 'checkbox', value, checked: checked ? true : false }), el('span', {}, value));
  const buildSizeSection = () => {
    const selected = new Set(firstSizeRender ? initialSizes : []);
    firstSizeRender = false;
    sizeBox.innerHTML = '';

    // Mỗi nhóm có "Tất cả" riêng, chỉ chọn các option trong nhóm đó
    const makeGroup = (title, arr) => {
      const groupAll = el('input', { type: 'checkbox' });
      const head = el('div', { class: 'size-group-head' },
        title ? el('span', { class: 'size-group-title' }, title) : null,
        el('label', { class: 'size-check size-group-all' }, groupAll, el('span', {}, 'Tất cả')));
      const row = el('div', { class: 'size-grid' });
      const boxes = arr.map(s => { const lbl = sizeCheckbox(s, selected.has(s)); row.appendChild(lbl); return lbl.querySelector('input'); });
      sizeBox.appendChild(head); sizeBox.appendChild(row);
      const sync = () => { groupAll.checked = boxes.length > 0 && boxes.every(b => b.checked); };
      boxes.forEach(b => b.addEventListener('change', sync));
      groupAll.addEventListener('change', () => boxes.forEach(b => { b.checked = groupAll.checked; }));
      sync();
    };

    if (cat.value === 'video') {
      sizeBox.appendChild(el('div', { class: 'hint', style: 'margin-bottom:6px' }, 'Chọn một hoặc nhiều (không bắt buộc):'));
      makeGroup(null, ['1080x1920', '1080x1080', '1920x1080']);
    } else {
      Object.entries(meta.sizes).forEach(([plat, arr]) => {
        if (plat === 'Other') return; // bỏ nhóm Other (512x512/1024x500)
        makeGroup(plat, arr);
      });
      // Other (kích thước khác)
      const known = new Set(Object.entries(meta.sizes).filter(([p]) => p !== 'Other').flatMap(([, a]) => a));
      const leftover = [...selected].filter(s => !known.has(s));
      const otherCb = el('input', { type: 'checkbox' });
      const otherText = el('input', { type: 'text', placeholder: 'Nhập kích thước khác, vd: 1440x2560', style: 'margin-top:6px; display:none' });
      if (leftover.length) { otherCb.checked = true; otherText.value = leftover.join(', '); otherText.style.display = ''; }
      otherCb.addEventListener('change', () => { otherText.style.display = otherCb.checked ? '' : 'none'; if (otherCb.checked) otherText.focus(); });
      sizeBox.appendChild(el('label', { class: 'size-check size-other-head' }, otherCb, el('span', {}, 'Other (kích thước khác)')));
      sizeBox.appendChild(otherText);
      sizeBox._otherCb = otherCb; sizeBox._otherText = otherText;
    }
  };
  buildSizeSection();

  const collectSizes = () => {
    const vals = [...sizeBox.querySelectorAll('input[type=checkbox][value]:checked')].map(c => c.value);
    if (cat.value === 'image' && sizeBox._otherCb && sizeBox._otherCb.checked && sizeBox._otherText.value.trim()) {
      vals.push(sizeBox._otherText.value.trim());
    }
    return vals.join(', ');
  };

  // Upload Youtube: chỉ áp dụng cho order Video
  const needYoutube = el('input', { type: 'checkbox', checked: order && order.need_youtube ? true : false });
  const ytField = el('div', { class: 'field' }, el('label', { class: 'size-check' }, needYoutube, el('span', {}, 'Cần upload Youtube')),
    el('div', { class: 'hint' }, 'Nếu chọn, khi Editor trả kết quả sẽ có thêm ô "Link Youtube (output)".'));
  const toggleYt = () => { ytField.style.display = cat.value === 'video' ? '' : 'none'; };
  toggleYt();

  cat.addEventListener('change', () => { fillTypes(); buildSizeSection(); toggleYt(); });

  // Admin: giao editor & trạng thái (Người order tự gán theo người tạo)
  const editorSel = el('select', {}, el('option', { value: '' }, '— Chưa giao —'),
    meta.editors.map(u => el('option', { value: u.id, selected: order && order.editor_id === u.id }, u.full_name + ' (' + editorTypeLabel(u.editor_type) + ')')));
  const statusSel = el('select', {}, meta.statuses.map(s => el('option', { value: s, selected: order && order.status === s }, s)));

  container.innerHTML = '';
  container.appendChild(el('div', {},
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'Loại creative ', el('span', { class: 'req' }, '*')), cat),
      el('div', { class: 'field' }, el('label', {}, 'Loại order ', el('span', { class: 'req' }, '*')), typeSel),
    ),
    el('div', { class: 'field' }, el('label', {}, 'App ', el('span', { class: 'req' }, '*')), appCombo.node, appHint),
    el('div', { class: 'field' }, el('label', {}, 'Order date'), orderDateDisplay),
    el('div', { class: 'field' }, el('label', {}, 'Mô tả chi tiết'), desc),
    el('div', { class: 'field' }, el('label', {}, 'Kích thước'), sizeBox),
    ytField,
    el('div', { class: 'field' }, el('label', {}, 'Ref link'), ref),
    el('div', { class: 'field' }, el('label', {}, 'Lưu ý'), noteReq),
    isAdmin ? el('div', { class: 'field' }, el('label', {}, 'Giao cho Editor'), editorSel) : null,
    isAdmin && order ? el('div', { class: 'field' }, el('label', {}, 'Trạng thái'), statusSel) : null,
  ));

  updateAppLink();

  const submit = async () => {
    const appId = appCombo.getValue();
    if (!appId) return toast('Vui lòng chọn App', 'err');
    if (!typeSel.value) return toast('Vui lòng chọn loại order', 'err');
    const body = {
      category: cat.value, order_type_id: Number(typeSel.value),
      app_id: Number(appId),
      app_name: (appList.find(a => a.id === Number(appId)) || {}).name || '',
      order_date: orderDateDefault, description: desc.value,
      ref_link: ref.value, size: collectSizes(), note_request: noteReq.value,
      need_youtube: (cat.value === 'video' && needYoutube.checked) ? 1 : 0,
    };
    if (isAdmin) { body.editor_id = editorSel.value ? Number(editorSel.value) : null; if (order) body.status = statusSel.value; }
    try {
      if (order) { await api('/orders/' + order.id, { method: 'PUT', body }); toast('Đã lưu thay đổi'); }
      else { const r = await api('/orders', { method: 'POST', body }); toast('Đã tạo order ' + r.order_code); }
      if (closeM) closeM();
      if (inline) location.hash = '#/orders';
      else route();
    } catch (e) { toast(e.message, 'err'); }
  };

  const actions = el('div', { style: 'display:flex; gap:10px; justify-content:flex-end; margin-top:8px;' },
    closeM ? el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy') : el('a', { class: 'btn', href: '#/orders' }, 'Hủy'),
    el('button', { class: 'btn primary', onclick: submit }, order ? '💾 Lưu' : '➕ Tạo order'),
  );
  container.appendChild(actions);
}

/* ============================ Apps (admin) ============================ */

async function viewApps(c) {
  setTitle('Quản lý App');
  const apps = await api('/apps');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Quản lý App'), el('span', { class: 'muted' }, '· ' + apps.length + ' app'),
    el('span', { class: 'spacer' }), el('button', { class: 'btn primary', onclick: () => openAppForm(null) }, '➕ Thêm app')));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Mã app'), el('th', {}, 'Tên app'), el('th', {}, 'Đối tác'), el('th', {}, 'UA'), el('th', {}, 'PO'), el('th', {}, 'Tình trạng'), el('th', {}, ''))),
    el('tbody', {}, apps.map(a => el('tr', {},
      el('td', {}, el('span', { class: 'code-cell' }, a.code)),
      el('td', {}, a.link ? el('a', { href: a.link, target: '_blank' }, a.name) : a.name),
      el('td', {}, a.partner || '—'),
      el('td', {}, a.mkter || '—'),
      el('td', {}, a.product_manager || '—'),
      el('td', {}, appStatusBadge(a.status)),
      el('td', { class: 'nowrap' },
        el('button', { class: 'btn sm', onclick: () => openAppForm(a) }, '✏️'),
        ' ',
        el('button', { class: 'btn sm danger', onclick: () => confirmDialog('Xóa app ' + a.code + '?', async () => { try { await api('/apps/' + a.id, { method: 'DELETE' }); toast('Đã xóa'); route(); } catch (e) { toast(e.message, 'err'); } }) }, '🗑'),
      ),
    ))),
  );
  c.appendChild(el('div', { class: 'table-wrap' }, table));
}

function openAppForm(a) {
  const meta = State.meta;
  const f = {};
  const mk = (key, label, val) => { const i = el('input', { value: val || '' }); f[key] = i; return el('div', { class: 'field' }, el('label', {}, label), i); };
  const status = el('select', {}, meta.appStatuses.map(s => el('option', { value: s, selected: a && a.status === s }, s)));

  const codeField = mk('code', 'Mã app *', a && a.code);
  const nameField = mk('name', 'Tên app *', a && a.name);
  // Mã CODE tự tạo theo quy tắc "Mã - Tên app", không nhập tay
  const appCode = el('input', { readonly: true, placeholder: 'Tự tạo: Mã - Tên app' });
  if (a) appCode.value = (a.code && a.name) ? (a.code + ' - ' + a.name) : (a.app_code || '');
  const syncCode = () => {
    const c = f.code.value.trim(), n = f.name.value.trim();
    appCode.value = (c && n) ? (c + ' - ' + n) : '';
  };
  f.code.addEventListener('input', syncCode);
  f.name.addEventListener('input', syncCode);

  // Đối tác: chọn từ danh sách (mặc định Yutalabs); CRUD ở tab Cài đặt
  const partnerOpts = (meta.partners || []).slice();
  if (a && a.partner && !partnerOpts.includes(a.partner)) partnerOpts.unshift(a.partner);
  const partnerSel = el('select', {}, partnerOpts.map(p => el('option', { value: p, selected: a ? a.partner === p : p === 'Yutalabs' }, p)));

  const body = el('div', {},
    el('div', { class: 'form-row' }, codeField, nameField),
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'Đối tác'), partnerSel),
      el('div', { class: 'field' }, el('label', {}, 'Mã CODE (tự tạo)'), appCode)),
    el('div', { class: 'form-row' }, mk('link', 'Link app (store)', a && a.link), mk('figma_link', 'Link Figma', a && a.figma_link)),
    el('div', { class: 'form-row' }, mk('mkter', 'UA', a && a.mkter), mk('product_manager', 'PO', a && a.product_manager)),
    el('div', { class: 'field' }, el('label', {}, 'Tình trạng'), status),
  );
  const save = async () => {
    const payload = { status: status.value, app_code: appCode.value, partner: partnerSel.value };
    for (const k in f) payload[k] = f[k].value;
    if (!payload.code || !payload.name) return toast('Cần Mã app và Tên app', 'err');
    try {
      if (a) await api('/apps/' + a.id, { method: 'PUT', body: payload });
      else await api('/apps', { method: 'POST', body: payload });
      toast('Đã lưu'); closeM(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: a ? 'Sửa app' : 'Thêm app', body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

/* ============================ Users (admin) ============================ */

async function viewUsers(c) {
  setTitle('Quản lý User');
  const users = await api('/users');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Quản lý User'), el('span', { class: 'muted' }, '· ' + users.length + ' tài khoản'),
    el('span', { class: 'spacer' }), el('button', { class: 'btn primary', onclick: () => openUserForm(null) }, '➕ Thêm user')));

  const roleLabel = roleBadge;

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Họ tên'), el('th', {}, 'Username'), el('th', {}, 'Vai trò'), el('th', {}, 'Trạng thái'), el('th', {}, ''))),
    el('tbody', {}, users.map(u => el('tr', { style: u.active ? '' : 'opacity:.5' },
      el('td', {}, u.full_name),
      el('td', {}, el('code', {}, u.username)),
      el('td', {}, roleLabel(u)),
      el('td', {}, u.active ? el('span', { class: 'badge green' }, 'Hoạt động') : el('span', { class: 'badge gray' }, 'Đã khóa')),
      el('td', { class: 'nowrap' }, el('button', { class: 'btn sm', onclick: () => openUserForm(u) }, '✏️')),
    ))),
  );
  c.appendChild(el('div', { class: 'table-wrap' }, table));
}

function openUserForm(u, presetRole) {
  const fullName = el('input', { value: u ? u.full_name : '', placeholder: 'Họ tên' });
  const username = el('input', { value: u ? u.username : '', placeholder: 'username (chữ thường)', disabled: !!u });
  // presetRole: 'ua' -> mặc định UA; 'editor' -> mặc định Graphic Designer
  const defVal = u ? userRoleValue(u) : (presetRole === 'editor' ? 'editor:graphic' : presetRole === 'ua' ? 'ua' : 'ua');
  const isAdminAcc = u && u.role === 'admin';
  const role = el('select', {}, USER_ROLES.map(([v, t]) => el('option', { value: v, selected: v === defVal }, t)));
  if (isAdminAcc) role.disabled = true;
  const pass = el('input', { type: 'text', placeholder: u ? 'Để trống nếu không đổi' : 'Mặc định 123456' });
  const active = el('select', {}, el('option', { value: '1', selected: !u || u.active }, 'Hoạt động'), el('option', { value: '0', selected: u && !u.active }, 'Khóa'));

  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Họ tên *'), fullName),
    el('div', { class: 'field' }, el('label', {}, 'Username *'), username, u ? el('div', { class: 'hint' }, 'Không thể đổi username') : null),
    el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Vai trò'), role, isAdminAcc ? el('div', { class: 'hint' }, 'Tài khoản Admin không thể đổi vai trò') : null),
      el('div', { class: 'field' }, el('label', {}, 'Mật khẩu'), pass)),
    u ? el('div', { class: 'field' }, el('label', {}, 'Trạng thái'), active) : null,
  );

  const save = async () => {
    const [r, et] = role.value.split(':');
    const payload = { full_name: fullName.value, role: r, editor_type: et || null };
    if (pass.value) payload.password = pass.value;
    try {
      if (u) { payload.active = Number(active.value); await api('/users/' + u.id, { method: 'PUT', body: payload }); }
      else { payload.username = username.value; await api('/users', { method: 'POST', body: payload }); }
      toast('Đã lưu'); closeM(); await refreshMeta(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: u ? 'Sửa user' : 'Thêm user', body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

/* ============================ Cài đặt ============================ */

let settingsTab = 'ua';

async function viewSettings(c) {
  setTitle('Cài đặt');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Cài đặt'),
    el('span', { class: 'muted' }, '· dữ liệu nguồn cho các ô chọn ở những trang khác')));

  const TABS = [['ua', '👤 UA'], ['editor', '🎨 Editor'], ['partner', '🤝 Đối tác'], ['image', '🖼️ Loại order ảnh'], ['video', '🎬 Loại order video'], ['sizes', '📐 Size ảnh']];
  c.appendChild(el('div', { class: 'tabs' }, TABS.map(([k, label]) =>
    el('button', { class: settingsTab === k ? 'active' : '', onclick: () => { settingsTab = k; route(); } }, label))));

  const box = el('div', {});
  c.appendChild(box);
  if (settingsTab === 'ua') await settingsUsers(box, 'ua');
  else if (settingsTab === 'editor') await settingsUsers(box, 'editor');
  else if (settingsTab === 'partner') await settingsPartners(box);
  else if (settingsTab === 'image') await settingsTypes(box, 'image');
  else if (settingsTab === 'video') await settingsTypes(box, 'video');
  else await settingsSizes(box);
}

async function settingsPartners(box) {
  const partners = await api('/partners');
  box.innerHTML = '';
  box.appendChild(el('div', { class: 'page-head' },
    el('span', { class: 'muted' }, 'Danh sách đối tác · ' + partners.length),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn primary', onclick: () => openPartnerForm(null) }, '➕ Thêm đối tác')));
  box.appendChild(el('p', { class: 'hint', style: 'margin-bottom:14px' }, 'Đối tác hiện ra khi tạo/sửa App (mặc định Yutalabs).'));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Tên đối tác'), el('th', {}, ''))),
    el('tbody', {}, partners.map(p => el('tr', {},
      el('td', {}, p.name),
      el('td', { class: 'nowrap' },
        el('button', { class: 'btn sm', onclick: () => openPartnerForm(p) }, '✏️'), ' ',
        el('button', { class: 'btn sm danger', onclick: () => confirmDialog('Xóa đối tác "' + p.name + '"?', async () => { try { await api('/partners/' + p.id, { method: 'DELETE' }); toast('Đã xóa'); await refreshMeta(); route(); } catch (e) { toast(e.message, 'err'); } }) }, '🗑'),
      ),
    ))),
  );
  box.appendChild(el('div', { class: 'table-wrap' }, table));
}

function openPartnerForm(p) {
  const name = el('input', { value: p ? p.name : '', placeholder: 'vd: Yutalabs' });
  const save = async () => {
    if (!name.value.trim()) return toast('Cần tên đối tác', 'err');
    try {
      if (p) await api('/partners/' + p.id, { method: 'PUT', body: { name: name.value.trim() } });
      else await api('/partners', { method: 'POST', body: { name: name.value.trim() } });
      toast('Đã lưu'); closeM(); await refreshMeta(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: p ? 'Sửa đối tác' : 'Thêm đối tác', body: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Tên đối tác *'), name)), footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

async function settingsUsers(box, role) {
  const users = await api('/users?role=' + role);
  const tenVT = role === 'ua' ? 'UA' : 'Editor';
  box.innerHTML = '';
  box.appendChild(el('div', { class: 'page-head' },
    el('span', { class: 'muted' }, 'Danh sách ' + tenVT + ' · ' + users.length),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn primary', onclick: () => openUserForm(null, role) }, '➕ Thêm ' + tenVT)));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Họ tên'), el('th', {}, 'Username'),
      role === 'editor' ? el('th', {}, 'Loại') : null, el('th', {}, 'Trạng thái'), el('th', {}, ''))),
    el('tbody', {}, users.map(u => el('tr', { style: u.active ? '' : 'opacity:.5' },
      el('td', {}, u.full_name),
      el('td', {}, el('code', {}, u.username)),
      role === 'editor' ? el('td', {}, roleBadge(u)) : null,
      el('td', {}, u.active ? el('span', { class: 'badge green' }, 'Hoạt động') : el('span', { class: 'badge gray' }, 'Đã khóa')),
      el('td', { class: 'nowrap' },
        el('button', { class: 'btn sm', onclick: () => openUserForm(u, role) }, '✏️'), ' ',
        el('button', { class: 'btn sm danger', onclick: () => confirmDialog('Khóa tài khoản ' + u.full_name + '?', async () => { await api('/users/' + u.id, { method: 'DELETE' }); toast('Đã khóa'); await refreshMeta(); route(); }) }, '🗑'),
      ),
    ))),
  );
  box.appendChild(el('div', { class: 'table-wrap' }, table));
}

async function settingsTypes(box, category) {
  const types = (State.meta.orderTypes || []).filter(t => t.category === category);
  const tenLoai = category === 'image' ? 'Loại order ảnh' : 'Loại order video';
  const qtyHead = category === 'image' ? 'Số lượng ảnh/order' : 'Số lượng video/order';
  box.innerHTML = '';
  box.appendChild(el('div', { class: 'page-head' },
    el('span', { class: 'muted' }, tenLoai + ' · ' + types.length),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn primary', onclick: () => openTypeForm(null, category) }, '➕ Thêm loại')));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, tenLoai), el('th', {}, 'Điểm'), el('th', {}, qtyHead), el('th', {}, 'Lưu ý'), el('th', {}, ''))),
    el('tbody', {}, types.map(t => el('tr', {},
      el('td', {}, t.name),
      el('td', {}, fmtNum(t.points)),
      el('td', {}, t.quantity_note || '—'),
      el('td', {}, t.note || '—'),
      el('td', { class: 'nowrap' },
        el('button', { class: 'btn sm', onclick: () => openTypeForm(t, category) }, '✏️'), ' ',
        el('button', { class: 'btn sm danger', onclick: () => confirmDialog('Xóa loại "' + t.name + '"?', async () => { try { await api('/order_types/' + t.id, { method: 'DELETE' }); toast('Đã xóa'); await refreshMeta(); route(); } catch (e) { toast(e.message, 'err'); } }) }, '🗑'),
      ),
    ))),
  );
  box.appendChild(el('div', { class: 'table-wrap' }, table));
}

function openTypeForm(t, category) {
  const name = el('input', { value: t ? t.name : '', placeholder: 'Tên loại order' });
  const points = el('input', { type: 'number', step: '0.5', value: t ? t.points : '', placeholder: 'vd: 1.5' });
  const qty = el('input', { value: t ? t.quantity_note || '' : '', placeholder: category === 'image' ? 'vd: 3 ảnh' : 'vd: 5 video' });
  const note = el('input', { value: t ? t.note || '' : '', placeholder: 'vd: 3 ngôn ngữ' });
  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Tên loại order *'), name),
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'Điểm'), points),
      el('div', { class: 'field' }, el('label', {}, category === 'image' ? 'Số lượng ảnh/order' : 'Số lượng video/order'), qty)),
    el('div', { class: 'field' }, el('label', {}, 'Lưu ý'), note),
  );
  const save = async () => {
    if (!name.value.trim()) return toast('Cần tên loại order', 'err');
    const payload = { category, name: name.value.trim(), points: Number(points.value) || 0, quantity_note: qty.value, note: note.value };
    try {
      if (t) await api('/order_types/' + t.id, { method: 'PUT', body: payload });
      else await api('/order_types', { method: 'POST', body: payload });
      toast('Đã lưu'); closeM(); await refreshMeta(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: t ? 'Sửa loại order' : 'Thêm loại order', body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

async function settingsSizes(box) {
  const sizes = await api('/sizes');
  const platforms = [...new Set(sizes.map(s => s.platform))];
  box.innerHTML = '';
  box.appendChild(el('div', { class: 'page-head' },
    el('span', { class: 'muted' }, 'Size ảnh theo kênh · ' + sizes.length + ' size'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn primary', onclick: () => openSizeForm(null, platforms) }, '➕ Thêm size')));
  box.appendChild(el('p', { class: 'hint', style: 'margin-bottom:14px' }, 'Các kênh & size ở đây sẽ hiện ra khi tạo order ảnh.'));

  if (!platforms.length) { box.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty' }, 'Chưa có size nào'))); return; }

  platforms.forEach(plat => {
    box.appendChild(el('div', { class: 'size-group-title', style: 'margin-top:16px' }, plat));
    const grid = el('div', { class: 'size-grid' });
    sizes.filter(s => s.platform === plat).forEach(s => {
      grid.appendChild(el('span', { class: 'size-chip' }, s.value,
        el('button', { class: 'chip-edit', title: 'Sửa', onclick: () => openSizeForm(s, platforms) }, '✏️'),
        el('button', { class: 'chip-x', title: 'Xóa', onclick: () => confirmDialog('Xóa size ' + s.value + ' (' + s.platform + ')?', async () => { await api('/sizes/' + s.id, { method: 'DELETE' }); toast('Đã xóa'); await refreshMeta(); route(); }) }, '✕')));
    });
    box.appendChild(grid);
  });
}

function openSizeForm(s, platforms) {
  // kênh: chọn từ danh sách có sẵn hoặc gõ mới
  const platSel = el('input', { value: s ? s.platform : '', placeholder: 'vd: Google', list: 'plat-list' });
  const datalist = el('datalist', { id: 'plat-list' }, (platforms || []).map(p => el('option', { value: p })));
  const value = el('input', { value: s ? s.value : '', placeholder: 'vd: 1200x628' });
  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Kênh *'), platSel, datalist),
    el('div', { class: 'field' }, el('label', {}, 'Kích thước *'), value),
  );
  const save = async () => {
    if (!platSel.value.trim() || !value.value.trim()) return toast('Cần Kênh và Kích thước', 'err');
    const payload = { platform: platSel.value.trim(), value: value.value.trim() };
    try {
      if (s) await api('/sizes/' + s.id, { method: 'PUT', body: payload });
      else await api('/sizes', { method: 'POST', body: payload });
      toast('Đã lưu'); closeM(); await refreshMeta(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: s ? 'Sửa size' : 'Thêm size', body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

/* ============================ Reports ============================ */

let reportTab = 'ua';
let reportRange = 30;          // số ngày, hoặc 'custom'
let reportFrom = '', reportTo = '';

function monthRange(offset) { // 0 = tháng này, -1 = tháng trước
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return `from=${fmt(first)}&to=${fmt(last)}`;
}
function reportRangeQuery() {
  if (reportRange === 'custom') return `from=${reportFrom || '2000-01-01'}&to=${reportTo || '2999-12-31'}`;
  if (reportRange === 'this_month') return monthRange(0);
  if (reportRange === 'last_month') return monthRange(-1);
  return rangeQuery(reportRange);
}
function reportRangeDates() {
  const qs = new URLSearchParams(reportRangeQuery());
  return { from: qs.get('from'), to: qs.get('to') };
}

async function viewReports(c) {
  setTitle('Báo cáo');
  c.innerHTML = '';

  const rangeSel = el('select', { onchange: (e) => { const v = e.target.value; reportRange = /^\d+$/.test(v) ? Number(v) : v; route(); } },
    [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [365, '1 năm'], ['this_month', 'Tháng này'], ['last_month', 'Tháng trước'], ['custom', 'Tùy chọn…']]
      .map(([v, t]) => el('option', { value: v, selected: String(reportRange) === String(v) }, t)));

  // Hiển thị khoảng thời gian cụ thể đang xem
  const { from, to } = reportRangeDates();
  const rangeText = (reportRange === 'custom' && (!reportFrom || !reportTo))
    ? 'Hãy chọn khoảng ngày'
    : '📅 ' + fmtDate(from) + ' → ' + fmtDate(to);

  const head = el('div', { class: 'page-head' }, el('h1', {}, 'Báo cáo hiệu suất'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted', style: 'margin-right:10px' }, rangeText),
    rangeSel);
  c.appendChild(head);

  if (reportRange === 'custom') {
    const fromInp = el('input', { type: 'text', placeholder: 'Từ ngày', readonly: true, style: 'min-width:150px' });
    const toInp = el('input', { type: 'text', placeholder: 'Đến ngày', readonly: true, style: 'min-width:150px' });
    setTimeout(() => {
      initDatePicker(fromInp, reportFrom || null, (d) => { reportFrom = d; route(); });
      initDatePicker(toInp, reportTo || null, (d) => { reportTo = d; route(); });
    }, 0);
    c.appendChild(el('div', { class: 'filters', style: 'margin-bottom:16px' },
      el('div', { class: 'field' }, el('label', {}, 'Từ ngày'), fromInp),
      el('div', { class: 'field' }, el('label', {}, 'Đến ngày'), toInp)));
  }

  const isAdmin = State.user.role === 'admin';
  if (!isAdmin) reportTab = 'editor'; // Lead chỉ xem hiệu suất Creatives
  const tabs = el('div', { class: 'tabs' },
    isAdmin ? el('button', { class: reportTab === 'ua' ? 'active' : '', onclick: () => { reportTab = 'ua'; route(); } }, '👤 Hiệu suất UA') : null,
    el('button', { class: reportTab === 'editor' ? 'active' : '', onclick: () => { reportTab = 'editor'; route(); } }, '🎨 Hiệu suất Creatives'),
  );
  c.appendChild(tabs);
  const box = el('div', {});
  c.appendChild(box);

  if (reportTab === 'ua') await reportUA(box); else await reportEditor(box);
}

async function reportUA(box) {
  const rep = await api('/reports/ua?' + reportRangeQuery());
  box.innerHTML = '';
  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Số order theo UA', 'r-ua-cnt'));
  g.appendChild(chartCard('Số lượng ảnh/video theo loại order', 'r-ua-type'));
  box.appendChild(g);
  box.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:16px' }, el('h3', {}, 'Order theo ngày'), el('div', { class: 'chart-box' }, el('canvas', { id: 'r-ua-tl' }))));

  const tbody = el('tbody', {});
  if (!rep.perUser.length) tbody.appendChild(el('tr', {}, el('td', { colspan: 5, class: 'muted', style: 'text-align:center' }, 'Chưa có dữ liệu')));
  rep.perUser.forEach(u => {
    const caret = el('button', { class: 'btn sm ghost', title: 'Xem theo app' }, '▸');
    const tr = el('tr', {},
      el('td', {}, caret, ' ', u.full_name),
      el('td', {}, u.total_orders),
      el('td', {}, u.image_qty || 0),
      el('td', {}, u.video_qty || 0),
      el('td', {}, u.done_orders),
    );
    let detail = null;
    caret.addEventListener('click', async () => {
      if (detail) { detail.remove(); detail = null; caret.textContent = '▸'; return; }
      caret.textContent = '▾';
      let apps = [];
      try { apps = await api(`/reports/ua/${u.id}/by-app?` + reportRangeQuery()); } catch (e) { toast(e.message, 'err'); }
      const sub = el('table', { class: 'subtable' },
        el('thead', {}, el('tr', {}, el('th', {}, 'App'), el('th', {}, 'Số order'), el('th', {}, 'Số ảnh'), el('th', {}, 'Số video'))),
        el('tbody', {}, apps.length ? apps.map(a => el('tr', {},
          el('td', {}, (a.app_code ? a.app_code + ' - ' : '') + a.app_name),
          el('td', {}, a.cnt), el('td', {}, a.image_qty || 0), el('td', {}, a.video_qty || 0),
        )) : [el('tr', {}, el('td', { colspan: 4, class: 'muted' }, 'Không có'))]),
      );
      detail = el('tr', { class: 'detail-row' }, el('td', { colspan: 5 }, el('div', { class: 'detail-pad' }, el('div', { class: 'muted', style: 'margin-bottom:6px; font-weight:600' }, '📱 Số lượng theo app — ' + u.full_name), sub)));
      tr.after(detail);
    });
    tbody.appendChild(tr);
  });
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'UA'), el('th', {}, 'Tổng order'), el('th', {}, 'Số ảnh'), el('th', {}, 'Số video'), el('th', {}, 'Hoàn thành'))),
    tbody);
  box.appendChild(el('div', { class: 'table-wrap', style: 'margin-top:16px' }, table));

  setTimeout(() => {
    drawBar('r-ua-cnt', rep.perUser.map(u => u.full_name), rep.perUser.map(u => u.total_orders), 'Số order');
    drawBar('r-ua-type', rep.byType.slice(0, 12).map(t => t.name), rep.byType.slice(0, 12).map(t => t.qty), 'Số lượng', '#9333ea');
    drawLine('r-ua-tl', rep.timeline.map(t => fmtDate(t.day)), rep.timeline.map(t => t.cnt));
  }, 0);
}

async function reportEditor(box) {
  const rep = await api('/reports/editor?' + reportRangeQuery());
  box.innerHTML = '';
  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Điểm theo Creatives', 'r-ed-pts'));
  g.appendChild(chartCard('Order theo trạng thái', 'r-ed-st'));
  box.appendChild(g);
  box.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:16px' }, el('h3', {}, 'Hoàn thành theo ngày'), el('div', { class: 'chart-box' }, el('canvas', { id: 'r-ed-tl' }))));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Creatives'), el('th', {}, 'Loại'), el('th', {}, 'Đang phụ trách'), el('th', {}, 'Được giao'), el('th', {}, 'Hoàn thành'), el('th', {}, 'Điểm'), el('th', {}, 'TG TB (ngày)'))),
    el('tbody', {}, rep.perUser.length ? rep.perUser.map(u => el('tr', {}, el('td', {}, u.full_name),
      el('td', {}, editorTypeLabel(u.editor_type)),
      el('td', {}, el('b', {}, String(u.active_orders || 0))),
      el('td', {}, u.total_orders), el('td', {}, u.done_orders), el('td', {}, fmtNum(u.total_points)), el('td', {}, u.avg_days != null ? fmtNum(u.avg_days) : '—'))) :
      [el('tr', {}, el('td', { colspan: 7, class: 'muted', style: 'text-align:center' }, 'Chưa có dữ liệu'))]),
  );
  box.appendChild(el('div', { class: 'table-wrap', style: 'margin-top:16px' }, table));

  setTimeout(() => {
    drawBar('r-ed-pts', rep.perUser.map(u => u.full_name), rep.perUser.map(u => u.total_points || 0), 'Điểm', '#16a34a');
    drawPie('r-ed-st', rep.byStatus.map(s => s.status), rep.byStatus.map(s => s.cnt));
    drawLine('r-ed-tl', rep.timeline.map(t => fmtDate(t.day)), rep.timeline.map(t => t.cnt));
  }, 0);
}

/* ============================ Start ============================ */
boot();

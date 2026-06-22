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
  const map = { 'Chờ làm': 'gray', 'Đang làm': 'blue', 'Đã xong': 'green', 'Yêu cầu sửa': 'red' };
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

function renderShell() {
  const app = document.getElementById('app');
  const u = State.user;
  const nav = NAV[u.role] || [];

  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' },
    el('div', { class: 'brand' }, '🎨 Creatives'),
    el('nav', {}, nav.map(([href, ico, label]) => el('a', { href, 'data-route': href }, el('span', {}, ico), el('span', {}, label)))),
    el('div', { class: 'user-box' },
      el('div', { class: 'name' }, u.full_name),
      el('div', { class: 'role' }, u.role === 'ua' ? 'UA' : u.role === 'editor' ? ('Editor · ' + (u.editor_type || '')) : 'Admin'),
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
};

function route() {
  if (!State.user) return;
  destroyCharts();
  destroyDatepickers();
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('backdrop')?.classList.remove('show');
  const hash = location.hash.replace('#/', '') || 'dashboard';
  const key = hash.split('/')[0];
  const allowed = (NAV[State.user.role] || []).map(n => n[0].replace('#/', ''));
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
  if (State.user.role === 'ua') return dashboardUA(c);
  return dashboardEditor(c);
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
    statCard('Đã xong', (summary.byStatus.find(s => s.status === 'Đã xong') || {}).c || 0, '✅'),
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

async function dashboardUA(c) {
  const q = rangeQuery(30);
  const rep = await api('/reports/ua?' + q);
  const orders = await api('/orders');
  const mine = rep.perUser[0] || { total_orders: 0, done_orders: 0, total_points: 0 };
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name), el('span', { class: 'spacer' }), el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order mới')));

  const pending = orders.filter(o => o.status !== 'Đã xong').length;
  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Order đã tạo (30N)', mine.total_orders || 0, '📋'),
    statCard('Đã hoàn thành', mine.done_orders || 0, '✅'),
    statCard('Điểm tích lũy', fmtNum(mine.total_points), '⭐'),
    statCard('Đang chờ/làm', pending, '⏳'),
  ));

  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Order theo ngày', 'ch-tl'));
  g.appendChild(chartCard('Breakdown theo loại order', 'ch-type'));
  c.appendChild(g);

  setTimeout(() => {
    drawLine('ch-tl', rep.timeline.map(t => fmtDate(t.day)), rep.timeline.map(t => t.cnt));
    drawBar('ch-type', rep.byType.slice(0, 10).map(t => t.name), rep.byType.slice(0, 10).map(t => t.cnt), 'Số order');
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
  setTitle(role === 'editor' ? 'Order được giao' : role === 'ua' ? 'Order của tôi' : 'Quản lý Order');

  const qs = new URLSearchParams(orderFilters).toString();
  const orders = await api('/orders' + (qs ? '?' + qs : ''));

  c.innerHTML = '';
  const head = el('div', { class: 'page-head' },
    el('h1', {}, role === 'editor' ? 'Order được giao' : role === 'ua' ? 'Order của tôi' : 'Quản lý Order'),
    el('span', { class: 'muted' }, '· ' + orders.length + ' order'),
    el('span', { class: 'spacer' }),
  );
  if (role === 'ua') head.appendChild(el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order'));
  if (role === 'admin') head.appendChild(el('button', { class: 'btn primary', onclick: () => openOrderForm(null) }, '➕ Tạo order'));
  c.appendChild(head);

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
  if (role === 'admin') {
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

  const footer = [];
  if (role === 'editor' && o.editor_id === State.user.id) footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openEditorUpdate(o); } }, '✏️ Cập nhật tiến độ'));
  if (role === 'admin') {
    footer.push(el('button', { class: 'btn danger', onclick: () => confirmDialog('Xóa order ' + o.order_code + '?', async () => { await api('/orders/' + o.id, { method: 'DELETE' }); toast('Đã xóa'); closeM(); route(); }) }, '🗑 Xóa'));
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openOrderForm(o); } }, '✏️ Sửa / Giao việc'));
  }
  if (role === 'ua' && o.ua_id === State.user.id) {
    if (o.status === 'Đã xong') footer.push(el('button', { class: 'btn', onclick: async () => { await api('/orders/' + o.id, { method: 'PUT', body: { status: 'Yêu cầu sửa' } }); toast('Đã gửi yêu cầu sửa'); closeM(); route(); } }, '↩️ Yêu cầu sửa'));
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
    o.category === 'video' ? el('div', { class: 'field' }, el('label', {}, 'Link Youtube'), yt) : null,
    el('div', { class: 'field' }, el('label', {}, 'Note'), note),
  );
  const save = async () => {
    await api('/orders/' + o.id, { method: 'PUT', body: { status: statusSel.value, drive_link: drive.value, youtube_link: yt.value, note: note.value } });
    toast('Đã cập nhật');
    closeM(); route();
  };
  const closeM = openModal({ title: 'Cập nhật: ' + o.order_code, body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
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
  const isAdmin = role === 'admin';
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

  cat.addEventListener('change', () => { fillTypes(); buildSizeSection(); });

  // Admin: giao editor & trạng thái (Người order tự gán theo người tạo)
  const editorSel = el('select', {}, el('option', { value: '' }, '— Chưa giao —'),
    meta.editors.map(u => el('option', { value: u.id, selected: order && order.editor_id === u.id }, u.full_name + ' (' + (u.editor_type === 'video' ? 'Video' : u.editor_type === 'both' ? 'Designer+Video' : 'Designer') + ')')));
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
    el('thead', {}, el('tr', {}, el('th', {}, 'Mã app'), el('th', {}, 'Tên app'), el('th', {}, 'Đối tác'), el('th', {}, 'Mkter'), el('th', {}, 'PM'), el('th', {}, 'Tình trạng'), el('th', {}, ''))),
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
  const body = el('div', {},
    el('div', { class: 'form-row' }, mk('code', 'Mã app *', a && a.code), mk('name', 'Tên app *', a && a.name)),
    el('div', { class: 'form-row' }, mk('partner', 'Đối tác', a && a.partner), mk('app_code', 'Mã CODE', a && a.app_code)),
    mk('link', 'Link app', a && a.link),
    el('div', { class: 'form-row' }, mk('mkter', 'Mkter (UA)', a && a.mkter), mk('product_manager', 'Product Manager', a && a.product_manager)),
    el('div', { class: 'field' }, el('label', {}, 'Tình trạng'), status),
  );
  const save = async () => {
    const payload = { status: status.value };
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

  const roleLabel = (u) => u.role === 'admin' ? el('span', { class: 'badge purple' }, 'Admin') : u.role === 'ua' ? el('span', { class: 'badge blue' }, 'UA') : el('span', { class: 'badge green' }, 'Editor · ' + (u.editor_type === 'video' ? 'Video' : u.editor_type === 'both' ? 'D+V' : 'Designer'));

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

function openUserForm(u) {
  const fullName = el('input', { value: u ? u.full_name : '', placeholder: 'Họ tên' });
  const username = el('input', { value: u ? u.username : '', placeholder: 'username (chữ thường)', disabled: !!u });
  const role = el('select', {}, [['ua', 'UA'], ['editor', 'Editor'], ['admin', 'Admin']].map(([v, t]) => el('option', { value: v, selected: u && u.role === v }, t)));
  const editorType = el('select', {}, [['designer', 'Designer'], ['video', 'Video Editor'], ['both', 'Designer + Video']].map(([v, t]) => el('option', { value: v, selected: u && u.editor_type === v }, t)));
  const etField = el('div', { class: 'field' }, el('label', {}, 'Loại editor'), editorType);
  const pass = el('input', { type: 'text', placeholder: u ? 'Để trống nếu không đổi' : 'Mặc định 123456' });
  const active = el('select', {}, el('option', { value: '1', selected: !u || u.active }, 'Hoạt động'), el('option', { value: '0', selected: u && !u.active }, 'Khóa'));

  const toggleEt = () => { etField.style.display = role.value === 'editor' ? '' : 'none'; };
  role.addEventListener('change', toggleEt);

  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Họ tên *'), fullName),
    el('div', { class: 'field' }, el('label', {}, 'Username *'), username, u ? el('div', { class: 'hint' }, 'Không thể đổi username') : null),
    el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Vai trò'), role), etField),
    el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Mật khẩu'), pass), u ? el('div', { class: 'field' }, el('label', {}, 'Trạng thái'), active) : null),
  );
  toggleEt();

  const save = async () => {
    const payload = { full_name: fullName.value, role: role.value, editor_type: editorType.value };
    if (pass.value) payload.password = pass.value;
    try {
      if (u) { payload.active = Number(active.value); await api('/users/' + u.id, { method: 'PUT', body: payload }); }
      else { payload.username = username.value; await api('/users', { method: 'POST', body: payload }); }
      toast('Đã lưu'); closeM(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: u ? 'Sửa user' : 'Thêm user', body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

/* ============================ Reports ============================ */

let reportTab = 'ua';
let reportRange = 30;

async function viewReports(c) {
  setTitle('Báo cáo');
  c.innerHTML = '';
  const head = el('div', { class: 'page-head' }, el('h1', {}, 'Báo cáo hiệu suất'), el('span', { class: 'spacer' }),
    el('select', { onchange: (e) => { reportRange = Number(e.target.value); route(); } },
      [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [365, '1 năm']].map(([v, t]) => el('option', { value: v, selected: reportRange === v }, t))));
  c.appendChild(head);

  const tabs = el('div', { class: 'tabs' },
    el('button', { class: reportTab === 'ua' ? 'active' : '', onclick: () => { reportTab = 'ua'; route(); } }, '👤 Hiệu suất UA'),
    el('button', { class: reportTab === 'editor' ? 'active' : '', onclick: () => { reportTab = 'editor'; route(); } }, '🎨 Hiệu suất Editor'),
  );
  c.appendChild(tabs);
  const box = el('div', {});
  c.appendChild(box);

  if (reportTab === 'ua') await reportUA(box); else await reportEditor(box);
}

async function reportUA(box) {
  const rep = await api('/reports/ua?' + rangeQuery(reportRange));
  box.innerHTML = '';
  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Số order theo UA', 'r-ua-cnt'));
  g.appendChild(chartCard('Breakdown theo loại order', 'r-ua-type'));
  box.appendChild(g);
  box.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:16px' }, el('h3', {}, 'Order theo ngày'), el('div', { class: 'chart-box' }, el('canvas', { id: 'r-ua-tl' }))));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'UA'), el('th', {}, 'Tổng order'), el('th', {}, 'Đã xong'), el('th', {}, 'Điểm'))),
    el('tbody', {}, rep.perUser.length ? rep.perUser.map(u => el('tr', {}, el('td', {}, u.full_name), el('td', {}, u.total_orders), el('td', {}, u.done_orders), el('td', {}, fmtNum(u.total_points)))) :
      [el('tr', {}, el('td', { colspan: 4, class: 'muted', style: 'text-align:center' }, 'Chưa có dữ liệu'))]),
  );
  box.appendChild(el('div', { class: 'table-wrap', style: 'margin-top:16px' }, table));

  setTimeout(() => {
    drawBar('r-ua-cnt', rep.perUser.map(u => u.full_name), rep.perUser.map(u => u.total_orders), 'Số order');
    drawBar('r-ua-type', rep.byType.slice(0, 12).map(t => t.name), rep.byType.slice(0, 12).map(t => t.cnt), 'Số order', '#9333ea');
    drawLine('r-ua-tl', rep.timeline.map(t => fmtDate(t.day)), rep.timeline.map(t => t.cnt));
  }, 0);
}

async function reportEditor(box) {
  const rep = await api('/reports/editor?' + rangeQuery(reportRange));
  box.innerHTML = '';
  const g = el('div', { class: 'grid-2' });
  g.appendChild(chartCard('Điểm theo Editor', 'r-ed-pts'));
  g.appendChild(chartCard('Order theo trạng thái', 'r-ed-st'));
  box.appendChild(g);
  box.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:16px' }, el('h3', {}, 'Hoàn thành theo ngày'), el('div', { class: 'chart-box' }, el('canvas', { id: 'r-ed-tl' }))));

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Editor'), el('th', {}, 'Loại'), el('th', {}, 'Được giao'), el('th', {}, 'Hoàn thành'), el('th', {}, 'Điểm'), el('th', {}, 'TG TB (ngày)'))),
    el('tbody', {}, rep.perUser.length ? rep.perUser.map(u => el('tr', {}, el('td', {}, u.full_name),
      el('td', {}, u.editor_type === 'video' ? 'Video' : u.editor_type === 'both' ? 'D+V' : 'Designer'),
      el('td', {}, u.total_orders), el('td', {}, u.done_orders), el('td', {}, fmtNum(u.total_points)), el('td', {}, u.avg_days != null ? fmtNum(u.avg_days) : '—'))) :
      [el('tr', {}, el('td', { colspan: 6, class: 'muted', style: 'text-align:center' }, 'Chưa có dữ liệu'))]),
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

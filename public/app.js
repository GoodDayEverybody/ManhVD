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

/* ---- Rich text (mô tả): in đậm/nghiêng/gạch chân/đổi màu ---- */
// Chỉ giữ các thẻ & style an toàn (chống XSS) khi lưu/hiển thị nội dung HTML
const RTE_ALLOWED_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, DIV: 1, P: 1, SPAN: 1, FONT: 1 };
const RTE_ALLOWED_STYLE = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration'];
function sanitizeStyle(css) {
  return String(css || '').split(';').map(s => s.trim()).filter(Boolean).filter(s => {
    const prop = s.split(':')[0].trim().toLowerCase();
    const val = s.split(':').slice(1).join(':').toLowerCase();
    if (!RTE_ALLOWED_STYLE.includes(prop)) return false;
    if (/url\s*\(|expression|javascript:/i.test(val)) return false;
    return true;
  }).join('; ');
}
function sanitizeRichHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html == null ? '' : html);
  const cleanChildren = (parent) => {
    let child = parent.firstChild;
    while (child) {
      if (child.nodeType === 3) { child = child.nextSibling; continue; }       // text node: giữ
      if (child.nodeType !== 1) { const r = child; child = child.nextSibling; r.remove(); continue; }
      const tag = child.tagName;
      if (!RTE_ALLOWED_TAGS[tag]) {                                            // thẻ lạ: bỏ thẻ, giữ nội dung
        const first = child.firstChild;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        const toRemove = child; child = first || child.nextSibling; toRemove.remove();
        continue;
      }
      [...child.attributes].forEach(attr => {                                  // lọc thuộc tính
        const name = attr.name.toLowerCase();
        if (name === 'color' && tag === 'FONT') return;
        if (name === 'style') { const safe = sanitizeStyle(attr.value); if (safe) child.setAttribute('style', safe); else child.removeAttribute('style'); return; }
        child.removeAttribute(attr.name);
      });
      cleanChildren(child);
      child = child.nextSibling;
    }
  };
  cleanChildren(tpl.content);
  return tpl.innerHTML;
}
// Trình soạn thảo nhỏ: trả về { node, getHTML }
function richEditor(initialHtml, placeholder) {
  const area = el('div', { class: 'rte-area', contenteditable: 'true', 'data-ph': placeholder || '' });
  area.innerHTML = sanitizeRichHtml(initialHtml || '');
  const exec = (cmd, val) => { area.focus(); document.execCommand(cmd, false, val || null); };
  const btn = (label, cmd, title, style) => el('button', { type: 'button', class: 'rte-btn', title, style: style || '', onmousedown: (e) => { e.preventDefault(); exec(cmd); } }, label);
  const colors = ['#e11d48', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#111827'];
  const colorBtns = colors.map(col => el('button', { type: 'button', class: 'rte-color', title: 'Màu chữ', style: 'background:' + col, onmousedown: (e) => { e.preventDefault(); exec('foreColor', col); } }));
  const toolbar = el('div', { class: 'rte-toolbar' },
    btn('B', 'bold', 'In đậm', 'font-weight:800'),
    btn('I', 'italic', 'In nghiêng', 'font-style:italic'),
    btn('U', 'underline', 'Gạch chân', 'text-decoration:underline'),
    el('span', { class: 'rte-sep' }),
    ...colorBtns,
    el('span', { class: 'rte-sep' }),
    el('button', { type: 'button', class: 'rte-btn', title: 'Xóa định dạng', onmousedown: (e) => { e.preventDefault(); exec('removeFormat'); } }, '✕ Định dạng'),
  );
  return { node: el('div', { class: 'rte' }, toolbar, area), getHTML: () => sanitizeRichHtml(area.innerHTML) };
}

function statusBadge(s) {
  const map = { 'Đợi submit': 'amber', 'Chờ làm': 'gray', 'Đang làm': 'blue', 'Hoàn thành': 'green', 'Đã xong': 'green', 'Yêu cầu sửa': 'red', 'Hủy': 'darkred' };
  return el('span', { class: 'badge ' + (map[s] || 'gray') }, s);
}
// Màu biểu đồ khớp với màu badge trạng thái
const STATUS_COLORS = {
  'Đợi submit': '#f59e0b', 'Chờ làm': '#94a3b8', 'Đang làm': '#2563eb',
  'Hoàn thành': '#16a34a', 'Đã xong': '#16a34a', 'Yêu cầu sửa': '#dc2626', 'Hủy': '#991b1b',
};
function statusColors(labels) { return labels.map(l => STATUS_COLORS[l] || '#9ca3af');
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
  return ({ graphic: 'Graphic Designer', graphic_lead: 'Graphic Designer Lead', video: 'Video Editor', video_lead: 'Video Editor Lead', uiux: 'UI/UX Designer', designer: 'Graphic Designer', both: 'Graphic+Video' })[t] || t || '';
}
// Vai trò "người order" (tạo + xem order của mình)
const ORDERER_ROLES = ['ua', 'aso', 'po', 'hr'];
const isOrdererRole = (r) => ORDERER_ROLES.includes(r);
// Mỗi loại Lead phụ trách một loại order
const LEAD_CATEGORY = { video_lead: 'video', graphic_lead: 'image' };
const isLeadUser = (u) => !!u && u.role === 'editor' && (u.editor_type === 'video_lead' || u.editor_type === 'graphic_lead');
// Loại order Lead phụ trách ('video' | 'image' | null)
const leadCategory = (u) => (u && u.role === 'editor') ? (LEAD_CATEGORY[u.editor_type] || null) : null;
// Danh sách người làm phù hợp với loại order (video -> video/lead; ảnh -> graphic/lead/uiux)
function editorsForCategory(cat) {
  const list = (State.meta && State.meta.editors) || [];
  return cat === 'video'
    ? list.filter(e => e.editor_type === 'video' || e.editor_type === 'video_lead')
    : list.filter(e => e.editor_type === 'graphic' || e.editor_type === 'graphic_lead' || e.editor_type === 'uiux');
}
const SIMPLE_ROLE_LABEL = { ua: 'UA', aso: 'ASO', po: 'PO', hr: 'HR', admin: 'Admin' };
// Badge vai trò có màu riêng cho dễ phân biệt
function roleBadge(u) {
  const simple = { admin: 'red', ua: 'blue', aso: 'teal', po: 'indigo', hr: 'pink' };
  if (simple[u.role]) return el('span', { class: 'badge ' + simple[u.role] }, SIMPLE_ROLE_LABEL[u.role] || u.role);
  const map = { graphic: 'green', graphic_lead: 'teal', video: 'amber', video_lead: 'orange', uiux: 'purple' };
  return el('span', { class: 'badge ' + (map[u.editor_type] || 'green') }, editorTypeLabel(u.editor_type));
}
// Các vai trò user, mã hóa role[:editor_type]
const USER_ROLES = [
  ['ua', 'UA'],
  ['aso', 'ASO'],
  ['po', 'PO'],
  ['hr', 'HR'],
  ['editor:graphic', 'Graphic Designer'],
  ['editor:graphic_lead', 'Graphic Designer Lead'],
  ['editor:video', 'Video Editor'],
  ['editor:video_lead', 'Video Editor Lead'],
  ['editor:uiux', 'UI/UX Designer'],
  ['admin', 'Admin'],
];
function userRoleValue(u) {
  if (!u) return 'ua';
  if (u.role === 'editor') {
    const t = ['graphic', 'graphic_lead', 'video', 'video_lead', 'uiux'].includes(u.editor_type) ? u.editor_type : 'graphic';
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
    if (user.must_change_password) return renderForceChange();
    State.meta = await api('/meta');
    if (!location.hash) location.hash = '#/dashboard';
    renderShell();
  } catch (e) {
    renderLogin();
  }
}

// Bắt buộc đổi mật khẩu (lần đăng nhập đầu hoặc sau khi admin reset)
function renderForceChange() {
  const app = document.getElementById('app');
  const oldP = el('input', { type: 'password', placeholder: 'Mật khẩu hiện tại' });
  const newP = el('input', { type: 'password', placeholder: 'Mật khẩu mới (tối thiểu 4 ký tự)' });
  const conf = el('input', { type: 'password', placeholder: 'Nhập lại mật khẩu mới' });
  const submit = async () => {
    if (newP.value.length < 4) return toast('Mật khẩu mới tối thiểu 4 ký tự', 'err');
    if (newP.value !== conf.value) return toast('Mật khẩu nhập lại không khớp', 'err');
    try {
      await api('/me/password', { method: 'POST', body: { old_password: oldP.value, new_password: newP.value } });
      toast('Đã đổi mật khẩu 🎉');
      const { user } = await api('/me');
      State.user = user;
      State.meta = await api('/meta');
      location.hash = '#/dashboard';
      renderShell();
    } catch (e) { toast(e.message, 'err'); }
  };
  const form = el('form', { class: 'login-card' },
    el('div', { class: 'login-logo' }, '🔒'),
    el('h1', {}, 'Đổi mật khẩu'),
    el('div', { class: 'sub' }, 'Vì lý do bảo mật, hãy đổi mật khẩu mặc định trước khi sử dụng.'),
    el('div', { class: 'field' }, el('label', {}, 'Mật khẩu hiện tại'), oldP),
    el('div', { class: 'field' }, el('label', {}, 'Mật khẩu mới'), newP),
    el('div', { class: 'field' }, el('label', {}, 'Nhập lại mật khẩu mới'), conf),
    el('button', { class: 'btn primary', type: 'submit', style: 'width:100%; justify-content:center; padding:11px;' }, 'Đổi mật khẩu & tiếp tục'),
    el('button', { class: 'btn', type: 'button', style: 'width:100%; justify-content:center; margin-top:8px;', onclick: logout }, 'Đăng xuất'),
  );
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  app.innerHTML = '';
  app.appendChild(el('div', { class: 'login-wrap' }, form));
}

function renderLogin() {
  const app = document.getElementById('app');
  const codeField = el('div', { class: 'field', style: 'display:none' },
    el('label', {}, 'Mã xác thực (2FA)'),
    el('input', { id: 'lg-code', inputmode: 'numeric', placeholder: 'Mã 6 số từ app Authenticator' }),
    el('div', { class: 'hint' }, 'Mở Google Authenticator và nhập mã 6 số.'));
  const form = el('form', { class: 'login-card' },
    el('div', { class: 'login-logo' }, '🎨'),
    el('h1', {}, 'Order Creatives'),
    el('div', { class: 'sub' }, 'Hệ thống quản lý order ảnh & video quảng cáo'),
    el('div', { class: 'field' }, el('label', {}, 'Tên đăng nhập'), el('input', { id: 'lg-user', autofocus: true, placeholder: 'vd: admin, manhvd, khai' })),
    el('div', { class: 'field' }, el('label', {}, 'Mật khẩu'), el('input', { id: 'lg-pass', type: 'password', placeholder: '••••••' })),
    codeField,
    el('button', { class: 'btn primary', type: 'submit', style: 'width:100%; justify-content:center; padding:11px;' }, 'Đăng nhập'),
    el('div', { class: 'login-hint' }, 'Demo: admin / admin123 — UA: manhvd / 123456 — Editor: khai / 123456'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('lg-user').value;
    const password = document.getElementById('lg-pass').value;
    const code = document.getElementById('lg-code').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, code: code || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        State.user = data.user;
        if (data.user.must_change_password) { renderForceChange(); return; }
        State.meta = await api('/meta');
        location.hash = '#/dashboard';
        renderShell();
        return;
      }
      if (data.twofa_required) {
        codeField.style.display = '';
        document.getElementById('lg-code').focus();
        toast(data.error || 'Nhập mã xác thực 2FA để tiếp tục', 'info');
        return;
      }
      toast(data.error || 'Đăng nhập thất bại', 'err');
    } catch (err) { toast('Lỗi kết nối', 'err'); }
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
  editor: [
    ['#/dashboard', '📊', 'Tổng quan'],
    ['#/orders', '📋', 'Order được giao'],
  ],
};
// UA/PO: tạo order, xem order của mình, và quản lý order của app được giao
const UA_PO_NAV = [
  ['#/dashboard', '📊', 'Tổng quan'],
  ['#/new', '➕', 'Tạo Order'],
  ['#/drafts', '📝', 'Nháp'],
  ['#/orders', '📋', 'Order của tôi'],
  ['#/managed', '📂', 'Quản lý Order'],
];
NAV.ua = UA_PO_NAV;
NAV.po = UA_PO_NAV;
// ASO/HR: tạo order + xem order của mình
const ORDERER_NAV = [
  ['#/dashboard', '📊', 'Tổng quan'],
  ['#/new', '➕', 'Tạo Order'],
  ['#/drafts', '📝', 'Nháp'],
  ['#/orders', '📋', 'Order của tôi'],
];
['aso', 'hr'].forEach(r => { NAV[r] = ORDERER_NAV; });
// Lead: vừa làm order được giao, vừa quản lý/xem order của team + báo cáo
const LEAD_NAV = [
  ['#/dashboard', '📊', 'Tổng quan'],
  ['#/assigned', '📥', 'Order được giao'],
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
      el('a', { class: 'btn sm', href: '#/security', style: 'margin-top:10px; width:100%; justify-content:center;' }, '🔒 Bảo mật'),
      el('button', { class: 'btn sm', style: 'margin-top:6px; width:100%; justify-content:center;', onclick: logout }, 'Đăng xuất'),
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
  assigned: (c) => viewOrders(c, { assignedToMe: true }),
  managed: (c) => viewOrders(c, { managed: true }),
  new: viewNewOrder,
  drafts: viewDrafts,
  apps: viewApps,
  users: viewUsers,
  reports: viewReports,
  settings: viewSettings,
  security: viewSecurity,
};
const ALWAYS_ALLOWED = ['dashboard', 'security'];

async function refreshMeta() { State.meta = await api('/meta'); }

/* ---- CSV (nhập dữ liệu Excel) ---- */
function deburr(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const head = text.slice(0, (text.indexOf('\n') + 1) || text.length);
  const delim = (head.split(';').length > head.split(',').length) ? ';' : ',';
  const rows = []; let field = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function csvToObjects(text, headerMap) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map(h => headerMap[deburr(h)] || null);
  return rows.slice(1).map(r => {
    const o = {};
    headers.forEach((key, i) => { if (key) o[key] = (r[i] || '').trim(); });
    return o;
  });
}
function downloadText(filename, content) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
}

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
  if (!fn || (!allowed.includes(key) && !ALWAYS_ALLOWED.includes(key))) { location.hash = '#/dashboard'; return; }
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
  const { from, to } = computeRange(dashRange);
  const orders = await api('/orders?from=' + from + '&to=' + to);
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name), el('span', { class: 'muted' }, '· Team ' + (leadCategory(State.user) === 'video' ? 'Video' : 'Ảnh'))));
  c.appendChild(dashControls());
  const cnt = (s) => orders.filter(o => o.status === s).length;
  const myPoints = orders.filter(o => o.editor_id === State.user.id).reduce((s, o) => s + (o.points || 0), 0);
  c.appendChild(el('div', { class: 'stat-grid' },
    statCard('Điểm của tôi', fmtNum(myPoints), '⭐'),
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
    drawPie('l-status', Object.keys(byStatus), Object.values(byStatus), statusColors(Object.keys(byStatus)));
  }, 0);
}

// Định dạng ngày theo giờ ĐỊA PHƯƠNG (tránh lệch ngày do múi giờ +7 với UTC)
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayLocal() { return ymd(new Date()); }

function rangeQuery(days) {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - days);
  return `from=${ymd(from)}&to=${ymd(to)}`;
}

// Khoảng thời gian cho Dashboard (mặc định Tháng này)
let dashRange = 'this_month';
function computeRange(range) {
  let qs;
  if (range === 'this_month') qs = monthRange(0);
  else if (range === 'last_month') qs = monthRange(-1);
  else qs = rangeQuery(Number(range));
  const p = new URLSearchParams(qs);
  return { from: p.get('from'), to: p.get('to') };
}
function dashControls() {
  const { from, to } = computeRange(dashRange);
  const sel = el('select', { onchange: (e) => { const v = e.target.value; dashRange = /^\d+$/.test(v) ? Number(v) : v; route(); } },
    [['this_month', 'Tháng này'], ['last_month', 'Tháng trước'], [7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [365, '1 năm']]
      .map(([v, t]) => el('option', { value: v, selected: String(dashRange) === String(v) }, t)));
  return el('div', { style: 'display:flex; align-items:center; gap:10px; margin:-4px 0 16px; flex-wrap:wrap' },
    el('span', { class: 'muted' }, '📅 ' + fmtDate(from) + ' → ' + fmtDate(to)), sel);
}

async function dashboardAdmin(c) {
  const { from, to } = computeRange(dashRange);
  const q = 'from=' + from + '&to=' + to;
  const [summary, uaRep, edRep] = await Promise.all([
    api('/reports/summary?' + q), api('/reports/ua?' + q), api('/reports/editor?' + q),
  ]);
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Tổng quan')));
  c.appendChild(dashControls());

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
    drawPie('ch-status', summary.byStatus.map(s => s.status), summary.byStatus.map(s => s.c), statusColors(summary.byStatus.map(s => s.status)));
    drawPie('ch-cat', summary.byCategory.map(s => s.category === 'video' ? 'Video' : 'Ảnh'), summary.byCategory.map(s => s.c));
    drawBar('ch-ua', uaRep.perUser.slice(0, 8).map(u => u.full_name), uaRep.perUser.slice(0, 8).map(u => u.total_orders), 'Số order');
    drawBar('ch-ed', edRep.perUser.slice(0, 8).map(u => u.full_name), edRep.perUser.slice(0, 8).map(u => u.total_points || 0), 'Điểm', '#16a34a');
    drawLine('ch-timeline', uaRep.timeline.map(t => fmtDate(t.day)), uaRep.timeline.map(t => t.cnt));
  }, 0);
}

// Dashboard cho người order (UA/ASO/PO/HR) — tính từ order của chính mình
async function dashboardOrderer(c) {
  const { from, to } = computeRange(dashRange);
  const orders = await api('/orders?from=' + from + '&to=' + to);
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name),
    el('span', { class: 'spacer' }), el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order mới')));
  c.appendChild(dashControls());

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
    drawPie('ch-st', Object.keys(byStatus), Object.values(byStatus), statusColors(Object.keys(byStatus)));
    drawBar('ch-type', Object.keys(byType).slice(0, 10), Object.values(byType).slice(0, 10), 'Số order');
  }, 0);
}

async function dashboardEditor(c) {
  const { from, to } = computeRange(dashRange);
  const q = 'from=' + from + '&to=' + to;
  const rep = await api('/reports/editor?' + q);
  const orders = await api('/orders');
  const mine = rep.perUser[0] || { total_orders: 0, done_orders: 0, total_points: 0, avg_days: null };
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Xin chào, ' + State.user.full_name)));
  c.appendChild(dashControls());

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
    drawPie('ch-st', rep.byStatus.map(s => s.status), rep.byStatus.map(s => s.cnt), statusColors(rep.byStatus.map(s => s.status)));
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
function drawPie(id, labels, data, colors) {
  const x = ctx(id); if (!x) return;
  charts.push(new Chart(x, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors || PALETTE }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }));
}
function barOpts() { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }; }

/* ============================ Orders list ============================ */

let orderFilters = {};
let orderSort = { key: 'order_date', dir: -1 };  // mặc định: mới nhất trước

async function viewOrders(c, opts = {}) {
  const role = State.user.role;
  const lead = isLeadUser(State.user);
  const assignedToMe = !!opts.assignedToMe;            // tab "Order được giao" của Lead
  const managed = !!opts.managed;                      // tab "Quản lý Order" của UA/PO (order app được giao)
  const canManage = (role === 'admin' || lead) && !assignedToMe;
  const title = assignedToMe ? 'Order được giao'
    : managed ? 'Quản lý Order'
    : lead ? 'Quản lý Order'
    : role === 'editor' ? 'Order được giao'
    : isOrdererRole(role) ? 'Order của tôi' : 'Quản lý Order';
  setTitle(title);

  const query = { ...orderFilters };
  if (assignedToMe) query.editor_id = State.user.id;
  if (managed) query.managed = 1;
  const qs = new URLSearchParams(query).toString();
  // Bộ lọc App: UA/PO chỉ thấy app được giao
  const appsEndpoint = (role === 'ua' || role === 'po') ? '/apps?assigned=1' : '/apps';
  const [orders, apps] = await Promise.all([
    api('/orders' + (qs ? '?' + qs : '')),
    api(appsEndpoint),
  ]);

  c.innerHTML = '';
  const head = el('div', { class: 'page-head' },
    el('h1', {}, title),
    el('span', { class: 'muted' }, '· ' + orders.length + ' order'),
    el('span', { class: 'spacer' }),
  );
  if (managed) head.appendChild(el('span', { class: 'muted' }, 'Order của các app bạn phụ trách'));
  if (isOrdererRole(role) && !managed) head.appendChild(el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order'));
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

  c.appendChild(renderOrderFilters(apps, ((role === 'admin' || lead) && !assignedToMe) || managed));

  if (!orders.length) {
    c.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty' }, el('div', { class: 'ico' }, '📭'),
      managed ? 'Chưa có order nào cho app bạn phụ trách' : 'Chưa có order nào')));
    return;
  }

  const showUA = role !== 'ua' || managed;  // tab Quản lý Order của UA: hiện cột Người order

  // Cột có thể bấm vào tiêu đề để sắp xếp (sort)
  const cols = [
    { key: 'category', label: 'Loại', cls: '', val: o => o.category, cell: o => catPill(o.category) },
    { key: 'order_code', label: 'Mã', cls: '', val: o => o.order_code, cell: o => el('span', { class: 'code-cell' }, o.order_code) },
    { key: 'app_name', label: 'App', cls: '', val: o => (o.app_code || '') + (o.app_name || ''), cell: o => appLabel(o) },
    { key: 'order_type_name', label: 'Loại order', cls: '', val: o => o.order_type_name || '', cell: o => el('span', { class: 'cell-ellipsis', title: o.order_type_name || '' }, o.order_type_name || '—') },
    showUA ? { key: 'ua_name', label: 'Người order', cls: '', val: o => o.ua_name || '', cell: o => o.ua_name || '—' } : null,
    { key: 'editor_name', label: 'Người làm', cls: '', val: o => o.editor_name || '', cell: o => o.editor_name ? el('span', {}, o.editor_name) : el('span', { class: 'badge amber' }, 'Chưa giao') },
    { key: 'status', label: 'Trạng thái', cls: '', val: o => o.status, cell: o => statusBadge(o.status) },
    { key: 'order_date', label: 'Ngày order', cls: 'nowrap', val: o => o.order_date || '', cell: o => fmtDate(o.order_date) },
    { key: 'completed_at', label: 'Ngày hoàn thành', cls: 'nowrap', val: o => o.completed_at || '', cell: o => o.completed_at ? fmtDate(o.completed_at) : '—' },
  ].filter(Boolean);

  const wrapNode = el('div', { class: 'table-wrap' });
  const build = () => {
    const col = cols.find(c => c.key === orderSort.key) || cols[0];
    orders.sort((a, b) => {
      const va = col.val(a), vb = col.val(b);
      if (va < vb) return -orderSort.dir;
      if (va > vb) return orderSort.dir;
      return 0;
    });
    const thead = el('thead', {}, el('tr', {}, cols.map(c => {
      const arrow = orderSort.key === c.key ? (orderSort.dir === 1 ? ' ▲' : ' ▼') : '';
      return el('th', { class: 'sortable', onclick: () => { if (orderSort.key === c.key) orderSort.dir *= -1; else { orderSort.key = c.key; orderSort.dir = 1; } build(); } }, c.label + arrow);
    })));
    const tbody = el('tbody', {}, orders.map(o => el('tr', { style: 'cursor:pointer', onclick: () => openOrderDetail(o.id) },
      cols.map(c => el('td', c.cls ? { class: c.cls } : {}, c.cell(o))))));
    wrapNode.innerHTML = '';
    wrapNode.appendChild(el('table', {}, thead, tbody));
  };
  build();
  c.appendChild(wrapNode);
}

function renderOrderFilters(apps, managerFilters) {
  const wrap = el('div', { class: 'filters' });
  const meta = State.meta;
  const pending = { ...orderFilters };

  const doSearch = () => { orderFilters = { ...pending }; route(); };

  wrap.appendChild(fInput('search', 'Tìm kiếm', 'Mã / mô tả', pending, doSearch));
  // App: dropdown có ô tìm kiếm (nhiều app vẫn tìm nhanh)
  const appItems = [{ value: '', label: 'Tất cả' }, ...(apps || []).map(a => ({ value: a.id, label: a.code + ' - ' + a.name }))];
  const appCombo = makeCombo(appItems, pending.app_id || '', 'Tất cả', (v) => { if (v) pending.app_id = v; else delete pending.app_id; });
  wrap.appendChild(el('div', { class: 'field', style: 'min-width:220px' }, el('label', {}, 'App'), appCombo.node));
  wrap.appendChild(fSelect('status', 'Trạng thái', [['', 'Tất cả'], ...meta.statuses.map(s => [s, s])], pending));
  wrap.appendChild(fSelect('category', 'Loại', [['', 'Tất cả'], ['image', 'Ảnh'], ['video', 'Video']], pending));
  const typeOpts = [['', 'Tất cả'], ...(meta.orderTypes || []).map(t => [t.id, (t.category === 'video' ? '🎬 ' : '🖼️ ') + t.name])];
  wrap.appendChild(fSelect('order_type_id', 'Loại order', typeOpts, pending));
  if (managerFilters) {
    wrap.appendChild(fSelect('ua_id', 'Người order', [['', 'Tất cả'], ...meta.uas.map(u => [u.id, u.full_name])], pending));
    wrap.appendChild(fSelect('editor_id', 'Người làm', [['', 'Tất cả'], ['none', '— Chưa giao —'], ...meta.editors.map(u => [u.id, u.full_name])], pending));
  }
  wrap.appendChild(fDate('from', 'Từ ngày', pending));
  wrap.appendChild(fDate('to', 'Đến ngày', pending));

  wrap.appendChild(el('div', { class: 'field' }, el('label', { style: 'visibility:hidden' }, '.'),
    el('button', { class: 'btn primary', onclick: doSearch }, '🔍 Tìm kiếm')));
  if (Object.keys(orderFilters).length)
    wrap.appendChild(el('div', { class: 'field' }, el('label', { style: 'visibility:hidden' }, '.'),
      el('button', { class: 'btn', onclick: () => { orderFilters = {}; route(); } }, '✕ Xóa lọc')));
  return wrap;
}

// Bộ lọc chỉ ghi vào "pending"; chỉ áp dụng khi bấm "Tìm kiếm"
function fInput(key, label, ph, pending, onEnter) {
  const inp = el('input', { type: 'text', placeholder: ph, value: pending[key] || '' });
  inp.addEventListener('input', () => { if (inp.value) pending[key] = inp.value; else delete pending[key]; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && onEnter) onEnter(); });
  return el('div', { class: 'field' }, el('label', {}, label), inp);
}
function fSelect(key, label, options, pending) {
  const sel = el('select', {}, options.map(([v, t]) => el('option', { value: v, selected: String(pending[key] || '') === String(v) }, t)));
  sel.addEventListener('change', () => { if (sel.value) pending[key] = sel.value; else delete pending[key]; });
  return el('div', { class: 'field' }, el('label', {}, label), sel);
}
function fDate(key, label, pending) {
  const inp = el('input', { type: 'text', placeholder: 'Chọn ngày', readonly: true });
  setTimeout(() => initDatePicker(inp, pending[key] || null, (dateStr) => { if (dateStr) pending[key] = dateStr; else delete pending[key]; }), 0);
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
  add('Mô tả chi tiết', o.description ? el('div', { class: 'rich-text', html: sanitizeRichHtml(o.description) }) : '');
  if (o.note_request) add('Lưu ý (UA)', o.note_request);
  if (o.ref_link) add('Ref link', el('a', { href: o.ref_link, target: '_blank' }, o.ref_link));
  if (o.app_link) add('Link App', el('a', { href: o.app_link, target: '_blank' }, o.app_link));
  if (o.app_figma || o.link_figma) add('Link Figma', el('a', { href: o.app_figma || o.link_figma, target: '_blank' }, o.app_figma || o.link_figma));
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
  // Lead chỉ quản lý order đúng loại mình phụ trách; Admin quản lý mọi loại
  const canManageThis = role === 'admin' || (isLead && o.category === leadCategory(State.user));
  const footer = [];
  // Lead (đúng loại)/Admin: giao việc & submit khi order đang "Đợi submit"
  if (canManageThis && o.status === 'Đợi submit') {
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openSubmitDialog(o); } }, '✅ Giao việc & Submit'));
  }
  // Lead (đúng loại)/Admin: đổi người làm sau khi đã submit (vd người được giao ban đầu đang bận)
  if (canManageThis && ['Chờ làm', 'Đang làm', 'Yêu cầu sửa'].includes(o.status)) {
    footer.push(el('button', { class: 'btn', onclick: () => { closeM(); openReassignDialog(o); } }, '🔄 Đổi người làm'));
  }
  if (role === 'editor' && o.editor_id === State.user.id && o.status !== 'Đợi submit') footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openEditorUpdate(o); } }, '✏️ Cập nhật tiến độ'));
  if (role === 'admin') {
    if (canCancel) footer.push(el('button', { class: 'btn danger', onclick: cancelOrder }, '🚫 Hủy order'));
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openOrderForm(o); } }, '✏️ Sửa'));
  }
  if (isOrdererRole(role) && o.ua_id === State.user.id) {
    if (o.status === 'Hoàn thành') footer.push(el('button', { class: 'btn', onclick: async () => { await api('/orders/' + o.id, { method: 'PUT', body: { status: 'Yêu cầu sửa' } }); toast('Đã gửi yêu cầu sửa'); closeM(); route(); } }, '↩️ Yêu cầu sửa'));
    if (canCancel) footer.push(el('button', { class: 'btn danger', onclick: cancelOrder }, '🚫 Hủy order'));
    footer.push(el('button', { class: 'btn primary', onclick: () => { closeM(); openOrderForm(o); } }, '✏️ Sửa'));
  }
  // Nhân bản: tạo order mới với dữ liệu giống order này (cho người order & admin)
  if (isOrdererRole(role) || role === 'admin') {
    footer.push(el('button', { class: 'btn', onclick: () => { closeM(); openOrderForm(o, { dup: true }); } }, '📄 Nhân bản'));
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
  // chỉ cho chọn người làm cùng loại creative (ảnh -> graphic/lead/uiux, video -> video/lead)
  const editorSel = el('select', {}, el('option', { value: '' }, '— Chọn người làm —'),
    editorsForCategory(o.category).map(u => el('option', { value: u.id, selected: o.editor_id === u.id }, u.full_name + ' (' + editorTypeLabel(u.editor_type) + ')')));
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

/* ---- Lead/Admin: đổi người làm sau khi đã submit ---- */
function openReassignDialog(o) {
  // Chọn người làm cùng loại order (video -> video/lead; ảnh -> graphic/lead/uiux)
  const editorSel = el('select', {}, el('option', { value: '' }, '— Chọn người làm —'),
    editorsForCategory(o.category)
      .map(u => el('option', { value: u.id, selected: o.editor_id === u.id }, u.full_name + ' (' + editorTypeLabel(u.editor_type) + ')')));
  const body = el('div', {},
    el('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Đổi người thực hiện order (vd: người được giao ban đầu đang bận). Order sẽ chuyển về "Chờ làm" để người mới bắt đầu lại từ đầu.'),
    el('div', { class: 'field' }, el('label', {}, 'Người làm hiện tại'), el('div', { class: 'hint', style: 'margin:0' }, o.editor_name || '—')),
    el('div', { class: 'field' }, el('label', {}, 'Đổi sang'), editorSel),
  );
  const save = async () => {
    if (!editorSel.value) return toast('Vui lòng chọn người làm', 'err');
    if (Number(editorSel.value) === o.editor_id) return toast('Đây vẫn là người đang được giao', 'err');
    try {
      await api('/orders/' + o.id, { method: 'PUT', body: { editor_id: Number(editorSel.value), status: 'Chờ làm' } });
      toast('Đã đổi người làm'); closeM(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: 'Đổi người làm: ' + o.order_code, body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '🔄 Đổi người làm')] });
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

async function openOrderForm(order, opts = {}) {
  const body = el('div', {});
  const title = opts.dup ? 'Nhân bản Order' : opts.draftId ? 'Sửa nháp order' : order ? 'Sửa Order ' + order.order_code : 'Tạo Order mới';
  const closeM = openModal({ title, body, wide: true });
  await buildOrderForm(body, order, false, closeM, opts);
}

// Danh sách bản nháp của người order
async function viewDrafts(c) {
  setTitle('Bản nháp');
  const drafts = await api('/order_drafts');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Bản nháp'), el('span', { class: 'muted' }, '· ' + drafts.length + ' nháp'),
    el('span', { class: 'spacer' }), el('a', { class: 'btn primary', href: '#/new' }, '➕ Tạo order mới')));

  if (!drafts.length) { c.appendChild(el('p', { class: 'muted', style: 'padding:14px' }, 'Chưa có bản nháp nào. Khi tạo order, bấm "📝 Lưu nháp" để lưu tạm và chỉnh sửa dần.')); return; }

  const typeName = (id) => { const t = (State.meta.orderTypes || []).find(x => x.id === Number(id)); return t ? t.name : '—'; };
  const stripHtml = (h) => { const d = el('div', { html: sanitizeRichHtml(h || '') }); return (d.textContent || '').trim(); };

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Loại'), el('th', {}, 'App'), el('th', {}, 'Loại order'), el('th', {}, 'Mô tả'), el('th', {}, 'Cập nhật'), el('th', {}, ''))),
    el('tbody', {}, drafts.map(d => {
      const data = d.data || {};
      const descText = stripHtml(data.description);
      return el('tr', {},
        el('td', {}, data.category ? catPill(data.category) : '—'),
        el('td', {}, data.app_name || '—'),
        el('td', {}, el('span', { class: 'cell-ellipsis', title: typeName(data.order_type_id) }, typeName(data.order_type_id))),
        el('td', {}, el('span', { class: 'cell-ellipsis', title: descText }, descText || '—')),
        el('td', { class: 'nowrap' }, fmtDate(d.updated_at)),
        el('td', { class: 'nowrap' },
          el('button', { class: 'btn sm primary', onclick: () => openOrderForm(data, { draftId: d.id }) }, '✏️ Tiếp tục'),
          el('button', { class: 'btn sm danger', style: 'margin-left:6px', onclick: () => confirmDialog('Xóa bản nháp này?', async () => { await api('/order_drafts/' + d.id, { method: 'DELETE' }); toast('Đã xóa nháp'); route(); }) }, '🗑'),
        ),
      );
    })),
  );
  c.appendChild(el('div', { class: 'table-wrap' }, table));
}

// Dropdown có ô tìm kiếm. items: [{value, label}]. Trả { node, getValue }
// Dropdown chọn nhiều người (xổ xuống, có ô tìm + tick chọn). users: [{id, full_name}]
function multiCheck(users, selectedIds) {
  const sel = new Set((selectedIds || []).map(Number));
  const wrap = el('div', { class: 'combo' });
  const display = el('button', { type: 'button', class: 'combo-display' });
  const panel = el('div', { class: 'combo-panel', style: 'display:none' });
  const search = el('input', { class: 'combo-search', placeholder: '🔍 Tìm tên...' });
  const list = el('div', { class: 'combo-list' });
  panel.appendChild(search); panel.appendChild(list);
  wrap.appendChild(display); wrap.appendChild(panel);

  const renderDisplay = () => {
    const names = users.filter(u => sel.has(Number(u.id))).map(u => u.full_name);
    display.textContent = names.length ? names.join(', ') : '— Chọn người —';
    display.classList.toggle('placeholder', !names.length);
  };
  const renderList = (filter) => {
    list.innerHTML = '';
    const f = (filter || '').trim().toLowerCase();
    const matched = users.filter(u => u.full_name.toLowerCase().includes(f));
    if (!matched.length) { list.appendChild(el('div', { class: 'combo-empty' }, users.length ? 'Không tìm thấy' : 'Chưa có người dùng phù hợp')); return; }
    matched.forEach(u => {
      const cb = el('input', { type: 'checkbox', checked: sel.has(Number(u.id)) });
      const opt = el('label', { class: 'combo-opt' + (sel.has(Number(u.id)) ? ' sel' : '') }, cb, el('span', {}, u.full_name));
      cb.addEventListener('change', () => {
        if (cb.checked) sel.add(Number(u.id)); else sel.delete(Number(u.id));
        opt.classList.toggle('sel', cb.checked);
        renderDisplay();
      });
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
  return { node: wrap, getValues: () => [...sel] };
}

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

async function buildOrderForm(container, order, inline, closeM, opts = {}) {
  const meta = State.meta;
  const role = State.user.role;
  const isAdmin = role === 'admin';
  const dup = !!opts.dup;                       // nhân bản: prefill nhưng tạo order MỚI
  const draftId = opts.draftId || null;         // đang sửa tiếp 1 bản nháp
  const asNew = dup || !!draftId;               // prefill nhưng hành xử như tạo mới
  const isEdit = !!order && !asNew;             // sửa order thật đã có
  // Danh sách app có thể tạo order (đang chạy/đợi bàn giao; UA/PO chỉ thấy app được giao)
  const apps = await api('/apps?for_order=1');
  const allApps = isAdmin && isEdit ? await api('/apps') : apps;
  const appList = (isEdit ? allApps : apps);

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

  // Order date = ngày tạo order, không cho chọn (nhân bản/nháp dùng ngày hôm nay)
  const orderDateDefault = isEdit ? (order.order_date || '').slice(0, 10) : todayLocal();
  const orderDateDisplay = el('input', { type: 'text', value: fmtDate(orderDateDefault), disabled: true });

  const desc = richEditor(order ? order.description || '' : '', 'Mô tả chi tiết yêu cầu... (bôi đen chữ rồi bấm B/I/U hoặc chọn màu để nhấn mạnh)');
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

  // Giao cho người làm (bắt buộc). Lọc theo loại: Video -> video/lead; Ảnh -> graphic/lead/uiux
  const editorSel = el('select', {});
  const fillAssign = () => {
    const cur = order ? order.editor_id : null;
    const list = editorsForCategory(cat.value);
    editorSel.innerHTML = '';
    editorSel.appendChild(el('option', { value: '' }, '— Chọn người làm —'));
    list.forEach(u => editorSel.appendChild(el('option', { value: u.id, selected: u.id === cur }, u.full_name + ' (' + editorTypeLabel(u.editor_type) + ')')));
  };
  fillAssign();
  const assignHint = el('div', { class: 'hint' }, '');
  const updateAssignHint = () => { assignHint.textContent = cat.value === 'video' ? 'Order video sẽ chờ Video Lead duyệt & submit rồi mới chuyển cho người làm.' : 'Order ảnh sẽ chờ Graphic Lead duyệt & submit rồi mới chuyển cho người làm.'; };
  updateAssignHint();

  const statusSel = el('select', {}, meta.statuses.map(s => el('option', { value: s, selected: order && order.status === s }, s)));

  cat.addEventListener('change', () => { fillTypes(); buildSizeSection(); toggleYt(); fillAssign(); updateAssignHint(); });

  container.innerHTML = '';
  container.appendChild(el('div', {},
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'Loại creative ', el('span', { class: 'req' }, '*')), cat),
      el('div', { class: 'field' }, el('label', {}, 'Loại order ', el('span', { class: 'req' }, '*')), typeSel),
    ),
    el('div', { class: 'field' }, el('label', {}, 'App ', el('span', { class: 'req' }, '*')), appCombo.node, appHint),
    el('div', { class: 'field' }, el('label', {}, 'Order date'), orderDateDisplay),
    el('div', { class: 'field' }, el('label', {}, 'Mô tả chi tiết'), desc.node),
    el('div', { class: 'field' }, el('label', {}, 'Kích thước'), sizeBox),
    ytField,
    el('div', { class: 'field' }, el('label', {}, 'Ref link'), ref),
    el('div', { class: 'field' }, el('label', {}, 'Lưu ý'), noteReq),
    el('div', { class: 'field' }, el('label', {}, 'Giao cho (người làm) ', el('span', { class: 'req' }, '*')), editorSel, assignHint),
    isAdmin && isEdit ? el('div', { class: 'field' }, el('label', {}, 'Trạng thái'), statusSel) : null,
  ));

  updateAppLink();

  // Gom dữ liệu form (không kiểm tra bắt buộc — dùng cho cả nháp)
  const collectBody = () => {
    const appId = appCombo.getValue();
    return {
      category: cat.value,
      order_type_id: typeSel.value ? Number(typeSel.value) : null,
      app_id: appId ? Number(appId) : null,
      app_name: (appList.find(a => a.id === Number(appId)) || {}).name || '',
      order_date: orderDateDefault, description: desc.getHTML(),
      ref_link: ref.value, size: collectSizes(), note_request: noteReq.value,
      need_youtube: (cat.value === 'video' && needYoutube.checked) ? 1 : 0,
      editor_id: editorSel.value ? Number(editorSel.value) : null,
    };
  };
  const finishNav = () => { if (closeM) closeM(); if (inline) location.hash = '#/orders'; else route(); };

  // Lưu nháp: lưu tạm, không cần điền đủ
  const saveDraft = async () => {
    const body = collectBody();
    try {
      if (draftId) await api('/order_drafts/' + draftId, { method: 'PUT', body: { data: body } });
      else await api('/order_drafts', { method: 'POST', body: { data: body } });
      toast('Đã lưu nháp');
      if (closeM) closeM();
      location.hash = '#/drafts';
      if (!inline && !closeM) route();
    } catch (e) { toast(e.message, 'err'); }
  };

  // Chốt tạo order (mới / nhân bản / từ nháp): bắt buộc đủ thông tin
  const createOrder = async () => {
    const body = collectBody();
    if (!body.app_id) return toast('Vui lòng chọn App', 'err');
    if (!body.order_type_id) return toast('Vui lòng chọn loại order', 'err');
    if (!body.editor_id) return toast('Vui lòng chọn người làm', 'err');
    try {
      const r = await api('/orders', { method: 'POST', body });
      toast('Đã tạo order ' + r.order_code);
      if (draftId) { try { await api('/order_drafts/' + draftId, { method: 'DELETE' }); } catch (e) {} }
      finishNav();
    } catch (e) { toast(e.message, 'err'); }
  };

  // Lưu thay đổi order thật đã có
  const saveEdit = async () => {
    const body = collectBody();
    if (!body.app_id) return toast('Vui lòng chọn App', 'err');
    if (!body.order_type_id) return toast('Vui lòng chọn loại order', 'err');
    if (!body.editor_id) return toast('Vui lòng chọn người làm', 'err');
    if (isAdmin) body.status = statusSel.value;
    try {
      await api('/orders/' + order.id, { method: 'PUT', body });
      toast('Đã lưu thay đổi'); finishNav();
    } catch (e) { toast(e.message, 'err'); }
  };

  const showDraftBtn = !isEdit && isOrdererRole(role);
  const actions = el('div', { style: 'display:flex; gap:10px; justify-content:flex-end; margin-top:8px;' },
    closeM ? el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy') : el('a', { class: 'btn', href: '#/orders' }, 'Hủy'),
    showDraftBtn ? el('button', { class: 'btn', onclick: saveDraft }, '📝 Lưu nháp') : null,
    el('button', { class: 'btn primary', onclick: isEdit ? saveEdit : createOrder }, isEdit ? '💾 Lưu' : '➕ Tạo order'),
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
    el('thead', {}, el('tr', {}, el('th', {}, 'Mã app'), el('th', {}, 'Tên app'), el('th', {}, 'Đối tác'), el('th', {}, 'UA'), el('th', {}, 'PO'), el('th', {}, 'Link App'), el('th', {}, 'Link Figma'), el('th', {}, 'Tình trạng'), el('th', {}, ''))),
    el('tbody', {}, apps.map(a => el('tr', {},
      el('td', {}, el('span', { class: 'code-cell' }, a.code)),
      el('td', {}, a.link ? el('a', { href: a.link, target: '_blank' }, a.name) : a.name),
      el('td', {}, a.partner || '—'),
      el('td', {}, (a.uas && a.uas.length) ? a.uas.map(u => u.full_name).join(', ') : '—'),
      el('td', {}, (a.pos && a.pos.length) ? a.pos.map(u => u.full_name).join(', ') : '—'),
      el('td', {}, a.link ? el('a', { href: a.link, target: '_blank' }, '🔗 Store') : '—'),
      el('td', {}, a.figma_link ? el('a', { href: a.figma_link, target: '_blank' }, '🎨 Figma') : '—'),
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

  // UA/PO phụ trách: chọn nhiều từ danh sách user trong DB (không nhập tay)
  const uaPick = multiCheck(meta.uas || [], a && a.uas ? a.uas.map(u => u.id) : []);
  const poPick = multiCheck(meta.pos || [], a && a.pos ? a.pos.map(u => u.id) : []);

  const body = el('div', {},
    el('div', { class: 'form-row' }, codeField, nameField),
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'Đối tác'), partnerSel),
      el('div', { class: 'field' }, el('label', {}, 'Mã CODE (tự tạo)'), appCode)),
    el('div', { class: 'form-row' }, mk('link', 'Link app (store)', a && a.link), mk('figma_link', 'Link Figma', a && a.figma_link)),
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'UA phụ trách'), uaPick.node),
      el('div', { class: 'field' }, el('label', {}, 'PO phụ trách'), poPick.node)),
    el('div', { class: 'field' }, el('label', {}, 'Tình trạng'), status),
  );
  const save = async () => {
    const payload = { status: status.value, app_code: appCode.value, partner: partnerSel.value, ua_ids: uaPick.getValues(), po_ids: poPick.getValues() };
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

let usersTab = 'all';   // 'all' | 'ua' | 'po'
async function viewUsers(c) {
  setTitle('Quản lý User');
  const [users, apps] = await Promise.all([api('/users'), api('/apps')]);
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Quản lý User'), el('span', { class: 'muted' }, '· ' + users.length + ' tài khoản'),
    el('span', { class: 'spacer' }), el('button', { class: 'btn primary', onclick: () => openUserForm(null) }, '➕ Thêm user')));

  // Tabs: tất cả user / danh sách UA / danh sách PO (kèm app được giao)
  const tabBtn = (k, label) => el('button', { class: usersTab === k ? 'active' : '', onclick: () => { usersTab = k; route(); } }, label);
  c.appendChild(el('div', { class: 'tabs' }, tabBtn('all', 'Tất cả user'), tabBtn('ua', 'Danh sách UA'), tabBtn('po', 'Danh sách PO')));

  if (usersTab === 'ua' || usersTab === 'po') renderAssigneeList(c, users, apps, usersTab);
  else renderAllUsers(c, users);
}

function renderAllUsers(c, users) {
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Họ tên'), el('th', {}, 'Username'), el('th', {}, 'Vai trò'), el('th', {}, '2FA'), el('th', {}, 'Trạng thái'), el('th', {}, ''))),
    el('tbody', {}, users.map(u => el('tr', { style: u.active ? '' : 'opacity:.5' },
      el('td', {}, u.full_name),
      el('td', {}, el('code', {}, u.username)),
      el('td', {}, roleBadge(u)),
      el('td', {}, u.totp_enabled ? el('span', { class: 'badge green' }, '🔐 Bật') : el('span', { class: 'badge gray' }, 'Tắt')),
      el('td', {}, u.active ? el('span', { class: 'badge green' }, 'Hoạt động') : el('span', { class: 'badge gray' }, 'Đã khóa')),
      el('td', { class: 'nowrap' },
        el('button', { class: 'btn sm', onclick: () => openUserForm(u) }, '✏️'),
        u.totp_enabled ? el('button', { class: 'btn sm', title: 'Reset 2FA (mất điện thoại)', style: 'margin-left:6px', onclick: () => confirmDialog('Reset (tắt) 2FA của ' + u.full_name + '? Họ sẽ đăng nhập chỉ bằng mật khẩu cho tới khi bật lại.', async () => { await api('/users/' + u.id + '/reset-2fa', { method: 'POST' }); toast('Đã reset 2FA'); route(); }) }, '🔓 Reset 2FA') : null,
      ),
    ))),
  );
  c.appendChild(el('div', { class: 'table-wrap' }, table));
}

// Danh sách UA/PO kèm các app đang được giao phụ trách
function renderAssigneeList(c, users, apps, role) {
  const key = role === 'ua' ? 'uas' : 'pos';
  const byUser = {};   // userId -> [app, ...]
  (apps || []).forEach(a => (a[key] || []).forEach(x => { (byUser[x.id] = byUser[x.id] || []).push(a); }));
  const list = users.filter(u => u.role === role && u.active);

  if (!list.length) { c.appendChild(el('p', { class: 'muted', style: 'padding:14px' }, 'Chưa có ' + role.toUpperCase() + ' nào.')); return; }

  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Họ tên'), el('th', {}, 'Username'), el('th', {}, 'Số app'), el('th', {}, 'App được giao phụ trách'), el('th', {}, ''))),
    el('tbody', {}, list.map(u => {
      const myApps = (byUser[u.id] || []).slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      const appsCell = myApps.length
        ? el('div', { style: 'display:flex; flex-wrap:wrap; gap:6px' },
            myApps.map(a => el('span', { class: 'badge indigo', title: a.code + ' - ' + a.name }, a.code + ' - ' + a.name)))
        : el('span', { class: 'muted' }, '— Chưa được giao app nào —');
      return el('tr', {},
        el('td', { class: 'nowrap' }, u.full_name),
        el('td', {}, el('code', {}, u.username)),
        el('td', {}, String(myApps.length)),
        el('td', {}, appsCell),
        el('td', { class: 'nowrap' }, el('button', { class: 'btn sm', onclick: () => openUserAppsDialog(u, apps) }, '✏️ Sửa app')),
      );
    })),
  );
  c.appendChild(el('div', { class: 'table-wrap' }, table));
}

// Bảng tick chọn nhiều app (luôn mở, có ô tìm + chọn/bỏ tất cả). items: [{id, label}]
function appChecklist(items, selectedIds) {
  const sel = new Set((selectedIds || []).map(Number));
  const counter = el('span', { class: 'muted' }, '');
  const search = el('input', { class: 'combo-search', placeholder: '🔍 Tìm theo mã / tên app...' });
  const listBox = el('div', { class: 'checklist-box' });
  let curFilter = '';
  const updateCounter = () => { counter.textContent = 'Đã chọn ' + sel.size + ' / ' + items.length + ' app'; };
  const matching = () => { const f = curFilter.trim().toLowerCase(); return items.filter(it => it.label.toLowerCase().includes(f)); };
  const render = () => {
    listBox.innerHTML = '';
    const matched = matching();
    if (!matched.length) { listBox.appendChild(el('div', { class: 'combo-empty' }, 'Không tìm thấy app')); return; }
    matched.forEach(it => {
      const cb = el('input', { type: 'checkbox', checked: sel.has(Number(it.id)) });
      const opt = el('label', { class: 'combo-opt' + (sel.has(Number(it.id)) ? ' sel' : '') }, cb, el('span', {}, it.label));
      cb.addEventListener('change', () => { if (cb.checked) sel.add(Number(it.id)); else sel.delete(Number(it.id)); opt.classList.toggle('sel', cb.checked); updateCounter(); });
      listBox.appendChild(opt);
    });
  };
  const selAll = el('button', { type: 'button', class: 'btn sm', onclick: () => { matching().forEach(it => sel.add(Number(it.id))); render(); updateCounter(); } }, '✓ Chọn tất cả');
  const clrAll = el('button', { type: 'button', class: 'btn sm', onclick: () => { sel.clear(); render(); updateCounter(); } }, '✕ Bỏ hết');
  search.addEventListener('input', () => { curFilter = search.value; render(); });
  const header = el('div', { style: 'display:flex; align-items:center; gap:8px; margin:8px 0; flex-wrap:wrap' }, counter, el('span', { class: 'spacer' }), selAll, clrAll);
  const node = el('div', {}, search, header, listBox);
  render(); updateCounter();
  return { node, getValues: () => [...sel] };
}

// Sửa danh sách app phụ trách của 1 UA/PO ngay trong tab Danh sách UA/PO
function openUserAppsDialog(user, apps) {
  const key = user.role === 'ua' ? 'uas' : 'pos';
  const items = (apps || []).map(a => ({ id: a.id, label: a.code + ' - ' + a.name }));
  const cur = (apps || []).filter(a => (a[key] || []).some(x => Number(x.id) === Number(user.id))).map(a => a.id);
  const pick = appChecklist(items, cur);
  const body = el('div', {},
    el('p', { class: 'hint', style: 'margin-bottom:6px' }, 'Tick các app mà ' + user.full_name + ' (' + user.role.toUpperCase() + ') phụ trách. Bỏ tick để gỡ.'),
    pick.node,
  );
  const save = async () => {
    try {
      await api('/users/' + user.id + '/apps', { method: 'PUT', body: { app_ids: pick.getValues() } });
      toast('Đã cập nhật app phụ trách'); closeM(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: 'Sửa app phụ trách: ' + user.full_name, body, wide: true, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
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
  const discord = el('input', { value: u && u.discord_id ? u.discord_id : '', placeholder: 'VD: 712345678901234567' });

  const body = el('div', {},
    el('div', { class: 'field' }, el('label', {}, 'Họ tên *'), fullName),
    el('div', { class: 'field' }, el('label', {}, 'Username *'), username, u ? el('div', { class: 'hint' }, 'Không thể đổi username') : null),
    el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Vai trò'), role, isAdminAcc ? el('div', { class: 'hint' }, 'Tài khoản Admin không thể đổi vai trò') : null),
      el('div', { class: 'field' }, el('label', {}, 'Mật khẩu'), pass)),
    el('div', { class: 'field' }, el('label', {}, 'Discord ID (để @tag khi báo Discord)'), discord,
      el('div', { class: 'hint' }, 'Discord → Settings → Advanced → bật Developer Mode → chuột phải tên người → Copy User ID')),
    u ? el('div', { class: 'field' }, el('label', {}, 'Trạng thái'), active) : null,
  );

  const save = async () => {
    const [r, et] = role.value.split(':');
    const payload = { full_name: fullName.value, role: r, editor_type: et || null, discord_id: discord.value.trim() };
    if (pass.value) payload.password = pass.value;
    try {
      if (u) { payload.active = Number(active.value); await api('/users/' + u.id, { method: 'PUT', body: payload }); }
      else { payload.username = username.value; await api('/users', { method: 'POST', body: payload }); }
      toast('Đã lưu'); closeM(); await refreshMeta(); route();
    } catch (e) { toast(e.message, 'err'); }
  };
  const closeM = openModal({ title: u ? 'Sửa user' : 'Thêm user', body, footer: [el('button', { class: 'btn', onclick: () => closeM() }, 'Hủy'), el('button', { class: 'btn primary', onclick: save }, '💾 Lưu')] });
}

/* ============================ Bảo mật ============================ */

async function viewSecurity(c) {
  setTitle('Bảo mật');
  const { user } = await api('/me');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Bảo mật tài khoản')));

  // --- Đổi mật khẩu ---
  const oldP = el('input', { type: 'password', placeholder: 'Mật khẩu hiện tại' });
  const newP = el('input', { type: 'password', placeholder: 'Mật khẩu mới (tối thiểu 4 ký tự)' });
  const conf = el('input', { type: 'password', placeholder: 'Nhập lại mật khẩu mới' });
  const changePw = async () => {
    if (newP.value.length < 4) return toast('Mật khẩu mới tối thiểu 4 ký tự', 'err');
    if (newP.value !== conf.value) return toast('Mật khẩu nhập lại không khớp', 'err');
    try {
      await api('/me/password', { method: 'POST', body: { old_password: oldP.value, new_password: newP.value } });
      toast('Đã đổi mật khẩu'); oldP.value = newP.value = conf.value = '';
    } catch (e) { toast(e.message, 'err'); }
  };
  c.appendChild(el('div', { class: 'card card-pad', style: 'max-width:560px; margin-bottom:18px' },
    el('h3', {}, '🔑 Đổi mật khẩu'),
    el('div', { class: 'field' }, el('label', {}, 'Mật khẩu hiện tại'), oldP),
    el('div', { class: 'form-row' },
      el('div', { class: 'field' }, el('label', {}, 'Mật khẩu mới'), newP),
      el('div', { class: 'field' }, el('label', {}, 'Nhập lại'), conf)),
    el('button', { class: 'btn primary', onclick: changePw }, '💾 Đổi mật khẩu'),
  ));

  // --- 2FA ---
  const twofaCard = el('div', { class: 'card card-pad', style: 'max-width:560px' });
  c.appendChild(twofaCard);
  renderTwofa(twofaCard, user.totp_enabled);
}

function renderTwofa(card, enabled) {
  card.innerHTML = '';
  card.appendChild(el('h3', {}, '🔐 Xác thực 2 lớp (2FA)'));
  card.appendChild(el('p', { class: 'hint', style: 'margin-bottom:12px' },
    'Dùng app Google Authenticator (hoặc Authy, Microsoft Authenticator). Khi bật, mỗi lần đăng nhập cần thêm mã 6 số — kẻ gian biết mật khẩu vẫn không vào được.'));

  if (enabled) {
    card.appendChild(el('div', { style: 'margin-bottom:12px' }, el('span', { class: 'badge green' }, '✅ Đang bật')));
    const code = el('input', { inputmode: 'numeric', placeholder: 'Nhập mã 6 số để tắt', style: 'max-width:240px' });
    const disable = async () => {
      try { await api('/me/2fa/disable', { method: 'POST', body: { code: code.value } }); toast('Đã tắt 2FA'); renderTwofa(card, false); }
      catch (e) { toast(e.message, 'err'); }
    };
    card.appendChild(el('div', { class: 'field' }, el('label', {}, 'Tắt 2FA (cần mã hiện tại)'), code));
    card.appendChild(el('button', { class: 'btn danger', onclick: disable }, 'Tắt 2FA'));
    return;
  }

  card.appendChild(el('div', { style: 'margin-bottom:12px' }, el('span', { class: 'badge gray' }, 'Chưa bật')));
  const startBtn = el('button', { class: 'btn primary', onclick: async () => {
    try {
      const data = await api('/me/2fa/setup', { method: 'POST' });
      showSetup(card, data);
    } catch (e) { toast(e.message, 'err'); }
  } }, '🔐 Bật 2FA');
  card.appendChild(startBtn);
}

function showSetup(card, data) {
  card.innerHTML = '';
  card.appendChild(el('h3', {}, '🔐 Thiết lập 2FA'));
  card.appendChild(el('ol', { class: 'hint', style: 'margin:0 0 12px 18px; line-height:1.9' },
    el('li', {}, 'Mở app Authenticator → thêm tài khoản → quét mã QR bên dưới.'),
    el('li', {}, 'Nhập mã 6 số đang hiện trong app rồi bấm Xác nhận.')));
  card.appendChild(el('img', { src: data.qr, alt: 'QR', style: 'width:180px; height:180px; border:1px solid var(--border); border-radius:8px' }));
  card.appendChild(el('div', { class: 'hint', style: 'margin:8px 0' }, 'Không quét được? Nhập tay mã bí mật: ', el('code', {}, data.secret)));
  const code = el('input', { inputmode: 'numeric', placeholder: 'Mã 6 số', style: 'max-width:240px' });
  const confirm = async () => {
    try { await api('/me/2fa/enable', { method: 'POST', body: { code: code.value } }); toast('Đã bật 2FA 🎉'); renderTwofa(card, true); }
    catch (e) { toast(e.message, 'err'); }
  };
  card.appendChild(el('div', { class: 'field', style: 'margin-top:10px' }, el('label', {}, 'Mã xác nhận'), code));
  card.appendChild(el('div', {}, el('button', { class: 'btn primary', onclick: confirm }, '✅ Xác nhận & Bật'),
    ' ', el('button', { class: 'btn', onclick: () => renderTwofa(card, false) }, 'Hủy')));
}

/* ============================ Cài đặt ============================ */

let settingsTab = 'ua';

async function viewSettings(c) {
  setTitle('Cài đặt');
  c.innerHTML = '';
  c.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Cài đặt'),
    el('span', { class: 'muted' }, '· dữ liệu nguồn cho các ô chọn ở những trang khác')));

  const TABS = [['ua', '👤 UA'], ['editor', '🎨 Editor'], ['partner', '🤝 Đối tác'], ['image', '🖼️ Loại order ảnh'], ['video', '🎬 Loại order video'], ['sizes', '📐 Size ảnh'], ['import', '📥 Nhập dữ liệu'], ['discord', '🤖 Discord']];
  c.appendChild(el('div', { class: 'tabs' }, TABS.map(([k, label]) =>
    el('button', { class: settingsTab === k ? 'active' : '', onclick: () => { settingsTab = k; route(); } }, label))));

  const box = el('div', {});
  c.appendChild(box);
  if (settingsTab === 'ua') await settingsUsers(box, 'ua');
  else if (settingsTab === 'editor') await settingsUsers(box, 'editor');
  else if (settingsTab === 'partner') await settingsPartners(box);
  else if (settingsTab === 'image') await settingsTypes(box, 'image');
  else if (settingsTab === 'video') await settingsTypes(box, 'video');
  else if (settingsTab === 'sizes') await settingsSizes(box);
  else if (settingsTab === 'import') settingsImport(box);
  else await settingsDiscord(box);
}

async function settingsDiscord(box) {
  box.innerHTML = '';
  let cfg = { url: '', enabled: false };
  try { cfg = await api('/settings/discord'); } catch (e) {}

  const enable = el('input', { type: 'checkbox', checked: cfg.enabled ? true : false });
  const urlInp = el('input', { value: cfg.url || '', placeholder: 'https://discord.com/api/webhooks/...', style: 'width:100%' });

  const save = async () => {
    try {
      await api('/settings/discord', { method: 'PUT', body: { url: urlInp.value.trim(), enabled: enable.checked } });
      toast('Đã lưu cấu hình Discord');
    } catch (e) { toast(e.message, 'err'); }
  };
  const test = async () => {
    try {
      await api('/settings/discord/test', { method: 'POST', body: { url: urlInp.value.trim() } });
      toast('Đã gửi tin thử — kiểm tra kênh Discord 🎉');
    } catch (e) { toast(e.message, 'err'); }
  };

  box.appendChild(el('div', { class: 'card card-pad', style: 'max-width:680px' },
    el('h3', {}, '🤖 Thông báo qua Discord'),
    el('p', { class: 'hint', style: 'margin-bottom:12px' },
      'Hệ thống sẽ tự nhắn vào kênh Discord khi: order mới tạo, Lead submit, đổi người làm, hoàn thành, yêu cầu sửa, bị hủy. ' +
      'Order video mới sẽ @tag Lead vào submit; submit xong mới @tag người làm. ' +
      'Muốn @tag đích danh ai thì điền Discord ID cho người đó ở mục Quản lý User.'),
    el('label', { class: 'size-check', style: 'margin-bottom:12px' }, enable, el('span', {}, 'Bật thông báo Discord')),
    el('div', { class: 'field' }, el('label', {}, 'Webhook URL'), urlInp),
    el('div', { style: 'display:flex; gap:10px; margin-top:6px' },
      el('button', { class: 'btn primary', onclick: save }, '💾 Lưu'),
      el('button', { class: 'btn', onclick: test }, '🔔 Gửi thử')),
    el('details', { style: 'margin-top:14px' },
      el('summary', { style: 'cursor:pointer; font-weight:600' }, 'Cách lấy Webhook URL?'),
      el('ol', { style: 'margin:8px 0 0 18px; font-size:13px; line-height:1.7' },
        el('li', {}, 'Vào kênh Discord muốn nhận thông báo → bấm ⚙️ (Edit Channel).'),
        el('li', {}, 'Integrations → Webhooks → New Webhook.'),
        el('li', {}, 'Đặt tên (vd "Order Bot") → Copy Webhook URL → dán vào ô trên → Lưu.'))),
  ));
}

const APP_CSV_HEADERS = { 'ma app': 'code', 'ten app': 'name', 'doi tac': 'partner', 'link app': 'link', 'link figma': 'figma_link', 'ua': 'mkter', 'po': 'product_manager', 'tinh trang': 'status' };
const USER_CSV_HEADERS = { 'ho ten': 'full_name', 'username': 'username', 'vai tro': 'role_label', 'mat khau': 'password' };

function settingsImport(box) {
  box.innerHTML = '';
  box.appendChild(el('p', { class: 'hint', style: 'margin-bottom:14px' },
    'Cách dùng: bấm "Tải file mẫu", mở bằng Excel rồi điền dữ liệu. Lưu lại dạng ', el('b', {}, 'CSV UTF-8'), ' rồi chọn file và bấm "Nhập".'));

  const card = (title, sampleName, sampleContent, headerMap, endpoint, note) => {
    const fileInput = el('input', { type: 'file', accept: '.csv,text/csv' });
    const result = el('div', { style: 'margin-top:10px' });
    const doImport = () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return toast('Chọn file CSV trước', 'err');
      const reader = new FileReader();
      reader.onload = async () => {
        const rows = csvToObjects(reader.result, headerMap);
        if (!rows.length) return toast('File không có dữ liệu', 'err');
        try {
          const res = await api(endpoint, { method: 'POST', body: { rows } });
          result.innerHTML = '';
          result.appendChild(el('div', { class: 'badge green' }, '✅ Thêm mới: ' + (res.created || 0) + (res.updated != null ? ' · Cập nhật: ' + res.updated : '')));
          if (res.errors && res.errors.length) {
            result.appendChild(el('div', { style: 'margin-top:8px' }, el('div', { class: 'muted', style: 'font-weight:600;margin-bottom:4px' }, 'Bỏ qua ' + res.errors.length + ' dòng:'),
              el('ul', { style: 'margin:0 0 0 18px; color:var(--danger); font-size:13px' }, res.errors.slice(0, 30).map(e => el('li', {}, e)))));
          }
          toast('Đã nhập xong'); await refreshMeta();
        } catch (e) { toast(e.message, 'err'); }
      };
      reader.readAsText(f, 'utf-8');
    };
    return el('div', { class: 'card card-pad', style: 'max-width:640px; margin-bottom:16px' },
      el('h3', {}, title),
      note ? el('p', { class: 'hint', style: 'margin-bottom:10px' }, note) : null,
      el('button', { class: 'btn', onclick: () => downloadText(sampleName, sampleContent) }, '⬇️ Tải file mẫu'),
      el('div', { class: 'field', style: 'margin-top:12px' }, el('label', {}, 'Chọn file CSV đã điền'), fileInput),
      el('button', { class: 'btn primary', onclick: doImport }, '📥 Nhập'),
      result,
    );
  };

  box.appendChild(card('📱 Nhập danh sách App', 'mau-app.csv',
    'Mã app,Tên app,Đối tác,Link app,Link Figma,UA,PO,Tình trạng\nQIP100,Caller ID,Yutalabs,https://play.google.com/store/apps/details?id=...,https://figma.com/file/...,ManhVD,BaoDX,Đang chạy\n',
    APP_CSV_HEADERS, '/import/apps',
    'Trùng Mã app sẽ được cập nhật, chưa có thì thêm mới. Tình trạng: Đang chạy / Đợi bàn giao / Dừng.'));

  box.appendChild(card('👥 Nhập danh sách User', 'mau-user.csv',
    'Họ tên,Username,Vai trò,Mật khẩu\nNguyễn Văn A,,UA,\nTrần Thị B,,Graphic Designer,\n',
    USER_CSV_HEADERS, '/import/users',
    'Vai trò: UA / ASO / PO / HR / Admin / Graphic Designer / Video Editor / Video Editor Lead / UI/UX Designer. Username để trống sẽ tự tạo; Mật khẩu trống = 123456 (bắt đổi lần đầu).'));
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
let reportRange = 'this_month';  // số ngày, hoặc 'this_month' | 'last_month' | 'custom'
let reportFrom = '', reportTo = '';

function monthRange(offset) { // 0 = tháng này, -1 = tháng trước
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const fmt = (d) => ymd(d);
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
    rangeSel);
  c.appendChild(head);
  c.appendChild(el('div', { class: 'muted', style: 'margin:-6px 0 14px; font-weight:600' }, rangeText));

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
    drawPie('r-ed-st', rep.byStatus.map(s => s.status), rep.byStatus.map(s => s.cnt), statusColors(rep.byStatus.map(s => s.status)));
    drawLine('r-ed-tl', rep.timeline.map(t => fmtDate(t.day)), rep.timeline.map(t => t.cnt));
  }, 0);
}

/* ============================ Start ============================ */
boot();

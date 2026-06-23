'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const { db, init, nextOrderCode } = require('./db');
const { signToken, authenticate, requireRole } = require('./auth');

// 2FA cho phép lệch ±1 bước thời gian (30s) để tránh kẹt do lệch giờ
authenticator.options = { window: 1 };

init();

const app = express();
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

// ---- Constants (metadata cho frontend) -----------------------------------

const STATUSES = ['Đợi submit', 'Chờ làm', 'Đang làm', 'Hoàn thành', 'Yêu cầu sửa', 'Hủy'];
const APP_STATUSES = ['Đang chạy', 'Đợi bàn giao', 'Dừng'];
// Các vai trò "người order": tạo order + xem order của mình
const ORDERER_ROLES = ['ua', 'aso', 'po', 'hr'];
const isLeadUser = (u) => u.role === 'editor' && u.editor_type === 'video_lead';

// ---- Helpers -------------------------------------------------------------

// Size theo kênh, lấy từ DB (quản lý ở tab Cài đặt)
function getSizesGrouped() {
  const rows = db.prepare('SELECT platform, value FROM sizes ORDER BY sort_order, id').all();
  const out = {};
  for (const r of rows) { (out[r.platform] = out[r.platform] || []).push(r.value); }
  return out;
}

const ORDER_SELECT = `
  SELECT o.*,
         ua.full_name      AS ua_name,
         ed.full_name      AS editor_name,
         t.name            AS order_type_name,
         t.points          AS type_points,
         t.quantity_note   AS quantity_note,
         a.code            AS app_code
  FROM orders o
  LEFT JOIN users ua  ON ua.id = o.ua_id
  LEFT JOIN users ed  ON ed.id = o.editor_id
  LEFT JOIN order_types t ON t.id = o.order_type_id
  LEFT JOIN apps a    ON a.id = o.app_id
`;

function getOrder(id) {
  return db.prepare(ORDER_SELECT + ' WHERE o.id = ?').get(id);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Auth routes ---------------------------------------------------------

app.post('/api/login', (req, res) => {
  const { username, password, code } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim().toLowerCase());
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  // Nếu user đã bật 2FA: cần thêm mã từ app Authenticator
  if (user.totp_enabled && user.totp_secret) {
    if (!code) return res.status(401).json({ twofa_required: true });
    const ok = authenticator.check(String(code).replace(/\s/g, ''), user.totp_secret);
    if (!ok) return res.status(401).json({ twofa_required: true, error: 'Mã xác thực không đúng' });
  }
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, editor_type: user.editor_type, must_change_password: user.must_change_password } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Đổi mật khẩu của chính mình
app.post('/api/me/password', authenticate, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 4 ký tự' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(old_password || '', u.password_hash)) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  // Cấp lại token cho chính phiên này để không bị đăng xuất ngay
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.cookie('token', signToken(fresh), { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ ok: true });
});

// ---- 2FA (TOTP) ----------------------------------------------------------

// Bước 1: tạo secret + QR để quét vào app Authenticator (chưa bật)
app.post('/api/me/2fa/setup', authenticate, async (req, res) => {
  const secret = authenticator.generateSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, req.user.id);
  const otpauth = authenticator.keyuri(req.user.username, 'Order Creatives', secret);
  const qr = await QRCode.toDataURL(otpauth);
  res.json({ secret, otpauth, qr });
});

// Bước 2: nhập mã để xác nhận và bật 2FA
app.post('/api/me/2fa/enable', authenticate, (req, res) => {
  const code = String((req.body && req.body.code) || '').replace(/\s/g, '');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u.totp_secret) return res.status(400).json({ error: 'Chưa tạo mã 2FA. Hãy bấm "Bật 2FA" trước.' });
  if (!authenticator.check(code, u.totp_secret)) return res.status(400).json({ error: 'Mã không đúng, thử lại.' });
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Tắt 2FA (cần mã hiện tại)
app.post('/api/me/2fa/disable', authenticate, (req, res) => {
  const code = String((req.body && req.body.code) || '').replace(/\s/g, '');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.totp_enabled && (!u.totp_secret || !authenticator.check(code, u.totp_secret))) {
    return res.status(400).json({ error: 'Mã không đúng.' });
  }
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Admin reset 2FA cho user (vd nhân viên mất điện thoại)
app.post('/api/users/:id/reset-2fa', authenticate, requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy user' });
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

// ---- Metadata ------------------------------------------------------------

app.get('/api/meta', authenticate, (req, res) => {
  const orderTypes = db.prepare('SELECT id, category, name, points, quantity_note, note FROM order_types ORDER BY sort_order').all();
  const editors = db.prepare("SELECT id, full_name, editor_type FROM users WHERE role='editor' AND active=1 ORDER BY full_name").all();
  const uas = db.prepare("SELECT id, full_name FROM users WHERE role='ua' AND active=1 ORDER BY full_name").all();
  const pos = db.prepare("SELECT id, full_name FROM users WHERE role='po' AND active=1 ORDER BY full_name").all();
  const partners = db.prepare('SELECT name FROM partners ORDER BY name').all().map(p => p.name);
  res.json({
    orderTypes, editors, uas, pos, partners,
    statuses: STATUSES,
    appStatuses: APP_STATUSES,
    sizes: getSizesGrouped(),
  });
});

// ---- Apps ----------------------------------------------------------------

// Gắn danh sách UA/PO được phụ trách vào từng app
function attachAssignees(apps) {
  if (!apps.length) return apps;
  const rows = db.prepare('SELECT au.app_id, u.id, u.full_name, u.role FROM app_users au JOIN users u ON u.id = au.user_id').all();
  const byApp = {};
  rows.forEach(r => { (byApp[r.app_id] = byApp[r.app_id] || []).push(r); });
  apps.forEach(a => {
    const list = byApp[a.id] || [];
    a.uas = list.filter(x => x.role === 'ua').map(x => ({ id: x.id, full_name: x.full_name }));
    a.pos = list.filter(x => x.role === 'po').map(x => ({ id: x.id, full_name: x.full_name }));
  });
  return apps;
}
function setAppAssignees(appId, uaIds, poIds) {
  db.prepare('DELETE FROM app_users WHERE app_id = ?').run(appId);
  const valid = new Set(db.prepare("SELECT id FROM users WHERE role IN ('ua','po')").all().map(u => u.id));
  const ins = db.prepare('INSERT OR IGNORE INTO app_users (app_id, user_id) VALUES (?, ?)');
  [...(uaIds || []), ...(poIds || [])].map(Number).forEach(uid => { if (valid.has(uid)) ins.run(appId, uid); });
}

app.get('/api/apps', authenticate, (req, res) => {
  let sql = 'SELECT a.* FROM apps a';
  const params = [];
  const where = [];
  if (req.query.for_order === '1') {
    // Danh sách app có thể tạo order: đang chạy/đợi bàn giao; UA/PO chỉ thấy app được giao
    where.push("a.status IN ('Đang chạy','Đợi bàn giao')");
    if (req.user.role === 'ua' || req.user.role === 'po') {
      sql += ' JOIN app_users au ON au.app_id = a.id AND au.user_id = ?';
      params.push(req.user.id);
    }
  } else if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  else if (req.query.active === '1') { where.push("a.status IN ('Đang chạy','Đợi bàn giao')"); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY a.code';
  res.json(attachAssignees(db.prepare(sql).all(...params)));
});

app.post('/api/apps', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'Cần Mã app và Tên app' });
  try {
    const r = db.prepare(`INSERT INTO apps (code,name,partner,link,figma_link,app_code,mkter,product_manager,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      b.code, b.name, b.partner || '', b.link || '', b.figma_link || '', b.app_code || '',
      b.mkter || '', b.product_manager || '', b.status || 'Đang chạy');
    setAppAssignees(r.lastInsertRowid, b.ua_ids, b.po_ids);
    res.json(attachAssignees([db.prepare('SELECT * FROM apps WHERE id = ?').get(r.lastInsertRowid)])[0]);
  } catch (e) {
    res.status(400).json({ error: 'Mã app đã tồn tại hoặc dữ liệu không hợp lệ' });
  }
});

app.put('/api/apps/:id', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const app0 = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app0) return res.status(404).json({ error: 'Không tìm thấy app' });
  db.prepare(`UPDATE apps SET code=?,name=?,partner=?,link=?,figma_link=?,app_code=?,mkter=?,product_manager=?,status=? WHERE id=?`).run(
    b.code ?? app0.code, b.name ?? app0.name, b.partner ?? app0.partner, b.link ?? app0.link,
    b.figma_link ?? app0.figma_link, b.app_code ?? app0.app_code, b.mkter ?? app0.mkter, b.product_manager ?? app0.product_manager,
    b.status ?? app0.status, req.params.id);
  if (Array.isArray(b.ua_ids) || Array.isArray(b.po_ids)) setAppAssignees(req.params.id, b.ua_ids, b.po_ids);
  res.json(attachAssignees([db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id)])[0]);
});

app.delete('/api/apps/:id', authenticate, requireRole('admin'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM orders WHERE app_id = ?').get(req.params.id).c;
  if (used > 0) return res.status(400).json({ error: 'Không thể xóa: app đang có ' + used + ' order. Hãy đổi tình trạng sang "Dừng".' });
  db.prepare('DELETE FROM apps WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Orders --------------------------------------------------------------

app.get('/api/orders', authenticate, (req, res) => {
  const where = [];
  const params = [];

  // Giới hạn theo role
  if (req.query.managed === '1' && (req.user.role === 'ua' || req.user.role === 'po')) {
    // UA/PO: xem mọi order (kể cả người khác tạo) của app mình được giao phụ trách
    where.push('o.app_id IN (SELECT app_id FROM app_users WHERE user_id = ?)');
    params.push(req.user.id);
  }
  else if (ORDERER_ROLES.includes(req.user.role)) { where.push('o.ua_id = ?'); params.push(req.user.id); }
  else if (req.user.role === 'editor' && !isLeadUser(req.user)) {
    // Editor thường: chỉ order được giao và đã submit
    where.push('o.editor_id = ? AND o.status != ?'); params.push(req.user.id, 'Đợi submit');
  }
  // admin & Lead: xem tất cả order

  const q = req.query;
  if (q.ua_id) { where.push('o.ua_id = ?'); params.push(q.ua_id); }
  if (q.editor_id) {
    if (q.editor_id === 'none') where.push('o.editor_id IS NULL');
    else { where.push('o.editor_id = ?'); params.push(q.editor_id); }
  }
  if (q.app_id) { where.push('o.app_id = ?'); params.push(q.app_id); }
  if (q.status) { where.push('o.status = ?'); params.push(q.status); }
  if (q.category) { where.push('o.category = ?'); params.push(q.category); }
  if (q.from) { where.push('o.order_date >= ?'); params.push(q.from); }
  if (q.to) { where.push('o.order_date <= ?'); params.push(q.to); }
  if (q.search) {
    where.push('(o.order_code LIKE ? OR o.app_name LIKE ? OR o.description LIKE ?)');
    const s = '%' + q.search + '%'; params.push(s, s, s);
  }

  let sql = ORDER_SELECT;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY o.order_date DESC, o.id DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/orders/:id', authenticate, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy order' });
  if (ORDERER_ROLES.includes(req.user.role) && o.ua_id !== req.user.id) {
    // UA/PO được xem order của người khác nếu là app mình phụ trách
    let ok = false;
    if ((req.user.role === 'ua' || req.user.role === 'po') && o.app_id) {
      ok = !!db.prepare('SELECT 1 FROM app_users WHERE app_id = ? AND user_id = ?').get(o.app_id, req.user.id);
    }
    if (!ok) return res.status(403).json({ error: 'Không có quyền' });
  }
  if (req.user.role === 'editor' && !isLeadUser(req.user) && o.editor_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  res.json(o);
});

app.post('/api/orders', authenticate, requireRole('ua', 'admin', 'aso', 'po', 'hr'), (req, res) => {
  const b = req.body || {};
  const type = db.prepare('SELECT * FROM order_types WHERE id = ?').get(b.order_type_id);
  if (!type) return res.status(400).json({ error: 'Loại order không hợp lệ' });

  const category = type.category;
  const label = category === 'video' ? 'V' : 'A';
  const uaId = req.user.role === 'admin' && b.ua_id ? b.ua_id : req.user.id;

  let appName = b.app_name || '';
  let partner = b.partner || '';
  if (b.app_id) {
    const ap = db.prepare('SELECT * FROM apps WHERE id = ?').get(b.app_id);
    if (!ap) return res.status(400).json({ error: 'App không tồn tại' });
    // App phải đang chạy / đợi bàn giao mới được tạo order
    if (!['Đang chạy', 'Đợi bàn giao'].includes(ap.status)) {
      return res.status(400).json({ error: 'App "' + ap.code + '" đang ở trạng thái Dừng, không thể tạo order' });
    }
    // UA/PO chỉ được order cho app mình được giao phụ trách
    if (req.user.role === 'ua' || req.user.role === 'po') {
      const assigned = db.prepare('SELECT 1 FROM app_users WHERE app_id = ? AND user_id = ?').get(b.app_id, req.user.id);
      if (!assigned) return res.status(403).json({ error: 'Bạn chưa được giao phụ trách app này nên không thể tạo order' });
    }
    appName = appName || ap.name; partner = partner || ap.partner;
  }

  const editorId = b.editor_id ? Number(b.editor_id) : null;
  if (!editorId) return res.status(400).json({ error: 'Vui lòng chọn người làm khi tạo order' });
  // Ảnh: giao luôn (Chờ làm). Video: cần Lead submit (Đợi submit)
  const initStatus = category === 'video' ? 'Đợi submit' : 'Chờ làm';
  const code = nextOrderCode(label);

  const needYoutube = (category === 'video' && b.need_youtube) ? 1 : 0;
  const r = db.prepare(`INSERT INTO orders
    (order_code, category, app_id, app_name, partner, link_figma, order_date, objective,
     order_type_id, ua_id, description, ref_link, size, note_request, editor_id, status, points, need_youtube)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    code, category, b.app_id || null, appName, partner, b.link_figma || '',
    b.order_date || todayStr(), b.objective || '', type.id, uaId,
    b.description || '', b.ref_link || '', b.size || '', b.note_request || '',
    editorId, initStatus, 0, needYoutube);

  res.json(getOrder(r.lastInsertRowid));
});

app.put('/api/orders/:id', authenticate, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy order' });
  const b = req.body || {};
  const role = req.user.role;
  const isOrderer = ORDERER_ROLES.includes(role);
  const isLead = isLeadUser(req.user);

  // Quyền
  if (isOrderer && o.ua_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  if (role === 'editor' && !isLead && o.editor_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });

  const upd = {};

  if (role === 'admin') {
    // Admin sửa được tất cả
    const fields = ['app_id', 'app_name', 'partner', 'link_figma', 'order_date', 'objective',
      'order_type_id', 'ua_id', 'description', 'ref_link', 'size', 'note_request', 'need_youtube',
      'editor_id', 'status', 'drive_link', 'youtube_link', 'note'];
    for (const f of fields) if (f in b) upd[f] = b[f];
  } else if (isOrderer) {
    // Người order sửa thông tin yêu cầu của order mình tạo
    const fields = ['app_id', 'app_name', 'partner', 'link_figma', 'order_date', 'objective',
      'order_type_id', 'description', 'ref_link', 'size', 'note_request', 'need_youtube', 'editor_id'];
    for (const f of fields) if (f in b) upd[f] = b[f];
    if (b.status === 'Yêu cầu sửa') upd.status = 'Yêu cầu sửa';
    if (b.status === 'Hủy') upd.status = 'Hủy';
  } else if (isLead) {
    // Lead: chỉ được assign người làm + submit (không sửa nội dung order)
    const fields = ['editor_id', 'status', 'drive_link', 'youtube_link', 'note'];
    for (const f of fields) if (f in b) upd[f] = b[f];
  } else if (role === 'editor') {
    // Editor cập nhật tiến độ & output
    const fields = ['status', 'drive_link', 'youtube_link', 'note'];
    for (const f of fields) if (f in b) upd[f] = b[f];
  }

  // Xác định loại order (để tính điểm) sau khi có thể đã đổi order_type_id
  const typeId = upd.order_type_id ?? o.order_type_id;
  const type = db.prepare('SELECT * FROM order_types WHERE id = ?').get(typeId);

  // Không cho Hủy order đã Hoàn thành
  if (b.status === 'Hủy' && o.status === 'Hoàn thành') {
    return res.status(400).json({ error: 'Order đã Hoàn thành thì không thể Hủy.' });
  }

  // Khi chuyển sang Hoàn thành: bắt buộc có Link Drive (và Link Youtube nếu order cần)
  if (upd.status === 'Hoàn thành') {
    const finalDrive = (('drive_link' in upd ? upd.drive_link : o.drive_link) || '').trim();
    const finalYt = (('youtube_link' in upd ? upd.youtube_link : o.youtube_link) || '').trim();
    if (!finalDrive) return res.status(400).json({ error: 'Cần điền Link Drive trước khi đặt Hoàn thành.' });
    if (o.need_youtube && !finalYt) return res.status(400).json({ error: 'Order này cần Link Youtube trước khi Hoàn thành.' });
  }

  // Tính điểm + thời gian hoàn thành theo trạng thái cuối
  const finalStatus = upd.status ?? o.status;
  if ('status' in upd || 'order_type_id' in upd) {
    if (finalStatus === 'Hoàn thành') {
      upd.points = type ? type.points : o.points;
      upd.completed_at = o.completed_at || todayStr();
    } else {
      upd.points = 0;
      upd.completed_at = null;
    }
  }

  const keys = Object.keys(upd);
  if (keys.length) {
    const setSql = keys.map(k => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE orders SET ${setSql} WHERE id = @id`).run({ ...upd, id: o.id });
  }
  res.json(getOrder(o.id));
});

// Assign nhanh editor (admin)
app.patch('/api/orders/:id/assign', authenticate, requireRole('admin'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy order' });
  db.prepare('UPDATE orders SET editor_id = ? WHERE id = ?').run(req.body.editor_id || null, o.id);
  res.json(getOrder(o.id));
});

// Order không được xóa (chỉ Hủy). Giữ endpoint cho admin phòng trường hợp đặc biệt.
app.delete('/api/orders/:id', authenticate, requireRole('admin'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy order' });
  db.prepare('DELETE FROM orders WHERE id = ?').run(o.id);
  res.json({ ok: true });
});

// ---- Users (admin) -------------------------------------------------------

app.get('/api/users', authenticate, requireRole('admin'), (req, res) => {
  let sql = 'SELECT id, username, full_name, role, editor_type, active, totp_enabled, created_at FROM users';
  const params = [];
  if (req.query.role) { sql += ' WHERE role = ?'; params.push(req.query.role); }
  sql += ' ORDER BY role, full_name';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/users', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.full_name || !b.role) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (!['admin', 'ua', 'editor', 'aso', 'po', 'hr'].includes(b.role)) return res.status(400).json({ error: 'Role không hợp lệ' });
  try {
    const r = db.prepare('INSERT INTO users (username, password_hash, full_name, role, editor_type, must_change_password) VALUES (?,?,?,?,?,1)').run(
      String(b.username).trim().toLowerCase(), bcrypt.hashSync(b.password || '123456', 10),
      b.full_name, b.role, b.role === 'editor' ? (b.editor_type || 'graphic') : null);
    res.json(db.prepare('SELECT id, username, full_name, role, editor_type, active FROM users WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Username đã tồn tại' });
  }
});

app.put('/api/users/:id', authenticate, requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy user' });
  const b = req.body || {};
  // Tài khoản Admin luôn giữ vai trò Admin, không cho đổi
  const newRole = u.role === 'admin' ? 'admin' : (b.role ?? u.role);
  db.prepare('UPDATE users SET full_name=?, role=?, editor_type=?, active=? WHERE id=?').run(
    b.full_name ?? u.full_name, newRole,
    newRole === 'editor' ? (b.editor_type ?? u.editor_type ?? 'graphic') : null,
    b.active != null ? (b.active ? 1 : 0) : u.active, u.id);
  if (b.password) {
    // Đổi mật khẩu -> tăng token_version (đăng xuất mọi thiết bị) + bắt user đổi lại mật khẩu tạm này
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 1 WHERE id = ?').run(bcrypt.hashSync(b.password, 10), u.id);
    // Nếu admin đổi mật khẩu của chính mình thì cấp lại token cho phiên hiện tại
    if (u.id === req.user.id) {
      const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
      res.cookie('token', signToken(fresh), { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    }
  }
  res.json(db.prepare('SELECT id, username, full_name, role, editor_type, active FROM users WHERE id = ?').get(u.id));
});

app.delete('/api/users/:id', authenticate, requireRole('admin'), (req, res) => {
  // Vô hiệu hóa thay vì xóa (giữ lịch sử order)
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Cài đặt: Loại order (order_types) -----------------------------------

app.get('/api/order_types', authenticate, (req, res) => {
  let sql = 'SELECT * FROM order_types';
  const params = [];
  if (req.query.category) { sql += ' WHERE category = ?'; params.push(req.query.category); }
  sql += ' ORDER BY sort_order, id';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/order_types', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !['image', 'video'].includes(b.category)) return res.status(400).json({ error: 'Thiếu tên hoặc loại không hợp lệ' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM order_types').get().m;
  const r = db.prepare('INSERT INTO order_types (category, name, points, quantity_note, note, sort_order) VALUES (?,?,?,?,?,?)').run(
    b.category, b.name, Number(b.points) || 0, b.quantity_note || '', b.note || '', maxSort + 1);
  res.json(db.prepare('SELECT * FROM order_types WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/order_types/:id', authenticate, requireRole('admin'), (req, res) => {
  const t = db.prepare('SELECT * FROM order_types WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Không tìm thấy' });
  const b = req.body || {};
  db.prepare('UPDATE order_types SET name=?, points=?, quantity_note=?, note=? WHERE id=?').run(
    b.name ?? t.name, b.points != null ? Number(b.points) : t.points, b.quantity_note ?? t.quantity_note, b.note ?? t.note, t.id);
  res.json(db.prepare('SELECT * FROM order_types WHERE id = ?').get(t.id));
});

app.delete('/api/order_types/:id', authenticate, requireRole('admin'), (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM orders WHERE order_type_id = ?').get(req.params.id).c;
  if (used > 0) return res.status(400).json({ error: 'Không thể xóa: đang có ' + used + ' order dùng loại này.' });
  db.prepare('DELETE FROM order_types WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Cài đặt: Size theo kênh (sizes) -------------------------------------

app.get('/api/sizes', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM sizes ORDER BY sort_order, id').all());
});

app.post('/api/sizes', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.platform || !b.value) return res.status(400).json({ error: 'Cần Kênh và Kích thước' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM sizes').get().m;
  const r = db.prepare('INSERT INTO sizes (platform, value, sort_order) VALUES (?,?,?)').run(b.platform.trim(), b.value.trim(), maxSort + 1);
  res.json(db.prepare('SELECT * FROM sizes WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/sizes/:id', authenticate, requireRole('admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM sizes WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Không tìm thấy' });
  const b = req.body || {};
  db.prepare('UPDATE sizes SET platform=?, value=? WHERE id=?').run((b.platform ?? s.platform).trim(), (b.value ?? s.value).trim(), s.id);
  res.json(db.prepare('SELECT * FROM sizes WHERE id = ?').get(s.id));
});

app.delete('/api/sizes/:id', authenticate, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM sizes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Cài đặt: Đối tác (partners) -----------------------------------------

app.get('/api/partners', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM partners ORDER BY name').all());
});

app.post('/api/partners', authenticate, requireRole('admin'), (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần tên đối tác' });
  try {
    const r = db.prepare('INSERT INTO partners (name) VALUES (?)').run(name);
    res.json(db.prepare('SELECT * FROM partners WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(400).json({ error: 'Đối tác đã tồn tại' }); }
});

app.put('/api/partners/:id', authenticate, requireRole('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy' });
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần tên đối tác' });
  try {
    db.prepare('UPDATE partners SET name=? WHERE id=?').run(name, p.id);
    // Đồng bộ tên đối tác trên các app đang dùng
    db.prepare('UPDATE apps SET partner=? WHERE partner=?').run(name, p.name);
    res.json(db.prepare('SELECT * FROM partners WHERE id = ?').get(p.id));
  } catch (e) { res.status(400).json({ error: 'Đối tác đã tồn tại' }); }
});

app.delete('/api/partners/:id', authenticate, requireRole('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy' });
  const used = db.prepare('SELECT COUNT(*) c FROM apps WHERE partner = ?').get(p.name).c;
  if (used > 0) return res.status(400).json({ error: 'Không thể xóa: đang có ' + used + ' app thuộc đối tác này.' });
  db.prepare('DELETE FROM partners WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

// ---- Nhập dữ liệu hàng loạt (Excel/CSV) -----------------------------------

function slugify(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function parseRoleLabel(label) {
  const t = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const map = {
    'ua': ['ua', null], 'aso': ['aso', null], 'po': ['po', null], 'hr': ['hr', null], 'admin': ['admin', null],
    'graphic designer': ['editor', 'graphic'], 'graphic': ['editor', 'graphic'], 'designer': ['editor', 'graphic'],
    'video editor': ['editor', 'video'], 'video': ['editor', 'video'],
    'video editor lead': ['editor', 'video_lead'], 'lead': ['editor', 'video_lead'],
    'ui/ux designer': ['editor', 'uiux'], 'ui ux designer': ['editor', 'uiux'], 'uiux': ['editor', 'uiux'], 'ui/ux': ['editor', 'uiux'],
  };
  return map[t] || null;
}

app.post('/api/import/apps', authenticate, requireRole('admin'), (req, res) => {
  const rows = (req.body && req.body.rows) || [];
  let created = 0, updated = 0; const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const code = String(r.code || '').trim();
    const name = String(r.name || '').trim();
    if (!code || !name) { errors.push('Dòng ' + (i + 2) + ': thiếu Mã app hoặc Tên app'); continue; }
    let status = String(r.status || '').trim();
    if (!APP_STATUSES.includes(status)) status = 'Đang chạy';
    const app_code = code + ' - ' + name;
    try {
      const ex = db.prepare('SELECT id FROM apps WHERE code = ?').get(code);
      if (ex) {
        db.prepare('UPDATE apps SET name=?,partner=?,link=?,figma_link=?,app_code=?,mkter=?,product_manager=?,status=? WHERE id=?')
          .run(name, r.partner || '', r.link || '', r.figma_link || '', app_code, r.mkter || '', r.product_manager || '', status, ex.id);
        updated++;
      } else {
        db.prepare('INSERT INTO apps (code,name,partner,link,figma_link,app_code,mkter,product_manager,status) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(code, name, r.partner || '', r.link || '', r.figma_link || '', app_code, r.mkter || '', r.product_manager || '', status);
        created++;
      }
    } catch (e) { errors.push('Dòng ' + (i + 2) + ': ' + e.message); }
  }
  res.json({ created, updated, errors });
});

app.post('/api/import/users', authenticate, requireRole('admin'), (req, res) => {
  const rows = (req.body && req.body.rows) || [];
  let created = 0; const errors = [];
  const taken = new Set(db.prepare('SELECT username FROM users').all().map(u => u.username));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const full_name = String(r.full_name || '').trim();
    if (!full_name) { errors.push('Dòng ' + (i + 2) + ': thiếu Họ tên'); continue; }
    const rp = parseRoleLabel(r.role_label);
    if (!rp) { errors.push('Dòng ' + (i + 2) + ': vai trò không hợp lệ ("' + (r.role_label || '') + '")'); continue; }
    let username = String(r.username || '').trim().toLowerCase();
    if (username) {
      if (taken.has(username)) { errors.push('Dòng ' + (i + 2) + ': username "' + username + '" đã tồn tại, bỏ qua'); continue; }
    } else {
      const base = slugify(full_name) || 'user';
      let u = base, n = 2; while (taken.has(u)) { u = base + n; n++; } username = u;
    }
    taken.add(username);
    const pw = String(r.password || '').trim() || '123456';
    try {
      db.prepare('INSERT INTO users (username,password_hash,full_name,role,editor_type,must_change_password) VALUES (?,?,?,?,?,1)')
        .run(username, bcrypt.hashSync(pw, 10), full_name, rp[0], rp[1]);
      created++;
    } catch (e) { errors.push('Dòng ' + (i + 2) + ': ' + e.message); }
  }
  res.json({ created, errors });
});

// ---- Reports -------------------------------------------------------------

function dateRange(q) {
  return { from: q.from || '2000-01-01', to: q.to || '2999-12-31' };
}

// Lấy số lượng ảnh/video từ "quantity_note" (vd "3 ảnh" -> 3, rỗng -> 1)
function parseQty(note) {
  const m = String(note || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 1;
}

// Hiệu suất UA
app.get('/api/reports/ua', authenticate, requireRole('admin', 'ua'), (req, res) => {
  const { from, to } = dateRange(req.query);
  let uaFilter = '';
  const params = [from, to];
  if (req.user.role === 'ua') { uaFilter = ' AND o.ua_id = ?'; params.push(req.user.id); }
  else if (req.query.ua_id) { uaFilter = ' AND o.ua_id = ?'; params.push(req.query.ua_id); }

  const rows = db.prepare(`
    SELECT o.ua_id, u.full_name, o.category, o.status, o.points,
           t.name AS type_name, t.quantity_note
    FROM orders o
    JOIN users u ON u.id = o.ua_id
    LEFT JOIN order_types t ON t.id = o.order_type_id
    WHERE o.order_date BETWEEN ? AND ? AND u.role = 'ua' AND u.active = 1${uaFilter}
  `).all(...params);

  const perUserMap = {}, byTypeMap = {};
  for (const r of rows) {
    const qty = parseQty(r.quantity_note);
    const pu = perUserMap[r.ua_id] || (perUserMap[r.ua_id] = { id: r.ua_id, full_name: r.full_name, total_orders: 0, done_orders: 0, total_points: 0, image_qty: 0, video_qty: 0 });
    pu.total_orders++;
    if (r.status === 'Hoàn thành') pu.done_orders++;
    pu.total_points += r.points || 0;
    if (r.category === 'video') pu.video_qty += qty; else pu.image_qty += qty;
    const key = (r.type_name || '—') + '|' + r.category;
    const bt = byTypeMap[key] || (byTypeMap[key] = { name: r.type_name || '—', category: r.category, cnt: 0, qty: 0, pts: 0 });
    bt.cnt++; bt.qty += qty; bt.pts += r.points || 0;
  }
  const perUser = Object.values(perUserMap).sort((a, b) => b.total_orders - a.total_orders);
  const byType = Object.values(byTypeMap).sort((a, b) => b.cnt - a.cnt);

  const timeline = db.prepare(`
    SELECT o.order_date AS day, COUNT(o.id) AS cnt
    FROM orders o
    WHERE o.order_date BETWEEN ? AND ?${uaFilter}
    GROUP BY o.order_date ORDER BY o.order_date
  `).all(...params);

  res.json({ perUser, byType, timeline });
});

// Drill-down: số lượng theo từng app của 1 UA
app.get('/api/reports/ua/:uaId/by-app', authenticate, requireRole('admin', 'ua'), (req, res) => {
  if (req.user.role === 'ua' && Number(req.params.uaId) !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  const { from, to } = dateRange(req.query);
  const rows = db.prepare(`
    SELECT o.app_id, o.app_name, a.code AS app_code, o.category, t.quantity_note
    FROM orders o
    LEFT JOIN apps a ON a.id = o.app_id
    LEFT JOIN order_types t ON t.id = o.order_type_id
    WHERE o.ua_id = ? AND o.order_date BETWEEN ? AND ?
  `).all(req.params.uaId, from, to);

  const map = {};
  for (const r of rows) {
    const qty = parseQty(r.quantity_note);
    const key = r.app_id || ('x' + (r.app_name || ''));
    const a = map[key] || (map[key] = { app_name: r.app_name || '—', app_code: r.app_code || '', cnt: 0, image_qty: 0, video_qty: 0 });
    a.cnt++;
    if (r.category === 'video') a.video_qty += qty; else a.image_qty += qty;
  }
  res.json(Object.values(map).sort((a, b) => b.cnt - a.cnt));
});

// Hiệu suất Editor
app.get('/api/reports/editor', authenticate, requireRole('admin', 'editor'), (req, res) => {
  const { from, to } = dateRange(req.query);
  let edFilter = '';
  const params = [from, to];
  // Editor thường chỉ xem mình; Lead/Admin xem cả team
  if (req.user.role === 'editor' && !isLeadUser(req.user)) { edFilter = ' AND o.editor_id = ?'; params.push(req.user.id); }
  else if (req.query.editor_id) { edFilter = ' AND o.editor_id = ?'; params.push(req.query.editor_id); }

  const perUser = db.prepare(`
    SELECT u.id, u.full_name, u.editor_type,
           COUNT(o.id) AS total_orders,
           SUM(CASE WHEN o.status='Hoàn thành' THEN 1 ELSE 0 END) AS done_orders,
           SUM(CASE WHEN o.status IN ('Chờ làm','Đang làm','Yêu cầu sửa') THEN 1 ELSE 0 END) AS active_orders,
           SUM(o.points) AS total_points,
           AVG(CASE WHEN o.status='Hoàn thành' AND o.completed_at IS NOT NULL
                THEN julianday(o.completed_at) - julianday(o.order_date) END) AS avg_days
    FROM users u
    JOIN orders o ON o.editor_id = u.id AND o.order_date BETWEEN ? AND ?${edFilter}
    WHERE u.role='editor' AND u.active = 1
    GROUP BY u.id ORDER BY active_orders DESC, done_orders DESC
  `).all(...params);

  const byStatus = db.prepare(`
    SELECT o.status, COUNT(o.id) AS cnt
    FROM orders o WHERE o.editor_id IS NOT NULL AND o.order_date BETWEEN ? AND ?${edFilter}
    GROUP BY o.status
  `).all(...params);

  const timeline = db.prepare(`
    SELECT o.completed_at AS day, COUNT(o.id) AS cnt, SUM(o.points) AS pts
    FROM orders o
    WHERE o.status='Hoàn thành' AND o.completed_at IS NOT NULL
      AND o.completed_at BETWEEN ? AND ?${edFilter}
    GROUP BY o.completed_at ORDER BY o.completed_at
  `).all(...params);

  res.json({ perUser, byStatus, timeline });
});

// Tổng quan
app.get('/api/reports/summary', authenticate, requireRole('admin'), (req, res) => {
  const { from, to } = dateRange(req.query);
  const total = db.prepare("SELECT COUNT(*) c, SUM(points) p FROM orders WHERE order_date BETWEEN ? AND ?").get(from, to);
  const byStatus = db.prepare("SELECT status, COUNT(*) c FROM orders WHERE order_date BETWEEN ? AND ? GROUP BY status").all(from, to);
  const byCategory = db.prepare("SELECT category, COUNT(*) c FROM orders WHERE order_date BETWEEN ? AND ? GROUP BY category").all(from, to);
  const unassigned = db.prepare("SELECT COUNT(*) c FROM orders WHERE editor_id IS NULL AND order_date BETWEEN ? AND ?").get(from, to).c;
  res.json({
    total_orders: total.c || 0,
    total_points: total.p || 0,
    unassigned,
    byStatus, byCategory,
  });
});

// ---- Static frontend -----------------------------------------------------

app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback (mọi route không phải /api trả về index.html)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('  🎨 Order Creatives đang chạy!');
  console.log('  👉 Mở trình duyệt: http://localhost:' + PORT);
  console.log('');
  console.log('  Đăng nhập: admin / admin123');
  console.log('');
});

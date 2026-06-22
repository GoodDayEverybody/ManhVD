'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const { db, init, nextOrderCode } = require('./db');
const { signToken, authenticate, requireRole } = require('./auth');

init();

const app = express();
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

// ---- Constants (metadata cho frontend) -----------------------------------

const STATUSES = ['Chờ làm', 'Đang làm', 'Đã xong', 'Yêu cầu sửa'];
const APP_STATUSES = ['Đang chạy', 'Đợi bàn giao', 'Tạm dừng', 'Dừng'];
const OBJECTIVES = [
  'Ảnh quảng cáo', 'Video quảng cáo', 'Localize Ảnh quảng cáo', 'Video cắt dựng',
  'Resize + Thay outro', 'Bộ ảnh mới', 'Localize Video', 'Khác',
];
const SIZES = {
  Google: ['1200x1200', '1200x628', '1200x1500'],
  'Mintegral + Unity + Tiktok': ['1200x627', '320x210', '640x120', '320x50', '720x128',
    '728x90', '720x1280', '768x1024', '600x600', '512x512', '800x800', '450x300',
    '1080x2160', '750x1334', '210x210'],
  Facebook: ['1200x628', '1080x1080', '1080x1920', '1080x1350'],
  Other: ['512x512', '1024x500'],
};

// ---- Helpers -------------------------------------------------------------

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
  return new Date().toISOString().slice(0, 10);
}

// ---- Auth routes ---------------------------------------------------------

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim().toLowerCase());
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, editor_type: user.editor_type } });
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
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ ok: true });
});

// ---- Metadata ------------------------------------------------------------

app.get('/api/meta', authenticate, (req, res) => {
  const orderTypes = db.prepare('SELECT id, category, name, points, quantity_note FROM order_types ORDER BY sort_order').all();
  const editors = db.prepare("SELECT id, full_name, editor_type FROM users WHERE role='editor' AND active=1 ORDER BY full_name").all();
  const uas = db.prepare("SELECT id, full_name FROM users WHERE role='ua' AND active=1 ORDER BY full_name").all();
  res.json({
    orderTypes, editors, uas,
    statuses: STATUSES,
    appStatuses: APP_STATUSES,
    objectives: OBJECTIVES,
    sizes: SIZES,
  });
});

// ---- Apps ----------------------------------------------------------------

app.get('/api/apps', authenticate, (req, res) => {
  let sql = 'SELECT * FROM apps';
  const params = [];
  if (req.query.status) { sql += ' WHERE status = ?'; params.push(req.query.status); }
  else if (req.query.active === '1') { sql += " WHERE status IN ('Đang chạy','Đợi bàn giao')"; }
  sql += ' ORDER BY code';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/apps', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name) return res.status(400).json({ error: 'Cần Mã app và Tên app' });
  try {
    const r = db.prepare(`INSERT INTO apps (code,name,partner,link,app_code,mkter,product_manager,status)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      b.code, b.name, b.partner || '', b.link || '', b.app_code || '',
      b.mkter || '', b.product_manager || '', b.status || 'Đang chạy');
    res.json(db.prepare('SELECT * FROM apps WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Mã app đã tồn tại hoặc dữ liệu không hợp lệ' });
  }
});

app.put('/api/apps/:id', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const app0 = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app0) return res.status(404).json({ error: 'Không tìm thấy app' });
  db.prepare(`UPDATE apps SET code=?,name=?,partner=?,link=?,app_code=?,mkter=?,product_manager=?,status=? WHERE id=?`).run(
    b.code ?? app0.code, b.name ?? app0.name, b.partner ?? app0.partner, b.link ?? app0.link,
    b.app_code ?? app0.app_code, b.mkter ?? app0.mkter, b.product_manager ?? app0.product_manager,
    b.status ?? app0.status, req.params.id);
  res.json(db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id));
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
  if (req.user.role === 'ua') { where.push('o.ua_id = ?'); params.push(req.user.id); }
  else if (req.user.role === 'editor') { where.push('o.editor_id = ?'); params.push(req.user.id); }

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
  if (req.user.role === 'ua' && o.ua_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  if (req.user.role === 'editor' && o.editor_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  res.json(o);
});

app.post('/api/orders', authenticate, requireRole('ua', 'admin'), (req, res) => {
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
    if (ap) { appName = appName || ap.name; partner = partner || ap.partner; }
  }

  const editorId = (req.user.role === 'admin' && b.editor_id) ? b.editor_id : null;
  const code = nextOrderCode(label);

  const r = db.prepare(`INSERT INTO orders
    (order_code, category, app_id, app_name, partner, link_figma, order_date, objective,
     order_type_id, ua_id, description, ref_link, size, note_request, editor_id, status, points)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    code, category, b.app_id || null, appName, partner, b.link_figma || '',
    b.order_date || todayStr(), b.objective || '', type.id, uaId,
    b.description || '', b.ref_link || '', b.size || '', b.note_request || '',
    editorId, 'Chờ làm', 0);

  res.json(getOrder(r.lastInsertRowid));
});

app.put('/api/orders/:id', authenticate, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy order' });
  const b = req.body || {};
  const role = req.user.role;

  // Quyền
  if (role === 'ua' && o.ua_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  if (role === 'editor' && o.editor_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });

  const upd = {};

  if (role === 'admin') {
    // Admin sửa được tất cả
    const fields = ['app_id', 'app_name', 'partner', 'link_figma', 'order_date', 'objective',
      'order_type_id', 'ua_id', 'description', 'ref_link', 'size', 'note_request',
      'editor_id', 'status', 'drive_link', 'youtube_link', 'note'];
    for (const f of fields) if (f in b) upd[f] = b[f];
  } else if (role === 'ua') {
    // UA sửa thông tin yêu cầu của order mình tạo
    const fields = ['app_id', 'app_name', 'partner', 'link_figma', 'order_date', 'objective',
      'order_type_id', 'description', 'ref_link', 'size', 'note_request'];
    for (const f of fields) if (f in b) upd[f] = b[f];
    // UA có thể yêu cầu sửa lại bản đã giao
    if (b.status === 'Yêu cầu sửa') upd.status = 'Yêu cầu sửa';
  } else if (role === 'editor') {
    // Editor cập nhật tiến độ & output
    const fields = ['status', 'drive_link', 'youtube_link', 'note'];
    for (const f of fields) if (f in b) upd[f] = b[f];
  }

  // Xác định loại order (để tính điểm) sau khi có thể đã đổi order_type_id
  const typeId = upd.order_type_id ?? o.order_type_id;
  const type = db.prepare('SELECT * FROM order_types WHERE id = ?').get(typeId);

  // Tính điểm + thời gian hoàn thành theo trạng thái cuối
  const finalStatus = upd.status ?? o.status;
  if ('status' in upd || 'order_type_id' in upd) {
    if (finalStatus === 'Đã xong') {
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

app.delete('/api/orders/:id', authenticate, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy order' });
  if (req.user.role === 'ua' && o.ua_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  if (req.user.role === 'editor') return res.status(403).json({ error: 'Không có quyền' });
  db.prepare('DELETE FROM orders WHERE id = ?').run(o.id);
  res.json({ ok: true });
});

// ---- Users (admin) -------------------------------------------------------

app.get('/api/users', authenticate, requireRole('admin'), (req, res) => {
  let sql = 'SELECT id, username, full_name, role, editor_type, active, created_at FROM users';
  const params = [];
  if (req.query.role) { sql += ' WHERE role = ?'; params.push(req.query.role); }
  sql += ' ORDER BY role, full_name';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/users', authenticate, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.full_name || !b.role) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (!['admin', 'ua', 'editor'].includes(b.role)) return res.status(400).json({ error: 'Role không hợp lệ' });
  try {
    const r = db.prepare('INSERT INTO users (username, password_hash, full_name, role, editor_type) VALUES (?,?,?,?,?)').run(
      String(b.username).trim().toLowerCase(), bcrypt.hashSync(b.password || '123456', 10),
      b.full_name, b.role, b.role === 'editor' ? (b.editor_type || 'designer') : null);
    res.json(db.prepare('SELECT id, username, full_name, role, editor_type, active FROM users WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Username đã tồn tại' });
  }
});

app.put('/api/users/:id', authenticate, requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy user' });
  const b = req.body || {};
  db.prepare('UPDATE users SET full_name=?, role=?, editor_type=?, active=? WHERE id=?').run(
    b.full_name ?? u.full_name, b.role ?? u.role,
    (b.role ?? u.role) === 'editor' ? (b.editor_type ?? u.editor_type ?? 'designer') : null,
    b.active != null ? (b.active ? 1 : 0) : u.active, u.id);
  if (b.password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b.password, 10), u.id);
  res.json(db.prepare('SELECT id, username, full_name, role, editor_type, active FROM users WHERE id = ?').get(u.id));
});

app.delete('/api/users/:id', authenticate, requireRole('admin'), (req, res) => {
  // Vô hiệu hóa thay vì xóa (giữ lịch sử order)
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Reports -------------------------------------------------------------

function dateRange(q) {
  return { from: q.from || '2000-01-01', to: q.to || '2999-12-31' };
}

// Hiệu suất UA
app.get('/api/reports/ua', authenticate, requireRole('admin', 'ua'), (req, res) => {
  const { from, to } = dateRange(req.query);
  let uaFilter = '';
  const params = [from, to];
  if (req.user.role === 'ua') { uaFilter = ' AND o.ua_id = ?'; params.push(req.user.id); }
  else if (req.query.ua_id) { uaFilter = ' AND o.ua_id = ?'; params.push(req.query.ua_id); }

  const perUser = db.prepare(`
    SELECT u.id, u.full_name,
           COUNT(o.id) AS total_orders,
           SUM(CASE WHEN o.status='Đã xong' THEN 1 ELSE 0 END) AS done_orders,
           SUM(o.points) AS total_points
    FROM users u
    JOIN orders o ON o.ua_id = u.id AND o.order_date BETWEEN ? AND ?${uaFilter}
    WHERE u.role='ua'
    GROUP BY u.id ORDER BY total_orders DESC
  `).all(...params);

  const byType = db.prepare(`
    SELECT t.name, t.category, COUNT(o.id) AS cnt, SUM(o.points) AS pts
    FROM orders o JOIN order_types t ON t.id = o.order_type_id
    WHERE o.order_date BETWEEN ? AND ?${uaFilter}
    GROUP BY t.id ORDER BY cnt DESC
  `).all(...params);

  const timeline = db.prepare(`
    SELECT o.order_date AS day, COUNT(o.id) AS cnt
    FROM orders o
    WHERE o.order_date BETWEEN ? AND ?${uaFilter}
    GROUP BY o.order_date ORDER BY o.order_date
  `).all(...params);

  res.json({ perUser, byType, timeline });
});

// Hiệu suất Editor
app.get('/api/reports/editor', authenticate, requireRole('admin', 'editor'), (req, res) => {
  const { from, to } = dateRange(req.query);
  let edFilter = '';
  const params = [from, to];
  if (req.user.role === 'editor') { edFilter = ' AND o.editor_id = ?'; params.push(req.user.id); }
  else if (req.query.editor_id) { edFilter = ' AND o.editor_id = ?'; params.push(req.query.editor_id); }

  const perUser = db.prepare(`
    SELECT u.id, u.full_name, u.editor_type,
           COUNT(o.id) AS total_orders,
           SUM(CASE WHEN o.status='Đã xong' THEN 1 ELSE 0 END) AS done_orders,
           SUM(o.points) AS total_points,
           AVG(CASE WHEN o.status='Đã xong' AND o.completed_at IS NOT NULL
                THEN julianday(o.completed_at) - julianday(o.order_date) END) AS avg_days
    FROM users u
    JOIN orders o ON o.editor_id = u.id AND o.order_date BETWEEN ? AND ?${edFilter}
    WHERE u.role='editor'
    GROUP BY u.id ORDER BY done_orders DESC
  `).all(...params);

  const byStatus = db.prepare(`
    SELECT o.status, COUNT(o.id) AS cnt
    FROM orders o WHERE o.editor_id IS NOT NULL AND o.order_date BETWEEN ? AND ?${edFilter}
    GROUP BY o.status
  `).all(...params);

  const timeline = db.prepare(`
    SELECT o.completed_at AS day, COUNT(o.id) AS cnt, SUM(o.points) AS pts
    FROM orders o
    WHERE o.status='Đã xong' AND o.completed_at IS NOT NULL
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

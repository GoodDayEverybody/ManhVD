'use strict';

const bcrypt = require('bcryptjs');
const { db, init, nextOrderCode, tx } = require('./db');

init();

// ---- Helpers -------------------------------------------------------------

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // bỏ dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const takenUsernames = new Set();
function uniqueUsername(name) {
  let base = slugify(name) || 'user';
  let u = base;
  let i = 2;
  while (takenUsernames.has(u)) { u = base + i; i++; }
  takenUsernames.add(u);
  return u;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---- Wipe (seed lại từ đầu) ----------------------------------------------

tx(() => {
  db.exec(`
    DELETE FROM orders;
    DELETE FROM order_types;
    DELETE FROM sizes;
    DELETE FROM apps;
    DELETE FROM partners;
    DELETE FROM users;
    DELETE FROM counters;
    DELETE FROM sqlite_sequence;
  `);
});

const DEFAULT_PASSWORD = '123456';
const hash = (pw) => bcrypt.hashSync(pw, 10);

// ---- Users ---------------------------------------------------------------

const insUser = db.prepare(
  'INSERT INTO users (username, password_hash, full_name, role, editor_type) VALUES (?,?,?,?,?)'
);

// Admin
takenUsernames.add('admin');
insUser.run('admin', hash('admin123'), 'Quản trị viên', 'admin', null);

// UA
const UA_NAMES = ['ManhVD', 'BaoDX', 'ThinhVQ', 'TrangNTT', 'TriNN', 'VyNH', 'ChauPM',
  'PhucTX', 'TrangVTQ', 'GiangDTN', 'ChinhDP', 'NguyenNVH', 'ThuyNTT', 'HaTT', 'Hoan',
  'ThuyBP', 'Nguyen'];
const uaIds = {};
for (const name of UA_NAMES) {
  const u = uniqueUsername(name);
  const r = insUser.run(u, hash(DEFAULT_PASSWORD), name, 'ua', null);
  uaIds[name] = r.lastInsertRowid;
}

// Editors (designer | video | both)
const EDITORS = [
  { name: 'Khải', type: 'graphic' },
  { name: 'Hà', type: 'graphic' },
  { name: 'Quang', type: 'graphic' },
  { name: 'Cường', type: 'video' },
  { name: 'Hoàn', type: 'video' },
  { name: 'Khánh', type: 'video' },
  { name: 'Phương Trang', type: 'uiux' },
];
const editorIds = {};
const editorById = [];
for (const e of EDITORS) {
  const u = uniqueUsername(e.name);
  const r = insUser.run(u, hash(DEFAULT_PASSWORD), e.name, 'editor', e.type);
  editorIds[e.name] = r.lastInsertRowid;
  editorById.push({ id: r.lastInsertRowid, type: e.type });
}

// ---- Order types ---------------------------------------------------------

const insType = db.prepare(
  'INSERT INTO order_types (category, name, points, quantity_note, note, sort_order) VALUES (?,?,?,?,?,?)'
);

// [name, points, số lượng/order, lưu ý]
const IMAGE_TYPES = [
  ['Icon App', 1.5, '3 ảnh', ''],
  ['Screenshot', 4.0, '8 ảnh', ''],
  ['Feature Graphic', 2.0, '3 ảnh', ''],
  ['In-App Content', 1.0, '', ''],
  ['Bộ Ảnh QC Mới (Google)', 2.0, '3 idea', ''],
  ['Bộ Ảnh QC Mới (Mintegral+Unity)', 3.0, '3 ảnh', ''],
  ['Bộ Ảnh QC Clone', 1.0, '3 idea', ''],
  ['Resize Mintegral+Unity+Tiktok', 2.0, '3 ảnh', ''],
  ['Resize Facebook', 0.5, '3 ảnh', ''],
  ['Resize Other', 0.5, '3 ảnh', ''],
  ['Localize Screenshot', 1.0, '1 order', '3 ngôn ngữ'],
  ['Localize Feature Graphic', 0.5, '1 order', '3 ngôn ngữ'],
  ['Localize Ảnh QC Google', 0.5, '3 ảnh', '3 ngôn ngữ'],
  ['Localize Ảnh QC Facebook', 0.5, '3 ảnh', '3 ngôn ngữ'],
  ['Localize Ảnh QC Mintegral+Unity+Tiktok', 2.0, '3 ảnh', '3 ngôn ngữ'],
  ['HTML5', 2.5, '', ''],
];

const VIDEO_TYPES = [
  ['Outro quảng cáo', 1.0, '5 video', ''],
  ['Video Promo', 1.5, '1 video', ''],
  ['Video in-app', 0.5, '1 video', ''],
  ['Resize+Thay outro', 0.5, '5 video', ''],
  ['Resize+Thay outro+Sửa in-app', 1.0, '5 video', ''],
  ['Video quảng cáo', 3.0, '2 video/order', ''],
  ['Localize Video – Only Voice', 1.0, '5 video', '2 ngôn ngữ'],
  ['Localize Video – Voice+Text', 2.5, '5 video', '2 ngôn ngữ'],
  ['Localize Video Promo', 0.5, '', ''],
  ['Video cắt dựng – Gen AI', 1.0, '', ''],
  ['Video cắt dựng – Ít source', 1.5, '', ''],
  ['Video cắt dựng – Nhiều source', 2.0, '', ''],
];

const imageTypeIds = [];
const videoTypeIds = [];
let so = 0;
for (const [name, pts, qty, note] of IMAGE_TYPES) {
  const r = insType.run('image', name, pts, qty, note, so++);
  imageTypeIds.push({ id: r.lastInsertRowid, points: pts, name });
}
for (const [name, pts, qty, note] of VIDEO_TYPES) {
  const r = insType.run('video', name, pts, qty, note, so++);
  videoTypeIds.push({ id: r.lastInsertRowid, points: pts, name });
}

// ---- Apps ----------------------------------------------------------------

// ---- Partners ------------------------------------------------------------

const insPartner = db.prepare('INSERT INTO partners (name) VALUES (?)');
['Yutalabs', 'Qtonz'].forEach(p => insPartner.run(p));

const insApp = db.prepare(
  'INSERT INTO apps (code, name, partner, link, figma_link, app_code, mkter, product_manager, status) VALUES (?,?,?,?,?,?,?,?,?)'
);

const APPS = [
  ['QIP072', 'Photo Collage Maker', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.collage', 'CODE072', 'ManhVD', 'BaoDX', 'Đang chạy'],
  ['QIP073', 'Video Editor Pro', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.veditor', 'CODE073', 'BaoDX', 'ManhVD', 'Đang chạy'],
  ['QIP074', 'AI Wallpaper HD', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.wallpaper', 'CODE074', 'ThinhVQ', 'BaoDX', 'Đang chạy'],
  ['QIP075', 'Scanner & PDF', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.scanner', 'CODE075', 'TrangNTT', 'ManhVD', 'Đợi bàn giao'],
  ['QIP076', 'Music Player Offline', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.music', 'CODE076', 'TriNN', 'BaoDX', 'Đang chạy'],
  ['QIP077', 'Workout at Home', 'Yutalabs', 'https://play.google.com/store/apps/details?id=com.p2.workout', 'CODE077', 'VyNH', 'ThinhVQ', 'Đang chạy'],
  ['QIP078', 'Caller ID & Block', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.callerid', 'CODE078', 'ChauPM', 'ManhVD', 'Đang chạy'],
  ['QIP079', 'Weather Live', 'Yutalabs', 'https://play.google.com/store/apps/details?id=com.p2.weather', 'CODE079', 'PhucTX', 'BaoDX', 'Dừng'],
  ['QIP080', 'Notes & Reminder', 'Qtonz', 'https://play.google.com/store/apps/details?id=com.qtonz.notes', 'CODE080', 'TrangVTQ', 'ThinhVQ', 'Đợi bàn giao'],
];
const appRows = [];
for (const a of APPS) {
  // Mã CODE tự tạo theo quy tắc: "Mã - Tên app"
  const appCode = a[0] + ' - ' + a[1];
  const figma = 'https://figma.com/file/' + a[0];
  const r = insApp.run(a[0], a[1], a[2], a[3], figma, appCode, a[5], a[6], a[7]);
  appRows.push({ id: r.lastInsertRowid, name: a[1], partner: a[2], code: a[0] });
}

// ---- Sizes (theo kênh) ---------------------------------------------------

const insSize = db.prepare('INSERT INTO sizes (platform, value, sort_order) VALUES (?,?,?)');
const SIZE_DATA = {
  'Google': ['1200x1200', '1200x628', '1200x1500'],
  'Mintegral + Unity + Tiktok': ['1200x627', '320x210', '640x120', '320x50', '720x128',
    '728x90', '720x1280', '768x1024', '600x600', '512x512', '800x800', '450x300',
    '1080x2160', '750x1334', '210x210'],
  'Facebook': ['1200x628', '1080x1080', '1080x1920', '1080x1350'],
};
let sizeSort = 0;
for (const [plat, arr] of Object.entries(SIZE_DATA)) {
  for (const v of arr) insSize.run(plat, v, sizeSort++);
}

// ---- Sample orders -------------------------------------------------------

const insOrder = db.prepare(`
  INSERT INTO orders
    (order_code, category, app_id, app_name, partner, link_figma, order_date, objective,
     order_type_id, ua_id, description, ref_link, size, note_request, editor_id, status,
     drive_link, youtube_link, completed_at, note, points, created_at)
  VALUES
    (@order_code, @category, @app_id, @app_name, @partner, @link_figma, @order_date, @objective,
     @order_type_id, @ua_id, @description, @ref_link, @size, @note_request, @editor_id, @status,
     @drive_link, @youtube_link, @completed_at, @note, @points, @created_at)
`);

const SIZES_IMAGE = ['1200x628', '1080x1080', '1080x1920', '1200x1500', '512x512', '1200x627'];
const SIZES_VIDEO = ['1080x1920', '1920x1080', '720x1280', '1080x1080'];
const STATUSES = ['Chờ làm', 'Đang làm', 'Hoàn thành', 'Hoàn thành', 'Yêu cầu sửa', 'Hủy'];
const OBJECTIVES_IMG = ['Ảnh quảng cáo', 'Localize Ảnh quảng cáo', 'Resize + Thay outro', 'Bộ ảnh mới'];
const OBJECTIVES_VID = ['Video quảng cáo', 'Video cắt dựng', 'Resize + Thay outro', 'Localize Video'];

const uaIdList = Object.values(uaIds);
const designerIds = editorById.filter(e => e.type === 'graphic' || e.type === 'uiux').map(e => e.id);
const videoEditorIds = editorById.filter(e => e.type === 'video').map(e => e.id);

const seedOrders = (count) => tx(() => {
  for (let i = 0; i < count; i++) {
    const isVideo = Math.random() < 0.45;
    const category = isVideo ? 'video' : 'image';
    const label = isVideo ? 'V' : 'A';
    const type = isVideo ? pick(videoTypeIds) : pick(imageTypeIds);
    const app = pick(appRows);
    const uaId = pick(uaIdList);
    const status = pick(STATUSES);
    const orderDate = daysAgo(Math.floor(Math.random() * 45));
    const done = status === 'Hoàn thành';
    const assigned = Math.random() < 0.85;
    const editorId = assigned
      ? (isVideo ? pick(videoEditorIds) : pick(designerIds))
      : null;

    insOrder.run({
      order_code: nextOrderCode(label),
      category,
      app_id: app.id,
      app_name: app.name,
      partner: app.partner,
      link_figma: 'https://figma.com/file/' + app.code,
      order_date: orderDate,
      objective: isVideo ? pick(OBJECTIVES_VID) : pick(OBJECTIVES_IMG),
      order_type_id: type.id,
      ua_id: uaId,
      description: 'Yêu cầu ' + type.name + ' cho app ' + app.name + '. ' +
        'Tham khảo competitor, làm theo style hiện đại, màu sắc nổi bật.',
      ref_link: 'https://drive.google.com/ref/' + app.code,
      size: isVideo ? pick(SIZES_VIDEO) : pick(SIZES_IMAGE),
      note_request: Math.random() < 0.4 ? 'Ưu tiên gấp, cần trong tuần này' : '',
      editor_id: editorId,
      status: editorId ? status : 'Chờ làm',
      drive_link: done ? 'https://drive.google.com/output/' + app.code : '',
      youtube_link: (done && isVideo) ? 'https://youtu.be/' + Math.random().toString(36).slice(2, 9) : '',
      completed_at: done ? daysAgo(Math.floor(Math.random() * 5)) : null,
      note: done ? 'Đã hoàn thành, gửi link output.' : '',
      points: done ? type.points : 0,
      created_at: orderDate + ' 09:00:00',
    });
  }
});
seedOrders(28);

// ---- Summary -------------------------------------------------------------

const counts = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  apps: db.prepare('SELECT COUNT(*) c FROM apps').get().c,
  order_types: db.prepare('SELECT COUNT(*) c FROM order_types').get().c,
  orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
};

console.log('✅ Seed dữ liệu mẫu thành công!');
console.log('   - Người dùng :', counts.users, '(1 admin, ' + UA_NAMES.length + ' UA, ' + EDITORS.length + ' editor)');
console.log('   - App        :', counts.apps);
console.log('   - Loại order :', counts.order_types);
console.log('   - Order mẫu  :', counts.orders);
console.log('');
console.log('🔑 Tài khoản đăng nhập:');
console.log('   Admin : admin / admin123');
console.log('   UA    : manhvd, baodx, thinhvq ... / ' + DEFAULT_PASSWORD);
console.log('   Editor: khai, ha, quang, cuong, hoan2, khanh, phuongtrang / ' + DEFAULT_PASSWORD);

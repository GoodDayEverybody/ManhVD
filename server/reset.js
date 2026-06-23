'use strict';

// Xóa DỮ LIỆU MẪU để chuẩn bị nhập dữ liệu thật.
// GIỮ LẠI: tài khoản admin + cấu hình (loại order & điểm, size ảnh, đối tác).
// XÓA: nhân viên mẫu, app mẫu, order mẫu, phân công UA/PO, bộ đếm mã order.
//
// CHẠY: node server/reset.js   (hoặc bấm reset-data.bat)

const { db, init, tx } = require('./db');

init();

const before = {
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  apps: db.prepare('SELECT COUNT(*) c FROM apps').get().c,
  orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
};

tx(() => {
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM app_users').run();
  db.prepare('DELETE FROM apps').run();
  // Giữ lại mọi tài khoản admin, xóa các user còn lại (nhân viên mẫu)
  db.prepare("DELETE FROM users WHERE role != 'admin'").run();
  // Reset bộ đếm mã order -> order thật bắt đầu đánh số lại
  db.prepare('DELETE FROM counters').run();
});

const after = {
  admins: db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c,
  orderTypes: db.prepare('SELECT COUNT(*) c FROM order_types').get().c,
  sizes: db.prepare('SELECT COUNT(*) c FROM sizes').get().c,
  partners: db.prepare('SELECT COUNT(*) c FROM partners').get().c,
};

console.log('✅ Đã xóa dữ liệu mẫu.');
console.log('   - Đã xóa: ' + before.orders + ' order, ' + before.apps + ' app, ' +
  (before.users - after.admins) + ' user nhân viên.');
console.log('   - Giữ lại: ' + after.admins + ' admin, ' + after.orderTypes + ' loại order, ' +
  after.sizes + ' size, ' + after.partners + ' đối tác.');
console.log('');
console.log('   Giờ đăng nhập admin và nhập dữ liệu thật (Cài đặt → Nhập dữ liệu).');

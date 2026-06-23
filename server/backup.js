'use strict';

// Sao lưu database an toàn (dùng VACUUM INTO -> ra 1 file .db nhất quán,
// chạy được ngay cả khi server đang hoạt động). Giữ lại 30 bản gần nhất.

const path = require('path');
const fs = require('fs');

// Tắt cảnh báo "experimental" của node:sqlite (cosmetic)
const _emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const type = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].type);
  if (type === 'ExperimentalWarning' || (typeof warning === 'string' && /SQLite is an experimental/.test(warning))) return;
  return _emitWarning(warning, ...args);
};

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('❌ Node.js của bạn chưa hỗ trợ node:sqlite (cần >= 22.5).');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const KEEP = 30; // số bản backup giữ lại

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Không tìm thấy data/app.db — chưa có dữ liệu để backup.');
  process.exit(1);
}
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
const outFile = path.join(BACKUP_DIR, `app-${stamp}.db`);

const db = new DatabaseSync(DB_PATH);
db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
db.close();

// Dọn bớt bản cũ, chỉ giữ KEEP bản mới nhất
const files = fs.readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
  .sort();
while (files.length > KEEP) {
  const old = files.shift();
  try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (e) {}
}

console.log('✅ Đã backup -> backups/' + path.basename(outFile));

'use strict';

const path = require('path');
const fs = require('fs');

// Tắt cảnh báo "experimental" của node:sqlite (cosmetic, không ảnh hưởng)
const _emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const type = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].type);
  if (type === 'ExperimentalWarning' || (typeof warning === 'string' && /SQLite is an experimental/.test(warning))) return;
  return _emitWarning(warning, ...args);
};

// Dùng SQLite tích hợp sẵn trong Node.js (>= 22.5) -> KHÔNG cần biên dịch native
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n❌ Phiên bản Node.js của bạn chưa hỗ trợ node:sqlite.');
  console.error('   Hãy cài Node.js bản LTS mới (>= 22.5, khuyến nghị 22 hoặc 24) tại https://nodejs.org\n');
  process.exit(1);
}

// Lưu database trong thư mục data/ ở gốc dự án
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'app.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Helper transaction (node:sqlite không có db.transaction như better-sqlite3)
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      role          TEXT NOT NULL,              -- admin | ua | editor | aso | po | hr
      editor_type   TEXT,                       -- graphic | video | video_lead | uiux | NULL
      active        INTEGER NOT NULL DEFAULT 1,
      token_version INTEGER NOT NULL DEFAULT 0, -- tăng lên để vô hiệu hóa phiên đăng nhập cũ
      totp_secret   TEXT,                       -- secret 2FA (base32)
      totp_enabled  INTEGER NOT NULL DEFAULT 0, -- đã bật 2FA chưa
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS apps (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT UNIQUE NOT NULL,       -- Mã app: QIP072...
      name            TEXT NOT NULL,              -- Tên app
      partner         TEXT,                       -- Đối tác
      link            TEXT,                       -- Link app (store)
      figma_link      TEXT,                       -- Link Figma
      app_code        TEXT,                       -- Mã CODE (tự tạo)
      mkter           TEXT,                       -- UA phụ trách
      product_manager TEXT,                       -- PO
      status          TEXT NOT NULL DEFAULT 'Đang chạy', -- Đang chạy | Đợi bàn giao | Dừng
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS partners (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_types (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      category      TEXT NOT NULL CHECK (category IN ('image','video')),
      name          TEXT NOT NULL,
      points        REAL NOT NULL DEFAULT 0,
      quantity_note TEXT,                          -- Số lượng/order
      note          TEXT,                          -- Lưu ý
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sizes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      platform   TEXT NOT NULL,
      value      TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code    TEXT UNIQUE NOT NULL,         -- V13941 / A10930
      category      TEXT NOT NULL CHECK (category IN ('image','video')),
      app_id        INTEGER REFERENCES apps(id),
      app_name      TEXT,                          -- snapshot tên app
      partner       TEXT,                          -- Đối tác
      link_figma    TEXT,                          -- Link App / Figma
      order_date    TEXT NOT NULL,                 -- YYYY-MM-DD
      objective     TEXT,                          -- Mục tiêu (mô tả ngắn)
      order_type_id INTEGER REFERENCES order_types(id),
      ua_id         INTEGER NOT NULL REFERENCES users(id),  -- Người order
      description   TEXT,                          -- Mô tả chi tiết
      ref_link      TEXT,
      size          TEXT,                          -- Kích thước
      note_request  TEXT,                          -- Lưu ý (từ UA)
      editor_id     INTEGER REFERENCES users(id),  -- Người thực hiện
      status        TEXT NOT NULL DEFAULT 'Chờ làm', -- Chờ làm | Đang làm | Hoàn thành | Yêu cầu sửa | Hủy
      drive_link    TEXT,                          -- Link Drive output
      youtube_link  TEXT,
      need_youtube  INTEGER NOT NULL DEFAULT 0,     -- order video có cần upload Youtube?
      completed_at  TEXT,                          -- Thời gian hoàn thành
      note          TEXT,                          -- Note (từ editor)
      points        REAL NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Bộ đếm để sinh mã order theo prefix (V / A)
    CREATE TABLE IF NOT EXISTS counters (
      prefix INTEGER PRIMARY KEY,
      label  TEXT,
      value  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_ua     ON orders(ua_id);
    CREATE INDEX IF NOT EXISTS idx_orders_editor ON orders(editor_id);
    CREATE INDEX IF NOT EXISTS idx_orders_app    ON orders(app_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_date   ON orders(order_date);
  `);

  // Migration nhẹ cho DB cũ
  const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);

  // Gỡ ràng buộc CHECK cũ trên users.role (để cho phép aso/po/hr) — làm trước
  const urow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (urow && /check/i.test(urow.sql)) {
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec(`
      CREATE TABLE users_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name     TEXT NOT NULL,
        role          TEXT NOT NULL,
        editor_type   TEXT,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      INSERT INTO users_new (id,username,password_hash,full_name,role,editor_type,active,created_at)
        SELECT id,username,password_hash,full_name,role,editor_type,active,
               COALESCE(created_at, datetime('now','localtime')) FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.exec('PRAGMA foreign_keys=ON');
  }

  // Thêm cột còn thiếu
  if (!hasColumn('order_types', 'note')) db.exec('ALTER TABLE order_types ADD COLUMN note TEXT');
  if (!hasColumn('apps', 'figma_link')) db.exec('ALTER TABLE apps ADD COLUMN figma_link TEXT');
  if (!hasColumn('orders', 'need_youtube')) db.exec('ALTER TABLE orders ADD COLUMN need_youtube INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('users', 'token_version')) db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('users', 'totp_secret')) db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  if (!hasColumn('users', 'totp_enabled')) db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
  // Chuẩn hóa trạng thái cũ -> mới
  db.exec("UPDATE orders SET status='Hoàn thành' WHERE status='Đã xong'");
}

// Sinh mã order kế tiếp. label: 'V' cho video, 'A' cho ảnh.
function nextOrderCode(label) {
  const prefix = label === 'V' ? 1 : 2;
  const start = label === 'V' ? 13900 : 10900; // gần với mã mẫu V13941 / A10930
  const row = db.prepare('SELECT value FROM counters WHERE prefix = ?').get(prefix);
  let value;
  if (!row) {
    value = start + 1;
    db.prepare('INSERT INTO counters (prefix, label, value) VALUES (?,?,?)').run(prefix, label, value);
  } else {
    value = row.value + 1;
    db.prepare('UPDATE counters SET value = ? WHERE prefix = ?').run(value, prefix);
  }
  return label + value;
}

module.exports = { db, init, nextOrderCode, tx, DB_PATH };

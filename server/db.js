'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Lưu database trong thư mục data/ ở gốc dự án
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','ua','editor')),
      editor_type   TEXT,                       -- designer | video | both | NULL
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS apps (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT UNIQUE NOT NULL,       -- Mã app: QIP072...
      name            TEXT NOT NULL,              -- Tên app
      partner         TEXT,                       -- Đối tác
      link            TEXT,                       -- Link app
      app_code        TEXT,                       -- Mã CODE
      mkter           TEXT,                       -- UA phụ trách
      product_manager TEXT,
      status          TEXT NOT NULL DEFAULT 'Đang chạy', -- Tạm dừng | Đang chạy | Đợi bàn giao | Dừng
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS order_types (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      category      TEXT NOT NULL CHECK (category IN ('image','video')),
      name          TEXT NOT NULL,
      points        REAL NOT NULL DEFAULT 0,
      quantity_note TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0
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
      status        TEXT NOT NULL DEFAULT 'Chờ làm', -- Chờ làm | Đang làm | Đã xong | Yêu cầu sửa
      drive_link    TEXT,                          -- Link Drive output
      youtube_link  TEXT,
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

module.exports = { db, init, nextOrderCode, DB_PATH };

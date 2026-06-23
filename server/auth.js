'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

// Bí mật JWT lưu trong data/.secret để token vẫn hợp lệ sau khi restart
const SECRET_PATH = path.join(__dirname, '..', 'data', '.secret');
function getSecret() {
  try {
    return fs.readFileSync(SECRET_PATH, 'utf8');
  } catch (e) {
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_PATH, s, { mode: 0o600 });
    return s;
  }
}
const SECRET = getSecret();
const TOKEN_TTL = '30d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0 },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Middleware: gắn req.user nếu token hợp lệ
function authenticate(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT id, username, full_name, role, editor_type, active, token_version, totp_enabled, must_change_password FROM users WHERE id = ?').get(payload.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Tài khoản không hợp lệ' });
    // Phiên cũ bị vô hiệu khi mật khẩu bị đổi (token_version tăng)
    if ((payload.tv || 0) !== (user.token_version || 0)) return res.status(401).json({ error: 'Phiên đã hết hạn, vui lòng đăng nhập lại' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  }
}

// Middleware factory: yêu cầu role nằm trong danh sách
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole };

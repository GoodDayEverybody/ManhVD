#!/bin/bash
# Bấm-đúp để chạy trên macOS (nếu báo chặn: Chuột phải > Open)
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "   ORDER CREATIVES - dang khoi dong"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[!] May ban CHUA cai Node.js. Dang mo trang tai..."
  open "https://nodejs.org/en/download"
  echo "Hay cai Node.js (ban LTS), sau do chay lai file nay."
  read -n 1 -s -r -p "Bam phim bat ky de thoat..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[1/3] Dang cai dat thu vien... vui long doi..."
  npm install || { echo "Loi khi cai dat."; exit 1; }
fi

if [ ! -f data/app.db ]; then
  echo "[2/3] Dang tao du lieu mau..."
  npm run seed
fi

echo "[3/3] Dang khoi dong server..."
echo ">> GIU NGUYEN cua so nay khi dang dung app. Dong = tat app."
( sleep 4 && open "http://localhost:3000" ) &
npm start

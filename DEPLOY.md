# Hướng dẫn triển khai (PC chạy 24/7)

Tài liệu này hướng dẫn đưa hệ thống lên 1 PC Windows chạy 24/7 để cả team dùng,
kèm **truy cập trong văn phòng (LAN)** và **truy cập từ xa qua Internet**.

> Toàn bộ dữ liệu nằm trong thư mục `data/` (file `app.db` + khóa `.secret`).
> Đừng bao giờ chạy `npm run seed` trên máy thật — nó **xóa sạch** để tạo lại dữ liệu mẫu.

---

## 1. Chuẩn bị PC (làm 1 lần)

1. Cài **Node.js bản LTS** (>= 22.5) tại https://nodejs.org — bấm Next liên tục.
2. **Tắt chế độ ngủ:** Settings → System → Power → *Screen and sleep* → đặt **Sleep = Never**.
   (Nếu máy ngủ thì người khác sẽ mất kết nối.)
3. Nên đăng nhập Windows sẵn và để máy luôn ở trạng thái đăng nhập
   (server tự chạy khi bạn đăng nhập — xem mục 3).

---

## 2. Chạy server

**Cách thủ công (test nhanh):** bấm-đúp **`run-server.bat`**.
- Cửa sổ đen hiện ra và hiển thị địa chỉ truy cập. **Giữ nguyên cửa sổ này** (đóng = tắt app).
- Server **tự khởi động lại** nếu chẳng may bị lỗi.

---

## 3. Tự chạy 24/7 + tự backup (khuyến nghị)

Bấm **chuột phải** vào **`setup-autostart.bat`** → **Run as administrator** (chạy 1 lần).
Script này sẽ:
- Mở **port 3000** trên Windows Firewall (để máy khác vào được).
- Tạo lối tắt để **server tự chạy mỗi khi đăng nhập Windows** (chạy thu nhỏ dưới taskbar).
- Lên lịch **tự backup dữ liệu mỗi ngày** lúc 12:30 và 23:00 (lưu vào `backups/`).

Sau bước này, mỗi lần bật máy (và đăng nhập) server tự lên. Muốn chạy ngay: bấm-đúp `run-server.bat`.

> Gỡ tự chạy: xóa file `OrderCreatives.lnk` trong thư mục Startup
> (gõ `shell:startup` vào thanh địa chỉ Explorer).

---

## 4. Truy cập trong văn phòng (LAN)

1. Trên PC chạy server, mở **Command Prompt** gõ `ipconfig`, tìm dòng **IPv4 Address**
   (ví dụ `192.168.1.50`). Cửa sổ `run-server.bat` cũng có in sẵn địa chỉ này.
2. Máy/điện thoại khác **cùng mạng** mở trình duyệt vào:
   **`http://192.168.1.50:3000`** (thay bằng IP của bạn).
3. **Nên đặt IP tĩnh** cho PC để địa chỉ không đổi:
   - Cách dễ: vào modem/router, tìm *DHCP Reservation*, gán cố định IP cho PC theo địa chỉ MAC.
   - Hoặc đặt IP tĩnh trong Windows (Network → Properties → IPv4 → Use the following IP).

> Nếu máy khác không vào được: kiểm tra đã chạy `setup-autostart.bat` (mở firewall) chưa,
> và 2 máy phải **cùng một mạng/Wi-Fi**.

---

## 5. Truy cập từ xa (làm việc từ nhà)

Có 2 lựa chọn. **Khuyến nghị Tailscale** vì dễ và an toàn (không phải mở port router).

### Cách A — Tailscale (VPN riêng, dễ nhất) ✅
1. Tạo tài khoản tại https://tailscale.com (miễn phí cho team nhỏ).
2. Cài Tailscale **trên PC server** và **trên máy/điện thoại của từng người**, đăng nhập cùng tài khoản (hoặc mời vào cùng network).
3. Trên PC server, xem **Tailscale IP** (dạng `100.x.x.x`).
4. Người ở xa mở: **`http://100.x.x.x:3000`** — vào được như đang ngồi cùng mạng, đã mã hóa.

### Cách B — Cloudflare Tunnel (có link HTTPS, không cần cài gì trên máy người dùng)
1. Cần một tên miền trỏ qua Cloudflare (hoặc dùng link tạm `trycloudflare`).
2. Trên PC server cài `cloudflared`, chạy:
   `cloudflared tunnel --url http://localhost:3000`
   → nhận một địa chỉ HTTPS công khai, gửi cho team dùng.
3. Phù hợp khi muốn truy cập bằng trình duyệt mà không cài app trên thiết bị người dùng.
   (Cấu hình tunnel cố định + tên miền riêng nên làm theo docs Cloudflare.)

> ⚠️ **Không khuyến khích mở port 3000 thẳng ra Internet qua router** (NAT/port forwarding)
> vì kém an toàn. Nếu buộc phải vậy, tối thiểu hãy bật HTTPS và 2FA cho mọi tài khoản.

---

## 6. Sao lưu & phục hồi dữ liệu

- **Tự động:** đã lên lịch ở mục 3 (mỗi ngày 2 lần, giữ 30 bản gần nhất trong `backups/`).
- **Thủ công bất cứ lúc nào:** bấm-đúp **`backup-now.bat`** (hoặc `npm run backup`).
- **Nên định kỳ copy thư mục `backups/` ra ổ ngoài / Google Drive** để phòng hỏng ổ cứng.

**Phục hồi** (khi cần khôi phục về một thời điểm):
1. Tắt server (đóng cửa sổ `run-server.bat`).
2. Vào thư mục `data/`, xóa (hoặc đổi tên) `app.db`, `app.db-wal`, `app.db-shm`.
3. Copy file backup mong muốn từ `backups/app-YYYYMMDD-....db` vào `data/` và đổi tên thành `app.db`.
4. Mở lại `run-server.bat`.

> Lưu ý: giữ lại file `data/.secret` (khóa đăng nhập). Mất file này thì mọi người phải đăng nhập lại.

---

## 7. Cập nhật phần mềm

1. Bấm-đúp **`update-windows.bat`** (tải bản mới về).
2. **Đóng** cửa sổ `run-server.bat` rồi **mở lại** để áp dụng (server sẽ tự dùng code mới).
3. Vào trình duyệt bấm **Ctrl+F5**.

> Cập nhật chỉ thay đổi code, **không đụng tới dữ liệu** trong `data/`.

---

## 8. Bảo mật nên làm

- **Đổi mật khẩu admin** mặc định (`admin/admin123`) ngay: vào 🔒 Bảo mật → Đổi mật khẩu.
- Bật **2FA** cho admin và các tài khoản quan trọng.
- Nhân viên mới đăng nhập lần đầu sẽ **bị bắt đổi mật khẩu** (đã có sẵn).
- Nếu cho truy cập từ xa, ưu tiên **Tailscale** hoặc **Cloudflare Tunnel (HTTPS)**.

---

## 9. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Máy khác không vào được qua LAN | Chạy `setup-autostart.bat` (mở firewall); kiểm tra cùng mạng; đúng IP |
| Mở `run-server.bat` tắt ngay | Thiếu Node.js → cài lại; xem dòng lỗi trong cửa sổ đen |
| Quên mật khẩu một nhân viên | Admin → Quản lý User → đặt lại mật khẩu (họ sẽ bị bắt đổi lần đăng nhập sau) |
| Đổi địa chỉ IP liên tục | Đặt IP tĩnh / DHCP reservation (mục 4) |
| Muốn dùng port khác 3000 | Đặt biến môi trường `PORT` trước khi chạy (vd `set PORT=8080`) và mở firewall port đó |

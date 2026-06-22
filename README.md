# 🎨 Order Creatives – Hệ thống quản lý order ảnh & video quảng cáo

Web app chạy **local** (trên máy của bạn) để thay thế Google Sheet, dùng cho việc
**UA order creatives** (ảnh + video) và **Editor** nhận việc – cập nhật tiến độ.

- Phân quyền 3 vai trò: **Admin / UA / Editor**
- Quản lý **App**, **Order**, **User**
- **Dashboard & Báo cáo** hiệu suất UA / Editor (biểu đồ cột, đường, tròn)
- Tự động **tính điểm** theo loại order, **sinh mã order** (V… cho video, A… cho ảnh)
- Giao diện **tiếng Việt**, dùng được trên cả **máy tính và điện thoại**
- Dữ liệu lưu trong **SQLite** (1 file, không cần cài server riêng)

---

## 🚀 Cách chạy (dành cho người không biết code)

### Bước 1 – Cài Node.js (chỉ làm 1 lần)
Tải và cài **Node.js** bản LTS tại: https://nodejs.org → bấm Next liên tục cho tới khi xong.
> Để kiểm tra đã cài chưa: mở **Terminal** (macOS) hoặc **Command Prompt / PowerShell** (Windows),
> gõ `node -v` rồi Enter. Nếu hiện ra số phiên bản (vd `v22.x`) là OK.

### Bước 2 – Mở thư mục dự án trong Terminal
- **Windows**: mở thư mục chứa dự án → gõ `cmd` vào thanh địa chỉ → Enter.
- **macOS**: mở **Terminal**, gõ `cd ` (có dấu cách) rồi kéo thả thư mục dự án vào → Enter.

### Bước 3 – Cài đặt (chỉ làm 1 lần)
```bash
npm install
```

### Bước 4 – Tạo dữ liệu mẫu (chỉ làm 1 lần)
```bash
npm run seed
```
Lệnh này tạo sẵn: tài khoản, danh sách nhân viên, app mẫu, các loại order và ~28 order mẫu để test.

### Bước 5 – Chạy app
```bash
npm start
```
Mở trình duyệt vào địa chỉ: **http://localhost:3000**

> Muốn tắt app: quay lại cửa sổ Terminal và bấm `Ctrl + C`.
> Lần sau muốn chạy lại chỉ cần làm **Bước 5** (`npm start`).

---

## 🔑 Tài khoản đăng nhập mẫu

| Vai trò | Tên đăng nhập | Mật khẩu |
|--------|----------------|----------|
| **Admin** | `admin` | `admin123` |
| **UA** | `manhvd`, `baodx`, `thinhvq`, `trangntt`, `trinn`, `vynh`, `chaupm`, `phuctx`, `trangvtq`, `giangdtn`, `chinhdp`, `nguyennvh`, `thuyntt`, `hatt`, `hoan`, `thuybp`, `nguyen` | `123456` |
| **Editor** | `khai`, `ha`, `quang`, `cuong`, `hoan2`, `khanh`, `phuongtrang` | `123456` |

> Tên đăng nhập được sinh tự động từ tên nhân viên (bỏ dấu, viết thường, bỏ khoảng trắng).
> Vì có cả UA tên "Hoan" và Editor tên "Hoàn" nên Editor dùng `hoan2`.
> Admin có thể đổi mật khẩu / thêm user trong mục **Quản lý User**.

---

## 👥 Vai trò & quyền

| Vai trò | Quyền |
|--------|-------|
| **Admin** | Xem & quản lý tất cả: order, app, user; giao việc cho Editor; xem mọi báo cáo |
| **UA** | Tạo order, xem/sửa order của chính mình, yêu cầu sửa lại bản đã giao, xem hiệu suất bản thân |
| **Editor** | Xem order được giao, cập nhật trạng thái (Chờ làm → Đang làm → Đã xong), gắn link Drive/Youtube, ghi note |

---

## 🧭 Các trang chính

- **Tổng quan (Dashboard)** – số liệu nhanh + biểu đồ (theo vai trò).
- **Tạo Order** (UA) – chọn app, loại creative (Ảnh/Video), loại order (kèm điểm), điền mô tả, kích thước, ref… Hệ thống tự sinh mã order.
- **Quản lý Order** – danh sách + bộ lọc (UA, Editor, App, trạng thái, loại, ngày, tìm kiếm). Bấm vào dòng để xem chi tiết / sửa / giao việc.
- **Quản lý App** (Admin) – thêm/sửa/xóa app, đổi tình trạng (Đang chạy / Đợi bàn giao / Tạm dừng / Dừng).
- **Quản lý User** (Admin) – thêm/sửa user, đặt lại mật khẩu, khóa tài khoản.
- **Báo cáo** (Admin) – hiệu suất **UA** (số order, điểm, breakdown theo loại) & **Editor** (số hoàn thành, điểm, thời gian TB), lọc theo khoảng thời gian.

---

## 🏆 Cách tính điểm

Mỗi **loại order** có số điểm cố định (xem khi tạo order). Điểm được cộng cho Editor
**khi order chuyển sang trạng thái "Đã xong"**, đồng thời ghi lại thời gian hoàn thành để
tính **thời gian xử lý trung bình**. Nếu trạng thái bị đổi khỏi "Đã xong" thì điểm trở về 0.

---

## 🛠️ Công nghệ

- **Backend**: Node.js + Express, dùng **SQLite tích hợp sẵn trong Node.js** (`node:sqlite`) → **không cần biên dịch, không cần cài Python hay công cụ build**
- **Auth**: cookie + JWT, mật khẩu mã hóa bằng bcrypt (bcryptjs – thuần JS)
- **Frontend**: HTML/CSS/JavaScript thuần (không cần build) + [Chart.js](https://www.chartjs.org/) (đã kèm sẵn, không cần internet)
- **CSDL**: SQLite – lưu trong file `data/app.db`

> ⚠️ **Yêu cầu Node.js phiên bản ≥ 22.5** (khuyến nghị **22 LTS** hoặc **24**) vì app dùng SQLite có sẵn trong Node. Bản Node quá cũ sẽ không chạy được.

---

## ❓ Một số lưu ý

- **Dữ liệu lưu ở đâu?** Trong thư mục `data/` (file `app.db`). Muốn backup chỉ cần copy thư mục này.
- **Chạy lại `npm run seed` sẽ xóa sạch dữ liệu cũ** và tạo lại dữ liệu mẫu. Chỉ chạy khi muốn làm mới từ đầu.
- **Đổi cổng (port)**: chạy `PORT=4000 npm start` (macOS/Linux) hoặc đặt biến môi trường `PORT` trên Windows.
- **Quên mật khẩu?** Đăng nhập bằng `admin` để đặt lại trong mục Quản lý User; hoặc seed lại dữ liệu.

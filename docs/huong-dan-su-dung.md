# Hướng dẫn cài đặt & sử dụng JP Meeting Caption Translator

## 1. Yêu cầu
- Đã cài Node.js >= 18 và npm >= 9
- Có tài khoản Google để dùng Google Meet
- Có OpenAI API key (lấy tại https://platform.openai.com/api-keys)

## 2. Cài đặt extension

### Cách 1: ải file zip đã build sẵn
1. Tải file `dist.zip` từ [releases](https://drive.google.com/drive/u/0/folders/1eCFH7XPze6kHdHZKBwDxWCQ65ktZvCWQ)

#### Bước 1: Tải mã nguồn & cài dependencies
```bash
npm install
```

#### Bước 2: Build extension
```bash
npm run build
```

#### Bước 3: Nạp extension vào Chrome
1. Mở Chrome, truy cập `chrome://extensions`
2. Bật **Developer mode** (Chế độ nhà phát triển) ở góc phải trên
3. Nhấn **Load unpacked** (Tải tiện ích chưa đóng gói)
4. Chọn thư mục `dist` trong project này

## 3. Sử dụng trên Google Meet

### Bước 1: Tham gia phòng họp Google Meet
- Truy cập https://meet.google.com và tham gia một cuộc họp

### Bước 2: Bật phụ đề tiếng Nhật
- Nhấn nút **CC** (hoặc "Bật phụ đề")
- Chọn ngôn ngữ **Japanese** (Nhật Bản)

### Bước 3: Thiết lập API key
1. Nhấn vào icon extension JP Meeting Caption Translator trên thanh công cụ Chrome
2. Nhấn **⚙️ Open Settings** (Cài đặt)
3. Dán OpenAI API key vào ô tương ứng
4. Chọn model (nên để mặc định gpt-4o-mini)
5. Chọn ngôn ngữ nguồn: Japanese, ngôn ngữ đích: Vietnamese
6. Nhấn **Save Settings** (Lưu)

### Bước 4: Bắt đầu dịch caption
1. Nhấn **▶ Start Translation** trên popup extension
2. Khi có caption tiếng Nhật xuất hiện, overlay sẽ hiện bản gốc + bản dịch tiếng Việt ở dưới màn hình
3. Để dừng dịch, nhấn **■ Stop Translation**

## 4. Lưu ý & Troubleshooting
- Nếu không thấy overlay: kiểm tra đã bật phụ đề tiếng Nhật trên Google Meet chưa
- Nếu không dịch: kiểm tra API key, model, hoặc quota OpenAI
- Nếu caption dịch bị delay: kiểm tra mạng, hoặc thử model khác
- Nếu Google Meet đổi giao diện, extension có thể cần cập nhật lại detector
- API key chỉ lưu trên trình duyệt, không gửi lên server nào khác ngoài OpenAI

## 5. Gỡ cài đặt
- Vào `chrome://extensions`, tìm JP Meeting Caption Translator, nhấn **Remove**

---
Mọi thắc mắc/câu hỏi vui lòng liên hệ **[tác giả](https://nguyentrungnghia1802.github.io/Profile/)** hoặc tạo issue trên GitHub repo của dự án.

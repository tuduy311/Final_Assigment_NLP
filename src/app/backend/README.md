# 🖥️ Backend API - Meeting Minutes & Action Item Extractor

Bộ API Server được phát triển bằng **FastAPI (Python)** để tiếp nhận file âm thanh từ Frontend, giao tiếp với **Model Service** (Whisper bóc băng STT & Qwen LLM tóm tắt) và kích hoạt bộ **Task Parser** nội bộ để trả về danh sách công việc (Action Items) có cấu trúc.

---

## 📁 Cấu trúc thư mục Backend

```text
backend/
├── metrics/               # Thư mục lưu trữ kết quả phân tích & logs giám sát
│   ├── metrics.log        # Text logs dễ đọc
│   ├── metrics.jsonl      # Cơ sở dữ liệu dạng JSON Lines phục vụ phân tích trôi lệch
│   └── flagged.jsonl      # Các mẫu âm thanh chất lượng kém bị cảnh báo
├── routers/
│   ├── __init__.py
│   ├── audio.py           # Endpoint bóc băng, tóm tắt & phân tích task
│   └── calendar.py        # Endpoint tương tác với Google Calendar
├── main.py                # Điểm khởi chạy ứng dụng FastAPI (CORS, router prefix)
├── metrics_service.py     # Lớp giám sát tập trung, quản lý ngưỡng và degrade detection
├── requirements.txt       # Danh sách thư viện Python cần thiết
└── .env                   # Lưu cấu hình biến môi trường kết nối Model Service
```

---

## ⚙️ Cấu hình Biến môi trường (`.env`)

File `.env` nằm tại thư mục gốc của backend dùng để cấu hình đường dẫn tới **Model Service**. Hãy chắc chắn bạn đã cấu hình chính xác trước khi khởi chạy.

### Các tham số cấu hình:
```env
# URL của Service Model xử lý AI (Whisper & Qwen LLM)
# - Chạy qua Colab (Cloudflare Tunnel): Nhập URL .trycloudflare.com tương ứng
# - Chạy trực tiếp ở local: http://localhost:5000
MODEL_SERVICE_BASE_URL=https://trailer-non-nightlife-salaries.trycloudflare.com
```

> ⚠️ **Lưu ý quan trọng:** Mỗi lần khởi động lại Google Colab, Cloudflare sẽ cấp một URL ngẫu nhiên mới. Hãy nhớ cập nhật lại URL này vào file `.env` và lưu lại (`Cmd + S`) trước khi thực hiện các yêu cầu xử lý âm thanh.

---

## 🚀 Hướng dẫn Cài đặt & Chạy ứng dụng

### Bước 1: Di chuyển vào thư mục backend
Mở terminal và di chuyển đến thư mục backend của dự án:
```bash
cd backend
```

### Bước 2: Chuẩn bị môi trường ảo

#### **Cách 1: Sử dụng Conda (Khuyên dùng)**
Nếu máy của bạn đã cài đặt Conda và có môi trường tên là `venv`:
```bash
# Kích hoạt môi trường ảo
conda activate venv
```

#### **Cách 2: Sử dụng Python venv chuẩn**
Nếu bạn muốn tạo môi trường ảo Python cô lập mới:
```bash
# Tạo môi trường ảo
python3 -m venv venv

# Kích hoạt môi trường ảo (macOS/Linux)
source venv/bin/activate

# Kích hoạt môi trường ảo (Windows)
venv\Scripts\activate
```

### Bước 3: Cài đặt các thư viện phụ thuộc
Khi môi trường ảo đã được kích hoạt, chạy lệnh sau để cài đặt các thư viện cần thiết:
```bash
pip install -r requirements.txt
```

### Bước 4: Khởi chạy Server FastAPI

Bạn có thể chạy Server bằng một trong hai cách dưới đây:

*   **Chạy trực tiếp file main (tự động reload khi đổi code):**
    ```bash
    python main.py
    ```
*   **Hoặc chạy qua Uvicorn CLI:**
    ```bash
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ```

---

## 🔌 Đường dẫn kết nối & Tài liệu API

*   **API Local URL:** [http://localhost:8000](http://localhost:8000)
*   **Swagger UI (Tài liệu API tương tác):** [http://localhost:8000/docs](http://localhost:8000/docs)
    *(Bạn có thể vào đây để test trực tiếp các endpoint `process-audio` hoặc `extract-tasks`)*

---

## 📊 Hệ thống giám sát độ trôi dữ liệu (Drift & Degradation Monitoring)

Hệ thống tích hợp bộ giám sát nâng cao tại `metrics_service.py` giúp phát hiện sớm các bất thường trong quá trình suy luận mô hình:
1.  **Low Confidence:** Cảnh báo nếu độ tin cậy của mô hình STT quá thấp.
2.  **High Noise / Silence:** Cảnh báo khi xác suất đoạn âm thanh không chứa tiếng nói quá cao (`no_speech_prob > 0.6`).
3.  **High Latency:** Cảnh báo khi thời gian suy luận vượt quá `8000ms`.

Các bản ghi bất thường sẽ được lọc riêng và lưu trữ tại `metrics/flagged.jsonl` nhằm phục vụ việc tinh chỉnh (fine-tuning) mô hình hoặc huấn luyện liên tục (continual learning) sau này.

# Backend API - Meeting Minutes & Action Item Extractor (FastAPI)

Bộ API Server được viết bằng **FastAPI (Python)** để tiếp nhận file âm thanh từ Frontend, giao tiếp với Model Service (bóc băng & tóm tắt) và xử lý rút trích công việc (Action Items) có cấu trúc.

---

## 📁 Cấu trúc thư mục Backend

```
backend/
├── metrics/               # Thư mục lưu trữ kết quả phân tích & logs giám sát
│   ├── metrics.log        # Text logs dễ đọc
│   ├── metrics.jsonl      # Cơ sở dữ liệu dạng JSON Lines phục vụ phân tích trôi lệch
│   └── flagged.jsonl      # Các mẫu âm thanh chất lượng kém bị cảnh báo (drift detection)
├── routers/
│   ├── __init__.py
│   └── audio.py           # Định nghĩa các endpoint chính và bộ Task Parser tự động
├── main.py                # Điểm khởi chạy ứng dụng FastAPI (CORS, router prefix)
├── metrics_service.py     # Lớp giám sát tập trung, quản lý ngưỡng và degrade detection
├── requirements.txt       # Danh sách thư viện Python cần thiết
└── .env                   # Lưu cấu hình URL Model Service
```

---

## 🔌 Danh sách API Endpoints

Mọi Endpoint đều sử dụng tiền tố `/api/v1`

### 1. `POST /api/v1/audio/process-audio`
*   **Chức năng:** Nhận file âm thanh từ Frontend, gửi sang Model Service để bóc băng (Speech-to-Text) và tự động tạo tóm tắt (Summary).
*   **Request (Multipart Form Data):**
    *   `file`: Tệp tin âm thanh (Hỗ trợ: `mp3, wav, m4a, ogg, flac, webm`)
*   **Response (200 OK):**
    ```json
    {
      "message": "Xử lý thành công!",
      "transcript_result": {
        "text": "Nội dung cuộc họp bóc băng...",
        "language": "vi",
        "confidence": 0.85,
        "segments": [...]
      },
      "summary_result": {
        "summary": "Tóm tắt cuộc họp..."
      }
    }
    ```

### 2. `POST /api/v1/audio/extract-tasks`
*   **Chức năng:** Tiếp nhận văn bản thô (transcript), chuyển tiếp sang Model Service và kích hoạt bộ **Task Parser** nội bộ để trả về danh sách công việc có cấu trúc.
*   **Request (JSON):**
    ```json
    {
      "text": "Nội dung văn bản bóc băng..."
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "action_items": [
        {
          "task": "Nhiệm vụ cần thực hiện",
          "owner": "Người phụ trách",
          "deadline": "Thời hạn"
        }
      ],
      "tasks_raw": "Chuỗi thô phản hồi từ LLM phục vụ debug...",
      "latency_ms": 1250.5
    }
    ```

---

## 🛠 Hướng dẫn Cài đặt & Chạy ứng dụng

### Bước 1: Chuẩn bị môi trường Python
Yêu cầu hệ thống đã cài đặt **Python 3.9+**.

Di chuyển vào thư mục `backend` và tạo môi trường ảo:
```bash
cd backend
python3 -m venv venv
```

Kích hoạt môi trường ảo:
*   **macOS / Linux:**
    ```bash
    source venv/bin/activate
    ```
*   **Windows:**
    ```cmd
    venv\Scripts\activate
    ```

### Bước 2: Cài đặt các thư viện phụ thuộc
```bash
pip install -r requirements.txt
```

### Bước 3: Cấu hình biến môi trường
Tạo file `.env` từ file mẫu (hoặc chỉnh sửa trực tiếp file `.env` đã có):
```
MODEL_SERVICE_BASE_URL=https://consoles-replication-exist-ham.trycloudflare.com
```

### Bước 4: Chạy server FastAPI
Khởi chạy ứng dụng thông qua **uvicorn**:
```bash
python main.py
```
Hoặc chạy trực tiếp bằng lệnh uvicorn CLI:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

*   **API Local URL:** `http://localhost:8000`
*   **Swagger UI (Tài liệu API tương tác):** `http://localhost:8000/docs`

---

## 📊 Hệ thống giám sát độ trôi dữ liệu (Drift & Degradation Monitoring)
Hệ thống tích hợp lớp giám sát nâng cao tại `metrics_service.py` giúp phát hiện sớm các bất thường trong quá trình mô hình suy luận:
1.  **Low Confidence:** Cảnh báo nếu độ tin cậy của mô hình STT quá thấp.
2.  **High Noise / Silence:** Cảnh báo khi xác suất đoạn âm thanh không chứa tiếng nói quá cao (`no_speech_prob > 0.6`).
3.  **High Latency:** Cảnh báo khi thời gian suy luận vượt quá `8000ms`.
Các bản ghi bất thường sẽ được lọc riêng và lưu trữ tại `metrics/flagged.jsonl` nhằm phục vụ việc tinh chỉnh (fine-tuning) mô hình hoặc huấn luyện liên tục (continual learning) sau này.

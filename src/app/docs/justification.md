# Báo cáo justification về phương án xử lý audio

## Mục tiêu
Trình bày lý do chọn cách xử lý audio cho pipeline Whisper + pyannote trong môi trường Kaggle với giới hạn GPU và tài nguyên.

## Bối cảnh tài nguyên
- Mỗi GPU gần như đầy khi load 1 model nặng; hệ thống còn tải LLM và diarization.
- Chỉ có 2 GPU nên khó có đủ dung lượng để chạy song song nhiều model cùng lúc.
- Mục tiêu ưu tiên ổn định (tránh OOM/timeout) hơn là giảm vài phần trăm thời gian.

## Đánh giá 2 phương án
### 1) Xử lý toàn bộ audio 30 phút một mạch
**Ưu điểm**
- Giữ context liền mạch cho Whisper và diarization, giảm nguy cơ mất thông tin đầu/cuối câu.
- Không cần bước ghép kết quả sau khi cắt.
- Ít overhead (decode, i/o, lặp pipeline).

**Nhược điểm**
- Dễ vượt ngưỡng VRAM/timeout trong môi trường Kaggle.
- Nếu dùng nhiều model đồng thời, rủi ro treo runtime cao.

### 2) Cắt audio thành 2-4 đoạn và chạy tuần tự
**Ưu điểm**
- Giảm peak VRAM, ổn định hơn trên Kaggle.
- Dễ xử lý audio dài mà không bị timeout.

**Nhược điểm**
- Không tăng tốc độ rõ rệt; có thể chậm hơn do overhead decode/stitch.
- Whisper mất context nếu cắt giữa câu; pyannote dễ bị nhầm speaker giữa các đoạn.
- Cần thêm bước cắt theo khoảng lặng hoặc có overlap để giảm mất chính xác.

## Kết luận và justification
- **Không ưu tiên chia segment để chạy song song** do VRAM đã gần full và chỉ có 2 GPU. Lợi ích tốc độ không tương xứng với rủi ro OOM và overhead.
- **Nếu hệ thống chịu được 30 phút một mạch** thì xử lý liền mạch là tốt nhất cho chất lượng và đơn giản.
- **Nếu thường xuyên bị OOM/timeout** thì nên cắt 2-4 đoạn và chạy tuần tự. Mục tiêu chính là ổn định hệ thống, chấp nhận ít overhead.

## Khuyến nghị thực tế
- Nếu cần cắt: ưu tiên cắt theo khoảng lặng (VAD) và đoạn 30-90s, có overlap 0.5-1s nếu cần.
- Tránh cắt quá ngắn vì làm giảm độ chính xác diarization và ASR.
- Nếu có thể, tách tác vụ giữa 2 GPU (VD: ASR trên GPU0, diarization trên GPU1) nhưng không load nhiều bản sao model đồng thời.

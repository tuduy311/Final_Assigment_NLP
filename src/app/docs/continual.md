📄 Phần 3 — Continual Learning Strategy (chỉ viết document)
Viết theo cấu trúc này trong report:
a) Thu thập data mới:
•	Mỗi khi user sửa transcript → lưu cặp (audio_segment, corrected_text) vào database
•	Định kỳ thu thập meeting recordings mới từ các domain khác nhau (kỹ thuật, y tế, giáo dục)
•	Áp dụng active learning: ưu tiên label những segment có confidence thấp nhất
b) Retraining strategy:
•	Không full retrain (quá tốn kém) → dùng LoRA fine-tuning trên Whisper với data mới
•	Trigger: khi WER tăng >5% so với baseline hoặc tích lũy đủ 500 correction samples
•	Dùng rehearsal buffer — mix data cũ và mới để tránh catastrophic forgetting
c) Evaluation trước khi deploy:
•	A/B test model mới vs model cũ trên held-out test set
•	Chỉ deploy nếu WER cải thiện và latency không tăng quá 20%

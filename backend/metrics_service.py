"""
MetricsService

Centralized monitoring + drift detection layer.

Responsibility:
- Persist inference metrics
- Flag suspicious requests
- Support future continual learning
- Support multiple pipeline modes
"""

import os
import json
import logging
from datetime import datetime, timezone

# Resolve metrics directory. 
# Depending on your project structure, you might want to place "metrics" 
# at the root of the project instead of traversing up with "..".
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
METRICS_DIR = os.path.join(BASE_DIR, "metrics")

os.makedirs(METRICS_DIR, exist_ok=True)

# Setup file logger
logger = logging.getLogger("MetricsService")
logger.setLevel(logging.INFO)

_log_file = os.path.join(METRICS_DIR, "metrics.log")
_file_handler = logging.FileHandler(_log_file, encoding="utf-8")
_file_handler.setFormatter(
    logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
)
logger.addHandler(_file_handler)

class MetricsService:
    def __init__(self):
        self.LOG_FILE = os.path.join(METRICS_DIR, "metrics.jsonl")
        self.FLAG_FILE = os.path.join(METRICS_DIR, "flagged.jsonl")

        """
        Thresholds for degradation detection.
        
        Can later move into:
        - config file
        - database
        - admin dashboard
        """
        self.THRESHOLDS = {
            "confidence": -0.7,
            "no_speech_prob": 0.6,
            "latency_ms": 8000,
            "short_segment_rate": 0.5
        }

    def collect(self, mode: str, latency_ms: float, transcribe_result: dict, extra: dict = None) -> dict:
        """
        Collect and persist metrics after each inference request.
        
        Supported modes:
        - full_transcribe
        - speaker_aware
        
        Future modes can inject extra fields.
        """
        if extra is None:
            extra = {}

        # Tính num_segments từ danh sách segments trả về bởi Model Service
        segments = transcribe_result.get("segments", [])
        num_segments = len(segments) if isinstance(segments, list) else None

        entry = {
            # Metadata
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mode": mode,

            # Performance
            "latency_ms": round(latency_ms, 2),

            # ASR quality metrics (khớp với response của Model Service)
            "confidence": transcribe_result.get("confidence"),
            "no_speech_prob": transcribe_result.get("no_speech_prob"),
            "num_segments": num_segments,
            "language": transcribe_result.get("language"),
        }

        # Extra mode-specific metrics
        entry.update(extra)

        # Detect suspicious requests
        flags = self.check_flags(entry)

        entry["is_flagged"] = len(flags) > 0
        entry["flag_reasons"] = flags

        # Persist metrics
        self.append_jsonl(self.LOG_FILE, entry)

        # Log ra file .log dạng text dễ đọc
        logger.info(
            "[%s] latency=%.2fms | confidence=%s | no_speech=%.4f | lang=%s | segments=%s",
            mode,
            entry["latency_ms"],
            entry.get("confidence", "N/A"),
            entry.get("no_speech_prob", 0),
            entry.get("language", "N/A"),
            entry.get("num_segments", "N/A"),
        )

        # Persist flagged samples separately
        if flags:
            self.append_jsonl(self.FLAG_FILE, entry)
            logger.warning("⚠ FLAGGED | reasons: %s", ", ".join(flags))

        return entry

    def check_flags(self, entry: dict) -> list:
        """
        Drift / degradation detection logic.
        """
        reasons = []

        # Low confidence
        confidence = entry.get("confidence")
        if confidence is not None and confidence < self.THRESHOLDS["confidence"]:
            reasons.append(f"low_confidence:{confidence}")

        # Excessive silence/noise
        no_speech_prob = entry.get("no_speech_prob")
        if no_speech_prob is not None and no_speech_prob > self.THRESHOLDS["no_speech_prob"]:
            reasons.append(f"high_noise:{no_speech_prob}")

        # Slow inference
        latency_ms = entry.get("latency_ms", 0)
        if latency_ms > self.THRESHOLDS["latency_ms"]:
            reasons.append(f"high_latency:{latency_ms}ms")

        # Speaker-aware specific checks
        short_segment_rate = entry.get("short_segment_rate")
        if short_segment_rate is not None and short_segment_rate > self.THRESHOLDS["short_segment_rate"]:
            reasons.append(f"segmentation_instability:{short_segment_rate}")

        return reasons

    def append_jsonl(self, file_path: str, entry: dict):
        """
        Append one JSON object per line.
        
        JSONL is easy for:
        - dashboards
        - pandas
        - drift analysis
        - future ML pipelines
        """
        with open(file_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

# Singleton instance
metrics_service = MetricsService()

# Usage example:
# from metrics_service import metrics_service
#
# metrics_service.collect(
#     mode="speaker_aware",
#     latency_ms=latency,
#     transcribe_result=asr_result, # Note: make sure this is a dict (e.g. asr_result.model_dump() or __dict__)
#     extra={
#         "speaker_count": 3,
#         "avg_segment_duration": 4.2,
#         "short_segment_rate": 0.1,
#         "overlap_ratio": 0.05,
#     }
# )

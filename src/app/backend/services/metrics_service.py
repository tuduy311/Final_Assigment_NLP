"""
MetricsService

Centralized monitoring + drift detection layer.
Refactored using Pydantic, DI, and Dependency Inversion.
"""

import os
import json
import logging
import math
from collections import deque
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# Config for thresholds
class MetricsConfig(BaseModel):
    confidence_threshold: float = -0.7
    no_speech_prob_threshold: float = 0.6
    short_segment_rate_threshold: float = 0.5
    correction_rate_threshold: float = 0.2 # 20% WER

# 1. Pydantic Models for Data Validation
class ASRMetrics(BaseModel):
    confidence: Optional[float] = None
    no_speech_prob: Optional[float] = None
    num_segments: Optional[int] = None
    language: Optional[str] = None

class DiarizationMetrics(BaseModel):
    speaker_count: int
    avg_segment_duration: float
    short_segment_rate: float
    overlap_ratio: float
    speaker_switch_frequency: float

class InferenceLog(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    mode: str
    latency_ms: float
    rtf: Optional[float] = None
    asr: Optional[ASRMetrics] = None
    diarization: Optional[DiarizationMetrics] = None
    extra: Dict[str, Any] = Field(default_factory=dict)
    is_flagged: bool = False
    flag_reasons: List[str] = Field(default_factory=list)

# 2. Storage Interface
class MetricsStorage:
    def save(self, log_entry: InferenceLog):
        pass
    def save_flagged(self, log_entry: InferenceLog):
        pass

class JSONLMetricsStorage(MetricsStorage):
    def __init__(self, metrics_dir: str):
        self.metrics_dir = metrics_dir
        os.makedirs(metrics_dir, exist_ok=True)
        self.log_file = os.path.join(metrics_dir, "metrics.jsonl")
        self.flag_file = os.path.join(metrics_dir, "flagged.jsonl")

        self.logger = logging.getLogger("MetricsService")
        self.logger.setLevel(logging.INFO)
        if not self.logger.handlers:
            log_txt_file = os.path.join(metrics_dir, "metrics.log")
            file_handler = logging.FileHandler(log_txt_file, encoding="utf-8")
            file_handler.setFormatter(
                logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
            )
            self.logger.addHandler(file_handler)

    def save(self, log_entry: InferenceLog):
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(log_entry.model_dump_json() + "\n")
        
        asr_conf = log_entry.asr.confidence if log_entry.asr and log_entry.asr.confidence is not None else "N/A"
        asr_no_speech = log_entry.asr.no_speech_prob if log_entry.asr and log_entry.asr.no_speech_prob is not None else 0
        rtf_str = f"{log_entry.rtf:.3f}" if log_entry.rtf is not None else "N/A"
        
        self.logger.info(
            f"[{log_entry.mode}] latency={log_entry.latency_ms:.2f}ms | rtf={rtf_str} | confidence={asr_conf} | no_speech={asr_no_speech:.4f} | flagged={log_entry.is_flagged}"
        )

    def save_flagged(self, log_entry: InferenceLog):
        with open(self.flag_file, "a", encoding="utf-8") as f:
            f.write(log_entry.model_dump_json() + "\n")
        self.logger.warning(f"⚠ FLAGGED | reasons: {', '.join(log_entry.flag_reasons)}")

# 3. Refactored Service
class MetricsService:
    def __init__(self, storage: MetricsStorage, config: MetricsConfig):
        self.storage = storage
        self.thresholds = config
        self.rtf_history = deque(maxlen=100) # Sliding window for Z-score

    def collect(self, mode: str, latency_ms: float, rtf: float = None, asr_data: dict = None, diarization_data: dict = None, extra: dict = None) -> InferenceLog:
        asr_metrics = ASRMetrics(**asr_data) if asr_data else None
        diar_metrics = DiarizationMetrics(**diarization_data) if diarization_data else None
        extra = extra or {}
        
        reasons = self._check_drift(rtf, asr_metrics, diar_metrics, extra)

        log_entry = InferenceLog(
            mode=mode,
            latency_ms=round(latency_ms, 2),
            rtf=round(rtf, 3) if rtf is not None else None,
            asr=asr_metrics,
            diarization=diar_metrics,
            extra=extra,
            is_flagged=len(reasons) > 0,
            flag_reasons=reasons
        )

        self.storage.save(log_entry)
        if log_entry.is_flagged:
            self.storage.save_flagged(log_entry)

        # Update RTF history after anomaly check
        if rtf is not None:
            self.rtf_history.append(rtf)

        return log_entry

    def _check_drift(self, rtf: Optional[float], asr: Optional[ASRMetrics], diar: Optional[DiarizationMetrics], extra: dict) -> List[str]:
        reasons = []
        
        # RTF Z-Score Calculation
        if rtf is not None and len(self.rtf_history) >= 10:
            mean_rtf = sum(self.rtf_history) / len(self.rtf_history)
            variance = sum((x - mean_rtf) ** 2 for x in self.rtf_history) / len(self.rtf_history)
            std_rtf = math.sqrt(variance)
            
            if std_rtf > 0:
                z_score = (rtf - mean_rtf) / std_rtf
                if z_score > 3:
                    reasons.append(f"rtf_anomaly_zscore:{round(z_score, 2)}")
            elif rtf > mean_rtf * 1.5: # Fallback if variance is 0
                reasons.append(f"rtf_anomaly_spike")

        if asr:
            if asr.confidence is not None and asr.confidence < self.thresholds.confidence_threshold:
                reasons.append(f"low_confidence:{asr.confidence}")
            if asr.no_speech_prob is not None and asr.no_speech_prob > self.thresholds.no_speech_prob_threshold:
                reasons.append(f"high_noise:{asr.no_speech_prob}")

        if diar:
            if diar.short_segment_rate > self.thresholds.short_segment_rate_threshold:
                reasons.append(f"segmentation_instability:{diar.short_segment_rate}")
                
        if extra and "word_error_rate" in extra:
            wer = extra["word_error_rate"]
            if wer > self.thresholds.correction_rate_threshold:
                reasons.append(f"high_correction_rate:{round(wer, 2)}")

        return reasons

# DI Setup for FastAPI
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
METRICS_DIR = os.path.join(BASE_DIR, "metrics")

# Resolve path to the configs/ directory at the project root
CONFIGS_DIR = os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), "configs")
METRICS_CONFIG_PATH = os.path.join(CONFIGS_DIR, "metrics_thresholds.json")

def _load_metrics_config() -> MetricsConfig:
    if os.path.exists(METRICS_CONFIG_PATH):
        try:
            with open(METRICS_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return MetricsConfig(**data)
        except Exception as e:
            logging.getLogger("MetricsService").error(f"Failed to load config from {METRICS_CONFIG_PATH}: {e}")
    return MetricsConfig()

_storage = JSONLMetricsStorage(METRICS_DIR)
_config = _load_metrics_config()
_metrics_service_instance = MetricsService(_storage, _config)

def get_metrics_service() -> MetricsService:
    return _metrics_service_instance

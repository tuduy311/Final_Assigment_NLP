import pytest
import sys
import os
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src/app/backend')))

from services.metrics_service import MetricsService, MetricsConfig

class MockStorage:
    def __init__(self):
        self.data = []
    def save(self, record):
        self.data.append(record)
    def save_flagged(self, record):
        pass # Optional logic if we wanted to verify flagged saves
    def load_recent(self, limit=100):
        return self.data[-limit:]
    def load_all(self):
        return self.data

def test_metrics_service_collects_asr():
    storage = MockStorage()
    config = MetricsConfig()
    service = MetricsService(storage, config)
    
    service.collect(
        mode="full_transcribe",
        latency_ms=1500.0,
        rtf=0.05,
        asr_data={
            "confidence": -0.8,
            "no_speech_prob": 0.7
        }
    )
    
    assert len(storage.data) == 1
    record = storage.data[0]
    assert record.mode == "full_transcribe"
    assert record.rtf == 0.05
    assert record.asr.confidence == -0.8

def test_drift_detection_alerts():
    storage = MockStorage()
    config = MetricsConfig(
        confidence_threshold=-0.7,
        no_speech_prob_threshold=0.6,
        short_segment_rate_threshold=0.5,
        correction_rate_threshold=0.2
    )
    service = MetricsService(storage, config)
    
    # Insert failing ASR
    log_entry = service.collect(
        mode="full_transcribe",
        latency_ms=1000.0,
        asr_data={"confidence": -0.9, "no_speech_prob": 0.8}  # Both worse than threshold
    )
    
    assert log_entry.is_flagged is True
    flag_reasons = log_entry.flag_reasons
    # The drift reasons append exactly these specific strings defined in metrics_service.py
    assert "low_confidence:-0.9" in flag_reasons
    assert "high_noise:0.8" in flag_reasons

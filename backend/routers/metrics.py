from fastapi import APIRouter, Depends, HTTPException
import os
import json
from services.metrics_service import get_metrics_service, MetricsService

router = APIRouter(
    prefix="/metrics",
    tags=["Metrics & Monitoring"]
)

@router.get("/summary")
async def get_metrics_summary(metrics_service: MetricsService = Depends(get_metrics_service)):
    """
    Đọc file metrics.jsonl và trả về dữ liệu tổng hợp.
    Sử dụng để vẽ biểu đồ trên Dashboard.
    """
    # Mở rộng scope nếu bạn sử dụng Storage Interface khác
    if not hasattr(metrics_service.storage, 'log_file'):
        raise HTTPException(status_code=500, detail="Storage mechanism not supported for direct file read")
        
    log_file = metrics_service.storage.log_file
    if not os.path.exists(log_file):
        return {"total_requests": 0, "recent_history": []}

    history = []
    total_requests = 0
    total_latency = 0
    total_rtf = 0
    rtf_count = 0
    avg_confidence = 0
    confidence_count = 0
    total_wer = 0
    wer_count = 0
    
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                data = json.loads(line)
                history.append(data)
                total_requests += 1
                total_latency += data.get("latency_ms", 0)
                
                if data.get("rtf") is not None:
                    total_rtf += data["rtf"]
                    rtf_count += 1
                    
                extra = data.get("extra", {})
                if "word_error_rate" in extra:
                    total_wer += extra["word_error_rate"]
                    wer_count += 1
                
                asr = data.get("asr")
                if asr and asr.get("confidence") is not None:
                    avg_confidence += asr.get("confidence")
                    confidence_count += 1
                    
        # Trả về 100 kết quả mới nhất cho biểu đồ Time Series
        history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return {
            "total_requests": total_requests,
            "avg_latency_ms": round(total_latency / total_requests, 2) if total_requests > 0 else 0,
            "avg_rtf": round(total_rtf / rtf_count, 3) if rtf_count > 0 else 0,
            "avg_wer": round(total_wer / wer_count, 3) if wer_count > 0 else 0,
            "avg_confidence": round(avg_confidence / confidence_count, 2) if confidence_count > 0 else 0,
            "recent_history": history[:100]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/drift-alerts")
async def get_drift_alerts(metrics_service: MetricsService = Depends(get_metrics_service)):
    """
    Đọc file flagged.jsonl và trả về danh sách các cảnh báo Drift.
    """
    if not hasattr(metrics_service.storage, 'flag_file'):
        raise HTTPException(status_code=500, detail="Storage mechanism not supported for direct file read")
        
    flag_file = metrics_service.storage.flag_file
    if not os.path.exists(flag_file):
        return {"alerts": []}
        
    alerts = []
    try:
        with open(flag_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                alerts.append(json.loads(line))
                
        alerts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return {"alerts": alerts[:50]} # Trả về 50 cảnh báo mới nhất
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

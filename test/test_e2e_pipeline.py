import requests
import time
import sys
from pathlib import Path

# Backend API URL (thay đổi nếu bạn chạy port khác)
BASE_URL = "http://localhost:8000/api/v1"

def print_step(title):
    print(f"\n{'-'*50}")
    print(f"🚀 STEP: {title}")
    print(f"{'-'*50}")

def test_pipeline():
    # 1. Tìm file audio test
    test_audio = Path(__file__).parent / "test.mp3"
    if not test_audio.exists():
        print(f"❌ Không tìm thấy file audio để test tại: {test_audio}")
        print("Vui lòng copy một file audio mp3 vào thư mục test/ và đặt tên là test.mp3")
        sys.exit(1)

    headers = {"X-Google-Access-Token": "ya29.a0AfB_byE_MockTokenForTestingOnly_DoNotUseInProduction_1234567890abcdefghijklmnopqrstuvwxyz"}

    print_step("1. UPLOAD AUDIO")
    with open(test_audio, "rb") as f:
        res = requests.post(f"{BASE_URL}/audio/upload", files={"file": f}, headers=headers)
    
    if res.status_code != 200:
        print(f"❌ Lỗi Upload: {res.text}")
        sys.exit(1)
        
    data = res.json()
    audio_id = data["audio_id"]
    print(f"✅ Upload thành công. Audio ID: {audio_id}")
    print(f"   Duration: {data.get('duration')} giây")

    # 2. Transcribe
    print_step("2. TRANSCRIBE (ASR)")
    t0 = time.time()
    res = requests.post(f"{BASE_URL}/audio/{audio_id}/transcribe", timeout=600, headers=headers)
    if res.status_code != 200:
        print(f"❌ Lỗi Transcribe: {res.text}")
        sys.exit(1)
    
    stt_data = res.json()
    print(f"✅ Transcribe thành công ({(time.time()-t0):.2f}s)!")
    print(f"   Text preview: {stt_data.get('text', '')[:100]}...")
    print(f"   Suggested names: {stt_data.get('suggested_names', [])}")

    # 3. Diarize
    print_step("3. DIARIZE (Speaker Separation)")
    t0 = time.time()
    res = requests.post(f"{BASE_URL}/audio/{audio_id}/diarize", timeout=600, headers=headers)
    if res.status_code != 200:
        print(f"❌ Lỗi Diarize: {res.text}")
    else:
        diar_data = res.json()
        print(f"✅ Diarize thành công ({(time.time()-t0):.2f}s)!")
        print(f"   Tìm thấy: {len(diar_data.get('segments', []))} phân đoạn.")

    # 4. Generate Summary & Tasks
    full_text = stt_data.get('text', '')
    if full_text:
        print_step("4. LLM SUMMARY & TASKS")
        
        # Summary
        t0 = time.time()
        res = requests.post(f"{BASE_URL}/audio/summary/generate-text", json={
            "text": full_text,
            "audio_id": audio_id
        }, timeout=120, headers=headers)
        
        if res.status_code == 200:
            print(f"✅ Summary thành công ({(time.time()-t0):.2f}s)!")
            print(f"   {res.json().get('summary')[:100]}...")
        else:
            print(f"❌ Lỗi Summary: {res.text}")

        # Tasks
        t0 = time.time()
        res = requests.post(f"{BASE_URL}/audio/summary/generate-tasks", json={
            "text": full_text,
            "audio_id": audio_id
        }, timeout=120, headers=headers)
        
        if res.status_code == 200:
            tasks = res.json().get('action_items', [])
            print(f"✅ Extract Tasks thành công ({(time.time()-t0):.2f}s)! Tìm thấy {len(tasks)} task(s).")
            for idx, task in enumerate(tasks):
                print(f"   - Task {idx+1}: {task.get('title')} (Deadline: {task.get('deadline')})")
        else:
            print(f"❌ Lỗi Tasks: {res.text}")

    # 5. Cleanup
    print_step("5. CLEANUP")
    res = requests.delete(f"{BASE_URL}/audio/{audio_id}", headers=headers)
    if res.status_code == 200:
        print(f"✅ Đã xóa workspace test (Audio ID: {audio_id}).")
    else:
        print(f"⚠️ Lỗi xóa workspace: {res.text}")


if __name__ == "__main__":
    try:
        test_pipeline()
    except requests.exceptions.ConnectionError:
        print("❌ KHÔNG THỂ KẾT NỐI ĐẾN BACKEND!")
        print("Vui lòng đảm bảo bạn đã chạy: docker compose up -d backend")

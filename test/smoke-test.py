import requests
import time
import json
import sys
from pathlib import Path

BASE_URL = "https://needle-george-sing-learned.trycloudflare.com/"
TIMEOUT_TRANSCRIBE = 300
TIMEOUT_LLM        = 120

# ── Helpers ───────────────────────────────────────────────────────────────────

def print_header(title: str):
    print(f"\n{'='*55}")
    print(f"  [TEST] {title}")
    print(f"{'='*55}")

def print_result(label: str, value):
    print(f"  {label:<25} {value}")

def check_status(r, expected=200) -> bool:
    ok = r.status_code == expected
    status_str = f"{r.status_code} {'✅' if ok else '❌ (expected ' + str(expected) + ')'}"
    print_result("Status:", status_str)
    return ok

# ── /health (GET) ─────────────────────────────────────────────────────────────

def test_health() -> bool:
    print_header("GET /")
    try:
        t0 = time.time()
        r  = requests.get(f"{BASE_URL}/", timeout=10)
        print_result("Latency:", f"{round((time.time()-t0)*1000,2)} ms")
        ok = check_status(r)
        print_result("Body:", r.json())
        return ok
    except Exception as e:
        print(f"  ERROR: {e}")
        return False

# ── /transcribe (POST) ────────────────────────────────────────────────────────

def test_transcribe(audio_path: str) -> str:
    print_header(f"POST /transcribe  ({Path(audio_path).name})")
    try:
        with open(audio_path, "rb") as f:
            t0 = time.time()
            r  = requests.post(
                f"{BASE_URL}/transcribe",
                files={"file": f},
                timeout=TIMEOUT_TRANSCRIBE,
            )
        latency = round((time.time() - t0) * 1000, 2)

        print_result("Latency (client):", f"{latency} ms")
        ok = check_status(r)
        if not ok:
            print(f"  Body: {r.text[:300]}")
            return ""

        data = r.json()

        # ── assert expected fields ──
        expected_fields = [
            "text", "segments", "language",
            "confidence", "no_speech_prob",
            "language_probability", "latency_ms"
        ]
        missing = [f for f in expected_fields if f not in data]
        if missing:
            print(f"  ⚠️  Missing fields: {missing}")

        print_result("language:",            data.get("language"))
        print_result("language_prob:",       data.get("language_probability"))
        print_result("confidence:",          data.get("confidence"))
        print_result("no_speech_prob:",      data.get("no_speech_prob"))
        segments = data.get("segments", [])
        print_result("num_segments:",        len(segments))
        print_result("latency_ms (server):", data.get("latency_ms"))
        print_result("is_flagged:",          data.get("is_flagged"))
        print_result("flag_reasons:",        data.get("flag_reasons"))

        if segments:
            print("\n  Segments:")
            for idx, seg in enumerate(segments, 1):
                start = seg.get("start")
                end = seg.get("end")
                speaker = seg.get("speaker")
                text_seg = (seg.get("text") or "").replace("\n", " ").strip()

                if isinstance(start, (int, float)) and isinstance(end, (int, float)):
                    ts = f"[{start:.2f}s → {end:.2f}s]"
                else:
                    ts = "[timestamp unavailable]"

                speaker_part = f" {speaker}" if speaker else ""
                preview = f' "{text_seg}"' if text_seg else ""
                print(f"    {idx:02d}. {ts}{speaker_part}{preview}")

        text = data.get("text", "")
        preview = text[:120].replace("\n", " ")
        print_result("text preview:", f'"{preview}..."' if len(text) > 120 else f'"{preview}"')

        # ── quality warnings ──
        conf = data.get("confidence")
        if conf is not None and conf < -0.8:
            print(f"  ⚠️  Low confidence ({conf:.3f}) — transcript may be unreliable")
        nsp = data.get("no_speech_prob")
        if nsp is not None and nsp > 0.6:
            print(f"  ⚠️  High no_speech_prob ({nsp:.3f}) — audio may be noisy")

        return text

    except Exception as e:
        print(f"  ERROR: {e}")
        return ""

# ── /generate/summary (POST) ──────────────────────────────────────────────────

def test_generate_summary(text: str) -> str:
    print_header("POST /generate/summary")
    if not text:
        print("  SKIP — no text provided")
        return ""
    try:
        t0 = time.time()
        r  = requests.post(
            f"{BASE_URL}/generate/summary",
            json={"text": text},
            timeout=TIMEOUT_LLM,
        )
        print_result("Latency (client):", f"{round((time.time()-t0)*1000,2)} ms")
        ok = check_status(r)
        if not ok:
            print(f"  Body: {r.text[:300]}")
            return ""

        data    = r.json()
        summary = data.get("summary", "")
        print_result("latency_ms (server):", data.get("latency_ms"))
        print_result("summary length:",      f"{len(summary)} chars")

        # verify markdown structure
        has_header = "# " in summary
        print_result("has markdown header:", "✅" if has_header else "⚠️  Missing")

        print(f"\n  Preview (first 300 chars):\n  {summary[:300].replace(chr(10), chr(10)+'  ')}")
        return summary

    except Exception as e:
        print(f"  ERROR: {e}")
        return ""

# ── /generate/tasks (POST) ────────────────────────────────────────────────────

def test_generate_tasks(text: str) -> list:
    print_header("POST /generate/tasks")
    if not text:
        print("  SKIP — no text provided")
        return []
    try:
        t0 = time.time()
        r  = requests.post(
            f"{BASE_URL}/generate/tasks",
            json={"text": text},
            timeout=TIMEOUT_LLM,
        )
        print_result("Latency (client):", f"{round((time.time()-t0)*1000,2)} ms")
        ok = check_status(r)
        if not ok:
            print(f"  Body: {r.text[:300]}")
            return []

        data = r.json()
        print_result("latency_ms (server):", data.get("latency_ms"))

        # ── parse tasks — server trả "tasks" (parsed) hoặc "tasks_raw" (string) ──
        tasks_data = data.get("tasks") or data.get("tasks_raw")
        if isinstance(tasks_data, str):
            # server chưa parse → thử parse client-side
            try:
                cleaned    = tasks_data.strip().removeprefix("```json").removesuffix("```").strip()
                tasks_data = json.loads(cleaned)
                print_result("JSON parse:", "✅ (client-side fallback)")
            except json.JSONDecodeError as je:
                print(f"  ❌ JSON parse failed: {je}")
                print(f"  Raw: {tasks_data[:200]}")
                return []

        action_items = tasks_data.get("action_items", []) if isinstance(tasks_data, dict) else []
        print_result("action_items count:", len(action_items))

        for i, item in enumerate(action_items[:3], 1):
            print(f"\n  Task {i}:")
            print(f"    title    : {item.get('title')}")
            print(f"    assignee : {item.get('assignee')}")
            print(f"    description : {item.get('description', '')[:80]}")
            print(f"    due_date : {item.get('due_date')}")
            refs = item.get("reference_segments") or []
            print(f"    refs     : {len(refs)} segment(s)")

        if len(action_items) > 3:
            print(f"\n  ... and {len(action_items)-3} more tasks")

        return action_items

    except Exception as e:
        print(f"  ERROR: {e}")
        return []

# ── /transcribe — error cases ─────────────────────────────────────────────────

def test_transcribe_errors():
    print_header("POST /transcribe  (error cases)")

    # no file field
    r = requests.post(f"{BASE_URL}/transcribe", timeout=10)
    label = "no file → 422"
    ok    = r.status_code == 422
    print_result(label, "✅" if ok else f"❌ got {r.status_code}")

    # empty filename workaround — send empty bytes
    r = requests.post(
        f"{BASE_URL}/transcribe",
        files={"file": ("", b"", "audio/mpeg")},
        timeout=10,
    )
    label = "empty filename → 400"
    ok    = r.status_code == 400
    print_result(label, "✅" if ok else f"❌ got {r.status_code}")

# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    audio = Path(sys.argv[1]) if len(sys.argv) > 1 else script_dir / "test.mp3"
    if not audio.is_absolute():
        audio = script_dir / audio

    if not audio.exists():
        print(f"❌ Audio file not found: {audio}")
        sys.exit(1)

    print(f"\n🎯 Smoke Test — {BASE_URL}")
    print(f"   Audio file : {audio}")

    # 1. health check
    if not test_health():
        print("\n❌ Server unreachable — aborting")
        sys.exit(1)

    # 2. error cases trước — không cần audio
    test_transcribe_errors()

    # 3. transcribe
    text = test_transcribe(audio)

    # 4. LLM endpoints — chỉ chạy nếu có transcript
    if text:
        test_generate_summary(text)
        test_generate_tasks(text)
    else:
        print("\n⚠️  Skipping LLM tests — transcription returned empty text")

    print(f"\n{'='*55}")
    print("  Smoke test complete")
    print(f"{'='*55}\n")
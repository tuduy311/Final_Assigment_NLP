import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import httpx
import uvicorn
import threading
import time

app = FastAPI()

async def event_generator():
    yield b" "
    await asyncio.sleep(0.1)
    yield b" "
    await asyncio.sleep(0.1)
    yield b'{"status": "ok"}'

@app.get("/test")
async def test():
    return StreamingResponse(event_generator(), media_type="application/json")

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="error")

def run_client():
    time.sleep(1)
    response = httpx.get("http://127.0.0.1:8001/test")
    print(f"Status: {response.status_code}")
    print(f"Text: '{response.text}'")
    try:
        data = response.json()
        print(f"JSON: {data}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    run_client()

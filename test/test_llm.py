import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

MODEL_SERVICE_BASE_URL = os.getenv("MODEL_SERVICE_BASE_URL", "")

async def test_llm():
    print(f"Testing endpoint at: {MODEL_SERVICE_BASE_URL}/generate/check-conflicts")
    
    prompt = """
Pairs to check:
[
  {
    "task_id": 0,
    "task_title": "Update project plan",
    "task_deadline": "2023-10-25",
    "event_id": "event_123",
    "event_title": "Project Planning Session",
    "event_start": "2023-10-25T10:00:00Z"
  }
]
"""
    
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{MODEL_SERVICE_BASE_URL}/generate/check-conflicts",
                json={"text": prompt},
                timeout=60.0
            )
            
            print(f"Status Code: {res.status_code}")
            print(f"Raw Response Text:\n{res.text}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_llm())

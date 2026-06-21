from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import audio, calendar, metrics, agent
import uvicorn



app = FastAPI(
    title="NLP Backend API",
    description="API gateway connecting Frontend and NLP Service Model",
    version="1.0.0"
)



# Cấu hình CORS để Frontend có thể gọi API mà không bị chặn
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Bạn có thể thay đổi thành URL cụ thể của Frontend (vd: http://localhost:3000)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audio.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(metrics.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Welcome to NLP Backend API. Visit /docs for Swagger UI."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

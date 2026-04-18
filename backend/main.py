from pydantic import BaseModel
from typing import Optional, List
import json
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from services.youtube_service import YouTubeService
from services.pdf_service import PDFService
from services.planner_service import PlannerService

load_dotenv()

app = FastAPI(title="AI Planner API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    youtube_urls: Optional[List[str]] = []  # list of video or playlist URLs
    mode: str  # "daily_hours" or "target_date"
    daily_hours: Optional[float] = None
    target_date: Optional[str] = None


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "AI Planner Backend v2 is running!"}


@app.post("/api/plan")
async def generate_plan(
    # PDF files (0 or more)
    files: Optional[List[UploadFile]] = File(default=[]),
    # JSON string for the rest of the options (multipart workaround)
    youtube_urls: Optional[str] = Form(default="[]"),   # JSON array string
    mode: str = Form(...),                               # "daily_hours" or "target_date"
    daily_hours: Optional[str] = Form(default=None),
    target_date: Optional[str] = Form(default=None),
):
    pdf_service = PDFService()
    yt_service = YouTubeService()
    planner_service = PlannerService()

    materials_parts = []

    # ── 1. Process PDFs ──────────────────────────────────────────────────────
    if files:
        for idx, upload in enumerate(files, start=1):
            if not upload.filename:
                continue
            file_bytes = await upload.read()
            try:
                data = pdf_service.extract_text(file_bytes)
                materials_parts.append(
                    f"### PDF {idx}: {upload.filename}\n"
                    f"- Pages: {data['num_pages']}, Words: {data['word_count']}, "
                    f"Estimated study time: {data['estimated_study_hours']}h\n\n"
                    f"Content excerpt:\n{data['text_content']}"
                )
            except Exception as e:
                materials_parts.append(f"### PDF {idx}: {upload.filename}\n[Could not extract text: {e}]")

    # ── 2. Process YouTube URLs ───────────────────────────────────────────────
    try:
        urls: List[str] = json.loads(youtube_urls)
    except Exception:
        urls = []

    if urls:
        for url in urls:
            url = url.strip()
            if not url:
                continue
            try:
                videos = yt_service.process_url(url)
                total_minutes = sum(v["duration_minutes"] for v in videos)
                video_lines = "\n".join(
                    f"  - {v['title']} (URL: https://youtube.com/watch?v={v['id']}, Duration: {v['duration_minutes']}min)" for v in videos
                )
                materials_parts.append(
                    f"### YouTube Source: {url}\n"
                    f"- {len(videos)} video(s), total ~{round(total_minutes/60, 1)}h of content\n"
                    f"Videos:\n{video_lines}"
                )
            except Exception as e:
                materials_parts.append(f"### YouTube Source: {url}\n[Error: {e}]")

    if not materials_parts:
        raise HTTPException(status_code=400, detail="No valid materials provided. Please upload at least one PDF or YouTube URL.")

    materials_summary = "\n\n".join(materials_parts)

    # ── 3. Build constraints ─────────────────────────────────────────────────
    constraints = {"mode": mode}
    if mode == "daily_hours" and daily_hours:
        constraints["daily_hours"] = float(daily_hours)
    elif mode == "target_date" and target_date:
        constraints["target_date"] = target_date
    else:
        raise HTTPException(status_code=400, detail="Please provide either daily_hours or target_date.")

    # ── 4. Generate roadmap ───────────────────────────────────────────────────
    try:
        roadmap = planner_service.generate_roadmap(materials_summary, constraints)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    return {
        "roadmap": roadmap,
        "materials_count": len(materials_parts),
    }

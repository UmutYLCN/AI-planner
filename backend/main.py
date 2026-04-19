from typing import Optional, List
import json
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from services.youtube_service import YouTubeService
from services.pdf_service import PDFService
from services.transcript_service import TranscriptService
from services.embedding_service import ClusteringService
from services.planner_service import PlannerService

load_dotenv()

app = FastAPI(title="AI Planner API", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "AI Planner Backend v4 — Simplified Pipeline"}


@app.post("/api/plan")
async def generate_plan(
    files: Optional[List[UploadFile]] = File(default=[]),
    youtube_urls: Optional[str] = Form(default="[]"),
    target_date: Optional[str] = Form(default=None),   # stored, not used for scheduling yet
    strict_mode: str = Form(default="true"),
    granularity: str = Form(default="macro"),
):
    pdf_service = PDFService()
    yt_service = YouTubeService()
    transcript_service = TranscriptService()
    planner_service = PlannerService()

    # ── 1. Process PDFs ───────────────────────────────────────────────────
    pdf_items = []
    pdf_summaries = []

    if files:
        for upload in files:
            if not upload.filename:
                continue
            file_bytes = await upload.read()
            try:
                data = pdf_service.extract_text(file_bytes)
                pdf_items.append({
                    "filename": upload.filename,
                    "num_pages": data["num_pages"],
                    "word_count": data["word_count"],
                    "estimated_study_hours": data["estimated_study_hours"],
                    "text_summary": data["text_content"],
                })
                pdf_summaries.append(
                    f"### PDF: {upload.filename}\n"
                    f"- Pages: {data['num_pages']}, Est. study: {data['estimated_study_hours']}h\n"
                    f"Content:\n{data['text_content'][:8000]}"
                )
            except Exception as e:
                pdf_summaries.append(f"### PDF: {upload.filename}\n[Error: {e}]")

    # ── 2. Process YouTube URLs + Transcripts ─────────────────────────────
    video_items = []
    video_summaries = []

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
                for v in videos:
                    transcript = transcript_service.get_transcript(v["id"])
                    video_items.append({
                        "id": v["id"],
                        "title": v["title"],
                        "url": f"https://youtube.com/watch?v={v['id']}",
                        "duration_minutes": v["duration_minutes"],
                        "transcript": transcript,
                    })
                video_lines = "\n".join(
                    f"  - {v['title']} (URL: https://youtube.com/watch?v={v['id']}, {v['duration_minutes']}min)"
                    for v in videos
                )
                video_summaries.append(f"### YouTube: {url}\n{video_lines}")
            except Exception as e:
                video_summaries.append(f"### YouTube: {url}\n[Error: {e}]")

    if not pdf_items and not video_items:
        raise HTTPException(status_code=400, detail="No valid materials provided.")

    # ── 3. Semantic Grouping ──────────────────────────────────────────────
    topic_groups = None
    if pdf_items and video_items:
        try:
            clustering = ClusteringService(similarity_threshold=0.35)
            topic_groups = clustering.build_topic_groups(pdf_items, video_items)
        except Exception as e:
            print(f"[WARN] Clustering failed: {e}")

    # ── 4. Build materials summary ────────────────────────────────────────
    if topic_groups:
        group_parts = []
        for i, g in enumerate(topic_groups, 1):
            part = f"### Study Unit {i}: {g['topic_label']}\n"
            if g["pdf"]:
                p = g["pdf"]
                part += f"PDF (study first): {p['filename']} — {p['num_pages']} pages, {p['estimated_study_hours']}h\n"
            if g["videos"]:
                part += f"Videos to watch after ({len(g['videos'])}):\n"
                for v in g["videos"]:
                    part += f"  - {v['title']} | URL: {v['url']} | {v['duration_minutes']}min\n"
            group_parts.append(part)
        materials_summary = "\n\n".join(group_parts)
    else:
        materials_summary = "\n\n".join(pdf_summaries + video_summaries)

    # ── 5. Generate roadmap ───────────────────────────────────────────────
    try:
        is_strict = strict_mode.lower() == "true"
        roadmap = planner_service.generate_roadmap(materials_summary, target_date, is_strict, granularity)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    return {
        "roadmap": roadmap,
        "materials_count": len(pdf_items) + len(video_items),
        "semantic_groups": len(topic_groups) if topic_groups else 0,
        "target_date": target_date,
    }

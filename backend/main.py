from typing import Optional, List
import json
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from services.youtube_service import YouTubeService, extract_video_id
from services.pdf_service import PDFService
from services.transcript_service import TranscriptService
from services.embedding_service import ClusteringService
from services.planner_service import PlannerService

load_dotenv()

app = FastAPI(title="AI Planner API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "AI Planner Backend v3 — Semantic Pipeline"}


@app.post("/api/plan")
async def generate_plan(
    files: Optional[List[UploadFile]] = File(default=[]),
    youtube_urls: Optional[str] = Form(default="[]"),
    mode: str = Form(...),
    daily_hours: Optional[str] = Form(default=None),
    target_date: Optional[str] = Form(default=None),
):
    pdf_service = PDFService()
    yt_service = YouTubeService()
    transcript_service = TranscriptService()
    planner_service = PlannerService()

    # ── 1. Process PDFs into Chunks ──────────────────────────────────────
    all_pdf_chunks = []   # [{filename, page_start, page_end, text, word_count}]
    pdf_summaries = []    # For fallback plain text summary

    if files:
        for upload in files:
            if not upload.filename:
                continue
            file_bytes = await upload.read()
            try:
                chunks = pdf_service.extract_chunks(file_bytes, chunk_size=5)
                for c in chunks:
                    c["filename"] = upload.filename
                all_pdf_chunks.extend(chunks)

                # Also build a plain summary for the planner prompt
                meta = pdf_service.extract_text(file_bytes)
                pdf_summaries.append(
                    f"### PDF: {upload.filename}\n"
                    f"- Pages: {meta['num_pages']}, Words: {meta['word_count']}, "
                    f"Est. study: {meta['estimated_study_hours']}h\n"
                    f"Content:\n{meta['text_content'][:8000]}"
                )
            except Exception as e:
                pdf_summaries.append(f"### PDF: {upload.filename}\n[Error: {e}]")

    # ── 2. Process YouTube URLs + Transcripts ────────────────────────────
    all_video_items = []  # [{id, title, url, duration_minutes, transcript}]
    video_summaries = []  # For fallback

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
                    # Fetch transcript for semantic matching
                    transcript = transcript_service.get_transcript(v["id"])
                    v_url = f"https://youtube.com/watch?v={v['id']}"

                    all_video_items.append({
                        "id": v["id"],
                        "title": v["title"],
                        "url": v_url,
                        "duration_minutes": v["duration_minutes"],
                        "transcript": transcript,
                    })

                video_lines = "\n".join(
                    f"  - {v['title']} (URL: https://youtube.com/watch?v={v['id']}, "
                    f"Duration: {v['duration_minutes']}min)"
                    for v in videos
                )
                video_summaries.append(
                    f"### YouTube: {url}\n"
                    f"- {len(videos)} video(s)\n"
                    f"Videos:\n{video_lines}"
                )
            except Exception as e:
                video_summaries.append(f"### YouTube: {url}\n[Error: {e}]")

    if not all_pdf_chunks and not all_video_items:
        raise HTTPException(status_code=400, detail="No valid materials provided.")

    # ── 3. Semantic Clustering (if both types exist) ─────────────────────
    topic_groups = None
    has_both = len(all_pdf_chunks) > 0 and len(all_video_items) > 0

    if has_both:
        try:
            clustering = ClusteringService(similarity_threshold=0.40)
            topic_groups = clustering.build_topic_groups(all_pdf_chunks, all_video_items)
        except Exception as e:
            print(f"[WARN] Clustering failed, falling back to plain summary: {e}")
            topic_groups = None

    # ── 4. Build materials summary for Planner ───────────────────────────
    if topic_groups:
        # Semantic-grouped summary
        group_parts = []
        for i, g in enumerate(topic_groups, 1):
            part = f"### Topic {i}: {g['topic_label']}\n"
            part += f"Estimated study time: ~{g['estimated_minutes']} minutes\n"

            if g["pdf_resources"]:
                for pr in g["pdf_resources"]:
                    part += f"- PDF Resource: {pr['filename']} ({pr['page_range']})\n"
                    part += f"  Preview: {pr['text_preview'][:200]}...\n"

            if g["video_resources"]:
                for vr in g["video_resources"]:
                    part += f"- Video Resource: {vr['title']} (URL: {vr['url']}, {vr['duration_minutes']}min)\n"

            group_parts.append(part)

        materials_summary = (
            "## SEMANTICALLY GROUPED TOPICS\n"
            "The following topics have been pre-grouped by semantic similarity. "
            "PDF and Video resources under the same topic cover the SAME subject.\n"
            "When scheduling, pair the PDF reading and video watching for the same topic "
            "on the SAME DAY so the student gets both perspectives.\n\n"
            + "\n\n".join(group_parts)
        )
    else:
        # Fallback: plain summary (e.g. only PDFs or only videos)
        materials_summary = "\n\n".join(pdf_summaries + video_summaries)

    # ── 5. Build constraints ─────────────────────────────────────────────
    constraints = {"mode": mode}
    if mode == "daily_hours" and daily_hours:
        constraints["daily_hours"] = float(daily_hours)
    elif mode == "target_date" and target_date:
        constraints["target_date"] = target_date
    else:
        raise HTTPException(status_code=400, detail="Provide daily_hours or target_date.")

    # ── 6. Generate roadmap ──────────────────────────────────────────────
    try:
        roadmap = planner_service.generate_roadmap(materials_summary, constraints)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    return {
        "roadmap": roadmap,
        "materials_count": len(all_pdf_chunks) + len(all_video_items),
        "semantic_groups": len(topic_groups) if topic_groups else 0,
    }

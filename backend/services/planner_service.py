import os
import json
from openai import OpenAI


class PlannerService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if self.api_key and self.api_key != "your_openai_api_key_here":
            self.client = OpenAI(api_key=self.api_key)
        else:
            self.client = None

    def generate_roadmap(self, materials_summary: str, target_date: str | None = None, strict_mode: bool = True, granularity: str = "macro") -> dict:
        """
        Generates a flat, ordered roadmap from pre-grouped study materials.
        target_date is stored but not used for scheduling yet.
        """
        if not self.client:
            raise ValueError("OpenAI API Key is missing or invalid.")

        system_prompt = f"""\
You are an expert AI Study Planner. You receive pre-grouped Study Units where each unit contains:
  1. A PDF to study FIRST (primary material)
  2. Related YouTube videos to watch AFTER the PDF (reinforcement)

Your job: produce a clean, flat, ordered list of ALL resources in the correct study sequence.

Return ONLY valid JSON matching this schema exactly:
{{
  "title": "string — a descriptive overall roadmap title",
  "total_estimated_hours": number,
  "resources": [
    {{
      "order": 1,
      "type": "pdf" or "video",
      "title": "string — short descriptive topic name (NOT the filename)",
      "pdf_name": "string — exact filename (only if type=pdf, else null)",
      "youtube_url": "string — exact YouTube URL (only if type=video, else null)",
      "topics": ["string", ...],
      "estimated_minutes": number,
      "is_optional": boolean
    }}
  ]
}}

RULES:
1. ORDERING: Follow the Unit sequence. Within each unit: PDF comes first, then its related videos.
{"2. EXHAUSTIVE: strictly include EVERY single PDF and EVERY single video. Never skip or merge. If a video is too detailed or not core, include it but mark 'is_optional': true." if strict_mode else "2. OPTIMIZATION: feel free to skip redundant or fluff videos. Focus only on the most critical paths and drop unnecessary content. You can still mark non-essential but good-to-have items as 'is_optional': true."}
3. CONTINUATION: If PDFs run out, continue with remaining videos. If videos run out, continue with remaining PDFs.
4. For PDF resources:
   - pdf_name must be the EXACT filename as provided.
   - topics: list 4-6 key concepts from that PDF.
5. For video resources:
   - youtube_url must be the EXACT URL from the summary.
{"   - topics: Break the video down into highly detailed, timestamp-like micro-topics. Split long videos into multiple resources if needed." if granularity == "micro" else "   - topics: list 3-5 concepts covered in the video. Treat videos as whole resources."}
6. Titles must be DESCRIPTIVE TOPIC NAMES, not filenames.
7. order must be a sequential integer starting from 1.
"""

        user_prompt = f"## Study Materials (Pre-Grouped by Topic):\n\n{materials_summary}"
        if target_date:
            user_prompt += f"\n\n## Note: Student's target finish date: {target_date} (for reference only)"

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )

        return json.loads(response.choices[0].message.content)

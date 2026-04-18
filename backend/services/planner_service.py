import os
import json
from datetime import date
from openai import OpenAI

class PlannerService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if self.api_key and self.api_key != "your_openai_api_key_here":
            self.client = OpenAI(api_key=self.api_key)
        else:
            self.client = None

    def generate_roadmap(self, materials_summary: str, constraints: dict) -> dict:
        """
        Generates a study roadmap from a structured summary of all materials.

        constraints can be:
          - {"mode": "daily_hours", "daily_hours": 2}       → AI creates a schedule with that hours/day
          - {"mode": "target_date", "target_date": "2025-10-15"} → AI determines optimal daily hours
        """
        if not self.client:
            raise ValueError("OpenAI API Key is missing or invalid.")

        # Build the constraint description
        today = date.today().isoformat()
        if constraints.get("mode") == "daily_hours":
            limit_info = (
                f"The student can study {constraints['daily_hours']} hours per day. "
                f"Today is {today}. Please distribute the topics across days accordingly and tell them when they will finish."
            )
        elif constraints.get("mode") == "target_date":
            limit_info = (
                f"The student wants to finish ALL materials by {constraints['target_date']}. "
                f"Today is {today}. Calculate how many hours per day they need to study and distribute topics optimally. "
                f"Include the recommended daily_hours in the output."
            )
        else:
            limit_info = f"Plan at a relaxed pace. Today is {today}."

        system_prompt = """\
You are an expert AI Study Planner. You receive study materials that may be SEMANTICALLY GROUPED — 
meaning a PDF section and a YouTube video under the same topic cover the SAME subject matter.
Create a detailed, realistic DAY-BY-DAY learning schedule.

IMPORTANT: When materials are grouped by topic, schedule the PDF reading AND the related video 
on the SAME DAY so the student gets complementary perspectives on each subject.

Return ONLY valid JSON matching this schema exactly:
{
  "title": "string",
  "total_estimated_hours": number,
  "recommended_daily_hours": number,
  "estimated_finish_date": "YYYY-MM-DD",
  "days": [
    {
      "day": 1,
      "total_hours": number,
      "resources": [
        {
          "type": "pdf" or "video",
          "title": "string (short descriptive name for this study block)",
          "pdf_name": "string (exact filename, only if type=pdf, else null)",
          "page_range": "string (e.g. 'Pages 1-40', only if type=pdf, else null)",
          "youtube_url": "string (full URL, only if type=video, else null)",
          "topics": ["string", ...],
          "estimated_minutes": number
        }
      ]
    }
  ]
}

CRITICAL RULES:
1. Each object in the 'days' array represents ONE calendar day. A day contains multiple resources.
2. INTERLEAVE resource types within each day. Do NOT put all PDFs on early days and all videos on later days. Mix them within the same day when possible.
3. EXHAUSTIVE INCLUSION: You MUST include EVERY SINGLE video and EVERY SINGLE PDF mentioned in the summary. Do NOT skip, summarize, or group videos together to save space. Every single provided video must be a distinct resource in the roadmap.
4. CONTINUATION: If you run out of one type of material (e.g., PDFs are finished), you MUST continue mapping the remaining resources of the other type (e.g., all the remaining videos) into subsequent days until 100% of the materials are mapped.
5. For PDF resources:
   - 'pdf_name' MUST exactly match the filename provided in the summary (e.g. "1-programming.pdf").
   - 'page_range' MUST specify which pages to study (e.g. "Pages 1-40").
   - 'topics' should list the key concepts/sections within those pages (these appear in the sidebar when clicked).
6. For video resources:
   - 'youtube_url' must be the exact video URL from the summary.
   - 'topics' should list the key concepts covered in the video.
7. Distribute workload evenly across days based on the student's available hours.
8. If target_date is set, calculate recommended_daily_hours accordingly.
9. Keep resource titles SHORT. Do not repeat the filename — use a descriptive topic name instead.
"""

        user_prompt = f"## Study Materials Summary:\n\n{materials_summary}\n\n## Student Constraints:\n{limit_info}"

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        return json.loads(response.choices[0].message.content)

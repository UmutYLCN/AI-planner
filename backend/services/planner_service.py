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
You are an expert AI Study Planner. Given a summary of study materials (PDFs and/or YouTube videos), 
create a detailed, realistic learning roadmap.

Return ONLY valid JSON matching this schema exactly:
{
  "title": "string",
  "total_estimated_hours": number,
  "recommended_daily_hours": number,
  "estimated_finish_date": "YYYY-MM-DD",
  "modules": [
    {
      "module_name": "string",
      "estimated_hours": number,
      "topics": ["string", ...],
      "suggested_schedule": "string (e.g. Day 1-3 or Week 1)",
      "youtube_url": "string (URL of the primary video for this module, or null if text/PDF based)"
    }
  ]
}

Rules:
- Group logically related topics into modules (not one module per video/chapter).
- Be realistic with time estimates based on content volume.
- suggested_schedule should be human-readable day or week ranges.
- If a module is primarily based on a YouTube video from the summary, assign its exact URL to youtube_url.
- If the user gave a target date, set recommended_daily_hours to your calculated value.
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

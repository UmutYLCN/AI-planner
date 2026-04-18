"""
TranscriptService — YouTube videolarının altyazılarını çeker.
Bu sayede video başlığı yerine videonun *gerçek içeriğini* analiz edebiliriz.
"""
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)


class TranscriptService:
    @staticmethod
    def get_transcript(video_id: str, max_chars: int = 5000) -> str | None:
        """
        Fetch the transcript of a YouTube video.
        Returns a condensed text string, or None if unavailable.
        Tries English first, then any available language.
        """
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

            # Priority: manual EN → auto EN → any available
            transcript = None
            try:
                transcript = transcript_list.find_manually_created_transcript(["en"])
            except NoTranscriptFound:
                try:
                    transcript = transcript_list.find_generated_transcript(["en"])
                except NoTranscriptFound:
                    # Grab whatever is available
                    for t in transcript_list:
                        transcript = t
                        break

            if transcript is None:
                return None

            entries = transcript.fetch()
            full_text = " ".join(entry["text"] for entry in entries)

            # Cap length to keep embedding costs low
            if len(full_text) > max_chars:
                full_text = full_text[:max_chars]

            return full_text

        except (TranscriptsDisabled, VideoUnavailable, Exception):
            return None

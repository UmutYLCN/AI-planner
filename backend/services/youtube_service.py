import re
from googleapiclient.discovery import build
import os

def extract_video_id(url: str) -> str:
    """Extracts the YouTube video ID from a URL."""
    pattern = r'(?:v=|youtu\.be\/|\/embed\/|\/v\/|\/watch\?v=)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    return match.group(1) if match else None

def extract_playlist_id(url: str) -> str:
    """Extracts the YouTube playlist ID from a URL."""
    pattern = r'[?&]list=([^#&?]+)'
    match = re.search(pattern, url)
    return match.group(1) if match else None

class YouTubeService:
    def __init__(self):
        self.api_key = os.getenv("YOUTUBE_API_KEY")
        if self.api_key and self.api_key != "your_youtube_api_key_here":
            self.youtube = build('youtube', 'v3', developerKey=self.api_key)
        else:
            self.youtube = None

    def get_video_details(self, video_id: str) -> dict:
        """Fetches title and duration for a single video using the API."""
        if not self.youtube:
            raise ValueError("YouTube API Key is required.")

        response = self.youtube.videos().list(
            part="snippet,contentDetails",
            id=video_id
        ).execute()

        if not response.get("items"):
            return {"id": video_id, "title": f"Video {video_id}", "duration_minutes": 10}

        item = response["items"][0]
        title = item["snippet"]["title"]
        duration_iso = item["contentDetails"]["duration"]  # e.g. PT1H2M30S

        # Parse ISO 8601 duration
        minutes = self._parse_duration_to_minutes(duration_iso)
        return {"id": video_id, "title": title, "duration_minutes": minutes}

    def get_videos_from_playlist(self, playlist_id: str) -> list:
        """Fetches all video IDs from a playlist."""
        if not self.youtube:
            raise ValueError("YouTube API Key is required for playlist extraction.")

        video_ids = []
        request = self.youtube.playlistItems().list(
            part="contentDetails",
            playlistId=playlist_id,
            maxResults=50
        )

        while request:
            response = request.execute()
            for item in response["items"]:
                video_ids.append(item["contentDetails"]["videoId"])
            request = self.youtube.playlistItems().list_next(request, response)

        return video_ids

    def process_url(self, url: str) -> list:
        """
        Process a YouTube URL (single video or playlist).
        Returns a list of video detail dicts: [{id, title, duration_minutes}]
        """
        playlist_id = extract_playlist_id(url)
        if playlist_id:
            video_ids = self.get_videos_from_playlist(playlist_id)
            videos = []
            for vid_id in video_ids:
                details = self.get_video_details(vid_id)
                videos.append(details)
            return videos

        video_id = extract_video_id(url)
        if video_id:
            return [self.get_video_details(video_id)]

        raise ValueError(f"Invalid YouTube URL: {url}")

    @staticmethod
    def _parse_duration_to_minutes(duration: str) -> float:
        """Convert ISO 8601 duration (PT1H2M30S) to total minutes."""
        pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
        match = re.match(pattern, duration)
        if not match:
            return 10  # default fallback
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        return round(hours * 60 + minutes + seconds / 60, 1)

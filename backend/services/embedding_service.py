"""
EmbeddingService — OpenAI text-embedding-3-small kullanarak
PDF'ler ve Video transcript'lerini vektöre dönüştürür.
ClusteringService — Her PDF'i ilgili videolarla eşleştirir.

Yeni Kurgu:
  PDF bütün olarak ele alınır (parçalanmaz).
  Her videonun hangi PDF'e en çok benzediği bulunur.
  Sonuç: PDF1 → [Video A, Video C], PDF2 → [Video B, Video D], ...
"""
import os
import numpy as np
from openai import OpenAI


class EmbeddingService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = "text-embedding-3-small"

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts and return their vectors."""
        if not self.client:
            raise ValueError("OPENAI_API_KEY is not set.")
        if not texts:
            return []
        # Clean empty strings
        clean = [t if t.strip() else "empty" for t in texts]
        response = self.client.embeddings.create(
            model=self.model,
            input=clean,
        )
        return [item.embedding for item in response.data]

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        a_arr, b_arr = np.array(a), np.array(b)
        norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
        if norm == 0:
            return 0.0
        return float(np.dot(a_arr, b_arr) / norm)


class ClusteringService:
    """
    Her tam PDF'i bir ünite olarak ele alır.
    Her videoyu, en benzer PDF'e atar.
    Eşleşemeyen videolar "Ek Videolar" grubuna düşer.
    """

    def __init__(self, similarity_threshold: float = 0.35):
        self.threshold = similarity_threshold
        self.embedding_service = EmbeddingService()

    def build_topic_groups(
        self,
        pdf_items: list[dict],    # [{filename, num_pages, word_count, estimated_study_hours, text_summary}]
        video_items: list[dict],  # [{id, title, url, duration_minutes, transcript}]
    ) -> list[dict]:
        """
        1. Embed each whole PDF and each video
        2. Assign each video to its best-matching PDF
        3. Return ordered groups: PDF1 + videos, PDF2 + videos, leftover videos

        Returns: [
            {
                "topic_label": "PDF filename or topic",
                "pdf": {filename, num_pages, word_count, estimated_study_hours} or None,
                "videos": [{id, title, url, duration_minutes}, ...],
                "estimated_minutes": int,
            }
        ]
        """
        # ── 1. Prepare texts ──────────────────────────────────────────────
        pdf_texts = [p.get("text_summary", "")[:3000] for p in pdf_items]
        video_texts = [
            (v.get("transcript") or v["title"])[:2000]
            for v in video_items
        ]

        if not pdf_texts and not video_texts:
            return []

        # ── 2. Embed everything ───────────────────────────────────────────
        all_texts = pdf_texts + video_texts
        all_embeddings = self.embedding_service.embed_texts(all_texts)

        pdf_embs = all_embeddings[:len(pdf_texts)]
        vid_embs = all_embeddings[len(pdf_texts):]

        # ── 3. Assign each video to best PDF ──────────────────────────────
        # pdf_video_map[pdf_idx] = [video_idx, ...]
        pdf_video_map: dict[int, list[int]] = {i: [] for i in range(len(pdf_items))}
        unmatched_videos: list[int] = []

        for vi, v_emb in enumerate(vid_embs):
            best_pi = -1
            best_sim = -1.0

            for pi, p_emb in enumerate(pdf_embs):
                sim = EmbeddingService.cosine_similarity(p_emb, v_emb)
                if sim > best_sim:
                    best_sim = sim
                    best_pi = pi

            if best_sim >= self.threshold and best_pi >= 0:
                pdf_video_map[best_pi].append(vi)
            else:
                unmatched_videos.append(vi)

        # ── 4. Build ordered groups: PDF → related videos ─────────────────
        groups = []

        for pi, pdf in enumerate(pdf_items):
            matched_vids = [video_items[vi] for vi in pdf_video_map[pi]]
            video_minutes = sum(v["duration_minutes"] for v in matched_vids)
            pdf_minutes = pdf.get("estimated_study_hours", 1) * 60

            groups.append({
                "topic_label": pdf["filename"],
                "pdf": {
                    "filename": pdf["filename"],
                    "num_pages": pdf["num_pages"],
                    "word_count": pdf["word_count"],
                    "estimated_study_hours": pdf["estimated_study_hours"],
                },
                "videos": [
                    {
                        "id": v["id"],
                        "title": v["title"],
                        "url": v["url"],
                        "duration_minutes": v["duration_minutes"],
                    }
                    for v in matched_vids
                ],
                "estimated_minutes": int(pdf_minutes + video_minutes),
            })

        # ── 5. Unmatched videos go into a final group ─────────────────────
        if unmatched_videos:
            leftover = [video_items[vi] for vi in unmatched_videos]
            groups.append({
                "topic_label": "Additional Video Lessons",
                "pdf": None,
                "videos": [
                    {
                        "id": v["id"],
                        "title": v["title"],
                        "url": v["url"],
                        "duration_minutes": v["duration_minutes"],
                    }
                    for v in leftover
                ],
                "estimated_minutes": int(sum(v["duration_minutes"] for v in leftover)),
            })

        return groups

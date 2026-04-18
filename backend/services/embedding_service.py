"""
EmbeddingService — OpenAI text-embedding-3-small kullanarak
PDF chunk'ları ve Video transcript'leri vektöre dönüştürür.
Ardından cosine similarity ile anlamsal eşleştirme yapar.
"""
import os
import numpy as np
from openai import OpenAI


class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = "text-embedding-3-small"

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts and return their vectors."""
        # OpenAI allows up to 2048 items per batch
        response = self.client.embeddings.create(
            model=self.model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        a_arr = np.array(a)
        b_arr = np.array(b)
        return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))


class ClusteringService:
    """
    Given embedded PDF chunks and video transcripts,
    groups them into TopicGroups based on semantic similarity.
    """

    def __init__(self, similarity_threshold: float = 0.45):
        self.threshold = similarity_threshold
        self.embedding_service = EmbeddingService()

    def build_topic_groups(
        self,
        pdf_chunks: list[dict],   # [{filename, page_start, page_end, text, word_count}]
        video_items: list[dict],  # [{id, title, url, duration_minutes, transcript}]
    ) -> list[dict]:
        """
        1. Embed all chunks and transcripts
        2. Match each video to its most similar PDF chunk (and vice versa)
        3. Build TopicGroups that pair related resources together

        Returns: [
            {
                "topic_label": "...",
                "pdf_resources": [{filename, page_range, text_preview, word_count}],
                "video_resources": [{id, title, url, duration_minutes}],
                "estimated_minutes": int,
            }
        ]
        """
        # ── 1. Prepare texts for embedding ────────────────────────────────
        pdf_texts = []
        for chunk in pdf_chunks:
            pdf_texts.append(chunk["text"][:2000])  # trim for embedding cost

        video_texts = []
        for vid in video_items:
            # Use transcript if available, fallback to title
            text = vid.get("transcript") or vid["title"]
            video_texts.append(text[:2000])

        if not pdf_texts and not video_texts:
            return []

        # ── 2. Embed everything in one batch ──────────────────────────────
        all_texts = pdf_texts + video_texts
        all_embeddings = self.embedding_service.embed_texts(all_texts)

        pdf_embeddings = all_embeddings[:len(pdf_texts)]
        video_embeddings = all_embeddings[len(pdf_texts):]

        # ── 3. Build similarity matrix and create groups ──────────────────
        groups = []
        used_pdfs = set()
        used_videos = set()

        # Strategy: For each PDF chunk, find the best matching video
        if pdf_embeddings and video_embeddings:
            for pi, p_emb in enumerate(pdf_embeddings):
                best_vi = -1
                best_sim = -1
                for vi, v_emb in enumerate(video_embeddings):
                    if vi in used_videos:
                        continue
                    sim = EmbeddingService.cosine_similarity(p_emb, v_emb)
                    if sim > best_sim:
                        best_sim = sim
                        best_vi = vi

                if best_sim >= self.threshold and best_vi >= 0:
                    # Matched pair!
                    chunk = pdf_chunks[pi]
                    vid = video_items[best_vi]
                    groups.append({
                        "topic_label": vid["title"],  # Use video title as label
                        "pdf_resources": [{
                            "filename": chunk["filename"],
                            "page_range": f"Pages {chunk['page_start']}-{chunk['page_end']}",
                            "text_preview": chunk["text"][:300],
                            "word_count": chunk["word_count"],
                        }],
                        "video_resources": [{
                            "id": vid["id"],
                            "title": vid["title"],
                            "url": vid["url"],
                            "duration_minutes": vid["duration_minutes"],
                        }],
                        "estimated_minutes": int(vid["duration_minutes"] + chunk["word_count"] / 250),
                    })
                    used_pdfs.add(pi)
                    used_videos.add(best_vi)
                else:
                    # Unmatched PDF chunk — standalone
                    chunk = pdf_chunks[pi]
                    groups.append({
                        "topic_label": f"{chunk['filename']} (p.{chunk['page_start']}-{chunk['page_end']})",
                        "pdf_resources": [{
                            "filename": chunk["filename"],
                            "page_range": f"Pages {chunk['page_start']}-{chunk['page_end']}",
                            "text_preview": chunk["text"][:300],
                            "word_count": chunk["word_count"],
                        }],
                        "video_resources": [],
                        "estimated_minutes": int(chunk["word_count"] / 250),
                    })
                    used_pdfs.add(pi)

        # Add any remaining unmatched PDFs
        for pi, chunk in enumerate(pdf_chunks):
            if pi not in used_pdfs:
                groups.append({
                    "topic_label": f"{chunk['filename']} (p.{chunk['page_start']}-{chunk['page_end']})",
                    "pdf_resources": [{
                        "filename": chunk["filename"],
                        "page_range": f"Pages {chunk['page_start']}-{chunk['page_end']}",
                        "text_preview": chunk["text"][:300],
                        "word_count": chunk["word_count"],
                    }],
                    "video_resources": [],
                    "estimated_minutes": int(chunk["word_count"] / 250),
                })

        # Add any remaining unmatched videos
        for vi, vid in enumerate(video_items):
            if vi not in used_videos:
                groups.append({
                    "topic_label": vid["title"],
                    "pdf_resources": [],
                    "video_resources": [{
                        "id": vid["id"],
                        "title": vid["title"],
                        "url": vid["url"],
                        "duration_minutes": vid["duration_minutes"],
                    }],
                    "estimated_minutes": int(vid["duration_minutes"]),
                })

        return groups

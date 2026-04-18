from io import BytesIO
import pypdf


class PDFService:
    def extract_text(self, file_bytes: bytes) -> dict:
        """Extract raw text and metadata from a PDF bytes stream."""
        pdf_file = BytesIO(file_bytes)
        reader = pypdf.PdfReader(pdf_file)

        full_text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                full_text += extracted + "\n\n"

        if not full_text.strip():
            raise ValueError("No extractable text found in this PDF.")

        num_pages = len(reader.pages)
        # Rough word count and estimated reading time
        word_count = len(full_text.split())
        estimated_read_hours = round(word_count / 15000, 1)  # ~15k words per study hour

        return {
            "type": "pdf",
            "num_pages": num_pages,
            "word_count": word_count,
            "estimated_study_hours": estimated_read_hours,
            "text_content": full_text[:20000]  # cap for LLM context
        }

    def extract_chunks(self, file_bytes: bytes, chunk_size: int = 3) -> list[dict]:
        """
        Split a PDF into page-range chunks for embedding.
        Each chunk covers `chunk_size` pages and contains extracted text.
        Returns: [{page_start, page_end, text, word_count}]
        """
        pdf_file = BytesIO(file_bytes)
        reader = pypdf.PdfReader(pdf_file)
        num_pages = len(reader.pages)
        chunks = []

        for start in range(0, num_pages, chunk_size):
            end = min(start + chunk_size, num_pages)
            text = ""
            for i in range(start, end):
                extracted = reader.pages[i].extract_text()
                if extracted:
                    text += extracted + "\n"

            if text.strip():
                chunks.append({
                    "page_start": start + 1,  # 1-indexed for display
                    "page_end": end,
                    "text": text.strip()[:4000],  # cap per chunk for embedding
                    "word_count": len(text.split()),
                })

        return chunks

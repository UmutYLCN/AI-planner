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

from io import BytesIO
import pypdf


class PDFService:
    def extract_text(self, file_bytes: bytes) -> dict:
        """
        Extract full text and metadata from a PDF.
        Returns the entire content as one study unit — no chunking needed.
        """
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
        word_count = len(full_text.split())
        # ~250 words/min reading + ~60% for note-taking
        estimated_study_hours = round(word_count / 9000, 1)

        return {
            "type": "pdf",
            "num_pages": num_pages,
            "word_count": word_count,
            "estimated_study_hours": estimated_study_hours,
            "text_content": full_text[:20000],  # cap for embedding + LLM context
        }

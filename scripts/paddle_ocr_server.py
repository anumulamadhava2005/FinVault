#!/usr/bin/env python3
"""
PaddleOCR 3.0 HTTP server for FinVault bill scanning.

Usage
-----
# Install once
pip install paddleocr fastapi "uvicorn[standard]" pillow

# Run (auto-reloads on file change during development)
uvicorn scripts.paddle_ocr_server:app --host 0.0.0.0 --port 8000 --reload

# Or run directly
python scripts/paddle_ocr_server.py

The server exposes two endpoints:
  POST /ocr     – Recognise text in a base64-encoded image.
  GET  /health  – Liveness probe (returns engine name + status).

Request body (POST /ocr)
------------------------
{
  "image": "<base64-encoded JPEG or PNG>"
}

Response (POST /ocr)
--------------------
{
  "text":       "full recognised text, one line per OCR result",
  "lines":      [{"text": "...", "confidence": 0.98}, ...],
  "line_count": 12
}
"""

import base64
import io
import logging
import os
import sys
import tempfile
from typing import List

# ── Graceful import guard ─────────────────────────────────────────────────────
try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from PIL import Image
    from paddleocr import PaddleOCR
except ImportError as e:
    print(
        f"\n[paddle_ocr_server] Missing dependency: {e}\n"
        "Run:  pip install paddleocr fastapi \"uvicorn[standard]\" pillow\n"
    )
    sys.exit(1)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("paddle_ocr_server")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="FinVault PaddleOCR", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # restrict to your LAN IP in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── PaddleOCR engine (initialised once at startup) ────────────────────────────
# use_angle_cls=True  → corrects rotated text (common on receipt photos)
# lang='en'           → primary language; PaddleOCR 3 auto-detects script anyway
# show_log=False      → suppress the verbose PaddlePaddle training log
log.info("Initialising PaddleOCR 3.0 — first run downloads model weights (~300 MB)…")
_ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
log.info("PaddleOCR ready.")


# ── Request / response models ─────────────────────────────────────────────────
class OcrRequest(BaseModel):
    image: str  # base64-encoded JPEG / PNG bytes


class OcrLine(BaseModel):
    text: str
    confidence: float


class OcrResponse(BaseModel):
    text: str
    lines: List[OcrLine]
    line_count: int


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.post("/ocr", response_model=OcrResponse)
async def recognise(req: OcrRequest) -> OcrResponse:
    """
    Decode the base64 image, run PaddleOCR, and return all detected text lines
    with individual confidence scores.  Lines below 0.4 confidence are omitted
    (typically noise or partial characters at image borders).
    """
    # Decode base64 → raw bytes → PIL Image → JPEG temp file
    try:
        img_bytes = base64.b64decode(req.image)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            img.save(f, "JPEG", quality=95)
            tmp_path = f.name

        # PaddleOCR 3.0 result structure:
        #   result → list[page] → list[item]
        #   item   → [bounding_box, (text_str, confidence_float)]
        result = _ocr.ocr(tmp_path, cls=True)

        lines: list[OcrLine] = []
        for page in result or []:
            for item in page or []:
                if not item or len(item) < 2:
                    continue
                text_tuple = item[1]
                if not text_tuple or len(text_tuple) < 2:
                    continue
                text, conf = str(text_tuple[0]).strip(), float(text_tuple[1])
                if text and conf >= 0.4:
                    lines.append(OcrLine(text=text, confidence=round(conf, 4)))

        full_text = "\n".join(ln.text for ln in lines)
        log.info("OCR done — %d lines, %d chars", len(lines), len(full_text))
        return OcrResponse(text=full_text, lines=lines, line_count=len(lines))

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "engine": "PaddleOCR 3.0"}


# ── Dev entry-point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn  # type: ignore
    uvicorn.run("scripts.paddle_ocr_server:app", host="0.0.0.0", port=8000, reload=True)

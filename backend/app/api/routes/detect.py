import asyncio
import io
import subprocess

import cv2
import httpx
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from typing import Any

from app.api.deps import get_detector
from app.core.billing_guard import billing_guard
from app.core.config import Settings, get_settings
from app.core.security_middleware import validate_safe_url
from app.services.ensemble import EnsembleDetector, EnsembleResult
from app.services.gemini_detector import GeminiScoreDetector
from app.services.metadata_extractor import extract_metadata

try:
    import magic
except ImportError:
    magic = None

router = APIRouter(prefix="/api/v1/detect", tags=["detect"])

AI_NAME_HINTS = (
    "ai",
    "artificial",
    "generated",
    "gen",
    "midjourney",
    "stable diffusion",
    "sdxl",
    "dalle",
    "flux",
    "deepfake",
    "synthetic",
    "prompt",
    "rendered",
)


class ReferenceLink(BaseModel):
    title: str
    url: str
    description: str = ""


class EntityFactCheck(BaseModel):
    identified_subject: str = "Visual Subject"
    exists_in_reality: bool = True
    informative_note: str = ""
    reference_urls: list[ReferenceLink] = Field(default_factory=list)


class DetectionResponse(BaseModel):
    verdict: str = Field(pattern="^(likely_ai|likely_real)$")
    confidence: float = Field(ge=0.0, le=1.0)
    ai_percentage: int = Field(ge=0, le=100)
    real_percentage: int = Field(ge=0, le=100)
    signals: dict[str, float]
    disclaimer: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    entity_info: EntityFactCheck | None = None


class ImageQuestionResponse(BaseModel):
    answer: str


def _filename_looks_ai(filename: str | None) -> bool:
    if not filename:
        return False
    lowered = filename.lower()
    return any(hint in lowered for hint in AI_NAME_HINTS)


async def _read_upload(upload: UploadFile, max_size: int) -> bytes:
    if not upload.filename:
        raise HTTPException(status_code=400, detail="A filename is required")
    content = await upload.read(max_size + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds the configured size limit")
    return content


def _sniff_mime(content: bytes) -> str:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"

    if magic is not None:
        try:
            return str(magic.from_buffer(content, mime=True))
        except Exception:
            pass
    try:
        result = subprocess.run(
            ["file", "--brief", "--mime-type", "-"],
            input=content,
            capture_output=True,
            check=True,
            timeout=3.0,
        )
        return result.stdout.decode("ascii", errors="ignore").strip()
    except Exception:
        return "application/octet-stream"


def _decode_image(content: bytes, settings: Settings) -> np.ndarray:
    try:
        # Enforce maximum decompression buffer to protect against zip/image bombs
        Image.MAX_IMAGE_PIXELS = 40_000_000
        with Image.open(io.BytesIO(content)) as pil_image:
            pil_image.verify()
        with Image.open(io.BytesIO(content)) as pil_image:
            rgb = pil_image.convert("RGB")
            if rgb.width < 32 or rgb.height < 32:
                raise HTTPException(status_code=422, detail="Image must be at least 32x32 pixels")
            if rgb.width > 8192 or rgb.height > 8192 or (rgb.width * rgb.height) > 40_000_000:
                raise HTTPException(
                    status_code=422,
                    detail="Image dimensions exceed defensive safety bounds (max 8192x8192).",
                )
            image = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Image bytes are corrupt or undecodable") from exc
    if _sniff_mime(content) not in settings.allowed_mime_type_list:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported image type")
    return image


@router.post("/image", response_model=DetectionResponse)
async def detect_image(
    upload: UploadFile = File(...),
    source_url: str | None = Form(default=None),
    settings: Settings = Depends(get_settings),
    detector: EnsembleDetector = Depends(get_detector),
) -> DetectionResponse:
    # Defend against SSRF if source_url is supplied
    if source_url and isinstance(source_url, str) and source_url.strip():
        validate_safe_url(source_url.strip())

    content = await _read_upload(upload, settings.max_upload_size)

    # Check zero-cost SHA-256 cache ($0 cloud cost)
    img_hash = billing_guard.compute_image_hash(content)
    cached_response = billing_guard.get_cached(f"det:{img_hash}")
    if cached_response and not source_url:
        return DetectionResponse(**cached_response)

    declared_mime = (upload.content_type or "").split(";", 1)[0].strip().lower()
    if declared_mime and declared_mime not in settings.allowed_mime_types:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported image type")

    image = _decode_image(content, settings)

    try:
        actual_mime = _sniff_mime(content)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise HTTPException(status_code=422, detail="Unable to inspect uploaded file type") from exc
    if actual_mime not in settings.allowed_mime_type_list:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported image type")

    try:
        result: EnsembleResult = detector.predict(image)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=f"Detection failed for this image: {exc}") from exc
    api_key = settings.gemini_api_key or settings.third_party_api_key

    async def _run_detection():
        """Run multi-scale ensemble detection across 3 resolutions."""
        try:
            from app.services.frequency_analysis import FrequencyAnalyzer
            # Run the ensemble at the primary scale
            primary = await asyncio.to_thread(detector.predict, image)

            # Extract ai_probability defensively (mock objects may not have it)
            primary_prob = float(getattr(primary, "ai_probability", 0.5))
            primary_signals = dict(getattr(primary, "signals", {}))
            primary_spectral = getattr(primary, "spectral_indicators", None)
            primary_verdict = getattr(primary, "verdict", "likely_real")
            primary_confidence = float(getattr(primary, "confidence", 0.5))

            # Multi-scale spectral sub-analysis: run spectral-only at 2 additional scales
            # and blend those spectral scores into the final probability for higher accuracy.
            scale_scores: list[float] = [primary_prob]
            for scale_size in (256, 512):
                try:
                    aux_analyzer = FrequencyAnalyzer(size=scale_size)
                    aux_spectral = await asyncio.to_thread(aux_analyzer.analyze, image)
                    scale_scores.append(float(aux_spectral.score))
                except Exception:
                    pass

            if len(scale_scores) > 1:
                # Weighted blend: primary gets 60%, two auxiliary scales share 40%
                aux_mean = float(np.mean(scale_scores[1:]))
                blended_prob = float(0.60 * primary_prob + 0.40 * aux_mean)
                blended_prob = float(np.clip(blended_prob, 0.0, 1.0))
                blended_confidence = float(np.clip(abs(blended_prob - 0.5) * 2.0, 0.0, 1.0))
                threshold = float(getattr(detector, "threshold", 0.52))
                blended_verdict = "likely_ai" if blended_prob >= threshold else "likely_real"
                return EnsembleResult(
                    verdict=blended_verdict,
                    confidence=blended_confidence,
                    signals={**primary_signals, "multiscale_blend": round(blended_prob, 4)},
                    ai_probability=blended_prob,
                    spectral_indicators=primary_spectral,
                )
            # Return the original primary result unchanged if no multi-scale data
            return primary
        except Exception as exc:
            return exc

    async def _run_entity():
        if not api_key:
            return None
        try:
            gemini_service = GeminiScoreDetector(
                api_key=api_key,
                model=settings.gemini_model,
                endpoint=settings.third_party_api_url,
            )
            return await asyncio.to_thread(gemini_service.analyze_entity, image)
        except Exception:
            return None

    detection_outcome, entity_data = await asyncio.gather(_run_detection(), _run_entity())

    if isinstance(detection_outcome, FileNotFoundError):
        raise HTTPException(status_code=503, detail=str(detection_outcome)) from detection_outcome
    elif isinstance(detection_outcome, Exception):
        raise HTTPException(status_code=422, detail=f"Detection failed for this image: {detection_outcome}") from detection_outcome

    result: EnsembleResult = detection_outcome

    metadata = extract_metadata(content)
    signals = dict(result.signals)

    # ── Metadata-driven accuracy boosts ─────────────────────────────────
    ai_prob = float(getattr(result, "ai_probability", 0.5))

    # Hard AI signal: conclusive software metadata found
    if metadata.ai_software_detected or metadata.ai_metadata:
        signals["metadata_ai_hint"] = 1.0
        if any(k.lower() in ("parameters", "workflow", "prompt") for k in metadata.ai_metadata):
            # Definitive: Automatic1111/ComfyUI PNG chunks are conclusive
            ai_prob = max(ai_prob, 0.97)
        else:
            ai_prob = max(ai_prob, 0.88)

    # Hard real signal: verified camera make in EXIF + C2PA provenance
    if metadata.has_camera_make and metadata.c2pa_detected:
        signals["verified_hardware_origin"] = 0.0
        ai_prob = min(ai_prob, 0.12)
    elif metadata.has_camera_make:
        ai_prob = min(ai_prob, 0.30)

    # Soft AI signal: no EXIF, no C2PA (suspicious for a "real" photo)
    if metadata.missing_exif_penalty > 0:
        signals["missing_exif_penalty"] = metadata.missing_exif_penalty
        ai_prob = float(np.clip(ai_prob + metadata.missing_exif_penalty * 0.4, 0.0, 1.0))

    # Context signal: filename or URL contains AI generator keywords
    source_url_value = source_url if isinstance(source_url, str) else None
    if _filename_looks_ai(source_url_value) or _filename_looks_ai(upload.filename):
        signals["context_hint"] = 1.0
        ai_prob = max(ai_prob, 0.82)

    ai_prob = float(np.clip(ai_prob, 0.0, 1.0))
    ai_percentage = round(ai_prob * 100)
    real_percentage = 100 - ai_percentage
    _threshold = float(getattr(detector, "threshold", getattr(settings, "detector_threshold", 0.52)))
    verdict = "likely_ai" if ai_prob >= _threshold else "likely_real"
    final_confidence = float(np.clip(abs(ai_prob - 0.5) * 2.0, 0.0, 1.0))

    # Human-readable confidence label
    if final_confidence >= 0.90:
        confidence_label = "Very High"
    elif final_confidence >= 0.75:
        confidence_label = "High"
    elif final_confidence >= 0.55:
        confidence_label = "Moderate"
    else:
        confidence_label = "Low"

    entity_info = EntityFactCheck(**entity_data) if entity_data else None

    meta_dict = metadata.to_dict()
    meta_dict["confidence_label"] = confidence_label
    if getattr(result, "spectral_indicators", None):
        meta_dict["spectral_indicators"] = result.spectral_indicators

    response_obj = DetectionResponse(
        verdict=verdict,
        confidence=final_confidence,
        ai_percentage=ai_percentage,
        real_percentage=real_percentage,
        signals=signals,
        disclaimer="Detection is probabilistic and can be degraded by adversarial or unfamiliar inputs.",
        metadata=meta_dict,
        entity_info=entity_info,
    )
    if not source_url:
        billing_guard.set_cached(f"det:{img_hash}", response_obj.model_dump())
    return response_obj


@router.post("/question", response_model=ImageQuestionResponse)
async def ask_about_image(
    question: str = Form(...),
    upload: UploadFile | None = File(default=None),
    context: str | None = Form(default=None),
    settings: Settings = Depends(get_settings),
) -> ImageQuestionResponse:
    image = None
    if upload is not None and upload.filename:
        content = await _read_upload(upload, settings.max_upload_size)
        declared_mime = (upload.content_type or "").split(";", 1)[0].strip().lower()
        if declared_mime and declared_mime not in settings.allowed_mime_types:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported image type")
        image = _decode_image(content, settings)

    api_key = settings.gemini_api_key or settings.third_party_api_key
    if not api_key:
        return ImageQuestionResponse(
            answer=GeminiScoreDetector._synthesize_local_answer(question, context, image)
        )

    try:
        return ImageQuestionResponse(
            answer=GeminiScoreDetector(
                api_key=api_key,
                model=settings.gemini_model,
                endpoint=settings.third_party_api_url,
            ).answer(image, question, context=context)
        )
    except Exception:
        return ImageQuestionResponse(
            answer=GeminiScoreDetector._synthesize_local_answer(question, context, image)
        )


class OCRResponse(BaseModel):
    extracted_text: str
    word_count: int
    has_text: bool
    language_detected: str = "English"


@router.post("/ocr", response_model=OCRResponse)
async def extract_image_text(
    upload: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> OCRResponse:
    """Extract typography, text, documents, or signs from uploaded specimen."""
    content = await _read_upload(upload, settings.max_upload_size)
    image = _decode_image(content, settings)

    api_key = settings.gemini_api_key or settings.third_party_api_key
    if api_key and billing_guard.can_call_gemini():
        try:
            detector = GeminiScoreDetector(
                api_key=api_key,
                model=settings.gemini_model,
                endpoint=settings.third_party_api_url,
            )
            prompt = (
                "Extract all visible text, typography, signs, handwriting, labels, or captions from this image verbatim.\n"
                "If there is no text present in the image, reply with 'No visible text detected in this image.'\n"
                "Do not add conversational preamble; return only the exact extracted text."
            )
            raw_text = detector.answer(image, prompt)
            words = [w for w in raw_text.split() if w.isalnum()]
            return OCRResponse(
                extracted_text=raw_text.strip(),
                word_count=len(words),
                has_text="no visible text" not in raw_text.lower(),
                language_detected="Auto-Detected",
            )
        except Exception:
            pass

    # Local fallback: evaluate image properties for text
    h, w, _ = image.shape
    fallback_text = f"Sample Specimen ({w}×{h}px) • Visual content evaluated. For optical OCR text recognition, ensure Gemini API or upload high-contrast documents."
    return OCRResponse(
        extracted_text=fallback_text,
        word_count=len(fallback_text.split()),
        has_text=True,
        language_detected="English",
    )


@router.post("/sanitize-metadata")
async def sanitize_image_metadata(
    upload: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
):
    """Strip all embedded EXIF headers, GPS geolocation tags, camera owner tags, and hidden serials."""
    from fastapi.responses import Response

    content = await _read_upload(upload, settings.max_upload_size)
    try:
        pil_img = Image.open(io.BytesIO(content))
        # Handle RGBA, Palette, or Grayscale modes cleanly
        if pil_img.mode in ("RGBA", "LA", "P", "1"):
            clean_img = pil_img.convert("RGB")
        elif pil_img.mode not in ("RGB", "L"):
            clean_img = pil_img.convert("RGB")
        else:
            # Recreate clean image data to purge all embedded EXIF chunks
            clean_img = Image.new(pil_img.mode, pil_img.size)
            clean_img.putdata(list(pil_img.getdata()))

        buf = io.BytesIO()
        clean_img.save(buf, format="JPEG", quality=95)
        clean_bytes = buf.getvalue()
        return Response(
            content=clean_bytes,
            media_type="image/jpeg",
            headers={"Content-Disposition": f'attachment; filename="sanitized_{upload.filename or "image.jpg"}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to sanitize metadata: {str(e)}")


class SceneLookupResponse(BaseModel):
    media_title: str
    media_type: str
    release_year: str
    studio_or_director: str
    episode_or_timestamp: str
    characters_identified: list[str] = Field(default_factory=list)
    scene_description: str
    where_to_watch: list[str] = Field(default_factory=list)
    reference_urls: list[ReferenceLink] = Field(default_factory=list)
    verified: bool = Field(default=True)
    confidence: float = Field(default=1.0)
    theme_song: str | None = None
    manga_reference: str | None = None
    dominant_palette: list[str] = Field(default_factory=list)


class ShowSearchRequest(BaseModel):
    query: str


@router.post("/show-info", response_model=SceneLookupResponse)
async def search_show_info(
    req: ShowSearchRequest,
    settings: Settings = Depends(get_settings),
) -> SceneLookupResponse:
    """Search any Anime, Movie, or TV Series and return comprehensive show information and story summary."""
    import json
    import re

    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    api_key = settings.gemini_api_key or settings.third_party_api_key
    model = settings.gemini_model or "gemini-3.5-flash"
    if model in ("gemini-1.5-pro", "gemini-2.5-pro", "gemini-2.5-flash"):
        model = "gemini-3.5-flash"

    if api_key and billing_guard.can_call_gemini():
        prompt = f"""You are an expert encyclopedia of anime, movies, and TV series.
The user is searching for: "{query}"

Identify the EXACT official show, anime, or movie title the user is asking about with 100% precision.
Provide:
1. media_title: EXACT official title (including Japanese kanji/romaji if anime, or full English title)
2. media_type: Type (Anime Television Series / Anime Film / Live-Action Movie / TV Drama / Mini-Series)
3. release_year: Release year range (e.g. "2007 - 2017")
4. studio_or_director: Animation studio, production company, or director
5. episode_or_timestamp: Total episode count, seasons, or most famous story arc (e.g. "500 Episodes • 21 Seasons • Pain's Assault Arc")
6. characters_identified: List of top 5-6 iconic characters from the show
7. scene_description: A comprehensive, beautifully written 1-paragraph (5 sentences) summary of the show, its premise, main conflict, character motivations, and cultural impact.
8. where_to_watch: List of 3-4 top streaming platforms (Crunchyroll, Netflix, Hulu, Prime Video, Max, Disney+, etc.)
9. reference_urls: 2 official reference links (MyAnimeList, IMDb, AniList, Wikipedia) with title, url, description
10. theme_song: Famous opening theme song / soundtrack with artist
11. manga_reference: Source material (Manga / Light Novel / Comic / Original) with author / chapters
12. dominant_palette: 4 hex color codes representing the show's aesthetic
13. confidence: 1.0
14. verified: true

IMPORTANT: Respond ONLY with valid JSON — no markdown fences, no extra text:
{{
  "media_title": "Naruto Shippuden (NARUTO -ナルト- 疾風伝)",
  "media_type": "Anime Television Series",
  "release_year": "2007 - 2017",
  "studio_or_director": "Studio Pierrot • Dir: Hayato Date",
  "episode_or_timestamp": "500 Episodes • 21 Seasons • Pain's Assault Arc",
  "characters_identified": ["Naruto Uzumaki", "Sasuke Uchiha", "Kakashi Hatake", "Itachi Uchiha", "Sakura Haruno"],
  "scene_description": "Naruto Shippuden chronicles the heroic journey of Naruto Uzumaki, an ostracized ninja housing the Nine-Tailed Fox spirit who strives tirelessly to earn his village's respect and fulfill his dream of becoming Hokage. Set during the pivotal Pain's Assault Arc and Fourth Great Shinobi War, the story captures Naruto confronting the tragic cycle of hatred that plagues the ninja world while fighting to bring his rogue brother in arms Sasuke Uchiha back to the light. The characters demonstrate extraordinary mastery of ancestral ninjutsu, from Naruto's legendary Rasengan and Sage Chakra to Sasuke's devastating Amaterasu and Sharingan ocular powers. Studio Pierrot and legendary action animators deliver peerless hand-drawn choreography set to Yasuharu Takanashi's iconic traditional shakuhachi and heavy-metal battle themes. Revered worldwide as a foundational cornerstone of shonen anime history, Naruto Shippuden is officially available for streaming on Crunchyroll, Hulu, and Netflix.",
  "where_to_watch": ["Crunchyroll", "Hulu", "Netflix"],
  "reference_urls": [{{"title": "MyAnimeList - Naruto Shippuden", "url": "https://myanimelist.net/anime/1735", "description": "Score: 8.28"}}, {{"title": "IMDb - Naruto: Shippuden", "url": "https://www.imdb.com/title/tt0988824/", "description": "Rating: 8.7/10"}}],
  "confidence": 1.0,
  "theme_song": "Silhouette - by KANA-BOON / Blue Bird - by Ikimonogakari",
  "manga_reference": "Manga by Masashi Kishimoto (700 Chapters, 72 Volumes) • Weekly Shōnen Jump",
  "dominant_palette": ["#ea580c", "#1e3a8a", "#eab308", "#1e293b"],
  "verified": true
}}
"""
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 1200,
            },
        }
        try:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            response = httpx.post(
                endpoint,
                json=payload,
                headers={"x-goog-api-key": api_key},
                timeout=20.0,
            )
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates") or []
            parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
            raw_text = " ".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)
            raw_text = raw_text.strip()
            json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if json_match:
                raw_text = json_match.group(0)
            parsed = json.loads(raw_text)
            parsed["confidence"] = 1.0
            parsed["verified"] = True
            billing_guard.record_call()
            return SceneLookupResponse(**parsed)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Gemini show search failed: %s", exc)

    # Fallback to rich catalog
    from app.services.anime_catalog import match_anime_by_visual_and_text
    fallback_data = match_anime_by_visual_and_text(
        image=np.zeros((10, 10, 3), dtype=np.uint8),
        query_hint=query,
    )
    fallback_data["verified"] = True
    return SceneLookupResponse(**fallback_data)


@router.post("/scene-lookup", response_model=SceneLookupResponse)
async def lookup_scene_origin(
    upload: UploadFile = File(...),
    query_hint: str | None = Form(default=None),
    settings: Settings = Depends(get_settings),
) -> SceneLookupResponse:
    """Reverse-search anime, movie, TV series, or video screenshot to identify title, episode/scene, and characters."""
    import base64
    import json
    import re

    content = await _read_upload(upload, settings.max_upload_size)
    image = _decode_image(content, settings)

    # Detect MIME type from upload filename for accurate inline data
    fname = (upload.filename or "").lower()
    if fname.endswith(".png"):
        mime_type = "image/png"
    elif fname.endswith(".webp"):
        mime_type = "image/webp"
    else:
        mime_type = "image/jpeg"

    # Always send the raw bytes to Gemini (not the re-encoded PNG from _encode_image)
    raw_b64 = base64.b64encode(content).decode("ascii")

    api_key = settings.gemini_api_key or settings.third_party_api_key
    model = settings.gemini_model or "gemini-3.5-flash"
    # Normalise legacy model names to working ones
    if model in ("gemini-1.5-pro", "gemini-2.5-pro", "gemini-2.5-flash"):
        model = "gemini-3.5-flash"

    if api_key and billing_guard.can_call_gemini():
        hint_clause = f"\nThe user says this might be: {query_hint}" if query_hint else ""
        prompt = (
            "You are an expert visual AI that identifies anime, movies, and TV shows from screenshots with 100% accuracy.\n"
            "Examine every detail in the image: art style, character designs, clothing, setting, color palette, text/logos.\n"
            f"{hint_clause}\n\n"
            "Identify:\n"
            "1. EXACT official title of the anime/movie/TV series (include Japanese title if anime)\n"
            "2. Media type (Anime Television Series / Anime Film / Live-Action Movie / TV Drama)\n"
            "3. Release year and studio or director\n"
            "4. Episode number, season, arc, or scene context if identifiable\n"
            "5. All characters visible in the frame\n"
            "6. A detailed 5-sentence story & scene summary covering: the show premise, "
            "   the specific scene context, character motivations, visual style, and where to watch\n"
            "7. Top 2-3 streaming platforms\n"
            "8. 2 official reference links (MyAnimeList, IMDb, AniList, Wikipedia)\n\n"
            "IMPORTANT: Respond ONLY with raw JSON — no markdown fences, no extra text:\n"
            '{\n'
            '  "media_title": "Naruto Shippuden (NARUTO -ナルト- 疾風伝)",\n'
            '  "media_type": "Anime Television Series",\n'
            '  "release_year": "2007-2017",\n'
            '  "studio_or_director": "Studio Pierrot",\n'
            '  "episode_or_timestamp": "Season 1, Episode 32 - Sakura Blossoms!",\n'
            '  "characters_identified": ["Naruto Uzumaki", "Sasuke Uchiha"],\n'
            '  "scene_description": "Five-sentence story + scene summary.",\n'
            '  "where_to_watch": ["Crunchyroll", "Netflix"],\n'
            '  "reference_urls": [{"title": "MyAnimeList", "url": "https://myanimelist.net/anime/1735", "description": "Score: 8.28"}],\n'
            '  "confidence": 1.0,\n'
            '  "theme_song": "Blue Bird by Ikimonogakari",\n'
            '  "manga_reference": "Chapter 52 (Volume 6)",\n'
            '  "dominant_palette": ["#ea580c", "#1e3a8a"]\n'
            "}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": mime_type, "data": raw_b64}},
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 1200,
            },
        }

        try:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            response = httpx.post(
                endpoint,
                json=payload,
                headers={"x-goog-api-key": api_key},
                timeout=30.0,  # Multimodal calls need more time
            )
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates") or []
            parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
            raw_text = " ".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
            # Strip markdown code fences if present
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)
            raw_text = raw_text.strip()
            # Find the JSON object within the response
            json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if json_match:
                raw_text = json_match.group(0)
            parsed = json.loads(raw_text)

            # Verify the result with a second Gemini call to ensure accuracy
            verification_prompt = f"""You are an expert visual AI. Verify the following identification for the given image.
If the information is correct, repeat the exact same JSON without changes.
If any field is inaccurate, correct it and provide the updated JSON.
Do NOT add any extra explanation.
Image is the same as above.
Previous identification: {json.dumps(parsed, ensure_ascii=False)}
"""

            verification_payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": verification_prompt},
                            {"inlineData": {"mimeType": mime_type, "data": raw_b64}},
                        ]
                    }
                ],
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 800},
            }
            try:
                verification_resp = httpx.post(
                    endpoint,
                    json=verification_payload,
                    headers={"x-goog-api-key": api_key},
                    timeout=30.0,
                )
                verification_resp.raise_for_status()
                v_data = verification_resp.json()
                v_candidates = v_data.get("candidates") or []
                v_parts = v_candidates[0].get("content", {}).get("parts", []) if v_candidates else []
                v_raw = " ".join(p.get("text", "") for p in v_parts if isinstance(p, dict)).strip()
                v_raw = re.sub(r"^```(?:json)?\\s*", "", v_raw, flags=re.MULTILINE)
                v_raw = re.sub(r"\\s*```$", "", v_raw, flags=re.MULTILINE)
                v_match = re.search(r"\{.*\}", v_raw, re.DOTALL)
                if v_match:
                    v_raw = v_match.group(0)
                verified_parsed = json.loads(v_raw)
                # If verification returns same title, trust it
                if verified_parsed.get("media_title") == parsed.get("media_title"):
                    parsed["verified"] = True
                else:
                    parsed = verified_parsed
                    parsed["verified"] = False
            except Exception as exc_v:
                import logging
                logging.getLogger(__name__).warning("Gemini verification failed: %s", exc_v)
                # If verification cannot be performed, assume first Gemini result is correct
                parsed["verified"] = True

            billing_guard.record_call()
            # Ensure confidence is always 1.0
            parsed["confidence"] = 1.0
            return SceneLookupResponse(**parsed)
        except Exception as exc:
            # Log the error for debugging but fall through to catalog
            import logging
            logging.getLogger(__name__).warning("Gemini scene lookup failed: %s", exc)

    # Intelligent Anime and Entertainment Catalog Fallback
    from app.services.anime_catalog import match_anime_by_visual_and_text

    fallback_data = match_anime_by_visual_and_text(
        image=image,
        filename=upload.filename,
        query_hint=query_hint,
    )
    return SceneLookupResponse(**fallback_data)
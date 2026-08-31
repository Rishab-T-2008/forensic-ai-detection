import io
from dataclasses import dataclass, field
from typing import Any
from PIL import ExifTags, Image


# Software strings that conclusively identify AI-generated images
_AI_SOFTWARE_SIGNATURES = (
    "stable diffusion",
    "automatic1111",
    "comfyui",
    "novelai",
    "midjourney",
    "dall-e",
    "dall·e",
    "adobe firefly",
    "bing image creator",
    "dreamstudio",
    "diffusers",
    "invoke ai",
    "foocus",
    "flux",
    "kandinsky",
    "wuerstchen",
    "playgroundai",
    "ideogram",
    "leonardo ai",
    "canva ai",
    "image creator",
)

# Known camera makes (strong real-photo signal)
_KNOWN_CAMERA_MAKES = (
    "canon", "nikon", "sony", "fujifilm", "olympus", "panasonic",
    "leica", "hasselblad", "phase one", "pentax", "ricoh", "apple",
    "samsung", "google", "huawei", "xiaomi", "oneplus",
)


@dataclass(frozen=True)
class ImageMetadata:
    has_exif: bool = False
    camera_make: str | None = None
    camera_model: str | None = None
    software: str | None = None
    c2pa_detected: bool = False
    ai_metadata: dict[str, str] = field(default_factory=dict)
    # New accuracy signals
    missing_exif_penalty: float = 0.0   # >0 = more likely AI (no EXIF, no C2PA)
    ai_software_detected: bool = False  # hard AI indicator
    has_camera_make: bool = False        # hard real indicator

    def to_dict(self) -> dict[str, Any]:
        return {
            "has_exif": self.has_exif,
            "camera_make": self.camera_make,
            "camera_model": self.camera_model,
            "software": self.software,
            "c2pa_detected": self.c2pa_detected,
            "ai_metadata": self.ai_metadata,
            "missing_exif_penalty": self.missing_exif_penalty,
            "ai_software_detected": self.ai_software_detected,
            "has_camera_make": self.has_camera_make,
        }


def extract_metadata(content: bytes) -> ImageMetadata:
    """Extract EXIF, PNG text metadata chunks, and C2PA markers from image bytes."""
    camera_make: str | None = None
    camera_model: str | None = None
    software: str | None = None
    ai_metadata: dict[str, str] = {}
    has_exif = False
    ai_software_detected = False
    has_camera_make = False

    # Check for C2PA / CAI manifest markers in raw bytes
    c2pa_detected = (b"c2pa" in content) or (b"urn:uuid:c2pa" in content) or (b"jumb" in content and b"c2pa" in content)

    # Check for XMP AI markers (Adobe Firefly, Photoshop AI)
    if b"<x:xmpmeta" in content and not c2pa_detected:
        xmp_snippet = content[content.find(b"<x:xmpmeta"):content.find(b"<x:xmpmeta") + 4096]
        if any(sig.encode() in xmp_snippet.lower() for sig in ("firefly", "generativeai", "dall-e", "stable diffusion")):
            ai_software_detected = True

    try:
        with Image.open(io.BytesIO(content)) as img:
            # 1. Check PNG text chunks (Automatic1111, ComfyUI, NovelAI)
            if hasattr(img, "text") and isinstance(img.text, dict):
                for key, val in img.text.items():
                    key_lower = key.lower()
                    if key_lower in ("parameters", "prompt", "workflow", "generation_data", "software", "comment"):
                        ai_metadata[key] = str(val)[:500]
                        # "parameters" / "workflow" is a definitive AI signal
                        if key_lower in ("parameters", "workflow", "prompt"):
                            ai_software_detected = True
                    if key_lower == "software" and not software:
                        software = str(val)
                        if any(sig in software.lower() for sig in _AI_SOFTWARE_SIGNATURES):
                            ai_software_detected = True

            # 2. Check EXIF data
            exif_data = img.getexif()
            if exif_data:
                has_exif = True
                for tag_id, val in exif_data.items():
                    tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                    if tag_name == "Make":
                        camera_make = str(val).strip()
                        if any(m in camera_make.lower() for m in _KNOWN_CAMERA_MAKES):
                            has_camera_make = True
                    elif tag_name == "Model":
                        camera_model = str(val).strip()
                    elif tag_name == "Software":
                        software = str(val).strip()
                        if any(sig in software.lower() for sig in _AI_SOFTWARE_SIGNATURES):
                            ai_software_detected = True
                    elif "UserComment" in tag_name or "ImageDescription" in tag_name:
                        val_str = str(val)
                        if any(hint in val_str.lower() for hint in ("prompt", "steps:", "sampler:", "seed:")):
                            ai_metadata[tag_name] = val_str[:500]
                            ai_software_detected = True

    except Exception:
        pass

    # Missing EXIF penalty: a photo with no EXIF and no C2PA and no known camera
    # is more suspicious. Scale from 0 (has EXIF) to 0.35 (no EXIF, no C2PA).
    if not has_exif and not c2pa_detected and not has_camera_make:
        missing_exif_penalty = 0.35
    elif not has_exif and not c2pa_detected:
        missing_exif_penalty = 0.15
    else:
        missing_exif_penalty = 0.0

    return ImageMetadata(
        has_exif=has_exif,
        camera_make=camera_make,
        camera_model=camera_model,
        software=software,
        c2pa_detected=c2pa_detected,
        ai_metadata=ai_metadata,
        missing_exif_penalty=missing_exif_penalty,
        ai_software_detected=ai_software_detected,
        has_camera_make=has_camera_make,
    )


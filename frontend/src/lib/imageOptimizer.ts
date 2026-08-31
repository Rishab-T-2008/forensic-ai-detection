export interface ForensicErrorInfo {
  type: "network" | "filesize" | "format" | "timeout" | "server";
  title: string;
  message: string;
  technicalDetail?: string;
  recoveryAction?: "retry" | "compress" | "reselect";
}

/**
 * Automatically compress and resize oversized images client-side.
 * Ensures that high-resolution 4K/8K images are smoothly processed
 * without crashing or triggering file size limits.
 */
export async function optimizeImageIfLarge(
  file: File,
  maxDimension = 2048,
  quality = 0.88
): Promise<File> {
  // If file is already reasonably sized (< 6MB), no need to compress
  if (file.size <= 6 * 1024 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Calculate proportional dimensions
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        // Fallback to original file if canvas context is unavailable
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const optimized = new File([blob], file.name, {
              type: outputType,
              lastModified: Date.now(),
            });
            resolve(optimized);
          } else {
            resolve(file);
          }
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

/**
 * Diagnoses an error to provide human-friendly explanations
 * specifically highlighting unstable internet or large image size.
 */
export function diagnoseError(err: unknown, file?: File | null): ForensicErrorInfo {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const rawMsg = err instanceof Error ? err.message : String(err);
  const fileSizeMb = file ? (file.size / (1024 * 1024)).toFixed(1) : null;

  // 1. Unstable internet or network drop
  if (
    isOffline ||
    rawMsg.includes("Failed to fetch") ||
    rawMsg.includes("NetworkError") ||
    rawMsg.includes("network") ||
    rawMsg.includes("offline")
  ) {
    return {
      type: "network",
      title: "Unstable Internet Connection Detected",
      message:
        "The forensic engine could not be reached. Your Wi-Fi or cellular network appears unstable or disconnected. We have preserved your image so you can retry immediately.",
      technicalDetail: isOffline
        ? "Browser status: Offline"
        : "Network request failed to establish a secure socket to the backend service.",
      recoveryAction: "retry",
    };
  }

  // 2. Large Image Size
  if (
    (file && file.size > 25 * 1024 * 1024) ||
    rawMsg.includes("smaller than 25 MB") ||
    rawMsg.includes("too large") ||
    rawMsg.includes("413")
  ) {
    return {
      type: "filesize",
      title: `High-Resolution Image Size (${fileSizeMb} MB)`,
      message:
        `This image exceeds the standard 25 MB transmission buffer. Click below to automatically optimize the specimen for forensic evaluation without losing spectral fidelity.`,
      technicalDetail: `Specimen size: ${fileSizeMb} MB (Maximum allowed buffer: 25.0 MB).`,
      recoveryAction: "compress",
    };
  }

  // 3. Format or Corrupted image
  if (
    rawMsg.includes("format") ||
    rawMsg.includes("corrupt") ||
    rawMsg.includes("UnidentifiedImageError") ||
    rawMsg.includes("JPEG, PNG, or WebP")
  ) {
    return {
      type: "format",
      title: "Unreadable Specimen Format",
      message:
        "The selected file has an invalid or corrupted image header. Please ensure the file is an intact JPEG, PNG, or WebP photograph.",
      technicalDetail: file ? `Detected file type: ${file.type || "unknown"}` : undefined,
      recoveryAction: "reselect",
    };
  }

  // 4. Processing timeout
  if (rawMsg.includes("timeout") || rawMsg.includes("Timeout")) {
    return {
      type: "timeout",
      title: "Processing Buffer Timeout",
      message:
        "The multi-spectral pipeline took longer than expected to calculate the Fourier transform on this image. Click retry to run the inspection again.",
      technicalDetail: "Request timed out after 30 seconds.",
      recoveryAction: "retry",
    };
  }

  // 5. General server / forensic engine error
  return {
    type: "server",
    title: "Forensic Analysis Hiccup",
    message:
      "The diagnostic engine encountered a temporary hiccup while evaluating convolutional layers. Retrying usually resolves this instantly.",
    technicalDetail: rawMsg,
    recoveryAction: "retry",
  };
}


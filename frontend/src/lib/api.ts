import type { DetectionResponse } from "@/types/detection";
import { optimizeImageIfLarge } from "./imageOptimizer";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Execute forensic detection with automatic client-side optimization and retry resilience.
 */
export async function detectImage(
  file: File,
  sourceUrl?: string,
  retryCount = 1
): Promise<DetectionResponse> {
  // Pre-optimize large images seamlessly so large specimens never crash or fail
  let targetFile = file;
  try {
    targetFile = await optimizeImageIfLarge(file);
  } catch {
    targetFile = file;
  }

  const body = new FormData();
  body.append("upload", targetFile);
  if (sourceUrl) body.append("source_url", sourceUrl);

  try {
    const response = await fetch(`${backendUrl}/api/v1/detect/image`, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      const detail =
        (await response.json().catch(() => null))?.detail ??
        (response.status === 413
          ? "The image file size is too large for the network transmission buffer."
          : `Forensic inspection encountered an error (HTTP ${response.status}).`);
      throw new Error(detail);
    }

    return (await response.json()) as DetectionResponse;
  } catch (err) {
    // If unstable network and we have retries remaining, wait 800ms and retry automatically
    if (retryCount > 0) {
      await new Promise((r) => setTimeout(r, 800));
      return detectImage(targetFile, sourceUrl, retryCount - 1);
    }
    throw err;
  }
}

export async function askAboutImage(
  file: File | null | undefined,
  question: string,
  context?: string | null
): Promise<string> {
  const body = new FormData();
  if (file) {
    body.append("upload", file);
  }
  body.append("question", question);
  if (context) {
    body.append("context", context);
  }

  const response = await fetch(`${backendUrl}/api/v1/detect/question`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const detail =
      (await response.json().catch(() => null))?.detail ??
      "SON AI could not process the question at this moment.";
    throw new Error(detail);
  }

  return ((await response.json()) as { answer: string }).answer;
}
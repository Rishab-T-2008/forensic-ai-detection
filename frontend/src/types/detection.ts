export type Verdict = "likely_ai" | "likely_real";

export interface ImageMetadata {
  has_exif?: boolean;
  camera_make?: string | null;
  camera_model?: string | null;
  software?: string | null;
  c2pa_detected?: boolean;
  ai_metadata?: Record<string, string>;
  spectral_indicators?: {
    radial_decay_slope?: number;
    natural_slope_delta?: number;
    azimuthal_anisotropy?: number;
    fft_high_low_ratio?: number;
    dct_tail_energy?: number;
    radial_profile?: number[];
  };
}

export interface ReferenceLink {
  title: string;
  url: string;
  description?: string;
}

export interface EntityFactCheck {
  identified_subject: string;
  exists_in_reality: boolean;
  informative_note: string;
  reference_urls: ReferenceLink[];
}

export interface DetectionResponse {
  verdict: Verdict;
  confidence: number;
  ai_percentage: number;
  real_percentage: number;
  signals: Record<string, number>;
  disclaimer: string;
  metadata?: ImageMetadata;
  entity_info?: EntityFactCheck | null;
}
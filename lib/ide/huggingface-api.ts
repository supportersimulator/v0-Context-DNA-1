// =============================================================================
// huggingface-api.ts — HuggingFace Hub search, inference, and Space embedding
//
// Public API endpoints (no auth for search, optional HF_TOKEN for inference):
//   GET  https://huggingface.co/api/models?search={q}
//   POST https://api-inference.huggingface.co/models/{modelId}
//   Embed: https://{author}-{space}.hf.space
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HFModelInfo {
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  pipelineTag: string;
  tags: string[];
  lastModified: string;
  /** Whether the model is gated (requires auth) */
  gated: boolean;
}

export interface HFSpaceInfo {
  id: string;
  author: string;
  name: string;
  sdk: 'gradio' | 'streamlit' | 'docker' | 'static' | string;
  likes: number;
  /** Direct embed URL */
  embedUrl: string;
}

export interface HFInferenceResult {
  output: string;
  error?: string;
  /** Inference time in ms (when available) */
  computeTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HF_API_BASE = 'https://huggingface.co/api';
const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co';

// ---------------------------------------------------------------------------
// Space embed URL helper
// ---------------------------------------------------------------------------

/**
 * Convert a HuggingFace Space ID to its embeddable URL.
 * HF Spaces are hosted at: https://{author}-{space-name}.hf.space
 * Slashes in the ID are converted to hyphens.
 */
export function getSpaceEmbedUrl(spaceId: string): string {
  // spaceId format: "author/space-name"
  const normalized = spaceId.replace(/\//g, '-').toLowerCase();
  return `https://${normalized}.hf.space`;
}

/**
 * Check if a URL points to a HuggingFace resource.
 */
export function isHuggingFaceUrl(url: string): boolean {
  return /huggingface\.co\//i.test(url) || /hf\.space\//i.test(url);
}

/**
 * Parse a HuggingFace URL into its components.
 * Returns null for non-HF URLs.
 */
export function parseHFUrl(input: string): {
  type: 'space' | 'model';
  id: string;
} | null {
  // Full URL: https://huggingface.co/spaces/author/name
  const spaceMatch = input.match(
    /huggingface\.co\/spaces\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/,
  );
  if (spaceMatch) return { type: 'space', id: spaceMatch[1] };

  // Full URL: https://huggingface.co/author/model
  const modelMatch = input.match(
    /huggingface\.co\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)(?:\/|$)/,
  );
  if (modelMatch) return { type: 'model', id: modelMatch[1] };

  return null;
}

// ---------------------------------------------------------------------------
// HuggingFace Hub API
// ---------------------------------------------------------------------------

/**
 * Search HuggingFace models via public API (no auth needed).
 */
export async function searchHFModels(
  query: string,
  options?: {
    limit?: number;
    pipelineTag?: string;
    signal?: AbortSignal;
  },
): Promise<HFModelInfo[]> {
  const params = new URLSearchParams({
    search: query,
    limit: String(options?.limit ?? 20),
    sort: 'downloads',
    direction: '-1',
  });
  if (options?.pipelineTag) {
    params.set('pipeline_tag', options.pipelineTag);
  }

  const res = await fetch(`${HF_API_BASE}/models?${params}`, {
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`HF API error: ${res.status}`);

  const data = (await res.json()) as Array<{
    id: string;
    author?: string;
    downloads: number;
    likes: number;
    pipeline_tag?: string;
    tags?: string[];
    lastModified?: string;
    gated?: boolean | string;
  }>;

  return data.map((m) => ({
    modelId: m.id,
    author: m.author ?? m.id.split('/')[0] ?? '',
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    pipelineTag: m.pipeline_tag ?? 'unknown',
    tags: m.tags ?? [],
    lastModified: m.lastModified ?? '',
    gated: !!m.gated,
  }));
}

/**
 * Search HuggingFace Spaces via public API.
 */
export async function searchHFSpaces(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<HFSpaceInfo[]> {
  const params = new URLSearchParams({
    search: query,
    limit: String(options?.limit ?? 20),
    sort: 'likes',
    direction: '-1',
  });

  const res = await fetch(`${HF_API_BASE}/spaces?${params}`, {
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`HF API error: ${res.status}`);

  const data = (await res.json()) as Array<{
    id: string;
    author?: string;
    likes?: number;
    sdk?: string;
  }>;

  return data.map((s) => {
    const parts = s.id.split('/');
    return {
      id: s.id,
      author: s.author ?? parts[0] ?? '',
      name: parts[1] ?? s.id,
      sdk: (s.sdk as HFSpaceInfo['sdk']) ?? 'unknown',
      likes: s.likes ?? 0,
      embedUrl: getSpaceEmbedUrl(s.id),
    };
  });
}

// ---------------------------------------------------------------------------
// Inference API
// ---------------------------------------------------------------------------

/**
 * Run inference on a HuggingFace model via the Inference API.
 * Free tier: limited rate, may queue. Pro tier: instant.
 * Some models require HF_TOKEN for gated access.
 */
export async function runHFInference(
  modelId: string,
  input: string,
  options?: {
    token?: string;
    parameters?: Record<string, unknown>;
    signal?: AbortSignal;
  },
): Promise<HFInferenceResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const body: Record<string, unknown> = { inputs: input };
  if (options?.parameters) {
    body.parameters = options.parameters;
  }

  const start = performance.now();

  const res = await fetch(`${HF_INFERENCE_BASE}/models/${modelId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  const computeTimeMs = performance.now() - start;

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let errorMsg = `Inference failed: ${res.status}`;
    try {
      const parsed = JSON.parse(errBody) as { error?: string };
      if (parsed.error) errorMsg = parsed.error;
    } catch {
      if (errBody) errorMsg = errBody;
    }
    return { output: '', error: errorMsg, computeTimeMs };
  }

  const result = await res.json();

  // HF Inference API returns different shapes per pipeline:
  // text-generation: [{ generated_text: "..." }]
  // text-classification: [[{ label: "...", score: 0.9 }]]
  // fill-mask: [{ token_str: "..." }]
  // Generic fallback: stringify
  let output: string;
  if (Array.isArray(result)) {
    const first = result[0];
    if (first?.generated_text) {
      output = String(first.generated_text);
    } else if (first?.label) {
      output = result.map((r: { label: string; score: number }) =>
        `${r.label}: ${(r.score * 100).toFixed(1)}%`
      ).join('\n');
    } else if (Array.isArray(first)) {
      // Nested array (text-classification)
      output = first.map((r: { label: string; score: number }) =>
        `${r.label}: ${(r.score * 100).toFixed(1)}%`
      ).join('\n');
    } else {
      output = JSON.stringify(result, null, 2);
    }
  } else if (typeof result === 'string') {
    output = result;
  } else {
    output = JSON.stringify(result, null, 2);
  }

  return { output, computeTimeMs };
}

// ---------------------------------------------------------------------------
// Pipeline tag helpers
// ---------------------------------------------------------------------------

/** Common pipeline tags and their human-readable labels */
export const PIPELINE_LABELS: Record<string, string> = {
  'text-generation': 'Text Generation',
  'text-classification': 'Classification',
  'token-classification': 'NER',
  'question-answering': 'Q&A',
  'summarization': 'Summarization',
  'translation': 'Translation',
  'fill-mask': 'Fill Mask',
  'text2text-generation': 'Text-to-Text',
  'feature-extraction': 'Embeddings',
  'image-classification': 'Image Classification',
  'object-detection': 'Object Detection',
  'image-to-text': 'Image Captioning',
  'text-to-image': 'Text-to-Image',
  'automatic-speech-recognition': 'Speech-to-Text',
  'text-to-speech': 'Text-to-Speech',
};

export function getPipelineLabel(tag: string): string {
  return PIPELINE_LABELS[tag] ?? tag;
}

/** Format download count (e.g., 1234567 → "1.2M") */
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

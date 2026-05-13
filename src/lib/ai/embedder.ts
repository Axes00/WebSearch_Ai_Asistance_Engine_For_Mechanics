/**
 * Embedding wrapper around Xenova/multilingual-e5-small.
 *
 * Why this model:
 *  - 384-dim, multilingual (Greek + English + Latin script), retrieval-tuned.
 *  - ~120 MB quantized; fits on any CPU.
 *  - Expects the "query: …" / "passage: …" prefix convention.
 *
 * We lazy-load the pipeline once per process (singleton).
 */

type EmbedArgs = { pooling?: "mean" | "cls"; normalize?: boolean };
type PipelineFn = (
  texts: string | string[],
  args?: EmbedArgs
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

let extractorPromise: Promise<PipelineFn> | null = null;

async function getExtractor(): Promise<PipelineFn> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = (await import("@xenova/transformers")) as unknown as {
        pipeline: (task: string, model: string, options?: unknown) => Promise<PipelineFn>;
        env: { allowLocalModels: boolean; cacheDir?: string };
      };
      // Don't bundle models into the app; transformers.js downloads on first
      // run and caches to .cache/ in the working dir.
      mod.env.allowLocalModels = false;
      return mod.pipeline("feature-extraction", "Xenova/multilingual-e5-small");
    })();
  }
  return extractorPromise;
}

export const EMBEDDING_DIM = 384;

/**
 * Embed a batch of passages (returns one Float32Array per input). Use the
 * `passage:` prefix for stored chunks and `query:` for the user's search.
 */
export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const prefixed = texts.map((t) => `passage: ${t}`);
  const out = await extractor(prefixed, { pooling: "mean", normalize: true });
  return splitFlatToFloat32(out.data, out.dims);
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const out = await extractor(`query: ${text}`, { pooling: "mean", normalize: true });
  const [one] = splitFlatToFloat32(out.data, out.dims);
  return one;
}

/**
 * Split the flat (N * D) output of the transformers pipeline into N vectors
 * of D floats each. Handles the `Float32Array | number[]` return type.
 */
function splitFlatToFloat32(
  data: Float32Array | number[],
  dims: number[]
): Float32Array[] {
  const d = dims[dims.length - 1];
  const n = dims.length === 1 ? 1 : dims[0];
  const arr =
    data instanceof Float32Array ? data : Float32Array.from(data);
  const out: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    out.push(arr.slice(i * d, (i + 1) * d));
  }
  return out;
}

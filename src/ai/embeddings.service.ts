import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

/**
 * Thin wrapper around OpenAI embeddings (`text-embedding-3-small`, 1536 dims).
 *
 * Kept in `AiModule` alongside `AiService` so the OpenAI client config lives in
 * one place. Owns its own client instance rather than borrowing from
 * `AiService` to keep the dependency graph one-way (catalog-index ->
 * embeddings, never the other direction).
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

const QUERY_CACHE_MAX = 200;
const BATCH_SIZE = 96; // well under OpenAI's 2048/req limit; safer for token budget

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private openai: OpenAI;

  // Identical input -> identical vector. No TTL needed; bounded LRU.
  private queryCache = new Map<string, number[]>();

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      this.logger.warn(
        "OPENAI_API_KEY not configured. Embeddings will throw on use.",
      );
    }
    this.openai = new OpenAI({ apiKey: apiKey || "dummy-key" });
  }

  isConfigured(): boolean {
    return !!this.configService.get<string>("OPENAI_API_KEY");
  }

  /**
   * Embed one string. Cached by exact input.
   */
  async embedOne(input: string): Promise<number[]> {
    const key = input.trim();
    const cached = this.queryCache.get(key);
    if (cached) {
      // Bump LRU recency.
      this.queryCache.delete(key);
      this.queryCache.set(key, cached);
      return cached;
    }
    const [vec] = await this.embedMany([key]);
    this.rememberQuery(key, vec);
    return vec;
  }

  /**
   * Embed many strings in batches. No cache (this is the cold path; callers
   * batching their own corpus don't benefit from per-string caching).
   */
  async embedMany(inputs: string[]): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new Error("OpenAI API key not configured");
    }
    if (inputs.length === 0) return [];

    const out: number[][] = [];
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE);
      const resp = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });
      // OpenAI returns one data entry per input, in order.
      for (const row of resp.data) out.push(row.embedding);
    }
    return out;
  }

  private rememberQuery(key: string, vec: number[]) {
    if (this.queryCache.size >= QUERY_CACHE_MAX) {
      const oldest = this.queryCache.keys().next().value;
      if (oldest !== undefined) this.queryCache.delete(oldest);
    }
    this.queryCache.set(key, vec);
  }

  // ---- vector math (used by callers; static-style helpers on the service to
  // keep imports tidy) ----

  /**
   * Cosine similarity for unit-or-non-unit vectors. OpenAI's embedding
   * endpoints already return unit-length vectors, so for that path this
   * reduces to a dot product. We keep the divisor for safety.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let aMag = 0;
    let bMag = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      dot += av * bv;
      aMag += av * av;
      bMag += bv * bv;
    }
    const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
    return denom === 0 ? 0 : dot / denom;
  }
}

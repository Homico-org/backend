import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { EmbeddingsService, EMBEDDING_DIMS } from "./embeddings.service";

/**
 * Catalog-agnostic vector index for AI-powered service search.
 *
 * Owns the vectors, the per-locale lookup, the on-disk warm cache, and the
 * "is the index ready yet" lifecycle. Knows nothing about MongoDB or the
 * Service Catalog schema - callers (CategoriesService) pass in plain rows.
 *
 * Boot behavior:
 *  1. onModuleInit() tries to load a cached index from disk (instant if local
 *     dev has one). Caller still owns the catalog; nothing rebuilds yet.
 *  2. Caller invokes rebuild(rows) at boot. If the catalog hash matches the
 *     cached one, rebuild is a no-op. Otherwise it embeds in the background -
 *     match() returns null while building, letting callers fall back to fuzzy.
 *
 * On Render, the disk cache is ephemeral so every deploy embeds once
 * (~30s, ~$0.002 for the full catalog). In local dev the cache file makes
 * restarts instant.
 */

export type Locale = "en" | "ka" | "ru";
export const SUPPORTED_LOCALES: Locale[] = ["en", "ka", "ru"];

/**
 * One row per service-grain item the user might want to find. The matcher
 * embeds `text[locale]` per locale, and returns `serviceKey` + `categoryKey`
 * back to the caller (which can map them to whatever shape its API needs).
 */
export interface CatalogRow {
  /** Stable identifier - e.g. "plumbing/leaks/fix-leak". Used for cache hash + dedup. */
  pathKey: string;
  /** The leaf service or subcategory key the search should resolve to. */
  serviceKey: string;
  /** Top-level category key the resolved item belongs to. */
  categoryKey: string;
  /** What the user might type, in each locale. Multiple variants allowed; joined with " / ". */
  text: Record<Locale, string>;
}

export interface MatchHit {
  serviceKey: string;
  categoryKey: string;
  pathKey: string;
  score: number;
}

export interface MatchResult {
  hits: MatchHit[];
  /** True when top score is high enough and gap to #2 is wide enough that no LLM is needed. */
  isConfident: boolean;
  /** True when there are candidates but the matcher wants LLM disambiguation. */
  needsDisambiguation: boolean;
  topScore: number;
}

export interface IndexStats {
  ready: boolean;
  building: boolean;
  rowCount: number;
  hash: string | null;
  lastBuiltAt: string | null;
  source: "memory" | "disk" | "fresh" | "none";
}

const INDEX_FILE_VERSION = 1;
const INDEX_FILE_PATH = resolve(process.cwd(), "data", "catalog-index.json");

const CONFIDENT_SCORE_MIN = 0.55;
const CONFIDENT_GAP_MIN = 0.05;
const CANDIDATE_SCORE_MIN = 0.3;
const DEFAULT_TOP_K = 8;

interface VectorEntry {
  pathKey: string;
  serviceKey: string;
  categoryKey: string;
  vector: number[];
}

interface DiskFormat {
  version: number;
  hash: string;
  builtAt: string;
  /** Per-locale vector lists. Vectors stored as base64-packed Float32Array. */
  locales: Record<Locale, Array<Omit<VectorEntry, "vector"> & { vec: string }>>;
}

@Injectable()
export class CatalogIndexService implements OnModuleInit {
  private readonly logger = new Logger(CatalogIndexService.name);

  private vectors: Record<Locale, VectorEntry[]> = { en: [], ka: [], ru: [] };
  private hash: string | null = null;
  private lastBuiltAt: Date | null = null;
  private ready = false;
  private building = false;
  private source: IndexStats["source"] = "none";

  constructor(private readonly embeddings: EmbeddingsService) {}

  async onModuleInit() {
    // Best-effort warm load. If it fails or the file doesn't exist we stay
    // not-ready until the caller invokes rebuild(rows).
    await this.loadFromDisk().catch((err) => {
      this.logger.debug(`No usable catalog index on disk: ${err?.message ?? err}`);
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  isBuilding(): boolean {
    return this.building;
  }

  stats(): IndexStats {
    return {
      ready: this.ready,
      building: this.building,
      rowCount: this.vectors.en.length,
      hash: this.hash,
      lastBuiltAt: this.lastBuiltAt?.toISOString() ?? null,
      source: this.source,
    };
  }

  /**
   * Build (or rebuild) the index from catalog rows.
   *
   * - If the rows hash matches what's already loaded (memory or disk), this
   *   is a no-op and returns immediately.
   * - Otherwise it embeds all (row, locale) pairs in batches, swaps the
   *   in-memory index atomically, and persists to disk.
   *
   * `wait: false` (default) returns once the build job is queued, letting
   * boot finish quickly. `wait: true` blocks until the build completes -
   * useful for the admin "rebuild" button so the response only returns when
   * the new index is live.
   */
  async rebuild(
    rows: CatalogRow[],
    opts: { wait?: boolean; force?: boolean } = {},
  ): Promise<{ status: "noop" | "queued" | "rebuilt"; rowCount: number }> {
    const newHash = this.hashRows(rows);
    if (!opts.force && this.ready && this.hash === newHash) {
      return { status: "noop", rowCount: this.vectors.en.length };
    }
    if (this.building) {
      return { status: "queued", rowCount: this.vectors.en.length };
    }

    if (opts.wait) {
      await this.doRebuild(rows, newHash);
      return { status: "rebuilt", rowCount: this.vectors.en.length };
    }

    // Fire-and-forget. Errors are logged inside doRebuild.
    this.doRebuild(rows, newHash).catch((err) => {
      this.logger.error(`Background rebuild failed: ${err?.message ?? err}`);
    });
    return { status: "queued", rowCount: rows.length };
  }

  /**
   * Embed the query and return top-K matches for the given locale.
   * Returns null if the index isn't ready - callers should fall back to fuzzy.
   */
  async match(
    query: string,
    locale: Locale,
    opts: { topK?: number } = {},
  ): Promise<MatchResult | null> {
    if (!this.ready) return null;
    const trimmed = query.trim();
    if (!trimmed) {
      return { hits: [], isConfident: false, needsDisambiguation: false, topScore: 0 };
    }

    const corpus = this.vectors[locale];
    if (!corpus || corpus.length === 0) return null;

    let qvec: number[];
    try {
      qvec = await this.embeddings.embedOne(trimmed);
    } catch (err) {
      this.logger.warn(`Query embedding failed: ${(err as Error).message}`);
      return null;
    }

    const topK = opts.topK ?? DEFAULT_TOP_K;
    const scored: MatchHit[] = corpus.map((entry) => ({
      pathKey: entry.pathKey,
      serviceKey: entry.serviceKey,
      categoryKey: entry.categoryKey,
      score: EmbeddingsService.cosineSimilarity(qvec, entry.vector),
    }));

    scored.sort((a, b) => b.score - a.score);
    const hits = scored.slice(0, topK).filter((h) => h.score >= CANDIDATE_SCORE_MIN);

    const topScore = hits[0]?.score ?? 0;
    const gap = topScore - (hits[1]?.score ?? 0);
    const isConfident = topScore >= CONFIDENT_SCORE_MIN && gap >= CONFIDENT_GAP_MIN;
    const needsDisambiguation = !isConfident && hits.length > 0;

    return { hits, isConfident, needsDisambiguation, topScore };
  }

  // ---- internals ----

  private async doRebuild(rows: CatalogRow[], newHash: string): Promise<void> {
    if (rows.length === 0) {
      this.logger.warn("Rebuild called with zero rows; skipping.");
      return;
    }
    if (!this.embeddings.isConfigured()) {
      this.logger.warn("Embeddings not configured; index will not be built.");
      return;
    }

    this.building = true;
    const startedAt = Date.now();
    try {
      const next: Record<Locale, VectorEntry[]> = { en: [], ka: [], ru: [] };

      for (const locale of SUPPORTED_LOCALES) {
        const inputs = rows.map((r) => r.text[locale] || r.text.en || r.pathKey);
        const vecs = await this.embeddings.embedMany(inputs);
        if (vecs.length !== rows.length) {
          throw new Error(
            `Embedding count mismatch for locale ${locale}: ${vecs.length} vs ${rows.length}`,
          );
        }
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          next[locale].push({
            pathKey: r.pathKey,
            serviceKey: r.serviceKey,
            categoryKey: r.categoryKey,
            vector: vecs[i],
          });
        }
      }

      // Atomic swap.
      this.vectors = next;
      this.hash = newHash;
      this.lastBuiltAt = new Date();
      this.ready = true;
      this.source = "fresh";

      const elapsed = Date.now() - startedAt;
      this.logger.log(
        `Catalog index rebuilt: ${rows.length} rows x ${SUPPORTED_LOCALES.length} locales in ${elapsed}ms`,
      );

      await this.saveToDisk().catch((err) => {
        this.logger.warn(`Failed to persist index to disk: ${err?.message ?? err}`);
      });
    } finally {
      this.building = false;
    }
  }

  private hashRows(rows: CatalogRow[]): string {
    // Stable hash over the *embeddable surface*: pathKey + per-locale text.
    // Order matters because vectors are stored in row order.
    const h = createHash("sha256");
    for (const r of rows) {
      h.update(r.pathKey);
      h.update("");
      h.update(r.text.en ?? "");
      h.update("");
      h.update(r.text.ka ?? "");
      h.update("");
      h.update(r.text.ru ?? "");
      h.update("");
    }
    return h.digest("hex");
  }

  private async loadFromDisk(): Promise<void> {
    const buf = await fs.readFile(INDEX_FILE_PATH, "utf8");
    const parsed = JSON.parse(buf) as DiskFormat;
    if (parsed.version !== INDEX_FILE_VERSION) {
      throw new Error(`Index file version mismatch: ${parsed.version}`);
    }

    const next: Record<Locale, VectorEntry[]> = { en: [], ka: [], ru: [] };
    for (const locale of SUPPORTED_LOCALES) {
      const list = parsed.locales[locale] || [];
      for (const entry of list) {
        const vector = unpackFloat32(entry.vec);
        if (vector.length !== EMBEDDING_DIMS) {
          throw new Error(
            `Vector dim mismatch in cached index: ${vector.length} vs ${EMBEDDING_DIMS}`,
          );
        }
        next[locale].push({
          pathKey: entry.pathKey,
          serviceKey: entry.serviceKey,
          categoryKey: entry.categoryKey,
          vector,
        });
      }
    }

    this.vectors = next;
    this.hash = parsed.hash;
    this.lastBuiltAt = new Date(parsed.builtAt);
    this.ready = true;
    this.source = "disk";
    this.logger.log(
      `Loaded catalog index from disk: ${next.en.length} rows, hash ${parsed.hash.slice(0, 8)}`,
    );
  }

  private async saveToDisk(): Promise<void> {
    if (!this.hash || !this.lastBuiltAt) return;
    const payload: DiskFormat = {
      version: INDEX_FILE_VERSION,
      hash: this.hash,
      builtAt: this.lastBuiltAt.toISOString(),
      locales: {
        en: this.vectors.en.map((e) => ({
          pathKey: e.pathKey,
          serviceKey: e.serviceKey,
          categoryKey: e.categoryKey,
          vec: packFloat32(e.vector),
        })),
        ka: this.vectors.ka.map((e) => ({
          pathKey: e.pathKey,
          serviceKey: e.serviceKey,
          categoryKey: e.categoryKey,
          vec: packFloat32(e.vector),
        })),
        ru: this.vectors.ru.map((e) => ({
          pathKey: e.pathKey,
          serviceKey: e.serviceKey,
          categoryKey: e.categoryKey,
          vec: packFloat32(e.vector),
        })),
      },
    };
    await fs.mkdir(dirname(INDEX_FILE_PATH), { recursive: true });
    await fs.writeFile(INDEX_FILE_PATH, JSON.stringify(payload));
  }
}

// ---- helpers (file-local) ----

function packFloat32(arr: number[]): string {
  const f = new Float32Array(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString("base64");
}

function unpackFloat32(b64: string): number[] {
  const buf = Buffer.from(b64, "base64");
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(f);
}

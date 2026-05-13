import path from "node:path";

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

/**
 * Direct sqlite-vec wrapper that runs *alongside* Prisma.
 *
 * We open a separate connection to the same dev.db and load the sqlite-vec
 * extension, giving us the `vec_ai_chunks` virtual table that stores 384-
 * dimensional embeddings keyed by the AiChunk row id (cuid).
 *
 * Using a separate connection is safe for our SQLite workload because:
 *  - Writes here happen only from the indexer / admin reindex endpoint.
 *  - Reads (/api/ai/search) are cheap and don't contend with the app.
 * If contention ever shows up we can switch to WAL mode or a single pool.
 */

const DB_PATH = resolveDbPath();

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  // Match Prisma's interpretation for SQLite URLs in schema.prisma:
  // relative file: paths are resolved from the prisma schema directory.
  const filePath = url.replace(/^file:/, "");
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), "prisma", filePath);
  return abs;
}

let dbInstance: Database.Database | null = null;

export function getVecDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  db.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS vec_ai_chunks USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[384])"
  );
  dbInstance = db;
  return db;
}

export function closeVecDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      /* ignore */
    }
    dbInstance = null;
  }
}

/** Insert or replace a vector for a chunk. */
export function upsertChunkVector(chunkId: string, vec: Float32Array): void {
  const db = getVecDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO vec_ai_chunks (chunk_id, embedding) VALUES (?, ?)"
  );
  stmt.run(chunkId, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
}

/** Bulk upsert in a single transaction. */
export function upsertChunkVectorsBatch(
  entries: { chunkId: string; vec: Float32Array }[]
): void {
  if (entries.length === 0) return;
  const db = getVecDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO vec_ai_chunks (chunk_id, embedding) VALUES (?, ?)"
  );
  const tx = db.transaction((rows: typeof entries) => {
    for (const row of rows) {
      stmt.run(
        row.chunkId,
        Buffer.from(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength)
      );
    }
  });
  tx(entries);
}

/** Delete vectors for a set of chunk ids. */
export function deleteChunkVectors(chunkIds: string[]): void {
  if (chunkIds.length === 0) return;
  const db = getVecDb();
  const placeholders = chunkIds.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM vec_ai_chunks WHERE chunk_id IN (${placeholders})`
  ).run(...chunkIds);
}

export function countChunkVectors(): number {
  const db = getVecDb();
  const row = db
    .prepare("SELECT count(*) AS count FROM vec_ai_chunks")
    .get() as { count: number };
  return row.count;
}

export function listVectorChunkIds(): string[] {
  const db = getVecDb();
  const rows = db
    .prepare("SELECT chunk_id AS chunkId FROM vec_ai_chunks")
    .all() as { chunkId: string }[];
  return rows.map((row) => row.chunkId);
}

/** KNN search. Returns ids ordered by ascending distance (smaller = closer). */
export function searchNearestChunks(
  queryVec: Float32Array,
  limit: number
): { chunkId: string; distance: number }[] {
  const db = getVecDb();
  const rows = db
    .prepare(
      "SELECT chunk_id AS chunkId, distance FROM vec_ai_chunks " +
        "WHERE embedding MATCH ? ORDER BY distance LIMIT ?"
    )
    .all(
      Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength),
      limit
    ) as { chunkId: string; distance: number }[];
  return rows;
}

import "server-only";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export type Bucket = "tenant-private" | "tenant-public";

/**
 * Object storage used by server code only. Authorization happens before any call here (RLS on the asset row or an
 * explicit tenant + role check); this layer only moves bytes.
 */
export interface ObjectStorage {
  readonly kind: "supabase" | "local";
  put(bucket: Bucket, key: string, data: Buffer, contentType: string): Promise<void>;
  get(bucket: Bucket, key: string): Promise<Buffer>;
  copy(from: { bucket: Bucket; key: string }, to: { bucket: Bucket; key: string }): Promise<void>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[a-z0-9/_-]+\.(webp|jpg|png)$/;
export function assertObjectKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("invalid object key");
}

const enc = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** Supabase Storage over its REST API with the service role key (server only). */
export class SupabaseStorage implements ObjectStorage {
  readonly kind = "supabase" as const;
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }
  private base() {
    return `${this.url.replace(/\/+$/, "")}/storage/v1`;
  }

  async put(bucket: Bucket, key: string, data: Buffer, contentType: string) {
    assertObjectKey(key);
    const res = await this.fetchImpl(`${this.base()}/object/${bucket}/${enc(key)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "false", "Cache-Control": "max-age=31536000" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`storage upload failed (${res.status})`);
  }

  async get(bucket: Bucket, key: string) {
    assertObjectKey(key);
    const res = await this.fetchImpl(`${this.base()}/object/${bucket}/${enc(key)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`storage download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async copy(from: { bucket: Bucket; key: string }, to: { bucket: Bucket; key: string }) {
    assertObjectKey(from.key);
    assertObjectKey(to.key);
    const res = await this.fetchImpl(`${this.base()}/object/copy`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        bucketId: from.bucket,
        sourceKey: from.key,
        destinationBucket: to.bucket,
        destinationKey: to.key,
      }),
    });
    if (!res.ok) throw new Error(`storage copy failed (${res.status})`);
  }
}

/** Development only: files under data/local-storage. Never selected in production. */
export class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;
  constructor(private readonly root: string) {}

  private path(bucket: Bucket, key: string) {
    assertObjectKey(key);
    const p = resolve(this.root, bucket, key);
    if (!p.startsWith(resolve(this.root) + sep)) throw new Error("invalid object key");
    return p;
  }
  async put(bucket: Bucket, key: string, data: Buffer) {
    const p = this.path(bucket, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { flag: "wx" });
  }
  async get(bucket: Bucket, key: string) {
    return readFile(this.path(bucket, key));
  }
  async copy(from: { bucket: Bucket; key: string }, to: { bucket: Bucket; key: string }) {
    const dest = this.path(to.bucket, to.key);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(this.path(from.bucket, from.key), dest);
  }
}

export const LOCAL_STORAGE_ROOT = join(process.cwd(), "data", "local-storage");

export function defaultStorage(env: Record<string, string | undefined> = process.env): ObjectStorage {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStorage(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  if (env.NODE_ENV !== "production") return new LocalStorage(LOCAL_STORAGE_ROOT);
  throw new Error("Storage is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}

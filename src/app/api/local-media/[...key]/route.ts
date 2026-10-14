import { LocalStorage, LOCAL_STORAGE_ROOT } from "@/modules/media/storage";

/** Development only: serves approved public images stored on disk when Supabase Storage is not configured. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (process.env.NODE_ENV === "production" || process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response("not found", { status: 404 });
  const { key } = await params;
  try {
    const data = await new LocalStorage(LOCAL_STORAGE_ROOT).get("tenant-public", key.join("/"));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

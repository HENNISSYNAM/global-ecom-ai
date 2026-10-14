import "server-only";
import { getSql } from "./db";

/**
 * Explains why the database is unreachable without revealing secrets: only which variables are set, what kind of
 * Supabase host the URL points at, and the Postgres/driver error code.
 */
export type DbDiagnosis = {
  ok: boolean;
  problem: null | "missing_database_url" | "invalid_database_url" | "direct_host_ipv6" | "auth_failed" | "unreachable" | "schema_missing" | "other";
  host: "local" | "supabase_pooler" | "supabase_direct" | "other" | null;
  code: string | null;
  hint: string | null;
};

const HINTS: Record<NonNullable<DbDiagnosis["problem"]>, string> = {
  missing_database_url: "Chưa đặt biến DATABASE_URL trên Vercel (Settings → Environment Variables), rồi Redeploy.",
  invalid_database_url: "DATABASE_URL không phải chuỗi postgres://… hợp lệ. Copy lại từ Supabase → Connect.",
  direct_host_ipv6:
    "DATABASE_URL đang dùng địa chỉ trực tiếp db.<project>.supabase.co (chỉ IPv6, Vercel không kết nối được). Dùng chuỗi Transaction pooler (…pooler.supabase.com:6543) trong Supabase → Connect.",
  auth_failed: "Sai mật khẩu hoặc tên người dùng trong DATABASE_URL. Với pooler, user có dạng postgres.<project-ref>.",
  unreachable: "Không kết nối được tới máy chủ cơ sở dữ liệu. Kiểm tra host/port trong DATABASE_URL (pooler dùng port 6543).",
  schema_missing: "Đã kết nối nhưng thiếu bảng: chưa chạy các migration trong supabase/migrations/.",
  other: "Lỗi khác khi truy vấn cơ sở dữ liệu; xem Runtime Logs trên Vercel.",
};

function hostKind(url: URL): DbDiagnosis["host"] {
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return "local";
  if (url.hostname.endsWith(".pooler.supabase.com")) return "supabase_pooler";
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname)) return "supabase_direct";
  return "other";
}

export async function diagnoseDatabase(env: Record<string, string | undefined> = process.env): Promise<DbDiagnosis> {
  const raw = env.DATABASE_URL;
  const result = (problem: DbDiagnosis["problem"], host: DbDiagnosis["host"], code: string | null = null): DbDiagnosis => ({
    ok: problem === null,
    problem,
    host,
    code,
    hint: problem ? HINTS[problem] : null,
  });
  if (!raw) return result("missing_database_url", null);
  let url: URL;
  try {
    url = new URL(raw);
    if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("protocol");
  } catch {
    return result("invalid_database_url", null);
  }
  const host = hostKind(url);
  try {
    await getSql()`select 1 from public.storefronts limit 1`;
    return result(null, host);
  } catch (err) {
    const e = err as { code?: string };
    const code = e.code ?? null;
    if (code === "42P01") return result("schema_missing", host, code);
    if (code === "28P01" || code === "28000" || code === "XX000") return result("auth_failed", host, code);
    if (code && ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "CONNECT_TIMEOUT", "EAI_AGAIN"].includes(code))
      return result(host === "supabase_direct" ? "direct_host_ipv6" : "unreachable", host, code);
    return result("other", host, code);
  }
}

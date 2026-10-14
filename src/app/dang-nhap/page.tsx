import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor, devAuthEnabled, supabaseAuthConfigured } from "@/lib/auth";
import { LoginForm } from "@/components/seller/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Đăng nhập người bán", robots: { index: false, follow: false } };

const DEV_USERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", label: "Chủ Vườn Mẫu (DEMO)" },
  { id: "00000000-0000-4000-8000-0000000000b1", label: "Chủ Nông sản Thịnh Phát (dữ liệu local)" },
  { id: "00000000-0000-4000-8000-0000000000d1", label: "Chủ Hà Thịnh Phát (dữ liệu local)" },
];

export default async function LoginPage() {
  if ((await currentActor()).role === "authenticated") redirect("/ban-hang");
  return (
    <main className="sa-page">
      <h1 className="sa-title">Đăng nhập người bán</h1>
      {supabaseAuthConfigured() ? (
        <LoginForm supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!} anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!} />
      ) : devAuthEnabled() ? (
        <form className="sa-login" action="/api/dev-login" method="post">
          <p className="sa-callout sa-callout--warn">Chế độ phát triển: chưa cấu hình Supabase Auth. Chọn một tài khoản mẫu local.</p>
          {DEV_USERS.map((u) => (
            <button key={u.id} className="sa-btn sa-btn--ghost" type="submit" name="userId" value={u.id}>
              {u.label}
            </button>
          ))}
        </form>
      ) : (
        <p>Máy chủ chưa cấu hình đăng nhập (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).</p>
      )}
    </main>
  );
}

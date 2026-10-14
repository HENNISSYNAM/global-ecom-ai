"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState, type FormEvent } from "react";

/** Email + password sign-in / sign-up with Supabase Auth. Only the public anon key is used in the browser. */
export function LoginForm({ supabaseUrl, anonKey }: { supabaseUrl: string; anonKey: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    const supabase = createBrowserClient(supabaseUrl, anonKey);
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/ban-hang` } });
    setPending(false);
    if (error) {
      setMessage(mode === "signin" ? "Email hoặc mật khẩu chưa đúng." : `Không tạo được tài khoản: ${error.message}`);
      return;
    }
    if (mode === "signup" && !data.session) {
      setMessage("Đã gửi email xác nhận. Mở email, bấm liên kết, rồi quay lại đăng nhập.");
      return;
    }
    window.location.href = "/ban-hang";
  }

  return (
    <form className="sa-login" onSubmit={submit}>
      <label>
        Email
        <input className="sa-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Mật khẩu
        <input
          className="sa-input"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button className="sa-btn" type="submit" disabled={pending}>
        {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
      </button>
      <button type="button" className="sa-link" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "Chưa có tài khoản? Tạo mới" : "Đã có tài khoản? Đăng nhập"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

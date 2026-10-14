"use client";

import { useState, type FormEvent } from "react";
import { slugify } from "@/modules/seller/slug";

export function CreateShopForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/seller/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không tạo được cửa hàng.");
      return;
    }
    window.location.href = `/ban-hang/${data.tenantId}`;
  }

  return (
    <form className="sa-login" onSubmit={submit}>
      <label>
        Tên cửa hàng
        <input
          className="sa-input"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setSlug(slugify(e.target.value).slice(0, 60));
          }}
        />
      </label>
      <label>
        Địa chỉ gian hàng: /s/<strong>{slug || "ten-cua-hang"}</strong>
        <input
          className="sa-input"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          minLength={3}
          maxLength={60}
          value={slug}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
      </label>
      <button className="sa-btn" type="submit" disabled={pending}>
        Tạo cửa hàng
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Accepts a sent quote. One idempotency key per page view, so double clicks or retries return the same order. */
export function AcceptQuote({ token, quoteId, total }: { token: string; quoteId: string; total: string }) {
  const router = useRouter();
  const [key] = useState(() => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9-]/g, ""));
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/bao-gia/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId, idempotencyKey: key }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    router.refresh();
  }

  if (!confirming)
    return (
      <button type="button" className="sa-btn" onClick={() => setConfirming(true)}>
        Chấp nhận báo giá
      </button>
    );
  return (
    <div className="sa-callout">
      <p>
        Xác nhận đặt hàng theo báo giá này, tổng <strong>{total}</strong>? Người bán sẽ liên hệ để giao hàng theo điều kiện đã ghi.
      </p>
      <div className="sa-actions">
        <button type="button" className="sa-btn" disabled={pending} onClick={accept}>
          Xác nhận đặt hàng
        </button>
        <button type="button" className="sa-btn sa-btn--ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Quay lại
        </button>
      </div>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

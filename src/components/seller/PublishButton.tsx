"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Publishes the current draft (layout + approved catalog snapshot). */
export function PublishButton({ storefrontId, revision, slug }: { storefrontId: string; revision: number; slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; error: string | null; done: boolean }>({ pending: false, error: null, done: false });

  async function publish() {
    setState({ pending: true, error: null, done: false });
    const res = await fetch(`/api/seller/storefronts/${storefrontId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const pending: string[] = Array.isArray(data?.details?.pending) ? data.details.pending : [];
      setState({ pending: false, done: false, error: (data?.error ?? "Xuất bản không thành công.") + (pending[0] ? ` Ví dụ: "${pending[0]}".` : "") });
      return;
    }
    setState({ pending: false, error: null, done: true });
    router.refresh();
  }

  return (
    <div className="sa-publish">
      <button type="button" className="sa-btn" disabled={state.pending} onClick={publish}>
        Xuất bản gian hàng
      </button>
      {state.done && (
        <a className="sa-link" href={`/s/${slug}`} target="_blank" rel="noreferrer">
          Đã xuất bản — xem trang
        </a>
      )}
      {state.error && (
        <p className="sa-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

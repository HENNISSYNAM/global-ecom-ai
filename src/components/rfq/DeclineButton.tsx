"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeclineButton({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="sa-btn sa-btn--ghost"
      disabled={pending}
      onClick={async () => {
        if (!window.confirm("Từ chối yêu cầu này? Báo giá đang hiệu lực (nếu có) sẽ bị thu hồi.")) return;
        setPending(true);
        await fetch(`/api/seller/rfqs/${rfqId}/decline`, { method: "POST" });
        setPending(false);
        router.refresh();
      }}
    >
      Từ chối yêu cầu
    </button>
  );
}

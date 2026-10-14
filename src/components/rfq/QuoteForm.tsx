"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Item = { id: string; productName: string; packLabel: string | null; saleUnit: string; quantity: string; listPriceMinor: string | null };
type Line = { rfqItemId?: string; description: string; saleUnit: string; quantity: string; unitPriceMinor: string };

const UNITS: [string, string][] = [
  ["kg", "kg"],
  ["bag", "túi"],
  ["box", "hộp"],
  ["carton", "thùng"],
  ["piece", "cái"],
];

const digits = (s: string) => s.replace(/\D/g, "");
const money = (n: bigint) => `${n.toLocaleString("vi-VN")} ₫`;

/** Exact line total in đồng, computed with integers (quantity has at most 3 decimals). Mirrors the database check. */
export function lineTotal(quantity: string, price: string): bigint | null {
  const q = quantity.trim().replace(",", ".");
  const p = digits(price);
  if (!/^\d{1,10}(\.\d{1,3})?$/.test(q) || !p) return null;
  const [i = "0", f = ""] = q.split(".");
  const milli = BigInt(i) * 1000n + BigInt((f + "000").slice(0, 3));
  const raw = milli * BigInt(p);
  return (raw + 500n) / 1000n; // round half up, like Postgres round() for positive numerics
}

export function QuoteForm({ rfqId, items, previousVersion }: { rfqId: string; items: Item[]; previousVersion: number | null }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() =>
    items.map((i) => ({
      rfqItemId: i.id,
      description: i.packLabel ? `${i.productName} (${i.packLabel})` : i.productName,
      saleUnit: i.saleUnit,
      quantity: i.quantity.replace(/\.?0+$/, ""),
      unitPriceMinor: i.listPriceMinor ?? "",
    })),
  );
  const [fee, setFee] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [note, setNote] = useState("");
  const [validDays, setValidDays] = useState(3);
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });

  const setLine = (n: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, i) => (i === n ? { ...l, [k]: v } : l)));
  const totals = lines.map((l) => lineTotal(l.quantity, l.unitPriceMinor));
  const subtotal = totals.reduce<bigint>((a, t) => a + (t ?? 0n), 0n);
  const total = subtotal + (digits(fee) ? BigInt(digits(fee)) : 0n);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ pending: true, error: null });
    const res = await fetch(`/api/seller/rfqs/${rfqId}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: lines.map((l) => ({ ...l, rfqItemId: l.rfqItemId || undefined })),
        deliveryFeeMinor: fee || undefined,
        deliveryNote: deliveryNote || undefined,
        paymentTerms: paymentTerms || undefined,
        note: note || undefined,
        validDays,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setState({ pending: false, error: data?.error ?? "Gửi báo giá không thành công." });
      return;
    }
    setState({ pending: false, error: null });
    router.refresh();
  }

  return (
    <form className="sa-login sa-quote" onSubmit={submit}>
      <p className="sa-q">{previousVersion ? `Gửi báo giá lần ${previousVersion + 1} (thay bản cũ)` : "Lập báo giá"}</p>
      {lines.map((l, n) => (
        <div className="sa-quote-line" key={n}>
          <input className="sa-input" aria-label="Mặt hàng" value={l.description} maxLength={300} onChange={(e) => setLine(n, "description", e.target.value)} />
          <div className="sa-row">
            <label>
              Số lượng
              <input className="sa-input" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(n, "quantity", e.target.value)} />
            </label>
            <label>
              Đơn vị
              <select className="sa-input" value={l.saleUnit} onChange={(e) => setLine(n, "saleUnit", e.target.value)}>
                {UNITS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Đơn giá (đồng)
              <input className="sa-input" inputMode="numeric" value={l.unitPriceMinor} placeholder="vd. 55000" onChange={(e) => setLine(n, "unitPriceMinor", e.target.value)} />
            </label>
          </div>
          <p className="sa-muted">
            Thành tiền: {totals[n] !== null ? money(totals[n]!) : "—"}
            {lines.length > 1 && (
              <>
                {" · "}
                <button type="button" className="sa-link" onClick={() => setLines((ls) => ls.filter((_, i) => i !== n))}>
                  Bỏ dòng
                </button>
              </>
            )}
          </p>
        </div>
      ))}
      <button type="button" className="sa-link" onClick={() => setLines((ls) => [...ls, { description: "", saleUnit: "kg", quantity: "", unitPriceMinor: "" }])}>
        + Thêm dòng
      </button>
      <div className="sa-row">
        <label>
          Phí giao (đồng, để trống nếu báo sau)
          <input className="sa-input" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <label>
          Hiệu lực (ngày)
          <input className="sa-input" type="number" min={1} max={30} value={validDays} onChange={(e) => setValidDays(Number(e.target.value) || 3)} />
        </label>
      </div>
      <label>
        Giao hàng
        <input className="sa-input" maxLength={500} value={deliveryNote} placeholder="vd. Giao sáng 6–8h, trong 1 ngày sau khi chốt" onChange={(e) => setDeliveryNote(e.target.value)} />
      </label>
      <label>
        Thanh toán
        <input className="sa-input" maxLength={500} value={paymentTerms} placeholder="vd. Chuyển khoản khi nhận hàng" onChange={(e) => setPaymentTerms(e.target.value)} />
      </label>
      <label>
        Ghi chú
        <textarea className="sa-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="sa-q">Tổng: {money(total)}</p>
      {state.error && (
        <p className="sa-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="sa-btn" disabled={state.pending}>
        Gửi báo giá
      </button>
      <p className="sa-muted">Báo giá đã gửi không sửa được; muốn đổi thì gửi bản mới, bản cũ tự hết hiệu lực.</p>
    </form>
  );
}

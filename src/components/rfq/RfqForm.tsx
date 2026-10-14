"use client";

import { useState, type FormEvent } from "react";

export type RfqProduct = {
  productId: string;
  variantId: string;
  name: string;
  packLabel: string | null;
  unitLabel: string;
  minOrderQty: string;
};

const BUYER_TYPES: [string, string][] = [
  ["restaurant", "Nhà hàng, quán ăn"],
  ["kitchen", "Bếp ăn công nghiệp"],
  ["retailer", "Cửa hàng, sạp chợ"],
  ["distributor", "Đại lý, nhà phân phối"],
  ["factory", "Nhà máy chế biến"],
  ["household", "Hộ gia đình"],
  ["other", "Khác"],
];

/**
 * Wholesale request for quote. Collects the five facts a seller needs to quote (item/pack, quantity, frequency,
 * delivery place/date, buyer and contact). Nothing is priced here: the seller replies with a quote link.
 */
export function RfqForm({ storeSlug, products }: { storeSlug: string; products: RfqProduct[] }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    buyerName: "",
    buyerPhone: "",
    buyerEmail: "",
    buyerType: "restaurant",
    companyName: "",
    deliveryArea: "",
    neededBy: "",
    frequency: "",
    needVatInvoice: false,
    note: "",
    website: "",
  });
  const [state, setState] = useState<{ pending: boolean; error: string | null; done: { reference: string; link: string } | null }>({
    pending: false,
    error: null,
    done: null,
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = products
      .filter((p) => qty[p.variantId]?.trim())
      .map((p) => ({ productId: p.productId, variantId: p.variantId, quantity: qty[p.variantId]!.trim() }));
    if (!items.length) {
      setState({ pending: false, done: null, error: "Nhập số lượng cho ít nhất một sản phẩm." });
      return;
    }
    setState({ pending: true, error: null, done: null });
    const res = await fetch(`/api/s/${storeSlug}/rfq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, items }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setState({ pending: false, done: null, error: data?.error ?? "Gửi không thành công, vui lòng thử lại." });
      return;
    }
    setState({ pending: false, error: null, done: { reference: data.reference, link: data.link } });
  }

  if (state.done) {
    const url = typeof window !== "undefined" ? `${window.location.origin}${state.done.link}` : state.done.link;
    return (
      <div className="sf-rfq-done" role="status">
        <p className="sf-eyebrow">Đã gửi yêu cầu {state.done.reference}</p>
        <p>
          Người bán sẽ xem và gửi báo giá. <strong>Hãy lưu đường dẫn dưới đây</strong> để xem báo giá và chấp nhận khi đã
          có — đường dẫn này là riêng của bạn, không chia sẻ cho người khác.
        </p>
        <p className="sf-rfq-link">
          <a href={state.done.link}>{url}</a>
        </p>
        <button type="button" className="sf-btn sf-btn--ghost" onClick={() => navigator.clipboard?.writeText(url)}>
          Sao chép đường dẫn
        </button>
      </div>
    );
  }

  return (
    <form className="sf-rfq-form" onSubmit={submit}>
      <fieldset>
        <legend className="sf-eyebrow">1. Mặt hàng và số lượng</legend>
        {products.length ? (
          <ul className="sf-rfq-items">
            {products.map((p) => (
              <li key={p.variantId}>
                <label htmlFor={`q-${p.variantId}`}>
                  <span className="sf-rfq-name">{p.name}</span>
                  <span className="sf-rfq-meta">
                    {p.packLabel ? `${p.packLabel} · ` : ""}tối thiểu {p.minOrderQty.replace(/\.?0+$/, "").replace(".", ",")} {p.unitLabel}
                  </span>
                </label>
                <span className="sf-rfq-qty">
                  <input
                    id={`q-${p.variantId}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={qty[p.variantId] ?? ""}
                    onChange={(e) => setQty((q) => ({ ...q, [p.variantId]: e.target.value }))}
                  />
                  <span>{p.unitLabel}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sf-empty">Cửa hàng chưa xuất bản sản phẩm nào để hỏi giá.</p>
        )}
        <label className="sf-field">
          Tần suất đặt (không bắt buộc)
          <input value={form.frequency} maxLength={120} placeholder="vd. Hằng ngày, 2 lần/tuần, một lần" onChange={(e) => set("frequency", e.target.value)} />
        </label>
      </fieldset>

      <fieldset>
        <legend className="sf-eyebrow">2. Giao hàng</legend>
        <label className="sf-field">
          Nơi giao (quận/huyện, tỉnh)
          <input required minLength={2} maxLength={300} value={form.deliveryArea} onChange={(e) => set("deliveryArea", e.target.value)} />
        </label>
        <label className="sf-field">
          Ngày cần hàng (không bắt buộc)
          <input type="date" value={form.neededBy} onChange={(e) => set("neededBy", e.target.value)} />
        </label>
      </fieldset>

      <fieldset>
        <legend className="sf-eyebrow">3. Người đặt</legend>
        <label className="sf-field">
          Bạn là
          <select value={form.buyerType} onChange={(e) => set("buyerType", e.target.value)}>
            {BUYER_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="sf-field">
          Họ tên
          <input required minLength={2} maxLength={120} autoComplete="name" value={form.buyerName} onChange={(e) => set("buyerName", e.target.value)} />
        </label>
        <label className="sf-field">
          Điện thoại/Zalo
          <input required type="tel" autoComplete="tel" value={form.buyerPhone} onChange={(e) => set("buyerPhone", e.target.value)} />
        </label>
        <label className="sf-field">
          Email (không bắt buộc)
          <input type="email" autoComplete="email" value={form.buyerEmail} onChange={(e) => set("buyerEmail", e.target.value)} />
        </label>
        <label className="sf-field">
          Tên cơ sở (không bắt buộc)
          <input maxLength={200} value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
        </label>
        <label className="sf-check">
          <input type="checkbox" checked={form.needVatInvoice} onChange={(e) => set("needVatInvoice", e.target.checked)} />
          Cần hóa đơn VAT
        </label>
        <label className="sf-field">
          Ghi chú (không bắt buộc)
          <textarea rows={3} maxLength={1000} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </label>
        <label className="visually-hidden" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </fieldset>

      {state.error && (
        <p className="sf-rfq-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="sf-btn" disabled={state.pending || !products.length}>
        Gửi yêu cầu báo giá
      </button>
      <p className="sf-note">Gửi yêu cầu chưa phải đặt hàng. Giá, phí giao và thời gian giao do người bán xác nhận trong báo giá.</p>
    </form>
  );
}

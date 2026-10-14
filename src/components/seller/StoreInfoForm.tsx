"use client";

import { useState, type FormEvent } from "react";
import type { Brand } from "@/modules/storefront/brand";
import type { Section } from "@/modules/storefront/sections";
import { applyInfo, infoFromDraft, type StoreInfo } from "@/modules/seller/store-info";

/** Edits the storefront texts in the draft. The public page changes only after "Xuất bản gian hàng". */
export function StoreInfoForm({
  storefrontId,
  revision,
  brand,
  sections,
}: {
  storefrontId: string;
  revision: number;
  brand: Partial<Brand> | null;
  sections: Section[];
}) {
  const [info, setInfo] = useState<StoreInfo>(() => infoFromDraft(brand, sections));
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof StoreInfo, v: string) => setInfo((i) => ({ ...i, [k]: v }));
  const setFact = (fi: number, ii: number, v: string) =>
    setInfo((x) => ({
      ...x,
      facts: x.facts.map((f, i) => (i === fi ? { ...f, items: f.items.map((it, j) => (j === ii ? { ...it, body: v } : it)) } : f)),
    }));
  const faq = [...info.faq, ...Array.from({ length: Math.max(0, 3 - info.faq.length) }, () => ({ question: "", answer: "" }))].slice(0, 8);
  const setFaq = (i: number, k: "question" | "answer", v: string) =>
    setInfo((x) => ({ ...x, faq: faq.map((f, j) => (j === i ? { ...f, [k]: v } : f)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setStatus(null);
    const next = applyInfo(brand, sections, info);
    const res = await fetch(`/api/seller/storefronts/${storefrontId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, ...next }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setStatus(data?.error ?? "Lưu không thành công.");
      return;
    }
    window.location.reload();
  }

  const field = (k: keyof StoreInfo, label: string, opts: { max: number; area?: boolean; placeholder?: string; type?: string } ) => (
    <label>
      {label}
      {opts.area ? (
        <textarea className="sa-input" rows={3} maxLength={opts.max} value={info[k] as string} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className="sa-input" type={opts.type ?? "text"} maxLength={opts.max} value={info[k] as string} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value)} />
      )}
    </label>
  );

  return (
    <details className="sa-info">
      <summary>Thông tin cửa hàng (giới thiệu, câu chuyện, hỏi đáp)</summary>
      <form className="sa-login" onSubmit={submit}>
        <p className="sa-muted">Chỉ ghi điều bạn xác nhận được. Ô để trống sẽ được ẩn trên gian hàng.</p>
        {field("businessName", "Tên cửa hàng", { max: 200 })}
        {field("tagline", "Câu giới thiệu ngắn", { max: 140, placeholder: "vd. Tỏi, hành, gừng sơ chế sẵn cho bếp ăn" })}
        {field("phone", "Điện thoại/Zalo", { max: 20, type: "tel" })}
        {field("email", "Email", { max: 200, type: "email" })}
        {field("address", "Địa chỉ", { max: 300 })}
        {field("announcement", "Dòng thông báo đầu trang (để trống để ẩn)", { max: 140 })}
        <p className="sa-step">Khối mở đầu</p>
        {field("heroEyebrow", "Nhãn nhỏ", { max: 60, placeholder: "vd. Nông sản sơ chế · TP.HCM" })}
        {field("heroLead", "Tiêu đề (chữ nghiêng)", { max: 80, placeholder: "vd. Nông sản sơ chế" })}
        {field("heroEmphasis", "Tiêu đề nhấn (chữ in hoa)", { max: 40, placeholder: "vd. cho bếp và nhà hàng" })}
        {field("heroBody", "Đoạn giới thiệu", { max: 400, area: true })}
        <p className="sa-step">Câu chuyện (không bắt buộc)</p>
        {field("storyTitle", "Tiêu đề", { max: 120 })}
        {field("storyBody", "Nội dung: ai làm, ở đâu, sơ chế thế nào", { max: 1500, area: true })}
        {info.facts.map((f, fi) => (
          <div key={f.id} className="sa-field">
            <p className="sa-step">{f.title} (để trống một dòng để ẩn dòng đó)</p>
            {f.items.map((it, ii) => (
              <label key={ii}>
                {it.title}
                <textarea className="sa-input" rows={2} maxLength={400} value={it.body} onChange={(e) => setFact(fi, ii, e.target.value)} />
              </label>
            ))}
          </div>
        ))}
        <p className="sa-step">Hỏi đáp (không bắt buộc, hiển thị cho khách và công cụ tìm kiếm)</p>
        {faq.map((f, i) => (
          <div key={i} className="sa-field">
            <input className="sa-input" maxLength={200} placeholder={`Câu hỏi ${i + 1}, vd. Đơn tối thiểu bao nhiêu?`} value={f.question} onChange={(e) => setFaq(i, "question", e.target.value)} />
            <textarea className="sa-input" rows={2} maxLength={800} placeholder="Câu trả lời đã xác nhận" value={f.answer} onChange={(e) => setFaq(i, "answer", e.target.value)} />
          </div>
        ))}
        <button className="sa-btn" type="submit" disabled={pending}>
          Lưu bản nháp
        </button>
        {status && <p role="alert">{status}</p>}
      </form>
    </details>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { ProductDraft } from "@/modules/ai/product-draft";
import {
  CATEGORY_CHOICES,
  completeness,
  COUNTRY_CHOICES,
  EMPTY_SHEET,
  PROCESSING_CHOICES,
  sheetFromDraft,
  sheetToPayload,
  STEPS,
  UNIT_LABEL,
  validateStep,
  type SaleUnit,
  type SheetState,
  type StepId,
  type Suggested,
} from "@/modules/seller/sheet";
import { shrinkPhoto } from "./shrink";

type Job = {
  id: string;
  status: "queued" | "running" | "succeeded" | "dead";
  lastError: string | null;
  provider: string | null;
  draft: ProductDraft | null;
  assetIds: string[];
};

type Phase = "idle" | "uploading" | "analyzing" | "asking" | "review" | "saving" | "done";
type Saved = { productId: string; slug: string; status: "draft" | "approved"; missing: string[] };

const MAX_PHOTOS = 8;
const photoUrl = (id: string) => `/api/seller/assets/${id}`;

const MISSING_LABEL: Record<string, string> = {
  origin_country: "xuất xứ",
  processing: "cách sơ chế",
  storage_instructions: "bảo quản",
  variant: "quy cách bán",
  active_offer: "giá hoặc 'liên hệ báo giá'",
};

/**
 * Seller assistant: photos → AI draft → one question at a time → product sheet → save/approve → publish.
 * AI suggestions are pre-filled answers marked "AI gợi ý"; nothing is saved until the seller confirms.
 */
export function SellerAssistant({
  tenantId,
  storefront,
}: {
  tenantId: string;
  storefront: { id: string; slug: string; revision: number; status: string } | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [localPreviews, setLocalPreviews] = useState<string[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [sheet, setSheet] = useState<SheetState>(EMPTY_SHEET);
  const [suggested, setSuggested] = useState<Suggested>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [answered, setAnswered] = useState<StepId[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const revision = storefront?.revision ?? 0;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [phase, stepIndex, job?.status]);

  // Poll the analysis job until it finishes.
  useEffect(() => {
    if (phase !== "analyzing" || !job) return;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/seller/jobs/${job.id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (stop) return;
      if (!res.ok) {
        setError(data?.error ?? "Không đọc được kết quả phân tích.");
        return;
      }
      setJob(data);
      if (data.status === "succeeded") {
        const { sheet: s, suggested: sg } = sheetFromDraft(data.draft);
        setSheet(s);
        setSuggested(sg);
        setStepIndex(0);
        setAnswered([]);
        setPhase("asking");
      } else if (data.status === "dead") {
        setPhase("asking"); // continue without AI: the seller fills every field
      }
    };
    void tick();
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [phase, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    localPreviews.forEach((u) => URL.revokeObjectURL(u));
    setLocalPreviews([]);
    setJob(null);
    setSheet(EMPTY_SHEET);
    setSuggested({});
    setStepIndex(0);
    setAnswered([]);
    setSaved(null);
    setError(null);
    setNote("");
    setPhase("idle");
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setLocalPreviews(files.map((f) => URL.createObjectURL(f)));
    setPhase("uploading");
    const form = new FormData();
    const shrunk = await Promise.all(files.map((f) => shrinkPhoto(f)));
    shrunk.forEach((b, i) => form.append("photos", b, files[i]!.name));
    if (note.trim()) form.append("note", note.trim());
    const res = await fetch(`/api/seller/${tenantId}/photos`, { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Tải ảnh không thành công.");
      setPhase("idle");
      return;
    }
    setJob({ id: data.jobId, status: "queued", lastError: null, provider: null, draft: null, assetIds: data.photos.map((p: { id: string }) => p.id) });
    setPhase("analyzing");
  }

  const set = <K extends keyof SheetState>(k: K, v: SheetState[K]) => {
    setSheet((s) => ({ ...s, [k]: v }));
    setSuggested((sg) => ({ ...sg, [k]: undefined }));
  };

  const step = STEPS[stepIndex];
  const stepError = step ? validateStep(step.id, sheet) : null;

  function confirmStep(skip = false) {
    if (!step) return;
    if (!skip && stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setAnswered((a) => (a.includes(step.id) ? a : [...a, step.id]));
    if (stepIndex + 1 >= STEPS.length) setPhase("review");
    else setStepIndex(stepIndex + 1);
  }

  function editStep(id: StepId) {
    setStepIndex(STEPS.findIndex((s) => s.id === id));
    setPhase("asking");
  }

  async function save(approve: boolean) {
    setError(null);
    setPhase("saving");
    const body = sheetToPayload(sheet, { jobId: job?.id ?? null, photoAssetIds: job?.assetIds ?? [], approve });
    const res = await fetch(`/api/seller/${tenantId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Lưu sản phẩm không thành công.");
      setPhase("review");
      return;
    }
    setSaved(data);
    setPhase("done");
    router.refresh(); // update the product list beside the chat
  }

  async function publish() {
    if (!storefront) return;
    setError(null);
    const res = await fetch(`/api/seller/storefronts/${storefront.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const pending: string[] = Array.isArray(data?.details?.pending) ? data.details.pending : [];
      setError(
        (data?.error ?? "Xuất bản không thành công.") +
          (pending.length ? ` Ví dụ: "${pending[0]}". Mở "Thông tin cửa hàng" để thay nội dung này.` : ""),
      );
      return;
    }
    setPublished(`/s/${storefront.slug}`);
    router.refresh();
  }

  const draft = job?.draft ?? null;
  const photos = job?.assetIds.length ? job.assetIds.map(photoUrl) : localPreviews;
  const score = completeness(sheet);

  return (
    <section className="sa" aria-label="Trợ lý tạo sản phẩm">
      <div className="sa-log" role="log" aria-live="polite">
        <Bot>
          <p>
            Chào bạn! Gửi mình <strong>3–8 ảnh của một sản phẩm</strong>, mình sẽ xem ảnh, gợi ý tên, cách sơ chế, mô tả, rồi hỏi bạn
            những thông tin ảnh không thể cho biết (xuất xứ, quy cách, đơn tối thiểu, giá, bảo quản).
          </p>
          <ul className="sa-tips">
            <li>Ảnh 1: toàn cảnh sản phẩm trên nền sạch, ánh sáng tự nhiên.</li>
            <li>Ảnh 2: cận cảnh để thấy độ đều, màu, độ tươi.</li>
            <li>Ảnh 3: bao bì/quy cách đóng gói, nhãn (nếu có).</li>
            <li>Ảnh 4: sản phẩm cạnh vật so sánh kích thước hoặc trên cân.</li>
          </ul>
        </Bot>

        {photos.length > 0 && (
          <Me>
            <div className="sa-photos">
              {photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`Ảnh sản phẩm ${i + 1}`} width={88} height={88} />
              ))}
            </div>
            {note.trim() && <p className="sa-note">{note}</p>}
          </Me>
        )}

        {(phase === "uploading" || phase === "analyzing") && (
          <Bot>
            <p className="sa-wait">{phase === "uploading" ? "Đang tải ảnh lên…" : job?.status === "running" ? "AI đang xem ảnh…" : "Đang xếp hàng phân tích…"}</p>
            {job?.lastError && <p className="sa-muted">Lần trước chưa được ({job.lastError}). Mình đang thử lại.</p>}
          </Bot>
        )}

        {job && phase !== "uploading" && phase !== "analyzing" && (
          <Bot>
            {job.status === "dead" ? (
              <p>AI chưa phân tích được ảnh lần này. Mình vẫn hỏi bạn từng thông tin để tạo sản phẩm.</p>
            ) : draft?.mock ? (
              <p>
                <strong>Chưa dùng AI:</strong> máy chủ chưa cấu hình nhà cung cấp AI nên mình không đọc được ảnh. Bạn trả lời các câu
                hỏi bên dưới để tạo sản phẩm.
              </p>
            ) : (
              <>
                <p>Mình đã xem ảnh. Những gì mình thấy:</p>
                {draft?.observations.length ? (
                  <ul>{draft.observations.map((o, i) => <li key={i}>{o.text}</li>)}</ul>
                ) : (
                  <p className="sa-muted">Không ghi nhận được chi tiết rõ ràng.</p>
                )}
              </>
            )}
            {draft?.photoFeedback.length ? (
              <div className="sa-callout">
                <strong>Góp ý ảnh:</strong>
                <ul>{draft.photoFeedback.map((p, i) => <li key={i}>{p.issue}</li>)}</ul>
              </div>
            ) : null}
            {draft?.claimWarnings.length ? (
              <div className="sa-callout sa-callout--warn">
                <strong>Cần giấy tờ trước khi ghi:</strong> {draft.claimWarnings.join(", ")}. Mình đã bỏ các cụm này khỏi mô tả gợi ý.
              </div>
            ) : null}
          </Bot>
        )}

        {(phase === "asking" || phase === "review" || phase === "saving" || phase === "done") &&
          STEPS.slice(0, phase === "asking" ? stepIndex : STEPS.length).map((s) =>
            answered.includes(s.id) ? (
              <div key={s.id}>
                <Bot compact>
                  <p>{s.question}</p>
                </Bot>
                <Me>
                  <p>{answerText(s.id, sheet) || <em>Bỏ qua</em>}</p>
                  {phase !== "done" && phase !== "saving" && (
                    <button type="button" className="sa-link" onClick={() => editStep(s.id)}>
                      Sửa
                    </button>
                  )}
                </Me>
              </div>
            ) : null,
          )}

        {phase === "asking" && step && (
          <Bot>
            <p className="sa-step">
              Câu {stepIndex + 1}/{STEPS.length}
              {step.optional ? " · không bắt buộc" : ""}
            </p>
            <p className="sa-q">{step.question}</p>
            <p className="sa-muted">{step.why}</p>
            <StepInput id={step.id} sheet={sheet} suggested={suggested} set={set} />
            <div className="sa-actions">
              <button type="button" className="sa-btn" onClick={() => confirmStep()}>
                {stepHasSuggestion(step.id, suggested) ? "Đúng, xác nhận" : "Tiếp"}
              </button>
              {step.optional && (
                <button type="button" className="sa-btn sa-btn--ghost" onClick={() => confirmStep(true)}>
                  Bỏ qua
                </button>
              )}
            </div>
          </Bot>
        )}

        {(phase === "review" || phase === "saving") && (
          <Bot>
            <p className="sa-q">Phiếu sản phẩm</p>
            <p className="sa-muted">
              Độ đầy đủ: {score.filled}/{score.total}
              {score.missing.length ? ` · còn thiếu: ${score.missing.join(", ")}` : " · đủ thông tin"}
            </p>
            <dl className="sa-sheet">
              {STEPS.map((s) => (
                <div key={s.id}>
                  <dt>{s.question}</dt>
                  <dd>{answerText(s.id, sheet) || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="sa-muted">
              &quot;Đưa lên gian hàng&quot; sẽ duyệt sản phẩm và ảnh. Trang công khai chỉ thay đổi khi bạn bấm Xuất bản gian hàng.
            </p>
            <div className="sa-actions">
              <button type="button" className="sa-btn" disabled={phase === "saving"} onClick={() => save(true)}>
                Lưu và đưa lên gian hàng
              </button>
              <button type="button" className="sa-btn sa-btn--ghost" disabled={phase === "saving"} onClick={() => save(false)}>
                Lưu nháp
              </button>
            </div>
          </Bot>
        )}

        {phase === "done" && saved && (
          <Bot>
            {saved.status === "approved" ? (
              <p>
                Đã lưu và duyệt <strong>{sheet.name}</strong>. Sản phẩm sẽ hiện trên trang công khai sau khi bạn xuất bản gian hàng.
              </p>
            ) : saved.missing.length ? (
              <p>Đã lưu nháp. Chưa duyệt được vì còn thiếu: {saved.missing.map((m) => MISSING_LABEL[m] ?? m).join(", ")}.</p>
            ) : (
              <p>Đã lưu nháp {sheet.name}.</p>
            )}
            <div className="sa-actions">
              {storefront && saved.status === "approved" && !published && (
                <button type="button" className="sa-btn" onClick={publish}>
                  Xuất bản gian hàng
                </button>
              )}
              <button type="button" className="sa-btn sa-btn--ghost" onClick={reset}>
                Thêm sản phẩm khác
              </button>
            </div>
            {published && (
              <p>
                Đã xuất bản. Xem gian hàng:{" "}
                <a href={published} target="_blank" rel="noreferrer">
                  {published}
                </a>
              </p>
            )}
          </Bot>
        )}

        {error && (
          <p className="sa-error" role="alert">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {phase === "idle" && (
        <div className="sa-composer">
          <label className="visually-hidden" htmlFor="sa-note">
            Ghi chú cho AI (không bắt buộc)
          </label>
          <input
            id="sa-note"
            className="sa-input"
            placeholder="Ghi chú (không bắt buộc), vd. tỏi bóc vỏ hàng loại 1"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={onFiles} />
          <button type="button" className="sa-btn" onClick={() => fileRef.current?.click()}>
            Chọn ảnh sản phẩm
          </button>
        </div>
      )}
    </section>
  );
}

function Bot({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={`sa-msg sa-msg--bot${compact ? " sa-msg--compact" : ""}`}>{children}</div>;
}
function Me({ children }: { children: ReactNode }) {
  return <div className="sa-msg sa-msg--me">{children}</div>;
}

function stepHasSuggestion(id: StepId, sg: Suggested): boolean {
  const keys: Partial<Record<StepId, (keyof SheetState)[]>> = {
    name: ["name"],
    category: ["category"],
    processing: ["processing"],
    unit: ["saleUnit", "packDescription"],
    storage: ["storageInstructions"],
    copy: ["summary", "description"],
  };
  return (keys[id] ?? []).some((k) => sg[k]);
}

function AiBadge({ show }: { show?: boolean }) {
  return show ? <span className="sa-badge">AI gợi ý · bạn kiểm tra</span> : null;
}

function Chips<T extends string>({ options, value, onPick }: { options: { value: T; label: string }[]; value: string; onPick: (v: T) => void }) {
  return (
    <div className="sa-chips" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className="sa-chip" aria-pressed={value === o.value} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StepInput({
  id,
  sheet: s,
  suggested: sg,
  set,
}: {
  id: StepId;
  sheet: SheetState;
  suggested: Suggested;
  set: <K extends keyof SheetState>(k: K, v: SheetState[K]) => void;
}) {
  switch (id) {
    case "name":
      return (
        <div className="sa-field">
          <AiBadge show={sg.name} />
          <input className="sa-input" aria-label="Tên sản phẩm" maxLength={200} value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="vd. Tỏi bóc vỏ" />
        </div>
      );
    case "category":
      return (
        <div className="sa-field">
          <AiBadge show={sg.category} />
          <Chips options={CATEGORY_CHOICES.map((c) => ({ value: c.slug, label: c.label }))} value={s.category} onPick={(v) => set("category", v)} />
        </div>
      );
    case "processing":
      return (
        <div className="sa-field">
          <AiBadge show={sg.processing} />
          <Chips options={PROCESSING_CHOICES.map((p) => ({ value: p, label: p }))} value={s.processing} onPick={(v) => set("processing", v)} />
          <input className="sa-input" aria-label="Cách sơ chế" maxLength={200} value={s.processing} onChange={(e) => set("processing", e.target.value)} placeholder="hoặc ghi cụ thể, vd. Bóc vỏ, để nguyên tép" />
        </div>
      );
    case "origin":
      return (
        <div className="sa-field">
          <Chips options={COUNTRY_CHOICES.map((c) => ({ value: c.code, label: c.label }))} value={s.originCountry} onPick={(v) => set("originCountry", v)} />
          <input
            className="sa-input"
            aria-label="Mã quốc gia khác"
            maxLength={2}
            value={COUNTRY_CHOICES.some((c) => c.code === s.originCountry) ? "" : s.originCountry}
            onChange={(e) => set("originCountry", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            placeholder="Nước khác: mã 2 chữ (vd. KR)"
          />
          <input className="sa-input" aria-label="Vùng/tỉnh" maxLength={120} value={s.originRegion} onChange={(e) => set("originRegion", e.target.value)} placeholder="Vùng/tỉnh (không bắt buộc), vd. Hải Dương" />
        </div>
      );
    case "unit":
      return (
        <div className="sa-field">
          <AiBadge show={sg.saleUnit || sg.packDescription} />
          <Chips options={(Object.keys(UNIT_LABEL) as SaleUnit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} value={s.saleUnit} onPick={(v) => set("saleUnit", v)} />
          {s.saleUnit && s.saleUnit !== "kg" && (
            <input className="sa-input" inputMode="decimal" aria-label="Khối lượng mỗi gói (kg)" value={s.packNetWeightKg} onChange={(e) => set("packNetWeightKg", e.target.value)} placeholder={`Mỗi ${UNIT_LABEL[s.saleUnit]} nặng bao nhiêu kg? vd. 0.5`} />
          )}
          <input className="sa-input" aria-label="Mô tả bao bì" maxLength={200} value={s.packDescription} onChange={(e) => set("packDescription", e.target.value)} placeholder="Bao bì (không bắt buộc), vd. Túi hút chân không" />
        </div>
      );
    case "moq": {
      const unit = s.saleUnit ? UNIT_LABEL[s.saleUnit] : "đơn vị";
      return (
        <div className="sa-field sa-row">
          <label>
            Tối thiểu ({unit})
            <input className="sa-input" inputMode="decimal" value={s.minOrderQty} onChange={(e) => set("minOrderQty", e.target.value)} placeholder="vd. 10" />
          </label>
          <label>
            Bước tăng ({unit})
            <input className="sa-input" inputMode="decimal" value={s.orderStepQty} onChange={(e) => set("orderStepQty", e.target.value)} placeholder="mặc định 1" />
          </label>
        </div>
      );
    }
    case "price": {
      const unit = s.saleUnit ? UNIT_LABEL[s.saleUnit] : "đơn vị";
      return (
        <div className="sa-field">
          <Chips
            options={[
              { value: "fixed", label: "Giá cố định" },
              { value: "quote_required", label: "Liên hệ báo giá" },
            ]}
            value={s.priceMode}
            onPick={(v) => set("priceMode", v)}
          />
          {s.priceMode === "fixed" && (
            <input className="sa-input" inputMode="numeric" aria-label={`Giá mỗi ${unit} (đồng)`} value={s.unitPriceVnd} onChange={(e) => set("unitPriceVnd", e.target.value)} placeholder={`Giá mỗi ${unit}, vd. 55000`} />
          )}
        </div>
      );
    }
    case "storage":
      return (
        <div className="sa-field">
          <AiBadge show={sg.storageInstructions} />
          <textarea className="sa-input" rows={2} maxLength={1000} aria-label="Bảo quản" value={s.storageInstructions} onChange={(e) => set("storageInstructions", e.target.value)} placeholder="vd. Bảo quản ngăn mát 0–5°C, dùng ngay sau khi mở túi" />
        </div>
      );
    case "shelfLife":
      return (
        <div className="sa-field">
          <input className="sa-input" maxLength={300} aria-label="Hạn dùng" value={s.shelfLifeNote} onChange={(e) => set("shelfLifeNote", e.target.value)} placeholder="vd. 7 ngày trong ngăn mát" />
        </div>
      );
    case "copy":
      return (
        <div className="sa-field">
          <AiBadge show={sg.summary || sg.description} />
          <input className="sa-input" maxLength={300} aria-label="Tóm tắt" value={s.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Một câu tóm tắt" />
          <textarea className="sa-input" rows={4} maxLength={5000} aria-label="Mô tả" value={s.description} onChange={(e) => set("description", e.target.value)} placeholder="Mô tả hình thức, cách sơ chế, phù hợp cho ai" />
        </div>
      );
  }
}

function answerText(id: StepId, s: SheetState): string {
  const unit = s.saleUnit ? UNIT_LABEL[s.saleUnit] : "";
  switch (id) {
    case "name":
      return s.name;
    case "category":
      return CATEGORY_CHOICES.find((c) => c.slug === s.category)?.label ?? s.category;
    case "processing":
      return s.processing;
    case "origin": {
      const c = COUNTRY_CHOICES.find((x) => x.code === s.originCountry)?.label ?? s.originCountry;
      return [c, s.originRegion].filter(Boolean).join(" — ");
    }
    case "unit":
      return [unit && `Bán theo ${unit}`, s.saleUnit !== "kg" && s.packNetWeightKg && `${s.packNetWeightKg} kg/${unit}`, s.packDescription]
        .filter(Boolean)
        .join(", ");
    case "moq":
      return s.minOrderQty ? `Tối thiểu ${s.minOrderQty} ${unit}${s.orderStepQty ? `, bước ${s.orderStepQty}` : ""}` : "";
    case "price":
      return s.priceMode === "fixed" ? `${Number(s.unitPriceVnd.replace(/\D/g, "")).toLocaleString("vi-VN")} đ/${unit}` : s.priceMode ? "Liên hệ báo giá" : "";
    case "storage":
      return s.storageInstructions;
    case "shelfLife":
      return s.shelfLifeNote;
    case "copy":
      return [s.summary, s.description].filter(Boolean).join(" — ");
  }
}

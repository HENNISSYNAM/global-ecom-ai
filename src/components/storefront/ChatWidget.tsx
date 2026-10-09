"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Turn = { role: "user" | "assistant"; content: string };

/** Buyer Q&A drawer. Answers come only from the store's published data (see modules/assistant). */
export function ChatWidget({ storeSlug, storeName }: { storeSlug: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        openerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, pending]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: text.slice(0, 1000) }];
    setTurns(next);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/s/${storeSlug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const data = (await res.json()) as { text?: string; provider?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? "Trợ lý chưa trả lời được.");
      setIsMock(data.provider === "mock");
      setTurns([...next, { role: "assistant", content: data.text }]);
    } catch (err) {
      setError((err as Error).message);
      // Keep the question in the box so the buyer can retry.
      setTurns(turns);
      setDraft(text);
    } finally {
      setPending(false);
      // The send button is disabled while pending; return focus to the input for the next question.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className="sf-chat-opener"
        aria-expanded={open}
        aria-controls="sf-chat"
        onClick={() => setOpen(true)}
      >
        Hỏi đáp
      </button>
      {open && <div className="sf-chat-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        id="sf-chat"
        className="sf-chat"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sf-chat-title"
        hidden={!open}
      >
        <header className="sf-chat-header">
          <h2 id="sf-chat-title" className="sf-chat-title">
            Hỏi đáp về {storeName}
          </h2>
          <button type="button" className="sf-chat-close" onClick={() => setOpen(false)} aria-label="Đóng hỏi đáp">
            ×
          </button>
        </header>
        <div className="sf-chat-log" ref={logRef} aria-live="polite">
          {turns.length === 0 && (
            <p className="sf-note">
              Hỏi về sản phẩm, quy cách, xuất xứ hoặc cách đặt hàng. Ví dụ: “Trà xanh bán tối thiểu bao nhiêu?”
            </p>
          )}
          {turns.map((t, i) => (
            <p key={i} className={`sf-chat-msg sf-chat-msg--${t.role}`}>
              {t.content}
            </p>
          ))}
          {pending && <p className="sf-chat-msg sf-chat-msg--assistant sf-note">Đang trả lời…</p>}
          {error && (
            <p className="sf-chat-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <form className="sf-chat-form" onSubmit={send}>
          <label htmlFor="sf-chat-input" className="visually-hidden">
            Câu hỏi của bạn
          </label>
          <textarea
            id="sf-chat-input"
            ref={inputRef}
            rows={2}
            maxLength={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            placeholder="Nhập câu hỏi…"
          />
          <button type="submit" className="sf-chat-send" disabled={pending || !draft.trim()}>
            Gửi
          </button>
        </form>
        <p className="sf-chat-disclaimer">
          {isMock
            ? "Đang dùng trả lời tự động theo từ khóa, chưa phải AI."
            : "Trợ lý AI trả lời dựa trên thông tin người bán đã xuất bản và có thể sai."}{" "}
          Giá, phí giao và đơn hàng chỉ có hiệu lực khi người bán xác nhận.
        </p>
      </aside>
    </>
  );
}

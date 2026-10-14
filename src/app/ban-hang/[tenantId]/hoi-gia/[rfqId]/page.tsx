import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { formatMoney, formatQuantity, SALE_UNIT_LABEL } from "@/modules/catalog/format";
import { BUYER_TYPES } from "@/modules/rfq/buyer";
import { getRfq, type RfqDetail } from "@/modules/rfq/seller";
import { QuoteForm } from "@/components/rfq/QuoteForm";
import { DeclineButton } from "@/components/rfq/DeclineButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Yêu cầu báo giá", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = { submitted: "Chờ báo giá", quoted: "Đã báo giá", accepted: "Đã đặt hàng", declined: "Đã từ chối", cancelled: "Đã hủy" };
const QUOTE_STATUS: Record<string, string> = { sent: "Đang hiệu lực", accepted: "Khách đã chấp nhận", superseded: "Đã thay bằng bản mới", withdrawn: "Đã thu hồi", draft: "Nháp" };
const unit = (u: string) => SALE_UNIT_LABEL[u as keyof typeof SALE_UNIT_LABEL] ?? u;
const when = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });

export default async function RfqDetailPage({ params }: { params: Promise<{ tenantId: string; rfqId: string }> }) {
  const actor = await currentActor();
  if (actor.role !== "authenticated") redirect("/dang-nhap");
  const { tenantId, rfqId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(rfqId)) notFound();
  let rfq: RfqDetail;
  try {
    rfq = await getRfq(getSql(), actor, rfqId);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  if (rfq.tenantId !== tenantId) notFound();
  const b = rfq.buyer;
  const open = rfq.status === "submitted" || rfq.status === "quoted";

  return (
    <main className="sa-page sa-page--wide">
      <header className="sa-head">
        <div>
          <p className="sa-muted">
            <Link href={`/ban-hang/${tenantId}/hoi-gia`}>← Yêu cầu báo giá</Link>
          </p>
          <h1 className="sa-title">
            {rfq.reference} · {STATUS[rfq.status] ?? rfq.status}
          </h1>
        </div>
      </header>
      <div className="sa-layout">
        <div>
          <section className="sa-msg sa-msg--bot" style={{ maxWidth: "none" }}>
            <p className="sa-step">Khách hỏi ({when(rfq.createdAt)})</p>
            <ul>
              {rfq.items.map((i) => (
                <li key={i.id}>
                  {i.productName}
                  {i.packLabel ? ` (${i.packLabel})` : ""}: <strong>{formatQuantity(i.quantity)} {unit(i.saleUnit)}</strong>
                  {i.listPriceMinor ? <span className="sa-muted"> · giá niêm yết {formatMoney(i.listPriceMinor, "VND")}</span> : null}
                </li>
              ))}
            </ul>
            {b.frequency && <p>Tần suất: {b.frequency}</p>}
            {b.note && <p>Ghi chú: {b.note}</p>}
          </section>
          {rfq.order && (
            <section className="sa-callout">
              <strong>Đơn {rfq.order.reference}</strong> · {formatMoney(rfq.order.totalMinor, "VND")} · khách xác nhận lúc {when(rfq.order.createdAt)}.
              Liên hệ khách để giao hàng.
            </section>
          )}
          {open && <QuoteForm rfqId={rfq.id} items={rfq.items} previousVersion={rfq.quotes[0]?.version ?? null} />}
          {open && (
            <div className="sa-actions">
              <DeclineButton rfqId={rfq.id} />
            </div>
          )}
        </div>
        <aside className="sa-side">
          <h2>Khách hàng</h2>
          <p>
            <strong>{b.name}</strong>
            {b.company ? ` · ${b.company}` : ""}
            <br />
            {BUYER_TYPES[b.type as keyof typeof BUYER_TYPES] ?? b.type}
            <br />
            <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a>
            {b.email && (
              <>
                <br />
                <a href={`mailto:${b.email}`}>{b.email}</a>
              </>
            )}
          </p>
          <p>
            Giao tới: {b.deliveryArea}
            {b.neededBy ? (
              <>
                <br />
                Cần ngày: {b.neededBy.split("-").reverse().join("/")}
              </>
            ) : null}
            <br />
            Hóa đơn VAT: {b.needVatInvoice ? "Có" : "Không"}
          </p>
          <p className="sa-muted">
            Khách xem báo giá qua đường dẫn riêng nhận được lúc gửi yêu cầu. Sau khi gửi báo giá, hãy nhắn khách mở lại đường dẫn đó.
          </p>
          {rfq.quotes.length > 0 && (
            <>
              <h2>Các lần báo giá</h2>
              <ul className="sa-products">
                {rfq.quotes.map((q) => (
                  <li key={q.id}>
                    Lần {q.version}: {formatMoney(q.totalMinor, "VND")} — {QUOTE_STATUS[q.status] ?? q.status}
                    {q.validUntil && q.status === "sent" ? ` (đến ${when(q.validUntil)})` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

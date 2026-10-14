import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/lib/db";
import { formatMoney, formatQuantity, SALE_UNIT_LABEL } from "@/modules/catalog/format";
import { getRfqForBuyer } from "@/modules/rfq/buyer";
import { AcceptQuote } from "@/components/rfq/AcceptQuote";

export const dynamic = "force-dynamic";
// Private link: never indexed, never sent as a referrer.
export const metadata: Metadata = { title: "Báo giá", robots: { index: false, follow: false }, referrer: "no-referrer" };

const unit = (u: string) => SALE_UNIT_LABEL[u as keyof typeof SALE_UNIT_LABEL] ?? u;
const vnd = (minor: string) => formatMoney(minor, "VND");
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });

const STATUS: Record<string, string> = {
  submitted: "Đã gửi, chờ người bán báo giá",
  quoted: "Đã có báo giá",
  accepted: "Đã đặt hàng",
  declined: "Người bán từ chối yêu cầu",
  cancelled: "Đã hủy",
};

export default async function BuyerQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rfq = await getRfqForBuyer(getSql(), token);
  if (!rfq) notFound();
  const q = rfq.quote;

  return (
    <main className="sa-page">
      <p className="sa-muted">
        <Link href={`/s/${rfq.storefrontSlug}`}>{rfq.storefrontName}</Link> · Yêu cầu {rfq.reference}
      </p>
      <h1 className="sa-title">{STATUS[rfq.status] ?? rfq.status}</h1>

      <section className="sa-msg sa-msg--bot" aria-label="Yêu cầu của bạn">
        <p className="sa-step">Bạn đã hỏi</p>
        <ul>
          {rfq.items.map((i, n) => (
            <li key={n}>
              {i.productName}
              {i.packLabel ? ` (${i.packLabel})` : ""}: {formatQuantity(i.quantity)} {unit(i.saleUnit)}
            </li>
          ))}
        </ul>
        <p className="sa-muted">
          Giao tới {rfq.deliveryArea}
          {rfq.neededBy ? `, cần ngày ${rfq.neededBy.split("-").reverse().join("/")}` : ""}. Gửi lúc {dateTime(rfq.createdAt)}.
        </p>
      </section>

      {rfq.order ? (
        <section className="sa-msg sa-msg--me" aria-label="Đơn hàng">
          <p className="sa-q">Đơn hàng {rfq.order.reference}</p>
          <p>
            Tổng {vnd(rfq.order.totalMinor)} · xác nhận lúc {dateTime(rfq.order.createdAt)}. Người bán sẽ liên hệ để giao hàng.
          </p>
        </section>
      ) : null}

      {q ? (
        <section className="sa-msg sa-msg--bot" aria-label="Báo giá" style={{ marginTop: 12 }}>
          <p className="sa-q">Báo giá lần {q.version}</p>
          <table className="sa-table">
            <thead>
              <tr>
                <th>Mặt hàng</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l, n) => (
                <tr key={n}>
                  <td>{l.description}</td>
                  <td>
                    {formatQuantity(l.quantity)} {unit(l.saleUnit)}
                  </td>
                  <td>
                    {vnd(l.unitPriceMinor)}/{unit(l.saleUnit)}
                  </td>
                  <td>{vnd(l.lineTotalMinor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Tạm tính</td>
                <td>{vnd(q.subtotalMinor)}</td>
              </tr>
              <tr>
                <td colSpan={3}>Phí giao</td>
                <td>{q.deliveryFeeMinor !== null ? vnd(q.deliveryFeeMinor) : "Chưa tính (người bán báo khi giao)"}</td>
              </tr>
              <tr>
                <th colSpan={3}>Tổng</th>
                <th>{vnd(q.totalMinor)}</th>
              </tr>
            </tfoot>
          </table>
          {q.deliveryNote && <p>Giao hàng: {q.deliveryNote}</p>}
          {q.paymentTerms && <p>Thanh toán: {q.paymentTerms}</p>}
          {q.note && <p>Ghi chú: {q.note}</p>}
          <p className="sa-muted">
            Có hiệu lực đến {dateTime(q.validUntil)}
            {q.expired ? " — đã hết hạn, hãy liên hệ người bán để nhận báo giá mới." : "."}
          </p>
          {q.status === "sent" && !q.expired && !rfq.order && <AcceptQuote token={token} quoteId={q.id} total={vnd(q.totalMinor)} />}
        </section>
      ) : (
        rfq.status === "submitted" && <p className="sa-muted">Chưa có báo giá. Mở lại đường dẫn này sau để xem.</p>
      )}
    </main>
  );
}

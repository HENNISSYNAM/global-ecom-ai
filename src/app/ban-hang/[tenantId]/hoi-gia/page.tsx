import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { BUYER_TYPES } from "@/modules/rfq/buyer";
import { listRfqs } from "@/modules/rfq/seller";
import { listMyShops } from "@/modules/seller/shops";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Yêu cầu báo giá", robots: { index: false, follow: false } };

const RFQ_STATUS: Record<string, string> = {
  submitted: "Chờ báo giá",
  quoted: "Đã báo giá",
  accepted: "Đã đặt hàng",
  declined: "Đã từ chối",
  cancelled: "Đã hủy",
};

export default async function RfqList({ params }: { params: Promise<{ tenantId: string }> }) {
  const actor = await currentActor();
  if (actor.role !== "authenticated") redirect("/dang-nhap");
  const { tenantId } = await params;
  const shop = (await listMyShops(getSql(), actor)).find((s) => s.tenantId === tenantId);
  if (!shop) notFound();
  const rfqs = await listRfqs(getSql(), actor, tenantId);

  return (
    <main className="sa-page sa-page--wide">
      <header className="sa-head">
        <div>
          <p className="sa-muted">
            <Link href={`/ban-hang/${tenantId}`}>← {shop.tenantName}</Link>
          </p>
          <h1 className="sa-title">Yêu cầu báo giá</h1>
        </div>
      </header>
      {shop.role === "viewer" ? (
        <p>Tài khoản xem không có quyền đọc yêu cầu báo giá (chứa thông tin liên hệ của khách).</p>
      ) : rfqs.length ? (
        <table className="sa-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Khách</th>
              <th>Giao tới</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rfqs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/ban-hang/${tenantId}/hoi-gia/${r.id}`}>{r.reference}</Link>
                  <br />
                  <small className="sa-muted">{r.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })}</small>
                </td>
                <td>
                  {r.buyerName}
                  <br />
                  <small className="sa-muted">
                    {BUYER_TYPES[r.buyerType as keyof typeof BUYER_TYPES] ?? r.buyerType} · {r.itemCount} mặt hàng
                  </small>
                </td>
                <td>{r.deliveryArea}</td>
                <td>{RFQ_STATUS[r.status] ?? r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sa-muted">Chưa có yêu cầu nào. Khách gửi từ nút &quot;Gửi yêu cầu báo giá&quot; trên gian hàng đã xuất bản.</p>
      )}
    </main>
  );
}

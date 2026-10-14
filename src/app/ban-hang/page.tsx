import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { listMyShops } from "@/modules/seller/shops";
import { CreateShopForm } from "@/components/seller/CreateShopForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bán hàng", robots: { index: false, follow: false } };

export default async function SellerHome() {
  const actor = await currentActor();
  if (actor.role !== "authenticated") redirect("/dang-nhap");
  const shops = await listMyShops(getSql(), actor);
  if (shops.length === 1) redirect(`/ban-hang/${shops[0]!.tenantId}`);
  return (
    <main className="sa-page">
      <h1 className="sa-title">Cửa hàng của bạn</h1>
      {shops.length ? (
        <ul className="sa-shoplist">
          {shops.map((s) => (
            <li key={s.tenantId}>
              <Link href={`/ban-hang/${s.tenantId}`}>{s.tenantName}</Link> <span className="sa-muted">({s.role})</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>Tạo cửa hàng đầu tiên, sau đó gửi ảnh sản phẩm cho trợ lý.</p>
          <CreateShopForm />
        </>
      )}
    </main>
  );
}

import Link from "next/link";
import { getSql } from "@/lib/db";
import { storefrontPath } from "@/lib/site";
import { listLiveStorefronts } from "@/modules/storefront/public-read";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stores = await listLiveStorefronts(getSql());
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px", lineHeight: 1.6 }}>
      <h1>Nền tảng gian hàng nông sản</h1>
      <p>
        Bản foundation: mỗi doanh nghiệp có gian hàng riêng, dữ liệu riêng. Trang công khai chỉ hiển thị phiên bản
        người bán đã xuất bản.
      </p>
      <h2>Gian hàng đang mở</h2>
      {stores.length ? (
        <ul>
          {stores.map((s) => (
            <li key={s.slug}>
              <Link href={storefrontPath(s.slug)}>{s.slug}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Chưa có gian hàng nào được xuất bản.</p>
      )}
    </main>
  );
}

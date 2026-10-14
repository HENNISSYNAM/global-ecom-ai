import Link from "next/link";
import { getSql } from "@/lib/db";
import { storefrontPath } from "@/lib/site";
import { diagnoseDatabase } from "@/lib/db-diagnostics";
import { listLiveStorefronts } from "@/modules/storefront/public-read";

export const dynamic = "force-dynamic";

export default async function Home() {
  let stores: Awaited<ReturnType<typeof listLiveStorefronts>>;
  try {
    stores = await listLiveStorefronts(getSql());
  } catch (err) {
    // Show the operator what to fix instead of a bare 500; the hint never contains secrets.
    console.error("home: database unavailable", (err as { code?: string }).code ?? (err as Error).message);
    const d = await diagnoseDatabase();
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px", lineHeight: 1.6 }}>
        <h1>Chưa kết nối được cơ sở dữ liệu</h1>
        <p>{d.hint ?? "Không đọc được dữ liệu gian hàng."}</p>
        <p style={{ color: "#6b6457", fontSize: 14 }}>
          Mã: {d.problem ?? "unknown"}
          {d.code ? ` / ${d.code}` : ""} · Chi tiết: <a href="/api/health">/api/health</a>
        </p>
      </main>
    );
  }
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

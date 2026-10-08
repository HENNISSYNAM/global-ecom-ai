import type { SnapshotVariant } from "@/modules/storefront/snapshot";

export const SALE_UNIT_LABEL: Record<SnapshotVariant["saleUnit"], string> = {
  kg: "kg",
  bag: "túi",
  box: "hộp",
  carton: "thùng",
  piece: "cái",
};

/** Formats an integer amount of minor units. VND has no minor unit, so 125000 → "125.000 ₫". */
export function formatMoney(minor: string, currency: string): string {
  if (currency !== "VND") return `${minor} ${currency}`;
  return `${BigInt(minor).toLocaleString("vi-VN")} ₫`;
}

/** Formats a decimal string without going through floating point: "1.500" → "1,5", "20.000" → "20". */
export function formatQuantity(decimal: string): string {
  const [intPart = "0", frac = ""] = decimal.split(".");
  const trimmed = frac.replace(/0+$/, "");
  const grouped = BigInt(intPart).toLocaleString("vi-VN");
  return trimmed ? `${grouped},${trimmed}` : grouped;
}

export function formatQuantityWithUnit(decimal: string, unit: SnapshotVariant["saleUnit"]): string {
  return `${formatQuantity(decimal)} ${SALE_UNIT_LABEL[unit]}`;
}

export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["vi"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function originLabel(country: string | null, region: string | null): string | null {
  const name = countryName(country);
  if (!name) return null;
  return region ? `${region}, ${name}` : name;
}

export type PriceDisplay = { kind: "fixed"; text: string; unit: string } | { kind: "quote" } | { kind: "none" };

export function priceDisplay(variant: SnapshotVariant): PriceDisplay {
  const offer = variant.offer;
  if (!offer) return { kind: "none" };
  if (offer.priceMode === "quote_required" || !offer.unitPriceMinor) return { kind: "quote" };
  return { kind: "fixed", text: formatMoney(offer.unitPriceMinor, offer.currency), unit: SALE_UNIT_LABEL[variant.saleUnit] };
}

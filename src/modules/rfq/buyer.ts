import { z } from "zod";
import { withActor, type Sql } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";

/**
 * Buyer side of the wholesale flow. Buyers are anonymous: every call runs as `anon` and goes through security
 * definer functions that take the storefront slug or the buyer's secret token, never a tenant id.
 */

const plain = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => !/[<>]/.test(s), "Không dùng ký tự < >");
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[<>]/.test(s), "Không dùng ký tự < >")
    .optional()
    .transform((s) => (s ? s : undefined));

export const BUYER_TYPES = {
  restaurant: "Nhà hàng, quán ăn",
  kitchen: "Bếp ăn công nghiệp",
  retailer: "Cửa hàng, sạp chợ",
  distributor: "Đại lý, nhà phân phối",
  factory: "Nhà máy chế biến",
  household: "Hộ gia đình",
  other: "Khác",
} as const;

export const rfqRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            variantId: z.string().uuid().optional(),
            quantity: z
              .string()
              .trim()
              .transform((s) => s.replace(",", "."))
              .pipe(z.string().regex(/^\d{1,10}(\.\d{1,3})?$/, "Số lượng không hợp lệ"))
              .refine((s) => Number(s) > 0, "Số lượng phải lớn hơn 0"),
          })
          .strict(),
      )
      .min(1, "Chọn ít nhất một sản phẩm")
      .max(30),
    buyerName: plain(2, 120),
    buyerPhone: z.string().trim().regex(/^\+?[0-9 .-]{8,20}$/, "Số điện thoại/Zalo chưa đúng"),
    buyerEmail: z.string().trim().email("Email chưa đúng").max(200).optional().or(z.literal("").transform(() => undefined)),
    buyerType: z.enum(Object.keys(BUYER_TYPES) as [keyof typeof BUYER_TYPES, ...(keyof typeof BUYER_TYPES)[]]).default("other"),
    companyName: optional(200),
    deliveryArea: plain(2, 300),
    neededBy: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    frequency: optional(120),
    needVatInvoice: z.boolean().default(false),
    note: optional(1000),
    // Honeypot: real buyers never fill it.
    website: z.string().max(0).optional(),
  })
  .strict();
export type RfqRequest = z.input<typeof rfqRequestSchema>;

export async function submitRfq(
  sql: Sql,
  storeSlug: string,
  input: unknown,
): Promise<{ rfqId: string; reference: string; token: string }> {
  const parsed = rfqRequestSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("invalid", parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ", parsed.error.issues);
  const { website: _honeypot, ...request } = parsed.data;
  try {
    const rows = await withActor(sql, { role: "anon" }, (tx) => tx<{ r: { rfqId: string; reference: string; token: string } }[]>`
      select public.submit_rfq(${storeSlug}, ${tx.json(request as never)}) as r`);
    return rows[0]!.r;
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

export type BuyerQuote = {
  id: string;
  version: number;
  status: "sent" | "accepted";
  validUntil: string;
  expired: boolean;
  deliveryFeeMinor: string | null;
  deliveryNote: string | null;
  paymentTerms: string | null;
  note: string | null;
  subtotalMinor: string;
  totalMinor: string;
  sentAt: string;
  lines: { description: string; saleUnit: string; quantity: string; unitPriceMinor: string; lineTotalMinor: string }[];
};

export type BuyerRfqView = {
  reference: string;
  status: string;
  storefrontSlug: string;
  storefrontName: string;
  createdAt: string;
  buyerName: string;
  deliveryArea: string;
  neededBy: string | null;
  items: { productName: string; packLabel: string | null; saleUnit: string; quantity: string }[];
  quote: BuyerQuote | null;
  order: { reference: string; totalMinor: string; createdAt: string } | null;
};

const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function getRfqForBuyer(sql: Sql, token: string): Promise<BuyerRfqView | null> {
  if (!TOKEN_RE.test(token)) return null;
  const rows = await withActor(sql, { role: "anon" }, (tx) => tx<{ v: BuyerRfqView | null }[]>`
    select public.get_rfq_for_buyer(${token}) as v`);
  return rows[0]?.v ?? null;
}

export async function acceptQuote(
  sql: Sql,
  token: string,
  quoteId: string,
  idempotencyKey: string,
): Promise<{ orderReference: string; totalMinor: string; replayed: boolean }> {
  if (!TOKEN_RE.test(token)) throw new DomainError("not_found", "Không tìm thấy yêu cầu");
  if (!/^[0-9a-f-]{36}$/.test(quoteId) || !/^[A-Za-z0-9-]{8,80}$/.test(idempotencyKey))
    throw new DomainError("invalid", "Dữ liệu không hợp lệ");
  try {
    const rows = await withActor(sql, { role: "anon" }, (tx) => tx<{ r: { orderReference: string; totalMinor: string; replayed: boolean } }[]>`
      select public.accept_quote(${token}, ${quoteId}, ${idempotencyKey}) as r`);
    return rows[0]!.r;
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

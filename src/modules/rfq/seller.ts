import { z } from "zod";
import { withActor, type Actor, type Sql } from "@/lib/db";
import { DomainError, fromPgError } from "@/lib/errors";

/** Seller side: list requests, read one, send a quote version, decline. RLS limits all of it to owner/editor/sales. */

export type RfqListItem = {
  id: string;
  reference: string;
  status: string;
  buyerName: string;
  buyerType: string;
  deliveryArea: string;
  itemCount: number;
  createdAt: Date;
};

export async function listRfqs(sql: Sql, actor: Actor, tenantId: string): Promise<RfqListItem[]> {
  return withActor(sql, actor, (tx) => tx<RfqListItem[]>`
    select r.id, r.reference, r.status, r.buyer_name as "buyerName", r.buyer_type as "buyerType",
      r.delivery_area as "deliveryArea", r.created_at as "createdAt",
      (select count(*)::int from public.rfq_items i where i.rfq_id = r.id) as "itemCount"
    from public.rfqs r
    where r.tenant_id = ${tenantId}
    order by r.created_at desc
    limit 200`);
}

export type RfqDetail = {
  id: string;
  tenantId: string;
  reference: string;
  status: string;
  buyer: {
    name: string;
    phone: string;
    email: string | null;
    type: string;
    company: string | null;
    deliveryArea: string;
    neededBy: string | null;
    frequency: string | null;
    needVatInvoice: boolean;
    note: string | null;
  };
  createdAt: Date;
  items: { id: string; productId: string; variantId: string | null; productName: string; packLabel: string | null; saleUnit: string; quantity: string; listPriceMinor: string | null }[];
  quotes: { id: string; version: number; status: string; totalMinor: string; validUntil: Date | null; sentAt: Date | null }[];
  order: { reference: string; totalMinor: string; createdAt: Date } | null;
};

export async function getRfq(sql: Sql, actor: Actor, rfqId: string): Promise<RfqDetail> {
  return withActor(sql, actor, async (tx) => {
    const [r] = await tx<{
      id: string; tenant_id: string; reference: string; status: string; buyer_name: string; buyer_phone: string;
      buyer_email: string | null; buyer_type: string; company_name: string | null; delivery_area: string;
      needed_by: string | null; frequency: string | null; need_vat_invoice: boolean; note: string | null; created_at: Date;
    }[]>`select *, needed_by::text as needed_by from public.rfqs where id = ${rfqId}`;
    if (!r) throw new DomainError("not_found", "Không tìm thấy yêu cầu");
    // Current list price (if any) helps the seller start the quote; the quote itself is always typed/confirmed.
    const items = await tx<RfqDetail["items"]>`
      select i.id, i.product_id as "productId", i.variant_id as "variantId", i.product_name as "productName",
        i.pack_label as "packLabel", i.sale_unit as "saleUnit", i.quantity::text as quantity,
        (select o.unit_price_minor::text from public.offers o
          where o.tenant_id = i.tenant_id and o.variant_id = i.variant_id and o.price_mode = 'fixed'
            and o.valid_from <= now() and (o.valid_to is null or o.valid_to > now())
          order by o.valid_from desc limit 1) as "listPriceMinor"
      from public.rfq_items i where i.rfq_id = ${rfqId} order by i.position`;
    const quotes = await tx<RfqDetail["quotes"]>`
      select id, version, status, total_minor::text as "totalMinor", valid_until as "validUntil", sent_at as "sentAt"
      from public.quotes where rfq_id = ${rfqId} order by version desc`;
    const [order] = await tx<{ reference: string; totalMinor: string; createdAt: Date }[]>`
      select reference, total_minor::text as "totalMinor", created_at as "createdAt" from public.orders where rfq_id = ${rfqId}`;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      reference: r.reference,
      status: r.status,
      buyer: {
        name: r.buyer_name,
        phone: r.buyer_phone,
        email: r.buyer_email,
        type: r.buyer_type,
        company: r.company_name,
        deliveryArea: r.delivery_area,
        neededBy: r.needed_by,
        frequency: r.frequency,
        needVatInvoice: r.need_vat_invoice,
        note: r.note,
      },
      createdAt: r.created_at,
      items,
      quotes,
      order: order ?? null,
    };
  });
}

const qty = z
  .string()
  .trim()
  .transform((s) => s.replace(",", "."))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,3})?$/, "Số lượng không hợp lệ"))
  .refine((s) => Number(s) > 0, "Số lượng phải lớn hơn 0");
const vnd = z
  .string()
  .trim()
  .transform((s) => s.replace(/[.\s,đ₫]/gi, ""))
  .pipe(z.string().regex(/^[1-9]\d{0,11}$/, "Giá là số đồng lớn hơn 0"));

export const quoteInputSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            rfqItemId: z.string().uuid().optional(),
            description: z.string().trim().min(1).max(300).refine((s) => !/[<>]/.test(s)),
            saleUnit: z.enum(["kg", "bag", "box", "carton", "piece"]),
            quantity: qty,
            unitPriceMinor: vnd,
          })
          .strict(),
      )
      .min(1, "Báo giá cần ít nhất một dòng")
      .max(50),
    deliveryFeeMinor: z
      .string()
      .trim()
      .transform((s) => s.replace(/[.\s,đ₫]/gi, ""))
      .pipe(z.string().regex(/^\d{0,12}$/, "Phí giao là số đồng"))
      .optional()
      .transform((s) => (s ? s : undefined)),
    deliveryNote: z.string().trim().max(500).optional(),
    paymentTerms: z.string().trim().max(500).optional(),
    note: z.string().trim().max(1000).optional(),
    validDays: z.number().int().min(1).max(30).default(3),
  })
  .strict();
export type QuoteInput = z.input<typeof quoteInputSchema>;

export async function sendQuote(sql: Sql, actor: Actor, rfqId: string, input: unknown): Promise<{ quoteId: string }> {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("invalid", parsed.error.issues[0]?.message ?? "Báo giá chưa hợp lệ", parsed.error.issues);
  try {
    const rows = await withActor(sql, actor, (tx) => tx<{ id: string }[]>`
      select public.send_quote(${rfqId}, ${tx.json(parsed.data as never)}) as id`);
    return { quoteId: rows[0]!.id };
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

export async function declineRfq(sql: Sql, actor: Actor, rfqId: string): Promise<void> {
  try {
    await withActor(sql, actor, (tx) => tx`select public.set_rfq_status(${rfqId}, 'declined')`);
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

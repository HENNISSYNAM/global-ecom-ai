import type { ProductDraft } from "@/modules/ai/product-draft";
export { CATEGORY_CHOICES } from "@/modules/catalog/categories";

/**
 * The product sheet the assistant fills with the seller, one question at a time.
 *
 * Order follows how a wholesale buyer evaluates a listing (identity → processing → origin → pack/unit → minimum
 * order → price → storage → shelf life → copy). Shared by the console UI and tests; contains no I/O.
 */

export type SaleUnit = "kg" | "bag" | "box" | "carton" | "piece";

export type SheetState = {
  name: string;
  category: string;
  processing: string;
  originCountry: string;
  originRegion: string;
  saleUnit: SaleUnit | "";
  packNetWeightKg: string;
  packDescription: string;
  minOrderQty: string;
  orderStepQty: string;
  priceMode: "fixed" | "quote_required" | "";
  unitPriceVnd: string;
  storageInstructions: string;
  shelfLifeNote: string;
  summary: string;
  description: string;
};

export const EMPTY_SHEET: SheetState = {
  name: "",
  category: "",
  processing: "",
  originCountry: "",
  originRegion: "",
  saleUnit: "",
  packNetWeightKg: "",
  packDescription: "",
  minOrderQty: "",
  orderStepQty: "",
  priceMode: "",
  unitPriceVnd: "",
  storageInstructions: "",
  shelfLifeNote: "",
  summary: "",
  description: "",
};

/** Which sheet keys hold an AI suggestion the seller still has to confirm. */
export type Suggested = Partial<Record<keyof SheetState, true>>;

/** Pre-fills only what the AI is allowed to suggest; seller-only facts stay empty. */
export function sheetFromDraft(draft: ProductDraft | null): { sheet: SheetState; suggested: Suggested } {
  const sheet = { ...EMPTY_SHEET };
  const suggested: Suggested = {};
  if (!draft) return { sheet, suggested };
  const take = (from: keyof ProductDraft["fields"], to: keyof SheetState) => {
    const v = draft.fields[from]?.value;
    if (v) {
      (sheet as Record<string, string>)[to] = v;
      suggested[to] = true;
    }
  };
  take("name", "name");
  take("category", "category");
  take("processing", "processing");
  take("packDescription", "packDescription");
  take("storageInstructions", "storageInstructions");
  take("summary", "summary");
  take("description", "description");
  const unit = draft.fields.saleUnit?.value;
  if (unit === "kg" || unit === "bag" || unit === "box" || unit === "carton" || unit === "piece") {
    sheet.saleUnit = unit;
    suggested.saleUnit = true;
  }
  return { sheet, suggested };
}

export const UNIT_LABEL: Record<SaleUnit, string> = { kg: "kg", bag: "túi", box: "hộp", carton: "thùng", piece: "cái" };

export const COUNTRY_CHOICES: { code: string; label: string }[] = [
  { code: "VN", label: "Việt Nam" },
  { code: "CN", label: "Trung Quốc" },
  { code: "TH", label: "Thái Lan" },
  { code: "IN", label: "Ấn Độ" },
];

export const PROCESSING_CHOICES = ["Nguyên củ", "Bóc vỏ", "Gọt vỏ", "Cắt lát", "Băm/xay", "Sấy khô", "Luộc/hấp sẵn"];


const DECIMAL = /^\d{1,10}(\.\d{1,3})?$/;
export const normalizeDecimal = (s: string) => s.trim().replace(",", ".");
export const isPositiveDecimal = (s: string) => DECIMAL.test(normalizeDecimal(s)) && Number(normalizeDecimal(s)) > 0;
export const normalizeVnd = (s: string) => s.replace(/[.\s,đ₫]/gi, "");

export type StepId =
  | "name"
  | "category"
  | "processing"
  | "origin"
  | "unit"
  | "moq"
  | "price"
  | "storage"
  | "shelfLife"
  | "copy";

export type Step = { id: StepId; question: string; why: string; optional?: boolean };

export const STEPS: Step[] = [
  { id: "name", question: "Tên sản phẩm là gì?", why: "Tên ngắn = mặt hàng + cách sơ chế, người mua tìm theo đúng chữ này." },
  { id: "category", question: "Sản phẩm thuộc nhóm hàng nào?", why: "Nhóm hàng giúp xếp sản phẩm cùng loại và lọc trên gian hàng." },
  { id: "processing", question: "Hàng được sơ chế thế nào?", why: "Khách sỉ (bếp, nhà hàng) chọn theo mức sơ chế để tiết kiệm công." },
  { id: "origin", question: "Hàng có xuất xứ ở đâu?", why: "Xuất xứ là thông tin bắt buộc trước khi lên gian hàng; AI không đoán được từ ảnh." },
  { id: "unit", question: "Bán theo đơn vị nào?", why: "Đơn vị bán và khối lượng mỗi gói quyết định cách tính giá và đặt hàng." },
  { id: "moq", question: "Đặt tối thiểu bao nhiêu, và mỗi lần tăng thêm bao nhiêu?", why: "Đơn tối thiểu (MOQ) giúp khách biết có đủ điều kiện mua sỉ không." },
  { id: "price", question: "Giá bán thế nào?", why: "Giá cố định hiện trên gian hàng; 'liên hệ báo giá' sẽ không hiện số 0." },
  { id: "storage", question: "Bảo quản hàng thế nào?", why: "Hàng sơ chế cần hướng dẫn bảo quản rõ; bắt buộc trước khi lên gian hàng." },
  { id: "shelfLife", question: "Hàng dùng tốt trong bao lâu?", why: "Không bắt buộc, nhưng khách sỉ thường hỏi để lên kế hoạch nhập.", optional: true },
  { id: "copy", question: "Kiểm tra câu tóm tắt và mô tả", why: "Mô tả rõ ràng, không phóng đại, giúp khách và công cụ tìm kiếm hiểu sản phẩm.", optional: true },
];

/** Returns a Vietnamese error for the step, or null when the answer is acceptable. */
export function validateStep(id: StepId, s: SheetState): string | null {
  switch (id) {
    case "name":
      return s.name.trim().length >= 2 ? null : "Cần tên sản phẩm (ít nhất 2 ký tự).";
    case "category":
      return null;
    case "processing":
      return s.processing.trim() ? null : "Chọn hoặc ghi cách sơ chế.";
    case "origin":
      return /^[A-Z]{2}$/.test(s.originCountry) ? null : "Chọn quốc gia xuất xứ.";
    case "unit":
      if (!s.saleUnit) return "Chọn đơn vị bán.";
      if (s.saleUnit !== "kg" && s.packNetWeightKg && !isPositiveDecimal(s.packNetWeightKg))
        return "Khối lượng mỗi gói phải là số kg lớn hơn 0 (vd. 0.5).";
      return null;
    case "moq":
      if (!isPositiveDecimal(s.minOrderQty)) return "Nhập số lượng tối thiểu (vd. 10).";
      if (s.orderStepQty && !isPositiveDecimal(s.orderStepQty)) return "Bước tăng phải là số lớn hơn 0.";
      return null;
    case "price":
      if (s.priceMode === "quote_required") return null;
      if (s.priceMode === "fixed") return /^[1-9]\d{0,11}$/.test(normalizeVnd(s.unitPriceVnd)) ? null : "Nhập giá bằng số đồng (vd. 55000).";
      return "Chọn giá cố định hoặc liên hệ báo giá.";
    case "storage":
      return s.storageInstructions.trim() ? null : "Cần hướng dẫn bảo quản đã được bạn xác nhận.";
    default:
      return null;
  }
}

/** Facts a buyer needs; mirrors the approve_product gate plus the commercial basics. */
export function completeness(s: SheetState): { filled: number; total: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ["Tên", s.name.trim().length >= 2],
    ["Nhóm hàng", !!s.category],
    ["Sơ chế", !!s.processing.trim()],
    ["Xuất xứ", /^[A-Z]{2}$/.test(s.originCountry)],
    ["Đơn vị bán", !!s.saleUnit],
    ["Đơn tối thiểu", isPositiveDecimal(s.minOrderQty)],
    ["Giá", s.priceMode === "quote_required" || (s.priceMode === "fixed" && !!normalizeVnd(s.unitPriceVnd))],
    ["Bảo quản", !!s.storageInstructions.trim()],
    ["Hạn dùng", !!s.shelfLifeNote.trim()],
    ["Mô tả", !!s.summary.trim() || !!s.description.trim()],
  ];
  return {
    filled: checks.filter(([, ok]) => ok).length,
    total: checks.length,
    missing: checks.filter(([, ok]) => !ok).map(([k]) => k),
  };
}

/** Request body for POST /api/seller/[tenantId]/products. */
export function sheetToPayload(
  s: SheetState,
  opts: { jobId: string | null; photoAssetIds: string[]; approve: boolean },
): Record<string, unknown> {
  const nul = (v: string) => (v.trim() ? v.trim() : null);
  const unit = s.saleUnit || "kg";
  return {
    jobId: opts.jobId,
    photoAssetIds: opts.photoAssetIds,
    name: s.name.trim(),
    category: nul(s.category),
    processing: nul(s.processing),
    originCountry: nul(s.originCountry),
    originRegion: nul(s.originRegion),
    storageInstructions: nul(s.storageInstructions),
    shelfLifeNote: nul(s.shelfLifeNote),
    summary: nul(s.summary),
    description: nul(s.description),
    variant: {
      saleUnit: unit,
      packNetWeightKg: unit === "kg" ? null : nul(normalizeDecimal(s.packNetWeightKg)),
      packDescription: nul(s.packDescription),
      minOrderQty: normalizeDecimal(s.minOrderQty),
      orderStepQty: s.orderStepQty.trim()
        ? normalizeDecimal(s.orderStepQty)
        : Number(normalizeDecimal(s.minOrderQty)) >= 1
          ? "1"
          : normalizeDecimal(s.minOrderQty),
    },
    price: s.priceMode === "fixed" ? { mode: "fixed", unitPriceVnd: normalizeVnd(s.unitPriceVnd) } : { mode: "quote_required" },
    approve: opts.approve,
  };
}

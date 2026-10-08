import { z } from "zod";

/** Shape of storefront_versions.catalog, produced by private.build_catalog_snapshot() at publish time.
 * Decimal quantities and money stay strings end to end so they are never rounded through floats. */

const decimalString = z.string().regex(/^\d+(\.\d+)?$/);
const integerString = z.string().regex(/^\d+$/);

export const snapshotOfferSchema = z.object({
  priceMode: z.enum(["fixed", "quote_required"]),
  currency: z.string().length(3),
  unitPriceMinor: integerString.nullable(),
  validTo: z.string().nullable(),
});

export const snapshotVariantSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().nullable(),
  packDescription: z.string().nullable(),
  saleUnit: z.enum(["kg", "bag", "box", "carton", "piece"]),
  packNetWeightKg: decimalString.nullable(),
  minOrderQty: decimalString,
  orderStepQty: decimalString,
  offer: snapshotOfferSchema.nullable(),
});

export const snapshotProductSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  processing: z.string().nullable(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  originCountry: z.string().nullable(),
  originRegion: z.string().nullable(),
  storageInstructions: z.string().nullable(),
  shelfLifeNote: z.string().nullable(),
  approvedAt: z.string(),
  imageAssetIds: z.array(z.string().uuid()),
  variants: z.array(snapshotVariantSchema),
  evidence: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      sourceType: z.enum(["seller_statement", "document", "link"]),
      sourceUrl: z.string().nullable(),
      confirmedAt: z.string(),
    }),
  ),
});

export const snapshotAssetSchema = z.object({
  id: z.string().uuid(),
  bucket: z.literal("tenant-public"),
  objectKey: z.string(),
  alt: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  kind: z.string(),
});

export const catalogSnapshotSchema = z.object({
  schemaVersion: z.literal("catalog-snapshot.v1"),
  generatedAt: z.string(),
  assets: z.array(snapshotAssetSchema),
  products: z.array(snapshotProductSchema),
});

export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type SnapshotProduct = z.infer<typeof snapshotProductSchema>;
export type SnapshotVariant = z.infer<typeof snapshotVariantSchema>;
export type SnapshotAsset = z.infer<typeof snapshotAssetSchema>;

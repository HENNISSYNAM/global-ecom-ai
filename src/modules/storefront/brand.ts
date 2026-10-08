import { z } from "zod";

/** Seller-confirmed business details shown in header/footer and Organization JSON-LD. Every field is optional:
 * a missing field is hidden, never filled with invented content. */

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[<>]/.test(s), "angle brackets are not allowed");

export const brandSchema = z
  .object({
    businessName: text(200),
    tagline: text(140).optional(),
    logoAssetId: z.string().uuid().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9 .-]{8,20}$/)
      .optional(),
    email: z.string().email().max(200).optional(),
    address: text(300).optional(),
    /** Public website the seller already operates, if any. https only. */
    website: z
      .string()
      .url()
      .regex(/^https:\/\//)
      .optional(),
    isDemo: z.boolean().default(false),
  })
  .strict();

export type Brand = z.infer<typeof brandSchema>;

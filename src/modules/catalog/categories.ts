/** Category slugs the assistant offers, with Vietnamese labels. Sellers may also use their own slugs. */
export const CATEGORY_CHOICES: { slug: string; label: string }[] = [
  { slug: "toi", label: "Tỏi" },
  { slug: "hanh-tim", label: "Hành tím" },
  { slug: "hanh-tay", label: "Hành tây" },
  { slug: "gung", label: "Gừng" },
  { slug: "sa", label: "Sả" },
  { slug: "cu-nang", label: "Củ năng" },
  { slug: "mang", label: "Măng" },
  { slug: "rau-cu", label: "Rau củ khác" },
];

export function categoryLabel(slug: string | null): string {
  if (!slug) return "Sản phẩm khác";
  const known = CATEGORY_CHOICES.find((c) => c.slug === slug);
  if (known) return known.label;
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

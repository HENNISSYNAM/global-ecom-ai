import { z } from "zod";

/**
 * Theme tokens. Stores pick from an allowlist of font families and supply colours as hex values; the renderer turns
 * them into CSS variables. No raw CSS is accepted from sellers or the AI.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB");

export const FONT_FAMILIES = {
  vollkorn: { css: "'Vollkorn', Georgia, 'Times New Roman', serif", google: "Vollkorn:ital,wght@0,400..700;1,400..700" },
  "barlow-condensed": { css: "'Barlow Condensed', 'Arial Narrow', sans-serif", google: "Barlow+Condensed:wght@500;600;700" },
  "barlow-semi-condensed": {
    css: "'Barlow Semi Condensed', 'Arial Narrow', sans-serif",
    google: "Barlow+Semi+Condensed:wght@500;600",
  },
  nunito: { css: "'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif", google: "Nunito:wght@400;600;700" },
} as const;

export type FontFamilyId = keyof typeof FONT_FAMILIES;
const fontId = z.enum(Object.keys(FONT_FAMILIES) as [FontFamilyId, ...FontFamilyId[]]);

export const themeSchema = z
  .object({
    preset: z.literal("editorial-kem").default("editorial-kem"),
    colors: z
      .object({
        background: hex,
        surface: hex,
        foreground: hex,
        muted: hex,
        accent: hex,
        line: hex,
        inverseBackground: hex,
        inverseForeground: hex,
      })
      .strict(),
    fonts: z.object({ display: fontId, condensed: fontId, action: fontId, body: fontId }).strict(),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;

/**
 * Default preset inspired by the observed Cocoon palette (cream background, dark brown text, earthy gold accent).
 * Values come from docs/reference/agri-commerce/cocoon-design-language.md; they are a starting point, and each
 * store is expected to set its own accent after its brand is confirmed.
 */
export const EDITORIAL_KEM_THEME: Theme = {
  preset: "editorial-kem",
  colors: {
    background: "#FEFBF4",
    surface: "#F6F0E2",
    foreground: "#1F1C17",
    muted: "#55504A",
    accent: "#C5A25D",
    line: "#E7E5DF",
    inverseBackground: "#1F1C17",
    inverseForeground: "#FEFBF4",
  },
  fonts: { display: "vollkorn", condensed: "barlow-condensed", action: "barlow-semi-condensed", body: "nunito" },
};

export function parseTheme(raw: unknown): Theme {
  const parsed = themeSchema.safeParse(raw);
  return parsed.success ? parsed.data : EDITORIAL_KEM_THEME;
}

export function themeToCssVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    "--c-bg": c.background,
    "--c-surface": c.surface,
    "--c-fg": c.foreground,
    "--c-muted": c.muted,
    "--c-accent": c.accent,
    "--c-line": c.line,
    "--c-inverse-bg": c.inverseBackground,
    "--c-inverse-fg": c.inverseForeground,
    "--f-display": FONT_FAMILIES[theme.fonts.display].css,
    "--f-condensed": FONT_FAMILIES[theme.fonts.condensed].css,
    "--f-action": FONT_FAMILIES[theme.fonts.action].css,
    "--f-body": FONT_FAMILIES[theme.fonts.body].css,
  };
}

export function googleFontsHref(theme: Theme): string {
  const families = new Set(Object.values(theme.fonts).map((id) => FONT_FAMILIES[id].google));
  return `https://fonts.googleapis.com/css2?${[...families].map((f) => `family=${f}`).join("&")}&display=swap`;
}

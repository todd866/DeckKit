// Deck shape and palette.
//
// No React here on purpose, so a server component or a build script can import the types
// without pulling in the renderer.
//
// The palette is a neutral default, not anyone's brand. Replace the five accents and three
// tints with your own; if you do, keep ACCENT_TEXT darker than ACCENT, because the bright
// mid-tones that look right as fills are unreadable as text on a projector.

// ---- types (a deck file is heterogeneous by layout, so slides stay loose) ----
export interface Slide {
  id: string;
  layout: string;
  /** true = lives in the hidden appendix group, reached with M, left with Escape */
  appendix?: boolean;
  /**
   * The id of the surface slide this hidden slide belongs to. Set it (with `appendix`) and M
   * from that slide enters only its own depth; the arrows then page within that depth alone.
   * Hidden slides without a `depthOf` form the flat appendix, which is what M falls back to
   * when the current slide has no depth of its own.
   */
  depthOf?: string;
  [key: string]: unknown;
}

/** Optional decoration. Every field may be omitted; the deck renders plainer, not broken. */
export interface DeckAssets {
  /** background photo behind the title slide's accent panel */
  titlePhoto?: string;
  /** background photo behind the closing slide's accent panel */
  closePhoto?: string;
  /** logo for the dark accent panels (title, close) */
  logoLight?: string;
  /** logo for the light content slides, top right */
  logoDark?: string;
}

export interface DeckMeta {
  docTitle: string;
  docSubtitle: string;
  author: string;
  assets?: DeckAssets;
  [k: string]: unknown;
}

export interface Deck {
  meta: DeckMeta;
  slides: Slide[];
}

export const ACCENT: Record<string, string> = {
  red: "#C24A2C",
  teal: "#4A8375",
  gold: "#B08427",
  ink: "#22334E",
  gray: "#4A4A4A",
};
export const TINT: Record<string, string> = {
  red: "#F7E0D8",
  teal: "#E4EDEA",
  gold: "#F2E8CF",
};
export const accent = (name?: string) => ACCENT[name ?? "ink"] ?? "#22334E";
export const tint = (name?: string) => TINT[name ?? "teal"] ?? "#E4EDEA";
// Darker variants for TEXT on light backgrounds. The bright mid-tones above are for fills
// and marks; as text they wash out when projected and fall under the contrast floor. These
// five are all >= 4.5:1 on white, so they are safe for body text, not just headings.
export const ACCENT_TEXT: Record<string, string> = {
  red: "#A93B22", teal: "#356B5D", gold: "#7E5C12", ink: "#22334E", gray: "#3F3F3F",
};
export const accentText = (name?: string) => ACCENT_TEXT[name ?? "ink"] ?? ACCENT.ink;

/** Paper colour, and the rule/edge colour drawn on it. Shared with the .pptx exporter. */
export const PAPER = "#F5F1E7";
export const RULE = "#CBC4B4";

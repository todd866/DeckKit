"""Export a deck file to a real .pptx.

    python export/build_pptx.py                       # decks/example.json -> build/example.pptx
    python export/build_pptx.py decks/mine.json out/talk.pptx

The slides are native PowerPoint shapes and text boxes, not pictures of slides, so the
file opens and edits anywhere. It is the fallback for the venue that will not let you plug
in a laptop, and the artefact for the person who asks you to email the slides.

This module owns LAYOUT — where each layout draws its boxes on a 13.333 x 7.5in stage.
The deck file owns CONTENT. That division is the whole design: the browser renderer in
src/deck/ and this file lay the same words out differently, and neither can change what
they say.

Convert to PDF, if you need one, with LibreOffice:

    soffice --headless --convert-to pdf --outdir build build/example.pptx
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DEFAULT_DECK = ROOT / "decks/example.json"

# ---- palette — keep in step with src/deck/deckTypes.ts ----------------------
PAPER = RGBColor(0xF5, 0xF1, 0xE7)
INK = RGBColor(0x22, 0x33, 0x4E)
RED = RGBColor(0xC2, 0x4A, 0x2C)
TEAL = RGBColor(0x4A, 0x83, 0x75)
GOLD = RGBColor(0xB0, 0x84, 0x27)
GRAY = RGBColor(0x4A, 0x4A, 0x4A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
T_RED = RGBColor(0xF7, 0xE0, 0xD8)
T_TEAL = RGBColor(0xE4, 0xED, 0xEA)
T_GOLD = RGBColor(0xF2, 0xE8, 0xCF)
RULE = RGBColor(0xCB, 0xC4, 0xB4)

ACCENT = {"red": RED, "teal": TEAL, "gold": GOLD, "ink": INK, "gray": GRAY}
TINT = {"red": T_RED, "teal": T_TEAL, "gold": T_GOLD}

# Arial rather than a nicer face on purpose: this file gets emailed, and a font the
# recipient does not have is a layout you did not design.
HEAD = "Arial"
BODY = "Arial"

EMU_W, EMU_H = Inches(13.333), Inches(7.5)
ML = Inches(0.7)     # left margin
CW = Inches(12.0)    # content width
RIGHT = Inches(6.63) # left edge of the right-hand column
COL_L = Inches(5.7)  # left column width
COL_R = Inches(6.0)  # right column width


def _accent(name, default=INK):
    return ACCENT.get(name, default)


def _tint(name, default=T_TEAL):
    return TINT.get(name, default)


def _set(run, size, color, bold=False, font=BODY):
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.name = font


def text(slide, s, l, t, w, h, size, color, bold=False, font=BODY,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.0):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, 0)
    # A deck file uses "\n\n" for a paragraph break and "\n" for a soft break; PowerPoint
    # has only paragraphs, so both become paragraphs and the blank one carries the gap.
    for i, ln in enumerate(s.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run(); r.text = ln; _set(r, size, color, bold, font)
    return tb


def rect(slide, l, t, w, h, fill=None, line=None, line_w=1.0):
    sp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    sp.shadow.inherit = False
    if fill is None:
        sp.fill.background()
    else:
        sp.fill.solid(); sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line; sp.line.width = Pt(line_w)
    return sp


def base(prs, d, eyebrow=True):
    """A blank paper-coloured slide with this slide's eyebrow, footer, page and notes."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    eb = d.get("eyebrow") if eyebrow else None
    if eb:
        rect(slide, ML, Inches(0.5), Inches(0.12), Inches(0.12), fill=RED)
        text(slide, eb.upper(), Inches(0.95), Inches(0.45), Inches(9),
             Inches(0.3), 11, RED, bold=True)
    if d.get("footer"):
        rect(slide, ML, Inches(6.92), CW, Pt(0.75), fill=RULE)
        text(slide, d["footer"], ML, Inches(7.0), Inches(10), Inches(0.3), 8, GRAY)
    if d.get("page"):
        text(slide, str(d["page"]), Inches(12.3), Inches(7.0), Inches(0.6), Inches(0.3),
             8, GRAY, align=PP_ALIGN.RIGHT)
    if d.get("notes"):
        slide.notes_slide.notes_text_frame.text = d["notes"]
    return slide


def heading(slide, d, top=0.95):
    text(slide, d["heading"], ML, Inches(top), CW, Inches(1.2), 30, INK, bold=True,
         font=HEAD, spacing=1.02)
    if d.get("subhead"):
        text(slide, d["subhead"], ML, Inches(top + 1.15), CW, Inches(0.5), 14, GRAY)


def fit_picture(slide, path, l, t, w, h):
    """Place a picture inside an (l, t, w, h) box WITHOUT distorting it.

    python-pptx's add_picture scales each axis independently when given both width and
    height, so a box whose aspect ratio does not match the image's silently stretches it.
    Scale to fit and centre instead.
    """
    from PIL import Image
    iw, ih = Image.open(str(path)).size
    scale = min(w / iw, h / ih)
    dw, dh = int(iw * scale), int(ih * scale)
    return slide.shapes.add_picture(str(path), l + (w - dw) // 2, t + (h - dh) // 2,
                                    width=dw, height=dh)


def public_path(src, slide_id):
    """Resolve a deck image path (a URL under public/) to a file, or fail loudly.

    Silently shipping a results slide with no result is worse than failing the build.
    """
    p = PUBLIC / str(src).lstrip("/")
    if not p.exists():
        raise FileNotFoundError(
            f"slide {slide_id!r} wants {src}, which is not at {p}. "
            f"Generate it (see export/make_figure.py) before exporting.")
    return p


def bottom_line_size(s):
    """Point size for the bottom-line caption, chosen so it cannot overrun its band.

    The caption is drawn into a fixed box at y=5.96in and the footer rule sits at 6.92in.
    python-pptx has no autofit that LibreOffice honours, so size by length instead: a
    caption long enough to need three lines gets 14pt, because three lines at 17pt end up
    with their descenders sitting on the rule once LibreOffice adds its own leading.
    """
    n = len(s.split())
    if n <= 30:
        return 17
    if n <= 48:
        return 14
    return 12


def bottom_line(slide, d):
    s = d.get("bottomLine")
    if not s:
        return
    text(slide, s, Inches(1.2), Inches(5.96), Inches(10.93), Inches(0.95),
         bottom_line_size(s), _accent(d.get("bottomLineAccent"), INK), bold=True,
         font=HEAD, align=PP_ALIGN.CENTER, spacing=1.0)


def card(slide, l, t, w, h, accent, title, body, fill=WHITE,
         title_size=15, body_size=11):
    rect(slide, l, t, w, h, fill=fill, line=RULE, line_w=1.0)
    rect(slide, l, t, w, Inches(0.07), fill=accent)        # top accent strip
    text(slide, title, l + Inches(0.2), t + Inches(0.22), w - Inches(0.4),
         Inches(0.5), title_size, accent, bold=True, font=HEAD)
    text(slide, body, l + Inches(0.2), t + Inches(0.78), w - Inches(0.4),
         h - Inches(0.95), body_size, GRAY, spacing=1.05)


def _eq_run(paragraph, s, size, color, superscript=False):
    r = paragraph.add_run(); r.text = s
    r.font.size = Pt(size); r.font.color.rgb = color; r.font.name = BODY
    if superscript:
        r._r.get_or_add_rPr().set("baseline", "30000")
    return r


def equation_text(slide, s, l, t, w, h, size, color, spacing=1.12):
    """Render a formula, superscripting any ^{...} group."""
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame; tf.word_wrap = True
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, 0)
    for i, line in enumerate(s.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = spacing
        idx = 0
        while idx < len(line):
            sup = line.find("^{", idx)
            if sup == -1:
                _eq_run(p, line[idx:], size, color); break
            if sup > idx:
                _eq_run(p, line[idx:sup], size, color)
            end = line.find("}", sup + 2)
            if end == -1:
                _eq_run(p, line[sup:], size, color); break
            _eq_run(p, line[sup + 2:end], size, color, superscript=True)
            idx = end + 1
    return tb


def row_widths(n, total=CW, gap=Inches(0.2)):
    """n equal columns across `total`, with `gap` between them."""
    w = int((total - gap * (n - 1)) / n)
    return w, gap


# ---- per-layout renderers ---------------------------------------------------
def pair(d, key):
    """Two-column layouts take exactly two items; say which slide is wrong.

    `c0, c1 = d["cards"]` raises "too many values to unpack", which names neither the slide
    nor the field, and you find out on the morning of the talk rather than in `npm test`.
    """
    items = d.get(key) or []
    if len(items) != 2:
        raise ValueError(
            f"slide {d.get('id')!r} is a {d.get('layout')!r}, so {key!r} must hold exactly "
            f"two items; it has {len(items)}"
        )
    return items


# Each takes (prs, d) where d is one slide object from the deck file.

def render_title(prs, d):
    s = base(prs, d, eyebrow=False)
    rect(s, 0, 0, Inches(0.28), EMU_H, fill=RED)
    if d.get("eyebrow"):
        text(s, d["eyebrow"], ML, Inches(0.55), Inches(9), Inches(0.3), 12, RED, bold=True)
    text(s, d["title"], ML, Inches(1.1), Inches(11.5), Inches(1.7), 40, INK,
         bold=True, font=HEAD, spacing=1.0)
    if d.get("subtitle"):
        text(s, d["subtitle"], ML, Inches(2.95), Inches(11), Inches(0.5), 15, GRAY)
    x = ML
    for chip in d.get("chips", [])[:2]:
        w = Inches(3.4)
        rect(s, x, Inches(3.7), w, Inches(0.5), fill=_tint(chip["accent"]))
        text(s, chip["text"], x, Inches(3.78), w, Inches(0.35), 12,
             _accent(chip["accent"]), bold=True, align=PP_ALIGN.CENTER)
        x += w + Inches(0.2)
    if d.get("thesis"):
        rect(s, Inches(8.0), Inches(3.55), Inches(4.6), Inches(1.5), fill=WHITE, line=RULE)
        rect(s, Inches(8.0), Inches(3.55), Inches(0.08), Inches(1.5), fill=TEAL)
        text(s, d.get("thesisTitle", "Thesis"), Inches(8.25), Inches(3.72), Inches(4.1),
             Inches(0.4), 14, INK, bold=True, font=HEAD)
        text(s, d["thesis"], Inches(8.25), Inches(4.2), Inches(4.15), Inches(0.8),
             11, GRAY, spacing=1.05)
    if d.get("author"):
        text(s, d["author"], ML, Inches(5.55), Inches(8), Inches(1.0), 12, INK, spacing=1.1)


def render_hook(prs, d):
    s = base(prs, d)
    heading(s, d)
    left, right = d["statLeft"], d["statRight"]
    rect(s, ML, Inches(2.7), COL_L, Inches(2.4), fill=T_RED)
    text(s, left["value"], ML, Inches(2.95), COL_L, Inches(1.2), 66, RED,
         bold=True, font=HEAD, align=PP_ALIGN.CENTER)
    text(s, left["label"], ML, Inches(4.35), COL_L, Inches(0.5), 14, INK,
         bold=True, align=PP_ALIGN.CENTER)
    rect(s, RIGHT, Inches(2.7), COL_R, Inches(2.4), fill=T_TEAL)
    text(s, right["value"], RIGHT, Inches(2.95), COL_R, Inches(1.2),
         52 if len(right["value"]) <= 9 else 34, TEAL, bold=True, font=HEAD,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, right["label"], RIGHT, Inches(4.35), COL_R, Inches(0.5), 13, INK,
         bold=True, align=PP_ALIGN.CENTER)
    bottom_line(s, d)


def render_timeline(prs, d):
    s = base(prs, d)
    heading(s, d)
    if d.get("barValue"):
        rect(s, ML, Inches(2.85), Inches(6.6), Inches(0.7), fill=RED)
        rect(s, Inches(7.3), Inches(2.85), Inches(5.3), Inches(0.7), fill=T_RED)
        text(s, d["barValue"], ML + Inches(0.2), Inches(2.95), Inches(4), Inches(0.5),
             22, WHITE, bold=True, font=HEAD)
        text(s, d.get("barLabel", ""), Inches(3.4), Inches(3.05), Inches(3.4),
             Inches(0.4), 11, WHITE)
    stops = d["stops"]
    x0, x1 = ML, Inches(12.3)
    rect(s, x0, Inches(4.05), x1 - x0, Pt(1.5), fill=RULE)
    step = (x1 - x0) / max(1, len(stops) - 1)
    for i, st in enumerate(stops):
        cx = int(x0 + i * step)
        rect(s, cx - Inches(0.09), Inches(3.95), Inches(0.18), Inches(0.18),
             fill=_accent(st["accent"]))
        text(s, st["label"], cx - Inches(1.0), Inches(4.25), Inches(2.0),
             Inches(0.6), 10, INK, align=PP_ALIGN.CENTER, spacing=1.0)
    bottom_line(s, d)


def render_two_card(prs, d):
    s = base(prs, d)
    heading(s, d)
    c0, c1 = pair(d, "cards")
    card(s, ML, Inches(2.7), COL_L, Inches(2.9), _accent(c0["accent"]), c0["title"], c0["body"])
    card(s, RIGHT, Inches(2.7), COL_R, Inches(2.9), _accent(c1["accent"]), c1["title"], c1["body"])
    bottom_line(s, d)


def render_qa_backup(prs, d):
    s = base(prs, d)
    heading(s, d)
    c0, c1 = pair(d, "cards")
    card(s, ML, Inches(2.6), COL_L, Inches(3.2), _accent(c0["accent"]), c0["title"], c0["body"])
    card(s, RIGHT, Inches(2.6), COL_R, Inches(3.2), _accent(c1["accent"]), c1["title"], c1["body"])
    bottom_line(s, d)


def render_two_panel(prs, d):
    s = base(prs, d)
    heading(s, d)
    p0, p1 = pair(d, "panels")
    for p, x, w in ((p0, ML, COL_L), (p1, RIGHT, COL_R)):
        rect(s, x, Inches(2.75), w, Inches(2.5), fill=_tint(p["accent"]))
        text(s, p["title"], x + Inches(0.25), Inches(2.95), w - Inches(0.5),
             Inches(0.4), 15, _accent(p["accent"]), bold=True, font=HEAD)
        text(s, p["body"], x + Inches(0.25), Inches(3.5), w - Inches(0.5), Inches(1.6),
             13, INK, spacing=1.15)
    bottom_line(s, d)


def render_metric_grid(prs, d):
    s = base(prs, d)
    heading(s, d)
    items = d["metrics"]
    w, gap = row_widths(len(items))
    x = ML
    for m in items:
        c = _accent(m["accent"])
        rect(s, x, Inches(2.8), w, Inches(2.5), fill=WHITE, line=RULE)
        rect(s, x, Inches(2.8), Inches(0.55), Inches(0.55), fill=c)
        text(s, m["n"], x, Inches(2.86), Inches(0.55), Inches(0.45), 22, WHITE,
             bold=True, font=HEAD, align=PP_ALIGN.CENTER)
        text(s, m["name"], x + Inches(0.2), Inches(3.55), w - Inches(0.4),
             Inches(0.7), 16, c, bold=True, font=HEAD, spacing=1.0)
        text(s, m["detail"], x + Inches(0.2), Inches(4.28), w - Inches(0.4),
             Inches(0.9), 12, GRAY, spacing=1.05)
        x += w + gap
    bottom_line(s, d)


def render_takeaways(prs, d):
    s = base(prs, d)
    heading(s, d)
    items = d["items"]
    w, gap = row_widths(len(items), gap=Inches(0.22))
    x = ML
    for it in items:
        c = _accent(it["accent"])
        rect(s, x, Inches(2.85), w, Inches(2.5), fill=WHITE, line=RULE)
        text(s, it["n"], x + Inches(0.25), Inches(3.05), Inches(0.8), Inches(0.8),
             40, c, bold=True, font=HEAD)
        text(s, it["title"], x + Inches(1.1), Inches(3.2), w - Inches(1.3),
             Inches(0.7), 16, INK, bold=True, font=HEAD, spacing=1.0)
        text(s, it["body"], x + Inches(0.25), Inches(4.15), w - Inches(0.5),
             Inches(1.0), 12, GRAY, spacing=1.1)
        x += w + gap
    bottom_line(s, d)


def render_table(prs, d):
    s = base(prs, d)
    heading(s, d)
    y = Inches(2.75); rh = Inches(0.62)
    for i, row in enumerate(d["rows"]):
        if i % 2 == 0:
            rect(s, ML, y, CW, rh, fill=WHITE)
        rect(s, ML + Inches(0.15), y + Inches(0.21), Inches(0.2), Inches(0.2),
             fill=_accent(row["accent"]))
        text(s, row["label"], ML + Inches(0.55), y + Inches(0.13), Inches(3.6),
             Inches(0.4), 14, INK, bold=True, font=HEAD)
        text(s, row["detail"], Inches(4.8), y + Inches(0.15), Inches(7.6),
             Inches(0.4), 12, GRAY)
        y += rh
    bottom_line(s, d)


def render_equation(prs, d):
    s = base(prs, d)
    heading(s, d)
    rect(s, ML, Inches(2.45), Inches(5.85), Inches(3.0), fill=INK)
    text(s, d.get("equationTitle", "The equation"), ML + Inches(0.25), Inches(2.7),
         Inches(5.35), Inches(0.35), 13, T_TEAL, bold=True, font=HEAD)
    equation_text(s, d["equation"], ML + Inches(0.25), Inches(3.15), Inches(5.35),
                  Inches(1.9), 13, WHITE, spacing=1.12)
    y = Inches(2.35)
    for t in d.get("thresholds", []):
        rect(s, Inches(6.85), y, Inches(5.55), Inches(0.78), fill=_tint(t["accent"]))
        # An operating point is usually short ("0.30", "16:9"), but not always; drop a
        # size rather than let a long one wrap inside its own box.
        text(s, t["value"], Inches(7.05), y + Inches(0.15), Inches(1.35), Inches(0.5),
             23 if len(t["value"]) <= 5 else 15, _accent(t["accent"]), bold=True,
             font=HEAD, align=PP_ALIGN.CENTER)
        text(s, t["label"], Inches(8.55), y + Inches(0.15), Inches(3.7), Inches(0.5),
             12, INK, bold=True, spacing=1.0)
        y += Inches(1.0)
    if d.get("readIt"):
        rect(s, Inches(6.85), y, Inches(5.55), Inches(1.55), fill=WHITE, line=RULE)
        text(s, d.get("readItTitle", "How to read it"), Inches(7.1), y + Inches(0.17),
             Inches(5.05), Inches(0.35), 13, INK, bold=True, font=HEAD)
        text(s, d["readIt"], Inches(7.1), y + Inches(0.57), Inches(5.05), Inches(0.9),
             11, GRAY, spacing=1.05)
    bottom_line(s, d)


def render_figure(prs, d):
    s = base(prs, d)
    heading(s, d)
    fit_picture(s, public_path(d["image"], d.get("id")),
                Inches(1.0), Inches(2.45), Inches(11.33), Inches(3.30))
    bottom_line(s, d)


def render_embed(prs, d):
    """A live page cannot run in a .pptx, so the slide's poster stands in for it.

    That is the honest export, and it is why `embed` slides carry a poster at all: the
    browser needs one when the network fails, and this file needs one always.
    """
    s = base(prs, d)
    heading(s, d)
    fit_picture(s, public_path(d["poster"], d.get("id")),
                Inches(1.0), Inches(2.45), Inches(11.33), Inches(3.30))
    bottom_line(s, d)


def render_close(prs, d):
    s = base(prs, d, eyebrow=False)
    rect(s, 0, 0, Inches(0.28), EMU_H, fill=RED)
    text(s, d["heading"], ML, Inches(2.4), Inches(7.5), Inches(1.2), 48, INK,
         bold=True, font=HEAD)
    # The sub stays in the left column so it never runs under the acknowledgements
    # panel, which starts at 8.6in.
    if d.get("sub"):
        text(s, d["sub"], ML, Inches(3.7), Inches(7.5), Inches(1.6), 18, GRAY)
    if d.get("acknowledgements"):
        rect(s, Inches(8.6), Inches(2.4), Inches(4.0), Inches(2.6), fill=T_RED)
        text(s, d.get("acknowledgementsTitle", "With thanks"), Inches(8.85),
             Inches(2.6), Inches(3.5), Inches(0.4), 13, RED, bold=True, font=HEAD)
        text(s, d["acknowledgements"], Inches(8.85), Inches(3.1), Inches(3.5),
             Inches(1.7), 11, INK, spacing=1.25)


RENDERERS = {
    "title": render_title,
    "hook": render_hook,
    "timeline": render_timeline,
    "two-card": render_two_card,
    "qa-backup": render_qa_backup,
    "two-panel": render_two_panel,
    "metric-grid": render_metric_grid,
    "takeaways": render_takeaways,
    "table": render_table,
    "equation": render_equation,
    "figure": render_figure,
    "embed": render_embed,
    "close": render_close,
}


def load_deck(path=DEFAULT_DECK):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build(deck):
    prs = Presentation()
    prs.slide_width, prs.slide_height = EMU_W, EMU_H
    meta = deck["meta"]
    prs.core_properties.title = meta.get("docTitle", "")
    prs.core_properties.subject = meta.get("docSubtitle", "")
    prs.core_properties.author = meta.get("author", "")
    for d in deck["slides"]:
        layout = d["layout"]
        if layout not in RENDERERS:
            raise ValueError(f"unknown layout {layout!r} on slide {d.get('id')!r}. "
                             f"Known: {', '.join(sorted(RENDERERS))}")
        RENDERERS[layout](prs, d)
    return prs


def main(argv):
    src = Path(argv[1]) if len(argv) > 1 else DEFAULT_DECK
    out = Path(argv[2]) if len(argv) > 2 else ROOT / "build" / (src.stem + ".pptx")
    prs = build(load_deck(src))
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(out))
    print(f"wrote {out}  ({len(prs.slides)} slides from {src})")


if __name__ == "__main__":
    main(sys.argv)

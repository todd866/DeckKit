"""Draw the figure that appears on the `figure` slide, from the deck file itself.

    python export/make_figure.py [decks/some-deck.json]

Writes two PNGs into public/, where both the browser renderer and build_pptx.py read
them:

  public/figures/words-per-slide.png   words on each slide, split into what is on the
                                       slide and what is hidden behind a click
  public/figures/embed-poster.png      the still that stands in for the live `embed`
                                       slide when it cannot run

The first one is the argument the repository is making, in miniature. The chart is
computed from decks/example.json every time this runs, so editing a slide and re-running
gives a correct chart. There is no version of this where the chart is right and the deck
has moved on, because there is nowhere for the old numbers to be stored.

Depends only on Pillow.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DECK = ROOT / "decks/example.json"
FIGURES = ROOT / "public/figures"

PAPER = "#F5F1E7"
INK = "#22334E"
TEAL = "#4A8375"
T_TEAL = "#E4EDEA"
RED = "#C24A2C"
T_RED = "#F7E0D8"
GOLD = "#B08427"
GRAY = "#4A4A4A"
RULE = "#CBC4B4"
WHITE = "#FFFFFF"

# Keys that carry no words a human reads off the slide.
SKIP = {"id", "layout", "accent", "bottomLineAccent", "image", "src", "poster",
        "page", "appendix"}
# Keys whose contents are behind a click rather than on the slide.
HIDDEN = {"more", "deck", "notes"}


def font(size, bold=False):
    """A real font if the machine has one, Pillow's scalable fallback otherwise."""
    candidates = [
        f"/System/Library/Fonts/Supplemental/Arial{' Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
        f"C:/Windows/Fonts/arial{'bd' if bold else ''}.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:      # Pillow < 10.1: a fixed-size bitmap font is all there is
        return ImageFont.load_default()


def count_words(node, hidden=False):
    """(on-slide words, behind-a-click words) for one slide object."""
    shown = deep = 0
    if isinstance(node, str):
        n = len(node.split())
        return (0, n) if hidden else (n, 0)
    if isinstance(node, dict):
        for k, v in node.items():
            if k in SKIP:
                continue
            a, b = count_words(v, hidden or k in HIDDEN)
            shown += a; deep += b
    elif isinstance(node, list):
        for v in node:
            a, b = count_words(v, hidden)
            shown += a; deep += b
    return shown, deep


def words_per_slide(deck):
    return [(s["id"], *count_words(s)) for s in deck["slides"]]


def bar_chart(data, out):
    """Stacked bars: solid = words on the slide, tint = words behind a click."""
    # 2200 x 670 is the aspect of the figure box in both renderers (11.33 x 3.45in), so
    # the chart fills it without letterboxing on either side.
    W, H = 2200, 670
    L, R, T, B = 90, 40, 96, 92
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    f_lab = font(21)
    f_num = font(20, bold=True)
    f_key = font(22)

    top = max(shown + deep for _, shown, deep in data)
    top = int((top + 19) // 20 * 20)
    plot_h = H - T - B
    n = len(data)
    slot = (W - L - R) / n
    bw = slot * 0.62

    # gridlines, drawn under the bars
    for g in range(0, top + 1, max(20, top // 4)):
        y = H - B - plot_h * g / top
        d.line([(L, y), (W - R, y)], fill=RULE, width=1)
        d.text((L - 14, y), str(g), font=f_lab, fill=GRAY, anchor="rm")

    for i, (label, shown, deep) in enumerate(data):
        x = L + slot * i + (slot - bw) / 2
        h_shown = plot_h * shown / top
        h_deep = plot_h * deep / top
        y0 = H - B
        d.rectangle([x, y0 - h_shown, x + bw, y0], fill=INK)
        if deep:
            d.rectangle([x, y0 - h_shown - h_deep, x + bw, y0 - h_shown], fill=T_TEAL)
        d.text((x + bw / 2, y0 - h_shown - h_deep - 10), str(shown + deep),
               font=f_num, fill=GRAY, anchor="ms")
        d.text((x + bw / 2, y0 + 14), label, font=f_lab, fill=INK, anchor="ma")

    d.line([(L, H - B), (W - R, H - B)], fill=INK, width=2)

    # key
    d.rectangle([L, 30, L + 26, 56], fill=INK)
    d.text((L + 38, 43), "on the slide", font=f_key, fill=INK, anchor="lm")
    d.rectangle([L + 250, 30, L + 276, 56], fill=T_TEAL)
    d.text((L + 288, 43), "behind a click", font=f_key, fill=INK, anchor="lm")
    d.text((W - R, 43), "words per slide, decks/example.json", font=f_key,
           fill=GRAY, anchor="rm")

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    return out


def embed_poster(out):
    """The still that stands in for the live `embed` slide.

    Not a screenshot: it is drawn here, from the same palette the live page reads, so it
    stays honest without a headless browser in the dependency list. If you have a
    screenshot tool, overwrite this file with a real capture — nothing else changes.
    """
    W, H = 2200, 670
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    f_h = font(40, bold=True)
    f_b = font(24)
    f_s = font(30, bold=True)

    d.rectangle([0, 0, W, 8], fill=RED)
    d.text((60, 56), "Palette contrast", font=f_h, fill=INK)
    d.text((60, 112), "The live version of this slide runs the real page. This still is what it "
                      "falls back to.", font=f_b, fill=GRAY)

    swatches = [("red", RED, T_RED), ("teal", TEAL, T_TEAL), ("gold", GOLD, "#F2E8CF"),
                ("ink", INK, "#DDE3EC"), ("gray", GRAY, "#E6E6E6")]
    x = 60
    w = (W - 120 - 4 * 24) / 5
    for name, solid, tint in swatches:
        d.rectangle([x, 190, x + w, 330], fill=solid)
        d.rectangle([x, 330, x + w, 470], fill=tint)
        d.text((x + 24, 232), name, font=f_s, fill=WHITE)
        d.text((x + 24, 372), "text on tint", font=f_b, fill=solid)
        x += w + 24
    d.text((60, 540), "Fills use the mid-tone. Text uses a darker variant, because the "
                      "mid-tones wash out on a projector.", font=f_b, fill=INK)
    d.text((60, 590), "Move the slider on the live slide to see where each one crosses 4.5:1.",
           font=f_b, fill=GRAY)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    return out


def main(argv=None):
    # build.sh passes the deck it is about to export. Without this the chart was always
    # drawn from the example deck, so `./export/build.sh decks/mine.json` produced a .pptx
    # of your talk carrying a figure about somebody else's - which is precisely the drift
    # this script exists to make impossible.
    argv = sys.argv if argv is None else argv
    deck_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_DECK
    with open(deck_path, encoding="utf-8") as f:
        deck = json.load(f)
    a = bar_chart(words_per_slide(deck), FIGURES / "words-per-slide.png")
    b = embed_poster(FIGURES / "embed-poster.png")
    for p in (a, b):
        print(f"wrote {p.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

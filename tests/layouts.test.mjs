// The deck is data, so a test can read it. This is the boring version of that idea: it
// checks that every slide asks for a layout BOTH renderers implement, which is the failure
// you actually hit — you add a layout to the browser renderer, present happily for a month,
// and then discover on the morning of the talk that the .pptx export throws.
//
// The valuable version is content-specific and belongs in your fork: read your results
// file, read your deck, and assert that every number claimed on a slide appears in both.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const webLayouts = new Set(
  [...readFileSync(join(ROOT, "src/deck/slideLayouts.tsx"), "utf8")
    .matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]),
);

// The Python exporter's RENDERERS table, read as text so the test needs no Python.
const pptxBlock = readFileSync(join(ROOT, "export/build_pptx.py"), "utf8")
  .split("RENDERERS = {")[1].split("}")[0];
const pptxLayouts = new Set([...pptxBlock.matchAll(/"([a-z-]+)":/g)].map((m) => m[1]));

const decks = readdirSync(join(ROOT, "decks"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(readFileSync(join(ROOT, "decks", f), "utf8"))]);

test("there is at least one deck to check", () => {
  assert.ok(decks.length > 0, "no deck files found under decks/");
});

test("both renderers implement the same layouts", () => {
  assert.deepEqual(
    [...webLayouts].sort(),
    [...pptxLayouts].sort(),
    "src/deck/slideLayouts.tsx and export/build_pptx.py disagree about which layouts exist",
  );
});

for (const [file, deck] of decks) {
  test(`${file}: every slide uses a layout both renderers know`, () => {
    for (const s of deck.slides) {
      assert.ok(webLayouts.has(s.layout),
        `slide ${s.id}: the browser renderer has no case for layout "${s.layout}"`);
      assert.ok(pptxLayouts.has(s.layout),
        `slide ${s.id}: the .pptx exporter has no renderer for layout "${s.layout}"`);
    }
  });

  test(`${file}: slide ids are present and unique`, () => {
    const seen = new Set();
    for (const s of deck.slides) {
      assert.ok(s.id, `a ${s.layout} slide has no id`);
      assert.ok(!seen.has(s.id), `duplicate slide id "${s.id}"`);
      seen.add(s.id);
    }
  });

  test(`${file}: meta carries the fields the .pptx needs`, () => {
    for (const k of ["docTitle", "docSubtitle", "author"]) {
      assert.ok(deck.meta?.[k], `deck.meta.${k} is missing`);
    }
  });

  // The demonstration, not the safety net. The example deck claims a line count for the
  // renderer; this recomputes it and fails if the slide has gone stale. Write the version
  // of this that reads YOUR results file, and delete this one.
  test(`${file}: the renderer line count claimed on a slide is still true`, () => {
    const claimed = JSON.stringify(deck).match(/(\d+) lines you are meant to read/);
    if (!claimed) return;                       // fork deleted the slide; nothing to check
    const actual = ["deckTypes.ts", "Deck.tsx", "slideLayouts.tsx"]
      .map((f) => readFileSync(join(ROOT, "src/deck", f), "utf8").split("\n").length - 1)
      .reduce((a, b) => a + b, 0);
    assert.equal(Number(claimed[1]), actual,
      `the deck says the renderer is ${claimed[1]} lines; it is ${actual}. ` +
      "Update the slide, or delete this test if you no longer make the claim.");
  });

  // `depthOf` is only read when the slide is also hidden, and a typo in it fails silently:
  // M falls back to the flat appendix, so you get the wrong backup material in front of a
  // room rather than an error. Both halves are worth asserting.
  test(`${file}: depth slides point at a real surface slide`, () => {
    const surface = new Set(deck.slides.filter((s) => !s.appendix).map((s) => s.id));
    for (const s of deck.slides) {
      if (!s.depthOf) continue;
      assert.ok(s.appendix,
        `slide ${s.id} has depthOf but not appendix:true, so it sits in the main sequence`);
      assert.ok(surface.has(s.depthOf),
        `slide ${s.id} has depthOf "${s.depthOf}", which is not a surface slide in this deck`);
    }
  });

  test(`${file}: two-column layouts get exactly two items`, () => {
    const pairs = { "two-card": "cards", "qa-backup": "cards", "two-panel": "panels" };
    for (const s of deck.slides) {
      const key = pairs[s.layout];
      if (!key) continue;
      assert.equal(s[key]?.length, 2,
        `slide ${s.id} is a ${s.layout}, so ${key} must hold exactly two items`);
    }
  });
}

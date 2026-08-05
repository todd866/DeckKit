"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { type Slide, type Deck as DeckData, ACCENT, TINT, PAPER, RULE } from "./deckTypes";
import { Stage, Multiline } from "./slideLayouts";

export type { Slide, DeckData as Deck };
export { Stage };

// cross-browser fullscreen — the vendor-prefixed methods aren't in the DOM lib types
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
  msRequestFullscreen?: () => void;
};
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
  msExitFullscreen?: () => void;
};
function fullscreenElement(): Element | null {
  const doc = document as FsDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}
function toggleFullscreen() {
  try {
    if (!fullscreenElement()) {
      const el = document.documentElement as FsElement;
      (el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.msRequestFullscreen)?.call(el);
    } else {
      const doc = document as FsDocument;
      (doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.msExitFullscreen)?.call(doc);
    }
  } catch { /* fullscreen can be blocked by permissions policy — ignore */ }
}

export default function Deck({ deck }: { deck: DeckData }) {
  const [i, setI] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [detail, setDetail] = useState<{ title: string; body: string } | null>(null);
  const [subDeck, setSubDeck] = useState<{ title: string; slides: { title: string; body: string; more?: string }[]; index: number } | null>(null);
  const returnRef = useRef(0);
  const assets = deck.meta.assets ?? {};

  // Navigation groups: the linear talk, and hidden material you can jump to when someone asks
  // the awkward question. Hidden slides are not in the page count, so the talk still reads as
  // ten slides even when twenty exist.
  //
  // A hidden slide may name a `depthOf` — the id of the surface slide it belongs to. Then M
  // keys off the CURRENT slide and enters only that slide's depth, and the arrows page within
  // it, so the awkward question is one key away rather than somewhere in a shared appendix.
  // Hidden slides with no `depthOf` form the flat appendix, which is both the fallback for a
  // slide with no depth of its own and the whole of the old behaviour.
  const mainIdx = useMemo(() => deck.slides.map((s, k) => (s.appendix ? -1 : k)).filter((k) => k >= 0), [deck.slides]);
  const apxIdx = useMemo(() => deck.slides.map((s, k) => (s.appendix && !s.depthOf ? k : -1)).filter((k) => k >= 0), [deck.slides]);
  const depthIdx = useCallback(
    (of: string) => deck.slides.map((s, k) => (s.appendix && s.depthOf === of ? k : -1)).filter((k) => k >= 0),
    [deck.slides],
  );
  const groupOf = useCallback((v: number) => {
    const s = deck.slides[v];
    if (!s?.appendix) return mainIdx;
    return s.depthOf ? depthIdx(s.depthOf) : apxIdx;
  }, [deck.slides, mainIdx, apxIdx, depthIdx]);

  const inApx = !!deck.slides[i]?.appendix;
  const group = groupOf(i);
  const pos = Math.max(0, group.indexOf(i));

  const go = useCallback((d: number) => {
    setDetail(null);
    setSubDeck(null);
    setI((v) => {
      const g = groupOf(v);
      const p = Math.max(0, g.indexOf(v));
      return g[Math.max(0, Math.min(g.length - 1, p + d))];
    });
  }, [groupOf]);

  const enterApx = useCallback(() => {
    setDetail(null);
    setI((v) => {
      if (deck.slides[v]?.appendix) return v;
      const own = depthIdx(String(deck.slides[v]?.id ?? ""));
      const target = own.length ? own : apxIdx;
      if (!target.length) return v;
      returnRef.current = v;
      return target[0];
    });
  }, [apxIdx, depthIdx, deck.slides]);

  const exitApx = useCallback(() => setI(returnRef.current), []);

  const openFromEvent = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const subEl = (e.target as HTMLElement).closest?.("[data-subdeck]");
    if (subEl) {
      e.stopPropagation();
      try {
        const slides = JSON.parse(subEl.getAttribute("data-subdeck") || "[]");
        setSubDeck({ title: subEl.getAttribute("data-subdeck-title") || "", slides, index: 0 });
      } catch { /* ignore malformed sub-deck */ }
      return;
    }
    const el = (e.target as HTMLElement).closest?.("[data-more]");
    if (el) {
      e.stopPropagation();
      setDetail({ title: el.getAttribute("data-more-title") ?? "", body: el.getAttribute("data-more") ?? "" });
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail) { if (e.key === "Escape" || e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") setDetail(null); return; }
      if (subDeck) {
        if (e.key === "Escape") setSubDeck(null);
        else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); setSubDeck((s) => (s && s.index < s.slides.length - 1 ? { ...s, index: s.index + 1 } : null)); }
        else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setSubDeck((s) => (s ? { ...s, index: Math.max(0, s.index - 1) } : s)); }
        return;
      }
      if (e.key === "Escape") { if (inApx) exitApx(); return; }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); enterApx(); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setI((v) => groupOf(v)[0]);
      else if (e.key === "End") setI((v) => { const g = groupOf(v); return g[g.length - 1]; });
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
    };
    const onFsChange = () => setIsFs(!!fullscreenElement());
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, [go, enterApx, exitApx, detail, subDeck, inApx, groupOf]);

  // warm the cache for the chrome slides' decoration so it never pops in mid-talk
  useEffect(() => {
    [assets.titlePhoto, assets.closePhoto, assets.logoLight, assets.logoDark]
      .filter((src): src is string => !!src)
      .forEach((src) => { const im = new window.Image(); im.src = src; });
  }, [assets.titlePhoto, assets.closePhoto, assets.logoLight, assets.logoDark]);

  const s = deck.slides[i];

  return (
    <div className="present-root">
      <style>{CSS}</style>
      <div className="viewport" onClickCapture={openFromEvent}>
        <Stage key={i} slide={s} index={i} assets={assets} />
      </div>
      <div className="nav">
        <button aria-label="Previous" onClick={() => go(-1)} disabled={pos === 0}>‹</button>
        <span className="counter">{inApx ? `${deck.slides[i]?.depthOf ? "Depth" : "Appendix"} ${pos + 1} / ${group.length}` : `${pos + 1} / ${mainIdx.length}`}</span>
        <button aria-label="Next" onClick={() => go(1)} disabled={pos === group.length - 1}>›</button>
        <button
          className="fsbtn"
          aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFs ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          onClick={toggleFullscreen}
        >
          {isFs ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M16 21v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
      </div>
      {/* narrow click-to-advance strips down each edge, so the slide body stays free for
          click-for-detail; suppressed on an embed slide, where the body is interactive */}
      {s.layout !== "embed" ? (
        <>
          <div className={"navside left" + (pos === 0 ? " disabled" : "")} onClick={() => go(-1)} aria-label="Previous slide"><span className="navchev">‹</span></div>
          <div className={"navside right" + (pos === group.length - 1 ? " disabled" : "")} onClick={() => go(1)} aria-label="Next slide"><span className="navchev">›</span></div>
        </>
      ) : null}
      {detail ? (
        <div className="detail-overlay" onClick={() => setDetail(null)}>
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <button className="detail-x" aria-label="Close" onClick={() => setDetail(null)}>×</button>
            <div className="detail-t">{detail.title}</div>
            <div className="detail-b"><Multiline text={detail.body} /></div>
          </div>
        </div>
      ) : null}
      {subDeck ? (
        <div className="subdeck-overlay" onClick={() => setSubDeck(null)}>
          <div className="subdeck-frame" onClick={(e) => e.stopPropagation()}>
            <button className="detail-x" aria-label="Close" onClick={() => setSubDeck(null)}>×</button>
            <div className="sub-eyebrow">{subDeck.title} · {subDeck.index + 1} / {subDeck.slides.length}</div>
            <h2 className="sub-title">{subDeck.slides[subDeck.index]?.title}</h2>
            <div className="sub-body"><Multiline text={subDeck.slides[subDeck.index]?.body ?? ""} /></div>
            {subDeck.slides[subDeck.index]?.more ? (
              <button className="sub-more" onClick={() => { const sl = subDeck.slides[subDeck.index]; setDetail({ title: sl.title, body: sl.more ?? "" }); }}>＋ in plain English</button>
            ) : null}
            <div className="sub-nav">
              <button aria-label="Previous" onClick={() => setSubDeck((s) => (s ? { ...s, index: Math.max(0, s.index - 1) } : s))} disabled={subDeck.index === 0}>‹</button>
              <span className="sub-dots">{subDeck.slides.map((_, k) => (<span key={k} className={"sub-dot" + (k === subDeck.index ? " on" : "")} />))}</span>
              <button aria-label="Next" onClick={() => setSubDeck((s) => (s && s.index < s.slides.length - 1 ? { ...s, index: s.index + 1 } : null))}>›</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Sizes are in container units (cqw/cqh) against the 16:9 stage, so the deck is identical
// on a laptop, a projector and a phone — there is one layout, scaled, not a responsive
// redesign that surprises you in the room.
export const CSS = `
.present-root { position: fixed; inset: 0; z-index: 40; background: #0c1220; display: flex; align-items: center; justify-content: center; font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; }
.viewport { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
@keyframes pslide { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes pfrag { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.stage { width: min(100vw, 177.78vh); aspect-ratio: 16 / 9; background: ${PAPER}; container-type: size; position: relative; overflow: hidden; box-shadow: 0 10px 60px rgba(0,0,0,.5); padding: 4.2cqw 4.2cqw 3.4cqw; box-sizing: border-box; display: flex; flex-direction: column; animation: pslide .34s cubic-bezier(.2,.7,.3,1) both; }
.stage > * { animation: pfrag .4s ease both; }
.stage > *:nth-child(2) { animation-delay: .09s; }
.stage > *:nth-child(3) { animation-delay: .17s; }
.stage > *:nth-child(4) { animation-delay: .25s; }
.eyebrow { position: absolute; top: 3cqh; left: 4.2cqw; font-size: 1.1cqw; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${ACCENT.red}; }
.eyebrow::before { content: ""; display: inline-block; width: .8cqw; height: .8cqw; background: ${ACCENT.red}; margin-right: .8cqw; vertical-align: middle; }
.headwrap { margin-top: 3.4cqh; padding-right: 8cqw; }
.heading { font-size: 3.4cqw; font-weight: 800; color: ${ACCENT.ink}; margin: 0; line-height: 1.05; letter-spacing: -.01em; }
.subhead { font-size: 1.65cqw; color: #414141; margin: 1.2cqh 0 0; max-width: 90%; line-height: 1.28; }
.bottomline { margin: 1.8cqh 5cqw 0; text-align: center; font-size: 1.95cqw; font-weight: 700; color: ${ACCENT.ink}; line-height: 1.22; }
.footer { margin-top: 1.3cqh; border-top: 1px solid ${RULE}; padding-top: 1cqh; font-size: .95cqw; color: #414141; padding-right: 3cqw; }
.page { position: absolute; bottom: 2.7cqh; right: 4.2cqw; font-size: .95cqw; color: #414141; }

/* title — accent panel over an optional photo */
/* The chrome slides fill the whole stage, padding included, so the accent panel runs
   edge to edge. Absolute beats cancelling the stage's padding with negative margins,
   which only works if the two are written in the same units and stay that way. */
.l-title, .l-close { position: absolute; inset: 0; background-size: cover; background-position: center; }
/* No photo set: fill the space beside the panel rather than leaving bare paper. */
.l-title.no-photo, .l-close.no-photo { background: ${ACCENT.ink}; }
.t-panel { position: absolute; inset: 0 auto 0 0; width: 57%; background: ${ACCENT.red}; color: #fff; padding: 5.5cqh 3.6cqw 3.6cqh; box-sizing: border-box; display: flex; flex-direction: column; }
.t-eyebrow { font-size: 1.05cqw; font-weight: 700; color: #fff; letter-spacing: .14em; text-transform: uppercase; opacity: .9; }
.t-title { font-size: 3.9cqw; font-weight: 800; color: #fff; margin: 1.4cqh 0 0; line-height: 1.04; white-space: pre-line; }
.t-sub { font-size: 1.3cqw; color: #fff; opacity: .95; margin: 1.6cqh 0 0; line-height: 1.3; }
.l-title .t-chips { display: flex; gap: .7cqw; flex-wrap: wrap; margin-top: 1.8cqh; }
.l-title .chip { font-size: .95cqw; font-weight: 700; padding: .6cqh 1cqw; border-radius: .4cqw; background: rgba(255,255,255,.18); color: #fff; }
.l-title .thesis { width: auto; background: rgba(255,255,255,.13); border: 0; border-left: .4cqw solid #fff; padding: 1.2cqh 1.2cqw; margin-top: 1.6cqh; }
.l-title .thesis-t { font-size: 1.05cqw; font-weight: 800; color: #fff; }
.l-title .thesis-b { font-size: .98cqw; color: #fff; opacity: .95; margin-top: .5cqh; line-height: 1.3; }
.t-foot { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 1cqw; padding-top: 1.8cqh; }
.t-author { font-size: .95cqw; color: #fff; opacity: .95; line-height: 1.45; }
.t-author p { margin: 0; }
.t-logo { height: 4.6cqh; width: auto; flex: none; }

/* hook */
.l-hook { display: grid; grid-template-columns: 1fr 1fr; gap: 2cqw; margin: 4cqh 0; flex: 1; }
.stat { border-radius: .5cqw; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3cqh 2cqw; text-align: center; }
.stat-v { font-size: 8cqw; font-weight: 800; line-height: 1; }
.stat-l { font-size: 1.5cqw; font-weight: 700; color: ${ACCENT.ink}; margin-top: 2cqh; }

/* timeline */
.l-timeline { margin: 2.6cqh 0 0; flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
.bar { align-self: flex-start; background: ${ACCENT.red}; color: #fff; display: inline-flex; align-items: baseline; gap: 1.2cqw; padding: 1.2cqh 1.6cqw; border-radius: .3cqw; }
.bar-v { font-size: 2.2cqw; font-weight: 800; }
.bar-l { font-size: 1.1cqw; }
.stops { position: relative; display: flex; justify-content: space-between; margin-top: 5cqh; }
.stops-line { position: absolute; top: .8cqw; left: 0; right: 0; height: 2px; background: ${RULE}; }
.stop { display: flex; flex-direction: column; align-items: center; width: 18%; position: relative; }
.dot { width: 1.6cqw; height: 1.6cqw; border-radius: 50%; }
.stop-l { font-size: 1.1cqw; color: ${ACCENT.ink}; text-align: center; margin-top: 1.2cqh; line-height: 1.15; }
.stop-l p { margin: 0; }

/* cards / panels */
.l-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 2cqw; margin: 2.6cqh 0 0; flex: 1; align-content: center; min-height: 0; }
.card { background: #fff; border: 1px solid ${RULE}; position: relative; padding: 2.4cqh 1.6cqw 1.6cqh; }
.card-strip { position: absolute; top: 0; left: 0; right: 0; height: .5cqh; }
.card-t { font-size: 1.75cqw; font-weight: 800; }
.card-b { font-size: 1.38cqw; color: #414141; margin-top: 1.4cqh; line-height: 1.38; }
.card-b p { margin: 0 0 .8cqh; }
.panel { padding: 2.2cqh 1.6cqw; }
.panel-b { font-size: 1.42cqw; color: ${ACCENT.ink}; margin-top: 1cqh; line-height: 1.38; }
.panel-b p { margin: 0 0 .9cqh; }

/* metric-grid */
.l-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.2cqw; margin: 2.6cqh 0 0; flex: 1; align-content: center; min-height: 0; }
.metric { background: #fff; border: 1px solid ${RULE}; padding: 1.8cqh 1.2cqw; display: flex; flex-direction: column; align-items: flex-start; }
.metric-n { width: 2.6cqw; height: 2.6cqw; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1.6cqw; }
.metric-name { font-size: 1.72cqw; font-weight: 800; margin-top: 1.4cqh; }
.metric-d { font-size: 1.24cqw; color: #414141; margin-top: 1cqh; line-height: 1.32; }

/* takeaways */
.l-takeaways { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.6cqw; margin: 2.6cqh 0 0; flex: 1; align-content: center; min-height: 0; }
.take { background: #fff; border: 1px solid ${RULE}; padding: 2cqh 1.4cqw; }
.take-n { font-size: 3.4cqw; font-weight: 800; }
.take-t { font-size: 1.5cqw; font-weight: 800; color: ${ACCENT.ink}; }
.take-b { font-size: 1.1cqw; color: #414141; margin-top: 1cqh; line-height: 1.3; }

/* figure and table */
.l-figure { margin: 2.2cqh 0; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.figure-img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
.l-table { margin: 2.6cqh 0; flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: .5cqh; }
.trow { display: grid; grid-template-columns: 1.6cqw 30% 1fr; align-items: center; gap: 1.2cqw; background: #fff; padding: 1.3cqh 1.4cqw; }
.trow:nth-child(even) { background: transparent; }
.tdot { width: 1.4cqw; height: 1.4cqw; }
.tlabel { font-size: 1.5cqw; font-weight: 800; color: ${ACCENT.ink}; }
.tdetail { font-size: 1.32cqw; color: #414141; }

/* equation */
.l-equation { display: grid; grid-template-columns: 46% 1fr; gap: 2cqw; margin: 2.6cqh 0 0; flex: 1; min-height: 0; align-items: start; align-content: center; }
.eqbox { background: ${ACCENT.ink}; padding: 2.4cqh 1.8cqw; }
.eqbox-t { color: ${TINT.teal}; font-weight: 800; font-size: 1.3cqw; }
.eqbox.has-detail { position: relative; z-index: 7; cursor: pointer; }
.eqbox.has-detail::after { content: "＋ what is this?"; position: absolute; bottom: 1.2cqh; right: 1.4cqw; font-size: .85cqw; font-weight: 700; color: ${TINT.red}; opacity: .9; }
.eq { color: #fff; margin-top: 1.6cqh; font-size: 1.4cqw; line-height: 1.5; }
.eqline sup { font-size: .7em; }
.eq-right { display: flex; flex-direction: column; gap: 1cqh; }
.thresh { display: grid; grid-template-columns: 5cqw 1fr; align-items: center; gap: 1cqw; padding: 1.2cqh 1.2cqw; }
.thresh-v { font-size: 2.4cqw; font-weight: 800; text-align: center; }
.thresh-l { font-size: 1.05cqw; font-weight: 700; color: ${ACCENT.ink}; line-height: 1.2; }
.readit { background: #fff; border: 1px solid ${RULE}; padding: 1.4cqh 1.2cqw; }
.readit-t { font-size: 1.25cqw; font-weight: 800; color: ${ACCENT.ink}; }
.readit-b { font-size: 1.05cqw; color: #414141; margin-top: .8cqh; line-height: 1.3; }

/* embed — a live page inside the slide, poster behind it as the offline fallback */
.l-embed { flex: 1; margin-top: 2.6cqh; min-height: 0; position: relative; }
.embed-poster { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #fff; border: 1px solid ${RULE}; border-radius: .6cqw; z-index: 0; }
.embed-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 1px solid ${RULE}; background: #fff; border-radius: .6cqw; z-index: 1; }

/* close — accent panel over an optional photo */
.c-panel { position: absolute; inset: 0 auto 0 0; width: 53%; background: ${ACCENT.red}; color: #fff; padding: 6cqh 3.6cqw 3.6cqh; box-sizing: border-box; display: flex; flex-direction: column; }
.close-h { font-size: 4.6cqw; font-weight: 800; color: #fff; margin: 0; }
.close-sub { font-size: 1.6cqw; color: #fff; opacity: .95; margin: 1.2cqh 0 0; }
.l-close .thanks { width: auto; background: rgba(255,255,255,.14); padding: 1.8cqh 1.4cqw; margin-top: 2.6cqh; }
.l-close .thanks-t { font-size: 1.15cqw; font-weight: 800; color: #fff; }
.l-close .thanks-b { font-size: 1.05cqw; color: #fff; opacity: .95; margin-top: .8cqh; line-height: 1.55; }
.l-close .thanks-b p { margin: 0; }
.c-logo { margin-top: auto; height: 4.6cqh; width: auto; align-self: flex-start; }

/* nav */
.nav { position: fixed; bottom: 1.2rem; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 1rem; background: rgba(0,0,0,.55); padding: .4rem .9rem; border-radius: 2rem; color: #fff; z-index: 10; }
.nav button { background: none; border: 0; color: #fff; font-size: 1.6rem; line-height: 1; cursor: pointer; padding: 0 .3rem; }
.nav button:disabled { opacity: .3; cursor: default; }
.nav .fsbtn { display: inline-flex; align-items: center; justify-content: center; padding: 0 .1rem; margin-left: .3rem; border-left: 1px solid rgba(255,255,255,.25); padding-left: .6rem; opacity: .85; }
.nav .fsbtn:hover { opacity: 1; }
.counter { font-size: .85rem; font-variant-numeric: tabular-nums; }
.navside { position: fixed; top: 0; bottom: 4rem; width: 5%; min-width: 2.4rem; z-index: 6; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .18s; }
.navside.left { left: 0; }
.navside.right { right: 0; }
.navside:hover { background: rgba(10,15,25,.34); }
.navside.disabled { pointer-events: none; }
.navchev { color: #fff; opacity: .22; font-size: 3rem; font-weight: 300; line-height: 1; user-select: none; transition: opacity .18s; }
.navside:hover .navchev { opacity: .95; }
.navside.disabled .navchev { opacity: 0; }

/* optional logo on content slides — set meta.assets.logoDark to switch it on */
.content-logo { position: absolute; top: 2.6cqh; right: 4.2cqw; height: 2.9cqh; width: auto; opacity: .9; }

/* click-for-detail */
.has-detail { cursor: pointer; }
.trow.has-detail { position: relative; z-index: 7; padding-right: 5cqw; transition: background .15s; }
.trow.has-detail:hover { background: ${TINT.red}; }
.trow.has-detail::after { content: "＋ detail"; position: absolute; right: 1.2cqw; top: 50%; transform: translateY(-50%); font-size: .82cqw; font-weight: 700; color: ${ACCENT.red}; letter-spacing: .03em; opacity: .85; }
.metric.has-detail { position: relative; z-index: 7; transition: border-color .15s; }
.metric.has-detail:hover { border-color: ${ACCENT.red}; }
.metric.has-detail::after { content: "＋"; position: absolute; top: .7cqh; right: .9cqw; font-size: 1.3cqw; font-weight: 800; color: ${ACCENT.red}; opacity: .85; }
.stop.has-detail, .stop.has-subdeck { cursor: pointer; z-index: 7; }
.stop.has-detail .dot, .stop.has-subdeck .dot { outline: .3cqw solid rgba(194,74,44,.28); outline-offset: .12cqw; }
.stop.has-detail .stop-l, .stop.has-subdeck .stop-l { color: ${ACCENT.red}; text-decoration: underline dotted; text-underline-offset: .25cqw; }
.stop.has-subdeck .stop-l::after { content: " ›"; font-weight: 800; }
.panel.has-detail { position: relative; z-index: 7; cursor: pointer; transition: box-shadow .15s; }
.panel.has-detail:hover { box-shadow: inset 0 0 0 .18cqw ${ACCENT.red}; }
.panel.has-detail::after { content: "＋ detail"; position: absolute; bottom: 1cqh; right: 1.2cqw; font-size: .82cqw; font-weight: 700; color: ${ACCENT.red}; opacity: .82; }
.thresh.has-detail { position: relative; z-index: 7; cursor: pointer; transition: box-shadow .15s; }
.thresh.has-detail:hover { box-shadow: inset 0 0 0 .16cqw ${ACCENT.red}; }
.thresh.has-detail::after { content: "＋"; position: absolute; top: .5cqh; right: .7cqw; font-size: 1cqw; font-weight: 800; color: ${ACCENT.red}; opacity: .8; }
.detail-overlay { position: fixed; inset: 0; z-index: 40; background: rgba(10,15,25,.55); display: flex; align-items: center; justify-content: center; padding: 6vh 4vw; animation: pfrag .2s ease both; }
.detail-card { position: relative; background: ${PAPER}; border-left: .5rem solid ${ACCENT.red}; max-width: 46rem; width: 100%; max-height: 82vh; overflow: auto; padding: 2rem 2.2rem; box-shadow: 0 20px 80px rgba(0,0,0,.5); }
.detail-x { position: absolute; top: .5rem; right: .8rem; background: none; border: 0; font-size: 1.9rem; line-height: 1; color: #414141; cursor: pointer; }
.detail-t { font-size: clamp(1.3rem, 2.7vh, 2.4rem); font-weight: 800; color: ${ACCENT.ink}; padding-right: 2rem; }
.detail-b { font-size: clamp(1.05rem, 2.1vh, 1.9rem); color: #414141; margin-top: .8rem; line-height: 1.5; }
.detail-b p { margin: 0 0 .7rem; }
.panel.has-subdeck { position: relative; z-index: 7; cursor: pointer; transition: box-shadow .15s; }
.panel.has-subdeck:hover { box-shadow: inset 0 0 0 .18cqw ${ACCENT.red}; }
.panel.has-subdeck::after { content: "breakdown →"; position: absolute; bottom: 1cqh; right: 1.2cqw; font-size: .82cqw; font-weight: 700; color: ${ACCENT.red}; opacity: .85; }

/* sub-deck: a small slide-show floating over the dimmed main deck */
.subdeck-overlay { position: fixed; inset: 0; z-index: 30; background: rgba(10,15,25,.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; animation: pfrag .2s ease both; }
.subdeck-frame { position: relative; width: min(60vw, 106vh); aspect-ratio: 16 / 9; background: ${PAPER}; box-shadow: 0 24px 90px rgba(0,0,0,.6); border-top: .4rem solid ${ACCENT.red}; padding: 6% 6.5%; box-sizing: border-box; display: flex; flex-direction: column; container-type: inline-size; }
.sub-eyebrow { font-size: 2.1cqw; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${ACCENT.red}; }
.sub-title { font-size: 5.2cqw; font-weight: 800; color: ${ACCENT.ink}; margin: 2cqw 0 0; line-height: 1.04; }
.sub-body { font-size: 3.1cqw; color: #414141; margin-top: 2.4cqw; line-height: 1.42; }
.sub-body p { margin: 0 0 1cqw; }
.sub-more { align-self: flex-start; margin-top: 1.4cqw; background: none; border: 0; color: ${ACCENT.red}; font-weight: 700; font-size: 2.3cqw; cursor: pointer; padding: 0; }
.sub-more:hover { text-decoration: underline; }
.sub-nav { display: flex; align-items: center; justify-content: center; gap: 2.4cqw; margin-top: auto; }
.sub-nav button { background: none; border: 0; font-size: 5cqw; line-height: 1; color: ${ACCENT.ink}; cursor: pointer; padding: 0; }
.sub-nav button:disabled { opacity: .22; cursor: default; }
.sub-dots { display: flex; gap: 1.4cqw; }
.sub-dot { width: 1.3cqw; height: 1.3cqw; border-radius: 50%; background: ${RULE}; }
.sub-dot.on { background: ${ACCENT.red}; }
`;

"use client";

// Every layout a deck file can ask for. Split out of the shell, which owns only paging,
// keyboard, fullscreen and the overlays.
//
// tests/layouts.test.mjs reads THIS file to discover the supported layouts by grepping for
// `case "<name>":`, and checks every slide in every deck under decks/ against that list.
// Adding a layout means adding a `case` here and a renderer in export/build_pptx.py; the
// test fails if a deck uses one that either side does not have.

import { useState, type ReactNode } from "react";
import { type Slide, type DeckAssets, ACCENT, TINT, accent, tint, accentText } from "./deckTypes";

// split "a\n\nb\nc" into paragraphs (\n\n) with soft breaks (\n)
export function Multiline({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split("\n\n").map((para, i) => (
        <p key={i} className={className}>
          {para.split("\n").map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function Eyebrow({ s }: { s: Slide }) {
  if (!s.eyebrow) return null;
  return <div className="eyebrow">{String(s.eyebrow)}</div>;
}
function Head({ s }: { s: Slide }) {
  return (
    <div className="headwrap">
      <h1 className="heading">{String(s.heading ?? "")}</h1>
      {s.subhead ? <p className="subhead">{String(s.subhead)}</p> : null}
    </div>
  );
}
function Bottom({ s }: { s: Slide }) {
  if (!s.bottomLine) return null;
  return (
    <div
      className="bottomline"
      style={{ color: s.bottomLineAccent ? accent(String(s.bottomLineAccent)) : ACCENT.ink }}
    >
      {String(s.bottomLine)}
    </div>
  );
}
function Foot({ s }: { s: Slide }) {
  return <div className="footer">{s.footer ? String(s.footer) : ""}</div>;
}

// An `embed` slide runs a live page inside the slide. Keep the static poster behind it so a
// slow or blocked load — venue wifi, a laptop that never joined the network — degrades to a
// screenshot rather than a blank box. Nothing on stage should ever be empty.
function EmbedBody({ s }: { s: Slide }) {
  // The poster shows until the frame has actually loaded, and the frame is never
  // unmounted: a page that is merely slow still arrives, where a timeout that removed
  // the iframe left the poster up for the rest of the talk with no way back. With no
  // poster there is nothing to wait behind, so the frame is shown from the start.
  const [frameReady, setFrameReady] = useState(!s.poster);
  return (
    <>
      <Head s={s} />
      <div className="l-embed">
        {s.poster ? (
          <img className="embed-poster" src={String(s.poster)} alt={String(s.heading ?? "")} />
        ) : null}
        {s.src ? (
          <iframe
            className={"embed-frame" + (frameReady ? "" : " embed-waiting")}
            src={String(s.src)}
            title={String(s.heading ?? "Embedded page")}
            onLoad={() => setFrameReady(true)}
            onError={() => setFrameReady(false)}
          />
        ) : null}
      </div>
      <Bottom s={s} />
    </>
  );
}

// ---- per-layout renderers ---------------------------------------------------
export function renderBody(s: Slide, assets: DeckAssets = {}) {
  switch (s.layout) {
    case "title": {
      const chips = (s.chips as { text: string; accent: string }[]) ?? [];
      return (
        <div
          className={"l-title" + (assets.titlePhoto ? "" : " no-photo")}
          style={assets.titlePhoto ? { backgroundImage: `url(${assets.titlePhoto})` } : undefined}
        >
          <div className="t-panel">
            {/* One wrapper so that with no photo the lead can sit in its own column.
                `.t-lead { display: contents }` keeps the photo layout stacking exactly
                as it did before this wrapper existed. */}
            <div className="t-lead">
              <div className="t-eyebrow">{String(s.eyebrow ?? "")}</div>
              <h1 className="t-title">{String(s.title)}</h1>
              <p className="t-sub">{String(s.subtitle ?? "")}</p>
              {chips.length ? (
                <div className="t-chips">
                  {chips.map((c, i) => (
                    <span key={i} className="chip">{c.text}</span>
                  ))}
                </div>
              ) : null}
            </div>
            {s.thesis ? (
              <div className="thesis">
                <div className="thesis-t">{String(s.thesisTitle ?? "Thesis")}</div>
                <div className="thesis-b">{String(s.thesis)}</div>
              </div>
            ) : null}
            <div className="t-foot">
              <div className="t-author"><Multiline text={String(s.author ?? "")} /></div>
              {assets.logoLight ? (
                <img className="t-logo" src={assets.logoLight} alt="" aria-hidden />
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    case "hook": {
      const left = s.statLeft as { value: string; label: string };
      const right = s.statRight as { value: string; label: string };
      return (
        <>
          <Head s={s} />
          <div className="l-hook">
            <div className="stat" style={{ background: TINT.red }}>
              <div className="stat-v" style={{ color: accentText("red") }}>{left.value}</div>
              <div className="stat-l">{left.label}</div>
            </div>
            <div className="stat" style={{ background: TINT.teal }}>
              <div
                className="stat-v"
                style={{ color: accentText("teal"), fontSize: right.value.length > 9 ? "5cqw" : "8cqw" }}
              >
                {right.value}
              </div>
              <div className="stat-l">{right.label}</div>
            </div>
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "timeline": {
      const stops = (s.stops as { label: string; accent: string; more?: string; deck?: { title: string; body: string }[] }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-timeline">
            {s.barValue ? (
              <div className="bar">
                <span className="bar-v">{String(s.barValue)}</span>
                <span className="bar-l">{String(s.barLabel ?? "")}</span>
              </div>
            ) : null}
            <div className="stops">
              <div className="stops-line" />
              {stops.map((st, i) => (
                <div
                  className={"stop" + (st.deck ? " has-subdeck" : st.more ? " has-detail" : "")}
                  key={i}
                  data-subdeck={st.deck ? JSON.stringify(st.deck) : undefined}
                  data-subdeck-title={st.deck ? st.label.replace("\n", " ") : undefined}
                  data-more={st.more}
                  data-more-title={st.label.replace("\n", " ")}
                >
                  <span className="dot" style={{ background: accent(st.accent) }} />
                  <span className="stop-l">
                    <Multiline text={st.label} />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "two-card":
    case "qa-backup": {
      const cards = (s.cards as { title: string; body: string; accent: string }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-cards">
            {cards.map((c, i) => (
              <div className="card" key={i}>
                <span className="card-strip" style={{ background: accent(c.accent) }} />
                <div className="card-t" style={{ color: accentText(c.accent) }}>{c.title}</div>
                <div className="card-b"><Multiline text={c.body} /></div>
              </div>
            ))}
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "two-panel": {
      const panels = (s.panels as { title: string; body: string; accent: string; more?: string; deck?: { title: string; body: string }[] }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-cards">
            {panels.map((p, i) => (
              <div
                className={"panel" + (p.more ? " has-detail" : "") + (p.deck ? " has-subdeck" : "")}
                key={i}
                style={{ background: tint(p.accent) }}
                data-more={p.more}
                data-more-title={p.title}
                data-subdeck={p.deck ? JSON.stringify(p.deck) : undefined}
                data-subdeck-title={p.deck ? p.title : undefined}
              >
                <div className="card-t" style={{ color: accentText(p.accent) }}>{p.title}</div>
                <div className="panel-b"><Multiline text={p.body} /></div>
              </div>
            ))}
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "metric-grid": {
      const items = (s.metrics as { n: string; name: string; detail: string; accent: string; more?: string }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-metrics">
            {items.map((m, i) => (
              <div
                className={"metric" + (m.more ? " has-detail" : "")}
                key={i}
                data-more={m.more}
                data-more-title={m.name}
              >
                <span className="metric-n" style={{ background: accent(m.accent) }}>{m.n}</span>
                <div className="metric-name" style={{ color: accentText(m.accent) }}>{m.name}</div>
                <div className="metric-d">{m.detail}</div>
              </div>
            ))}
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "takeaways": {
      const items = (s.items as { n: string; title: string; body: string; accent: string }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-takeaways">
            {items.map((it, i) => (
              <div className="take" key={i}>
                <div className="take-n" style={{ color: accent(it.accent) }}>{it.n}</div>
                <div className="take-t">{it.title}</div>
                <div className="take-b">{it.body}</div>
              </div>
            ))}
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "table": {
      const rows = (s.rows as { label: string; detail: string; accent: string; more?: string }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-table">
            {rows.map((r, i) => (
              <div
                className={"trow" + (r.more ? " has-detail" : "")}
                key={i}
                data-more={r.more}
                data-more-title={r.label}
              >
                <span className="tdot" style={{ background: accent(r.accent) }} />
                <span className="tlabel">{r.label}</span>
                <span className="tdetail">{r.detail}</span>
              </div>
            ))}
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "equation": {
      const eq = String(s.equation ?? "");
      const th = (s.thresholds as { value: string; label: string; accent: string; more?: string }[]) ?? [];
      return (
        <>
          <Head s={s} />
          <div className="l-equation">
            <div
              className={"eqbox" + (s.equationMore ? " has-detail" : "")}
              data-more={s.equationMore ? String(s.equationMore) : undefined}
              data-more-title={String(s.equationTitle ?? "The equation")}
            >
              <div className="eqbox-t">{String(s.equationTitle ?? "The equation")}</div>
              <div className="eq">
                {eq.split("\n").map((line, i) => (
                  <div key={i} className="eqline">{renderEqLine(line)}</div>
                ))}
              </div>
            </div>
            <div className="eq-right">
              {th.map((t, i) => (
                <div
                  className={"thresh" + (t.more ? " has-detail" : "")}
                  key={i}
                  style={{ background: tint(t.accent) }}
                  data-more={t.more}
                  data-more-title={"Operating point " + t.value}
                >
                  <span className="thresh-v" style={{ color: accentText(t.accent) }}>{t.value}</span>
                  <span className="thresh-l">{t.label}</span>
                </div>
              ))}
              {s.readIt ? (
                <div className="readit">
                  <div className="readit-t">{String(s.readItTitle ?? "How to read it")}</div>
                  <div className="readit-b">{String(s.readIt)}</div>
                </div>
              ) : null}
            </div>
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "figure": {
      // `image` is a path under public/, so the browser and the .pptx exporter read the
      // same file. A figure your analysis writes there cannot drift from the analysis;
      // a figure you exported by hand and pasted in can, and will.
      return (
        <>
          <Head s={s} />
          <div className="l-figure">
            <img className="figure-img" src={String(s.image)} alt={String(s.heading ?? "")} />
          </div>
          <Bottom s={s} />
        </>
      );
    }
    case "embed":
      return <EmbedBody s={s} />;
    case "close": {
      return (
        <div
          className={"l-close" + (assets.closePhoto ? "" : " no-photo")}
          style={assets.closePhoto ? { backgroundImage: `url(${assets.closePhoto})` } : undefined}
        >
          <div className="c-panel">
            <div className="t-lead">
              <h1 className="close-h">{String(s.heading)}</h1>
              {s.sub ? <p className="close-sub">{String(s.sub)}</p> : null}
            </div>
            {s.acknowledgements ? (
              <div className="thanks">
                <div className="thanks-t">{String(s.acknowledgementsTitle ?? "With thanks")}</div>
                <div className="thanks-b"><Multiline text={String(s.acknowledgements)} /></div>
              </div>
            ) : null}
            {assets.logoLight ? (
              <img className="t-logo c-logo" src={assets.logoLight} alt="" aria-hidden />
            ) : null}
          </div>
        </div>
      );
    }
    default:
      return <div className="heading">Unknown layout: {s.layout}</div>;
  }
}

// render an equation line, superscripting ^{...}
function renderEqLine(line: string) {
  const out: ReactNode[] = [];
  let idx = 0;
  let key = 0;
  while (idx < line.length) {
    const sup = line.indexOf("^{", idx);
    if (sup === -1) {
      out.push(<span key={key++}>{line.slice(idx)}</span>);
      break;
    }
    if (sup > idx) out.push(<span key={key++}>{line.slice(idx, sup)}</span>);
    const end = line.indexOf("}", sup + 2);
    if (end === -1) {
      out.push(<span key={key++}>{line.slice(sup)}</span>);
      break;
    }
    out.push(<sup key={key++}>{line.slice(sup + 2, end)}</sup>);
    idx = end + 1;
  }
  return out;
}

// One slide's stage — shared by the live show and any static preview harness.
export function Stage({ slide, index = 0, assets = {} }: { slide: Slide; index?: number; assets?: DeckAssets }) {
  const chrome = slide.layout === "title" || slide.layout === "close";
  return (
    <div className="stage" data-layout={slide.layout}>
      {!chrome ? <Eyebrow s={slide} /> : null}
      {renderBody(slide, assets)}
      {!chrome ? <Foot s={slide} /> : null}
      {!chrome ? <div className="page">{String(slide.page ?? index + 1)}</div> : null}
      {!chrome && assets.logoDark ? (
        <img className="content-logo" src={assets.logoDark} alt="" aria-hidden />
      ) : null}
    </div>
  );
}

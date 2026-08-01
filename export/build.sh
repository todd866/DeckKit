#!/usr/bin/env bash
# Everything the deck needs to leave the browser, in order:
#
#   figures  ->  .pptx  ->  .pdf
#
#   ./export/build.sh                    # decks/example.json
#   ./export/build.sh decks/mine.json    # any other deck
#
# The figures come first on purpose. The .pptx embeds them, so a stale chart would be
# baked into the file you email rather than merely shown on a screen you can refresh.
set -euo pipefail

cd "$(dirname "$0")/.."
DECK="${1:-decks/example.json}"
STEM="$(basename "${DECK%.*}")"

# The repo's own venv if it exists, otherwise whatever python is on PATH.
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY="$(command -v python3 || command -v python)"; fi
if [ -z "${PY:-}" ]; then echo "no python found; see export/requirements.txt" >&2; exit 1; fi

"$PY" export/make_figure.py
"$PY" export/build_pptx.py "$DECK" "build/$STEM.pptx"

# PDF is a LibreOffice conversion. It is genuinely optional — the .pptx is the artefact —
# so a machine without soffice should say so and stop, not fail the build.
SOFFICE="$(command -v soffice || true)"
[ -z "$SOFFICE" ] && [ -x /Applications/LibreOffice.app/Contents/MacOS/soffice ] \
  && SOFFICE=/Applications/LibreOffice.app/Contents/MacOS/soffice
if [ -z "$SOFFICE" ]; then
  echo
  echo "build/$STEM.pptx is ready. No LibreOffice on this machine, so no PDF."
  echo "Install it (brew install --cask libreoffice) or export a PDF from PowerPoint."
  exit 0
fi

"$SOFFICE" --headless --convert-to pdf --outdir build "build/$STEM.pptx" >/dev/null
echo
echo "build/$STEM.pptx and build/$STEM.pdf are ready."

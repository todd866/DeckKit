// The one place the deck file is named.
//
// `page.tsx` renders this deck and `layout.tsx` takes the browser-tab title from it. Before
// this file existed the import lived in both, so pointing the dev server at a different deck
// meant editing two files, and forgetting the second left the previous deck's title sitting in
// the tab — which looks exactly like the swap not having worked.
//
// Swap the path below and nothing else changes. The same JSON is what export/build_pptx.py
// reads to write the .pptx, so the browser and the file cannot disagree about the talk.
import deck from "../../decks/example.json";
import type { Deck as DeckData } from "./deckTypes";

export default deck as DeckData;

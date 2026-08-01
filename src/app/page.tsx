import Deck from "../deck/Deck";
import type { Deck as DeckData } from "../deck/deckTypes";

// The deck is a JSON file. Swap this import for your own and nothing else changes —
// the same file is what export/build_pptx.py reads to write the .pptx.
import deck from "../../decks/example.json";

export default function Page() {
  return <Deck deck={deck as DeckData} />;
}

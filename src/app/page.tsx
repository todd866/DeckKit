import Deck from "../deck/Deck";
import deck from "../deck/activeDeck";

export default function Page() {
  return <Deck deck={deck} />;
}

import type { Metadata } from "next";
import "./globals.css";

import deck from "../../decks/example.json";

export const metadata: Metadata = {
  title: deck.meta.docTitle,
  description: deck.meta.docSubtitle,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

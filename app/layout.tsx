import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Arena — Compare AI models side by side",
  description:
    "Run one coding prompt across multiple AI models via OpenRouter and compare the results, and their live game previews, side by side.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

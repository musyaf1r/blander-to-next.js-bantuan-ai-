import "./globals.css";
import type { Metadata } from "next";
import { Fredoka } from "next/font/google";

const display = Fredoka({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Thalassa | A voyage into the blue",
  description: "A cartoon 3D landing page about the sea and marine life.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
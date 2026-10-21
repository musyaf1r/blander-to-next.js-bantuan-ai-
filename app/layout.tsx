import "./globals.css";
import type { Metadata } from "next";
import { Cormorant_Garamond, Nunito, Pacifico } from "next/font/google";

const script = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-script" });
const serif = Cormorant_Garamond({
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});
const sans = Nunito({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Thalassa | A field guide to ocean animals",
  description: "Dive from the surface to the deepest trench and meet every animal at the depth where it really lives.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${script.variable} ${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
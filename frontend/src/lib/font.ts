import { Fraunces, Inter } from "next/font/google";

export const fontDisplay = Fraunces({
  subsets: ["latin", "vietnamese"],
  variable: "--font-display",
});

export const fontSans = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
});
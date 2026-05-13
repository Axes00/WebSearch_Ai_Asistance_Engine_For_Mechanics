import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "greek"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Mechanica",
    template: "%s | Mechanica",
  },
  description:
    "Mechanica technical digital library and legislation AI assistant for engineers.",
  icons: {
    icon: "/mechanica.ico",
    shortcut: "/mechanica.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="el" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-paper text-ink antialiased dark:bg-ink dark:text-paper">
        {children}
      </body>
    </html>
  );
}

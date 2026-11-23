import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Fasa Certificados",
  description: "Painel interno para gestao segura de certificados digitais PFX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className={`${inter.variable} min-h-full`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

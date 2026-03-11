import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sales Insight Automator | Rabbitt AI",
  description:
    "Upload your CSV or XLSX sales data and receive an AI-generated executive summary email — powered by Google Gemini and Rabbitt AI.",
  keywords: ["sales insights", "AI analytics", "Rabbitt AI", "Gemini", "executive report"],
  authors: [{ name: "Rabbitt AI Engineering" }],
  openGraph: {
    title: "Sales Insight Automator — Rabbitt AI",
    description: "AI-powered sales data analysis and executive reporting.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trip Planner",
  description: "Generate, preview, and save personalized travel itineraries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

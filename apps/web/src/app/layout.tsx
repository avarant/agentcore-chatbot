import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent77 - Add AI to any website",
  description: "Drop-in AI agent for any website",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}

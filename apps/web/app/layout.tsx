import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EHR Monorepo",
  description: "Electronic health record platform",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">EHR workspace</h1>
            <p className="text-sm text-slate-600">
              Next.js front-end served from <code>apps/web</code>.
            </p>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="text-xs text-slate-500">
            Built with Next.js 14, Tailwind CSS, and NestJS.
          </footer>
        </div>
      </body>
    </html>
  );
}

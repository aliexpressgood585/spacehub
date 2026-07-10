import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SongAI - יצירת שירים בבינה מלאכותית",
  description: "צור שירים מקוריים עם מילות שיר ומוזיקה בעזרת AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0a0a12] text-white antialiased">
        <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            🎵 SongAI
          </a>
          <div className="flex gap-6 text-sm text-white/60">
            <a href="/create" className="hover:text-white transition-colors">יצירה</a>
            <a href="/library" className="hover:text-white transition-colors">הספרייה שלי</a>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/10 px-6 py-4 text-center text-xs text-white/30">
          © 2026 SongAI · יצירת שירים בבינה מלאכותית
        </footer>
      </body>
    </html>
  );
}

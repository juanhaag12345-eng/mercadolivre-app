import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import "./globals.css";
import { SidebarNav, BottomNav } from "@/components/nav/NavLinks";

export const metadata: Metadata = {
  title: "Painel de Vendas",
  description: "Controle de vendas, produtos e lucro do Mercado Livre",
};

export const viewport: Viewport = {
  themeColor: "#ffe600",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="flex min-h-screen w-full">
          <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border md:bg-surface md:px-4 md:py-6 md:sticky md:top-0 md:h-screen">
            <Link href="/" className="flex items-center gap-2 px-2 mb-8">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-neutral-900">
                <LayoutDashboard size={18} strokeWidth={2.5} />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold">Painel de Vendas</p>
                <p className="text-xs text-muted">Mercado Livre</p>
              </div>
            </Link>
            <SidebarNav />
            <div className="mt-auto px-2 pt-4 text-xs text-muted">
              Feito sob medida — só para vocês dois.
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            <header className="md:hidden flex items-center gap-2 border-b border-border bg-surface px-4 py-3 sticky top-0 z-30">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-neutral-900">
                <LayoutDashboard size={16} strokeWidth={2.5} />
              </span>
              <p className="text-sm font-bold">Painel de Vendas</p>
            </header>
            <main className="flex-1 min-w-0 pb-20 md:pb-0">{children}</main>
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}

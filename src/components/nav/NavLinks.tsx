"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, FileText, Inbox, LayoutDashboard, Megaphone, Menu, Package, ShoppingBag, ShoppingCart, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vendas", label: "Vendas", icon: ShoppingBag },
  { href: "/pendentes", label: "Pendentes", icon: Inbox },
  { href: "/liberacoes", label: "Liberações", icon: Wallet },
  { href: "/compras", label: "Compras/Estoque", icon: ShoppingCart },
  { href: "/cadastro-produtos", label: "Produtos", icon: Package },
  { href: "/notas-fiscais", label: "Notas Fiscais", icon: FileText },
  { href: "/produtos", label: "Anúncios", icon: Megaphone },
  { href: "/custo-fornecimento", label: "Custo Fornecimento", icon: Boxes },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-white"
                : "text-neutral-600 hover:bg-surface-muted"
            )}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Cabeçalho do celular + menu lateral (drawer). No mobile as abas não cabem
// lado a lado sem espremer os nomes, então aqui elas ficam escondidas atrás
// de um botão de menu (☰) e abrem numa gaveta deslizando da direita — mesmos
// links do menu do desktop (SidebarNav), só que num overlay.
export function MobileNav() {
  const pathname = usePathname();
  // Cada link da gaveta já fecha no próprio onClick ao navegar, então não
  // precisamos sincronizar isso com a rota atual.
  const [open, setOpen] = useState(false);

  // Trava o scroll do fundo enquanto a gaveta está aberta.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <header className="md:hidden flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-neutral-900">
            <LayoutDashboard size={16} strokeWidth={2.5} />
          </span>
          <p className="text-sm font-bold">Painel de Vendas</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="p-2 -mr-2 text-neutral-700 hover:text-foreground"
        >
          <Menu size={22} />
        </button>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 animate-in fade-in"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-0 h-full w-72 max-w-[80vw] bg-surface border-l border-border p-4 flex flex-col shadow-xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between mb-6 px-1">
              <p className="text-sm font-bold">Menu</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="p-2 -mr-2 text-neutral-500 hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-foreground text-white"
                        : "text-neutral-600 hover:bg-surface-muted"
                    )}
                  >
                    <Icon size={18} strokeWidth={2} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

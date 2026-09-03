"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { findSimilarProducts } from "@/actions/products";
import { Badge } from "@/components/ui/Card";

interface SimilarProduct {
  id: string;
  internalCode: number;
  name: string;
  isKit: boolean;
  kitQuantity: number;
  active: boolean;
}

/**
 * Enquanto a pessoa digita o nome de um produto (novo ou em edição), avisa
 * se já existe algum produto cadastrado com nome parecido — para evitar
 * cadastrar sem perceber uma variação do mesmo item (como aconteceu com
 * "Nutella 650g" duplicado).
 */
export function SimilarProductsHint({ name, excludeId }: { name: string; excludeId?: string }) {
  const [results, setResults] = useState<SimilarProduct[]>([]);

  useEffect(() => {
    const trimmed = name.trim();
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (trimmed.length < 3) {
        if (!cancelled) setResults([]);
        return;
      }
      const found = await findSimilarProducts(trimmed, excludeId);
      if (!cancelled) setResults(found);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [name, excludeId]);

  if (results.length === 0) return null;

  const plural = results.length > 1;

  return (
    <div className="mt-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning mb-1.5">
        <TriangleAlert size={13} />
        Já {plural ? "existem produtos parecidos cadastrados" : "existe um produto parecido cadastrado"}
      </p>
      <ul className="space-y-1">
        {results.map((p) => (
          <li key={p.id}>
            <Link
              href={`/produtos/${p.id}`}
              target="_blank"
              className="flex flex-wrap items-center gap-1.5 text-xs text-foreground hover:underline"
            >
              <span className="font-mono text-muted">#{p.internalCode}</span>
              <span className="truncate">{p.name}</span>
              {p.isKit && <Badge tone="accent">Kit x{p.kitQuantity}</Badge>}
              {!p.active && <Badge tone="neutral">Inativo</Badge>}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted">Se for o mesmo item, edite-o em vez de cadastrar de novo.</p>
    </div>
  );
}

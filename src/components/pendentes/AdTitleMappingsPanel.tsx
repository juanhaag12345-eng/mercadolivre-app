"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, Link2, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IntegerInput, Select } from "@/components/ui/Field";
import { deleteAdTitleMapping, updateAdTitleMapping, type AdTitleMappingRow } from "@/actions/mercadolivre";
import type { StockItemRow } from "@/actions/stock";
import { formatDate } from "@/lib/format";

/**
 * Lista os vínculos "anúncio → produto" memorizados a partir de
 * confirmações manuais em Pendentes — é isso que faz a próxima venda do
 * MESMO anúncio entrar sozinha no dashboard (ver AutoConfirmedSalesList).
 * Dá pra corrigir um vínculo errado (troca o produto, sem mexer em vendas
 * já lançadas com o vínculo antigo) ou remover, fazendo esse anúncio voltar
 * a pedir confirmação manual da próxima vez.
 */
export function AdTitleMappingsPanel({
  mappings,
  stockItems,
}: {
  mappings: AdTitleMappingRow[];
  stockItems: StockItemRow[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (mappings.length === 0) return null;

  return (
    <Card className="mb-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
            <Link2 size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold">Vínculos automáticos (anúncio → produto)</p>
            <p className="text-xs text-muted">
              {mappings.length} anúncio{mappings.length === 1 ? "" : "s"} memorizado{mappings.length === 1 ? "" : "s"} — a
              próxima venda de cada um entra sozinha.
            </p>
          </div>
        </div>
        {expanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
      </button>
      {expanded && (
        <div className="mt-3 divide-y divide-border border-t border-border">
          {mappings.map((mapping) => (
            <MappingRow key={mapping.id} mapping={mapping} stockItems={stockItems} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MappingRow({ mapping, stockItems }: { mapping: AdTitleMappingRow; stockItems: StockItemRow[] }) {
  const [editing, setEditing] = useState(false);
  const [stockItemId, setStockItemId] = useState(mapping.stockItemId);
  const [unitsPerSale, setUnitsPerSale] = useState(mapping.unitsPerSale);
  const [isSaving, startSaveTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{mapping.adTitle}</p>
        <p className="text-xs text-muted mt-0.5">
          → <span className="font-medium text-foreground">#{mapping.stockItemInternalCode} {mapping.stockItemName}</span>
          {mapping.unitsPerSale > 1 && (
            <span> · {mapping.unitsPerSale} unidades por venda (kit)</span>
          )}
          {" · atualizado "}
          {formatDate(mapping.updatedAt)}
        </p>
      </div>
      {editing ? (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-56">
            <Select value={stockItemId} onChange={(e) => setStockItemId(e.target.value)}>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.internalCode} {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-20" title="Unidades do produto por venda (kit)">
            <IntegerInput min={1} value={unitsPerSale} onValueChange={setUnitsPerSale} />
          </div>
          <button
            type="button"
            title="Salvar"
            disabled={isSaving}
            onClick={() =>
              startSaveTransition(async () => {
                await updateAdTitleMapping(mapping.id, stockItemId, unitsPerSale);
                setEditing(false);
              })
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button
            type="button"
            title="Cancelar"
            onClick={() => {
              setStockItemId(mapping.stockItemId);
              setUnitsPerSale(mapping.unitsPerSale);
              setEditing(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Trocar o produto vinculado"
            onClick={() => setEditing(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            title="Remover vínculo"
            disabled={isDeleting}
            onClick={() => {
              if (
                window.confirm(
                  `Remover o vínculo de "${mapping.adTitle}"? A próxima venda desse anúncio volta a pedir confirmação manual em Pendentes.`
                )
              ) {
                startDeleteTransition(() => deleteAdTitleMapping(mapping.id));
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}

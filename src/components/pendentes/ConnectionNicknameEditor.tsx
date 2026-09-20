"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { updateMlAccountNickname } from "@/actions/mercadolivre";

/**
 * Nome da conta conectada (ex.: "Radar Ofertas") com edição inline — o
 * apelido definido aqui é o que aparece em todo filtro por conta (dashboard,
 * vendas, pendentes, liberações, anúncios), via accountLabel(). Deixar em
 * branco volta a mostrar "Vendedor <id>".
 */
export function ConnectionNicknameEditor({
  connectionId,
  nickname,
  mlUserId,
}: {
  connectionId: string;
  nickname: string | null;
  mlUserId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname ?? "");
  const [isSaving, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Vendedor ${mlUserId}`}
          className="h-8 w-48 rounded-lg border border-border bg-surface px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              startTransition(async () => {
                await updateMlAccountNickname(connectionId, value);
                setEditing(false);
              });
            } else if (e.key === "Escape") {
              setValue(nickname ?? "");
              setEditing(false);
            }
          }}
        />
        <button
          type="button"
          title="Salvar"
          disabled={isSaving}
          onClick={() =>
            startTransition(async () => {
              await updateMlAccountNickname(connectionId, value);
              setEditing(false);
            })
          }
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          title="Cancelar"
          onClick={() => {
            setValue(nickname ?? "");
            setEditing(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-muted transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Renomear conta"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left"
    >
      <p className="text-sm font-semibold">{nickname ?? "Conta do Mercado Livre conectada"}</p>
      <Pencil size={12} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

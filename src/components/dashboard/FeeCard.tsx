import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function FeeCard({
  label,
  icon: Icon,
  totalValue,
  percentValue,
}: {
  label: string;
  icon: LucideIcon;
  totalValue: string;
  percentValue: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-neutral-700">
          <Icon size={16} />
        </span>
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-bold leading-tight">{totalValue}</p>
          <p className="text-xs text-muted mt-1">Total no período</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold leading-tight">{percentValue}</p>
          <p className="text-xs text-muted mt-1">% taxa média</p>
        </div>
      </div>
    </Card>
  );
}

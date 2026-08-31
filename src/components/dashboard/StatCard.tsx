import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";

export function StatCard({
  label,
  value,
  icon: Icon,
  changePercent,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  changePercent?: number | null;
  tone?: "neutral" | "success" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-surface-muted text-neutral-700",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          <Icon size={16} />
        </span>
        {changePercent !== undefined && changePercent !== null && Number.isFinite(changePercent) && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${
              changePercent >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {changePercent >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {formatPercent(Math.abs(changePercent), 0)}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </Card>
  );
}

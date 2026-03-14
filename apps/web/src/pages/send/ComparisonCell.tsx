import { Check, X } from "lucide-react";

export function ComparisonCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-slate-300 text-sm font-medium">{value}</span>;
  }
  return value ? (
    <Check className="w-5 h-5 text-emerald-400 mx-auto" />
  ) : (
    <X className="w-5 h-5 text-slate-600 mx-auto" />
  );
}

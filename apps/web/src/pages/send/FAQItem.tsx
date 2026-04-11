import { useState, useId } from "react";
import { ChevronDown } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

export function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const answerId = useId();

  return (
    <div
      className="border-b transition-colors"
      style={{ borderColor: LANDING_COLORS.border }}
    >
      <button
        className="w-full flex items-center justify-between py-5 text-left cursor-pointer group"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={answerId}
      >
        <span
          className="font-medium text-base pr-4 transition-colors group-hover:text-violet-300"
          style={{ color: LANDING_COLORS.textPrimary }}
        >
          {q}
        </span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          style={{ color: LANDING_COLORS.textMuted }}
        />
      </button>
      <div
        id={answerId}
        role="region"
        aria-hidden={!open}
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-96 pb-5" : "max-h-0"}`}
      >
        <p
          className="text-sm leading-relaxed"
          style={{ color: LANDING_COLORS.textSecondary }}
        >
          {a}
        </p>
      </div>
    </div>
  );
}

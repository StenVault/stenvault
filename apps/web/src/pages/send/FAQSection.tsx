import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { FAQ_ITEMS } from "./constants";
import { FAQItem } from "./FAQItem";

export function FAQSection() {
  return (
    <section className="py-24 md:py-32 px-6">
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-16">
          <span
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: LANDING_COLORS.accent }}
          >
            Questions
          </span>
          <h2
            className="text-3xl sm:text-4xl font-normal tracking-tight mt-3"
            style={{ color: LANDING_COLORS.textPrimary }}
          >
            Frequently asked
          </h2>
        </div>

        <div>
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

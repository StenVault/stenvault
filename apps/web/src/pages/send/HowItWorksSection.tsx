import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { HOW_IT_WORKS } from "./constants";

export function HowItWorksSection() {
  return (
    <section className="py-24 md:py-32 px-6 relative">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <span
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: LANDING_COLORS.accent }}
          >
            How it works
          </span>
          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight mt-3 leading-[1.1]"
            style={{ color: LANDING_COLORS.textPrimary }}
          >
            Three steps to{" "}
            <span className="bg-gradient-to-r from-violet-400 to-violet-400 bg-clip-text text-transparent">
              total privacy
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((item) => (
            <SpotlightCard
              key={item.step}
              variant="glass"
              tilt={false}
              spotlightColor={item.accent}
            >
              <div className="p-6 md:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs font-bold tracking-widest"
                    style={{ color: item.accent }}
                  >
                    {item.step}
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ backgroundColor: `${item.accent}20` }}
                  />
                </div>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${item.accent}15` }}
                >
                  <item.icon className="w-6 h-6" style={{ color: item.accent }} />
                </div>
                <h3
                  className="text-lg font-bold"
                  style={{ color: LANDING_COLORS.textPrimary }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: LANDING_COLORS.textSecondary }}
                >
                  {item.description}
                </p>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

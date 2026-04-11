/**
 * StenVault Landing Page — Immersive Interactive Design
 *
 * Flow: Hero → Value → [inline CTA] → Features → [inline CTA] →
 * How It Works → Social Proof → Pricing Preview → CTA
 */
import { LANDING_COLORS, INLINE_CTA } from './constants';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { LazySection } from './components/LazySection';
import { InlineCTA } from './components/InlineCTA';

import { HeroSection } from './sections/HeroSection';
import { ProblemSection } from './sections/ProblemSection';
import { FeatureSection } from './sections/FeatureSection';
import { VisualSecuritySection } from './sections/VisualSecuritySection';
import { TrustSection } from './sections/TrustSection';
import { PricingPreviewSection } from './sections/PricingPreviewSection';
import { CTASection } from './sections/CTASection';

export function LandingPageV4() {
    useSmoothScroll();

    return (
        <div
            className="antialiased selection:bg-indigo-500/30"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            <HeroSection />

            <LazySection minHeight="700px">
                <ProblemSection />
            </LazySection>

            <InlineCTA {...INLINE_CTA.afterValue} />

            <LazySection minHeight="700px" id="features">
                <FeatureSection />
            </LazySection>

            <InlineCTA {...INLINE_CTA.afterFeatures} />

            <LazySection minHeight="600px" id="how-it-works">
                <VisualSecuritySection />
            </LazySection>

            <LazySection minHeight="700px" id="security">
                <TrustSection />
            </LazySection>

            <LazySection minHeight="600px" id="pricing">
                <PricingPreviewSection />
            </LazySection>

            <LazySection minHeight="500px">
                <CTASection />
            </LazySection>
        </div>
    );
}

export default LandingPageV4;

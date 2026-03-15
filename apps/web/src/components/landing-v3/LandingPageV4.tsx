/**
 * StenVault Landing Page — Immersive Interactive Design
 *
 * 9 sections: Header, Hero, Problem, Solution, Features,
 * Visual Security, Trust, CTA, Footer.
 */
import { LANDING_COLORS } from './constants';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { LazySection } from './components/LazySection';

import { Header } from './sections/Header';
import { HeroSection } from './sections/HeroSection';
import { ProblemSection } from './sections/ProblemSection';
import { SolutionSection } from './sections/SolutionSection';
import { FeatureSection } from './sections/FeatureSection';
import { VisualSecuritySection } from './sections/VisualSecuritySection';
import { TrustSection } from './sections/TrustSection';
import { CTASection } from './sections/CTASection';
import { Footer } from './sections/Footer';

export function LandingPageV4() {
    useSmoothScroll();

    return (
        <div
            className="min-h-screen antialiased selection:bg-indigo-500/30"
            style={{ backgroundColor: LANDING_COLORS.bg }}
        >
            <Header />

            <main>
                <HeroSection />

                <LazySection minHeight="600px">
                    <ProblemSection />
                </LazySection>

                <LazySection minHeight="700px">
                    <SolutionSection />
                </LazySection>

                <LazySection minHeight="700px" id="features-section">
                    <FeatureSection />
                </LazySection>

                <LazySection minHeight="600px" id="how-it-works-section">
                    <VisualSecuritySection />
                </LazySection>

                <LazySection minHeight="700px" id="security-section">
                    <TrustSection />
                </LazySection>

                <LazySection minHeight="500px">
                    <CTASection />
                </LazySection>
            </main>

            <Footer />
        </div>
    );
}

export default LandingPageV4;

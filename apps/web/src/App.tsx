import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import ErrorBoundary from "./components/ErrorBoundary";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { P2PErrorBoundary } from "./components/p2p/P2PErrorBoundary";
import { AuthenticatedShell } from "./components/AuthenticatedShell";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { InterfaceProvider } from "./contexts/InterfaceContext";
import { OrganizationProvider } from "./contexts/OrganizationContext";
import { EmailVerificationProvider } from "./components/email-verification";
import { trpc } from "@/lib/trpc";
import { scheduleProactiveRefresh, cancelProactiveRefresh } from "@/lib/auth";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { RootRedirect, AuthGuard, GuestGuard } from "./routes";

// ══════════════════════════════════════════════════════════════════════════════
// Lazy-loaded pages for better initial load performance (Code Splitting)
// Heavy pages are loaded on-demand instead of upfront
// ══════════════════════════════════════════════════════════════════════════════

import Login from "./pages/LoginV2";
import Register from "./pages/RegisterV2";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const SharedDownload = lazy(() => import("./pages/SharedDownload"));
const Pricing = lazy(() => import("./pages/Pricing"));
const SendPage = lazy(() => import("./pages/SendPage"));
const ReceivePage = lazy(() => import("./pages/ReceivePage"));
const LocalSendPage = lazy(() => import("./pages/LocalSendPage"));
const OpsDeck = lazy(() => import("./pages/OpsDeck"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const P2PReceivePage = lazy(() => import("./components/p2p/P2PReceivePage").then(m => ({ default: m.P2PReceivePage })));
const OfflineReceivePage = lazy(() => import("./components/p2p/OfflineReceivePage").then(m => ({ default: m.OfflineReceivePage })));
const ForgotPassword = lazy(() => import("./pages/ForgotPasswordV2"));
const ResetPassword = lazy(() => import("./pages/ResetPasswordV2"));
const VerifyMagicLink = lazy(() => import("./pages/VerifyMagicLink"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ShamirRecovery = lazy(() => import("./pages/ShamirRecovery"));
const MasterKeySetup = lazy(() => import("./pages/MasterKeySetup"));
const RecoveryCodeReset = lazy(() => import("./pages/RecoveryCodeReset"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function GuestRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <GuestGuard redirectTo="/home">
      <Component />
    </GuestGuard>
  );
}

function P2PRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <P2PErrorBoundary>
      <Component />
    </P2PErrorBoundary>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={RootRedirect} />

        <Route path="/auth/login">
          <GuestRoute component={Login} />
        </Route>
        <Route path="/auth/register">
          <GuestRoute component={Register} />
        </Route>
        <Route path="/auth/forgot-password">
          <GuestRoute component={ForgotPassword} />
        </Route>
        <Route path="/auth/reset-password">
          <GuestRoute component={ResetPassword} />
        </Route>
        <Route path="/auth/verify" component={VerifyMagicLink} />
        <Route path="/auth/verify-email" component={VerifyEmail} />
        <Route path="/auth/recovery-code-reset" component={RecoveryCodeReset} />

        <Route path="/landing">
          <RouteErrorBoundary routeName="Landing">
            <LandingPage />
          </RouteErrorBoundary>
        </Route>
        <Route path="/s/:shareCode">
          <RouteErrorBoundary routeName="Shared Download">
            <SharedDownload />
          </RouteErrorBoundary>
        </Route>
        <Route path="/pricing">
          <RouteErrorBoundary routeName="Pricing">
            <Pricing />
          </RouteErrorBoundary>
        </Route>
        <Route path="/recover">
          <RouteErrorBoundary routeName="Recovery">
            <ShamirRecovery />
          </RouteErrorBoundary>
        </Route>
        <Route path="/send">
          <RouteErrorBoundary routeName="Send">
            <SendPage />
          </RouteErrorBoundary>
        </Route>
        <Route path="/send/local">
          <RouteErrorBoundary routeName="Local Send">
            <LocalSendPage />
          </RouteErrorBoundary>
        </Route>
        <Route path="/send/:sessionId">
          <RouteErrorBoundary routeName="Receive">
            <ReceivePage />
          </RouteErrorBoundary>
        </Route>
        <Route path="/ops-deck">
          <RouteErrorBoundary routeName="Ops Deck">
            <OpsDeck />
          </RouteErrorBoundary>
        </Route>
        <Route path="/terms">
          <RouteErrorBoundary routeName="Terms of Service">
            <TermsOfService />
          </RouteErrorBoundary>
        </Route>
        <Route path="/privacy">
          <RouteErrorBoundary routeName="Privacy Policy">
            <PrivacyPolicy />
          </RouteErrorBoundary>
        </Route>

        {/* AuthGuard but no layout/MasterKeyGuard -- standalone onboarding page */}
        <Route path="/master-key-setup">
          <RouteErrorBoundary routeName="Master Key Setup">
            <AuthGuard>
              <MasterKeySetup />
            </AuthGuard>
          </RouteErrorBoundary>
        </Route>

        <Route path="/p2p/offline/:sessionId">
          <P2PRoute component={OfflineReceivePage} />
        </Route>
        <Route path="/p2p/:sessionId">
          <P2PRoute component={P2PReceivePage} />
        </Route>

        <Route path="/404" component={NotFound} />

        {/* Catch-all: persistent layout shell for all protected routes */}
        <Route>
          <AuthenticatedShell />
        </Route>
      </Switch>
    </Suspense>
  );
}

// Auth query must be inside Suspense to prevent race condition where
// EMAIL_NOT_VERIFIED errors arrive before user data is loaded.
function AppWithUser() {
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (user) {
      scheduleProactiveRefresh();
    }
    return () => cancelProactiveRefresh();
  }, [!!user]);

  return (
    <OrganizationProvider>
      <EmailVerificationProvider userEmail={user?.email}>
        <Toaster />
        <Router />
      </EmailVerificationProvider>
    </OrganizationProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="nocturne">
        <InterfaceProvider>
          <TooltipProvider>
            <Suspense fallback={<PageLoader />}>
              <AppWithUser />
            </Suspense>
            <CookieConsentBanner />
          </TooltipProvider>
        </InterfaceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

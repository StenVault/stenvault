/**
 * AuthenticatedShell - Persistent layout shell for all protected routes.
 *
 * Composes guards + DashboardLayout once so that navigation between
 * protected routes only swaps the inner content area — sidebar, mobile
 * shell, and all guard state stay mounted.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { AuthGuard, MasterKeyGuard } from '@/routes';
import DashboardLayout from './DashboardLayout';
import { ContentSpinner } from './ContentSpinner';
import NotFound from '@/pages/NotFound';
import { prefetchCoreRoutes } from '@/lib/routePrefetch';

// Lazy-loaded protected pages
const Home = lazy(() => import('@/pages/Home'));
const Drive = lazy(() => import('@/pages/Drive'));
const Settings = lazy(() => import('@/pages/Settings'));
const SendHistory = lazy(() => import('@/pages/SendHistory'));

export function AuthenticatedShell() {
  useEffect(() => { prefetchCoreRoutes(); }, []);

  return (
    <RouteErrorBoundary routeName="App">
      <AuthGuard>
        <MasterKeyGuard>
          <DashboardLayout>
            <Suspense fallback={<ContentSpinner />}>
              <Routes>
                <Route path="/home" element={<Home />} />
                {/* /dashboard predates Home and stays as a redirect for any
                    surviving bookmark; the page wrapper itself is gone. */}
                <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                <Route path="/drive" element={<Drive />} />
                {/* Legacy routes — Favorites/Shared/Trash now live as Drive filters. */}
                <Route path="/favorites" element={<Navigate to="/drive?filter=favorites" replace />} />
                <Route path="/trash" element={<Navigate to="/drive?filter=trash" replace />} />
                <Route path="/shares" element={<Navigate to="/drive?filter=shared" replace />} />
                <Route path="/settings/*" element={<Settings />} />
                <Route path="/sends" element={<SendHistory />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </DashboardLayout>
        </MasterKeyGuard>
      </AuthGuard>
    </RouteErrorBoundary>
  );
}

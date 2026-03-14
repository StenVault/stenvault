/**
 * AuthenticatedShell - Persistent layout shell for all protected routes.
 *
 * Composes guards + DashboardLayout once so that navigation between
 * protected routes only swaps the inner content area — sidebar, mobile
 * shell, and all guard state stay mounted.
 */
import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { P2PErrorBoundary } from './p2p/P2PErrorBoundary';
import { AdminGuard, AuthGuard, MasterKeyGuard } from '@/routes';
import DashboardLayout from './DashboardLayout';
import { ContentSpinner } from './ContentSpinner';
import NotFound from '@/pages/NotFound';

// Lazy-loaded protected pages
const Home = lazy(() => import('@/pages/Home'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Drive = lazy(() => import('@/pages/Drive'));
const Shares = lazy(() => import('@/pages/Shares'));
const Chat = lazy(() => import('@/pages/Chat'));
const Settings = lazy(() => import('@/pages/Settings'));
const Trash = lazy(() => import('@/pages/Trash'));
const Favorites = lazy(() => import('@/pages/Favorites'));
const AdminPanel = lazy(() => import('@/pages/AdminPanel'));
const QuantumMesh = lazy(() => import('@/pages/QuantumMesh'));
const TransferHistory = lazy(() => import('@/pages/TransferHistory'));
const SendHistory = lazy(() => import('@/pages/SendHistory'));

export function AuthenticatedShell() {
  return (
    <RouteErrorBoundary routeName="App">
      <AuthGuard>
        <MasterKeyGuard>
          <DashboardLayout>
            <Suspense fallback={<ContentSpinner />}>
              <Switch>
                <Route path="/home" component={Home} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/drive" component={Drive} />
                <Route path="/trash" component={Trash} />
                <Route path="/favorites" component={Favorites} />
                <Route path="/shares" component={Shares} />
                <Route path="/settings" component={Settings} />
                <Route path="/chat" component={Chat} />
                <Route path="/quantum-mesh">
                  <P2PErrorBoundary>
                    <QuantumMesh />
                  </P2PErrorBoundary>
                </Route>
                <Route path="/transfers" component={TransferHistory} />
                <Route path="/sends" component={SendHistory} />
                <Route path="/admin">
                  <AdminGuard>
                    <AdminPanel />
                  </AdminGuard>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </DashboardLayout>
        </MasterKeyGuard>
      </AuthGuard>
    </RouteErrorBoundary>
  );
}

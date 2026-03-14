/**
 * Admin Panel - Re-export from modular structure
 * 
 * The AdminPanel has been refactored into a modular architecture.
 * See client/src/pages/admin/ for the full implementation.
 * 
 * Structure:
 * - admin/index.tsx - Main component
 * - admin/tabs/DashboardTab.tsx - Stats, health, activity
 * - admin/tabs/UsersTab.tsx - User management
 * - admin/tabs/MetricsTab.tsx - System metrics
 * - admin/tabs/CacheTab.tsx - Cache management
 * - admin/dialogs/index.tsx - All confirmation dialogs
 * - admin/hooks/useAdminQueries.ts - Queries and mutations
 * - admin/utils.ts - Helper functions
 */
export { default } from "./admin";

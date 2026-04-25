/**
 * HOME PAGE - Unified Hub (merged Home + Dashboard)
 *
 * Combines the welcome/activity experience with analytics/KPIs
 * into a single page. Eliminates the redundant Dashboard page.
 *
 * Layout:
 * [OnboardingChecklist]         (new users only)
 * [WelcomeHeader]               (personalized greeting)
 *
 * GRID 2/3 + 1/3:
 *   LEFT:  QuickAccessFiles, KPI Grid, StorageAnalytics
 *   RIGHT: StorageMiniWidget, ActivityTimeline, SecurityOverview
 */

import { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/useMobile";
import { useCurrentOrgId } from "@/contexts/OrganizationContext";

import { AuroraCard, AuroraCardContent } from "@stenvault/shared/ui/aurora-card";
import { FadeIn, StaggerContainer, StaggerItem } from "@stenvault/shared/ui/animated";
import {
  WelcomeHeader,
  ActivityTimeline,
  filesToActivityItems,
  QuickAccessFiles,
  StorageMiniWidget,
  RecoverySetupReminder,
  CommandPaletteHint,
} from "@/components/home";
import {
  KPICardCompact,
  KPIGrid,
  SecurityOverview,
  StorageAnalytics,
} from "@/components/dashboard";
import type { KPITone } from "@/components/dashboard/KPICardCompact";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { MobileHome } from "@/components/mobile-v2/pages/MobileHome";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@stenvault/shared";
import {
  FileText,
  FolderOpen,
  HardDrive,
  Share2,
} from "lucide-react";

export default function Home() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const setLocation = useNavigate();
  const orgId = useCurrentOrgId();

  // Data fetching (tRPC deduplicates via React Query)
  const { data: storageStats, isLoading: statsLoading } =
    trpc.files.getStorageStats.useQuery({ organizationId: orgId });

  const recentFilesQuery = trpc.files.list.useQuery({
    orderBy: "date",
    order: "desc",
    limit: 8,
    organizationId: orgId,
  });

  const { data: allFolders } = trpc.folders.list.useQuery({ organizationId: orgId });
  const { data: sharesData } = trpc.shares.listMyShares.useQuery();

  if (!user) return null;

  // Mobile: dedicated component
  if (isMobile) {
    return <MobileHome />;
  }

  // Derived data
  const recentFiles = recentFilesQuery.data?.files ?? [];
  const activityItems = filesToActivityItems(recentFiles.slice(0, 5));

  const totalFiles = storageStats?.fileCount || 0;
  const foldersCount = allFolders?.length || 0;
  const sharesCount = sharesData?.length || 0;
  const usedPercentage =
    storageStats && storageStats.storageQuota > 0
      ? Math.round(
          (storageStats.storageUsed / storageStats.storageQuota) * 100
        )
      : 0;

  const handleFileClick = (_file: { id: number }) => {
    setLocation("/drive");
  };

  // Storage is the only KPI that earns colour — the others stay gold so
  // a single glance carries information instead of decoration.
  const storageTone: KPITone =
    usedPercentage >= 95 ? "error"
      : usedPercentage >= 80 ? "warning"
        : "success";

  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      {/* Onboarding Checklist for new users */}
      <OnboardingChecklist />

      {/* Trusted Circle reminder (hidden once Shamir is configured or snoozed) */}
      <RecoverySetupReminder />

      {/* Welcome Header */}
      <WelcomeHeader userName={user.name} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Access Files */}
          <FadeIn delay={0.1}>
            <AuroraCard variant="glass">
              <AuroraCardContent className="p-5">
                <QuickAccessFiles
                  files={recentFiles}
                  onFileClick={handleFileClick}
                  onViewAll={() => setLocation("/drive")}
                  isLoading={recentFilesQuery.isLoading}
                />
              </AuroraCardContent>
            </AuroraCard>
          </FadeIn>

          {/* KPI Cards */}
          <StaggerContainer staggerDelay={0.06} delayChildren={0.1}>
            <KPIGrid>
              <StaggerItem>
                <KPICardCompact
                  title="Your files"
                  value={totalFiles}
                  subtitle="files"
                  icon={FileText}
                  isLoading={statsLoading}
                />
              </StaggerItem>
              <StaggerItem>
                <KPICardCompact
                  title="Folders"
                  value={foldersCount}
                  subtitle="folders created"
                  icon={FolderOpen}
                />
              </StaggerItem>
              <StaggerItem>
                <KPICardCompact
                  title="Storage"
                  value={`${usedPercentage}%`}
                  subtitle={formatBytes(storageStats?.storageUsed || 0)}
                  icon={HardDrive}
                  tone={storageTone}
                  trend={
                    usedPercentage >= 80
                      ? { value: usedPercentage, label: "used" }
                      : undefined
                  }
                  isLoading={statsLoading}
                />
              </StaggerItem>
              <StaggerItem>
                <KPICardCompact
                  title="Active shares"
                  value={sharesCount}
                  subtitle="active links"
                  icon={Share2}
                />
              </StaggerItem>
            </KPIGrid>
          </StaggerContainer>

          {/* Storage Analytics */}
          <FadeIn delay={0.2}>
            <StorageAnalytics />
          </FadeIn>
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          {/* Storage Widget */}
          <FadeIn delay={0.15}>
            <StorageMiniWidget
              storageUsed={storageStats?.storageUsed ?? 0}
              storageQuota={storageStats?.storageQuota ?? 0}
              isLoading={statsLoading}
            />
          </FadeIn>

          {/* Activity Timeline */}
          <FadeIn delay={0.2}>
            <AuroraCard variant="default">
              <AuroraCardContent className="p-5">
                <ActivityTimeline
                  activities={activityItems}
                  isLoading={recentFilesQuery.isLoading}
                  maxItems={5}
                />
              </AuroraCardContent>
            </AuroraCard>
          </FadeIn>

          {/* Security Overview */}
          <FadeIn delay={0.25}>
            <SecurityOverview
              mfaEnabled={user.mfaEnabled ?? false}
              emailVerified={!!user.emailVerified}
              encryptionEnabled={true}
              lastLoginDate={user.lastSignedIn ?? user.updatedAt ?? null}
            />
          </FadeIn>
        </div>
      </div>

      {/* First-visit hint for the command palette — dismisses on click or
          after five seconds, persists via localStorage. */}
      <CommandPaletteHint />
    </div>
  );
}

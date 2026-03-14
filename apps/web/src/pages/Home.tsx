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
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";

import { AuroraCard, AuroraCardContent } from "@/components/ui/aurora-card";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/animated";
import {
  WelcomeHeader,
  ActivityTimeline,
  filesToActivityItems,
  QuickAccessFiles,
  StorageMiniWidget,
} from "@/components/home";
import {
  KPICardCompact,
  KPIGrid,
  SecurityOverview,
  StorageAnalytics,
} from "@/components/dashboard";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { MobileHome } from "@/components/mobile-v2/pages/MobileHome";
import { trpc } from "@/lib/trpc";
import { formatBytes } from "@cloudvault/shared";
import {
  FileText,
  FolderOpen,
  HardDrive,
  Share2,
} from "lucide-react";

export default function Home() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Data fetching (tRPC deduplicates via React Query)
  const { data: storageStats, isLoading: statsLoading } =
    trpc.files.getStorageStats.useQuery();

  const recentFilesQuery = trpc.files.list.useQuery({
    orderBy: "date",
    order: "desc",
    limit: 8,
  });

  const { data: allFolders } = trpc.folders.list.useQuery({});
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

  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      {/* Onboarding Checklist for new users */}
      <OnboardingChecklist />

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
                  title="Total Files"
                  value={totalFiles}
                  subtitle="files"
                  icon={FileText}
                  iconColor="text-blue-400"
                  iconBgColor="bg-blue-500/10"
                  isLoading={statsLoading}
                />
              </StaggerItem>
              <StaggerItem>
                <KPICardCompact
                  title="Folders"
                  value={foldersCount}
                  subtitle="folders created"
                  icon={FolderOpen}
                  iconColor="text-amber-400"
                  iconBgColor="bg-amber-500/10"
                />
              </StaggerItem>
              <StaggerItem>
                <KPICardCompact
                  title="Storage"
                  value={`${usedPercentage}%`}
                  subtitle={formatBytes(storageStats?.storageUsed || 0)}
                  icon={HardDrive}
                  iconColor={
                    usedPercentage > 80
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }
                  iconBgColor={
                    usedPercentage > 80
                      ? "bg-rose-500/10"
                      : "bg-emerald-500/10"
                  }
                  trend={
                    usedPercentage > 80
                      ? { value: usedPercentage, label: "used" }
                      : undefined
                  }
                  isLoading={statsLoading}
                />
              </StaggerItem>
              <StaggerItem>
                <KPICardCompact
                  title="Active Shares"
                  value={sharesCount}
                  subtitle="active links"
                  icon={Share2}
                  iconColor="text-violet-400"
                  iconBgColor="bg-violet-500/10"
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
    </div>
  );
}

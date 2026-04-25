/**
 * DriveHeader - Header component for Drive page
 *
 * Extracted from Drive.tsx for separation of concerns.
 * Pure presentational component — receives all data via props.
 *
 * Filter-aware (Phase 3): for non-default filters (Favorites/Shared/Trash),
 * the breadcrumb collapses to "Drive · {filter}" and folder-only actions
 * (new folder, upload, drag breadcrumb) hide — those concepts don't apply
 * to flat or saved-view lists.
 */

import { motion } from 'framer-motion';
import {
  FolderPlus,
  Upload,
  MoreHorizontal,
  HardDrive,
} from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import { AuroraCard, AuroraCardContent } from '@stenvault/shared/ui/aurora-card';
import { Input } from '@stenvault/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@stenvault/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FadeIn } from '@stenvault/shared/ui/animated';
// Import from siblings to avoid circular dependency through barrel
import { StorageMiniIndicator } from './StorageMiniIndicator';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { BreadcrumbNav } from './BreadcrumbNav';
import type { DriveFilter } from '@/hooks/useDrive';

const FILTER_LABEL: Record<Exclude<DriveFilter, 'all'>, string> = {
  favorites: 'Favorites',
  shared: 'Shared',
  trash: 'Trash',
};

interface DriveHeaderProps {
  theme: { brand: { primary: string } };
  storageStats: { storageUsed: number; storageQuota: number } | undefined;
  statsLoading: boolean;
  folderPath: { id: number; name: string }[];
  onNavigateToFolder: (folderId: number | null) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showNewFolderDialog: boolean;
  onNewFolderDialogChange: (open: boolean) => void;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onCreateFolder: () => void;
  isCreatingFolder: boolean;
  showUploader: boolean;
  onToggleUploader: () => void;
  filter: DriveFilter;
}

export function DriveHeader({
  theme,
  storageStats,
  statsLoading,
  folderPath,
  onNavigateToFolder,
  viewMode,
  onViewModeChange,
  showNewFolderDialog,
  onNewFolderDialogChange,
  newFolderName,
  onNewFolderNameChange,
  onCreateFolder,
  isCreatingFolder,
  showUploader,
  onToggleUploader,
  filter,
}: DriveHeaderProps) {
  const isDefaultFilter = filter === 'all';
  const filterLabel = !isDefaultFilter ? FILTER_LABEL[filter] : null;

  return (
    <FadeIn>
      <AuroraCard variant="glass" className="relative overflow-hidden mb-6">
        {/* Theme glow decoration */}
        <div
          className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-15 pointer-events-none"
          style={{ backgroundColor: theme.brand.primary }}
        />
        <AuroraCardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* Top row: Title and storage */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${theme.brand.primary}15` }}
                  whileHover={{ scale: 1.05 }}
                >
                  <HardDrive
                    className="h-5 w-5"
                    style={{ color: theme.brand.primary }}
                  />
                </motion.div>
                <div>
                  <h1 className="font-display font-normal tracking-tight text-foreground text-[24px] md:text-[28px] leading-[1.2]">
                    Drive
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your files — end-to-end encrypted.
                  </p>
                </div>
              </div>

              {/* Storage indicator - Desktop */}
              <div className="hidden md:block">
                {!statsLoading && storageStats && (
                  <StorageMiniIndicator
                    storageUsed={storageStats.storageUsed}
                    storageQuota={storageStats.storageQuota}
                  />
                )}
              </div>
            </div>

            {/* Second row: Breadcrumb / filter tag, view toggle, actions */}
            <div className="flex items-center gap-3">
              {/* Breadcrumb (folder context) or filter tag (non-default filter) */}
              <div className="flex-1 min-w-0">
                {isDefaultFilter ? (
                  <>
                    <BreadcrumbNav
                      items={folderPath}
                      onNavigate={onNavigateToFolder}
                      className="hidden md:flex"
                    />
                    {/* Mobile breadcrumb simplified */}
                    <div className="md:hidden text-sm text-muted-foreground">
                      {folderPath.length > 0 ? folderPath[folderPath.length - 1]?.name ?? 'Drive' : 'Drive'}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground" aria-label="Current view">
                    Drive <span className="text-foreground-muted">·</span>{' '}
                    <span className="text-foreground">{filterLabel}</span>
                  </p>
                )}
              </div>

              {/* View toggle (only meaningful for the default folder view) */}
              {isDefaultFilter && (
                <ViewToggle
                  value={viewMode}
                  onChange={onViewModeChange}
                  className="hidden md:flex"
                />
              )}

              {/* Actions — only for the default folder view */}
              {isDefaultFilter && (
                <div className="flex items-center gap-2">
                  <Dialog open={showNewFolderDialog} onOpenChange={onNewFolderDialogChange}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hidden md:flex"
                      >
                        <FolderPlus className="w-4 h-4" />
                        New folder
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create new folder</DialogTitle>
                        <DialogDescription>
                          Enter a name for your new folder.
                        </DialogDescription>
                      </DialogHeader>
                      <Input
                        value={newFolderName}
                        onChange={(e) => onNewFolderNameChange(e.target.value)}
                        placeholder="Folder name"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onCreateFolder();
                        }}
                      />
                      <DialogFooter>
                        <Button variant="outline" onClick={() => onNewFolderDialogChange(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={onCreateFolder}
                          disabled={!newFolderName.trim() || isCreatingFolder}
                          loading={isCreatingFolder}
                        >
                          Create
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button
                    onClick={onToggleUploader}
                    size="sm"
                    variant={showUploader ? 'default' : 'premium'}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden md:inline">Upload</span>
                  </Button>

                  {/* Mobile menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="md:hidden">
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onNewFolderDialogChange(true)}>
                        <FolderPlus className="w-4 h-4 mr-2" />
                        New folder
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}>
                        View {viewMode === 'grid' ? 'list' : 'grid'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        </AuroraCardContent>
      </AuroraCard>
    </FadeIn>
  );
}

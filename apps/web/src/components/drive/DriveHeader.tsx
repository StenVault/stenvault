/**
 * DriveHeader - Header component for Drive page
 *
 * Extracted from Drive.tsx for separation of concerns.
 * Pure presentational component — receives all data via props.
 */

import { motion } from 'framer-motion';
import {
  FolderPlus,
  Upload,
  MoreHorizontal,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuroraCard, AuroraCardContent } from '@/components/ui/aurora-card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FadeIn } from '@/components/ui/animated';
// Import from siblings to avoid circular dependency through barrel
import { StorageMiniIndicator } from './StorageMiniIndicator';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { BreadcrumbNav } from './BreadcrumbNav';

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
}: DriveHeaderProps) {
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
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
                  My Drive
                </h1>
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

            {/* Second row: Breadcrumb, search, actions */}
            <div className="flex items-center gap-3">
              {/* Breadcrumb */}
              <div className="flex-1 min-w-0">
                <BreadcrumbNav
                  items={folderPath}
                  onNavigate={onNavigateToFolder}
                  className="hidden md:flex"
                />
                {/* Mobile breadcrumb simplified */}
                <div className="md:hidden text-sm text-muted-foreground">
                  {folderPath.length > 0 ? folderPath[folderPath.length - 1]?.name ?? 'My Drive' : 'My Drive'}
                </div>
              </div>

              {/* View toggle */}
              <ViewToggle
                value={viewMode}
                onChange={onViewModeChange}
                className="hidden md:flex"
              />

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* New Folder - Desktop */}
                <Dialog open={showNewFolderDialog} onOpenChange={onNewFolderDialogChange}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden md:flex"
                    >
                      <FolderPlus className="w-4 h-4" />
                      New Folder
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Folder</DialogTitle>
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

                {/* Upload Button */}
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
                      New Folder
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}>
                      View {viewMode === 'grid' ? 'List' : 'Grid'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </AuroraCardContent>
      </AuroraCard>
    </FadeIn>
  );
}

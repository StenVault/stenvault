/**
 * ═══════════════════════════════════════════════════════════════
 * DRIVE PAGE - Pure File Management
 * ═══════════════════════════════════════════════════════════════
 *
 * Redesigned Drive page focused on:
 * - Clean file management interface
 * - Minimal header with breadcrumbs
 * - Compact storage indicator
 * - View mode toggle (grid/list)
 * - Enhanced drag & drop upload
 * - File preview modal
 *
 * Enhanced with Aurora Design System for premium aesthetics.
 * Uses MobileDrive for mobile devices.
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  FolderPlus,
  Upload,
  Search,
  Filter,
  MoreHorizontal,
  Plus,
  HardDrive,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AuroraCard, AuroraCardContent } from '@/components/ui/aurora-card';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { FileUploader } from '@/components/FileUploader/index';
import { FileList } from '@/components/files';
import { FilePreviewModal } from '@/components/FilePreviewModal/index';
import {
  StorageMiniIndicator,
  ViewToggle,
  BreadcrumbNav,
  getStoredViewMode,
  setStoredViewMode,
  type ViewMode,
} from '@/components/drive';
import { MobileDrive } from '@/components/mobile-v2/pages/MobileDrive';
import { useIsMobile } from '@/hooks/useMobile';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { type FileTypeNoFolder } from '@cloudvault/shared';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useDirectDownload } from '@/hooks/useDirectDownload';
import { useFoldernameDecryption } from '@/hooks/useFoldernameDecryption';
import { VaultUnlockModal } from '@/components/VaultUnlockModal';
import { encryptFilename } from '@/lib/fileCrypto';
import { useFoldernameMigration } from '@/hooks/useFoldernameMigration';
import type { FolderItem } from '@/components/files/types';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

// FileType imported from @cloudvault/shared (centralized definition)

interface FileItem {
  id: number;
  filename: string;
  mimeType: string | null;
  size: number;
  fileType: FileTypeNoFolder;
  folderId: number | null;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function Drive() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { theme } = useTheme();

  // State (must be before any conditional returns)
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: number; name: string }[]>([]);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  // URL-backed state: view mode and search query persist in URL for shareability/refresh
  const params = new URLSearchParams(searchString);
  const viewMode: ViewMode = (params.get('view') as ViewMode) ?? getStoredViewMode();
  const searchQuery = params.get('q') ?? '';

  const setViewMode = useCallback((mode: ViewMode) => {
    const p = new URLSearchParams(searchString);
    p.set('view', mode);
    setStoredViewMode(mode); // also persist to localStorage as fallback
    setLocation(`/drive${p.toString() ? `?${p}` : ''}`, { replace: true });
  }, [searchString, setLocation]);

  const setSearchQuery = useCallback((q: string) => {
    const p = new URLSearchParams(searchString);
    if (q) p.set('q', q); else p.delete('q');
    setLocation(`/drive${p.toString() ? `?${p}` : ''}`, { replace: true });
  }, [searchString, setLocation]);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  // Master Key state for vault unlock check (Phase 1.1 NEW_DAY)
  const { isUnlocked, isConfigured, isLoading: masterKeyLoading, deriveFoldernameKey } = useMasterKey();
  const { download: directDownload } = useDirectDownload();

  const utils = trpc.useUtils();

  // Fetch storage stats
  const { data: storageStats, isLoading: statsLoading } = trpc.files.getStorageStats.useQuery();

  // Fetch all folders for breadcrumb building
  const { data: allFolders } = trpc.folders.list.useQuery({});

  // Phase C: Decrypt folder names
  const { getDisplayName: getFolderDisplayName, decryptFoldernames } = useFoldernameDecryption();

  // Phase C: Migrate existing plaintext folder names to encrypted
  useFoldernameMigration();

  useEffect(() => {
    if (allFolders && allFolders.length > 0) {
      decryptFoldernames(allFolders as FolderItem[]);
    }
  }, [allFolders, decryptFoldernames]);

  // Handle URL query params for triggering actions
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const action = params.get('action');

    if (action === 'upload') {
      setShowUploader(true);
      setLocation('/drive', { replace: true });
    } else if (action === 'new-folder') {
      setShowNewFolderDialog(true);
      setLocation('/drive', { replace: true });
    }
  }, [searchString, setLocation]);

  // Build folder path when currentFolderId changes
  useEffect(() => {
    if (!allFolders || currentFolderId === null) {
      setFolderPath([]);
      return;
    }

    const buildPath = (folderId: number): { id: number; name: string }[] => {
      const folder = allFolders.find(f => f.id === folderId);
      if (!folder) return [];

      const parentPath = folder.parentId ? buildPath(folder.parentId) : [];
      return [...parentPath, { id: folder.id, name: getFolderDisplayName(folder as FolderItem) }];
    };

    setFolderPath(buildPath(currentFolderId));
  }, [currentFolderId, allFolders, getFolderDisplayName]);

  // Create folder mutation
  const createFolder = trpc.folders.create.useMutation({
    onSuccess: () => {
      toast.success('Folder created successfully');
      utils.folders.list.invalidate();
      setShowNewFolderDialog(false);
      setNewFolderName('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Handlers
  const handleFolderClick = useCallback((folderId: number) => {
    setCurrentFolderId(folderId);
  }, []);

  const handleNavigateToFolder = useCallback((folderId: number | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const handleFilePreview = useCallback((file: FileItem) => {
    setPreviewFile(file);
  }, []);

  const handleFileDownload = useCallback((file: FileItem) => {
    directDownload(file);
  }, [directDownload]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const trimmedName = newFolderName.trim();

    // Encrypt folder name if vault is unlocked
    if (isUnlocked) {
      try {
        const foldernameKey = await deriveFoldernameKey();
        const { encryptedFilename: encryptedName, iv: nameIv } = await encryptFilename(trimmedName, foldernameKey);
        createFolder.mutate({
          name: "Folder",
          encryptedName,
          nameIv,
          parentId: currentFolderId,
        });
        return;
      } catch (error) {
        // Fall through to plaintext if encryption fails
        console.warn('[Drive] Failed to encrypt folder name, falling back to plaintext', error);
      }
    }

    createFolder.mutate({
      name: trimmedName,
      parentId: currentFolderId,
    });
  }, [newFolderName, currentFolderId, createFolder, isUnlocked, deriveFoldernameKey]);

  const handleUploadComplete = useCallback(() => {
    utils.files.list.invalidate();
    utils.files.getStorageStats.invalidate();
    setShowUploader(false);
  }, [utils]);

  const toggleUploader = useCallback(() => {
    setShowUploader(prev => !prev);
  }, []);

  // MOBILE LAYOUT - Use dedicated MobileDrive component
  if (isMobile) {
    return <MobileDrive />;
  }

  // DESKTOP LAYOUT

  return (
    <>
      <div
        className="flex flex-col h-full"
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Only show uploader for external file drags (from OS file manager)
          // Internal drags (file-to-folder) set 'fileid' type via setData('fileId', ...)
          const types = Array.from(e.dataTransfer.types);
          const isExternalFileDrag = types.includes('Files') && !types.includes('fileid');
          if (isExternalFileDrag && !showUploader) setShowUploader(true);
        }}
      >
        {/* ═══════════════════════════════════════════════════════
            HEADER
            ═══════════════════════════════════════════════════════ */}
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
                      onNavigate={handleNavigateToFolder}
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
                    onChange={setViewMode}
                    className="hidden md:flex"
                  />

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* New Folder - Desktop */}
                    <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
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
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="Folder name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateFolder();
                          }}
                        />
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
                            Cancel
                          </Button>
                          <Button
                            onClick={handleCreateFolder}
                            disabled={!newFolderName.trim() || createFolder.isPending}
                            loading={createFolder.isPending}
                          >
                            Create
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Upload Button */}
                    <Button
                      onClick={toggleUploader}
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
                        <DropdownMenuItem onClick={() => setShowNewFolderDialog(true)}>
                          <FolderPlus className="w-4 h-4 mr-2" />
                          New Folder
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
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

        {/* ═══════════════════════════════════════════════════════
            UPLOAD ZONE
            ═══════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showUploader && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-6 overflow-hidden"
            >
              <AuroraCard
                variant="outline"
                className="relative overflow-hidden"
                style={{
                  borderStyle: 'dashed',
                  borderColor: `${theme.brand.primary}50`,
                  backgroundColor: `${theme.brand.primary}05`
                }}
              >
                {/* Upload glow effect */}
                <div
                  className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full blur-3xl opacity-20 pointer-events-none"
                  style={{ backgroundColor: theme.brand.primary }}
                />
                <AuroraCardContent className="p-4">
                  <FileUploader
                    folderId={currentFolderId}
                    onUploadComplete={handleUploadComplete}
                    folderUploadMaxFiles={storageStats?.folderUploadMaxFiles}
                  />
                </AuroraCardContent>
              </AuroraCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════════
            FILE LIST
            ═══════════════════════════════════════════════════════ */}
        <FadeIn delay={0.1} className="flex-1 min-h-0 relative">
          {/* Vault Locked Overlay (Phase 1.1 NEW_DAY) */}
          {isConfigured && !isUnlocked && !masterKeyLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-background/80 rounded-lg"
            >
              <div className="text-center p-8 max-w-md">
                <motion.div
                  className="mx-auto mb-6 h-16 w-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${theme.brand.primary}15` }}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <HardDrive className="h-8 w-8" style={{ color: theme.brand.primary }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2">Vault Locked</h2>
                <p className="text-muted-foreground mb-6">
                  Your files are encrypted. Unlock your vault with your Master Password to access them.
                </p>
                <Button
                  onClick={() => setUnlockModalOpen(true)}
                  size="lg"
                  className="gap-2"
                >
                  <HardDrive className="h-4 w-4" />
                  Unlock Vault
                </Button>
              </div>
            </motion.div>
          )}

          <FileList
            folderId={currentFolderId}
            onFolderClick={handleFolderClick}
            onFilePreview={handleFilePreview}
            onFileDownload={handleFileDownload}
            onUploadRequest={() => setShowUploader(true)}
          />
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            FILE PREVIEW MODAL
            ═══════════════════════════════════════════════════════ */}
        <FilePreviewModal
          file={previewFile}
          open={!!previewFile}
          onClose={() => setPreviewFile(null)}
        />

        {/* ═══════════════════════════════════════════════════════
            MOBILE STORAGE INDICATOR
            ═══════════════════════════════════════════════════════ */}
        {!statsLoading && storageStats && (
          <div className="md:hidden fixed bottom-20 left-4 z-40">
            <StorageMiniIndicator
              storageUsed={storageStats.storageUsed}
              storageQuota={storageStats.storageQuota}
            />
          </div>
        )}
      </div>

      {/* Vault Unlock Modal (Phase 1.1 NEW_DAY) */}
      <VaultUnlockModal
        isOpen={unlockModalOpen}
        onUnlock={() => setUnlockModalOpen(false)}
        onClose={() => setUnlockModalOpen(false)}
        onForgotPassword={() => {
          setUnlockModalOpen(false);
          setLocation('/auth/recovery-code-reset');
        }}
      />
    </>
  );
}


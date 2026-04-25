/**
 * FileList Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const STABLE = vi.hoisted(() => {
  const noop = () => {};
  const mockMutate = () => {};
  return {
    getDisplayName: (file: any) => file.filename,
    decryptFilenames: (files: any[]) => Promise.resolve(files),
    clearCache: noop,
    timestampResult: { isEnabled: false, isLoading: false, getStatus: () => null, statusMap: new Map() },
    utils: {
      files: { list: { invalidate: noop }, getStorageStats: { invalidate: noop }, getDownloadUrl: { fetch: noop } },
      folders: { list: { invalidate: noop } },
    },
    mutation: { mutate: mockMutate, isPending: false },
    mutationSimple: { mutate: mockMutate },
    emptyBreadcrumbs: { data: [] },
    selection: { selectedFileIds: new Set<number>(), toggleFile: noop, selectAll: noop, clearSelection: noop, isSelected: () => false, selectionCount: 0 },
    longPress: { handlers: { onTouchStart: noop, onTouchEnd: noop, onTouchMove: noop }, handleClick: (_e: any, cb: () => void) => cb(), isLongPressRef: { current: false } },
  };
});

vi.mock('lucide-react', () => {
  const Icon = (props: any) => <div {...props} />;
  return { Loader2: Icon, FolderDown: Icon, X: Icon };
});
vi.mock('@stenvault/shared/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));
vi.mock('@/hooks/useMobile', () => ({ useIsMobile: vi.fn(() => false) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: any) => value }));
vi.mock('@/hooks/useFilenameDecryption', () => ({ useFilenameDecryption: () => ({ getDisplayName: STABLE.getDisplayName, decryptFilenames: STABLE.decryptFilenames, isDecrypting: false, clearCache: STABLE.clearCache }) }));
vi.mock('@/hooks/useFoldernameDecryption', () => ({ useFoldernameDecryption: () => ({ getDisplayName: (f: any) => f.name, decryptFoldernames: async () => {}, isDecrypting: false, clearCache: () => {} }) }));
vi.mock('@/hooks/useTimestamp', () => ({ useBatchTimestampStatus: () => STABLE.timestampResult }));
vi.mock('@/lib/haptics', () => ({ hapticMedium: () => {}, hapticTap: () => {}, hapticSuccess: () => {} }));
vi.mock('@/components/filters/FilterPanel', () => ({ applyFilters: (files: any[]) => files }));
vi.mock('@/hooks/useLongPress', () => ({ useLongPress: () => ({ onTouchStart: () => {}, onTouchEnd: () => {}, onTouchMove: () => {}, onMouseDown: () => {}, onMouseUp: () => {}, onMouseLeave: () => {} }) }));
vi.mock('./hooks/useFileSelection', () => ({ useFileSelection: () => STABLE.selection }));
vi.mock('@/hooks/useFavoriteToggle', () => ({ useFavoriteToggle: () => ({ toggleFavorite: () => {}, isPending: false }) }));
vi.mock('@/hooks/useFolderDownload', () => ({ useFolderDownload: () => ({ downloadFolder: async () => {}, fetchFolderTree: async () => ({ folders: [], files: [], totalSize: 0, totalFiles: 0 }), isDownloading: false }) }));
vi.mock('@/hooks/useBulkDownload', () => ({ useBulkDownload: () => ({ downloadFiles: async () => {}, isDownloading: false }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    files: { list: { useQuery: vi.fn() }, delete: { useMutation: vi.fn() }, rename: { useMutation: vi.fn() }, move: { useMutation: vi.fn() }, renameMany: { useMutation: vi.fn() }, deleteMany: { useMutation: vi.fn() }, restore: { useMutation: vi.fn() }, duplicate: { useMutation: vi.fn() } },
    folders: { list: { useQuery: vi.fn() }, getBreadcrumbs: { useQuery: vi.fn() }, delete: { useMutation: vi.fn() }, rename: { useMutation: vi.fn() } },
    useUtils: () => STABLE.utils,
  },
}));
vi.mock('./components/FileHeader', () => ({
  FileHeader: vi.fn(({ viewMode, onViewModeChange }: any) => (
    <div data-testid="file-header">
      <select data-testid="view-mode-select" value={viewMode} onChange={(e: any) => onViewModeChange(e.target.value)}>
        <option value="grid">Grid</option><option value="list">List</option><option value="gallery">Gallery</option>
      </select>
    </div>
  )),
}));
vi.mock('./components/FileEmptyState', () => ({ FileEmptyState: vi.fn(({ onUploadRequest }: any) => <div data-testid="empty-state"><button onClick={onUploadRequest}>Upload Files</button></div>) }));
vi.mock('./components/FileDialogs', () => ({ FileDialogs: () => <div data-testid="file-dialogs" /> }));
vi.mock('./views/FileGrid', () => ({ FileGrid: ({ files, folders }: any) => <div data-testid="file-grid">{(files||[]).map((f:any) => <div key={f.id} data-testid={`file-${f.id}`}>{f.filename}</div>)}{(folders||[]).map((f:any) => <div key={f.id} data-testid={`folder-${f.id}`}>{f.name}</div>)}</div> }));
vi.mock('./views/FileTable', () => ({ FileTable: ({ files }: any) => <div data-testid="file-table">{(files||[]).map((f:any) => <div key={f.id} data-testid={`file-row-${f.id}`}>{f.filename}</div>)}</div> }));
vi.mock('./views/FileGallery', () => ({ FileGallery: ({ files }: any) => <div data-testid="file-gallery">{(files||[]).map((f:any) => <div key={f.id} data-testid={`gallery-item-${f.id}`}>{f.filename}</div>)}</div> }));
vi.mock('./components/BatchRenameDialog', () => ({ BatchRenameDialog: () => null }));
vi.mock('./components/SelectionToolbar', () => ({ SelectionToolbar: () => null }));
vi.mock('./components/FileVersionHistory', () => ({ FileVersionHistory: () => null }));
vi.mock('./components/TimestampProofModal', () => ({ TimestampProofModal: () => null }));
vi.mock('@/components/mobile-v2/FileActionSheet', () => ({ FileActionSheet: () => null }));

import { FileList } from './FileList';
import { trpc } from '@/lib/trpc';
import { useIsMobile } from '@/hooks/useMobile';

describe('FileList', () => {
  const mockFiles = [
    { id: 1, filename: 'document.pdf', mimeType: 'application/pdf', size: 1024000, fileType: 'document' as const, folderId: null, createdAt: new Date('2024-01-01') },
    { id: 2, filename: 'image.jpg', mimeType: 'image/jpeg', size: 2048000, fileType: 'image' as const, folderId: null, createdAt: new Date('2024-01-02') },
  ];
  const mockFolders = [
    { id: 10, name: 'Documents', parentId: null, createdAt: new Date('2024-01-01') },
    { id: 11, name: 'Photos', parentId: null, createdAt: new Date('2024-01-02') },
  ];
  const filesQueryResult = { data: { files: mockFiles }, isLoading: false };
  const foldersQueryResult = { data: mockFolders, isLoading: false };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trpc.files.list.useQuery).mockReturnValue(filesQueryResult as any);
    vi.mocked(trpc.folders.list.useQuery).mockReturnValue(foldersQueryResult as any);
    vi.mocked(trpc.folders.getBreadcrumbs.useQuery).mockReturnValue(STABLE.emptyBreadcrumbs as any);
    vi.mocked(trpc.files.delete.useMutation).mockReturnValue(STABLE.mutation as any);
    vi.mocked(trpc.folders.delete.useMutation).mockReturnValue(STABLE.mutation as any);
    vi.mocked(trpc.files.rename.useMutation).mockReturnValue(STABLE.mutationSimple as any);
    vi.mocked(trpc.folders.rename.useMutation).mockReturnValue(STABLE.mutationSimple as any);
    vi.mocked(trpc.files.move.useMutation).mockReturnValue(STABLE.mutationSimple as any);
    vi.mocked(trpc.files.renameMany.useMutation).mockReturnValue(STABLE.mutation as any);
    vi.mocked(trpc.files.deleteMany.useMutation).mockReturnValue(STABLE.mutation as any);
    vi.mocked(trpc.files.restore.useMutation).mockReturnValue(STABLE.mutationSimple as any);
    vi.mocked(trpc.files.duplicate.useMutation).mockReturnValue(STABLE.mutationSimple as any);
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  async function renderFileList(props: Record<string, any> = {}) {
    let result: ReturnType<typeof render>;
    await act(async () => { result = render(<FileList {...props} />); });
    return result!;
  }

  // BATCH 1: Simple renders (5 tests)
  it('01 - render FileHeader', async () => {
    await renderFileList();
    expect(screen.getByTestId('file-header')).toBeInTheDocument();
  });

  it('02 - render loading', async () => {
    vi.mocked(trpc.files.list.useQuery).mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = await renderFileList();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('03 - render empty state', async () => {
    vi.mocked(trpc.files.list.useQuery).mockReturnValue({ data: { files: [] }, isLoading: false } as any);
    vi.mocked(trpc.folders.list.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    await renderFileList();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('04 - render grid', async () => {
    await renderFileList();
    expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('file-table')).not.toBeInTheDocument();
  });

  it('05 - render files and folders', async () => {
    await renderFileList();
    expect(screen.getByTestId('file-1')).toHaveTextContent('document.pdf');
    expect(screen.getByTestId('folder-10')).toHaveTextContent('Documents');
  });

  // BATCH 2: userEvent tests (4 tests)
  it('06 - switch to list view', async () => {
    const user = userEvent.setup();
    await renderFileList();
    await user.selectOptions(screen.getByTestId('view-mode-select'), 'list');
    expect(screen.getByTestId('file-table')).toBeInTheDocument();
  });

  it('07 - switch to gallery view', async () => {
    const user = userEvent.setup();
    await renderFileList();
    await user.selectOptions(screen.getByTestId('view-mode-select'), 'gallery');
    expect(screen.getByTestId('file-gallery')).toBeInTheDocument();
  });

  it('08 - persist view mode', async () => {
    const user = userEvent.setup();
    let result: ReturnType<typeof render>;
    await act(async () => { result = render(<FileList />); });
    await user.selectOptions(screen.getByTestId('view-mode-select'), 'list');
    await act(async () => { result!.rerender(<FileList />); });
    expect(screen.getByTestId('view-mode-select')).toHaveValue('list');
  });

  it('09 - click upload button', async () => {
    const user = userEvent.setup();
    const onUploadRequest = vi.fn();
    vi.mocked(trpc.files.list.useQuery).mockReturnValue({ data: { files: [] }, isLoading: false } as any);
    vi.mocked(trpc.folders.list.useQuery).mockReturnValue({ data: [], isLoading: false } as any);
    await renderFileList({ onUploadRequest });
    await user.click(screen.getByRole('button', { name: /upload files/i }));
    expect(onUploadRequest).toHaveBeenCalled();
  });

  // BATCH 3: Props and other (6 tests)
  it('10 - pass folderId', async () => {
    await renderFileList({ folderId: 42 });
    expect(trpc.files.list.useQuery).toHaveBeenCalledWith({ folderId: 42, orderBy: 'date', order: 'desc' });
  });

  it('11 - default null folderId', async () => {
    await renderFileList();
    expect(trpc.files.list.useQuery).toHaveBeenCalledWith({ folderId: null, orderBy: 'date', order: 'desc' });
  });

  it('12 - desktop mode', async () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    await renderFileList();
    expect(useIsMobile).toHaveBeenCalled();
  });

  it('13 - mobile mode', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    await renderFileList();
    expect(useIsMobile).toHaveBeenCalled();
  });

  it('14 - custom className', async () => {
    const { container } = await renderFileList({ className: 'custom-file-list' });
    expect(container.firstChild).toHaveClass('custom-file-list');
  });

  it('15 - integration', async () => {
    await renderFileList();
    expect(screen.getByTestId('file-header')).toBeInTheDocument();
    expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    expect(screen.getByTestId('file-dialogs')).toBeInTheDocument();
  });
});

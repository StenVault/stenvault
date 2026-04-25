/**
 * File Components Module
 * 
 * Central export point for all file-related components.
 */

// Main component
export { FileList } from './FileList';

// Types
export type {
    FileType,
    ViewMode,
    FileItem,
    FolderItem,
    FileListProps,
    BreadcrumbItem,
    RenameDialogState,
    DeleteDialogState,
    ShareDialogState,
    FileActionsProps,
} from './types';

// Utilities
export {
    formatFileSize,
    getFileIcon,
    renderFileIcon,
    containerVariants,
    itemVariants,
} from './utils';

// Components
export { FileHeader } from './components/FileHeader';
export { FileEmptyState } from './components/FileEmptyState';
export { FileDialogs } from './components/FileDialogs';
export { TimestampBadge, TimestampIcon } from './components/TimestampBadge';
export { TimestampProofModal } from './components/TimestampProofModal';

// Views
export { FileGrid } from './views/FileGrid';
export { FileTable } from './views/FileTable';
export { FileGallery } from './views/FileGallery';

// Batch Actions
export { BatchActions, SelectionCheckbox, useBatchSelection } from './BatchActions';

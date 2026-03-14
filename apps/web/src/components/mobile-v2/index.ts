/**
 * Mobile V2 Components - Index
 * 
 * New mobile-first UI components with simplified architecture.
 * Uses fixed pixel values for reliable layout.
 */

// Constants (centralized dimensions, design tokens)
export * from "./constants";

// Layout Components
export { AppBar, APP_BAR_HEIGHT } from "./AppBar";
export { BottomNav, BOTTOM_NAV_HEIGHT } from "./BottomNav";
export { MobileShell } from "./MobileShell";
export { ActionSheet } from "./ActionSheet";
export { FileActionSheet, type FileAction, type FileInfo, type FileType } from "./FileActionSheet";
export { TrashActionSheet, type TrashAction } from "./TrashActionSheet";
export { ShareActionSheet, type ShareAction } from "./ShareActionSheet";

// Page Components
export { PageTransition } from "./PageTransition";
export { PullToRefresh } from "./PullToRefresh";
export { ResponsivePage } from "./ResponsivePage";

// State Components
export { EmptyState } from "./EmptyState";
export { LoadingState } from "./LoadingState";

// Content Components
export { FileCard, type FileCardProps } from "./FileCard";
export { SectionHeader } from "./SectionHeader";
export { StorageIndicator } from "./StorageIndicator";

// Hooks
export { useLongPress } from "@/hooks/useLongPress";

// Pages
export { MobileHome, MobileDrive, MobileTrash, MobileShares, MobileFavorites, MobileSettings, MobileChat, MobileChatConversation } from "./pages";





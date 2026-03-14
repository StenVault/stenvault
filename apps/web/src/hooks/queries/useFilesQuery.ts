/**
 * Files Query Hooks
 * 
 * Centralized queries for file and folder operations.
 * 
 * @created 2026-01-17
 * @phase React Query Centralization
 */

import { trpc } from '@/lib/trpc';


/**
 * Query files in a folder
 * @param folderId - Optional folder ID, undefined for root
 */
export function useFilesQuery(folderId?: number) {
    return trpc.files.list.useQuery(
        { folderId },
        {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: true,
        }
    );
}

/**
 * Query storage statistics
 */
export function useStorageStatsQuery() {
    return trpc.files.getStorageStats.useQuery(undefined, {
        staleTime: 5 * 60 * 1000, // 5 minutes (doesn't change often)
        refetchOnWindowFocus: false,
    });
}


/**
 * Query all folders (flat list)
 */
export function useFoldersQuery() {
    return trpc.folders.list.useQuery(
        {},
        {
            staleTime: 2 * 60 * 1000, // 2 minutes
        }
    );
}

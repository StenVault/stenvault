/**
 * useFavoriteToggle - Favorite toggle with cache invalidation
 */

import { trpc } from '@/lib/trpc';
import { toast } from '@/lib/toast';

export function useFavoriteToggle() {
    const utils = trpc.useUtils();

    const mutation = trpc.files.toggleFavorite.useMutation({
        onError: (_err) => {
            toast.error('Failed to update favorite');
        },
        onSettled: () => {
            utils.files.list.invalidate();
            utils.files.listFavorites.invalidate();
        },
    });

    return {
        toggleFavorite: (fileId: number) => mutation.mutate({ fileId }),
        isPending: mutation.isPending,
    };
}

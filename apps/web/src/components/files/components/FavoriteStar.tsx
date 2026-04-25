/**
 * FavoriteStar - Reusable favorite toggle button
 */

import { Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@stenvault/shared/utils';

interface FavoriteStarProps {
    isFavorite: boolean;
    onClick: (e: React.MouseEvent) => void;
    className?: string;
    size?: number;
}

export function FavoriteStar({ isFavorite, onClick, className, size = 16 }: FavoriteStarProps) {
    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.75 }}
            animate={isFavorite ? { scale: [1, 1.3, 1] } : undefined}
            transition={{ duration: 0.25 }}
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClick(e);
            }}
            className={cn(
                'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none',
                isFavorite
                    ? 'text-amber-400 hover:text-amber-500'
                    : 'text-muted-foreground hover:text-amber-400',
                className,
            )}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
            <Star
                className={cn(isFavorite && 'fill-current')}
                style={{ width: size, height: size }}
            />
        </motion.button>
    );
}

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PageLoadingProps {
  rows?: number;
  className?: string;
}

export function PageLoading({ rows = 5, className }: PageLoadingProps) {
  return (
    <div role="status" aria-busy="true" className={cn('space-y-3 py-6', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-5 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

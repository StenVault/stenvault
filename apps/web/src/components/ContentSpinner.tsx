import { Loader2 } from 'lucide-react';

export function ContentSpinner() {
  return (
    <div className="flex items-center justify-center flex-1 min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

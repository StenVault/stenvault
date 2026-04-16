import { useState } from "react";
import { FileIcon, FolderOpen } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

interface BrowsePopoverProps {
  onFilesClick: () => void;
  onFolderClick: () => void;
}

export function BrowsePopover({ onFilesClick, onFolderClick }: BrowsePopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-violet-400 hover:text-violet-300 transition-colors cursor-pointer font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          browse
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-44 p-1.5 rounded-xl border shadow-xl shadow-black/40"
        style={{
          backgroundColor: LANDING_COLORS.surface,
          borderColor: LANDING_COLORS.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          style={{ color: LANDING_COLORS.textPrimary }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LANDING_COLORS.surfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          onClick={() => { onFilesClick(); requestAnimationFrame(() => setOpen(false)); }}
        >
          <FileIcon className="w-4 h-4 text-violet-400" />
          Files
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          style={{ color: LANDING_COLORS.textPrimary }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LANDING_COLORS.surfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          onClick={() => { onFolderClick(); requestAnimationFrame(() => setOpen(false)); }}
        >
          <FolderOpen className="w-4 h-4 text-violet-400" />
          Folder
        </button>
      </PopoverContent>
    </Popover>
  );
}

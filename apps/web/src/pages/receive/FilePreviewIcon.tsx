import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { FileIcon, Archive, Image as ImageIcon } from "lucide-react";

interface FilePreviewIconProps {
  thumbnailUrl: string | null;
  thumbnailFailed: boolean;
  isBundle: boolean;
}

export function FilePreviewIcon({ thumbnailUrl, thumbnailFailed, isBundle }: FilePreviewIconProps) {
  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt="Preview"
        className="w-14 h-14 rounded-2xl object-cover"
      />
    );
  }
  if (thumbnailFailed) {
    return (
      <div
        className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0"
        style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
      >
        <ImageIcon className="w-5 h-5 text-violet-400/50" />
        <span className="text-[8px] mt-0.5" style={{ color: LANDING_COLORS.textMuted }}>
          No preview
        </span>
      </div>
    );
  }
  const IconComponent = isBundle ? Archive : FileIcon;
  return (
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
    >
      <IconComponent className="w-7 h-7 text-violet-400" />
    </div>
  );
}

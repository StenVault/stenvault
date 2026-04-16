import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { Upload, FileIcon, Files, AlertCircle, Lock, Zap, ArrowRight } from "lucide-react";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { BrowsePopover } from "./BrowsePopover";
import type { SendState } from "@/hooks/usePublicSend";

interface SendDropzoneProps {
  files: File[];
  isDragging: boolean;
  error: string | null;
  state: SendState;
  maxSize: string;
  fileDisplayName: string;
  fileDisplaySize: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  historySlot: React.ReactNode;
  replyToSessionId?: string;
}

export function SendDropzone({
  files,
  isDragging,
  error,
  state,
  maxSize,
  fileDisplayName,
  fileDisplaySize,
  fileInputRef,
  folderInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  historySlot,
  replyToSessionId,
}: SendDropzoneProps) {
  return (
    <div className="space-y-4">
      {/* Reply indicator */}
      {replyToSessionId && (
        <div className="flex justify-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm"
            style={{
              borderColor: `${LANDING_COLORS.success}30`,
              backgroundColor: `${LANDING_COLORS.success}08`,
            }}
          >
            <ArrowRight className="w-3 h-3 text-emerald-400 rotate-180" />
            <span className="text-[10px] font-semibold text-emerald-300">
              Replying with a file
            </span>
          </div>
        </div>
      )}

      {/* Compact badge */}
      <div className="flex justify-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm"
          style={{
            borderColor: `${LANDING_COLORS.accent}30`,
            backgroundColor: `${LANDING_COLORS.accent}08`,
          }}
        >
          <Lock className="w-3 h-3 text-violet-400" />
          <span className="text-[10px] font-semibold text-violet-300">
            End-to-end encrypted
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* Headline */}
      <h1
        className="text-2xl sm:text-3xl font-normal text-center tracking-tight leading-[1.1]"
        style={{ color: LANDING_COLORS.textPrimary }}
      >
        Send files.{" "}
        <span className="bg-gradient-to-r from-violet-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
          Encrypted.
        </span>
      </h1>

      <p
        className="text-sm text-center font-light leading-relaxed max-w-md mx-auto"
        style={{ color: LANDING_COLORS.textSecondary }}
      >
        Zero-knowledge file sharing. No account needed.
      </p>

      {/* Dropzone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer
          transition-all duration-300 group ${
            isDragging
              ? "scale-[1.01]"
              : files.length > 0
                ? ""
                : "hover:scale-[1.005]"
          }`}
        style={{
          borderColor: isDragging
            ? LANDING_COLORS.accent
            : files.length > 0
              ? `${LANDING_COLORS.accent}60`
              : `${LANDING_COLORS.textMuted}30`,
          backgroundColor: isDragging
            ? `${LANDING_COLORS.accent}08`
            : files.length > 0
              ? `${LANDING_COLORS.accent}05`
              : "transparent",
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={onFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          {...{ webkitdirectory: "" } as any}
          onChange={onFileSelect}
        />

        {files.length > 0 ? (
          <div className="space-y-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
            >
              {files.length > 1 ? (
                <Files className="w-6 h-6 text-violet-400" />
              ) : (
                <FileIcon className="w-6 h-6 text-violet-400" />
              )}
            </div>
            <p
              className="font-semibold truncate max-w-xs mx-auto"
              style={{ color: LANDING_COLORS.textPrimary }}
            >
              {fileDisplayName}
            </p>
            <p className="text-sm" style={{ color: LANDING_COLORS.textSecondary }}>
              {fileDisplaySize}
              {files.length > 1 && ` (${files.length} files)`}
            </p>
            <p className="text-xs" style={{ color: LANDING_COLORS.textMuted }}>
              Click or drop to change files
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: `${LANDING_COLORS.accent}10` }}
            >
              <Upload className="w-6 h-6 text-violet-400" />
            </div>
            <p className="font-semibold" style={{ color: LANDING_COLORS.textPrimary }}>
              Drop files here or{" "}
              <BrowsePopover
                onFilesClick={() => fileInputRef.current?.click()}
                onFolderClick={() => folderInputRef.current?.click()}
              />
            </p>
            <p className="text-sm" style={{ color: LANDING_COLORS.textMuted }}>
              Up to {maxSize} &middot; Any file type &middot; Folders supported
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {state === "error" && error && (
        <div
          className="flex items-center gap-2.5 p-3 rounded-xl text-sm"
          style={{
            backgroundColor: `${LANDING_COLORS.danger}10`,
            color: LANDING_COLORS.danger,
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Local Send link */}
      <div className="flex justify-center">
        <Link
          to="/send/local"
          className="inline-flex items-center gap-1.5 text-[10px] font-medium transition-colors hover:text-emerald-300 group/local"
          style={{ color: LANDING_COLORS.textMuted }}
        >
          <Zap className="w-3 h-3 text-emerald-400" />
          Same WiFi? <span className="text-emerald-400">Transfer directly</span>
          <ArrowRight className="w-2.5 h-2.5 text-emerald-400 transition-transform group-hover/local:translate-x-0.5" />
        </Link>
      </div>

      {/* Send history */}
      {files.length === 0 && historySlot}
    </div>
  );
}

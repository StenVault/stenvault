import { useState } from "react";
import { toast } from "sonner";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { trpc } from "@/lib/trpc";
import {
  Hash,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Copy,
} from "lucide-react";

export interface RoomCodeSectionProps {
  peerId: string | null;
}

/**
 * Room code section -- collapsible "Can't find device?" with create/join code UI.
 */
export function RoomCodeSection({ peerId }: RoomCodeSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);

  const createCodeMut = trpc.localSend.createRoomCode.useMutation({
    onSuccess: (data) => {
      setActiveCode(data.code);
      toast.success("Room code created!");
    },
    onError: (err) => {
      toast.error("Failed to create code: " + err.message);
    },
  });

  const joinCodeMut = trpc.localSend.joinRoomCode.useMutation({
    onSuccess: () => {
      toast.success("Joined room!");
      setJoinInput("");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleCreate = () => {
    if (!peerId) return;
    createCodeMut.mutate({ peerId });
  };

  const handleJoin = () => {
    if (!peerId || joinInput.length !== 6) return;
    joinCodeMut.mutate({ peerId, code: joinInput.toUpperCase() });
  };

  const handleCopy = async () => {
    if (!activeCode) return;
    await navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium transition-colors hover:text-violet-400 cursor-pointer"
        style={{ color: LANDING_COLORS.textMuted }}
      >
        <Hash className="w-3.5 h-3.5" />
        Can't find your device?
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div
          className="mt-3 rounded-xl border p-4 space-y-4"
          style={{
            borderColor: `${LANDING_COLORS.border}80`,
            backgroundColor: `${LANDING_COLORS.bg}40`,
          }}
        >
          <p className="text-xs text-center" style={{ color: LANDING_COLORS.textMuted }}>
            Use a room code to connect devices manually
          </p>

          {/* Create code */}
          {!activeCode ? (
            <button
              onClick={handleCreate}
              disabled={!peerId || createCodeMut.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all hover:border-violet-500/40 cursor-pointer disabled:opacity-50"
              style={{
                borderColor: `${LANDING_COLORS.accent}25`,
                color: LANDING_COLORS.textSecondary,
              }}
            >
              {createCodeMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Hash className="w-4 h-4 text-violet-400" />
              )}
              Create a room code
            </button>
          ) : (
            <div className="text-center">
              <p className="text-xs mb-2" style={{ color: LANDING_COLORS.textMuted }}>
                Share this code with the other device
              </p>
              <div className="flex items-center justify-center gap-2">
                <code
                  className="font-mono text-2xl font-bold tracking-[0.3em] px-4 py-2 rounded-lg"
                  style={{
                    color: LANDING_COLORS.accent,
                    backgroundColor: `${LANDING_COLORS.accent}10`,
                  }}
                >
                  {activeCode}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5 cursor-pointer"
                  style={{ color: LANDING_COLORS.textMuted }}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: LANDING_COLORS.textMuted }}>
                Expires in 10 minutes
              </p>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ backgroundColor: LANDING_COLORS.border }} />
            <span className="text-xs" style={{ color: LANDING_COLORS.textMuted }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: LANDING_COLORS.border }} />
          </div>

          {/* Join code */}
          <div>
            <p className="text-xs mb-2 text-center" style={{ color: LANDING_COLORS.textMuted }}>
              Enter a code from the other device
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinInput}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
                  setJoinInput(val);
                }}
                placeholder="XXXXXX"
                maxLength={6}
                className="flex-1 px-3 py-2.5 rounded-lg border text-center font-mono text-lg tracking-[0.2em] font-semibold placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40"
                style={{
                  borderColor: LANDING_COLORS.border,
                  backgroundColor: `${LANDING_COLORS.bg}60`,
                  color: LANDING_COLORS.textPrimary,
                }}
              />
              <button
                onClick={handleJoin}
                disabled={joinInput.length !== 6 || !peerId || joinCodeMut.isPending}
                className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                style={{
                  backgroundColor: joinInput.length === 6 ? LANDING_COLORS.accent : `${LANDING_COLORS.accent}20`,
                  color: joinInput.length === 6 ? "white" : LANDING_COLORS.textMuted,
                }}
              >
                {joinCodeMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Join"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

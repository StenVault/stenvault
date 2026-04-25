import { useEffect } from "react";
import { toast } from "@stenvault/shared/lib/toast";
import { uiDescription } from "@stenvault/shared/lib/uiMessage";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { formatBytes } from "@stenvault/shared";
import { trpc } from "@/lib/trpc";
import {
  Download,
  Check,
  X,
  FileIcon,
} from "lucide-react";
import { RadarScan } from "@/components/ui/RadarScan";
import type { UseLocalTransferReturn } from "@/hooks/useLocalTransfer";
import type { TransferRequest } from "@/hooks/useLocalSSE";
import { SafariWarning } from "./SafariWarning";
import { RoomCodeSection } from "./RoomCodeSection";
import { ResumableTransfersSection } from "./ResumableTransfersSection";
import { TransferProgressDisplay } from "./TransferProgressDisplay";
import { isSafari, TWO_GB } from "./utils";

interface ReceiveViewProps {
  peerId: string | null;
  displayName: string | null;
  reRegisterKey: number;
  incomingRequest: TransferRequest | null;
  onAccept: () => void;
  onReject: () => void;
  transfer: UseLocalTransferReturn;
  showCancelConfirm: boolean;
  setShowCancelConfirm: (v: boolean) => void;
}

export function ReceiveView({
  peerId,
  displayName,
  reRegisterKey,
  incomingRequest,
  onAccept,
  onReject,
  transfer,
  showCancelConfirm,
  setShowCancelConfirm,
}: ReceiveViewProps) {
  const incomingTotalSize = incomingRequest
    ? incomingRequest.files.reduce((sum, f) => sum + f.size, 0)
    : 0;
  const showReceiverSafariWarning = isSafari() && incomingTotalSize > TWO_GB;

  return (
    <>
      <h2
        className="text-2xl sm:text-3xl font-normal text-center tracking-tight mb-2"
        style={{ color: LANDING_COLORS.textPrimary }}
      >
        Receive files
      </h2>
      <p
        className="text-sm text-center mb-8"
        style={{ color: LANDING_COLORS.textSecondary }}
      >
        This device is visible to senders on your network
      </p>

      {/* Auto-register as receiver */}
      <ReceiverRegistration peerId={peerId} reRegisterKey={reRegisterKey} />

      {/* Main card */}
      <div
        className="rounded-2xl border overflow-hidden backdrop-blur-xl"
        style={{
          backgroundColor: `${LANDING_COLORS.surface}B3`,
          borderColor: LANDING_COLORS.border,
        }}
      >
        <div className="p-6 sm:p-8">
          {/* Incoming request dialog */}
          {incomingRequest && transfer.state === "idle" && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${LANDING_COLORS.accent}15` }}
                >
                  <Download className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: LANDING_COLORS.textPrimary }}>
                    Incoming transfer
                  </p>
                  <p className="text-xs" style={{ color: LANDING_COLORS.textSecondary }}>
                    from <span className="text-violet-400 font-medium">{incomingRequest.senderName}</span>
                    {incomingRequest.files.length > 1 && (
                      <span className="ml-1.5" style={{ color: LANDING_COLORS.textMuted }}>
                        ({incomingRequest.files.length} files, {formatBytes(incomingTotalSize)})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 mb-6 max-h-40 overflow-y-auto">
                {incomingRequest.files.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: `${LANDING_COLORS.bg}60` }}
                  >
                    <FileIcon className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="text-sm truncate flex-1" style={{ color: LANDING_COLORS.textPrimary }}>
                      {f.name}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: LANDING_COLORS.textMuted }}>
                      {formatBytes(f.size)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Safari >2GB warning (receiver) */}
              {showReceiverSafariWarning && (
                <SafariWarning className="mb-4" />
              )}

              <div className="flex gap-3">
                <button
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold text-white rounded-xl transition-all hover:brightness-110 cursor-pointer"
                  style={{
                    backgroundColor: LANDING_COLORS.accent,
                    boxShadow: `0 0 20px ${LANDING_COLORS.accentGlow}`,
                  }}
                  onClick={onAccept}
                >
                  <Check className="w-4 h-4" />
                  Accept
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium rounded-xl transition-colors hover:bg-white/5 cursor-pointer"
                  style={{ color: LANDING_COLORS.textPrimary }}
                  onClick={onReject}
                >
                  <X className="w-4 h-4" />
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Waiting state */}
          {!incomingRequest && transfer.state === "idle" && (
            <div className="text-center py-8">
              <div className="mx-auto mb-6 w-fit">
                <RadarScan size={80} color={LANDING_COLORS.success} />
              </div>
              <p className="text-sm font-medium" style={{ color: LANDING_COLORS.textSecondary }}>
                Waiting for a sender...
              </p>
              {displayName && (
                <p className="text-xs mt-2" style={{ color: LANDING_COLORS.textMuted }}>
                  Showing as <span className="text-emerald-400 font-medium">{displayName}</span>
                </p>
              )}

              {/* Resumable transfers */}
              {transfer.resumableTransfers.length > 0 && (
                <ResumableTransfersSection
                  transfers={transfer.resumableTransfers}
                  onDiscard={transfer.discardResumable}
                />
              )}

              {/* Room code section */}
              <RoomCodeSection peerId={peerId} />
            </div>
          )}

          {/* Transfer progress (receiver) */}
          {transfer.state !== "idle" && (
            <TransferProgressDisplay
              transfer={transfer}
              role="receive"
              showCancelConfirm={showCancelConfirm}
              setShowCancelConfirm={setShowCancelConfirm}
            />
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Auto-registers as receiver when mounted.
 * Unregisters on unmount. Re-registers when reRegisterKey changes.
 */
function ReceiverRegistration({ peerId, reRegisterKey = 0 }: { peerId: string | null; reRegisterKey?: number }) {
  const registerMut = trpc.localSend.registerReceiver.useMutation({
    onError: (err) => {
      toast.error("Could not register as receiver", { description: uiDescription(err.message) });
    },
  });
  const unregisterMut = trpc.localSend.unregisterReceiver.useMutation();

  useEffect(() => {
    if (!peerId) return;

    registerMut.mutate({ peerId });

    return () => {
      unregisterMut.mutate({ peerId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId, reRegisterKey]);

  return null;
}

/**
 * LocalSendPage — LAN Device-to-Device Transfer
 *
 * AirDrop-like experience in the browser. Zero cloud, zero cost, E2E encrypted.
 * Uses SSE for discovery + tRPC mutations for actions + WebRTC DataChannel for data.
 *
 * States: idle -> send | receive
 *   Send:    file drop zone (multi-file) + receiver list + transfer progress
 *   Receive: waiting animation + incoming request dialog + progress
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/lib/toast";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { GradientMesh } from "@/components/ui/GradientMesh";
import {
  useLocalSSE,
  type TransferRequest,
  type SignalData,
} from "@/hooks/useLocalSSE";
import { useLocalTransfer } from "@/hooks/useLocalTransfer";
import { Upload, ArrowLeft } from "lucide-react";

import type { PageMode } from "./local-send/utils";
import { isSafari, TWO_GB } from "./local-send/utils";
import { IdleView } from "./local-send/IdleView";
import { SendView } from "./local-send/SendView";
import { ReceiveView } from "./local-send/ReceiveView";

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function LocalSendPage() {
  const [mode, setMode] = useState<PageMode>("idle");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [incomingRequest, setIncomingRequest] = useState<TransferRequest | null>(null);
  const [safariDismissed, setSafariDismissed] = useState(false);
  const [reRegisterKey, setReRegisterKey] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transfer = useLocalTransfer();

  useEffect(() => {
    transfer.onReset.current = () => {
      if (mode === "receive") {
        setReRegisterKey((k) => k + 1);
      }
    };
    return () => { transfer.onReset.current = null; };
  }, [transfer, mode]);

  const sse = useLocalSSE({
    onTransferRequest: (req) => setIncomingRequest(req),
    onTransferAccepted: (sessionId) => {
      transfer.handleSignal({ sessionId, peerId: "", type: "offer", data: "" });
    },
    onTransferRejected: () => {
      toast.info("Transfer declined by receiver");
      transfer.reset();
      setSelectedFiles([]);
    },
    onTransferCancelled: (sessionId) => {
      transfer.handleTransferCancelled(sessionId);
      setIncomingRequest(null);
      toast.info("Transfer cancelled by peer");
    },
    onPeerLeft: (leftPeerId) => {
      if (incomingRequest?.senderId === leftPeerId) {
        setIncomingRequest(null);
        toast.info("Sender disconnected");
      }
    },
    onSignal: (signal: SignalData) => transfer.handleSignal(signal),
  });

  const totalSelectedSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const showSafariWarning = isSafari() && totalSelectedSize > TWO_GB && !safariDismissed;

  const isTransferActive =
    transfer.state === "transferring" ||
    transfer.state === "connecting" ||
    transfer.state === "requesting" ||
    transfer.state === "waiting_accept";

  // ─── Handlers ───

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = "";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSendTo = useCallback(
    (receiverId: string) => {
      if (selectedFiles.length === 0 || !sse.peerId) return;
      transfer.sendToReceiver(receiverId, selectedFiles, sse.peerId);
    },
    [selectedFiles, sse.peerId, transfer],
  );

  const handleAccept = useCallback(() => {
    if (!incomingRequest || !sse.peerId) return;
    transfer.acceptTransfer(incomingRequest, sse.peerId);
    setIncomingRequest(null);
  }, [incomingRequest, sse.peerId, transfer]);

  const handleReject = useCallback(() => {
    if (!incomingRequest || !sse.peerId) return;
    transfer.rejectTransfer(incomingRequest.sessionId, sse.peerId);
    setIncomingRequest(null);
  }, [incomingRequest, sse.peerId, transfer]);

  const handleBack = useCallback(() => {
    if (isTransferActive) {
      transfer.cancelTransfer();
    } else {
      transfer.reset();
    }
    setSelectedFiles([]);
    setIncomingRequest(null);
    setSafariDismissed(false);
    setShowCancelConfirm(false);
    setMode("idle");
  }, [transfer, isTransferActive]);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div style={{ backgroundColor: LANDING_COLORS.bg }}>
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 overflow-hidden">
        {/* Toolbar */}
        <div className="fixed top-16 left-0 right-0 z-40 flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-2">
            {mode !== "idle" && (
              <button
                onClick={() => {
                  if (transfer.state === "transferring") {
                    setShowCancelConfirm(true);
                  } else {
                    handleBack();
                  }
                }}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/5 cursor-pointer"
                style={{ color: LANDING_COLORS.textSecondary }}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Link
              to="/send"
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-violet-400"
              style={{ color: LANDING_COLORS.textSecondary }}
            >
              <Upload className="w-3.5 h-3.5" />
              Cloud Send
            </Link>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
              sse.connected
                ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400"
                : "border-amber-500/20 bg-amber-500/8 text-amber-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sse.connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            {sse.connected ? "Connected" : sse.error ? "Reconnecting..." : "Connecting..."}
          </span>
        </div>
        <GradientMesh variant="default" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-xl mx-auto">
            {mode === "idle" && <IdleView onSelectMode={setMode} />}

            {mode === "send" && (
              <SendView
                selectedFiles={selectedFiles}
                onFileSelect={handleFileSelect}
                onDrop={handleDrop}
                onRemoveFile={handleRemoveFile}
                onSendTo={handleSendTo}
                fileInputRef={fileInputRef}
                transfer={transfer}
                receivers={sse.receivers}
                peerId={sse.peerId}
                totalSelectedSize={totalSelectedSize}
                showSafariWarning={showSafariWarning}
                onDismissSafari={() => setSafariDismissed(true)}
                showCancelConfirm={showCancelConfirm}
                setShowCancelConfirm={setShowCancelConfirm}
              />
            )}

            {mode === "receive" && (
              <ReceiveView
                peerId={sse.peerId}
                displayName={sse.displayName}
                reRegisterKey={reRegisterKey}
                incomingRequest={incomingRequest}
                onAccept={handleAccept}
                onReject={handleReject}
                transfer={transfer}
                showCancelConfirm={showCancelConfirm}
                setShowCancelConfirm={setShowCancelConfirm}
              />
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
    </div>
  );
}

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  slideUpVariants,
  fadeScaleVariants,
  fadeVariants,
} from "@stenvault/shared/lib/motion";
import { LANDING_COLORS } from "@/lib/constants/themeColors";
import { EncryptionRing } from "@/components/ui/EncryptionRing";
import { ShimmerBar } from "@/components/ui/ShimmerBar";
import { useIsMobile } from "@/hooks/useMobile";
import { formatSpeed, formatEta } from "./utils";
import { SEND_RING_SIZE_MOBILE, SEND_RING_SIZE_DESKTOP } from "./sendLayout";
import type { SendState } from "@/hooks/usePublicSend";

interface SendActiveViewProps {
  state: SendState;
  progress: number;
  speed: number;
  eta: number;
  fileDisplayName: string;
  fileDisplaySize: string;
}

const STAGE_COPY: Partial<Record<SendState, { label: string; sub: string }>> = {
  encrypting: {
    label: "Sealing with AES-256-GCM",
    sub: "Your files never leave unencrypted",
  },
  uploading: {
    label: "Uploading encrypted chunks",
    sub: "Zero-knowledge transfer in progress",
  },
  completing: {
    label: "Finalizing",
    sub: "Building your share link",
  },
};

export function SendActiveView({
  state,
  progress,
  speed,
  eta,
  fileDisplayName,
  fileDisplaySize,
}: SendActiveViewProps) {
  const reducedMotion = useReducedMotion();
  const ringVariants = reducedMotion ? fadeVariants : fadeScaleVariants;
  const labelVariants = reducedMotion ? fadeVariants : slideUpVariants;
  const isMobile = useIsMobile();
  const ringSize = isMobile ? SEND_RING_SIZE_MOBILE : SEND_RING_SIZE_DESKTOP;

  const copy = STAGE_COPY[state];

  return (
    <div className="py-8 max-w-md mx-auto flex flex-col items-center text-center space-y-6">
      <motion.div
        variants={ringVariants}
        initial="initial"
        animate="animate"
      >
        <EncryptionRing progress={progress} state={state} size={ringSize} />
      </motion.div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="min-h-[3.5rem] w-full"
      >
        <AnimatePresence mode="wait">
          {copy && (
            <motion.div
              key={state}
              variants={labelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <p
                className="font-semibold text-lg"
                style={{ color: LANDING_COLORS.textPrimary }}
              >
                {copy.label}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: LANDING_COLORS.textSecondary }}
              >
                {copy.sub}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full space-y-2">
        <ShimmerBar progress={progress} />
        <div className="flex items-center justify-between">
          <p
            className="text-sm font-medium"
            style={{ color: LANDING_COLORS.textSecondary }}
          >
            {progress}%
          </p>
          {state === "uploading" && speed > 0 && (
            <p
              className="text-xs"
              style={{ color: LANDING_COLORS.textMuted }}
            >
              {formatSpeed(speed)}
              {eta > 0 && ` · ${formatEta(eta)}`}
            </p>
          )}
        </div>
      </div>

      {fileDisplayName && (
        <p
          className="text-xs truncate max-w-full"
          style={{ color: LANDING_COLORS.textMuted }}
        >
          {fileDisplayName}
          {fileDisplaySize && ` · ${fileDisplaySize}`}
        </p>
      )}
    </div>
  );
}

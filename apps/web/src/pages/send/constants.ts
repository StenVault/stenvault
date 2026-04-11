import { Upload, Shield, Zap } from "lucide-react";
import {
  SEND_EXPIRY_OPTIONS,
  SEND_EXPIRY_ANON_MAX_HOURS,
  SEND_FILE_SIZE_TIERS,
  type SendExpiryOption,
} from "@stenvault/shared";
import { LANDING_COLORS } from "@/lib/constants/themeColors";

// Widened to `readonly SendExpiryOption[]` so the `as const` tuple shape from
// `@stenvault/shared` doesn't leak into downstream callers.
export const EXPIRY_OPTIONS_AUTH: readonly SendExpiryOption[] = SEND_EXPIRY_OPTIONS;
export const EXPIRY_OPTIONS_ANON: readonly SendExpiryOption[] = SEND_EXPIRY_OPTIONS.filter(
  (opt) => opt.value <= SEND_EXPIRY_ANON_MAX_HOURS,
);

const { ANON: SEND_ANON, FREE: SEND_FREE, BUSINESS: SEND_BUSINESS } = SEND_FILE_SIZE_TIERS;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Drop your files",
    description: `Drag & drop files or folders, or click to select. Up to ${SEND_ANON.label} (${SEND_FREE.label} with account).`,
    icon: Upload,
    accent: LANDING_COLORS.accent,
  },
  {
    step: "02",
    title: "Encrypted in-browser",
    description: "AES-256-GCM encryption happens entirely in your browser. We never see your files.",
    icon: Shield,
    accent: LANDING_COLORS.success,
  },
  {
    step: "03",
    title: "Share the link",
    description: "Get a secure link with QR code. The decryption key stays in the URL fragment — never sent to our server.",
    icon: Zap,
    accent: "#A78BFA",
  },
] as const;

export const COMPARISON = [
  { feature: "End-to-end encryption", stenvault: true, wetransfer: false, wormhole: true },
  { feature: "Zero-knowledge (server never sees file)", stenvault: true, wetransfer: false, wormhole: true },
  { feature: "No account required", stenvault: true, wetransfer: true, wormhole: true },
  { feature: "AES-256-GCM encryption", stenvault: true, wetransfer: false, wormhole: false },
  { feature: "Password protection", stenvault: true, wetransfer: false, wormhole: false },
  { feature: "Download limit", stenvault: true, wetransfer: false, wormhole: false },
  { feature: "Multi-file + folder support", stenvault: true, wetransfer: true, wormhole: false },
  { feature: "Max file size", stenvault: SEND_BUSINESS.label, wetransfer: "2 GB", wormhole: "10 GB" },
  { feature: "Open source", stenvault: true, wetransfer: false, wormhole: true },
] as const;

export const FAQ_ITEMS = [
  {
    q: "How is my file encrypted?",
    a: "Your file is encrypted with AES-256-GCM directly in your browser before upload. A random 256-bit key is generated for each file. The key is placed in the URL fragment (#key=...) which, per the HTTP specification, is never sent to the server. This means we physically cannot decrypt your file.",
  },
  {
    q: "Do I need an account?",
    a: `No. Send is completely anonymous — no account, no email, no tracking. Just drop a file and get a link. Sign in for higher limits: up to ${SEND_FREE.label} on the free plan, or ${SEND_BUSINESS.label} files and 90-day expiry on paid plans. If you want permanent encrypted storage with quantum-safe encryption, create a free StenVault account.`,
  },
  {
    q: "Can I send multiple files?",
    a: "Yes! Drop multiple files or entire folders. They'll be automatically bundled into an encrypted zip archive. The recipient sees the individual file list and can download the whole bundle.",
  },
  {
    q: "How long does the file stay available?",
    a: "You choose: 1 hour, 24 hours, or 7 days (up to 90 days on paid plans). After expiration, the encrypted file is automatically deleted from our servers. You can also set a download limit to auto-delete after a certain number of downloads.",
  },
  {
    q: "Is this really zero-knowledge?",
    a: "Yes. The encryption key exists only in the URL fragment, which browsers never send to servers (this is part of the HTTP/URI specification, RFC 3986). Our server stores only the encrypted blob. Even if compelled, we cannot decrypt your file because we never had the key.",
  },
] as const;

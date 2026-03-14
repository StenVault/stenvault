/**
 * SignatureBadge Component (Phase 3.4 Sovereign)
 *
 * Displays signature verification status for signed files.
 * Shows whether the file has been cryptographically verified.
 */

import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SignatureVerificationState } from '../types';

interface SignatureBadgeProps {
  signatureState: SignatureVerificationState;
  className?: string;
}

export function SignatureBadge({ signatureState, className }: SignatureBadgeProps) {
  const { hasSignature, isVerifying, result, signerInfo, decryptionVerified } = signatureState;

  // No signature on file
  if (!hasSignature) {
    return null;
  }

  // Currently verifying
  if (isVerifying) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={cn('gap-1 cursor-default', className)}>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">Verifying</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Verifying file signature...</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Verification not yet done (waiting for decryption)
  if (!result) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={cn('gap-1 cursor-default', className)}>
              <Shield className="h-3 w-3 text-muted-foreground" />
              <span className="hidden sm:inline">Signed</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This file is signed. Decrypt to verify signature.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Verification complete - show result
  if (result.valid && decryptionVerified) {
    // Full chain verified: signature + AES-GCM integrity
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'gap-1 cursor-default border-green-500/50 bg-green-500/15 text-green-600',
                className
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              <span className="hidden sm:inline">Fully Verified</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-green-600">Fully Verified</p>
              <p className="text-xs text-muted-foreground">
                Signature: Ed25519 + ML-DSA-65 valid
              </p>
              <p className="text-xs text-muted-foreground">
                Decryption: AES-256-GCM integrity confirmed
              </p>
              {signerInfo?.signerFingerprint && (
                <p className="text-xs text-muted-foreground">
                  Key: {signerInfo.signerFingerprint.slice(0, 16)}...
                </p>
              )}
              {signerInfo?.signedAt && (
                <p className="text-xs text-muted-foreground">
                  Signed: {new Date(signerInfo.signedAt).toLocaleString()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (result.valid) {
    // Signature verified, decryption not yet complete
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'gap-1 cursor-default border-green-500/50 bg-green-500/10 text-green-600',
                className
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              <span className="hidden sm:inline">Verified</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-green-600">Signature Verified</p>
              <p className="text-xs text-muted-foreground">
                Both classical (Ed25519) and post-quantum (ML-DSA-65) signatures are valid.
              </p>
              {signerInfo?.signerFingerprint && (
                <p className="text-xs text-muted-foreground">
                  Key: {signerInfo.signerFingerprint.slice(0, 16)}...
                </p>
              )}
              {signerInfo?.signedAt && (
                <p className="text-xs text-muted-foreground">
                  Signed: {new Date(signerInfo.signedAt).toLocaleString()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Partial verification (one algorithm failed)
  if (result.classicalValid || result.postQuantumValid) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'gap-1 cursor-default border-yellow-500/50 bg-yellow-500/10 text-yellow-600',
                className
              )}
            >
              <ShieldQuestion className="h-3 w-3" />
              <span className="hidden sm:inline">Partial</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-yellow-600">Partial Verification</p>
              <p className="text-xs text-muted-foreground">
                {result.classicalValid && !result.postQuantumValid
                  ? 'Ed25519 signature is valid, but ML-DSA-65 verification failed.'
                  : 'ML-DSA-65 signature is valid, but Ed25519 verification failed.'}
              </p>
              {result.error && (
                <p className="text-xs text-destructive">{result.error}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Infra-error recovery: signature verification failed but AES-GCM decryption confirmed integrity
  if (decryptionVerified && hasSignature) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'gap-1 cursor-default border-blue-500/50 bg-blue-500/10 text-blue-600',
                className
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              <span className="hidden sm:inline">Integrity OK</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-blue-600">Integrity Confirmed</p>
              <p className="text-xs text-muted-foreground">
                Signature verification was unavailable, but AES-256-GCM decryption confirmed content integrity.
              </p>
              {result.error && (
                <p className="text-xs text-muted-foreground">
                  Signature error: {result.error}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full verification failed
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 cursor-default border-red-500/50 bg-red-500/10 text-red-600',
              className
            )}
          >
            <ShieldAlert className="h-3 w-3" />
            <span className="hidden sm:inline">Invalid</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1 text-sm">
            <p className="font-medium text-red-600">Signature Invalid</p>
            <p className="text-xs text-muted-foreground">
              The file signature could not be verified. The file may have been modified.
            </p>
            {result.error && (
              <p className="text-xs text-destructive">{result.error}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

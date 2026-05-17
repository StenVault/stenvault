/**
 * UploadResumeBanner Component
 *
 * Surfaces interrupted multipart uploads stored in IndexedDB so the user can
 * resume them by re-picking the original file. The encryption seed (file key,
 * baseIv, KEM ciphertext, optional signature) is replayed verbatim so the
 * re-encrypted bytes match the parts already in R2 — only missing parts are
 * re-uploaded.
 *
 * The user must pick the same file: name + size + lastModified all have to
 * match. The hook's `resumeUpload` enforces this at runtime; this component
 * just opens the file picker.
 */

import { useRef, useState } from 'react';
import { Upload, X, Lock } from 'lucide-react';
import { Button } from '@stenvault/shared/ui/button';
import { formatBytes } from '@stenvault/shared/utils/format';
import type { VaultUploadResumeRecordView } from '@/lib/uploadResume';

interface UploadResumeBannerProps {
    records: VaultUploadResumeRecordView[];
    onResume: (record: VaultUploadResumeRecordView, file: File) => Promise<void>;
    onDismiss: (serverFileId: number) => Promise<void>;
    /** False when the vault is locked — Resume is disabled because we can't
     *  unwrap the persisted seed without the master key. */
    vaultUnlocked: boolean;
}

export function UploadResumeBanner({ records, onResume, onDismiss, vaultUnlocked }: UploadResumeBannerProps) {
    if (records.length === 0) return null;

    return (
        <div className="space-y-2">
            {records.map((record) => (
                <ResumeBannerRow
                    key={record.serverFileId}
                    record={record}
                    onResume={onResume}
                    onDismiss={onDismiss}
                    vaultUnlocked={vaultUnlocked}
                />
            ))}
        </div>
    );
}

interface ResumeBannerRowProps {
    record: VaultUploadResumeRecordView;
    onResume: (record: VaultUploadResumeRecordView, file: File) => Promise<void>;
    onDismiss: (serverFileId: number) => Promise<void>;
    vaultUnlocked: boolean;
}

function ResumeBannerRow({ record, onResume, onDismiss, vaultUnlocked }: ResumeBannerRowProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    const completed = record.completedParts.length;
    const total = record.totalParts;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0];
        e.target.value = '';
        if (!picked) return;
        setBusy(true);
        void onResume(record, picked).finally(() => setBusy(false));
    };

    const handleDismiss = () => {
        if (busy) return;
        if (!confirm(`Discard the unfinished upload of "${record.file.name}"? This cancels it on the server.`)) {
            return;
        }
        setBusy(true);
        void onDismiss(record.serverFileId).finally(() => setBusy(false));
    };

    const resumeDisabled = busy || !vaultUnlocked;
    const resumeTitle = vaultUnlocked
        ? undefined
        : 'Unlock your vault to resume this upload';

    return (
        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-elevated)] p-3 flex items-center gap-3">
            {vaultUnlocked
                ? <Upload className="h-5 w-5 shrink-0 text-[var(--theme-accent)]" aria-hidden="true" />
                : <Lock className="h-5 w-5 shrink-0 text-[var(--theme-fg-muted)]" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                    Resume upload of <span className="font-mono">{record.file.name}</span>
                </div>
                <div className="text-xs text-[var(--theme-fg-muted)]">
                    {formatBytes(record.file.size)} · {percentage > 0 ? `~${percentage}% done` : 'just started'}
                    {' · '}
                    {vaultUnlocked ? 'pick the original file to continue' : 'unlock your vault to continue'}
                </div>
            </div>
            <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={resumeDisabled}
                title={resumeTitle}
                aria-label={vaultUnlocked
                    ? `Resume upload of ${record.file.name}`
                    : `Unlock vault to resume upload of ${record.file.name}`}
            >
                {busy ? 'Working…' : 'Resume'}
            </Button>
            <Button
                size="icon"
                variant="ghost"
                onClick={handleDismiss}
                disabled={busy}
                aria-label={`Discard unfinished upload of ${record.file.name}`}
            >
                <X className="h-4 w-4" />
            </Button>
            <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                onChange={handlePick}
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}

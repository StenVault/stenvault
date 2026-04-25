/**
 * Entry point for changing the Encryption Password from Security Settings.
 *
 * Shown only when the user has configured an Encryption Password (otherwise
 * there is nothing to change — the EncryptionSetup flow handles first-time
 * setup). Opens ChangeEncryptionPasswordDialog.
 */

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { AuroraCard } from '@stenvault/shared/ui/aurora-card';
import { Button } from '@stenvault/shared/ui/button';
import { trpc } from '@/lib/trpc';
import { ChangeEncryptionPasswordDialog } from './ChangeEncryptionPasswordDialog';

export function EncryptionPasswordSection() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { data: status } = trpc.encryption.getMasterKeyStatus.useQuery();

    if (!status?.isConfigured) {
        return null;
    }

    return (
        <>
            <AuroraCard variant="default">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-[var(--theme-bg-elevated)] shrink-0">
                            <KeyRound className="w-6 h-6 text-[var(--theme-fg-muted)]" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-foreground">Encryption Password</h3>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Your Encryption Password passes through Argon2id to derive the
                                key that unwraps your Master Key. Changing it keeps your files,
                                recovery codes, and Trusted Circle intact unless you ask otherwise.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialogOpen(true)}
                    >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Change Encryption Password
                    </Button>
                </div>
            </AuroraCard>

            <ChangeEncryptionPasswordDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
        </>
    );
}

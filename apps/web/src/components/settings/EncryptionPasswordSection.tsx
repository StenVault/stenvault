/**
 * Entry point for changing the Encryption Password from Security Settings.
 *
 * Shown only when the user has configured an Encryption Password (otherwise
 * there is nothing to change — the EncryptionSetup flow handles first-time
 * setup). Opens ChangeEncryptionPasswordDialog.
 */

import { useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { SectionCard } from '@stenvault/shared/ui/section-card';
import { Button } from '@stenvault/shared/ui/button';
import { trpc } from '@/lib/trpc';
import { useTheme } from '@/contexts/ThemeContext';
import { ChangeEncryptionPasswordDialog } from './ChangeEncryptionPasswordDialog';

export function EncryptionPasswordSection() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { data: status } = trpc.encryption.getMasterKeyStatus.useQuery();
    const { theme } = useTheme();

    if (!status?.isConfigured) {
        return null;
    }

    return (
        <>
            {/* Gold-tinted icon + warning caption mirrors the RecoveryCodes card.
                Encodes "this is the load-bearing client-only secret"; the
                neutral muted Lock icon on PasswordChangeSection encodes
                "server-recoverable credential". The two cards stop reading
                as duplicates without needing a separate hub page. */}
            <SectionCard
                icon={KeyRound}
                iconStyle={{ color: theme.brand.primary }}
                title="Encryption Password"
                description={
                    <>
                        <p className="text-sm text-muted-foreground">
                            Unlocks your files. Never sent to our servers.
                        </p>
                        <p className="inline-flex items-center gap-1 text-xs text-[var(--theme-warning)] mt-2">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Forgetting this without saved recovery codes is permanent.
                        </p>
                    </>
                }
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialogOpen(true)}
                    >
                        <KeyRound className="mr-2 h-4 w-4" />
                        Change Encryption Password
                    </Button>
                }
            />

            <ChangeEncryptionPasswordDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
        </>
    );
}

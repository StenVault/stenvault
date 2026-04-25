/**
 * Entry point for changing the Encryption Password from Security Settings.
 *
 * Shown only when the user has configured an Encryption Password (otherwise
 * there is nothing to change — the EncryptionSetup flow handles first-time
 * setup). Opens ChangeEncryptionPasswordDialog.
 */

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@stenvault/shared/ui/card';
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
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
                                <KeyRound className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                            </div>
                            <div className="min-w-0">
                                <CardTitle>Encryption Password</CardTitle>
                                <CardDescription>
                                    Change the password that unlocks your vault. Your files, recovery codes,
                                    and Trusted Circle stay intact unless you ask otherwise.
                                </CardDescription>
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
                </CardHeader>
            </Card>

            <ChangeEncryptionPasswordDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
        </>
    );
}

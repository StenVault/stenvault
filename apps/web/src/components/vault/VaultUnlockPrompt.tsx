/**
 * VaultUnlockPrompt
 *
 * Overlay shown when an organization vault is locked.
 * Requires personal vault unlocked first, then unlocks org vault.
 */

import { useState, useCallback } from 'react';
import { Shield, Lock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from '@stenvault/shared/lib/toast';
import { toUserMessage } from '@/lib/errorMessages';
import { Button } from '@stenvault/shared/ui/button';
import { useMasterKey } from '@/hooks/useMasterKey';
import { useOrgMasterKey } from '@/hooks/useOrgMasterKey';
import { useTheme } from '@/contexts/ThemeContext';

interface VaultUnlockPromptProps {
    orgId: number;
    orgName: string;
    onUnlocked: () => void;
    onUnlockPersonalVault: () => void;
}

export function VaultUnlockPrompt({
    orgId,
    orgName,
    onUnlocked,
    onUnlockPersonalVault,
}: VaultUnlockPromptProps) {
    const { theme } = useTheme();
    const { isUnlocked: personalUnlocked } = useMasterKey();
    const { unlockOrgVault, isOrgUnlocked } = useOrgMasterKey();
    const [isUnlocking, setIsUnlocking] = useState(false);

    const handleUnlock = useCallback(async () => {
        if (!personalUnlocked) {
            onUnlockPersonalVault();
            return;
        }

        setIsUnlocking(true);
        try {
            await unlockOrgVault(orgId);
            toast.success(`${orgName} vault unlocked`);
            onUnlocked();
        } catch (err) {
            const { description } = toUserMessage(err);
            toast.error('Failed to unlock vault', { description });
        } finally {
            setIsUnlocking(false);
        }
    }, [personalUnlocked, orgId, orgName, unlockOrgVault, onUnlocked, onUnlockPersonalVault]);

    if (isOrgUnlocked(orgId)) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-background/80 rounded-lg"
        >
            <div className="text-center p-8 max-w-md">
                <motion.div
                    className="mx-auto mb-6 h-16 w-16 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${theme.brand.primary}15` }}
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                    <Shield className="h-8 w-8" style={{ color: theme.brand.primary }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2">
                    {orgName} Vault Locked
                </h2>
                <p className="text-muted-foreground mb-6">
                    {personalUnlocked
                        ? 'This organization vault is encrypted. Unlock it to access shared files.'
                        : 'Unlock your personal vault first, then unlock the organization vault.'}
                </p>
                <Button
                    onClick={handleUnlock}
                    size="lg"
                    className="gap-2"
                    disabled={isUnlocking}
                >
                    {isUnlocking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Lock className="h-4 w-4" />
                    )}
                    {personalUnlocked ? 'Unlock Vault' : 'Unlock Personal Vault First'}
                </Button>
            </div>
        </motion.div>
    );
}

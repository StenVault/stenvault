import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VaultUnlockModal } from '@/components/VaultUnlockModal';

export function InlineUnlockPrompt() {
    const [showUnlockModal, setShowUnlockModal] = useState(false);

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4 px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(212,175,55,0.12)]">
                <Lock className="h-8 w-8 text-[rgb(212,175,55)]" />
            </div>
            <h2 className="text-white text-lg font-medium">Vault is locked</h2>
            <p className="text-white/70 text-sm text-center max-w-sm">
                Unlock your vault to preview this file.
            </p>
            <Button
                variant="default"
                onClick={() => setShowUnlockModal(true)}
                className="mt-2"
            >
                Unlock vault
            </Button>

            <VaultUnlockModal
                isOpen={showUnlockModal}
                onUnlock={() => setShowUnlockModal(false)}
                onClose={() => setShowUnlockModal(false)}
            />
        </div>
    );
}

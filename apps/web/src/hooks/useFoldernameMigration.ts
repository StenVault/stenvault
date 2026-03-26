/**
 * useFoldernameMigration Hook
 *
 * Phase C Zero-Knowledge: Migrates existing plaintext folder names to encrypted.
 * Runs once on vault unlock if there are folders with encryptedName === null.
 */

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from './useMasterKey';
import { encryptFilename } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import { toast } from 'sonner';

export function useFoldernameMigration() {
    const { isUnlocked, isConfigured, deriveFoldernameKey } = useMasterKey();
    const utils = trpc.useUtils();
    const renameFolder = trpc.folders.rename.useMutation();
    const { data: allFolders } = trpc.folders.list.useQuery({});
    const migratingRef = useRef(false);

    useEffect(() => {
        if (!isConfigured || !isUnlocked || !allFolders || migratingRef.current) return;

        const unencryptedFolders = allFolders.filter(
            f => !(f as any).encryptedName && f.name !== 'Folder'
        );

        if (unencryptedFolders.length === 0) return;

        migratingRef.current = true;

        const migrate = async () => {
            try {
                debugLog('[DECRYPT]', `Migrating ${unencryptedFolders.length} folder names to encrypted...`);
                const toastId = toast.loading('Securing folder names...');

                const foldernameKey = await deriveFoldernameKey();

                let migrated = 0;
                for (const folder of unencryptedFolders) {
                    try {
                        const { encryptedFilename: encryptedName, iv: nameIv } = await encryptFilename(folder.name, foldernameKey);
                        await renameFolder.mutateAsync({
                            folderId: folder.id,
                            newName: 'Folder',
                            encryptedName,
                            nameIv,
                        });
                        migrated++;
                    } catch (error) {
                        debugWarn('[DECRYPT]', `Failed to migrate folder ${folder.id} name`, error);
                    }
                }

                await utils.folders.list.invalidate();

                toast.dismiss(toastId);
                if (migrated > 0) {
                    debugLog('[DECRYPT]', `Successfully migrated ${migrated}/${unencryptedFolders.length} folder names`);
                }
            } catch (error) {
                debugWarn('[DECRYPT]', 'Folder name migration failed', error);
            } finally {
                migratingRef.current = false;
            }
        };

        migrate();
    }, [isConfigured, isUnlocked, allFolders, deriveFoldernameKey, renameFolder, utils]);
}

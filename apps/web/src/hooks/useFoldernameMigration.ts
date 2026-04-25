/**
 * One-shot migration on vault unlock: encrypts any folders that still
 * have plaintext names (encryptedName === null).
 */

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useMasterKey } from './useMasterKey';
import { encryptFilename } from '@/lib/fileCrypto';
import { debugLog, debugWarn } from '@/lib/debugLogger';
import { toast } from '@/lib/toast';

export function useFoldernameMigration() {
    const { isUnlocked, isConfigured, deriveFoldernameKey } = useMasterKey();
    const utils = trpc.useUtils();
    const renameFolder = trpc.folders.rename.useMutation();
    const { data: allFolders } = trpc.folders.list.useQuery({});
    const migratingRef = useRef(false);

    useEffect(() => {
        if (!isConfigured || !isUnlocked || !allFolders || migratingRef.current) return;

        // Find folders that need migration (have no encryptedName)
        const unencryptedFolders = allFolders.filter(
            f => !(f as any).encryptedName && f.name !== 'Folder'
        );

        if (unencryptedFolders.length === 0) return;

        migratingRef.current = true;

        const migrate = async () => {
            try {
                debugLog('[decrypt]', `Migrating ${unencryptedFolders.length} folder names to encrypted...`);
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
                        debugWarn('[decrypt]', `Failed to migrate folder ${folder.id} name`, error);
                    }
                }

                // Invalidate folder queries to refresh with encrypted data
                await utils.folders.list.invalidate();

                toast.dismiss(toastId);
                if (migrated > 0) {
                    debugLog('[decrypt]', `Successfully migrated ${migrated}/${unencryptedFolders.length} folder names`);
                }
            } catch (error) {
                debugWarn('[decrypt]', 'Folder name migration failed', error);
            } finally {
                migratingRef.current = false;
            }
        };

        migrate();
    }, [isConfigured, isUnlocked, allFolders, deriveFoldernameKey, renameFolder, utils]);
}

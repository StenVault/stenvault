/**
 * DataExportSection — "Download your data" card.
 *
 * Lives under Account (ProfileGroup) because export is a data-ownership /
 * portability concern, not a billing one. Every product the team picked as
 * reference (Proton, Google, GitHub, Notion, Apple) places export under
 * Account, never under Billing — and for a zero-knowledge vault the
 * "you can leave with your files at any time" promise belongs next to the
 * identity it's tied to, not next to the invoice page.
 *
 * The actual export pipeline (chunked download, decrypt-locally, ZIP
 * stream) lives in DataExportDialog; this component is the surface that
 * launches it.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AuroraCard } from '@stenvault/shared/ui/aurora-card';
import { Button } from '@stenvault/shared/ui/button';
import { DataExportDialog } from './DataExportDialog';

export function DataExportSection() {
    const [exportOpen, setExportOpen] = useState(false);

    return (
        <>
            <AuroraCard variant="default">
                <div className="mb-4">
                    <h3 className="font-semibold text-foreground">Download your data</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Export every file in your vault as a ZIP archive
                    </p>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/10">
                    <div className="flex items-center gap-3">
                        <Download className="w-5 h-5 text-[var(--theme-primary)]" />
                        <div>
                            <p className="font-medium">Export Vault</p>
                            <p className="text-sm text-muted-foreground">
                                Decrypted locally by your browser before being added to the ZIP
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExportOpen(true)}
                    >
                        Export Data
                    </Button>
                </div>
            </AuroraCard>

            <DataExportDialog open={exportOpen} onOpenChange={setExportOpen} />
        </>
    );
}

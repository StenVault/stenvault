/**
 * Web Download Provider
 *
 * Implementation of DownloadProvider using DOM APIs.
 * Uses createObjectURL and anchor element click for downloads.
 */

import type {
    DownloadProvider,
    DownloadOptions,
    DownloadResult,
} from '@stenvault/shared/platform/download';

// ============ Web Download Provider Implementation ============

class WebDownloadProvider implements DownloadProvider {
    isAvailable(): boolean {
        return typeof document !== 'undefined' && typeof URL !== 'undefined';
    }

    async downloadBlob(blob: Blob, options: DownloadOptions): Promise<DownloadResult> {
        if (!this.isAvailable()) {
            return { success: false, error: 'Download not available in this environment' };
        }

        try {
            const url = URL.createObjectURL(blob);
            this.triggerDownload(url, options.filename);
            URL.revokeObjectURL(url);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Download failed',
            };
        }
    }

    async downloadBase64(base64Data: string, options: DownloadOptions): Promise<DownloadResult> {
        if (!this.isAvailable()) {
            return { success: false, error: 'Download not available in this environment' };
        }

        try {
            // Decode base64 to binary
            const binaryData = atob(base64Data);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: options.mimeType || 'application/octet-stream' });
            return this.downloadBlob(blob, options);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Base64 decode failed',
            };
        }
    }

    async downloadUrl(url: string, options: DownloadOptions): Promise<DownloadResult> {
        if (!this.isAvailable()) {
            return { success: false, error: 'Download not available in this environment' };
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                return { success: false, error: `HTTP error: ${response.status}` };
            }

            const blob = await response.blob();
            return this.downloadBlob(blob, options);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Download failed',
            };
        }
    }

    /**
     * Trigger browser download via anchor element
     */
    private triggerDownload(url: string, filename: string): void {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ============ Singleton Instance ============

let downloadProviderInstance: WebDownloadProvider | null = null;

/**
 * Get the singleton WebDownloadProvider instance
 */
export function getDownloadProvider(): DownloadProvider {
    if (!downloadProviderInstance) {
        downloadProviderInstance = new WebDownloadProvider();
    }
    return downloadProviderInstance;
}

/**
 * Create a new WebDownloadProvider instance (for testing)
 */
export function createDownloadProvider(): DownloadProvider {
    return new WebDownloadProvider();
}

// ============ Convenience Functions ============

/**
 * Download a file from Base64 data
 */
export async function downloadBase64File(
    base64Data: string,
    filename: string,
    mimeType?: string
): Promise<DownloadResult> {
    return getDownloadProvider().downloadBase64(base64Data, { filename, mimeType });
}

/**
 * Download a file from a Blob
 */
export async function downloadBlobFile(
    blob: Blob,
    filename: string
): Promise<DownloadResult> {
    return getDownloadProvider().downloadBlob(blob, { filename });
}

// Export class
export { WebDownloadProvider };

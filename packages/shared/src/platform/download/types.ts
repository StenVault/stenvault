/**
 * Download Provider Interface
 *
 * Platform-agnostic file download abstraction.
 * Implementations:
 * - Web: Uses DOM APIs (createObjectURL, anchor element click)
 * - React Native: Uses expo-file-system or react-native-fs
 */


/**
 * Download options
 */
export interface DownloadOptions {
    /** Filename for the downloaded file */
    filename: string;
    /** MIME type of the content */
    mimeType?: string;
}

/**
 * Download result - discriminated union for compile-time safety
 * Prevents invalid states like {success: true, error: "x"}
 */
export type DownloadResult =
    | { success: true }
    | { success: false; error: string };


/**
 * Download Provider Interface
 */
export interface DownloadProvider {
    /**
     * Check if downloads are available on this platform
     */
    isAvailable(): boolean;

    /**
     * Download a file from a Blob
     * @param blob - Blob containing file data
     * @param options - Download options
     */
    downloadBlob(blob: Blob, options: DownloadOptions): Promise<DownloadResult>;

    /**
     * Download a file from Base64 encoded data
     * @param base64Data - Base64 encoded content
     * @param options - Download options
     */
    downloadBase64(base64Data: string, options: DownloadOptions): Promise<DownloadResult>;

    /**
     * Download a file from a URL
     * @param url - URL to download from
     * @param options - Download options
     */
    downloadUrl(url: string, options: DownloadOptions): Promise<DownloadResult>;
}

/**
 * Factory function type for creating download providers
 */
export type DownloadProviderFactory = () => DownloadProvider;

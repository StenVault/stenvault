/**
 * Generates thumbnails client-side with the Canvas API so the server
 * never sees plaintext pixels. Output is WebP for a good size/quality
 * trade-off.
 */

// ===== CONSTANTS =====

/** Maximum dimension for thumbnails (pixels) */
export const THUMBNAIL_MAX_SIZE = 400;

/** WebP quality (0-1) - 80% is a good balance */
export const THUMBNAIL_QUALITY = 0.8;

/** Supported image MIME types */
export const SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/bmp',
] as const;

/** Supported video MIME types */
export const SUPPORTED_VIDEO_TYPES = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
] as const;

// ===== TYPES =====

export interface ThumbnailResult {
    /** Generated thumbnail as Blob (WebP format) */
    blob: Blob;
    /** Width of the thumbnail in pixels */
    width: number;
    /** Height of the thumbnail in pixels */
    height: number;
    /** Size of the blob in bytes */
    size: number;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Check if a MIME type supports thumbnail generation
 */
export function isThumbnailSupported(mimeType: string): boolean {
    return (
        (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType) ||
        (SUPPORTED_VIDEO_TYPES as readonly string[]).includes(mimeType)
    );
}

/**
 * Check if the MIME type is an image
 */
export function isImageType(mimeType: string): boolean {
    return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Check if the MIME type is a video
 */
export function isVideoType(mimeType: string): boolean {
    return (SUPPORTED_VIDEO_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Calculate resize dimensions maintaining aspect ratio
 */
export function calculateResizeDimensions(
    originalWidth: number,
    originalHeight: number,
    maxSize: number
): { width: number; height: number } {
    if (originalWidth <= maxSize && originalHeight <= maxSize) {
        return { width: originalWidth, height: originalHeight };
    }

    const aspectRatio = originalWidth / originalHeight;

    if (originalWidth > originalHeight) {
        return {
            width: maxSize,
            height: Math.round(maxSize / aspectRatio),
        };
    } else {
        return {
            width: Math.round(maxSize * aspectRatio),
            height: maxSize,
        };
    }
}

/**
 * Load an image from a File object
 */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

/**
 * Convert canvas to WebP blob
 */
function canvasToWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert canvas to WebP'));
                }
            },
            'image/webp',
            quality
        );
    });
}

// ===== MAIN FUNCTIONS =====

/**
 * Generate thumbnail for an image file
 *
 * @param file - Image file to generate thumbnail from
 * @returns ThumbnailResult with WebP blob and dimensions
 */
export async function generateImageThumbnail(file: File): Promise<ThumbnailResult> {
    // Load image
    const img = await loadImage(file);

    // Calculate dimensions maintaining aspect ratio
    const { width, height } = calculateResizeDimensions(
        img.naturalWidth,
        img.naturalHeight,
        THUMBNAIL_MAX_SIZE
    );

    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas 2D context');
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw the image
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to WebP
    const blob = await canvasToWebP(canvas, THUMBNAIL_QUALITY);

    return {
        blob,
        width,
        height,
        size: blob.size,
    };
}

/**
 * Generate thumbnail for a video file
 *
 * Captures a frame at 25% of the video duration (or first frame if that fails)
 *
 * @param file - Video file to generate thumbnail from
 * @returns ThumbnailResult with WebP blob and dimensions
 */
export async function generateVideoThumbnail(file: File): Promise<ThumbnailResult> {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const url = URL.createObjectURL(file);

    try {
        // Load video metadata
        await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Failed to load video metadata'));
            video.src = url;
        });

        // Seek to 25% of duration (or 0 if duration is unknown)
        const seekTime = video.duration > 0 ? video.duration * 0.25 : 0;

        // Wait for seeked event
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Video seek timeout'));
            }, 10000); // 10 second timeout

            video.onseeked = () => {
                clearTimeout(timeout);
                resolve();
            };

            video.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Video seek failed'));
            };

            video.currentTime = seekTime;
        });

        // Calculate dimensions
        const { width, height } = calculateResizeDimensions(
            video.videoWidth,
            video.videoHeight,
            THUMBNAIL_MAX_SIZE
        );

        // Create canvas and draw video frame
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get canvas 2D context');
        }

        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw the video frame
        ctx.drawImage(video, 0, 0, width, height);

        // Convert to WebP
        const blob = await canvasToWebP(canvas, THUMBNAIL_QUALITY);

        return {
            blob,
            width,
            height,
            size: blob.size,
        };
    } finally {
        // Cleanup
        URL.revokeObjectURL(url);
        video.src = '';
        video.load(); // Reset video element
    }
}

/**
 * Generate thumbnail for any supported file type
 *
 * Automatically detects file type and uses appropriate generator
 *
 * @param file - File to generate thumbnail from
 * @returns ThumbnailResult or null if not supported
 */
export async function generateThumbnail(file: File): Promise<ThumbnailResult | null> {
    const mimeType = file.type;

    if (!isThumbnailSupported(mimeType)) {
        return null;
    }

    if (isImageType(mimeType)) {
        return generateImageThumbnail(file);
    }

    if (isVideoType(mimeType)) {
        return generateVideoThumbnail(file);
    }

    return null;
}

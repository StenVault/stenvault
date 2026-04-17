/**
 * Pure-logic tests for the thumbnail generator — no DOM needed.
 */

import { describe, it, expect } from 'vitest';
import {
    THUMBNAIL_MAX_SIZE,
    THUMBNAIL_QUALITY,
    SUPPORTED_IMAGE_TYPES,
    SUPPORTED_VIDEO_TYPES,
    isThumbnailSupported,
    isImageType,
    isVideoType,
} from './thumbnailGenerator';

describe('thumbnailGenerator', () => {
    describe('Constants', () => {
        it('should have THUMBNAIL_MAX_SIZE of 400', () => {
            expect(THUMBNAIL_MAX_SIZE).toBe(400);
        });

        it('should have THUMBNAIL_QUALITY of 0.8', () => {
            expect(THUMBNAIL_QUALITY).toBe(0.8);
        });

        it('should have correct supported image types', () => {
            expect(SUPPORTED_IMAGE_TYPES).toContain('image/jpeg');
            expect(SUPPORTED_IMAGE_TYPES).toContain('image/png');
            expect(SUPPORTED_IMAGE_TYPES).toContain('image/webp');
            expect(SUPPORTED_IMAGE_TYPES).toContain('image/gif');
        });

        it('should have correct supported video types', () => {
            expect(SUPPORTED_VIDEO_TYPES).toContain('video/mp4');
            expect(SUPPORTED_VIDEO_TYPES).toContain('video/webm');
        });
    });

    describe('isThumbnailSupported', () => {
        describe('should return true for supported image types', () => {
            it.each([
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',
                'image/bmp',
                'image/avif',
            ])('%s', (mimeType) => {
                expect(isThumbnailSupported(mimeType)).toBe(true);
            });
        });

        describe('should return true for supported video types', () => {
            it.each([
                'video/mp4',
                'video/webm',
                'video/quicktime',
                'video/x-m4v',
            ])('%s', (mimeType) => {
                expect(isThumbnailSupported(mimeType)).toBe(true);
            });
        });

        describe('should return false for unsupported types', () => {
            it.each([
                'application/pdf',
                'text/plain',
                'audio/mpeg',
                'application/zip',
                'image/svg+xml', // SVG not supported
                'application/octet-stream',
                '',
            ])('%s', (mimeType) => {
                expect(isThumbnailSupported(mimeType)).toBe(false);
            });
        });
    });

    describe('isImageType', () => {
        it('should return true for JPEG', () => {
            expect(isImageType('image/jpeg')).toBe(true);
        });

        it('should return true for PNG', () => {
            expect(isImageType('image/png')).toBe(true);
        });

        it('should return true for WebP', () => {
            expect(isImageType('image/webp')).toBe(true);
        });

        it('should return false for video types', () => {
            expect(isImageType('video/mp4')).toBe(false);
        });

        it('should return false for audio types', () => {
            expect(isImageType('audio/mpeg')).toBe(false);
        });

        it('should return false for documents', () => {
            expect(isImageType('application/pdf')).toBe(false);
        });
    });

    describe('isVideoType', () => {
        it('should return true for MP4', () => {
            expect(isVideoType('video/mp4')).toBe(true);
        });

        it('should return true for WebM', () => {
            expect(isVideoType('video/webm')).toBe(true);
        });

        it('should return true for QuickTime', () => {
            expect(isVideoType('video/quicktime')).toBe(true);
        });

        it('should return false for image types', () => {
            expect(isVideoType('image/jpeg')).toBe(false);
        });

        it('should return false for audio types', () => {
            expect(isVideoType('audio/mpeg')).toBe(false);
        });

        it('should return false for documents', () => {
            expect(isVideoType('application/pdf')).toBe(false);
        });
    });
});

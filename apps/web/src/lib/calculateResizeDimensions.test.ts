/**
 * Tests the dimension calculation logic for thumbnail resizing:
 * landscape, portrait, square, already-small, and extreme aspect ratios.
 */

import { describe, it, expect } from 'vitest';
import { calculateResizeDimensions, THUMBNAIL_MAX_SIZE } from './thumbnailGenerator';

describe('calculateResizeDimensions', () => {
    const MAX = THUMBNAIL_MAX_SIZE; // 400

    describe('images already within bounds', () => {
        it('should return original dimensions when both are under maxSize', () => {
            expect(calculateResizeDimensions(200, 150, MAX)).toEqual({ width: 200, height: 150 });
        });

        it('should return original dimensions when exactly at maxSize', () => {
            expect(calculateResizeDimensions(400, 400, MAX)).toEqual({ width: 400, height: 400 });
        });

        it('should return original dimensions for small square', () => {
            expect(calculateResizeDimensions(100, 100, MAX)).toEqual({ width: 100, height: 100 });
        });

        it('should return original for 1x1 pixel image', () => {
            expect(calculateResizeDimensions(1, 1, MAX)).toEqual({ width: 1, height: 1 });
        });
    });

    describe('landscape images (width > height)', () => {
        it('should scale down width to maxSize and compute height', () => {
            const result = calculateResizeDimensions(800, 600, MAX);
            expect(result.width).toBe(MAX);
            expect(result.height).toBe(Math.round(MAX / (800 / 600))); // 300
        });

        it('should handle 2:1 aspect ratio', () => {
            const result = calculateResizeDimensions(1000, 500, MAX);
            expect(result.width).toBe(MAX);
            expect(result.height).toBe(200);
        });

        it('should handle 16:9 aspect ratio', () => {
            const result = calculateResizeDimensions(1920, 1080, MAX);
            expect(result.width).toBe(MAX);
            expect(result.height).toBe(Math.round(MAX / (1920 / 1080))); // 225
        });

        it('should handle when only width exceeds maxSize', () => {
            const result = calculateResizeDimensions(800, 300, MAX);
            expect(result.width).toBe(MAX);
            expect(result.height).toBe(Math.round(MAX / (800 / 300))); // 150
        });
    });

    describe('portrait images (height > width)', () => {
        it('should scale down height to maxSize and compute width', () => {
            const result = calculateResizeDimensions(600, 800, MAX);
            expect(result.height).toBe(MAX);
            expect(result.width).toBe(Math.round(MAX * (600 / 800))); // 300
        });

        it('should handle 1:2 aspect ratio', () => {
            const result = calculateResizeDimensions(500, 1000, MAX);
            expect(result.height).toBe(MAX);
            expect(result.width).toBe(200);
        });

        it('should handle 9:16 aspect ratio', () => {
            const result = calculateResizeDimensions(1080, 1920, MAX);
            expect(result.height).toBe(MAX);
            expect(result.width).toBe(Math.round(MAX * (1080 / 1920))); // 225
        });

        it('should handle when only height exceeds maxSize', () => {
            const result = calculateResizeDimensions(300, 800, MAX);
            expect(result.height).toBe(MAX);
            expect(result.width).toBe(Math.round(MAX * (300 / 800))); // 150
        });
    });

    describe('square images', () => {
        it('should scale square image to maxSize x maxSize', () => {
            // Square where width === height falls into else branch (height = maxSize)
            const result = calculateResizeDimensions(800, 800, MAX);
            expect(result.height).toBe(MAX);
            expect(result.width).toBe(Math.round(MAX * (800 / 800))); // 400
        });

        it('should handle large square', () => {
            const result = calculateResizeDimensions(4000, 4000, MAX);
            expect(result.width).toBe(MAX);
            expect(result.height).toBe(MAX);
        });
    });

    describe('extreme aspect ratios', () => {
        it('should handle very wide panorama (10000:1)', () => {
            const result = calculateResizeDimensions(10000, 1, MAX);
            expect(result.width).toBe(MAX);
            // 400 / (10000/1) = 0.04 → Math.round → 0
            expect(result.height).toBe(0);
        });

        it('should handle very tall strip (1:10000)', () => {
            const result = calculateResizeDimensions(1, 10000, MAX);
            expect(result.height).toBe(MAX);
            // 400 * (1/10000) = 0.04 → Math.round → 0
            expect(result.width).toBe(0);
        });

        it('should handle moderately extreme landscape (20:1)', () => {
            const result = calculateResizeDimensions(2000, 100, MAX);
            expect(result.width).toBe(MAX);
            expect(result.height).toBe(Math.round(MAX / (2000 / 100))); // 20
            expect(result.height).toBeGreaterThan(0);
        });

        it('should handle moderately extreme portrait (1:20)', () => {
            const result = calculateResizeDimensions(100, 2000, MAX);
            expect(result.height).toBe(MAX);
            expect(result.width).toBe(Math.round(MAX * (100 / 2000))); // 20
            expect(result.width).toBeGreaterThan(0);
        });
    });

    describe('custom maxSize parameter', () => {
        it('should work with smaller maxSize', () => {
            const result = calculateResizeDimensions(800, 600, 200);
            expect(result.width).toBe(200);
            expect(result.height).toBe(Math.round(200 / (800 / 600))); // 150
        });

        it('should work with larger maxSize', () => {
            const result = calculateResizeDimensions(800, 600, 1000);
            // Both dimensions are under 1000, so return original
            expect(result).toEqual({ width: 800, height: 600 });
        });
    });
});

/**
 * Hero Particle System — Pure functions for Canvas 2D particle network
 *
 * Features: drift, mouse attraction, connection lines, text-morph nodes.
 * Uses spatial grid for O(n*k) connection lookups instead of O(n^2).
 */

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
}

export interface TextNode {
    x: number;
    y: number;
    plainText: string;
    cipherText: string;
    progress: number; // 0 = plain, 1 = cipher
    direction: 1 | -1;
    lastSwitch: number;
}

interface HeroConfig {
    particleCount: number;
    connectionDistance: number;
    mouseRadius: number;
    particleSpeed: number;
    particleSize: { min: number; max: number };
    connectionOpacity: number;
}

const TEXT_NODE_LABELS = [
    { plain: 'photos.jpg', cipher: '7f3a9c...e2b1' },
    { plain: 'document.pdf', cipher: 'a91d4b...8f73' },
    { plain: 'backup.zip', cipher: 'c4e7f2...1a06' },
    { plain: 'notes.txt', cipher: 'e8b52d...9c44' },
];

const HEX_CHARS = '0123456789abcdef';

function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

export function createParticles(
    width: number,
    height: number,
    config: HeroConfig,
): Particle[] {
    const particles: Particle[] = [];
    for (let i = 0; i < config.particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * config.particleSpeed * 2,
            vy: (Math.random() - 0.5) * config.particleSpeed * 2,
            size: randomRange(config.particleSize.min, config.particleSize.max),
            opacity: randomRange(0.3, 0.8),
        });
    }
    return particles;
}

export function createTextNodes(width: number, height: number): TextNode[] {
    const count = Math.min(TEXT_NODE_LABELS.length, width < 768 ? 2 : 4);
    const nodes: TextNode[] = [];
    const margin = 100;
    const usableW = width - margin * 2;
    const usableH = height - margin * 2;

    // Fixed corner positions to keep text nodes away from centered content.
    // Each slot targets a specific corner/edge of the viewport.
    const slots = [
        { xMin: 0.05, xMax: 0.25, yMin: 0.0, yMax: 0.08 },   // top-left
        { xMin: 0.70, xMax: 0.90, yMin: 0.0, yMax: 0.08 },   // top-right
        { xMin: 0.05, xMax: 0.25, yMin: 0.88, yMax: 0.96 },  // bottom-left
        { xMin: 0.70, xMax: 0.90, yMin: 0.88, yMax: 0.96 },  // bottom-right
    ];

    for (let i = 0; i < count; i++) {
        const label = TEXT_NODE_LABELS[i]!;
        const slot = slots[i]!;
        nodes.push({
            x: margin + randomRange(usableW * slot.xMin, usableW * slot.xMax),
            y: margin + randomRange(usableH * slot.yMin, usableH * slot.yMax),
            plainText: label.plain,
            cipherText: label.cipher,
            progress: 0,
            direction: 1,
            lastSwitch: performance.now() + i * 1000,
        });
    }
    return nodes;
}

export function updateParticles(
    particles: Particle[],
    width: number,
    height: number,
    mouseX: number,
    mouseY: number,
    mouseActive: boolean,
    config: HeroConfig,
): void {
    for (const p of particles) {
        // Mouse attraction (desktop only)
        if (mouseActive && mouseX > 0 && mouseY > 0) {
            const dx = mouseX - p.x;
            const dy = mouseY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < config.mouseRadius && dist > 0) {
                const force = (1 - dist / config.mouseRadius) * 0.02;
                p.vx += (dx / dist) * force;
                p.vy += (dy / dist) * force;
            }
        }

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Clamp speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = config.particleSpeed * 3;
        if (speed > maxSpeed) {
            p.vx = (p.vx / speed) * maxSpeed;
            p.vy = (p.vy / speed) * maxSpeed;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        else if (p.y > height + 10) p.y = -10;
    }
}

export function updateTextNodes(nodes: TextNode[], now: number): void {
    const CYCLE_MS = 4000;
    const SCRAMBLE_MS = 800;

    for (const node of nodes) {
        const elapsed = now - node.lastSwitch;
        if (elapsed > CYCLE_MS) {
            node.direction = node.direction === 1 ? -1 : 1;
            node.lastSwitch = now;
        }
        // Smooth transition
        const t = Math.min(elapsed / SCRAMBLE_MS, 1);
        node.progress =
            node.direction === 1
                ? t
                : 1 - t;
    }
}

function scrambleText(plain: string, cipher: string, progress: number): string {
    const len = Math.max(plain.length, cipher.length);
    let result = '';
    for (let i = 0; i < len; i++) {
        const plainChar = plain[i] ?? ' ';
        const cipherChar = cipher[i] ?? ' ';
        if (progress < 0.05) {
            result += plainChar;
        } else if (progress > 0.95) {
            result += cipherChar;
        } else {
            // Random scramble during transition
            result += HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)];
        }
    }
    return result;
}

// Spatial grid for fast neighbor lookup
function buildGrid(
    particles: Particle[],
    cellSize: number,
    width: number,
    height: number,
): Map<string, number[]> {
    const grid = new Map<string, number[]>();
    const cols = Math.ceil(width / cellSize);
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const cx = Math.floor(p.x / cellSize);
        const cy = Math.floor(p.y / cellSize);
        const key = cy * cols + cx;
        const k = String(key);
        const arr = grid.get(k);
        if (arr) arr.push(i);
        else grid.set(k, [i]);
    }
    return grid;
}

export function drawParticles(
    ctx: CanvasRenderingContext2D,
    particles: Particle[],
    textNodes: TextNode[],
    width: number,
    height: number,
    config: HeroConfig,
    accentColor: string,
    now: number,
): void {
    ctx.clearRect(0, 0, width, height);

    const cellSize = config.connectionDistance;
    const grid = buildGrid(particles, cellSize, width, height);
    const cols = Math.ceil(width / cellSize);
    const distSq = config.connectionDistance * config.connectionDistance;

    // Draw connections
    ctx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
        const a = particles[i]!;
        const cx = Math.floor(a.x / cellSize);
        const cy = Math.floor(a.y / cellSize);

        // Check neighboring cells
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = String((cy + dy) * cols + (cx + dx));
                const cell = grid.get(key);
                if (!cell) continue;
                for (const j of cell) {
                    if (j <= i) continue;
                    const b = particles[j]!;
                    const ddx = a.x - b.x;
                    const ddy = a.y - b.y;
                    const d2 = ddx * ddx + ddy * ddy;
                    if (d2 < distSq) {
                        const opacity =
                            (1 - Math.sqrt(d2) / config.connectionDistance) *
                            config.connectionOpacity;
                        ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
        }
    }

    // Draw particles
    for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129, 140, 248, ${p.opacity})`;
        ctx.fill();
    }

    // Draw text nodes
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const node of textNodes) {
        const text = scrambleText(node.plainText, node.cipherText, node.progress);
        const isEncrypted = node.progress > 0.5;

        // Background pill
        const metrics = ctx.measureText(text);
        const pw = metrics.width + 24;
        const ph = 28;
        ctx.fillStyle = isEncrypted
            ? 'rgba(99, 102, 241, 0.12)'
            : 'rgba(99, 102, 241, 0.06)';
        ctx.beginPath();
        ctx.roundRect(node.x - pw / 2, node.y - ph / 2, pw, ph, 6);
        ctx.fill();

        // Border
        ctx.strokeStyle = isEncrypted
            ? 'rgba(99, 102, 241, 0.3)'
            : 'rgba(99, 102, 241, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = isEncrypted
            ? accentColor
            : 'rgba(148, 163, 184, 0.8)';
        ctx.fillText(text, node.x, node.y);

        // Glow for encrypted text
        if (isEncrypted) {
            ctx.shadowColor = accentColor;
            ctx.shadowBlur = 8;
            ctx.fillText(text, node.x, node.y);
            ctx.shadowBlur = 0;
        }
    }
}

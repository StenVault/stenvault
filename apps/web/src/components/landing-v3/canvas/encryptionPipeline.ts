/**
 * Encryption Pipeline — Scroll-driven Canvas 2D visualization
 *
 * 5 nodes (File → Encrypt → Cloud → Decrypt → File) with colored
 * particles flowing between them, driven by scroll progress 0–1.
 */

export interface PipelineNode {
    x: number;
    y: number;
    label: string;
    icon: string;
    activated: boolean;
}

export interface PipelineParticle {
    segment: number; // 0–3 (between nodes)
    t: number; // 0–1 along segment
    size: number;
    speed: number;
}

interface PipelineState {
    nodes: PipelineNode[];
    particles: PipelineParticle[];
    activeSegments: number; // how many segments are "lit"
}

const NODE_LABELS = ['Your File', 'Encrypt', 'Secure Cloud', 'Decrypt', 'Your File'];
const NODE_ICONS = ['file', 'lock', 'cloud', 'unlock', 'check'];

const SEGMENT_COLORS = [
    [129, 140, 248],  // indigo-400 (plain → encrypting)
    [99, 102, 241],   // indigo-500 (encrypted)
    [67, 56, 202],    // indigo-700 (stored)
    [16, 185, 129],   // emerald-500 (decrypted)
];

export function initPipeline(width: number, height: number): PipelineState {
    const centerY = height / 2;
    const margin = width < 600 ? 40 : 80;
    const usableW = width - margin * 2;
    const spacing = usableW / 4;

    const nodes: PipelineNode[] = NODE_LABELS.map((label, i) => ({
        x: margin + spacing * i,
        y: centerY,
        label,
        icon: NODE_ICONS[i]!,
        activated: false,
    }));

    const particles: PipelineParticle[] = [];
    for (let seg = 0; seg < 4; seg++) {
        const count = 8;
        for (let i = 0; i < count; i++) {
            particles.push({
                segment: seg,
                t: i / count,
                size: 2 + Math.random() * 2,
                speed: 0.003 + Math.random() * 0.004,
            });
        }
    }

    return { nodes, particles, activeSegments: 0 };
}

export function updatePipeline(state: PipelineState, scrollProgress: number): void {
    // Each segment activates at 0.1, 0.3, 0.5, 0.7 — progressive reveal
    const thresholds = [0.05, 0.25, 0.45, 0.65, 0.85];

    let activeSegs = 0;
    for (let i = 0; i < state.nodes.length; i++) {
        state.nodes[i]!.activated = scrollProgress >= thresholds[i]!;
        if (i < 4 && scrollProgress >= thresholds[i]!) {
            activeSegs = i + 1;
        }
    }
    state.activeSegments = activeSegs;

    // Move particles on active segments
    for (const p of state.particles) {
        if (p.segment < activeSegs) {
            p.t += p.speed;
            if (p.t > 1) p.t -= 1;
        }
    }
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
}

function drawNodeIcon(
    ctx: CanvasRenderingContext2D,
    node: PipelineNode,
    index: number,
    nodeW: number,
    nodeH: number,
): void {
    // Geometric icons instead of emoji
    const cx = node.x;
    const cy = node.y;
    const s = nodeW * 0.2;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (index) {
        case 0: // File
        case 4:
            ctx.strokeStyle = node.activated ? '#818CF8' : '#475569';
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.6, cy - s);
            ctx.lineTo(cx + s * 0.2, cy - s);
            ctx.lineTo(cx + s * 0.6, cy - s * 0.6);
            ctx.lineTo(cx + s * 0.6, cy + s);
            ctx.lineTo(cx - s * 0.6, cy + s);
            ctx.closePath();
            ctx.stroke();
            // Fold
            ctx.beginPath();
            ctx.moveTo(cx + s * 0.2, cy - s);
            ctx.lineTo(cx + s * 0.2, cy - s * 0.6);
            ctx.lineTo(cx + s * 0.6, cy - s * 0.6);
            ctx.stroke();
            break;
        case 1: // Lock
            ctx.strokeStyle = node.activated ? '#6366F1' : '#475569';
            ctx.beginPath();
            ctx.rect(cx - s * 0.5, cy - s * 0.1, s, s * 1.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.4, s * 0.4, Math.PI, 0);
            ctx.stroke();
            break;
        case 2: // Cloud
            ctx.strokeStyle = node.activated ? '#4338CA' : '#475569';
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.1, s * 0.5, Math.PI * 0.8, Math.PI * 0.2);
            ctx.arc(cx + s * 0.4, cy + s * 0.2, s * 0.35, -Math.PI * 0.3, Math.PI * 0.7);
            ctx.arc(cx - s * 0.4, cy + s * 0.2, s * 0.35, Math.PI * 0.3, Math.PI * 1.3);
            ctx.closePath();
            ctx.stroke();
            break;
        case 3: // Unlock
            ctx.strokeStyle = node.activated ? '#10B981' : '#475569';
            ctx.beginPath();
            ctx.rect(cx - s * 0.5, cy - s * 0.1, s, s * 1.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.4, s * 0.4, Math.PI, -0.2);
            ctx.stroke();
            break;
    }
}

export function drawPipeline(
    ctx: CanvasRenderingContext2D,
    state: PipelineState,
    width: number,
    height: number,
): void {
    ctx.clearRect(0, 0, width, height);

    const nodeW = width < 600 ? 60 : 80;
    const nodeH = width < 600 ? 70 : 90;

    // Draw connections between nodes
    for (let i = 0; i < state.nodes.length - 1; i++) {
        const a = state.nodes[i]!;
        const b = state.nodes[i + 1]!;
        const isActive = i < state.activeSegments;

        ctx.strokeStyle = isActive
            ? `rgba(${SEGMENT_COLORS[i]!.join(',')}, 0.4)`
            : 'rgba(71, 85, 105, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x + nodeW / 2 + 8, a.y);
        ctx.lineTo(b.x - nodeW / 2 - 8, b.y);
        ctx.stroke();

        // Glow for active connections
        if (isActive) {
            ctx.strokeStyle = `rgba(${SEGMENT_COLORS[i]!.join(',')}, 0.1)`;
            ctx.lineWidth = 6;
            ctx.stroke();
        }
    }

    // Draw flowing particles
    for (const p of state.particles) {
        if (p.segment >= state.activeSegments) continue;

        const a = state.nodes[p.segment]!;
        const b = state.nodes[p.segment + 1]!;
        const startX = a.x + nodeW / 2 + 8;
        const endX = b.x - nodeW / 2 - 8;
        const px = startX + (endX - startX) * p.t;
        const py = a.y + (b.y - a.y) * p.t;

        const color = SEGMENT_COLORS[p.segment]!;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.join(',')}, 0.8)`;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(px, py, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.join(',')}, 0.15)`;
        ctx.fill();
    }

    // Draw nodes
    for (let i = 0; i < state.nodes.length; i++) {
        const node = state.nodes[i]!;

        // Node background
        const bgColor = node.activated
            ? 'rgba(15, 23, 42, 0.9)'
            : 'rgba(15, 23, 42, 0.6)';
        drawRoundedRect(ctx, node.x, node.y, nodeW, nodeH, 12);
        ctx.fillStyle = bgColor;
        ctx.fill();

        // Border
        if (node.activated) {
            const color = i <= 2 ? SEGMENT_COLORS[Math.min(i, 3)]! : SEGMENT_COLORS[3]!;
            ctx.strokeStyle = `rgba(${color.join(',')}, 0.5)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Glow
            ctx.shadowColor = `rgba(${color.join(',')}, 0.3)`;
            ctx.shadowBlur = 20;
            ctx.strokeStyle = `rgba(${color.join(',')}, 0.2)`;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else {
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw icon
        drawNodeIcon(ctx, node, i, nodeW, nodeH);

        // Label below node
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = node.activated
            ? 'rgba(248, 250, 252, 0.9)'
            : 'rgba(148, 163, 184, 0.5)';
        ctx.fillText(node.label, node.x, node.y + nodeH / 2 + 10);
    }
}

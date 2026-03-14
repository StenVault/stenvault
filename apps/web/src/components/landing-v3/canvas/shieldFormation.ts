/**
 * Shield Formation — Particles coalesce into shield shape on scroll
 *
 * Scroll 0: particles random. Scroll 0.5: shield assembled.
 * Scroll 0.8–1.0: shield pulses with glow.
 */

export interface ShieldParticle {
    // Current position
    x: number;
    y: number;
    // Random scattered position
    scatterX: number;
    scatterY: number;
    // Target shield position
    targetX: number;
    targetY: number;
    size: number;
    opacity: number;
}

/**
 * Generate points along a shield outline (pointed bottom, wide top)
 */
export function generateShieldPoints(
    cx: number,
    cy: number,
    scale: number,
    count: number,
): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];

    // Shield path: top-left corner → top-right → right side → bottom point → left side
    // Parameterize as a path
    const w = scale * 0.9;
    const h = scale * 1.2;
    const topY = cy - h * 0.4;
    const bottomY = cy + h * 0.5;
    const cornerR = scale * 0.12;

    for (let i = 0; i < count; i++) {
        const t = i / count;
        let px: number, py: number;

        if (t < 0.2) {
            // Top edge (left to right)
            const lt = t / 0.2;
            px = cx - w / 2 + w * lt;
            py = topY;
        } else if (t < 0.45) {
            // Right side (top to bottom point)
            const lt = (t - 0.2) / 0.25;
            px = cx + w / 2 * (1 - lt * 0.6);
            py = topY + (bottomY - topY) * lt;
            // Curve inward
            px += Math.sin(lt * Math.PI) * w * 0.1;
        } else if (t < 0.55) {
            // Bottom point
            const lt = (t - 0.45) / 0.1;
            px = cx + w * 0.2 * (0.5 - lt);
            py = bottomY - scale * 0.05 * Math.abs(lt - 0.5);
        } else if (t < 0.8) {
            // Left side (bottom to top)
            const lt = (t - 0.55) / 0.25;
            px = cx - w / 2 * (1 - (1 - lt) * 0.6);
            py = bottomY - (bottomY - topY) * lt;
            px -= Math.sin((1 - lt) * Math.PI) * w * 0.1;
        } else {
            // Top-left corner back to start
            const lt = (t - 0.8) / 0.2;
            px = cx - w / 2 + w * 0 * lt;
            py = topY;
        }

        points.push({ x: px, y: py });
    }

    return points;
}

export function createShieldParticles(
    width: number,
    height: number,
    count: number,
): ShieldParticle[] {
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.35;
    const shieldPoints = generateShieldPoints(cx, cy, scale, count);

    return shieldPoints.map((target) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        scatterX: Math.random() * width,
        scatterY: Math.random() * height,
        targetX: target.x,
        targetY: target.y,
        size: 1.5 + Math.random() * 1.5,
        opacity: 0.4 + Math.random() * 0.4,
    }));
}

export function updateShieldParticles(
    particles: ShieldParticle[],
    progress: number,
): void {
    // Ease progress for smoother feel
    const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const formation = Math.min(eased / 0.6, 1); // Fully formed by scroll 0.6

    for (const p of particles) {
        p.x = p.scatterX + (p.targetX - p.scatterX) * formation;
        p.y = p.scatterY + (p.targetY - p.scatterY) * formation;
    }
}

export function drawShield(
    ctx: CanvasRenderingContext2D,
    particles: ShieldParticle[],
    width: number,
    height: number,
    progress: number,
): void {
    ctx.clearRect(0, 0, width, height);

    const formation = Math.min(progress / 0.6, 1);
    const pulsePhase = progress > 0.7
        ? (progress - 0.7) / 0.3
        : 0;

    // Draw particles
    for (const p of particles) {
        const pulseFactor = pulsePhase > 0
            ? 1 + Math.sin(Date.now() * 0.003) * 0.3 * pulsePhase
            : 1;

        const size = p.size * (1 + formation * 0.5) * pulseFactor;
        const opacity = p.opacity * (0.5 + formation * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`;
        ctx.fill();

        // Glow when formed
        if (formation > 0.5) {
            const glowOpacity = (formation - 0.5) * 2 * 0.15 * pulseFactor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(99, 102, 241, ${glowOpacity})`;
            ctx.fill();
        }
    }

    // Inner shield glow when fully formed
    if (formation > 0.8) {
        const cx = width / 2;
        const cy = height / 2;
        const glowIntensity = (formation - 0.8) * 5 * (pulsePhase > 0
            ? 1 + Math.sin(Date.now() * 0.002) * 0.4 * pulsePhase
            : 1);
        const radius = Math.min(width, height) * 0.2;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(99, 102, 241, ${0.08 * glowIntensity})`);
        grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }
}

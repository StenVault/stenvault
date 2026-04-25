/**
 * PasswordStrengthMeter — segment count + label per tier.
 *
 * Uses the real `getPasswordStrengthUI` (no mock) so the meter and the
 * scoring helper stay observably in sync. Representative passwords cover
 * all six score values (0-5).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { getPasswordStrengthUI } from '@/lib/passwordValidation';

const TOTAL_SEGMENTS = 8;

/**
 * Positive probe on the tier-colour Tailwind class. Counting filled
 * segments via "anything that isn't the empty-token class" would flip
 * silently if the empty token were ever renamed — every segment would
 * look "filled" and weak-tier assertions would quietly pass. Reading
 * the expected tier colour from `getPasswordStrengthUI` keeps this
 * helper in lockstep with the component under test.
 */
function countFilledSegments(container: HTMLElement, password: string): number {
    const bar = container.querySelector('[role="progressbar"]');
    if (!bar) throw new Error('progressbar not found');
    const segments = Array.from(bar.children) as HTMLElement[];
    expect(segments).toHaveLength(TOTAL_SEGMENTS);
    const { color } = getPasswordStrengthUI(password);
    return segments.filter((el) => el.className.includes(color)).length;
}

describe('PasswordStrengthMeter', () => {
    it('renders nothing when password is empty', () => {
        const { container } = render(<PasswordStrengthMeter password="" />);
        expect(container.firstChild).toBeNull();
    });

    it('renders 0 filled segments for score 0 (no criteria met)', () => {
        // 'abcdefgh' — <12 chars, no mixed case, no digit, no special → score 0
        const password = 'abcdefgh';
        const { container } = render(<PasswordStrengthMeter password={password} />);
        expect(countFilledSegments(container, password)).toBe(0);
        expect(screen.getByText('Weak')).toBeInTheDocument();
    });

    it('renders 2 filled segments for score 1 (Weak)', () => {
        // 'abcdefghijkl' — length≥12 only → score 1
        const password = 'abcdefghijkl';
        const { container } = render(<PasswordStrengthMeter password={password} />);
        expect(countFilledSegments(container, password)).toBe(2);
        expect(screen.getByText('Weak')).toBeInTheDocument();
    });

    it('renders 3 filled segments for score 2 (Fair)', () => {
        // 'abcdefghij1k' — length≥12 + digit → score 2
        const password = 'abcdefghij1k';
        const { container } = render(<PasswordStrengthMeter password={password} />);
        expect(countFilledSegments(container, password)).toBe(3);
        expect(screen.getByText('Fair')).toBeInTheDocument();
    });

    it('renders 5 filled segments for score 3 (Good)', () => {
        // 'Abcdefghij1k' — length≥12 + mixed case + digit → score 3
        const password = 'Abcdefghij1k';
        const { container } = render(<PasswordStrengthMeter password={password} />);
        expect(countFilledSegments(container, password)).toBe(5);
        expect(screen.getByText('Good')).toBeInTheDocument();
    });

    it('renders 7 filled segments for score 4 (Strong)', () => {
        // 'Abcdefghij1!' — length≥12 + mixed case + digit + special → score 4
        const password = 'Abcdefghij1!';
        const { container } = render(<PasswordStrengthMeter password={password} />);
        expect(countFilledSegments(container, password)).toBe(7);
        expect(screen.getByText('Strong')).toBeInTheDocument();
    });

    it('renders 8 filled segments for score 5 (Excellent)', () => {
        // 'Abcdefghijklmno1!' — length≥16 too → score 5
        const password = 'Abcdefghijklmno1!';
        const { container } = render(<PasswordStrengthMeter password={password} />);
        expect(countFilledSegments(container, password)).toBe(8);
        expect(screen.getByText('Excellent')).toBeInTheDocument();
    });

    it('exposes progressbar semantics', () => {
        render(<PasswordStrengthMeter password="Abcdefghij1!" />);
        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuemin', '0');
        expect(bar).toHaveAttribute('aria-valuemax', '8');
        expect(bar).toHaveAttribute('aria-valuenow', '7');
        expect(bar).toHaveAttribute('aria-label', 'Password strength: Strong');
    });
});

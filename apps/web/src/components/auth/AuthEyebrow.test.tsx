import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthEyebrow } from './AuthEyebrow';

describe('AuthEyebrow', () => {
    it('renders its children', () => {
        render(<AuthEyebrow>Step 2 · Verification</AuthEyebrow>);
        expect(screen.getByText('Step 2 · Verification')).toBeInTheDocument();
    });

    it('carries the shared eyebrow class grammar (uppercase + tracking)', () => {
        const { container } = render(<AuthEyebrow>Eyebrow</AuthEyebrow>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.className).toContain('uppercase');
        expect(el.className).toContain('tracking-[0.2em]');
        expect(el.className).toContain('text-[11px]');
        expect(el.className).toContain('font-bold');
    });

    it('merges an extra className without dropping the base grammar', () => {
        const { container } = render(
            <AuthEyebrow className="mb-2 text-violet-300">Ceremony</AuthEyebrow>
        );
        const el = container.firstElementChild as HTMLElement;
        expect(el.className).toContain('mb-2');
        expect(el.className).toContain('text-violet-300');
        expect(el.className).toContain('uppercase');
    });

    it('forwards the id for aria-describedby wiring', () => {
        render(<AuthEyebrow id="phase-step-label">Phase</AuthEyebrow>);
        expect(screen.getByText('Phase')).toHaveAttribute('id', 'phase-step-label');
    });
});

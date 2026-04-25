import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthSidePanel } from './AuthSidePanel';

describe('AuthSidePanel', () => {
    // aria-hidden on the aside hides the heading from the a11y tree by design —
    // the card remains authoritative. Pass `hidden: true` to query the node.
    it('renders the headline as an h2 in display type', () => {
        render(<AuthSidePanel headline="Your files are exactly where you left them." />);
        const heading = screen.getByRole('heading', {
            name: 'Your files are exactly where you left them.',
            level: 2,
            hidden: true,
        });
        expect(heading).toBeInTheDocument();
        expect(heading.className).toContain('font-display');
    });

    it('renders an optional eyebrow above the headline', () => {
        render(
            <AuthSidePanel
                eyebrow="Brand promise"
                headline="Two passwords. One for us. One just for you."
            />
        );
        expect(screen.getByText('Brand promise')).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { level: 2, hidden: true })
        ).toHaveTextContent('Two passwords. One for us. One just for you.');
    });

    it('renders the motif slot when provided', () => {
        render(
            <AuthSidePanel
                headline="This is the one we never see."
                motif={<div data-testid="motif-slot">motif</div>}
            />
        );
        expect(screen.getByTestId('motif-slot')).toBeInTheDocument();
    });

    it('skips the motif container when no motif is provided', () => {
        render(<AuthSidePanel headline="A quiet line." />);
        expect(screen.queryByTestId('motif-slot')).not.toBeInTheDocument();
    });

    it('marks the panel aria-hidden so the card remains authoritative', () => {
        const { container } = render(<AuthSidePanel headline="Decorative only." />);
        const aside = container.querySelector('aside');
        expect(aside).toHaveAttribute('aria-hidden', 'true');
    });
});

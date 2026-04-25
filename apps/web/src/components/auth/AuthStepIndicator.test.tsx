import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyRound, Lock, Shield } from 'lucide-react';
import { AuthStepIndicator } from './AuthStepIndicator';

const twoSteps = [
    { icon: KeyRound, label: 'Sign-in' },
    { icon: Lock, label: 'Encryption' },
];

const threeSteps = [
    { icon: KeyRound, label: 'Password' },
    { icon: Shield, label: 'Recovery' },
    { icon: Lock, label: 'Complete' },
];

describe('AuthStepIndicator', () => {
    describe('dots variant', () => {
        it('renders every step label and exposes an sr-only progress string', () => {
            render(
                <AuthStepIndicator
                    variant="dots"
                    steps={twoSteps}
                    current={0}
                    srLabel="Step 1 of 2: Sign-in password"
                />
            );
            expect(screen.getByText('Step 1 of 2: Sign-in password')).toBeInTheDocument();
            expect(screen.getByText('Sign-in')).toBeInTheDocument();
            expect(screen.getByText('Encryption')).toBeInTheDocument();
        });

        it('applies an id attribute when supplied', () => {
            const { container } = render(
                <AuthStepIndicator
                    variant="dots"
                    steps={twoSteps}
                    current={1}
                    srLabel="Step 2 of 2: Encryption setup"
                    id="register-steps"
                />
            );
            expect(container.querySelector('#register-steps')).not.toBeNull();
        });
    });

    describe('bars variant', () => {
        it('renders N bars and the active step label', () => {
            const { container } = render(
                <AuthStepIndicator
                    variant="bars"
                    steps={threeSteps}
                    current={1}
                    srLabel="Step 2 of 3: Recovery"
                />
            );
            expect(container.querySelectorAll('div.h-1\\.5')).toHaveLength(3);
            expect(screen.getByText(/Step 2 of 3 — Recovery/)).toBeInTheDocument();
            expect(screen.getByText('Step 2 of 3: Recovery')).toBeInTheDocument();
        });

        it('clamps current when out of range', () => {
            render(
                <AuthStepIndicator
                    variant="bars"
                    steps={threeSteps}
                    current={99}
                    srLabel="Final step"
                />
            );
            expect(screen.getByText(/Step 3 of 3 — Complete/)).toBeInTheDocument();
        });

        it('clamps negative current to the first step', () => {
            render(
                <AuthStepIndicator
                    variant="bars"
                    steps={threeSteps}
                    current={-3}
                    srLabel="Beginning"
                />
            );
            expect(screen.getByText(/Step 1 of 3 — Password/)).toBeInTheDocument();
        });
    });
});

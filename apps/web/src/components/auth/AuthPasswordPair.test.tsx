import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AuthPasswordPair } from './AuthPasswordPair';

function Harness({
    initialPassword = '',
    initialConfirm = '',
    matchAffirmation = false,
    strengthSlot,
}: {
    initialPassword?: string;
    initialConfirm?: string;
    matchAffirmation?: boolean;
    strengthSlot?: React.ReactNode;
}) {
    const [password, setPassword] = useState(initialPassword);
    const [confirmPassword, setConfirmPassword] = useState(initialConfirm);
    return (
        <AuthPasswordPair
            label="Encryption Password"
            confirmLabel="Confirm Encryption Password"
            password={password}
            confirmPassword={confirmPassword}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirmPassword}
            matchAffirmation={matchAffirmation}
            strengthSlot={strengthSlot}
        />
    );
}

describe('AuthPasswordPair', () => {
    it('renders both inputs with the supplied labels', () => {
        render(<Harness />);
        expect(screen.getByLabelText('Encryption Password')).toBeInTheDocument();
        expect(screen.getByLabelText('Confirm Encryption Password')).toBeInTheDocument();
    });

    it('does not show mismatch error when confirm is empty', () => {
        render(<Harness initialPassword="correcthorsebattery" />);
        expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
    });

    it('shows mismatch error when confirm differs from password', () => {
        render(<Harness initialPassword="abc12345abcd" initialConfirm="abc12345abcX" />);
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });

    it('shows emerald match affirmation when matchAffirmation is true and both match', () => {
        render(
            <Harness
                initialPassword="abc12345abcd"
                initialConfirm="abc12345abcd"
                matchAffirmation
            />
        );
        expect(screen.getByText('Passwords match')).toBeInTheDocument();
    });

    it('does not show match affirmation when matchAffirmation is disabled', () => {
        render(
            <Harness
                initialPassword="abc12345abcd"
                initialConfirm="abc12345abcd"
                matchAffirmation={false}
            />
        );
        expect(screen.queryByText('Passwords match')).not.toBeInTheDocument();
    });

    it('does not show match affirmation when both are empty', () => {
        render(<Harness matchAffirmation />);
        expect(screen.queryByText('Passwords match')).not.toBeInTheDocument();
    });

    it('renders the supplied strength slot between password and confirm', () => {
        render(
            <Harness
                initialPassword="abc12345abcd"
                strengthSlot={<div data-testid="strength">strength</div>}
            />
        );
        expect(screen.getByTestId('strength')).toBeInTheDocument();
    });

    it('updates both fields independently', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const password = screen.getByLabelText('Encryption Password') as HTMLInputElement;
        const confirm = screen.getByLabelText('Confirm Encryption Password') as HTMLInputElement;
        await user.type(password, 'abc');
        await user.type(confirm, 'abc');
        expect(password.value).toBe('abc');
        expect(confirm.value).toBe('abc');
    });
});

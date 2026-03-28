import React, { createContext, useContext, ReactNode } from 'react';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { EmailVerificationModal } from './EmailVerificationModal';

type EmailVerificationContextType = ReturnType<typeof useEmailVerification>;

const EmailVerificationContext = createContext<EmailVerificationContextType | null>(null);

export function useEmailVerificationContext() {
    const context = useContext(EmailVerificationContext);
    if (!context) {
        throw new Error('useEmailVerificationContext must be used within EmailVerificationProvider');
    }
    return context;
}

interface Props {
    children: ReactNode;
    userEmail?: string;
    emailVerified?: boolean;
}

export function EmailVerificationProvider({ children, userEmail, emailVerified }: Props) {
    const emailVerification = useEmailVerification(emailVerified);

    return (
        <EmailVerificationContext.Provider value={emailVerification}>
            {children}
            <EmailVerificationModal
                isOpen={emailVerification.isModalOpen}
                onClose={() => emailVerification.setIsModalOpen(false)}
                email={userEmail || ''}
                onVerify={(params) => emailVerification.verifyWithOTP(params)}
                onResend={(params) => emailVerification.resendEmail(params)}
                isLoading={emailVerification.isLoading}
                cooldown={emailVerification.cooldown}
            />
        </EmailVerificationContext.Provider>
    );
}

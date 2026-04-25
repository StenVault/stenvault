import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { startLogin, finishLogin } from '@/lib/opaqueClient';
import { scheduleProactiveRefresh } from '@/lib/auth';
import { toast } from '@stenvault/shared/lib/toast';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ShieldCheck, Fingerprint } from 'lucide-react';
import { AuthLayout, AuthCard, AuthInput, AuthButton, AuthDivider, AuthLink, AuthOTPInput, AuthEyebrow, AuthSidePanel } from '@/components/auth';
import { LockClosingMotif } from '@/components/auth/motifs/LockClosingMotif';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';

// Polling interval for checking if login was completed elsewhere (ms)
const AUTH_POLL_INTERVAL_MS = 3000;

function getAndClearReturnUrl(): string {
    const url = sessionStorage.getItem('stenvault_return_url');
    sessionStorage.removeItem('stenvault_return_url');
    if (!url) return '/home';
    if (!url.startsWith('/') || url.startsWith('//')) return '/home';
    return url;
}

export default function LoginV2() {
    const setLocation = useNavigate();
    const [authMethod, setAuthMethod] = useState<'password' | 'magic'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [showOtpInput, setShowOtpInput] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // MFA state
    const [mfaToken, setMfaToken] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState('');

    const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

    const utils = trpc.useUtils();
    const opaqueLoginStartMutation = trpc.auth.opaqueLoginStart.useMutation();
    const opaqueLoginFinishMutation = trpc.auth.opaqueLoginFinish.useMutation();
    const verifyMFAMutation = trpc.auth.verifyMFA.useMutation();
    const sendMagicLinkMutation = trpc.auth.sendMagicLink.useMutation();
    const verifyOtpMutation = trpc.auth.verifyOTP.useMutation();
    const generateAuthOptionsMutation = trpc.passkeys.generateAuthOptions.useMutation();
    const verifyAuthenticationMutation = trpc.passkeys.verifyAuthentication.useMutation();

    // Check if user is already authenticated (for cross-device login)
    const { data: currentUser } = trpc.auth.me.useQuery(undefined, {
        enabled: showOtpInput, // Only poll when showing OTP input
        refetchInterval: showOtpInput ? AUTH_POLL_INTERVAL_MS : false,
        retry: false,
        staleTime: 0, // Always refetch
    });

    // Redirect if authenticated (login completed elsewhere)
    useEffect(() => {
        if (showOtpInput && currentUser) {
            toast.success('Login completed on another device!');
            setLocation(getAndClearReturnUrl());
        }
    }, [currentUser, showOtpInput, setLocation]);

    /** Complete login: server sets HttpOnly cookies, start proactive refresh, redirect */
    const completeLogin = async (_result: any) => {
        toast.success('Login successful');
        scheduleProactiveRefresh();
        await utils.auth.me.invalidate();
        setLocation(getAndClearReturnUrl());
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsLoggingIn(true);

            // OPAQUE Step 1: Client generates startLoginRequest
            const clientLogin = await startLogin(password);

            // OPAQUE Step 2: Send to server, get loginResponse
            const trimmedEmail = email.trim().toLowerCase();
            const step1 = await opaqueLoginStartMutation.mutateAsync({
                email: trimmedEmail,
                startLoginRequest: clientLogin.startLoginRequest,
            });

            // OPAQUE Step 3: Client finishes login
            const clientFinish = await finishLogin(
                password,
                clientLogin.clientLoginState,
                step1.loginResponse
            );

            if (!clientFinish) {
                throw new Error('Invalid email or password');
            }

            // OPAQUE Step 4: Send finishLoginRequest to server, get tokens
            const result = await opaqueLoginFinishMutation.mutateAsync({
                email: trimmedEmail,
                finishLoginRequest: clientFinish.finishLoginRequest,
            }) as any;

            // Check if MFA is required
            if (result?.mfaRequired) {
                setMfaToken(result.mfaToken);
                setMfaCode('');
                return;
            }

            await completeLogin(result);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Authentication failed';
            toast.error(message);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleSendMagicLink = async () => {
        if (!email.trim()) {
            toast.error('Enter your email first');
            return;
        }
        try {
            setAuthMethod('magic');
            await sendMagicLinkMutation.mutateAsync({ email: email.trim().toLowerCase() });
            toast.success('Code sent to your email');
            setShowOtpInput(true);
        } catch (error: unknown) {
            setAuthMethod('password');
            const message = error instanceof Error ? error.message : 'Failed to send code';
            toast.error(message);
        }
    };

    const handleVerifyMFA = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mfaToken) return;
        try {
            const result = await verifyMFAMutation.mutateAsync({
                mfaToken,
                totpCode: mfaCode,
            }) as any;

            await completeLogin(result);
        } catch (error: any) {
            toast.error(error.message || 'Invalid verification code');
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const result = await verifyOtpMutation.mutateAsync({ email: email.trim().toLowerCase(), otp }) as any;
            await completeLogin(result);
        } catch (error: any) {
            toast.error(error.message || 'Invalid or expired code');
        }
    };

    const handleBackToEmail = () => {
        setShowOtpInput(false);
        setMfaToken(null);
        setMfaCode('');
        setOtp('');
        setAuthMethod('password');
    };

    const handlePasskeyLogin = async () => {
        try {
            setIsPasskeyLoading(true);

            // Generate authentication options (email optional — helps with allowCredentials)
            const trimmedEmail = email.trim().toLowerCase() || undefined;
            const { options, challengeId } = await generateAuthOptionsMutation.mutateAsync({
                email: trimmedEmail,
            });

            // Prompt browser passkey UI
            const credential = await startAuthentication({ optionsJSON: options });

            // Verify with server
            const result = await verifyAuthenticationMutation.mutateAsync({
                challengeId,
                credential: credential as any,
            }) as any;

            // Handle MFA gate (same as OPAQUE)
            if (result?.mfaRequired) {
                setMfaToken(result.mfaToken);
                setMfaCode('');
                return;
            }

            await completeLogin(result);
        } catch (error: any) {
            // User cancelled the passkey prompt — don't show error
            if (error?.name === 'NotAllowedError') return;
            const message = error?.message || 'Passkey authentication failed';
            toast.error(message);
        } finally {
            setIsPasskeyLoading(false);
        }
    };

    const isPending = isLoggingIn || opaqueLoginStartMutation.isPending || opaqueLoginFinishMutation.isPending;

    const loginSidePanel = (
        <AuthSidePanel
            headline="Your files are exactly where you left them."
            motif={<LockClosingMotif />}
        />
    );

    // MFA TOTP Input View
    if (mfaToken) {
        return (
            <AuthLayout sidePanel={loginSidePanel}>
                <AuthCard
                    title="Two-factor verification"
                    description="Enter the 6-digit code from your authenticator app, or a backup code."
                >
                    <AuthEyebrow className="-mt-4 mb-2 text-center sm:text-left">
                        Step 2 · Verification
                    </AuthEyebrow>
                    <form onSubmit={handleVerifyMFA} className="space-y-6">
                        <div className="space-y-2">
                            <label
                                htmlFor="mfa-code"
                                className="text-sm font-medium flex items-center gap-2 text-slate-300"
                            >
                                <ShieldCheck className="h-4 w-4 text-slate-400" />
                                Verification Code
                            </label>
                            <AuthOTPInput
                                id="mfa-code"
                                length={9}
                                value={mfaCode}
                                onChange={setMfaCode}
                                variant="alphanumeric-with-backup"
                                placeholder="000000"
                                autoFocus
                            />
                            <p className="text-xs text-slate-400 text-center">
                                Enter your authenticator code or a backup code
                            </p>
                        </div>

                        <AuthButton
                            type="submit"
                            isLoading={verifyMFAMutation.isPending}
                            icon={<ArrowRight className="w-4 h-4" />}
                            disabled={mfaCode.length < 6}
                        >
                            Verify and sign in
                        </AuthButton>
                    </form>

                    <AuthDivider text="Alternatives" />

                    <button
                        type="button"
                        onClick={handleBackToEmail}
                        className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to sign in
                    </button>
                </AuthCard>
            </AuthLayout>
        );
    }

    // OTP Input View (magic link)
    if (showOtpInput) {
        return (
            <AuthLayout sidePanel={loginSidePanel}>
                <AuthCard
                    title="Enter your code"
                    description={`We sent a 6-digit code to ${email}`}
                >
                    <AuthEyebrow className="-mt-4 mb-2 text-center sm:text-left">
                        Step 2 · Verification
                    </AuthEyebrow>
                    <form onSubmit={handleVerifyOtp} className="space-y-6">
                        <div className="space-y-2">
                            <label
                                htmlFor="magic-otp"
                                className="text-sm font-medium flex items-center gap-2 text-slate-300"
                            >
                                <ShieldCheck className="h-4 w-4 text-slate-400" />
                                Verification Code
                            </label>
                            <AuthOTPInput
                                id="magic-otp"
                                length={6}
                                value={otp}
                                onChange={setOtp}
                                variant="numeric"
                                autoFocus
                            />
                            <p className="text-xs text-slate-400 text-center">
                                Enter the 6-digit code from your email
                            </p>
                        </div>

                        <AuthButton
                            type="submit"
                            isLoading={verifyOtpMutation.isPending}
                            icon={<ArrowRight className="w-4 h-4" />}
                            disabled={otp.length !== 6}
                        >
                            Sign in
                        </AuthButton>
                    </form>

                    <AuthDivider text="Alternatives" />

                    <div className="space-y-3">
                        <AuthButton
                            variant="secondary"
                            onClick={handleSendMagicLink}
                            isLoading={sendMagicLinkMutation.isPending}
                        >
                            Resend code
                        </AuthButton>

                        <button
                            type="button"
                            onClick={handleBackToEmail}
                            className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Use different email
                        </button>
                    </div>
                </AuthCard>
            </AuthLayout>
        );
    }

    // Default Email/Password View
    return (
        <AuthLayout sidePanel={loginSidePanel}>
            <AuthCard
                title="Sign in"
                description="Welcome back."
            >
                <form onSubmit={handleLogin} className="space-y-6">
                    <AuthInput
                        id="email"
                        type="email"
                        label="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        required
                        autoFocus
                    />

                    <div className="space-y-2">
                        <AuthInput
                            id="password"
                            type="password"
                            label="Sign-in Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Your account password"
                            autoComplete="current-password"
                            required
                        />
                        <div className="flex justify-end">
                            <AuthLink href="/auth/forgot-password">
                                Lost sign-in access?
                            </AuthLink>
                        </div>
                    </div>

                    <AuthButton
                        type="submit"
                        isLoading={isPending}
                        icon={<ArrowRight className="w-4 h-4" />}
                    >
                        Sign in
                    </AuthButton>
                </form>

                <AuthDivider text="Alternatives" />

                <div className="space-y-4">
                    {browserSupportsWebAuthn() && (
                        <AuthButton
                            variant="secondary"
                            onClick={handlePasskeyLogin}
                            isLoading={isPasskeyLoading}
                            icon={<Fingerprint className="w-4 h-4" />}
                        >
                            Sign in with Passkey
                        </AuthButton>
                    )}

                    <AuthButton
                        variant="secondary"
                        onClick={handleSendMagicLink}
                        isLoading={sendMagicLinkMutation.isPending}
                    >
                        Email me a code
                    </AuthButton>

                    <div className="text-center pt-4">
                        <p className="text-[13px] text-slate-400">
                            Don't have an account?{' '}
                            <AuthLink href="/auth/register" className="text-violet-500">
                                Create one free
                            </AuthLink>
                        </p>
                    </div>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}

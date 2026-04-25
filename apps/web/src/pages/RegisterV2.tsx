import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { TRPCClientError } from '@trpc/client';
import { startRegistration, finishRegistration } from '@/lib/opaqueClient';
import { toast } from '@stenvault/shared/lib/toast';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Loader2, KeyRound, Lock, Shield } from 'lucide-react';
import {
    AuthLayout,
    AuthCard,
    AuthInput,
    AuthButton,
    AuthDivider,
    AuthLink,
    AuthPasswordPair,
    AuthExplainer,
    AuthSidePanel,
    type AuthExplainerItem,
} from '@/components/auth';
import { DualKeyMotif } from '@/components/auth/motifs/DualKeyMotif';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';

/**
 * Keep in step with the server's emailZ (`z.string().email()`), but only loose
 * enough to catch the obvious mistakes before the round-trip. Anything the
 * regex lets through still goes to the server's canonical validator.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * tRPC serializes Zod `issues[]` into error.message as raw JSON. Surface the
 * first field-level message instead so users see "Invalid email address"
 * rather than a regex pattern string.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof TRPCClientError) {
        const fieldErrors = error.data?.zodError?.fieldErrors as
            | Record<string, string[] | undefined>
            | undefined;
        if (fieldErrors) {
            for (const key of Object.keys(fieldErrors)) {
                const first = fieldErrors[key]?.[0];
                if (first) return first;
            }
        }
        const formErrors = error.data?.zodError?.formErrors as string[] | undefined;
        if (formErrors?.[0]) return formErrors[0];
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

const TWO_PASSWORD_ITEMS: AuthExplainerItem[] = [
    { icon: KeyRound, label: 'Sign-in', sub: "Proves it's you. We verify it." },
    { icon: Lock, label: 'Encryption', sub: 'Seals your files. Only you hold it.' },
    { icon: Shield, label: 'Files', sub: 'Stored as unreadable noise. Never scanned.' },
];

function getAndClearReturnUrl(): string {
    const url = sessionStorage.getItem('stenvault_return_url');
    sessionStorage.removeItem('stenvault_return_url');
    if (!url) return '/home';
    if (!url.startsWith('/') || url.startsWith('//')) return '/home';
    return url;
}

export default function RegisterV2() {
    const setLocation = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    const { data: registrationStatus, isLoading: statusLoading } = trpc.auth.getRegistrationStatus.useQuery();
    const opaqueRegisterStartMutation = trpc.auth.opaqueRegisterStart.useMutation();
    const opaqueRegisterFinishMutation = trpc.auth.opaqueRegisterFinish.useMutation();
    const utils = trpc.useUtils();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedEmail = email.trim();
        if (!EMAIL_SHAPE.test(trimmedEmail)) {
            toast.error('Enter a valid email address');
            return;
        }

        if (password.length < 12) {
            toast.error('Password must be at least 12 characters long');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            setIsRegistering(true);

            // OPAQUE Step 1: Client generates registrationRequest
            const clientReg = await startRegistration(password);

            // OPAQUE Step 2: Send to server, get registrationResponse
            const step1 = await opaqueRegisterStartMutation.mutateAsync({
                email: trimmedEmail,
                registrationRequest: clientReg.registrationRequest,
            });

            // OPAQUE Step 3: Client finishes registration
            const clientFinish = await finishRegistration(
                password,
                clientReg.clientRegistrationState,
                step1.registrationResponse
            );

            // OPAQUE Step 4: Send registrationRecord to server, get tokens
            const result = await opaqueRegisterFinishMutation.mutateAsync({
                email: trimmedEmail,
                registrationRecord: clientFinish.registrationRecord,
                name: name || undefined,
                inviteCode: inviteCode.trim() || undefined,
            }) as any;

            // Server sets HttpOnly cookies in the response — no client-side storage needed

            toast.success('Account created. Check your email to verify.', {
                duration: 5000,
            });

            await utils.auth.me.invalidate();
            setLocation(getAndClearReturnUrl());
        } catch (error: unknown) {
            const message = extractErrorMessage(error, 'Registration failed');
            if (message.includes('already registered')) {
                toast.error('This email is already registered');
            } else if (message.includes('8 character') || message.includes('12 character')) {
                toast.error('Password must be at least 12 characters long');
            } else {
                toast.error(message);
            }
        } finally {
            setIsRegistering(false);
        }
    };

    const isClosed = !statusLoading && !registrationStatus?.isOpen;
    const registerSidePanel = (
        <AuthSidePanel
            headline={isClosed ? "Come back soon." : "Two passwords. One for us. One just for you."}
            motif={isClosed ? undefined : <DualKeyMotif />}
        />
    );

    if (statusLoading) return <AuthLayout sidePanel={registerSidePanel}><div className="flex justify-center py-20"><Loader2 className="animate-spin text-violet-500" /></div></AuthLayout>;

    if (!registrationStatus?.isOpen) {
        return (
            <AuthLayout sidePanel={registerSidePanel}>
                <AuthCard title="Registration closed" description="Public signups are currently disabled.">
                    <AuthButton variant="secondary" onClick={() => setLocation('/auth/login')}>Back to sign in</AuthButton>
                </AuthCard>
            </AuthLayout>
        );
    }

    const requiresCode = !registrationStatus?.allowPublicRegistration || registrationStatus?.requireInviteCode;
    const isPending = isRegistering || opaqueRegisterStartMutation.isPending || opaqueRegisterFinishMutation.isPending;
    const canSubmit = password.length >= 12 && password === confirmPassword;

    return (
        <AuthLayout sidePanel={registerSidePanel}>
            <AuthCard
                title="Create your account"
                description="Create your account to start using StenVault."
            >
                {/* The Explainer carries the "step 1 of 2" signal on its own —
                    active cell ringed, siblings dimmed. A separate dots indicator
                    above it was saying the same thing twice. */}
                <AuthExplainer
                    items={TWO_PASSWORD_ITEMS}
                    current={0}
                    srLabel="Two-password model: Sign-in, then Encryption, keeps Files unreadable."
                    className="py-2"
                />

                <form onSubmit={handleRegister} className="space-y-6">
                    {requiresCode && (
                        <AuthInput
                            id="inviteCode"
                            label="Invite Code"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="CLOUD-XXXX"
                            required
                        />
                    )}

                    <AuthInput
                        id="email"
                        type="email"
                        label="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@gmail.com"
                        required
                    />

                    <AuthPasswordPair
                        label="Sign-in Password"
                        confirmLabel="Confirm Sign-in Password"
                        password={password}
                        confirmPassword={confirmPassword}
                        onPasswordChange={setPassword}
                        onConfirmChange={setConfirmPassword}
                        passwordPlaceholder="Your account password"
                        matchAffirmation
                        strengthSlot={<PasswordStrengthMeter password={password} />}
                    />

                    {/* Name is optional and used only for UI personalisation —
                        tucked behind a disclosure so the first screen asks for
                        the minimum it actually needs (email + password). */}
                    <details
                        data-testid="personalize-accordion"
                        className="group rounded-xl border border-white/[0.05] bg-white/[0.02]"
                    >
                        <summary className="list-none cursor-pointer flex items-center justify-between px-4 py-3 text-xs uppercase tracking-[0.2em] font-bold text-slate-400 hover:text-slate-300 transition-colors">
                            <span>Personalize (optional)</span>
                            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-4 pb-4 pt-2">
                            <AuthInput
                                id="name"
                                label="Full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe"
                            />
                        </div>
                    </details>

                    <AuthButton
                        type="submit"
                        isLoading={isPending}
                        disabled={!canSubmit}
                        icon={<ArrowRight className="w-4 h-4" />}
                    >
                        Continue to Encryption Setup
                    </AuthButton>
                    <p className="text-xs text-slate-500 text-center -mt-2">
                        Next: the one we never see.
                    </p>
                </form>

                <AuthDivider text="Alternatives" />

                <div className="text-center">
                    <p className="text-[13px] text-slate-500">
                        Already have an account?{' '}
                        <AuthLink href="/auth/login" className="text-violet-500">
                            Sign in
                        </AuthLink>
                    </p>
                </div>
            </AuthCard>
        </AuthLayout>
    );
}

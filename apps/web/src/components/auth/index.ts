/**
 * Auth Components — Premium UI for Authentication
 *
 * Core shell: AuthLayout, AuthCard, AuthInput, AuthButton, AuthDivider, AuthLink
 * Primitives: AuthStepIndicator, AuthOTPInput, AuthRecoveryCodeInput, AuthPasswordPair, AuthRecoveryCodesGrid, AuthExplainer, AuthEyebrow
 *
 * Icon grammar (absolute rule — never mix):
 *   KeyRound    Sign-in (identity auth)
 *   Lock        Encryption (client-side seal)
 *   Key         Recovery Code (backup artifact)
 *   ShieldCheck Ready / Complete
 *   Shield      Brand / general security
 *   Users       Trusted Circle
 *   Fingerprint Passkey
 *   Mail        Email flows
 *   Package     Collection of items (Shamir)
 */

export { AuthLayout } from './AuthLayout';
export {
    AuthCard,
    AuthInput,
    AuthButton,
    AuthDivider,
    AuthLink,
} from './AuthCard';
export { AuthStepIndicator, type AuthStep } from './AuthStepIndicator';
export { AuthOTPInput } from './AuthOTPInput';
export { AuthRecoveryCodeInput } from './AuthRecoveryCodeInput';
export { AuthPasswordPair } from './AuthPasswordPair';
export { AuthRecoveryCodesGrid } from './AuthRecoveryCodesGrid';
export { AuthExplainer, type AuthExplainerItem } from './AuthExplainer';
export { AuthEyebrow } from './AuthEyebrow';
export { AuthSidePanel } from './AuthSidePanel';
export { AuthLastCheckDialog } from './AuthLastCheckDialog';

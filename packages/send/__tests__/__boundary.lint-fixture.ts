/**
 * Boundary lint sentinel — this file intentionally contains imports that
 * the ESLint isolation rules forbid. It lives outside packages/send/src
 * so it doesn't ship with the package bundle.
 *
 * It is NOT imported from anywhere. Its purpose is to fail
 * `pnpm exec eslint packages/send/__tests__/__boundary.lint-fixture.ts`
 * so that if the rules regress silently, the proof test in scripts/
 * catches it in CI.
 *
 * Run manually:
 *   pnpm exec eslint packages/send/__tests__/__boundary.lint-fixture.ts
 *
 * Expected: ESLint exits non-zero with at least 2 no-restricted-imports
 * errors (one per forbidden import below).
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { TRPCContext } from "@stenvault/api"; // forbidden: send → apps/api
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CVEF_CONTAINER_V2 } from "@stenvault/shared/platform/crypto/cvef"; // forbidden: send → vault CVEF

export const __boundaryFixture = true;

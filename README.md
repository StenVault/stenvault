# StenVault

Zero-knowledge encrypted cloud storage with hybrid post-quantum cryptography — built as a solo project by [Gefson Costa](https://github.com/Gefson-costa).

Even if the servers are seized or subpoenaed — there is mathematically nothing to hand over.

All encryption, key derivation, and filename obfuscation run entirely client-side. The server stores only ciphertext and can never access files, filenames, or passwords.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![npm: @stenvault/pqc-wasm](https://img.shields.io/npm/v/@stenvault/pqc-wasm)](https://www.npmjs.com/package/@stenvault/pqc-wasm)

**[stenvault.com](https://stenvault.com)** · [Security Whitepaper](https://github.com/StenVault/stenvault/blob/main/SECURITY_WHITEPAPER.md) · [Audit Pipeline](https://github.com/StenVault/stenvault-audit) · [PQC WASM](https://github.com/StenVault/pqc-wasm)

**Try it now — no account required:** [stenvault.com/send](https://stenvault.com/send) encrypts and shares a file with anyone. The decryption key lives in the URL fragment and never reaches the server.

![StenVault — client-side encryption in action](docs/screenshots/Screenshot%202026-03-28%20095740.png)

---

## At a glance

- **Solo-built** — designed, implemented, and tested by one developer
- **4,300+ tests** — real WebCrypto and WASM operations, not mocks
- **Hybrid post-quantum crypto** — ML-KEM-768 + X25519, ML-DSA-65 + Ed25519 (NIST FIPS 203/204)
- **Own binary file format** — CVEF v1.4 with AAD binding and algorithm versioning
- **Own WASM package** — [@stenvault/pqc-wasm](https://github.com/StenVault/pqc-wasm), published on npm
- **Zero-knowledge everything** — OPAQUE auth, encrypted filenames, client-side key generation

---

## Why StenVault

In August 2024, NIST finalized **FIPS 203 (ML-KEM)** and **FIPS 204 (ML-DSA)** — the first standardized post-quantum cryptographic primitives. The threat they address is already active: adversaries are harvesting encrypted traffic today to decrypt it once quantum computers are capable enough. Data encrypted right now with classical cryptography is at risk.

Most encrypted storage products have not responded. Proton Drive, Tresorit, and ente.io offer strong classical encryption but no post-quantum layer. StenVault implements **hybrid PQC** — pairing ML-KEM-768 with X25519, and ML-DSA-65 with Ed25519 — so existing security guarantees are preserved while adding a quantum-resistant layer. Neither alone is a single point of failure.

This is the open-source web client. The backend is proprietary ([open-core model](https://en.wikipedia.org/wiki/Open-core_model)).

---

## What this project is

This is a serious, production-oriented implementation — not a proof of concept or academic exercise. Built by one developer over an extended period:

- **4,300+ tests** — many running real WebCrypto and WASM operations, not mocks
- **Own binary file format** — CVEF v1.4, self-describing, with AAD-bound headers and algorithm versioning so files are never broken by algorithm transitions
- **PQC primitives compiled to WASM** — `@stenvault/pqc-wasm` is a standalone npm package wrapping RustCrypto's `ml-kem` and `ml-dsa` crates, published under the `@stenvault` org and usable independently
- **Zero-knowledge authentication** — OPAQUE (RFC 9807) means the server never sees a password or a password hash, ever
- **Threshold recovery** — Shamir secret sharing (K-of-N) across trusted contacts, eliminating single points of failure without trusting any one party
- **Organisation vaults** — multi-tenant with RBAC, automatic key distribution, and cryptographic tenant isolation

---

## Threat Model

StenVault assumes the server is **fully untrusted**. A compromised server, a malicious operator, or a legal subpoena should yield nothing useful:

- **No plaintext exposure** — file contents, filenames, and passwords never leave the browser unencrypted
- **Zero-knowledge authentication** — OPAQUE (RFC 9807) verifies credentials without the server ever seeing them
- **Client-side key generation** — per-file keys are generated and wrapped locally; the server transports ciphertext only
- **Encrypted filenames** — prevent metadata leakage at every layer (storage, transit, database)
- **Efficient key rotation** — password changes re-wrap the master key without re-encrypting file data

The hybrid post-quantum layer (V4) additionally protects against **harvest-now-decrypt-later** attacks on data encrypted today.

See the [security whitepaper](https://github.com/StenVault/stenvault/blob/main/SECURITY_WHITEPAPER.md) for complete cryptographic flows, database schemas, and architectural rationale.

---

## Cryptography

| Primitive | Classical | Post-Quantum | Purpose |
|-----------|-----------|--------------|---------|
| Key encapsulation | X25519 ECDH | ML-KEM-768 (FIPS 203) | Per-file key wrapping |
| Digital signatures | Ed25519 | ML-DSA-65 (FIPS 204) | Sign-at-encrypt file authenticity |
| Password authentication | — | — | OPAQUE (RFC 9807) |
| Content encryption | AES-256-GCM | — | File and filename encryption |
| Key derivation | Argon2id (47 MiB, t=1, p=1) | — | Password → KEK |

**File format:** [CVEF v1.4](https://github.com/StenVault/stenvault/blob/main/SECURITY_WHITEPAPER.md#21-cvef-file-format) — binary container with AAD-protected headers, algorithm identifiers, and bound signature attribution. Each file is self-describing: it declares exactly what is needed for decryption, so algorithm transitions never break existing files.

CVEF v1.4 introduced **Associated Authenticated Data (AAD) binding** — encryption metadata is cryptographically bound to the ciphertext, preventing header tampering and substitution attacks. Signatures are computed over the AAD-inclusive hash, ensuring attribution cannot be stripped or forged independently of the content.

---

## Key Hierarchy

```
Password ─→ Argon2id (47 MiB) ─→ KEK ─→ AES-KW ─→ Master Key (32 bytes)
                                                         ├── File keys (AES-256-GCM)
                                                         ├── Filename keys
                                                         ├── Hybrid key pair wrapping
                                                         └── Organization master keys
```

Per-file encryption (V4 hybrid PQC):

```
Random File Key (32 bytes)
        │
 ┌──────┴──────┐
 X25519-ECDH  ML-KEM-768
 └──────┬──────┘
    HKDF-SHA256 → Hybrid KEK
        │
    AES-KW Wrap → Wrapped FK
        │
    AES-256-GCM(FK, plaintext, AAD)
        │
    Ed25519 + ML-DSA-65 → Dual Signature (bound to AAD hash)
```

With **Unified Encryption State (UES)**, returning users get a device-local fast path (~100ms) that bypasses the expensive Argon2id derivation (~500ms) while maintaining the same security guarantees:

```
Device KEK (UES, local-only) ─→ AES-KW Unwrap ─→ Master Key
        │                                              │
        └── falls back to password path on failure ────┘
```

---

## Features

- **Organisation vaults** — multi-tenant team vaults with RBAC, automatic key distribution, and cryptographic isolation between tenants
- **Shamir recovery** — K-of-N threshold splitting of the master key across trusted contacts, eliminating single points of failure
- **Public Send** (`/send`) — share an encrypted file with anyone, no account required. The decryption key lives in the URL fragment (`#key=...`) and is never sent to the server
- **P2P transfers** — browser-to-browser file transfer via WebRTC with end-to-end encryption
- **E2E encrypted chat** — real-time messaging with hybrid key exchange
- **Content fingerprinting** — streaming hash-based duplicate detection across all file sizes
- **Proof-of-existence** — cryptographic timestamping for file integrity verification
- **Local Send** — LAN-based device-to-device transfer without cloud round-trips

---

## Audit Source Map

If you are reviewing or auditing the cryptography, start here:

| File | Purpose |
|------|---------|
| `apps/web/src/lib/fileCrypto.ts` | AES-256-GCM file encryption/decryption |
| `apps/web/src/lib/hybridFileCrypto.ts` | V4 hybrid PQC encryption pipeline |
| `apps/web/src/lib/signedFileCrypto.ts` | CVEF v1.4 sign-at-encrypt with AAD binding |
| `apps/web/src/lib/streamingDecrypt.ts` | Chunked streaming decryption for large files |
| `apps/web/src/lib/contentFingerprint.ts` | Streaming content fingerprint for deduplication |
| `apps/web/src/lib/publicSendCrypto.ts` | Public Send encryption (derived IVs, anti-reordering) |
| `apps/web/src/lib/opaqueClient.ts` | OPAQUE (RFC 9807) zero-knowledge authentication |
| `apps/web/src/lib/chatFileCrypto.ts` | E2E encrypted chat file sharing |
| `apps/web/src/lib/orgHybridCrypto.ts` | Organisation-scoped hybrid encryption |
| `apps/web/src/lib/orgKeyDistribution.ts` | Automatic org member key distribution |
| `apps/web/src/lib/orgKeyRotation.ts` | Organisation key rotation protocol |
| `apps/web/src/lib/shamirSecretSharing.ts` | Shamir secret sharing (K-of-N threshold) |
| `apps/web/src/hooks/useMasterKey.ts` | Argon2id derivation, UES fast path, key wrapping |
| `apps/web/src/hooks/masterKeyCrypto.ts` | AES-KW wrap/unwrap operations |
| `apps/web/src/hooks/orgMasterKeyCrypto.ts` | Organisation master key operations |
| `apps/web/src/lib/platform/webHybridKemProvider.ts` | ML-KEM-768 + X25519 key encapsulation |
| `apps/web/src/lib/platform/webHybridSignatureProvider.ts` | ML-DSA-65 + Ed25519 dual signatures |
| `apps/web/src/lib/platform/webArgon2Provider.ts` | Argon2id WASM with parameter validation |
| `apps/web/src/lib/pqcWorkerClient.ts` | Promise API for the PQC Web Worker |
| `apps/web/src/lib/workers/pqc.worker.ts` | Dedicated Web Worker — isolates WASM memory from main thread |
| `packages/shared/src/platform/crypto/cvef.ts` | CVEF container format (v1.0–v1.4) parser/serializer |

---

## Project Structure

```
apps/web/                              React 19 + Vite 7 SPA
  src/
    lib/
      fileCrypto.ts                    AES-256-GCM encryption
      hybridFileCrypto.ts              V4 hybrid PQC pipeline
      signedFileCrypto.ts              CVEF v1.4 sign-at-encrypt
      streamingDecrypt.ts              Chunked streaming decryption
      contentFingerprint.ts            Streaming duplicate detection
      publicSendCrypto.ts              /send encryption (derived IVs)
      opaqueClient.ts                  OPAQUE auth client
      orgHybridCrypto.ts               Organisation encryption
      orgKeyDistribution.ts            Org key distribution
      orgKeyRotation.ts                Org key rotation
      shamirSecretSharing.ts           K-of-N threshold splitting
      platform/
        webHybridKemProvider.ts        ML-KEM-768 + X25519
        webHybridSignatureProvider.ts  ML-DSA-65 + Ed25519
        webArgon2Provider.ts           Argon2id WASM
      workers/
        pqc.worker.ts                  PQC WASM in dedicated Worker
        fingerprint.worker.ts          Content hashing off main thread
        fileEncryptor.worker.ts        File encryption Worker
        mediaDecryptor.worker.ts       Media decryption Worker
    hooks/
      useMasterKey.ts                  Key derivation, UES, wrapping
      masterKeyCrypto.ts               AES-KW operations
      orgMasterKeyCrypto.ts            Org master key ops
      useOrgMasterKey.ts               Org vault unlock
      useSignatureKeys.ts              Hybrid signature key management
      useE2ECrypto.ts                  Chat encryption

packages/shared/                       Shared types, CVEF format, crypto utilities
packages/api-types/                    Generated tRPC API type declarations
```

---

## Stack

| Category | Technologies |
|----------|-------------|
| Frontend | React 19, TypeScript (strict mode), Vite 7, TailwindCSS 4, React Router v7 |
| State | TanStack Query, Zustand |
| Crypto | WebCrypto API, [@stenvault/pqc-wasm](https://github.com/StenVault/pqc-wasm) (RustCrypto → WASM), @serenity-kit/opaque |
| Performance | Web Workers (PQC, encryption, fingerprinting, media decryption) |
| Testing | Vitest (4,300+ tests) |

---

## Building and Testing

This is the client only — a StenVault backend is required for full operation. The cryptographic primitives can be audited and tested independently:

```bash
pnpm install
pnpm test             # 4,300+ tests
pnpm build
pnpm typecheck        # strict mode across all packages
```

---

## Contributing

**Cryptography audits and security reviews are the most valuable contributions.** If you find an issue in any of the files listed in the audit source map, please report it to [security@stenvault.com](mailto:security@stenvault.com) rather than opening a public issue.

For other contributions — bug reports, pull requests, documentation — open an issue. Before submitting changes to crypto code, run the full test suite. Many tests exercise real WebCrypto and WASM operations, not mocks, and catch subtle integration issues that unit tests would miss.

---

## Ecosystem

| Project | Purpose |
|---------|---------|
| **[StenVault](https://github.com/StenVault/stenvault)** (this repo) | Zero-knowledge encrypted cloud storage — open-source web client |
| **[PQC WASM](https://github.com/StenVault/pqc-wasm)** | RustCrypto post-quantum primitives compiled to WebAssembly |
| **[StenVault Audit](https://github.com/StenVault/stenvault-audit)** | Automated security audit pipeline — tree-sitter AST analysis + AI triage |
| **[StenVault RAG](https://github.com/StenVault/stenvault-rag)** | Local codebase search and Q&A over the StenVault source |

---

## Security

Report vulnerabilities to [security@stenvault.com](mailto:security@stenvault.com). Do not open public issues for security bugs.

---

## License

[GPL-3.0](LICENSE). The backend is proprietary — this repository covers the web client and shared cryptographic libraries.

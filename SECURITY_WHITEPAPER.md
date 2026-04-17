# StenVault Security Whitepaper

**Version 1.3 — April 2026**
**Classification: Public**

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Threat Model](#2-threat-model)
- [3. Authentication — OPAQUE (RFC 9807)](#3-authentication--opaque-rfc-9807)
- [4. Key Hierarchy](#4-key-hierarchy)
- [5. File Encryption](#5-file-encryption)
- [6. Post-Quantum Cryptography](#6-post-quantum-cryptography)
- [7. Device Security — User Entropy Seed (UES)](#7-device-security--user-entropy-seed-ues)
- [8. Recovery Mechanisms](#8-recovery-mechanisms)
- [9. Additional Security Features](#9-additional-security-features)
- [10. Web Security](#10-web-security)
- [11. Attack Resistance Matrix](#11-attack-resistance-matrix)
- [12. Comparison with Industry](#12-comparison-with-industry)
- [13. Standards & References](#13-standards--references)
- [14. Known Limitations & Future Work](#14-known-limitations--future-work)
- [15. Cryptographic Verification](#15-cryptographic-verification)
- [Appendix A: Cryptographic Constants Reference](#appendix-a-cryptographic-constants-reference)
- [Appendix B: Glossary](#appendix-b-glossary)

---

## 1. Executive Summary

StenVault is a zero-knowledge encrypted cloud storage platform. The server never sees file contents, filenames, or user passwords. All encryption and decryption happens exclusively on the client device, ensuring that even the platform operator cannot access user data.

StenVault is designed for individuals and organizations that require strong privacy guarantees without sacrificing usability. It combines modern post-quantum cryptography with proven classical algorithms in a hybrid architecture, ensuring that data encrypted today remains secure against both current and future threats — including attacks by quantum computers.

### Key Security Properties

- **Zero-knowledge architecture**: The server stores only ciphertext and never possesses decryption keys
- **Post-quantum resistance**: Hybrid encryption combining classical and lattice-based algorithms (FIPS 203/204)
- **Zero-knowledge authentication**: OPAQUE protocol (RFC 9807) — the server never receives the password in any form
- **Forward secrecy**: Per-file ephemeral keys; compromise of one file key does not affect others
- **Key hierarchy separation**: Password changes do not require re-encrypting stored files
- **Social recovery**: Shamir secret sharing (K-of-N threshold) for master key recovery
- **Tamper evidence**: Hybrid digital signatures (Ed25519 + ML-DSA-65) and blockchain-anchored timestamps

### Cryptographic Primitives

| Purpose | Algorithm | Standard |
|---------|-----------|----------|
| File encryption | AES-256-GCM | NIST SP 800-38D |
| Key derivation (password) | Argon2id | RFC 9106, OWASP 2024 |
| Key wrapping | AES-KW | RFC 3394 |
| Key derivation (shared secrets) | HKDF-SHA256 | RFC 5869 |
| Classical key exchange | X25519 (ECDH) | RFC 7748 |
| Post-quantum key encapsulation | ML-KEM-768 | FIPS 203 |
| Classical digital signature | Ed25519 | RFC 8032 |
| Post-quantum digital signature | ML-DSA-65 | FIPS 204 |
| Password authentication | OPAQUE | RFC 9807 |
| Time-based OTP | TOTP | RFC 6238 |
| Content integrity | HMAC-SHA256 | RFC 2104 |
| Secret sharing | Shamir over GF(2^8) | Shamir (1979) |
| Proof-of-existence | OpenTimestamps | Bitcoin blockchain |

---

## 2. Threat Model

### Assumptions

1. **The client device is trusted** during an active session. The browser and operating system are assumed to be uncompromised while the vault is unlocked.
2. **The server is honest-but-curious**. StenVault is designed so that even a fully compromised server — or a malicious operator — cannot access user data.
3. **TLS is functional**. Network transport relies on TLS 1.3 with HSTS preload. A TLS compromise would expose encrypted traffic metadata but not file contents (which are encrypted client-side before transport).
4. **Cryptographic primitives are sound**. StenVault relies on peer-reviewed, standardized algorithms. If a primitive is broken (e.g., AES-256-GCM), the impact is mitigated by the hybrid approach where applicable.

### What StenVault Protects Against

| Threat | Protection |
|--------|------------|
| **Server compromise** | Zero-knowledge: server only stores ciphertext, wrapped keys, and public keys. No decryption is possible without the user's password. |
| **Database breach** | Passwords are never stored (OPAQUE). Master keys are AES-KW wrapped. File content and filenames are encrypted client-side. |
| **Network eavesdropping** | TLS 1.3 mandatory. OPAQUE prevents password extraction even from captured traffic. File content is encrypted before transmission. |
| **Quantum computer attacks** | Hybrid PQC: X25519 + ML-KEM-768 for key exchange, Ed25519 + ML-DSA-65 for signatures. An attacker must break both classical and quantum-resistant algorithms. |
| **Password brute force** | Argon2id (46 MiB memory-hard). Progressive account lockout. OPAQUE prevents offline dictionary attacks against server-stored data. |
| **Insider threat** | Zero-knowledge means even platform operators cannot access user data. All administrative actions are logged in an audit trail. |
| **Token/session theft** | Token family rotation detection. Stolen refresh token triggers revocation of all user sessions across all devices. |

### What StenVault Does NOT Protect Against

| Threat | Rationale |
|--------|-----------|
| **Compromised client device** | If malware has full access to the browser or OS while the vault is unlocked, it can read decrypted files from memory. This is a fundamental limitation of any client-side encryption system. |
| **User choosing a weak password** | Argon2id slows brute-force attempts, but a trivially weak password (e.g., "123456") can still be guessed. StenVault enforces password strength requirements at registration. |
| **Keylogger capturing password entry** | The password is typed into the browser. A keylogger on the device can capture it. FIDO2/WebAuthn (planned) would mitigate this. |
| **Evil maid / physical device access** | If an attacker has physical access to an unlocked device, they can access the vault. Auto-lock mitigates this for unattended sessions. |
| **File size and access pattern metadata** | The server can observe file sizes, upload/download timestamps, and access frequency. Filenames and content are encrypted, but metadata is not. |
| **Denial of service** | The server can refuse to serve files or delete encrypted blobs. StenVault does not provide availability guarantees against a malicious operator. |
| **Malicious host / supply chain** | If the web application code served to the browser is tampered with — whether by a compromised operator, a compromised hosting provider, or a dependency supply chain attack — it could exfiltrate keys. **Dependency mitigations**: `--frozen-lockfile` in CI, exact version pinning for crypto dependencies, `strictDepBuilds`, `pnpm audit` in CI, trust policy (`no-downgrade`), 3-day release cooldown for new package versions. **Bundle mitigations**: Subresource Integrity (SRI) on all boot-path scripts and stylesheets, reproducible builds (byte-identical output), published SHA-256 checksums per release (see §10.5). These reduce but do not eliminate this risk — a compromised hosting environment could serve entirely different HTML that omits the SRI attributes. |

### Trust Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ZERO-KNOWLEDGE TRUST BOUNDARY                  │
│                                                                   │
│  ┌──── CLIENT (TRUSTED) ──────────────────────────────────────┐  │
│  │                                                             │  │
│  │  ✓ Plaintext files                                          │  │
│  │  ✓ Plaintext filenames                                      │  │
│  │  ✓ Master password                                          │  │
│  │  ✓ Master Key (non-extractable CryptoKey, in memory only)   │  │
│  │  ✓ File encryption keys (per-file, ephemeral)               │  │
│  │  ✓ Hybrid secret keys (X25519 + ML-KEM-768)                │  │
│  │  ✓ Signature secret keys (Ed25519 + ML-DSA-65)             │  │
│  │  ✓ Organization Master Key (in memory only)                │  │
│  │  ✓ Chat messages (decrypted)                                │  │
│  │                                                             │  │
│  └─────────────────────────┬───────────────────────────────────┘  │
│                            │ HTTPS (TLS 1.3)                      │
│                            │ Only ciphertext crosses              │
│  ┌──── SERVER (UNTRUSTED) ─┴──────────────────────────────────┐  │
│  │                                                             │  │
│  │  ✗ NEVER sees: plaintext files, filenames, passwords       │  │
│  │  ✗ NEVER sees: master key, file keys, secret keys          │  │
│  │  ✗ NEVER sees: chat message content                        │  │
│  │                                                             │  │
│  │  ✓ Sees: encrypted blobs (AES-256-GCM ciphertext)          │  │
│  │  ✓ Sees: encrypted filenames (ciphertext)                   │  │
│  │  ✓ Sees: wrapped master key (AES-KW ciphertext)            │  │
│  │  ✓ Sees: encrypted secret keys (wrapped with MK)           │  │
│  │  ✓ Sees: public keys (X25519, ML-KEM-768, Ed25519, etc.)  │  │
│  │  ✓ Sees: KDF salt, IVs, encryption version                │  │
│  │  ✓ Sees: file size, MIME type, timestamps                  │  │
│  │  ✓ Sees: OPAQUE registration record (not password)         │  │
│  │  ✓ Sees: content fingerprint (user-keyed HMAC, opaque)    │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Even if the server's database and object storage were completely compromised, an attacker would only obtain encrypted data that cannot be decrypted. The encryption keys exist only in the user's browser memory during an active session, derived from a password the server never sees.

### What Requires Your Trust

Zero-knowledge guarantees are cryptographic — they hold regardless of who operates the server. The properties below are *operational integrity claims*. They depend on the operator behaving as documented. Until an independent audit verifies them, they rest on StenVault's word. We state them explicitly so you know exactly what you are trusting.

| Claim | What you are trusting | Current mitigation |
|-------|----------------------|-------------------|
| **The deployed bundle matches the published source** | That the hosting environment serves the same JavaScript that is committed to the public repository | SRI hashes on boot-path assets, reproducible builds, published SHA-256 checksums per release, public `/api/bundle-manifest` endpoint (see §10.5). A compromised host could still serve entirely different HTML. |
| **Retention policies are honored** | That audit logs are purged at 180 days, sessions at expiry, trusted devices at 90 days inactive — as documented in the retention policy | Automated purge jobs with distributed locks. No external enforcement yet. |
| **No logging beyond what is documented** | That the server does not secretly record plaintext, keys, or additional metadata | Code is partially open-source (client). Server code is closed. This claim is unverifiable until a third-party audit with backend access. |
| **Deploy integrity** | That no unauthorized code reaches production | Single operator with sole access to GitHub and Railway. No two-person rule. No deploy alert system. |
| **Session History opt-in is real** | That IP addresses and user-agents are only recorded when the user explicitly enables Session History (default: off) | Retroactive anonymization on opt-out. Verifiable in client code. Server-side enforcement requires trust. |

We recognize that these are not the same as the cryptographic guarantees above. A third-party security audit (planned, see §14) will independently verify the server-side claims. Until then, the client source code, reproducible builds, and published checksums are the evidence we offer.

---

## 3. Authentication — OPAQUE (RFC 9807)

StenVault uses OPAQUE (Oblivious Pseudo-Random Function with Asymmetric Password-Authenticated Key Exchange), a zero-knowledge password authentication protocol standardized in RFC 9807. The server never sees, receives, or processes the user's password in any form.

### How OPAQUE Works

```
┌──────────────────────────────────────────────────────────────────┐
│                    OPAQUE LOGIN FLOW                               │
│                                                                    │
│  Client (Browser)                         Server                   │
│  │                                        │                        │
│  │  Registration (one-time setup):        │                        │
│  │  ──────────────────────────────        │                        │
│  │                                        │                        │
│  ├── OPRF(password) ───────────────────►  │                        │
│  │   (blinded password)                   │                        │
│  │                                        ├── Evaluate OPRF        │
│  │  ◄──────────────────────────────────── ├── Return response      │
│  │                                        │                        │
│  ├── Derive registration record ────────► │                        │
│  │   (contains NO password info)          ├── Store record         │
│  │                                        │                        │
│  │                                        │                        │
│  │  Login (each time):                    │                        │
│  │  ──────────────────                    │                        │
│  │                                        │                        │
│  ├── Round 1: startLogin ───────────────► │                        │
│  │   (blinded OPRF request)               │                        │
│  │                                        ├── Evaluate with        │
│  │                                        │   stored record        │
│  │  ◄──────────────────────────────────── ├── Return response      │
│  │                                        │   (evaluated OPRF +    │
│  │                                        │    server public key)  │
│  │                                        │                        │
│  ├── Round 2: finishLogin ──────────────► │                        │
│  │   (client proof)                       │                        │
│  │                                        ├── Verify proof         │
│  │  ◄──────────────────────────────────── ├── Return session       │
│  │                                        │                        │
│  │  Result: Mutual authentication          │                        │
│  │  Server proved it has the record        │                        │
│  │  Client proved it knows the password    │                        │
│  │  Password NEVER transmitted             │                        │
└──────────────────────────────────────────────────────────────────┘
```

OPAQUE uses oblivious pseudo-random functions to let the server verify that the user knows the correct password without ever seeing it. Even if an attacker intercepts every network packet, they cannot extract the password. Even if the server is compromised, the stored registration record cannot be used to recover the password without a brute-force attack against each individual record — and Argon2id makes that economically infeasible.

### Why OPAQUE Instead of SRP or bcrypt?

| Property | OPAQUE (RFC 9807) | SRP (RFC 2945) | bcrypt + TLS |
|----------|:-:|:-:|:-:|
| Password never leaves client | Yes | Yes | No |
| Resistant to server compromise | Yes (OPRF-hardened) | Partial (verifier attack) | No (hash stored) |
| Mutual authentication | Yes | Yes | No |
| Resistant to pre-computation | Yes | Partial | Partial |
| Formal security proof | Yes | No | No |
| Standardized (IETF RFC) | RFC 9807 (2025) | RFC 2945 (2000) | N/A |
| Offline dictionary attack resistance | Yes (OPRF) | No (verifier) | No (hash) |

With SRP, a server compromise leaks the verifier, which can be subjected to offline dictionary attacks. With bcrypt, the hashed password is stored server-side and can be brute-forced. OPAQUE's OPRF construction means that even the stored record is computationally useless without the server's private OPRF key, which is a separate secret.

### Password Change Flow

Password changes use a two-step OPAQUE handshake:
1. Prove current password via OPAQUE login
2. Register new OPAQUE record and re-wrap the Master Key with the new Key Encryption Key (KEK)

### Account Lockout

After 5 consecutive failed login attempts, the account is locked for 15 minutes. Additional failures during the lockout window extend it. Lockout checks run before the OPAQUE handshake to prevent wasting OPRF computation on locked accounts. A `Retry-After` header informs the client when to retry.

Both the threshold and lockout duration are configurable per-deployment via environment variables.

### Multi-Factor Authentication

StenVault supports two second-factor mechanisms, both enforced after successful OPAQUE login.

**FIDO2/WebAuthn Passkeys** (phishing-resistant)

Implemented via `@simplewebauthn/server`. Users can register one or more passkeys (platform or cross-platform authenticators) which are stored server-side as public-key credentials. Passkeys provide:

- Phishing resistance (origin-bound credentials)
- Hardware-backed key material (on compatible devices)
- Clone detection via signature counter
- Anti-enumeration responses on registration/authentication failures

Passkeys can be used as an alternative to password login (Layer 1) or as a second factor after OPAQUE login (Layer 2). Recovery is provided by backup codes.

**TOTP (RFC 6238)**

1. Server generates a random 20-byte (160-bit) TOTP secret, encrypted at rest before database storage
2. User scans QR code and verifies with a TOTP code (6 digits, 30-second step, ±1 window)
3. 10 backup codes generated (stored as HMAC-SHA256 digests for timing-safe comparison)
4. On login with MFA enabled, a short-lived challenge token is issued; full session tokens are granted only after second-factor verification
5. Anti-replay protection per RFC 6238 Section 5.2 (last-used counter tracked in a server-side cache)

### Session Management

- **Access tokens**: 30-minute lifetime (JWT, HS256), delivered as HttpOnly cookie (Secure, SameSite) — not readable by JavaScript
- **Refresh tokens**: 7-day lifetime, single-use with rotation, delivered as HttpOnly cookie (SameSite=Lax)
- **Silent refresh**: On 401 response, the client automatically attempts token refresh before logging out
- **Maximum concurrent sessions**: Configurable (default 5)
- **"See all devices"**: Users can view and terminate active sessions
- **"Logout all devices"**: Terminates all sessions except the current one

---

## 4. Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                     COMPLETE KEY DERIVATION TREE                     │
│                                                                      │
│  User Password (never leaves browser)                                │
│  │                                                                   │
│  ├── Argon2id(password, salt)                                        │
│  │   Parameters: memoryCost=47104 KiB (46 MiB), timeCost=1,        │
│  │               parallelism=1, hashLength=32                        │
│  │   │                                                               │
│  │   └── KEK (Key Encryption Key, 32 bytes)                         │
│  │       │                                                           │
│  │       └── AES-KW Unwrap ──► Master Key (MK, 32 bytes)            │
│  │                              │                                    │
│  │                              ├── HKDF-SHA256(MK, "filename")     │
│  │                              │   └── Filename Encryption Key      │
│  │                              │                                    │
│  │                              ├── AES-KW Wrap ──► Hybrid KEM      │
│  │                              │   Secret Keys (X25519=32B)         │
│  │                              │                                    │
│  │                              ├── AES-256-GCM ──► ML-KEM-768      │
│  │                              │   Secret Key (2400B, too large     │
│  │                              │   for AES-KW)                      │
│  │                              │                                    │
│  │                              ├── AES-256-GCM ──► Ed25519          │
│  │                              │   Signature Secret Key (64B)       │
│  │                              │                                    │
│  │                              ├── AES-KW Wrap ──► ML-DSA-65        │
│  │                              │   Signing Key Seed (32B, FIPS 204) │
│  │                              │                                    │
│  │                              └── AES-KW Wrap ──► OMK              │
│  │                                  (Organization Master Key)        │
│  │                                                                   │
│  └── [UES Fast Path] ──► Device-KEK (from UES + password)           │
│      Argon2id with UES as additional entropy                         │
│      ~100ms (vs ~500ms password-only)                                │
│                                                                      │
│  File Encryption (V4 — Hybrid PQC):                                  │
│  │                                                                   │
│  ├── Ephemeral X25519 keypair ──► ECDH shared secret (32B)          │
│  ├── ML-KEM-768 Encapsulate ──► PQ shared secret (32B)              │
│  ├── HKDF-SHA256(classical || pq) ──► Hybrid KEK (32B)             │
│  └── AES-KW(Hybrid KEK, FileKey) ──► Wrapped File Key              │
│      └── AES-256-GCM(FileKey, plaintext) ──► Ciphertext             │
└─────────────────────────────────────────────────────────────────────┘
```

The user's password is fed through Argon2id (~500ms) to produce a Key Encryption Key (KEK). This KEK unwraps the Master Key, which was randomly generated when the user first set up encryption. The Master Key never leaves the browser — it is always stored on the server in wrapped (encrypted) form. From the Master Key, all other keys are derived or unwrapped, forming a hierarchy where compromising any leaf key does not compromise the root.

### Why Argon2id?

Argon2id (winner of the Password Hashing Competition 2015, recommended by OWASP 2024) is deliberately memory-hard (46 MiB), making GPU/ASIC brute-force attacks economically impractical. The `id` variant combines data-dependent and data-independent memory access patterns, providing resistance against both side-channel attacks and time-memory tradeoff attacks.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| memoryCost | 47,104 KiB (46 MiB) | High enough to deter GPU attacks, low enough for mobile browsers |
| timeCost | 1 | Single iteration; memory cost provides the primary defense |
| parallelism | 1 | Single-threaded for consistent performance across devices |
| hashLength | 32 bytes | Matches AES-256 key length exactly |

### Why AES-KW (Key Wrapping)?

Password changes do not require re-encrypting all files. When a user changes their password, only the Master Key's wrapping changes — the new KEK wraps the same Master Key. This separation-of-concerns is a fundamental benefit of a key hierarchy and means that a password change completes in milliseconds regardless of how many files are stored.

### Key Size Constraints

AES-KW (RFC 3394) is designed for wrapping keys up to approximately 64 bytes. Post-quantum secret keys vary in size depending on serialization:

| Key Type | Size | Wrapping Method |
|----------|:---:|----------------|
| X25519 secret | 32 bytes | AES-KW (standard) |
| Ed25519 secret | 64 bytes | AES-256-GCM (with separate IV) |
| ML-KEM-768 secret | 2,400 bytes | AES-256-GCM (with separate IV) |
| ML-DSA-65 signing key seed | 32 bytes (FIPS 204 canonical) | AES-KW (standard) |

---

## 5. File Encryption

### 5.1 Encryption V4 — Hybrid PQC

V4 is the current primary encryption version, combining classical and post-quantum cryptography. Files encrypted with V4 are resistant to attacks by both classical and quantum computers.

```
┌────────────────────────────────────────────────────────────────────┐
│                    HYBRID KEM ARCHITECTURE (V4)                     │
│                                                                     │
│  Sender (Encryptor)                    Recipient's Key Pair         │
│  │                                     ├── X25519 public key       │
│  │                                     ├── X25519 secret key (MK)  │
│  │                                     ├── ML-KEM-768 public key   │
│  │                                     └── ML-KEM-768 secret (MK)  │
│  │                                                                  │
│  ├── Generate ephemeral X25519 keypair                              │
│  │   └── ECDH(ephemeral_secret, recipient_x25519_public)           │
│  │       └── classical_shared_secret (32 bytes)                     │
│  │                                                                  │
│  ├── ML-KEM-768.Encapsulate(recipient_mlkem768_public)             │
│  │   ├── pq_shared_secret (32 bytes)                                │
│  │   └── pq_ciphertext (1088 bytes)                                │
│  │                                                                  │
│  ├── HKDF-SHA256(classical || pq, "stenvault-hybrid-file-key")    │
│  │   └── hybrid_kek (32 bytes)                                      │
│  │                                                                  │
│  ├── Generate random file_key (32 bytes)                            │
│  ├── AES-KW(hybrid_kek, file_key) → wrapped_file_key (40 bytes)   │
│  │                                                                  │
│  └── AES-256-GCM(file_key, IV, plaintext) → ciphertext            │
│                                                                     │
│  Decryptor:                                                         │
│  ├── ECDH(own_x25519_secret, ephemeral_public) → classical_ss     │
│  ├── ML-KEM-768.Decapsulate(own_mlkem_secret, pq_ciphertext)      │
│  │   → pq_ss                                                       │
│  ├── HKDF-SHA256(classical_ss || pq_ss) → hybrid_kek              │
│  ├── AES-KW-Unwrap(hybrid_kek, wrapped_file_key) → file_key      │
│  └── AES-256-GCM-Decrypt(file_key, IV, ciphertext) → plaintext   │
└────────────────────────────────────────────────────────────────────┘
```

V4 encryption generates a random file key for each file, then protects that key with two independent key exchange mechanisms — one classical (X25519, proven secure today) and one quantum-resistant (ML-KEM-768, secure against future quantum computers). Both must be broken to recover the file key. This "hybrid" approach means that if either algorithm is found to have a flaw, the other still protects the data.

### 5.2 CVEF File Format

CVEF (Crypto Vault Encrypted File) is the binary file format used for all encrypted files. New files are written as **CVEF v1.4** (container v2). Readers accept v1.2, v1.3, and v1.4 for backward compatibility.

```
┌──────────────────────────────────────────────────────────────────┐
│              CVEF v1.4 BINARY LAYOUT (Container v2)               │
│                                                                   │
│  Offset       Size    Field                                       │
│  ──────       ──────  ────────────────────────────────────────    │
│  0x00         4 bytes Magic: "CVEF" (0x43 0x56 0x45 0x46)        │
│  0x04         1 byte  Container Version: 2                        │
│  0x05         4 bytes Core Metadata Length (big-endian uint32)    │
│  0x09         N bytes Core Metadata JSON (UTF-8) — signed + AAD  │
│  0x09+N       4 bytes Signature Metadata Length (0 if unsigned)   │
│  0x0D+N       M bytes Signature Metadata JSON (UTF-8)             │
│  0x0D+N+M     rest    Encrypted Data (AES-GCM, AAD = full header) │
│                                                                   │
│  Core Metadata JSON fields:                                       │
│  ├── version: "1.4"                                               │
│  ├── algorithm: "AES-256-GCM"                                     │
│  ├── salt, iv (Base64)                                            │
│  ├── kdfAlgorithm: "argon2id"                                     │
│  ├── kdfParams: { memoryCost, timeCost, parallelism }             │
│  ├── keyWrapAlgorithm: "aes-kw"                                   │
│  ├── pqcAlgorithm: "ml-kem-768"                                   │
│  ├── pqcParams:                                                   │
│  │   ├── kemAlgorithm: "x25519-ml-kem-768"                       │
│  │   ├── classicalCiphertext (32B, Base64)                        │
│  │   ├── pqCiphertext (1088B, Base64)                             │
│  │   └── wrappedFileKey (40B, Base64)                             │
│  └── chunked (optional):                                          │
│      ├── count, chunkSize (64 KiB)                                │
│      └── ivs (per-chunk IVs, Base64 array)                       │
│                                                                   │
│  Signature Metadata JSON fields (v1.4, second block):             │
│  ├── signatureAlgorithm: "ed25519-ml-dsa-65"                      │
│  ├── signingContext: "FILE"                                       │
│  ├── signerFingerprint, signerKeyVersion                          │
│  ├── classicalSignature (64B, Base64)                             │
│  └── pqSignature (3309B, Base64)                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Format versions**:

| Version | Container | Description |
|---------|:-:|-------------|
| v1.2 | v1 | Hybrid PQC KEM (X25519 + ML-KEM-768), single-block header |
| v1.3 | v1 | Adds hybrid signatures (Ed25519 + ML-DSA-65) — metadata-only addition to v1.2 |
| v1.4 | v2 | AAD-protected two-block header — closes a downgrade attack against v1.3 signatures |

The v1.4 upgrade introduces **AAD (Additional Authenticated Data) binding** between the core metadata and the encrypted payload. The full header bytes (magic + container version + both metadata blocks) are passed as AAD to AES-256-GCM. This cryptographically binds the metadata to the ciphertext — tampering with header fields (algorithm identifiers, key material references, or signatures) invalidates the GCM authentication tag. v1.4 specifically prevents an attacker who controls storage from stripping signature metadata (v1.3 signatures were not covered by the GCM tag).

Maximum core metadata size: 2 MB (validated during parsing). Typical header overhead is approximately 1.8 KB for v1.2, rising to ~6.2 KB when signatures are present (v1.3/v1.4).

### 5.3 Streaming/Chunked Encryption

Large files are split into 64 KiB chunks for streaming encryption and decryption:

- Each chunk is encrypted independently with AES-256-GCM
- Each chunk uses a unique IV derived deterministically from a base IV and the chunk index
- This enables streaming encryption/decryption without holding the entire file in memory
- Files larger than 500 MB use S3 multipart upload, where each part consists of multiple encrypted chunks

The 64 KiB chunk size matches typical operating-system page and filesystem block boundaries, keeps per-chunk overhead (12-byte IV + 16-byte GCM tag) negligible relative to payload, and is small enough to stream through the browser's WebCrypto API without blocking the event loop on large allocations.

### 5.4 Filename Encryption

Filenames are encrypted client-side to prevent the server from learning what files a user has:

1. **Key derivation**: `HKDF-SHA256(MasterKey, fileId, "stenvault-filename")` produces a per-file filename key
2. **Encryption**: `AES-256-GCM(FilenameKey, IV, filename)` produces the encrypted filename
3. **Storage**: The server stores the encrypted filename and IV; a server-side placeholder (e.g., `encrypted.ext`) is used for internal operations
4. **Decryption**: The client decrypts filenames on-the-fly and caches the results locally

If decryption fails or the master key is unavailable, the UI displays `[Encrypted]` as a safe fallback.

### 5.5 Content Fingerprinting (Duplicate Detection)

To enable per-user duplicate detection without revealing file content to the server, StenVault computes a streaming content fingerprint on the client:

1. **Chunk and hash**: The plaintext file is read in 64 KiB chunks. Each chunk is hashed with SHA-256, producing a 32-byte digest per chunk.
2. **Concatenate digests**: All per-chunk digests are concatenated (~512 KB for a 1 GB file).
3. **Keyed HMAC**: `HMAC-SHA-256(UserFingerprintKey, concatenatedDigests)` produces a 32-byte fingerprint (transmitted as 64-char hex).
4. **Storage**: Only the hex fingerprint is sent to the server.

The `UserFingerprintKey` is derived client-side from the Master Key via HKDF and never leaves the browser. Security properties:

- **Deterministic per user**: Same file uploaded twice by the same user produces the same fingerprint — enables duplicate detection.
- **Cross-user unlinkable**: Different users have different fingerprint keys, so the same file uploaded by User A and User B produces two unrelated fingerprints. The server cannot correlate content across users.
- **One-way**: The server sees only the 32-byte output. Recovering the plaintext or the concatenated digests requires brute-forcing a 256-bit HMAC key.
- **Quantum-safe**: HMAC-SHA-256 with a 256-bit key retains 128-bit security against Grover's algorithm.
- **Streaming**: Memory use is O(numChunks × 32 bytes) regardless of file size; a 1 TB file uses ~512 MB of digest memory in the browser.

This design intentionally trades cross-user deduplication (which would leak information about shared files) for strict per-user zero-knowledge.

---

## 6. Post-Quantum Cryptography

### 6.1 ML-KEM-768 + X25519 (Key Encapsulation)

StenVault uses a hybrid key encapsulation mechanism combining:

- **X25519** (RFC 7748): Proven, battle-tested elliptic curve Diffie-Hellman key exchange
- **ML-KEM-768** (FIPS 203): NIST-standardized lattice-based key encapsulation mechanism, resistant to quantum attacks

Both produce independent 32-byte shared secrets, which are concatenated and fed through HKDF-SHA256 to derive a single hybrid key. This key wraps the per-file encryption key using AES-KW.

| Parameter | X25519 | ML-KEM-768 |
|-----------|:---:|:---:|
| Public key | 32 bytes | 1,184 bytes |
| Secret key | 32 bytes | 2,400 bytes |
| Ciphertext | 32 bytes | 1,088 bytes |
| Shared secret | 32 bytes | 32 bytes |
| Security level | ~128-bit classical | NIST Level 3 (~AES-192) |

### 6.2 ML-DSA-65 + Ed25519 (Digital Signatures)

StenVault implements dual digital signatures for file integrity and non-repudiation:

- **Ed25519** (RFC 8032): Fast, constant-time elliptic curve signatures
- **ML-DSA-65** (FIPS 204): NIST-standardized lattice-based signature scheme

Both signatures must verify for a file to be considered authentic. Signing contexts (domain separators) include `FILE` (file content), `TIMESTAMP` (proof-of-existence), and `SHARE` (share link integrity).

| Parameter | Ed25519 | ML-DSA-65 |
|-----------|:---:|:---:|
| Public key | 32 bytes | 1,952 bytes |
| Secret key | 64 bytes | 32 bytes (FIPS 204 seed) |
| Signature | 64 bytes | 3,309 bytes |
| Security level | ~128-bit classical | NIST Level 3 (~AES-192) |

The ML-DSA-65 secret key is persisted in its 32-byte seed form (FIPS 204 canonical, `ExpandedSigningKey::from_seed`). The full 4,032-byte expanded signing key is re-derived in memory only at sign time and discarded immediately after use.

### 6.3 Why Hybrid (Belt and Suspenders)

The hybrid approach is motivated by two concerns:

1. **ML-KEM-768 and ML-DSA-65 are new**. While they have undergone extensive NIST evaluation, they lack the decades of real-world cryptanalysis that X25519 and Ed25519 have. If a flaw is discovered in the lattice-based schemes, the classical algorithms still protect the data.

2. **X25519 and Ed25519 are vulnerable to quantum attacks**. Shor's algorithm can break elliptic curve cryptography in polynomial time on a sufficiently powerful quantum computer. ML-KEM-768 and ML-DSA-65 are designed to resist these attacks.

By requiring both to be broken, StenVault provides security against current and future threats regardless of which class of algorithm is compromised.

### 6.4 Key Size Constraints

AES-KW (RFC 3394) via WebCrypto's `importKey` is designed for keys up to approximately 64 bytes, with 32-byte inputs being the well-trodden path. StenVault addresses varying key sizes by:

- **32-byte secrets** (X25519 private, ML-DSA-65 signing key seed): Wrapped using AES-KW, the standard key wrapping algorithm. ML-DSA-65 is stored in its FIPS 204 canonical seed form (32 bytes) and re-expanded to the 4,032-byte signing key in memory only at sign time via `ExpandedSigningKey::from_seed`.
- **Larger secrets** (Ed25519 — 64 bytes; ML-KEM-768 — 2,400 bytes): Encrypted using AES-256-GCM with the Master Key directly, using a separate random IV for each key.

Both approaches provide confidentiality and integrity; AES-KW provides an additional integrity check via its 8-byte padding, while AES-GCM provides integrity via its 16-byte authentication tag.

---

## 7. Device Security — User Entropy Seed (UES)

The User Entropy Seed (UES) is a device-specific secret that enables fast vault unlock (~100ms) on trusted devices while maintaining security through a dual-KEK system.

### Dual-KEK System

```
Without UES (slow path, ~500ms):
  Password → Argon2id(salt) → KEK → AES-KW Unwrap → Master Key

With UES (fast path, ~100ms):
  Password + UES → Argon2id(salt, lower cost) → Device-KEK → AES-KW Unwrap → Master Key
```

When a user unlocks their vault on a trusted device, the UES provides additional entropy that allows Argon2id to use lower computational parameters while maintaining the same security level. The password is still required — UES supplements it, it does not replace it.

### Device Approval Workflow

1. User logs in on a **new device** (no UES present)
2. Slow-path KEK derivation (~500ms) is used
3. New device registers as "pending" in the trusted devices registry
4. Existing approved device receives notification
5. User approves the new device on their existing device
6. Approving device generates a fresh UES for the new device (does NOT share its own)
7. New device stores the encrypted UES and uses the fast-path going forward

### Security Properties

- **UES stored encrypted**: Both locally (with Master Key) and server-side (for recovery)
- **Two-factor by design**: Even if UES is compromised, the attacker still needs the password
- **Device isolation**: Each device has a unique UES; compromise of one device does not affect others
- **Revocable**: Users can remove trusted devices at any time, invalidating that device's UES
- **Recovery code bypass**: The recovery code path bypasses UES entirely, generating a fresh Master Key

---

## 8. Recovery Mechanisms

### 8.1 Recovery Codes

At encryption setup, StenVault generates 10 recovery codes in `XXXX-XXXX` format. These codes are:

- Displayed to the user once and never stored in plaintext
- Stored as HMAC-SHA256 digests using a deterministic salt and server secret
- Compared using `crypto.timingSafeEqual` to prevent timing attacks
- Used codes are removed from the stored array atomically

A recovery code allows the user to reset their Master Key if they forget their password. This is a destructive operation — existing encrypted files become inaccessible because the old Master Key is lost. The user is clearly warned of this.

### 8.2 Shamir Secret Sharing (K-of-N)

Shamir Secret Sharing enables threshold recovery of the master key, providing social recovery without single points of failure.

**Mathematical foundation**: Based on polynomial interpolation over GF(2^8) (Galois Field with 256 elements). A random polynomial of degree K-1 is generated with the master key bytes as the constant term. N shares are generated as evaluations of this polynomial. Any K shares can reconstruct the secret via Lagrange interpolation; fewer than K shares reveal zero information about the secret.

**Share types**:

| Type | Storage | Encryption |
|------|---------|------------|
| Server | Database | AES-256-GCM with server-derived key |
| Email | Sent via email | AES-256-GCM with recovery token |
| Trusted contact | Database (for recipient) | AES-256-GCM with ECDH shared secret |
| External | QR code / paper | Plain Base64 with HMAC integrity tag |

### 8.3 Recovery Flow

1. User initiates recovery — a recovery session is created with a 24-hour expiry
2. User submits shares one at a time (from email, trusted contacts, QR codes, etc.)
3. Each share is decrypted and validated
4. When the threshold K is reached, polynomial interpolation reconstructs the master key
5. All collected shares are cleared from the database after recovery

---

## 9. Additional Security Features

### 9.1 Public Send (Key-in-Fragment)

Public Send enables anonymous encrypted file sharing without requiring an account:

1. Sender visits the Public Send page (no authentication required)
2. Client generates a random AES-256-GCM key (32 bytes)
3. Client encrypts the file in 64 KiB chunks (AES-256-GCM per chunk)
4. Encrypted blob is uploaded; session metadata is stored with a TTL (1 hour, 24 hours, or 7 days)
5. Share URL: `https://stenvault.com/send/:sessionId#key=<base64url>`
6. **The key is in the URL fragment** — per the HTTP specification (RFC 3986 Section 3.5), fragments are never sent to the server
7. Recipient visits URL; the client extracts the key from the fragment and decrypts locally

The server never has access to the encryption key. Even if the server is compromised, stored files from Public Send cannot be decrypted.

### 9.2 Proof-of-Existence (OpenTimestamps)

StenVault provides cryptographic proof that a file existed at a specific time, anchored to the Bitcoin blockchain via OpenTimestamps:

1. On file upload, the SHA-256 hash of the **encrypted** content is submitted to OpenTimestamps calendar servers
2. Calendar servers aggregate hashes into a Merkle tree
3. The Merkle root is embedded in a Bitcoin transaction
4. After 6+ Bitcoin confirmations, the timestamp is considered confirmed
5. The OTS proof can be independently verified against any Bitcoin full node

The hash is of the encrypted file (zero-knowledge — the server never sees plaintext), but the proof still demonstrates that the encrypted file existed at the stated time.

### 9.3 E2E Chat

StenVault includes end-to-end encrypted messaging between users. Messages are encrypted using hybrid KEM (X25519 + ML-KEM-768 when available) for post-quantum forward secrecy. The server stores only ciphertext and KEM ciphertexts; message content is decrypted exclusively on recipient devices.

### 9.4 Organization Key Management

Organizations have their own master key (OMK) that follows the same zero-knowledge principles:

- The OMK is generated client-side and never stored in plaintext on the server
- When a member is invited, an admin encrypts the OMK using hybrid KEM for that member's public key
- The member's client decrypts the OMK and re-wraps it with their personal Master Key
- When a member is removed, the OMK is rotated so they can no longer decrypt new files
- Old OMKs are retained (encrypted) for access to files encrypted with previous versions

### 9.5 Payment & Billing Boundary

Payment processing necessarily operates outside the zero-knowledge boundary. StenVault uses Stripe (PCI DSS Level 1 compliant) with a hosted checkout page — card numbers, billing addresses, and tax identifiers are submitted directly from the user's browser to Stripe and never transit StenVault's backend.

**What StenVault's backend sends to Stripe**: email address and internal user ID (as customer metadata). Nothing else.

**What the user submits directly to Stripe** (via `checkout.stripe.com`): full name, billing address, card details (PAN, CVC, expiry), and optionally VAT/tax ID.

**What StenVault stores locally**:

| Field | Purpose | Privacy implication |
|-------|---------|-------------------|
| `stripeCustomerId` | Link user to Stripe customer | Enables operator or subpoena to retrieve full billing identity from Stripe |
| `stripeSubscriptionId`, `stripePriceId` | Subscription state management | Plan type visible to operator |
| `subscriptionStatus`, `subscriptionPlan` | Feature gating, quota enforcement | — |
| `cardFingerprint`, `cardLast4` | Anti-fraud: detect trial abuse across accounts | Enables cross-account correlation without contacting Stripe |

**Linkability**: The StenVault account email is the same email sent to Stripe — there is no option to use a separate billing email. Given a user ID, retrieving their full legal billing identity (name, address, tax ID) requires only a single Stripe API call using the stored `stripeCustomerId`. This bridge is trivially executable by the operator or via legal process.

**Retention**: Stripe invoices are archived in an immutable R2 bucket for 10 years, as required by Portuguese tax law (CIVA Art. 52, DL 28/2019). This is the one data category that survives account deletion indefinitely. Stripe auto-redacts customer payment details 60 days after the last invoice.

**Planned**: Cryptocurrency payment support (Bitcoin) to offer an alternative billing path without the identity bridge described above.

Zero-knowledge applies to *file content, filenames, passwords, and encryption keys*. It does not and cannot apply to billing — you cannot pay anonymously with a credit card. We are transparent about this boundary rather than obscuring it.

---

## 10. Web Security

### CSRF Protection

StenVault implements double-submit cookie CSRF protection:

1. Client obtains a token from a dedicated endpoint (stored as a cookie)
2. Client sends the token in an `x-csrf-token` header on every mutating request
3. Server validates that the header value matches the cookie value
4. The server-issued token is valid for 24 hours. The client proactively refreshes it every 45 minutes of activity to keep the active token well within the server's validity window.

### Content Security Policy

Production CSP restricts:

- **Scripts**: Same-origin + `wasm-unsafe-eval` (required for ML-KEM-768 / ML-DSA-65 WASM modules; no `unsafe-inline`)
- **Connections**: Same-origin + HTTPS + WSS
- **Objects**: None (`object-src 'none'` — blocks plugin-based content)
- **Frames**: None (`frame-ancestors 'none'` — prevents framing entirely)
- **Form actions**: Same-origin only
- **Upgrade**: `upgrade-insecure-requests` directive enabled
- **External scripts**: Zero — all assets are bundled and served from same origin; CSP blocks any external script injection

### Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| X-Frame-Options | `DENY` | Prevent clickjacking (never framed) |
| X-Content-Type-Options | `nosniff` | Prevent MIME sniffing |
| X-XSS-Protection | `1; mode=block` | Legacy XSS protection |
| Referrer-Policy | `no-referrer` | Never leak referrer (protects /send#key= fragment) |
| Permissions-Policy | `geolocation=(), microphone=(), camera=(), payment=()` | Disable unused browser APIs |

### Token Rotation & Theft Detection

```
┌──────────────────────────────────────────────────────────────────┐
│                    TOKEN THEFT DETECTION                           │
│                                                                   │
│  Login → Token Family Created                                     │
│  │                                                                │
│  ├── Access Token (15 min)                                        │
│  └── Refresh Token (7 days, single-use)                           │
│                                                                   │
│  On Refresh:                                                      │
│  ├── JTI matches current → Valid rotation → New token pair       │
│  └── JTI mismatch → THEFT DETECTED                              │
│      └── ALL sessions for user revoked (nuclear option)          │
│                                                                   │
│  Token Revocation:                                                │
│  ├── Primary: in-memory cache                                    │
│  └── Fallback: durable store                                     │
│  If the cache is unavailable → fail CLOSED (reject all tokens)   │
└──────────────────────────────────────────────────────────────────┘
```

Each login creates a "token family" — a chain of refresh tokens linked by a family ID. When a refresh token is used, the server checks that the presented token ID matches the expected current token. If a mismatch is detected (indicating that a previously-rotated token was reused), the family is marked as compromised and all sessions for the user are revoked. This means that if an attacker steals a refresh token, the first use by either party (attacker or legitimate user) that creates a mismatch triggers automatic revocation.

If the revocation cache is unavailable, the system fails **closed** — tokens cannot be verified as non-revoked, so they are rejected. This prevents a cache outage from creating a window where revoked tokens are accepted.

### 10.5 Bundle Integrity & Reproducible Builds

The most significant threat to any client-side encryption system is a *malicious host*: the server operator (or an attacker who compromises the hosting environment) serves modified JavaScript that exfiltrates keys. TLS and CSP do not protect against this — the modified code is served from the legitimate origin.

StenVault implements three layers of defense:

**Subresource Integrity (SRI)**

All boot-path assets in `index.html` carry `integrity="sha384-..."` attributes (generated by `vite-plugin-sri3`):
- Entry `<script type="module">` (application code)
- Vendor chunk `<link rel="modulepreload">` tags (7 critical dependencies)
- Main `<link rel="stylesheet">`

If any of these files are modified after build, the browser refuses to load them. Limitation: lazy-loaded route chunks (loaded via `import()`) cannot carry SRI attributes — this is a limitation of the HTML specification, not the implementation.

**Reproducible Builds**

Given the same source commit, `pnpm install --frozen-lockfile && pnpm build` produces byte-identical output. This has been empirically verified across multiple runs. Determinism is achieved through: pinned lockfile, pinned Node version, deterministic Rollup chunk ordering (`manualChunks`), and no timestamps in build output.

**Published Checksums**

| Location | Content | Timing |
|----------|---------|--------|
| GitHub Release | `SHA256SUMS.txt` (per-file) + `SHA256SUMS.manifest` (single digest) | Each tagged release |
| CI artifact | Same files, 90-day retention | Every push to `main` |
| `GET /api/bundle-manifest` | JSON with manifest hash, file list, generation timestamp | Runtime, public, no auth |

**Verification by users**

A user who wants to verify that the JavaScript running in their browser matches a specific commit has three paths:

1. **Browser-only**: Compare `integrity` attributes in DevTools → Network tab against the `index.html` for the corresponding commit on GitHub. If they match, the browser has already validated the files.
2. **Full reproduction**: Clone the public repository, check out the release tag, run `pnpm install --frozen-lockfile && pnpm build`, compare the resulting `SHA256SUMS.manifest` against the published value.
3. **Endpoint cross-check**: `curl https://stenvault.com/api/bundle-manifest` and compare the `manifest` field against the GitHub Release.

**Known limitations**

- A compromised host could serve entirely different HTML that omits SRI attributes. SRI protects against file tampering, not page replacement.
- Lazy-loaded chunks are not covered by SRI (HTML specification limitation).
- There is no two-person deploy rule — the sole operator has full deployment authority.
- No automated deploy alerts are configured. A compromised GitHub account could trigger a deploy before the operator notices.

These are real gaps. SRI + reproducible builds + published checksums significantly raise the bar for undetected tampering, but they do not eliminate the malicious host threat entirely. Only a browser extension or external monitoring service that independently verifies bundle hashes on every page load would close this gap completely.

---

## 11. Attack Resistance Matrix

| Threat | Defense | Details |
|--------|---------|---------|
| **Server compromise** | Zero-knowledge: server only has ciphertext, wrapped keys, public keys. Cannot decrypt anything. | §2 |
| **Database leak** | Passwords never stored (OPAQUE). Master keys AES-KW wrapped. All file data encrypted client-side. | §3, §4 |
| **Network eavesdropping** | TLS 1.3 mandatory. HSTS with preload. OPAQUE prevents password extraction even from traffic. | §3 |
| **Quantum computer** | Hybrid PQC: X25519 + ML-KEM-768 for key exchange, Ed25519 + ML-DSA-65 for signatures. Both must be broken. | §6 |
| **Password brute force** | Argon2id (46 MiB memory-hard). Account lockout after 5 failures. OPAQUE prevents offline dictionary attacks against server data. | §3, §4 |
| **Token theft** | Token family rotation detection. Stolen refresh token triggers revocation of ALL user sessions. | §10 |
| **Session hijacking** | HttpOnly access token (30 min, not readable by JS). Refresh tokens single-use with rotation in HttpOnly cookie. Silent refresh on 401. CSRF double-submit. | §10 |
| **XSS** | CSP `script-src 'self' 'wasm-unsafe-eval'` (no `unsafe-inline`). HttpOnly cookies prevent token exfiltration. Master Key as non-extractable CryptoKey. PQC keys isolated in Web Worker. React auto-escapes output. | §10 |
| **CSRF** | Double-submit cookie pattern with dedicated token endpoint. SameSite cookie attribute. | §10 |
| **Clickjacking** | X-Frame-Options: DENY. CSP frame-ancestors: 'none'. | §10 |
| **Timing attacks** | `crypto.timingSafeEqual` for all secret comparisons (backup codes, share codes, API keys). | §3 |
| **Replay attacks** | TOTP anti-replay (RFC 6238 §5.2). Nonce-based CSRF tokens. JWT `jti` uniqueness. | §3 |
| **Metadata leakage** | Filenames encrypted. Duplicate-detection fingerprint is a user-keyed HMAC-SHA-256 (key derived client-side, never transmitted); server sees an opaque 64-char hex and cannot reverse it, nor correlate the same file across users. File sizes visible but content opaque. | §5.5 |
| **Malicious host** | SRI on boot-path assets, reproducible builds, published SHA-256 checksums, public `/api/bundle-manifest` endpoint. Does not fully eliminate the threat — see §10.5. | §10.5 |
| **Billing identity linkage** | Payment flows through Stripe (PCI Level 1). StenVault stores `stripeCustomerId` and `cardFingerprint`/`cardLast4`. Full billing identity retrievable via Stripe. Bitcoin payments planned. | §9.5 |
| **Key loss** | Recovery codes (10x HMAC-hashed). Shamir secret sharing (K-of-N). UES device-based recovery. | §7, §8 |
| **Insider threat** | Zero-knowledge means even operators cannot access file content. Operator can access metadata (§2 trust boundary). Audit logs track actions with 180-day retention. | §2, §14 |

---

## 12. Comparison with Industry

### Authentication Protocol Comparison

| Property | StenVault (OPAQUE) | Proton (SRP) | Tresorit (bcrypt + TLS) | Internxt (bcrypt + TLS) | Filen (PBKDF2 + TLS) |
|----------|:-:|:-:|:-:|:-:|:-:|
| Password never leaves client | Yes | Yes | No | No | No |
| Formal security proof | Yes | No | No | No | No |
| RFC standardized | RFC 9807 (2025) | RFC 2945 (2000) | N/A | N/A | N/A |
| Offline dictionary resistance (server breach) | Yes | Partial | No | No | No |
| Mutual authentication | Yes | Yes | No | No | No |

### Post-Quantum Cryptography Comparison

| Property | StenVault | Proton Drive | Tresorit | Internxt | Filen |
|----------|:-:|:-:|:-:|:-:|:-:|
| PQC key exchange | ML-KEM-768 (FIPS 203) | None (roadmap) | None | Kyber-512 (pre-standardization) | None |
| PQC signatures | ML-DSA-65 (FIPS 204) | None | None | None | None |
| Hybrid approach | X25519 + ML-KEM-768 | N/A | N/A | X25519 + Kyber-512 | N/A |
| NIST-standardized parameters | Yes (Level 3) | N/A | N/A | No (Level 1, non-FIPS) | N/A |
| Harvest-now-decrypt-later protection | Yes | No | No | Partial | No |

### Feature Comparison

| Feature | StenVault | Proton Drive | Tresorit | Internxt | Filen |
|---------|:-:|:-:|:-:|:-:|:-:|
| Zero-knowledge encryption | Yes | Yes | Yes | Yes | Yes |
| Post-quantum encryption | Yes (ML-KEM-768, FIPS 203) | No (roadmap) | No | Yes (Kyber-512, non-NIST) | No |
| Post-quantum signatures | Yes (ML-DSA-65, FIPS 204) | No | No | No | No |
| OPAQUE authentication (RFC 9807) | Yes | No (SRP) | No | No | No |
| FIDO2/WebAuthn passkeys | Yes | Yes | Yes | No | No |
| Hybrid KEM (per-file keys) | Yes | No | No | No | No |
| Filename encryption | Yes | Yes | Yes | Yes | Yes |
| Shamir secret recovery (K-of-N) | Yes | No | No | No | No |
| Proof-of-existence (blockchain) | Yes (OpenTimestamps) | No | No | No | No |
| Hybrid digital signatures | Yes (Ed25519 + ML-DSA-65) | No | No | No | No |
| E2E chat | Yes (hybrid KEM) | No (separate product) | No | No | No |
| Open source | Yes (GPL-3.0) | Partial | No | Yes (AGPL-3.0) | Yes (AGPL-3.0) |
| Independent security audit | Planned | Yes (Securitum, Cure53) | Yes (EY, ETH Zurich) | Yes (Securitum) | No |
| Continuous cryptographic verification | Yes (see §15) | Not published | Not published | Not published | Not published |

*Note: Comparison data is based on publicly available documentation as of April 2026. Competitors may have features in development that are not publicly documented.*

### Encryption Algorithm Comparison

| Algorithm | StenVault V4 | Proton Drive | Tresorit | Internxt |
|-----------|:---:|:---:|:---:|:---:|
| Symmetric | AES-256-GCM | AES-256 | AES-256 | AES-256 |
| Key exchange | X25519 + ML-KEM-768 | X25519 | RSA-4096 | X25519 + Kyber-512 |
| Signatures | Ed25519 + ML-DSA-65 | Ed25519 | RSA-4096 | Ed25519 |
| KDF | Argon2id (46 MiB) | bcrypt | scrypt / PBKDF2 | Argon2id |
| Key wrapping | AES-KW / AES-GCM | OpenPGP | Proprietary | Proprietary |
| File format | CVEF v1.4 (documented) | OpenPGP | Proprietary | Proprietary |

---

## 13. Standards & References

### IETF RFCs

| RFC | Title | Usage in StenVault |
|-----|-------|---------------------|
| RFC 2104 | HMAC: Keyed-Hashing for Message Authentication | Content integrity, deduplication |
| RFC 3394 | AES Key Wrap Algorithm | Key wrapping (Master Key → sub-keys) |
| RFC 3986 | Uniform Resource Identifier (URI) | Fragment-based key transport (Public Send) |
| RFC 5869 | HKDF: HMAC-based Extract-and-Expand Key Derivation | Key derivation from shared secrets |
| RFC 6238 | TOTP: Time-Based One-Time Password Algorithm | Two-factor authentication |
| RFC 7519 | JSON Web Token (JWT) | Session tokens |
| RFC 7748 | Elliptic Curves for Security (X25519) | Classical key exchange |
| RFC 8032 | Edwards-Curve Digital Signature Algorithm (Ed25519) | Classical digital signatures |
| RFC 9106 | Argon2 Memory-Hard Function | Password-based key derivation |
| RFC 9807 | The OPAQUE Asymmetric PAKE Protocol | Zero-knowledge authentication |

### NIST Standards

| Standard | Title | Usage in StenVault |
|----------|-------|---------------------|
| FIPS 197 | Advanced Encryption Standard (AES) | AES-256-GCM file encryption |
| FIPS 203 | Module-Lattice-Based Key-Encapsulation Mechanism (ML-KEM) | Post-quantum key exchange (ML-KEM-768) |
| FIPS 204 | Module-Lattice-Based Digital Signature Algorithm (ML-DSA) | Post-quantum signatures (ML-DSA-65) |
| SP 800-38D | Recommendation for GCM Mode | AES-GCM authenticated encryption |
| SP 800-108 | Recommendation for Key Derivation Using Pseudorandom Functions | HKDF usage patterns |

### Other References

| Reference | Usage |
|-----------|-------|
| OWASP Password Storage Cheat Sheet (2024) | Argon2id parameter selection |
| Password Hashing Competition (2015) | Argon2 as recommended KDF |
| Shamir, A. "How to Share a Secret" (1979) | Shamir secret sharing implementation |
| OpenTimestamps Protocol | Proof-of-existence timestamps |
| Bitcoin Protocol | Blockchain anchoring for timestamps |

---

## 14. Known Limitations & Future Work

StenVault is transparent about its current limitations. This section documents what is not yet implemented and what the platform cannot protect against by design.

### Operator Profile & Data Jurisdiction

StenVault is currently developed and operated by a single developer based in Portugal. There is no corporate entity — the operator is an individual. This has direct implications for trust:

- **Sole access**: One person holds all credentials for production infrastructure (GitHub, Railway, Cloudflare, Stripe, database). There is no two-person authorization for deploys or data access.
- **Code review**: Automated test suites (6,300+ tests) run before every merge. There is no human code review by a second party.
- **Continuity**: If the operator becomes unavailable, there is no documented succession plan. Users can export their vault at any time via Settings → Export Data (client-side decryption, server never sees plaintext). The operator commits to providing 90 days advance notice before any service discontinuation.
- **Contingency plan**: Not yet formalized. This is a known gap.

**Infrastructure jurisdiction**:

| Component | Provider | Region | Jurisdiction |
|-----------|----------|--------|-------------|
| Application server | Railway | Amsterdam, Netherlands | EU (Dutch law) |
| Encrypted file storage | Cloudflare R2 | Western Europe (WEUR) | EU |
| Payment processing | Stripe | — | Irish entity (Stripe Payments Europe) |
| Domain & CDN | Cloudflare | Global anycast | US entity, EU data processing |

All user-generated data (encrypted files, metadata, audit logs) resides in EU infrastructure. GDPR applies. A formal Record of Processing Activities (GDPR Art. 30) documents all processing categories, legal bases, retention periods, and third-party processors.

### No Independent Security Audit

StenVault has not yet undergone a formal, independent security audit by a third-party firm. The audit target is a firm with a track record of auditing zero-knowledge architectures (e.g., Securitum, which audited Proton Drive). The audit will be commissioned when recurring revenue reaches a level that sustains the engagement — it is a funding-gated milestone, not a deprioritized one.

Until then, the evidence we offer is: an open-source client (GPL-3.0), 6,300+ automated tests including 940 cryptographic test vectors and dudect timing analysis (§15), reproducible builds with published checksums (§10.5), and this whitepaper documenting every architectural decision and its limits.

A bug bounty program is planned for after the initial audit engagement. A warrant canary (a signed, periodically updated statement that no government data requests have been received) is under consideration.

Users requiring externally audited security guarantees should weigh this limitation when evaluating StenVault for sensitive use cases.

### File Size Metadata Visible

While file contents and filenames are encrypted, the server can observe:
- File sizes (before and after encryption)
- Upload and download timestamps
- Access frequency and patterns
- Number of files per user
- MIME types (for thumbnail generation and streaming)

Full metadata encryption (including file sizes) would require significant padding overhead and is not currently implemented.

### Single-Region Deployment

StenVault currently runs as a single-region deployment. This means:
- No geographic redundancy
- Single point of failure for availability (not confidentiality)
- No horizontal scaling for the API layer

The zero-knowledge model ensures that even a total server compromise does not affect data confidentiality, but availability depends on a single deployment.

### Browser-Based Crypto Limitations

All cryptographic operations run in the browser using WebCrypto API and WebAssembly:
- **PQC Web Worker isolation**: All ML-KEM-768 and ML-DSA-65 WASM operations run in a dedicated Web Worker (`pqc.worker.ts`). This is both a performance measure (avoids blocking the UI) and a security control — PQC private keys never exist in the main thread memory, preventing XSS from accessing WASM memory.
- The browser's random number generator (`crypto.getRandomValues`) is the entropy source
- WASM modules are required for ML-KEM-768 and ML-DSA-65 (not natively supported in browsers)
- **Master Key protection**: The Master Key is imported as a non-extractable `CryptoKey` (`extractable: false`). Raw key bytes are zeroed immediately after import. XSS can use the key for operations but cannot read or exfiltrate the raw bytes.
- **PQC WASM implementation**: ML-KEM-768 and ML-DSA-65 are provided by `@stenvault/pqc-wasm` — a self-owned Rust→WebAssembly wrapper built on the RustCrypto `ml-kem` and `ml-dsa` crates (FIPS 203/204 compliant, published with SLSA provenance). RustCrypto crates are production-grade and widely deployed across the Rust ecosystem. Rust's `ZeroizeOnDrop` trait zeroes all secret key material in WASM memory automatically on drop — no manual cleanup required. Web Worker isolation (`pqc.worker.ts`) ensures PQC private keys never exist in the main thread's memory, preventing XSS from reaching WASM linear memory.

### No Perfect Forward Secrecy for Stored Files

V4 encryption uses ephemeral X25519 keys per file, providing forward secrecy at the file level. However, all file keys are ultimately protected by the user's long-term hybrid key pair. If the long-term secret keys are compromised (which requires compromising the Master Key), all files encrypted with that key pair are vulnerable. This is inherent to any system where files must be accessible across sessions.

### Account Deletion & Data Retention

When a user deletes their account, the following happens immediately (no grace period, no soft-delete):

| Category | Behavior | Details |
|----------|----------|---------|
| **Hard delete** (transactional) | User record, files, folders, shares, signatures, chat messages, encryption keys, hybrid key pairs, token families, sessions, trusted devices, organization memberships | All-or-nothing within a single database transaction |
| **Anonymize** (keep row) | Audit logs: `userEmail`, `ipAddress`, `userAgent` set to NULL. User ID and action type preserved for security trail | Anonymized rows expire at the normal 180-day retention and are then permanently deleted |
| **Best-effort** (post-commit) | Encrypted blobs batch-deleted from object storage, session cache cleared | May fail silently. Blobs are encrypted with the now-deleted master key — cryptographically useless even if they persist, but occupy storage |
| **Stripe** | Subscription cancelled. Customer record NOT deleted (Stripe auto-redacts payment details 60 days after last invoice) | Stripe recommends redaction over deletion for compliance |
| **Legal retention** (10 years) | Invoices archived in immutable object storage per Portuguese tax law (CIVA Art. 52, DL 28/2019) | This is the one data category that genuinely survives account deletion |

**Retention schedule for active accounts**:

| Data | Retention | Mechanism |
|------|-----------|-----------|
| Audit logs (userId, action, timestamp, success/fail) | 180 days | Weekly purge job with distributed lock |
| IP addresses, user-agents in audit logs | Only if user enables Session History (default: **off**). Retroactively anonymized on opt-out | Privacy-by-default per GDPR Art. 25 |
| Active sessions | Deleted at expiry (7 days) or inactivity timeout (default 15 min, user-configurable 1 min – 4 hours) | 6-hourly purge job |
| Trusted devices | 90 days after last use (or 90 days after creation if never used) | Daily purge job |
| Stripe webhook events | 90 days (only `eventId`, `type`, `status` — no customer PII) | Weekly purge job |

**Data export** (GDPR Art. 20 — right to portability): Available self-service in Settings → Export Data. The browser enumerates the vault, decrypts locally with the master key, and streams a ZIP to disk. Includes `account.json` (email, name, creation date, storage statistics, device names, organization memberships). Explicitly excludes: IP addresses, device fingerprints, encryption keys, recovery codes, TOTP secrets. The server never sees the plaintext during export.

### Planned Improvements

- **Independent security audit** — Securitum, funding-gated (see above)
- **Bug bounty program** — planned for after initial audit engagement
- **Warrant canary** — signed, periodically updated transparency statement (under consideration)
- **Deploy monitoring** — automated alerts on production deployment (closing the unmonitored-deploy gap in §10.5)
- **Cryptocurrency payments** — Bitcoin support to offer a billing path without identity linkage (see §9.5)
- **Operator continuity plan** — documented succession and data custody plan for service continuity
- **HSM integration expansion** — production HSM provider support beyond the current Phase 3.2 architecture
- **Multi-region deployment** for availability and redundancy
- **iOS application** mirroring the current native Android + Rust architecture

---

## 15. Cryptographic Verification

A security system is only as trustworthy as the evidence that it behaves as specified. While an independent third-party audit is planned, StenVault maintains a continuous cryptographic verification regime that runs on every commit — not as a point-in-time snapshot, but as an enforcement mechanism that blocks regressions.

This section documents the full test infrastructure that validates StenVault's cryptographic correctness.

### 15.1 Summary

| Category | Count | Purpose |
|----------|:-:|---------|
| Total test files | 224 | Unit, integration, property, regression, E2E |
| Total test cases | 6,349 | `it()` / `test()` assertions |
| Crypto validation vectors | 940 | Wycheproof + NIST KAT + RFC |
| Property-based test runs | 5,740 | Randomized input generation (fast-check) |
| Timing-leak samples | 80,000 | Dudect statistical side-channel analysis |
| Security regression findings | 67 | SEC-001 through SEC-070, mapped to automated tests |
| Cross-implementation tests | 35 | Output agreement across independent crypto libraries |
| Integration pipeline tests | 55 | Eleven-stage end-to-end crypto flows |
| End-to-end browser tests | 105 | Playwright automation of real user flows |

All tests run on every commit. A failing cryptographic test blocks the commit from merging.

### 15.2 Crypto Validation Vectors

Cryptographic primitives are validated against independently published test vectors. Agreement with external vectors is strong evidence that the implementation matches the specification — any discrepancy fails the build.

| Source | Primitive | Vectors |
|--------|-----------|:-:|
| Google Wycheproof (C2SP) | AES-256-GCM | 66 |
| Google Wycheproof | X25519 | 518 |
| Google Wycheproof | Ed25519 | 150 |
| Google Wycheproof | HKDF-SHA256 | 86 |
| Google Wycheproof + RFC 3394 | AES Key Wrap | 70 |
| NIST FIPS 203 | ML-KEM-768 (size invariants, roundtrip, rejection) | 19 tests |
| NIST FIPS 204 | ML-DSA-65 (size invariants, sign/verify, rejection) | 21 tests |
| RFC 9106 | Argon2id (golden outputs, production parameters) | 10 tests |

Wycheproof vectors include both valid inputs (which must decrypt/verify correctly) and deliberately malformed inputs (which must be rejected). This catches the subtle class of bugs where a library accepts inputs it should reject — a common source of real-world CVEs.

### 15.3 Property-Based Testing

Property-based tests use the `fast-check` framework to generate thousands of randomized inputs and verify that cryptographic properties hold universally — not just for hand-picked cases.

| Property | Runs | Example Property |
|----------|:-:|------------------|
| AES-256-GCM correctness | 1,500 | `decrypt(encrypt(P)) = P` for 0–64 KB plaintexts |
| AES Key Wrap correctness | 1,700 | Roundtrip; wrong key rejection; tampering detection |
| HKDF determinism and isolation | 1,700 | Different salts produce independent keys |
| ML-KEM-768 roundtrip | 80 | Encapsulate/decapsulate produces matching shared secret |
| Ed25519 + ML-DSA-65 roundtrip | 760 | Sign/verify; message tampering rejection; cross-key failure |

Total: **5,740 randomized test runs**. A single counterexample fails the build.

### 15.4 Timing Side-Channel Analysis (Dudect)

A cryptographic implementation can leak secret information through execution-time variation, even when the output is correct. StenVault uses the **Dudect methodology** — measuring operation time across thousands of samples and applying **Welch's t-test** to detect statistically significant timing differences between inputs that should be indistinguishable.

| Operation | Tests | Samples per Test | Threshold |
|-----------|:-:|:-:|:-:|
| AES-256-GCM tag comparison, decryption | 3 | 10,000 | \|t\| < 4.5 (5-sigma) |
| ML-DSA-65 signature operations | 3 | 10,000 | \|t\| < 4.5 |
| ML-KEM-768 encapsulation / decapsulation | 2 | 10,000 | \|t\| < 4.5 |

Methodology specifics:
- 95th-percentile outlier cropping to filter garbage-collection noise
- Welch–Knuth online accumulator for O(1) memory streaming analysis
- Rejection-to-rejection pairs only (avoids false positives from error-construction overhead)

This depth of side-channel testing is rare. Fewer than 1% of open-source cryptographic projects publish dudect-style analysis; none of StenVault's direct competitors (Proton Drive, Tresorit, Internxt, Filen) do.

### 15.5 Cross-Implementation Validation

If two independently developed cryptographic libraries produce identical outputs for the same inputs, it is statistically improbable that both share the same bug. StenVault's cross-implementation suite validates key primitives against reference implementations:

| Primitive | Implementation A | Implementation B | Tests |
|-----------|------------------|------------------|:-:|
| AES-256-GCM | WebCrypto (browser) | Node.js `crypto` module | 8 |
| X25519 | WebCrypto | `@noble/curves` | 7 |
| Ed25519 | WebCrypto | `@noble/curves` | 7 |
| ML-KEM-768 | `@stenvault/pqc-wasm` (RustCrypto) | `@noble/post-quantum` | 6 |
| ML-DSA-65 | `@stenvault/pqc-wasm` (RustCrypto) | `@noble/post-quantum` | 7 |

### 15.6 Integration Pipeline Tests

Eleven numbered test files validate the full cryptographic pipeline end-to-end. Each stage tests a complete flow from key derivation through encryption, storage, and decryption.

| # | Stage | Validates |
|:-:|-------|-----------|
| 01 | V4 Hybrid Pipeline | X25519 + ML-KEM-768 KEM, Ed25519 + ML-DSA-65 signatures |
| 02 | Key Hierarchy | Master Key → derived keys → per-file keys |
| 03 | Password Change | Argon2id → new KEK → re-wrap Master Key |
| 04 | HKDF Domain Separation | Per-purpose salts produce independent keys |
| 05 | AAD Binding | Metadata tampering invalidates GCM tag |
| 06 | Signature AAD Binding | File integrity signatures cover AAD |
| 07 | Organization Tenant Isolation | OMK boundaries prevent cross-org access |
| 08 | Shamir Recovery | K-of-N threshold reconstruction |
| 09 | CVEF Backward Compatibility | v1.2/v1.3/v1.4 reader acceptance |
| 10 | Public Send URL Fragment | Key-in-fragment confidentiality |
| 11 | UES Fast Path | Device-bound fast-unlock round-trip |

### 15.7 Security Regression Suite

Every security finding from StenVault's internal and adversarial security reviews is mapped to a regression test in `tests/security/findings-regression.test.ts`. A regression that reintroduces a fixed vulnerability fails the build.

- 80 findings covered (SEC-001 through SEC-080, with resolved duplicates)
- Status classifications: `FIXED` (regression guard active), `ACCEPTED` (documented design decision), `FALSE POSITIVE` (rationale recorded)
- Coverage matrix spans authentication, cryptographic primitives, input validation, secrets management, rate limiting, and audit logging

Additional dedicated security test files:

| File | Focus | Tests |
|------|-------|:-:|
| `audit-hardening.test.ts` | Audit log tamper-resistance | 182 |
| `csp-headers.test.ts` | Content Security Policy strictness | 8 |
| `xss-prevention.test.ts` + `xss-e2e.spec.ts` | XSS injection coverage (DOM + E2E) | 13 |
| `svg-sanitization.test.ts` | SVG safe-list validation | 8 |
| `jwt-storage-audit.test.ts` | JWT never exposed to JavaScript | 6 |
| `cryptokey-extractable.test.ts` | Master Key non-extractability enforcement | 5 |
| `worker-wasm-isolation.test.ts` | PQC keys confined to Web Worker memory | 7 |
| `filename-sanitization.test.ts` | Injection-safe filenames | 10 |
| `share-url-sanitization.test.ts` | URL parameter validation | 6 |
| `markdown-chat-sanitization.test.ts` | Chat rendering safety | 5 |
| `report-abuse-sanitization.test.ts` | Abuse report input hardening | 4 |

### 15.8 End-to-End Browser Tests

Playwright-driven full-browser tests validate that the cryptographic guarantees hold through the actual user interface — not just at the library level.

| Scenario File | Flows |
|---------------|:-:|
| `auth.spec.ts` | 32 |
| `files.spec.ts` | 18 |
| `sharing.spec.ts` | 16 |
| `chat-file-share.spec.ts` | 26 |
| `pipeline.spec.ts` | 8 |
| `xss-security.spec.ts` | 5 |

### 15.9 Verification Posture

The combination of these test categories provides defense-in-depth for cryptographic correctness:

- **Standards agreement** (Wycheproof, NIST KAT) — catches misinterpretations of the specification
- **Property testing** (fast-check) — catches bugs that hand-picked cases miss
- **Timing analysis** (dudect) — catches side-channel leaks invisible to functional tests
- **Cross-implementation** — catches bugs confined to a single library
- **Integration pipelines** — catches mis-wiring between correct primitives
- **Security regression** — prevents reintroduction of past vulnerabilities
- **End-to-end** — catches UI/crypto seam issues

No layer alone is sufficient. The combined suite is designed so that a cryptographic bug has to simultaneously evade all seven categories to reach production — a configuration that is mathematically rare rather than merely improbable.

An independent third-party audit remains planned and will complement — not replace — this continuous verification regime.

---

## Appendix A: Cryptographic Constants Reference

| Constant | Value | Usage |
|----------|-------|-------|
| AES-256-GCM key | 32 bytes (256 bits) | File encryption, filename encryption |
| AES-256-GCM IV | 12 bytes (96 bits) | Per-chunk initialization vector |
| AES-256-GCM tag | 16 bytes (128 bits) | Authentication tag |
| Argon2id memoryCost | 47,104 KiB (46 MiB) | Key derivation |
| Argon2id timeCost | 1 iteration | Key derivation |
| Argon2id parallelism | 1 | Key derivation |
| Argon2id hashLength | 32 bytes | KEK output |
| X25519 public key | 32 bytes | Classical key exchange |
| X25519 secret key | 32 bytes | Classical key exchange |
| ML-KEM-768 public key | 1,184 bytes | Post-quantum key encapsulation |
| ML-KEM-768 secret key | 2,400 bytes | Post-quantum key decapsulation |
| ML-KEM-768 ciphertext | 1,088 bytes | Encapsulated shared secret |
| ML-KEM-768 shared secret | 32 bytes | Combined with classical via HKDF |
| Ed25519 public key | 32 bytes | Classical digital signature |
| Ed25519 secret key | 64 bytes | Classical digital signature (RFC 8032 seed ‖ public) |
| Ed25519 signature | 64 bytes | Classical signature output |
| ML-DSA-65 public key | 1,952 bytes | Post-quantum digital signature |
| ML-DSA-65 signing key seed | 32 bytes (FIPS 204 canonical) | Persisted form; expanded to 4,032 bytes in memory at sign time |
| ML-DSA-65 signature | 3,309 bytes | Post-quantum signature output |
| AES-KW wrapped key | input + 8 bytes | RFC 3394 key wrapping overhead |
| HKDF-SHA256 output | 32 bytes | Key derivation from shared secrets |
| HMAC-SHA256 output | 32 bytes (hex: 64 chars) | Content hash, integrity tags |
| CVEF magic header | `0x43 0x56 0x45 0x46` ("CVEF") | File format identification |
| CVEF fixed header | 9 bytes (magic + version + length) | Fixed header overhead |
| Chunk size | 65,536 bytes (64 KiB) | Streaming encryption chunk size |
| CSRF token (server) | 24 hours | Double-submit cookie lifetime |
| CSRF token (client) | 45 minutes | Client-side proactive refresh interval |
| JWT access token | 30 minutes | Short-lived session token |
| JWT refresh token | 7 days | Long-lived rotation token |
| Recovery code format | `XXXX-XXXX` (10 codes) | Backup authentication |
| Shamir GF field | GF(2^8) = 256 elements | Secret sharing arithmetic |
| Key fingerprint | SHA-256, first 16 bytes, hex | 32-char key identifier |

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **AES-256-GCM** | Advanced Encryption Standard with 256-bit key in Galois/Counter Mode. Provides both confidentiality and authenticity. |
| **AES-KW** | AES Key Wrap (RFC 3394). Wraps a key with another key, adding 8 bytes of integrity check. |
| **Argon2id** | Memory-hard password hashing function. Winner of the Password Hashing Competition (2015). Recommended by OWASP 2024. |
| **CSRF** | Cross-Site Request Forgery. Attack where a malicious site tricks a user's browser into making authenticated requests. |
| **CSP** | Content Security Policy. HTTP header that restricts which resources a page can load. |
| **CVEF** | Crypto Vault Encrypted File. Binary file format with metadata header and encrypted data. |
| **ECDH** | Elliptic Curve Diffie-Hellman. Key agreement protocol using elliptic curve cryptography. |
| **Ed25519** | Edwards-curve Digital Signature Algorithm on Curve25519 (RFC 8032). Fast, secure digital signatures. |
| **FIPS 203** | Federal Information Processing Standard for ML-KEM (Module-Lattice Key Encapsulation Mechanism). |
| **FIPS 204** | Federal Information Processing Standard for ML-DSA (Module-Lattice Digital Signature Algorithm). |
| **GF(2^8)** | Galois Field with 256 elements. Finite field arithmetic used in Shamir Secret Sharing. |
| **HKDF** | HMAC-based Key Derivation Function (RFC 5869). Derives keys from input key material. |
| **HMAC** | Hash-based Message Authentication Code. Provides message integrity and authenticity. |
| **HSTS** | HTTP Strict Transport Security. Forces browsers to use HTTPS only. |
| **IV** | Initialization Vector. Random value used to ensure identical plaintexts produce different ciphertexts. |
| **JWT** | JSON Web Token (RFC 7519). Compact, URL-safe token format for claims. |
| **KDF** | Key Derivation Function. Derives cryptographic keys from passwords or other key material. |
| **KEK** | Key Encryption Key. A key used to encrypt other keys. |
| **KEM** | Key Encapsulation Mechanism. Asymmetric primitive for establishing shared secrets. |
| **MFA** | Multi-Factor Authentication. Requires two or more verification methods. |
| **MK** | Master Key. The root encryption key from which all other keys are derived or wrapped. |
| **ML-DSA-65** | Module-Lattice Digital Signature Algorithm, security level 3 (FIPS 204). Post-quantum signature scheme. |
| **ML-KEM-768** | Module-Lattice Key Encapsulation Mechanism, security level 3 (FIPS 203). Post-quantum key exchange. |
| **OMK** | Organization Master Key. Root encryption key for an organization's shared vault. |
| **OPAQUE** | Oblivious Pseudo-Random Function with Asymmetric Password-Authenticated Key Exchange (RFC 9807). |
| **OPRF** | Oblivious Pseudo-Random Function. Allows evaluation of a PRF without revealing input to the server. |
| **OTS** | OpenTimestamps. Protocol for anchoring timestamps to the Bitcoin blockchain. |
| **PQC** | Post-Quantum Cryptography. Cryptographic algorithms resistant to quantum computer attacks. |
| **Shamir Secret Sharing** | Cryptographic scheme that splits a secret into N shares, requiring K to reconstruct. |
| **TLS** | Transport Layer Security. Cryptographic protocol for secure communication over networks. |
| **TOTP** | Time-based One-Time Password (RFC 6238). Codes that change every 30 seconds. |
| **UES** | User Entropy Seed. Device-specific secret for fast vault unlock on trusted devices. |
| **WASM** | WebAssembly. Binary instruction format for portable high-performance code in browsers. |
| **X25519** | Elliptic curve Diffie-Hellman key exchange using Curve25519. Fast, constant-time. |
| **Zero-Knowledge** | Architecture where the service provider has no ability to access user data, by design. |

---

*StenVault Security Whitepaper v1.3 — April 2026*
*This document describes the cryptographic architecture and security properties of StenVault as deployed in production.*
*For questions or to report security issues, contact security@stenvault.com.*

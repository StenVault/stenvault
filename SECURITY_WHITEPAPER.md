# StenVault Security Whitepaper

**Version 1.1 — March 2026**
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
| **Supply chain attacks** | If the web application code served to the browser is tampered with, it could exfiltrate keys. Mitigations: CSP blocks external scripts, `--frozen-lockfile` in CI, exact version pinning for crypto dependencies, `strictDepBuilds`, `pnpm audit` in CI, trust policy (`no-downgrade`), and 3-day release cooldown for new package versions. These reduce but do not eliminate this risk. |

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
│  │  ✓ Sees: content hash (HMAC of ciphertext, not plaintext)  │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Even if the server's database and object storage were completely compromised, an attacker would only obtain encrypted data that cannot be decrypted. The encryption keys exist only in the user's browser memory during an active session, derived from a password the server never sees.

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

Progressive lockout after failed login attempts:

| Failed Attempts | Response |
|:---:|----------|
| 5 | Short lockout period |
| 10 | Longer lockout period |
| 15+ | Extended lockout (escalating) |

Lockout checks run before the OPAQUE handshake to prevent wasting OPRF computation on locked accounts. A `Retry-After` header informs the client when to retry.

### MFA/TOTP

StenVault supports two-factor authentication using Time-based One-Time Passwords (TOTP, RFC 6238):

1. Server generates a random 32-byte TOTP secret, encrypted before database storage
2. User scans QR code and verifies with a TOTP code
3. 10 backup codes generated (stored as HMAC-SHA256 digests for timing-safe comparison)
4. On login with MFA enabled, a short-lived challenge token is issued; full session tokens are granted only after TOTP verification
5. Anti-replay protection per RFC 6238 Section 5.2

### Session Management

- **Access tokens**: 15-minute lifetime (JWT, HS256), delivered as HttpOnly cookie (Secure, SameSite) — not readable by JavaScript
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

CVEF (Crypto Vault Encrypted File) is the binary file format used for all encrypted files. It prepends a header containing encryption metadata before the encrypted data.

```
┌──────────────────────────────────────────────────────────────────┐
│                   CVEF v1.2 BINARY LAYOUT                         │
│                                                                   │
│  Offset  Size    Field                                            │
│  ──────  ──────  ────────────────────────────────────────         │
│  0x00    4 bytes Magic: "CVEF" (0x43 0x56 0x45 0x46)             │
│  0x04    1 byte  Format Version: 1                                │
│  0x05    4 bytes Metadata Length (big-endian uint32)              │
│  0x09    N bytes Metadata JSON (UTF-8 encoded)                   │
│  0x09+N  rest    Encrypted Data (AES-256-GCM chunks)             │
│                                                                   │
│  Metadata JSON fields:                                            │
│  ├── version: "1.2"                                               │
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
│  ├── chunked (optional):                                          │
│  │   ├── count, chunkSize (5 MiB)                                 │
│  │   └── ivs (per-chunk IVs, Base64 array)                       │
│  └── signatureParams (v1.3, optional):                            │
│      ├── signatureAlgorithm: "ed25519-ml-dsa-65"                  │
│      ├── signingContext: "FILE"                                    │
│      ├── signerFingerprint, signerKeyVersion                      │
│      ├── classicalSignature (64B, Base64)                         │
│      └── pqSignature (3309B, Base64)                              │
└──────────────────────────────────────────────────────────────────┘
```

**Format versions**: v1.2 (hybrid PQC: X25519 + ML-KEM-768) and v1.3 (hybrid signatures: Ed25519 + ML-DSA-65). v1.3 is a metadata-only addition fully compatible with v1.2.

Maximum metadata size: 2 MB (validated during parsing). Typical header overhead is approximately 1.8 KB for v1.2, plus ~4.4 KB for v1.3 with signatures.

### 5.3 Streaming/Chunked Encryption

Large files are split into 5 MiB chunks for streaming encryption and decryption:

- Each chunk is encrypted independently with AES-256-GCM
- Each chunk uses a unique IV derived deterministically from a base IV and the chunk index
- This enables parallel encryption/decryption and resumable transfers
- Files larger than 500 MB use S3 multipart upload, where each part is encrypted independently

The chunk size of 5 MiB balances memory efficiency (the entire file is never held in memory) with overhead per chunk (IV derivation + GCM authentication tag per chunk).

### 5.4 Filename Encryption

Filenames are encrypted client-side to prevent the server from learning what files a user has:

1. **Key derivation**: `HKDF-SHA256(MasterKey, fileId, "stenvault-filename")` produces a per-file filename key
2. **Encryption**: `AES-256-GCM(FilenameKey, IV, filename)` produces the encrypted filename
3. **Storage**: The server stores the encrypted filename and IV; a server-side placeholder (e.g., `encrypted.ext`) is used for internal operations
4. **Decryption**: The client decrypts filenames on-the-fly and caches the results locally

If decryption fails or the master key is unavailable, the UI displays `[Encrypted]` as a safe fallback.

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
3. Client encrypts the file in 5 MiB chunks
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

---

## 10. Web Security

### CSRF Protection

StenVault implements double-submit cookie CSRF protection:

1. Client obtains a token from a dedicated endpoint (stored as a cookie)
2. Client sends the token in an `x-csrf-token` header on every mutating request
3. Server validates that the header value matches the cookie value
4. Token has a 45-minute TTL on the client; the server rotates tokens periodically

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
│  ├── Primary: Redis (~1ms lookup)                                │
│  └── Fallback: PostgreSQL (~5ms lookup)                          │
│  If Redis unavailable → fail CLOSED (reject all tokens)          │
└──────────────────────────────────────────────────────────────────┘
```

Each login creates a "token family" — a chain of refresh tokens linked by a family ID. When a refresh token is used, the server checks that the presented token ID matches the expected current token. If a mismatch is detected (indicating that a previously-rotated token was reused), the family is marked as compromised and all sessions for the user are revoked. This means that if an attacker steals a refresh token, the first use by either party (attacker or legitimate user) that creates a mismatch triggers automatic revocation.

If the Redis cache is unavailable, the system fails **closed** — tokens cannot be verified as non-revoked, so they are rejected. This prevents a cache outage from creating a window where revoked tokens are accepted.

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
| **Session hijacking** | HttpOnly access token (15 min, not readable by JS). Refresh tokens single-use with rotation in HttpOnly cookie. Silent refresh on 401. CSRF double-submit. | §10 |
| **XSS** | CSP `script-src 'self' 'wasm-unsafe-eval'` (no `unsafe-inline`). HttpOnly cookies prevent token exfiltration. Master Key as non-extractable CryptoKey. PQC keys isolated in Web Worker. React auto-escapes output. | §10 |
| **CSRF** | Double-submit cookie pattern with dedicated token endpoint. SameSite cookie attribute. | §10 |
| **Clickjacking** | X-Frame-Options: DENY. CSP frame-ancestors: 'none'. | §10 |
| **Timing attacks** | `crypto.timingSafeEqual` for all secret comparisons (backup codes, share codes, API keys). | §3 |
| **Replay attacks** | TOTP anti-replay (RFC 6238 §5.2). Nonce-based CSRF tokens. JWT `jti` uniqueness. | §3 |
| **Metadata leakage** | Filenames encrypted. Content hash is HMAC of ciphertext (not plaintext). File sizes visible but content opaque. | §5.5 |
| **Key loss** | Recovery codes (10x HMAC-hashed). Shamir secret sharing (K-of-N). UES device-based recovery. | §7, §8 |
| **Insider threat** | Zero-knowledge means even operators cannot access data. Audit logs track all admin actions. | §2 |

---

## 12. Comparison with Industry

### Authentication Protocol Comparison

| Property | StenVault (OPAQUE) | Proton (SRP) | Tresorit (bcrypt + TLS) | MEGA (bcrypt + TLS) | Filen (bcrypt + TLS) |
|----------|:-:|:-:|:-:|:-:|:-:|
| Password never leaves client | Yes | Yes | No | No | No |
| Formal security proof | Yes | No | No | No | No |
| RFC standardized | RFC 9807 | RFC 2945 | N/A | N/A | N/A |
| Offline dictionary resistance (server breach) | Yes | Partial | No | No | No |
| Mutual authentication | Yes | Yes | No | No | No |

### Post-Quantum Cryptography Comparison

| Property | StenVault | Proton | Tresorit | MEGA | Filen |
|----------|:-:|:-:|:-:|:-:|:-:|
| PQC key exchange | ML-KEM-768 (FIPS 203) | None | None | None | None |
| PQC signatures | ML-DSA-65 (FIPS 204) | None | None | None | None |
| Hybrid approach | X25519 + ML-KEM-768 | N/A | N/A | N/A | N/A |
| Harvest-now-decrypt-later protection | Yes | No | No | No | No |

### Feature Comparison

| Feature | StenVault | Proton Drive | Tresorit | MEGA | Filen |
|---------|:-:|:-:|:-:|:-:|:-:|
| Zero-knowledge encryption | Yes | Yes | Yes | Yes | Yes |
| Post-quantum encryption | Yes (ML-KEM-768) | No | No | No | No |
| Post-quantum signatures | Yes (ML-DSA-65) | No | No | No | No |
| OPAQUE authentication | Yes | No (SRP) | No | No | No |
| Hybrid KEM (per-file keys) | Yes | No | No | No | No |
| Filename encryption | Yes | Yes | Yes | Partial | Yes |
| Shamir secret recovery | Yes (K-of-N) | No | No | No | No |
| Proof-of-existence | Yes (OpenTimestamps) | No | No | No | No |
| Hybrid digital signatures | Yes (Ed25519 + ML-DSA-65) | No | No | No | No |
| E2E chat | Yes (hybrid KEM) | No (separate product) | No | Yes | No |
| Open source | Planned | Partial | No | Partial | Yes |
| Independent security audit | Planned | Yes | Yes | Yes | No |

*Note: Comparison data is based on publicly available documentation as of March 2026. Competitors may have features in development that are not publicly documented.*

### Encryption Algorithm Comparison

| Algorithm | StenVault V4 | Proton | Tresorit | MEGA |
|-----------|:---:|:---:|:---:|:---:|
| Symmetric | AES-256-GCM | AES-256 | AES-256 | AES-128 |
| Key exchange | X25519 + ML-KEM-768 | X25519 | RSA-4096 | RSA-2048 |
| Signatures | Ed25519 + ML-DSA-65 | Ed25519 | RSA-4096 | RSA-2048 |
| KDF | Argon2id (46 MiB) | bcrypt | bcrypt | PBKDF2 |
| Key wrapping | AES-KW / AES-GCM | PGP | Proprietary | Proprietary |
| File format | CVEF (documented) | OpenPGP | Proprietary | Proprietary |

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

### No Independent Security Audit

StenVault has not yet undergone a formal, independent security audit by a third-party firm. The cryptographic architecture has been designed following established standards and best practices, but independent verification is planned. Users requiring audited security should consider this when evaluating StenVault for sensitive use cases.

### No FIDO2/WebAuthn Support

StenVault currently supports TOTP (RFC 6238) for multi-factor authentication. FIDO2/WebAuthn hardware key support is planned, which would provide:
- Phishing-resistant authentication
- Protection against keyloggers during login
- Hardware-bound credentials

### File Size Metadata Visible

While file contents and filenames are encrypted, the server can observe:
- File sizes (before and after encryption)
- Upload and download timestamps
- Access frequency and patterns
- Number of files per user
- MIME types (for thumbnail generation and streaming)

Full metadata encryption (including file sizes) would require significant padding overhead and is not currently implemented.

### Single-Server Deployment

StenVault currently runs as a single service on Railway. This means:
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

### Planned Improvements

- **Independent security audit** by a recognized third-party firm
- **FIDO2/WebAuthn** hardware key authentication
- **HSM integration** (Phase 3.2) for server-side key management
- **Certificate transparency** for verifying the web application code
- **Multi-region deployment** for availability and redundancy
- **Mobile application** (Kotlin Multiplatform) with native cryptographic implementations

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
| Chunk size | 5,242,880 bytes (5 MiB) | Streaming encryption chunk size |
| CSRF token TTL | 45 minutes (client-side) | Token refresh interval |
| JWT access token | 15 minutes | Short-lived session token |
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

*StenVault Security Whitepaper v1.0 — March 2026*
*This document describes the cryptographic architecture and security properties of StenVault as deployed in production.*
*For questions or to report security issues, contact security@stenvault.com.*

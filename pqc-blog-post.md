# Hybrid Post-Quantum Encryption in the Browser: What I Learned Shipping ML-KEM-768 + X25519 in Production

Most post-quantum cryptography you encounter today lives in TLS. Your browser negotiates X25519MLKEM768 with Cloudflare, and about 38% of HTTPS traffic already uses it. You don't have to do anything — it happens at the transport layer.

But what about data at rest? If you're building client-side encryption — the kind where the server stores ciphertext and never sees plaintext — TLS doesn't help you. Your files sit in a database wrapped with classical crypto, waiting to be harvested now and decrypted later.

I built StenVault, a zero-knowledge encrypted cloud storage platform. All crypto runs in the browser. The server stores ciphertext. This post is about what it took to ship hybrid PQC (X25519 + ML-KEM-768 for key encapsulation, Ed25519 + ML-DSA-65 for signatures) in a production web app, and the problems I ran into that nobody talks about in the specs.

## The architecture in 30 seconds

Every file gets its own random 32-byte key. That key is protected by two independent key exchange mechanisms — classical X25519 ECDH and post-quantum ML-KEM-768. Both produce a 32-byte shared secret. Those secrets are concatenated and fed through HKDF-SHA256 to derive a hybrid KEK, which wraps the file key via AES-KW. The file itself is encrypted with AES-256-GCM.

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
   AES-256-GCM(FK, file)
```

To decrypt, you need to break both X25519 and ML-KEM-768. If ML-KEM turns out to have a flaw nobody found, X25519 still holds. If a quantum computer shows up, ML-KEM still holds. Belt and suspenders.

Signatures work the same way: Ed25519 + ML-DSA-65 dual signatures on every file. Both must verify.

## The real problem: ML-KEM in the browser

NIST finalized FIPS 203 (ML-KEM) and FIPS 204 (ML-DSA) in August 2024. As of today, the WebCrypto API does not support either. There's a draft spec by Daniel Huigens, and browsers already use ML-KEM internally for TLS, but the API isn't exposed to JavaScript yet.

So you have three options:

1. Wait for WebCrypto to ship ML-KEM. Could be 2026. Could be 2027. X25519 took years to go from TLS to WebCrypto.
2. Use a JavaScript implementation. Noble-post-quantum exists and is solid, but it's pure JS — no constant-time guarantees, performance depends on the JS engine.
3. Use WASM. Compile a C implementation to WebAssembly and call it from JS.

I went with option 3 — liboqs compiled to WASM. Here's why, and what it costs.

## WASM tradeoffs

liboqs is the Open Quantum Safe project's C library. It implements all NIST-standardized PQC algorithms. Compiling it to WASM gives you near-native performance and the same code that's been reviewed by the OQS community.

The good:

- ML-KEM-768 keygen, encapsulate, and decapsulate all run in under 1ms on modern hardware. You don't notice it. The WASM overhead is negligible compared to the Argon2id key derivation (~500ms) that happens on every vault unlock.
- The WASM binary is a one-time load. After that, function calls are fast.
- You get the exact same implementation running on every browser. No engine-specific behavior.

The bad:

- Bundle size. liboqs WASM is not small. You're adding meaningful bytes to your initial load. For a storage app where users upload/download files, this is acceptable. For a lightweight widget, it wouldn't be.
- No constant-time guarantees from the WASM runtime. WebAssembly spec doesn't mandate constant-time execution. In practice, V8 and SpiderMonkey compile WASM to native code that's close to constant-time for arithmetic operations, but this is an implementation detail, not a guarantee. For ML-KEM where the main threat is harvest-now-decrypt-later (not side-channel attacks on the client), this is an acceptable tradeoff.
- Memory management. WASM has its own linear memory. You need to be careful about zeroing key material after use. JavaScript's garbage collector doesn't give you control over when memory is freed.

## The key size problem

This was the first thing that surprised me. ML-KEM-768 secret keys are 2400 bytes. And for a while, I was also storing ML-DSA-65 signing keys in their expanded 4032-byte form — that was a mistake I only caught later.

AES-KW (RFC 3394), which I use for wrapping keys throughout the system, operates on 64-bit blocks and works best with keys up to a few hundred bytes. Wrapping a 2400-byte key with AES-KW is technically possible but awkward.

My solution has two parts. For ML-KEM-768 (2400 bytes, genuinely large), I use AES-256-GCM with a separate IV. For ML-DSA-65, FIPS 204 §3.6 says you can persist just the 32-byte seed and re-expand it at signing time via `ExpandedSigningKey::from_seed`. Once I switched to that, ML-DSA-65 signing keys became a clean 32 bytes — wrappable with standard AES-KW, same path as X25519 secrets. Ed25519 secret keys happen to be 64 bytes (the reference implementation stores the 32-byte seed concatenated with the 32-byte public key), so those go through AES-256-GCM as well.

So the rule ended up being: exactly 32 bytes goes through AES-KW; anything else goes through AES-256-GCM. Two paths, but with a crisp boundary.

## The CVEF file format

Every encrypted file starts with a CVEF header (Crypto Vault Encrypted File). It's a binary format: 4-byte magic (`CVEF`), 1-byte version, 4-byte metadata length, then a JSON metadata block, then encrypted data.

The metadata block carries everything needed for decryption:

- Algorithm identifiers (so future versions can use different algorithms)
- The ephemeral X25519 public key (32 bytes)
- The ML-KEM-768 ciphertext (1088 bytes)
- The wrapped file key (40 bytes)
- IVs and chunk information for large files

For v1.3, signature metadata is appended: the Ed25519 signature (64 bytes) and the ML-DSA-65 signature (3309 bytes).

Total overhead: ~1.8KB for v1.2, ~5.2KB for v1.3 with signatures. On a 10MB file, that's 0.05%. On a 1KB file, it's 5x overhead. For my use case (cloud storage), the minimum file size where this makes sense is a few KB, which covers virtually all real files.

The JSON metadata with explicit algorithm identifiers is deliberate. When NIST standardizes new algorithms or deprecates existing ones, the file format handles it without breaking existing files. Each file declares what it needs for decryption.

## Hybrid combiner: why HKDF and not XOR

The two shared secrets (X25519 and ML-KEM-768) need to be combined into a single key. The simplest approach is XOR. Some implementations do this.

I use HKDF-SHA256 with a context string (`stenvault-hybrid-file-key`). The context string provides domain separation — you can't use a key derived for StenVault file encryption as a key for something else, even if the input material is identical. HKDF also handles the case where one of the shared secrets has less than full entropy (though both X25519 and ML-KEM-768 should produce uniformly random output).

This follows the same pattern that TLS 1.3 uses for its hybrid key schedule. It's not novel, and that's the point.

## What I'd do differently

If I were starting today, I'd look hard at mlkem-wasm by Dmitry Chestnykh. It's a lightweight WASM package (53KB unminified, 14KB brotli) with a WebCrypto-compatible API, specifically designed as a bridge until browsers ship native ML-KEM. When WebCrypto catches up, you swap `mlkem` for `crypto.subtle` and you're done.

When I started, this package didn't exist. liboqs gave me both ML-KEM and ML-DSA from one dependency, which simplified the build. But if you only need ML-KEM, the purpose-built WASM package is a better fit.

## Numbers

The full system (client + backend) has 3,900+ tests across 145 files. The crypto code specifically has extensive test coverage — KEM round-trips, signature verification, CVEF parsing, chunk encryption, key wrapping edge cases.

No external audit yet. The client code is open-source (GPL-3.0) and the whitepaper documents every cryptographic flow, database schema, and architectural decision. The audit and tooling repos provide automated security scanning with tree-sitter AST parsing and AI-assisted triage.

## Should you do this?

If you're building encrypted storage, encrypted messaging, or anything where data persists and could be harvested, yes. The performance cost of hybrid PQC in the browser is negligible. The complexity cost is real but manageable.

If your encryption is purely in-transit (TLS), your browser is probably already doing hybrid PQC. You don't need to do anything.

The harvest-now-decrypt-later threat is real. Intelligence agencies and state actors are already storing encrypted traffic. If the data you're protecting today might still be sensitive in 10-20 years, the time to add PQC is now. NIST agrees — that's why they standardized ML-KEM.

---

StenVault is open-source (client): [github.com/StenVault/stenvault](https://github.com/StenVault/stenvault)

Whitepaper: [SECURITY_WHITEPAPER.md](https://github.com/StenVault/stenvault/blob/main/SECURITY_WHITEPAPER.md)

Audit pipeline: [github.com/StenVault/stenvault-audit](https://github.com/StenVault/stenvault-audit)

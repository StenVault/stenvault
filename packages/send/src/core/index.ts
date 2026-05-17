// @stenvault/send/core
//
// Shared types, constants, and Zod schemas consumed by both client and
// server. Intentionally DOM-free — the fragment-key crypto lives under
// the separate "@stenvault/send/core/fragment" subpath so server-side
// importers (apps/api) aren't forced to pull in CryptoKey / SubtleCrypto
// type surface they don't need.

export * from "./types";

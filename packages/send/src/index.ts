// @stenvault/send
//
// Barrel — prefer importing from the dedicated subpaths so bundlers and
// the ESLint boundary rules can reason about which domain is loaded:
//
//   import { ... } from "@stenvault/send/core";    // types, fragment crypto
//   import { ... } from "@stenvault/send/client";  // browser upload/download
//   import { ... } from "@stenvault/send/server";  // backend session logic
//
// The root entry exists mostly for tooling that can't handle subpath
// exports gracefully. Day-to-day code should never import from here.

export * as core from "./core";

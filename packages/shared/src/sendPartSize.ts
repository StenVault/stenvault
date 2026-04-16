/**
 * Public Send multipart upload — part size.
 *
 * Shared between backend (session creation, claim) and frontend (chunking,
 * encryption, upload). Must be identical on both sides: the client derives a
 * per-chunk IV from `(baseIv, chunkIndex)`, so any desync between the chunk
 * size used on upload and on download breaks AES-GCM authentication.
 *
 * R2 caps multipart uploads at 10 000 parts per object. At 16 MiB parts,
 * the theoretical ceiling is 160 GiB — well above the 50 GiB Business tier
 * promise, leaving headroom for encryption overhead without hitting the cap.
 */
export const SEND_PART_SIZE = 16 * 1024 * 1024;

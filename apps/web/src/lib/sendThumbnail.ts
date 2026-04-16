/**
 * Thumbnail and text snippet generation for Send files.
 * Pure DOM/canvas operations — no React dependency.
 */

const MAX_THUMB_DIM = 256;
const WEBP_QUALITY = 0.7;

/**
 * Generate a thumbnail from an image or video file.
 * Returns a WebP blob ~50KB or null if unsupported.
 */
export async function generateThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type.startsWith("image/")) {
      return await generateImageThumbnail(file);
    }
    if (file.type.startsWith("video/")) {
      return await generateVideoThumbnail(file);
    }
  } catch {
    // Thumbnail generation is best-effort
  }
  return null;
}

function generateImageThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > height) {
        if (width > MAX_THUMB_DIM) { height = (height * MAX_THUMB_DIM) / width; width = MAX_THUMB_DIM; }
      } else {
        if (height > MAX_THUMB_DIM) { width = (width * MAX_THUMB_DIM) / height; height = MAX_THUMB_DIM; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), "image/webp", WEBP_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function generateVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.preload = "metadata";
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 4);
    };
    video.onseeked = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { videoWidth: width, videoHeight: height } = video;
      if (width > height) {
        if (width > MAX_THUMB_DIM) { height = (height * MAX_THUMB_DIM) / width; width = MAX_THUMB_DIM; }
      } else {
        if (height > MAX_THUMB_DIM) { width = (width * MAX_THUMB_DIM) / height; height = MAX_THUMB_DIM; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), "image/webp", WEBP_QUALITY);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}

/**
 * Read first 500 chars from a text file.
 */
export async function readTextSnippet(file: File): Promise<string | null> {
  try {
    if (!file.type.startsWith("text/")) return null;
    const slice = file.slice(0, 2000); // Read more to handle multi-byte
    const text = await slice.text();
    return text.slice(0, 500);
  } catch {
    return null;
  }
}

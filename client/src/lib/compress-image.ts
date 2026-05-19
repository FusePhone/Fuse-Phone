const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.80;

export function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return Promise.resolve(file);

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;

      if (w <= MAX_DIMENSION && h <= MAX_DIMENSION && file.size < 500_000) {
        resolve(file);
        return;
      }

      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const compressed = new File([blob], file.name, { type: "image/jpeg", lastModified: file.lastModified });
            resolve(compressed);
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

export function compressBlob(blob: Blob, fileName: string): Promise<File> {
  const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
  return compressImage(file);
}

export const MAX_UPLOAD_BYTES = 1_000_000; // dưới 1 MB
const MAX_DIMENSION = 1600; // cạnh dài tối đa lúc bắt đầu nén
const MIN_DIMENSION = 320; // không thu nhỏ quá mức này
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  wasCompressed: boolean;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // thử cách dự phòng bên dưới
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function toJpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "image"}.jpg`;
}

export async function compressImage(file: File): Promise<CompressResult> {
  // Đã đủ nhỏ thì giữ nguyên để không mất chất lượng
  if (file.size <= MAX_UPLOAD_BYTES) {
    return { file, originalBytes: file.size, compressedBytes: file.size, wasCompressed: false };
  }

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("Không đọc được ảnh này. Vui lòng thử ảnh khác.");
  }

  try {
    const longest = Math.max(decoded.width, decoded.height);
    let target = Math.min(longest, MAX_DIMENSION);

    while (target >= MIN_DIMENSION) {
      const scale = target / longest;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");

      // Nền trắng để ảnh PNG trong suốt không bị đen khi chuyển sang JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) {
          return {
            file: new File([blob], toJpegName(file.name), { type: "image/jpeg" }),
            originalBytes: file.size,
            compressedBytes: blob.size,
            wasCompressed: true,
          };
        }
      }

      target = Math.floor(target * 0.8);
    }

    throw new Error("Không thể nén ảnh xuống dưới 1 MB. Vui lòng thử ảnh khác.");
  } finally {
    decoded.release();
  }
}
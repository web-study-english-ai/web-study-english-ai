export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTR = ALLOWED_IMAGE_TYPES.join(",");

// Chỉ để tránh treo máy với ảnh khổng lồ, BE chỉ nhận tối đa 5 MB (sau khi đã nén)
export const MAX_RAW_BYTES = 25 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.";
  if (file.size === 0) return "Tệp ảnh bị trống.";
  if (file.size > MAX_RAW_BYTES) return "Ảnh quá lớn (tối đa 25 MB). Vui lòng chọn ảnh nhỏ hơn.";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
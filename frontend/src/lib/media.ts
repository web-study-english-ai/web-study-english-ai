const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// imageUrl của BE có thể là đường dẫn đầy đủ (https://...) hoặc tương đối (/api/vision/images/x.jpg)
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  try {
    return new URL(url, new URL(API_URL).origin).toString();
  } catch {
    return null;
  }
}
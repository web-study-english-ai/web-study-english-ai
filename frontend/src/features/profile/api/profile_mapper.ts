import { ProfileData } from "../types/profile_types";

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

// Lấy giá trị đầu tiên có tồn tại, tìm ở cấp ngoài rồi tới các nhóm cài đặt lồng bên trong
const pick = (sources: Raw[], keys: string[]): unknown => {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) return source[key];
    }
  }
  return undefined;
};

// Chấp nhận "2000-05-20" hoặc ISO "2000-05-20T00:00:00.000Z", trả về YYYY-MM-DD
function toDateInput(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

export function mapProfile(raw: Raw): ProfileData {
  const base: Raw = isObj(raw.user) ? raw.user : isObj(raw.data) ? raw.data : raw;
  const nested = ["settings", "preferences", "learningSettings"]
    .map((k) => base[k])
    .filter(isObj);
  const sources: Raw[] = [base, ...nested];

  const avatar = pick(sources, ["avatarUrl", "avatar", "picture"]);

  return {
    name: str(pick(sources, ["name", "fullName", "displayName"])),
    email: str(pick(sources, ["email"])),
    avatarUrl: typeof avatar === "string" && avatar ? avatar : null,
    phone: str(pick(sources, ["phone", "phoneNumber"])),
    address: str(pick(sources, ["address"])),
    birthDate: toDateInput(pick(sources, ["dateOfBirth", "birthDate", "dob"])),
  };
}
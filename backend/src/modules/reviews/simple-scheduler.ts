import { CardState } from '@prisma/client';

const MOT_NGAY_MS = 24 * 60 * 60 * 1000;
const TOI_DA_NGAY = 365;

/** Khoảng lịch lượt đầu, khớp nhãn trên bốn nút của thiết kế Figma */
const KHOANG_LUOT_DAU: Record<number, number> = { 1: 10 / 1440, 2: 1, 3: 4, 4: 8 };
const HE_SO_NHAN: Record<number, number> = { 2: 1.2, 3: 2.5, 4: 3.5 };

export interface KetQuaLich {
  stateAfter: CardState;
  nextIntervalDays: number;
  dueAt: Date;
  laQuen: boolean;
}

export function tinhLich(
  stateBefore: CardState,
  rating: number,
  khoangTruocNgay: number | null,
  moc: Date,
): KetQuaLich {
  const laQuen = rating === 1;

  let nextIntervalDays: number;
  if (laQuen) {
    nextIntervalDays = KHOANG_LUOT_DAU[1];
  } else if (khoangTruocNgay !== null && khoangTruocNgay >= 1) {
    nextIntervalDays = Math.min(khoangTruocNgay * HE_SO_NHAN[rating], TOI_DA_NGAY);
  } else {
    nextIntervalDays = KHOANG_LUOT_DAU[rating];
  }

  let stateAfter: CardState;
  if (laQuen) {
    stateAfter =
      stateBefore === CardState.REVIEW || stateBefore === CardState.RELEARNING
        ? CardState.RELEARNING
        : CardState.LEARNING;
  } else {
    stateAfter = CardState.REVIEW;
  }

  return {
    stateAfter,
    nextIntervalDays,
    dueAt: new Date(moc.getTime() + nextIntervalDays * MOT_NGAY_MS),
    laQuen,
  };
}

import { tinhLich } from './simple-scheduler';

const MOC = new Date('2026-09-07T10:00:00.000Z');
const ngaySau = (n: number) => new Date(MOC.getTime() + n * 24 * 60 * 60 * 1000);

describe('tinhLich', () => {
  it('lượt đầu dùng đúng khoảng ghi trên nút của giao diện', () => {
    expect(tinhLich('NEW', 2, null, MOC).nextIntervalDays).toBe(1);
    expect(tinhLich('NEW', 3, null, MOC).nextIntervalDays).toBe(4);
    expect(tinhLich('NEW', 4, null, MOC).nextIntervalDays).toBe(8);
  });

  it('trả lời Chưa nhớ thì hẹn lại sau 10 phút, dù thẻ đã ôn lâu', () => {
    const kq = tinhLich('REVIEW', 1, 30, MOC);
    expect(kq.nextIntervalDays).toBeCloseTo(10 / 1440);
    expect(kq.laQuen).toBe(true);
  });

  it('thẻ đang ôn thì nhân khoảng cũ theo mức đánh giá', () => {
    expect(tinhLich('REVIEW', 3, 4, MOC).nextIntervalDays).toBe(10);
    expect(tinhLich('REVIEW', 4, 4, MOC).nextIntervalDays).toBe(14);
  });

  it('không nhân khoảng 10 phút của lượt học lại', () => {
    expect(tinhLich('LEARNING', 3, 10 / 1440, MOC).nextIntervalDays).toBe(4);
  });

  it('quên khi đang ôn thì chuyển sang học lại, quên khi đang học thì giữ nguyên', () => {
    expect(tinhLich('REVIEW', 1, 4, MOC).stateAfter).toBe('RELEARNING');
    expect(tinhLich('NEW', 1, null, MOC).stateAfter).toBe('LEARNING');
  });

  it('chặn khoảng lịch ở 365 ngày', () => {
    expect(tinhLich('REVIEW', 4, 300, MOC).nextIntervalDays).toBe(365);
  });

  it('dueAt bằng mốc cộng khoảng lịch', () => {
    expect(tinhLich('NEW', 3, null, MOC).dueAt).toEqual(ngaySau(4));
  });
});

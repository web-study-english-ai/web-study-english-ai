import { PrismaClient, UserRole, CefrLevel, CardState, AuthProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MOCK_USERS } from './mock-users.data';

const prisma = new PrismaClient();

async function main() {
  const startTime = Date.now();
  console.log('🚀 Bắt đầu tạo dữ liệu mẫu (Mock Data & Review Log Simulation)...');

  // Kiểm tra bảng words có dữ liệu chưa
  const wordCount = await prisma.word.count();
  if (wordCount === 0) {
    throw new Error(
      '⚠️ Bảng words chưa có dữ liệu từ vựng! Vui lòng chạy "npm run seed" trước để nạp 2,000 từ gốc.'
    );
  }
  console.log(`📚 Đã tìm thấy ${wordCount} từ vựng trong cơ sở dữ liệu.`);

  // 1. Tạo hoặc cập nhật các tài khoản mẫu
  console.log('\n👤 1. Đang khởi tạo tài khoản mẫu...');
  const userMap: Record<string, string> = {};

  for (const u of MOCK_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        role: u.role,
        level: u.level,
        newWordsPerDay: u.newWordsPerDay,
        maxReviewsPerDay: u.maxReviewsPerDay,
        passwordHash,
        provider: AuthProvider.LOCAL,
        isActive: true,
      },
      create: {
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        level: u.level,
        newWordsPerDay: u.newWordsPerDay,
        maxReviewsPerDay: u.maxReviewsPerDay,
        provider: AuthProvider.LOCAL,
        isActive: true,
      },
    });

    userMap[u.email] = user.id;
    console.log(`   ✔ Tài khoản: ${u.email} (${u.role}) - Mật khẩu: "${u.password}"`);
  }

  // 2. Lấy danh sách từ vựng theo các cấp độ
  console.log('\n📖 2. Đang truy vấn từ vựng để gán thẻ học mẫu...');
  const wordsA1 = await prisma.word.findMany({ where: { cefr: CefrLevel.A1 }, take: 40, orderBy: { rank: 'asc' } });
  const wordsA2 = await prisma.word.findMany({ where: { cefr: CefrLevel.A2 }, take: 40, orderBy: { rank: 'asc' } });
  const wordsB1 = await prisma.word.findMany({ where: { cefr: CefrLevel.B1 }, take: 80, orderBy: { rank: 'asc' } });
  const wordsB2 = await prisma.word.findMany({ where: { cefr: CefrLevel.B2 }, take: 50, orderBy: { rank: 'asc' } });

  const now = new Date();

  // 3. Tạo dữ liệu học tập cho "new@gmail.com" (Mới bắt đầu)
  console.log('\n🌱 3. Đang tạo dữ liệu thẻ cho new@gmail.com...');
  const newUserId = userMap['new@gmail.com'];
  let newLearnerCards = 0;

  // 15 thẻ mới (NEW)
  for (let i = 0; i < 15; i++) {
    if (!wordsA1[i]) break;
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: newUserId, wordId: wordsA1[i].id } },
      update: { state: CardState.NEW, reps: 0, lapses: 0, dueAt: null, lastReviewedAt: null },
      create: { userId: newUserId, wordId: wordsA1[i].id, state: CardState.NEW },
    });
    newLearnerCards++;
  }

  // 5 thẻ đang học (LEARNING)
  for (let i = 15; i < 20; i++) {
    if (!wordsA1[i]) break;
    const reviewTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 giờ trước
    const dueTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 phút nữa
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: newUserId, wordId: wordsA1[i].id } },
      update: {
        state: CardState.LEARNING,
        reps: 1,
        lapses: 0,
        difficulty: 0.3,
        stability: 1.0,
        lastReviewedAt: reviewTime,
        dueAt: dueTime,
      },
      create: {
        userId: newUserId,
        wordId: wordsA1[i].id,
        state: CardState.LEARNING,
        reps: 1,
        lapses: 0,
        difficulty: 0.3,
        stability: 1.0,
        lastReviewedAt: reviewTime,
        dueAt: dueTime,
      },
    });
    newLearnerCards++;
  }
  console.log(`   ✔ Đã gán ${newLearnerCards} thẻ học cho new@gmail.com`);

  // 4. Tạo dữ liệu học tập & Nhật ký ôn tập cho "active@gmail.com" (Đầy đủ kịch bản)
  console.log('\n📊 4. Đang giả lập dữ liệu ôn tập phong phú cho active@gmail.com...');
  const activeUserId = userMap['active@gmail.com'];
  let activeCardsCount = 0;

  // Kịch bản A: 25 thẻ mới chưa học (NEW)
  for (let i = 0; i < 25; i++) {
    if (!wordsB1[i]) break;
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: activeUserId, wordId: wordsB1[i].id } },
      update: { state: CardState.NEW, reps: 0, lapses: 0, dueAt: null, lastReviewedAt: null },
      create: { userId: activeUserId, wordId: wordsB1[i].id, state: CardState.NEW },
    });
    activeCardsCount++;
  }

  // Kịch bản B: 15 thẻ đang học chu kỳ ngắn (LEARNING)
  for (let i = 25; i < 40; i++) {
    if (!wordsB1[i]) break;
    const lastRev = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const due = new Date(now.getTime() + 15 * 60 * 1000);
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: activeUserId, wordId: wordsB1[i].id } },
      update: {
        state: CardState.LEARNING,
        reps: 2,
        lapses: 0,
        difficulty: 0.35,
        stability: 1.5,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
      create: {
        userId: activeUserId,
        wordId: wordsB1[i].id,
        state: CardState.LEARNING,
        reps: 2,
        lapses: 0,
        difficulty: 0.35,
        stability: 1.5,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
    });
    activeCardsCount++;
  }

  // Kịch bản C: 20 thẻ CẦN ÔN NGAY HÔM NAY (DUE TODAY / OVERDUE - REVIEW)
  // dueAt nằm trong quá khứ hoặc hôm nay để test màn hình Daily Review của frontend
  for (let i = 0; i < 20; i++) {
    if (!wordsA2[i]) break;
    const lastRev = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 ngày trước
    const due = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000); // Quá hạn từ 1 đến 20 giờ
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: activeUserId, wordId: wordsA2[i].id } },
      update: {
        state: CardState.REVIEW,
        reps: 4,
        lapses: 1,
        difficulty: 0.45,
        stability: 3.2,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
      create: {
        userId: activeUserId,
        wordId: wordsA2[i].id,
        state: CardState.REVIEW,
        reps: 4,
        lapses: 1,
        difficulty: 0.45,
        stability: 3.2,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
    });
    activeCardsCount++;
  }

  // Kịch bản D: 20 thẻ ĐÃ THUỘC / HẸN ÔN TƯƠNG LAI (FUTURE REVIEW - REVIEW)
  // dueAt nằm ở 3 đến 14 ngày tới
  for (let i = 20; i < 40; i++) {
    if (!wordsA2[i]) break;
    const daysFuture = (i % 10) + 3; // 3 đến 12 ngày nữa
    const lastRev = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const due = new Date(now.getTime() + daysFuture * 24 * 60 * 60 * 1000);
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: activeUserId, wordId: wordsA2[i].id } },
      update: {
        state: CardState.REVIEW,
        reps: 8,
        lapses: 0,
        difficulty: 0.22,
        stability: 18.5,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
      create: {
        userId: activeUserId,
        wordId: wordsA2[i].id,
        state: CardState.REVIEW,
        reps: 8,
        lapses: 0,
        difficulty: 0.22,
        stability: 18.5,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
    });
    activeCardsCount++;
  }

  // Kịch bản E: 10 thẻ HAY QUÊN / HỌC LẠI (RELEARNING)
  for (let i = 40; i < 50; i++) {
    if (!wordsB1[i]) break;
    const lastRev = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 giờ trước
    const due = new Date(now.getTime() + 30 * 60 * 1000); // 30 phút nữa
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: activeUserId, wordId: wordsB1[i].id } },
      update: {
        state: CardState.RELEARNING,
        reps: 5,
        lapses: 3,
        difficulty: 0.8,
        stability: 0.6,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
      create: {
        userId: activeUserId,
        wordId: wordsB1[i].id,
        state: CardState.RELEARNING,
        reps: 5,
        lapses: 3,
        difficulty: 0.8,
        stability: 0.6,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
    });
    activeCardsCount++;
  }

  // Kịch bản F: 3 thẻ REVIEW có CÙNG dueAt để kiểm thử tie-breaker stability cho API GET /cards/due (WSEA-70)
  // dueAt dùng chung 1 biến Date duy nhất tính sẵn ngoài vòng lặp để tránh lệch mili-giây
  const tieBreakDueAt = new Date(now.getTime() - 90 * 60 * 1000); // 90 phút trước (đã đến hạn)
  const lastRev3Days = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 ngày trước
  const stabilityCases: (number | null)[] = [2.0, 8.0, null];

  for (let i = 0; i < 3; i++) {
    const word = wordsB1[50 + i];
    if (!word) break;
    const stability = stabilityCases[i];
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: activeUserId, wordId: word.id } },
      update: {
        state: CardState.REVIEW,
        reps: 4,
        lapses: 1,
        difficulty: 0.5,
        stability,
        lastReviewedAt: lastRev3Days,
        dueAt: tieBreakDueAt,
      },
      create: {
        userId: activeUserId,
        wordId: word.id,
        state: CardState.REVIEW,
        reps: 4,
        lapses: 1,
        difficulty: 0.5,
        stability,
        lastReviewedAt: lastRev3Days,
        dueAt: tieBreakDueAt,
      },
    });
    activeCardsCount++;
  }

  console.log(`   ✔ Đã gán ${activeCardsCount} thẻ học đa dạng kịch bản cho active@gmail.com (bao gồm 3 thẻ test stability tie-breaker)`);

  // 5. Tạo dữ liệu học tập cho "pro@gmail.com" (Trình độ B2)
  console.log('\n🏆 5. Đang tạo dữ liệu thẻ cho pro@gmail.com...');
  const proUserId = userMap['pro@gmail.com'];
  let proCardsCount = 0;

  for (let i = 0; i < Math.min(35, wordsB2.length); i++) {
    const isMastered = i < 20;
    const state = isMastered ? CardState.REVIEW : CardState.LEARNING;
    const reps = isMastered ? 6 : 2;
    const due = isMastered
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 2 * 60 * 60 * 1000);

    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: proUserId, wordId: wordsB2[i].id } },
      update: {
        state,
        reps,
        lapses: 0,
        difficulty: 0.3,
        stability: isMastered ? 12.0 : 2.0,
        lastReviewedAt: now,
        dueAt: due,
      },
      create: {
        userId: proUserId,
        wordId: wordsB2[i].id,
        state,
        reps,
        lapses: 0,
        difficulty: 0.3,
        stability: isMastered ? 12.0 : 2.0,
        lastReviewedAt: now,
        dueAt: due,
      },
    });
    proCardsCount++;
  }
  console.log(`   ✔ Đã gán ${proCardsCount} thẻ học B2 cho pro@gmail.com`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalCardsInDb = await prisma.userCard.count();

  console.log('\n------------------------------------------------------------');
  console.log(`🎉 HOÀN THÀNH TẠO DỮ LIỆU MẪU (${duration}s):`);
  console.log(`   - Tổng số tài khoản mẫu: 4 tài khoản`);
  console.log(`   - Thẻ new:                ${newLearnerCards} thẻ`);
  console.log(`   - Thẻ active:             ${activeCardsCount} thẻ (đủ 5 kịch bản NEW, LEARNING, DUE TODAY, FUTURE, RELEARNING)`);
  console.log(`   - Thẻ pro:                ${proCardsCount} thẻ`);
  console.log(`   - Tổng số UserCard trong DB: ${totalCardsInDb} thẻ`);
  console.log('------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi tạo dữ liệu mẫu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

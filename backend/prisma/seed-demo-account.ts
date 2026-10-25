import { PrismaClient, UserRole, CefrLevel, CardState, AuthProvider, ReadingAttemptStatus, SchedulerSource } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seedDemoAccount() {
  console.log('🚀 Khởi tạo tài khoản trình diễn (Demo Account) cho v1.0 Production...');

  const email = 'demo@gmail.com';
  const password = 'password123';
  const fullName = 'Học viên Trình diễn v1.0';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Khởi tạo / Cập nhật tài khoản Demo
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      role: UserRole.USER,
      level: CefrLevel.B1,
      newWordsPerDay: 20,
      maxReviewsPerDay: 60,
      passwordHash,
      provider: AuthProvider.LOCAL,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      fullName,
      role: UserRole.USER,
      level: CefrLevel.B1,
      newWordsPerDay: 20,
      maxReviewsPerDay: 60,
      provider: AuthProvider.LOCAL,
      isActive: true,
    },
  });

  console.log(` ✅ Đã tạo/cập nhật tài khoản: ${user.email} (Mật khẩu: "${password}")`);

  // 2. Lấy danh sách từ vựng B1 để gán thẻ
  const wordsB1 = await prisma.word.findMany({
    where: { cefr: CefrLevel.B1 },
    take: 60,
    orderBy: { rank: 'asc' },
  });

  if (wordsB1.length === 0) {
    console.warn('⚠️ Chưa tìm thấy từ vựng B1 trong DB, bỏ qua bước gán thẻ từ vựng.');
    return;
  }

  const now = new Date();
  let cardsCount = 0;

  // 15 thẻ Mới (NEW)
  for (let i = 0; i < 15; i++) {
    if (!wordsB1[i]) break;
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: user.id, wordId: wordsB1[i].id } },
      update: { state: CardState.NEW, reps: 0, lapses: 0, dueAt: null, lastReviewedAt: null },
      create: { userId: user.id, wordId: wordsB1[i].id, state: CardState.NEW },
    });
    cardsCount++;
  }

  // 15 thẻ Đang học (LEARNING)
  for (let i = 15; i < 30; i++) {
    if (!wordsB1[i]) break;
    const lastRev = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const due = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    await prisma.userCard.upsert({
      where: { userId_wordId: { userId: user.id, wordId: wordsB1[i].id } },
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
        userId: user.id,
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
    cardsCount++;
  }

  // 20 thẻ Cần ôn tập (REVIEW)
  for (let i = 30; i < 50; i++) {
    if (!wordsB1[i]) break;
    const lastRev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const due = new Date(now.getTime() - 2 * 60 * 60 * 1000); // Đã đến hạn ôn
    const card = await prisma.userCard.upsert({
      where: { userId_wordId: { userId: user.id, wordId: wordsB1[i].id } },
      update: {
        state: CardState.REVIEW,
        reps: 5,
        lapses: 0,
        difficulty: 0.3,
        stability: 4.5,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
      create: {
        userId: user.id,
        wordId: wordsB1[i].id,
        state: CardState.REVIEW,
        reps: 5,
        lapses: 0,
        difficulty: 0.3,
        stability: 4.5,
        lastReviewedAt: lastRev,
        dueAt: due,
      },
    });
    cardsCount++;

    // Tạo review log để vẽ biểu đồ tiến độ
    await prisma.review.create({
      data: {
        userId: user.id,
        cardId: card.id,
        wordId: wordsB1[i].id,
        reviewTh: 1,
        rating: 3, // GOOD
        durationMs: 4500,
        reviewedAt: lastRev,
        scheduledDays: 3,
        elapsedDays: 2,
        stateBefore: CardState.LEARNING,
        stateAfter: CardState.REVIEW,
        scheduler: SchedulerSource.FSRS_AI,
      },
    });
  }

  console.log(` ✅ Đã gán ${cardsCount} thẻ học và lịch sử ôn tập mẫu cho tài khoản demo.`);

  // 3. Tạo lượt làm bài đọc hiểu mẫu (Reading Attempt)
  const passage = await prisma.readingPassage.findFirst({
    where: { slug: 'b1-remote-work-revolution' },
  });

  if (passage) {
    await prisma.readingAttempt.create({
      data: {
        userId: user.id,
        passageId: passage.id,
        status: ReadingAttemptStatus.COMPLETED,
        totalQuestions: 5,
        answeredCount: 5,
        correctCount: 5,
        durationSeconds: 320,
        submittedAt: now,
        answers: [
          { questionId: '1', selectedIndex: 1, isCorrect: true },
          { questionId: '2', selectedIndex: 1, isCorrect: true },
          { questionId: '3', selectedIndex: 0, isCorrect: true },
          { questionId: '4', selectedIndex: 2, isCorrect: true },
          { questionId: '5', selectedIndex: 3, isCorrect: true },
        ],
      },
    });
    console.log(` ✅ Đã gán kết quả làm bài đọc hiểu mẫu B1 (5/5 câu đúng) cho tài khoản demo.`);
  }

  console.log('🎉 Hoàn tất nạp tài khoản trình diễn (demo@gmail.com / 123) sẵn sàng để báo cáo!');
}

if (require.main === module) {
  seedDemoAccount()
    .catch((e) => {
      console.error('❌ Lỗi khi nạp tài khoản demo:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

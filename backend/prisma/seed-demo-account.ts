import {
  PrismaClient,
  UserRole,
  CefrLevel,
  CardState,
  AuthProvider,
  ReadingAttemptStatus,
  SchedulerSource,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MOT_GIO_MS = 60 * 60 * 1000;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

export async function seedDemoAccount() {
  const now = new Date();
  console.log(`🚀 Khởi tạo / Làm mới tài khoản trình diễn (Demo Account v1.2) tại ${now.toISOString()}...`);

  const email = 'demo@gmail.com';
  const password = 'password123';
  const fullName = 'Học viên Trình diễn v1.2';
  const avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop';
  const phone = '0987654321';
  const address = 'Hà Nội, Việt Nam';
  const dateOfBirth = new Date('2001-05-15');
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Khởi tạo / Cập nhật người dùng demo v1.2
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      avatarUrl,
      phone,
      address,
      dateOfBirth,
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
      avatarUrl,
      phone,
      address,
      dateOfBirth,
      role: UserRole.USER,
      level: CefrLevel.B1,
      newWordsPerDay: 20,
      maxReviewsPerDay: 60,
      provider: AuthProvider.LOCAL,
      isActive: true,
    },
  });

  console.log(` ✅ Đã thiết lập tài khoản: ${user.email} (Mật khẩu: "${password}")`);

  // Xóa sạch dữ liệu học cũ của tài khoản demo để tái tạo rolling timeline chuẩn xác
  await prisma.review.deleteMany({ where: { userId: user.id } });
  await prisma.readingAttempt.deleteMany({ where: { userId: user.id } });
  await prisma.assistantQuery.deleteMany({ where: { userId: user.id } });
  await prisma.conversation.deleteMany({ where: { userId: user.id } });
  await prisma.userCard.deleteMany({ where: { userId: user.id } });

  // 2. Lấy danh sách từ vựng B1 để tạo bộ thẻ mẫu (60 từ)
  const wordsB1 = await prisma.word.findMany({
    where: { cefr: CefrLevel.B1 },
    take: 60,
    orderBy: { rank: 'asc' },
  });

  if (wordsB1.length === 0) {
    console.warn('⚠️ Chưa tìm thấy từ vựng B1 trong DB, vui lòng chạy seed học liệu trước.');
    return;
  }

  // Danh sách ảnh minh họa mẫu thực tế (tính năng Vision AI v1.2)
  const sampleCardImages = [
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop', // cat
    'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop', // dog
    'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=600&auto=format&fit=crop', // car
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop', // coffee
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop', // laptop
    'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&auto=format&fit=crop', // books
  ];

  // 15 thẻ MỚI (NEW)
  for (let i = 0; i < 15; i++) {
    if (!wordsB1[i]) break;
    const cardImg = i < 2 ? sampleCardImages[i] : null;
    await prisma.userCard.create({
      data: {
        userId: user.id,
        wordId: wordsB1[i].id,
        imageUrl: cardImg,
        state: CardState.NEW,
        createdAt: new Date(now.getTime() - 2 * MOT_NGAY_MS),
      },
    });
  }

  // 15 thẻ ĐANG HỌC (LEARNING)
  for (let i = 15; i < 30; i++) {
    if (!wordsB1[i]) break;
    const cardLastRev = new Date(now.getTime() - 3 * MOT_GIO_MS);
    const cardDue = new Date(now.getTime() + 4 * MOT_GIO_MS);
    const cardImg = i < 17 ? sampleCardImages[i - 13] : null;
    await prisma.userCard.create({
      data: {
        userId: user.id,
        wordId: wordsB1[i].id,
        imageUrl: cardImg,
        state: CardState.LEARNING,
        reps: 2,
        lapses: 0,
        difficulty: 0.35,
        stability: 1.8,
        lastReviewedAt: cardLastRev,
        dueAt: cardDue,
        createdAt: new Date(now.getTime() - 4 * MOT_NGAY_MS),
      },
    });
  }

  // 30 thẻ CẦN ÔN TẬP (REVIEW) - Đến hạn ngay hôm nay (dueAt < now)
  const reviewCards: any[] = [];
  for (let i = 30; i < 60; i++) {
    if (!wordsB1[i]) break;
    const cardLastRev = new Date(now.getTime() - (18 + (i % 6)) * MOT_GIO_MS);
    const cardDue = new Date(now.getTime() - (1 + (i % 3)) * MOT_GIO_MS); // Quá hạn 1-3 tiếng -> Sẵn sàng ôn ngay
    const cardImg = i < 33 ? sampleCardImages[i - 26] : null;
    const card = await prisma.userCard.create({
      data: {
        userId: user.id,
        wordId: wordsB1[i].id,
        imageUrl: cardImg,
        state: CardState.REVIEW,
        reps: 5,
        lapses: 0,
        difficulty: 0.28,
        stability: 4.8,
        lastReviewedAt: cardLastRev,
        dueAt: cardDue,
        createdAt: new Date(now.getTime() - 7 * MOT_NGAY_MS),
      },
    });
    reviewCards.push({ card, word: wordsB1[i] });
  }

  console.log(` ✅ Đã tạo 60 thẻ học (có kèm ảnh minh họa Vision AI v1.2): 15 New, 15 Learning, 30 Review.`);

  // 3. Tạo nhật ký ôn tập 7 ngày liên tục tính ngược từ HÔM NAY
  // Đảm bảo: Streak = 7 ngày liên tục, Biểu đồ tuần đầy đủ 7 cột, Tỷ lệ nhớ ~94% (Xuất sắc)
  let totalReviews = 0;
  const reviewCountsPerDay = [18, 22, 19, 25, 20, 24, 21]; // Ngày 0 (hôm nay) đến Ngày 6 trước

  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const count = reviewCountsPerDay[dayOffset] || 20;
    const baseDayTime = now.getTime() - dayOffset * MOT_NGAY_MS;

    for (let r = 0; r < count; r++) {
      const cardItem = reviewCards[(r + dayOffset) % reviewCards.length];
      if (!cardItem) continue;

      // Phân bổ thời gian trong ngày (sáng, chiều, tối)
      const hourOffset = 8 + (r % 14); // 8h đến 22h
      const reviewTime = new Date(baseDayTime);
      reviewTime.setHours(hourOffset, (r * 7) % 60, (r * 13) % 60, 0);

      // Nếu là hôm nay và giờ vượt quá hiện tại thì điều chỉnh về trước hiện tại
      if (reviewTime.getTime() > now.getTime()) {
        reviewTime.setTime(now.getTime() - (r + 1) * 3 * 60 * 1000);
      }

      // 94% đánh giá Good (3) hoặc Easy (4), 6% Hard (2) hoặc Again (1)
      const rating = r % 16 === 0 ? 1 : r % 16 === 5 ? 2 : r % 2 === 0 ? 3 : 4;

      await prisma.review.create({
        data: {
          userId: user.id,
          cardId: cardItem.card.id,
          wordId: cardItem.word.id,
          reviewTh: r + 1,
          rating,
          durationMs: 3200 + (r % 5) * 800,
          reviewedAt: reviewTime,
          scheduledDays: 3,
          elapsedDays: 2,
          stateBefore: CardState.LEARNING,
          stateAfter: CardState.REVIEW,
          scheduler: SchedulerSource.FSRS_AI,
        },
      });
      totalReviews++;
    }
  }

  console.log(` ✅ Đã tạo ${totalReviews} lượt ôn tập trong 7 ngày gần nhất (Bảo đảm Streak 7 ngày & Biểu đồ xanh rực).`);

  // 4. Tạo kết quả bài đọc hiểu mẫu (Reading Attempts)
  const passage1 = await prisma.readingPassage.findFirst({
    where: { slug: 'b1-remote-work-revolution' },
  });

  if (passage1) {
    await prisma.readingAttempt.create({
      data: {
        userId: user.id,
        passageId: passage1.id,
        status: ReadingAttemptStatus.COMPLETED,
        totalQuestions: 5,
        answeredCount: 5,
        correctCount: 5,
        durationSeconds: 275,
        submittedAt: new Date(now.getTime() - 2 * MOT_GIO_MS),
        createdAt: new Date(now.getTime() - 2 * MOT_GIO_MS - 275 * 1000),
        answers: [
          { questionId: '1', selectedIndex: 1, isCorrect: true },
          { questionId: '2', selectedIndex: 1, isCorrect: true },
          { questionId: '3', selectedIndex: 0, isCorrect: true },
          { questionId: '4', selectedIndex: 2, isCorrect: true },
          { questionId: '5', selectedIndex: 3, isCorrect: true },
        ],
      },
    });
    console.log(` ✅ Đã gán bài đọc hiểu đã hoàn thành 5/5: [${passage1.slug}]`);
  }

  const passage2 = await prisma.readingPassage.findFirst({
    where: { slug: 'b1-environmental-solutions' },
  });

  if (passage2) {
    await prisma.readingAttempt.create({
      data: {
        userId: user.id,
        passageId: passage2.id,
        status: ReadingAttemptStatus.IN_PROGRESS,
        totalQuestions: 5,
        answeredCount: 2,
        correctCount: null,
        durationSeconds: 115,
        submittedAt: null,
        createdAt: new Date(now.getTime() - 45 * 60 * 1000),
        answers: [
          { questionId: '1', selectedIndex: 2 },
          { questionId: '2', selectedIndex: 0 },
        ],
      },
    });
    console.log(` ✅ Đã gán bài đọc hiểu đang làm dở (Draft 2/5 câu): [${passage2.slug}]`);
  }

  // 5. Tạo lịch sử hội thoại mẫu với Trợ lý AI (v1.1 Feature)
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: 'Phân biệt Present Perfect & Past Simple',
      createdAt: new Date(now.getTime() - 1 * MOT_GIO_MS),
      updatedAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
  });

  await prisma.assistantQuery.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      question: 'Khi nào dùng thì Hiện tại hoàn thành thay vì Quá khứ đơn?',
      answer:
        'Thì **Hiện tại hoàn thành (Present Perfect: have/has + V3/ed)** dùng khi hành động xảy ra trong quá khứ nhưng kết quả hoặc ảnh hưởng vẫn còn liên quan đến hiện tại (ví dụ: *"I have lost my key"* - hiện tại vẫn chưa tìm thấy). Ngược lại, **Quá khứ đơn (Past Simple)** dùng khi hành động đã kết thúc hoàn toàn tại thời điểm xác định trong quá khứ (ví dụ: *"I lost my key yesterday"*).',
      sourceIds: ['kb-grammar-present-perfect', 'kb-grammar-past-simple'],
      degraded: false,
      durationMs: 820,
      createdAt: new Date(now.getTime() - 55 * 60 * 1000),
    },
  });

  await prisma.assistantQuery.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      question: "Cho mình ví dụ câu có chứa từ 'collaborate' ở trình độ B1?",
      answer:
        'Ví dụ chuẩn B1: *"Our team needs to **collaborate** closely with other departments to finish the project on time."* (Đội ngũ của chúng tôi cần cộng tác chặt chẽ với các phòng ban khác để hoàn thành dự án đúng hạn). Trong câu này, **collaborate** đóng vai trò động từ nguyên mẫu đi sau *needs to*.',
      sourceIds: ['word-collaborate-b1'],
      degraded: false,
      durationMs: 650,
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
  });

  console.log(` ✅ Đã tạo lịch sử hội thoại và 2 truy vấn mẫu với Trợ lý ngữ pháp AI.`);

  console.log('\n============================================================');
  console.log('🎉 TÀI KHOẢN TRÌNH DIỄN v1.2 ĐÃ ĐƯỢC NẠP SẴN SÀNG 100%!');
  console.log(`   - Email:    ${email}`);
  console.log(`   - Mật khẩu: ${password}`);
  console.log(`   - Họ tên:   ${fullName}`);
  console.log(`   - Tính năng v1.2: Thẻ học gắn ảnh minh họa Vision AI, Profile cá nhân & Avatar`);
  console.log(`   - Chuỗi học liên tục: 7 ngày (hoạt động hôm nay)`);
  console.log(`   - Thẻ sẵn sàng ôn tập: 30 thẻ`);
  console.log(`   - Bài đọc hiểu: 1 Hoàn thành (5/5), 1 Đang làm dở (Draft)`);
  console.log(`   - Trợ lý AI: 1 cuộc hội thoại, 2 câu hỏi ngữ pháp`);
  console.log('============================================================\n');
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

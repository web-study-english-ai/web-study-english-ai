import { PrismaClient } from '@prisma/client';
import { MOCK_USERS } from './mock-users.data';

const prisma = new PrismaClient();

async function main() {
  const startTime = Date.now();
  console.log('🧹 Bắt đầu dọn dẹp / xóa dữ liệu mẫu (Clean Mock Data)...');

  const mockEmails = MOCK_USERS.map((u) => u.email);

  // 1. Tìm các tài khoản mẫu trong Database
  const existingUsers = await prisma.user.findMany({
    where: {
      OR: [{ email: { in: mockEmails } }, { email: { endsWith: '@wsea.com' } }],
    },
    select: { id: true, email: true },
  });

  if (existingUsers.length === 0) {
    console.log('ℹ️ Không tìm thấy tài khoản mẫu nào cần xóa. Database đã sạch.');
    return;
  }

  const userIds = existingUsers.map((u) => u.id);
  console.log(`🔍 Tìm thấy ${existingUsers.length} tài khoản mẫu: ${existingUsers.map((u) => u.email).join(', ')}`);

  // 2. Xóa các thẻ học (user_cards) của tài khoản mẫu
  const deletedCards = await prisma.userCard.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`   ✔ Đã xóa ${deletedCards.count} thẻ học (user_cards) mẫu.`);

  // 3. Xóa các refresh tokens nếu có
  const deletedTokens = await prisma.refreshToken.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`   ✔ Đã xóa ${deletedTokens.count} refresh tokens liên quan.`);

  // 4. Xóa các tài khoản mẫu
  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
  console.log(`   ✔ Đã xóa ${deletedUsers.count} tài khoản người dùng mẫu.`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n------------------------------------------------------------');
  console.log(`✨ DỌN DẸP DỮ LIỆU MẪU HOÀN TẤT (${duration}s):`);
  console.log(`   - Toàn bộ tài khoản và thẻ mẫu đã được xóa sạch.`);
  console.log(`   - Cơ sở dữ liệu học liệu gốc (2,000 từ vựng) được giữ nguyên an toàn 100%.`);
  console.log('------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi dọn dẹp dữ liệu mẫu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

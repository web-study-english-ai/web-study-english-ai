import { PrismaClient, CefrLevel } from '@prisma/client';

const prisma = new PrismaClient();

interface QuestionSeed {
  orderIndex: number;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

interface PassageSeed {
  slug: string;
  title: string;
  summary: string;
  content: string;
  topic: string;
  cefr: CefrLevel;
  estimatedMinutes: number;
  sortOrder: number;
  questions: QuestionSeed[];
}

export const b1ReadingPassages: PassageSeed[] = [
  {
    slug: 'b1-remote-work-revolution',
    title: 'The Evolution of Remote Work: Finding the Right Balance',
    topic: 'Career & Modern Lifestyle',
    cefr: CefrLevel.B1,
    estimatedMinutes: 6,
    sortOrder: 1,
    summary:
      'An insightful exploration of how remote work has transformed modern professional life, highlighting key benefits like schedule flexibility alongside challenges such as isolation and burnout.',
    content: `Over the past few years, the way people work has changed dramatically. Due to rapid technological advances and high-speed internet, millions of employees now carry out their daily tasks from home instead of commuting to traditional offices. This shift, commonly known as remote work, has brought both exciting opportunities and unexpected challenges.

On the positive side, working remotely offers unmatched flexibility. Employees can avoid long, stressful traffic jams, which saves valuable time and reduces travel expenses. Many people report that they can design their own schedules, allowing them to balance family duties, personal hobbies, and professional goals more smoothly. Furthermore, companies can hire talented individuals from different cities or even across the globe without requiring them to relocate.

However, remote working is not without its difficulties. One of the most common complaints is the feeling of social isolation. When people do not see their colleagues face-to-face, building friendships and teamwork becomes more challenging. Additionally, the boundary between work and personal life often becomes blurred. Many remote workers find themselves answering work emails late in the evening or working through lunch breaks, leading to fatigue and burnout.

In conclusion, while remote work provides remarkable freedom, it requires strong self-discipline and clear communication. Today, many forward-thinking businesses are adopting a "hybrid" model, where staff work from home for part of the week and spend remaining days in the office. This compromise seems to offer the best of both worlds.`,
    questions: [
      {
        orderIndex: 1,
        questionText: 'What is the main idea of the passage?',
        options: [
          'Remote work will soon completely replace all office jobs.',
          'Remote work offers flexibility but also requires balance to overcome its challenges.',
          'Working from home is only suitable for young professionals.',
          "Commuting to work is the healthiest part of an employee's day.",
        ],
        correctOptionIndex: 1,
        explanation:
          'Đoạn văn phân tích cả hai mặt của làm việc từ xa: ưu điểm về sự linh hoạt (đoạn 2) và nhược điểm như cô lập, áp lực công việc (đoạn 3), từ đó đề xuất giải pháp cân bằng mô hình hybrid (đoạn 4).',
      },
      {
        orderIndex: 2,
        questionText:
          'According to paragraph 2, which of the following is an advantage of remote work for employees?',
        options: [
          'They receive higher monthly salaries from international companies.',
          'They can save time and money by not having to travel to work.',
          'They never need to attend meetings with team leaders.',
          'They do not have to follow any deadlines or company rules.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Dẫn chứng ở đoạn 2: "Employees can avoid long, stressful traffic jams, which saves valuable time and reduces travel expenses." (tiết kiệm thời gian và chi phí đi lại).',
      },
      {
        orderIndex: 3,
        questionText: 'The word "blurred" in paragraph 3 is closest in meaning to:',
        options: ['unclear', 'permanent', 'strict', 'exciting'],
        correctOptionIndex: 0,
        explanation:
          'Từ "blurred" trong ngữ cảnh "the boundary between work and personal life often becomes blurred" có nghĩa là ranh giới giữa công việc và đời sống cá nhân trở nên mờ nhạt, không rõ ràng ("unclear").',
      },
      {
        orderIndex: 4,
        questionText:
          'What can be inferred about the "hybrid" model mentioned in paragraph 4?',
        options: [
          'It requires employees to work exclusively during weekends.',
          'It completely eliminates the need for physical company offices.',
          'It combines the advantages of working from home and working in an office.',
          'It is unpopular among most modern corporate employees.',
        ],
        correctOptionIndex: 2,
        explanation:
          'Đoạn cuối nêu: "staff work from home for part of the week and spend remaining days in the office. This compromise seems to offer the best of both worlds." (kết hợp cả hai ưu điểm làm việc tại nhà và tại văn phòng).',
      },
      {
        orderIndex: 5,
        questionText:
          'Which of the following is NOT mentioned as a drawback of remote work?',
        options: [
          'Feeling lonely and isolated from teammates.',
          'Difficulty in maintaining a clear boundary between work and personal life.',
          'Working through lunch breaks or late into the night.',
          'Having to purchase expensive computer equipment themselves.',
        ],
        correctOptionIndex: 3,
        explanation:
          'Trong đoạn 3 có nhắc đến social isolation (A), boundary blurred (B), và working late/through lunch breaks (C). Bài đọc hoàn toàn không đề cập việc nhân viên phải tự bỏ tiền mua thiết bị đắt đỏ (D).',
      },
    ],
  },
  {
    slug: 'b1-sustainable-tourism-practices',
    title: 'Sustainable Tourism: Travelling with Respect for the Planet',
    topic: 'Travel & Environment',
    cefr: CefrLevel.B1,
    estimatedMinutes: 6,
    sortOrder: 2,
    summary:
      'A practical guide on how eco-conscious travellers can explore the globe responsibly while protecting fragile ecosystems and supporting local communities.',
    content: `Tourism is one of the world's largest industries, allowing millions of people to discover new cultures, taste traditional dishes, and witness breathtaking landscapes. However, the rapid expansion of international travel has placed immense pressure on our environment. Popular destinations often suffer from severe pollution, overcrowded historical sites, and the destruction of sensitive natural habitats. In response to these problems, a new concept known as "sustainable tourism" has gained widespread attention.

The primary objective of sustainable tourism is to minimize negative environmental impacts while maximizing positive benefits for local people. Rather than staying in large luxury hotel chains that send their profits overseas, eco-conscious travellers choose locally-owned guesthouses and homestays. By doing so, they ensure that their money directly supports native families, neighborhood restaurants, and traditional craft markets.

Furthermore, sustainable travellers pay careful attention to their environmental footprint. They prefer using public transportation, cycling, or walking instead of taking domestic flights or renting private cars. When visiting natural parks, they adhere strictly to the principle of "leave no trace" — carrying their rubbish away, staying on designated walking paths, and avoiding any disturbance to wild animals.

Protecting local heritage is another vital aspect of this approach. Responsible visitors make an effort to understand local customs, dress appropriately when entering cultural monuments, and ask for permission before taking photographs of residents.

Ultimately, sustainable tourism is not about giving up the joy of travel; it is about travelling more thoughtfully. By making mindful decisions, every traveller can contribute to preserving the planet's wonders for generations to come.`,
    questions: [
      {
        orderIndex: 1,
        questionText: 'What is the primary purpose of the passage?',
        options: [
          'To encourage people to stop travelling abroad completely.',
          'To introduce sustainable tourism and explain how travellers can practice it.',
          'To review the most expensive eco-resorts around the world.',
          'To criticize governments for not closing crowded heritage sites.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Bài viết giới thiệu khái niệm du lịch bền vững (sustainable tourism) và giải thích các cách thức du khách có thể áp dụng để giảm thiểu tác động xấu và bảo vệ môi trường, văn hoá địa phương.',
      },
      {
        orderIndex: 2,
        questionText:
          'Why does the author recommend choosing locally-owned homestays instead of international hotel chains?',
        options: [
          'Because homestays always offer free tour guides.',
          'Because homestays are required by law in environmental parks.',
          'Because the spending directly benefits local families and communities.',
          'Because international hotel chains are forbidden in developing nations.',
        ],
        correctOptionIndex: 2,
        explanation:
          'Đoạn 2 giải thích rõ: "By doing so, they ensure that their money directly supports native families, neighborhood restaurants, and traditional craft markets." (tiền chi tiêu trực tiếp hỗ trợ các gia đình và cộng đồng bản địa).',
      },
      {
        orderIndex: 3,
        questionText: 'The phrase "leave no trace" in paragraph 3 refers to:',
        options: [
          'not telling anyone about the secret tourist destinations you visited.',
          'keeping natural environments clean by taking away all rubbish and protecting nature.',
          'travelling without carrying any official identity documents.',
          'walking only during night time to avoid wild animals.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Nguyên tắc "leave no trace" (không để lại dấu vết) được giải thích ngay sau đó trong câu: "carrying their rubbish away, staying on designated walking paths, and avoiding any disturbance to wild animals." (giữ gìn môi trường nguyên vẹn, mang rác về).',
      },
      {
        orderIndex: 4,
        questionText:
          'Which of the following transport methods is NOT recommended for sustainable travel in the passage?',
        options: ['Domestic flights', 'Cycling', 'Public transportation', 'Walking'],
        correctOptionIndex: 0,
        explanation:
          'Đoạn 3 nêu: "They prefer using public transportation, cycling, or walking instead of taking domestic flights or renting private cars." Chuyến bay nội địa là phương tiện du khách bền vững hạn chế sử dụng.',
      },
      {
        orderIndex: 5,
        questionText: 'What can be concluded from the final paragraph?',
        options: [
          'Sustainable tourism makes travelling too exhausting and expensive.',
          'Small individual choices can help protect cultural and natural heritage for the future.',
          'Future generations will no longer be interested in travelling.',
          'Natural wonders will completely disappear in the next decade.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Đoạn kết khẳng định: "By making mindful decisions, every traveller can contribute to preserving the planet\'s wonders for generations to come." (những quyết định ý thức của mỗi cá nhân sẽ giúp bảo tồn các kỳ quan cho thế hệ tương lai).',
      },
    ],
  },
  {
    slug: 'b1-power-of-micro-habits',
    title: 'The Power of Micro-Habits in Mastering a Foreign Language',
    topic: 'Education & Self-Improvement',
    cefr: CefrLevel.B1,
    estimatedMinutes: 6,
    sortOrder: 3,
    summary:
      'How tiny, consistent daily learning actions create sustainable long-term language breakthroughs compared to exhausting and sporadic marathon study sessions.',
    content: `Learning a new language is often viewed as a daunting and exhausting challenge. Many learners believe that fluency requires hours of intensive grammar drills and memorizing hundreds of vocabulary flashcards every single day. Consequently, people frequently start their learning journey with great enthusiasm, only to give up after a few weeks due to mental exhaustion and lack of time.

However, recent research in cognitive science suggests an alternative and far more effective approach: the concept of "micro-habits." A micro-habit is a tiny, manageable action that requires very little effort or willpower to complete. Instead of setting an ambitious goal like studying English for two hours every evening, a learner commits to practicing for just ten to fifteen minutes every day without fail.

The secret behind micro-habits lies in consistency and cognitive psychology. When a practice session is short, the brain does not perceive it as a stressful chore. For instance, listening to an English podcast while preparing breakfast, learning five new vocabulary words during your bus commute, or reading one short news article before going to sleep can easily fit into any hectic schedule.

Over time, these small actions compound into remarkable results. Studying fifteen minutes daily adds up to nearly one hundred hours of focused exposure over a year. More importantly, daily repetition strengthens neural pathways and prevents the natural forgetting curve from erasing newly acquired knowledge.

In summary, consistency consistently triumphs over intensity. If you wish to achieve lasting fluency in English, stop waiting for the perfect weekend to study for ten hours. Instead, start small, stay consistent, and let daily micro-habits transform your language skills step by step.`,
    questions: [
      {
        orderIndex: 1,
        questionText: 'What is the central message of the passage?',
        options: [
          'Only students with natural talent can become fluent in a foreign language.',
          'Small, daily practice habits are more effective and sustainable than intense, occasional study.',
          'Grammar exercises should be completely removed from language education.',
          'Podcasts are the only useful tool for modern language learners.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Toàn bộ bài đọc tập trung làm rõ thông điệp: "consistency consistently triumphs over intensity", thói quen nhỏ hàng ngày mang lại kết quả bền vững và hiệu quả hơn việc học dồn dập rồi bỏ cuộc.',
      },
      {
        orderIndex: 2,
        questionText:
          'According to paragraph 1, why do many learners quit studying a language early?',
        options: [
          'Because they cannot find qualified native teachers.',
          'Because learning materials have become too expensive.',
          'Because they feel mentally exhausted and lack enough time for heavy study goals.',
          'Because they already reached an advanced proficiency level.',
        ],
        correctOptionIndex: 2,
        explanation:
          'Đoạn 1 nêu: "Consequently, people frequently start their learning journey with great enthusiasm, only to give up after a few weeks due to mental exhaustion and lack of time."',
      },
      {
        orderIndex: 3,
        questionText: 'The word "daunting" in paragraph 1 is closest in meaning to:',
        options: ['intimidating', 'entertaining', 'affordable', 'effortless'],
        correctOptionIndex: 0,
        explanation:
          '"Daunting" có nghĩa là làm nản lòng, ghê gớm, đáng sợ đối với người đối diện ("intimidating").',
      },
      {
        orderIndex: 4,
        questionText: 'Which example of a micro-habit is mentioned in paragraph 3?',
        options: [
          'Writing a 20-page academic essay every weekend.',
          'Listening to an English podcast while preparing breakfast.',
          'Watching an entire movie without subtitles in one sitting.',
          'Memorizing fifty irregular verbs before lunch.',
        ],
        correctOptionIndex: 1,
        explanation:
          'Đoạn 3 đưa ra các ví dụ cụ thể: "listening to an English podcast while preparing breakfast, learning five new vocabulary words during your bus commute, or reading one short news article before going to sleep".',
      },
      {
        orderIndex: 5,
        questionText: 'What does the author emphasize in the final paragraph?',
        options: [
          'You must wait until you have free weekends to start studying seriously.',
          'Intensive marathon study sessions are superior to short daily lessons.',
          'Starting with small, manageable actions and remaining consistent is the key to fluency.',
          'Fluency can be achieved within three days if you use modern mobile apps.',
        ],
        correctOptionIndex: 2,
        explanation:
          'Đoạn kết nhấn mạnh: "start small, stay consistent, and let daily micro-habits transform your language skills step by step" (bắt đầu từ những việc nhỏ, duy trì đều đặn).',
      },
    ],
  },
];

export async function seedReadingPassages() {
  console.log('🌱 Bắt đầu nạp 3 bài đọc hiểu CEFR B1 vào CSDL...');

  let passagesCreated = 0;
  let questionsCreated = 0;

  for (const item of b1ReadingPassages) {
    const { questions, ...passageData } = item;

    // Upsert reading passage theo slug
    const passage = await prisma.readingPassage.upsert({
      where: { slug: passageData.slug },
      update: {
        title: passageData.title,
        summary: passageData.summary,
        content: passageData.content,
        topic: passageData.topic,
        cefr: passageData.cefr,
        estimatedMinutes: passageData.estimatedMinutes,
        sortOrder: passageData.sortOrder,
      },
      create: passageData,
    });
    passagesCreated++;

    // Xoá câu hỏi cũ và nạp lại để đảm bảo tính toàn vẹn (idempotency)
    await prisma.readingQuestion.deleteMany({
      where: { passageId: passage.id },
    });

    for (const q of questions) {
      await prisma.readingQuestion.create({
        data: {
          passageId: passage.id,
          orderIndex: q.orderIndex,
          questionText: q.questionText,
          options: q.options,
          correctOptionIndex: q.correctOptionIndex,
          explanation: q.explanation,
        },
      });
      questionsCreated++;
    }

    console.log(` ✅ Đã nạp bài đọc: [${passage.slug}] - ${passage.title} (${questions.length} câu hỏi)`);
  }

  console.log(`\n🎉 Hoàn tất nạp bài đọc! Tổng cộng: ${passagesCreated} bài đọc, ${questionsCreated} câu hỏi trắc nghiệm.`);
}

if (require.main === module) {
  seedReadingPassages()
    .catch((e) => {
      console.error('❌ Lỗi khi nạp bài đọc hiểu:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

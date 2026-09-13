import { PrismaClient, CefrLevel, PartOfSpeech, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const posMapping: Record<string, PartOfSpeech> = {
  v: PartOfSpeech.VERB,
  n: PartOfSpeech.NOUN,
  adj: PartOfSpeech.ADJECTIVE,
  adv: PartOfSpeech.ADVERB,
  prep: PartOfSpeech.PREPOSITION,
  pron: PartOfSpeech.PRONOUN,
  conj: PartOfSpeech.CONJUNCTION,
  interj: PartOfSpeech.INTERJECTION,
  num: PartOfSpeech.NUMERAL,
};

const cefrMapping: Record<string, CefrLevel> = {
  A1: CefrLevel.A1,
  A2: CefrLevel.A2,
  B1: CefrLevel.B1,
  B2: CefrLevel.B2,
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

interface ParsedWord {
  term: string;
  rank: number;
  cefr: CefrLevel;
  pos: PartOfSpeech;
  ipa: string | null;
  meaningVi: string;
  exampleEn: string | null;
  isConcreteNoun: boolean;
  freqPerMillion: number | null;
  sfi: Prisma.Decimal | null;
  topicCode: string;
  topicName: string;
}

async function main() {
  const startTime = Date.now();
  console.log('🚀 Bắt đầu nạp học liệu từ vựng vào Database...');

  const csvPath = path.join(__dirname, 'data', 'vocab_2000.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Không tìm thấy file CSV tại: ${csvPath}`);
  }

  // 1. Đọc nội dung file và loại bỏ BOM nếu có
  const rawContent = fs.readFileSync(csvPath, 'utf8');
  const cleanContent = rawContent.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length <= 1) {
    throw new Error('File CSV không có dữ liệu hợp lệ.');
  }

  const header = parseCsvLine(lines[0]);
  console.log(`📄 Đọc file CSV: ${lines.length - 1} dòng dữ liệu (Số cột header: ${header.length}).`);

  const validWords: ParsedWord[] = [];
  let invalidCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 13) {
      console.warn(`⚠️ Dòng ${i + 1} thiếu cột (< 13), bỏ qua.`);
      invalidCount++;
      continue;
    }

    const [
      rawWord,
      rawRank,
      rawCefr,
      rawPos,
      rawIpa,
      rawMeaningVi,
      rawExampleEn,
      rawIsConcreteNoun,
      _origRank,
      rawSfi,
      rawFreqPerMillion,
      rawTopicCode,
      rawTopicName,
    ] = cols;

    const word = rawWord.trim().toLowerCase();
    const rank = parseInt(rawRank, 10);
    const cefr = cefrMapping[rawCefr.trim().toUpperCase()];
    const pos = posMapping[rawPos.trim().toLowerCase()];
    const topicCode = rawTopicCode ? rawTopicCode.trim() : '';
    const topicName = rawTopicName ? rawTopicName.trim() : '';

    if (!word || isNaN(rank) || !cefr || !pos || !rawMeaningVi || !topicCode || !topicName) {
      console.warn(`⚠️ Dòng ${i + 1} có dữ liệu không hợp lệ: word=${word}, rank=${rank}, cefr=${rawCefr}, pos=${rawPos}, topicCode=${topicCode}`);
      invalidCount++;
      continue;
    }

    validWords.push({
      term: word,
      rank,
      cefr,
      pos,
      ipa: rawIpa ? rawIpa.trim() : null,
      meaningVi: rawMeaningVi.trim(),
      exampleEn: rawExampleEn ? rawExampleEn.trim() : null,
      isConcreteNoun: rawIsConcreteNoun.trim().toUpperCase() === 'TRUE',
      freqPerMillion: rawFreqPerMillion && !isNaN(parseInt(rawFreqPerMillion, 10))
        ? parseInt(rawFreqPerMillion, 10)
        : null,
      sfi: rawSfi && !isNaN(parseFloat(rawSfi))
        ? new Prisma.Decimal(parseFloat(rawSfi).toFixed(2))
        : null,
      topicCode,
      topicName,
    });
  }

  console.log(`✅ Đã xử lý & chuẩn hóa: ${validWords.length} từ hợp lệ (${invalidCount} lỗi).`);

  // 2. Nạp hoặc cập nhật các chủ đề (Topics) vào Database
  console.log('\n📂 2. Đang nạp danh sách chủ đề (Topics)...');
  const uniqueTopics = new Map<string, string>();
  for (const item of validWords) {
    if (!uniqueTopics.has(item.topicCode)) {
      uniqueTopics.set(item.topicCode, item.topicName);
    }
  }

  const topicMap = new Map<string, string>();
  for (const [code, name] of uniqueTopics.entries()) {
    const slug = code.toLowerCase();
    const topic = await prisma.topic.upsert({
      where: { slug },
      update: { name },
      create: {
        slug,
        name,
      },
    });
    topicMap.set(code, topic.id);
  }
  console.log(`✅ Đã upsert thành công ${topicMap.size} chủ đề vào bảng topics.`);

  // 3. Nạp dữ liệu vào Database theo lô (batching 100 từ/lần) bằng upsert
  console.log('\n📖 3. Đang nạp danh sách từ vựng kèm topic_id...');
  const BATCH_SIZE = 100;
  let processedCount = 0;

  for (let i = 0; i < validWords.length; i += BATCH_SIZE) {
    const chunk = validWords.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      chunk.map((item) => {
        const topicId = topicMap.get(item.topicCode) ?? null;
        return prisma.word.upsert({
          where: { term: item.term },
          update: {
            rank: item.rank,
            cefr: item.cefr,
            pos: item.pos,
            ipa: item.ipa,
            meaningVi: item.meaningVi,
            exampleEn: item.exampleEn,
            isConcreteNoun: item.isConcreteNoun,
            freqPerMillion: item.freqPerMillion,
            sfi: item.sfi,
            topicId,
          },
          create: {
            term: item.term,
            rank: item.rank,
            cefr: item.cefr,
            pos: item.pos,
            ipa: item.ipa,
            meaningVi: item.meaningVi,
            exampleEn: item.exampleEn,
            isConcreteNoun: item.isConcreteNoun,
            freqPerMillion: item.freqPerMillion,
            sfi: item.sfi,
            topicId,
          },
        });
      })
    );
    processedCount += chunk.length;
    process.stdout.write(`\r⏳ Đang nạp: ${processedCount}/${validWords.length} từ...`);
  }

  console.log('\n🎉 Hoàn thành nạp học liệu vào Database!');

  // 4. Thống kê kiểm tra sau khi nạp
  const totalInDb = await prisma.word.count();
  const totalTopicsInDb = await prisma.topic.count();
  const wordsMissingTopic = await prisma.word.count({ where: { topicId: null } });
  const a1Count = await prisma.word.count({ where: { cefr: CefrLevel.A1 } });
  const a2Count = await prisma.word.count({ where: { cefr: CefrLevel.A2 } });
  const b1Count = await prisma.word.count({ where: { cefr: CefrLevel.B1 } });
  const b2Count = await prisma.word.count({ where: { cefr: CefrLevel.B2 } });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('--------------------------------------------------');
  console.log(`📊 BÁO CÁO KẾT QUẢ NẠP DỮ LIỆU (${durationSec}s):`);
  console.log(`   - Tổng số chủ đề (Topics): ${totalTopicsInDb}`);
  console.log(`   - Tổng số từ trong DB:     ${totalInDb}`);
  console.log(`   - Từ chưa gán chủ đề:      ${wordsMissingTopic}`);
  console.log(`   - Cấp độ A1:               ${a1Count} từ`);
  console.log(`   - Cấp độ A2:               ${a2Count} từ`);
  console.log(`   - Cấp độ B1:               ${b1Count} từ`);
  console.log(`   - Cấp độ B2:               ${b2Count} từ`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

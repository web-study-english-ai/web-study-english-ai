import { ConfigService } from '@nestjs/config';
import { AssistantClient, MODEL_EMBED_MAC_DINH, SO_CHIEU_VECTOR_CHUAN } from './assistant.client';

describe('AssistantClient (Hợp đồng API v0.3)', () => {
  const fetchMock = vi.fn();
  let client: AssistantClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'http://ai.local';
        if (key === 'AI_SERVICE_KEY') return 'secret-key-32';
        if (key === 'AI_EMBED_MODEL') return MODEL_EMBED_MAC_DINH;
        return undefined;
      }),
    } as unknown as ConfigService;

    client = new AssistantClient(config);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('nhungCauHoi (/assistant/embed)', () => {
    const vector384 = Array.from({ length: SO_CHIEU_VECTOR_CHUAN }, (_, i) =>
      Number((i * 0.001).toFixed(4)),
    );

    it('trả về vector 384 chiều khi dim và model khớp hợp đồng', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            embedding: vector384,
            model: MODEL_EMBED_MAC_DINH,
            revision: 'rev-1',
            dim: 384,
          }),
      });

      const kq = await client.nhungCauHoi('Present perfect là gì?');
      expect(kq).toEqual({
        embedding: vector384,
        model: MODEL_EMBED_MAC_DINH,
        dim: 384,
        revision: 'rev-1',
      });
    });

    it('từ chối và trả về null khi dim hoặc model lệch với cấu hình DB', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            embedding: [0.1, 0.2],
            model: 'model-la',
            dim: 768,
          }),
      });

      const kq = await client.nhungCauHoi('Present perfect là gì?');
      expect(kq).toBeNull();
    });

    it('thử lại 1 lần khi nhận 503 từ /assistant/embed', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              embedding: vector384,
              model: MODEL_EMBED_MAC_DINH,
              dim: 384,
            }),
        });

      const kq = await client.nhungCauHoi('Present perfect?', { retryDelayMs: 5 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(kq?.dim).toBe(384);
    });
  });

  describe('hoi & hoiTheoLuong (/assistant/ask)', () => {
    it('gửi contexts, word, vocab, history chuẩn snake_case và nhận source_ids', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            answer: 'Giải thích ngữ pháp',
            source_ids: ['gram_015'],
          }),
      });

      const kq = await client.hoi('Present perfect?', {
        word: { term: 'already', pos: 'ADVERB', meaning_vi: 'đã, rồi' },
        userCefr: 'B1',
        contexts: [
          {
            id: 'gram_015',
            content: 'Hiện tại hoàn thành...',
            source: 'WSEA',
            topic: 'present_perfect',
            cefr: 'B1',
            distance: 0.14,
          },
        ],
      });

      expect(kq).toEqual({
        answer: 'Giải thích ngữ pháp',
        source_ids: ['gram_015'],
      });

      const bodyGui = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(bodyGui).toMatchObject({
        question: 'Present perfect?',
        word: { term: 'already', pos: 'ADVERB', meaning_vi: 'đã, rồi' },
        user_cefr: 'B1',
      });
    });

    it('đọc luồng SSE chuẩn v0.3: phát delta và chỉ tính thành công khi có khung cuối answer + [DONE]', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"delta":"Xin chào "}\n\n'));
          controller.enqueue(encoder.encode('data: {"delta":"bạn!"}\n\n'));
          controller.enqueue(
            encoder.encode('data: {"answer":"Xin chào bạn!","source_ids":["gram_015"]}\n\n'),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      fetchMock.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: stream,
      });

      const deltas: string[] = [];
      const kq = await client.hoiTheoLuong('Hello', {
        onDelta: (c) => deltas.push(c),
      });

      expect(deltas).toEqual(['Xin chào ', 'bạn!']);
      expect(kq).toEqual({
        answer: 'Xin chào bạn!',
        source_ids: ['gram_015'],
      });
    });

    it('coi là hỏng (trả về null) khi luồng SSE đứt giữa chừng mà chưa có khung cuối + [DONE]', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"delta":"Đang trả lời dở..."}\n\n'));
          controller.close();
        },
      });

      fetchMock.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: stream,
      });

      const deltas: string[] = [];
      const kq = await client.hoiTheoLuong('Hello', {
        onDelta: (c) => deltas.push(c),
      });

      expect(deltas).toEqual(['Đang trả lời dở...']);
      expect(kq).toBeNull();
    });

    it('khi người học ngắt kết nối (abort) thì không đánh dấu AI bị hỏng cho lượt gọi sau', async () => {
      const abortCtrl = new AbortController();
      fetchMock.mockImplementationOnce(() => {
        abortCtrl.abort();
        return Promise.reject(new Error('AbortError'));
      });
      const lan1 = await client.hoi('Câu 1', { signal: abortCtrl.signal });
      expect(lan1).toBeNull();
      // Lượt gọi ngay sau đó vẫn phải gọi tới fetch chứ không bị chặn bởi mạch ngưng 30s
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ answer: 'Câu 2 OK', source_ids: [] }),
      });
      const lan2 = await client.hoi('Câu 2');
      expect(lan2?.answer).toBe('Câu 2 OK');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

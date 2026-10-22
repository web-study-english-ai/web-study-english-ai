import { ConfigService } from '@nestjs/config';
import { AssistantClient } from './assistant.client';

describe('AssistantClient', () => {
  const fetchMock = vi.fn();
  let client: AssistantClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return 'http://ai.local';
        if (key === 'AI_SERVICE_KEY') return 'secret-key-32';
        return undefined;
      }),
    } as unknown as ConfigService;

    client = new AssistantClient(config);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chấp nhận định dạng sources: [{ source_id, score }] từ ai-service', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answer: 'Giải thích ngữ pháp',
          sources: [{ source_id: 'chunk-1', score: 0.91 }],
        }),
    });

    const kq = await client.hoi('Present perfect?');
    expect(kq).toEqual({
      answer: 'Giải thích ngữ pháp',
      source_ids: ['chunk-1'],
    });
  });

  it('đọc luồng SSE (text/event-stream) và phát từng đoạn qua onDelta', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"delta":"Xin chào "}\n\n'));
        controller.enqueue(
          encoder.encode(
            'data: {"delta":"bạn!","sources":[{"source_id":"chunk-2","score":0.88}]}\n\n',
          ),
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
      source_ids: ['chunk-2'],
    });
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

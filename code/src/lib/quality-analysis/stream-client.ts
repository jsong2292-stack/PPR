import type { AnalysisProgressEvent, EightDDraftEvent } from './types';

/**
 * 统一消费质量分析类的 SSE 流：把 progress 事件交给调用方实时渲染，
 * 在 result 事件后返回结果对象；error 事件或流内异常一律抛出，由页面 toast 呈现。
 * 诊断分析（/api/quality/analysis）与 8D 生成（/api/quality/reports/generate）共用同一套协议。
 *
 * 8D 生成额外会推 `draft` 帧：随模型生成把 D1–D8 逐字段写进页面输入框。
 * draft 帧里带的是该字段的完整文本，客户端直接覆盖，不必自己拼接增量。
 */
export async function streamQualityRequest<T>(
  url: string,
  body: Record<string, unknown>,
  onProgress: (event: AnalysisProgressEvent) => void,
  onDraft?: (event: EightDDraftEvent) => void
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const json = await response.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error || '无法建立生成流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamError = '';
  let result: T | null = null;
  let resultReceived = false;

  const handleBlock = (block: string) => {
    if (!block.trim()) return;
    let eventName = 'progress';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    const payload = JSON.parse(dataLines.join('\n'));
    if (eventName === 'progress') {
      onProgress(payload as AnalysisProgressEvent);
    } else if (eventName === 'draft') {
      onDraft?.(payload as EightDDraftEvent);
    } else if (eventName === 'result') {
      resultReceived = true;
      result = payload as T;
    } else if (eventName === 'error') {
      streamError = (payload as { message?: string }).message || '生成失败';
      onProgress({
        stage: 'complete', status: 'error', message: '生成过程执行失败',
        detail: streamError, timestamp: new Date().toISOString(),
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    blocks.forEach(handleBlock);
    if (done) break;
  }
  if (buffer.trim()) handleBlock(buffer);
  if (streamError) throw new Error(streamError);
  if (!resultReceived || result === null) throw new Error('生成流结束但未返回结果');
  return result;
}

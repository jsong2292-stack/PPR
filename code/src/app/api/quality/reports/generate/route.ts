import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { dbClient } from '@/lib/quality';
import { generateEightD } from '@/lib/quality-analysis/eight-d-service';
import { getQualityAgentConfig, type QualityAnalysisMode } from '@/lib/quality-analysis/config';
import type { AnalysisProgressReporter, EightDDraftReporter } from '@/lib/quality-analysis/types';
import { queryReport, saveGeneratedReport } from '@/lib/quality-report';

export const runtime = 'nodejs';

type Row = Record<string, unknown>;
type GenerateBody = {
  analysisId?: unknown;
  regenerate?: unknown;
  ownerName?: unknown;
  mode?: unknown;
};

function parseMode(value: unknown): QualityAnalysisMode | undefined {
  return value === 'agent' || value === 'rule' ? value : undefined;
}

/**
 * 基于「诊断分析摘要 + 页面引用的限值/趋势/设备数据 + Agent 结论卡片 + 工程师实际发现与意见」
 * 新建一个 Agent，生成 8D 报告的 D1–D8 结构化草稿。
 * 生成过程通过 SSE 实时推送，前端复用分析过程面板展示。
 */
async function generateAndPersist(
  body: GenerateBody,
  user: { nickname?: string | null; phone?: string | null },
  reporter?: AnalysisProgressReporter,
  draftReporter?: EightDDraftReporter
) {
  const analysisId = Number(body.analysisId);
  if (!analysisId) throw new Error('缺少分析任务ID');

  const analysis = await dbClient.queryOne<Row>('SELECT id, run_no FROM ppr_analysis_run WHERE id=?', [analysisId]);
  if (!analysis) throw new Error('分析任务不存在');

  const existing = await queryReport(analysisId);
  if (existing && String(existing.status) === 'finalized') {
    throw new Error('报告已定稿并归档，不能直接重新生成；如确需重做请由管理员撤销定稿后重试');
  }
  if (existing && !body.regenerate) {
    await reporter?.({
      stage: 'complete', status: 'success', message: '已存在 8D 报告草稿，直接复用最新结果',
      detail: String(existing.report_no || ''),
      timestamp: new Date().toISOString(),
    });
    return { data: existing, reused: true };
  }

  const ownerName = typeof body.ownerName === 'string' && body.ownerName.trim()
    ? body.ownerName.trim()
    : user.nickname || user.phone || '质量工程师';

  const generation = await generateEightD(analysisId, parseMode(body.mode), reporter, draftReporter);

  await reporter?.({
    stage: 'persistence', status: 'running', message: '正在保存 8D 报告草稿与生成审计信息',
    timestamp: new Date().toISOString(),
  });
  await saveGeneratedReport({
    analysisId,
    generation: generation.result,
    ownerName,
    generatedBy: user.nickname || user.phone || '质量工程师',
  });
  const data = await queryReport(analysisId);

  await reporter?.({
    stage: 'complete', status: 'success',
    message: generation.result.engineType === 'agent' ? 'Agent 已生成 8D 报告草稿' : '规则模板已生成 8D 报告草稿',
    detail: `D1–D8 已写入 · 耗时 ${generation.result.latencyMs} ms`,
    timestamp: new Date().toISOString(),
  });

  return {
    data,
    reused: false,
    generation: {
      configuredMode: generation.configuredMode,
      agentConfigured: generation.agentConfigured,
      engineType: generation.result.engineType,
      modelName: generation.result.modelName || null,
      fallbackReason: generation.result.fallbackReason || null,
      latencyMs: generation.result.latencyMs,
    },
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as GenerateBody;
  if (!Number(body.analysisId)) return NextResponse.json({ error: '缺少分析任务ID' }, { status: 400 });

  if (request.headers.get('accept')?.includes('text/event-stream')) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: 'progress' | 'draft' | 'result' | 'error', payload: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          send('progress', {
            stage: 'preparing', status: 'success', message: '已接收 8D 生成请求，正在准备诊断上下文',
            timestamp: new Date().toISOString(),
          });
          const config = await getQualityAgentConfig(parseMode(body.mode));
          send('progress', {
            stage: 'preparing', status: 'success',
            message: config.mode === 'agent' ? `将使用 LangChain Agent（${config.model}）整理 D1–D8` : '将使用规则模板整理 D1–D8',
            detail: config.mode === 'agent'
              ? '输入范围：诊断摘要、结论卡片、工程师实际发现与意见、批次与设备数据'
              : '未启用 Agent 模式，规则模板只生成可追溯到数据的 D1–D4',
            timestamp: new Date().toISOString(),
          });
          // 8D 结构化输出按字段流式回填页面输入框：draft 帧只用于展示，
          // 落库内容仍以流结束后校验过的结构化结果为准。
          const result = await generateAndPersist(body, user, (event) => send('progress', event), (event) => send('draft', event));
          send('result', result);
        } catch (cause) {
          console.error('streaming 8D report generation failed', cause);
          send('error', { message: cause instanceof Error ? cause.message : '生成 8D 报告失败' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  try {
    const result = await generateAndPersist(body, user);
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (cause) {
    console.error('8D report generation failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '生成 8D 报告失败' }, { status: 500 });
  }
}

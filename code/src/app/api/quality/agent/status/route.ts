import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getQualityAgentConfig } from '@/lib/quality-analysis/config';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const config = await getQualityAgentConfig();
  return NextResponse.json({
    mode: config.mode,
    configured: config.configured,
    model: config.model,
    fallbackToRule: config.fallbackToRule,
    framework: 'LangChain createAgent',
    useResponsesApi: process.env.QUALITY_AGENT_USE_RESPONSES_API !== 'false',
  });
}

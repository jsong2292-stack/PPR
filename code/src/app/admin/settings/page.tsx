'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface ConfigState {
  enable_register: string;
  enable_file_upload: string;
  enable_file_preview: string;
  enable_sso_auto_login: string;
  max_file_size: string;
  quality_analysis_mode: string;
  quality_agent_model: string;
  quality_agent_fallback_to_rule: string;
  quality_agent_max_tool_rounds: string;
  quality_agent_reasoning_effort: string;
}

const DEFAULTS: ConfigState = {
  enable_register: 'true',
  enable_file_upload: 'true',
  enable_file_preview: 'true',
  enable_sso_auto_login: 'false',
  max_file_size: '500',
  quality_analysis_mode: 'rule',
  quality_agent_model: 'gpt-6-luna',
  quality_agent_fallback_to_rule: 'true',
  quality_agent_max_tool_rounds: '8',
  quality_agent_reasoning_effort: 'low',
};

/** 系统设置：读取 / 写入 system_config 表 */
export default function AdminSettingsPage() {
  const [config, setConfig] = useState<ConfigState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rawConfig, setRawConfig] = useState<Record<string, string>>({});
  const [agentConfigured, setAgentConfigured] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => {
        setRawConfig(data || {});
        setConfig({ ...DEFAULTS, ...data });
      })
      .catch(() => toast.error('加载配置失败'))
      .finally(() => setLoading(false));
    fetch('/api/quality/agent/status', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => setAgentConfigured(Boolean(data.configured)))
      .catch(() => setAgentConfigured(false));
  }, []);

  const save = async (payload: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '保存失败');
        return;
      }
      setRawConfig((prev) => ({ ...prev, ...payload }));
      toast.success('保存成功');
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const setFlag = (key: keyof ConfigState, value: boolean) => {
    const next = value ? 'true' : 'false';
    setConfig((prev) => ({ ...prev, [key]: next }));
    save({ [key]: next });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">系统设置</h1>

      <Tabs defaultValue="feature">
        <TabsList>
          <TabsTrigger value="feature">功能开关</TabsTrigger>
          <TabsTrigger value="quality-agent">质量 Agent</TabsTrigger>
          <TabsTrigger value="upload">上传与预览</TabsTrigger>
          <TabsTrigger value="raw">全部配置</TabsTrigger>
        </TabsList>

        {/* 功能开关 */}
        <TabsContent value="feature">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">功能开关</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SwitchRow
                label="开放用户注册"
                description="关闭后 /api/auth/register 将拒绝新用户注册，登录页也不再展示注册入口"
                checked={config.enable_register === 'true'}
                onChange={(v) => setFlag('enable_register', v)}
              />
              <SwitchRow
                label="单点登录自动跳转"
                description="未登录访问受限页面时直接跳转 SSO；需先在环境变量中完成 OAUTH_* 配置"
                checked={config.enable_sso_auto_login === 'true'}
                onChange={(v) => setFlag('enable_sso_auto_login', v)}
              />
            </CardContent>
          </Card>
        </TabsContent>


        {/* 质量分析Agent */}
        <TabsContent value="quality-agent">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">异常诊断模式</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SwitchRow
                label="使用 LangChain Agent"
                description="关闭时使用确定性规则引擎；开启后由Agent自主调用只读数据工具并输出结构化分析。"
                checked={config.quality_analysis_mode === 'agent'}
                onChange={(value) => {
                  const mode = value ? 'agent' : 'rule';
                  setConfig((prev) => ({ ...prev, quality_analysis_mode: mode }));
                  save({ quality_analysis_mode: mode });
                }}
              />

              <div className={`rounded-lg border p-3 text-sm ${agentConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {agentConfigured
                  ? '已检测到Agent API密钥，可以启用智能分析。'
                  : '尚未检测到QUALITY_AGENT_API_KEY或OPENAI_API_KEY。开启Agent时会按配置自动降级到规则引擎。'}
              </div>

              <div className="space-y-2">
                <Label htmlFor="qualityAgentModel">Agent模型</Label>
                <div className="flex gap-2">
                  <Input id="qualityAgentModel" value={config.quality_agent_model}
                    onChange={(event) => setConfig((prev) => ({ ...prev, quality_agent_model: event.target.value }))} />
                  <Button variant="outline" disabled={saving}
                    onClick={() => save({ quality_agent_model: config.quality_agent_model })}>保存</Button>
                </div>
                <p className="text-xs text-gray-400">模型名由部署环境和账号权限决定；API密钥只从环境变量读取，不写入数据库。</p>
              </div>

              <SwitchRow
                label="Agent失败时降级规则引擎"
                description="建议保持开启，避免模型服务不可用时中断质量业务流程。降级原因会写入分析审计字段。"
                checked={config.quality_agent_fallback_to_rule === 'true'}
                onChange={(value) => {
                  const next = value ? 'true' : 'false';
                  setConfig((prev) => ({ ...prev, quality_agent_fallback_to_rule: next }));
                  save({ quality_agent_fallback_to_rule: next });
                }}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agentRounds">最大工具轮数</Label>
                  <Input id="agentRounds" type="number" min={2} max={20} value={config.quality_agent_max_tool_rounds}
                    onChange={(event) => setConfig((prev) => ({ ...prev, quality_agent_max_tool_rounds: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agentEffort">推理强度</Label>
                  <select id="agentEffort" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={config.quality_agent_reasoning_effort}
                    onChange={(event) => setConfig((prev) => ({ ...prev, quality_agent_reasoning_effort: event.target.value }))}>
                    {['none','minimal','low','medium','high'].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              </div>
              <Button variant="outline" disabled={saving} onClick={() => save({
                quality_agent_max_tool_rounds: config.quality_agent_max_tool_rounds,
                quality_agent_reasoning_effort: config.quality_agent_reasoning_effort,
              })}>保存Agent参数</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 上传与预览 */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">上传与预览</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SwitchRow
                label="开放文件上传"
                description="关闭后 /api/upload 返回 403"
                checked={config.enable_file_upload === 'true'}
                onChange={(v) => setFlag('enable_file_upload', v)}
              />
              <SwitchRow
                label="启用文件在线预览"
                description="前端根据该开关决定是否展示「预览」按钮"
                checked={config.enable_file_preview === 'true'}
                onChange={(v) => setFlag('enable_file_preview', v)}
              />

              <div className="space-y-2">
                <Label htmlFor="maxFileSize">单文件大小上限（MB）</Label>
                <div className="flex gap-2">
                  <Input
                    id="maxFileSize"
                    type="number"
                    min={1}
                    value={config.max_file_size}
                    onChange={(e) => setConfig((prev) => ({ ...prev, max_file_size: e.target.value }))}
                    className="max-w-[160px]"
                  />
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => save({ max_file_size: config.max_file_size })}
                  >
                    保存
                  </Button>
                </div>
                <p className="text-xs text-gray-400">
                  前端上传组件与后端 /api/upload 都会读取该值，环境变量 MAX_FILE_SIZE 作为兜底默认值。
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 全部配置 */}
        <TabsContent value="raw">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">system_config 全量内容</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
                {JSON.stringify(rawConfig, null, 2)}
              </pre>
              <p className="mt-3 text-xs text-gray-400">
                新增配置项可直接在此表插入，业务侧通过 getConfigValue(key) 读取。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

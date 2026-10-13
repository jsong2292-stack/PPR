'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { siteConfig } from '@/lib/site-config';

type Step = 1 | 2 | 3;

/** 安装向导：数据库连通性 → 数据表检查 → 创建管理员 */
export default function InstallPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [dbMessage, setDbMessage] = useState('');
  const [tableMessage, setTableMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');

  const testDatabase = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/install/test-db', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDbMessage(data.message);
        toast.success(data.message);
        setStep(2);
      } else {
        setDbMessage(data.error || '数据库连接失败');
        toast.error(data.error || '数据库连接失败');
      }
    } catch {
      setDbMessage('请求失败，请检查服务是否正常运行');
      toast.error('请求失败');
    } finally {
      setBusy(false);
    }
  };

  const checkTables = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/install/create-tables', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTableMessage(data.message);
        toast.success(data.message);
        setStep(3);
      } else {
        setTableMessage(data.error || '数据表检查失败');
        toast.error('数据表缺失，请先执行 scripts/init-db.sql');
      }
    } catch {
      setTableMessage('请求失败');
    } finally {
      setBusy(false);
    }
  };

  const createAdmin = async () => {
    if (!username || !nickname || !password) {
      return toast.error('请填写完整的账号信息');
    }
    setBusy(true);
    try {
      const res = await fetch('/api/install/init-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminConfig: { username, nickname, password } }),
      });
      const data = await res.json();

      if (data.success) {
        setLogs(data.logs || []);
        toast.success('初始化完成');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        toast.error(data.error || '初始化失败');
        setLogs(data.logs || []);
      }
    } catch {
      toast.error('请求失败');
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { no: 1, title: '数据库连接' },
    { no: 2, title: '数据表检查' },
    { no: 3, title: '创建管理员' },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">安装向导</h1>
        <p className="mt-2 text-gray-500">{siteConfig.name} 初始化</p>
      </div>

      {/* 步骤指示 */}
      <div className="mb-8 flex items-center justify-center gap-4">
        {steps.map((s, index) => (
          <div key={s.no} className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {step > s.no ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Circle
                  className={`h-5 w-5 ${step === s.no ? 'text-blue-600' : 'text-gray-300'}`}
                />
              )}
              <span
                className={`text-sm ${step >= s.no ? 'font-medium text-gray-900' : 'text-gray-400'}`}
              >
                {s.title}
              </span>
            </div>
            {index < steps.length - 1 && <div className="h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{steps[step - 1].title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-gray-600">
                请先在 <code className="rounded bg-gray-100 px-1.5 py-0.5">.env.local</code> 中配置
                数据库连接串：
              </p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
{`MYSQL_URL=mysql://user:password@localhost:3306/your_db
# 或
DATABASE_URL=mysql://user:password@localhost:3306/your_db`}
              </pre>
              {dbMessage && <p className="text-sm text-gray-600">{dbMessage}</p>}
              <Button onClick={testDatabase} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                测试数据库连接
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-gray-600">
                检查脚手架所需的数据表是否已创建。若提示缺表，请执行：
              </p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
{`node scripts/init-db.js
# 或
mysql -h 127.0.0.1 -u root -p your_db < scripts/init-db.sql`}
              </pre>
              {tableMessage && <p className="text-sm text-gray-600">{tableMessage}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
                  上一步
                </Button>
                <Button onClick={checkTables} disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  检查数据表
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="username">管理员用户名 *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3-20 位字母、数字或下划线"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">管理员昵称 *</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="显示名称"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">管理员密码 *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>

              {logs.length > 0 && (
                <pre className="max-h-56 overflow-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
                  {logs.join('\n')}
                </pre>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} disabled={busy}>
                  上一步
                </Button>
                <Button onClick={createAdmin} disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  完成安装
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Box, Button, Card, Flex, Heading, Separator, Text } from '@radix-ui/themes';
import { CheckCircle2, Database, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type InitInfo = {
  ok: boolean;
  project_ref?: string | null;
  migration_count?: number;
};

type InitResult = {
  success?: boolean;
  project_ref?: string;
  total?: number;
  applied?: number;
  skipped?: number;
  results?: Array<{
    version: string;
    name: string;
    status: 'applied' | 'skipped';
  }>;
  error?: string;
};

async function readJson(response: Response): Promise<InitResult> {
  return response.json().catch(() => ({ error: response.statusText }));
}

export default function DbInit() {
  const [info, setInfo] = React.useState<InitInfo | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<InitResult | null>(null);

  React.useEffect(() => {
    fetch('/api/setup/database/init')
      .then((response) => response.json())
      .then(setInfo)
      .catch(() => setInfo({ ok: false }));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/setup/database/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await readJson(response);
      setResult(body);
      if (!response.ok || !body.success) throw new Error(body.error || `HTTP ${response.status}`);
      toast.success('D1 数据库初始化完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '初始化失败');
    } finally {
      setLoading(false);
    }
  }

  const done = Boolean(result?.success);

  return (
    <div className="login-page db-init-page">
      <Card className="login-card db-init-card" style={{ padding: '32px' }}>
        <Flex direction="column" align="center" gap="2" mb="5">
          <Box className="login-logo">
            <Database size={32} color="white" />
          </Box>
          <Heading size="6">初始化 D1 数据库</Heading>
          <Text size="2" color="gray" align="center">
            使用 Cloudflare D1 创建面板需要的表、索引和默认设置。
          </Text>
        </Flex>

        <Separator size="4" mb="4" />

        <Flex className="db-init-meta" gap="2" wrap="wrap" mb="4">
          <Badge color={info?.ok ? 'green' : 'red'} variant="soft">
            数据库: {info?.project_ref || '未绑定'}
          </Badge>
          <Badge color="gray" variant="soft">
            步骤: {info?.migration_count ?? '-'}
          </Badge>
        </Flex>

        <form onSubmit={submit}>
          <Button type="submit" size="3" disabled={loading || !info?.ok} style={{ height: 44, width: '100%', fontWeight: 700 }}>
            {loading ? <Loader2 className="db-init-spin" size={18} /> : <Database size={18} />}
            {loading ? '正在初始化...' : '一键初始化 D1 数据库'}
          </Button>
        </form>

        {result && (
          <Box className={`db-init-result ${done ? 'is-success' : 'is-error'}`} mt="4">
            <Flex align="center" gap="2" mb="2">
              {done ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <Text size="2" weight="bold">
                {done ? `完成：执行 ${result.applied ?? 0} 个，跳过 ${result.skipped ?? 0} 个` : '初始化失败'}
              </Text>
            </Flex>
            {result.error && <Text size="2">{result.error}</Text>}
            {done && (
              <Flex direction="column" gap="1" className="db-init-log">
                {(result.results || []).map((item) => (
                  <Text size="1" key={item.version}>
                    {item.status === 'applied' ? '执行' : '跳过'} {item.version}
                  </Text>
                ))}
              </Flex>
            )}
          </Box>
        )}

        {done && (
          <Button asChild size="3" variant="soft" mt="4" style={{ width: '100%' }}>
            <Link to="/87051809/login">进入后台登录</Link>
          </Button>
        )}
      </Card>
    </div>
  );
}

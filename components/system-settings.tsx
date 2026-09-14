'use client'

import { useState, useEffect } from 'react'
import {
  Settings,
  Bell,
  HardDrive,
  Cpu,
  Save,
  Check,
  Shield,
  Send,
  Info,
  Boxes,
  Eye,
  EyeOff,
  Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SystemSettings as SettingsType, DockerRegistryConfig } from '@/lib/types'

export function SystemSettings() {
  const [settings, setSettings] = useState<SettingsType>({
    platformName: '轻量自研 CI/CD 平台',
    workspacePath: '',
    artifactPath: '',
    concurrencyLimit: 5,
    webhookNotificationUrl: '',
    webhookType: 'dingtalk',
    notifyOnSuccess: true,
    notifyOnFailure: true,
    dockerRegistry: {
      enabled: false,
      registryUrl: '',
      namespace: '',
      username: '',
      password: '',
      defaultMode: 'save_load',
    },
    enablePeriodicHealthCheck: true,
    healthCheckIntervalSeconds: 30,
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setSettings(data)
        }
      })
      .catch((err) => console.error('Failed to load settings', err))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (err) {
      console.error('Save settings error', err)
    } finally {
      setSaving(false)
    }
  }

  const handleTestNotification = () => {
    if (!settings.webhookNotificationUrl) {
      alert('请先填写 Webhook 通知机器人地址')
      return
    }
    setTestSent(true)
    setTimeout(() => {
      alert('测试通知消息已模拟投递成功！')
      setTestSent(false)
    }, 1000)
  }

  if (loading) {
    return <div className="py-16 text-center text-muted-foreground text-sm">加载配置中...</div>
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">全局系统设置</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          配置平台基础信息、流水线工作区存储路径以及自动化通知机器人
        </p>
      </div>

      {/* 1. Platform General */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Settings className="size-4 text-primary" />
          基础环境配置
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">平台显示名称</label>
            <Input
              value={settings.platformName}
              onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">流水线最大并发任务数</label>
            <Input
              type="number"
              value={settings.concurrencyLimit}
              onChange={(e) =>
                setSettings({ ...settings, concurrencyLimit: Number(e.target.value) })
              }
              className="mt-1 font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">本地源码工作区目录</label>
            <Input
              value={settings.workspacePath}
              onChange={(e) => setSettings({ ...settings, workspacePath: e.target.value })}
              className="mt-1 font-mono text-xs"
              placeholder=".cicd_workspaces"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">构建产物归档存储目录</label>
            <Input
              value={settings.artifactPath}
              onChange={(e) => setSettings({ ...settings, artifactPath: e.target.value })}
              className="mt-1 font-mono text-xs"
              placeholder=".cicd_artifacts"
            />
          </div>
        </div>
      </div>

      {/* 2. Notification Channels */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          流水线告警与通知集成
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">通知渠道类型</label>
              <select
                value={settings.webhookType}
                onChange={(e) =>
                  setSettings({ ...settings, webhookType: e.target.value as any })
                }
                className="w-full mt-1 flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="dingtalk">钉钉自定义机器人 (DingTalk)</option>
                <option value="feishu">飞书企业群机器人 (Feishu)</option>
                <option value="wecom">企业微信群机器人 (WeCom)</option>
                <option value="custom">通用 HTTP POST Webhook</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Webhook 回调 URL</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={settings.webhookNotificationUrl || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, webhookNotificationUrl: e.target.value })
                  }
                  placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  disabled={testSent}
                  className="gap-1.5 shrink-0 text-xs"
                >
                  <Send className="size-3.5" />
                  {testSent ? '已发送' : '测试'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.notifyOnSuccess}
                onChange={(e) =>
                  setSettings({ ...settings, notifyOnSuccess: e.target.checked })
                }
                className="rounded border-border size-4"
              />
              部署成功时推送通知
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.notifyOnFailure}
                onChange={(e) =>
                  setSettings({ ...settings, notifyOnFailure: e.target.checked })
                }
                className="rounded border-border size-4"
              />
              部署失败或异常时推送告警
            </label>
          </div>
        </div>
      </div>

      {/* 3. Periodic Health Check Configuration */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            项目心跳探针与定时巡检配置 (Health Check Scheduler)
          </h3>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enablePeriodicHealthCheck ?? true}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  enablePeriodicHealthCheck: e.target.checked,
                })
              }
              className="rounded border-border size-4"
            />
            启用后台定时自动巡检
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          刚部署完成时不再触发即时阻塞探针，避免因容器服务冷启动产生误报；心跳检测交由后台定时巡检任务异步执行，可按需配置巡检间隔时间。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              巡检探测频率 (Interval)
            </label>
            <select
              value={settings.healthCheckIntervalSeconds || 30}
              disabled={settings.enablePeriodicHealthCheck === false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  healthCheckIntervalSeconds: Number(e.target.value),
                })
              }
              className="w-full mt-1 flex h-9 rounded-md border border-input bg-card px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value={15}>每 15 秒 (高敏检测)</option>
              <option value={30}>每 30 秒 (推荐默认)</option>
              <option value={60}>每 60 秒 (低负载模式)</option>
              <option value={120}>每 2 分钟</option>
              <option value={300}>每 5 分钟 (轻量巡检)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              探测超时阈值与保护机制
            </label>
            <div className="mt-1 h-9 px-3 flex items-center rounded-md border border-border bg-muted/40 text-xs text-muted-foreground font-mono">
              单次探针超时: 4000ms · 异步非阻塞 · 隔离探测
            </div>
          </div>
        </div>
      </div>

      {/* 4. Docker Registry Configuration */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            企业级 Docker 镜像仓库 (Docker Registry / Harbor)
          </h3>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.dockerRegistry?.enabled || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dockerRegistry: {
                    ...(settings.dockerRegistry || {
                      registryUrl: '',
                      namespace: '',
                      username: '',
                      password: '',
                      defaultMode: 'save_load',
                    }),
                    enabled: e.target.checked,
                  },
                })
              }
              className="rounded border-border size-4"
            />
            启用镜像仓库分发能力
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          配置企业级私有 Harbor、Aliyun ACR、腾讯云 TCR 或 Docker Hub。启用后，流水线可通过 <code className="text-primary font-mono">docker push / pull</code> 走网络仓库中心化高速分发，也可随时切换回 SFTP 离线直连模式。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              镜像仓库地址 (Registry URL)
            </label>
            <Input
              value={settings.dockerRegistry?.registryUrl || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dockerRegistry: {
                    ...(settings.dockerRegistry || {
                      enabled: false,
                      namespace: '',
                      username: '',
                      password: '',
                      defaultMode: 'save_load',
                    }),
                    registryUrl: e.target.value,
                  },
                })
              }
              className="mt-1 font-mono text-xs"
              placeholder="例如：harbor.mycompany.com 或 registry.cn-hangzhou.aliyuncs.com"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              默认组织/项目命名空间 (Namespace)
            </label>
            <Input
              value={settings.dockerRegistry?.namespace || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dockerRegistry: {
                    ...(settings.dockerRegistry || {
                      enabled: false,
                      registryUrl: '',
                      username: '',
                      password: '',
                      defaultMode: 'save_load',
                    }),
                    namespace: e.target.value,
                  },
                })
              }
              className="mt-1 font-mono text-xs"
              placeholder="例如：cicd-apps 或 devops"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              推送/拉取认证账号 (Username，可选)
            </label>
            <Input
              value={settings.dockerRegistry?.username || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dockerRegistry: {
                    ...(settings.dockerRegistry || {
                      enabled: false,
                      registryUrl: '',
                      namespace: '',
                      password: '',
                      defaultMode: 'save_load',
                    }),
                    username: e.target.value,
                  },
                })
              }
              className="mt-1 text-xs"
              placeholder="例如：robot$cicd-pusher"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">
              访问密码或 Token (Password / Secret)
            </label>
            <div className="relative mt-1">
              <Input
                type={showRegPassword ? 'text' : 'password'}
                value={settings.dockerRegistry?.password || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dockerRegistry: {
                      ...(settings.dockerRegistry || {
                        enabled: false,
                        registryUrl: '',
                        namespace: '',
                        username: '',
                        defaultMode: 'save_load',
                      }),
                      password: e.target.value,
                    },
                  })
                }
                className="pr-10 text-xs font-mono"
                placeholder="密码或机器人密钥 Token"
              />
              <button
                type="button"
                onClick={() => setShowRegPassword(!showRegPassword)}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              >
                {showRegPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Docker 项目默认交付分发策略 (Default Delivery Strategy)
            </label>
            <div className="grid grid-cols-2 gap-3 mt-1.5">
              <div
                onClick={() =>
                  setSettings({
                    ...settings,
                    dockerRegistry: {
                      ...(settings.dockerRegistry || {
                        enabled: false,
                        registryUrl: '',
                        namespace: '',
                        username: '',
                        password: '',
                      }),
                      defaultMode: 'save_load',
                    },
                  })
                }
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  (settings.dockerRegistry?.defaultMode || 'save_load') === 'save_load'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-blue-500" />
                  SFTP 离线直连模式 (docker save ➔ SFTP ➔ docker load)
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  无需依赖中心仓库服务，适合私有化局域网、隔离网络或轻量单机部署。
                </p>
              </div>

              <div
                onClick={() =>
                  setSettings({
                    ...settings,
                    dockerRegistry: {
                      ...(settings.dockerRegistry || {
                        enabled: false,
                        registryUrl: '',
                        namespace: '',
                        username: '',
                        password: '',
                      }),
                      defaultMode: 'registry',
                    },
                  })
                }
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  settings.dockerRegistry?.defaultMode === 'registry'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" />
                  中心仓库分发模式 (docker push ➔ Registry ➔ docker pull)
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  本地打 Tag 推送至中心仓库，目标服务器通过高速内网拉取，标准化云原生交付。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. System Runtime Info */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Info className="size-4 text-primary" />
          系统运行环境与持久化状态
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <span className="text-muted-foreground text-[11px] block">架构框架</span>
            <span className="font-semibold text-foreground mt-0.5 block">Next.js 16 (App Router)</span>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <span className="text-muted-foreground text-[11px] block">React 版本</span>
            <span className="font-semibold text-foreground mt-0.5 block">React 19 (Server + Client)</span>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <span className="text-muted-foreground text-[11px] block">数据存储</span>
            <span className="font-semibold text-foreground mt-0.5 block">原子文件持久化 (JSON DB)</span>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <span className="text-muted-foreground text-[11px] block">实时协议</span>
            <span className="font-semibold text-foreground mt-0.5 block">Server-Sent Events (SSE)</span>
          </div>
        </div>
      </div>

      {/* Save Action */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saved ? <Check className="size-4 text-green-400" /> : <Save className="size-4" />}
          {saved ? '已保存设置' : saving ? '保存中...' : '保存系统设置'}
        </Button>
      </div>
    </div>
  )
}

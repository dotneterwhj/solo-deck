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
  Archive,
  Trash2,
  RefreshCw,
  AlertCircle,
  Palette,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SystemSettings as SettingsType, DockerRegistryConfig } from '@/lib/types'
import { useTheme } from '@/lib/theme/theme-context'
import { THEMES } from '@/lib/theme/types'

export function SystemSettings() {
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<SettingsType>({
    platformName: 'Solo Deck 平台',
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
    enableArtifactCleanup: true,
    artifactRetentionDays: 7,
    artifactMaxKeepPerProject: 5,
    artifactCleanupIntervalHours: 24,
    enableDockerImagePrune: true,
    dockerPruneDanglingOnly: true,
    dockerPruneRetentionHours: 72,
    dockerPruneIntervalHours: 24,
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)

  // 产物与镜像清理相关状态
  const [artifactStats, setArtifactStats] = useState<{
    totalBytes: number
    formattedSize: string
    totalFiles: number
    projectCount: number
  } | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [cleaningArtifacts, setCleaningArtifacts] = useState(false)
  const [cleaningDocker, setCleaningDocker] = useState(false)
  const [cleanupNotice, setCleanupNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadCleanupStats = async () => {
    try {
      setLoadingStats(true)
      const res = await fetch('/api/settings/cleanup')
      if (res.ok) {
        const data = await res.json()
        if (data.stats) {
          setArtifactStats(data.stats)
        }
      }
    } catch (err) {
      console.error('Failed to load cleanup stats', err)
    } finally {
      setLoadingStats(false)
    }
  }

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

    loadCleanupStats()
  }, [])

  const handleManualCleanup = async (type: 'artifacts' | 'docker') => {
    if (type === 'artifacts') setCleaningArtifacts(true)
    if (type === 'docker') setCleaningDocker(true)
    setCleanupNotice(null)

    try {
      const res = await fetch('/api/settings/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        if (data.stats) {
          setArtifactStats(data.stats)
        }
        if (type === 'artifacts') {
          const resArt = data.result?.artifacts
          setCleanupNotice({
            type: 'success',
            message: `产物清理成功！已删除 ${resArt?.deletedFiles || 0} 个历史构建归档，释放磁盘空间 ${resArt?.reclaimedFormatted || '0 B'}。`,
          })
        } else {
          const resDoc = data.result?.docker
          setCleanupNotice({
            type: 'success',
            message: `Docker 镜像清理成功！已释放磁盘空间 ${resDoc?.reclaimedSpace || '0 B'}${resDoc?.deletedImagesCount ? `，删除镜像条目 ${resDoc.deletedImagesCount} 个` : ''}。`,
          })
        }
      } else {
        setCleanupNotice({
          type: 'error',
          message: data.error || '执行清理失败，请检查服务状态',
        })
      }
    } catch (err: any) {
      setCleanupNotice({
        type: 'error',
        message: '执行清理异常: ' + (err?.message || '未知错误'),
      })
    } finally {
      setCleaningArtifacts(false)
      setCleaningDocker(false)
      // 重新拉取设置更新上次清理时间
      fetch('/api/settings')
        .then((r) => r.json())
        .then((s) => setSettings((prev) => ({ ...prev, ...s })))
        .catch(() => { })
    }
  }

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

      {/* Theme & Appearance */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Palette className="size-4 text-primary" />
            外观与主题风格 (Appearance & Themes)
          </h3>
          <span className="text-[11px] text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded border border-border/80">
            CSS Design Tokens 纯变量驱动 · 无需改动业务组件
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          全局采用现代化 OKLCH 色彩空间与语义化设计令牌，主题实时切换并持久化存储至浏览器。新增或定制主题仅需扩展 CSS 变量，底层业务组件零侵入。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          {THEMES.map((t) => {
            const isSelected = theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`relative flex flex-col p-3 rounded-xl border text-left transition-all group ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-xs'
                    : 'border-border bg-card/60 hover:border-primary/40 hover:bg-card'
                }`}
              >
                {/* Visual preview swatch */}
                <div
                  className="w-full h-12 rounded-lg border border-white/10 p-1.5 flex flex-col justify-between mb-2 relative overflow-hidden shadow-inner"
                  style={{ backgroundColor: t.preview.bg }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="size-3.5 rounded-full"
                      style={{ backgroundColor: t.preview.primary }}
                    />
                    <div
                      className="h-1.5 w-6 rounded-full opacity-60"
                      style={{ backgroundColor: t.preview.border }}
                    />
                  </div>
                  <div
                    className="h-3 rounded-md w-full opacity-80"
                    style={{ backgroundColor: t.preview.card }}
                  />
                </div>

                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-foreground truncate">{t.name}</span>
                  {isSelected && (
                    <span className="size-2 rounded-full bg-primary ring-2 ring-primary/30 shrink-0 ml-1" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  {t.description}
                </span>
              </button>
            )
          })}
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
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${(settings.dockerRegistry?.defaultMode || 'save_load') === 'save_load'
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
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${settings.dockerRegistry?.defaultMode === 'registry'
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

      {/* 5. Storage & Artifacts Lifecycle Cleanup Configuration */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Archive className="size-4 text-primary" />
            存储空间与构建产物自动清理配置
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            针对流水线构建归档目录（<code className="text-primary font-mono">{settings.artifactPath || '.cicd_artifacts'}</code>）及 Docker 镜像制定自动淘汰策略，防止持续部署占满宿主机磁盘。
          </p>
        </div>

        {/* Global Notice Alert if present */}
        {cleanupNotice && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200 ${cleanupNotice.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
          >
            <div className="flex items-center gap-2">
              {cleanupNotice.type === 'success' ? (
                <Check className="size-4 shrink-0 text-green-500" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              )}
              <span>{cleanupNotice.message}</span>
            </div>
            <button
              onClick={() => setCleanupNotice(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              关闭
            </button>
          </div>
        )}

        {/* Part A: .cicd_artifacts Lifecycle */}
        <div className="p-4 rounded-lg border border-border/70 bg-muted/20 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-blue-400" />
              <h4 className="text-xs font-bold text-foreground">
                .cicd_artifacts 本地产物归档生命周期管理
              </h4>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.enableArtifactCleanup ?? true}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableArtifactCleanup: e.target.checked,
                  })
                }
                className="rounded border-border size-4"
              />
              启用产物包定期自动清理
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-background/50 border border-border/50 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground text-[11px] block">当前归档总容量</span>
                <span className="font-mono font-bold text-foreground text-sm mt-0.5 block">
                  {artifactStats ? artifactStats.formattedSize : '计算中...'}
                </span>
              </div>
              <div className="h-7 w-px bg-border/60" />
              <div>
                <span className="text-muted-foreground text-[11px] block">产物文件总数</span>
                <span className="font-mono font-bold text-foreground text-sm mt-0.5 block">
                  {artifactStats ? `${artifactStats.totalFiles} 个压缩包` : '0 个'}
                </span>
              </div>
              <div className="h-7 w-px bg-border/60" />
              <div>
                <span className="text-muted-foreground text-[11px] block">上次清理时间</span>
                <span className="text-muted-foreground font-mono text-[11px] mt-0.5 block">
                  {settings.lastArtifactCleanupAt
                    ? new Date(settings.lastArtifactCleanupAt).toLocaleString()
                    : '未记录 / 尚未执行'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadCleanupStats}
                disabled={loadingStats}
                className="h-7 text-xs gap-1"
                title="重新统计产物大小"
              >
                <RefreshCw className={`size-3 ${loadingStats ? 'animate-spin' : ''}`} />
                刷新统计
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleManualCleanup('artifacts')}
                disabled={cleaningArtifacts}
                className="h-7 text-xs gap-1 border-blue-500/30 hover:bg-blue-500/10 text-blue-400"
              >
                <Trash2 className={`size-3 ${cleaningArtifacts ? 'animate-spin' : ''}`} />
                {cleaningArtifacts ? '正在清理产物...' : '立即清理过期产物'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">产物保留时长阈值</label>
              <select
                value={settings.artifactRetentionDays ?? 7}
                disabled={settings.enableArtifactCleanup === false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    artifactRetentionDays: Number(e.target.value),
                  })
                }
                className="w-full mt-1 flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value={3}>保留 3 天内构建产物</option>
                <option value={7}>保留 7 天 (推荐默认)</option>
                <option value={14}>保留 14 天 (2 周)</option>
                <option value={30}>保留 30 天 (1 个月)</option>
                <option value={60}>保留 60 天</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">单项目最多保留历史版本数</label>
              <select
                value={settings.artifactMaxKeepPerProject ?? 5}
                disabled={settings.enableArtifactCleanup === false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    artifactMaxKeepPerProject: Number(e.target.value),
                  })
                }
                className="w-full mt-1 flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value={3}>最多保留最新 3 份</option>
                <option value={5}>最多保留最新 5 份 (推荐)</option>
                <option value={10}>最多保留最新 10 份</option>
                <option value={20}>最多保留最新 20 份</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">巡检清理周期</label>
              <select
                value={settings.artifactCleanupIntervalHours ?? 24}
                disabled={settings.enableArtifactCleanup === false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    artifactCleanupIntervalHours: Number(e.target.value),
                  })
                }
                className="w-full mt-1 flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value={6}>每 6 小时巡检一次</option>
                <option value={12}>每 12 小时巡检一次</option>
                <option value={24}>每 24 小时 (每天一次，推荐)</option>
                <option value={48}>每 48 小时 (每两天一次)</option>
                <option value={168}>每 7 天 (每周一次)</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            * 安全防护保护机制：清理引擎对每个项目始终强制保留至少 1 份最新的有效产物，避免因误设导致无法一键秒级回滚。
          </p>
        </div>

        {/* Part B: Docker Image Pruning */}
        <div className="p-4 rounded-lg border border-border/70 bg-muted/20 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="size-4 text-amber-400" />
              <h4 className="text-xs font-bold text-foreground">
                Docker 镜像与构建缓存定时清理
              </h4>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.enableDockerImagePrune ?? true}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableDockerImagePrune: e.target.checked,
                  })
                }
                className="rounded border-border size-4"
              />
              启用 Docker 镜像定期自动清理
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-background/50 border border-border/50 text-xs">
            <div>
              <span className="text-muted-foreground text-[11px] block">上次 Docker 清理时间</span>
              <span className="text-muted-foreground font-mono text-[11px] mt-0.5 block">
                {settings.lastDockerPruneAt
                  ? new Date(settings.lastDockerPruneAt).toLocaleString()
                  : '未记录 / 尚未执行'}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleManualCleanup('docker')}
              disabled={cleaningDocker}
              className="h-7 text-xs gap-1 border-amber-500/30 hover:bg-amber-500/10 text-amber-400"
            >
              <Trash2 className={`size-3 ${cleaningDocker ? 'animate-spin' : ''}`} />
              {cleaningDocker ? '正在清理镜像...' : '立即清理 Docker 镜像'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">清理范围策略</label>
              <select
                value={settings.dockerPruneDanglingOnly ? 'dangling' : 'all'}
                disabled={settings.enableDockerImagePrune === false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dockerPruneDanglingOnly: e.target.value === 'dangling',
                  })
                }
                className="w-full mt-1 flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value="dangling">仅清理无标签悬空镜像 (&lt;none&gt;)</option>
                <option value="all">深度清理：包含超过阈值未使用的镜像</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">未使用镜像过期阈值</label>
              <select
                value={settings.dockerPruneRetentionHours ?? 72}
                disabled={settings.enableDockerImagePrune === false || settings.dockerPruneDanglingOnly !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dockerPruneRetentionHours: Number(e.target.value),
                  })
                }
                className="w-full mt-1 flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value={24}>超过 24 小时 (1 天) 未使用</option>
                <option value={72}>超过 72 小时 (3 天，推荐)</option>
                <option value={168}>超过 168 小时 (7 天)</option>
                <option value={720}>超过 720 小时 (30 天)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Docker 清理频率</label>
              <select
                value={settings.dockerPruneIntervalHours ?? 24}
                disabled={settings.enableDockerImagePrune === false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dockerPruneIntervalHours: Number(e.target.value),
                  })
                }
                className="w-full mt-1 flex h-8 rounded-md border border-input bg-card px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value={12}>每 12 小时清理一次</option>
                <option value={24}>每 24 小时 (每天一次，推荐)</option>
                <option value={48}>每 48 小时 (每两天一次)</option>
                <option value={168}>每 7 天 (每周一次)</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            * 执行时通过系统的标准 <code className="font-mono text-primary">docker image prune</code> 指令回收本地镜像缓存，正在运行的容器镜像不会受任何影响。
          </p>
        </div>
      </div>

      {/* 6. System Runtime Info */}
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

'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Play,
  RotateCcw,
  GitBranch,
  Server,
  Network,
  Code,
  Terminal,
  KeyRound,
  Webhook,
  History,
  Copy,
  Check,
  ExternalLink,
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Activity,
  Boxes,
  FolderArchive,
  Tag,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Project, Deployment, EnvVariable, ArtifactType, DockerDeliveryMode } from '@/lib/types'
import { DockerfileGuideModal } from '@/components/dockerfile-guide-modal'

interface ProjectDetailModalProps {
  project: Project
  onClose: () => void
  onDeploy: (projectId: string) => void
  onOpenDeploymentLog: (deploymentId: string) => void
  onProjectUpdated: () => void
}

type TabType = 'overview' | 'pipeline' | 'env' | 'webhook' | 'history'

export function ProjectDetailModal({
  project,
  onClose,
  onDeploy,
  onOpenDeploymentLog,
  onProjectUpdated,
}: ProjectDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loadingDeployments, setLoadingDeployments] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)
  const [showDockerfileModal, setShowDockerfileModal] = useState(false)

  // Edit form state
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description || '',
    branch: project.branch,
    installCommand: project.installCommand,
    buildCommand: project.buildCommand,
    startCommand: project.startCommand,
    deployPath: project.deployPath,
    serverIp: project.serverIp,
    port: project.port,
    healthCheckUrl: project.healthCheckUrl || '',
    runnerMode: project.runnerMode,
    artifactType: (project.artifactType || 'auto') as ArtifactType,
    dockerDeliveryMode: (project.dockerDeliveryMode || 'auto') as DockerDeliveryMode,
    dockerRegistry: project.dockerRegistry || { registryUrl: '', namespace: '' },
  })
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Env vars
  const [envVars, setEnvVars] = useState<EnvVariable[]>(project.envVars || [])
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({})

  // Fetch deployments for this project
  const loadDeployments = async () => {
    setLoadingDeployments(true)
    try {
      const res = await fetch(`/api/deployments?projectId=${project.id}`)
      if (res.ok) {
        const data = await res.json()
        setDeployments(data)
      }
    } catch (err) {
      console.error('Failed to load deployments', err)
    } finally {
      setLoadingDeployments(false)
    }
  }

  useEffect(() => {
    loadDeployments()
  }, [project.id])

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          envVars,
        }),
      })
      if (res.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
        onProjectUpdated()
      }
    } catch (err) {
      console.error('Failed to save project config', err)
    } finally {
      setSaving(false)
    }
  }

  const handleRollback = async (depId: string) => {
    if (!confirm('确认回滚到此历史成功版本？')) return
    setRollingBackId(depId)
    try {
      const res = await fetch(`/api/deployments/${depId}/rollback`, {
        method: 'POST',
      })
      if (res.ok) {
        const newDep = await res.json()
        onClose()
        onOpenDeploymentLog(newDep.id)
      }
    } catch (err) {
      console.error('Rollback error', err)
    } finally {
      setRollingBackId(null)
    }
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/${project.id}`
    : `/api/webhooks/${project.id}`

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopiedWebhook(true)
    setTimeout(() => setCopiedWebhook(false), 2000)
  }

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '', isSecret: false }])
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-5xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div
              className={`size-3 rounded-full ${
                project.status === 'active'
                  ? 'bg-green-500 ring-4 ring-green-500/20'
                  : project.status === 'deploying'
                    ? 'bg-cyan-500 animate-pulse'
                    : 'bg-muted-foreground'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">{project.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                  {project.id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                  {project.runtime}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                <span>{project.repository}</span>
                <span>•</span>
                <span>分支: {project.branch}</span>
                <span>•</span>
                <span>服务器: {project.serverName} ({project.serverIp}:{project.port})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onDeploy(project.id)}
              className="gap-1.5"
            >
              <Play className="size-4" />
              立即部署
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center border-b border-border px-6 bg-muted/10 gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: '基本信息', icon: Activity },
            { id: 'pipeline', label: '流水线配置', icon: Terminal },
            { id: 'env', label: '环境变量', icon: KeyRound },
            { id: 'webhook', label: 'Webhook 触发器', icon: Webhook },
            { id: 'history', label: '部署历史与回滚', icon: History },
          ].map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0 ${
                  active
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">项目名称</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">默认 Git 分支</label>
                  <Input
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">项目描述</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="请输入项目用途与描述"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">目标部署路径</label>
                  <Input
                    value={formData.deployPath}
                    onChange={(e) => setFormData({ ...formData, deployPath: e.target.value })}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">服务监听端口</label>
                  <Input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">健康检查探针 URL</label>
                  <Input
                    value={formData.healthCheckUrl}
                    onChange={(e) => setFormData({ ...formData, healthCheckUrl: e.target.value })}
                    placeholder="http://127.0.0.1:3000/health"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">执行引擎模式</label>
                  <select
                    value={formData.runnerMode}
                    onChange={(e) => setFormData({ ...formData, runnerMode: e.target.value as any })}
                    className="w-full mt-1 flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="simulation">沙箱安全模拟模式 (开箱即用，免配外部网络与SSH凭据)</option>
                    <option value="real">真实系统 Shell 执行模式 (本地真实 Git/编译 + 远程 SSH 隧道会话部署)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveConfig} disabled={saving} className="gap-2">
                  {saveSuccess ? <Check className="size-4 text-green-400" /> : <Save className="size-4" />}
                  {saveSuccess ? '已保存修改' : saving ? '保存中...' : '保存配置'}
                </Button>
              </div>
            </div>
          )}

          {/* 2. Pipeline Configuration */}
          {activeTab === 'pipeline' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Terminal className="size-4 text-primary" />
                  流水线执行阶段编排
                </h4>
                <p className="text-xs text-muted-foreground">
                  平台部署引擎将按顺序执行以下阶段。您可以自定义各个阶段的 Shell 执行脚本：
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      阶段 1: 依赖安装命令 (Install)
                    </span>
                  </div>
                  <Input
                    value={formData.installCommand}
                    onChange={(e) => setFormData({ ...formData, installCommand: e.target.value })}
                    className="font-mono text-sm"
                    placeholder="npm install 或 pip install -r requirements.txt"
                  />
                </div>

                <div className="p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      阶段 2: 应用编译与打包命令 (Build)
                    </span>
                  </div>
                  <Input
                    value={formData.buildCommand}
                    onChange={(e) => setFormData({ ...formData, buildCommand: e.target.value })}
                    className="font-mono text-sm"
                    placeholder="npm run build 或 dotnet publish"
                  />
                </div>

                {/* Stage 3: Artifact Distribution */}
                <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      阶段 3: 产物打包与远程分发策略 (Artifact Distribution)
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {formData.artifactType === 'docker' ||
                      (formData.artifactType === 'auto' &&
                        (project.runtime === 'Docker' ||
                          formData.buildCommand.toLowerCase().includes('docker build')))
                        ? '🎯 当前判定: Docker 镜像机制'
                        : '🎯 当前判定: Tar 归档机制'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, artifactType: 'auto' })}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        formData.artifactType === 'auto'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/40 text-muted-foreground'
                      }`}
                    >
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-primary" />
                        自动适配 (推荐)
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                        根据运行时或 build 指令智能选用机制
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, artifactType: 'docker' })}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        formData.artifactType === 'docker'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-border hover:border-blue-500/40 text-muted-foreground'
                      }`}
                    >
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Boxes className="size-3.5 text-blue-400" />
                        Docker 镜像机制
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                        docker save ➔ SFTP ➔ docker load
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, artifactType: 'tar' })}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        formData.artifactType === 'tar'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                          : 'border-border hover:border-amber-500/40 text-muted-foreground'
                      }`}
                    >
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <FolderArchive className="size-3.5 text-amber-400" />
                        文件归档机制
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                        tar -czf ➔ SFTP ➔ tar -xzf
                      </p>
                    </button>
                  </div>

                  {/* Docker Sub-mode Options */}
                  {(formData.artifactType === 'docker' ||
                    (formData.artifactType === 'auto' &&
                      (project.runtime === 'Docker' ||
                        formData.buildCommand.toLowerCase().includes('docker build')))) && (
                    <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Boxes className="size-3.5 text-blue-400" />
                          Docker 传输通道策略
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formData.dockerDeliveryMode === 'auto'
                            ? '当前：自动跟随全局策略'
                            : formData.dockerDeliveryMode === 'registry'
                              ? '当前：镜像仓库模式'
                              : '当前：SFTP 离线直连模式'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, dockerDeliveryMode: 'auto' })}
                          className={`p-2 rounded border text-left transition-all ${
                            formData.dockerDeliveryMode === 'auto'
                              ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                              : 'border-border/80 hover:border-blue-500/40 text-muted-foreground'
                          }`}
                        >
                          <p className="text-xs font-semibold">自动策略 (推荐)</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">有 Registry 走仓库，无则直连</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, dockerDeliveryMode: 'save_load' })}
                          className={`p-2 rounded border text-left transition-all ${
                            formData.dockerDeliveryMode === 'save_load'
                              ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                              : 'border-border/80 hover:border-blue-500/40 text-muted-foreground'
                          }`}
                        >
                          <p className="text-xs font-semibold">SFTP 离线直连</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">docker save ➔ SFTP ➔ load</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, dockerDeliveryMode: 'registry' })}
                          className={`p-2 rounded border text-left transition-all ${
                            formData.dockerDeliveryMode === 'registry'
                              ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                              : 'border-border/80 hover:border-blue-500/40 text-muted-foreground'
                          }`}
                        >
                          <p className="text-xs font-semibold">企业镜像仓库</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">docker push ➔ Registry ➔ pull</p>
                        </button>
                      </div>

                      {/* Project-specific Registry override */}
                      {formData.dockerDeliveryMode === 'registry' && (
                        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-blue-500/20 text-xs">
                          <div>
                            <label className="text-[11px] text-muted-foreground">专属 Registry URL (留空继承全局)</label>
                            <Input
                              value={formData.dockerRegistry?.registryUrl || ''}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dockerRegistry: {
                                    ...(formData.dockerRegistry || {}),
                                    registryUrl: e.target.value,
                                  },
                                })
                              }
                              placeholder="harbor.example.com"
                              className="mt-1 font-mono text-xs h-8"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-muted-foreground">专属命名空间 (留空继承全局)</label>
                            <Input
                              value={formData.dockerRegistry?.namespace || ''}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  dockerRegistry: {
                                    ...(formData.dockerRegistry || {}),
                                    namespace: e.target.value,
                                  },
                                })
                              }
                              placeholder="my-team"
                              className="mt-1 font-mono text-xs h-8"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-2.5 rounded-md bg-muted/40 border border-border/70 text-[11px] text-muted-foreground flex items-start gap-2">
                    {formData.artifactType === 'docker' ||
                    (formData.artifactType === 'auto' &&
                      (project.runtime === 'Docker' ||
                        formData.buildCommand.toLowerCase().includes('docker build'))) ? (
                      <>
                        <Boxes className="size-4 text-blue-400 shrink-0 mt-0.5" />
                        <span>
                          {formData.dockerDeliveryMode === 'registry' ? (
                            <>
                              <strong className="text-foreground">Docker 镜像仓库交付流程：</strong>
                              本地宿主机执行构建 ➔ 标记中央仓库全量 Tag ➔ 执行 <code className="text-blue-400">docker push</code> ➔ 目标主机远程高速执行 <code className="text-blue-400">docker pull</code> ➔ 自动映射本地短标签别名 ➔ 运行容器启动指令。
                            </>
                          ) : (
                            <>
                              <strong className="text-foreground">Docker 离线直连交付流程：</strong>
                              本地宿主机执行 <code className="text-blue-400">docker save</code> 导出并 gzip 压缩镜像，通过 SFTP 安全上传至目标主机临时目录，远程自动执行 <code className="text-blue-400">docker load</code> 载入镜像，完成后自动清理临时文件。
                            </>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <FolderArchive className="size-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-foreground">常规文件归档交付流程：</strong>
                          本地宿主机通过 <code className="text-amber-400">tar -czf</code> 归档代码与编译产物（自动排除 .git 目录），通过 SFTP 上传至目标主机临时目录，远程自动解压至部署目录 <code className="text-amber-400">{formData.deployPath}</code>。
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {(formData.artifactType === 'docker' ||
                  (formData.artifactType === 'auto' &&
                    (project.runtime === 'Docker' ||
                      formData.buildCommand.toLowerCase().includes('docker build')))) && (
                  <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <Boxes className="size-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-foreground">
                          Docker 容器化部署规范：确保代码仓库根目录下存在 Dockerfile
                        </p>
                        <p className="text-muted-foreground text-[11px] mt-0.5">
                          构建引擎将在项目根目录下执行 <code className="text-blue-400 font-mono">docker build .</code>。请确保已将标准 <code className="text-blue-400 font-mono">Dockerfile</code> (无后缀) 提交并推送至 Git 远程分支。
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowDockerfileModal(true)}
                      className="shrink-0 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 text-xs"
                    >
                      <Sparkles className="size-3 mr-1" />
                      查看 Dockerfile 模板与放置指引
                    </Button>
                  </div>
                )}

                <div className="p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      阶段 4: 启动/重载进程命令 (Start / Reload)
                    </span>
                  </div>
                  <Input
                    value={formData.startCommand}
                    onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                    className="font-mono text-sm"
                    placeholder="pm2 reload app || pm2 start dist/index.js 或 docker run ..."
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveConfig} disabled={saving} className="gap-2">
                  {saveSuccess ? <Check className="size-4 text-green-400" /> : <Save className="size-4" />}
                  {saveSuccess ? '已保存修改' : saving ? '保存中...' : '保存流水线配置'}
                </Button>
              </div>
            </div>
          )}

          {/* 3. Environment Variables */}
          {activeTab === 'env' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">项目环境变量</h4>
                  <p className="text-xs text-muted-foreground">
                    在构建与部署时自动注入到执行环境中（敏感信息如密钥将加密掩码展示）
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={addEnvVar} className="gap-1.5">
                  <Plus className="size-4" />
                  添加变量
                </Button>
              </div>

              {envVars.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                  暂未配置环境变量，点击右上角添加
                </div>
              ) : (
                <div className="space-y-2.5">
                  {envVars.map((env, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Input
                        placeholder="变量名 (如 PORT, NODE_ENV)"
                        value={env.key}
                        onChange={(e) => {
                          const updated = [...envVars]
                          updated[idx].key = e.target.value
                          setEnvVars(updated)
                        }}
                        className="w-1/3 font-mono text-xs"
                      />
                      <div className="relative flex-1">
                        <Input
                          type={env.isSecret && !showSecrets[idx] ? 'password' : 'text'}
                          placeholder="变量值"
                          value={env.value}
                          onChange={(e) => {
                            const updated = [...envVars]
                            updated[idx].value = e.target.value
                            setEnvVars(updated)
                          }}
                          className="font-mono text-xs pr-10"
                        />
                        {env.isSecret && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowSecrets({ ...showSecrets, [idx]: !showSecrets[idx] })
                            }
                            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                          >
                            {showSecrets[idx] ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        )}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={env.isSecret || false}
                          onChange={(e) => {
                            const updated = [...envVars]
                            updated[idx].isSecret = e.target.checked
                            setEnvVars(updated)
                          }}
                          className="rounded border-border"
                        />
                        保密
                      </label>
                      <button
                        type="button"
                        onClick={() => removeEnvVar(idx)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveConfig} disabled={saving} className="gap-2">
                  {saveSuccess ? <Check className="size-4 text-green-400" /> : <Save className="size-4" />}
                  {saveSuccess ? '已保存环境变量' : saving ? '保存中...' : '保存环境变量'}
                </Button>
              </div>
            </div>
          )}

          {/* 4. Webhook Trigger */}
          {activeTab === 'webhook' && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Webhook className="size-4 text-primary" />
                  Git 仓库自动触发 Webhook
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  在 GitHub、GitLab 或 Gitee 仓库的 Webhooks 设置中填入下方 URL。当有新的 git push 提交时，平台将自动拉取最新代码并触发部署流水线。
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">专属 Webhook URL</label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted/40" />
                  <Button variant="outline" size="sm" onClick={copyWebhook} className="gap-1.5 shrink-0">
                    {copiedWebhook ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedWebhook ? '已复制' : '复制链接'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">本地测试 cURL 命令</label>
                <pre className="p-3 rounded-lg bg-black/40 border border-border text-xs font-mono text-green-400 overflow-x-auto">
{`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"after": "7f8b2c4", "head_commit": {"message": "feat: 自动化部署测试"}}'`}
                </pre>
              </div>
            </div>
          )}

          {/* 5. Deploy History & Rollback */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">部署历史记录</h4>
                  <p className="text-xs text-muted-foreground">
                    查看历史每一次构建的执行状态、耗时，并可随时一键回滚
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={loadDeployments} disabled={loadingDeployments}>
                  刷新记录
                </Button>
              </div>

              {loadingDeployments ? (
                <div className="text-center py-8 text-xs text-muted-foreground">加载部署历史中...</div>
              ) : deployments.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                  暂无部署记录，点击右上角【立即部署】开启首次发布！
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {deployments.map((dep) => (
                    <div
                      key={dep.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              dep.status === 'success'
                                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                : dep.status === 'running'
                                  ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 animate-pulse'
                                  : dep.status === 'cancelled'
                                    ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                    : 'bg-red-500/10 text-red-500 border border-red-500/20'
                            }`}
                          >
                            {dep.status === 'success'
                              ? '成功'
                              : dep.status === 'running'
                                ? '执行中'
                                : dep.status === 'cancelled'
                                  ? '已取消'
                                  : '失败'}
                          </span>
                          <span className="text-xs font-mono font-medium text-foreground">
                            {dep.commitHash || dep.id}
                          </span>
                          {dep.versionTag && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                              title={`Docker 镜像版本标签: ${dep.versionTag}`}
                            >
                              <Tag className="size-3 shrink-0" />
                              {dep.versionTag}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {dep.triggerType === 'manual'
                              ? '手动触发'
                              : dep.triggerType === 'webhook'
                                ? 'Webhook'
                                : '一键回滚'}
                          </span>
                          {dep.durationSeconds !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              (耗时 {dep.durationSeconds}s)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {dep.commitMessage || '常规部署'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(dep.startTime).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onClose()
                            onOpenDeploymentLog(dep.id)
                          }}
                          className="gap-1.5 text-xs h-8"
                        >
                          <Terminal className="size-3.5" />
                          查看日志
                        </Button>
                        {dep.status === 'success' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRollback(dep.id)}
                            disabled={rollingBackId === dep.id}
                            className="gap-1.5 text-xs h-8"
                          >
                            <RotateCcw className="size-3.5" />
                            {rollingBackId === dep.id ? '回滚中...' : '回滚到此版本'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3.5 bg-muted/20 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>

      {showDockerfileModal && (
        <DockerfileGuideModal
          isOpen={showDockerfileModal}
          onClose={() => setShowDockerfileModal(false)}
          initialTemplateId={project.runtime.toLowerCase()}
        />
      )}
    </div>
  )
}

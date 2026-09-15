'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  X,
  Check,
  Server,
  Layers,
  GitBranch,
  Terminal,
  ShieldAlert,
  HardDrive,
  Boxes,
  FileCode,
  Sparkles,
  Copy,
  FolderTree,
} from 'lucide-react'
import {
  RuntimeType,
  RunnerMode,
  ServerNode,
  Project,
  ArtifactType,
  DockerDeliveryMode,
  DeployTargetMode,
} from '@/lib/types'
import { DockerfileGuideModal } from '@/components/guides/dockerfile-guide-modal'
import { DOCKERFILE_TEMPLATES, DockerfileTemplate } from '@/lib/dockerfile-templates'
import { getAllRuntimes, getRuntime, IRuntimePlugin } from '@/lib/runtimes'

type Step = 'basic' | 'git' | 'runtime' | 'server' | 'confirm'

interface WizardData {
  projectName: string
  description: string
  gitUrl: string
  gitBranch: string
  gitUsername: string
  gitToken: string
  runtime: RuntimeType | ''
  deployTargetMode: DeployTargetMode
  installCommand: string
  buildCommand: string
  startCommand: string
  selectedServerId: string
  serverName: string
  serverIp: string
  serverPort: string
  serverPath: string
  healthCheckUrl: string
  runnerMode: RunnerMode
  artifactType: ArtifactType
  dockerDeliveryMode: DockerDeliveryMode
}

interface NewProjectWizardProps {
  onClose: () => void
  onProjectCreated: (project: Project) => void
}

function toSafeSlug(name: string): string {
  const trimmed = name.trim().toLowerCase()
  const slug = trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || 'app'
}

function extractPortFromCommand(cmd: string): string | null {
  const dockerMatch = cmd.match(/-p\s+["']?(?:(\d+):)?(\d+)["']?/)
  if (dockerMatch) {
    return dockerMatch[1] || dockerMatch[2]
  }
  const bindMatch = cmd.match(/-b\s+["']?(?:[0-9.]+)?:(\d+)["']?/)
  if (bindMatch) {
    return bindMatch[1]
  }
  const portFlagMatch = cmd.match(/(?:--port[=\s]+|-p\s+)(\d+)/)
  if (portFlagMatch) {
    return portFlagMatch[1]
  }
  return null
}

export function NewProjectWizard({
  onClose,
  onProjectCreated,
}: NewProjectWizardProps) {
  const [step, setStep] = useState<Step>('basic')
  const [servers, setServers] = useState<ServerNode[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [data, setData] = useState<WizardData>({
    projectName: '',
    description: '',
    gitUrl: '',
    gitBranch: 'main',
    gitUsername: '',
    gitToken: '',
    runtime: 'Node.js',
    deployTargetMode: 'docker',
    installCommand: 'npm install',
    buildCommand: 'docker build -t app:latest .',
    startCommand: 'docker run -d -p 3000:3000 --name app app:latest',
    selectedServerId: 'srv-001',
    serverName: '生产服务器 1',
    serverIp: '192.168.1.100',
    serverPort: '3000',
    serverPath: '/opt/apps/app',
    healthCheckUrl: '',
    runnerMode: 'simulation',
    artifactType: 'docker',
    dockerDeliveryMode: 'auto',
  })

  const [showDockerfileModal, setShowDockerfileModal] = useState(false)
  const [selectedDockerTemplate, setSelectedDockerTemplate] = useState<DockerfileTemplate>(DOCKERFILE_TEMPLATES[0])
  const [copiedDockerCode, setCopiedDockerCode] = useState(false)

  const currentPlugin = useMemo(() => {
    return getRuntime(data.runtime) || getAllRuntimes()[0]
  }, [data.runtime])

  const handleDeployTargetModeChange = (mode: DeployTargetMode) => {
    const slug = toSafeSlug(data.projectName)
    const plugin = getRuntime(data.runtime) || getAllRuntimes()[0]
    const port = Number(data.serverPort) || plugin.defaultPort
    const install = plugin.getInstallCommand(slug, { mode })
    const build = plugin.getBuildCommand(slug, { mode })
    const start = plugin.getStartCommand(slug, port, { mode })

    setData((prev) => ({
      ...prev,
      deployTargetMode: mode,
      artifactType: mode === 'docker' ? 'docker' : 'tar',
      installCommand: install,
      buildCommand: build,
      startCommand: start,
    }))
  }

  const handleApplyDockerTemplate = (tmpl: DockerfileTemplate) => {
    setSelectedDockerTemplate(tmpl)
    const slug = toSafeSlug(data.projectName)
    const port = tmpl.defaultPort
    setData((prev) => ({
      ...prev,
      serverPort: port,
      startCommand: `docker run -d -p ${port}:${port} --name ${slug} ${slug}:latest`,
    }))
  }

  const handleCopyDockerCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedDockerCode(true)
    setTimeout(() => setCopiedDockerCode(false), 2000)
  }

  useEffect(() => {
    fetch('/api/servers')
      .then((res) => res.json())
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setServers(items)
          setData((prev) => ({
            ...prev,
            selectedServerId: items[0].id,
            serverName: items[0].name,
            serverIp: items[0].ip,
          }))
        }
      })
      .catch((err) => console.error('Failed to load server list', err))
  }, [])

  const steps: { id: Step; title: string }[] = [
    { id: 'basic', title: '基本信息' },
    { id: 'git', title: 'Git 仓库' },
    { id: 'runtime', title: '运行时 & 构建' },
    { id: 'server', title: '目标主机' },
    { id: 'confirm', title: '确认配置' },
  ]

  const stepIndex = steps.findIndex((s) => s.id === step)

  const handleNext = () => {
    setErrorMessage('')
    const nextStep = steps[stepIndex + 1]?.id
    if (nextStep) {
      setStep(nextStep)
    }
  }

  const handlePrev = () => {
    setErrorMessage('')
    const prevStep = steps[stepIndex - 1]?.id
    if (prevStep) {
      setStep(prevStep)
    }
  }

  const handleProjectNameChange = (name: string) => {
    const slug = toSafeSlug(name)
    setData((prev) => {
      // 部署路径自动联动为 /opt/apps/项目名称 (若用户未自定义其它路径)
      const shouldUpdatePath =
        !prev.serverPath || prev.serverPath.startsWith('/opt/apps/')
      const newPath = shouldUpdatePath ? `/opt/apps/${slug}` : prev.serverPath

      const plugin = getRuntime(prev.runtime) || getAllRuntimes()[0]
      const port = Number(prev.serverPort) || plugin.defaultPort

      let newBuild = prev.buildCommand
      let newStart = prev.startCommand
      if (prev.deployTargetMode === 'docker') {
        if (prev.buildCommand.includes('docker build')) {
          newBuild = `docker build -t ${slug}:latest .`
        }
        if (prev.startCommand.includes('docker run')) {
          newStart = `docker run -d -p ${port}:${port} --name ${slug} ${slug}:latest`
        }
      } else {
        newBuild = plugin.getBuildCommand(slug, { mode: 'native' })
        newStart = plugin.getStartCommand(slug, port, { mode: 'native' })
      }

      return {
        ...prev,
        projectName: name,
        serverPath: newPath,
        buildCommand: newBuild,
        startCommand: newStart,
      }
    })
  }

  const handleRuntimeSelect = (plugin: IRuntimePlugin) => {
    const slug = toSafeSlug(data.projectName)
    const port = plugin.defaultPort
    const mode = data.deployTargetMode || 'docker'
    const install = plugin.getInstallCommand(slug, { mode })
    const build = plugin.getBuildCommand(slug, { mode })
    const start = plugin.getStartCommand(slug, port, { mode })
    const tmpl = plugin.toDockerfileTemplate()

    setSelectedDockerTemplate(tmpl)
    setData((prev) => ({
      ...prev,
      runtime: plugin.name,
      installCommand: install,
      buildCommand: build,
      startCommand: start,
      serverPort: String(port),
      artifactType: mode === 'docker' ? 'docker' : 'tar',
    }))
  }

  const handleStartCommandChange = (cmd: string) => {
    const extractedPort = extractPortFromCommand(cmd)
    setData((prev) => ({
      ...prev,
      startCommand: cmd,
      ...(extractedPort ? { serverPort: extractedPort } : {}),
    }))
  }

  const handleServerPortChange = (port: string) => {
    setData((prev) => {
      let updatedStart = prev.startCommand
      if (prev.startCommand.includes('-p ')) {
        updatedStart = prev.startCommand.replace(
          /-p\s+["']?(\d+):(\d+)["']?/,
          `-p ${port}:$2`
        )
      }
      return {
        ...prev,
        serverPort: port,
        startCommand: updatedStart,
      }
    })
  }

  const handleServerSelect = (serverId: string) => {
    const srv = servers.find((s) => s.id === serverId)
    if (srv) {
      setData((prev) => ({
        ...prev,
        selectedServerId: srv.id,
        serverName: srv.name,
        serverIp: srv.ip,
      }))
    }
  }

  const isStepComplete = () => {
    switch (step) {
      case 'basic':
        return data.projectName.trim().length > 0
      case 'git':
        return data.gitUrl.trim().length > 0 && data.gitBranch.trim().length > 0
      case 'runtime':
        return data.runtime !== ''
      case 'server':
        return (
          data.serverIp.trim().length > 0 &&
          data.serverPort.trim().length > 0 &&
          data.serverPath.trim().length > 0
        )
      case 'confirm':
        return true
      default:
        return false
    }
  }

  const handleFinish = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const payload = {
        name: data.projectName,
        description: data.description,
        repository: data.gitUrl,
        branch: data.gitBranch,
        gitUsername: data.gitUsername,
        gitToken: data.gitToken,
        runtime: data.runtime,
        serverId: data.selectedServerId,
        serverIp: data.serverIp,
        serverName: data.serverName,
        port: Number(data.serverPort) || 3000,
        deployPath: data.serverPath,
        installCommand: data.installCommand,
        buildCommand: data.buildCommand,
        startCommand: data.startCommand,
        healthCheckUrl: data.healthCheckUrl?.trim() || '',
        runnerMode: data.runnerMode,
        artifactType: data.artifactType,
        deployTargetMode: data.deployTargetMode,
        dockerDeliveryMode: data.dockerDeliveryMode,
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '创建项目失败')
      }

      const newProject: Project = await res.json()
      onProjectCreated(newProject)
    } catch (err: any) {
      setErrorMessage(err.message || '网络请求异常')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div>
            <h2 className="text-lg font-bold text-foreground">创建新项目流水线</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              配置 Git 仓库、运行时环境与部署目标主机
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-muted/10">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center size-8 rounded-full font-semibold text-xs transition-colors ${idx <= stepIndex
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground'
                  }`}
              >
                {idx < stepIndex ? (
                  <Check className="size-4" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <div className="ml-2.5 hidden sm:block">
                <p className="text-xs font-medium text-foreground">{s.title}</p>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded-full ${idx < stepIndex ? 'bg-primary' : 'bg-muted'
                    }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Error alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Basic info */}
          {step === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  项目名称 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="例如：核心业务网关、支付处理中心"
                  value={data.projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  项目简要描述
                </label>
                <Input
                  placeholder="项目职责、技术栈或维护团队备注"
                  value={data.description}
                  onChange={(e) =>
                    setData({ ...data, description: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  流水线执行引擎模式
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <div
                    onClick={() => setData({ ...data, runnerMode: 'simulation' })}
                    className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${data.runnerMode === 'simulation'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                      }`}
                  >
                    <p className="text-sm font-semibold">沙箱演示模式</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      模拟完整真实部署流程与控制台输出，开箱即用无需依赖外部环境
                    </p>
                  </div>
                  <div
                    onClick={() => setData({ ...data, runnerMode: 'real' })}
                    className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${data.runnerMode === 'real'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                      }`}
                  >
                    <p className="text-sm font-semibold">本地真实执行模式</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      直接在本机环境调用 git / npm / dotnet / docker 执行构建
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Git Repo */}
          {step === 'git' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Git 仓库地址 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="https://github.com/team/service.git"
                  value={data.gitUrl}
                  onChange={(e) => setData({ ...data, gitUrl: e.target.value })}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  发布分支 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="main / master / release/1.0"
                  value={data.gitBranch}
                  onChange={(e) =>
                    setData({ ...data, gitBranch: e.target.value })
                  }
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Git 认证账号 (可选)
                  </label>
                  <Input
                    placeholder="例如：ci-bot"
                    value={data.gitUsername}
                    onChange={(e) =>
                      setData({ ...data, gitUsername: e.target.value })
                    }
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Personal Access Token (可选)
                  </label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxx 或私有令牌"
                    value={data.gitToken}
                    onChange={(e) =>
                      setData({ ...data, gitToken: e.target.value })
                    }
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Runtime & Commands */}
          {step === 'runtime' && (
            <div className="space-y-4">
              <label className="text-xs font-semibold text-muted-foreground">
                选择应用运行时环境模板
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {getAllRuntimes().map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => handleRuntimeSelect(rt)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${data.runtime === rt.name || data.runtime === rt.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{rt.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        :{rt.defaultPort}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {rt.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* 部署载体模式选择 */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    部署载体模式 (Deployment Target Mode) <span className="text-destructive">*</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    {data.deployTargetMode === 'native'
                      ? '当前：宿主机原生进程模式'
                      : '当前：Docker 容器化模式'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleDeployTargetModeChange('docker')}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${data.deployTargetMode === 'docker'
                      ? 'border-blue-500 bg-blue-500/10 shadow-xs'
                      : 'border-border hover:border-blue-500/40'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Boxes className="size-4 text-blue-400" />
                        容器部署 (Docker)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                        推荐 / 强隔离
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      多阶段编译为标准 Docker 镜像，通过轻量容器交付，目标主机仅需 Docker，隔离环境冲突。
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeployTargetModeChange('native')}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${data.deployTargetMode === 'native'
                      ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                      : 'border-border hover:border-amber-500/40'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Terminal className="size-4 text-amber-500" />
                        原生部署 (宿主机进程)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                        {currentPlugin.nativeProcessManager || '原生进程'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      直接在目标服务器以 {currentPlugin.name} 原生进程运行，SFTP 归档直传，免写任何 Dockerfile。
                    </p>
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-border">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    依赖安装命令
                  </label>
                  <Input
                    value={data.installCommand}
                    onChange={(e) =>
                      setData({ ...data, installCommand: e.target.value })
                    }
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    应用构建命令
                  </label>
                  <Input
                    value={data.buildCommand}
                    onChange={(e) =>
                      setData({ ...data, buildCommand: e.target.value })
                    }
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    启动/重载命令
                  </label>
                  <Input
                    value={data.startCommand}
                    onChange={(e) => handleStartCommandChange(e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Docker 模式下的 Dockerfile 规范与镜像分发策略 */}
              {data.deployTargetMode === 'docker' && (
                <>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3.5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center">
                          <Boxes className="size-3.5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground">
                            Dockerfile 必备规范与模板库
                          </span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                            必须放入项目根目录
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setShowDockerfileModal(true)}
                        className="text-xs text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                      >
                        <Sparkles className="size-3 mr-1" />
                        打开完整模板库与放置指引
                      </Button>
                    </div>

                    <div className="text-[11px] text-muted-foreground bg-background/60 rounded p-2.5 border border-border/60 space-y-1">
                      <p className="text-foreground font-medium flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-blue-400" />
                        <strong>存放位置指引：</strong>
                        请在 Git 代码仓库<strong>根目录</strong>下创建名为 <code className="text-blue-400 font-mono font-bold">Dockerfile</code> (无后缀) 的文件并提交。
                      </p>
                      <p className="pl-3 text-muted-foreground">
                        构建流水线执行 <code className="font-mono text-foreground">docker build .</code> 时将自动以此文件为蓝本生成镜像。若仓库根目录下缺少该文件，构建将报错。
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          常用技术栈 Dockerfile 模板快速选用：
                        </label>
                        <span className="text-[10px] text-muted-foreground">点击切换预览并可同步端口</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {DOCKERFILE_TEMPLATES.map((tmpl) => (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => setSelectedDockerTemplate(tmpl)}
                            className={`p-1.5 rounded border text-center transition-all ${selectedDockerTemplate.id === tmpl.id
                              ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                              : 'border-border hover:border-blue-500/40 text-muted-foreground hover:text-foreground bg-background/50'
                              }`}
                          >
                            <span className="text-[11px] block truncate">{tmpl.category}</span>
                            <span className="text-[9px] text-muted-foreground block font-mono">{tmpl.defaultPort}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Code Preview */}
                    <div className="rounded border border-border/70 bg-[#0d1117] p-2.5 text-xs">
                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40 text-[11px]">
                        <span className="font-mono text-neutral-300 flex items-center gap-1.5">
                          <FileCode className="size-3 text-blue-400" />
                          {selectedDockerTemplate.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApplyDockerTemplate(selectedDockerTemplate)}
                            className="text-[11px] text-primary hover:underline font-medium"
                          >
                            同步该端口 ({selectedDockerTemplate.defaultPort})
                          </button>
                          <span className="text-muted-foreground">•</span>
                          <button
                            type="button"
                            onClick={() => handleCopyDockerCode(selectedDockerTemplate.dockerfile)}
                            className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                          >
                            {copiedDockerCode ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                            {copiedDockerCode ? '已复制' : '复制代码'}
                          </button>
                        </div>
                      </div>
                      <pre className="font-mono text-[11px] text-neutral-300 max-h-[120px] overflow-y-auto leading-relaxed scrollbar-thin">
                        <code>{selectedDockerTemplate.dockerfile}</code>
                      </pre>
                    </div>
                  </div>

                  {/* Docker Delivery Mechanism */}
                  <div className="space-y-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Boxes className="size-3.5 text-blue-400" />
                        Docker 容器交付分发策略 (Docker Delivery Strategy)
                      </label>
                      <span className="text-[11px] font-medium text-blue-400">
                        🎯 统一 Docker 容器化交付体系
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setData({ ...data, dockerDeliveryMode: 'auto', artifactType: 'docker' })}
                        className={`p-2.5 rounded-lg border text-left transition-all ${data.dockerDeliveryMode === 'auto'
                          ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                          : 'border-border hover:border-blue-500/40 text-muted-foreground'
                          }`}
                      >
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-blue-400" />
                          自动策略 (推荐)
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                          若系统已配置 Registry 则优先走仓库，否则自动选用 SFTP 离线直连
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setData({ ...data, dockerDeliveryMode: 'save_load', artifactType: 'docker' })}
                        className={`p-2.5 rounded-lg border text-left transition-all ${data.dockerDeliveryMode === 'save_load'
                          ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                          : 'border-border hover:border-blue-500/40 text-muted-foreground'
                          }`}
                      >
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <HardDrive className="size-3.5 text-blue-400" />
                          SFTP 离线直连
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                          无外部仓库依赖：docker save ➔ gzip 压缩 ➔ SFTP 传输 ➔ load
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setData({ ...data, dockerDeliveryMode: 'registry', artifactType: 'docker' })}
                        className={`p-2.5 rounded-lg border text-left transition-all ${data.dockerDeliveryMode === 'registry'
                          ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                          : 'border-border hover:border-blue-500/40 text-muted-foreground'
                          }`}
                      >
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <Boxes className="size-3.5 text-blue-400" />
                          企业中心镜像仓库
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                          标准集群推拉：docker push 至 Registry ➔ 目标主机 docker pull
                        </p>
                      </button>
                    </div>

                    <div className="p-2.5 rounded-md bg-muted/40 border border-border/70 text-[11px] text-muted-foreground flex items-start gap-2">
                      <Boxes className="size-4 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        {data.dockerDeliveryMode === 'registry' ? (
                          <>
                            <strong className="text-foreground">Docker 镜像仓库分发机制：</strong>
                            本地构建镜像 ➔ 标记中央仓库全量 Tag ➔ <code className="text-blue-400">docker push</code> 推送至 Registry ➔ 目标主机远程 <code className="text-blue-400">docker pull</code> 高速拉取 ➔ 启动容器。
                          </>
                        ) : (
                          <>
                            <strong className="text-foreground">Docker 离线直连分发机制：</strong>
                            本地构建镜像 ➔ <code className="text-blue-400">docker save</code> 导出并压缩 ➔ SFTP 远程分发 ➔ 目标主机 <code className="text-blue-400">docker load</code> 导入镜像 ➔ 启动容器。
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* 原生模式下的运行环境要求与分发说明 */}
              {data.deployTargetMode === 'native' && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
                          <Terminal className="size-3.5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground">
                            {currentPlugin.name} 原生部署运行规范与分发机制
                          </span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                            {currentPlugin.nativeProcessManager || '原生进程托管'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground bg-background/60 rounded p-2.5 border border-border/60 space-y-2 leading-relaxed">
                      <div>
                        <p className="text-foreground font-medium flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-amber-400" />
                          <strong>目标服务器环境要求：</strong>
                        </p>
                        <p className="pl-3 text-muted-foreground mt-0.5">
                          {currentPlugin.nativeRequirementDesc || '目标服务器需具备对应语言运行环境与工具依赖。'}在点击【立即部署】时，平台前置探针将自动校验目标主机环境 (需依赖: <code className="text-amber-400 font-mono">{currentPlugin.getRequiredTools('native').join('、') || '基础依赖'}</code>)。
                        </p>
                      </div>

                      <div className="pt-1 border-t border-border/40">
                        <p className="text-foreground font-medium flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-amber-400" />
                          <strong>交付分发管道：</strong>
                        </p>
                        <p className="pl-3 text-muted-foreground mt-0.5">
                          构建引擎在本地执行编译（如 <code className="text-amber-400 font-mono">{data.buildCommand || currentPlugin.defaultNativeBuildCmd}</code>）后，将应用产物打包为 <code className="text-amber-400 font-mono">.tar.gz</code> 归档包，通过 SFTP 安全管道直传目标服务器目标目录并解压，最后通过 SSH 会话执行启动命令。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Server target */}
          {step === 'server' && (
            <div className="space-y-4">
              {servers.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    从已有服务器节点选择
                  </label>
                  <select
                    value={data.selectedServerId}
                    onChange={(e) => handleServerSelect(e.target.value)}
                    className="w-full mt-1 flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.ip}:{s.port})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    服务器 IP <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={data.serverIp}
                    onChange={(e) =>
                      setData({ ...data, serverIp: e.target.value })
                    }
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    监听端口 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={data.serverPort}
                    onChange={(e) => handleServerPortChange(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  目标部署路径 <span className="text-destructive">*</span>
                </label>
                <Input
                  value={data.serverPath}
                  onChange={(e) =>
                    setData({ ...data, serverPath: e.target.value })
                  }
                  className="mt-1 font-mono text-sm"
                  placeholder="/opt/apps/my-service"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  健康检查 URL (可选)
                </label>
                <Input
                  value={data.healthCheckUrl}
                  onChange={(e) =>
                    setData({ ...data, healthCheckUrl: e.target.value })
                  }
                  className="mt-1 font-mono text-sm"
                  placeholder={`http://${data.serverIp || '127.0.0.1'}:${data.serverPort || '3000'}/health`}
                />
              </div>
            </div>
          )}

          {/* Step 5: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                <span className="text-xs text-muted-foreground block">项目基本信息</span>
                <p className="text-sm font-bold text-foreground mt-0.5">{data.projectName}</p>
                {data.description && (
                  <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
                )}
              </div>

              <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                <span className="text-xs text-muted-foreground block">Git 仓库与分支</span>
                <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                  {data.gitUrl}
                </p>
                <span className="text-xs text-muted-foreground mt-0.5 block">
                  分支: <code className="text-foreground">{data.gitBranch}</code>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                  <span className="text-xs text-muted-foreground block">运行时环境</span>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{data.runtime}</p>
                  <span className="text-[11px] text-muted-foreground font-mono block mt-1">
                    构建: {data.buildCommand}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                  <span className="text-xs text-muted-foreground block">目标主机</span>
                  <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                    {data.serverIp}:{data.serverPort}
                  </p>
                  <span className="text-[11px] text-muted-foreground font-mono block mt-1">
                    路径: {data.serverPath}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                <span className="text-xs text-muted-foreground block">交付与分发机制</span>
                <div className="flex items-center gap-2 mt-1">
                  {data.deployTargetMode === 'native' ? (
                    <>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 text-xs font-semibold">
                        <Terminal className="size-3.5" />
                        原生进程交付 (Native SFTP)
                      </div>
                      <span className="text-xs text-muted-foreground">
                        (SFTP 产物归档直传 ➔ 目标机解压 ➔ {currentPlugin.nativeProcessManager || '原生进程'}启动)
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs font-semibold">
                        <Boxes className="size-3.5" />
                        Docker 容器交付
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {data.dockerDeliveryMode === 'registry'
                          ? '(企业镜像仓库: docker push ➔ Registry ➔ docker pull)'
                          : data.dockerDeliveryMode === 'save_load'
                            ? '(SFTP 离线直连: docker save ➔ SFTP ➔ docker load)'
                            : '(自动推荐策略: 优先根据仓库配置选用)'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {data.deployTargetMode === 'native' ? (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 text-amber-300">
                    <Terminal className="size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-200">
                        原生部署就绪提醒
                      </p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        项目已配置为目标主机原生部署模式。部署时系统将自动检测目标服务器 {currentPlugin.name} 运行环境 ({currentPlugin.getRequiredTools('native').join('、') || '原生依赖'})，并通过 SFTP 上传归档解压运行。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 text-blue-300">
                    <Boxes className="size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-200">
                        Dockerfile 部署就绪检查
                      </p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        使用 Docker 部署时，构建引擎将在代码根目录下执行 <code>docker build</code>。请确保已将 <code>Dockerfile</code> 提交并推送至 Git 远程分支。
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setShowDockerfileModal(true)}
                    className="text-xs text-blue-300 border-blue-500/30 hover:bg-blue-500/20 shrink-0"
                  >
                    查看 Dockerfile 模板与规范
                  </Button>
                </div>
              )}

              <div className="p-3.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-xs flex items-center gap-2">
                <Check className="size-4 shrink-0" />
                <span>配置完整！点击下方【创建项目】即可写入数据库并进入交付列表。</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-muted/20">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={stepIndex === 0 || loading}
          >
            上一步
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
              取消
            </Button>
            {step === 'confirm' ? (
              <Button size="sm" onClick={handleFinish} disabled={loading} className="min-w-24">
                {loading ? '创建中...' : '创建项目'}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleNext}
                disabled={!isStepComplete() || loading}
              >
                下一步
              </Button>
            )}
          </div>
        </div>
      </div>

      {showDockerfileModal && (
        <DockerfileGuideModal
          isOpen={showDockerfileModal}
          onClose={() => setShowDockerfileModal(false)}
          initialTemplateId={selectedDockerTemplate.id}
          onApplyTemplate={handleApplyDockerTemplate}
        />
      )}
    </div>
  )
}

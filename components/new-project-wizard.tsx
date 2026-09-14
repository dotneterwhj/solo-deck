'use client'

import { useState, useEffect } from 'react'
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
  FolderArchive,
} from 'lucide-react'
import {
  RuntimeType,
  RunnerMode,
  ServerNode,
  Project,
  ArtifactType,
  DockerDeliveryMode,
} from '@/lib/types'

type Step = 'basic' | 'git' | 'runtime' | 'server' | 'confirm'

interface WizardData {
  projectName: string
  description: string
  gitUrl: string
  gitBranch: string
  gitUsername: string
  gitToken: string
  runtime: RuntimeType | ''
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

const RUNTIME_PRESETS: {
  id: RuntimeType
  name: string
  desc: string
  install: string
  build: string
  start: string
  defaultPort: string
}[] = [
  {
    id: 'Node.js',
    name: 'Node.js',
    desc: '适用于 Next.js, Express, NestJS, React, Vue 前后端应用',
    install: 'pnpm install || npm install',
    build: 'npm run build',
    start: 'npm start',
    defaultPort: '3000',
  },
  {
    id: 'Python',
    name: 'Python',
    desc: '适用于 FastAPI, Flask, Django, 数据科学与算法任务',
    install: 'pip install -r requirements.txt',
    build: 'python setup.py build',
    start: 'gunicorn -w 4 -b 0.0.0.0:5000 app:app --daemon',
    defaultPort: '5000',
  },
  {
    id: 'ASP.NET Core',
    name: 'ASP.NET Core',
    desc: '适用于 C# 企业级微服务与高性能 Web API',
    install: 'dotnet restore',
    build: 'dotnet publish -c Release -o ./publish',
    start: 'dotnet ./publish/App.dll',
    defaultPort: '8080',
  },
  {
    id: 'Go',
    name: 'Go',
    desc: '适用于 Gin, Fiber, gRPC 高性能后端服务',
    install: 'go mod download',
    build: 'go build -o server .',
    start: './server',
    defaultPort: '8000',
  },
  {
    id: 'Java',
    name: 'Java (Spring Boot)',
    desc: '适用于 Spring Boot / Cloud 企业级应用',
    install: 'mvn clean compile',
    build: 'mvn package -DskipTests',
    start: 'java -jar target/app.jar',
    defaultPort: '8080',
  },
  {
    id: 'Docker',
    name: 'Docker 容器',
    desc: '使用 Dockerfile 容器化构建与发布镜像',
    install: 'docker version',
    build: 'docker build -t app:latest .',
    start: 'docker run -d -p 8080:8080 --name app app:latest',
    defaultPort: '8080',
  },
]

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
    installCommand: 'npm install',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    selectedServerId: 'srv-001',
    serverName: '生产服务器 1',
    serverIp: '192.168.1.100',
    serverPort: '3000',
    serverPath: '/opt/apps/app',
    healthCheckUrl: '',
    runnerMode: 'simulation',
    artifactType: 'auto',
    dockerDeliveryMode: 'auto',
  })

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

      let newBuild = prev.buildCommand
      let newStart = prev.startCommand
      if (prev.runtime === 'Docker') {
        const port = prev.serverPort || '8080'
        newBuild = `docker build -t ${slug}:latest .`
        newStart = `docker run -d -p ${port}:${port} --name ${slug} ${slug}:latest`
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

  const handleRuntimeSelect = (rt: (typeof RUNTIME_PRESETS)[0]) => {
    const slug = toSafeSlug(data.projectName)
    let build = rt.build
    let start = rt.start
    if (rt.id === 'Docker') {
      const port = rt.defaultPort || '8080'
      build = `docker build -t ${slug}:latest .`
      start = `docker run -d -p ${port}:${port} --name ${slug} ${slug}:latest`
    }

    setData((prev) => ({
      ...prev,
      runtime: rt.id,
      installCommand: rt.install,
      buildCommand: build,
      startCommand: start,
      serverPort: rt.defaultPort,
      artifactType: rt.id === 'Docker' ? 'docker' : prev.artifactType === 'docker' ? 'auto' : prev.artifactType,
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
      if (prev.runtime === 'Docker' && prev.startCommand.includes('-p ')) {
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
        healthCheckUrl:
          data.healthCheckUrl || `http://${data.serverIp}:${data.serverPort}/health`,
        runnerMode: data.runnerMode,
        artifactType: data.artifactType,
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
                className={`flex items-center justify-center size-8 rounded-full font-semibold text-xs transition-colors ${
                  idx <= stepIndex
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
                  className={`flex-1 h-0.5 mx-2 rounded-full ${
                    idx < stepIndex ? 'bg-primary' : 'bg-muted'
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
                    className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                      data.runnerMode === 'simulation'
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
                    className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                      data.runnerMode === 'real'
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
                {RUNTIME_PRESETS.map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => handleRuntimeSelect(rt)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      data.runtime === rt.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <p className="text-sm font-semibold">{rt.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {rt.desc}
                    </p>
                  </button>
                ))}
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

              {/* Artifact Delivery Mechanism */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    产物打包与远程分发策略 (Artifact Distribution)
                  </label>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {data.artifactType === 'docker' ||
                    (data.artifactType === 'auto' &&
                      (data.runtime === 'Docker' ||
                        data.buildCommand.toLowerCase().includes('docker build')))
                      ? '🎯 判定生效: Docker 镜像机制'
                      : '🎯 判定生效: Tar 归档机制'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setData({ ...data, artifactType: 'auto' })}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      data.artifactType === 'auto'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    }`}
                  >
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-primary" />
                      自动适配 (推荐)
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      按运行时或构建指令智能选用 Docker / Tar 机制
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setData({ ...data, artifactType: 'docker' })}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      data.artifactType === 'docker'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-border hover:border-blue-500/40 text-muted-foreground'
                    }`}
                  >
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Boxes className="size-3.5 text-blue-400" />
                      Docker 镜像分发
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      docker save ➔ SFTP ➔ docker load
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setData({ ...data, artifactType: 'tar' })}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      data.artifactType === 'tar'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-border hover:border-amber-500/40 text-muted-foreground'
                    }`}
                  >
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <FolderArchive className="size-3.5 text-amber-400" />
                      Tar 归档包分发
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      tar -czf ➔ SFTP ➔ tar -xzf 解压
                    </p>
                  </button>
                </div>

                {/* Docker Sub-delivery Mode Selector */}
                {(data.artifactType === 'docker' ||
                  (data.artifactType === 'auto' &&
                    (data.runtime === 'Docker' ||
                      data.buildCommand.toLowerCase().includes('docker build')))) && (
                  <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Boxes className="size-3.5 text-blue-400" />
                        Docker 镜像分发通道策略
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                        {data.dockerDeliveryMode === 'auto'
                          ? '自动策略 (优先根据系统设置)'
                          : data.dockerDeliveryMode === 'registry'
                            ? '中心镜像仓库模式'
                            : 'SFTP 离线直连模式'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setData({ ...data, dockerDeliveryMode: 'auto' })}
                        className={`p-2 rounded border text-left transition-all ${
                          data.dockerDeliveryMode === 'auto'
                            ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                            : 'border-border hover:border-blue-500/40 text-muted-foreground'
                        }`}
                      >
                        <p className="text-xs font-semibold">自动策略 (推荐)</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">有 Registry 走仓库，无则直连</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setData({ ...data, dockerDeliveryMode: 'save_load' })}
                        className={`p-2 rounded border text-left transition-all ${
                          data.dockerDeliveryMode === 'save_load'
                            ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                            : 'border-border hover:border-blue-500/40 text-muted-foreground'
                        }`}
                      >
                        <p className="text-xs font-semibold">SFTP 离线直连</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">docker save ➔ SFTP ➔ load</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setData({ ...data, dockerDeliveryMode: 'registry' })}
                        className={`p-2 rounded border text-left transition-all ${
                          data.dockerDeliveryMode === 'registry'
                            ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                            : 'border-border hover:border-blue-500/40 text-muted-foreground'
                        }`}
                      >
                        <p className="text-xs font-semibold">企业镜像仓库</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">docker push ➔ Registry ➔ pull</p>
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-2.5 rounded-md bg-muted/40 border border-border/70 text-[11px] text-muted-foreground flex items-start gap-2">
                  {data.artifactType === 'docker' ||
                  (data.artifactType === 'auto' &&
                    (data.runtime === 'Docker' ||
                      data.buildCommand.toLowerCase().includes('docker build'))) ? (
                    <>
                      <Boxes className="size-4 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        {data.dockerDeliveryMode === 'registry' ? (
                          <>
                            <strong className="text-foreground">Docker 镜像仓库分发机制：</strong>
                            本地构建镜像 ➔ 标记中央仓库全量 Tag ➔ <code className="text-blue-400">docker push</code> 推送至 Registry ➔ 目标主机远程 <code className="text-blue-400">docker pull</code> 高速拉取 ➔ 映射本地别名并启动容器。
                          </>
                        ) : (
                          <>
                            <strong className="text-foreground">Docker 离线直连分发机制：</strong>
                            本地构建镜像 ➔ <code className="text-blue-400">docker save</code> 导出并压缩 ➔ SFTP 远程分发 ➔ 目标主机 <code className="text-blue-400">docker load</code> 导入镜像 ➔ 启动容器。
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <FolderArchive className="size-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-foreground">常规文件归档分发流程：</strong>
                        本地编译构建 ➔ <code className="text-amber-400">tar -czf</code> 打包产物（排除 .git）➔ SFTP 远程分发 ➔ 目标主机 <code className="text-amber-400">tar -xzf</code> 解压至目标目录 ➔ 启动进程。
                      </span>
                    </>
                  )}
                </div>
              </div>
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
                <span className="text-xs text-muted-foreground block">产物分发交付机制</span>
                <div className="flex items-center gap-2 mt-1">
                  {data.artifactType === 'docker' ||
                  (data.artifactType === 'auto' &&
                    (data.runtime === 'Docker' ||
                      data.buildCommand.toLowerCase().includes('docker build'))) ? (
                    <>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs font-semibold">
                        <Boxes className="size-3.5" />
                        Docker 镜像机制
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {data.dockerDeliveryMode === 'registry'
                          ? '(企业镜像仓库: docker push ➔ Registry ➔ docker pull)'
                          : data.dockerDeliveryMode === 'save_load'
                            ? '(SFTP 离线直连: docker save ➔ SFTP ➔ docker load)'
                            : '(自动适配策略: 优先根据仓库配置选择)'}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                        <FolderArchive className="size-3.5" />
                        常规文件归档机制
                      </div>
                      <span className="text-xs text-muted-foreground">
                        (tar -czf 打包 ➔ SFTP 远程分发 ➔ tar -xzf 解压)
                      </span>
                    </>
                  )}
                </div>
              </div>

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
    </div>
  )
}

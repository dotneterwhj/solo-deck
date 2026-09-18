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
  Plus,
  Trash2,
  Eye,
  EyeOff,
  KeyRound,
  Sparkles,
  Copy,
  RotateCcw,
} from 'lucide-react'
import {
  RuntimeType,
  RunnerMode,
  ServerNode,
  Project,
  ArtifactType,
  DockerDeliveryMode,
  DeployTargetMode,
  DockerBuildArg,
  EnvVariable,
  PortMapping,
} from '@/lib/types'
import { DockerfileGuideModal } from '@/components/guides/dockerfile-guide-modal'
import { DOCKERFILE_TEMPLATES, DockerfileTemplate } from '@/lib/dockerfile-templates'
import {
  getAllRuntimes,
  getRuntime,
  IRuntimePlugin,
  extractPortsFromCommand,
  extractPortMappingsFromCommand,
  safeUpdateStartCommandOnPortChange,
  safeUpdateStartCommandOnEnvChange,
} from '@/lib/runtimes'
import { getCarrierCommandStrategy } from '@/lib/carriers/command-strategy'
import { validateProjectName } from '@/lib/validators'
import { detectGitProvider, getGitAuthHint } from '@/lib/git-utils'

type Step = 'basic' | 'git' | 'runtime' | 'env' | 'server' | 'confirm'

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
  serverPort: number[]
  containerPort: number[]
  portMappings: PortMapping[]
  serverPath: string
  healthCheckUrl: string
  runnerMode: RunnerMode
  artifactType: ArtifactType
  dockerDeliveryMode: DockerDeliveryMode
  dockerBuildArgs: DockerBuildArg[]
  envVars: EnvVariable[]
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

export function NewProjectWizard({
  onClose,
  onProjectCreated,
}: NewProjectWizardProps) {
  const [step, setStep] = useState<Step>('basic')
  const [servers, setServers] = useState<ServerNode[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({})
  const [portInput, setPortInput] = useState('3000')

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
    startCommand: 'docker run -d --restart unless-stopped -p 3000:3000 -e NODE_ENV="production" -e PORT="3000" --name app app:latest',
    selectedServerId: 'srv-001',
    serverName: '生产服务器 1',
    serverIp: '192.168.1.100',
    serverPort: [3000],
    containerPort: [3000],
    portMappings: [{ host: 3000, container: 3000 }],
    serverPath: '/opt/apps/app',
    healthCheckUrl: '',
    runnerMode: 'simulation',
    artifactType: 'docker',
    dockerDeliveryMode: 'auto',
    dockerBuildArgs: [],
    envVars: [
      { key: 'NODE_ENV', value: 'production' },
      { key: 'PORT', value: '3000' },
    ],
  })

  const [showDockerfileModal, setShowDockerfileModal] = useState(false)
  const [selectedDockerTemplate, setSelectedDockerTemplate] = useState<DockerfileTemplate>(DOCKERFILE_TEMPLATES[0])
  const [copiedDockerCode, setCopiedDockerCode] = useState(false)
  const [isStartCommandCustomized, setIsStartCommandCustomized] = useState(false)

  const currentPlugin = useMemo(() => {
    return getRuntime(data.runtime) || getAllRuntimes()[0]
  }, [data.runtime])

  const handleDeployTargetModeChange = (mode: DeployTargetMode) => {
    setIsStartCommandCustomized(false)
    const strategy = getCarrierCommandStrategy(mode)
    const slug = toSafeSlug(data.projectName)
    const plugin = getRuntime(data.runtime) || getAllRuntimes()[0]
    const mappings =
      data.portMappings && data.portMappings.length > 0
        ? data.portMappings
        : data.serverPort.length > 0
          ? data.serverPort.map((p) => ({ host: p, container: p }))
          : [{ host: plugin.defaultPort, container: plugin.defaultPort }]
    const install = strategy.getInstallCommand(plugin, slug)
    const build = strategy.getBuildCommand(plugin, slug)
    const start = strategy.getStartCommand(plugin, slug, mappings, data.envVars)

    setData((prev) => ({
      ...prev,
      deployTargetMode: mode,
      artifactType: mode === 'docker' ? 'docker' : 'tar',
      installCommand: install,
      buildCommand: build,
      startCommand: start,
      portMappings: mappings,
      serverPort: mappings.map((m) => m.host),
      containerPort: mappings.map((m) => m.container),
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
    { id: 'env', title: '环境变量' },
    { id: 'server', title: '目标主机' },
    { id: 'confirm', title: '确认配置' },
  ]

  const stepIndex = steps.findIndex((s) => s.id === step)

  const handleNext = () => {
    setErrorMessage('')
    if (step === 'basic') {
      const check = validateProjectName(data.projectName)
      if (!check.valid) {
        setErrorMessage(check.error || '项目名称不符合规范')
        return
      }
    }
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
      const strategy = getCarrierCommandStrategy(prev.deployTargetMode)
      const mappings =
        prev.portMappings && prev.portMappings.length > 0
          ? prev.portMappings
          : prev.serverPort.length > 0
            ? prev.serverPort.map((p) => ({ host: p, container: p }))
            : [{ host: plugin.defaultPort, container: plugin.defaultPort }]
      const newBuild = strategy.getBuildCommand(plugin, slug)
      const newStart = isStartCommandCustomized
        ? prev.startCommand
        : strategy.getStartCommand(plugin, slug, mappings, prev.envVars)

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
    setIsStartCommandCustomized(false)
    const slug = toSafeSlug(data.projectName)
    const port = plugin.defaultPort
    const mode = data.deployTargetMode || 'docker'
    const strategy = getCarrierCommandStrategy(mode)
    const install = strategy.getInstallCommand(plugin, slug)
    const build = strategy.getBuildCommand(plugin, slug)
    const tmpl = plugin.toDockerfileTemplate()

    // 根据运行时插件声明的 Docker 构建参数定义，初始化 dockerBuildArgs（预填默认值）
    const buildArgs: DockerBuildArg[] = (plugin.dockerBuildArgs || []).map((def) => ({
      key: def.key,
      value: def.defaultValue || '',
    }))

    // 根据运行时插件声明的默认环境变量模板初始化
    const presetEnvs: EnvVariable[] = (plugin.sampleEnvVars || []).map((preset) => ({
      key: preset.key,
      value: preset.key.toUpperCase() === 'PORT' ? String(port) : preset.value,
      isSecret: false,
    }))

    const mappings: PortMapping[] = [{ host: port, container: port }]
    const start = strategy.getStartCommand(plugin, slug, mappings, presetEnvs)

    setSelectedDockerTemplate(tmpl)
    setPortInput(String(port))
    setData((prev) => ({
      ...prev,
      runtime: plugin.name,
      installCommand: install,
      buildCommand: build,
      startCommand: start,
      serverPort: [port],
      containerPort: [port],
      portMappings: mappings,
      artifactType: mode === 'docker' ? 'docker' : 'tar',
      dockerBuildArgs: buildArgs,
      envVars: presetEnvs,
    }))
  }

  const handleStartCommandChange = (cmd: string) => {
    setIsStartCommandCustomized(true)
    const extractedMappings = extractPortMappingsFromCommand(cmd)
    const extractedPorts = extractedMappings.length > 0 ? extractedMappings.map((m) => m.host) : extractPortsFromCommand(cmd)
    const extractedCPorts = extractedMappings.length > 0 ? extractedMappings.map((m) => m.container) : extractedPorts
    setData((prev) => ({
      ...prev,
      startCommand: cmd,
      ...(extractedPorts.length > 0
        ? {
          serverPort: extractedPorts,
          containerPort: extractedCPorts,
          portMappings:
            extractedMappings.length > 0
              ? extractedMappings
              : extractedPorts.map((p) => ({ host: p, container: p })),
        }
        : {}),
    }))
    if (extractedPorts.length > 0) {
      setPortInput(extractedPorts.join(', '))
    }
  }

  const handleResetStartCommand = () => {
    setIsStartCommandCustomized(false)
    const strategy = getCarrierCommandStrategy(data.deployTargetMode)
    const slug = toSafeSlug(data.projectName)
    const mappings =
      data.portMappings && data.portMappings.length > 0
        ? data.portMappings
        : data.serverPort.length > 0
          ? data.serverPort.map((p) => ({ host: p, container: p }))
          : [{ host: currentPlugin.defaultPort, container: currentPlugin.defaultPort }]
    const defaultCmd = strategy.getStartCommand(currentPlugin, slug, mappings, data.envVars)
    setData((prev) => ({ ...prev, startCommand: defaultCmd }))
  }

  const handleServerPortChange = (ports: number[]) => {
    setData((prev) => {
      const primaryPort = ports[0] || 3000
      const updatedEnvVars = prev.envVars.map((e) =>
        e.key.toUpperCase() === 'PORT' ? { ...e, value: String(primaryPort) } : e
      )
      const slug = toSafeSlug(prev.projectName)
      const plugin = getRuntime(prev.runtime) || getAllRuntimes()[0]
      const mappings: PortMapping[] = ports.map((p, idx) => ({
        host: p,
        container: (prev.containerPort && prev.containerPort[idx]) || p,
      }))
      const updatedStart = safeUpdateStartCommandOnPortChange(
        prev.startCommand,
        mappings,
        prev.deployTargetMode,
        isStartCommandCustomized,
        plugin,
        slug,
        updatedEnvVars,
        prev.serverPort
      )
      return {
        ...prev,
        serverPort: ports,
        containerPort: mappings.map((m) => m.container),
        portMappings: mappings,
        startCommand: updatedStart,
        envVars: updatedEnvVars,
      }
    })
  }

  const handlePortMappingUpdate = (
    index: number,
    field: 'host' | 'container',
    value: number
  ) => {
    setData((prev) => {
      const updated = prev.portMappings.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      )
      const hostPorts = updated.map((m) => m.host).filter((p) => !isNaN(p) && p > 0)
      const containerPorts = updated.map((m) => m.container).filter((p) => !isNaN(p) && p > 0)
      const primaryContainerPort = containerPorts[0] || (currentPlugin.defaultPort || 3000)

      const updatedEnvVars = prev.envVars.map((e) =>
        e.key.toUpperCase() === 'PORT' ? { ...e, value: String(primaryContainerPort) } : e
      )
      const slug = toSafeSlug(prev.projectName)
      const updatedStart = safeUpdateStartCommandOnPortChange(
        prev.startCommand,
        updated,
        prev.deployTargetMode,
        isStartCommandCustomized,
        currentPlugin,
        slug,
        updatedEnvVars,
        prev.serverPort
      )

      return {
        ...prev,
        portMappings: updated,
        serverPort: hostPorts.length > 0 ? hostPorts : [3000],
        containerPort: containerPorts.length > 0 ? containerPorts : [3000],
        startCommand: updatedStart,
        envVars: updatedEnvVars,
      }
    })
  }

  const handleAddPortMapping = () => {
    setData((prev) => {
      const last = prev.portMappings[prev.portMappings.length - 1]
      const nextHost = last ? last.host + 1 : 8080
      const nextContainer = last ? last.container + 1 : currentPlugin.defaultPort
      const updated: PortMapping[] = [
        ...prev.portMappings,
        { host: nextHost, container: nextContainer },
      ]
      const hostPorts = updated.map((m) => m.host)
      const containerPorts = updated.map((m) => m.container)
      const slug = toSafeSlug(prev.projectName)
      const updatedStart = safeUpdateStartCommandOnPortChange(
        prev.startCommand,
        updated,
        prev.deployTargetMode,
        isStartCommandCustomized,
        currentPlugin,
        slug,
        prev.envVars,
        prev.serverPort
      )
      return {
        ...prev,
        portMappings: updated,
        serverPort: hostPorts,
        containerPort: containerPorts,
        startCommand: updatedStart,
      }
    })
  }

  const handleRemovePortMapping = (index: number) => {
    setData((prev) => {
      if (prev.portMappings.length <= 1) return prev
      const updated = prev.portMappings.filter((_, i) => i !== index)
      const hostPorts = updated.map((m) => m.host)
      const containerPorts = updated.map((m) => m.container)
      const primaryContainerPort = containerPorts[0] || currentPlugin.defaultPort

      const updatedEnvVars = prev.envVars.map((e) =>
        e.key.toUpperCase() === 'PORT' ? { ...e, value: String(primaryContainerPort) } : e
      )
      const slug = toSafeSlug(prev.projectName)
      const updatedStart = safeUpdateStartCommandOnPortChange(
        prev.startCommand,
        updated,
        prev.deployTargetMode,
        isStartCommandCustomized,
        currentPlugin,
        slug,
        updatedEnvVars,
        prev.serverPort
      )
      return {
        ...prev,
        portMappings: updated,
        serverPort: hostPorts,
        containerPort: containerPorts,
        startCommand: updatedStart,
        envVars: updatedEnvVars,
      }
    })
  }

  const handleAddEnvVar = () => {
    setData((prev) => ({
      ...prev,
      envVars: [...prev.envVars, { key: '', value: '', isSecret: false }],
    }))
  }

  const handleRemoveEnvVar = (index: number) => {
    setData((prev) => {
      const updated = prev.envVars.filter((_, i) => i !== index)
      const slug = toSafeSlug(prev.projectName)
      const plugin = getRuntime(prev.runtime) || getAllRuntimes()[0]
      const mappings = prev.portMappings && prev.portMappings.length > 0 ? prev.portMappings : prev.serverPort
      const updatedStart = safeUpdateStartCommandOnEnvChange(
        prev.startCommand,
        updated,
        prev.deployTargetMode,
        isStartCommandCustomized,
        plugin,
        slug,
        mappings
      )
      return {
        ...prev,
        envVars: updated,
        startCommand: updatedStart,
      }
    })
  }

  const handleUpdateEnvVar = (index: number, field: keyof EnvVariable, val: any) => {
    setData((prev) => {
      const updated = [...prev.envVars]
      updated[index] = { ...updated[index], [field]: val }
      const slug = toSafeSlug(prev.projectName)
      const plugin = getRuntime(prev.runtime) || getAllRuntimes()[0]
      const mappings = prev.portMappings && prev.portMappings.length > 0 ? prev.portMappings : prev.serverPort
      const updatedStart = safeUpdateStartCommandOnEnvChange(
        prev.startCommand,
        updated,
        prev.deployTargetMode,
        isStartCommandCustomized,
        plugin,
        slug,
        mappings
      )
      return {
        ...prev,
        envVars: updated,
        startCommand: updatedStart,
      }
    })
  }

  const handleImportPresetEnvVars = () => {
    const plugin = getRuntime(data.runtime) || getAllRuntimes()[0]
    const presets: EnvVariable[] = (plugin.sampleEnvVars || []).map((preset) => ({
      key: preset.key,
      value:
        preset.key.toUpperCase() === 'PORT'
          ? data.serverPort[0]
            ? String(data.serverPort[0])
            : String(plugin.defaultPort)
          : preset.value,
      isSecret: false,
    }))
    setData((prev) => {
      const existingMap = new Map<string, EnvVariable>()
      prev.envVars.forEach((e) => existingMap.set(e.key, e))
      presets.forEach((p) => existingMap.set(p.key, p))
      const merged = Array.from(existingMap.values())
      const slug = toSafeSlug(prev.projectName)
      const mappings = prev.portMappings && prev.portMappings.length > 0 ? prev.portMappings : prev.serverPort
      const updatedStart = safeUpdateStartCommandOnEnvChange(
        prev.startCommand,
        merged,
        prev.deployTargetMode,
        isStartCommandCustomized,
        plugin,
        slug,
        mappings
      )
      return {
        ...prev,
        envVars: merged,
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
        return validateProjectName(data.projectName).valid
      case 'git':
        return data.gitUrl.trim().length > 0 && data.gitBranch.trim().length > 0
      case 'runtime':
        if (!data.runtime) return false
        if (data.deployTargetMode === 'docker' && currentPlugin.dockerBuildArgs) {
          const missingRequired = currentPlugin.dockerBuildArgs.some((def) => {
            if (!def.required) return false
            const arg = data.dockerBuildArgs.find((a) => a.key === def.key)
            return !arg?.value || !arg.value.trim()
          })
          if (missingRequired) return false
        }
        return true
      case 'env':
        return true
      case 'server':
        const validPorts =
          data.deployTargetMode === 'docker'
            ? data.portMappings.length > 0 &&
            data.portMappings.every(
              (m) =>
                !isNaN(m.host) &&
                m.host > 0 &&
                m.host <= 65535 &&
                !isNaN(m.container) &&
                m.container > 0 &&
                m.container <= 65535
            )
            : data.serverPort.length > 0 &&
            data.serverPort.every((p) => !isNaN(p) && p > 0 && p <= 65535)

        return (
          data.serverIp.trim().length > 0 &&
          validPorts &&
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
    const nameCheck = validateProjectName(data.projectName)
    if (!nameCheck.valid) {
      setErrorMessage(nameCheck.error || '项目名称不符合规范')
      setLoading(false)
      return
    }
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
        serverPort: data.serverPort,
        containerPort: data.containerPort,
        portMappings: data.portMappings,
        deployPath: data.serverPath,
        installCommand: data.installCommand,
        buildCommand: data.buildCommand,
        startCommand: data.startCommand,
        healthCheckUrl: data.healthCheckUrl?.trim() || '',
        runnerMode: data.runnerMode,
        artifactType: data.artifactType,
        deployTargetMode: data.deployTargetMode,
        dockerBuildArgs: (currentPlugin.dockerBuildArgs || [])
          .map((def) => {
            const userArg = data.dockerBuildArgs.find((a) => a.key === def.key)
            const val = userArg?.value !== undefined ? userArg.value : (def.defaultValue || '')
            return { key: def.key, value: val.trim() }
          })
          .filter((arg) => arg.key && arg.value),
        envVars: data.envVars.filter((e) => e.key && e.key.trim()),
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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
                    项目名称 <span className="text-destructive">*</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    仅限小写字母、数字、"-" 及 "_"
                  </span>
                </div>
                <Input
                  placeholder="例如：core-gateway、order_service_01"
                  value={data.projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  className={`mt-1 font-mono text-sm ${data.projectName && !validateProjectName(data.projectName).valid
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''
                    }`}
                />
                {data.projectName && !validateProjectName(data.projectName).valid ? (
                  <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                    <span>{validateProjectName(data.projectName).error}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    格式规范：只能包含小写英文字母、数字、"-" 及 "_"，且不能以数字开头和不能包含空格。
                  </p>
                )}
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Git 认证账号 (可选)
                    </label>
                    {detectGitProvider(data.gitUrl) === 'gitlab' && (
                      <span className="text-[10px] text-amber-500 font-mono">
                        缺省默认: oauth2
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder={
                      detectGitProvider(data.gitUrl) === 'gitlab'
                        ? '留空自动适配 oauth2'
                        : '例如：ci-bot (可留空)'
                    }
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
                    placeholder="glpat-xxxx / ghp_xxxx / 私有令牌"
                    value={data.gitToken}
                    onChange={(e) =>
                      setData({ ...data, gitToken: e.target.value })
                    }
                    className="mt-1 text-sm font-mono"
                  />
                </div>
              </div>

              {/* 智能平台鉴权提示 */}
              <div className="text-[11px] px-3 py-2 rounded-md bg-muted/40 text-muted-foreground border border-border/60 flex items-start gap-2 leading-relaxed">
                <span className="text-primary font-medium shrink-0">💡 提示:</span>
                <span>{getGitAuthHint(data.gitUrl)}</span>
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

                {/* Docker 构建参数 (ARG) 配置 —— 仅在 Docker 模式且当前运行时声明了 dockerBuildArgs 时显示 */}
                {data.deployTargetMode === 'docker' && currentPlugin.dockerBuildArgs && currentPlugin.dockerBuildArgs.length > 0 && (
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="size-5 rounded bg-violet-500/20 text-violet-400 flex items-center justify-center">
                        <FileCode className="size-3" />
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        Docker 构建参数 (Build Args)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-medium">
                        对应 Dockerfile ARG 指令
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      以下参数将在 <code className="text-violet-400">docker build</code> 时通过{' '}
                      <code className="text-violet-400">--build-arg</code> 注入。
                    </p>
                    <div className="space-y-2">
                      {currentPlugin.dockerBuildArgs.map((argDef) => {
                        const currentArg = data.dockerBuildArgs.find((a) => a.key === argDef.key)
                        const val = currentArg?.value !== undefined ? currentArg.value : (argDef.defaultValue || '')
                        return (
                          <div key={argDef.key}>
                            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                              <code className="text-violet-400 font-mono">{argDef.key}</code>
                              {argDef.required && <span className="text-destructive">*</span>}
                              <span className="font-normal text-muted-foreground/70">— {argDef.description}</span>
                            </label>
                            <Input
                              value={val}
                              onChange={(e) => {
                                const newArgs = (currentPlugin.dockerBuildArgs || []).map((def) => {
                                  if (def.key === argDef.key) {
                                    return { key: def.key, value: e.target.value }
                                  }
                                  const existing = data.dockerBuildArgs.find((a) => a.key === def.key)
                                  return { key: def.key, value: existing?.value !== undefined ? existing.value : (def.defaultValue || '') }
                                })
                                setData({ ...data, dockerBuildArgs: newArgs })
                              }}
                              className="mt-1 font-mono text-xs"
                              placeholder={argDef.placeholder || argDef.defaultValue || ''}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {/* 实时构建命令预览 */}
                    <div className="pt-2 border-t border-violet-500/20">
                      <span className="text-[10px] text-muted-foreground block mb-1">
                        预计 Docker 构建命令预览 (流水线自动注入 --build-arg):
                      </span>
                      <div className="p-2 rounded bg-black/40 border border-violet-500/20 font-mono text-[11px] text-violet-300 break-all select-all">
                        <span className="text-muted-foreground select-none">$ </span>
                        docker build {(() => {
                          const args = (currentPlugin.dockerBuildArgs || []).map((def) => {
                            const userArg = data.dockerBuildArgs.find((a) => a.key === def.key)
                            const val = userArg?.value !== undefined ? userArg.value : (def.defaultValue || '')
                            return { key: def.key, value: val }
                          }).filter((a) => a.key && a.value)
                          return args.length > 0 ? args.map((a) => `--build-arg ${a.key}="${a.value}"`).join(' ') + ' ' : ''
                        })()}-t {toSafeSlug(data.projectName)}:latest .
                      </div>
                    </div>

                    {/* 必填项提示 */}
                    {currentPlugin.dockerBuildArgs.some((d) => {
                      if (!d.required) return false
                      const userArg = data.dockerBuildArgs.find((a) => a.key === d.key)
                      const val = userArg?.value !== undefined ? userArg.value : (d.defaultValue || '')
                      return !val.trim()
                    }) && (
                        <p className="text-[11px] text-amber-500 flex items-center gap-1 mt-1">
                          <ShieldAlert className="size-3.5 shrink-0" />
                          <span>带 <strong className="text-destructive">*</strong> 为必填构建参数，填写完整后方可进入下一步</span>
                        </p>
                      )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-muted-foreground">
                        启动/重载命令
                      </label>
                      {isStartCommandCustomized && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                          已手动自定义
                        </span>
                      )}
                    </div>
                    {isStartCommandCustomized && (
                      <button
                        type="button"
                        onClick={handleResetStartCommand}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RotateCcw className="size-3" />
                        恢复默认命令
                      </button>
                    )}
                  </div>
                  <Input
                    value={data.startCommand}
                    onChange={(e) => handleStartCommandChange(e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                  {isStartCommandCustomized && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      💡 提示：当前命令包含自定义修改，调整端口或环境变量将智能局部同步，不会覆盖您的自定义参数。
                    </p>
                  )}
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
                        请在 Git 代码仓库<strong>根目录</strong>下创建名为 <code className="text-blue-400 font-mono font-bold">Dockerfile</code> 的文件并提交。
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
                          {currentPlugin.nativeRequirementDesc || '目标服务器需具备对应语言运行环境与工具依赖。'}在点击【立即部署】时，平台前置探针将自动校验目标主机环境 (需依赖: <code className="text-amber-400 font-mono">{getCarrierCommandStrategy('native').getRequiredTools(currentPlugin).join('、') || '基础依赖'}</code>)。
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

          {/* Step 4: Environment Variables */}
          {step === 'env' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound className="size-4 text-primary" />
                    环境变量配置 (Environment Variables)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    根据部署载体模式自动将环境变量注入容器或原生宿主机系统
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleImportPresetEnvVars}
                    className="text-xs"
                  >
                    导入技术栈预设
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    onClick={handleAddEnvVar}
                    className="text-xs"
                  >
                    <Plus className="size-3.5 mr-1" />
                    添加变量
                  </Button>
                </div>
              </div>

              {/* 载体模式行为指引与实时命令预览 */}
              {data.deployTargetMode === 'docker' ? (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <Boxes className="size-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground">
                        Docker 容器环境变量规范
                      </span>
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                        -e KEY="VALUE" 参数注入
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-8">
                    在 Docker 容器化模式下，配置的环境变量将在拉起容器时自动格式化为 <code className="text-blue-400 font-mono">-e KEY="VALUE"</code> 并注入到 <code className="font-mono text-foreground">docker run</code> 命令中。
                  </p>
                  <div className="pt-1.5 border-t border-blue-500/20">
                    <span className="text-[10px] text-muted-foreground block mb-1">
                      启动命令环境变量注入预览:
                    </span>
                    <div className="p-2 rounded bg-black/40 border border-blue-500/20 font-mono text-[11px] text-blue-300 break-all select-all">
                      <span className="text-muted-foreground select-none">$ </span>
                      {data.startCommand}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Terminal className="size-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground">
                        原生宿主机系统环境变量规范
                      </span>
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        export 与 .env 文件写入
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-8">
                    在原生宿主机模式下，流水线在目标服务器执行应用时，将通过系统级 <code className="text-amber-400 font-mono">export KEY="VALUE"</code> 注入会话环境，并在目标目录 <code className="text-amber-400 font-mono">{data.serverPath || '/path'}/.env</code> 自动写入环境变量文件。
                  </p>
                  <div className="pt-1.5 border-t border-amber-500/20">
                    <span className="text-[10px] text-muted-foreground block mb-1">
                      启动环境注入预览:
                    </span>
                    <div className="p-2 rounded bg-black/40 border border-amber-500/20 font-mono text-[11px] text-amber-300 break-all select-all">
                      <span className="text-muted-foreground select-none">$ </span>
                      {(() => {
                        const validEnvs = data.envVars.filter((e) => e.key && e.key.trim())
                        const prefix = validEnvs.length > 0 ? validEnvs.map((e) => `export ${e.key}="${e.value}"`).join(' && ') + ' && ' : ''
                        return prefix + data.startCommand
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* 变量列表 */}
              <div className="space-y-2.5">
                {data.envVars.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-xs space-y-2">
                    <p>暂未配置环境变量</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      可点击上方【导入技术栈预设】快速填充默认环境变量，或点击【添加变量】手动新增
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {data.envVars.map((env, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-muted/20 p-2 rounded-lg border border-border/60">
                        <Input
                          placeholder="变量名 (如 PORT, NODE_ENV)"
                          value={env.key}
                          onChange={(e) => handleUpdateEnvVar(idx, 'key', e.target.value)}
                          className="w-1/3 font-mono text-xs"
                        />
                        <div className="relative flex-1">
                          <Input
                            type={env.isSecret && !showSecrets[idx] ? 'password' : 'text'}
                            placeholder="变量值"
                            value={env.value}
                            onChange={(e) => handleUpdateEnvVar(idx, 'value', e.target.value)}
                            className="font-mono text-xs pr-8"
                          />
                          {env.isSecret && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowSecrets((prev) => ({ ...prev, [idx]: !prev[idx] }))
                              }
                              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                            >
                              {showSecrets[idx] ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none px-2">
                          <input
                            type="checkbox"
                            checked={env.isSecret || false}
                            onChange={(e) => handleUpdateEnvVar(idx, 'isSecret', e.target.checked)}
                            className="rounded border-border size-3.5"
                          />
                          <span>保密</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveEnvVar(idx)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                          title="删除变量"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Server target */}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                {data.deployTargetMode === 'native' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">
                        宿主机监听端口 <span className="text-destructive">*</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">多端口用逗号分隔</span>
                    </div>
                    <Input
                      value={portInput}
                      onChange={(e) => {
                        const val = e.target.value
                        setPortInput(val)
                        const parsed = val
                          .split(/[,，\s]+/)
                          .map((p) => parseInt(p.trim(), 10))
                          .filter((p) => !isNaN(p) && p > 0 && p <= 65535)
                        if (parsed.length > 0) {
                          handleServerPortChange(parsed)
                        }
                      }}
                      placeholder="例如: 3000, 8080"
                      className="mt-1 font-mono text-sm"
                    />
                    {data.serverPort && data.serverPort.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {data.serverPort.map((p, idx) => (
                          <span
                            key={p}
                            className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${idx === 0
                                ? 'bg-primary/10 text-primary border-primary/20 font-medium'
                                : 'bg-muted text-foreground border-border'
                              }`}
                          >
                            :{p} {idx === 0 && <span className="text-[10px] text-primary/70">(主端口)</span>}
                            {data.serverPort.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = data.serverPort.filter((_, i) => i !== idx)
                                  if (updated.length > 0) {
                                    setPortInput(updated.join(', '))
                                    handleServerPortChange(updated)
                                  }
                                }}
                                className="hover:text-destructive text-muted-foreground ml-0.5"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {data.deployTargetMode === 'docker' && (
                <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Boxes className="size-3.5 text-primary" />
                        Docker 端口映射 (宿主机端口 ➔ 容器内部端口) <span className="text-destructive">*</span>
                      </label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        宿主机端口为外部访问端口；容器端口为容器内部程序监听端口，两者可独立自定义。
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddPortMapping}
                      className="h-7 text-xs text-primary gap-1 border-primary/30 hover:bg-primary/10"
                    >
                      <Plus className="size-3.5" /> 添加映射
                    </Button>
                  </div>

                  <div className="space-y-2 pt-1">
                    {data.portMappings.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-background">
                        <div className="flex-1">
                          <span className="text-[10px] text-muted-foreground">宿主机外部端口 (Host)</span>
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={m.host || ''}
                            onChange={(e) => handlePortMappingUpdate(idx, 'host', parseInt(e.target.value, 10))}
                            placeholder="如 8080"
                            className="mt-0.5 font-mono text-xs h-8"
                          />
                        </div>
                        <div className="text-muted-foreground pt-4 text-xs font-bold shrink-0">➔</div>
                        <div className="flex-1">
                          <span className="text-[10px] text-muted-foreground">容器内部端口 (Container)</span>
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={m.container || ''}
                            onChange={(e) => handlePortMappingUpdate(idx, 'container', parseInt(e.target.value, 10))}
                            placeholder={`如 ${currentPlugin.defaultPort}`}
                            className="mt-0.5 font-mono text-xs h-8"
                          />
                        </div>
                        {data.portMappings.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePortMapping(idx)}
                            className="mt-4 size-8 text-muted-foreground hover:text-destructive shrink-0"
                            title="删除此映射"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {data.portMappings.map((m, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${idx === 0
                            ? 'bg-primary/10 text-primary border-primary/20 font-medium'
                            : 'bg-muted text-foreground border-border'
                          }`}
                      >
                        -p {m.host}:{m.container} {idx === 0 && <span className="text-[10px] text-primary/70">(主映射)</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
                  placeholder={`http://${data.serverIp || '127.0.0.1'}:${data.serverPort[0] || 3000}/health`}
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
                    模式: {data.deployTargetMode === 'docker' ? 'Docker 容器' : '原生宿主机进程'}
                  </span>
                  {data.dockerBuildArgs.filter((a) => a.key && a.value).length > 0 && (
                    <span className="text-[11px] text-muted-foreground font-mono block mt-0.5">
                      ARG: {data.dockerBuildArgs.filter((a) => a.key && a.value).map((a) => `${a.key}=${a.value}`).join(', ')}
                    </span>
                  )}
                </div>

                <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                  <span className="text-xs text-muted-foreground block">
                    {data.deployTargetMode === 'docker' ? '目标主机与端口映射' : '目标主机与端口'}
                  </span>
                  <p className="text-sm font-mono font-semibold text-foreground mt-0.5">
                    {data.serverIp}{' '}
                    {data.deployTargetMode === 'docker' && data.portMappings && data.portMappings.length > 0
                      ? `(${data.portMappings.map((m) => `:${m.host}➔:${m.container}`).join(' ')})`
                      : `(:${data.serverPort.join(', :')})`}
                  </p>
                  <span className="text-[11px] text-muted-foreground font-mono block mt-1">
                    路径: {data.serverPath}
                  </span>
                </div>
              </div>

              {/* 构建与启动命令最终预览 */}
              <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      构建与启动指令预览 (Command Preview)
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    实际流水线调度将直接执行以下指令
                  </span>
                </div>

                {/* Build Command */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <span className="size-1.5 rounded-full bg-blue-400" />
                      编译构建命令 (Build Command)
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(data.buildCommand)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
                      title="复制命令"
                    >
                      <Copy className="size-3" />
                      复制
                    </button>
                  </div>
                  <div className="p-2.5 rounded bg-black/50 border border-border/60 font-mono text-xs text-emerald-400 break-all select-all leading-relaxed">
                    <span className="text-muted-foreground select-none">$ </span>
                    {data.buildCommand}
                  </div>
                </div>

                {/* Start Command */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      服务启动 / 进程拉起命令 (Start Command)
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(data.startCommand)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
                      title="复制命令"
                    >
                      <Copy className="size-3" />
                      复制
                    </button>
                  </div>
                  <div className="p-2.5 rounded bg-black/50 border border-border/60 font-mono text-xs text-amber-300 break-all select-all leading-relaxed">
                    <span className="text-muted-foreground select-none">$ </span>
                    {data.startCommand}
                  </div>
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

              <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground block">环境变量配置</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {data.envVars.filter((e) => e.key.trim()).length} 个变量
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {data.deployTargetMode === 'docker' ? (
                    <span className="text-xs text-blue-400 font-mono">
                      Docker 部署：自动注入 <code className="bg-blue-500/10 px-1 py-0.5 rounded text-blue-300">-e KEY="VALUE"</code> 参数
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400 font-mono">
                      原生部署：自动注入系统 <code className="bg-amber-500/10 px-1 py-0.5 rounded text-amber-300">export</code> 与 <code className="bg-amber-500/10 px-1 py-0.5 rounded text-amber-300">.env</code> 文件
                    </span>
                  )}
                </div>
                {data.envVars.filter((e) => e.key.trim()).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {data.envVars.filter((e) => e.key.trim()).map((e, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background/80 border border-border/80 text-[11px] font-mono text-foreground"
                      >
                        <span>{e.key}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="text-muted-foreground">
                          {e.isSecret ? '******' : (e.value || '""')}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground/70 mt-1">未配置环境变量</p>
                )}
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
                        项目已配置为目标主机原生部署模式。部署时系统将自动检测目标服务器 {currentPlugin.name} 运行环境 ({getCarrierCommandStrategy('native').getRequiredTools(currentPlugin).join('、') || '原生依赖'})，并通过 SFTP 上传归档解压运行。
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
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
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
  Tag,
  Sparkles,
  FileCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Project, Deployment, EnvVariable, ArtifactType, DockerDeliveryMode, DeployTargetMode, DockerBuildArg, PortMapping } from '@/lib/types'
import { DockerfileGuideModal } from '@/components/guides/dockerfile-guide-modal'
import { getRuntime, getAllRuntimes, toSafeSlug } from '@/lib/runtimes'
import { validateProjectName } from '@/lib/validators'

interface ProjectDetailModalProps {
  project: Project
  onClose: () => void
  onDeploy: (projectId: string) => void
  onOpenDeploymentLog: (deploymentId: string) => void
  onProjectUpdated: () => void
  onClone?: (project: Project) => void
}

type TabType = 'overview' | 'pipeline' | 'env' | 'webhook' | 'history'

export function ProjectDetailModal({
  project,
  onClose,
  onDeploy,
  onOpenDeploymentLog,
  onProjectUpdated,
  onClone,
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
    serverPort: project.serverPort && project.serverPort.length > 0 ? project.serverPort : [3000],
    containerPort: project.containerPort && project.containerPort.length > 0 ? project.containerPort : (project.serverPort && project.serverPort.length > 0 ? project.serverPort : [3000]),
    portMappings: project.portMappings && project.portMappings.length > 0
      ? project.portMappings
      : (project.serverPort && project.serverPort.length > 0 ? project.serverPort : [3000]).map((h, i) => ({
          host: h,
          container: (project.containerPort && project.containerPort[i]) || h,
        })),
    healthCheckUrl: project.healthCheckUrl || '',
    runnerMode: project.runnerMode,
    deployTargetMode: (project.deployTargetMode || 'docker') as DeployTargetMode,
    artifactType: (project.artifactType || 'auto') as ArtifactType,
    dockerDeliveryMode: (project.dockerDeliveryMode || 'auto') as DockerDeliveryMode,
    dockerRegistry: project.dockerRegistry || { registryUrl: '', namespace: '' },
  })
  const [portInput, setPortInput] = useState(
    (project.serverPort && project.serverPort.length > 0 ? project.serverPort : [3000]).join(', ')
  )
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (project) {
      const p = project.serverPort && project.serverPort.length > 0 ? project.serverPort : [3000]
      setPortInput(p.join(', '))
      const c = project.containerPort && project.containerPort.length > 0 ? project.containerPort : [...p]
      const mappings: PortMapping[] = project.portMappings && project.portMappings.length > 0
        ? project.portMappings
        : p.map((h, i) => ({ host: h, container: c[i] || h }))
      setFormData((prev) => ({
        ...prev,
        serverPort: p,
        containerPort: c,
        portMappings: mappings,
      }))
    }
  }, [project])

  const currentPlugin = useMemo(() => {
    return getRuntime(project.runtime) || getAllRuntimes()[0]
  }, [project.runtime])

  const handleDeployTargetModeChange = (mode: DeployTargetMode) => {
    const isDocker = mode === 'docker'
    const slug = toSafeSlug(formData.name)
    const mappings = formData.portMappings && formData.portMappings.length > 0
      ? formData.portMappings
      : [{ host: currentPlugin.defaultPort, container: currentPlugin.defaultPort }]
    let newBuild = formData.buildCommand
    let newStart = formData.startCommand

    if (isDocker) {
      if (!newBuild || !newBuild.includes('docker build')) {
        newBuild = currentPlugin.getBuildCommand(slug, { mode: 'docker' })
      }
      if (!newStart || !newStart.includes('docker run')) {
        newStart = currentPlugin.getStartCommand(slug, mappings, { mode: 'docker', envVars })
      }
    } else {
      if (!newBuild || newBuild.includes('docker build')) {
        newBuild = currentPlugin.getBuildCommand(slug, { mode: 'native' })
      }
      if (!newStart || newStart.includes('docker run')) {
        newStart = currentPlugin.getStartCommand(slug, mappings.map((m) => m.host), { mode: 'native', envVars })
      }
    }

    setFormData((prev) => ({
      ...prev,
      deployTargetMode: mode,
      artifactType: isDocker ? 'docker' : 'tar',
      buildCommand: newBuild,
      startCommand: newStart,
    }))
  }

  // Env vars
  const [envVars, setEnvVars] = useState<EnvVariable[]>(project.envVars || [])
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({})

  // 同步环境变量变动至 startCommand (Docker 模式下重新生成 -e 参数)
  const syncEnvVarsWithStartCommand = (updatedEnv: EnvVariable[]) => {
    setFormData((prev) => {
      if (prev.deployTargetMode === 'docker') {
        const slug = toSafeSlug(prev.name || project.name)
        const mappings = prev.portMappings && prev.portMappings.length > 0
          ? prev.portMappings
          : [{ host: currentPlugin.defaultPort, container: currentPlugin.defaultPort }]
        const updatedStart = currentPlugin.getStartCommand(slug, mappings, {
          mode: 'docker',
          envVars: updatedEnv,
        })
        return {
          ...prev,
          startCommand: updatedStart,
        }
      }
      return prev
    })
  }

  const handlePortMappingUpdate = (
    index: number,
    field: 'host' | 'container',
    value: number
  ) => {
    setFormData((prev) => {
      const current = prev.portMappings || [{ host: 3000, container: 3000 }]
      const updated = current.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      )
      const hostPorts = updated.map((m) => m.host).filter((p) => !isNaN(p) && p > 0)
      const containerPorts = updated.map((m) => m.container).filter((p) => !isNaN(p) && p > 0)
      const slug = toSafeSlug(prev.name || project.name)
      const newStart = currentPlugin.getStartCommand(slug, updated, {
        mode: prev.deployTargetMode,
        envVars,
      })

      return {
        ...prev,
        portMappings: updated,
        serverPort: hostPorts.length > 0 ? hostPorts : [3000],
        containerPort: containerPorts.length > 0 ? containerPorts : [3000],
        startCommand: newStart,
      }
    })
  }

  const handleAddPortMapping = () => {
    setFormData((prev) => {
      const current = prev.portMappings || [{ host: 3000, container: 3000 }]
      const last = current[current.length - 1]
      const nextHost = last ? last.host + 1 : 8080
      const nextContainer = last ? last.container + 1 : currentPlugin.defaultPort
      const updated: PortMapping[] = [
        ...current,
        { host: nextHost, container: nextContainer },
      ]
      const hostPorts = updated.map((m) => m.host)
      const containerPorts = updated.map((m) => m.container)
      const slug = toSafeSlug(prev.name || project.name)
      const newStart = currentPlugin.getStartCommand(slug, updated, {
        mode: prev.deployTargetMode,
        envVars,
      })
      return {
        ...prev,
        portMappings: updated,
        serverPort: hostPorts,
        containerPort: containerPorts,
        startCommand: newStart,
      }
    })
  }

  const handleRemovePortMapping = (index: number) => {
    setFormData((prev) => {
      const current = prev.portMappings || [{ host: 3000, container: 3000 }]
      if (current.length <= 1) return prev
      const updated = current.filter((_, i) => i !== index)
      const hostPorts = updated.map((m) => m.host)
      const containerPorts = updated.map((m) => m.container)
      const slug = toSafeSlug(prev.name || project.name)
      const newStart = currentPlugin.getStartCommand(slug, updated, {
        mode: prev.deployTargetMode,
        envVars,
      })
      return {
        ...prev,
        portMappings: updated,
        serverPort: hostPorts,
        containerPort: containerPorts,
        startCommand: newStart,
      }
    })
  }

  // Docker build args
  const [dockerBuildArgs, setDockerBuildArgs] = useState<DockerBuildArg[]>(() => {
    return (currentPlugin.dockerBuildArgs || []).map((def) => {
      const existing = project.dockerBuildArgs?.find((a) => a.key === def.key)
      return {
        key: def.key,
        value: existing?.value !== undefined ? existing.value : (def.defaultValue || ''),
      }
    })
  })

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
    setSaveError('')
    const nameCheck = validateProjectName(formData.name)
    if (!nameCheck.valid) {
      setSaveError(nameCheck.error || '项目名称不符合规范')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          envVars,
          dockerBuildArgs: (currentPlugin.dockerBuildArgs || [])
            .map((def) => {
              const arg = dockerBuildArgs.find((a) => a.key === def.key)
              const val = arg?.value !== undefined ? arg.value : (def.defaultValue || '')
              return { key: def.key, value: val.trim() }
            })
            .filter((a) => a.key && a.value),
        }),
      })
      if (res.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
        onProjectUpdated()
      } else {
        const errData = await res.json().catch(() => ({}))
        setSaveError(errData.error || '保存项目配置失败')
      }
    } catch (err: any) {
      console.error('Failed to save project config', err)
      setSaveError('网络请求异常: ' + (err?.message || '未知错误'))
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
    const updated = [...envVars, { key: '', value: '', isSecret: false }]
    setEnvVars(updated)
    syncEnvVarsWithStartCommand(updated)
  }

  const removeEnvVar = (index: number) => {
    const updated = envVars.filter((_, i) => i !== index)
    setEnvVars(updated)
    syncEnvVarsWithStartCommand(updated)
  }

  const handleUpdateEnvVar = (index: number, field: keyof EnvVariable, val: any) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: val }
    setEnvVars(updated)
    syncEnvVarsWithStartCommand(updated)
  }

  const handleImportPresetEnvVars = () => {
    const presets: EnvVariable[] = (currentPlugin.sampleEnvVars || []).map((preset) => ({
      key: preset.key,
      value:
        preset.key.toUpperCase() === 'PORT'
          ? (formData.serverPort && formData.serverPort[0]
              ? String(formData.serverPort[0])
              : String(currentPlugin.defaultPort))
          : preset.value,
      isSecret: false,
    }))
    const existingMap = new Map<string, EnvVariable>()
    envVars.forEach((e) => existingMap.set(e.key, e))
    presets.forEach((p) => existingMap.set(p.key, p))
    const merged = Array.from(existingMap.values())
    setEnvVars(merged)
    syncEnvVarsWithStartCommand(merged)
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
                <span>
                  服务器: {project.serverName} ({project.serverIp}
                  {project.deployTargetMode === 'docker' && project.portMappings && project.portMappings.length > 0
                    ? ` ${project.portMappings.map((m) => `:${m.host}➔:${m.container}`).join(' ')}`
                    : `:${project.serverPort && project.serverPort.length > 0 ? project.serverPort.join(', :') : '3000'}`})
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onClone && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onClone(project)}
                className="gap-1.5 text-xs h-9 text-muted-foreground hover:text-foreground"
                title="克隆此项目至其他服务器"
              >
                <Copy className="size-3.5" />
                克隆项目
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => onDeploy(project.id)}
              className="gap-1.5 text-xs h-9 font-semibold"
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">项目名称</label>
                    <span className="text-[11px] text-muted-foreground">
                      仅限小写字母、数字、"-" 及 "_"
                    </span>
                  </div>
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      setSaveError('')
                      setFormData({ ...formData, name: e.target.value })
                    }}
                    className={`mt-1 font-mono text-sm ${
                      formData.name && !validateProjectName(formData.name).valid
                        ? 'border-destructive focus-visible:ring-destructive'
                        : ''
                    }`}
                  />
                  {formData.name && !validateProjectName(formData.name).valid ? (
                    <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                      <span>{validateProjectName(formData.name).error}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      格式规范：只能包含小写英文字母、数字、"-" 及 "_"，且不能以数字开头和不能包含空格。
                    </p>
                  )}
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
                {formData.deployTargetMode === 'docker' ? (
                  <div className="md:col-span-2 space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Boxes className="size-3.5 text-primary" />
                          Docker 端口映射配置 (宿主机外部端口 ➔ 容器内部端口)
                        </label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          宿主机端口为外部访问端口；容器内部端口为应用监听端口，两者可独立配置。
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
                      {(formData.portMappings || [{ host: 3000, container: 3000 }]).map((m, idx) => (
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
                          {(formData.portMappings?.length || 0) > 1 && (
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
                      {(formData.portMappings || []).map((m, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
                            idx === 0
                              ? 'bg-primary/10 text-primary border-primary/20 font-medium'
                              : 'bg-muted text-foreground border-border'
                          }`}
                        >
                          -p {m.host}:{m.container} {idx === 0 && <span className="text-[10px] text-primary/70">(主映射)</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">服务监听端口 (宿主机)</label>
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
                          setFormData((prev) => {
                            const slug = toSafeSlug(prev.name || project.name)
                            const newStart = currentPlugin.getStartCommand(slug, parsed, {
                              mode: prev.deployTargetMode,
                              envVars,
                            })
                            return {
                              ...prev,
                              serverPort: parsed,
                              containerPort: parsed,
                              portMappings: parsed.map((p) => ({ host: p, container: p })),
                              startCommand: newStart,
                            }
                          })
                        }
                      }}
                      placeholder="例如: 3000, 8080"
                      className="mt-1 font-mono text-sm"
                    />
                    {formData.serverPort && formData.serverPort.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {formData.serverPort.map((p, idx) => (
                          <span
                            key={p}
                            className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
                              idx === 0
                                ? 'bg-primary/10 text-primary border-primary/20 font-medium'
                                : 'bg-muted text-foreground border-border'
                            }`}
                          >
                            :{p} {idx === 0 && <span className="text-[10px] text-primary/70">(主端口)</span>}
                            {formData.serverPort.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = formData.serverPort.filter((_, i) => i !== idx)
                                  if (updated.length > 0) {
                                    setPortInput(updated.join(', '))
                                    setFormData((prev) => {
                                      const slug = toSafeSlug(prev.name || project.name)
                                      const newStart = currentPlugin.getStartCommand(slug, updated, {
                                        mode: prev.deployTargetMode,
                                        envVars,
                                      })
                                      return {
                                        ...prev,
                                        serverPort: updated,
                                        containerPort: updated,
                                        portMappings: updated.map((p) => ({ host: p, container: p })),
                                        startCommand: newStart,
                                      }
                                    })
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

              {saveError && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/25 text-destructive text-xs">
                  {saveError}
                </div>
              )}

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

                {/* Docker 构建参数 (ARG) 配置 —— 仅在 Docker 模式且当前运行时声明了 dockerBuildArgs 时显示 */}
                {formData.deployTargetMode === 'docker' && currentPlugin.dockerBuildArgs && currentPlugin.dockerBuildArgs.length > 0 && (
                  <div className="p-4 rounded-lg border border-violet-500/30 bg-violet-500/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="size-5 rounded bg-violet-500/20 text-violet-400 flex items-center justify-center">
                        <FileCode className="size-3" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Docker 构建参数 (Build Args)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-medium">
                        Dockerfile ARG
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      以下参数在 <code className="text-violet-400">docker build</code> 时通过{' '}
                      <code className="text-violet-400">--build-arg</code> 注入，对应 Dockerfile 中的 ARG 指令。
                    </p>
                    <div className="space-y-2.5">
                      {currentPlugin.dockerBuildArgs.map((argDef) => {
                        const currentArg = dockerBuildArgs.find((a) => a.key === argDef.key)
                        const val = currentArg?.value !== undefined ? currentArg.value : (argDef.defaultValue || '')
                        return (
                          <div key={argDef.key}>
                            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
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
                                  const existing = dockerBuildArgs.find((a) => a.key === def.key)
                                  return { key: def.key, value: existing?.value !== undefined ? existing.value : (def.defaultValue || '') }
                                })
                                setDockerBuildArgs(newArgs)
                              }}
                              className="mt-1 font-mono text-sm"
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
                            const userArg = dockerBuildArgs.find((a) => a.key === def.key)
                            const val = userArg?.value !== undefined ? userArg.value : (def.defaultValue || '')
                            return { key: def.key, value: val }
                          }).filter((a) => a.key && a.value)
                          return args.length > 0 ? args.map((a) => `--build-arg ${a.key}="${a.value}"`).join(' ') + ' ' : ''
                        })()}-t {toSafeSlug(formData.name)}:latest .
                      </div>
                    </div>
                  </div>
                )}

                {/* Stage 3: Docker Delivery Mechanism */}
                <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      阶段 3: 部署载体与交付策略 (Deployment Mode & Delivery)
                    </span>
                    <span className="text-xs font-medium text-primary">
                      {formData.deployTargetMode === 'native' ? '🚀 原生进程模式' : '🐳 Docker 容器模式'}
                    </span>
                  </div>

                  {/* Mode switcher */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeployTargetModeChange('docker')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        formData.deployTargetMode === 'docker'
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300 font-semibold'
                          : 'border-border/80 hover:border-blue-500/40 text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Boxes className="size-3.5 text-blue-400" />
                        Docker 容器部署
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">多阶段镜像封装，隔离环境</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeployTargetModeChange('native')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        formData.deployTargetMode === 'native'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                          : 'border-border/80 hover:border-amber-500/40 text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Terminal className="size-3.5 text-amber-500" />
                        原生部署 (宿主机进程)
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{currentPlugin.nativeProcessManager || '宿主机原生托管'}</p>
                    </button>
                  </div>

                  {formData.deployTargetMode === 'native' ? (
                    <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2 text-xs">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Terminal className="size-3.5 text-amber-500" />
                        {currentPlugin.name} 原生分发管道
                      </span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        本地构建编译完成后，通过系统 tar 将产物打包为压缩包，经 SFTP 安全隧道直传至目标主机目录并解压，最终执行启动命令：
                        <code className="text-amber-400 font-mono ml-1">{formData.startCommand}</code>
                      </p>
                      <p className="text-[11px] text-amber-300/90 flex items-center gap-1 pt-1 border-t border-amber-500/20">
                        <span>目标主机环境:</span>
                        <code className="px-1 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-300">
                          {currentPlugin.getRequiredTools('native').join('、') || '基础依赖'}
                        </code>
                        <span className="text-muted-foreground">({currentPlugin.nativeRequirementDesc})</span>
                      </p>
                    </div>
                  ) : (
                    <>
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
                                ? '当前：企业级镜像仓库模式'
                                : '当前：SFTP 离线直连模式'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, dockerDeliveryMode: 'auto', artifactType: 'docker' })}
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
                            onClick={() => setFormData({ ...formData, dockerDeliveryMode: 'save_load', artifactType: 'docker' })}
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
                            onClick={() => setFormData({ ...formData, dockerDeliveryMode: 'registry', artifactType: 'docker' })}
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

                      <div className="p-2.5 rounded-md bg-muted/40 border border-border/70 text-[11px] text-muted-foreground flex items-start gap-2">
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
                      </div>
                    </>
                  )}
                </div>

                {formData.deployTargetMode !== 'native' && (
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
                    placeholder="如: docker run -d ... 或 原生启动命令 (例: pm2 reload / gunicorn / dotnet / ./server)"
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
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleImportPresetEnvVars}
                    className="gap-1.5"
                  >
                    <Sparkles className="size-3.5 text-primary" />
                    导入技术栈预设
                  </Button>
                  <Button size="sm" variant="outline" onClick={addEnvVar} className="gap-1.5">
                    <Plus className="size-4" />
                    添加变量
                  </Button>
                </div>
              </div>

              {/* 启动指令与环境变量联动实时预览卡片 */}
              <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Terminal className="size-3.5 text-primary" />
                    启动指令与环境变量联动预览
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formData.deployTargetMode === 'docker' ? 'Docker 容器启动 (-e 参数注入)' : '原生宿主机启动 (export / .env 注入)'}
                  </span>
                </div>
                {formData.deployTargetMode === 'docker' ? (
                  <div className="p-2.5 rounded bg-black/50 border border-border/60 font-mono text-xs text-blue-300 break-all select-all leading-relaxed">
                    <span className="text-muted-foreground select-none">$ </span>
                    {formData.startCommand}
                  </div>
                ) : (
                  <div className="p-2.5 rounded bg-black/50 border border-border/60 font-mono text-xs text-amber-300 break-all select-all leading-relaxed">
                    <span className="text-muted-foreground select-none">$ </span>
                    {(() => {
                      const validEnvs = envVars.filter((e) => e.key && e.key.trim())
                      const prefix = validEnvs.length > 0
                        ? validEnvs.map((e) => `export ${e.key}="${e.value}"`).join(' && ') + ' && '
                        : ''
                      return prefix + (formData.startCommand || 'npm start')
                    })()}
                  </div>
                )}
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
                        onChange={(e) => handleUpdateEnvVar(idx, 'key', e.target.value)}
                        className="w-1/3 font-mono text-xs"
                      />
                      <div className="relative flex-1">
                        <Input
                          type={env.isSecret && !showSecrets[idx] ? 'password' : 'text'}
                          placeholder="变量值"
                          value={env.value}
                          onChange={(e) => handleUpdateEnvVar(idx, 'value', e.target.value)}
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
                          onChange={(e) => handleUpdateEnvVar(idx, 'isSecret', e.target.checked)}
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

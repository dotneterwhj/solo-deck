'use client'

import { useState, useEffect } from 'react'
import {
  Copy,
  Server,
  Workflow,
  X,
  Check,
  AlertTriangle,
  Boxes,
  Cpu,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Project, ServerNode, DeployTargetMode, RunnerMode } from '@/lib/types'

interface CloneProjectModalProps {
  isOpen?: boolean
  project: Project | null
  servers: ServerNode[]
  onClose: () => void
  onSuccess: (newProject: Project) => void
}

export function CloneProjectModal({
  isOpen = true,
  project,
  servers,
  onClose,
  onSuccess,
}: CloneProjectModalProps) {
  const [name, setName] = useState('')
  const [selectedServerId, setSelectedServerId] = useState('')
  const [port, setPort] = useState<number>(3000)
  const [deployPath, setDeployPath] = useState('')
  const [branch, setBranch] = useState('main')
  const [deployTargetMode, setDeployTargetMode] = useState<DeployTargetMode>('docker')
  const [runnerMode, setRunnerMode] = useState<RunnerMode>('simulation')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 初始化克隆表单状态
  useEffect(() => {
    if (project) {
      // 默认尝试选另外一台服务器；如果只有一台，则默认该台并提示
      const otherServer = servers.find((s) => s.id !== project.serverId)
      const targetServer = otherServer || servers.find((s) => s.id === project.serverId) || servers[0]

      const defaultServerName = targetServer ? targetServer.name : '新节点'
      setName(`${project.name}-${defaultServerName.replace(/\s+/g, '-').toLowerCase()}`)
      setSelectedServerId(targetServer ? targetServer.id : project.serverId || '')
      setPort(project.port || 3000)
      setDeployPath(project.deployPath || '/opt/app')
      setBranch(project.branch || 'main')
      setDeployTargetMode(project.deployTargetMode || 'docker')
      setRunnerMode(project.runnerMode || 'real')
      setDescription(`克隆自 ${project.name}，配置部署至目标主机`)
      setErrorMsg('')
    }
  }, [project, servers, isOpen])

  if (!isOpen || !project) return null

  const selectedServer = servers.find((s) => s.id === selectedServerId)

  // 冲突检测：如果选择了同一台服务器且端口相同
  const isSameServerAndPort =
    project.serverId &&
    selectedServerId === project.serverId &&
    Number(port) === Number(project.port)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!name.trim()) {
      setErrorMsg('请输入新项目流水线名称')
      return
    }
    if (!port || isNaN(Number(port))) {
      setErrorMsg('请输入有效的端口号')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        serverId: selectedServer?.id || '',
        serverIp: selectedServer?.ip || '127.0.0.1',
        serverName: selectedServer?.name || '目标节点',
        serverTags: selectedServer?.tags || [],
        port: Number(port),
        deployPath: deployPath.trim() || '/opt/app',
        branch: branch.trim() || 'main',
        deployTargetMode,
        runnerMode,
        description: description.trim(),
      }

      const res = await fetch(`/api/projects/${project.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok && data.id) {
        onSuccess(data)
        onClose()
      } else {
        setErrorMsg(data.error || '克隆项目失败，请重试')
      }
    } catch (err: any) {
      setErrorMsg('请求异常: ' + (err?.message || '网络连接超时'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <Copy className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">克隆项目流水线</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-muted border border-border/60 text-muted-foreground">
                源: {project.name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              复刻 Git 源码、构建编译命令、运行时配置与环境变量，快速部署到另一台目标服务器
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 源项目摘要 */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Workflow className="size-3.5 text-primary" />
                复刻配置源概览
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                运行时: {project.runtime}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground font-mono">
              <div className="truncate">仓库: {project.repository}</div>
              <div className="truncate">源分支: {project.branch}</div>
              <div className="truncate">环境变量: {project.envVars?.length || 0} 个</div>
            </div>
          </div>

          {/* Step 1: 新项目名称 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground flex items-center justify-between">
              <span>
                新项目名称 <span className="text-destructive">*</span>
              </span>
              <span className="text-[11px] text-muted-foreground font-normal">
                建议体现目标主机或用途后缀
              </span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：my-app-prod-node2"
              className="text-sm font-medium"
              autoFocus
            />
          </div>

          {/* Step 2: 目标部署主机 */}
          <div className="space-y-2">
            <label className="font-semibold text-foreground flex items-center justify-between">
              <span>
                目标服务器节点 <span className="text-destructive">*</span>
              </span>
              <span className="text-[11px] text-muted-foreground font-normal">
                选择将此项目部署运行的目标主机
              </span>
            </label>

            {servers.length === 0 ? (
              <div className="p-3 rounded-lg bg-muted border border-dashed border-border text-center text-muted-foreground">
                当前尚未配置服务器节点，克隆后将默认使用本地/模拟模式
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {servers.map((s) => {
                  const isSelected = selectedServerId === s.id
                  const isSourceServer = project.serverId === s.id
                  const isOnline = s.status === 'online'

                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedServerId(s.id)
                        // 自动调整默认名称后缀以匹配选中的服务器
                        if (name.includes(project.name)) {
                          setName(`${project.name}-${s.name.replace(/\s+/g, '-').toLowerCase()}`)
                        }
                      }}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-border/70 hover:border-primary/40 bg-card'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Server className="size-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-foreground text-xs truncate">
                            {s.name}
                          </span>
                          {isSourceServer && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              源主机
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                          {s.user}@{s.ip}:{s.port}
                        </p>
                        {s.tags && s.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {s.tags.slice(0, 2).map((t, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1 py-0.2 rounded bg-muted text-muted-foreground"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <span
                          className={`size-2 rounded-full ${
                            isOnline ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          title={isOnline ? '节点在线' : '节点离线'}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Step 3: 服务监听端口与部署路径 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground block">
                服务暴露端口 (Port) <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                placeholder="例如：3001"
                className="font-mono text-sm"
              />
              {isSameServerAndPort ? (
                <p className="text-[11px] text-amber-500 flex items-center gap-1 mt-1">
                  <AlertTriangle className="size-3 shrink-0" />
                  提示：与源项目部署在同一主机，建议修改端口避免端口占用冲突
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">
                  远程目标主机的业务端口监听
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground block">
                目标机部署目录 (Deploy Path) <span className="text-destructive">*</span>
              </label>
              <Input
                value={deployPath}
                onChange={(e) => setDeployPath(e.target.value)}
                placeholder="/opt/apps/my-service"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                远程服务器解压/挂载产物的绝对目录
              </p>
            </div>
          </div>

          {/* Step 4: 部署载体与执行模式 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground block">
                部署载体模式 (Deploy Target)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeployTargetMode('docker')}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    deployTargetMode === 'docker'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  }`}
                >
                  <Boxes className="size-4" />
                  <span>容器模式 (Docker)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeployTargetMode('native')}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    deployTargetMode === 'native'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  }`}
                >
                  <Cpu className="size-4" />
                  <span>原生模式 (Native)</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground block">
                流水线执行模式 (Runner Mode)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRunnerMode('real')}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    runnerMode === 'real'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  }`}
                >
                  <ShieldCheck className="size-4" />
                  <span>真实执行 (Real)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRunnerMode('simulation')}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    runnerMode === 'simulation'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/40 text-muted-foreground'
                  }`}
                >
                  <Workflow className="size-4" />
                  <span>沙箱模拟 (Demo)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 5: Git 分支与描述 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground flex items-center gap-1.5">
                <GitBranch className="size-3.5" />
                Git 分支
              </label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main / master / staging"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-muted-foreground block">备注描述</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：生产集群 2 号机部署副本"
                className="text-sm"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-border bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            克隆将自动复制全部编译命令与环境变量预设
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="gap-1.5 font-semibold"
            >
              {submitting ? (
                <>
                  <span className="size-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  正在克隆项目...
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  确认克隆项目
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

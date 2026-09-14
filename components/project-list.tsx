'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Play,
  GitBranch,
  GitCommit,
  Tag,
  Server,
  Network,
  ChevronRight,
  Search,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ExternalLink,
  Boxes,
  FolderArchive,
  Activity,
  HeartCrack,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Project, ProjectStatus, HealthStatus } from '@/lib/types'
import { formatRelativeTime, formatExactTime, formatShortTime } from '@/lib/time-utils'

interface ProjectListProps {
  projects: Project[]
  loading?: boolean
  onDeploy: (projectId: string) => void
  onViewDetails: (project: Project) => void
  onDeleteProject: (projectId: string) => void
  onProjectUpdated?: (project: Project) => void
  onRefreshProjects?: () => void
}

export function ProjectList({
  projects,
  loading = false,
  onDeploy,
  onViewDetails,
  onDeleteProject,
  onProjectUpdated,
  onRefreshProjects,
}: ProjectListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [runtimeFilter, setRuntimeFilter] = useState<string>('all')
  const [targetFilter, setTargetFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [healthFilter, setHealthFilter] = useState<'all' | HealthStatus>('all')
  const [now, setNow] = useState<Date>(() => new Date())
  const [localProjects, setLocalProjects] = useState<Project[]>(projects)
  const [probingMap, setProbingMap] = useState<Record<string, boolean>>({})
  const [isProbingAll, setIsProbingAll] = useState(false)
  const [schedulerInfo, setSchedulerInfo] = useState<{
    enabled?: boolean
    intervalSeconds?: number
    isChecking?: boolean
    lastRunAt?: string
  }>({ enabled: true, intervalSeconds: 30 })

  // 同步外部 projects 更新
  useEffect(() => {
    setLocalProjects(projects)
  }, [projects])

  // 定期静默获取最新的项目状态和巡检调度器信息
  useEffect(() => {
    let isMounted = true

    const fetchLatestHealth = async () => {
      // 页面隐藏时暂停轮询
      if (typeof document !== 'undefined' && document.hidden) return

      try {
        const res = await fetch('/api/projects/health', { cache: 'no-store' })
        if (res.ok && isMounted) {
          const data = await res.json()
          if (data.scheduler) {
            setSchedulerInfo(data.scheduler)
          }
          if (data.projects && Array.isArray(data.projects)) {
            setLocalProjects(data.projects)
          }
        }
      } catch (err) {
        // 静默失败
      }
    }

    // 初次挂载拉取调度器状态
    fetchLatestHealth()

    const pollIntervalMs = Math.max(10, (schedulerInfo.intervalSeconds || 30)) * 1000
    const pollTimer = setInterval(fetchLatestHealth, pollIntervalMs)

    return () => {
      isMounted = false
      clearInterval(pollTimer)
    }
  }, [schedulerInfo.intervalSeconds])

  // 单个项目心跳探测
  const handleProbeSingle = async (projectId: string) => {
    setProbingMap((prev) => ({ ...prev, [projectId]: true }))
    try {
      const res = await fetch(`/api/projects/${projectId}/health`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.project) {
          setLocalProjects((prev) =>
            prev.map((p) => (p.id === projectId ? data.project : p))
          )
          onProjectUpdated?.(data.project)
        }
      }
    } catch (err) {
      console.error('Probe project error:', err)
    } finally {
      setProbingMap((prev) => ({ ...prev, [projectId]: false }))
    }
  }

  // 批量探测所有项目心跳
  const handleProbeAll = async () => {
    setIsProbingAll(true)
    try {
      const res = await fetch('/api/projects/health', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.projects) {
          setLocalProjects(data.projects)
        }
        if (data.scheduler) {
          setSchedulerInfo(data.scheduler)
        }
        onRefreshProjects?.()
      }
    } catch (err) {
      console.error('Probe all projects error:', err)
    } finally {
      setIsProbingAll(false)
    }
  }

  // 定时更新基准时间，使得“刚刚”、“X 分钟前”等相对时间随着时间流逝实时更新
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'active':
        return 'text-green-500'
      case 'stopped':
        return 'text-muted-foreground'
      case 'error':
        return 'text-red-500'
      case 'deploying':
        return 'text-cyan-500'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusBgColor = (status: ProjectStatus) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 border-green-500/20'
      case 'stopped':
        return 'bg-muted/50 border-border'
      case 'error':
        return 'bg-red-500/10 border-red-500/20'
      case 'deploying':
        return 'bg-cyan-500/10 border-cyan-500/20'
      default:
        return 'bg-muted/50 border-border'
    }
  }

  const getStatusLabel = (status: ProjectStatus) => {
    switch (status) {
      case 'active':
        return '运行中'
      case 'stopped':
        return '已停止'
      case 'error':
        return '异常'
      case 'deploying':
        return '部署中'
      default:
        return status
    }
  }

  const getRuntimeColor = (runtime: string) => {
    switch (runtime) {
      case 'Node.js':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
      case 'Python':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      case 'ASP.NET Core':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
      case 'Go':
        return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
      case 'Java':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
      case 'Docker':
        return 'bg-sky-500/10 text-sky-500 border-sky-500/20'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  // 提取所有可供筛选的部署目标主机
  const availableServers = useMemo(() => {
    const map = new Map<string, { name: string; ip: string }>()
    localProjects.forEach((p) => {
      if (p.serverName && !map.has(p.serverName)) {
        map.set(p.serverName, { name: p.serverName, ip: p.serverIp })
      }
    })
    return Array.from(map.values())
  }, [localProjects])

  // 提取所有可供筛选的部署目标分类标签
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    localProjects.forEach((p) => {
      p.serverTags?.forEach((t) => {
        if (t && t.trim()) tagSet.add(t.trim())
      })
    })
    return Array.from(tagSet)
  }, [localProjects])

  const renderHealthBadge = (project: Project) => {
    const isProbing = !!probingMap[project.id]
    if (isProbing) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border bg-cyan-500/10 text-cyan-400 border-cyan-500/25 animate-pulse">
          <RefreshCw className="size-3 animate-spin shrink-0" />
          探测中...
        </span>
      )
    }

    const isUnconfigured =
      project.healthStatus === 'unconfigured' ||
      !project.healthCheckUrl ||
      !project.healthCheckUrl.trim()

    if (isUnconfigured) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-muted/50 text-muted-foreground border-border/80"
          title="未配置心跳探针 URL，可在项目设置中配置"
        >
          <HeartCrack className="size-3 text-muted-foreground/60 shrink-0" />
          未配置心跳
        </span>
      )
    }

    if (project.healthStatus === 'healthy') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
          title={`心跳探针响应正常: ${project.lastHealthCheck?.message || '200 OK'} (${project.lastHealthCheck?.responseTimeMs !== undefined ? `${project.lastHealthCheck.responseTimeMs}ms` : '正常'})`}
        >
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
          </span>
          心跳正常
          {project.lastHealthCheck?.statusCode ? (
            <span className="text-[10px] font-mono opacity-80">
              {project.lastHealthCheck.statusCode} OK
            </span>
          ) : null}
        </span>
      )
    }

    // unhealthy
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border bg-rose-500/10 text-rose-500 border-rose-500/25"
        title={`心跳异常: ${project.lastHealthCheck?.message || '探针连接失败'}`}
      >
        <span className="size-2 rounded-full bg-rose-500 shrink-0" />
        心跳异常
        {project.lastHealthCheck?.statusCode ? (
          <span className="text-[10px] font-mono opacity-80">
            HTTP {project.lastHealthCheck.statusCode}
          </span>
        ) : (
          <span className="text-[10px] font-mono opacity-80">失联</span>
        )}
      </span>
    )
  }

  // Filter logic
  const filteredProjects = localProjects.filter((project) => {
    const s = searchTerm.toLowerCase()
    const matchesSearch =
      project.name.toLowerCase().includes(s) ||
      project.repository.toLowerCase().includes(s) ||
      project.serverName.toLowerCase().includes(s) ||
      project.serverIp.toLowerCase().includes(s) ||
      (project.serverTags &&
        project.serverTags.some((t) => t.toLowerCase().includes(s))) ||
      (project.lastCommitHash &&
        project.lastCommitHash.toLowerCase().includes(s)) ||
      (project.lastCommitMessage &&
        project.lastCommitMessage.toLowerCase().includes(s)) ||
      (project.lastVersionTag &&
        project.lastVersionTag.toLowerCase().includes(s)) ||
      (project.healthCheckUrl &&
        project.healthCheckUrl.toLowerCase().includes(s)) ||
      (project.lastHealthCheck?.message &&
        project.lastHealthCheck.message.toLowerCase().includes(s)) ||
      (s.includes('未配置') &&
        (!project.healthCheckUrl || project.healthStatus === 'unconfigured')) ||
      (s.includes('正常') && project.healthStatus === 'healthy') ||
      (s.includes('异常') && project.healthStatus === 'unhealthy')

    const matchesStatus =
      statusFilter === 'all' ? true : project.status === statusFilter

    const matchesRuntime =
      runtimeFilter === 'all' ? true : project.runtime === runtimeFilter

    const matchesTarget =
      targetFilter === 'all'
        ? true
        : project.serverName === targetFilter || project.serverId === targetFilter

    const matchesTag =
      tagFilter === 'all'
        ? true
        : project.serverTags && project.serverTags.includes(tagFilter)

    const matchesHealth =
      healthFilter === 'all'
        ? true
        : (project.healthStatus || 'unconfigured') === healthFilter

    return (
      matchesSearch &&
      matchesStatus &&
      matchesRuntime &&
      matchesTarget &&
      matchesTag &&
      matchesHealth
    )
  })

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <div className="bg-card p-3.5 rounded-xl border border-border space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目名称、仓库地址、目标主机、分类标签..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status buttons */}
            <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border text-xs">
              {(
                [
                  { id: 'all', label: '全部' },
                  { id: 'active', label: '运行中' },
                  { id: 'stopped', label: '已停止' },
                  { id: 'error', label: '异常' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-card text-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Runtime dropdown */}
            <select
              value={runtimeFilter}
              onChange={(e) => setRuntimeFilter(e.target.value)}
              aria-label="筛选运行环境"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs shadow-xs text-muted-foreground focus-visible:outline-none"
            >
              <option value="all">所有运行环境</option>
              <option value="Node.js">Node.js</option>
              <option value="Python">Python</option>
              <option value="ASP.NET Core">ASP.NET Core</option>
              <option value="Go">Go</option>
              <option value="Java">Java</option>
              <option value="Docker">Docker</option>
            </select>

            {/* Target Server dropdown */}
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              aria-label="筛选部署目标"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs shadow-xs text-muted-foreground focus-visible:outline-none"
            >
              <option value="all">所有目标主机</option>
              {availableServers.map((srv) => (
                <option key={srv.name} value={srv.name}>
                  {srv.name} ({srv.ip})
                </option>
              ))}
            </select>

            {/* Target Tag dropdown */}
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="筛选分类标签"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs shadow-xs text-muted-foreground focus-visible:outline-none"
            >
              <option value="all">所有分类标签</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>

            {/* Health Filter dropdown */}
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as any)}
              aria-label="筛选心跳状态"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs shadow-xs text-muted-foreground focus-visible:outline-none"
            >
              <option value="all">所有心跳状态</option>
              <option value="healthy">✓ 心跳正常</option>
              <option value="unhealthy">✗ 心跳异常</option>
              <option value="unconfigured">○ 未配置心跳</option>
            </select>

            {/* Batch probe button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleProbeAll}
              disabled={isProbingAll}
              className="h-9 text-xs gap-1.5 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              title="对所有项目发起即时健康心跳探测"
            >
              <Activity className={`size-3.5 text-primary ${isProbingAll ? 'animate-spin text-cyan-400' : ''}`} />
              {isProbingAll ? '探测中...' : '即时探测'}
            </Button>

            {/* Scheduler Status Badge */}
            {schedulerInfo.enabled ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-border bg-card text-xs text-muted-foreground select-none"
                title={`后台定时巡检机制运行中，每 ${schedulerInfo.intervalSeconds || 30} 秒自动巡检\n上次巡检: ${
                  schedulerInfo.lastRunAt ? formatExactTime(schedulerInfo.lastRunAt) : '初始化运行中'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    schedulerInfo.isChecking
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                <span className="font-mono text-[11px]">
                  定时巡检: {schedulerInfo.intervalSeconds || 30}s
                </span>
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-border bg-card text-xs text-muted-foreground opacity-60 select-none"
                title="后台定时巡检已暂停，可在全局系统设置中开启"
              >
                <span className="size-2 rounded-full bg-muted-foreground/50" />
                <span className="text-[11px]">巡检已暂停</span>
              </div>
            )}

            {/* Reset button if any filter is active */}
            {(statusFilter !== 'all' ||
              runtimeFilter !== 'all' ||
              targetFilter !== 'all' ||
              tagFilter !== 'all' ||
              healthFilter !== 'all' ||
              searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all')
                  setRuntimeFilter('all')
                  setTargetFilter('all')
                  setTagFilter('all')
                  setHealthFilter('all')
                  setSearchTerm('')
                }}
                className="h-9 text-xs px-2.5 text-muted-foreground hover:text-foreground"
              >
                重置
              </Button>
            )}
          </div>
        </div>

        {/* Quick Tag Pills (if tags exist) */}
        {availableTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/40 text-xs">
            <span className="text-muted-foreground text-[11px] flex items-center gap-1 shrink-0">
              <Tag className="size-3 text-primary" />
              目标标签:
            </span>
            <button
              type="button"
              onClick={() => setTagFilter('all')}
              className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                tagFilter === 'all'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              全部
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tagFilter === tag ? 'all' : tag)}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-colors flex items-center gap-1 ${
                  tagFilter === tag
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/40'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          正在加载项目列表...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl bg-card/40">
          <p className="text-muted-foreground text-sm font-medium">没有找到符合条件的项目</p>
          <p className="text-xs text-muted-foreground mt-1">
            请尝试调整搜索关键词或重置筛选条件
          </p>
        </div>
      ) : (
        filteredProjects.map((project) => (
          <div
            key={project.id}
            className="rounded-xl border border-border bg-card hover:border-primary/40 transition-all shadow-xs"
          >
            {/* Project Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div
                  className={`size-2.5 rounded-full ${
                    project.status === 'active'
                      ? 'bg-green-500'
                      : project.status === 'deploying'
                        ? 'bg-cyan-500 animate-pulse'
                        : project.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-muted-foreground'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground text-base">
                      {project.name}
                    </h3>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {project.id}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-md">
                    {project.repository}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {renderHealthBadge(project)}
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold border ${getStatusBgColor(
                    project.status
                  )} ${getStatusColor(project.status)}`}
                >
                  {getStatusLabel(project.status)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold border ${getRuntimeColor(
                    project.runtime
                  )}`}
                >
                  {project.runtime}
                </span>
                {project.artifactType === 'docker' ||
                (!project.artifactType &&
                  (project.runtime === 'Docker' ||
                    (project.buildCommand && project.buildCommand.toLowerCase().includes('docker build')))) ? (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-blue-500/10 text-blue-400 border-blue-500/30 items-center gap-1">
                    <Boxes className="size-3" />
                    {project.dockerDeliveryMode === 'registry' ? 'Docker 仓库' : 'Docker 镜像'}
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30 items-center gap-1">
                    <FolderArchive className="size-3" />
                    Tar 归档
                  </span>
                )}
              </div>
            </div>

            {/* Project Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 text-xs">
              {/* Branch */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <GitBranch className="size-3.5" />
                  分支
                </div>
                <p className="font-mono text-foreground font-medium truncate">
                  {project.branch}
                </p>
              </div>

              {/* Server */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Server className="size-3.5" />
                  部署目标
                </div>
                <p className="font-medium text-foreground truncate">
                  {project.serverName}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {project.serverIp}
                </p>
                {project.serverTags && project.serverTags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    {project.serverTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setTagFilter(tagFilter === tag ? 'all' : tag)
                        }}
                        className={`text-[10px] px-1.5 py-0.2 rounded transition-colors ${
                          tagFilter === tag
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-muted/80 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/50'
                        }`}
                        title={`点击筛选标签 #${tag}`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Port */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Network className="size-3.5" />
                  服务端口 / 路径
                </div>
                <p className="font-mono text-foreground font-medium">
                  :{project.port}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {project.deployPath}
                </p>
              </div>

              {/* Health Probe Column */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Activity className="size-3.5 text-primary" />
                    心跳探针
                  </div>
                  {project.healthCheckUrl && project.healthCheckUrl.trim() ? (
                    <button
                      type="button"
                      disabled={probingMap[project.id]}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleProbeSingle(project.id)
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline disabled:opacity-50"
                      title="立即对该服务执行一次心跳探测"
                    >
                      <RefreshCw
                        className={`size-2.5 ${probingMap[project.id] ? 'animate-spin text-cyan-500' : ''}`}
                      />
                      探测
                    </button>
                  ) : null}
                </div>

                {!project.healthCheckUrl || !project.healthCheckUrl.trim() || project.healthStatus === 'unconfigured' ? (
                  <div>
                    <p className="font-medium text-muted-foreground flex items-center gap-1">
                      <HeartCrack className="size-3 text-muted-foreground/60 shrink-0" />
                      未配置心跳
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">可在项目设置中配置</p>
                  </div>
                ) : (
                  <div>
                    <p
                      className={`font-medium flex items-center gap-1.5 ${
                        project.healthStatus === 'healthy' ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {project.healthStatus === 'healthy' ? (
                        <>
                          <CheckCircle2 className="size-3.5 shrink-0" />
                          <span>
                            正常
                            {project.lastHealthCheck?.responseTimeMs !== undefined
                              ? ` (${project.lastHealthCheck.responseTimeMs}ms)`
                              : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-3.5 shrink-0" />
                          <span>
                            异常
                            {project.lastHealthCheck?.statusCode
                              ? ` (${project.lastHealthCheck.statusCode})`
                              : ''}
                          </span>
                        </>
                      )}
                    </p>
                    <p
                      className="text-[11px] text-muted-foreground font-mono truncate cursor-pointer hover:text-foreground"
                      title={`探针 URL: ${project.healthCheckUrl}\n探测结果: ${project.lastHealthCheck?.message || '无详细信息'}\n最后检查时间: ${formatExactTime(project.lastHealthCheck?.checkedAt)}`}
                    >
                      {project.healthCheckUrl}
                    </p>
                    {project.lastHealthCheck?.checkedAt ? (
                      <p className="text-[10px] text-muted-foreground/60 font-mono">
                        {formatRelativeTime(project.lastHealthCheck.checkedAt, now)}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Last Deployed */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="size-3.5" />
                  最后部署
                </div>
                <p
                  className={`font-medium ${
                    project.status === 'deploying'
                      ? 'text-cyan-500 animate-pulse'
                      : 'text-foreground'
                  }`}
                  title={formatExactTime(project.lastDeployed) || undefined}
                >
                  {project.status === 'deploying'
                    ? '正在部署...'
                    : formatRelativeTime(project.lastDeployed, now)}
                </p>
                {project.lastDeployed && formatShortTime(project.lastDeployed) ? (
                  <p
                    className="text-[11px] text-muted-foreground font-mono truncate"
                    title={formatExactTime(project.lastDeployed)}
                  >
                    {formatShortTime(project.lastDeployed)}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Current Deployment Info Banner */}
            <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 font-medium">
                  <GitCommit className="size-3.5 text-primary" />
                  <span>当前部署:</span>
                </div>

                {/* Commit Hash */}
                {project.lastCommitHash ? (
                  <span
                    className="font-mono px-1.5 py-0.5 rounded bg-muted text-foreground font-semibold border border-border text-[11px] shrink-0"
                    title={`Commit Hash: ${project.lastCommitHash}`}
                  >
                    {project.lastCommitHash}
                  </span>
                ) : null}

                {/* Version Tag (如果有版本号则显示版本号) */}
                {project.lastVersionTag ? (
                  <span
                    className="inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 font-medium shrink-0"
                    title={`版本号: ${project.lastVersionTag}`}
                  >
                    <Tag className="size-3 shrink-0" />
                    {project.lastVersionTag}
                  </span>
                ) : null}

                {/* Commit Message / Log */}
                {project.lastCommitMessage ? (
                  <span
                    className="text-foreground/90 font-mono text-[11px] truncate flex-1 min-w-0"
                    title={`提交日志: ${project.lastCommitMessage}`}
                  >
                    {project.lastCommitMessage}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic text-[11px]">
                    {project.lastCommitHash ? '常规部署' : '未检测到部署提交信息'}
                  </span>
                )}
              </div>

              {project.status === 'deploying' && (
                <span className="text-cyan-500 text-[11px] font-medium animate-pulse shrink-0">
                  流水线执行中...
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50 bg-muted/20">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetails(project)}
                  className="gap-1.5 text-xs h-8"
                >
                  <ChevronRight className="size-3.5" />
                  查看详情与流水线
                </Button>

                <button
                  onClick={() => onDeleteProject(project.id)}
                  title="删除项目"
                  className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-muted transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <Button
                size="sm"
                onClick={() => onDeploy(project.id)}
                disabled={project.status === 'deploying'}
                className="gap-1.5 text-xs h-8 font-medium"
              >
                <Play className="size-3.5" />
                {project.status === 'deploying' ? '正在部署...' : '立即部署'}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

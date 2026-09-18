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
  ChevronDown,
  Search,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Boxes,
  Activity,
  HeartCrack,
  RefreshCw,
  Terminal,
  Copy,
  Flame,
  ShieldAlert,
  X,
  Layers,
  GripVertical,
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
  onCloneProject?: (project: Project) => void
  onProjectUpdated?: (project: Project) => void
  onRefreshProjects?: () => void
}

/**
 * 判断标签是否属于生产环境特征（生产、prod、production、prd、online、live 等）
 */
export function isProductionTag(tag?: string): boolean {
  if (!tag) return false
  const lower = tag.trim().toLowerCase()
  return (
    lower.includes('生产') ||
    lower.includes('prod') ||
    lower.includes('prd') ||
    lower.includes('online') ||
    lower === 'live' ||
    lower === 'release'
  )
}

interface ServerGroup {
  key: string
  id?: string
  name: string
  ip: string
  tags: string[]
  isProduction: boolean
  projects: Project[]
  activeCount: number
  errorCount: number
}

export function ProjectList({
  projects,
  loading = false,
  onDeploy,
  onViewDetails,
  onDeleteProject,
  onCloneProject,
  onProjectUpdated,
  onRefreshProjects,
}: ProjectListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [now, setNow] = useState<Date>(() => new Date())
  const [localProjects, setLocalProjects] = useState<Project[]>(projects)
  const [probingMap, setProbingMap] = useState<Record<string, boolean>>({})
  const [isProbingAll, setIsProbingAll] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [schedulerInfo, setSchedulerInfo] = useState<{
    enabled?: boolean
    intervalSeconds?: number
    isChecking?: boolean
    lastRunAt?: string
  }>({ enabled: true, intervalSeconds: 30 })

  // 拖拽排序状态管理
  const [draggingServerKey, setDraggingServerKey] = useState<string | null>(null)
  const [dragOverServerKey, setDragOverServerKey] = useState<string | null>(null)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null)

  // 自定义主机顺序缓存（优先 localStorage）
  const [customServerOrder, setCustomServerOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('solodeck_server_order')
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return []
  })

  // 同步外部 projects 更新
  useEffect(() => {
    setLocalProjects(projects)
  }, [projects])

  // 定期静默获取最新的项目状态和巡检调度器信息
  useEffect(() => {
    let isMounted = true

    const fetchLatestHealth = async () => {
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

    fetchLatestHealth()
    const pollIntervalMs = Math.max(10, schedulerInfo.intervalSeconds || 30) * 1000
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

  // 定时更新基准时间，相对时间动态流转
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  // 状态统计数据
  const stats = useMemo(() => {
    let active = 0
    let stopped = 0
    let error = 0
    localProjects.forEach((p) => {
      if (p.status === 'active') active++
      else if (p.status === 'error') error++
      else if (p.status === 'stopped') stopped++
    })
    return { total: localProjects.length, active, stopped, error }
  }, [localProjects])

  // 项目过滤逻辑
  const filteredProjects = useMemo(() => {
    return localProjects.filter((project) => {
      const s = searchTerm.trim().toLowerCase()
      if (statusFilter !== 'all' && project.status !== statusFilter) {
        return false
      }
      if (!s) return true

      return (
        project.name.toLowerCase().includes(s) ||
        project.repository.toLowerCase().includes(s) ||
        project.branch.toLowerCase().includes(s) ||
        project.serverName.toLowerCase().includes(s) ||
        project.serverIp.toLowerCase().includes(s) ||
        project.deployPath.toLowerCase().includes(s) ||
        (project.serverTags &&
          project.serverTags.some((t) => t.toLowerCase().includes(s))) ||
        (project.lastCommitHash &&
          project.lastCommitHash.toLowerCase().includes(s)) ||
        (project.lastCommitMessage &&
          project.lastCommitMessage.toLowerCase().includes(s)) ||
        (project.lastVersionTag &&
          project.lastVersionTag.toLowerCase().includes(s)) ||
        (project.runtime && project.runtime.toLowerCase().includes(s)) ||
        (project.serverPort &&
          project.serverPort.some((p) => p.toString().includes(s))) ||
        (project.portMappings &&
          project.portMappings.some(
            (m) =>
              m.host.toString().includes(s) ||
              m.container.toString().includes(s)
          )) ||
        (s.includes('生产') && project.serverTags?.some(isProductionTag)) ||
        (s.includes('prod') && project.serverTags?.some(isProductionTag))
      )
    })
  }, [localProjects, searchTerm, statusFilter])

  // 按目标主机归类项目，支持用户拖拽排序与生产置顶
  const serverGroups = useMemo(() => {
    const map = new Map<string, ServerGroup>()

    filteredProjects.forEach((project) => {
      const key =
        project.serverId ||
        `${project.serverName}_${project.serverIp}` ||
        'localhost'
      const existing = map.get(key)
      const isProd = (project.serverTags || []).some(isProductionTag)

      if (existing) {
        existing.projects.push(project)
        if (project.status === 'active') existing.activeCount++
        if (project.status === 'error') existing.errorCount++
        project.serverTags?.forEach((t) => {
          if (!existing.tags.includes(t)) {
            existing.tags.push(t)
            if (isProductionTag(t)) existing.isProduction = true
          }
        })
      } else {
        map.set(key, {
          key,
          id: project.serverId,
          name: project.serverName || '本地主机 (localhost)',
          ip: project.serverIp || 'localhost',
          tags: [...(project.serverTags || [])],
          isProduction: isProd,
          projects: [project],
          activeCount: project.status === 'active' ? 1 : 0,
          errorCount: project.status === 'error' ? 1 : 0,
        })
      }
    })

    // 排序策略：若存在自定义排序则遵循自定义排序；否则生产置顶，按拼音/字母排序
    return Array.from(map.values()).sort((a, b) => {
      if (customServerOrder.length > 0) {
        const indexA = customServerOrder.indexOf(a.key)
        const indexB = customServerOrder.indexOf(b.key)
        if (indexA !== -1 && indexB !== -1) return indexA - indexB
        if (indexA !== -1) return -1
        if (indexB !== -1) return 1
      }
      if (a.isProduction && !b.isProduction) return -1
      if (!a.isProduction && b.isProduction) return 1
      return a.name.localeCompare(b.name)
    })
  }, [filteredProjects, customServerOrder])

  // ---------------- 主机节点拖拽排序 ----------------
  const handleServerDragStart = (e: React.DragEvent, serverKey: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'server', key: serverKey }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingServerKey(serverKey)
  }

  const handleServerDragOver = (e: React.DragEvent, serverKey: string) => {
    if (draggingServerKey && draggingServerKey !== serverKey) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverServerKey(serverKey)
    }
  }

  const handleServerDrop = async (e: React.DragEvent, targetServerKey: string) => {
    e.preventDefault()
    if (!draggingServerKey || draggingServerKey === targetServerKey) {
      setDraggingServerKey(null)
      setDragOverServerKey(null)
      return
    }

    const currentKeys = serverGroups.map((g) => g.key)
    const fromIdx = currentKeys.indexOf(draggingServerKey)
    const toIdx = currentKeys.indexOf(targetServerKey)

    if (fromIdx !== -1 && toIdx !== -1) {
      const newOrder = [...currentKeys]
      const [removed] = newOrder.splice(fromIdx, 1)
      newOrder.splice(toIdx, 0, removed)

      setCustomServerOrder(newOrder)
      if (typeof window !== 'undefined') {
        localStorage.setItem('solodeck_server_order', JSON.stringify(newOrder))
      }

      try {
        await fetch('/api/servers/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverIds: newOrder }),
        })
      } catch (err) {
        console.error('Failed to persist server reordering:', err)
      }
    }

    setDraggingServerKey(null)
    setDragOverServerKey(null)
  }

  // ---------------- 内部项目拖拽排序 ----------------
  const handleProjectDragStart = (e: React.DragEvent, projectId: string, groupKey: string) => {
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'project', id: projectId, fromGroup: groupKey }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingProjectId(projectId)
  }

  const handleProjectDragOver = (e: React.DragEvent, targetProjectId: string) => {
    if (draggingProjectId && draggingProjectId !== targetProjectId) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDragOverProjectId(targetProjectId)
    }
  }

  const handleProjectDropOnProject = async (e: React.DragEvent, targetProjectId: string, targetGroupKey: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggingProjectId || draggingProjectId === targetProjectId) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      setDragOverGroupKey(null)
      return
    }

    const currentList = [...localProjects]
    const fromIdx = currentList.findIndex((p) => p.id === draggingProjectId)
    const toIdx = currentList.findIndex((p) => p.id === targetProjectId)

    if (fromIdx === -1 || toIdx === -1) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      setDragOverGroupKey(null)
      return
    }

    const movedProject = { ...currentList[fromIdx] }
    let movePayload: any = undefined

    // 检查是否跨主机迁移
    const targetGroup = serverGroups.find((g) => g.key === targetGroupKey)
    if (targetGroup) {
      const isCrossHost =
        (movedProject.serverId && targetGroup.id && movedProject.serverId !== targetGroup.id) ||
        movedProject.serverName !== targetGroup.name

      if (isCrossHost) {
        movedProject.serverId = targetGroup.id
        movedProject.serverName = targetGroup.name
        movedProject.serverIp = targetGroup.ip
        movedProject.serverTags = targetGroup.tags

        movePayload = {
          projectId: movedProject.id,
          serverId: targetGroup.id,
          serverName: targetGroup.name,
          serverIp: targetGroup.ip,
          serverTags: targetGroup.tags,
        }
      }
    }

    currentList.splice(fromIdx, 1)
    currentList.splice(toIdx, 0, movedProject)
    setLocalProjects(currentList)

    const orderedIds = currentList.map((p) => p.id)

    try {
      const res = await fetch('/api/projects/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: orderedIds,
          moveProject: movePayload,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.projects) {
          setLocalProjects(data.projects)
        }
      }
    } catch (err) {
      console.error('Failed to persist project reordering:', err)
    }

    setDraggingProjectId(null)
    setDragOverProjectId(null)
    setDragOverGroupKey(null)
  }

  const handleProjectDropOnGroup = async (e: React.DragEvent, targetGroupKey: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggingProjectId) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      setDragOverGroupKey(null)
      return
    }

    const currentList = [...localProjects]
    const fromIdx = currentList.findIndex((p) => p.id === draggingProjectId)
    if (fromIdx === -1) {
      setDraggingProjectId(null)
      setDragOverProjectId(null)
      setDragOverGroupKey(null)
      return
    }

    const movedProject = { ...currentList[fromIdx] }
    const targetGroup = serverGroups.find((g) => g.key === targetGroupKey)
    let movePayload: any = undefined

    if (targetGroup) {
      const isCrossHost =
        (movedProject.serverId && targetGroup.id && movedProject.serverId !== targetGroup.id) ||
        movedProject.serverName !== targetGroup.name

      if (isCrossHost) {
        movedProject.serverId = targetGroup.id
        movedProject.serverName = targetGroup.name
        movedProject.serverIp = targetGroup.ip
        movedProject.serverTags = targetGroup.tags

        movePayload = {
          projectId: movedProject.id,
          serverId: targetGroup.id,
          serverName: targetGroup.name,
          serverIp: targetGroup.ip,
          serverTags: targetGroup.tags,
        }
      }
    }

    currentList.splice(fromIdx, 1)
    currentList.push(movedProject)
    setLocalProjects(currentList)

    const orderedIds = currentList.map((p) => p.id)

    try {
      const res = await fetch('/api/projects/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: orderedIds,
          moveProject: movePayload,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.projects) {
          setLocalProjects(data.projects)
        }
      }
    } catch (err) {
      console.error('Failed to persist project reordering:', err)
    }

    setDraggingProjectId(null)
    setDragOverProjectId(null)
    setDragOverGroupKey(null)
  }

  // 折叠与展开控制
  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const areAllCollapsed =
    serverGroups.length > 0 &&
    serverGroups.every((g) => collapsedGroups[g.key])

  const toggleCollapseAll = () => {
    if (areAllCollapsed) {
      setCollapsedGroups({})
    } else {
      const all: Record<string, boolean> = {}
      serverGroups.forEach((g) => {
        all[g.key] = true
      })
      setCollapsedGroups(all)
    }
  }

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
      case 'Static Web':
        return 'bg-sky-500/10 text-sky-500 border-sky-500/20'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const renderHealthBadge = (project: Project) => {
    const isProbing = !!probingMap[project.id]
    if (isProbing) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border bg-cyan-500/10 text-cyan-400 border-cyan-500/25 animate-pulse shrink-0">
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
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-muted/50 text-muted-foreground border-border/80 shrink-0"
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
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border bg-emerald-500/10 text-emerald-500 border-emerald-500/25 shrink-0"
          title={`心跳探针响应正常: ${project.lastHealthCheck?.message || '200 OK'} (${
            project.lastHealthCheck?.responseTimeMs !== undefined
              ? `${project.lastHealthCheck.responseTimeMs}ms`
              : '正常'
          })`}
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

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border bg-rose-500/10 text-rose-500 border-rose-500/25 shrink-0"
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

  /**
   * 渲染标签：如果是生产性标签，以极醒目的红色/琥珀色高亮徽标呈现
   */
  const renderTagBadge = (tag: string, size: 'sm' | 'md' = 'sm') => {
    const isProd = isProductionTag(tag)

    if (isProd) {
      return (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 font-bold rounded-md bg-gradient-to-r from-red-500/20 via-rose-500/15 to-amber-500/20 text-rose-300 border border-rose-500/40 shadow-xs tracking-wide shrink-0 ${
            size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
          }`}
          title="⚠️ 生产环境重要节点与部署标签"
        >
          <Flame className="size-3 text-rose-400 shrink-0 fill-rose-500/30 animate-pulse" />
          <span>#{tag}</span>
          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-500/30 text-rose-100 uppercase tracking-tight border border-rose-500/30">
            PROD
          </span>
        </span>
      )
    }

    return (
      <span
        key={tag}
        className={`inline-flex items-center gap-1 font-medium rounded-md bg-muted/70 text-muted-foreground border border-border/60 shrink-0 ${
          size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]'
        }`}
      >
        <Tag className="size-2.5 text-muted-foreground/60 shrink-0" />
        #{tag}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* 极简轻量化头部操作栏 */}
      <div className="bg-card p-3 rounded-xl border border-border flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-xs">
        {/* 搜索框与即时清除 */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目、仓库、分支、主机名、IP、端口、提交日志..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-8 h-9 text-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              title="清空搜索"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* 紧凑状态切换开关与操作群组 */}
        <div className="flex items-center gap-2.5 flex-wrap justify-between md:justify-end">
          {/* 状态分段选择器 */}
          <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              全部 ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                statusFilter === 'active'
                  ? 'bg-card text-emerald-500 font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
              运行中 ({stats.active})
            </button>
            {stats.error > 0 && (
              <button
                onClick={() => setStatusFilter('error')}
                className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  statusFilter === 'error'
                    ? 'bg-card text-rose-500 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
                异常 ({stats.error})
              </button>
            )}
            <button
              onClick={() => setStatusFilter('stopped')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                statusFilter === 'stopped'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="size-1.5 rounded-full bg-muted-foreground shrink-0" />
              已停止 ({stats.stopped})
            </button>
          </div>

          {/* 右侧辅助动作 */}
          <div className="flex items-center gap-2">
            {/* 拖动排序提示 */}
            <span
              className="text-[11px] text-muted-foreground/80 hidden lg:inline-flex items-center gap-1 select-none px-2 py-1 rounded bg-muted/40 border border-border/40"
              title="按住节点或项目左侧的把手图标可自由上下拖拽排序，支持跨主机拖动归类"
            >
              <GripVertical className="size-3 text-muted-foreground" />
              支持拖动排序
            </span>

            {/* 全部折叠 / 展开 */}
            {serverGroups.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapseAll}
                className="h-9 text-xs px-2.5 text-muted-foreground hover:text-foreground gap-1"
                title={areAllCollapsed ? '展开所有主机分组' : '折叠所有主机分组'}
              >
                <Layers className="size-3.5 text-primary" />
                {areAllCollapsed ? '展开所有主机' : '折叠所有主机'}
              </Button>
            )}

            {/* 即时心跳探测 */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleProbeAll}
              disabled={isProbingAll}
              className="h-9 text-xs gap-1.5 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              title="对所有项目发起即时健康探测"
            >
              <Activity
                className={`size-3.5 text-primary ${
                  isProbingAll ? 'animate-spin text-cyan-400' : ''
                }`}
              />
              {isProbingAll ? '探测中...' : '即时探测'}
            </Button>

            {/* 调度巡检状态指示 */}
            {schedulerInfo.enabled && (
              <div
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-border bg-card text-xs text-muted-foreground select-none"
                title={`后台巡检正常运转，每 ${schedulerInfo.intervalSeconds || 30} 秒自动巡检\n上次巡检: ${
                  schedulerInfo.lastRunAt
                    ? formatExactTime(schedulerInfo.lastRunAt)
                    : '初始化运行中'
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
                  巡检: {schedulerInfo.intervalSeconds || 30}s
                </span>
              </div>
            )}

            {/* 重置筛选条件 */}
            {(statusFilter !== 'all' || searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all')
                  setSearchTerm('')
                }}
                className="h-9 text-xs px-2 text-muted-foreground hover:text-foreground"
              >
                重置
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 加载与空状态处理 */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm bg-card rounded-xl border border-border">
          <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-primary opacity-60" />
          正在加载项目与目标节点数据...
        </div>
      ) : serverGroups.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-xl bg-card/40">
          <p className="text-muted-foreground text-sm font-medium">没有找到符合条件的项目</p>
          <p className="text-xs text-muted-foreground mt-1">
            请尝试调整搜索关键词或点击“重置”清空筛选
          </p>
        </div>
      ) : (
        /* 按目标主机归类渲染各分组（支持拖拽排序） */
        <div className="space-y-5">
          {serverGroups.map((group) => {
            const isCollapsed = !!collapsedGroups[group.key]
            const isProd = group.isProduction
            const isServerDragging = draggingServerKey === group.key
            const isServerDragOver = dragOverServerKey === group.key
            const isGroupProjectDragOver = dragOverGroupKey === group.key

            return (
              <div
                key={group.key}
                onDragOver={(e) => {
                  if (draggingServerKey) handleServerDragOver(e, group.key)
                  else if (draggingProjectId) {
                    e.preventDefault()
                    setDragOverGroupKey(group.key)
                  }
                }}
                onDragLeave={() => {
                  if (dragOverServerKey === group.key) setDragOverServerKey(null)
                  if (dragOverGroupKey === group.key) setDragOverGroupKey(null)
                }}
                onDrop={(e) => {
                  if (draggingServerKey) handleServerDrop(e, group.key)
                  else if (draggingProjectId) handleProjectDropOnGroup(e, group.key)
                }}
                className={`rounded-xl overflow-hidden transition-all shadow-xs relative ${
                  isServerDragging
                    ? 'opacity-40 border-2 border-dashed border-primary shadow-lg ring-2 ring-primary/40 scale-[0.99]'
                    : isServerDragOver || isGroupProjectDragOver
                    ? 'ring-2 ring-primary border-primary bg-primary/5'
                    : isProd
                    ? 'border-2 border-rose-500/40 bg-card/95 shadow-rose-500/5'
                    : 'border border-border bg-card'
                }`}
              >
                {/* 主机分组头部卡片 */}
                <div
                  className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none transition-colors ${
                    isProd
                      ? 'bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border-b border-rose-500/20'
                      : 'bg-muted/30 border-b border-border/50'
                  }`}
                >
                  {/* 主机身份与标签 */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* 主机节点拖动排序把手 */}
                    <div
                      draggable={true}
                      onDragStart={(e) => handleServerDragStart(e, group.key)}
                      onDragEnd={() => {
                        setDraggingServerKey(null)
                        setDragOverServerKey(null)
                      }}
                      className="p-1 rounded text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing hover:bg-muted/80 transition-colors shrink-0"
                      title="按住拖拽以调整该主机节点的显示排序"
                    >
                      <GripVertical className="size-4" />
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-transform shrink-0"
                      aria-label="展开或收起主机项目列表"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </button>

                    <div
                      onClick={() => toggleGroup(group.key)}
                      className={`size-9 rounded-lg flex items-center justify-center shrink-0 border cursor-pointer ${
                        isProd
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-xs'
                          : 'bg-primary/10 text-primary border-primary/20'
                      }`}
                    >
                      {isProd ? (
                        <ShieldAlert className="size-5 text-rose-400" />
                      ) : (
                        <Server className="size-5 text-primary" />
                      )}
                    </div>

                    <div
                      onClick={() => toggleGroup(group.key)}
                      className="min-w-0 space-y-0.5 cursor-pointer flex-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">
                          {group.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded border border-border/60">
                          {group.ip}
                        </span>

                        {/* 生产性标签及其他标签醒目输出 */}
                        {group.tags.map((t) => renderTagBadge(t, 'md'))}
                      </div>

                      <p className="text-[11px] text-muted-foreground font-mono">
                        {isProd ? (
                          <span className="text-rose-400 font-semibold flex items-center gap-1">
                            <Flame className="size-3" />
                            关键生产运行节点 · 请严格核对流水线发布变动
                          </span>
                        ) : (
                          '常规测试/开发运维环境节点'
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 主机内项目状态统计指标 */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-7 sm:pl-0">
                    <span className="px-2 py-1 rounded-md text-xs font-semibold bg-muted/80 text-foreground border border-border/60">
                      共 {group.projects.length} 个项目
                    </span>

                    {group.activeCount > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {group.activeCount} 运行中
                      </span>
                    )}

                    {group.errorCount > 0 && (
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/25 flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-rose-500" />
                        {group.errorCount} 异常
                      </span>
                    )}
                  </div>
                </div>

                {/* 主机下的独立项目卡片列表（支持内部项目拖拽排序与跨机移动） */}
                {!isCollapsed && (
                  <div className="p-3.5 sm:p-4 space-y-3.5 bg-muted/25 border-t border-border/50">
                    {group.projects.map((project, index) => {
                      const isProjectDragging = draggingProjectId === project.id
                      const isProjectDragOver = dragOverProjectId === project.id

                      return (
                        <div
                          key={project.id}
                          onDragOver={(e) => handleProjectDragOver(e, project.id)}
                          onDragLeave={() => {
                            if (dragOverProjectId === project.id) setDragOverProjectId(null)
                          }}
                          onDrop={(e) => handleProjectDropOnProject(e, project.id, group.key)}
                          className={`rounded-xl border bg-card p-4 space-y-3.5 transition-all shadow-xs hover:shadow-md hover:border-primary/40 relative ${
                            isProjectDragging
                              ? 'opacity-40 border-2 border-dashed border-primary ring-2 ring-primary/40 scale-[0.99] shadow-lg'
                              : isProjectDragOver
                              ? 'ring-2 ring-primary border-primary bg-primary/5 shadow-md'
                              : project.status === 'active'
                              ? 'border-border border-l-4 border-l-emerald-500'
                              : project.status === 'deploying'
                              ? 'border-border border-l-4 border-l-cyan-500 animate-pulse'
                              : project.status === 'error'
                              ? 'border-border border-l-4 border-l-rose-500'
                              : 'border-border border-l-4 border-l-muted-foreground/40'
                          }`}
                        >
                          {/* 顶部标题、环境与操作行 */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-border/40">
                            {/* 左侧项目标识与技术栈标签 */}
                            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                              {/* 项目拖拽排序把手 */}
                              <div
                                draggable={true}
                                onDragStart={(e) => handleProjectDragStart(e, project.id, group.key)}
                                onDragEnd={() => {
                                  setDraggingProjectId(null)
                                  setDragOverProjectId(null)
                                  setDragOverGroupKey(null)
                                }}
                                className="p-1 rounded text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing hover:bg-muted transition-colors shrink-0"
                                title="按住拖拽以调整项目排序或拖入其他主机分组"
                              >
                                <GripVertical className="size-3.5" />
                              </div>

                              {/* 项目序号角标与状态指示点 */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="size-6 rounded-md bg-muted/80 border border-border/80 flex items-center justify-center text-[11px] font-mono font-bold text-muted-foreground shrink-0 select-none">
                                  {index + 1}
                                </span>
                                <div
                                  className={`size-2.5 rounded-full shrink-0 ${
                                    project.status === 'active'
                                      ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                                      : project.status === 'deploying'
                                      ? 'bg-cyan-500 animate-pulse'
                                      : project.status === 'error'
                                      ? 'bg-rose-500 shadow-xs shadow-rose-500/50'
                                      : 'bg-muted-foreground'
                                  }`}
                                />
                              </div>

                              <h3
                                onClick={() => onViewDetails(project)}
                                className="font-bold text-sm sm:text-base text-foreground hover:text-primary transition-colors cursor-pointer"
                                title="点击查看项目详情与历史流水线"
                              >
                                {project.name}
                              </h3>

                              <span className="text-[11px] text-muted-foreground font-mono">
                                {project.id}
                              </span>

                              {/* 运行状态 */}
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${getStatusBgColor(
                                  project.status
                                )} ${getStatusColor(project.status)}`}
                              >
                                {getStatusLabel(project.status)}
                              </span>

                              {/* 心跳健康探针 */}
                              {renderHealthBadge(project)}

                              {/* 语言运行时 */}
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${getRuntimeColor(
                                  project.runtime
                                )}`}
                              >
                                {project.runtime}
                              </span>

                              {/* 载体交付模式 */}
                              {project.deployTargetMode === 'native' ? (
                                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-amber-500/10 text-amber-500 border-amber-500/30 items-center gap-1 shrink-0">
                                  <Terminal className="size-3" />
                                  原生进程
                                </span>
                              ) : (
                                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-blue-500/10 text-blue-400 border-blue-500/30 items-center gap-1 shrink-0">
                                  <Boxes className="size-3" />
                                  {project.dockerDeliveryMode === 'registry'
                                    ? 'Docker 仓库'
                                    : 'Docker 容器'}
                                </span>
                              )}
                            </div>

                            {/* 右侧动作操作群组 */}
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onViewDetails(project)}
                                className="gap-1.5 text-xs h-8"
                              >
                                <ChevronRight className="size-3.5" />
                                详情与流水线
                              </Button>

                              {onCloneProject && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onCloneProject(project)}
                                  className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
                                  title="克隆该项目至其他服务器节点"
                                >
                                  <Copy className="size-3.5" />
                                  克隆
                                </Button>
                              )}

                              <Button
                                size="sm"
                                onClick={() => onDeploy(project.id)}
                                disabled={project.status === 'deploying'}
                                className="gap-1.5 text-xs h-8 font-medium shadow-xs"
                              >
                                <Play className="size-3.5" />
                                {project.status === 'deploying'
                                  ? '正在部署...'
                                  : '立即部署'}
                              </Button>

                              <button
                                onClick={() => onDeleteProject(project.id)}
                                title="删除项目流水线"
                                className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-muted/80 transition-colors"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>

                          {/* 中间核心技术参数矩阵 */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-muted/20 p-3 rounded-lg border border-border/40">
                            {/* 分支与仓库 */}
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <GitBranch className="size-3.5" />
                                分支 / 仓库
                              </div>
                              <p className="font-mono text-foreground font-medium truncate">
                                {project.branch}
                              </p>
                              <p
                                className="text-[11px] text-muted-foreground font-mono truncate cursor-pointer hover:text-foreground"
                                title={project.repository}
                              >
                                {project.repository}
                              </p>
                            </div>

                            {/* 端口与部署路径 */}
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Network className="size-3.5" />
                                服务端口 / 路径
                              </div>
                              <p className="font-mono text-foreground font-medium truncate">
                                {project.deployTargetMode === 'docker' &&
                                project.portMappings &&
                                project.portMappings.length > 0
                                  ? project.portMappings
                                      .map((m) => `:${m.host}➔:${m.container}`)
                                      .join(' ')
                                  : project.serverPort &&
                                    project.serverPort.length > 0
                                  ? project.serverPort.map((p) => `:${p}`).join(' ')
                                  : ':3000'}
                              </p>
                              <p
                                className="text-[11px] text-muted-foreground font-mono truncate"
                                title={project.deployPath}
                              >
                                {project.deployPath}
                              </p>
                            </div>

                            {/* 心跳探针监测 */}
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center justify-between text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Activity className="size-3.5 text-primary" />
                                  心跳响应
                                </div>
                                {project.healthCheckUrl &&
                                project.healthCheckUrl.trim() ? (
                                  <button
                                    type="button"
                                    disabled={probingMap[project.id]}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleProbeSingle(project.id)
                                    }}
                                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline disabled:opacity-50"
                                    title="立即执行一次心跳探测"
                                  >
                                    <RefreshCw
                                      className={`size-2.5 ${
                                        probingMap[project.id]
                                          ? 'animate-spin text-cyan-500'
                                          : ''
                                      }`}
                                    />
                                    探测
                                  </button>
                                ) : null}
                              </div>

                              {!project.healthCheckUrl ||
                              !project.healthCheckUrl.trim() ||
                              project.healthStatus === 'unconfigured' ? (
                                <div>
                                  <p className="font-medium text-muted-foreground flex items-center gap-1">
                                    <HeartCrack className="size-3 text-muted-foreground/60 shrink-0" />
                                    未配置探针
                                  </p>
                                  <p className="text-[10px] text-muted-foreground/60">可在设置中开启</p>
                                </div>
                              ) : (
                                <div>
                                  <p
                                    className={`font-medium flex items-center gap-1.5 ${
                                      project.healthStatus === 'healthy'
                                        ? 'text-emerald-500'
                                        : 'text-rose-500'
                                    }`}
                                  >
                                    {project.healthStatus === 'healthy' ? (
                                      <>
                                        <CheckCircle2 className="size-3.5 shrink-0" />
                                        <span>
                                          正常
                                          {project.lastHealthCheck?.responseTimeMs !==
                                          undefined
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
                                    className="text-[10px] text-muted-foreground font-mono truncate"
                                    title={project.healthCheckUrl}
                                  >
                                    {project.healthCheckUrl}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* 部署时间与频次 */}
                            <div className="space-y-1 min-w-0">
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
                                title={
                                  formatExactTime(project.lastDeployed) ||
                                  undefined
                                }
                              >
                                {project.status === 'deploying'
                                  ? '正在部署...'
                                  : formatRelativeTime(project.lastDeployed, now)}
                              </p>
                              {project.lastDeployed &&
                              formatShortTime(project.lastDeployed) ? (
                                <p
                                  className="text-[11px] text-muted-foreground font-mono truncate"
                                  title={formatExactTime(project.lastDeployed)}
                                >
                                  {formatShortTime(project.lastDeployed)}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {/* 底部当前部署版本与提交信息横条 */}
                          <div className="px-3 py-2 bg-muted/30 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-border/40">
                            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 font-medium">
                                <GitCommit className="size-3.5 text-primary" />
                                <span>当前构建:</span>
                              </div>

                              {/* Git 提交 Hash */}
                              {project.lastCommitHash ? (
                                <span
                                  className="font-mono px-1.5 py-0.5 rounded bg-muted text-foreground font-semibold border border-border text-[11px] shrink-0"
                                  title={`Commit Hash: ${project.lastCommitHash}`}
                                >
                                  {project.lastCommitHash}
                                </span>
                              ) : null}

                              {/* 镜像/原生版本标签 (完整展示无截断) */}
                              {project.lastVersionTag ? (
                                <span
                                  className="inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 font-medium shrink-0 whitespace-nowrap"
                                  title={`版本标签: ${project.lastVersionTag}`}
                                >
                                  <Tag className="size-3 shrink-0" />
                                  {project.lastVersionTag}
                                </span>
                              ) : null}

                              {/* 提交日志信息 */}
                              {project.lastCommitMessage ? (
                                <span
                                  className="text-foreground/90 font-mono text-[11px] truncate flex-1 min-w-0"
                                  title={`提交日志: ${project.lastCommitMessage}`}
                                >
                                  {project.lastCommitMessage}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic text-[11px]">
                                  {project.lastCommitHash
                                    ? '常规发布更新'
                                    : '未检测到历史部署记录'}
                                </span>
                              )}
                            </div>

                            {project.status === 'deploying' && (
                              <span className="text-cyan-500 text-[11px] font-medium animate-pulse shrink-0">
                                流水线正在调度执行...
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

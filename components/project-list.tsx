'use client'

import { useState } from 'react'
import {
  Play,
  GitBranch,
  Server,
  Network,
  ChevronRight,
  Search,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Boxes,
  FolderArchive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Project, ProjectStatus } from '@/lib/types'

interface ProjectListProps {
  projects: Project[]
  loading?: boolean
  onDeploy: (projectId: string) => void
  onViewDetails: (project: Project) => void
  onDeleteProject: (projectId: string) => void
}

export function ProjectList({
  projects,
  loading = false,
  onDeploy,
  onViewDetails,
  onDeleteProject,
}: ProjectListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [runtimeFilter, setRuntimeFilter] = useState<string>('all')

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

  // Filter logic
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.repository.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.serverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.serverIp.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ? true : project.status === statusFilter

    const matchesRuntime =
      runtimeFilter === 'all' ? true : project.runtime === runtimeFilter

    return matchesSearch && matchesStatus && matchesRuntime
  })

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card p-3.5 rounded-xl border border-border">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目名称、仓库地址、目标主机..."
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
        </div>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 text-xs">
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

              {/* Last Deployed */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="size-3.5" />
                  最后部署
                </div>
                <p className="text-foreground font-medium">
                  {project.lastDeployed || '未部署'}
                </p>
              </div>
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

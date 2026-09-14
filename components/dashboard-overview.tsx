'use client'

import { useState, useEffect } from 'react'
import {
  Package,
  Activity,
  CheckCircle2,
  Clock,
  Server,
  Flame,
  ArrowUpRight,
  TrendingUp,
  Play,
  Terminal,
  Tag,
} from 'lucide-react'
import { DashboardStats, Project, Deployment } from '@/lib/types'
import { ProjectList } from './project-list'
import { Button } from './ui/button'

interface DashboardOverviewProps {
  projects: Project[]
  loading: boolean
  onDeploy: (projectId: string) => void
  onViewDetails: (project: Project) => void
  onDeleteProject: (projectId: string) => void
  onCreateProject: () => void
  onOpenDeploymentLog: (deploymentId: string) => void
}

export function DashboardOverview({
  projects,
  loading,
  onDeploy,
  onViewDetails,
  onDeleteProject,
  onCreateProject,
  onOpenDeploymentLog,
}: DashboardOverviewProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    activeServices: 0,
    stoppedServices: 0,
    errorServices: 0,
    successRate: 100,
    deploymentsToday: 0,
    totalServers: 0,
    onlineServers: 0,
  })
  const [recentDeployments, setRecentDeployments] = useState<Deployment[]>([])

  const loadStats = async () => {
    try {
      const [resStats, resDeps] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/deployments'),
      ])
      if (resStats.ok) {
        const data = await resStats.json()
        setStats(data)
      }
      if (resDeps.ok) {
        const deps = await resDeps.json()
        if (Array.isArray(deps)) {
          setRecentDeployments(deps.slice(0, 5))
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard overview data', err)
    }
  }

  useEffect(() => {
    loadStats()
  }, [projects])

  return (
    <div className="space-y-6">
      {/* 4 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Projects */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">托管项目总数</span>
            <div className="text-2xl font-bold text-foreground">
              {stats.totalProjects || projects.length}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="text-emerald-500 font-semibold flex items-center">
                <TrendingUp className="size-3 mr-0.5" /> 100%
              </span>
              配置完成
            </p>
          </div>
          <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Package className="size-5" />
          </div>
        </div>

        {/* Card 2: Active Services */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">运行中服务</span>
            <div className="text-2xl font-bold text-green-500">
              {stats.activeServices}
            </div>
            <p className="text-[11px] text-muted-foreground">
              已停止: {stats.stoppedServices} | 异常: {stats.errorServices}
            </p>
          </div>
          <div className="size-11 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
            <Activity className="size-5" />
          </div>
        </div>

        {/* Card 3: Success Rate */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">构建部署成功率</span>
            <div className="text-2xl font-bold text-foreground">
              {stats.successRate}%
            </div>
            <p className="text-[11px] text-muted-foreground">流水线稳定性指标</p>
          </div>
          <div className="size-11 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <CheckCircle2 className="size-5" />
          </div>
        </div>

        {/* Card 4: 24h Deployments */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">24小时交付频次</span>
            <div className="text-2xl font-bold text-foreground">
              {stats.deploymentsToday} 次
            </div>
            <p className="text-[11px] text-muted-foreground">
              在线主机: {stats.onlineServers} / {stats.totalServers}
            </p>
          </div>
          <div className="size-11 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Clock className="size-5" />
          </div>
        </div>
      </div>

      {/* Recent Deliveries Quick Feed */}
      {recentDeployments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Flame className="size-4 text-amber-500" />
              最近构建与部署动态
            </h3>
            <span className="text-xs text-muted-foreground">实时同步流水线事件</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recentDeployments.slice(0, 3).map((dep) => (
              <div
                key={dep.id}
                onClick={() => onOpenDeploymentLog(dep.id)}
                className="p-3 rounded-lg bg-muted/40 border border-border/60 hover:border-primary/50 cursor-pointer transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-xs text-foreground truncate">
                      {dep.projectName}
                    </span>
                    {dep.versionTag && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 truncate max-w-[120px]"
                        title={`镜像版本: ${dep.versionTag}`}
                      >
                        <Tag className="size-2.5 shrink-0" />
                        {dep.versionTag}
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                      dep.status === 'success'
                        ? 'bg-green-500/10 text-green-500'
                        : dep.status === 'running'
                          ? 'bg-cyan-500/10 text-cyan-500 animate-pulse'
                          : dep.status === 'cancelled'
                            ? 'bg-yellow-500/10 text-yellow-500'
                            : 'bg-red-500/10 text-red-500'
                    }`}
                  >
                    {dep.status === 'success'
                      ? '成功'
                      : dep.status === 'running'
                        ? '进行中'
                        : dep.status === 'cancelled'
                          ? '已取消'
                          : '失败'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {dep.commitMessage || dep.commitHash || '常规更新'}
                </p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                  <span>{new Date(dep.startTime).toLocaleTimeString()}</span>
                  <span className="flex items-center gap-1 text-primary">
                    <Terminal className="size-3" /> 查看日志
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Project List inside Dashboard */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">全部项目状态与服务列表</h3>
        </div>
        <ProjectList
          projects={projects}
          loading={loading}
          onDeploy={onDeploy}
          onViewDetails={onViewDetails}
          onDeleteProject={onDeleteProject}
        />
      </div>
    </div>
  )
}

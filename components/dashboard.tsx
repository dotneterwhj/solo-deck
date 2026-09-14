'use client'

import { Sidebar, ViewType } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { Plus, Bell, User, Server } from 'lucide-react'

interface DashboardProps {
  view: ViewType
  onViewChange: (view: ViewType) => void
  onCreateProject: () => void
  onOpenHelp: () => void
  children: React.ReactNode
}

export function Dashboard({
  view,
  onViewChange,
  onCreateProject,
  onOpenHelp,
  children,
}: DashboardProps) {
  const getHeaderInfo = () => {
    switch (view) {
      case 'dashboard':
        return {
          title: '监控总览',
          desc: '实时大盘、交付指标与集群健康状态一览',
        }
      case 'list':
        return {
          title: '项目流水线列表',
          desc: '管理托管的全部应用构建与自动化发布项目',
        }
      case 'servers':
        return {
          title: '服务器与主机管理',
          desc: '集中管理部署目标节点、网络探针与连通性检测',
        }
      case 'settings':
        return {
          title: '全局系统设置',
          desc: '平台基础路径、工作空间目录与通知机器人配置',
        }
      default:
        return { title: 'CI/CD 运维系统', desc: '轻量自研自动化发布平台' }
    }
  }

  const { title, desc } = getHeaderInfo()

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentView={view}
        onViewChange={onViewChange}
        onOpenHelp={onOpenHelp}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="border-b border-border bg-card/60 backdrop-blur-md shrink-0">
          <div className="flex items-center justify-between h-16 px-6">
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                {title}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>

            <div className="flex items-center gap-3">
              {(view === 'dashboard' || view === 'list') && (
                <Button
                  onClick={onCreateProject}
                  size="sm"
                  className="gap-2 text-xs font-semibold shadow-xs"
                >
                  <Plus className="size-4" />
                  新建项目流水线
                </Button>
              )}

              <button
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors relative"
                title="系统通知"
              >
                <Bell className="size-4.5" />
                <span className="absolute top-1.5 right-1.5 size-2 bg-primary rounded-full" />
              </button>

              <div className="flex items-center gap-2 pl-3 border-l border-border">
                <div className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold border border-primary/30">
                  运维
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}

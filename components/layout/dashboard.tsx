'use client'

import { Sidebar, ViewType } from './sidebar'
import { Button } from '@/components/ui/button'
import { Plus, User, Server, LogOut } from 'lucide-react'
import { NotificationPopover } from '@/components/notifications/notification-popover'

interface DashboardProps {
  view: ViewType
  onViewChange: (view: ViewType) => void
  onCreateProject: () => void
  onOpenHelp: () => void
  currentUser?: string
  onLogout?: () => void
  onOpenDeployLog?: (deploymentId: string) => void
  onOpenProjectDetail?: (projectId: string) => void
  children: React.ReactNode
}

export function Dashboard({
  view,
  onViewChange,
  onCreateProject,
  onOpenHelp,
  currentUser,
  onLogout,
  onOpenDeployLog,
  onOpenProjectDetail,
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
        return { title: 'Solo Deck 运维系统', desc: '轻量自研自动化发布平台' }
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
        currentUser={currentUser}
        onLogout={onLogout}
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

              <NotificationPopover
                onNavigateView={onViewChange}
                onOpenDeployLog={onOpenDeployLog}
                onOpenProjectDetail={onOpenProjectDetail}
              />

              <div className="flex items-center gap-2 pl-3 border-l border-border">
                <div className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold border border-primary/30 uppercase">
                  {currentUser ? currentUser.slice(0, 2).toUpperCase() : '运维'}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <span className="text-xs font-semibold text-foreground block">
                    {currentUser || '管理员'}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    已认证
                  </span>
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ml-1"
                    title="安全退出登录"
                  >
                    <LogOut className="size-4" />
                  </button>
                )}
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

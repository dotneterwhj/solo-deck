'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Server,
  HardDrive,
  CheckCheck,
  Trash2,
  ExternalLink,
  RefreshCw,
  X,
  Workflow,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react'
import { SystemNotification, NotificationType } from '@/lib/types'
import { formatRelativeTime, formatExactTime } from '@/lib/time-utils'
import { ViewType } from '@/components/layout/sidebar'

interface NotificationPopoverProps {
  onNavigateView?: (view: ViewType) => void
  onOpenDeployLog?: (deploymentId: string) => void
  onOpenProjectDetail?: (projectId: string) => void
}

type TabKey = 'all' | 'unread' | 'deployment' | 'health_check' | 'server' | 'cleanup'

export function NotificationPopover({
  onNavigateView,
  onOpenDeployLog,
  onOpenProjectDetail,
}: NotificationPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  const containerRef = useRef<HTMLDivElement>(null)

  // 拉取通知数据
  const fetchNotifications = async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=100')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.items || [])
        setUnreadCount(data.unreadCount ?? 0)
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  // 初始加载及定时轮询（每 12 秒）
  useEffect(() => {
    fetchNotifications(true)

    const interval = setInterval(() => {
      fetchNotifications(false)
    }, 12000)

    return () => clearInterval(interval)
  }, [])

  // 点击外部区域或按 ESC 键关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // 标记单条已读
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  // 全部标记已读
  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }

  // 删除单条通知
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
      if (res.ok) {
        const deleted = notifications.find((n) => n.id === id)
        setNotifications((prev) => prev.filter((n) => n.id !== id))
        if (deleted && !deleted.read) {
          setUnreadCount((prev) => Math.max(0, prev - 1))
        }
      }
    } catch (err) {
      console.error('Failed to delete notification:', err)
    }
  }

  // 清空所有通知
  const handleClearAll = async () => {
    if (!confirm('确定要清空全部系统通知吗？')) return
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' })
      if (res.ok) {
        setNotifications([])
        setUnreadCount(0)
      }
    } catch (err) {
      console.error('Failed to clear notifications:', err)
    }
  }

  // 点击通知卡片处理联动与标记已读
  const handleItemClick = (item: SystemNotification) => {
    if (!item.read) {
      handleMarkAsRead(item.id)
    }

    const meta = item.metadata || {}

    if (item.type === 'deployment' && meta.deploymentId && onOpenDeployLog) {
      onOpenDeployLog(meta.deploymentId)
      setIsOpen(false)
      return
    }

    if ((item.type === 'health_check' || item.type === 'project') && meta.projectId) {
      if (onOpenProjectDetail) {
        onOpenProjectDetail(meta.projectId)
        setIsOpen(false)
        return
      }
      if (onNavigateView) {
        onNavigateView('projects')
        setIsOpen(false)
        return
      }
    }

    if (item.type === 'server' && onNavigateView) {
      onNavigateView('servers')
      setIsOpen(false)
      return
    }

    if (item.type === 'cleanup' && onNavigateView) {
      onNavigateView('settings')
      setIsOpen(false)
      return
    }
  }

  // 过滤通知列表
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'all') return true
    if (activeTab === 'unread') return !n.read
    return n.type === activeTab
  })

  // 渲染类型对应的图标
  const renderIcon = (n: SystemNotification) => {
    switch (n.type) {
      case 'deployment':
        if (n.level === 'success') {
          return <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
        }
        if (n.level === 'error') {
          return <XCircle className="size-4 text-rose-400 shrink-0" />
        }
        return <AlertTriangle className="size-4 text-amber-400 shrink-0" />
      case 'health_check':
        if (n.level === 'error') {
          return <Activity className="size-4 text-rose-400 shrink-0 animate-pulse" />
        }
        return <Activity className="size-4 text-emerald-400 shrink-0" />
      case 'server':
        if (n.level === 'error') {
          return <Server className="size-4 text-rose-400 shrink-0" />
        }
        return <Server className="size-4 text-sky-400 shrink-0" />
      case 'cleanup':
        return <HardDrive className="size-4 text-purple-400 shrink-0" />
      case 'project':
        return <Workflow className="size-4 text-indigo-400 shrink-0" />
      default:
        return <Info className="size-4 text-zinc-400 shrink-0" />
    }
  }

  // 渲染级别徽标
  const renderLevelBadge = (level: SystemNotification['level'], type: NotificationType) => {
    switch (level) {
      case 'success':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded">
            成功
          </span>
        )
      case 'error':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded">
            告警
          </span>
        )
      case 'warning':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded">
            提醒
          </span>
        )
      default:
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30 rounded">
            通知
          </span>
        )
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => {
          setIsOpen((prev) => !prev)
          if (!isOpen) fetchNotifications(false)
        }}
        className={`p-2 rounded-lg transition-colors relative ${isOpen
            ? 'bg-muted text-foreground'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          }`}
        title="系统通知"
        aria-label="系统通知"
      >
        <Bell className="size-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Content */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-84 sm:w-96 md:w-[420px] bg-[#161b22] border border-border/80 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col text-foreground animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-border/70 flex items-center justify-between bg-[#1b222c]">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <Bell className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground">系统通知</h3>
                  {unreadCount > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.2 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full font-semibold">
                      {unreadCount} 条未读
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-full">
                      已全部阅读
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Top actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchNotifications(true)}
                disabled={loading}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-md transition-colors text-xs"
                title="刷新通知"
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
              </button>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors text-xs flex items-center gap-1"
                  title="全部标为已读"
                >
                  <CheckCheck className="size-3.5" />
                  <span className="text-[11px] hidden sm:inline">全已读</span>
                </button>
              )}

              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors text-xs"
                  title="清空所有通知"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-md transition-colors ml-1"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border/60 bg-[#12161c] overflow-x-auto scrollbar-none text-[11px]">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium shrink-0 ${activeTab === 'all'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              全部 ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium shrink-0 ${activeTab === 'unread'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              未读 ({unreadCount})
            </button>
            <button
              onClick={() => setActiveTab('deployment')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium shrink-0 ${activeTab === 'deployment'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              部署
            </button>
            <button
              onClick={() => setActiveTab('health_check')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium shrink-0 ${activeTab === 'health_check'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              心跳探针
            </button>
            <button
              onClick={() => setActiveTab('server')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium shrink-0 ${activeTab === 'server'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              主机节点
            </button>
            <button
              onClick={() => setActiveTab('cleanup')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium shrink-0 ${activeTab === 'cleanup'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              清理
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground mb-2">
                  <Bell className="size-5 opacity-40" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">暂无相关系统通知</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  流水线部署、探针异动、主机管理与清理调度等事件将实时送达此处
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const isUnread = !item.read
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative p-3 transition-colors cursor-pointer flex gap-3 ${isUnread
                        ? 'bg-primary/5 hover:bg-primary/10 border-l-2 border-primary'
                        : 'hover:bg-muted/40 border-l-2 border-transparent'
                      }`}
                  >
                    {/* Left Icon */}
                    <div className="mt-0.5">{renderIcon(item)}</div>

                    {/* Middle Info */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs font-semibold leading-tight line-clamp-1 ${isUnread ? 'text-foreground' : 'text-foreground/80'
                            }`}
                        >
                          {item.title}
                        </span>
                        {renderLevelBadge(item.level, item.type)}
                        {isUnread && (
                          <span className="size-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-2">
                        {item.message}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/70">
                        <span className="flex items-center gap-1" title={formatExactTime(item.createdAt)}>
                          <Clock className="size-3" />
                          {formatRelativeTime(item.createdAt)}
                        </span>

                        {item.metadata?.projectName && (
                          <span className="bg-muted/70 px-1.5 py-0.2 rounded text-[10px] text-muted-foreground font-mono">
                            {item.metadata.projectName}
                          </span>
                        )}

                        {item.metadata?.serverName && (
                          <span className="bg-muted/70 px-1.5 py-0.2 rounded text-[10px] text-muted-foreground font-mono">
                            {item.metadata.serverName}
                          </span>
                        )}

                        {item.metadata?.link && (
                          <span className="text-primary hover:underline flex items-center gap-0.5 ml-auto text-[10px]">
                            点击处理
                            <ExternalLink className="size-2.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover Actions */}
                    <div className="absolute top-2.5 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isUnread && (
                        <button
                          onClick={(e) => handleMarkAsRead(item.id, e)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="标为已读"
                        >
                          <CheckCheck className="size-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="p-1 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition-colors"
                        title="删除此通知"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2 px-3 border-t border-border/60 bg-[#12161c] flex items-center justify-between text-[10px] text-muted-foreground/70">
            <span className="flex items-center gap-1">
              <Sparkles className="size-3 text-primary/70" />
              自动保留最新 200 条系统动态
            </span>
            <span>共 {notifications.length} 条</span>
          </div>
        </div>
      )}
    </div>
  )
}

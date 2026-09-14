'use client'

import { useState } from 'react'
import {
  LayoutDashboard,
  Package,
  Server,
  Settings,
  HelpCircle,
  Menu,
  X,
  Workflow,
} from 'lucide-react'

export type ViewType = 'dashboard' | 'list' | 'servers' | 'settings'

interface SidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenHelp?: () => void
}

export function Sidebar({ currentView, onViewChange, onOpenHelp }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const navItems = [
    {
      id: 'dashboard' as ViewType,
      label: '监控概览',
      icon: LayoutDashboard,
    },
    {
      id: 'list' as ViewType,
      label: '项目列表',
      icon: Package,
    },
    {
      id: 'servers' as ViewType,
      label: '主机管理',
      icon: Server,
    },
    {
      id: 'settings' as ViewType,
      label: '系统设置',
      icon: Settings,
    },
  ]

  return (
    <>
      {/* Sidebar Backdrop (Mobile) */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40 ${
          isExpanded ? 'w-64' : 'w-20'
        } lg:relative lg:z-0 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="size-9 rounded-xl bg-primary flex items-center justify-center shadow-sm shrink-0">
              <Workflow className="size-5 text-primary-foreground" />
            </div>
            {isExpanded && (
              <div className="truncate">
                <span className="font-bold text-sidebar-foreground text-base tracking-tight block">
                  CICD 运维平台
                </span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5">
                  轻量自研自动化交付
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent lg:hidden"
            aria-label="Toggle navigation"
          >
            {isExpanded ? (
              <X className="size-5 text-sidebar-foreground" />
            ) : (
              <Menu className="size-5 text-sidebar-foreground" />
            )}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {isExpanded ? '导航菜单' : '•'}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentView === item.id
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
                title={item.label}
              >
                <Icon className="size-4.5 shrink-0" />
                {isExpanded && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="border-t border-sidebar-border p-3 shrink-0">
          <button
            onClick={onOpenHelp}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            title="平台帮助与操作指引"
          >
            <HelpCircle className="size-4.5 shrink-0 text-muted-foreground" />
            {isExpanded && <span className="truncate">平台使用指南</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

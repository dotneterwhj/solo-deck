'use client'

import { useState, useRef, useEffect } from 'react'
import { Palette, Check, ChevronDown, Sparkles } from 'lucide-react'
import { useTheme } from '@/lib/theme/theme-context'
import { ThemeId } from '@/lib/theme/types'

export function ThemeSwitcher() {
  const { theme, setTheme, currentConfig, availableThemes } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部自动关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 按 Esc 键关闭
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={menuRef}>
      {/* 顶部工具栏切换触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-border bg-card/80 hover:bg-muted text-xs font-medium text-foreground transition-all shadow-xs"
        title="切换界面背景主题风格"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5">
          <Palette className="size-3.5 text-primary shrink-0" />
          <span className="hidden sm:inline-block font-medium">{currentConfig.name}</span>
        </div>

        {/* 颜色指示圆点 */}
        <div
          className="size-3 rounded-full border border-border/80 shrink-0 shadow-xs"
          style={{ backgroundColor: currentConfig.preview.primary }}
        />

        <ChevronDown
          className={`size-3 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''
            }`}
        />
      </button>

      {/* 弹出式主题选择菜单 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl border border-border bg-card/95 backdrop-blur-xl p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">界面背景主题</span>
            </div>
            <span className="text-[10px] text-muted-foreground">全局动态主题 Tokens</span>
          </div>

          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
            {availableThemes.map((item) => {
              const isSelected = item.id === theme

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTheme(item.id)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${isSelected
                      ? 'border-primary bg-primary/10 shadow-xs'
                      : 'border-border/50 hover:border-border hover:bg-muted/60'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* 调色板微缩胶囊预览 */}
                    <div
                      className="size-7 rounded-md border flex items-center justify-center p-0.5 shrink-0 shadow-xs"
                      style={{
                        backgroundColor: item.preview.bg,
                        borderColor: item.preview.border,
                      }}
                    >
                      <div
                        className="size-3.5 rounded-full"
                        style={{ backgroundColor: item.preview.primary }}
                      />
                    </div>

                    <div className="min-w-0 space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">
                          {item.name}
                        </span>
                        {item.badge && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-bold">
                            {item.badge}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          {item.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* 选中态对勾指示 */}
                  {isSelected && (
                    <div className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

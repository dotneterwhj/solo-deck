'use client'

import { useState } from 'react'
import {
  X,
  AlertTriangle,
  Play,
  Terminal,
  Code,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Cpu,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Project, ServerEnvInfo, ServerNode } from '@/lib/types'

interface PreflightEnvDialogProps {
  project: Project
  server: ServerNode | null
  missingEnvs: ServerEnvInfo[]
  onClose: () => void
  onProceedDeploy: () => void
}

export function PreflightEnvDialog({
  project,
  server,
  missingEnvs,
  onClose,
  onProceedDeploy,
}: PreflightEnvDialogProps) {
  const [installing, setInstalling] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [showManual, setShowManual] = useState(false)
  const [manualOs, setManualOs] = useState<'ubuntu' | 'centos'>('ubuntu')
  const [copied, setCopied] = useState(false)
  const [installedCount, setInstalledCount] = useState(0)

  // One-click install all missing dependencies in sequence
  const handleAutoInstallAll = async () => {
    if (!server) return
    setInstalling(true)
    setLogs([
      `[00:00] 开始在目标服务器【${server.name} (${server.ip})】批量安装前置依赖 (${missingEnvs.length} 项)...`,
    ])

    let successCount = 0
    for (let i = 0; i < missingEnvs.length; i++) {
      const item = missingEnvs[i]
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] (${i + 1}/${missingEnvs.length}) 正在安装: ${item.name}...`,
      ])

      try {
        const res = await fetch(`/api/servers/${server.id}/env/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ envKey: item.key }),
        })
        const data = await res.json()
        if (data.logs) {
          setLogs((prev) => [...prev, ...data.logs.slice(-3)])
        }
        if (data.success) {
          successCount++
          setInstalledCount(successCount)
        }
      } catch (err: any) {
        setLogs((prev) => [...prev, `[!] 安装 ${item.name} 失败: ${err.message}`])
      }
    }

    setInstalling(false)
    if (successCount === missingEnvs.length) {
      setLogs((prev) => [
        ...prev,
        `[✓] 所有必要环境依赖安装完成！准备自动进入部署流程...`,
      ])
      setTimeout(() => {
        onProceedDeploy()
      }, 1200)
    } else {
      setLogs((prev) => [
        ...prev,
        `[!] 部分环境安装未成功，您可以选择手动安装或跳过检测直接部署。`,
      ])
    }
  }

  // Combined manual installation script
  const combinedManualScript = missingEnvs
    .map((item) => (manualOs === 'ubuntu' ? item.manualGuide.ubuntu : item.manualGuide.centos))
    .join('\n\n')

  const handleCopyScript = () => {
    navigator.clipboard.writeText(combinedManualScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                目标服务器缺少前置运行环境
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                项目【{project.name}】({project.runtime}) 在目标主机【
                {server?.name || project.serverName}】上未检测到必要依赖套件
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={installing}
            className="rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-2">
            <span className="font-semibold text-foreground block">
              检测到以下前置环境未安装：
            </span>
            <div className="divide-y divide-border/60">
              {missingEnvs.map((env) => (
                <div key={env.key} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-foreground">{env.name}</span>
                    <span className="text-muted-foreground ml-2">({env.desc})</span>
                  </div>
                  <code className="text-[11px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                    {env.checkCmd} 未通过
                  </code>
                </div>
              ))}
            </div>
          </div>

          <p className="text-muted-foreground">
            您可以选择通过平台**一键自动远程安装**，或展开**手动安装命令**登录服务器执行：
          </p>

          {/* Action Choice Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div
              onClick={() => !installing && setShowManual(!showManual)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                showManual
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Code className="size-4 text-primary" />
                  查看手动安装命令
                </span>
                {showManual ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </div>
              <p className="text-muted-foreground text-[11px] mt-1">
                自行登录服务器，通过 SSH 终端手动执行安装脚本
              </p>
            </div>

            <div
              onClick={() => !installing && handleAutoInstallAll()}
              className="p-4 rounded-xl border-2 border-primary/50 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Play className="size-4 text-primary" />
                  一键自动安装并继续
                </span>
                <ArrowRight className="size-4 text-primary" />
              </div>
              <p className="text-muted-foreground text-[11px] mt-1">
                平台通过 SSH 会话自动在目标服务器上一键安装并继续部署
              </p>
            </div>
          </div>

          {/* Manual install command box */}
          {showManual && (
            <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">目标系统:</span>
                  <button
                    onClick={() => setManualOs('ubuntu')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      manualOs === 'ubuntu'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    Ubuntu / Debian
                  </button>
                  <button
                    onClick={() => setManualOs('centos')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      manualOs === 'centos'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    CentOS / RHEL
                  </button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyScript}
                  className="h-7 text-xs gap-1.5"
                >
                  {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                  {copied ? '已复制命令' : '复制命令'}
                </Button>
              </div>

              <pre className="p-3 rounded-lg bg-black/85 text-green-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap select-all">
                {combinedManualScript}
              </pre>
            </div>
          )}

          {/* Installation terminal output when executing */}
          {(installing || logs.length > 0) && (
            <div className="rounded-xl border border-border bg-black/90 p-4 font-mono text-xs text-zinc-300 space-y-1 max-h-48 overflow-y-auto select-text">
              <div className="text-muted-foreground pb-1 border-b border-zinc-800 flex items-center justify-between">
                <span>自动化安装终端:</span>
                {installing && (
                  <span className="text-cyan-400 flex items-center gap-1">
                    <RefreshCw className="size-3 animate-spin" /> 安装中...
                  </span>
                )}
              </div>
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.includes('✓') || l.includes('成功')
                      ? 'text-green-400 font-medium'
                      : l.includes('[!]')
                        ? 'text-red-400'
                        : ''
                  }
                >
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={onProceedDeploy}
            disabled={installing}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            跳过检测，强制部署
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={installing}
              className="text-xs"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleAutoInstallAll}
              disabled={installing}
              className="text-xs font-semibold gap-1.5"
            >
              <Play className="size-3.5" />
              {installing ? '正在自动安装...' : '一键自动安装缺失依赖'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import {
  X,
  CheckCircle2,
  AlertCircle,
  Play,
  Copy,
  Check,
  Terminal,
  RefreshCw,
  Cpu,
  Layers,
  Code,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServerNode, ServerEnvInfo } from '@/lib/types'

interface ServerEnvModalProps {
  server: ServerNode
  onClose: () => void
  onServerUpdated?: () => void
}

export function ServerEnvModal({
  server,
  onClose,
  onServerUpdated,
}: ServerEnvModalProps) {
  const [environments, setEnvironments] = useState<ServerEnvInfo[]>([])
  const [checking, setChecking] = useState(false)
  const [installingKey, setInstallingKey] = useState<string | null>(null)
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [expandedManualKey, setExpandedManualKey] = useState<string | null>(null)
  const [manualOs, setManualOs] = useState<'ubuntu' | 'centos'>('ubuntu')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const runCheck = async () => {
    setChecking(true)
    try {
      const res = await fetch(`/api/servers/${server.id}/env/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setEnvironments(data.environments || [])
        onServerUpdated?.()
      }
    } catch (err) {
      console.error('Check server environments error', err)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    runCheck()
  }, [server.id])

  const handleInstall = async (envItem: ServerEnvInfo) => {
    if (installingKey) return
    setInstallingKey(envItem.key)
    setInstallLogs([`[00:00] 开始在 ${server.name} (${server.ip}) 上安装 ${envItem.name}...`])
    setShowLogsModal(true)

    try {
      const res = await fetch(`/api/servers/${server.id}/env/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envKey: envItem.key }),
      })
      const data = await res.json()
      if (data.logs) {
        setInstallLogs(data.logs)
      }
      if (data.success) {
        // Refresh check list
        runCheck()
      }
    } catch (err: any) {
      setInstallLogs((prev) => [...prev, `[!] 异常: ${err.message}`])
    } finally {
      setInstallingKey(null)
    }
  }

  const handleCopyManual = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const missingCount = environments.filter((e) => !e.installed).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  服务器运行环境检测与安装
                </h3>
                <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                  {server.name} ({server.ip}:{server.port})
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                检测目标主机是否安装 Node.js、Python、Docker、PM2 等常用运行时与守护套件
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runCheck}
              disabled={checking}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? '正在检测中...' : '一键重新检测'}
            </Button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Summary notification banner */}
        <div className="px-6 py-3 bg-muted/40 border-b border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {missingCount === 0 ? (
              <span className="flex items-center gap-1.5 text-green-500 font-semibold">
                <CheckCircle2 className="size-4" /> 所有常用前置运行环境均已就绪
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-500 font-semibold">
                <AlertCircle className="size-4" /> 检测到 {missingCount} 项前置环境未安装，请按需安装
              </span>
            )}
          </div>
          <span className="text-muted-foreground">
            SSH 认证主体: <code className="text-foreground">{server.user}</code> (
            {server.authType === 'privateKey' ? '私钥认证' : '密码认证'})
          </span>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
          {checking && environments.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
              <RefreshCw className="size-6 animate-spin mx-auto text-primary" />
              <p>正在通过 SSH 探针检测目标主机环境，请稍候...</p>
            </div>
          ) : (
            environments.map((item) => {
              const isExpanded = expandedManualKey === item.key
              const isInstalling = installingKey === item.key
              const manualCmd =
                manualOs === 'ubuntu' ? item.manualGuide.ubuntu : item.manualGuide.centos

              return (
                <div
                  key={item.key}
                  className={`rounded-xl border transition-all ${
                    item.installed
                      ? 'border-border/80 bg-card hover:border-primary/30'
                      : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">
                          {item.name}
                        </span>
                        {item.installed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-500/10 text-green-500 border border-green-500/20">
                            <CheckCircle2 className="size-3" /> 已安装 ({item.version || '已就绪'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <AlertCircle className="size-3" /> 未检测到安装 (Missing)
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground font-mono">
                          探针: <code>{item.checkCmd}</code>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!item.installed && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setExpandedManualKey(isExpanded ? null : item.key)
                            }
                            className="text-xs h-8 gap-1"
                          >
                            <Code className="size-3.5" />
                            {isExpanded ? '收起命令' : '手动安装命令'}
                            {isExpanded ? (
                              <ChevronUp className="size-3.5 ml-0.5" />
                            ) : (
                              <ChevronDown className="size-3.5 ml-0.5" />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => handleInstall(item)}
                            disabled={isInstalling || Boolean(installingKey)}
                            className="text-xs h-8 gap-1.5 font-semibold"
                          >
                            <Play className="size-3.5" />
                            {isInstalling ? '安装中...' : '一键自动安装'}
                          </Button>
                        </>
                      )}

                      {item.installed && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInstall(item)}
                          disabled={Boolean(installingKey)}
                          className="text-xs h-8 text-muted-foreground hover:text-foreground"
                          title="重新执行安装脚本更新或重装"
                        >
                          重新安装
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Manual install guide expandable panel */}
                  {isExpanded && !item.installed && (
                    <div className="border-t border-border/80 px-4 py-3 bg-muted/40 rounded-b-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground font-semibold">
                            选择 Linux 操作系统发行版:
                          </span>
                          <button
                            onClick={() => setManualOs('ubuntu')}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                              manualOs === 'ubuntu'
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Ubuntu / Debian
                          </button>
                          <button
                            onClick={() => setManualOs('centos')}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                              manualOs === 'centos'
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            CentOS / RHEL / Alma
                          </button>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyManual(manualCmd, item.key)}
                          className="h-7 text-xs gap-1"
                        >
                          {copiedKey === item.key ? (
                            <Check className="size-3 text-green-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          {copiedKey === item.key ? '已复制命令' : '复制安装命令'}
                        </Button>
                      </div>

                      <pre className="p-3 rounded-lg bg-black/80 text-green-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap select-all">
                        {manualCmd}
                      </pre>
                      <p className="text-[11px] text-muted-foreground">
                        提示：以 SSH 登录服务器后直接粘贴上方命令运行，完成后点击右上角【一键重新检测】即可。
                      </p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3.5 bg-muted/20 flex justify-between items-center">
          <span className="text-xs text-muted-foreground font-mono">
            共 {environments.length} 项标准环境套件
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            关闭
          </Button>
        </div>
      </div>

      {/* Terminal logs dialog during one-click install */}
      {showLogsModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">
                  一键环境安装控制台 - {installingKey ? '安装执行中' : '执行完毕'}
                </h4>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                disabled={Boolean(installingKey)}
                className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-black/90 font-mono text-xs text-zinc-300 space-y-1 select-text">
              {installLogs.map((line, idx) => (
                <div
                  key={idx}
                  className={`leading-relaxed ${
                    line.includes('✓') || line.includes('成功')
                      ? 'text-green-400 font-semibold'
                      : line.includes('[!]')
                        ? 'text-red-400'
                        : line.includes('[stderr]')
                          ? 'text-yellow-400'
                          : ''
                  }`}
                >
                  {line}
                </div>
              ))}
              {installingKey && (
                <div className="text-cyan-400 inline-block animate-pulse pt-1">
                  ▌ 正在下发远程命令并执行中...
                </div>
              )}
            </div>

            <div className="border-t border-border px-5 py-3 bg-muted/20 flex justify-end">
              <Button
                size="sm"
                onClick={() => setShowLogsModal(false)}
                disabled={Boolean(installingKey)}
                className="text-xs"
              >
                {installingKey ? '正在安装，请勿关闭...' : '关闭控制台'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

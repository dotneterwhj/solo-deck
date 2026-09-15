'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  X,
  Play,
  Copy,
  Check,
  Download,
  AlertCircle,
  StopCircle,
  Clock,
  Terminal as TerminalIcon,
  ChevronDown,
  GitCommit,
  Tag,
  Boxes,
  Sparkles,
} from 'lucide-react'
import { DeployLogEntry, DeploymentStatus } from '@/lib/types'
import { DockerfileGuideModal } from '@/components/guides/dockerfile-guide-modal'

interface DeployModalProps {
  deploymentId: string
  onClose: () => void
  onReDeploy?: (projectId: string) => void
}

export function DeployModal({
  deploymentId,
  onClose,
  onReDeploy,
}: DeployModalProps) {
  const [logs, setLogs] = useState<DeployLogEntry[]>([])
  const [status, setStatus] = useState<DeploymentStatus>('running')
  const [currentStep, setCurrentStep] = useState<string>('准备中...')
  const [projectId, setProjectId] = useState<string>('')
  const [projectName, setProjectName] = useState<string>('')
  const [commitHash, setCommitHash] = useState<string>('')
  const [commitMessage, setCommitMessage] = useState<string>('')
  const [versionTag, setVersionTag] = useState<string>('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [copied, setCopied] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showDockerfileModal, setShowDockerfileModal] = useState(false)

  const terminalEndRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<string | null>(null)
  const statusRef = useRef<DeploymentStatus>('running')
  const durationRef = useRef<number | null>(null)

  // Fetch initial info & setup SSE
  useEffect(() => {
    let eventSource: EventSource | null = null
    let timer: NodeJS.Timeout | null = null

    // 1. Initial details fetch
    fetch(`/api/deployments/${deploymentId}`)
      .then((res) => res.json())
      .then((dep) => {
        if (dep && !dep.error) {
          setProjectId(dep.projectId)
          setProjectName(dep.projectName)
          setStatus(dep.status)
          statusRef.current = dep.status
          setCurrentStep(dep.currentStep || '处理中...')
          if (dep.commitHash) setCommitHash(dep.commitHash)
          if (dep.commitMessage) setCommitMessage(dep.commitMessage)
          if (dep.versionTag) setVersionTag(dep.versionTag)
          if (dep.logs && dep.logs.length > 0) {
            setLogs(dep.logs)
          }
          if (dep.startTime) {
            startTimeRef.current = dep.startTime
          }
          if (dep.durationSeconds !== undefined && dep.durationSeconds !== null) {
            durationRef.current = dep.durationSeconds
            setElapsedSeconds(dep.durationSeconds)
          } else if (dep.startTime) {
            const currentElapsed = Math.max(
              0,
              Math.floor((Date.now() - new Date(dep.startTime).getTime()) / 1000)
            )
            setElapsedSeconds(currentElapsed)
          }
        }
      })
      .catch((err) => console.error('Error loading deployment info', err))

    // 2. Connect to SSE
    eventSource = new EventSource(`/api/deployments/${deploymentId}/stream`)

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'log') {
          setLogs((prev) => {
            // deduplicate by id
            if (prev.some((p) => p.id === data.payload.id)) return prev
            return [...prev, data.payload]
          })
        } else if (data.type === 'status') {
          if (data.payload.startTime) {
            startTimeRef.current = data.payload.startTime
          }
          if (data.payload.status) {
            statusRef.current = data.payload.status
            setStatus(data.payload.status)
          }
          if (data.payload.currentStep) setCurrentStep(data.payload.currentStep)
          if (data.payload.durationSeconds !== undefined && data.payload.durationSeconds !== null) {
            durationRef.current = data.payload.durationSeconds
            setElapsedSeconds(data.payload.durationSeconds)
          } else if (
            startTimeRef.current &&
            (data.payload.status === 'running' || data.payload.status === 'pending')
          ) {
            const currentElapsed = Math.max(
              0,
              Math.floor((Date.now() - new Date(startTimeRef.current).getTime()) / 1000)
            )
            setElapsedSeconds(currentElapsed)
          }
          if (data.payload.commitHash) setCommitHash(data.payload.commitHash)
          if (data.payload.commitMessage) setCommitMessage(data.payload.commitMessage)
          if (data.payload.versionTag) setVersionTag(data.payload.versionTag)
        } else if (data.type === 'end') {
          if (data.payload.status) {
            statusRef.current = data.payload.status
            setStatus(data.payload.status)
          }
          if (data.payload.durationSeconds !== undefined && data.payload.durationSeconds !== null) {
            durationRef.current = data.payload.durationSeconds
            setElapsedSeconds(data.payload.durationSeconds)
          } else if (startTimeRef.current) {
            const finalElapsed = Math.max(
              0,
              Math.floor((Date.now() - new Date(startTimeRef.current).getTime()) / 1000)
            )
            durationRef.current = finalElapsed
            setElapsedSeconds(finalElapsed)
          }
          eventSource?.close()
        }
      } catch (err) {
        console.error('SSE parse error', err)
      }
    }

    eventSource.onerror = () => {
      // Stream may finish or error
      eventSource?.close()
    }

    // High-precision timer based on server startTime
    timer = setInterval(() => {
      const curStatus = statusRef.current
      if (curStatus === 'running' || curStatus === 'pending') {
        if (startTimeRef.current) {
          const currentElapsed = Math.max(
            0,
            Math.floor((Date.now() - new Date(startTimeRef.current).getTime()) / 1000)
          )
          setElapsedSeconds(currentElapsed)
        } else {
          setElapsedSeconds((s) => s + 1)
        }
      } else if (durationRef.current !== null) {
        setElapsedSeconds(durationRef.current)
      }
    }, 1000)

    return () => {
      eventSource?.close()
      if (timer) clearInterval(timer)
    }
  }, [deploymentId])

  // Auto-scroll to terminal bottom
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleCancelDeploy = async () => {
    if (status !== 'running' && status !== 'pending') return
    setCancelling(true)
    try {
      await fetch(`/api/deployments/${deploymentId}/cancel`, {
        method: 'POST',
      })
    } catch (err) {
      console.error('Cancel deployment error', err)
    } finally {
      setCancelling(false)
    }
  }

  const handleCopyLogs = () => {
    const logText = logs.map((log) => `[${log.timestamp}] ${log.text}`).join('\n')
    navigator.clipboard.writeText(logText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadLog = () => {
    const logText = logs.map((log) => `[${log.timestamp}] ${log.text}`).join('\n')
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deploy-${deploymentId}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isExecuting = status === 'running' || status === 'pending'

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 bg-muted/20 space-y-3">
          {/* Top Row: Title, Project Name, Status Badge, Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                <TerminalIcon className="size-4" />
              </div>
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                  构建部署控制台
                </h2>
                {projectName && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {projectName}
                  </span>
                )}
                {/* Status Badge */}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                    status === 'success'
                      ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                      : isExecuting
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse'
                        : status === 'cancelled'
                          ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30'
                          : 'bg-red-500/10 text-red-500 border border-red-500/30'
                  }`}
                >
                  {status === 'success' && <Check className="size-3" />}
                  {status === 'success' && '部署成功'}
                  {isExecuting && <span className="size-1.5 rounded-full bg-cyan-400 animate-ping" />}
                  {isExecuting && `执行中: ${currentStep}`}
                  {status === 'failed' && <AlertCircle className="size-3" />}
                  {status === 'failed' && '部署失败'}
                  {status === 'cancelled' && <StopCircle className="size-3" />}
                  {status === 'cancelled' && '已中止'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isExecuting && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelDeploy}
                  disabled={cancelling}
                  className="gap-1.5 h-8 text-xs font-medium"
                >
                  <StopCircle className="size-3.5" />
                  {cancelling ? '正在中止...' : '终止部署'}
                </Button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="关闭控制台"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Bottom Row: Metadata info chips with uniform height & baseline */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* 部署批次 */}
            <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-muted/60 border border-border/70 text-[11px] text-foreground/80 font-mono">
              <span className="text-muted-foreground font-sans">批次:</span>
              <span className="font-semibold">{deploymentId}</span>
            </div>

            {/* 耗时 */}
            <div className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-muted/60 border border-border/70 text-[11px] text-foreground/80">
              <Clock className="size-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">耗时:</span>
              <span className="font-mono font-semibold text-foreground">{formatDuration(elapsedSeconds)}</span>
            </div>

            {/* Git Commit */}
            {commitHash && commitHash !== '获取中...' && commitHash !== '-' && (
              <div
                className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-muted/60 border border-border/70 text-[11px] text-foreground/90 max-w-[280px]"
                title={`Git 提交: ${commitHash} - ${commitMessage || '无提交信息'}`}
              >
                <GitCommit className="size-3 text-primary shrink-0" />
                <span className="font-mono font-semibold text-primary">{commitHash}</span>
                {commitMessage && (
                  <span className="truncate text-muted-foreground">{commitMessage}</span>
                )}
              </div>
            )}

            {/* Docker Version Tag */}
            {versionTag && (
              <div
                className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-[11px] text-cyan-400 max-w-[240px]"
                title={`镜像/构建标签: ${versionTag}`}
              >
                <Tag className="size-3 text-cyan-400 shrink-0" />
                <span className="font-mono font-semibold truncate">{versionTag}</span>
              </div>
            )}
          </div>
        </div>

        {/* Dockerfile Tip Banner if relevant */}
        {logs.some((l) => l.text.toLowerCase().includes('dockerfile')) && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-blue-300">
              <Boxes className="size-4 shrink-0 text-blue-400" />
              <span>
                检测到 Docker 容器化构建日志。如需获取项目 Dockerfile 模板或放置规范：
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setShowDockerfileModal(true)}
              className="text-xs text-blue-300 border-blue-500/30 hover:bg-blue-500/20 shrink-0"
            >
              <Sparkles className="size-3 mr-1" />
              查看 Dockerfile 模板与放置指引
            </Button>
          </div>
        )}

        {/* Terminal Output */}
        <div className="flex-1 overflow-hidden flex flex-col bg-black/85 m-4 rounded-xl border border-border shadow-inner">
          {/* Terminal Window Bar */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 bg-black/60">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-red-500/80" />
                <div className="size-2.5 rounded-full bg-yellow-500/80" />
                <div className="size-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-muted-foreground font-mono ml-2">
                bash - cicd-runner@executor:~/workspace
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-border"
                />
                自动滚动
              </label>
            </div>
          </div>

          {/* Terminal Logs Body */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 select-text">
            {logs.length === 0 ? (
              <div className="text-muted-foreground py-4 text-center">
                初始化执行引擎与日志通道中...
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`leading-relaxed whitespace-pre-wrap break-all ${log.type === 'error'
                      ? 'text-red-400 font-medium'
                      : log.type === 'success'
                        ? 'text-green-400 font-medium'
                        : log.type === 'warning'
                          ? 'text-yellow-400'
                          : 'text-zinc-300'
                    }`}
                >
                  <span className="text-zinc-600 select-none mr-2">[{log.timestamp}]</span>
                  {log.text}
                </div>
              ))
            )}
            {isExecuting && (
              <div className="text-cyan-400 inline-block animate-pulse pt-1">
                ▌
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-muted/20">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="gap-1.5 text-xs"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? '已复制日志' : '复制日志'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLog}
              disabled={logs.length === 0}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3.5" />
              下载日志
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              关闭窗口
            </Button>
            {!isExecuting && projectId && onReDeploy && (
              <Button
                size="sm"
                onClick={() => onReDeploy(projectId)}
                className="gap-1.5 text-xs"
              >
                <Play className="size-3.5" />
                重新构建部署
              </Button>
            )}
          </div>
        </div>
      </div>

      {showDockerfileModal && (
        <DockerfileGuideModal
          isOpen={showDockerfileModal}
          onClose={() => setShowDockerfileModal(false)}
        />
      )}
    </div>
  )
}

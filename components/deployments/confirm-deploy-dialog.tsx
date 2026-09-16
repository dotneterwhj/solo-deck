'use client'

import {
  X,
  Play,
  Server,
  GitBranch,
  Layers,
  FolderTree,
  ShieldAlert,
  Boxes,
  Terminal,
  Activity,
  AlertTriangle,
  FileCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Project } from '@/lib/types'

interface ConfirmDeployDialogProps {
  isOpen: boolean
  project: Project | null
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDeployDialog({
  isOpen,
  project,
  onClose,
  onConfirm,
}: ConfirmDeployDialogProps) {
  if (!isOpen || !project) return null

  const isNative = project.deployTargetMode === 'native'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Play className="size-4 fill-primary/30" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">确认立即部署</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                即将触发该项目的自动化构建与发布流水线
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Project Spec Card */}
          <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">{project.name}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground border border-border/60">
                  {project.id}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                {project.runtime || 'Node.js'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-muted-foreground">
              <div className="flex items-center gap-2">
                <GitBranch className="size-3.5 text-primary shrink-0" />
                <span>分支:</span>
                <span className="font-mono font-medium text-foreground truncate">
                  {project.branch}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Layers className="size-3.5 text-amber-500 shrink-0" />
                <span>载体:</span>
                <span className="font-medium text-foreground truncate">
                  {isNative ? '原生宿主机进程' : 'Docker 容器'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Server className="size-3.5 text-blue-400 shrink-0" />
                <span>目标:</span>
                <span className="font-medium text-foreground truncate">
                  {project.serverName || project.serverIp}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-emerald-400 shrink-0" />
                <span>端口:</span>
                <span className="font-mono font-medium text-foreground truncate">
                  {project.deployTargetMode === 'docker' && project.portMappings && project.portMappings.length > 0
                    ? project.portMappings.map((m) => `:${m.host}➔:${m.container}`).join(' ')
                    : project.serverPort && project.serverPort.length > 0
                    ? project.serverPort.map((p) => `:${p}`).join(' ')
                    : ':3000'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40 text-[11px] flex items-center gap-2 text-muted-foreground">
              <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
              <span>部署路径:</span>
              <span className="font-mono text-foreground truncate">{project.deployPath}</span>
            </div>

            {!isNative && project.dockerBuildArgs && project.dockerBuildArgs.filter(a => a.key && a.value).length > 0 && (
              <div className="pt-2 border-t border-border/40 text-[11px] flex items-center gap-2 text-muted-foreground">
                <FileCode className="size-3.5 shrink-0 text-violet-400" />
                <span>构建参数:</span>
                <span className="font-mono text-violet-300 truncate">
                  {project.dockerBuildArgs.filter(a => a.key && a.value).map(a => `${a.key}=${a.value}`).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Delivery Note */}
          <div
            className={`rounded-lg p-3 border flex items-start gap-2.5 text-[11px] leading-relaxed ${
              isNative
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            {isNative ? (
              <Terminal className="size-4 shrink-0 mt-0.5 text-amber-400" />
            ) : (
              <Boxes className="size-4 shrink-0 mt-0.5 text-blue-400" />
            )}
            <div className="space-y-0.5">
              <span className="font-semibold">
                {isNative ? '原生模式交付流程' : 'Docker 容器模式交付流程'}
              </span>
              <p className="text-muted-foreground text-[11px]">
                {isNative
                  ? '系统将检出分支代码，在本地完成依赖安装与编译构建，打包为归档包经 SFTP 安全隧道上传并重载目标主机原生进程。'
                  : '系统将检出分支代码，执行多阶段标准 Docker 镜像构建，并通过配置通道交付并在目标服务器运行隔离容器。'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border px-6 py-3.5 bg-muted/20">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onClose()
              onConfirm()
            }}
            className="gap-1.5 text-xs h-8 font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Play className="size-3.5 fill-current" />
            确认立即部署
          </Button>
        </div>
      </div>
    </div>
  )
}

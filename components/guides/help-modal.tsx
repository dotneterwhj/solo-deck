'use client'

import { useState } from 'react'
import {
  X,
  Workflow,
  Terminal,
  GitBranch,
  Server,
  RotateCcw,
  Webhook,
  CheckCircle2,
  Boxes,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DockerfileGuideModal } from './dockerfile-guide-modal'

interface HelpModalProps {
  onClose: () => void
}

export function HelpModal({ onClose }: HelpModalProps) {
  const [showDockerfileModal, setShowDockerfileModal] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <Workflow className="size-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Solo Deck 平台使用指南
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-muted-foreground leading-relaxed">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-foreground space-y-1">
            <p className="font-semibold text-sm">面向现代团队的极简交付体验</p>
            <p className="text-xs text-muted-foreground">
              本平台参考工业级持续交付最佳实践设计，无需搭建沉重的 Jenkins 或 GitLab CI Runner，基于 Next.js 即可运行全套流水线编排、日志流与节点部署。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <GitBranch className="size-4 text-primary" />
                1. 项目与运行时配置
              </div>
              <p>
                点击【新建项目】，输入项目名称与 Git 仓库。平台内置 Node.js、Python、ASP.NET Core、Go、Java、Docker 等多套标准模板，自动预置依赖安装与构建脚本。
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Terminal className="size-4 text-primary" />
                2. 实时流式控制台
              </div>
              <p>
                点击【立即部署】即可唤起部署终端。采用 Server-Sent Events (SSE) 协议实时传输流水线标准输出，支持中止任务、复制日志与导出 .log 文件。
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Server className="size-4 text-primary" />
                3. 主机与集群节点管理
              </div>
              <p>
                在【主机管理】中登记目标服务器节点，可随时进行 TCP 连通性测试与毫秒级网络延迟探针检测，全面掌握目标节点运行状态。
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <RotateCcw className="size-4 text-primary" />
                4. 历史记录与一键回滚
              </div>
              <p>
                进入项目详情页，可在【部署历史与回滚】标签中审查每一次构建的提交哈希、执行人与耗时，一键即可秒级回滚到任意历史成功版本。
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5 md:col-span-2">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Webhook className="size-4 text-primary" />
                5. Git Webhook 自动化接入
              </div>
              <p>
                每个项目均拥有专属 Webhook 接收端点。将端点填入 GitHub、GitLab 或 Gitee 仓库的 Webhooks 配置中，即可在开发者 push 代码时实现自动构建。
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Boxes className="size-4 text-blue-400" />
                  6. Docker 容器化交付规范与 Dockerfile 放置
                </div>
                <button
                  type="button"
                  onClick={() => setShowDockerfileModal(true)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  <Sparkles className="size-3" />
                  查看 Dockerfile 模板库 ➔
                </button>
              </div>
              <p>
                采用 Docker 模式部署时，系统在仓库根目录执行 <code className="text-blue-400 font-mono">docker build .</code>。请务必将名为 <code className="text-blue-400 font-mono">Dockerfile</code>（无后缀）的文件存放在 Git 代码仓库根目录下并提交。平台支持多语言模板及 .dockerignore 优化方案。
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3.5 border-t border-border bg-muted/20">
          <Button size="sm" onClick={onClose} className="text-xs">
            了解并开始使用
          </Button>
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

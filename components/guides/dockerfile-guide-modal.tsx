'use client'

import { useState } from 'react'
import {
  X,
  Copy,
  Check,
  Download,
  FolderTree,
  Terminal,
  FileCode,
  ShieldCheck,
  ExternalLink,
  Info,
  HelpCircle,
  ArrowRight,
  Boxes,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DOCKERFILE_TEMPLATES,
  DOCKER_PLACEMENT_GUIDELINES,
  DockerfileTemplate,
} from '@/lib/dockerfile-templates'

interface DockerfileGuideModalProps {
  isOpen: boolean
  onClose: () => void
  initialTemplateId?: string
}

export function DockerfileGuideModal({
  isOpen,
  onClose,
  initialTemplateId
}: DockerfileGuideModalProps) {
  // Find matching initial template or default to nodejs
  const defaultSelected =
    DOCKERFILE_TEMPLATES.find((t) => t.id === initialTemplateId) ||
    DOCKERFILE_TEMPLATES.find((t) =>
      initialTemplateId ? t.category.toLowerCase().includes(initialTemplateId.toLowerCase()) : false
    ) ||
    DOCKERFILE_TEMPLATES[0]

  const [selectedTemplate, setSelectedTemplate] = useState<DockerfileTemplate>(defaultSelected)
  const [activeTab, setActiveTab] = useState<'dockerfile' | 'dockerignore' | 'guide'>('dockerfile')
  const [copiedType, setCopiedType] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopiedType(type)
    setTimeout(() => setCopiedType(null), 2000)
  }

  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Boxes className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  Dockerfile 模板库与项目目录放置指引
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">
                  Docker 容器化规范
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                指导您如何编写 Dockerfile 并规范放置于代码仓库根目录中
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Action Guideline Banner */}
        <div className="bg-primary/5 border-b border-border px-6 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-[11px] font-bold">
                !
              </span>
              <span>
                <strong>核心规则：</strong>必须将文件命名为{' '}
                <code className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono font-bold">
                  Dockerfile
                </code>{' '}
                (无文件后缀) 并保存在代码仓库的<strong>根目录</strong>中！
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('guide')}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
              >
                查看目录结构规范图
                <ArrowRight className="size-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Template Selector Tabs */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-2">
              第一步：选择您的项目技术栈模板
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {DOCKERFILE_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate.id === tmpl.id
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tmpl)}
                    className={`p-2.5 rounded-lg border text-left transition-all relative ${isSelected
                      ? 'border-blue-500 bg-blue-500/10 text-foreground font-medium shadow-xs ring-1 ring-blue-500/30'
                      : 'border-border hover:border-border/80 bg-card hover:bg-muted/40 text-muted-foreground'
                      }`}
                  >
                    <p className="text-xs font-semibold truncate">{tmpl.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      端口: {tmpl.defaultPort}
                    </p>
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sub Navigation: Dockerfile / .dockerignore / Guide */}
          <div className="border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('dockerfile')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'dockerfile'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <FileCode className="size-3.5" />
                Dockerfile 模板源码
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dockerignore')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'dockerignore'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <ShieldCheck className="size-3.5" />
                .dockerignore 建议配置
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('guide')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'guide'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <FolderTree className="size-3.5" />
                项目文件夹放置指引与 Git 提交
              </button>
            </div>

            {/* Quick Actions (Copy / Download) */}
            <div className="flex items-center gap-2 pb-1">
              {activeTab === 'dockerfile' && (
                <>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleDownloadFile(selectedTemplate.dockerfile, 'Dockerfile')}
                    className="text-xs"
                  >
                    <Download className="size-3.5 mr-1" />
                    下载 Dockerfile
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => handleCopy(selectedTemplate.dockerfile, 'dockerfile')}
                    className="text-xs"
                  >
                    {copiedType === 'dockerfile' ? (
                      <>
                        <Check className="size-3.5 mr-1 text-emerald-400" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5 mr-1" />
                        复制 Dockerfile
                      </>
                    )}
                  </Button>
                </>
              )}
              {activeTab === 'dockerignore' && (
                <>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleDownloadFile(selectedTemplate.dockerignore, '.dockerignore')}
                    className="text-xs"
                  >
                    <Download className="size-3.5 mr-1" />
                    下载 .dockerignore
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => handleCopy(selectedTemplate.dockerignore, 'dockerignore')}
                    className="text-xs"
                  >
                    {copiedType === 'dockerignore' ? (
                      <>
                        <Check className="size-3.5 mr-1 text-emerald-400" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5 mr-1" />
                        复制 .dockerignore
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Tab 1: Dockerfile Source */}
          {activeTab === 'dockerfile' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-xs">
                <div>
                  <p className="font-semibold text-foreground">{selectedTemplate.name}</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    {selectedTemplate.description}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-[11px]">
                  <span className="text-muted-foreground">
                    默认监听端口:{' '}
                    <strong className="text-foreground font-mono">{selectedTemplate.defaultPort}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    基础镜像:{' '}
                    <code className="text-blue-400 font-mono">{selectedTemplate.baseImage}</code>
                  </span>
                </div>
              </div>

              {/* Code Viewer */}
              <div className="relative rounded-lg border border-border bg-[#0d1117] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/20 text-[11px] text-muted-foreground font-mono">
                  <span className="flex items-center gap-1.5">
                    <FileCode className="size-3.5 text-blue-400" />
                    Dockerfile
                  </span>
                  <span>存放于项目仓库根目录</span>
                </div>
                <pre className="p-4 text-xs font-mono text-neutral-200 overflow-x-auto leading-relaxed max-h-[380px] scrollbar-thin">
                  <code>{selectedTemplate.dockerfile}</code>
                </pre>
              </div>

              {/* Build Args Callout (if declared) */}
              {selectedTemplate.dockerBuildArgs && selectedTemplate.dockerBuildArgs.length > 0 && (
                <div className="p-3 rounded-lg border border-violet-500/30 bg-violet-500/5 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <FileCode className="size-4 text-violet-400" />
                    <span className="font-semibold text-foreground">
                      构建参数声明 (Dockerfile ARG)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300">
                      支持在创建流水线或项目详情中自定义指定
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-6">
                    {selectedTemplate.dockerBuildArgs.map((argDef) => (
                      <div key={argDef.key} className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <code className="text-violet-400 font-mono font-bold">{argDef.key}</code>
                        {argDef.required && <span className="text-destructive font-bold">[必填]</span>}
                        {argDef.defaultValue && (
                          <span className="text-[10px] px-1 rounded bg-muted font-mono text-muted-foreground">
                            默认: {argDef.defaultValue}
                          </span>
                        )}
                        <span>— {argDef.description}</span>
                        {argDef.placeholder && (
                          <span className="text-muted-foreground/60 font-mono">({argDef.placeholder})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Features Callout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {selectedTemplate.keyFeatures.map((feat, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded border border-border bg-card flex items-start gap-2 text-muted-foreground"
                  >
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: .dockerignore */}
          {activeTab === 'dockerignore' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-start gap-2">
                <Info className="size-4 shrink-0 text-amber-400 mt-0.5" />
                <p>
                  <strong>为什么需要 .dockerignore？</strong>
                  <br />
                  在执行 <code className="text-amber-300">docker build</code> 时，Docker 会将本地目录的所有文件打包传输给 Docker 守护进程。
                  使用 <code className="text-amber-300">.dockerignore</code> 排除本地的 <code className="text-amber-300">node_modules</code>、<code className="text-amber-300">.git</code>、构建缓存等，能极大缩短构建上下文传输时间，构建提速可达 5~10 倍！
                </p>
              </div>

              <div className="relative rounded-lg border border-border bg-[#0d1117] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/20 text-[11px] text-muted-foreground font-mono">
                  <span className="flex items-center gap-1.5">
                    <FileCode className="size-3.5 text-amber-400" />
                    .dockerignore
                  </span>
                  <span>与 Dockerfile 同级存放</span>
                </div>
                <pre className="p-4 text-xs font-mono text-neutral-200 overflow-x-auto leading-relaxed max-h-[320px] scrollbar-thin">
                  <code>{selectedTemplate.dockerignore}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Tab 3: Placement Guide & Git workflow */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200/90">
                <p className="font-semibold text-blue-300 text-sm mb-1">
                  如何将 Dockerfile 正确放入您的项目？
                </p>
                <p className="text-muted-foreground">
                  CDPipeline 采用自动化流水线在构建工作区执行{' '}
                  <code className="text-blue-300 font-mono">docker build -t app:latest .</code>。
                  命令末尾的句点 <code className="text-blue-300 font-mono">.</code> 代表当前项目根目录，因此必须将 Dockerfile 保存在项目根目录！
                </p>
              </div>

              {/* Visual Tree */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-border bg-card space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                    <FolderTree className="size-4 text-blue-400" />
                    标准项目根目录结构图示
                  </div>
                  <pre className="p-3 rounded bg-muted/30 border border-border font-mono text-xs text-neutral-300 leading-relaxed overflow-x-auto">
                    {`your-project-repository/
├── 📄 Dockerfile           <-- [关键] 必须位于此处 (无后缀)
├── 📄 .dockerignore        <-- [建议] 过滤不需要打包的文件
├── 📄 package.json         <-- (或 pom.xml / requirements.txt)
├── 📁 src/                 <-- 项目业务源代码
│   └── ...
└── 📄 README.md`}
                  </pre>
                  <p className="text-[11px] text-muted-foreground">
                    ⚠️ <strong>注意：</strong>文件名切勿写成 <code className="text-destructive font-mono">Dockerfile.txt</code>、<code className="text-destructive font-mono">dockerfile.sh</code> 等，必须为无后缀的大写 <code className="text-foreground font-mono">Dockerfile</code>。
                  </p>
                </div>

                <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
                    <Terminal className="size-4 text-emerald-400" />
                    在本地终端提交并推送至 Git 仓库
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    在您的本地项目目录中，创建完文件后执行以下命令提交至远程仓库：
                  </p>
                  <div className="relative rounded bg-black/50 border border-border p-3">
                    <pre className="font-mono text-xs text-emerald-400 overflow-x-auto">
                      {`# 1. 将文件添加至 Git 暂存区
git add Dockerfile .dockerignore

# 2. 提交更改
git commit -m "feat: add Dockerfile for containerized deployment"

# 3. 推送至远程构建分支
git push origin main`}
                    </pre>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `git add Dockerfile .dockerignore\ngit commit -m "feat: add Dockerfile for containerized deployment"\ngit push origin main`,
                          'git'
                        )
                      }
                      className="absolute top-2 right-2 p-1.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 transition-colors"
                    >
                      {copiedType === 'git' ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      复制 Git 指令
                    </button>
                  </div>

                  <div className="text-[11px] text-muted-foreground space-y-1">
                    <p className="flex items-center gap-1 text-foreground font-medium">
                      <Sparkles className="size-3.5 text-amber-400" />
                      接下来：
                    </p>
                    <p>
                      推送完成后，返回 CDPipeline 平台点击【立即部署】，系统将自动拉取最新代码并使用 Dockerfile 完成容器化打包与发布！
                    </p>
                  </div>
                </div>
              </div>

              {/* 4-Step Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                {DOCKER_PLACEMENT_GUIDELINES.steps.map((st) => (
                  <div
                    key={st.step}
                    className="p-3 rounded-lg border border-border bg-muted/20 space-y-1"
                  >
                    <span className="inline-flex size-5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] items-center justify-center">
                      {st.step}
                    </span>
                    <p className="text-xs font-semibold text-foreground">{st.title}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{st.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-border bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>当前选定模板:</span>
            <strong className="text-foreground">{selectedTemplate.name}</strong>
            <span className="font-mono text-blue-400">(端口 {selectedTemplate.defaultPort})</span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onClose} className="text-xs">
              我已知晓并关闭
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

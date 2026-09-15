import { BaseRuntimePlugin } from '../base'
import { RuntimeEnvVarPreset } from '../types'
export class GolangRuntimePlugin extends BaseRuntimePlugin {
  override getStartCommand(projectName?: string, port?: number, options?: { mode?: 'docker' | 'native'; versionTag?: string }): string {
    if (options?.mode === 'native') {
      const p = port || this.defaultPort
      return `PORT=${p} ./server`
    }
    return super.getStartCommand(projectName, port, options)
  }

  readonly id = 'golang'
  readonly name = 'Go'
  readonly category = 'Go'
  readonly description = '适用于 Gin, Fiber, Chi, gRPC 微服务，多阶段静态编译，生成体积仅约 10MB 的极简生产镜像。'
  readonly defaultPort = 8000
  readonly baseImage = 'alpine:3.19'
  readonly defaultNativeInstallCmd = 'go mod download'
  readonly defaultNativeBuildCmd = 'go build -o server .'
  readonly defaultNativeStartCmd = './server'
  readonly requiredNativeTools = ['go']
  override readonly nativeProcessManager = 'Go 原生独立二进制进程'
  override readonly nativeRequirementDesc = '目标服务器需具备与构建架构一致的 Linux 环境（或安装 Go 语言工具链）。'
  readonly keyFeatures = [
    '静态链接编译 (CGO_ENABLED=0)，零额外动态库依赖',
    '剥离符号表与调试信息 (-ldflags="-w -s") 极大压缩体积',
    '最终运行镜像基于 Alpine，整机镜像仅 10MB 左右',
    '内置 HTTPS CA 证书与时区配置',
  ]
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'GIN_MODE', value: 'release', description: 'Gin 框架运行模式' },
    { key: 'PORT', value: '8000', description: '服务监听端口' },
  ]

  readonly dockerfileTemplate = `# ===================================================
# Go 极简轻量级多阶段镜像模板
# 适用: Gin, Fiber, Chi, gRPC 微服务
# 放置路径: 代码仓库根目录 / Dockerfile (与 go.mod 同级)
# ===================================================

# 阶段 1: 静态编译
FROM golang:1.22-alpine AS builder
WORKDIR /app

# 设置 GOPROXY 国内代理与静态编译环境变量
ENV GOPROXY=https://goproxy.cn,direct \\
    CGO_ENABLED=0 \\
    GOOS=linux \\
    GOARCH=amd64

# 依赖缓存
COPY go.mod go.sum* ./
RUN go mod download

# 复制源码并执行构建 (剥离调试符号减少体积)
COPY . .
RUN go build -ldflags="-w -s" -o /app/server .

# 阶段 2: 极小化生产运行环境
FROM alpine:3.19 AS runner
WORKDIR /app

# 安装 ca-certificates 证书 (支持 HTTPS 请求) 与时区
RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Shanghai

# 从构建器阶段拷贝二进制单可执行文件
COPY --from=builder /app/server /app/server

# 暴露服务端口
EXPOSE 8000

# 运行服务
CMD ["/app/server"]
`

  readonly dockerignoreTemplate = `# 版本控制
.git
.gitignore
.idea
.vscode

# 二进制构建产物与临时文件
server
*.exe
*.exe~
*.dll
*.so
*.dylib
vendor/
`
}

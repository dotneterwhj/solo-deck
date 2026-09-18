import { BaseRuntimePlugin, toSafeSlug } from '../base'
import { RuntimeEnvVarPreset, PortMapping } from '../types'

export class NodeJSRuntimePlugin extends BaseRuntimePlugin {
  override getNativeStartCommand(projectName?: string, _port?: number | number[] | PortMapping[]): string {
    const slug = toSafeSlug(projectName)
    return `pm2 reload ${slug} || pm2 start npm --name "${slug}" -- start`
  }
  readonly id = 'nodejs'
  readonly name = 'Node.js'
  readonly category = 'Node.js'
  readonly description = '适用于 Next.js, Express, NestJS, Koa, Vite SSR 等全栈或服务端应用，采用多阶段构建与最小化运行镜像。'
  readonly defaultPort = 3000
  readonly baseImage = 'node:24-alpine'
  readonly defaultNativeInstallCmd = 'npm install'
  readonly defaultNativeBuildCmd = 'npm run build'
  readonly defaultNativeStartCmd = 'npm run start'
  readonly requiredNativeTools = ['node', 'pm2']
  override readonly nativeProcessManager = 'PM2 / Node.js 托管'
  override readonly nativeRequirementDesc = '目标服务器需安装 Node.js (>= 18) 与 PM2 (推荐通过全局 npm install -g pm2 安装)。'
  readonly keyFeatures = [
    '多阶段构建 (Multi-stage build) + Standalone 依赖追踪',
    '依赖层缓存加速，优先利用 package*.json 缓存层避免重复安装',
    '非 root 运行用户 (nextjs 安全加固)',
    '绑定 0.0.0.0 与默认 3000 端口，开箱即用',
  ]
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'NODE_ENV', value: 'production', description: 'Node 运行环境' },
    { key: 'PORT', value: '3000', description: '服务监听端口' },
    { key: 'HOSTNAME', value: '0.0.0.0', description: '绑定地址 (0.0.0.0 允许外部网络访问)' },
  ]

  readonly dockerfileTemplate = `# ===================================================
# Node.js (Next.js Standalone 极致轻量生产模板)
# 适用: Next.js 13 / 14 / 15+ (需在 next.config 中开启 output: 'standalone')
# 特性: 跳过庞大 node_modules
# 放置路径: 代码仓库根目录 / Dockerfile (与 package.json 同级)
# ===================================================

# 阶段 1: 依赖安装层 (利用 Docker 缓存加速)
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 设置 NPM 镜像源加速构建 (按需配置)
RUN npm config set registry https://registry.npmmirror.com

# 优先复制依赖描述文件
COPY package*.json pnpm-lock.yaml* yarn.lock* ./

# 自动适配 pnpm / yarn / npm 依赖安装
RUN \\
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \\
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
  elif [ -f package-lock.json ]; then npm ci; \\
  else npm install; \\
  fi

# 阶段 2: 应用打包编译
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 禁用 Next.js 遥测数据收集以加速构建
ENV NEXT_TELEMETRY_DISABLED=1

# 确保 public 目录存在 (若项目无 public 目录也不会中断构建)
RUN mkdir -p /app/public

# 执行构建打包
RUN npm run build --if-present

# 阶段 3: 极简生产运行镜像 (仅 ~100MB)
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \\
    PORT=3000 \\
    HOSTNAME="0.0.0.0"

# 建立无特权的非 root 用户，增强容器安全性
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 nextjs

# 复制公共静态资源
COPY --from=builder /app/public ./public

# 复制 Next.js Standalone 依赖追踪最小运行产物与静态资源
# ⚠️ 注意: 请确保在 next.config.js / next.config.mjs 中配置了 output: 'standalone'
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# 暴露服务端口 (需与 Solo Deck 部署配置的端口保持一致)
EXPOSE 3000

# Standalone 模式使用 node server.js 启动
CMD ["node", "server.js"]

# ---------------------------------------------------------------
# 【传统 Node.js 应用 (Express / NestJS) 替换说明】
# 若非 Next.js 项目，请将上方 Stage 3 的 Standalone 复制与启动替换为：
# COPY --from=builder /app ./
# USER nextjs
# CMD ["npm", "start"]
# ---------------------------------------------------------------
`

  readonly dockerignoreTemplate = `# 忽略版本控制与编辑器缓存
.git
.gitignore
.vscode
.idea

# 忽略本地构建缓存与依赖
node_modules
.next
dist
build
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.env*.local
README.md
`
}

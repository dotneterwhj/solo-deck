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
# 阶段 1: 依赖安装层 
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 优先复制依赖描述文件
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
COPY prisma ./prisma/

# 设置 NPM 镜像源加速构建 (按需配置)
# RUN npm config set registry https://registry.npmmirror.com

# 自动适配 pnpm / yarn / npm 依赖安装
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# 生成 Prisma 客户端
RUN npx prisma generate

# 阶段 2: 应用打包编译
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 禁用 Next.js 遥测数据收集以加速构建
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# 执行构建打包
RUN npm run build --if-present

# 阶段 3: 生产运行镜像
FROM node:24-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++ vips-dev

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs 

RUN npm install sharp

# 1. 仅复制 Standalone 运行时及静态资源
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 2. 仅复制构建好的原生 Prisma 客户端及相关文件
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# 3. 创建 SQLite 挂载目录
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# 纯 Node.js 原生启动
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

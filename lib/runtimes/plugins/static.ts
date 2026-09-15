import { BaseRuntimePlugin } from '../base'
import { RuntimeEnvVarPreset } from '../types'

export class StaticWebRuntimePlugin extends BaseRuntimePlugin {
  readonly id = 'static'
  readonly name = 'Static Web'
  readonly category = '前端静态'
  readonly description = '适用于 Vue 3, React, Vite, Webpack 等前端 SPA 静态应用，采用 Nginx 极速托管并支持 HTML5 路由。'
  readonly defaultPort = 80
  readonly baseImage = 'nginx:alpine'
  readonly defaultNativeInstallCmd = 'npm install'
  readonly defaultNativeBuildCmd = 'npm run build'
  readonly defaultNativeStartCmd = 'cp -r dist/* /var/www/html/'
  readonly requiredNativeTools = ['nginx']
  override readonly nativeProcessManager = 'Nginx 静态 Web 托管'
  override readonly nativeRequirementDesc = '目标服务器需安装并运行 Nginx Web 服务器。'
  readonly keyFeatures = [
    'Node.js 打包与 Nginx 托管分层分离，运行时镜像仅包含 Nginx 与静态文件',
    '预置 Nginx default.conf，原生支持 try_files 前端单页路由回退',
    '静态资源 Gzip 压缩支持，超低内存占用与高并发分发',
  ]
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'NODE_ENV', value: 'production', description: '打包构建环境' },
  ]

  readonly dockerfileTemplate = `# ===================================================
# 前端 SPA 静态网站 Nginx 容器化模板
# 适用: Vue 3, React, Vite, Webpack, 纯静态 HTML
# 放置路径: 代码仓库根目录 / Dockerfile (与 package.json 同级)
# ===================================================

# 阶段 1: 前端静态资源打包
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN npm install

COPY . .
RUN npm run build

# 阶段 2: Nginx 高性能 Web 托管
FROM nginx:alpine AS runner

# 设置时区
ENV TZ=Asia/Shanghai

# 注入支持 SPA 路由 (Vue Router / React Router) 的 Nginx 配置
RUN echo 'server { \\
    listen 80; \\
    server_name localhost; \\
    gzip on; \\
    gzip_min_length 1k; \\
    gzip_types text/plain text/css application/javascript application/json image/svg+xml; \\
    location / { \\
        root /usr/share/nginx/html; \\
        index index.html index.htm; \\
        try_files $uri $uri/ /index.html; \\
    } \\
    error_page 500 502 503 504 /50x.html; \\
    location = /50x.html { \\
        root /usr/share/nginx/html; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

# 从打包阶段复制 dist 编译输出目录到 Nginx 根目录
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`

  readonly dockerignoreTemplate = `# 版本控制
.git
.gitignore
.vscode
.idea

# 依赖与编译临时文件
node_modules
dist
build
*.local
`
}

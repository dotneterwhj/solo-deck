export interface DockerfileTemplate {
  id: string
  name: string
  category: string
  description: string
  defaultPort: string
  baseImage: string
  dockerfile: string
  dockerignore: string
  sampleBuildCmd: string
  sampleStartCmd: string
  keyFeatures: string[]
  placementPath: string
}

export const DOCKERFILE_TEMPLATES: DockerfileTemplate[] = [
  {
    id: 'nodejs',
    name: 'Node.js / Next.js / Express',
    category: 'Node.js',
    description: '适用于 Next.js, Express, NestJS, Koa, Vite SSR 等全栈或服务端应用，采用多阶段构建与最小化运行镜像。',
    defaultPort: '3000',
    baseImage: 'node:20-alpine',
    placementPath: '项目代码根目录 / Dockerfile',
    sampleBuildCmd: 'docker build -t app:latest .',
    sampleStartCmd: 'docker run -d -p 3000:3000 --name app app:latest',
    keyFeatures: [
      '多阶段构建 (Multi-stage build)，生产镜像体积降低 80%',
      '依赖层缓存机制，优先加载 package*.json 加快二次构建',
      '非 root 运行用户 (node 安全加固)',
      '适配 Next.js / Express 启动入口',
    ],
    dockerfile: `# ===================================================
# Node.js 生产环境构建与轻量运行模板
# 适用: Next.js, Express, NestJS, Koa 等
# 放置路径: 代码仓库根目录 / Dockerfile (与 package.json 同级)
# ===================================================

# 阶段 1: 依赖安装与应用构建
FROM node:20-alpine AS builder
WORKDIR /app

# 设置国内 NPM 镜像加速构建 (按需配置)
RUN npm config set registry https://registry.npmmirror.com

# 优先复制依赖描述文件，充分利用 Docker 镜像缓存
COPY package*.json pnpm-lock.yaml* yarn.lock* ./

# 自动适配 pnpm / yarn / npm 依赖安装
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# 复制其余源码
COPY . .

# 执行应用打包编译
RUN npm run build --if-present

# 阶段 2: 生产精简运行镜像
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 建立无特权的非 root 用户，增强容器安全性
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# 从构建阶段复制必要代码与产物
COPY --from=builder /app ./

USER appuser

# 暴露服务端口 (需与 CDPipeline 部署配置的端口保持一致)
EXPOSE 3000
ENV PORT=3000

# 启动容器
CMD ["npm", "start"]
`,
    dockerignore: `# 忽略版本控制与编辑器缓存
.git
.gitignore
.vscode
.idea

# 忽略依赖与打包输出
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.next/cache
.env.local
.env.*.local
dist
build
`,
  },
  {
    id: 'java-spring',
    name: 'Java (Spring Boot / Maven)',
    category: 'Java',
    description: '适用于 Spring Boot 2.x / 3.x, Spring Cloud 企业级微服务应用，内置容器内存感知与时区设置。',
    defaultPort: '8080',
    baseImage: 'eclipse-temurin:17-jre-alpine',
    placementPath: '项目代码根目录 / Dockerfile',
    sampleBuildCmd: 'docker build -t app:latest .',
    sampleStartCmd: 'docker run -d -p 8080:8080 --name app app:latest',
    keyFeatures: [
      'Maven 编译打包与 JRE 运行分离，运行镜像极轻量',
      '内置中国上海时区 (Asia/Shanghai) 修复日志时间差',
      '配置 JVM 容器感知内存参数 (-XX:MaxRAMPercentage=75.0)',
      '自动扫描 target/*.jar 避免强依赖特定 jar 文件名',
    ],
    dockerfile: `# ===================================================
# Java (Spring Boot) 多阶段构建与轻量化运行模板
# 适用: Spring Boot 2.x / 3.x, Spring Cloud 微服务
# 放置路径: 代码仓库根目录 / Dockerfile (与 pom.xml 同级)
# ===================================================

# 阶段 1: Maven 源码编译与打包
FROM maven:3.9-eclipse-temurin-17-alpine AS builder
WORKDIR /app

# 优先复制 pom.xml 预下载基础依赖
COPY pom.xml .
RUN mvn dependency:go-offline -B || true

# 复制项目源代码
COPY src ./src

# 执行打包并跳过单元测试
RUN mvn clean package -DskipTests

# 阶段 2: 极轻量 JRE 运行时
FROM eclipse-temurin:17-jre-alpine AS runner
WORKDIR /app

# 矫正时区为中国标准时间 (CST/UTC+8)
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# 从构建器中复制生成的 Spring Boot 可执行 jar 包
COPY --from=builder /app/target/*.jar app.jar

# 暴露 Spring Boot 默认服务端口
EXPOSE 8080

# JVM 内存限制与优化参数 (适配 Docker 容器限制)
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

# 启动 Spring Boot 微服务
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
`,
    dockerignore: `# 版本控制
.git
.gitignore
.idea
*.iml
.vscode

# Maven 构建产物与临时文件
target/
*.log
.mvn/wrapper/maven-wrapper.jar
`,
  },
  {
    id: 'python',
    name: 'Python (FastAPI / Flask / Django)',
    category: 'Python',
    description: '适用于 FastAPI, Flask, Django 高性能 Web 服务，采用 Gunicorn/Uvicorn 生产级 WSGI/ASGI 托管。',
    defaultPort: '5000',
    baseImage: 'python:3.11-slim',
    placementPath: '项目代码根目录 / Dockerfile',
    sampleBuildCmd: 'docker build -t app:latest .',
    sampleStartCmd: 'docker run -d -p 5000:5000 --name app app:latest',
    keyFeatures: [
      '基于 python:3.11-slim 纯净镜像，无多余依赖',
      '禁用 .pyc 生成与启用 stdout/stderr 实时无缓冲日志',
      '包含 pip 清华/阿里镜像源加速依赖拉取',
      '内置 Gunicorn 多进程 + Uvicorn 异步工作进程',
    ],
    dockerfile: `# ===================================================
# Python Web 生产环境标准镜像模板
# 适用: FastAPI, Flask, Django, Tornado
# 放置路径: 代码仓库根目录 / Dockerfile (与 requirements.txt 同级)
# ===================================================

FROM python:3.11-slim AS runner

# 环境参数优化: 禁止生成 pyc，开启标准输出无缓冲实时日志
ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    TZ=Asia/Shanghai

WORKDIR /app

# 安装基础运行工具与时区
RUN apt-get update && apt-get install -y --no-install-recommends \\
    tzdata curl \\
    && ln -fs /usr/share/zoneinfo/$TZ /etc/localtime \\
    && echo $TZ > /etc/timezone \\
    && rm -rf /var/lib/apt/lists/*

# 优先安装 pip 依赖，使用清华镜像加速
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 复制项目源代码
COPY . .

# 创建非 root 用户
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# 暴露服务端口
EXPOSE 5000

# 启动指令 (示例: FastAPI / Flask + Gunicorn)
# 若是 FastAPI (ASGI):
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:5000", "main:app"]
# 若是 Flask / Django (WSGI)，可切换为:
# CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
`,
    dockerignore: `# 版本控制
.git
.gitignore
.idea
.vscode

# Python 缓存与虚拟环境
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
.env
.pytest_cache/
`,
  },
  {
    id: 'golang',
    name: 'Go (Golang 高性能服务)',
    category: 'Go',
    description: '适用于 Gin, Fiber, Chi, gRPC 微服务，多阶段静态编译，生成体积仅约 10MB 的极简生产镜像。',
    defaultPort: '8000',
    baseImage: 'alpine:3.19',
    placementPath: '项目代码根目录 / Dockerfile',
    sampleBuildCmd: 'docker build -t app:latest .',
    sampleStartCmd: 'docker run -d -p 8000:8000 --name app app:latest',
    keyFeatures: [
      '静态链接编译 (CGO_ENABLED=0)，零额外动态库依赖',
      '剥离符号表与调试信息 (-ldflags="-w -s") 极大压缩体积',
      '最终运行镜像基于 Alpine，整机镜像仅 10MB 左右',
      '内置 HTTPS CA 证书与时区配置',
    ],
    dockerfile: `# ===================================================
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
`,
    dockerignore: `# 版本控制
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
`,
  },
  {
    id: 'frontend-nginx',
    name: '前端 SPA / 静态网站 (Vue / React / Nginx)',
    category: '前端静态',
    description: '适用于 Vue 3, React, Vite, Webpack, Nuxt/Next 静态导出应用，内置 Nginx 与 HTML5 History 路由回退。',
    defaultPort: '80',
    baseImage: 'nginx:alpine',
    placementPath: '项目代码根目录 / Dockerfile',
    sampleBuildCmd: 'docker build -t app:latest .',
    sampleStartCmd: 'docker run -d -p 80:80 --name app app:latest',
    keyFeatures: [
      'Node.js 打包与 Nginx 托管分层分离，无需 Node 运行时',
      '预置 Nginx default.conf，原生支持 try_files 前端路由',
      '支持 /api/ 接口反向代理转发配置',
      '静态资源 Gzip 压缩与极高并发分发',
    ],
    dockerfile: `# ===================================================
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
`,
    dockerignore: `# 版本控制
.git
.gitignore
.vscode
.idea

# 依赖与编译临时文件
node_modules
dist
build
*.local
`,
  },
  {
    id: 'dotnet',
    name: 'ASP.NET Core (.NET 8.0)',
    category: '.NET',
    description: '适用于 C# 企业级微服务、ASP.NET Core Web API 与高性能后端服务。',
    defaultPort: '8080',
    baseImage: 'mcr.microsoft.com/dotnet/aspnet:8.0',
    placementPath: '项目代码根目录 / Dockerfile',
    sampleBuildCmd: 'docker build -t app:latest .',
    sampleStartCmd: 'docker run -d -p 8080:8080 --name app app:latest',
    keyFeatures: [
      '多阶段构建: SDK 打包发布 ➔ 纯轻量 ASP.NET Core 运行镜像',
      'NuGet 依赖层优先缓存，加快重复构建速度',
      '时区配置与默认 8080 端口绑定',
    ],
    dockerfile: `# ===================================================
# .NET (ASP.NET Core) 企业级生产模板
# 适用: C# .NET 8.0 / 7.0 Web API 与微服务
# 放置路径: 代码仓库根目录 / Dockerfile (与 *.csproj / *.sln 同级)
# ===================================================

# 阶段 1: 编译与发布
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /source

# 缓存 NuGet 依赖
COPY *.sln ./
COPY *.csproj ./
RUN dotnet restore

# 复制所有源码并发布 Release 版本
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# 阶段 2: 生产运行环境
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runner
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \\
    TZ=Asia/Shanghai

COPY --from=builder /app/publish .

EXPOSE 8080

# 请将 App.dll 替换为您项目的实际程序集名称
ENTRYPOINT ["dotnet", "App.dll"]
`,
    dockerignore: `# 版本控制
.git
.gitignore
.vs
.vscode

# 构建输出
bin/
obj/
*.user
`,
  },
]

export const DOCKER_PLACEMENT_GUIDELINES = {
  title: 'Docker 容器化部署操作指南',
  summary: 'CDPipeline 采用标准 Docker 构建机制。为确保流水线能顺利完成构建，请遵循以下规范将 Dockerfile 放入项目中：',
  steps: [
    {
      step: 1,
      title: '在项目代码根目录下创建文件',
      desc: '文件名必须精确命名为 Dockerfile（首字母大写或全小写，不能有 .txt 等后缀）。必须位于与 package.json / pom.xml / requirements.txt / go.mod 相同的根目录下。',
      codeSnippet: `your-project-repository/
├── Dockerfile            # <=== 必须放在代码仓库根目录
├── .dockerignore         # <=== 建议配置，排除构建无用文件
├── package.json          # (或 pom.xml / requirements.txt / go.mod)
└── src/
    └── index.ts`,
    },
    {
      step: 2,
      title: '复制并调整模板内容',
      desc: '在下方选择您的项目技术栈（Node.js / Java / Python / Go 等），复制标准模板。根据您的项目入口文件及所需暴露的端口（EXPOSE）进行微调。',
    },
    {
      step: 3,
      title: '提交并推送到 Git 远程分支',
      desc: '在本地终端中将 Dockerfile 和 .dockerignore 提交至 Git 仓库，并推送至远程部署分支。',
      command: `git add Dockerfile .dockerignore\ngit commit -m "feat: add Dockerfile for containerized deployment"\ngit push origin main`,
    },
    {
      step: 4,
      title: '确保端口映射配置一致',
      desc: '项目配置中的端口（如 8080）需与 Dockerfile 中的 EXPOSE 端口保持一致。平台启动容器时将自动映射宿主机端口。',
    },
  ],
}

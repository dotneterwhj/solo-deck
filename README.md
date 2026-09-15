# 轻量级自研 CI/CD 自动化交付平台

基于 **Next.js 16 (App Router + Turbopack) + React 19 + TypeScript + Tailwind CSS v4** 构建的轻量级自研 CI/CD 自动化发布与运维平台。面向中小型团队或个人服务器，提供开箱即用、零重度外部依赖、支持 Docker 容器化与多语言宿主机原生进程部署的现代化 CI/CD 体验。

```
[CI/CD 平台宿主机 (Local Runner)]                          [目标部署服务器 (Remote Node)]
        │                                                               │
        ├─ 阶段 1: 源码获取与编译构建                                    │
        │   ├─ 1. 在本地沙箱目录克隆 Git 源码仓库                         │
        │   ├─ 2. 容器模式: 生成 Dockerfile 并执行 docker build 镜像      │
        │   └─ 3. 原生模式: 本地执行各语言编译 (npm/pip/go/mvn/dotnet)     │
        │                                                               │
        ├─ 阶段 2: 产物分发通道                                         │
        │   ├─ [通道 A: Docker 离线直连 (save_load)]                    │
        │   │   └─ 本地 docker save ➔ gzip 压缩 ➔ SFTP 传输 ───────────>│
        │   ├─ [通道 B: Docker 企业级镜像仓库 (registry)]               │
        │   │   └─ 本地 docker push ➔ 目标机远程 docker pull <──────────┤
        │   └─ [通道 C: 原生产物归档分发 (Native SFTP)]                 │
        │       └─ 本地 tar.gz 打包 ➔ SFTP 直传目标机目录并解压 ───────>│
        │                                                               │
        └─ 阶段 3: 服务生命周期管理与健康探针 (Remote SSH)               │
            ├─ 1. 容器模式: 停止旧容器并拉起 docker run -d ...          │
            ├─ 2. 原生模式: 目标目录解压 ➔ 语言进程拉起/重载 (PM2/Gunicorn/CLR/Go) │
            └─ 3. 发起 HTTP 自动化健康探针校验 <─────────────────────────┤ (GET /health)
```

---

## 🌟 核心功能特性

### 1. 容器化 (Docker) 与 多语言动态原生进程 (Native) 双交付载体架构
- **解耦正交设计**：彻底解耦“语言运行时 (Runtime)”与“部署载体模式 (DeployTargetMode)”。
- **向导自由双选**：在新建项目向导第 3 步（或项目详情配置）中，可在**“容器部署 (Docker)”**与**“原生部署 (宿主机进程)”**之间自由切换：
  - **Docker 容器化部署**：多阶段镜像构建封装，隔离环境与依赖冲突。分发支持 `save_load` (免 Registry SFTP 直传) 与 `registry` (企业级镜像仓库推拉)。
  - **多语言动态原生宿主机进程部署**：自动适配选中的语言运行时，**绝不硬编码 Node.js**：
    - **Node.js**：`npm install`、`npm run build`、PM2 启动守护 (`pm2 reload <slug> || pm2 start npm --name "<slug>" -- start`)
    - **Python**：`pip install`、`python -m compileall .`、Gunicorn 多进程守护 (`gunicorn -w 4 -b 0.0.0.0:<port> main:app --daemon`)
    - **Go**：`go mod download`、`go build -o server .`、独立二进制运行 (`PORT=<port> ./server`)
    - **Java**：`mvn dependency:resolve`、`mvn clean package -DskipTests`、Spring Boot 进程 (`java -Dserver.port=<port> -jar target/*.jar`)
    - **ASP.NET Core**：`dotnet restore`、`dotnet publish -c Release -o ./publish`、.NET CLR 进程 (`ASPNETCORE_URLS=http://0.0.0.0:<port> dotnet ./publish/<slug>.dll`)
    - **Static Web**：`npm install`、`npm run build`、Nginx 静态文件托管与路由重载
  - 本地打包为 `tar.gz` 经 SFTP 直传目标机解压并由对应守护进程托管。前置环境探针与一键安装自动联动检测对应工具链。

### 2. 可插拔多语言运行时架构 (`lib/runtimes/`)
- **纯粹的语言运行时抽象**：每个运行时自完备封装原生部署命令、容器构建 Dockerfile 模板与依赖工具矩阵。内置 6 种主流语言运行时插件：
  - `Node.js` (Next.js 官方推荐 Standalone 模式，镜像体积从 800MB 瘦身至 ~100MB；兼顾 Express、NestJS、Koa)
  - `Python` (FastAPI, Flask, Django)
  - `ASP.NET Core` (C# .NET 8/9 Web API)
  - `Go` (Gin, Fiber, Chi, gRPC)
  - `Java` (Spring Boot 2.x/3.x, Spring Cloud)
  - `Static Web` (Vue, React, Vite 前端 SPA 与 Nginx 托管)
- **极简扩展**：新增任意语言运行时（如 Rust、PHP、Ruby 等）**仅需新增一个 Plugin 类并注册**，前端新建向导、语言选择器、项目详情、环境变量预设、Dockerfile 向导及流水线引擎将**自动感知并完全适配**，零业务入侵！

### 3. 流水线执行引擎与实时日志流 (SSE)
- 基于 Server-Sent Events (SSE) 协议推流，毫秒级低延迟在前端终端组件中高亮输出构建、打包、分发、启动各阶段日志。
- **高精度耗时对齐**：耗时计算基于服务端记录的绝对 `startTime` 时间戳与完成耗时，杜绝前端定时器漂移或页面刷新时间归零。
- **规范化双层终端头部**：重构部署弹窗头部，采用清晰的上下两层结构（第一行：标题、项目名徽标、运行状态大胶囊与操作按钮；第二行：统一度量衡的批次、耗时、Git 提交与镜像标签 Chip），消除文本基线错位与抖动。
- 完整状态机控制：`pending` ➔ `running` ➔ `success` / `failed` / `cancelled`。
- 支持随时手动一键安全终止执行、复制日志内容及导出 `.log` 归档文件。
- **双运行模式**：**沙箱安全模拟模式 (Simulation)**（开箱即用，免配服务器与 Docker 守护进程）与 **真实系统模式 (Real)**。

### 4. 部署二次确认与主机节点全生命周期管理
- **主机节点全生命周期管理**：支持服务器节点的注册、配置编辑、连接测试、环境自检与删除。编辑时支持修改节点名称、IP/域名、SSH 端口、认证方式、标签及描述；密码与私钥具备安全防覆盖保护（编辑时留空将保留原有凭据）。
- **立即部署二次确认机制**：点击“立即部署”时弹出确认窗口，清晰核对部署项目、运行时、Git 分支、载体类型（容器/原生）、目标主机与路径，防误触操作。
- 目标服务器支持密码认证与 SSH 私钥认证（支持私钥 Passphrase）；**API 响应全链路自动脱敏**（密码、私钥统一掩码 `******`，携带配置状态元数据，杜绝网络传输明文泄露）。
- 真实 SSH 连通性握手与毫秒级延迟探针。
- **前置探针与一键环境安装**：确认部署后自动检测目标机 Docker 守护进程或原生语言工具环境（Node/PM2、Python/Gunicorn、Go、Java、.NET、Nginx 等）；支持一键远程下发环境安装指令，并在实时终端流中查看安装进度。

### 5. 版本管理与一键秒级回滚
- 记录每一次部署的 Git Commit Hash、提交信息、触发类型（手动/Webhook/回滚）、耗时与日志。
- **一键回滚 (Rollback)**：秒级拉起历史成功的 Docker 镜像版本，迅速恢复线上服务。

### 6. Git Webhook 自动化触发
- 每个项目拥有独立的 Webhook URL 终端。
- 支持 GitHub、GitLab、Gitee、Gitea 等代码托管平台在 `git push` 时自动化触发构建流水线。

### 7. 系统登录鉴权与配置化认证
- **免数据库极简配置 (`config/auth.json`)**：系统管理员账号密码由独立配置文件 `config/auth.json` 托管，开箱默认账号 `admin` / 密码 `admin123`；修改保存后免重启即刻生效，亦支持通过环境变量 `AUTH_USERNAME` / `AUTH_PASSWORD` 快速覆盖。
- **高颜值独立登录页 (`/login`)**：提供自适应暗色玻璃拟态风格登录界面、密码明暗切换、长效会话保持与错误交互反馈。
- **防篡改安全会话**：采用 HMAC-SHA256 签名会话凭证并存入 `HttpOnly` Cookie（`cdpipeline_session`），防范 XSS 劫持与时序侧信道猜测；顶部与侧边栏支持一键安全退出登录。
- **无感适配外部自动化**：系统保持对外部 Git Webhook 推送入口的自动化免密放行，保障 CI/CD 自动化全流程不受人工阻断。

### 8. 存储空间与构建产物自动清理调度 (Storage & Docker Prune)
- **本地归档生命周期管理 (`.cicd_artifacts`)**：自动统计当前归档文件数量与占用磁盘总容量；支持配置产物过期保留时长（天数）与单项目最大保留历史版本份数；内置防误删安全保护机制（始终至少保留每个项目 1 份最新构建归档，确保随时可秒级回滚）。
- **Docker 镜像与缓存定时回收 (`docker image prune`)**：支持定时与手动执行本地 Docker 镜像清理；提供“仅悬空镜像 (`<none>:<none>`)”与“深度清理指定天数未使用的历史镜像”双重回收策略，避免持续部署镜像堆积撑爆服务器磁盘。
- **全局设置一键即时清理**：在【全局系统设置】中可实时查看归档容量并一键触发清理，即时返回释放的磁盘空间与删除文件数量。

### 9. 项目一键克隆与多节点快速分发 (Project Cloning)
- **极速跨机复制**：支持将已有项目流水线配置一键克隆，完整继承 Git 源码仓库、凭据、分支、构建编译与启动命令、多语言环境变量以及 Docker 交付策略。
- **智能目标适配**：克隆时可自如切换目标服务器、重设端口与部署路径，系统自动联动校验同一服务器上的端口冲突并给出高亮风险警示；若修改端口，系统自动同步调整健康检查探针 URL。
- **全入口触达**：在大盘概览卡片、项目流水线列表以及项目详情弹窗内均提供醒目的“克隆”快捷按钮，极大提升多环境（Dev/Test/Prod）或多节点分布式部署效率。

### 10. 全局系统通知中心 (System Notifications)
- **多维度事件感知与全域联动**：在右上角集成交互式通知中心（NotificationPopover），实时捕获平台全生命周期动态：
  - **部署事件**：流水线成功、构建异常失败、手动取消任务，通知附带项目名、分支与精确耗时，点击一键直达部署终端日志。
  - **心跳探针状态变迁**：健康探针异动告警（Healthy ➔ Unhealthy 响应失败或超时）与故障自愈恢复提醒，秒级定位故障服务。
  - **主机节点动态**：服务器新增接入、配置变更、节点移除，以及网络连通性异常失联告警与上线恢复。
  - **交付物与镜像清理**：定期自动巡检清理及手动空间释放结果即时推送，清晰展示回收磁盘容量与文件/镜像数。
  - **流水线克隆**：项目配置克隆完成即时提醒。
- **丰富的交互与状态管理**：
  - 铃铛图标支持未读数量角标（红点与数字徽标，99+），有未读异常时呼吸提醒。
  - 支持多维度标签分类筛选（全部、未读、部署、心跳探针、主机节点、清理）。
  - 支持单条点击标记已读并精准跳转对应功能域、单条删除、一键“全部已读”与“一键清空”。
  - 智能持久化与存储容量防护：自动保留最新 200 条系统动态，老旧通知自动淘汰防膨胀。

### 11. 零外部依赖原子持久化存储
- 基于轻量级 JSON 存储引擎（位于 `data/db.json`），内置内存缓存与临时文件重命名 (`tempFile -> renameSync`) 原子写入保障，杜绝文件损坏。
- 内置智能路径展开解析器（支持用户输入 `~` 目录及相对路径的动态展开，杜绝原生 Node.js `fs.existsSync` 对波浪号路径判断失效的问题）。
- 内置初始项目与主机演示数据，克隆后启动即可直接查看与操作。

---

## 🧩 可插拔运行时扩展体系 (How to Add a Runtime)

平台将运行时视为可插拔的插件。如果你需要支持一种新语言（例如 **Rust**）：

### 步骤 1：新建运行时插件类
在 `lib/runtimes/plugins/rust.ts` 中创建插件，继承 `BaseRuntimePlugin`：

```typescript
import { BaseRuntimePlugin } from '../base'
import { RuntimeEnvVarPreset } from '../types'

export class RustRuntimePlugin extends BaseRuntimePlugin {
  readonly id = 'rust'
  readonly name = 'Rust'
  readonly category = 'Rust'
  readonly description = '基于 Rust 官方镜像编译并打包为轻量 Alpine 容器运行'
  readonly defaultPort = 8080
  readonly baseImage = 'alpine:3.19'

  // 1. 原生部署命令规范 (预留目标机裸机直接执行)
  readonly defaultNativeInstallCmd = 'cargo fetch'
  readonly defaultNativeBuildCmd = 'cargo build --release'
  readonly defaultNativeStartCmd = './target/release/server'
  readonly requiredNativeTools = ['cargo', 'rustc']

  // 2. Docker 容器化构建模板 (当前生效模式)
  readonly dockerfileTemplate = `# Build stage
FROM rust:1.78-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

# Run stage
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/target/release/server /app/server
EXPOSE 8080
CMD ["./server"]
`
  readonly dockerignoreTemplate = `target/
.git
`
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'RUST_LOG', value: 'info', description: '日志输出等级' },
  ]
}
```

### 步骤 2：注册插件
在 `lib/runtimes/index.ts` 中引入并注册：

```typescript
import { RustRuntimePlugin } from './plugins/rust'

registerRuntime(new RustRuntimePlugin())
```

**完成！** 
无需修改任何 UI 页面、表格筛选器、5 步向导或流水线分发逻辑，系统将自动支持该运行时的项目创建、Dockerfile 指南查看、镜像构建及部署。

---

## 🚀 快速启动

### 环境要求
- **Node.js** >= 18.18 (推荐 Node.js 20 或 24)
- **npm** >= 9.0 或 **pnpm** >= 9.0
- （可选）本地安装 **Docker** 以体验真实镜像构建与部署

### 启动开发服务器

```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发环境 (Next.js Turbopack)
npm run dev

# 浏览器访问：http://localhost:3000
```

### 生产编译与运行

```bash
# 生产编译
npm run build

# 启动生产服务
npm run start
```

### TypeScript 类型检查

```bash
npx tsc --noEmit
```

---

## 📁 目录结构与架构模块

```
cdpipeline/
├── app/                              # Next.js 16 App Router
│   ├── api/                          # 后端 API 路由 (RESTful + SSE)
│   │   ├── auth/                     # 登录鉴权 (login, logout, me)
│   │   ├── deployments/              # 部署触发、详情、回滚、取消与 /stream (SSE)
│   │   ├── notifications/            # 系统通知列表、已读标记与清空 (/[id])
│   │   ├── projects/                 # 项目增删改查、克隆([id]/clone)及健康探针
│   │   ├── servers/                  # 主机节点增删改查、SSH 连通测试、环境检测与远程安装
│   │   ├── settings/                 # 全局系统设置与清理 (/cleanup)
│   │   ├── stats/                    # 仪表盘统计数据
│   │   └── webhooks/                 # Git Webhook 自动化触发
│   ├── globals.css                   # 全局样式与 Tailwind CSS v4 配置
│   ├── layout.tsx                    # 根布局
│   └── page.tsx                      # 控制台主页面
├── components/                       # 前端 React 19 组件
│   ├── layout/                       # 框架与导航布局 (dashboard, sidebar)
│   ├── dashboard/                    # 大盘与概览视图 (dashboard-overview)
│   ├── projects/                     # 项目流水线 (project-list, project-detail-modal, new-project-wizard, clone-project-modal)
│   ├── deployments/                  # 构建部署与终端 (deploy-modal, confirm-deploy-dialog, preflight-env-dialog)
│   ├── notifications/                # 系统通知组件 (notification-popover)
│   ├── servers/                      # 服务器与节点 (server-management, server-env-modal)
│   ├── settings/                     # 全局系统设置 (system-settings)
│   ├── guides/                       # 指引与帮助 (dockerfile-guide-modal, help-modal)
│   └── ui/                           # 通用基础 UI 组件
├── lib/                              # 核心业务逻辑与服务端工具
│   ├── runtimes/                     # 🌟 可插拔多语言运行时体系
│   │   ├── types.ts                  # IRuntimePlugin 接口定义
│   │   ├── base.ts                   # BaseRuntimePlugin 基类实现
│   │   ├── registry.ts               # RuntimeRegistry 注册中心单例
│   │   ├── plugins/                  # 内置各语言运行时插件 (nodejs, python, java, go...)
│   │   └── index.ts                  # 统一导出与自动注册
│   ├── types.ts                      # 全局核心 TypeScript 接口定义
│   ├── db.ts                         # 原子持久化存储引擎 (db.json)
│   ├── pipeline-runner.ts            # 流水线执行引擎 (纯 Docker 容器交付)
│   ├── docker-distributor.ts         # Docker 镜像打包分发策略 (save_load / registry)
│   ├── dockerfile-templates.ts       # Dockerfile 模板代理层 (适配旧接口)
│   ├── health-checker.ts             # 自动化容器心跳健康检查器
│   ├── shell-env.ts                  # SSH 远程命令环境载入包裹器
│   ├── env-presets.ts                # 各语言环境变量模板预设
│   ├── time-utils.ts                 # 时间格式化工具
│   └── utils.ts                      # 通用工具函数 (cn)
├── data/
│   └── db.json                       # 平台持久化数据库文件
├── README.md                         # 本文档（产品与使用指南）
└── AGENTS.md                         # AI 助手协作开发规范与规则
```

---

## 🔒 安全性与最佳实践

1. **凭据脱敏**：SSH 密码、私钥、Git Token 及敏感环境变量在前端展示与接口传输中均做掩码脱敏处理。
2. **容器沙箱化**：各项目独立容器运行，端口按需映射，防止应用间端口冲突或文件系统交叉越权。
3. **原子持久化**：数据库写入采用临时文件置换 (`renameSync`)，确保高并发或系统意外断电时数据完整不被截断。

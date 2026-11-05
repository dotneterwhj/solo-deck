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
  - `Node.js` (Next.js 官方推荐 Standalone 模式，兼顾 Express、NestJS、Koa)
  - `Python` (FastAPI, Flask, Django)
  - `ASP.NET Core` (C# .NET 8/9 Web API)
  - `Go` (Gin, Fiber, Chi, gRPC)
  - `Java` (Spring Boot 2.x/3.x, Spring Cloud)
  - `Static Web` (Vue, React, Vite 前端 SPA 与 Nginx 托管)
- **极简扩展**：新增任意语言运行时（如 Rust、PHP、Ruby 等）**仅需新增一个 Plugin 类并注册**，前端新建向导、语言选择器、项目详情、环境变量预设、Dockerfile 向导及流水线引擎将**自动感知并完全适配**，零业务入侵！
- **Docker 构建参数 (Build Args)**：运行时插件可通过 `dockerBuildArgs` 声明 Dockerfile 中所需的 `ARG` 参数（如 ASP.NET Core 的 `PROJECT` .csproj 路径与 `DOTNET_VERSION` 版本号），用户在创建流水线向导或项目详情中配置参数值，流水线引擎在 `docker build` 时自动注入 `--build-arg`。

### 3. 可插拔流水线交付载体架构 (`lib/carriers/`, `lib/pipeline-runner.ts`)
- **驱动抽象与调度解耦**：将流水线全局生命周期（状态流转、取消、通知、Git拉取与依赖预检）与交付载体实现彻底解耦，定义统一的 `IPipelineCarrier` 接口与 `CarrierRegistry` 注册中心。
- **调度引擎 (PipelineManager)**：专注于流程编排与实时推流，通过 `getCarrier(deployTargetMode)` 动态派发至对应的载体驱动执行应用构建、产物分发与进程托管。
- **开箱即用与极简扩展**：
  - 内置 `DockerCarrier`（标准容器化交付，支持不可变版本标签分配、双重标签注入、构建参数管理、默认统一注入 `--restart unless-stopped` 守护策略与同名容器冲突容错重试）。
  - 内置 `NativeCarrier`（宿主机原生交付，支持自动 `tar.gz` 归档、SFTP 安全传输、解压覆盖、.env 注入与系统守护进程启动）。
  - **便利扩展 Docker Compose**：未来引入多容器编排交付仅需编写 `DockerComposeCarrier` 实现 `IPipelineCarrier` 并在注册中心注册，调度引擎无需修改任何业务代码即可天然支持！

### 4. 流水线执行引擎与实时日志流 (SSE)
- 基于 Server-Sent Events (SSE) 协议推流，毫秒级低延迟在前端终端组件中高亮输出构建、打包、分发、启动各阶段日志。
- **高精度耗时对齐**：耗时计算基于服务端记录的绝对 `startTime` 时间戳与完成耗时，杜绝前端定时器漂移或页面刷新时间归零。
- **规范化双层终端头部**：重构部署弹窗头部，采用清晰的上下两层结构（第一行：标题、项目名徽标、运行状态大胶囊与操作按钮；第二行：统一度量衡的批次、耗时、Git 提交与镜像标签 Chip），消除文本基线错位与抖动。
- 完整状态机控制：`pending` ➔ `running` ➔ `success` / `failed` / `cancelled`。
- 支持随时手动一键安全终止执行、复制日志内容及导出 `.log` 归档文件。
- **双运行模式**：**沙箱安全模拟模式 (Simulation)**（开箱即用，免配服务器与 Docker 守护进程）与 **真实系统模式 (Real)**。

### 5. 启动命令自定义保护与智能增量同步 (Safe StartCommand Customization)
- **自定义安全保护**：用户在新建项目向导或项目详情中自由微调 `startCommand`（如挂载卷 `-v`、重启策略 `--restart always`、自定义启动参数或切换原生二进制命令）后，系统智能感知并锁定自定义状态。
- **杜绝命令粗暴覆盖**：
  - **Docker 容器模式**：后续调整端口或增删改环境变量时，系统仅就地增量同步 `-p` 端口映射与 `-e` 环境变量参数，用户手写的其他 flags 100% 完整保留。
  - **Native 宿主机模式**：增删改环境变量完全不污染启动命令（由 `.env` 或 export 承载），调整端口时智能替换端口数字，绝不覆盖用户命令。
- **界面清晰可控**：输入框自动呈现【已手动自定义】徽标与【恢复默认命令】快捷重置按钮，兼顾自由定制与自动化推荐。

### 6. 部署二次确认与主机节点全生命周期管理
- **主机节点全生命周期管理**：支持服务器节点的注册、配置编辑、连接测试、环境自检与删除。编辑时支持修改节点名称、IP/域名、SSH 端口、认证方式、标签及描述；密码与私钥具备安全防覆盖保护（编辑时留空将保留原有凭据）。
- **立即部署二次确认机制**：点击“立即部署”时弹出确认窗口，清晰核对部署项目、运行时、Git 分支、载体类型（容器/原生）、目标主机与路径，防误触操作。
- 目标服务器支持密码认证与 SSH 私钥认证（支持私钥 Passphrase）；**API 响应全链路自动脱敏**（密码、私钥统一掩码 `******`，携带配置状态元数据，杜绝网络传输明文泄露）。
- 真实 SSH 连通性握手与毫秒级延迟探针。
- **前置探针与一键环境安装**：确认部署后自动检测目标机 Docker 守护进程或原生语言工具环境（Node/PM2、Python/Gunicorn、Go、Java、.NET、Nginx 等）；支持一键远程下发环境安装指令，并在实时终端流中查看安装进度。

### 7. 版本管理与一键秒级回滚
- 记录每一次部署的 Git Commit Hash、提交信息、触发类型（手动/Webhook/回滚）、耗时与日志。
- **一键回滚 (Rollback)**：秒级拉起历史成功的 Docker 镜像版本，迅速恢复线上服务。

### 8. Git Webhook 自动化触发
- 每个项目拥有独立的 Webhook URL 终端。
- 支持 GitHub、GitLab、Gitee、Gitea 等代码托管平台在 `git push` 时自动化触发构建流水线。

### 9. 系统登录鉴权与配置化认证
- **免数据库极简配置 (`config/auth.json`)**：系统管理员账号密码由独立配置文件 `config/auth.json` 托管，开箱默认账号 `admin` / 密码 `admin123`；修改保存后免重启即刻生效，亦支持通过环境变量 `AUTH_USERNAME` / `AUTH_PASSWORD` 快速覆盖。
- **高颜值独立登录页 (`/login`)**：提供自适应暗色玻璃拟态风格登录界面、密码明暗切换、长效会话保持与错误交互反馈。
- **防篡改安全会话**：采用 HMAC-SHA256 签名会话凭证并存入 `HttpOnly` Cookie（`solodeck_session`），防范 XSS 劫持与时序侧信道猜测；顶部与侧边栏支持一键安全退出登录。
- **无感适配外部自动化**：系统保持对外部 Git Webhook 推送入口的自动化免密放行，保障 CI/CD 自动化全流程不受人工阻断。

### 10. 存储空间与构建产物自动清理调度 (Storage & Docker Prune)
- **本地归档生命周期管理 (`.cicd_artifacts`)**：自动统计当前归档文件数量与占用磁盘总容量；支持配置产物过期保留时长（天数）与单项目最大保留历史版本份数；内置防误删安全保护机制（始终至少保留每个项目 1 份最新构建归档，确保随时可秒级回滚）。
- **Docker 镜像与缓存定时回收 (`docker image prune`)**：支持定时与手动执行本地 Docker 镜像清理；提供“仅悬空镜像 (`<none>:<none>`)”与“深度清理指定天数未使用的历史镜像”双重回收策略，避免持续部署镜像堆积撑爆服务器磁盘。
- **全局设置一键即时清理**：在【全局系统设置】中可实时查看归档容量并一键触发清理，即时返回释放的磁盘空间与删除文件数量。

### 11. 项目一键克隆与多节点快速分发 (Project Cloning)
- **极速跨机复制**：支持将已有项目流水线配置一键克隆，完整继承 Git 源码仓库、凭据、分支、构建编译与启动命令、多语言环境变量以及 Docker 交付策略。
- **智能目标适配**：克隆时可自如切换目标服务器、重设端口与部署路径，系统自动联动校验同一服务器上的端口冲突并给出高亮风险警示；若修改端口，系统自动同步调整健康检查探针 URL。
- **全入口触达**：在大盘概览卡片、项目流水线列表以及项目详情弹窗内均提供醒目的“克隆”快捷按钮，极大提升多环境（Dev/Test/Prod）或多节点分布式部署效率。

### 12. 全局系统通知中心 (System Notifications)
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

### 13. 按目标主机归类与生产环境醒目标记 (Host-Grouped Project Management & Production Badging)
- **告别臃肿筛选顶栏**：彻底重构项目列表页面头部，移除繁琐生硬的 4 重独立下拉选框（运行环境、目标主机、分类标签、心跳状态）与冗余标签行，将其整合为响应式全局搜索框（支持项目名、仓库地址、分支、主机名、IP、端口、提交日志与 `#标签` 模糊匹配）、带计数指示的状态分段选择器（全部/运行中/异常/已停止）与一键即时探测操作。
- **按目标主机自动归类**：架构上按目标部署节点（Target Host）自动聚合项目流水线，提供高清晰度的专属主机面板，直观展示该主机的 IP 地址、分类标签、项目总数及运行中/异常指标，支持单主机独立折叠/展开与全局一键全部展开/折叠。
- **生产环境醒目标记 (Production Badging)**：自动识别生产环境特征标签（如 `生产`、`prod`、`production` 等），采用高反差发光渐变红边框、警示盾牌与火焰徽标以及 `PROD` 标识，并在主机分组排序中自动置顶生产环境节点，有效防范运维误触操作，保障生产发布安全。

### 14. 主机节点与内部项目拖拽排序 (Host & Project Drag-and-Drop Reordering)
- **主机节点自由拖拽排序**：主机分组卡片左侧配备专属抓手把手，支持鼠标上下拖拽自由重排所有主机节点的展现次序，并在本地及持久化后端（`PUT /api/servers/reorder`）实时生效。
- **内部项目拖拽排序与跨机灵活归类**：每个项目卡片均具备独立拖拽抓手，既支持在当前主机分组内部通过上下拖动重排流水线次序，亦支持将项目直接拖入其他目标主机面板，系统自动联动重排并更新该项目的目标主机部署节点配置（`PUT /api/projects/reorder`）。
- **专业级微交互与状态反馈**：拖拽过程自动呈现半透明虚线指示、缩放位移动画以及高亮落点边框提示，拖拽体验丝滑顺畅。

### 15. 规范化项目命名与全链路校验约束 (Project Name Validation)
- **严格规范要求**：项目名称只能包含**小写英文字母 (`a-z`)、数字 (`0-9`)、短横线 (`-`) 及下划线 (`_`)**，且**严禁以数字开头**和**严禁包含空格**（正则表达式：`^[a-z_-][a-z0-9_-]*$`）。
- **全链路防御保障**：
  - **后端路由守护**：项目创建 (`POST /api/projects`)、修改 (`PUT /api/projects/[id]`)、克隆 (`POST /api/projects/[id]/clone`) 统一进行严格校验，拒绝非法输入并返回清晰友好的错误原因。
  - **前端实时反馈**：新建项目向导 Step 1、流水线克隆弹窗及项目详情编辑面板均具备实时格式检测、红框高亮警示与合规文案指引，确保在后续生成 Docker 容器名、镜像标签、PM2 进程名与部署路径时的全链路一致性与安全性。

### 16. 灵活环境变量配置与载体自适应注入 (Environment Variables)
- **新建向导全流程配置**：在新建流水线向导（Step 4：环境变量）及项目详情配置中，提供直观的环境变量配置面板，支持技术栈预设一键导入、动态添加/删除/修改与敏感凭据保密开关（Eye/EyeOff）。
- **Docker 容器部署自适应注入**：在 Docker 模式下，环境变量自动格式化为 `-e KEY="VALUE"` 参数并动态注入到 `docker run` 启动命令中，流水线在拉起容器时将变量安全注入容器运行时。
- **Native 原生宿主机自适应注入**：在原生进程部署模式下，流水线在部署应用时自动通过系统级 `export KEY="VALUE"` 注入远程/本地会话执行环境，并在部署目标目录（`${deployPath}/.env`）自动生成/更新 `.env` 环境变量文件供应用及守护进程读取。
- **双向实时预览联动**：前端向导在环境变量配置步骤实时呈现 Docker `-e` 或原生 `export` 链预览；在 **Step 6 最终确认页提供编译构建命令（`buildCommand`）与服务拉起命令（`startCommand`）的独立终端高亮预览与一键复制**；在**项目详情弹窗中，环境变量的新增、修改、删除或导入预设均会实时联动更新 `startCommand`**，确保提交前对底层执行指令 100% 确认透明。

### 17. 多端口服务配置与 Docker 容器端口映射 (Multi-Port & Port Mapping Architecture)
- **多端口与独立端口映射支持 (`serverPort: number[]`, `containerPort: number[]`, `portMappings: PortMapping[]`)**：
  - 项目服务全面支持配置与暴露多个网络端口，并支持 Docker 模式下**宿主机外部端口与容器内部端口独立映射**（如宿主机 `8080` ➔ 容器内部 `3000`）。
- **智能启动参数与环境变量编排**：
  - **Docker 容器部署**：
    - 支持单独配置容器端口映射列表，生成 `-p <hostPort>:<containerPort>` 启动参数（如 `-p 8080:3000 -p 8443:3001`）。
    - 容器内部应用监听端口与容器环境变量 `PORT` 自动同步，反向代理与心跳探针由外部访问宿主机端口，分工严谨明确。
  - **原生宿主机部署**：自动以首个主端口注入运行环境变量 `PORT`，部署终端与概览高亮显示所有监听端口。
- **人性化交互与冲突校验**：
  - **新建向导与项目详情**：在 Docker 模式下提供直观的可视化端口映射列表，支持快速添加/删除映射对、独立调整宿主机端口与容器端口；在 Native 模式下提供多端口逗号分隔输入。
  - **流水线克隆**：智能检测目标主机是否存在同机端口重叠冲突并给予醒目警示，完整继承并支持定制容器端口映射。
  - **仪表盘与卡片**：直观展示清晰的映射关系（如 `:8080➔:3000`）。

### 18. 多套背景主题与动态 Design Tokens 架构 (Theme System)
- **纯 CSS Design Tokens 变量驱动 · 组件零代码入侵**：
  - 平台遵循现代前端设计系统架构，所有 UI 颜色与材质统一映射到语义化 CSS 变量（`--background`, `--card`, `--border`, `--muted`, `--foreground`, `--primary` 等）。
  - **更换或定制主题完全不修改任何业务组件代码**，只需在 `app/globals.css` 中扩展对应 `[data-theme="..."]` 的变量声明。
- **精选 6 套高品质现代化主题风格**：
  - **钛金工矿 (Titanium Amber)**：默认主题，工业拉丝金属冷灰基底搭配航天安全琥珀金仪表，硬朗工控质感。
  - **极客暗黑 (Dark Geek)**：纯粹黑曜石黑灰，极低视觉疲劳，沉浸式硬核极客风。
  - **星际极夜蓝 (Midnight Navy)**：深邃蔚蓝深空星海，科技青蓝冷光，整屏深海星空氛围。
  - **极光秘境 (Aurora Emerald)**：暗夜冷萃翡翠玉石，深翠暗林与北欧极光荧光漫射。
  - **赛博深霓 (Cyberpunk Purple)**：深邃暗夜幻紫与高饱和霓虹品红，赛博朋克未来感拉满。
  - **纯净白昼 (Pure Light)**：清爽通透的高对比白昼明亮模式。
- **秒级实时生效与零闪烁持久化**：
  - 切换主题即刻在全域所有页面与弹窗组件中无缝生效。
  - 用户的偏好自动持久化在浏览器的 `localStorage` 中；根布局通过首屏防闪烁脚本（Anti-FOUC Script）在 DOM 首次呈现前即刻恢复主题，彻底告别刷新白屏或视觉跳动。
- **双入口交互触达**：
  - 顶部导航栏右上角集成调色板微缩胶囊切换器 (`<ThemeSwitcher />`)，一键唤出下拉调色板。
  - 【全局系统设置】中提供全景网格卡片面板，直观查看各主题的配色预览与设计理念。

### 19. 现代化 Prisma 7.10.1 + SQLite 本地持久化存储
- 全面升级采用 **Prisma 7.10.1** 驱动本地 **SQLite** 数据库（`data/solodeck.db`），配合 `@prisma/adapter-better-sqlite3`（支持 Node 24 原生绑定），彻底解决传统单 JSON 文件的并发冲突与性能瓶颈。
- **全异步数据流**：数据层接口全面拥抱原生 `async/await`，为服务端 API 与流水线生命周期提供强类型类型安全与事务隔离保障。
- **自动迁移与种子初始化**：首次启动时若检测到既有 `data/db.json`，自动执行平滑数据导入与数据迁移；若为全新环境则自动装载初始种子演示数据。
- 内置智能路径展开解析器（支持用户输入 `~` 目录及相对路径的动态展开，杜绝原生 Node.js `fs.existsSync` 对波浪号路径判断失效的问题）。

### 20. 多托管平台 Git 凭据自适应与安全脱敏 (`lib/git-utils.ts`)
- **平台差异自适应与自动缺省**：
  - **GitLab 规范适配**：针对 GitLab Personal / Project Access Token 在 HTTP Basic Auth 下严格校验用户名的特性，当用户仅填写 Token 而账号留空时，系统自动识别并缺省适配账号为 `oauth2`（`https://oauth2:<token>@gitlab.com/...`），彻底解决以往因密码为空导致 `401 Unauthorized` 鉴权失败的问题。
  - **Gitea 极简适配**：自适应支持 Gitea 将 Token 直接作为账号认证的便捷规范（`https://<token>@gitea.com/...`），同时兼容标准 Basic Auth 格式（`https://<user>:<token>@gitea.com/...`）。
  - **GitHub / Bitbucket**：全面自适应支持 PAT 与 App Password。
- **UI 引导与智能识别**：新建项目向导与项目详情面板根据输入的 Git 仓库地址自动检测平台类型，动态呈现平台鉴权提示文案与智能占位符引导。
- **全链路敏感凭据脱敏与 Remote 自动对齐**：
  - 在部署终端执行日志中，通过 `maskGitUrl` 实时脱敏包含 Token 的 URL，防止敏感凭据泄漏到构建日志中。
  - 工作区若已有 `.git` 目录，在后续拉取代码或回滚历史 Commit 时自动执行 `git remote set-url origin` 更新最新凭据，避免凭据更新后因本地 remote 缓存导致拉取失败。

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

  // 3. (可选) Docker 构建参数声明 —— 对应 Dockerfile 中的 ARG 指令
  // 声明后，前端向导与项目详情将自动显示参数填写表单，
  // 流水线引擎在 docker build 时自动注入 --build-arg KEY=VALUE
  // readonly dockerBuildArgs: DockerBuildArgDefinition[] = [
  //   { key: 'RUST_VERSION', defaultValue: '1.78', description: 'Rust 编译器版本' },
  // ]
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

## 🚢 可插拔部署载体架构与策略模式 (Carrier Architecture)

平台不仅对**语言技术栈 (Runtime)** 进行了策略模式解耦，还将**部署交付载体 (Carrier)** 进行了彻底正交抽象（目前内置 `docker` 容器与 `native` 宿主机进程，为将来扩展 `docker_compose` 预留标准接口）：

### 核心设计原则：
1. **彻底消除载体耦合**：
   - 语言插件（`IRuntimePlugin`）专注技术栈本身（编译命令、`getNativeStartCommand` 原生启动命令、Dockerfile 模板等），**代码中彻底杜绝任何 `if (mode === 'docker')` 或 `if (mode === 'native')`**。
   - 载体策略（`ICarrierCommandStrategy`）负责载体专属的命令装配（如 `docker build` / `docker run`、PM2 启动）与前置依赖检测。
2. **多态驱动与安全更新**：
   - 用户在向导或详情中手动修改 `startCommand`（如增加 `--restart=always`、`-m 512m` 或 PM2 参数）后，调整服务端口或环境变量时，载体策略执行智能就地更新或保持原样，杜绝配置被粗暴覆盖。
3. **扩展新载体（如 Docker Compose）仅需两步**：
   - 实现 `BaseCarrier` 并注册至 `CarrierRegistry` 与 `CarrierCommandRegistry`。
   - 全局流水线调度器与前端向导全自动识别适配，无需改动任何核心流转与语言插件代码！

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
solodeck/
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
│   ├── carriers/                     # 🌟 可插拔流水线交付载体体系 (Carrier Architecture)
│   │   ├── types.ts                  # IPipelineCarrier 核心接口与上下文定义
│   │   ├── base.ts                   # BaseCarrier 基类骨架
│   │   ├── registry.ts               # CarrierRegistry 载体注册中心
│   │   ├── docker.ts                 # DockerCarrier 驱动 (镜像构建、分发与容错重试)
│   │   ├── native.ts                 # NativeCarrier 驱动 (tar归档、SFTP与守护进程)
│   │   └── index.ts                  # 统一载体导出与扩展指引
│   ├── runtimes/                     # 🌟 可插拔多语言运行时体系
│   │   ├── types.ts                  # IRuntimePlugin 接口定义
│   │   ├── base.ts                   # BaseRuntimePlugin 基类实现
│   │   ├── registry.ts               # RuntimeRegistry 注册中心单例
│   │   ├── plugins/                  # 内置各语言运行时插件 (nodejs, python, java, go...)
│   │   └── index.ts                  # 统一导出与自动注册
│   ├── types.ts                      # 全局核心 TypeScript 接口定义
│   ├── prisma.ts                     # Prisma Client 客户端单例 (@prisma/adapter-better-sqlite3)
│   ├── prisma-client/                # 自动生成的 Prisma Client 类型代码
│   ├── db.ts                         # Prisma 7.10.1 数据访问层与自动迁移引擎
│   ├── pipeline-runner.ts            # 流水线全局调度引擎 (状态机、SSE推流与载体驱动派发)
│   ├── docker-distributor.ts         # Docker 镜像打包分发策略 (save_load / registry)
│   ├── dockerfile-templates.ts       # Dockerfile 模板代理层 (适配旧接口)
│   ├── health-checker.ts             # 自动化容器心跳健康检查器
│   ├── shell-env.ts                  # SSH 远程命令环境载入包裹器
│   ├── env-presets.ts                # 各语言环境变量模板预设
│   ├── time-utils.ts                 # 时间格式化工具
│   └── utils.ts                      # 通用工具函数 (cn)
├── prisma/
│   └── schema.prisma                 # Prisma 数据模型定义规范
├── prisma.config.ts                  # Prisma 7 数据库连接与驱动配置文件
├── data/
│   ├── solodeck.db                   # SQLite 本地生产数据库
│   └── db.json                       # (历史) 遗留数据文件，启动时自动无缝导入迁移
├── README.md                         # 本文档（产品与使用指南）
└── AGENTS.md                         # AI 助手协作开发规范与规则
```

---

## 🔒 安全性与最佳实践

1. **凭据脱敏**：SSH 密码、私钥、Git Token 及敏感环境变量在前端展示与接口传输中均做掩码脱敏处理。
2. **容器沙箱化**：各项目独立容器运行，端口按需映射，防止应用间端口冲突或文件系统交叉越权。
3. **SQLite 本地持久化**：采用 Prisma 7.10.1 结合 SQLite 本地单文件存储与事务保护，具备优异并发性能与数据自愈迁移机制。

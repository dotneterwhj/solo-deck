# AGENTS.md

本文件为 AI 编程助手在本项目中协作开发时的指引与规范文档。请在阅读并理解本文档后开展开发、重构或调试工作。

---

## ⚠️ 必守规则与约束 (Mandatory Rules)

> [!IMPORTANT]
> **每次有功能新增或变更时，必须同步更新 `AGENTS.md` 与 `README.md`。**
> - 包括但不限于：新增页面/API 路由、新增支持的运行环境/构建模式、修改持久化数据结构、配置项变更等。
> - 更新内容需保持文档结构清晰，与已有功能描述风格保持一致。

---

## 📖 项目概述

本项目是一个**轻量级自研 CI/CD 自动化发布与运维平台**，面向中小型团队或个人服务器，提供开箱即用、零外部重度依赖、纯 Docker 容器化交付的自动化交付体验。

### 核心功能与架构特性：
1. **多载体部署架构（Docker 容器化交付 + 多语言原生宿主机进程部署）**：
   - 架构上将**语言运行时（Runtime）**与**部署载体模式（DeployTargetMode: docker | native）**彻底解耦正交设计。
   - **Docker 容器交付模式**：通过容器标准多阶段构建与交付，隔离环境与版本冲突，目标节点仅需 Docker；启动命令统一默认配置 `--restart unless-stopped` 守护策略，保障容器异常退出或宿主机重启后自动恢复。
   - **多语言动态原生宿主机进程交付模式**：
     - 在新建项目流水线向导与项目详情配置中，可自由选择“容器部署 (Docker)”或“原生部署 (宿主机进程)”。
     - 原生模式下**彻底杜绝硬编码 Node.js**，自适应联动所有语言运行时对应的命令规范与进程管理：
       - **Node.js**：`npm install` ➔ `npm run build` ➔ PM2 进程守护 (`pm2 reload <slug> || pm2 start npm --name "<slug>" -- start`)，依赖 `node, pm2`。
       - **Python**：`pip install -r requirements.txt` ➔ `python -m compileall .` ➔ Gunicorn 多进程守护 (`gunicorn -w 4 -b 0.0.0.0:<port> main:app --daemon`)，依赖 `python3, gunicorn`。
       - **Go**：`go mod download` ➔ `go build -o server .` ➔ 原生独立二进制运行 (`PORT=<port> ./server`)，依赖 `go`。
       - **Java**：`mvn dependency:resolve` ➔ `mvn clean package -DskipTests` ➔ JRE / Spring Boot 进程 (`java -Dserver.port=<port> -jar target/*.jar`)，依赖 `java`。
       - **ASP.NET Core**：`dotnet restore` ➔ `dotnet publish -c Release -o ./publish` ➔ .NET CLR 进程 (`ASPNETCORE_URLS=http://0.0.0.0:<port> dotnet ./publish/<slug>.dll`)，依赖 `dotnet`。
       - **Static Web**：`npm install` ➔ `npm run build` ➔ Nginx 静态文件托管与路由重载，依赖 `nginx`。
     - 切换运行时或载体模式时，前端按钮徽标、环境依赖提示、构建/启动命令、前置探针与 Step 5 确认信息均动态联动。
     - 产物分发通道自动采用本地 `tar.gz` 归档 ➔ SFTP 安全上传 ➔ 目标机解压 ➔ 注入环境变量并拉起对应语言守护进程。
     - 目标节点环境检测矩阵全面支持 `docker, node, pm2, python3, gunicorn, dotnet, go, java, nginx, git` 的自动化检测与一键远程安装。
2. **可插拔多语言运行时架构 (`lib/runtimes/`)**：
   - 抽象 `IRuntimePlugin` 接口与 `BaseRuntimePlugin` 基类，单例注册中心 `RuntimeRegistry`。
   - 内置语言运行时：Node.js、Python、ASP.NET Core、Go、Java、Static Web（Docker 不作为语言运行时，而是底层部署载体）。
   - 每个运行时插件自完备封装了：
     - 原生目标机部署配置：`defaultNativeInstallCmd`, `defaultNativeBuildCmd`, `defaultNativeStartCmd`, `requiredNativeTools`, `nativeProcessManager`, `nativeRequirementDesc`
     - 容器化部署配置：`dockerfileTemplate`, `dockerignoreTemplate`, `baseImage`, `requiredDockerTools`（其中 Node.js 采用 Next.js Standalone 极致瘦身模板，将生产镜像由 800MB+ 压减至 ~100MB，支持一键切换传统 Express/NestJS）
     - Docker 构建参数声明（可选）：`dockerBuildArgs`（`DockerBuildArgDefinition[]`），运行时可声明 Dockerfile 中的 `ARG` 参数定义（如 ASP.NET Core 的 `PROJECT` .csproj 路径与 `DOTNET_VERSION` SDK 版本号），用户在创建流水线向导或项目详情中填写参数值，流水线引擎自动在 `docker build` 时注入 `--build-arg KEY=VALUE`
   - 极简可扩展：增加新语言运行时仅需编写单个独立插件类并注册，前端向导、详情配置、环境变量预设、Dockerfile 指南及流水线自动适配生效。
3. **分发模式**：
   - **Docker 容器分发**：
     - `save_load`：无外部镜像仓库依赖，本地 `docker save` -> gzip 压缩 -> SFTP 传输 -> 目标机 `docker load` 部署。
     - `registry`：标准 Docker Registry (Harbor / ACR / Docker Hub) 推拉交付。
   - **Native 原生产物分发**：本地工作区代码/产物打包为 `tar.gz`（排除 `.git`） ➔ SFTP 直传目标节点临时目录 ➔ 目标机解压覆盖至 `deployPath` ➔ 原生命令重载/启动。
4. **流水线双运行模式**：
   - **真实系统模式 (Real)**：本地 Shell 派发 Git 克隆、编译构建与产物分发，并通过 SSH 控制目标服务器容器或原生进程生命周期。
   - **沙箱安全模拟模式 (Simulation)**：用于无服务器节点或开发阶段的快速预览与全流程演示（完整支持容器与原生两种模拟流转）。
5. **实时日志流 (SSE) 与高精度部署终端**：基于 Server-Sent Events (SSE) 协议推流，支持终端高亮、取消任务与一键导出 `.log`。部署控制台头部采用清晰的层次化双层布局与统一度量衡（消除文字基线错位与标签抖动），耗时采用基于服务端真实 `startTime` 时间戳与服务端记录的绝对对齐计算，杜绝前端定时器漂移、页面重载或历史查看计时失准。
6. **部署二次确认与前置环境检测**：点击【立即部署】统一弹出规范的二次确认弹窗（核对项目名称、运行时、分支、载体模式、目标节点与部署路径）；确认后自动串联目标服务器环境依赖探针检测（Docker 模式检测 Docker，原生模式根据运行时检测对应工具链）与一键安装。
7. **存储空间与构建产物自动清理调度 (Storage & Docker Prune)**：
   - 支持对本地构建产物归档目录 `.cicd_artifacts` 进行生命周期管理与定时自动淘汰（按保留天数与单项目最大版本保留数量，强制保留至少 1 份最新有效版本确保随时可一键秒级回滚）。
   - 支持本地 Docker 镜像与构建缓存定时清理（`docker image prune`，支持仅悬空镜像 `<none>` 或深度清理指定时间未被使用的历史镜像）。
   - 在【全局系统设置】中提供归档容量实时统计度量、详细清理反馈与一键即时手动清理能力。
8. **项目一键克隆与多节点快速分发 (Project Cloning)**：
   - 支持将已有项目配置快速克隆为全新流水线，完整继承代码仓库、分支、凭据、编译构建/启动指令、环境变量预设与 Docker 交付策略。
   - 提供可视化克隆弹窗 (`components/projects/clone-project-modal.tsx`) 与专属 API (`app/api/projects/[id]/clone/route.ts`)，支持一键切换目标主机、智能规避同机同端口冲突，并自动适配健康检查探针端口。
   - 在大盘概览卡片、项目列表卡片与项目详情弹窗中统一提供克隆入口。
9. **全局系统通知中心与多维事件驱动 (System Notifications)**：
   - 在平台右上角集成交互式通知中心 (`components/notifications/notification-popover.tsx`)，配合专属 API (`app/api/notifications/` 与 `[id]`)。
   - 全面感知并触达全生命周期关键事件：
     - **部署生命周期**：部署成功、构建执行失败、手动取消任务（附带项目、分支、提交与耗时，点击直达部署终端日志）。
     - **心跳探针变迁**：服务健康状态降级（Healthy ➔ Unhealthy 响应异常或探测超时）与自愈恢复提醒，秒级定位故障服务。
     - **主机节点动态**：服务器新增接入、配置变更、节点移除，以及 SSH 连通性测试失联告警与恢复上线。
     - **交付物与镜像清理**：定时巡检清理与手动空间回收即时通知，清晰告知清理文件/镜像数量与释放的磁盘空间。
     - **项目克隆**：流水线复制完成即时反馈。
   - 提供未读小红点与数字徽标、分类标签筛选（全部/未读/部署/心跳/主机/清理）、单条标记已读与全域联动跳转、一键全部已读、单条删除与一键清空。
   - 持久化层实现最大 200 条滚动容量保护，自动淘汰超期历史通知，杜绝数据膨胀。
10. **零外部依赖原子持久化存储与智能路径解析**：
   - 基于 `data/db.json` 的原子持久化存储引擎，内置初始种子数据。
   - 路径解析统一使用 `resolvePath`（基于 `os.homedir()` 展开 `~` 用户主目录并转为绝对路径），避免 Node.js `fs.existsSync` 因不支持波浪号扩展导致误判。
11. **按目标主机归类与生产环境醒目标记 (Host-Grouped Project Management & Production Badging)**：
   - 彻底优化项目列表页面视觉层次，移除头部冗余杂乱的下拉筛选器（运行环境、目标主机、分类标签、心跳状态等多重下拉），收拢为“全局快速搜索 + 紧凑状态切换分段器 + 一键探测/巡检监控”的轻量化顶栏。
   - 架构层面按目标主机（Target Host）自动归类并聚合项目流水线，各主机具备专属卡片面板、折叠/展开、在线状态以及项目汇总指标。
   - 针对生产环境（包含“生产”、“prod”、“production”等标签）的主机与服务实施高优先级醒目标识：采用专属渐变边框、发光警示盾牌/火焰徽标与 `PROD` 标识，并在列表排序中自动置顶生产环境节点，有效防止误操作，提升生产运维敏捷度与安全性。
12. **主机节点与内部项目拖拽排序 (Host & Project Drag-and-Drop Reordering)**：
   - **主机节点拖拽排序**：每个主机卡片左侧提供专属抓手（Grip），按住即可上下拖拽自如调整主机卡片在列表中的展示先后次序，排序自动持久化至本地与服务端（`PUT /api/servers/reorder`）。
   - **内部项目拖拽排序与跨机迁移**：项目卡片序号左侧同样提供专属把手，既支持在同主机内自由调整流水线排列顺序，亦支持直接将项目拖动至其他主机面板中，系统自动联动变更目标主机配置并完成全量排序持久化（`PUT /api/projects/reorder`）。
   - **高辨识度拖拽微交互**：拖拽中自动呈现半透明虚线轮廓与缩放态，悬停目标区呈现醒目蓝色高亮边框指示，拖拽手势丝滑自然。
13. **多套背景主题与动态 Design Tokens 架构 (Multi-Theme System & Zero-Component Styling)**：
   - **样式与组件彻底解耦**：杜绝直接修改组件代码来调整样式，全域统一基于 CSS 语义变量（`--background`, `--card`, `--border`, `--muted`, `--foreground`, `--primary` 等）配合 Tailwind CSS v4 `@theme inline` 映射。修改或新增主题只需在 `app/globals.css` 中扩展 CSS Token 作用域。
   - **精选 6 套现代化主题体系**：
     - **钛金工矿 (Titanium Amber)**：默认主题，工业拉丝金属灰与航天安全琥珀金，高辨识度工控硬核质感。
     - **极客暗黑 (Dark Geek)**：纯粹黑曜石暗黑，极低疲劳沉浸式黑曜代码风。
     - **星际极夜蓝 (Midnight Navy)**：深邃深海星际蓝，整屏蔚蓝冷空与青蓝科技点缀。
     - **极光秘境 (Aurora Emerald)**：暗夜冷萃翡翠绿，深翠暗林与北欧极光微光。
     - **赛博深霓 (Cyberpunk Purple)**：霓虹冷紫与暗夜黑，前卫赛博朋克与高饱和品红。
     - **纯净白昼 (Pure Light)**：清爽通透的高对比白昼模式。
   - **防闪烁与本地记忆**：在 `app/layout.tsx` 中嵌入同步内联脚本，在 DOM 渲染首帧前瞬时恢复 `localStorage` 中的 `data-theme` 属性与 `dark`/`light` 类名，杜绝页面刷新闪烁 (FOUC)。
   - **全域便捷交互**：在顶部导航栏右上角提供交互式调色板气泡 (`components/theme/theme-switcher.tsx`)，并在【全局系统设置】中提供全景主题展示与切换卡片。
14. **多平台 Git 鉴权自适应与安全脱敏 (`lib/git-utils.ts`)**：
   - **深入抹平 Git 托管平台 HTTP Basic Auth 差异**：
     - **GitLab**：Personal / Project Access Token 严格校验账号，用户仅填 Token 且账号留空时，系统自动识别并缺省适配账号为 `oauth2`（生成 `https://oauth2:<token>@gitlab.com/...`），彻底解决因密码为空导致 `401 Unauthorized` 的鉴权失败问题。
     - **Gitea**：宽容模式支持将 Token 直接作为账号认证（`https://<token>@gitea.com/...`），同时兼容标准 Basic Auth 格式（`https://<user>:<token>@gitea.com/...`）。
     - **GitHub / Bitbucket**：全面自适应支持 PAT 与 App Password。
   - **向导与详情全景联动与平台识别**：在新建项目向导（Step 2）与项目详情配置面板中，动态根据仓库 URL 识别平台类型并呈现专属提示徽标与占位引导。
   - **日志安全脱敏与 Remote URL 智能同步**：`maskGitUrl` 在子进程执行输出日志中对敏感 Token 自动掩码（`https://***@host/...`），且在工作区已存在 `.git` 目录下拉取/拉取历史版本时自动同步执行 `git remote set-url origin`，防止凭据轮转后使用陈旧凭据。

---

## 🛠️ 技术栈与依赖

- **框架**：Next.js 16 (App Router + Turbopack)
- **UI & 渲染**：React 19、Tailwind CSS v4、shadcn/ui 设计体系、Lucide React 图标
- **语言**：TypeScript 5.7 (严格模式)
- **系统与通信**：`ssh2` (SSH/SFTP 客户端)、Node.js `child_process`、Server-Sent Events (SSE)
- **包管理**：npm / pnpm (Node.js >= 18.18，推荐 Node.js 20 或 24)

---

## 💻 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` / `pnpm dev` | 启动本地 Next.js 开发服务器 (`http://localhost:3000`) |
| `npm run build` / `pnpm build` | 执行 Turbopack 生产编译构建 |
| `npm run start` / `pnpm start` | 启动编译后的生产服务器 |
| `npx tsc --noEmit` | 纯 TypeScript 类型检查（建议提交修改前必须通过） |

---

## 📁 项目目录结构与模块说明

```
solodeck/
├── app/                              # Next.js App Router 目录
│   ├── api/                          # 后端 API 路由 (RESTful + SSE)
│   │   ├── auth/                     # 登录鉴权 (login, logout, me)
│   │   ├── deployments/              # 部署触发、详情、回滚、取消与 /stream (SSE)
│   │   ├── notifications/            # 系统通知列表、单条及批量标记已读与清空 (/[id])
│   │   ├── projects/                 # 项目增删改查、克隆([id]/clone)及健康探针
│   │   ├── servers/                  # 主机节点增删改查、SSH 连通测试、环境检测与远程安装
│   │   ├── settings/                 # 全局系统设置与清理 (/cleanup)
│   │   ├── stats/                    # 仪表盘统计数据
│   │   └── webhooks/                 # Git Webhook 触发入口
│   ├── login/                        # 登录鉴权页面
│   ├── globals.css                   # 全局样式与 Tailwind CSS v4 配置
│   ├── layout.tsx                    # 根布局
│   └── page.tsx                      # 控制台页面调度入口
├── components/                       # 前端 React 组件（按业务域模块化分类）
│   ├── layout/                       # 框架与导航布局 (dashboard, sidebar)
│   ├── dashboard/                    # 大盘与概览视图 (dashboard-overview)
│   ├── projects/                     # 项目流水线 (project-list, project-detail-modal, new-project-wizard, clone-project-modal)
│   ├── deployments/                  # 构建部署与终端 (deploy-modal, confirm-deploy-dialog, preflight-env-dialog)
│   ├── notifications/                # 系统通知与右上角浮层 (notification-popover)
│   ├── servers/                      # 服务器与节点 (server-management, server-env-modal)
│   ├── settings/                     # 全局系统设置 (system-settings)
│   ├── theme/                        # 主题切换器组件 (theme-switcher)
│   ├── guides/                       # 指引与帮助 (dockerfile-guide-modal, help-modal)
│   ├── ui/                           # 通用基础 UI 组件 (button, input 等)
│   └── index.ts                      # 统一对外导出 Barrel
├── lib/                              # 核心业务逻辑与服务端工具
│   ├── theme/                        # 🌟 全局动态主题系统 (Context、Provider 与主题配置注册)
│   ├── runtimes/                     # 🌟 可插拔多语言运行时体系
│   │   ├── types.ts                  # IRuntimePlugin 核心接口规范
│   │   ├── base.ts                   # BaseRuntimePlugin 基类 (命令生成与命名工具)
│   │   ├── registry.ts               # RuntimeRegistry 插件单例注册中心
│   │   ├── plugins/                  # 各运行时插件实现 (nodejs, python, java, go 等)
│   │   └── index.ts                  # 统一插件加载、导出与便捷 helper
│   ├── carriers/                     # 🌟 可插拔部署载体架构 (Carrier Architecture)
│   │   ├── types.ts                  # IPipelineCarrier 核心接口与上下文规范
│   │   ├── base.ts                   # BaseCarrier 基类 (通用方法与骨架)
│   │   ├── registry.ts               # CarrierRegistry 载体单例注册中心
│   │   ├── docker.ts                 # DockerCarrier 驱动 (容器化交付、版本打标、镜像分发)
│   │   ├── native.ts                 # NativeCarrier 驱动 (原生宿主机交付、tar归档、SFTP与守护进程)
│   │   └── index.ts                  # 统一载体导出与扩展指引
│   ├── auth.ts                       # 系统登录鉴权与会话管理 (基于 config/auth.json)
│   ├── types.ts                      # 全局核心 TypeScript 接口定义
│   ├── db.ts                         # 原子持久化存储引擎 (db.json 读写操作)
│   ├── pipeline-runner.ts            # 流水线全局调度引擎 (状态机、SSE推流与载体驱动委派)
│   ├── docker-distributor.ts         # Docker 镜像打包分发策略 (save_load / registry)
│   ├── dockerfile-templates.ts       # Dockerfile 模板代理层 (适配旧接口兼容)
│   ├── health-checker.ts             # 自动化容器心跳健康检查器
│   ├── cleanup-service.ts            # 构建产物归档与 Docker 镜像生命周期定期清理调度器
│   ├── shell-env.ts                  # SSH 远程命令环境加载与包裹包装
│   ├── env-presets.ts                # 各语言环境变量模板预设代理
│   ├── time-utils.ts                 # 时间格式化工具
│   ├── validators.ts                 # 项目命名规范与通用数据校验器
│   └── utils.ts                      # 通用工具函数 (如 cn())
├── config/
│   └── auth.json                     # 🔐 系统登录账号密码及鉴权配置文件
├── data/
│   └── db.json                       # 平台持久化数据库文件
├── README.md                         # 面向用户的产品说明文档
└── AGENTS.md                         # 本文档（AI 助手协作开发规范）
```

---

## 🧩 核心开发规范与设计约定

### 1. 数据持久化规范 (`lib/db.ts`)
- 所有对数据的读取与修改**必须**通过 `lib/db.ts` 暴露的方法执行，**严禁直接使用 `fs.writeFileSync` 裸写 `data/db.json`**。
- `lib/db.ts` 内部实现了内存缓存 (`cachedDb`) 与临时文件重命名 (`tempFile -> renameSync`) 的原子写入机制，可防止高并发写入下的文件损坏。
- 新增实体字段时，需同时更新 `lib/types.ts` 和 `lib/db.ts` 中的默认初始化值，保证数据结构的向后兼容性。

### 2. 多语言运行时可插拔扩展规范 (`lib/runtimes/`)
- **原则**：禁止在 UI 组件（如 `new-project-wizard.tsx`、`project-list.tsx` 等）中硬编码运行时选项数组。所有运行时列表必须通过 `getAllRuntimes()` 动态获取。
- **彻底正交设计与双层策略模式 (Strategy Pattern)**：
  - **语言运行时 (`IRuntimePlugin`)**：只负责该语言技术栈的特征定义（如编译构建、`getNativeStartCommand` 原生启动、目标机原生工具链、Dockerfile 模板与环境变量），**彻底杜绝任何 `if (mode === 'docker')` 或 `if (mode === 'native')` 等强耦合载体判断**。
  - **交付载体策略 (`ICarrierCommandStrategy` / `lib/carriers/command-strategy.ts`)**：纯同构策略层，负责不同交付模式（Docker、Native、Docker Compose）下的命令组装（`getInstallCommand`、`getBuildCommand`、`getStartCommand`）、依赖工具推导（`getRequiredTools`）以及端口/环境变量变动时的安全局部清洗与参数保留更新（`updateStartCommandOnPortChange`、`updateStartCommandOnEnvChange`）。
  - UI 向导、详情配置弹窗与服务端运行时统一通过 `getCarrierCommandStrategy(mode)` 获取载体策略并调用多态方法，彻底消除载体模式与语言运行时的硬编码耦合。
- **新增语言运行时开发指引**：
  1. 在 `lib/runtimes/plugins/` 下新建 `<language>.ts` 文件。
  2. 继承 `BaseRuntimePlugin` 并实现抽象属性与方法：
     - `id`: 唯一标识符（如 `rust`）
     - `name`: 显示名称（如 `Rust`）
     - `category`: 分类标签（如 `Rust`）
     - `defaultPort`: 默认监听端口
     - `description`: 运行时简述
     - `baseImage`: 基础镜像名称（如 `alpine:3.19`）
     - 原生部署配置：
       - `defaultNativeInstallCmd`: 原生依赖安装（如 `cargo fetch`）
       - `defaultNativeBuildCmd`: 原生编译构建（如 `cargo build --release`）
       - `defaultNativeStartCmd`: 原生运行启动（如 `./target/release/server`）
       - `getNativeStartCommand(projectName, port)`（可选覆写）：根据项目名称与端口动态生成原生进程命令
       - `requiredNativeTools`: 目标主机工具依赖检测（如 `['cargo', 'rustc']`）
     - 容器化构建配置：
       - `dockerfileTemplate`: 标准多阶段构建 Dockerfile 模板
       - `dockerignoreTemplate`: `.dockerignore` 模板
       - `dockerBuildArgs`（可选）: Docker 构建参数定义列表（`DockerBuildArgDefinition[]`），对应 Dockerfile 中的 ARG 指令；声明后前端向导与项目详情自动呈现参数填写表单，流水线引擎在 `docker build` 时自动注入 `--build-arg`。示例参考 ASP.NET Core 插件的 `PROJECT` 与 `DOTNET_VERSION` 参数。
     - `sampleEnvVars`: 默认环境变量预设列表
  3. 在 `lib/runtimes/index.ts` 中实例化并调用 `registerRuntime(new YourRuntimePlugin())`。
  4. 此时所有前端向导、过滤筛选、构建指令生成及 Dockerfile 引导库将**全自动适配**，无需改动任何业务或页面代码。

### 3. 可插拔部署载体抽象架构与流水线调度 (`lib/carriers/`, `lib/pipeline-runner.ts`)
- **架构解耦原则**：将流水线全局生命周期管理（状态流转、取消、通知、Git拉取、通用依赖安装）与底层部署交付模式（Docker、Native、Docker Compose）彻底解耦，抽象为统一的 `IPipelineCarrier` 接口与 `CarrierRegistry` 注册中心。
- **调度引擎职责 (`lib/pipeline-runner.ts`)**：
  - `PipelineManager` 仅作为统一调度器 (Orchestrator)，专注于通用流程编排、状态机控制 (`pending -> running -> success / failed / cancelled`)、实时 SSE 推流 (`emit`) 与任务取消 (`cancel`)。
  - 根据项目配置的 `deployTargetMode`，通过 `getCarrier(project.deployTargetMode)` 动态派发至对应的载体驱动执行。
- **载体驱动生命周期规范 (`lib/carriers/`)**：
  - `onAfterCheckout(ctx)`: 检出后版本标签生成、元数据绑定与初始化提示。
  - `executeBuild(ctx)`: 应用编译构建（Docker 模式执行 Dockerfile 校验、双标签注入与 `--build-arg` 参数合并；Native 模式注入环境变量并执行原生编译）。
  - `deployLocal(ctx)`: 本机节点启动调度（Docker 模式清理同名容器并拉起；Native 模式写入目标 `.env` 并拉起本地进程）。
  - `deployRemote(ctx)`: 远程主机服务部署（Docker 模式结合 `DockerDistributorFactory` 进行 Save/Load 或 Registry 分发并远程运行；Native 模式打包 `tar.gz` 经由 SFTP 传输、解压并拉起远程进程）。
  - `simulate*(ctx)`: 沙箱模拟模式下的各阶段流转钩子。
- **内置载体实现**：
  - `DockerCarrier` (`mode: 'docker'`)：多阶段镜像构建 ➔ `save_load` (SFTP直传) 或 `registry` (镜像仓库) ➔ 远程 `docker run` 拉起容器，支持容器名冲突自动清理与容错重试。
  - `NativeCarrier` (`mode: 'native'`)：本地应用构建 ➔ 系统 `tar.gz` 打包 ➔ SFTP 安全上传 ➔ 远程解压至目标目录 ➔ 写入 `.env` 并派发启动命令（如 PM2/Gunicorn）。
- **未来扩展 Docker Compose 指引**：
  1. 新增 `lib/carriers/docker-compose.ts`（或 `compose.ts`），继承 `BaseCarrier` 并实现 `IPipelineCarrier`：
     - `mode = 'docker_compose'`
     - `executeBuild`: 执行 `docker compose build` 或配置预检
     - `deployLocal` / `deployRemote`: 准备并分发 `docker-compose.yml` 及 `.env`，派发 `docker compose up -d` 命令
     - `simulate*`: 输出对应的多容器编排模拟日志
  2. 在注册中心调用 `registerCarrier(new DockerComposeCarrier())`。
  3. `pipeline-runner` 流水线调度引擎**无需修改任何代码**即可无缝支持 Docker Compose 多容器交付！

### 4. 服务端与客户端边界 (Server vs. Client)
- **Node.js 原生模块限制**：`fs`、`child_process`、`ssh2` 等模块仅允许在 `app/api/` 路由或 `lib/` 服务端工具中使用。
- **客户端组件标记**：包含用户交互、React State、Effect 或浏览器 API（如 `EventSource`、`navigator`）的组件，顶部必须声明 `'use client'`。
- **Next.js 16 路由参数规范**：Next.js 16 中，Route Handlers 和页面中的 `params` 为 Promise，获取动态参数需使用 `await params`。

### 5. 目标服务器与安全规范
- **主机节点全生命周期管理**：支持服务器节点的增、删、改（编辑）、查与测试。在 `components/servers/server-management.tsx` 中提供了统一的创建与编辑弹窗，支持动态修改主机名称、IP/域名、SSH 端口、认证方式（密码/私钥）、标签及备注；在编辑模式下，留空密码或私钥输入框将自动保留原有凭据不作覆盖。
- **凭据保护与防覆盖机制**：所有向前端返回 Server 节点的 API 路由（`GET/POST /api/servers`, `GET/PUT /api/servers/[id]`, `POST /api/servers/[id]/test`）统一通过 `maskServerCredentials` 进行凭据脱敏（`password`、`privateKey`、`passphrase` 脱敏返回 `******`，同时携带 `hasPassword`、`hasPrivateKey` 布尔状态元数据）；`updateServer` 内部已实现防覆盖保护（自动过滤 `******` 掩码与 `undefined`），防止前端回传时损坏真实凭据。
- **SSH 连通性与执行**：远程命令需使用 `wrapSshCommand` 包裹，确保载入目标系统的完整 PATH（如 `/etc/profile`、`~/.bashrc`），避免找不到 `docker` 等命令。

### 6. 系统登录鉴权与配置规范 (`config/auth.json`, `lib/auth.ts`, `app/login/`)
- **配置文件管理**：系统账号密码由根目录下的 `config/auth.json` 集中管理（默认 `admin` / `admin123`），并在服务启动或文件不存在时自动初始化创建。
- **免重启热生效**：登录校验在请求时动态读取 `config/auth.json`，修改账号或密码后无需重启服务即时生效；同时支持环境变量覆盖（`AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_ENABLED`）。
- **安全防篡改会话**：基于 HMAC-SHA256 签名生成安全的 `solodeck_session` 会话 Cookie（`HttpOnly`, `SameSite: Lax`），使用常量时间比对（`timingSafeEqual`）防范时序侧信道攻击。
- **自动化免阻断**：外部 Git Webhook 推送接口（`/api/webhooks/[projectId]`）与健康检查探针不受前端会话拦截，确保自动化流水线顺畅执行。

### 7. 系统通知与多维事件驱动规范 (`lib/db.ts`, `app/api/notifications/`, `components/notifications/`)
- **数据结构与字段规范**：系统通知统一使用 `SystemNotification` 接口定义，包含 `id, type, level, title, message, read, createdAt, metadata`；类型 `type` 包含 `deployment | health_check | server | cleanup | project | system`，级别 `level` 包含 `info | success | warning | error`。
- **存储与滚动修剪**：所有通知统一通过 `lib/db.ts` 的 `createNotification` 创建，内置内存与原子写入；为保障持久化性能，默认实施容量保护（最大保留 200 条，超出自动淘汰最旧的历史数据）。
- **事件全生命周期埋点覆盖**：
  - 流水线引擎 (`lib/pipeline-runner.ts`)：在部署成功、异常失败、手动取消时派发对应通知。
  - 心跳健康探针 (`lib/health-checker.ts`)：在服务探测状态由 Healthy 转为 Unhealthy（告警）或自愈恢复正常（恢复）时派发通知。
  - 主机生命周期 (`app/api/servers/`)：在服务器新增、更新、删除及网络连通性异常失联或上线时派发通知。
  - 产物与镜像清理 (`lib/cleanup-service.ts`)：在定时任务与手动触发执行后，派发包含清理文件数与释放空间的通知。
  - 项目流水线克隆 (`app/api/projects/[id]/clone/route.ts`)：在克隆成功时派发通知。
- **交互与终端全域联动**：前端 Popover 浮层支持未读徽标计数、分类过滤 Tab、单条点击标记已读并精准跳转对应部署终端或功能视图、一键全部已读与一键清空。

### 8. 编码风格与质量检查
- 严格遵循 TypeScript 类型约束，避免滥用 `any`。
- 样式推荐使用 Tailwind CSS 原子类，动态拼接类名统一使用 `cn()`。
- 完成功能修改或修复后，务必运行 `npx tsc --noEmit` 进行类型验证，并检查 `npm run build` 确保没有构建破坏。
- **每次有功能新增或变更时，必须同步更新 `AGENTS.md` 与 `README.md`。**

### 9. 项目名称命名规范与校验约定 (`lib/validators.ts`)
- **命名规范准则**：
  - **允许字符**：只能包含小写英文字母 (`a-z`)、数字 (`0-9`)、短横线 (`-`) 及下划线 (`_`)。
  - **首字符约束**：**严禁以数字开头**（首字符限定为小写字母、短横线或下划线）。
  - **空格约束**：**严禁包含空格**。
  - **正则表达式规范**：`^[a-z_-][a-z0-9_-]*$`。
- **全链路双端防御机制**：
  - **服务端 (API)**：`POST /api/projects`（新建）、`PUT /api/projects/[id]`（修改）以及 `POST /api/projects/[id]/clone`（克隆）统一接入 `validateProjectName`，针对空值、包含空格、数字开头、含非法大写/特殊字符分别抛出精准可读的 HTTP 400 错误提示。
  - **客户端 (UI)**：新建项目向导（`new-project-wizard.tsx` Step 1）、项目详情编辑（`project-detail-modal.tsx` Overview Tab）以及流水线克隆弹窗（`clone-project-modal.tsx`）均集成实时格式校验、输入红框警示、错误信息说明与规范说明文案，并阻断不合规操作提交。

### 10. 环境变量全流程管理与载体自适应注入规范 (Environment Variables)
- **双载体自适应差异化注入**：
  - **Docker 容器交付模式**：
    - 使用 `formatDockerEnvArgs` 与 `updateDockerRunEnvVars`（`lib/runtimes/base.ts`）自动将环境变量数组格式化并安全注入至启动命令（`docker run -d -p <port>:<port> -e KEY="VALUE" ... --name <name> <image>`）。
    - 提供了严格的正则表达式清洗循环机制，避免重复注入或遗留旧的 `-e` / `--env` 标记，保持命令整洁。
  - **Native 原生宿主机交付模式**：
    - **系统会话注入**：在执行启动命令前，流水线通过组合环境变量链 `export KEY="VALUE" && ...` 包裹派发启动脚本，使 PM2、Gunicorn、CLR 或独立二进制可直接读取系统环境变量。
    - **应用级持久配置**：流水线通过 SFTP 或本地文件写入在目标部署路径 `${project.deployPath}/.env` 自动落盘配置内容，使标准 dotenv 框架开箱即读。
- **新建项目向导与项目详情全流程交互 (`new-project-wizard.tsx`, `project-detail-modal.tsx`)**：
  - 流程标准化扩展为 6 步：`基本信息` ➔ `Git 仓库` ➔ `运行时 & 构建` ➔ `环境变量` ➔ `目标主机` ➔ `确认配置`。
  - 支持一键从选中的技术栈插件导入推荐预设（`sampleEnvVars`），支持自定义键值对与敏感数据保密掩码（Eye/EyeOff）。
  - **环境变量与启动指令实时双向联动**：在项目详情弹窗的【环境变量】Tab 中，对变量的增、删、改或一键导入预设，均会实时自动联动更新 `startCommand`（在 Docker 模式下动态清洗并重新生成 `-e KEY="VALUE"` 注入参数），并在环境变量配置区提供启动指令与环境变量联动实时预览卡片。
  - **Step 6 确认配置页集成最终指令预览 (Command Preview)**：提供独立、高对比度终端卡片，清晰呈现最终将在流水线中实际执行的编译构建命令（`buildCommand`）与服务启动/进程拉起命令（`startCommand`），附带一键复制能力，让用户在最终提交创建前对执行指令一目了然。

### 11. 多端口与 Docker 容器端口映射规范 (Multi-Port & Port Mapping Architecture)
- **数据结构与字段类型 (`lib/types.ts`)**：
  - `Project` 实体服务监听端口统一采用 `serverPort: number[]`（宿主机外部暴露端口列表），并支持扩展配置 `containerPort?: number[]`（容器内部应用端口列表）与 `portMappings?: PortMapping[]`（`{ host: number; container: number }[]` 映射对）。
- **服务端持久化与自适应同步 (`lib/db.ts`, `app/api/projects/`)**：
  - `enrichProjectWithLatestDeployment` 自动对历史项目向下兼容补全 `containerPort` 与 `portMappings`（缺省时自动对齐 `serverPort`，生成 1:1 映射），并在读取历史旧数据中的 `port` 字段时自动转换为 `serverPort: [port]`。
  - `createProject` 与 `updateProject` 自动维护 `portMappings`、`serverPort` 与 `containerPort` 的三向同步；`POST /api/projects`、`PUT /api/projects/[id]` 与克隆 API 全面支持接收和持久化端口映射数据。
- **容器与原生自适应指令编排 (`lib/runtimes/base.ts`, `lib/pipeline-runner.ts`)**：
  - **Docker 容器模式**：
    - 支持宿主机端口与容器端口独立自定义映射（例如宿主机 `8080` ➔ 容器内部 `3000`，生成 `-p 8080:3000`）。
    - 容器内部应用监听端口（`containerPort[0]`）自动同步联动至容器内的 `PORT` 环境变量，而宿主机外部端口供反向代理与心跳探针直接访问。
    - `updateDockerRunPorts` 与 `extractPortMappingsFromCommand` 全面支持解析并替换多段 `-p host:container` 映射。
  - **Native 原生模式**：
    - 直接在宿主机监听 `serverPort`，首个主端口自动作为 `PORT` 环境变量注入系统与应用进程。
  - **部署日志与状态反馈**：部署控制台与终端高亮显示端口映射关系（如 `:8080➔:3000` 或多端口 `:8080➔:3000 :8443➔:3001`）。
- **全流程交互与界面呈现**：
  - **新建向导 (`new-project-wizard.tsx`)**：Step 4 区分载体模式呈现：Docker 模式下提供结构化端口映射配置表（支持增删映射行、独立输入宿主机端口与容器端口、实时渲染 `-p host:container` 徽标），原生模式下提供简洁的逗号分隔宿主机监听端口输入框；Step 5 确认页与探针占位智能对齐。
  - **项目详情编辑 (`project-detail-modal.tsx`)**：概览 Tab 针对 Docker 项目呈现独立的端口映射增删与实时编辑组件，针对 Native 项目提供宿主机端口输入，指令联动全部通过 `currentPlugin.getStartCommand` 驱动。
  - **流水线克隆 (`clone-project-modal.tsx`)**：完整继承并支持修改源项目的端口映射配置，同机部署智能检测宿主机端口冲突。
  - **项目卡片与确认弹窗 (`project-list.tsx`, `confirm-deploy-dialog.tsx`)**：直观展示多端口及 Docker 容器映射（如 `:8080➔:3000`）。

### 12. 启动命令自定义保护与智能增量同步规范 (Safe StartCommand Customization & Incremental Sync)
- **核心痛点与防护原则**：
  - 用户在【新建项目向导】或【项目详情】中经常需要微调 `startCommand`（如在 Docker 模式下挂载目录 `-v`、指定网络 `--network`、重启策略 `--restart always`，或在 Native 模式下指定自定义进程参数）。
  - **杜绝粗暴覆盖**：在用户手动修改 `startCommand` 后，后续调整端口或环境变量时，**严禁使用模板函数全量覆盖用户修改**。
- **双载体智能增量同步机制 (`lib/runtimes/base.ts`)**：
  - **`safeUpdateStartCommandOnPortChange`**：
    - **Docker 模式**：通过 `updateDockerRunPorts` 就地更新命令中的 `-p host:container` 端口映射，用户添加的任何其他 flags（如 `-v`, `--restart`, `--memory` 等）**100% 完整保留**。
    - **Native 模式**：若用户已自定义，智能替换命令中既有的旧端口数值；若不含端口或无需变动，则**完整保持原样，绝不重置**。
  - **`safeUpdateStartCommandOnEnvChange`**：
    - **Docker 模式**：通过 `updateDockerRunEnvVars` 就地清洗并更新 `-e KEY="VALUE"` 参数，用户的所有其他自定义 flags 均不受影响。
    - **Native 模式**：Native 模式下环境变量由流水线写入部署目录 `.env` 或 SSH export 注入，启动命令本身不承载环境变量，**在此模式下增删改环境变量完全不修改 `startCommand`**。
- **UI 呈现与用户控制 (`new-project-wizard.tsx`, `project-detail-modal.tsx`)**：
  - 界面引入 `isStartCommandCustomized` 状态感知：一旦用户在输入框手动编辑过命令，输入框上方即时亮起【已手动自定义】黄色徽标，并贴心提供【恢复默认命令】按钮（`RotateCcw`），让用户在灵活性与自动化之间收放自如。

### 13. 纯 CSS Design Tokens 主题系统与零代码侵入样式规范 (Theme System & Design Tokens)
- **核心铁律：禁止为了修改样式或适配主题而硬编码修改业务组件代码**：
  - 所有颜色样式必须统一使用语义化 Tailwind CSS 实用类（例如 `bg-background`、`bg-card`、`border-border`、`text-foreground`、`text-muted-foreground`、`bg-primary`、`text-primary`、`bg-secondary` 等）。
  - 这些类在 Tailwind CSS v4 中通过 `@theme inline` 映射至 CSS 变量：`--background`、`--card`、`--border`、`--foreground`、`--primary` 等。
  - 新增或调整主题风格时，**仅允许在 `app/globals.css` 中为 `[data-theme="<theme_id>"]` 扩展或微调 OKLCH / 颜色变量定义**，切勿在 React 组件内编写特定主题的条件分支语句（如 `if (theme === 'xxx') return ...`）。
- **主题状态管理与架构层次 (`lib/theme/`)**：
  - `lib/theme/types.ts`：声明 `ThemeId`（`dark`、`midnight`、`aurora`、`cyberpunk`、`titanium`、`light`）及 `ThemeConfig` 注册表与微缩颜色预览值。
  - `lib/theme/theme-context.tsx`：提供 `ThemeProvider` 与 `useTheme()` Hook，负责读取/写入 `localStorage('solodeck_theme')` 并动态切换 `document.documentElement` 的 `data-theme` 属性与 `dark`/`light` class。
- **根布局零闪烁机制 (`app/layout.tsx`)**：
  - 在 `<head>` 中嵌入同步执行的内联自执行脚本，在客户端初次渲染与 React 水合前即刻检测本地主题并设置 `data-theme`，配合 `<html>` 标签上的 `suppressHydrationWarning`，彻底杜绝首次加载的白屏闪烁或样式突变。
- **双入口主题交互体验**：
  - **全局顶栏快选**：`components/theme/theme-switcher.tsx`，在导航栏右侧提供带有实时调色板预览指示器与下拉气泡菜单的快捷切换器。
  - **系统设置全景**：在 `components/settings/system-settings.tsx` 中提供直观网格卡片式的主题预览与选择面板。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

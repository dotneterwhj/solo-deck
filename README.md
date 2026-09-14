# 轻量级自研 CI/CD 自动化交付平台

参考原型图设计，基于 **Next.js (App Router) + React 19 + TypeScript + Tailwind CSS** 构建的轻量级自研 CI/CD 自动化发布与运维平台。


[CI/CD 平台宿主机]                                      [目标服务器]
       │                                                     │
       ├─ 阶段 1: 本地构建 (Local Shell Runner)              │
       │   ├─ 1. 在本地目录克隆 Git 源码                       │
       │   ├─ 2. child_process 执行依赖安装 (npm/pip)         │
       │   ├─ 3. child_process 执行编译 (npm run build)       │
       │   └─ 4. 将输出打包为产物压缩包 (tar.gz/zip)           │
       │                                                     │
       └─ 阶段 2: 远程分发与部署 (Remote SSH & SFTP)          │
           ├─ 1. 通过 ssh2 建立安全 SSH 连接 ───────────────>│ (需要: IP + 端口 + 用户名 + 密码/私钥)
           ├─ 2. 通过 SFTP 管道上传产物包 ──────────────────>│ 上传到 /opt/apps/my-app/
           ├─ 3. SSH 远程执行启动脚本 ──────────────────────>│ 执行: tar -xvf && pm2 reload app
           └─ 4. 发起 HTTP 健康探测探针 <────────────────────┤ 探测 :3000/health

---

## 🌟 核心功能特性

1. **项目全生命周期管理**
   - 支持多语言与运行时环境：`Node.js`、`Python`、`ASP.NET Core`、`Go`、`Java`、`Docker`。
   - 包含 Git 仓库地址、发布分支、Token 密钥管理与子目录配置。
   - 预置各语言依赖安装、编译打包与服务启动脚本模板。
   - 环境变量集中管理（支持敏感密钥掩码保护）。

2. **流水线执行引擎与实时日志流 (SSE)**
   - 采用 Server-Sent Events (SSE) 协议实时传输流水线执行日志，低延迟、无刷新流式输出。
   - 完整构建状态机：`Pending` ➔ `Cloning` ➔ `Installing` ➔ `Building` ➔ `Deploying` ➔ `Health Checking` ➔ `Success/Failed`。
   - 支持在执行过程中随时手动终止部署、复制日志文本、一键导出 `.log` 日志文件。
   - 双执行模式支持：**沙箱安全模拟模式**（开箱即用，免配节点）与 **真实系统 Shell 模式**。

3. **历史记录与一键秒级回滚**
   - 记录每一次构建部署的提交哈希、提交信息、触发方式（手动/Webhook/回滚）、耗时与完整日志归档。
   - 提供**一键回滚 (Rollback)** 功能，秒级重新部署历史成功版本。

4. **主机与集群节点管理 (支持真实 SSH 凭据与鉴权)**
   - 集中登记和管理目标服务器节点（IP、SSH 端口、用户名、分组标签）。
   - **双认证凭据支持**：支持密码认证（Password）与 SSH 私钥认证（Private Key，含可选 Passphrase）。
   - **真实 SSH 鉴权握手测试**：基于 `ssh2` 库发起真实 SSH 鉴权与端口连通性测试，毫秒级网络延迟回显。

5. **前置运行环境智能检测与双向决策 (手动命令 vs 一键自动安装)**
   - **部署前置探针拦截**：根据项目语言（Node.js / Python / .NET / Docker 等）自动在目标主机检测 `node`、`pm2`、`python3`、`docker` 等必要依赖。
   - **双路径自主选择**：
     1. **手动安装路径**：提供格式化的 Ubuntu / Debian 及 CentOS / RHEL 安装命令，一键复制后登录服务器自行执行。
     2. **一键自动安装路径**：点击即可由平台通过 SSH 会话远程下发安装脚本，在实时控制台中输出安装进度，完成后自动恢复部署。
   - **主机级环境矩阵大盘**：在主机管理中可随时对任意服务器发起全量软件环境检测（Node、PM2、pnpm、Python、Gunicorn、.NET、Docker、Git）并按需安装。

6. **Git Webhook 自动化触发**
   - 为每个项目分配独立的 Webhook 接入端点。
   - 支持 GitHub、GitLab、Gitee 等代码托管平台在开发者 `git push` 时自动触发流水线。

7. **监控大盘与系统配置**
   - 4 维监控指标卡片：项目总数、运行中服务、构建成功率、24 小时交付频次。
   - 全局工作区目录配置、构建并发上限配置。
   - 支持钉钉、飞书、企业微信群机器人告警集成。

8. **零外部依赖原子持久化存储**
   - 基于轻量级 JSON 存储引擎（位于 `data/db.json`），带原子写入保障，跨平台极简部署。
   - 内置原型初始种子数据，克隆后启动即可直接查看与操作。

---

## 🚀 快速启动

### 环境要求
- Node.js >= 18.18 (推荐 Node.js 20 或 24)
- pnpm >= 9.0

### 启动开发服务器

```bash
# 1. 在根目录安装依赖
pnpm install

# 2. 启动开发环境
pnpm dev

# 访问浏览器：http://localhost:3000
```

### 构建生产版本

```bash
pnpm build
pnpm start
```

---

## 📁 目录结构

```
cicd/
├── app/
│   ├── api/              # RESTful & SSE API 路由
│   │   ├── projects/     # 项目增删改查
│   │   ├── deployments/  # 部署触发、历史记录、SSE 实时流、取消与回滚
│   │   ├── servers/      # 服务器节点管理与真实 SSH 握手连通性测试
│   │   ├── stats/        # 大盘监控指标
│   │   ├── settings/     # 全局系统设置
│   │   └── webhooks/     # Git 仓库 Webhook 自动触发
│   ├── globals.css       # Tailwind CSS 样式
│   ├── layout.tsx        # 根布局
│   └── page.tsx          # 主调度页面
├── components/
│   ├── dashboard.tsx             # 仪表盘外层框架与顶部栏
│   ├── dashboard-overview.tsx    # 监控大盘指标卡片与动态
│   ├── project-list.tsx          # 项目列表、状态标签与搜索筛选
│   ├── project-detail-modal.tsx  # 项目详情、流水线编排、环境变量与回滚
│   ├── new-project-wizard.tsx    # 5 步新建项目向导
│   ├── deploy-modal.tsx          # 终端控制台、SSE 实时流与任务中止
│   ├── server-management.tsx     # 主机管理面板（SSH密码与私钥凭据配置）
│   ├── system-settings.tsx       # 系统设置面板
│   └── help-modal.tsx            # 平台使用指南
├── lib/
│   ├── types.ts                  # TypeScript 核心类型定义 (含 ServerAuthType)
│   ├── db.ts                     # 原子持久化数据存储引擎
│   └── pipeline-runner.ts        # 真实 Shell 派发与 SSH 远程会话执行引擎
└── data/
    └── db.json                   # 持久化数据文件
```

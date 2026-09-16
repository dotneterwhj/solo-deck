import fs from 'fs'
import path from 'path'
import {
  Project,
  Deployment,
  ServerNode,
  SystemSettings,
  DashboardStats,
  DeployLogEntry,
  SystemNotification,
  NotificationType,
  PortMapping,
} from './types'

interface DatabaseSchema {
  projects: Project[]
  deployments: Deployment[]
  servers: ServerNode[]
  settings: SystemSettings
  notifications?: SystemNotification[]
}


const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

const DEFAULT_SETTINGS: SystemSettings = {
  platformName: 'Solo Deck 平台',
  workspacePath: path.join(process.cwd(), '.cicd_workspaces'),
  artifactPath: path.join(process.cwd(), '.cicd_artifacts'),
  concurrencyLimit: 5,
  webhookNotificationUrl: '',
  webhookType: 'dingtalk',
  notifyOnSuccess: true,
  notifyOnFailure: true,
  dockerRegistry: {
    enabled: false,
    registryUrl: '',
    namespace: '',
    username: '',
    password: '',
    defaultMode: 'save_load',
  },
  enablePeriodicHealthCheck: true,
  healthCheckIntervalSeconds: 30,
  enableArtifactCleanup: true,
  artifactRetentionDays: 7,
  artifactMaxKeepPerProject: 5,
  artifactCleanupIntervalHours: 24,
  enableDockerImagePrune: true,
  dockerPruneDanglingOnly: true,
  dockerPruneRetentionHours: 72,
  dockerPruneIntervalHours: 24,
}

const SEED_SERVERS: ServerNode[] = [
  {
    id: 'srv-001',
    name: '生产服务器1(虚拟)',
    ip: '192.168.1.100',
    port: 22,
    user: 'root',
    authType: 'password',
    password: 'password123',
    status: 'online',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 12,
    tags: ['虚拟', '主网关'],
    description: '核心生产集群主要节点',
  },
  {
    id: 'srv-002',
    name: '数据服务器(虚拟)',
    ip: '192.168.1.101',
    port: 22,
    user: 'ubuntu',
    authType: 'password',
    password: 'password123',
    status: 'online',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 18,
    tags: ['虚拟', '数据计算', 'Python'],
    description: '大数据批处理与定时任务执行主机',
  },
  {
    id: 'srv-003',
    name: '应用服务器(虚拟)',
    ip: '192.168.1.102',
    port: 22,
    user: 'administrator',
    authType: 'password',
    password: 'password123',
    status: 'online',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 25,
    tags: ['虚拟', 'ASP.NET'],
    description: '企业后台管理应用运行节点',
  },
  {
    id: 'srv-004',
    name: '微服务集群1(虚拟)',
    ip: '192.168.1.103',
    port: 22,
    user: 'deploy',
    authType: 'privateKey',
    privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA...\n-----END OPENSSH PRIVATE KEY-----',
    status: 'offline',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 0,
    tags: ['虚拟', '微服务', '待维护'],
    description: '用户中心微服务节点 (维护中)',
  },
]

const SEED_PROJECTS: Project[] = [
  {
    id: 'proj-001',
    name: '(虚拟)API 服务',
    description: '核心业务 RESTful API 后端服务',
    repository: 'https://github.com/team/api-service.git',
    branch: 'main',
    gitUsername: 'deploy-bot',
    runtime: 'Node.js',
    deployTargetMode: 'docker',
    artifactType: 'docker',
    dockerDeliveryMode: 'save_load',
    status: 'active',
    serverIp: '192.168.1.100',
    serverName: '生产服务器1(虚拟)',
    serverPort: [3000],
    deployPath: '/opt/apps/api-service',
    installCommand: 'npm install',
    buildCommand: 'docker build -t api-service:latest .',
    startCommand: 'docker run -d --name api-service -p 3000:3000 --restart=always api-service:latest',
    healthCheckUrl: 'http://192.168.1.100:3000/health',
    runnerMode: 'simulation',
    envVars: [
      { key: 'NODE_ENV', value: 'production' },
      { key: 'PORT', value: '3000' },
      { key: 'DB_HOST', value: '192.168.1.200', isSecret: false },
    ],
    lastDeployed: '2026-03-10T06:00:15.000Z',
    lastCommitHash: 'a89f3c1',
    lastCommitMessage: 'feat: 优化数据库查询连接池',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-10T06:00:00.000Z',
  },
  {
    id: 'proj-002',
    name: '(虚拟)数据处理引擎',
    description: '高吞吐异步数据 ETL 与算法分析任务服务',
    repository: 'https://github.com/team/data-engine.git',
    branch: 'develop',
    gitUsername: 'deploy-bot',
    runtime: 'Python',
    deployTargetMode: 'docker',
    artifactType: 'docker',
    dockerDeliveryMode: 'save_load',
    status: 'active',
    serverIp: '192.168.1.101',
    serverName: '数据服务器(虚拟)',
    serverPort: [5000],
    deployPath: '/opt/apps/data-engine',
    installCommand: 'pip install -r requirements.txt',
    buildCommand: 'docker build -t data-engine:latest .',
    startCommand: 'docker run -d --name data-engine -p 5000:5000 --restart=always data-engine:latest',
    healthCheckUrl: 'http://192.168.1.101:5000/status',
    runnerMode: 'simulation',
    envVars: [
      { key: 'PYTHONUNBUFFERED', value: '1' },
      { key: 'WORKERS', value: '4' },
    ],
    lastDeployed: '2026-03-10T02:00:00.000Z',
    lastCommitHash: 'd7f2a14',
    lastCommitMessage: 'feat: 支持多数据源流式 ETL 同步',
    createdAt: '2026-03-02T10:30:00.000Z',
    updatedAt: '2026-03-10T02:00:00.000Z',
  },
  {
    id: 'proj-003',
    name: '(虚拟)后台管理系统',
    description: '企业管理运营控制台服务',
    repository: 'https://github.com/team/admin-panel.git',
    branch: 'release/1.2.0',
    gitUsername: 'deploy-bot',
    runtime: 'ASP.NET Core',
    deployTargetMode: 'docker',
    artifactType: 'docker',
    dockerDeliveryMode: 'save_load',
    status: 'active',
    serverIp: '192.168.1.102',
    serverName: '应用服务器(虚拟)',
    serverPort: [8080],
    deployPath: '/opt/apps/admin-panel',
    installCommand: 'dotnet restore',
    buildCommand: 'docker build -t admin-panel:latest .',
    startCommand: 'docker run -d --name admin-panel -p 8080:8080 --restart=always admin-panel:latest',
    healthCheckUrl: 'http://192.168.1.102:8080/api/health',
    runnerMode: 'simulation',
    envVars: [
      { key: 'ASPNETCORE_ENVIRONMENT', value: 'Production' },
    ],
    dockerBuildArgs: [
      { key: 'PROJECT', value: 'src/AdminPanel/AdminPanel.csproj' },
      { key: 'DOTNET_VERSION', value: '8.0' },
    ],
    lastDeployed: '2026-03-09T08:00:00.000Z',
    lastCommitHash: 'e3b8901',
    lastCommitMessage: 'fix: 修复用户角色权限鉴权漏洞',
    lastVersionTag: 'v1.2.0',
    createdAt: '2026-03-05T14:15:00.000Z',
    updatedAt: '2026-03-09T08:00:00.000Z',
  },
  {
    id: 'proj-004',
    name: '(虚拟)微服务 - 用户模块',
    description: '用户身份验证、SSO 与权限管理中心',
    repository: 'https://github.com/team/microservice-user.git',
    branch: 'main',
    gitUsername: 'deploy-bot',
    runtime: 'Node.js',
    deployTargetMode: 'docker',
    artifactType: 'docker',
    dockerDeliveryMode: 'save_load',
    status: 'stopped',
    serverIp: '192.168.1.103',
    serverName: '微服务集群1(虚拟)',
    serverPort: [3001],
    deployPath: '/opt/apps/user-service',
    installCommand: 'pnpm install',
    buildCommand: 'docker build -t user-service:latest .',
    startCommand: 'docker run -d --name user-service -p 3001:3001 --restart=always user-service:latest',
    healthCheckUrl: 'http://192.168.1.103:3001/health',
    runnerMode: 'simulation',
    envVars: [
      { key: 'PORT', value: '3001' },
      { key: 'JWT_SECRET', value: 'super-secret-key-12345', isSecret: true },
    ],
    lastDeployed: '2026-03-07T05:00:00.000Z',
    lastCommitHash: 'c45b882',
    lastCommitMessage: 'refactor: 重构 JWT 验证中间件逻辑',
    createdAt: '2026-02-20T11:00:00.000Z',
    updatedAt: '2026-03-07T05:00:00.000Z',
  },
]

const SEED_DEPLOYMENTS: Deployment[] = [
  {
    id: 'dep-1001',
    projectId: 'proj-001',
    projectName: 'API 服务',
    branch: 'main',
    commitHash: 'a89f3c1',
    commitMessage: 'feat: 优化数据库查询连接池',
    triggerType: 'manual',
    status: 'success',
    currentStep: '✓ 部署完成',
    startTime: '2026-03-10T06:00:00.000Z',
    endTime: '2026-03-10T06:00:15.000Z',
    durationSeconds: 15,
    logs: [
      { id: 'l1', text: '[00:00] 开始部署 API 服务...', type: 'info', timestamp: '14:00:00' },
      { id: 'l2', text: '[00:02] 克隆 Git 仓库: https://github.com/team/api-service.git (main)...', type: 'info', timestamp: '14:00:02' },
      { id: 'l3', text: '[00:04] ✓ 仓库拉取完成 (commit: a89f3c1)', type: 'success', timestamp: '14:00:04' },
      { id: 'l4', text: '[00:05] 构建 Docker 镜像: docker build -t api-service:latest...', type: 'info', timestamp: '14:00:05' },
      { id: 'l5', text: '[00:09] ✓ 镜像构建成功 (Image ID: sha256:a89f3c1b...)', type: 'success', timestamp: '14:00:09' },
      { id: 'l6', text: '[00:10] 打包镜像并通过 SFTP 分发至目标节点 192.168.1.100...', type: 'info', timestamp: '14:00:10' },
      { id: 'l7', text: '[00:13] 目标节点执行 docker load 加载镜像完成', type: 'success', timestamp: '14:00:13' },
      { id: 'l8', text: '[00:14] 启动 Docker 容器: docker run -d --name api-service -p 3000:3000...', type: 'info', timestamp: '14:00:14' },
      { id: 'l9', text: '[00:15] ✓ 健康检查通过 (HTTP 200 OK)', type: 'success', timestamp: '14:00:15' },
      { id: 'l10', text: '[00:15] ✓ Docker 容器交付流程顺利完成！', type: 'success', timestamp: '14:00:15' },
    ],
  },
]

const SEED_NOTIFICATIONS: SystemNotification[] = [
  {
    id: 'notif-seed-01',
    type: 'deployment',
    level: 'success',
    title: '项目【API 服务】构建部署成功',
    message: '分支 main (a89f3c1) Docker 镜像已成功分发至生产服务器1并启动完毕，耗时 15 秒。',
    read: false,
    createdAt: '2026-03-10T06:00:15.000Z',
    metadata: {
      projectId: 'proj-001',
      projectName: 'API 服务',
      deploymentId: 'dep-1001',
      link: 'deployment',
    },
  },
  {
    id: 'notif-seed-02',
    type: 'health_check',
    level: 'success',
    title: '心跳探针探测正常',
    message: '项目【API 服务】探针地址 http://192.168.1.100:3000/health 响应正常 (HTTP 200 OK，延迟 18ms)。',
    read: false,
    createdAt: '2026-03-10T06:05:00.000Z',
    metadata: {
      projectId: 'proj-001',
      projectName: 'API 服务',
      link: 'project',
    },
  },
  {
    id: 'notif-seed-03',
    type: 'cleanup',
    level: 'info',
    title: '交付物与镜像生命周期就绪',
    message: '产物保留策略（保留 7 天，单项目最多 5 份）及 Docker 镜像定期清理任务已激活运行。',
    read: true,
    createdAt: '2026-03-10T00:00:00.000Z',
    metadata: {
      link: 'settings',
    },
  },
]

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function readDb(): DatabaseSchema {
  ensureDataDir()
  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = {
      projects: SEED_PROJECTS,
      deployments: SEED_DEPLOYMENTS,
      servers: SEED_SERVERS,
      settings: DEFAULT_SETTINGS,
      notifications: SEED_NOTIFICATIONS,
    }
    writeDb(initialData)
    return initialData
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8')
    const db = JSON.parse(raw) as DatabaseSchema
    if (!db.notifications || !Array.isArray(db.notifications)) {
      db.notifications = SEED_NOTIFICATIONS
      writeDb(db)
    }
    return db
  } catch (err) {
    console.error('Error reading db.json, returning defaults', err)
    return {
      projects: SEED_PROJECTS,
      deployments: SEED_DEPLOYMENTS,
      servers: SEED_SERVERS,
      settings: DEFAULT_SETTINGS,
      notifications: SEED_NOTIFICATIONS,
    }
  }
}


export function writeDb(data: DatabaseSchema): void {
  ensureDataDir()
  const tempPath = `${DB_FILE}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tempPath, DB_FILE)
}

// ---------------- Project operations ----------------
export function enrichProjectWithLatestDeployment(
  project: Project,
  deployments: Deployment[],
  servers: ServerNode[] = []
): Project {
  // Find server to get tags if not already present on project
  const srv = servers.find(
    (s) =>
      (project.serverId && s.id === project.serverId) ||
      s.ip === project.serverIp ||
      s.name === project.serverName
  )
  const serverTags =
    project.serverTags && project.serverTags.length > 0 ? project.serverTags : srv?.tags || []

  // Find deployments for this project (sorted newest first in db)
  const projectDeployments = deployments.filter((d) => d.projectId === project.id)
  const latest = projectDeployments[0]
  const latestSuccess = projectDeployments.find((d) => d.status === 'success')
  const activeDep = latest ? (latest.status === 'failed' && latestSuccess ? latestSuccess : latest) : undefined

  const lastCommitHash =
    project.lastCommitHash ||
    (activeDep?.commitHash && activeDep.commitHash !== '获取中...' ? activeDep.commitHash : undefined)
  const lastCommitMessage = project.lastCommitMessage || activeDep?.commitMessage
  const lastVersionTag = project.lastVersionTag || activeDep?.versionTag

  let lastDeployed = project.lastDeployed
  // If lastDeployed is missing, or legacy text like '刚刚' / '2 小时前', or invalid date
  if (
    !lastDeployed ||
    lastDeployed === '刚刚' ||
    lastDeployed.includes('前') ||
    lastDeployed.includes('未部署') ||
    isNaN(new Date(lastDeployed).getTime())
  ) {
    if (activeDep) {
      const timeSource = latestSuccess || latest
      lastDeployed = timeSource.endTime || timeSource.startTime || project.updatedAt || project.lastDeployed
    } else {
      lastDeployed = project.updatedAt || project.createdAt
    }
  }

  // Health check status enrichment
  let healthStatus = project.healthStatus
  let lastHealthCheck = project.lastHealthCheck

  if (!project.healthCheckUrl || !project.healthCheckUrl.trim()) {
    healthStatus = 'unconfigured'
    lastHealthCheck = {
      status: 'unconfigured',
      message: '未配置心跳探针',
      checkedAt: project.lastHealthCheck?.checkedAt || project.updatedAt || project.createdAt,
    }
  } else if (!healthStatus || !lastHealthCheck) {
    if (project.status === 'stopped') {
      healthStatus = 'unhealthy'
      lastHealthCheck = {
        status: 'unhealthy',
        statusCode: 503,
        message: '服务已停止运行',
        checkedAt: project.lastDeployed || project.updatedAt,
        url: project.healthCheckUrl,
      }
    } else {
      healthStatus = 'healthy'
      lastHealthCheck = {
        status: 'healthy',
        statusCode: 200,
        responseTimeMs: 18,
        message: 'HTTP 200 OK',
        checkedAt: project.lastDeployed || project.updatedAt,
        url: project.healthCheckUrl,
      }
    }
  }

  const serverPort: number[] =
    Array.isArray(project.serverPort) && project.serverPort.length > 0
      ? project.serverPort.map(Number).filter((p) => !isNaN(p) && p > 0)
      : (project as any).port
      ? [Number((project as any).port)]
      : [3000]

  const containerPort: number[] =
    Array.isArray(project.containerPort) && project.containerPort.length > 0
      ? project.containerPort.map(Number).filter((p) => !isNaN(p) && p > 0)
      : Array.isArray(project.portMappings) && project.portMappings.length > 0
      ? project.portMappings.map((m) => Number(m.container)).filter((p) => !isNaN(p) && p > 0)
      : [...serverPort]

  const portMappings: PortMapping[] =
    Array.isArray(project.portMappings) && project.portMappings.length > 0
      ? project.portMappings
          .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
          .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
      : serverPort.map((sp, idx) => ({ host: sp, container: containerPort[idx] || sp }))

  return {
    ...project,
    serverPort,
    containerPort,
    portMappings,
    deployTargetMode: project.deployTargetMode || 'docker',
    serverTags,
    lastCommitHash,
    lastCommitMessage,
    lastVersionTag,
    lastDeployed,
    healthStatus,
    lastHealthCheck,
  }
}

export function getProjects(): Project[] {
  const db = readDb()
  return db.projects.map((p) => enrichProjectWithLatestDeployment(p, db.deployments, db.servers))
}

export function getProjectById(id: string): Project | undefined {
  const db = readDb()
  const p = db.projects.find((proj) => proj.id === id)
  return p ? enrichProjectWithLatestDeployment(p, db.deployments, db.servers) : undefined
}

export function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
  const db = readDb()
  const now = new Date().toISOString()
  const srv = db.servers.find(
    (s) =>
      (data.serverId && s.id === data.serverId) ||
      s.ip === data.serverIp ||
      s.name === data.serverName
  )

  let serverPort: number[] = []
  let containerPort: number[] = []
  let portMappings: PortMapping[] = []

  if (Array.isArray(data.portMappings) && data.portMappings.length > 0) {
    portMappings = data.portMappings
      .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
      .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
  }

  if (portMappings.length > 0) {
    serverPort = portMappings.map((m) => m.host)
    containerPort = portMappings.map((m) => m.container)
  } else {
    serverPort =
      Array.isArray(data.serverPort) && data.serverPort.length > 0
        ? data.serverPort.map(Number).filter((p) => !isNaN(p) && p > 0)
        : (data as any).port
        ? [Number((data as any).port)]
        : [3000]
    if (serverPort.length === 0) serverPort = [3000]

    containerPort =
      Array.isArray(data.containerPort) && data.containerPort.length > 0
        ? data.containerPort.map(Number).filter((p) => !isNaN(p) && p > 0)
        : [...serverPort]

    portMappings = serverPort.map((sp, idx) => ({
      host: sp,
      container: containerPort[idx] || sp,
    }))
  }

  const isUnconfigured = !data.healthCheckUrl || !data.healthCheckUrl.trim()
  const healthStatus = data.healthStatus || (isUnconfigured ? 'unconfigured' : 'healthy')
  const lastHealthCheck =
    data.lastHealthCheck ||
    (isUnconfigured
      ? { status: 'unconfigured' as const, message: '未配置心跳探针', checkedAt: now }
      : {
        status: 'healthy' as const,
        statusCode: 200,
        responseTimeMs: 18,
        message: 'HTTP 200 OK',
        url: data.healthCheckUrl,
        checkedAt: now,
      })

  const newProject: Project = {
    ...data,
    serverPort,
    containerPort,
    portMappings,
    deployTargetMode: data.deployTargetMode || 'docker',
    serverTags: data.serverTags || srv?.tags || [],
    healthStatus,
    lastHealthCheck,
    id: `proj-${Date.now().toString(36)}`,
    createdAt: now,
    updatedAt: now,
  }
  db.projects.unshift(newProject)
  writeDb(db)
  return newProject
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const db = readDb()
  const index = db.projects.findIndex((p) => p.id === id)
  if (index === -1) return null

  // If healthCheckUrl is explicitly changed
  if (updates.healthCheckUrl !== undefined) {
    if (!updates.healthCheckUrl || !updates.healthCheckUrl.trim()) {
      updates.healthStatus = 'unconfigured'
      updates.lastHealthCheck = {
        status: 'unconfigured',
        message: '未配置心跳探针',
        checkedAt: new Date().toISOString(),
      }
    }
  }

  // 规范化多端口与容器端口映射更新逻辑
  if (updates.portMappings !== undefined) {
    const rawMappings = Array.isArray(updates.portMappings) ? updates.portMappings : []
    const validMappings = rawMappings
      .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
      .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
    if (validMappings.length > 0) {
      updates.portMappings = validMappings
      updates.serverPort = validMappings.map((m) => m.host)
      updates.containerPort = validMappings.map((m) => m.container)
    }
  } else if (updates.serverPort !== undefined || updates.containerPort !== undefined) {
    if (updates.serverPort !== undefined) {
      const rawPorts = Array.isArray(updates.serverPort)
        ? updates.serverPort
        : [Number(updates.serverPort)]
      const validPorts = rawPorts.map(Number).filter((p) => !isNaN(p) && p > 0)
      updates.serverPort = validPorts.length > 0 ? validPorts : [3000]
    }
    if (updates.containerPort !== undefined) {
      const rawCPorts = Array.isArray(updates.containerPort)
        ? updates.containerPort
        : [Number(updates.containerPort)]
      const validCPorts = rawCPorts.map(Number).filter((p) => !isNaN(p) && p > 0)
      updates.containerPort = validCPorts.length > 0 ? validCPorts : (updates.serverPort || [3000])
    }
    const currentHosts = updates.serverPort || db.projects[index].serverPort || [3000]
    const currentContainers = updates.containerPort || db.projects[index].containerPort || currentHosts
    updates.portMappings = currentHosts.map((sp, idx) => ({
      host: sp,
      container: currentContainers[idx] || sp,
    }))
  }

  db.projects[index] = {
    ...db.projects[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  writeDb(db)
  return db.projects[index]
}

export function deleteProject(id: string): boolean {
  const db = readDb()
  const initialLen = db.projects.length
  db.projects = db.projects.filter((p) => p.id !== id)
  if (db.projects.length !== initialLen) {
    writeDb(db)
    return true
  }
  return false
}

// ---------------- Deployment operations ----------------
export function getDeployments(projectId?: string): Deployment[] {
  const db = readDb()
  if (projectId) {
    return db.deployments.filter((d) => d.projectId === projectId)
  }
  return db.deployments
}

export function getDeploymentById(id: string): Deployment | undefined {
  return readDb().deployments.find((d) => d.id === id)
}

export function createDeployment(
  data: Omit<Deployment, 'id' | 'startTime' | 'status' | 'logs'> & { logs?: DeployLogEntry[] }
): Deployment {
  const db = readDb()
  const newDeployment: Deployment = {
    ...data,
    id: `dep-${Date.now().toString(36)}`,
    status: 'pending',
    startTime: new Date().toISOString(),
    logs: data.logs || [],
  }
  db.deployments.unshift(newDeployment)
  writeDb(db)
  return newDeployment
}

export function updateDeployment(id: string, updates: Partial<Deployment>): Deployment | null {
  const db = readDb()
  const index = db.deployments.findIndex((d) => d.id === id)
  if (index === -1) return null

  db.deployments[index] = {
    ...db.deployments[index],
    ...updates,
  }
  writeDb(db)
  return db.deployments[index]
}

export function appendDeployLog(id: string, log: DeployLogEntry): void {
  const db = readDb()
  const deployment = db.deployments.find((d) => d.id === id)
  if (!deployment) return

  deployment.logs.push(log)
  writeDb(db)
}

// ---------------- Server operations ----------------
/**
 * 对外暴露或 API 响应时脱敏 Server 凭据信息 (密码、私钥、Passphrase)
 */
export function maskServerCredentials<T extends ServerNode>(server: T): T {
  return {
    ...server,
    hasPassword: Boolean(server.password && server.password.trim()),
    hasPrivateKey: Boolean(server.privateKey && server.privateKey.trim()),
    password: server.password ? '******' : '',
    privateKey: server.privateKey ? '******' : '',
    passphrase: server.passphrase ? '******' : '',
  }
}

export function getServers(): ServerNode[] {
  return readDb().servers
}

export function getServerById(id: string): ServerNode | undefined {
  return readDb().servers.find((s) => s.id === id)
}

export function getServerByIp(ip: string): ServerNode | undefined {
  return readDb().servers.find((s) => s.ip === ip)
}

export function createServer(data: Omit<ServerNode, 'id'>): ServerNode {
  const db = readDb()
  const newServer: ServerNode = {
    ...data,
    id: `srv-${Date.now().toString(36)}`,
  }
  db.servers.push(newServer)
  writeDb(db)
  return newServer
}

export function updateServer(id: string, updates: Partial<ServerNode>): ServerNode | null {
  const db = readDb()
  const index = db.servers.findIndex((s) => s.id === id)
  if (index === -1) return null

  const cleanUpdates = { ...updates }
  // 保护存储的真实凭据，避免因前端回传掩码或空值而被覆盖
  if (cleanUpdates.password === '******' || cleanUpdates.password === undefined) {
    delete cleanUpdates.password
  }
  if (cleanUpdates.privateKey === '******' || cleanUpdates.privateKey === undefined) {
    delete cleanUpdates.privateKey
  }
  if (cleanUpdates.passphrase === '******' || cleanUpdates.passphrase === undefined) {
    delete cleanUpdates.passphrase
  }

  db.servers[index] = {
    ...db.servers[index],
    ...cleanUpdates,
  }
  writeDb(db)
  return db.servers[index]
}

export function deleteServer(id: string): boolean {
  const db = readDb()
  const initialLen = db.servers.length
  db.servers = db.servers.filter((s) => s.id !== id)
  if (db.servers.length !== initialLen) {
    writeDb(db)
    return true
  }
  return false
}

// ---------------- Settings operations ----------------
export function getSettings(): SystemSettings {
  return readDb().settings || DEFAULT_SETTINGS
}

export function updateSettings(updates: Partial<SystemSettings>): SystemSettings {
  const db = readDb()
  db.settings = {
    ...db.settings,
    ...updates,
  }
  writeDb(db)
  return db.settings
}

// ---------------- Stats calculations ----------------
export function getDashboardStats(): DashboardStats {
  const db = readDb()
  const totalProjects = db.projects.length
  const activeServices = db.projects.filter((p) => p.status === 'active').length
  const stoppedServices = db.projects.filter((p) => p.status === 'stopped').length
  const errorServices = db.projects.filter((p) => p.status === 'error').length

  const successfulDeployments = db.deployments.filter((d) => d.status === 'success').length
  const totalFinishedDeployments = db.deployments.filter(
    (d) => d.status === 'success' || d.status === 'failed'
  ).length

  const successRate =
    totalFinishedDeployments > 0
      ? Math.round((successfulDeployments / totalFinishedDeployments) * 100)
      : 100

  // Count deployments started in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const deploymentsToday = db.deployments.filter(
    (d) => new Date(d.startTime) >= oneDayAgo
  ).length

  const totalServers = db.servers.length
  const onlineServers = db.servers.filter((s) => s.status === 'online').length

  return {
    totalProjects,
    activeServices,
    stoppedServices,
    errorServices,
    successRate,
    deploymentsToday,
    totalServers,
    onlineServers,
  }
}

// ---------------- Notification operations ----------------
const MAX_NOTIFICATIONS_LIMIT = 200

export function getNotifications(options?: {
  limit?: number
  unreadOnly?: boolean
  type?: NotificationType
}): { items: SystemNotification[]; unreadCount: number; totalCount: number } {
  const db = readDb()
  const all = (db.notifications || []).slice()

  // 按创建时间倒序排列（最新的在最前）
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const unreadCount = all.filter((n) => !n.read).length
  const totalCount = all.length

  let filtered = all
  if (options?.unreadOnly) {
    filtered = filtered.filter((n) => !n.read)
  }
  if (options?.type) {
    filtered = filtered.filter((n) => n.type === options.type)
  }

  const limit = options?.limit || 100
  const items = filtered.slice(0, limit)

  return {
    items,
    unreadCount,
    totalCount,
  }
}

export function getUnreadNotificationCount(): number {
  const db = readDb()
  return (db.notifications || []).filter((n) => !n.read).length
}

export function createNotification(
  data: Omit<SystemNotification, 'id' | 'createdAt' | 'read'> & {
    read?: boolean
    createdAt?: string
  }
): SystemNotification {
  const db = readDb()
  if (!db.notifications) {
    db.notifications = []
  }

  const newNotif: SystemNotification = {
    ...data,
    id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    read: data.read ?? false,
    createdAt: data.createdAt || new Date().toISOString(),
  }

  // 插入到最前端
  db.notifications.unshift(newNotif)

  // 数量上限防护（超出自动剔除尾部较早的通知）
  if (db.notifications.length > MAX_NOTIFICATIONS_LIMIT) {
    db.notifications = db.notifications.slice(0, MAX_NOTIFICATIONS_LIMIT)
  }

  writeDb(db)
  return newNotif
}

export function markNotificationAsRead(id: string): boolean {
  const db = readDb()
  if (!db.notifications) return false
  const target = db.notifications.find((n) => n.id === id)
  if (!target) return false

  target.read = true
  writeDb(db)
  return true
}

export function markAllNotificationsAsRead(): boolean {
  const db = readDb()
  if (!db.notifications || db.notifications.length === 0) return true

  let modified = false
  for (const n of db.notifications) {
    if (!n.read) {
      n.read = true
      modified = true
    }
  }

  if (modified) {
    writeDb(db)
  }
  return true
}

export function deleteNotification(id: string): boolean {
  const db = readDb()
  if (!db.notifications) return false
  const initialLen = db.notifications.length
  db.notifications = db.notifications.filter((n) => n.id !== id)
  if (db.notifications.length !== initialLen) {
    writeDb(db)
    return true
  }
  return false
}

export function clearAllNotifications(): boolean {
  const db = readDb()
  db.notifications = []
  writeDb(db)
  return true
}


import fs from 'fs'
import path from 'path'
import {
  Project,
  Deployment,
  ServerNode,
  SystemSettings,
  DashboardStats,
  DeployLogEntry,
} from './types'

interface DatabaseSchema {
  projects: Project[]
  deployments: Deployment[]
  servers: ServerNode[]
  settings: SystemSettings
}

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

const DEFAULT_SETTINGS: SystemSettings = {
  platformName: '轻量自研 CI/CD 平台',
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
}

const SEED_SERVERS: ServerNode[] = [
  {
    id: 'srv-001',
    name: '生产服务器 1',
    ip: '192.168.1.100',
    port: 22,
    user: 'root',
    authType: 'password',
    password: 'password123',
    status: 'online',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 12,
    tags: ['生产', '主网关'],
    description: '核心生产集群主要节点',
  },
  {
    id: 'srv-002',
    name: '数据服务器',
    ip: '192.168.1.101',
    port: 22,
    user: 'ubuntu',
    authType: 'password',
    password: 'password123',
    status: 'online',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 18,
    tags: ['数据计算', 'Python'],
    description: '大数据批处理与定时任务执行主机',
  },
  {
    id: 'srv-003',
    name: '应用服务器',
    ip: '192.168.1.102',
    port: 22,
    user: 'administrator',
    authType: 'password',
    password: 'password123',
    status: 'online',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 25,
    tags: ['Windows', 'ASP.NET'],
    description: '企业后台管理应用运行节点',
  },
  {
    id: 'srv-004',
    name: '微服务集群 1',
    ip: '192.168.1.103',
    port: 22,
    user: 'deploy',
    authType: 'privateKey',
    privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA...\n-----END OPENSSH PRIVATE KEY-----',
    status: 'offline',
    lastChecked: '2026-03-10T06:00:15.000Z',
    latencyMs: 0,
    tags: ['微服务', '待维护'],
    description: '用户中心微服务节点 (维护中)',
  },
]

const SEED_PROJECTS: Project[] = [
  {
    id: 'proj-001',
    name: 'API 服务',
    description: '核心业务 RESTful API 后端服务',
    repository: 'https://github.com/team/api-service.git',
    branch: 'main',
    gitUsername: 'deploy-bot',
    runtime: 'Node.js',
    status: 'active',
    serverIp: '192.168.1.100',
    serverName: '生产服务器 1',
    port: 3000,
    deployPath: '/opt/apps/api-service',
    installCommand: 'npm install',
    buildCommand: 'npm run build',
    startCommand: 'pm2 reload api-service || pm2 start dist/index.js --name api-service',
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
    name: '数据处理引擎',
    description: '高吞吐异步数据 ETL 与算法分析任务服务',
    repository: 'https://github.com/team/data-engine.git',
    branch: 'develop',
    gitUsername: 'deploy-bot',
    runtime: 'Python',
    status: 'active',
    serverIp: '192.168.1.101',
    serverName: '数据服务器',
    port: 5000,
    deployPath: '/opt/apps/data-engine',
    installCommand: 'pip install -r requirements.txt',
    buildCommand: 'python setup.py build',
    startCommand: 'gunicorn -w 4 -b 0.0.0.0:5000 app:app --daemon',
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
    name: '后台管理系统',
    description: '企业管理运营控制台服务',
    repository: 'https://github.com/team/admin-panel.git',
    branch: 'release/1.2.0',
    gitUsername: 'deploy-bot',
    runtime: 'ASP.NET Core',
    status: 'active',
    serverIp: '192.168.1.102',
    serverName: '应用服务器',
    port: 8080,
    deployPath: 'C:\\apps\\admin-panel',
    installCommand: 'dotnet restore',
    buildCommand: 'dotnet publish -c Release -o ./publish',
    startCommand: 'dotnet ./publish/AdminPanel.dll',
    healthCheckUrl: 'http://192.168.1.102:8080/api/health',
    runnerMode: 'simulation',
    envVars: [
      { key: 'ASPNETCORE_ENVIRONMENT', value: 'Production' },
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
    name: '微服务 - 用户模块',
    description: '用户身份验证、SSO 与权限管理中心',
    repository: 'https://github.com/team/microservice-user.git',
    branch: 'main',
    gitUsername: 'deploy-bot',
    runtime: 'Node.js',
    status: 'stopped',
    serverIp: '192.168.1.103',
    serverName: '微服务集群 1',
    port: 3001,
    deployPath: '/opt/apps/user-service',
    installCommand: 'pnpm install',
    buildCommand: 'pnpm build',
    startCommand: 'node dist/main.js',
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
      { id: 'l4', text: '[00:05] 执行依赖安装: npm install...', type: 'info', timestamp: '14:00:05' },
      { id: 'l5', text: '[00:08] ✓ 依赖安装完成 (342 packages added)', type: 'success', timestamp: '14:00:08' },
      { id: 'l6', text: '[00:09] 执行构建命令: npm run build...', type: 'info', timestamp: '14:00:09' },
      { id: 'l7', text: '[00:12] ✓ 构建成功，产物大小 2.4MB', type: 'success', timestamp: '14:00:12' },
      { id: 'l8', text: '[00:13] 上传产物至目标主机 192.168.1.100:/opt/apps/api-service...', type: 'info', timestamp: '14:00:13' },
      { id: 'l9', text: '[00:14] 启动应用服务: pm2 reload api-service...', type: 'info', timestamp: '14:00:14' },
      { id: 'l10', text: '[00:15] ✓ 健康检查通过 (HTTP 200 OK)', type: 'success', timestamp: '14:00:15' },
      { id: 'l11', text: '[00:15] ✓ 部署流程顺利完成！', type: 'success', timestamp: '14:00:15' },
    ],
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
    }
    writeDb(initialData)
    return initialData
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8')
    return JSON.parse(raw) as DatabaseSchema
  } catch (err) {
    console.error('Error reading db.json, returning defaults', err)
    return {
      projects: SEED_PROJECTS,
      deployments: SEED_DEPLOYMENTS,
      servers: SEED_SERVERS,
      settings: DEFAULT_SETTINGS,
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

  return {
    ...project,
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

  db.servers[index] = {
    ...db.servers[index],
    ...updates,
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

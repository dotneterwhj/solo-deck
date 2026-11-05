import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'
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
  EnvVariable,
  DockerBuildArg,
  DockerRegistryConfig,
  HealthCheckResult,
} from './types'

export interface DatabaseSchema {
  projects: Project[]
  deployments: Deployment[]
  servers: ServerNode[]
  settings: SystemSettings
  notifications?: SystemNotification[]
}

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

export const DEFAULT_SETTINGS: SystemSettings = {
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

export const SEED_SERVERS: ServerNode[] = [
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

export const SEED_PROJECTS: Project[] = [
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
    startCommand: 'docker run -d --restart unless-stopped --name api-service -p 3000:3000 api-service:latest',
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
    startCommand: 'docker run -d --restart unless-stopped --name data-engine -p 5000:5000 data-engine:latest',
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
    startCommand: 'docker run -d --restart unless-stopped --name admin-panel -p 8080:8080 admin-panel:latest',
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
    startCommand: 'docker run -d --restart unless-stopped --name user-service -p 3001:3001 user-service:latest',
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

export const SEED_DEPLOYMENTS: Deployment[] = [
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

export const SEED_NOTIFICATIONS: SystemNotification[] = [
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

// ---------------- JSON Parsing & Serialization Helpers ----------------
function parseJsonSafe<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try {
    return JSON.parse(val) as T
  } catch {
    return fallback
  }
}

function toProject(row: any): Project {
  let serverPort = parseJsonSafe<number[]>(row.serverPort, [3000])
  if (!Array.isArray(serverPort)) {
    serverPort = [3000]
  }
  return {
    ...row,
    serverPort,
    containerPort: row.containerPort ? parseJsonSafe<number[]>(row.containerPort, []) : undefined,
    portMappings: row.portMappings ? parseJsonSafe<PortMapping[]>(row.portMappings, []) : undefined,
    serverTags: row.serverTags ? parseJsonSafe<string[]>(row.serverTags, []) : [],
    envVars: row.envVars ? parseJsonSafe<EnvVariable[]>(row.envVars, []) : [],
    dockerBuildArgs: row.dockerBuildArgs ? parseJsonSafe<DockerBuildArg[]>(row.dockerBuildArgs, []) : undefined,
    dockerRegistry: row.dockerRegistry ? parseJsonSafe<Partial<DockerRegistryConfig>>(row.dockerRegistry, {}) : undefined,
    lastHealthCheck: row.lastHealthCheck ? parseJsonSafe<HealthCheckResult>(row.lastHealthCheck, undefined as any) : undefined,
  }
}

function toProjectRow(data: any): any {
  const row: any = { ...data }
  if (data.serverPort !== undefined) row.serverPort = JSON.stringify(data.serverPort)
  if (data.containerPort !== undefined) row.containerPort = data.containerPort ? JSON.stringify(data.containerPort) : null
  if (data.portMappings !== undefined) row.portMappings = data.portMappings ? JSON.stringify(data.portMappings) : null
  if (data.serverTags !== undefined) row.serverTags = data.serverTags ? JSON.stringify(data.serverTags) : null
  if (data.envVars !== undefined) row.envVars = data.envVars ? JSON.stringify(data.envVars) : null
  if (data.dockerBuildArgs !== undefined) row.dockerBuildArgs = data.dockerBuildArgs ? JSON.stringify(data.dockerBuildArgs) : null
  if (data.dockerRegistry !== undefined) row.dockerRegistry = data.dockerRegistry ? JSON.stringify(data.dockerRegistry) : null
  if (data.lastHealthCheck !== undefined) row.lastHealthCheck = data.lastHealthCheck ? JSON.stringify(data.lastHealthCheck) : null
  return row
}

function toDeployment(row: any): Deployment {
  return {
    ...row,
    logs: parseJsonSafe<DeployLogEntry[]>(row.logs, []),
  }
}

function toDeploymentRow(data: any): any {
  const row: any = { ...data }
  if (data.logs !== undefined) row.logs = JSON.stringify(data.logs)
  return row
}

function toServerNode(row: any): ServerNode {
  return {
    ...row,
    tags: row.tags ? parseJsonSafe<string[]>(row.tags, []) : [],
    installedEnvs: row.installedEnvs ? parseJsonSafe<Record<string, { installed: boolean; version?: string }>>(row.installedEnvs, undefined as any) : undefined,
  }
}

function toServerNodeRow(data: any): any {
  const row: any = { ...data }
  if (data.tags !== undefined) row.tags = data.tags ? JSON.stringify(data.tags) : null
  if (data.installedEnvs !== undefined) row.installedEnvs = data.installedEnvs ? JSON.stringify(data.installedEnvs) : null
  return row
}

function toSettings(row: any): SystemSettings {
  return {
    ...row,
    dockerRegistry: row.dockerRegistry ? parseJsonSafe<DockerRegistryConfig>(row.dockerRegistry, undefined as any) : undefined,
  }
}

function toSettingsRow(data: any): any {
  const row: any = { ...data }
  if (data.dockerRegistry !== undefined) row.dockerRegistry = data.dockerRegistry ? JSON.stringify(data.dockerRegistry) : null
  return row
}

function toNotification(row: any): SystemNotification {
  return {
    ...row,
    metadata: row.metadata ? parseJsonSafe<any>(row.metadata, undefined) : undefined,
  }
}

function toNotificationRow(data: any): any {
  const row: any = { ...data }
  if (data.metadata !== undefined) row.metadata = data.metadata ? JSON.stringify(data.metadata) : null
  return row
}

// ---------------- Database Initialization & Auto-Migration ----------------
let isInitialized = false
let initPromise: Promise<void> | null = null

export async function ensureInitialized(): Promise<void> {
  if (isInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const serverCount = await prisma.serverNode.count()
      const projectCount = await prisma.project.count()
      const settingsCount = await prisma.systemSettings.count()

      if (serverCount === 0 && projectCount === 0 && settingsCount === 0) {
        if (fs.existsSync(DB_FILE)) {
          try {
            const raw = fs.readFileSync(DB_FILE, 'utf-8')
            const legacyDb = JSON.parse(raw) as Partial<DatabaseSchema>
            console.log('[Prisma] 检测到已有 db.json，正在自动迁移数据至 SQLite...')

            if (legacyDb.settings) {
              await prisma.systemSettings.create({
                data: toSettingsRow({ ...DEFAULT_SETTINGS, ...legacyDb.settings, id: 'default' }),
              })
            } else {
              await prisma.systemSettings.create({
                data: toSettingsRow({ ...DEFAULT_SETTINGS, id: 'default' }),
              })
            }

            if (Array.isArray(legacyDb.servers) && legacyDb.servers.length > 0) {
              for (let i = 0; i < legacyDb.servers.length; i++) {
                const s = legacyDb.servers[i]
                await prisma.serverNode.create({
                  data: toServerNodeRow({ ...s, sortOrder: i }),
                })
              }
            }

            if (Array.isArray(legacyDb.projects) && legacyDb.projects.length > 0) {
              for (let i = 0; i < legacyDb.projects.length; i++) {
                const p = legacyDb.projects[i]
                await prisma.project.create({
                  data: toProjectRow({ ...p, sortOrder: i }),
                })
              }
            }

            if (Array.isArray(legacyDb.deployments) && legacyDb.deployments.length > 0) {
              for (const d of legacyDb.deployments) {
                await prisma.deployment.create({
                  data: toDeploymentRow(d),
                })
              }
            }

            if (Array.isArray(legacyDb.notifications) && legacyDb.notifications.length > 0) {
              for (const n of legacyDb.notifications) {
                await prisma.systemNotification.create({
                  data: toNotificationRow(n),
                })
              }
            }

            const backupFile = DB_FILE + '.bak'
            fs.renameSync(DB_FILE, backupFile)
            console.log('[Prisma] 数据迁移完成，旧数据已备份至 ' + backupFile)
          } catch (migrateErr) {
            console.error('[Prisma] 从 db.json 迁移失败，回退至种子初始化:', migrateErr)
            await seedDatabase()
          }
        } else {
          await seedDatabase()
        }
      } else if (settingsCount === 0) {
        await prisma.systemSettings.create({
          data: toSettingsRow({ ...DEFAULT_SETTINGS, id: 'default' }),
        })
      }
      isInitialized = true
    } catch (err) {
      console.error('[Prisma] 数据库初始化异常:', err)
    } finally {
      initPromise = null
    }
  })()

  return initPromise
}

async function seedDatabase(): Promise<void> {
  console.log('[Prisma] 正在初始化 SQLite 演示种子数据...')
  await prisma.systemSettings.create({
    data: toSettingsRow({ ...DEFAULT_SETTINGS, id: 'default' }),
  })

  for (let i = 0; i < SEED_SERVERS.length; i++) {
    await prisma.serverNode.create({
      data: toServerNodeRow({ ...SEED_SERVERS[i], sortOrder: i }),
    })
  }

  for (let i = 0; i < SEED_PROJECTS.length; i++) {
    await prisma.project.create({
      data: toProjectRow({ ...SEED_PROJECTS[i], sortOrder: i }),
    })
  }

  for (const d of SEED_DEPLOYMENTS) {
    await prisma.deployment.create({
      data: toDeploymentRow(d),
    })
  }

  for (const n of SEED_NOTIFICATIONS) {
    await prisma.systemNotification.create({
      data: toNotificationRow(n),
    })
  }
  console.log('[Prisma] SQLite 演示种子数据初始化完毕')
}

// ---------------- Project operations ----------------
export function enrichProjectWithLatestDeployment(
  project: Project,
  deployments: Deployment[],
  servers: ServerNode[] = []
): Project {
  const srv = servers.find(
    (s) =>
      (project.serverId && s.id === project.serverId) ||
      s.ip === project.serverIp ||
      s.name === project.serverName
  )
  const serverTags =
    project.serverTags && project.serverTags.length > 0 ? project.serverTags : srv?.tags || []

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

export async function getProjects(): Promise<Project[]> {
  await ensureInitialized()
  const rows = await prisma.project.findMany({
    orderBy: { sortOrder: 'asc' },
  })
  const deployments = (await prisma.deployment.findMany({
    orderBy: { startTime: 'desc' },
  })).map(toDeployment)
  const servers = (await prisma.serverNode.findMany({
    orderBy: { sortOrder: 'asc' },
  })).map(toServerNode)

  return rows.map((r: any) => enrichProjectWithLatestDeployment(toProject(r), deployments, servers))
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  await ensureInitialized()
  const row = await prisma.project.findUnique({
    where: { id },
  })
  if (!row) return undefined
  const deployments = (await prisma.deployment.findMany({
    where: { projectId: id },
    orderBy: { startTime: 'desc' },
  })).map(toDeployment)
  const servers = (await prisma.serverNode.findMany()).map(toServerNode)
  return enrichProjectWithLatestDeployment(toProject(row), deployments, servers)
}

export async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  await ensureInitialized()
  const now = new Date().toISOString()
  const servers = (await prisma.serverNode.findMany()).map(toServerNode)
  const srv = servers.find(
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

  const count = await prisma.project.count()
  const newProject: Project = {
    ...data,
    serverPort,
    containerPort,
    portMappings,
    deployTargetMode: data.deployTargetMode || 'docker',
    serverTags: data.serverTags || srv?.tags || [],
    healthStatus,
    lastHealthCheck,
    id: 'proj-' + Date.now().toString(36),
    createdAt: now,
    updatedAt: now,
  }

  const row = toProjectRow({ ...newProject, sortOrder: count })
  await prisma.project.create({ data: row })
  return newProject
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  await ensureInitialized()
  const existing = await prisma.project.findUnique({ where: { id } })
  if (!existing) return null

  const currentProject = toProject(existing)
  const cleanUpdates = { ...updates }

  if (cleanUpdates.healthCheckUrl !== undefined) {
    if (!cleanUpdates.healthCheckUrl || !cleanUpdates.healthCheckUrl.trim()) {
      cleanUpdates.healthStatus = 'unconfigured'
      cleanUpdates.lastHealthCheck = {
        status: 'unconfigured',
        message: '未配置心跳探针',
        checkedAt: new Date().toISOString(),
      }
    }
  }

  if (cleanUpdates.portMappings !== undefined) {
    const rawMappings = Array.isArray(cleanUpdates.portMappings) ? cleanUpdates.portMappings : []
    const validMappings = rawMappings
      .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
      .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
    if (validMappings.length > 0) {
      cleanUpdates.portMappings = validMappings
      cleanUpdates.serverPort = validMappings.map((m) => m.host)
      cleanUpdates.containerPort = validMappings.map((m) => m.container)
    }
  } else if (cleanUpdates.serverPort !== undefined || cleanUpdates.containerPort !== undefined) {
    if (cleanUpdates.serverPort !== undefined) {
      const rawPorts = Array.isArray(cleanUpdates.serverPort)
        ? cleanUpdates.serverPort
        : [Number(cleanUpdates.serverPort)]
      const validPorts = rawPorts.map(Number).filter((p) => !isNaN(p) && p > 0)
      cleanUpdates.serverPort = validPorts.length > 0 ? validPorts : [3000]
    }
    if (cleanUpdates.containerPort !== undefined) {
      const rawCPorts = Array.isArray(cleanUpdates.containerPort)
        ? cleanUpdates.containerPort
        : [Number(cleanUpdates.containerPort)]
      const validCPorts = rawCPorts.map(Number).filter((p) => !isNaN(p) && p > 0)
      cleanUpdates.containerPort = validCPorts.length > 0 ? validCPorts : (cleanUpdates.serverPort || [3000])
    }
    const currentHosts = cleanUpdates.serverPort || currentProject.serverPort || [3000]
    const currentContainers = cleanUpdates.containerPort || currentProject.containerPort || currentHosts
    cleanUpdates.portMappings = currentHosts.map((sp, idx) => ({
      host: sp,
      container: currentContainers[idx] || sp,
    }))
  }

  const updatedRowData = toProjectRow({
    ...cleanUpdates,
    updatedAt: new Date().toISOString(),
  })
  delete updatedRowData.id

  const updated = await prisma.project.update({
    where: { id },
    data: updatedRowData,
  })

  return toProject(updated)
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureInitialized()
  try {
    await prisma.project.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function reorderProjects(orderedIds: string[]): Promise<Project[]> {
  await ensureInitialized()
  for (let i = 0; i < orderedIds.length; i++) {
    try {
      await prisma.project.update({
        where: { id: orderedIds[i] },
        data: { sortOrder: i },
      })
    } catch {
      // ignore
    }
  }
  return getProjects()
}

// ---------------- Deployment operations ----------------
export async function getDeployments(projectId?: string): Promise<Deployment[]> {
  await ensureInitialized()
  const rows = await prisma.deployment.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { startTime: 'desc' },
  })
  return rows.map(toDeployment)
}

export async function getDeploymentById(id: string): Promise<Deployment | undefined> {
  await ensureInitialized()
  const row = await prisma.deployment.findUnique({ where: { id } })
  return row ? toDeployment(row) : undefined
}

export async function createDeployment(
  data: Omit<Deployment, 'id' | 'startTime' | 'status' | 'logs'> & { logs?: DeployLogEntry[] }
): Promise<Deployment> {
  await ensureInitialized()
  const newDeployment: Deployment = {
    ...data,
    id: 'dep-' + Date.now().toString(36),
    status: 'pending',
    startTime: new Date().toISOString(),
    logs: data.logs || [],
  }
  await prisma.deployment.create({
    data: toDeploymentRow(newDeployment),
  })
  return newDeployment
}

export async function updateDeployment(id: string, updates: Partial<Deployment>): Promise<Deployment | null> {
  await ensureInitialized()
  try {
    const data = toDeploymentRow(updates)
    delete data.id
    const updated = await prisma.deployment.update({
      where: { id },
      data,
    })
    return toDeployment(updated)
  } catch {
    return null
  }
}

export async function appendDeployLog(id: string, log: DeployLogEntry): Promise<void> {
  await ensureInitialized()
  const dep = await prisma.deployment.findUnique({ where: { id } })
  if (!dep) return
  const logs = parseJsonSafe<DeployLogEntry[]>(dep.logs, [])
  logs.push(log)
  await prisma.deployment.update({
    where: { id },
    data: { logs: JSON.stringify(logs) },
  })
}

// ---------------- Server operations ----------------
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

export async function getServers(): Promise<ServerNode[]> {
  await ensureInitialized()
  const rows = await prisma.serverNode.findMany({
    orderBy: { sortOrder: 'asc' },
  })
  return rows.map(toServerNode)
}

export async function getServerById(id: string): Promise<ServerNode | undefined> {
  await ensureInitialized()
  const row = await prisma.serverNode.findUnique({ where: { id } })
  return row ? toServerNode(row) : undefined
}

export async function getServerByIp(ip: string): Promise<ServerNode | undefined> {
  await ensureInitialized()
  const row = await prisma.serverNode.findFirst({ where: { ip } })
  return row ? toServerNode(row) : undefined
}

export async function createServer(data: Omit<ServerNode, 'id'>): Promise<ServerNode> {
  await ensureInitialized()
  const count = await prisma.serverNode.count()
  const newServer: ServerNode = {
    ...data,
    id: 'srv-' + Date.now().toString(36),
  }
  await prisma.serverNode.create({
    data: toServerNodeRow({ ...newServer, sortOrder: count }),
  })
  return newServer
}

export async function updateServer(id: string, updates: Partial<ServerNode>): Promise<ServerNode | null> {
  await ensureInitialized()
  const cleanUpdates = { ...updates }
  if (cleanUpdates.password === '******' || cleanUpdates.password === undefined) {
    delete cleanUpdates.password
  }
  if (cleanUpdates.privateKey === '******' || cleanUpdates.privateKey === undefined) {
    delete cleanUpdates.privateKey
  }
  if (cleanUpdates.passphrase === '******' || cleanUpdates.passphrase === undefined) {
    delete cleanUpdates.passphrase
  }

  const data = toServerNodeRow(cleanUpdates)
  delete data.id

  try {
    const updated = await prisma.serverNode.update({
      where: { id },
      data,
    })
    return toServerNode(updated)
  } catch {
    return null
  }
}

export async function deleteServer(id: string): Promise<boolean> {
  await ensureInitialized()
  try {
    await prisma.serverNode.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function reorderServers(orderedIdsOrNames: string[]): Promise<ServerNode[]> {
  await ensureInitialized()
  const allServers = await getServers()
  const map = new Map<string, ServerNode>()
  allServers.forEach((s) => {
    map.set(s.id, s)
    map.set(s.name, s)
  })
  const addedIds = new Set<string>()
  let order = 0
  for (const key of orderedIdsOrNames) {
    const s = map.get(key)
    if (s && !addedIds.has(s.id)) {
      await prisma.serverNode.update({
        where: { id: s.id },
        data: { sortOrder: order++ },
      })
      addedIds.add(s.id)
    }
  }
  return getServers()
}

// ---------------- Settings operations ----------------
export async function getSettings(): Promise<SystemSettings> {
  await ensureInitialized()
  const row = await prisma.systemSettings.findUnique({ where: { id: 'default' } })
  if (!row) {
    await prisma.systemSettings.create({
      data: toSettingsRow({ ...DEFAULT_SETTINGS, id: 'default' }),
    })
    return DEFAULT_SETTINGS
  }
  return toSettings(row)
}

export async function updateSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
  await ensureInitialized()
  const data = toSettingsRow(updates)
  delete data.id
  const updated = await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: data,
    create: { ...toSettingsRow(DEFAULT_SETTINGS), ...data, id: 'default' },
  })
  return toSettings(updated)
}

// ---------------- Stats calculations ----------------
export async function getDashboardStats(): Promise<DashboardStats> {
  await ensureInitialized()
  const [projects, deployments, servers] = await Promise.all([
    prisma.project.findMany(),
    prisma.deployment.findMany(),
    prisma.serverNode.findMany(),
  ])

  const totalProjects = projects.length
  const activeServices = projects.filter((p: any) => p.status === 'active').length
  const stoppedServices = projects.filter((p: any) => p.status === 'stopped').length
  const errorServices = projects.filter((p: any) => p.status === 'error').length

  const successfulDeployments = deployments.filter((d: any) => d.status === 'success').length
  const totalFinishedDeployments = deployments.filter(
    (d: any) => d.status === 'success' || d.status === 'failed'
  ).length

  const successRate =
    totalFinishedDeployments > 0
      ? Math.round((successfulDeployments / totalFinishedDeployments) * 100)
      : 100

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const deploymentsToday = deployments.filter(
    (d: any) => new Date(d.startTime) >= oneDayAgo
  ).length

  const totalServers = servers.length
  const onlineServers = servers.filter((s: any) => s.status === 'online').length

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

export async function getNotifications(options?: {
  limit?: number
  unreadOnly?: boolean
  type?: NotificationType
}): Promise<{ items: SystemNotification[]; unreadCount: number; totalCount: number }> {
  await ensureInitialized()
  const where: any = {}
  if (options?.unreadOnly) {
    where.read = false
  }
  if (options?.type) {
    where.type = options.type
  }

  const [rows, unreadCount, totalCount] = await Promise.all([
    prisma.systemNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
    }),
    prisma.systemNotification.count({ where: { read: false } }),
    prisma.systemNotification.count(),
  ])

  return {
    items: rows.map(toNotification),
    unreadCount,
    totalCount,
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  await ensureInitialized()
  return prisma.systemNotification.count({ where: { read: false } })
}

export async function createNotification(
  data: Omit<SystemNotification, 'id' | 'createdAt' | 'read'> & {
    read?: boolean
    createdAt?: string
  }
): Promise<SystemNotification> {
  await ensureInitialized()
  const newNotif: SystemNotification = {
    ...data,
    id: 'notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
    read: data.read ?? false,
    createdAt: data.createdAt || new Date().toISOString(),
  }

  await prisma.systemNotification.create({
    data: toNotificationRow(newNotif),
  })

  const count = await prisma.systemNotification.count()
  if (count > MAX_NOTIFICATIONS_LIMIT) {
    const oldest = await prisma.systemNotification.findMany({
      orderBy: { createdAt: 'asc' },
      take: count - MAX_NOTIFICATIONS_LIMIT,
      select: { id: true },
    })
    if (oldest.length > 0) {
      await prisma.systemNotification.deleteMany({
        where: { id: { in: oldest.map((o: any) => o.id) } },
      })
    }
  }

  return newNotif
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  await ensureInitialized()
  try {
    await prisma.systemNotification.update({
      where: { id },
      data: { read: true },
    })
    return true
  } catch {
    return false
  }
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
  await ensureInitialized()
  try {
    await prisma.systemNotification.updateMany({
      where: { read: false },
      data: { read: true },
    })
    return true
  } catch {
    return false
  }
}

export async function deleteNotification(id: string): Promise<boolean> {
  await ensureInitialized()
  try {
    await prisma.systemNotification.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function clearAllNotifications(): Promise<boolean> {
  await ensureInitialized()
  try {
    await prisma.systemNotification.deleteMany()
    return true
  } catch {
    return false
  }
}

export async function readDb(): Promise<DatabaseSchema> {
  await ensureInitialized()
  const [projects, deployments, servers, settings, notifications] = await Promise.all([
    getProjects(),
    getDeployments(),
    getServers(),
    getSettings(),
    prisma.systemNotification.findMany({ orderBy: { createdAt: 'desc' } }).then((rows: any[]) => rows.map(toNotification)),
  ])
  return {
    projects,
    deployments,
    servers,
    settings,
    notifications,
  }
}

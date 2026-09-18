export type BuiltinRuntimeType =
  | 'Node.js'
  | 'Python'
  | 'ASP.NET Core'
  | 'Go'
  | 'Java'
  | 'Static Web'

export type RuntimeType = BuiltinRuntimeType | (string & {})

export type DeployTargetMode = 'docker' | 'native' | 'docker_compose'

export type ProjectStatus = 'active' | 'stopped' | 'error' | 'deploying'

export type RunnerMode = 'real' | 'simulation'

export interface EnvVariable {
  key: string
  value: string
  isSecret?: boolean
}

export type ArtifactType = 'auto' | 'docker' | 'tar'

export type DockerDeliveryMode = 'auto' | 'save_load' | 'registry'

/**
 * Docker 构建参数 (对应 Dockerfile ARG 指令)
 * 在 docker build 时通过 --build-arg KEY=VALUE 注入
 */
export interface DockerBuildArg {
  key: string
  value: string
}

export interface DockerRegistryConfig {
  enabled: boolean
  registryUrl: string
  namespace?: string
  username?: string
  password?: string
  defaultMode?: DockerDeliveryMode
}

/**
 * 端口映射定义（支持 Docker 容器宿主机端口与容器端口独立映射）
 * host: 宿主机外部暴露端口
 * container: 容器内部应用监听端口
 */
export interface PortMapping {
  host: number
  container: number
}

export interface Project {
  id: string
  name: string
  description?: string
  repository: string
  branch: string
  gitUsername?: string
  gitToken?: string
  runtime: RuntimeType
  deployTargetMode?: DeployTargetMode
  artifactType?: ArtifactType
  dockerDeliveryMode?: DockerDeliveryMode
  dockerBuildArgs?: DockerBuildArg[]
  dockerRegistry?: Partial<DockerRegistryConfig>
  status: ProjectStatus
  serverId?: string
  serverIp: string
  serverName: string
  serverTags?: string[]
  serverPort: number[]
  containerPort?: number[]
  portMappings?: PortMapping[]
  deployPath: string
  installCommand: string
  buildCommand: string
  startCommand: string
  healthCheckUrl?: string
  healthStatus?: HealthStatus
  lastHealthCheck?: HealthCheckResult
  envVars?: EnvVariable[]
  runnerMode: RunnerMode
  lastDeployed?: string
  lastCommitHash?: string
  lastCommitMessage?: string
  lastVersionTag?: string
  createdAt: string
  updatedAt: string
}

export type HealthStatus = 'healthy' | 'unhealthy' | 'unconfigured'

export interface HealthCheckResult {
  status: HealthStatus
  statusCode?: number
  responseTimeMs?: number
  message?: string
  checkedAt?: string
  url?: string
}

export type DeploymentStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'

export type TriggerType = 'manual' | 'webhook' | 'rollback'

export interface DeployLogEntry {
  id: string
  text: string
  type: 'info' | 'success' | 'error' | 'warning'
  step?: string
  timestamp: string
}

export interface Deployment {
  id: string
  projectId: string
  projectName: string
  branch: string
  commitHash?: string
  commitMessage?: string
  versionTag?: string
  triggerType: TriggerType
  status: DeploymentStatus
  currentStep?: string
  startTime: string
  endTime?: string
  durationSeconds?: number
  logs: DeployLogEntry[]
}

export type ServerStatus = 'online' | 'offline' | 'checking'

export type ServerAuthType = 'password' | 'privateKey'

export interface ServerEnvInfo {
  key: string
  name: string
  desc: string
  installed: boolean
  version?: string
  checkCmd: string
  installScript: string
  manualGuide: {
    ubuntu: string
    centos: string
  }
}

export interface ServerNode {
  id: string
  name: string
  ip: string
  port: number
  user: string
  authType: ServerAuthType
  password?: string
  privateKey?: string
  passphrase?: string
  status: ServerStatus
  lastChecked?: string
  latencyMs?: number
  tags?: string[]
  description?: string
  installedEnvs?: Record<string, { installed: boolean; version?: string }>
  hasPassword?: boolean
  hasPrivateKey?: boolean
}

export interface SystemSettings {
  platformName: string
  workspacePath: string
  artifactPath: string
  concurrencyLimit: number
  webhookNotificationUrl?: string
  webhookType?: 'dingtalk' | 'feishu' | 'wecom' | 'custom'
  notifyOnSuccess: boolean
  notifyOnFailure: boolean
  dockerRegistry?: DockerRegistryConfig
  enablePeriodicHealthCheck?: boolean
  healthCheckIntervalSeconds?: number

  // 产物与镜像生命周期自动清理配置
  enableArtifactCleanup?: boolean
  artifactRetentionDays?: number
  artifactMaxKeepPerProject?: number
  artifactCleanupIntervalHours?: number

  enableDockerImagePrune?: boolean
  dockerPruneDanglingOnly?: boolean
  dockerPruneRetentionHours?: number
  dockerPruneIntervalHours?: number

  lastArtifactCleanupAt?: string
  lastDockerPruneAt?: string
}

export interface DashboardStats {
  totalProjects: number
  activeServices: number
  stoppedServices: number
  errorServices: number
  successRate: number
  deploymentsToday: number
  totalServers: number
  onlineServers: number
}

export type NotificationType =
  | 'deployment'
  | 'health_check'
  | 'server'
  | 'cleanup'
  | 'project'
  | 'system'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface SystemNotification {
  id: string
  type: NotificationType
  level: NotificationLevel
  title: string
  message: string
  read: boolean
  createdAt: string
  metadata?: {
    projectId?: string
    projectName?: string
    deploymentId?: string
    serverId?: string
    serverName?: string
    link?: 'dashboard' | 'projects' | 'servers' | 'settings' | 'deployment' | 'project'
    [key: string]: any
  }
}


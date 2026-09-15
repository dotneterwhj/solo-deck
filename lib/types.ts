export type BuiltinRuntimeType =
  | 'Node.js'
  | 'Python'
  | 'ASP.NET Core'
  | 'Go'
  | 'Java'
  | 'Static Web'

export type RuntimeType = BuiltinRuntimeType | (string & {})

export type DeployTargetMode = 'docker' | 'native'

export type ProjectStatus = 'active' | 'stopped' | 'error' | 'deploying'

export type RunnerMode = 'real' | 'simulation'

export interface EnvVariable {
  key: string
  value: string
  isSecret?: boolean
}

export type ArtifactType = 'auto' | 'docker' | 'tar'

export type DockerDeliveryMode = 'save_load' | 'registry' | 'auto'

export interface DockerRegistryConfig {
  enabled: boolean
  registryUrl: string
  namespace?: string
  username?: string
  password?: string
  defaultMode?: DockerDeliveryMode
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
  dockerRegistry?: Partial<DockerRegistryConfig>
  status: ProjectStatus
  serverId?: string
  serverIp: string
  serverName: string
  serverTags?: string[]
  port: number
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
    link?: 'dashboard' | 'list' | 'servers' | 'settings' | 'deployment' | 'project'
    [key: string]: any
  }
}


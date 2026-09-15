export type DeployTargetMode = 'docker' | 'native'

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

export interface RuntimeEnvVarPreset {
  key: string
  value: string
  isSecret?: boolean
  description?: string
}

export interface IRuntimePlugin {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly description: string
  readonly defaultPort: number
  readonly baseImage: string

  // 原生目标机部署指令与环境依赖 (支持直接在目标机执行原生应用进程)
  readonly defaultNativeInstallCmd: string
  readonly defaultNativeBuildCmd: string
  readonly defaultNativeStartCmd: string
  readonly requiredNativeTools: string[]
  readonly nativeProcessManager: string
  readonly nativeRequirementDesc: string

  // Docker 容器化交付规范
  readonly dockerfileTemplate: string
  readonly dockerignoreTemplate: string
  readonly requiredDockerTools?: string[]

  readonly sampleEnvVars?: RuntimeEnvVarPreset[]
  readonly keyFeatures?: string[]
  readonly placementPath?: string

  getInstallCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string
  getBuildCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string
  getStartCommand(projectName?: string, port?: number, options?: { mode?: DeployTargetMode; versionTag?: string }): string
  getRequiredTools(mode?: DeployTargetMode): string[]
  toDockerfileTemplate(): DockerfileTemplate
}

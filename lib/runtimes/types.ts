export interface PortMapping {
  host: number
  container: number
}

export type DeployTargetMode = 'docker' | 'native'

/**
 * 运行时插件声明的 Docker 构建参数定义 (对应 Dockerfile 中的 ARG 指令)
 * 用户在创建项目流水线向导中可填写这些参数值，平台在 docker build 时自动注入 --build-arg
 */
export interface DockerBuildArgDefinition {
  /** 参数名称 (对应 Dockerfile ARG 名称) */
  key: string
  /** 默认值 (若 Dockerfile 中已有默认值) */
  defaultValue?: string
  /** 参数用途描述 (前端展示) */
  description: string
  /** 是否为必填参数 */
  required?: boolean
  /** 输入框占位提示 */
  placeholder?: string
}

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
  dockerBuildArgs?: DockerBuildArgDefinition[]
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
  /** 运行时插件声明的 Docker 构建参数列表 (对应 Dockerfile 中的 ARG 指令) */
  readonly dockerBuildArgs?: DockerBuildArgDefinition[]

  readonly sampleEnvVars?: RuntimeEnvVarPreset[]
  readonly keyFeatures?: string[]
  readonly placementPath?: string

  getInstallCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string
  getBuildCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string
  getStartCommand(
    projectName?: string,
    port?: number | number[] | PortMapping[],
    options?: {
      mode?: DeployTargetMode
      versionTag?: string
      envVars?: { key: string; value: string }[]
      containerPort?: number | number[]
      portMappings?: PortMapping[]
    }
  ): string
  getRequiredTools(mode?: DeployTargetMode): string[]
  toDockerfileTemplate(): DockerfileTemplate
}

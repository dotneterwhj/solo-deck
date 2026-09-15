import { DockerfileTemplate, IRuntimePlugin, RuntimeEnvVarPreset, DeployTargetMode } from './types'

export function toSafeSlug(name?: string): string {
  if (!name) return 'app'
  const trimmed = name.trim().toLowerCase()
  const slug = trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || 'app'
}

export abstract class BaseRuntimePlugin implements IRuntimePlugin {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly category: string
  abstract readonly description: string
  abstract readonly defaultPort: number
  abstract readonly baseImage: string

  // 原生部署指令与环境要求 (面向目标机原生执行应用进程)
  abstract readonly defaultNativeInstallCmd: string
  abstract readonly defaultNativeBuildCmd: string
  abstract readonly defaultNativeStartCmd: string
  abstract readonly requiredNativeTools: string[]
  readonly nativeProcessManager: string = '原生系统进程'
  readonly nativeRequirementDesc: string = '目标服务器需具备对应语言运行环境与依赖工具。'

  // Docker 容器化交付规范
  abstract readonly dockerfileTemplate: string
  abstract readonly dockerignoreTemplate: string
  readonly requiredDockerTools: string[] = ['docker']

  readonly sampleEnvVars?: RuntimeEnvVarPreset[]
  readonly keyFeatures?: string[] = []
  readonly placementPath: string = '项目代码根目录 / Dockerfile'

  getInstallCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string {
    const mode = options?.mode || 'docker'
    if (mode === 'native') {
      return this.defaultNativeInstallCmd
    }
    return `docker version`
  }

  getBuildCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string {
    const mode = options?.mode || 'docker'
    if (mode === 'native') {
      return this.defaultNativeBuildCmd
    }
    const slug = toSafeSlug(projectName)
    return `docker build -t ${slug}:latest .`
  }

  getStartCommand(projectName?: string, port?: number, options?: { mode?: DeployTargetMode; versionTag?: string }): string {
    const mode = options?.mode || 'docker'
    if (mode === 'native') {
      return this.defaultNativeStartCmd
    }
    const slug = toSafeSlug(projectName)
    const effectivePort = port || this.defaultPort
    return `docker run -d -p ${effectivePort}:${effectivePort} --name ${slug} ${slug}:latest`
  }

  getRequiredTools(mode: DeployTargetMode = 'docker'): string[] {
    if (mode === 'docker') {
      return this.requiredDockerTools
    }
    return this.requiredNativeTools
  }

  toDockerfileTemplate(): DockerfileTemplate {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      description: this.description,
      defaultPort: String(this.defaultPort),
      baseImage: this.baseImage,
      placementPath: this.placementPath,
      sampleBuildCmd: this.getBuildCommand('app', { mode: 'docker' }),
      sampleStartCmd: this.getStartCommand('app', this.defaultPort, { mode: 'docker' }),
      keyFeatures: this.keyFeatures || [],
      dockerfile: this.dockerfileTemplate,
      dockerignore: this.dockerignoreTemplate,
    }
  }
}

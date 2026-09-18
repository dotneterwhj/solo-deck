import { runtimeRegistry } from './registry'
import { NodeJSRuntimePlugin } from './plugins/nodejs'
import { PythonRuntimePlugin } from './plugins/python'
import { GolangRuntimePlugin } from './plugins/golang'
import { JavaRuntimePlugin } from './plugins/java'
import { DotnetRuntimePlugin } from './plugins/dotnet'
import { StaticWebRuntimePlugin } from './plugins/static'
import { IRuntimePlugin, DeployTargetMode } from './types'
import { getCarrierCommandStrategy } from '../carriers/command-strategy'

// 初始化注册预置的多语言运行时插件 (Docker 为部署载体，非语言运行时)
runtimeRegistry
  .register(new NodeJSRuntimePlugin())
  .register(new PythonRuntimePlugin())
  .register(new GolangRuntimePlugin())
  .register(new JavaRuntimePlugin())
  .register(new DotnetRuntimePlugin())
  .register(new StaticWebRuntimePlugin())

/**
 * 注册新运行时插件（扩展点：新增运行时只需编写实现 IRuntimePlugin 并调用此函数）
 */
export function registerRuntime(plugin: IRuntimePlugin): void {
  runtimeRegistry.register(plugin)
}

/**
 * 获取指定运行时插件
 */
export function getRuntime(idOrName?: string): IRuntimePlugin | undefined {
  return runtimeRegistry.get(idOrName)
}

/**
 * 获取所有可用运行时插件列表
 */
export function getAllRuntimes(): IRuntimePlugin[] {
  return runtimeRegistry.getAll()
}

/**
 * 获取所有运行时的 Dockerfile 模板
 */
export function getDockerfileTemplates() {
  return runtimeRegistry.toDockerfileTemplates()
}

/**
 * 获取指定运行时在特定部署模式下所需的目标主机环境依赖
 * - 针对 Docker 容器部署模式（当前默认）：目标服务器仅需依赖 'docker'
 * - 针对 Native 原生部署模式（预留扩展）：目标服务器依赖对应语言工具（如 node/pm2, python, dotnet）
 */
export function getRequiredEnvKeysForRuntime(runtimeName?: string, mode: DeployTargetMode = 'docker'): string[] {
  const plugin = runtimeRegistry.get(runtimeName)
  const strategy = getCarrierCommandStrategy(mode)
  return strategy.getRequiredTools(plugin)
}

export { runtimeRegistry }
export * from './types'
export * from './base'
export * from './plugins/nodejs'
export * from './plugins/python'
export * from './plugins/golang'
export * from './plugins/java'
export * from './plugins/dotnet'
export * from './plugins/static'

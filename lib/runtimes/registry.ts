import { DockerfileTemplate, IRuntimePlugin } from './types'

export class RuntimeRegistry {
  private pluginsById: Map<string, IRuntimePlugin> = new Map()
  private pluginsByName: Map<string, IRuntimePlugin> = new Map()

  /**
   * 注册一个新的运行时插件
   */
  public register(plugin: IRuntimePlugin): this {
    const idKey = plugin.id.trim().toLowerCase()
    const nameKey = plugin.name.trim().toLowerCase()

    this.pluginsById.set(idKey, plugin)
    this.pluginsByName.set(nameKey, plugin)
    return this
  }

  /**
   * 注销指定 ID 的运行时
   */
  public unregister(id: string): boolean {
    const idKey = id.trim().toLowerCase()
    const plugin = this.pluginsById.get(idKey)
    if (plugin) {
      this.pluginsById.delete(idKey)
      this.pluginsByName.delete(plugin.name.trim().toLowerCase())
      return true
    }
    return false
  }

  /**
   * 按 ID 或名称检索运行时插件（不区分大小写）
   */
  public get(idOrName?: string): IRuntimePlugin | undefined {
    if (!idOrName) return undefined
    const key = idOrName.trim().toLowerCase()
    return this.pluginsById.get(key) || this.pluginsByName.get(key)
  }

  /**
   * 检查是否存在特定运行时
   */
  public has(idOrName?: string): boolean {
    return !!this.get(idOrName)
  }

  /**
   * 获取所有已注册的运行时插件列表
   */
  public getAll(): IRuntimePlugin[] {
    const seen = new Set<string>()
    const result: IRuntimePlugin[] = []

    for (const plugin of this.pluginsById.values()) {
      if (!seen.has(plugin.id)) {
        seen.add(plugin.id)
        result.push(plugin)
      }
    }
    return result
  }

  /**
   * 获取默认运行时（默认为 Docker）
   */
  public getDefault(): IRuntimePlugin {
    return this.get('docker') || this.getAll()[0]
  }

  /**
   * 导出为 DockerfileTemplate 数组（供 UI 向导与文档直接使用）
   */
  public toDockerfileTemplates(): DockerfileTemplate[] {
    return this.getAll().map((p) => p.toDockerfileTemplate())
  }
}

export const runtimeRegistry = new RuntimeRegistry()

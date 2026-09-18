import { IPipelineCarrier } from './types'
import { DockerCarrier } from './docker'
import { NativeCarrier } from './native'

/**
 * 流水线部署载体注册中心 (CarrierRegistry)
 * 采用策略模式与注册中心模式，统一管理 Docker、Native 以及将来扩展的 Docker Compose 等交付载体
 */
export class CarrierRegistry {
  private static instance: CarrierRegistry
  private carriers: Map<string, IPipelineCarrier> = new Map()

  private constructor() {
    // 默认内置注册 Docker 与 Native 交付载体
    this.register(new DockerCarrier())
    this.register(new NativeCarrier())
  }

  public static getInstance(): CarrierRegistry {
    if (!CarrierRegistry.instance) {
      CarrierRegistry.instance = new CarrierRegistry()
    }
    return CarrierRegistry.instance
  }

  /**
   * 注册新的部署载体驱动 (如将来扩展的 Docker Compose 驱动)
   */
  public register(carrier: IPipelineCarrier): void {
    this.carriers.set(carrier.mode, carrier)
  }

  /**
   * 根据部署载体模式获取对应的执行驱动，未匹配时默认降级回退至 docker 容器载体
   */
  public get(mode?: string): IPipelineCarrier {
    const key = (mode || 'docker').toLowerCase()
    const carrier = this.carriers.get(key)
    if (carrier) {
      return carrier
    }
    const defaultCarrier = this.carriers.get('docker')
    if (defaultCarrier) {
      return defaultCarrier
    }
    throw new Error(`未找到载体模式 [${mode}] 对应的执行驱动，且默认载体未就绪`)
  }

  /**
   * 判断指定载体驱动是否已注册
   */
  public has(mode: string): boolean {
    return this.carriers.has(mode.toLowerCase())
  }

  /**
   * 获取所有已注册的载体驱动列表
   */
  public getAll(): IPipelineCarrier[] {
    return Array.from(this.carriers.values())
  }
}

export const carrierRegistry = CarrierRegistry.getInstance()

export function getCarrier(mode?: string): IPipelineCarrier {
  return carrierRegistry.get(mode)
}

export function registerCarrier(carrier: IPipelineCarrier): void {
  carrierRegistry.register(carrier)
}

import { Project, EnvVariable, PortMapping } from '../types'
import { IRuntimePlugin } from '../runtimes/types'
import {
  CarrierContext,
  CarrierSimulateContext,
  IPipelineCarrier,
  CarrierMode,
} from './types'
import { getCarrierCommandStrategy, ICarrierCommandStrategy } from './command-strategy'

/**
 * Pipeline 载体抽象基类，提供通用的工具方法与默认行为骨架
 */
export abstract class BaseCarrier implements IPipelineCarrier {
  abstract readonly mode: CarrierMode
  abstract readonly name: string

  protected get commandStrategy(): ICarrierCommandStrategy {
    return getCarrierCommandStrategy(this.mode)
  }

  getInstallCommand(runtime: IRuntimePlugin, projectName?: string): string {
    return this.commandStrategy.getInstallCommand(runtime, projectName)
  }

  getBuildCommand(runtime: IRuntimePlugin, projectName?: string): string {
    return this.commandStrategy.getBuildCommand(runtime, projectName)
  }

  getStartCommand(
    runtime: IRuntimePlugin,
    projectName?: string,
    ports?: PortMapping[] | number[] | number,
    envVars?: EnvVariable[]
  ): string {
    return this.commandStrategy.getStartCommand(runtime, projectName, ports, envVars)
  }

  updateStartCommandOnPortChange(
    currentCmd: string,
    newPorts: number[] | PortMapping[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    envVars?: EnvVariable[],
    oldPorts?: number[]
  ): string {
    return this.commandStrategy.updateStartCommandOnPortChange(
      currentCmd,
      newPorts,
      isCustomized,
      runtime,
      slug,
      envVars,
      oldPorts
    )
  }

  updateStartCommandOnEnvChange(
    currentCmd: string,
    updatedEnvVars: EnvVariable[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    ports?: number[] | PortMapping[]
  ): string {
    return this.commandStrategy.updateStartCommandOnEnvChange(
      currentCmd,
      updatedEnvVars,
      isCustomized,
      runtime,
      slug,
      ports
    )
  }

  getRequiredTools(runtime?: IRuntimePlugin): string[] {
    return this.commandStrategy.getRequiredTools(runtime)
  }

  abstract onAfterCheckout(ctx: CarrierContext): Promise<void>
  abstract executeBuild(ctx: CarrierContext): Promise<void>
  abstract deployLocal(ctx: CarrierContext): Promise<void>
  abstract deployRemote(ctx: CarrierContext): Promise<void>

  abstract simulateAfterCheckout(ctx: CarrierSimulateContext): Promise<void>
  abstract simulateBuild(ctx: CarrierSimulateContext): Promise<void>
  abstract simulateDeploy(ctx: CarrierSimulateContext): Promise<void>
  abstract simulateStart(ctx: CarrierSimulateContext): Promise<void>

  /**
   * 格式化项目配置的端口显示
   */
  protected formatPortsDisplay(project: Project): string {
    if (project.portMappings && project.portMappings.length > 0) {
      return project.portMappings.map((m) => `:${m.host}➔:${m.container}`).join(' ')
    }
    if (project.serverPort && project.serverPort.length > 0) {
      return project.serverPort.map((p) => `:${p}`).join(' ')
    }
    return ':3000'
  }
}

/**
 * ============================================================================
 * Pipeline 交付载体架构 (Pipeline Carrier Architecture)
 * ============================================================================
 * 架构说明：
 * 1. 本模块将【语言运行时 (Runtime)】与【部署载体 (Carrier: docker | native | docker_compose)】彻底正交解耦。
 * 2. IPipelineCarrier 封装了特定部署载体的全生命周期钩子：
 *    - onAfterCheckout: 检出后版本标签生成与初始化
 *    - executeBuild: 应用构建与载体专属配置（如 Dockerfile/ARG 校验或原生编译）
 *    - deployLocal: 本机节点启动调度与同名容器/进程管理
 *    - deployRemote: 远程主机产物分发（镜像分发/tar包直传/compose文件推送）与服务拉起
 *    - simulate*: 沙箱安全模拟流转钩子
 *
 * 3. 方便将来扩展 Docker Compose：
 *    - 编写新类继承 BaseCarrier 并实现 IPipelineCarrier：
 *        export class DockerComposeCarrier extends BaseCarrier {
 *          readonly mode = 'docker_compose'
 *          readonly name = 'Docker Compose 多容器交付'
 *          ...
 *        }
 *    - 调用 registerCarrier(new DockerComposeCarrier())
 *    - 流水线调度器 (PipelineManager) 将全自动适配，无需改动核心生命周期逻辑！
 * ============================================================================
 */

export * from './types'
export * from './base'
export * from './registry'
export * from './docker'
export * from './native'
export * from './command-strategy'

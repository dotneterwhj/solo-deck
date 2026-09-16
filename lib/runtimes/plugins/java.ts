import { BaseRuntimePlugin } from '../base'
import { RuntimeEnvVarPreset, DeployTargetMode, PortMapping } from '../types'

export class JavaRuntimePlugin extends BaseRuntimePlugin {
  override getStartCommand(
    projectName?: string,
    port?: number | number[] | PortMapping[],
    options?: {
      mode?: DeployTargetMode
      versionTag?: string
      envVars?: { key: string; value: string }[]
      containerPort?: number | number[]
      portMappings?: PortMapping[]
    }
  ): string {
    if (options?.mode === 'native') {
      const p = this.extractNativePort(port)
      return `java -Dserver.port=${p} -jar target/*.jar || java -Dserver.port=${p} -jar target/app.jar || java -Dserver.port=${p} -jar app.jar`
    }
    return super.getStartCommand(projectName, port, options)
  }

  readonly id = 'java'
  readonly name = 'Java'
  readonly category = 'Java'
  readonly description = '适用于 Spring Boot 2.x / 3.x, Spring Cloud 企业级微服务应用，内置容器内存感知与时区设置。'
  readonly defaultPort = 8080
  readonly baseImage = 'eclipse-temurin:17-jre-alpine'
  readonly defaultNativeInstallCmd = 'mvn dependency:resolve'
  readonly defaultNativeBuildCmd = 'mvn clean package -DskipTests'
  readonly defaultNativeStartCmd = 'java -jar target/app.jar'
  readonly requiredNativeTools = ['java']
  override readonly nativeProcessManager = 'Java JRE / Spring Boot 进程'
  override readonly nativeRequirementDesc = '目标服务器需安装 Java JRE/JDK 运行环境 (推荐 OpenJDK 17 或 21)。'
  readonly keyFeatures = [
    'Maven 编译打包与 JRE 运行分离，运行镜像极轻量',
    '内置中国上海时区 (Asia/Shanghai) 修复日志时间差',
    '配置 JVM 容器感知内存参数 (-XX:MaxRAMPercentage=75.0)',
    '自动扫描 target/*.jar 避免强依赖特定 jar 文件名',
  ]
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'JAVA_OPTS', value: '-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0', description: 'JVM 参数' },
    { key: 'PORT', value: '8080', description: '服务端口' },
  ]

  readonly dockerfileTemplate = `# ===================================================
# Java (Spring Boot) 多阶段构建与轻量化运行模板
# 适用: Spring Boot 2.x / 3.x, Spring Cloud 微服务
# 放置路径: 代码仓库根目录 / Dockerfile (与 pom.xml 同级)
# ===================================================

# 阶段 1: Maven 源码编译与打包
FROM maven:3.9-eclipse-temurin-17-alpine AS builder
WORKDIR /app

# 优先复制 pom.xml 预下载基础依赖
COPY pom.xml .
RUN mvn dependency:go-offline -B || true

# 复制项目源代码
COPY src ./src

# 执行打包并跳过单元测试
RUN mvn clean package -DskipTests

# 阶段 2: 极轻量 JRE 运行时
FROM eclipse-temurin:17-jre-alpine AS runner
WORKDIR /app

# 矫正时区为中国标准时间 (CST/UTC+8)
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \\
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \\
    echo $TZ > /etc/timezone

# 从构建器中复制生成的 Spring Boot 可执行 jar 包
COPY --from=builder /app/target/*.jar app.jar

# 暴露 Spring Boot 默认服务端口
EXPOSE 8080

# JVM 内存限制与优化参数 (适配 Docker 容器限制)
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

# 启动 Spring Boot 微服务
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
`

  readonly dockerignoreTemplate = `# 版本控制
.git
.gitignore
.idea
*.iml
.vscode

# Maven 构建产物与临时文件
target/
*.log
.mvn/wrapper/maven-wrapper.jar
`
}

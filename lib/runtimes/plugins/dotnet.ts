import { BaseRuntimePlugin, toSafeSlug } from '../base'
import { RuntimeEnvVarPreset, DockerBuildArgDefinition, PortMapping } from '../types'

export class DotnetRuntimePlugin extends BaseRuntimePlugin {
  override getNativeStartCommand(projectName?: string, port?: number | number[] | PortMapping[]): string {
    const p = this.extractNativePort(port)
    const slug = projectName ? toSafeSlug(projectName) : 'app'
    return `ASPNETCORE_URLS=http://0.0.0.0:${p} dotnet ./publish/${slug}.dll || ASPNETCORE_URLS=http://0.0.0.0:${p} dotnet ./publish/app.dll || dotnet ./publish/*.dll`
  }

  readonly id = 'dotnet'
  readonly name = 'ASP.NET Core'
  readonly category = '.NET'
  readonly description = '适用于 C# 企业级微服务、ASP.NET Core Web API 与高性能后端服务。'
  readonly defaultPort = 8080
  readonly baseImage = 'mcr.microsoft.com/dotnet/aspnet:8.0'
  readonly defaultNativeInstallCmd = 'dotnet restore'
  readonly defaultNativeBuildCmd = 'dotnet publish -c Release -o ./publish'
  readonly defaultNativeStartCmd = 'dotnet ./publish/app.dll'
  readonly requiredNativeTools = ['dotnet']
  override readonly nativeProcessManager = 'ASP.NET Core / .NET CLR 进程'
  override readonly nativeRequirementDesc = '目标服务器需安装 ASP.NET Core Runtime (.NET 8.0/7.0) 运行环境。'

  /** Docker 构建参数定义：PROJECT (.csproj 路径) 与 DOTNET_VERSION (SDK/Runtime 版本) */
  override readonly dockerBuildArgs: DockerBuildArgDefinition[] = [
    {
      key: 'PROJECT',
      description: '项目 .csproj 文件相对路径 (相对于代码仓库根目录)',
      required: true,
      placeholder: 'src/MyApp/MyApp.csproj',
    },
    {
      key: 'DOTNET_VERSION',
      defaultValue: '8.0',
      description: '.NET SDK / Runtime 版本号',
      placeholder: '8.0',
    },
  ]
  readonly keyFeatures = [
    '多阶段构建: SDK 打包发布 ➔ 纯轻量 ASP.NET Core 运行镜像',
    '通用化模板: 支持声明 ARG PROJECT (.csproj 路径) 与 ARG DOTNET_VERSION 版本',
    '支持多项目 .sln 解决方案 (多 .csproj 分布于不同子目录)',
    'NuGet 依赖层优先缓存，加快重复构建速度',
    '时区配置与默认 8080 端口绑定',
  ]
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'ASPNETCORE_ENVIRONMENT', value: 'Production', description: 'ASP.NET 环境' },
    { key: 'ASPNETCORE_URLS', value: 'http://+:8080', description: '监听地址' },
  ]

  readonly dockerfileTemplate = `# ===================================================
# .NET (ASP.NET Core) 企业级生产模板
# 支持: 多项目 .sln 解决方案 (多 .csproj 分布于不同子目录)
# 放置路径: 代码仓库根目录 / Dockerfile (与 *.sln 同级)
# ===================================================

# 阶段 1: 编译与发布
ARG DOTNET_VERSION=8.0
FROM mcr.microsoft.com/dotnet/sdk:\${DOTNET_VERSION} AS builder
WORKDIR /src

ARG PROJECT

COPY . .

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \\
    dotnet restore "$PROJECT"

RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \\
    dotnet publish "$PROJECT" \\
    -c Release \\
    -o /app/publish \\
    --no-restore

RUN echo "$(basename "$PROJECT" .csproj).dll" > /app/publish/.entrypoint

# 阶段 2: 生产运行环境
ARG DOTNET_VERSION
FROM mcr.microsoft.com/dotnet/aspnet:\${DOTNET_VERSION} AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tzdata \\
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \\
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:8080 \\
    TZ=Asia/Shanghai

COPY --from=builder /app/publish .

RUN DLL=$(cat /app/.entrypoint) && \\
    printf '#!/bin/sh\\nexec dotnet "%s"\\n' "$DLL" > /app/entrypoint.sh && \\
    chmod +x /app/entrypoint.sh && \\
    rm /app/.entrypoint

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
`

  readonly dockerignoreTemplate = `# 版本控制
.git
.gitignore
.vs
.vscode

# 构建输出
bin/
obj/
*.user
`
}

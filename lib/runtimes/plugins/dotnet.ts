import { BaseRuntimePlugin, toSafeSlug } from '../base'
import { RuntimeEnvVarPreset } from '../types'

export class DotnetRuntimePlugin extends BaseRuntimePlugin {
  override getStartCommand(projectName?: string, port?: number, options?: { mode?: 'docker' | 'native'; versionTag?: string }): string {
    if (options?.mode === 'native') {
      const p = port || this.defaultPort
      const slug = projectName ? toSafeSlug(projectName) : 'app'
      return `ASPNETCORE_URLS=http://0.0.0.0:${p} dotnet ./publish/${slug}.dll || ASPNETCORE_URLS=http://0.0.0.0:${p} dotnet ./publish/app.dll || dotnet ./publish/*.dll`
    }
    return super.getStartCommand(projectName, port, options)
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
  readonly keyFeatures = [
    '多阶段构建: SDK 打包发布 ➔ 纯轻量 ASP.NET Core 运行镜像',
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
# 适用: C# .NET 8.0 / 7.0 Web API 与微服务
# 支持: 多项目 .sln 解决方案 (多 .csproj 分布于不同子目录)
# 放置路径: 代码仓库根目录 / Dockerfile (与 *.sln 同级)
# ===================================================

# 阶段 1: 编译与发布
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /source

# 1. 先复制 .sln 与 NuGet 配置
COPY *.sln ./
COPY NuGet.Config* nuget.config* ./

# 2. 复制所有 .csproj 并保留目录结构 (支持多项目解决方案)
#    这一步将各子目录的 .csproj 原样映射到构建上下文中，
#    使 dotnet restore 能正确解析 .sln 中的项目引用关系。
COPY **/*.csproj ./tmp/
RUN for file in ./tmp/*.csproj; do \\
      dir=$(basename "$file" .csproj); \\
      mkdir -p "$dir"; \\
      mv "$file" "$dir/"; \\
    done && rm -rf ./tmp

# 3. 如果上述通配不适用于您的目录结构，可替换为按项目手动 COPY：
#    COPY src/WebApi/WebApi.csproj          src/WebApi/
#    COPY src/Application/Application.csproj src/Application/
#    COPY src/Domain/Domain.csproj          src/Domain/

RUN dotnet restore

# 4. 复制所有源码并发布 Release 版本
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# 阶段 2: 生产运行环境
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tzdata \\
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \\
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8080 \\
    TZ=Asia/Shanghai

COPY --from=builder /app/publish .

EXPOSE 8080

# 请将 App.dll 替换为您项目的实际主入口程序集名称
ENTRYPOINT ["dotnet", "App.dll"]
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

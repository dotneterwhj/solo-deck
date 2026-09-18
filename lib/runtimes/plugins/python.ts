import { BaseRuntimePlugin } from '../base'
import { RuntimeEnvVarPreset, PortMapping } from '../types'

export class PythonRuntimePlugin extends BaseRuntimePlugin {
  override getNativeStartCommand(_projectName?: string, port?: number | number[] | PortMapping[]): string {
    const p = this.extractNativePort(port)
    return `gunicorn -w 4 -b 0.0.0.0:${p} main:app --daemon || gunicorn -w 4 -b 0.0.0.0:${p} app:app --daemon`
  }

  readonly id = 'python'
  readonly name = 'Python'
  readonly category = 'Python'
  readonly description = '适用于 FastAPI, Flask, Django 高性能 Web 服务，采用 Gunicorn/Uvicorn 生产级托管。'
  readonly defaultPort = 5000
  readonly baseImage = 'python:3.11-slim'
  readonly defaultNativeInstallCmd = 'pip install -r requirements.txt'
  readonly defaultNativeBuildCmd = 'python -m compileall .'
  readonly defaultNativeStartCmd = 'gunicorn -w 4 -b 0.0.0.0:5000 main:app --daemon || gunicorn -w 4 -b 0.0.0.0:5000 app:app --daemon'
  readonly requiredNativeTools = ['python3', 'gunicorn']
  override readonly nativeProcessManager = 'Gunicorn / Python 3 托管'
  override readonly nativeRequirementDesc = '目标服务器需安装 Python 3 环境及 Gunicorn (WSGI) 守护工具。'
  readonly keyFeatures = [
    '基于 python:3.11-slim 纯净镜像，无多余依赖',
    '禁用 .pyc 生成与启用 stdout/stderr 实时无缓冲日志',
    '包含 pip 清华/阿里镜像源加速依赖拉取',
    '内置 Gunicorn 多进程 + Uvicorn 异步工作进程',
  ]
  readonly sampleEnvVars: RuntimeEnvVarPreset[] = [
    { key: 'PYTHONUNBUFFERED', value: '1', description: '禁用日志缓冲' },
    { key: 'PORT', value: '5000', description: '服务监听端口' },
  ]

  readonly dockerfileTemplate = `# ===================================================
# Python Web 生产环境标准镜像模板
# 适用: FastAPI, Flask, Django, Tornado
# 放置路径: 代码仓库根目录 / Dockerfile (与 requirements.txt 同级)
# ===================================================

FROM python:3.11-slim AS runner

# 环境参数优化: 禁止生成 pyc，开启标准输出无缓冲实时日志
ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    TZ=Asia/Shanghai

WORKDIR /app

# 安装基础运行工具与时区
RUN apt-get update && apt-get install -y --no-install-recommends \\
    tzdata curl \\
    && ln -fs /usr/share/zoneinfo/$TZ /etc/localtime \\
    && echo $TZ > /etc/timezone \\
    && rm -rf /var/lib/apt/lists/*

# 优先安装 pip 依赖，使用清华镜像加速
COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 复制项目源代码
COPY . .

# 创建非 root 用户
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# 暴露服务端口
EXPOSE 5000

# 启动指令 (示例: FastAPI / Flask + Gunicorn)
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:5000", "main:app"]
`

  readonly dockerignoreTemplate = `# 版本控制
.git
.gitignore
.idea
.vscode

# Python 缓存与虚拟环境
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
.env
.pytest_cache/
`
}

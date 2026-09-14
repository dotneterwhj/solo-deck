export interface EnvPresetItem {
  key: string
  name: string
  desc: string
  checkCmd: string
  installScript: string
  manualGuide: {
    ubuntu: string
    centos: string
  }
}

export const ENV_PRESETS: EnvPresetItem[] = [
  {
    key: 'node',
    name: 'Node.js 运行时',
    desc: 'JavaScript / TypeScript 应用运行环境 (推荐 Node.js v20 LTS)',
    checkCmd: 'node -v',
    installScript: `if command -v apt-get >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
elif command -v yum >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs
else
  echo "未检测到支持的包管理器 (apt/yum)" && exit 1
fi`,
    manualGuide: {
      ubuntu: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\nsudo apt-get install -y nodejs',
      centos: 'curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -\nsudo yum install -y nodejs',
    },
  },
  {
    key: 'pm2',
    name: 'PM2 进程守护工具',
    desc: '用于 Node.js / Python 应用的后台持久化、自动重启与负载均衡',
    checkCmd: 'pm2 -v',
    installScript: `if command -v npm >/dev/null 2>&1; then
  npm install -g pm2
else
  echo "请先安装 Node.js/npm 后再安装 PM2" && exit 1
fi`,
    manualGuide: {
      ubuntu: 'sudo npm install -g pm2',
      centos: 'sudo npm install -g pm2',
    },
  },
  {
    key: 'python3',
    name: 'Python 3 与 pip',
    desc: 'Python 应用运行环境及 pip 包管理工具',
    checkCmd: 'python3 --version && pip3 --version',
    installScript: `if command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y python3 python3-pip python3-venv
elif command -v yum >/dev/null 2>&1; then
  yum install -y python3 python3-pip
else
  echo "未检测到支持的包管理器" && exit 1
fi`,
    manualGuide: {
      ubuntu: 'sudo apt update && sudo apt install -y python3 python3-pip python3-venv',
      centos: 'sudo yum install -y python3 python3-pip',
    },
  },
  {
    key: 'gunicorn',
    name: 'Gunicorn (WSGI 容器)',
    desc: '适用于 FastAPI / Flask / Django 应用的高并发 WSGI/ASGI HTTP 服务容器',
    checkCmd: 'gunicorn --version',
    installScript: `if command -v pip3 >/dev/null 2>&1; then
  pip3 install gunicorn
elif command -v pip >/dev/null 2>&1; then
  pip install gunicorn
else
  echo "请先安装 python3-pip" && exit 1
fi`,
    manualGuide: {
      ubuntu: 'pip3 install gunicorn',
      centos: 'pip3 install gunicorn',
    },
  },
  {
    key: 'dotnet',
    name: '.NET Core 运行时/SDK',
    desc: '用于运行 ASP.NET Core 与 C# 服务的托管环境 (.NET 8.0)',
    checkCmd: 'dotnet --version',
    installScript: `if command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y dotnet-sdk-8.0
elif command -v yum >/dev/null 2>&1; then
  yum install -y dotnet-sdk-8.0
else
  echo "未检测到支持的包管理器" && exit 1
fi`,
    manualGuide: {
      ubuntu: 'sudo apt update && sudo apt install -y dotnet-sdk-8.0',
      centos: 'sudo yum install -y dotnet-sdk-8.0',
    },
  },
  {
    key: 'docker',
    name: 'Docker 容器引擎',
    desc: '用于容器化构建、镜像打包与隔离运行微服务容器',
    checkCmd: 'docker -v',
    installScript: `curl -fsSL https://get.docker.com | sh && systemctl enable --now docker`,
    manualGuide: {
      ubuntu: 'curl -fsSL https://get.docker.com | sudo sh\nsudo systemctl enable --now docker',
      centos: 'curl -fsSL https://get.docker.com | sudo sh\nsudo systemctl enable --now docker',
    },
  },
  {
    key: 'git',
    name: 'Git 版本控制工具',
    desc: '用于在目标服务器拉取代码与版本检出',
    checkCmd: 'git --version',
    installScript: `if command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y git
elif command -v yum >/dev/null 2>&1; then
  yum install -y git
else
  echo "未检测到支持的包管理器" && exit 1
fi`,
    manualGuide: {
      ubuntu: 'sudo apt update && sudo apt install -y git',
      centos: 'sudo yum install -y git',
    },
  },
]

/**
 * 根据项目运行时类型匹配其前置依赖项
 */
export function getRequiredEnvKeys(runtime: string): string[] {
  switch (runtime) {
    case 'Node.js':
      return ['node', 'git']
    case 'Python':
      return ['python3', 'gunicorn', 'git']
    case 'ASP.NET Core':
      return ['dotnet', 'git']
    case 'Docker':
      return ['docker', 'git']
    case 'Go':
      return ['git']
    default:
      return ['git']
  }
}

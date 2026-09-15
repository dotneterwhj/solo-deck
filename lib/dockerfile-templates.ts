import { getDockerfileTemplates, DockerfileTemplate } from './runtimes'

export type { DockerfileTemplate }

export const DOCKERFILE_TEMPLATES: DockerfileTemplate[] = getDockerfileTemplates()

export const DOCKER_PLACEMENT_GUIDELINES = {
  title: 'Docker 容器化部署操作指南',
  summary: 'CDPipeline 采用标准 Docker 构建机制。为确保流水线能顺利完成构建，请遵循以下规范将 Dockerfile 放入项目中：',
  steps: [
    {
      step: 1,
      title: '在项目代码根目录下创建文件',
      desc: '文件名必须精确命名为 Dockerfile（首字母大写或全小写，不能有 .txt 等后缀）。必须位于与 package.json / pom.xml / requirements.txt / go.mod 相同的根目录下。',
      codeSnippet: `your-project-repository/
├── Dockerfile            # <=== 必须放在代码仓库根目录
├── .dockerignore         # <=== 建议配置，排除构建无用文件
├── package.json          # (或 pom.xml / requirements.txt / go.mod)
└── src/
    └── index.ts`,
    },
    {
      step: 2,
      title: '复制并调整模板内容',
      desc: '在下方选择您的项目技术栈（Node.js / Java / Python / Go 等），复制标准模板。根据您的项目入口文件及所需暴露的端口（EXPOSE）进行微调。',
    },
    {
      step: 3,
      title: '提交并推送到 Git 远程分支',
      desc: '在本地终端中将 Dockerfile 和 .dockerignore 提交至 Git 仓库，并推送至远程部署分支。',
      command: `git add Dockerfile .dockerignore\ngit commit -m "feat: add Dockerfile for containerized deployment"\ngit push origin main`,
    },
    {
      step: 4,
      title: '确保端口映射配置一致',
      desc: '项目配置中的端口（如 8080）需与 Dockerfile 中的 EXPOSE 端口保持一致。平台启动容器时将自动映射宿主机端口。',
    },
  ],
}

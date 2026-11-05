-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "gitUsername" TEXT,
    "gitToken" TEXT,
    "runtime" TEXT NOT NULL,
    "deployTargetMode" TEXT DEFAULT 'docker',
    "artifactType" TEXT DEFAULT 'auto',
    "dockerDeliveryMode" TEXT DEFAULT 'auto',
    "dockerBuildArgs" TEXT,
    "dockerRegistry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "serverId" TEXT,
    "serverIp" TEXT NOT NULL DEFAULT '127.0.0.1',
    "serverName" TEXT NOT NULL DEFAULT '默认服务器',
    "serverTags" TEXT,
    "serverPort" TEXT NOT NULL DEFAULT '[3000]',
    "containerPort" TEXT,
    "portMappings" TEXT,
    "deployPath" TEXT NOT NULL DEFAULT '/opt/app',
    "installCommand" TEXT NOT NULL DEFAULT 'npm install',
    "buildCommand" TEXT NOT NULL DEFAULT 'npm run build',
    "startCommand" TEXT NOT NULL DEFAULT 'npm start',
    "healthCheckUrl" TEXT,
    "healthStatus" TEXT DEFAULT 'unconfigured',
    "lastHealthCheck" TEXT,
    "envVars" TEXT,
    "runnerMode" TEXT NOT NULL DEFAULT 'simulation',
    "lastDeployed" TEXT,
    "lastCommitHash" TEXT,
    "lastCommitMessage" TEXT,
    "lastVersionTag" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitHash" TEXT,
    "commitMessage" TEXT,
    "versionTag" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStep" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "durationSeconds" INTEGER,
    "logs" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TEXT
);

-- CreateTable
CREATE TABLE "ServerNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "user" TEXT NOT NULL DEFAULT 'root',
    "authType" TEXT NOT NULL DEFAULT 'password',
    "password" TEXT,
    "privateKey" TEXT,
    "passphrase" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastChecked" TEXT,
    "latencyMs" INTEGER,
    "tags" TEXT,
    "description" TEXT,
    "installedEnvs" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "platformName" TEXT NOT NULL DEFAULT 'Solo Deck 平台',
    "workspacePath" TEXT NOT NULL,
    "artifactPath" TEXT NOT NULL,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 5,
    "webhookNotificationUrl" TEXT,
    "webhookType" TEXT DEFAULT 'dingtalk',
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "dockerRegistry" TEXT,
    "enablePeriodicHealthCheck" BOOLEAN DEFAULT true,
    "healthCheckIntervalSeconds" INTEGER DEFAULT 30,
    "enableArtifactCleanup" BOOLEAN DEFAULT true,
    "artifactRetentionDays" INTEGER DEFAULT 7,
    "artifactMaxKeepPerProject" INTEGER DEFAULT 5,
    "artifactCleanupIntervalHours" INTEGER DEFAULT 24,
    "enableDockerImagePrune" BOOLEAN DEFAULT true,
    "dockerPruneDanglingOnly" BOOLEAN DEFAULT true,
    "dockerPruneRetentionHours" INTEGER DEFAULT 72,
    "dockerPruneIntervalHours" INTEGER DEFAULT 24,
    "lastArtifactCleanupAt" TEXT,
    "lastDockerPruneAt" TEXT
);

-- CreateTable
CREATE TABLE "SystemNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TEXT NOT NULL,
    "metadata" TEXT
);

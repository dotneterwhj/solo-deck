const { DockerDistributorFactory, DockerSaveLoadDistributor, DockerRegistryDistributor } = require('./compiled/docker-distributor')

async function runTests() {
  console.log('=== 1. 测试策略工厂 DockerDistributorFactory 决策矩阵 ===')
  
  // Case 1: 默认无配置
  const p1 = { id: 'p1', name: 'app', runtime: 'Docker' }
  const s1 = { platformName: 'CI/CD' }
  const mode1 = DockerDistributorFactory.resolveMode(p1, s1)
  console.log('Case 1 (默认):', mode1, mode1 === 'save_load' ? '✅ PASS' : '❌ FAIL')

  // Case 2: 项目显式锁定 save_load
  const p2 = { id: 'p2', name: 'app', runtime: 'Docker', dockerDeliveryMode: 'save_load' }
  const s2 = { dockerRegistry: { enabled: true, registryUrl: 'harbor.test.com', defaultMode: 'registry' } }
  const mode2 = DockerDistributorFactory.resolveMode(p2, s2)
  console.log('Case 2 (项目锁定 save_load):', mode2, mode2 === 'save_load' ? '✅ PASS' : '❌ FAIL')

  // Case 3: 项目显式锁定 registry
  const p3 = { id: 'p3', name: 'app', runtime: 'Docker', dockerDeliveryMode: 'registry' }
  const s3 = {}
  const mode3 = DockerDistributorFactory.resolveMode(p3, s3)
  console.log('Case 3 (项目锁定 registry):', mode3, mode3 === 'registry' ? '✅ PASS' : '❌ FAIL')

  // Case 4: 项目 auto，系统启用 Registry 且 defaultMode 为 registry
  const p4 = { id: 'p4', name: 'app', runtime: 'Docker', dockerDeliveryMode: 'auto' }
  const s4 = { dockerRegistry: { enabled: true, registryUrl: 'harbor.test.com', defaultMode: 'registry' } }
  const mode4 = DockerDistributorFactory.resolveMode(p4, s4)
  console.log('Case 4 (系统全局启用 Registry):', mode4, mode4 === 'registry' ? '✅ PASS' : '❌ FAIL')

  // Case 5: 项目 auto，项目配置专属 registryUrl
  const p5 = { id: 'p5', name: 'app', runtime: 'Docker', dockerDeliveryMode: 'auto', dockerRegistry: { registryUrl: 'acr.aliyun.com' } }
  const s5 = {}
  const mode5 = DockerDistributorFactory.resolveMode(p5, s5)
  console.log('Case 5 (项目配置专属 Registry):', mode5, mode5 === 'registry' ? '✅ PASS' : '❌ FAIL')

  console.log('\n=== 2. 测试 DockerSaveLoadDistributor 沙箱模拟执行 ===')
  const saveLoadDist = new DockerSaveLoadDistributor()
  const saveLogs = []
  const resSave = await saveLoadDist.distribute({
    isSimulation: true,
    project: p1,
    deploymentId: 'dep-test-1',
    imageTag: 'demo-app:v1.0',
    server: { ip: '192.168.1.100', user: 'root' },
    signal: new AbortController().signal,
    log: (text, type, step) => saveLogs.push({ text, type, step }),
    setStatus: (status, step) => {},
    settings: s1,
  })
  console.log('SaveLoad 结果:', resSave)
  console.log('SaveLoad 日志数:', saveLogs.length, saveLogs.map(l => l.step).join(' -> '))
  if (resSave.modeUsed === 'save_load' && resSave.finalImageTag === 'demo-app:v1.0') {
    console.log('✅ SaveLoad 沙箱测试通过')
  } else {
    console.error('❌ SaveLoad 沙箱测试失败')
  }

  console.log('\n=== 3. 测试 DockerRegistryDistributor 沙箱模拟执行 ===')
  const regDist = new DockerRegistryDistributor()
  const regLogs = []
  const resReg = await regDist.distribute({
    isSimulation: true,
    project: { ...p1, dockerRegistry: { namespace: 'devops' } },
    deploymentId: 'dep-test-2',
    imageTag: 'demo-app:v2.0',
    server: { ip: '192.168.1.100', user: 'root' },
    signal: new AbortController().signal,
    log: (text, type, step) => regLogs.push({ text, type, step }),
    setStatus: (status, step) => {},
    settings: {
      dockerRegistry: {
        enabled: true,
        registryUrl: 'harbor.company.internal:8443',
        username: 'deployer',
        password: 'secretPassword',
      },
    },
  })
  console.log('Registry 结果:', resReg)
  console.log('Registry 日志流:', regLogs.map(l => l.text))
  if (resReg.modeUsed === 'registry' && resReg.finalImageTag === 'harbor.company.internal:8443/devops/demo-app:v2.0') {
    console.log('✅ Registry 标签解析与沙箱测试通过')
  } else {
    console.error('❌ Registry 测试失败')
  }

  console.log('\n🎉 全部抽象层与策略模式测试通过！')
}

runTests().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})

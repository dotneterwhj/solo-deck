const { extractDockerContainerName } = require('../lib/pipeline-runner')
const { execSync } = require('child_process')

console.log('====================================================')
console.log('测试 1: extractDockerContainerName 解析测试')
console.log('====================================================')

const cases = [
  { cmd: 'docker run -d -p 20081:20081 --name nodejs-demo nodejs-demo:latest', expected: 'nodejs-demo' },
  { cmd: 'docker run -d --name=my-app-api -p 8080:8080 app:v1', expected: 'my-app-api' },
  { cmd: 'docker run -d --name="quoted-name" -p 80:80 app:latest', expected: 'quoted-name' },
  { cmd: 'docker run -d --name=\'single-quoted\' app:latest', expected: 'single-quoted' },
  { cmd: 'docker run -d --name  space-name app:latest', expected: 'space-name' },
  { cmd: 'cd /opt/apps && docker run -d --name my.special_name-123 -p 80:80 myimage', expected: 'my.special_name-123' },
  { cmd: 'npm start', expected: null },
  { cmd: 'pm2 reload api-service || pm2 start dist/index.js --name api-service', expected: null },
  { cmd: '', expected: null },
  { cmd: undefined, expected: null },
]

let passed = 0
for (const c of cases) {
  const actual = extractDockerContainerName(c.cmd)
  const isMatch = actual === c.expected
  if (isMatch) {
    passed++
    console.log(`✅ [PASS] "${c.cmd}" => ${actual}`)
  } else {
    console.error(`❌ [FAIL] "${c.cmd}" => Expected "${c.expected}", got "${actual}"`)
  }
}

console.log(`\n解析测试结果: ${passed}/${cases.length} 通过\n`)

console.log('====================================================')
console.log('测试 2: Conflict 容器冲突正则捕获测试')
console.log('====================================================')

const conflictStderr = `
[remote-err] docker: Error response from daemon: Conflict. The container name "/nodejs-demo" is already in use by container "b74d1ced206d0d43d134fa888497dd9451f034b1608e435851d83dd0c35b0c3b". You have to remove (or rename) that container to be able to reuse that name.
`

const conflictMatch = conflictStderr.match(
  /Conflict\.\s+The container name\s+["']?\/?([^"'\s]+)["']?\s+is already in use/i
)

if (conflictMatch && conflictMatch[1] === 'nodejs-demo') {
  console.log(`✅ [PASS] 成功从 Docker 冲突报错信息中提取容器名称: "${conflictMatch[1]}"`)
} else {
  console.error('❌ [FAIL] 未能提取冲突容器名称:', conflictMatch)
}

console.log('\n====================================================')
console.log('测试 3: 本地 Docker 清理命令验证 (存在 vs 不存在)')
console.log('====================================================')

// A. 不存在同名容器
const notExistCmd = `if docker inspect --type container "non_existent_test_12345" >/dev/null 2>&1; then echo "EXISTS_AND_REMOVED"; else echo "NOT_FOUND"; fi`
const out1 = execSync(notExistCmd, { shell: '/bin/bash' }).toString().trim()
console.log('不存在旧容器检测:', out1, out1 === 'NOT_FOUND' ? '✅ PASS' : '❌ FAIL')

// B. 创建临时容器并测试清理
const testContainerName = 'temp_cleanup_verify_test'
try {
  execSync(`docker run -d --name ${testContainerName} alpine sleep 20 >/dev/null 2>&1`)
  const cleanCmd = `if docker inspect --type container "${testContainerName}" >/dev/null 2>&1; then docker stop -t 10 "${testContainerName}" >/dev/null 2>&1 || true; docker rm -f "${testContainerName}" >/dev/null 2>&1 || true; echo "EXISTS_AND_REMOVED"; else echo "NOT_FOUND"; fi`
  const out2 = execSync(cleanCmd, { shell: '/bin/bash' }).toString().trim()
  console.log('存在旧容器平滑清理检测:', out2, out2 === 'EXISTS_AND_REMOVED' ? '✅ PASS' : '❌ FAIL')

  // 验证容器已被移除
  const verifyCmd = `if docker inspect --type container "${testContainerName}" >/dev/null 2>&1; then echo "STILL_EXISTS"; else echo "CLEANED"; fi`
  const out3 = execSync(verifyCmd, { shell: '/bin/bash' }).toString().trim()
  console.log('验证旧容器已被移除:', out3, out3 === 'CLEANED' ? '✅ PASS' : '❌ FAIL')
} catch (e) {
  console.error('Docker 测试发生异常:', e.message)
}

console.log('\n🎉 所有测试均已执行完毕！')

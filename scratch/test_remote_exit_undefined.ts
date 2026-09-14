import { Client } from 'ssh2'
import { wrapSshCommand } from '../lib/shell-env'

const conn = new Client()

conn.on('ready', () => {
  console.log('SSH Ready')

  const containerName = 'test_daemon_verify'
  const cmd = `docker run -d --name ${containerName} alpine sleep 10`

  // Test checkContainerExistsRemote
  function checkContainerExistsRemote(conn, containerName) {
    const inspectCmd = `docker inspect --type container "${containerName}" >/dev/null 2>&1 && echo "RUNNING" || echo "NOT_FOUND"`
    return new Promise((resolve) => {
      conn.exec(wrapSshCommand(inspectCmd), (err, stream) => {
        if (err) return resolve(false)
        let out = ''
        stream.on('data', (d) => {
          out += d.toString('utf-8')
        })
        stream.stderr.on('data', () => {})
        stream.on('close', () => {
          resolve(out.includes('RUNNING'))
        })
      })
    })
  }

  // First ensure clean
  conn.exec(wrapSshCommand(`docker rm -f ${containerName} >/dev/null 2>&1 || true`), () => {
    conn.exec(wrapSshCommand(cmd), (err, stream) => {
      if (err) throw err

      let stderrOutput = ''
      let capturedExitCode = undefined

      stream
        .on('exit', (code) => {
          if (typeof code === 'number') {
            capturedExitCode = code
          }
        })
        .on('data', (data) => {
          console.log('[remote stdout]', data.toString().trim())
        })
        .stderr.on('data', (data) => {
          stderrOutput += data.toString()
          console.log('[remote stderr]', data.toString().trim())
        })
        .on('close', async (closeCode) => {
          // Simulate closeCode being undefined
          const effectiveCode = undefined

          console.log('Simulating effectiveCode === undefined (closeCode was', closeCode, ')')

          const hasCriticalError =
            stderrOutput.trim().length > 0 &&
            /(?:error|conflict|failed|fatal|cannot|denied)/i.test(stderrOutput)

          if (!hasCriticalError) {
            const isRunning = await checkContainerExistsRemote(conn, containerName)
            if (isRunning) {
              console.log(`✅ [PASS] 成功检测到容器 [${containerName}] 已正常运行！`)
            } else {
              console.error(`❌ [FAIL] 容器未在运行`)
            }
          }

          // Cleanup
          conn.exec(wrapSshCommand(`docker rm -f ${containerName} >/dev/null 2>&1 || true`), () => {
            console.log('清理测试容器完成')
            conn.end()
          })
        })
    })
  })
}).connect({
  host: '172.27.46.141',
  port: 2222,
  username: 'abnerwu',
  password: 'whj@0728',
  readyTimeout: 5000,
})

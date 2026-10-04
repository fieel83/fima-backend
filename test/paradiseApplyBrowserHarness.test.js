import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const harnessScript = fileURLToPath(new URL('./fixtures/paradise-apply-browser-harness.mjs', import.meta.url))

async function availablePort() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  return port
}

async function startHarness(port) {
  const child = spawn(process.execPath, [harnessScript], {
    cwd: repositoryRoot,
    env: { ...process.env, FIMA_BROWSER_HARNESS_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`browser_harness_start_timeout\n${output}`)), 5_000)
    const collect = chunk => {
      output += chunk.toString('utf8')
      if (!output.includes('browser harness listening')) return
      clearTimeout(timer)
      resolve()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`browser_harness_exited_${code}\n${output}`))
    })
  })
  await ready
  return child
}

async function stopHarness(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 2_000))
  ])
}

function pageHeaders(baseUrl, query = '') {
  return { referer: `${baseUrl}/fima-bot/apply?workflow=staff&type=helper${query}` }
}

test('browser harness keeps application submission fail-closed and exposes explicit safe UI modes', async t => {
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = await startHarness(port)
  t.after(() => stopHarness(child))

  const normalContext = await fetch(`${baseUrl}/api/fima-bot/applications/context?workflow=staff`, {
    headers: pageHeaders(baseUrl)
  })
  assert.equal(normalContext.status, 200)
  const normalContextBody = await normalContext.json()
  assert.equal(normalContextBody.contexts.length, 1)
  assert.deepEqual(
    normalContextBody.contexts[0].types.map(item => item.type),
    ['helper', 'staff', 'moderator', 'content_creator', 'video_team', 'creative_team', 'developer', 'fima_support']
  )

  const businessContext = await fetch(`${baseUrl}/api/fima-bot/applications/context?workflow=business`, {
    headers: pageHeaders(baseUrl)
  })
  assert.equal(businessContext.status, 200)
  assert.deepEqual(
    (await businessContext.json()).contexts[0].types.map(item => item.type),
    ['partnership', 'creator', 'reseller']
  )

  const loginRequired = await fetch(`${baseUrl}/api/fima-bot/applications/context?workflow=staff`, {
    headers: pageHeaders(baseUrl, '&access=login-required')
  })
  assert.equal(loginRequired.status, 401)
  assert.equal((await loginRequired.json()).error, 'login_required')

  const discordRequired = await fetch(`${baseUrl}/api/fima-bot/applications/context?workflow=staff`, {
    headers: pageHeaders(baseUrl, '&access=discord-link-required')
  })
  assert.equal(discordRequired.status, 403)
  assert.equal((await discordRequired.json()).error, 'discord_link_required')

  const membershipMissing = await fetch(`${baseUrl}/api/fima-bot/applications/context?workflow=staff`, {
    headers: pageHeaders(baseUrl, '&access=membership-missing')
  })
  assert.equal(membershipMissing.status, 200)
  assert.deepEqual((await membershipMissing.json()).contexts, [])

  const submitBody = { guildId: '1520519015661961257', type: 'helper', evidence: [{}] }
  const failClosed = await fetch(`${baseUrl}/api/fima-bot/applications/submit`, {
    method: 'POST',
    headers: { ...pageHeaders(baseUrl), 'content-type': 'application/json' },
    body: JSON.stringify(submitBody)
  })
  assert.equal(failClosed.status, 503)
  assert.equal((await failClosed.json()).error, 'application_private_review_unavailable')

  const successful = await fetch(`${baseUrl}/api/fima-bot/applications/submit`, {
    method: 'POST',
    headers: { ...pageHeaders(baseUrl, '&submit=success'), 'content-type': 'application/json' },
    body: JSON.stringify(submitBody)
  })
  assert.equal(successful.status, 200)
  const successBody = await successful.json()
  assert.equal(successBody.success, true)
  assert.equal(successBody.application.status, 'pending')
  assert.equal(successBody.application.reviewQueued, true)
  assert.deepEqual(successBody.application.evidence, { total: 1, accepted: 1, quarantined: 0 })

  const recorded = await fetch(`${baseUrl}/__harness/submissions`).then(response => response.json())
  assert.deepEqual(recorded.submissions.map(item => item.submitMode), ['fail-closed', 'success'])
})

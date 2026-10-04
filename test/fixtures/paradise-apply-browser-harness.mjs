import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { paradiseDashboardHtml } from '../../src/paradiseDashboardHtml.js'
import { paradiseWorkspaceReadModel } from '../../src/paradiseWorkspaceReadModel.js'
import {
  emptyParadiseContentStudioState,
  importParadiseDiscordMessage,
  loadParadiseContentDocument,
  paradiseContentPreset,
  paradiseContentPreview,
  rollbackParadiseContentDocument,
  saveParadiseContentDocument
} from '../../src/paradiseContentStudio.js'

const publicRoot = fileURLToPath(new URL('../../public/', import.meta.url))
const port = Number(process.env.FIMA_BROWSER_HARNESS_PORT || 43_192)
const submissions = []
const contentStudioGuildId = '1520519015661961257'
const contentStudioActorId = '1520519015661961258'
let contentStudioState = emptyParadiseContentStudioState(contentStudioGuildId)
let contentStudioSequence = 0
const publishedContent = []
// Disposable, explicitly local records. Production queues always use the backend read model.
const fixtureGuild = contentStudioGuildId
const fixtureRecords = (kind, statuses) => Object.fromEntries(statuses.map((status, index) => {
  const id = `${kind}-fixture-${index + 1}`
  return [id, { id, guildId: fixtureGuild, userId: contentStudioActorId, username: `Test member ${index + 1}`, type: kind === 'applications' ? 'helper' : kind,
    status, createdAt: `2026-09-30T${String(10 + index).padStart(2, '0')}:00:00Z`,
    reason: 'Local browser acceptance fixture', answers: { motivation: 'I help new community members find the right support channel.' }, evidence: [] }]
}))
const fixtureWorkspace = paradiseWorkspaceReadModel({
  applications: { [fixtureGuild]: fixtureRecords('applications', ['pending', 'reviewing', 'accepted', 'rejected']) },
  supportTickets: { [fixtureGuild]: fixtureRecords('support', ['open', 'open', 'closed']) },
  moderationCases: { [fixtureGuild]: fixtureRecords('warning', ['open', 'resolved']) },
  giveaways: fixtureRecords('giveaway', ['active', 'ended']),
  paradiseLogs: { [fixtureGuild]: [{ title: 'Local fixture loaded', createdAt: '2026-09-30T15:00:00Z' }] }
}, fixtureGuild)
const dashboardPayload = {
  workspace: fixtureWorkspace,
  selectedGuildId: '1520519015661961257',
  servers: [{ id: '1520519015661961257', name: 'FIMA Community Test' }],
  config: { activeSetupMode: 'community', dashboardTheme: 'paradise', brandColor: '#8B5CF6', language: 'tr' },
  runtime: {
    status: 'ready',
    capturedAt: new Date().toISOString(),
    guild: { id: '1520519015661961257', name: 'FIMA Community Test', memberCount: 128, botRolePosition: 12 },
    botIdentity: { username: 'FIMA', nicknameMatches: true },
    commandSync: { count: 54, lastError: null },
    categories: Array.from({ length: 9 }, (_, index) => ({ id: `category-${index + 1}`, name: `Category ${index + 1}` })),
    channels: Array.from({ length: 31 }, (_, index) => ({ id: `152051901566196${String(index).padStart(4, '0')}`, name: `fima-channel-${index + 1}`, type: 0, parentId: null })),
    roles: Array.from({ length: 18 }, (_, index) => ({ id: `152051901566197${String(index).padStart(4, '0')}`, name: `FIMA Role ${index + 1}`, position: 30 - index, managed: false })),
    autoModRules: [{ id: 'automod-1', name: 'FIMA anti-spam' }],
    webhooks: []
  },
  mutationLock: { locked: false, acquiring: false, phase: 'idle', waiting: 0 },
  summary: { verifiedProfiles: 42, pendingChallenges: 3, activeSessions: 7, activeLoa: 2, allies: 4, enemies: 1 }
}

const evidenceHarnessControl = `
<script data-fima-browser-harness>
(() => {
  const control = document.createElement('button')
  control.type = 'button'
  control.id = 'harness-safe-evidence'
  control.textContent = 'Harness: güvenli kanıt yükle'
  control.setAttribute('aria-label', 'Tarayıcı testi için güvenli PNG kanıtı yükle')
  Object.assign(control.style, {
    position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
    border: '1px solid #70f5c5', borderRadius: '999px', padding: '10px 14px',
    background: '#071b1c', color: '#e8fff7', font: '600 12px system-ui', cursor: 'pointer',
    boxShadow: '0 10px 34px rgba(0, 0, 0, .38)'
  })
  control.addEventListener('click', async () => {
    control.disabled = true
    control.textContent = 'Kanıt yükleniyor…'
    try {
      const input = document.querySelector('input[type="file"][data-evidence-required="true"]')
      if (!input) throw new Error('required_evidence_input_not_found')
      const response = await fetch('/assets/images/fima-full-feedback.png', { cache: 'no-store' })
      if (!response.ok) throw new Error('fixture_fetch_failed')
      const file = new File([await response.blob()], 'fima-browser-proof.png', { type: 'image/png' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      control.dataset.state = 'loaded'
      control.textContent = 'Harness: kanıt yüklendi'
    } catch (error) {
      control.dataset.state = 'error'
      control.textContent = 'Harness hatası: ' + (error?.message || 'unknown')
      control.disabled = false
    }
  })
  document.body.append(control)
})()
</script>`

const context = {
  guildId: '1520519015661961257',
  guildName: 'FIMA Community Test',
  member: true,
  applicationsOpen: true,
  activeSetupMode: 'community',
  workflow: 'staff',
  blacklisted: false,
  activeApplication: null,
  cooldownUntil: null,
  evidencePolicy: {
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxPerQuestion: 2,
    maxFiles: 4,
    maxFileBytes: 163_840,
    maxTotalBytes: 491_520,
    scannerUnavailableAction: 'quarantine'
  },
  types: [{
    type: 'helper',
    label: 'Helper',
    questions: [{
      key: 'motivation',
      label: 'Neden Helper olmak istiyorsun?',
      placeholder: 'Topluluğa nasıl katkı sağlayacağını anlat.',
      multiline: true,
      min: 10,
      max: 500,
      evidenceRequirement: 'optional'
    }, {
      key: 'incident',
      label: 'Zor bir destek olayını nasıl yönetirsin?',
      placeholder: 'Adımlarını ve güvenlik yaklaşımını açıkla.',
      multiline: true,
      min: 10,
      max: 700,
      evidenceRequirement: 'required'
    }]
  }]
}

const staffApplicationTypes = [
  context.types[0],
  { type: 'staff', label: 'Staff', questions: context.types[0].questions },
  { type: 'moderator', label: 'Moderator', questions: context.types[0].questions },
  { type: 'content_creator', label: 'Content Creator', questions: context.types[0].questions },
  { type: 'video_team', label: 'Video Team', questions: context.types[0].questions },
  { type: 'creative_team', label: 'Creative Team', questions: context.types[0].questions },
  { type: 'developer', label: 'Developer', questions: context.types[0].questions },
  { type: 'fima_support', label: 'FIMA Support', questions: context.types[0].questions }
]

const businessApplicationTypes = [
  { type: 'partnership', label: 'Partnership', questions: context.types[0].questions },
  { type: 'creator', label: 'Creator / Media Partner', questions: context.types[0].questions },
  { type: 'reseller', label: 'Reseller / Affiliate', questions: context.types[0].questions }
]

function applicationContextForWorkflow(workflow) {
  const normalizedWorkflow = workflow === 'business' ? 'business' : 'staff'
  return {
    ...context,
    workflow: normalizedWorkflow,
    types: normalizedWorkflow === 'business' ? businessApplicationTypes : staffApplicationTypes
  }
}

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(JSON.stringify(value))
}

function pageQuery(request) {
  try {
    return new URL(String(request.headers.referer || ''), 'http://127.0.0.1').searchParams
  } catch {
    return new URLSearchParams()
  }
}

function harnessMode(request, url, name, environmentName) {
  return url.searchParams.get(name)
    || pageQuery(request).get(name)
    || process.env[environmentName]
    || ''
}

function contentType(pathname) {
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.webp': 'image/webp'
  }[extname(pathname).toLowerCase()] || 'application/octet-stream'
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function contentStudioNow() {
  contentStudioSequence += 1
  return new Date(Date.UTC(2026, 6, 19, 12, 0, 0, contentStudioSequence))
}

function contentStudioId() {
  contentStudioSequence += 1
  return `harness_${String(contentStudioSequence).padStart(6, '0')}`
}

function contentStudioError(response, error, fallback = 'content_studio_harness_failed') {
  const code = error?.code || fallback
  const status = code === 'state_changed' ? 409 : code === 'document_not_found' ? 404 : 400
  return json(response, status, { success: false, error: code })
}

function requireContentStudioRevision(body) {
  const expected = body?.expectedStateUpdatedAt ?? null
  const current = contentStudioState.updatedAt ?? null
  if (expected !== current) {
    const error = new Error('state_changed')
    error.code = 'state_changed'
    throw error
  }
}

function fakeDiscordMessage(channelId, messageId) {
  return {
    id: messageId,
    guildId: contentStudioGuildId,
    channelId,
    url: `https://discord.com/channels/${contentStudioGuildId}/${channelId}/${messageId}`,
    content: 'Read-only Discord source captured by the browser harness.',
    embeds: [{
      title: 'Existing FIMA message',
      description: 'This imported snapshot is immutable until saved as an improved draft.',
      color: 0x20d9ba,
      fields: [{ name: 'Source', value: 'Discord read-only import', inline: true }]
    }],
    author: { id: contentStudioActorId, username: 'FIMA' },
    channel: { name: 'content-studio-test', parent: { name: 'FIMA Test' } },
    createdAt: '2026-07-19T11:55:00.000Z'
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (request.method === 'GET' && url.pathname === '/api/fima-bot/applications/context') {
    const accessMode = harnessMode(request, url, 'access', 'FIMA_BROWSER_HARNESS_ACCESS_MODE')
    if (accessMode === 'login-required') {
      return json(response, 401, { error: 'login_required' })
    }
    if (accessMode === 'discord-link-required') {
      return json(response, 403, { error: 'discord_link_required' })
    }
    if (accessMode === 'membership-missing') {
      return json(response, 200, { contexts: [] })
    }
    return json(response, 200, {
      contexts: [applicationContextForWorkflow(url.searchParams.get('workflow'))]
    })
  }
  if (request.method === 'GET' && url.pathname === '/api/csrf-token') {
    return json(response, 200, { csrfToken: 'browser-harness-csrf' })
  }
  if (request.method === 'GET' && url.pathname === '/api/public/site-settings') {
    return json(response, 200, {
      settings: { discordInviteUrl: 'https://discord.gg/fima-browser-test' }
    })
  }
  if (request.method === 'GET' && url.pathname === '/api/fima-bot/session-status') {
    const referer = String(request.headers.referer || '')
    if (referer.includes('access=login-required')) {
      return json(response, 200, { ownerAuthorized: false, reasonCode: 'login_required' })
    }
    return json(response, 200, { ownerAuthorized: true, reasonCode: 'owner_authorized' })
  }
  if (request.method === 'GET' && url.pathname === '/api/fima-bot/config') {
    return json(response, 200, dashboardPayload)
  }
  // Local browser acceptance only: persists draft settings in memory, never Discord.
  if (request.method === 'PATCH' && url.pathname === '/api/fima-bot/config') {
    if (request.headers['x-fima-csrf'] !== 'browser-harness-csrf') {
      return json(response, 403, { error: 'csrf_invalid' })
    }
    const body = await readJsonBody(request)
    if (body.guildId !== contentStudioGuildId || body.kind !== 'applications') {
      return json(response, 400, { error: 'fixture_settings_unsupported' })
    }
    dashboardPayload.config.applicationSettings = body.value
    return json(response, 200, { success: true })
  }
  if (request.method === 'GET' && url.pathname === '/api/fima-bot/content-studio') {
    return json(response, 200, {
      success: true,
      selectedGuildId: contentStudioGuildId,
      testGuildId: contentStudioGuildId,
      publishingAllowed: true,
      servers: [{ id: contentStudioGuildId, name: 'FIMA Community Test' }],
      state: contentStudioState
    })
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/fima-bot/content-studio/document/')) {
    try {
      const documentId = decodeURIComponent(url.pathname.slice('/api/fima-bot/content-studio/document/'.length))
      return json(response, 200, { success: true, document: loadParadiseContentDocument(contentStudioState, documentId) })
    } catch (error) {
      return contentStudioError(response, error, 'content_document_load_failed')
    }
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/fima-bot/content-studio/preset/')) {
    try {
      const preset = decodeURIComponent(url.pathname.slice('/api/fima-bot/content-studio/preset/'.length))
      return json(response, 200, { success: true, preset: paradiseContentPreset(preset) })
    } catch (error) {
      return contentStudioError(response, error, 'content_preset_load_failed')
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/fima-bot/content-studio/preview') {
    try {
      const body = await readJsonBody(request)
      return json(response, 200, { success: true, preview: paradiseContentPreview(body.payload, body.mode) })
    } catch (error) {
      return contentStudioError(response, error, 'content_preview_failed')
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/fima-bot/content-studio/save') {
    try {
      const body = await readJsonBody(request)
      requireContentStudioRevision(body)
      const saved = saveParadiseContentDocument(contentStudioState, body.document, {
        actorId: contentStudioActorId,
        now: contentStudioNow(),
        idFactory: contentStudioId
      })
      contentStudioState = saved.state
      return json(response, 200, {
        success: true,
        stateUpdatedAt: saved.state.updatedAt,
        document: saved.document,
        version: saved.version
      })
    } catch (error) {
      return contentStudioError(response, error, 'content_document_save_failed')
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/fima-bot/content-studio/rollback') {
    try {
      const body = await readJsonBody(request)
      requireContentStudioRevision(body)
      const saved = rollbackParadiseContentDocument(contentStudioState, body, {
        actorId: contentStudioActorId,
        now: contentStudioNow(),
        idFactory: contentStudioId
      })
      contentStudioState = saved.state
      return json(response, 200, {
        success: true,
        stateUpdatedAt: saved.state.updatedAt,
        document: saved.document,
        version: saved.version
      })
    } catch (error) {
      return contentStudioError(response, error, 'content_document_rollback_failed')
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/fima-bot/content-studio/import') {
    try {
      const body = await readJsonBody(request)
      const imported = importParadiseDiscordMessage(fakeDiscordMessage(body.channelId, body.messageId), {
        importedByActorId: contentStudioActorId,
        importedAt: contentStudioNow(),
        sourceGuildId: contentStudioGuildId
      })
      return json(response, 200, { success: true, imported })
    } catch (error) {
      return contentStudioError(response, error, 'content_message_import_failed')
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/fima-bot/content-studio/publish') {
    try {
      const body = await readJsonBody(request)
      requireContentStudioRevision(body)
      if (body.guildId !== contentStudioGuildId) throw Object.assign(new Error('test_guild_only'), { code: 'test_guild_only' })
      if (body.confirmation !== 'PUBLISH TEST CONTENT') throw Object.assign(new Error('publish_confirmation_required'), { code: 'publish_confirmation_required' })
      const document = loadParadiseContentDocument(contentStudioState, body.documentId)
      if (!['improved_draft', 'production_version'].includes(document.stage)) throw Object.assign(new Error('content_stage_not_publishable'), { code: 'content_stage_not_publishable' })
      const published = {
        guildId: contentStudioGuildId,
        channelId: body.channelId,
        messageId: body.messageId || `1520519015662${String(contentStudioSequence).padStart(6, '0')}`,
        operation: body.messageId ? 'edited' : 'created',
        deliveryMode: document.deliveryMode
      }
      const saved = saveParadiseContentDocument(contentStudioState, {
        ...document,
        id: document.id,
        overwrite: true,
        payload: document.current,
        stage: 'production_version',
        targetChannelId: published.channelId,
        targetMessageId: published.messageId,
        canonicalGuildId: published.guildId,
        canonicalChannelId: published.channelId,
        canonicalMessageId: published.messageId
      }, {
        actorId: contentStudioActorId,
        now: contentStudioNow(),
        idFactory: contentStudioId
      })
      contentStudioState = saved.state
      publishedContent.push({ published, documentId: document.id })
      return json(response, 200, { success: true, published, document: saved.document, stateUpdatedAt: saved.state.updatedAt })
    } catch (error) {
      return contentStudioError(response, error, 'content_publish_failed')
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/fima-bot/applications/submit') {
    const body = await readJsonBody(request).catch(() => null)
    const submitMode = harnessMode(request, url, 'submit', 'FIMA_BROWSER_HARNESS_SUBMIT_MODE')
    const recorded = { body, csrf: request.headers['x-fima-csrf'] || null, submitMode: submitMode || 'fail-closed' }
    submissions.push(recorded)
    if (submitMode === 'success') {
      const evidenceTotal = Array.isArray(body?.evidence) ? body.evidence.length : 0
      return json(response, 200, {
        success: true,
        application: {
          id: `browser-${String(submissions.length).padStart(4, '0')}`,
          label: 'Helper',
          status: 'pending',
          reviewQueued: true,
          evidence: {
            total: evidenceTotal,
            accepted: evidenceTotal,
            quarantined: 0
          }
        }
      })
    }
    return json(response, 503, {
      error: 'application_private_review_unavailable',
      cooldownUntil: null,
      question: null
    })
  }
  if (request.method === 'GET' && url.pathname === '/__harness/submissions') {
    return json(response, 200, { submissions })
  }
  if (request.method === 'GET' && url.pathname === '/__harness/content-studio') {
    return json(response, 200, { state: contentStudioState, publishedContent })
  }

  if (request.method === 'GET' && url.pathname === '/paradise') {
    const body = paradiseDashboardHtml({
      clientId: 'browser-harness-client',
      apiBaseUrl: `http://127.0.0.1:${port}`,
      frontendUrl: `http://127.0.0.1:${port}`
    })
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    return response.end(body)
  }

  const pageAliases = {
    '/': 'paradise-apply.html',
    '/fima-bot/apply': 'paradise-apply.html',
    '/fima-bot/apply/helper': 'paradise-apply.html',
    '/fima-bot/apply/moderator': 'paradise-apply.html',
    '/fima-bot/apply/video-team': 'paradise-apply.html',
    '/fima-bot/apply/creative-team': 'paradise-apply.html',
    '/paradise-apply': 'paradise-apply.html',
    '/paradise-bot': 'paradise-bot.html',
    '/paradise/content-studio': 'paradise-content-studio.html'
  }
  const relative = pageAliases[url.pathname]
    || normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
  const filePath = join(publicRoot, relative)
  if (!filePath.startsWith(publicRoot)) return json(response, 403, { error: 'forbidden' })
  try {
    let body = await readFile(filePath)
    if (relative === 'paradise-apply.html') {
      body = Buffer.from(body.toString('utf8').replace('</body>', `${evidenceHarnessControl}\n</body>`))
    }
    response.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' })
    response.end(body)
  } catch {
    json(response, 404, { error: 'not_found' })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Paradise application browser harness listening on http://127.0.0.1:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}

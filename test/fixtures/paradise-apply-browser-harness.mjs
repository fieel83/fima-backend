import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicRoot = fileURLToPath(new URL('../../public/', import.meta.url))
const port = Number(process.env.FIMA_BROWSER_HARNESS_PORT || 43_192)
const submissions = []

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
    }]
  }]
}

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(JSON.stringify(value))
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

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (request.method === 'GET' && url.pathname === '/api/paradise/applications/context') {
    return json(response, 200, { contexts: [context] })
  }
  if (request.method === 'GET' && url.pathname === '/api/csrf-token') {
    return json(response, 200, { csrfToken: 'browser-harness-csrf' })
  }
  if (request.method === 'POST' && url.pathname === '/api/paradise/applications/submit') {
    const body = await readJsonBody(request).catch(() => null)
    submissions.push({ body, csrf: request.headers['x-fima-csrf'] || null })
    return json(response, 503, {
      error: 'application_private_review_unavailable',
      cooldownUntil: null,
      question: null
    })
  }
  if (request.method === 'GET' && url.pathname === '/__harness/submissions') {
    return json(response, 200, { submissions })
  }

  const relative = url.pathname === '/' || url.pathname === '/paradise-apply'
    ? 'paradise-apply.html'
    : normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
  const filePath = join(publicRoot, relative)
  if (!filePath.startsWith(publicRoot)) return json(response, 403, { error: 'forbidden' })
  try {
    const body = await readFile(filePath)
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

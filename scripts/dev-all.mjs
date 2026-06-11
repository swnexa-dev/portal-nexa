import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = resolve(process.cwd())
const requestedSystems = process.argv.slice(2).map((value) => value.trim().toLowerCase()).filter(Boolean)
const childProcesses = []

function hasPackageJson(directoryPath) {
  return existsSync(join(directoryPath, 'package.json'))
}

function collectServices() {
  const services = []
  const rootServices = [
    { system: 'nexa', label: 'nexa-backend', path: join(rootDir, 'backend') },
    { system: 'nexa', label: 'nexa-frontend', path: join(rootDir, 'frontend') },
  ]

  for (const service of rootServices) {
    if (hasPackageJson(service.path)) {
      services.push(service)
    }
  }

  const modulesDir = join(rootDir, 'modulos')
  if (!existsSync(modulesDir)) {
    return services
  }

  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const systemName = entry.name
    const systemPath = join(modulesDir, systemName)
    const frontendPath = join(systemPath, 'frontend')
    const backendPath = join(systemPath, 'backend')

    if (hasPackageJson(backendPath)) {
      services.push({
        system: systemName.toLowerCase(),
        label: `${systemName}-backend`,
        path: backendPath,
      })
    }

    if (hasPackageJson(frontendPath)) {
      services.push({
        system: systemName.toLowerCase(),
        label: `${systemName}-frontend`,
        path: frontendPath,
      })
    }
  }

  return services
}

function selectServices(services) {
  if (!requestedSystems.length) return services

  return services.filter((service) => {
    return requestedSystems.includes(service.system) || requestedSystems.includes(service.label.toLowerCase())
  })
}

function prefixOutput(label, data, writer) {
  const text = data.toString()
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (!line) continue
    writer(`[${label}] ${line}\n`)
  }
}

function stopAllChildren(signal = 'SIGTERM') {
  for (const child of childProcesses) {
    if (child.exitCode === null && !child.killed) {
      child.kill(signal)
    }
  }
}

function spawnNpmDev(servicePath) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
      cwd: servicePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
      env: process.env,
    })
  }

  return spawn('npm', ['run', 'dev'], {
    cwd: servicePath,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env: process.env,
  })
}

const discoveredServices = collectServices()
const selectedServices = selectServices(discoveredServices)

if (!selectedServices.length) {
  console.error('Nenhum frontend/backend com package.json foi encontrado para iniciar.')
  if (requestedSystems.length) {
    console.error(`Filtro recebido: ${requestedSystems.join(', ')}`)
  }
  process.exit(1)
}

console.log('Iniciando serviços em paralelo:')
for (const service of selectedServices) {
  console.log(`- ${service.label} -> ${service.path}`)
}

let settledChildren = 0
let hasFailure = false

for (const service of selectedServices) {
  const child = spawnNpmDev(service.path)

  childProcesses.push(child)

  child.stdout.on('data', (data) => prefixOutput(service.label, data, process.stdout.write.bind(process.stdout)))
  child.stderr.on('data', (data) => prefixOutput(service.label, data, process.stderr.write.bind(process.stderr)))

  child.on('exit', (code) => {
    settledChildren += 1

    if (code && code !== 0) {
      hasFailure = true
      console.error(`[${service.label}] finalizou com código ${code}. Encerrando os demais serviços.`)
      stopAllChildren()
    } else {
      console.log(`[${service.label}] finalizado.`)
    }

    if (settledChildren === childProcesses.length) {
      process.exit(hasFailure ? 1 : 0)
    }
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\nRecebido ${signal}. Encerrando todos os serviços...`)
    stopAllChildren(signal)
  })
}

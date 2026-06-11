import { useEffect, useState } from 'react'
import { fetchCatalog, fetchMe, launchSystem, login, register, requestRegisterCode, verifyRegisterCode } from './lib/api'
import type { AuthUser, CatalogSystem } from './types'
import nexaLogo from './assets/img-nexa.png'
import fluxioImage from './assets/img-fluxio.png'
import produtivImage from './assets/img-produtiv.jpeg'

const storageKey = 'nexa.portal.token'

type AuthMode = 'login' | 'register'

type SessionState = {
  accessToken: string
  user: AuthUser
  remainingTrialDays: number
}

type RegisterStep = 'details' | 'verification'

const fallbackSystems: CatalogSystem[] = [
  {
    slug: 'fluxio',
    name: 'Fluxio',
    description: 'Crie formulários, acompanhe solicitações e gerencie processos com fluxos Kanban.',
    accent: '#0f766e',
    launchUrl: import.meta.env.VITE_FLUXIO_URL ?? 'http://localhost:5174',
    plans: [],
    access: { allowed: true, viaTrial: true, hasSubscription: false },
  },
  {
    slug: 'produtiv',
    name: 'Produtiv',
    description: 'Acompanhe produção odontológica, lançamentos e indicadores por login do portal.',
    accent: '#b45309',
    launchUrl: import.meta.env.VITE_PRODUTIV_URL ?? 'http://localhost:5175',
    plans: [],
    access: { allowed: true, viaTrial: true, hasSubscription: false },
  },
]

const initialRegisterState = {
  name: '',
  email: '',
  phone: '',
  document: '',
  password: '',
  passwordConfirm: '',
  verificationCode: '',
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

function formatDocument(value: string) {
  const digits = onlyDigits(value).slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

function normalizeRegisterField(field: keyof typeof initialRegisterState, value: string) {
  if (field === 'name') return value.slice(0, 100)
  if (field === 'phone') return formatPhone(value)
  if (field === 'document') return formatDocument(value)
  return value
}

function validateRegisterForm(form: typeof initialRegisterState) {
  if (form.name.trim().length < 3) return 'Nome muito curto'
  if (form.name.length > 100) return 'Nome deve ter no maximo 100 caracteres'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Email invalido'
  if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(form.phone)) return 'Telefone invalido'
  if (!/^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(form.document)) return 'CPF/CNPJ invalido'
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(form.password)) return 'Senha fora das regras'
  if (form.password !== form.passwordConfirm) return 'As senhas nao conferem'
  return null
}

function validateVerificationCode(form: typeof initialRegisterState) {
  if (!/^\d{6}$/.test(form.verificationCode)) return 'Informe o codigo de 6 digitos'
  return null
}

export default function App() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [registerStep, setRegisterStep] = useState<RegisterStep>('details')
  const [session, setSession] = useState<SessionState | null>(null)
  const [systems, setSystems] = useState<CatalogSystem[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState(initialRegisterState)
  const [codeRequested, setCodeRequested] = useState(false)
  const [codeVerified, setCodeVerified] = useState(false)

  useEffect(() => {
    const token = window.localStorage.getItem(storageKey)
    if (!token) {
      setLoading(false)
      return
    }

    hydrateSession(token).catch(() => {
      window.localStorage.removeItem(storageKey)
      setLoading(false)
    })
  }, [])

  async function hydrateSession(accessToken: string) {
    const [meResult, catalogResult] = await Promise.all([fetchMe(accessToken), fetchCatalog(accessToken)])
    setSession({
      accessToken,
      user: meResult.user,
      remainingTrialDays: meResult.meta.remainingTrialDays,
    })
    const mergedSystems = fallbackSystems.map((fallback) => {
      const fromCatalog = catalogResult.systems.find((system) => system.slug === fallback.slug)
      if (fromCatalog) return fromCatalog
      return {
        ...fallback,
        access: {
          allowed: true,
          viaTrial: catalogResult.meta.trialActive,
          hasSubscription: false,
        },
      }
    })
    setSystems(mergedSystems)
    setLoading(false)
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')

    try {
      const response = await login(loginForm)
      window.localStorage.setItem(storageKey, response.accessToken)
      await hydrateSession(response.accessToken)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao entrar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')

    const validationError = validateVerificationCode(registerForm)
    if (validationError) {
      setMessage(validationError)
      setSubmitting(false)
      return
    }

    try {
      if (!codeVerified) {
        await verifyRegisterCode({ email: registerForm.email, code: registerForm.verificationCode })
        setCodeVerified(true)
      }
      const response = await register(registerForm)
      window.localStorage.setItem(storageKey, response.accessToken)
      await hydrateSession(response.accessToken)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao cadastrar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestRegisterCode() {
    setSubmitting(true)
    setMessage('')

    const validationError = validateRegisterForm(registerForm)
    if (validationError) {
      setMessage(validationError)
      setSubmitting(false)
      return
    }

    try {
      await requestRegisterCode({ name: registerForm.name, email: registerForm.email })
      setCodeRequested(true)
      setCodeVerified(false)
      setRegisterStep('verification')
      setMessage('Codigo enviado para o email informado')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar codigo')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLaunch(systemSlug: string) {
    if (!session) return
    setMessage('')

    try {
      const response = await launchSystem(session.accessToken, systemSlug)
      window.location.href = response.launchUrl
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir sistema')
    }
  }

  function logout() {
    window.localStorage.removeItem(storageKey)
    setSession(null)
    setSystems([])
    setLoginForm({ email: '', password: '' })
    setRegisterForm(initialRegisterState)
    setCodeRequested(false)
    setCodeVerified(false)
    setRegisterStep('details')
    setMode('login')
    setLoading(false)
  }

  function handleBackToRegisterDetails() {
    setRegisterStep('details')
    setCodeVerified(false)
    setMessage('')
  }

  if (loading) {
    return <div className="screen-center">Carregando portal Nexa...</div>
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="hero-badge">Nexa Systems</div>
          <h1>Tenha acesso a diversos sistemas uteis que automatizam e contralam suas tarefas.</h1>
          <p>Crie sua conta agora e tenha 14 dias de acesso ilimitado em todos os produtos.</p>
        </section>

        <section className="auth-card">
          <div className="auth-toggle">
            <button className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')} type="button">
              Entrar
            </button>
            <button className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')} type="button">
              Criar conta
            </button>
          </div>

          <div className="auth-header">
            <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie seu acesso principal'}</h2>
            <p>{mode === 'login' ? 'Use sua conta Nexa para acessar todos os sistemas.' : 'Seu cadastro ja entra com trial completo por 14 dias.'}</p>
          </div>

          {mode === 'register' ? (
            <div className="step-indicator">
              <span className={registerStep === 'details' ? 'is-active' : ''}>1. Dados</span>
              <span className={registerStep === 'verification' ? 'is-active' : ''}>2. Codigo</span>
            </div>
          ) : null}

          {message ? <div className="feedback error">{message}</div> : null}

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              />
              <input
                type="password"
                placeholder="Senha"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              />
              <button type="submit" disabled={submitting}>
                {submitting ? 'Entrando...' : 'Entrar no portal'}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              {registerStep === 'details' ? (
                <>
                  <input
                    type="text"
                    placeholder="Nome"
                    value={registerForm.name}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, name: normalizeRegisterField('name', event.target.value) }))}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={registerForm.email}
                    onChange={(event) => {
                      const value = normalizeRegisterField('email', event.target.value)
                      setRegisterForm((current) => ({ ...current, email: value }))
                      setCodeRequested(false)
                      setCodeVerified(false)
                    }}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Telefone"
                    value={registerForm.phone}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, phone: normalizeRegisterField('phone', event.target.value) }))}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="CPF ou CNPJ"
                    value={registerForm.document}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, document: normalizeRegisterField('document', event.target.value) }))}
                  />
                  <input
                    type="password"
                    placeholder="Senha"
                    value={registerForm.password}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, password: normalizeRegisterField('password', event.target.value) }))}
                  />
                  <input
                    type="password"
                    placeholder="Confirmar senha"
                    value={registerForm.passwordConfirm}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, passwordConfirm: normalizeRegisterField('passwordConfirm', event.target.value) }))}
                  />
                  <button type="button" disabled={submitting} onClick={handleRequestRegisterCode}>
                    {submitting ? 'Enviando codigo...' : 'Continuar e enviar codigo'}
                  </button>
                </>
              ) : (
                <>
                  <div className="verification-summary">
                    <strong>Confirmacao por email</strong>
                    <span>Enviamos um codigo de 6 digitos para {registerForm.email}.</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Codigo de 6 digitos"
                    value={registerForm.verificationCode}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, verificationCode: onlyDigits(event.target.value).slice(0, 6) }))}
                  />
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Criando conta...' : 'Confirmar codigo e criar conta'}
                  </button>
                  <button type="button" className="secondary-inline-button" disabled={submitting} onClick={handleBackToRegisterDetails}>
                    Voltar para editar dados
                  </button>
                  <button type="button" className="secondary-inline-button" disabled={submitting} onClick={handleRequestRegisterCode}>
                    Reenviar codigo
                  </button>
                </>
              )}
            </form>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="portal-brand">
          <div className="portal-brand__logo-shell">
            <img src={nexaLogo} alt="Nexa Systems" className="portal-brand__logo" />
          </div>
          <span className="eyebrow">Nexa Systems Portal</span>
        </div>
        <div className="topbar-actions">
          <div className="user-chip">
            <strong>{session.user.name}</strong>
            <span>{session.user.email}</span>
          </div>
          <button type="button" className="ghost-button" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      {message ? <div className="feedback error">{message}</div> : null}

      <main>
        <section className="systems-grid">
          {systems.map((system) => {
            const systemImage = system.slug === 'produtiv' ? produtivImage : fluxioImage

            return (
              <button
                key={system.slug}
                type="button"
                className="system-card"
                onClick={() => handleLaunch(system.slug)}
                style={{ ['--card-accent' as string]: system.accent }}
              >
                <div className="system-card-top">
                  <span className="system-dot" />
                  <span className={`status-pill ${system.access.allowed ? 'allowed' : 'blocked'}`}>
                    {system.access.allowed ? 'Liberado' : 'Bloqueado'}
                  </span>
                </div>
                <div className="system-card__image-shell">
                  <img src={systemImage} alt={system.name} className="system-card__image" />
                </div>
                <h3>{system.name}</h3>
                <p>{system.description}</p>
              </button>
            )
          })}
        </section>
      </main>
    </div>
  )
}

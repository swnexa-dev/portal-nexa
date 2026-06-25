import { useEffect, useRef, useState } from 'react'
import { FiSettings } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import { acceptLegalDocuments, confirmPasswordReset, createBillingCheckout, createBillingPortal, fetchBillingSummary, fetchCatalog, fetchLegalVersions, fetchMe, launchSystem, login, register, requestPasswordResetCode, requestRegisterCode, updateProfile, verifyPasswordResetCode, verifyRegisterCode } from './lib/api'
import type { AuthUser, BillingSummary, CatalogSystem, LegalVersions } from './types'
import nexaLogo from './assets/img-nexa.png'
import fluxioImage from './assets/img-fluxio.png'
import produtivImage from './assets/img-produtiv.jpeg'

const storageKey = 'nexa.portal.token'
const fallbackLegalVersions: LegalVersions = {
  legalTermsVersion: '2026-06',
  privacyPolicyVersion: '2026-06',
}

type AuthMode = 'login' | 'register'

type SessionState = {
  accessToken: string
  user: AuthUser
  remainingTrialDays: number
}

type RegisterStep = 'details' | 'verification'
type ResetStep = 'request' | 'verification'
type DashboardPanel = 'profile' | 'support' | null
type PurchaseSyncStatus = 'syncing' | 'active' | 'delayed'

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="password-toggle__icon" fill="none">
      <path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {open ? null : (
        <path
          d="M4 4l16 16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

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

const initialResetState = {
  email: '',
  code: '',
  password: '',
  passwordConfirm: '',
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function isValidCpf(value: string) {
  const digits = onlyDigits(value)
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false

  let sum = 0
  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index)
  }

  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number(digits[9])) return false

  sum = 0
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index)
  }

  check = (sum * 10) % 11
  if (check === 10) check = 0
  return check === Number(digits[10])
}

function isValidCnpj(value: string) {
  const digits = onlyDigits(value)
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false

  const calculateCheckDigit = (base: string, factors: number[]) => {
    const sum = base.split('').reduce((accumulator, digit, index) => {
      return accumulator + Number(digit) * factors[index]
    }, 0)

    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const firstCheck = calculateCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (firstCheck !== Number(digits[12])) return false

  const secondCheck = calculateCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return secondCheck === Number(digits[13])
}

function isValidCpfOrCnpj(value: string) {
  const digits = onlyDigits(value)
  if (digits.length === 11) return isValidCpf(digits)
  if (digits.length === 14) return isValidCnpj(digits)
  return false
}

function getPasswordRules(password: string) {
  return {
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    hasMinLength: password.length >= 8,
  }
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

function formatDate(value: string | null) {
  if (!value) return 'data indisponível'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function getBillingStatusLabel(subscription: BillingSummary['subscription']) {
  if (!subscription) return 'Sem assinatura ativa'
  if (subscription.isRefunded) return 'Reembolsada'
  if (subscription.isActive && subscription.renewsAutomatically) return 'Assinatura ativa'
  if (subscription.isActive && subscription.isCancelingAtPeriodEnd) return 'Cancelada'
  if (subscription.status === 'past_due') return 'Pagamento pendente'
  return 'Sem assinatura ativa'
}

function getBillingStatusText(subscription: BillingSummary['subscription'], remainingTrialDays: number) {
  if (!subscription) {
    return remainingTrialDays > 0
      ? `Seu trial ainda tem ${remainingTrialDays} dia(s) restante(s).`
      : 'Seu trial terminou. Assine para continuar acessando todos os apps.'
  }

  if (subscription.isRefunded) {
    return 'Pagamento reembolsado. A assinatura foi encerrada sem período contratado restante.'
  }

  if (subscription.isActive && subscription.renewsAutomatically) {
    return `Próxima renovação automática em ${formatDate(subscription.currentPeriodEndsAt)}.`
  }

  if (subscription.isActive && subscription.isCancelingAtPeriodEnd) {
    return `Cancelamento solicitado. O acesso continua até ${formatDate(subscription.cancellationEffectiveAt ?? subscription.currentPeriodEndsAt)}.`
  }

  if (subscription.isInactiveByCancellation) {
    return 'Assinatura inativa por pedido de cancelamento.'
  }

  if (subscription.status === 'past_due') {
    return 'Pagamento pendente. Atualize a cobrança para manter o acesso.'
  }

  return 'Sem assinatura ativa. Assine para continuar acessando todos os apps.'
}

function needsLegalAcceptance(user: AuthUser, legalVersions: LegalVersions) {
  return (
    user.termsAccepted !== true ||
    user.privacyAccepted !== true ||
    user.legalTermsVersion !== legalVersions.legalTermsVersion ||
    user.privacyPolicyVersion !== legalVersions.privacyPolicyVersion
  )
}

function LegalDocumentPage({ type }: { type: 'terms' | 'privacy' }) {
  const isTerms = type === 'terms'
  const documentPath = isTerms ? '/legal/termos-de-uso.md' : '/legal/politica-de-privacidade.md'
  const [documentText, setDocumentText] = useState('')
  const [documentError, setDocumentError] = useState('')
  const [legalVersions, setLegalVersions] = useState<LegalVersions>(fallbackLegalVersions)

  useEffect(() => {
    fetchLegalVersions()
      .then(setLegalVersions)
      .catch(() => setLegalVersions(fallbackLegalVersions))

    fetch(documentPath)
      .then((response) => {
        if (!response.ok) throw new Error('Documento indisponível')
        return response.text()
      })
      .then(setDocumentText)
      .catch(() => setDocumentError('Não foi possível carregar este documento agora.'))
  }, [documentPath])

  return (
    <main className="legal-page">
      <section className="legal-page__content">
        <span className="eyebrow">Nexa Systems</span>
        <h1>{isTerms ? 'Termos de Uso' : 'Política de Privacidade'}</h1>
        <p>
          Versão vigente: {isTerms ? legalVersions.legalTermsVersion : legalVersions.privacyPolicyVersion}
        </p>
        {documentError ? <p className="legal-page__error">{documentError}</p> : null}
        {documentText ? (
          <div className="legal-page__document">
            <ReactMarkdown>{documentText}</ReactMarkdown>
          </div>
        ) : null}
        <a href="/" className="legal-page__back">Voltar ao portal</a>
      </section>
    </main>
  )
}

function SubscriptionPage({
  billingSummary,
  billingLoading,
  billingActionLoading,
  remainingTrialDays,
  onBack,
  onSelectPlan,
  onManageSubscription,
}: {
  billingSummary: BillingSummary | null
  billingLoading: boolean
  billingActionLoading: boolean
  remainingTrialDays: number
  onBack: () => void
  onSelectPlan: () => void
  onManageSubscription: () => void
}) {
  return (
    <main className="subscription-page">
      <section className="subscription-page__hero">
        <div>
          <span className="eyebrow">Assinatura</span>
          <h1>Escolha uma assinatura</h1>
          <p>Gerencie seu acesso aos módulos do Portal Nexa Systems em uma página dedicada e mais clara para contratação.</p>
        </div>
        <button type="button" className="ghost-button" onClick={onBack}>
          Voltar ao portal
        </button>
      </section>

      {billingLoading ? (
        <section className="subscription-page__loading">
          <p>Carregando informações da sua assinatura...</p>
        </section>
      ) : (
        <section className="subscription-page__grid">
          <article className="subscription-card subscription-card--featured">
            <div className="subscription-card__top">
              <span className="status-pill allowed">Plano disponível</span>
              <strong>Assinatura mensal</strong>
            </div>
            <h2>Nexa All Access</h2>
            <p>Libera todos os apps atuais e os próximos que entrarem no portal.</p>
            <ul className="subscription-card__features">
              <li>Acesso completo aos módulos liberados</li>
              <li>Experiência centralizada no Portal Nexa Systems</li>
              <li>Gerenciamento da assinatura na própria conta</li>
            </ul>
            <div className="subscription-card__footer">
              <strong>{billingSummary?.priceLabel ?? 'Plano mensal'}</strong>
              {billingSummary?.subscription?.isActive ? (
                <button type="button" className="primary-button" disabled={billingActionLoading} onClick={onManageSubscription}>
                  {billingActionLoading ? 'Abrindo...' : 'Gerenciar assinatura'}
                </button>
              ) : (
                <button type="button" className="primary-button" disabled={billingActionLoading} onClick={onSelectPlan}>
                  {billingActionLoading ? 'Redirecionando...' : 'Selecionar assinatura'}
                </button>
              )}
            </div>
          </article>

          <aside className="subscription-summary">
            <span className={`status-pill ${billingSummary?.subscription?.isActive ? 'allowed' : 'blocked'}`}>
              {getBillingStatusLabel(billingSummary?.subscription ?? null)}
            </span>
            <h3>Sua situação atual</h3>
            <p>{getBillingStatusText(billingSummary?.subscription ?? null, remainingTrialDays)}</p>
            <div className="subscription-summary__meta">
              <div>
                <span className="eyebrow">Plano atual</span>
                <strong>{billingSummary?.subscription?.isActive ? (billingSummary?.planName ?? 'Nexa All Access') : 'Sem plano ativo'}</strong>
              </div>
              <div>
                <span className="eyebrow">Cobrança</span>
                <strong>Mensal</strong>
              </div>
            </div>
          </aside>
        </section>
      )}
    </main>
  )
}

function ProfilePage({
  user,
  saving,
  error,
  name,
  phone,
  onNameChange,
  onPhoneChange,
  onSave,
  onBack,
}: {
  user: AuthUser
  saving: boolean
  error: string
  name: string
  phone: string
  onNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onSave: () => void
  onBack: () => void
}) {
  return (
    <main className="subscription-page">
      <section className="subscription-page__hero">
        <div>
          <span className="eyebrow">Perfil</span>
          <h1>Atualize seus dados</h1>
          <p>Mantenha seu nome e telefone sempre atualizados para facilitar suporte, notificações e gestão da sua conta.</p>
        </div>
        <button type="button" className="ghost-button" onClick={onBack}>
          Voltar ao portal
        </button>
      </section>

      <section className="subscription-page__grid">
        <article className="subscription-card subscription-card--featured">
          <div className="subscription-card__top">
            <span className="status-pill allowed">Conta principal</span>
            <strong>Dados da conta</strong>
          </div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <div className="profile-form">
            <label className="profile-form__field">
              <span>Nome</span>
              <input type="text" value={name} onChange={(event) => onNameChange(event.target.value.slice(0, 100))} />
            </label>
            <label className="profile-form__field">
              <span>Telefone</span>
              <input type="text" inputMode="numeric" value={phone} onChange={(event) => onPhoneChange(formatPhone(event.target.value))} />
            </label>
            {error ? <p className="profile-form__error">{error}</p> : null}
            <button type="button" className="primary-button profile-form__action" disabled={saving} onClick={onSave}>
              {saving ? 'Salvando...' : 'Atualizar dados'}
            </button>
          </div>
        </article>

        <aside className="subscription-summary">
          <span className="status-pill allowed">Perfil ativo</span>
          <h3>Resumo da conta</h3>
          <p>Use esta página para manter seu cadastro principal alinhado com o Portal Nexa Systems.</p>
          <div className="subscription-summary__meta">
            <div>
              <span className="eyebrow">E-mail</span>
              <strong>{user.email}</strong>
            </div>
            <div>
              <span className="eyebrow">Documento</span>
              <strong>{user.document}</strong>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}

function validateRegisterForm(form: typeof initialRegisterState) {
  if (form.name.trim().length < 3) return 'Nome muito curto'
  if (form.name.length > 100) return 'Nome deve ter no máximo 100 caracteres'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'E-mail inválido'
  if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(form.phone)) return 'Telefone inválido'
  if (!/^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(form.document)) return 'CPF/CNPJ inválido'
  if (!isValidCpfOrCnpj(form.document)) return 'Digite um CPF ou CNPJ valido'
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(form.password)) return 'Senha fora das regras'
  if (form.password !== form.passwordConfirm) return 'As senhas não conferem'
  return null
}

function validateVerificationCode(form: typeof initialRegisterState) {
  if (!/^\d{6}$/.test(form.verificationCode)) return 'Informe o código de 6 dígitos'
  return null
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname.replace(/\/$/, '') || '/')
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<AuthMode>('login')
  const [registerStep, setRegisterStep] = useState<RegisterStep>('details')
  const [resetStep, setResetStep] = useState<ResetStep>('request')
  const [session, setSession] = useState<SessionState | null>(null)
  const [systems, setSystems] = useState<CatalogSystem[]>([])
  const [message, setMessage] = useState('')
  const [registerInfoMessage, setRegisterInfoMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState(initialRegisterState)
  const [codeRequested, setCodeRequested] = useState(false)
  const [codeVerified, setCodeVerified] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showRegisterPasswordConfirm, setShowRegisterPasswordConfirm] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<DashboardPanel>(null)
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingActionLoading, setBillingActionLoading] = useState(false)
  const [showPasswordRules, setShowPasswordRules] = useState(false)
  const [showResetPasswordRules, setShowResetPasswordRules] = useState(false)
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0)
  const [resetMode, setResetMode] = useState(false)
  const [resetForm, setResetForm] = useState(initialResetState)
  const [showForgotPasswordLink, setShowForgotPasswordLink] = useState(false)
  const [legalAcceptedChecked, setLegalAcceptedChecked] = useState(false)
  const [legalAccepting, setLegalAccepting] = useState(false)
  const [legalAcceptError, setLegalAcceptError] = useState('')
  const [legalVersions, setLegalVersions] = useState<LegalVersions>(fallbackLegalVersions)
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false)
  const [purchaseSyncStatus, setPurchaseSyncStatus] = useState<PurchaseSyncStatus>('syncing')
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const passwordRules = getPasswordRules(registerForm.password)
  const passwordRulesSatisfied = Object.values(passwordRules).every(Boolean)
  const resetPasswordRules = getPasswordRules(resetForm.password)
  const resetPasswordRulesSatisfied = Object.values(resetPasswordRules).every(Boolean)
  const legalAcceptanceRequired = session ? needsLegalAcceptance(session.user, legalVersions) : false

  function navigateTo(path: string) {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }

  useEffect(() => {
    if (!resendAvailableAt) {
      setResendSecondsLeft(0)
      return
    }

    const updateRemaining = () => {
      const nextValue = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000))
      setResendSecondsLeft(nextValue)
      if (nextValue === 0) {
        setResendAvailableAt(null)
      }
    }

    updateRemaining()
    const intervalId = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(intervalId)
  }, [resendAvailableAt])

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

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(window.location.pathname.replace(/\/$/, '') || '/')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    fetchLegalVersions()
      .then(setLegalVersions)
      .catch(() => setLegalVersions(fallbackLegalVersions))
  }, [])

  useEffect(() => {
    if (!settingsMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setSettingsMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [settingsMenuOpen])

  useEffect(() => {
    const billingStatus = new URLSearchParams(window.location.search).get('billing')
    if (!billingStatus) return

    if (billingStatus === 'success') {
      const token = window.localStorage.getItem(storageKey)
      setMessage('')
      setPurchaseModalVisible(true)
      setPurchaseSyncStatus('syncing')
      if (token) {
        void syncPurchasedSubscription(token)
      }
    }
    if (billingStatus === 'cancelled') {
      setMessage('Checkout cancelado. Você pode tentar novamente quando quiser.')
    }

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('billing')
    window.history.replaceState({}, '', nextUrl.toString())
    setCurrentPath(nextUrl.pathname.replace(/\/$/, '') || '/')
  }, [])

  async function syncPurchasedSubscription(accessToken: string) {
    const maxAttempts = 8

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await hydrateSession(accessToken)
        const summary = await fetchBillingSummary(accessToken)
        setBillingSummary(summary)

        if (summary.subscription?.isActive) {
          setPurchaseSyncStatus('active')
          return
        }
      } catch {
        // Keep the modal open while Stripe/webhook synchronization catches up.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500))
    }

    setPurchaseSyncStatus('delayed')
  }

  async function hydrateSession(accessToken: string) {
    const [meResult, catalogResult] = await Promise.all([fetchMe(accessToken), fetchCatalog(accessToken)])
    setSession({
      accessToken,
      user: meResult.user,
      remainingTrialDays: meResult.meta.remainingTrialDays,
    })
    setProfileName(meResult.user.name)
    setProfilePhone(meResult.user.phone)
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
    setRegisterInfoMessage('')

    try {
      const response = await login(loginForm)
      window.localStorage.setItem(storageKey, response.accessToken)
      await hydrateSession(response.accessToken)
      setShowForgotPasswordLink(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao entrar')
      setShowForgotPasswordLink(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setRegisterInfoMessage('')

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
    setRegisterInfoMessage('')

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
      setRegisterInfoMessage('Código enviado para o e-mail informado')
      setResendAvailableAt(Date.now() + 60_000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar código')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLaunch(systemSlug: string) {
    if (!session) return
    if (legalAcceptanceRequired) return
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
    setRegisterInfoMessage('')
    setResendAvailableAt(null)
    setMode('login')
    setActivePanel(null)
    setBillingSummary(null)
    setShowForgotPasswordLink(false)
    setLegalAcceptedChecked(false)
    setLegalAcceptError('')
    setProfileName('')
    setProfilePhone('')
    setProfileError('')
    setLoading(false)
  }

  async function handleAcceptLegalDocuments() {
    if (!session || !legalAcceptedChecked) return

    setLegalAccepting(true)
    setLegalAcceptError('')

    try {
      const result = await acceptLegalDocuments(session.accessToken)
      setSession((current) => current ? { ...current, user: result.user } : current)
      setLegalAcceptedChecked(false)
    } catch (error) {
      setLegalAcceptError(error instanceof Error ? error.message : 'Não foi possível registrar o aceite. Tente novamente.')
    } finally {
      setLegalAccepting(false)
    }
  }

  async function openBillingPanel() {
    if (!session) return

    setSettingsMenuOpen(false)
    setBillingLoading(true)
    setMessage('')
    navigateTo('/assinatura')

    try {
      const summary = await fetchBillingSummary(session.accessToken)
      setBillingSummary(summary)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar assinatura')
    } finally {
      setBillingLoading(false)
    }
  }

  function openSupportPanel() {
    setSettingsMenuOpen(false)
    setActivePanel('support')
  }

  function openProfilePanel() {
    setSettingsMenuOpen(false)
    setActivePanel('profile')
    navigateTo('/perfil')
  }

  async function handleSaveProfile() {
    if (!session) return
    setProfileError('')

    if (profileName.trim().length < 3) {
      setProfileError('Nome muito curto')
      return
    }

    if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(profilePhone)) {
      setProfileError('Telefone inválido')
      return
    }

    setProfileSaving(true)

    try {
      const result = await updateProfile(session.accessToken, {
        name: profileName,
        phone: profilePhone,
      })

      setSession((current) => current ? { ...current, user: result.user } : current)
      setProfileName(result.user.name)
      setProfilePhone(result.user.phone)
      setMessage('Dados atualizados com sucesso.')
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Falha ao atualizar perfil')
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleStartCheckout() {
    if (!session) return

    setBillingActionLoading(true)
    setMessage('')

    try {
      const checkout = await createBillingCheckout(session.accessToken)
      window.location.href = checkout.url
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao iniciar checkout')
      setBillingActionLoading(false)
    }
  }

  async function handleOpenCustomerPortal() {
    if (!session) return

    setBillingActionLoading(true)
    setMessage('')

    try {
      const portal = await createBillingPortal(session.accessToken)
      window.location.href = portal.url
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir portal de cobrança')
      setBillingActionLoading(false)
    }
  }

  async function handleRequestPasswordReset(event?: React.FormEvent) {
    event?.preventDefault()
    setSubmitting(true)
    setMessage('')
    setRegisterInfoMessage('')

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetForm.email.trim())) {
      setMessage('Digite um email valido, por exemplo: nome@empresa.com')
      setSubmitting(false)
      return
    }

    try {
      await requestPasswordResetCode({ email: resetForm.email })
      setResetStep('verification')
      setRegisterInfoMessage('Código de redefinição enviado para o e-mail informado')
      setResendAvailableAt(Date.now() + 60_000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar código')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmPasswordReset(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setRegisterInfoMessage('')

    if (!/^\d{6}$/.test(resetForm.code)) {
      setMessage('Informe o código de 6 dígitos')
      setSubmitting(false)
      return
    }

    if (!resetPasswordRulesSatisfied) {
      setMessage('A nova senha ainda não atende todas as regras')
      setSubmitting(false)
      return
    }

    if (resetForm.password !== resetForm.passwordConfirm) {
      setMessage('As senhas não conferem')
      setSubmitting(false)
      return
    }

    try {
      await verifyPasswordResetCode({ email: resetForm.email, code: resetForm.code })
      await confirmPasswordReset(resetForm)
      setResetMode(false)
      setResetStep('request')
      setResetForm(initialResetState)
      setResendAvailableAt(null)
      setMessage('Senha redefinida com sucesso. Agora faça seu login.')
      setMode('login')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao redefinir senha')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackToRegisterDetails() {
    setRegisterStep('details')
    setCodeVerified(false)
    setMessage('')
    setRegisterInfoMessage('')
  }

  function openResetPassword() {
    setResetMode(true)
    setResetStep('request')
    setResetForm({ ...initialResetState, email: loginForm.email.trim() })
    setMessage('')
    setRegisterInfoMessage('')
    setResendAvailableAt(null)
  }

  function closeResetPassword() {
    setResetMode(false)
    setResetStep('request')
    setResetForm(initialResetState)
    setMessage('')
    setRegisterInfoMessage('')
    setResendAvailableAt(null)
  }

  if (currentPath === '/termos-de-uso') {
    return <LegalDocumentPage type="terms" />
  }

  if (currentPath === '/politica-de-privacidade') {
    return <LegalDocumentPage type="privacy" />
  }

  if (currentPath === '/assinatura' && session) {
    return (
      <SubscriptionPage
        billingSummary={billingSummary}
        billingLoading={billingLoading}
        billingActionLoading={billingActionLoading}
        remainingTrialDays={session.remainingTrialDays}
        onBack={() => {
          setActivePanel(null)
          navigateTo('/')
        }}
        onSelectPlan={() => void handleStartCheckout()}
        onManageSubscription={() => void handleOpenCustomerPortal()}
      />
    )
  }

  if (currentPath === '/perfil' && session) {
    return (
      <ProfilePage
        user={session.user}
        saving={profileSaving}
        error={profileError}
        name={profileName}
        phone={profilePhone}
        onNameChange={setProfileName}
        onPhoneChange={setProfilePhone}
        onSave={() => void handleSaveProfile()}
        onBack={() => {
          setActivePanel(null)
          navigateTo('/')
        }}
      />
    )
  }

  if (loading) {
    return <div className="screen-center">Carregando portal Nexa...</div>
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="hero-badge">Nexa Systems</div>
          <h1>Tenha acesso a diversos sistemas úteis que automatizam e controlam suas tarefas.</h1>
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

          {resetMode ? null : (
            <div className="auth-header">
              <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie seu acesso principal'}</h2>
              <p>{mode === 'login' ? 'Use sua conta Nexa para acessar todos os sistemas.' : ''}</p>
            </div>
          )}

          {mode === 'register' ? (
            <div className="step-indicator">
              <span className={registerStep === 'details' ? 'is-active' : ''}>1. Dados</span>
              <span className={registerStep === 'verification' ? 'is-active' : ''}>2. Código</span>
            </div>
          ) : null}

          {message ? <div className="feedback error">{message}</div> : null}

          {resetMode ? (
            <form className="auth-form" onSubmit={resetStep === 'request' ? handleRequestPasswordReset : handleConfirmPasswordReset}>
              <div className="auth-header auth-header--compact">
                <h2>Redefinir senha</h2>
                <p>
                  {resetStep === 'request'
                    ? 'Informe seu e-mail para receber um código de confirmação.'
                    : 'Digite o código recebido e defina sua nova senha.'}
                </p>
              </div>
              {resetStep === 'request' ? (
                <>
                  <input
                    type="email"
                    placeholder="Email"
                    value={resetForm.email}
                    onChange={(event) => setResetForm((current) => ({ ...current, email: event.target.value }))}
                  />
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Enviando código...' : 'Enviar código de redefinição'}
                  </button>
                  <button type="button" className="auth-action auth-action--secondary" disabled={submitting} onClick={closeResetPassword}>
                    Voltar para o login
                  </button>
                </>
              ) : (
                <>
                  <div className="verification-summary">
                    <strong>Confirmacao por email</strong>
                    <span>
                      Enviamos um código de 6 dígitos para{' '}
                      <strong className="verification-email">{resetForm.email}</strong>.
                    </span>
                  </div>
                  {registerInfoMessage ? <p className="verification-note">{registerInfoMessage}</p> : null}
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Código de 6 dígitos"
                    value={resetForm.code}
                    onChange={(event) => setResetForm((current) => ({ ...current, code: onlyDigits(event.target.value).slice(0, 6) }))}
                  />
                  <label className="password-field">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      placeholder="Nova senha"
                      value={resetForm.password}
                      onFocus={() => setShowResetPasswordRules(true)}
                      onChange={(event) => setResetForm((current) => ({ ...current, password: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showResetPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowResetPassword((current) => !current)}
                    >
                      <EyeIcon open={showResetPassword} />
                    </button>
                  </label>
                  {showResetPasswordRules ? (
                    <div className={`password-rules ${resetPasswordRulesSatisfied ? 'is-complete' : ''}`}>
                      <strong>Regras da senha</strong>
                      <span className={resetPasswordRules.hasUppercase ? 'is-valid' : ''}>1 caractere maiúsculo</span>
                      <span className={resetPasswordRules.hasLowercase ? 'is-valid' : ''}>1 caractere minúsculo</span>
                      <span className={resetPasswordRules.hasNumber ? 'is-valid' : ''}>1 número</span>
                      <span className={resetPasswordRules.hasSpecial ? 'is-valid' : ''}>1 caractere especial</span>
                      <span className={resetPasswordRules.hasMinLength ? 'is-valid' : ''}>No mínimo 8 caracteres</span>
                    </div>
                  ) : null}
                  <label className="password-field">
                    <input
                      type={showResetPasswordConfirm ? 'text' : 'password'}
                      placeholder="Confirmar nova senha"
                      value={resetForm.passwordConfirm}
                      onChange={(event) => setResetForm((current) => ({ ...current, passwordConfirm: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showResetPasswordConfirm ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowResetPasswordConfirm((current) => !current)}
                    >
                      <EyeIcon open={showResetPasswordConfirm} />
                    </button>
                  </label>
                  <button type="submit" className="auth-action auth-action--primary" disabled={submitting}>
                    {submitting ? 'Redefinindo senha...' : 'Salvar nova senha'}
                  </button>
                  <button type="button" className="auth-action auth-action--secondary" disabled={submitting} onClick={closeResetPassword}>
                    Voltar para o login
                  </button>
                  <button
                    type="button"
                    className="auth-action auth-action--tertiary"
                    disabled={submitting || resendSecondsLeft > 0}
                    onClick={() => void handleRequestPasswordReset()}
                  >
                    {resendSecondsLeft > 0 ? `Reenviar código em ${resendSecondsLeft}s` : 'Reenviar código'}
                  </button>
                </>
              )}
            </form>
          ) : mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              />
              {showForgotPasswordLink ? (
                <button type="button" className="auth-link-button auth-link-button--inline" onClick={openResetPassword}>
                  Esqueci minha senha
                </button>
              ) : null}
              <label className="password-field">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  placeholder="Senha"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowLoginPassword((current) => !current)}
                >
                  <EyeIcon open={showLoginPassword} />
                </button>
              </label>
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
                  <label className="password-field">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      placeholder="Senha"
                      value={registerForm.password}
                      onFocus={() => setShowPasswordRules(true)}
                      onChange={(event) => setRegisterForm((current) => ({ ...current, password: normalizeRegisterField('password', event.target.value) }))}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowRegisterPassword((current) => !current)}
                    >
                      <EyeIcon open={showRegisterPassword} />
                    </button>
                  </label>
                  {showPasswordRules ? (
                    <div className={`password-rules ${passwordRulesSatisfied ? 'is-complete' : ''}`}>
                      <strong>Regras da senha</strong>
                      <span className={passwordRules.hasUppercase ? 'is-valid' : ''}>1 caractere maiúsculo</span>
                      <span className={passwordRules.hasLowercase ? 'is-valid' : ''}>1 caractere minúsculo</span>
                      <span className={passwordRules.hasNumber ? 'is-valid' : ''}>1 número</span>
                      <span className={passwordRules.hasSpecial ? 'is-valid' : ''}>1 caractere especial</span>
                      <span className={passwordRules.hasMinLength ? 'is-valid' : ''}>No mínimo 8 caracteres</span>
                    </div>
                  ) : null}
                  <label className="password-field">
                    <input
                      type={showRegisterPasswordConfirm ? 'text' : 'password'}
                      placeholder="Confirmar senha"
                      value={registerForm.passwordConfirm}
                      onChange={(event) => setRegisterForm((current) => ({ ...current, passwordConfirm: normalizeRegisterField('passwordConfirm', event.target.value) }))}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showRegisterPasswordConfirm ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowRegisterPasswordConfirm((current) => !current)}
                    >
                      <EyeIcon open={showRegisterPasswordConfirm} />
                    </button>
                  </label>
                  <button type="button" disabled={submitting} onClick={handleRequestRegisterCode}>
                    {submitting ? 'Enviando código...' : 'Continuar e enviar código'}
                  </button>
                </>
              ) : (
                <>
                  <div className="verification-summary">
                    <strong>Confirmacao por email</strong>
                    <span>
                      Enviamos um código de 6 dígitos para{' '}
                      <strong className="verification-email">{registerForm.email}</strong>.
                    </span>
                  </div>
                  {registerInfoMessage ? <p className="verification-note">{registerInfoMessage}</p> : null}
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Código de 6 dígitos"
                    value={registerForm.verificationCode}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, verificationCode: onlyDigits(event.target.value).slice(0, 6) }))}
                  />
                  <button type="submit" className="auth-action auth-action--primary" disabled={submitting}>
                    {submitting ? 'Criando conta...' : 'Confirmar código e criar conta'}
                  </button>
                  <button type="button" className="auth-action auth-action--secondary" disabled={submitting} onClick={handleBackToRegisterDetails}>
                    Voltar para editar dados
                  </button>
                  <button
                    type="button"
                    className="auth-action auth-action--tertiary"
                    disabled={submitting || resendSecondsLeft > 0}
                    onClick={handleRequestRegisterCode}
                  >
                    {resendSecondsLeft > 0 ? `Reenviar código em ${resendSecondsLeft}s` : 'Reenviar código'}
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
          <div className="settings-menu" ref={settingsMenuRef}>
            <button
              type="button"
              className={`settings-button ${settingsMenuOpen ? 'is-open' : ''}`}
              onClick={() => setSettingsMenuOpen((current) => !current)}
              aria-label="Abrir menu de configurações"
              aria-expanded={settingsMenuOpen}
            >
              <FiSettings aria-hidden="true" className="settings-button__icon" />
            </button>
            {settingsMenuOpen ? (
              <div className="settings-dropdown">
                <button type="button" className="settings-dropdown__item" onClick={openProfilePanel}>
                  Perfil
                </button>
                <button type="button" className="settings-dropdown__item" onClick={() => void openBillingPanel()}>
                  Assinatura
                </button>
                <button type="button" className="settings-dropdown__item" onClick={openSupportPanel}>
                  Suporte
                </button>
              </div>
            ) : null}
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

      {purchaseModalVisible ? (
        <div className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-modal-title">
          <div className="purchase-modal__panel">
            <span className="eyebrow">Assinatura</span>
            <h2 id="purchase-modal-title">Obrigado pela sua assinatura</h2>
            {purchaseSyncStatus === 'syncing' ? (
              <p>Estamos confirmando seu pagamento e atualizando seu acesso automaticamente.</p>
            ) : null}
            {purchaseSyncStatus === 'active' ? (
              <p>Pagamento confirmado. Seu acesso ao Portal Nexa Systems já foi liberado.</p>
            ) : null}
            {purchaseSyncStatus === 'delayed' ? (
              <p>Seu pagamento foi iniciado, mas a confirmação ainda está sendo processada. Atualize a página em alguns instantes se o acesso não aparecer.</p>
            ) : null}
            <div className={`purchase-modal__status purchase-modal__status--${purchaseSyncStatus}`}>
              <span />
              <strong>
                {purchaseSyncStatus === 'syncing' ? 'Sincronizando assinatura...' : null}
                {purchaseSyncStatus === 'active' ? 'Acesso liberado' : null}
                {purchaseSyncStatus === 'delayed' ? 'Confirmação pendente' : null}
              </strong>
            </div>
            {purchaseSyncStatus !== 'syncing' ? (
              <button type="button" className="primary-button purchase-modal__action" onClick={() => setPurchaseModalVisible(false)}>
                Continuar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {activePanel === 'support' ? (
        <div className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
          <div className="support-modal__panel">
            <span className="eyebrow">Suporte</span>
            <h2 id="support-modal-title">Fale com a nossa equipe</h2>
            <p>Para atendimento e suporte do Portal Nexa Systems, entre em contato pelo e-mail abaixo.</p>
            <a href="mailto:suporte@swnexa.com" className="support-modal__email">suporte@swnexa.com</a>
            <button type="button" className="primary-button support-modal__action" onClick={() => setActivePanel(null)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {legalAcceptanceRequired && !purchaseModalVisible ? (
        <div className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
          <div className="legal-modal__panel">
            <span className="eyebrow">Documentos legais</span>
            <h2 id="legal-modal-title">Atualização dos termos</h2>
            <p>
              Para continuar utilizando o Portal Nexa Systems, é necessário ler e concordar com nossos Termos de Uso e nossa Política de Privacidade.
            </p>
            <div className="legal-modal__links">
              <a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso</a>
              <a href="/politica-de-privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>
            </div>
            <label className="legal-modal__check">
              <input
                type="checkbox"
                checked={legalAcceptedChecked}
                onChange={(event) => setLegalAcceptedChecked(event.target.checked)}
              />
              <span>Li e concordo com os Termos de Uso e a Política de Privacidade do Portal Nexa Systems.</span>
            </label>
            {legalAcceptError ? <p className="legal-modal__error">{legalAcceptError}</p> : null}
            <button
              type="button"
              className="primary-button legal-modal__action"
              disabled={!legalAcceptedChecked || legalAccepting}
              onClick={() => void handleAcceptLegalDocuments()}
            >
              {legalAccepting ? 'Registrando aceite...' : 'Aceitar e continuar'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

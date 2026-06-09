export type PlanDefinition = {
  slug: string
  name: string
  priceLabel: string
  description: string
}

export type SystemDefinition = {
  slug: string
  name: string
  description: string
  launchUrlEnv: string
  launchUrlFallback: string
  accent: string
  plans: PlanDefinition[]
}

export const systemCatalog: SystemDefinition[] = [
  {
    slug: 'fluxio',
    name: 'Fluxio',
    description: 'Crie formulários, acompanhe solicitações e gerencie processos com fluxos Kanban.',
    launchUrlEnv: 'FLUXIO_URL',
    launchUrlFallback: 'http://localhost:5174',
    accent: '#0f766e',
    plans: [
      { slug: 'starter', name: 'Starter', priceLabel: 'R$ 49/mes', description: 'Operacao enxuta com recursos essenciais.' },
      { slug: 'pro', name: 'Pro', priceLabel: 'R$ 99/mes', description: 'Mais automacao e suporte para times em crescimento.' },
    ],
  },
]

export function getSystemBySlug(systemSlug: string) {
  return systemCatalog.find((system) => system.slug === systemSlug)
}

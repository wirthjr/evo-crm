import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  Clock,
  ArrowRight,
  Activity,
  DollarSign,
  Bot,
  Plug,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  GitBranch,
  Settings,
  CircleHelp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import HealthBadge from '../components/HealthBadge'
import PluginWidgetsGrid from '../components/PluginWidgetsGrid'

interface OverviewData {
  metrics: {
    label: string
    value: string | number
    delta?: string
    deltaType?: 'up' | 'down' | 'neutral'
  }[]
  recent_reports: {
    title: string
    path: string
    date: string
    area: string
  }[]
  routines: {
    name: string
    last_run: string
    status: 'healthy' | 'warning' | 'critical'
    runs: number
  }[]
}

interface ActiveAgent {
  name: string
  status?: string
}

type HelpLocale = 'pt-BR' | 'en-US' | 'es'

interface HelpSection {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

interface HelpDocument {
  button: string
  badge: string
  title: string
  subtitle: string
  callout: string
  closeLabel: string
  sections: HelpSection[]
}

const HELP_DOCUMENTS: Record<HelpLocale, HelpDocument> = {
  'pt-BR': {
    button: 'Ajuda',
    badge: 'Guia do EvoNexus',
    title: 'Como o EvoNexus funciona e como integrá-lo ao Evo CRM',
    subtitle:
      'O EvoNexus é a camada de orquestração, memória e automação do ecossistema. Ele atua acima dos sistemas operacionais, organiza agentes especializados e transforma dados de negócio em rotinas, relatórios, contexto persistente e decisões assistidas.',
    callout:
      'O desenho recomendado é simples: o Evo CRM segue como sistema operacional e fonte transacional, enquanto o EvoNexus atua como camada de inteligência, memória, automação e coordenação multiagente.',
    closeLabel: 'Fechar ajuda',
    sections: [
      {
        title: 'Finalidade do EvoNexus',
        paragraphs: [
          'O EvoNexus não é apenas um chatbot. Ele foi desenhado como uma camada operacional multiagente para coordenar trabalho de negócio e engenharia com memória persistente, workflows programados, conhecimento compartilhado e observabilidade.',
          'Na prática, ele reúne agentes especializados, skills em Markdown, rotinas agendadas, dashboard web, integrações e uma knowledge base opcional para que a operação não dependa de prompts soltos ou contexto descartável.',
        ],
        bullets: [
          'Organiza agentes por domínio, como operações, vendas, customer success, produto, dados e engenharia.',
          'Mantém memória persistente em `CLAUDE.md`, diretório `memory/` e memória por agente.',
          'Executa rotinas diárias, semanais e mensais para briefing, consolidação, auditoria e acompanhamento.',
          'Centraliza tudo em um dashboard com custos, integrações, serviços, conhecimento e terminal.',
        ],
      },
      {
        title: 'Como a plataforma opera',
        paragraphs: [
          'O fluxo recomendado começa com o agente Oracle, que faz a descoberta do negócio, identifica gargalos e ajuda a montar um plano de ativação por fases. A partir daí, o workspace passa a operar com agentes e rotinas especializados.',
        ],
        bullets: [
          'O dashboard serve como camada de governança e operação diária.',
          'Os agentes são acionados por chat, terminal ou contexto da tarefa.',
          'As rotinas executam análises recorrentes e alimentam memória, relatórios e conhecimento.',
          'Os providers de IA podem ser alternados sem mudar o desenho operacional da plataforma.',
        ],
      },
      {
        title: 'Papel do Evo CRM nessa arquitetura',
        paragraphs: [
          'O papel mais saudável do Evo CRM é continuar como sistema transacional de relacionamento: contatos, conversas, inboxes, mensagens, pipeline e histórico operacional do cliente.',
          'O EvoNexus entra acima dele como camada de inteligência. Em vez de substituir o CRM, ele consome os dados do CRM, analisa padrões, produz relatórios, registra memória institucional e sugere próximas ações.',
        ],
        bullets: [
          'Evo CRM: sistema de registro e execução operacional.',
          'EvoNexus: sistema de inteligência, contexto, automação e coordenação multiagente.',
          'Evolution API ou Evolution Go: camada de mensageria e canais, quando aplicável.',
        ],
      },
      {
        title: 'Como integrar o Evo CRM ao EvoNexus',
        paragraphs: [
          'A base técnica dessa integração já existe no ecossistema. O EvoNexus prevê variáveis de ambiente para URL e token do CRM, skill dedicada de acesso ao CRM e reconhecimento da integração no dashboard.',
          'O caminho recomendado é começar por leitura e análise, validar valor operacional e só depois automatizar ações de escrita ou atualização de dados.',
        ],
        bullets: [
          'Configurar `EVO_CRM_URL` e `EVO_CRM_TOKEN` no ambiente do EvoNexus.',
          'Usar a integração para consultar contatos, conversas, mensagens, inboxes, pipelines e labels.',
          'Criar rotinas de alto valor para vendas, atendimento e customer success.',
          'Promover aprendizados do CRM para memória e knowledge base do EvoNexus.',
        ],
      },
      {
        title: 'Modelo de integração recomendado',
        paragraphs: [
          'A integração mais útil é bidirecional. De um lado, o EvoNexus consome sinais operacionais do CRM. Do outro, o Evo CRM pode consultar a base de conhecimento do EvoNexus para enriquecer respostas com contexto curado e durável.',
        ],
        bullets: [
          'Resumo diário de pipeline, contas em risco e clientes sem retorno.',
          'Agrupamento de temas recorrentes em conversas para produto e suporte.',
          'Sugestão de próxima melhor ação para vendas, CS e operação.',
          'Uso de Knowledge Nexus no CRM para respostas com base em documentação, FAQ e memória institucional.',
        ],
      },
      {
        title: 'Próximos passos práticos',
        paragraphs: [
          'Se a meta for capturar valor rápido, o ideal é começar pequeno, medir resultado e expandir por fase. Isso reduz risco, melhora governança e facilita a leitura do ROI.',
        ],
        bullets: [
          'Fase 1: conectar o CRM e validar consultas básicas.',
          'Fase 2: criar rotinas executivas para vendas e customer success.',
          'Fase 3: transformar sinais recorrentes em memória e conhecimento.',
          'Fase 4: conectar o CRM ao Knowledge Nexus com API key e spaces por domínio.',
        ],
      },
    ],
  },
  'en-US': {
    button: 'Help',
    badge: 'EvoNexus Guide',
    title: 'How EvoNexus works and how to integrate it with Evo CRM',
    subtitle:
      'EvoNexus is the orchestration, memory, and automation layer of the ecosystem. It sits above operational systems, coordinates specialized agents, and turns business data into routines, reports, persistent context, and assisted decisions.',
    callout:
      'The recommended design is simple: Evo CRM remains the operational and transactional system, while EvoNexus acts as the intelligence, memory, automation, and multi-agent coordination layer.',
    closeLabel: 'Close help',
    sections: [
      {
        title: 'What EvoNexus is for',
        paragraphs: [
          'EvoNexus is not just a chatbot. It is designed as a multi-agent operating layer for business and engineering work, with persistent memory, scheduled workflows, shared knowledge, and observability.',
          'In practice, it combines specialized agents, Markdown-based skills, scheduled routines, a web dashboard, integrations, and an optional knowledge base so the operation does not depend on disposable prompts or fragile context.',
        ],
        bullets: [
          'Organizes agents by domain such as operations, sales, customer success, product, data, and engineering.',
          'Keeps persistent memory in `CLAUDE.md`, the `memory/` directory, and agent-specific memory.',
          'Runs daily, weekly, and monthly routines for briefing, consolidation, audit, and follow-up.',
          'Centralizes costs, integrations, services, knowledge, and terminal access in one dashboard.',
        ],
      },
      {
        title: 'How the platform operates',
        paragraphs: [
          'The recommended flow starts with Oracle, which interviews the business, identifies bottlenecks, and helps create a phased activation plan. From there, the workspace runs through specialized agents and routines.',
        ],
        bullets: [
          'The dashboard acts as the daily governance and operations layer.',
          'Agents are invoked through chat, terminal, or task context.',
          'Routines execute recurring analysis and feed memory, reports, and knowledge.',
          'AI providers can change without changing the operating model.',
        ],
      },
      {
        title: 'Role of Evo CRM in this architecture',
        paragraphs: [
          'The healthiest role for Evo CRM is to remain the transactional relationship system: contacts, conversations, inboxes, messages, pipeline, and customer operational history.',
          'EvoNexus sits above it as the intelligence layer. Instead of replacing the CRM, it consumes CRM data, analyzes patterns, produces reports, stores institutional memory, and suggests next actions.',
        ],
        bullets: [
          'Evo CRM: system of record and operational execution.',
          'EvoNexus: system of intelligence, context, automation, and multi-agent coordination.',
          'Evolution API or Evolution Go: messaging and channel layer when applicable.',
        ],
      },
      {
        title: 'How to integrate Evo CRM into EvoNexus',
        paragraphs: [
          'The technical foundation for this integration already exists in the ecosystem. EvoNexus supports dedicated CRM environment variables, a CRM integration skill, and dashboard-level awareness of the integration.',
          'The best path is to start with read-only analysis, validate operational value, and only later automate writes or record updates.',
        ],
        bullets: [
          'Configure `EVO_CRM_URL` and `EVO_CRM_TOKEN` in the EvoNexus environment.',
          'Use the integration to query contacts, conversations, messages, inboxes, pipelines, and labels.',
          'Create high-value routines for sales, support, and customer success.',
          'Promote CRM learnings into EvoNexus memory and knowledge spaces.',
        ],
      },
      {
        title: 'Recommended integration model',
        paragraphs: [
          'The most useful model is bidirectional. On one side, EvoNexus consumes operational signals from the CRM. On the other, Evo CRM can query EvoNexus knowledge spaces to enrich responses with curated and durable context.',
        ],
        bullets: [
          'Daily pipeline summary, at-risk accounts, and customers without follow-up.',
          'Clustering of recurring conversation themes for product and support teams.',
          'Next-best-action suggestions for sales, CS, and operations.',
          'Knowledge Nexus usage inside the CRM for answers grounded in documentation, FAQ, and institutional memory.',
        ],
      },
      {
        title: 'Practical next steps',
        paragraphs: [
          'If the goal is quick value capture, start small, measure outcomes, and expand by phase. That reduces risk, improves governance, and makes ROI easier to read.',
        ],
        bullets: [
          'Phase 1: connect the CRM and validate basic queries.',
          'Phase 2: create executive routines for sales and customer success.',
          'Phase 3: turn recurring signals into memory and knowledge.',
          'Phase 4: connect the CRM to Knowledge Nexus with API keys and domain-specific spaces.',
        ],
      },
    ],
  },
  es: {
    button: 'Ayuda',
    badge: 'Guía de EvoNexus',
    title: 'Cómo funciona EvoNexus y cómo integrarlo con Evo CRM',
    subtitle:
      'EvoNexus es la capa de orquestación, memoria y automatización del ecosistema. Se posiciona por encima de los sistemas operativos, coordina agentes especializados y convierte los datos del negocio en rutinas, informes, contexto persistente y decisiones asistidas.',
    callout:
      'El diseño recomendado es simple: Evo CRM sigue como sistema operativo y fuente transaccional, mientras que EvoNexus actúa como capa de inteligencia, memoria, automatización y coordinación multiagente.',
    closeLabel: 'Cerrar ayuda',
    sections: [
      {
        title: 'Finalidad de EvoNexus',
        paragraphs: [
          'EvoNexus no es solo un chatbot. Fue diseñado como una capa operativa multiagente para trabajo de negocio e ingeniería, con memoria persistente, flujos programados, conocimiento compartido y observabilidad.',
          'En la práctica, reúne agentes especializados, skills en Markdown, rutinas agendadas, dashboard web, integraciones y una base de conocimiento opcional para que la operación no dependa de prompts sueltos ni de contexto descartable.',
        ],
        bullets: [
          'Organiza agentes por dominio, como operaciones, ventas, customer success, producto, datos e ingeniería.',
          'Mantiene memoria persistente en `CLAUDE.md`, en el directorio `memory/` y por agente.',
          'Ejecuta rutinas diarias, semanales y mensuales para briefing, consolidación, auditoría y seguimiento.',
          'Centraliza costos, integraciones, servicios, conocimiento y terminal en un solo dashboard.',
        ],
      },
      {
        title: 'Cómo opera la plataforma',
        paragraphs: [
          'El flujo recomendado comienza con Oracle, que entrevista al negocio, identifica cuellos de botella y ayuda a construir un plan de activación por fases. A partir de ahí, el workspace opera con agentes y rutinas especializadas.',
        ],
        bullets: [
          'El dashboard funciona como capa de gobernanza y operación diaria.',
          'Los agentes se activan por chat, terminal o contexto de la tarea.',
          'Las rutinas ejecutan análisis recurrentes y alimentan memoria, informes y conocimiento.',
          'Los providers de IA pueden cambiar sin alterar el modelo operativo.',
        ],
      },
      {
        title: 'Papel de Evo CRM en esta arquitectura',
        paragraphs: [
          'El papel más saludable de Evo CRM es seguir siendo el sistema transaccional de relación: contactos, conversaciones, bandejas, mensajes, pipeline e historial operativo del cliente.',
          'EvoNexus entra por encima como capa de inteligencia. En lugar de reemplazar al CRM, consume sus datos, analiza patrones, produce informes, registra memoria institucional y sugiere próximas acciones.',
        ],
        bullets: [
          'Evo CRM: sistema de registro y ejecución operativa.',
          'EvoNexus: sistema de inteligencia, contexto, automatización y coordinación multiagente.',
          'Evolution API o Evolution Go: capa de mensajería y canales, cuando aplica.',
        ],
      },
      {
        title: 'Cómo integrar Evo CRM con EvoNexus',
        paragraphs: [
          'La base técnica de esta integración ya existe en el ecosistema. EvoNexus contempla variables de entorno para URL y token del CRM, una skill dedicada de acceso al CRM y reconocimiento de la integración en el dashboard.',
          'La mejor ruta es comenzar con análisis de solo lectura, validar valor operativo y recién después automatizar escrituras o actualizaciones de registros.',
        ],
        bullets: [
          'Configurar `EVO_CRM_URL` y `EVO_CRM_TOKEN` en el entorno de EvoNexus.',
          'Usar la integración para consultar contactos, conversaciones, mensajes, bandejas, pipelines y etiquetas.',
          'Crear rutinas de alto valor para ventas, soporte y customer success.',
          'Promover aprendizajes del CRM a memoria y espacios de conocimiento de EvoNexus.',
        ],
      },
      {
        title: 'Modelo de integración recomendado',
        paragraphs: [
          'El modelo más útil es bidireccional. Por un lado, EvoNexus consume señales operativas del CRM. Por otro, Evo CRM puede consultar los espacios de conocimiento de EvoNexus para enriquecer respuestas con contexto curado y duradero.',
        ],
        bullets: [
          'Resumen diario del pipeline, cuentas en riesgo y clientes sin seguimiento.',
          'Agrupación de temas recurrentes en conversaciones para producto y soporte.',
          'Sugerencia de próxima mejor acción para ventas, CS y operaciones.',
          'Uso de Knowledge Nexus dentro del CRM para respuestas basadas en documentación, FAQ y memoria institucional.',
        ],
      },
      {
        title: 'Próximos pasos prácticos',
        paragraphs: [
          'Si el objetivo es capturar valor rápido, conviene empezar pequeño, medir resultados y expandir por fases. Eso reduce riesgo, mejora la gobernanza y facilita la lectura del ROI.',
        ],
        bullets: [
          'Fase 1: conectar el CRM y validar consultas básicas.',
          'Fase 2: crear rutinas ejecutivas para ventas y customer success.',
          'Fase 3: convertir señales recurrentes en memoria y conocimiento.',
          'Fase 4: conectar el CRM a Knowledge Nexus con API keys y spaces por dominio.',
        ],
      },
    ],
  },
}

// --- Area color mapping for report badges ---
const AREA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Operations': { bg: 'rgba(34,211,238,0.10)', text: '#22D3EE', border: 'rgba(34,211,238,0.25)' },
  'Finance': { bg: 'rgba(52,211,153,0.10)', text: '#34D399', border: 'rgba(52,211,153,0.25)' },
  'Projects': { bg: 'rgba(96,165,250,0.10)', text: '#60A5FA', border: 'rgba(96,165,250,0.25)' },
  'Community': { bg: 'rgba(251,191,36,0.10)', text: '#FBBF24', border: 'rgba(251,191,36,0.25)' },
  'Social': { bg: 'rgba(168,85,247,0.10)', text: '#A855F7', border: 'rgba(168,85,247,0.25)' },
  'Strategy': { bg: 'rgba(244,114,182,0.10)', text: '#F472B6', border: 'rgba(244,114,182,0.25)' },
  'Health': { bg: 'rgba(251,113,133,0.10)', text: '#FB7185', border: 'rgba(251,113,133,0.25)' },
  'Licensing': { bg: 'rgba(45,212,191,0.10)', text: '#2DD4BF', border: 'rgba(45,212,191,0.25)' },
}

function getAreaStyle(area: string) {
  const key = Object.keys(AREA_COLORS).find((k) => area.toLowerCase().includes(k.toLowerCase()))
  return key ? AREA_COLORS[key] : { bg: 'rgba(0,255,167,0.08)', text: '#00FFA7', border: 'rgba(0,255,167,0.20)' }
}

// --- Metric card icon mapping ---
const METRIC_ICONS: Record<string, LucideIcon> = {
  'Routines Executed': Activity,
  'Total Cost': DollarSign,
  'Agents': Bot,
  'Active Integrations': Plug,
}

function getMetricIcon(label: string): LucideIcon {
  for (const [key, icon] of Object.entries(METRIC_ICONS)) {
    if (label.toLowerCase().includes(key.toLowerCase())) return icon
  }
  return Activity
}

// --- Relative time helper ---
function relativeTime(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// --- Skeleton Components ---
function SkeletonCard() {
  return <div className="skeleton h-32 rounded-2xl" />
}

function SkeletonRow() {
  return <div className="skeleton h-14 rounded-lg mb-2" />
}

function SkeletonPill() {
  return <div className="skeleton h-8 w-24 rounded-full" />
}

// --- Stat Card ---
function StatCard({
  label,
  value,
  delta,
  deltaType = 'neutral',
  icon: Icon,
}: {
  label: string
  value: string | number
  delta?: string
  deltaType?: 'up' | 'down' | 'neutral'
  icon: LucideIcon
}) {
  const deltaColor = {
    up: 'text-[#00FFA7]',
    down: 'text-red-400',
    neutral: 'text-[#667085]',
  }[deltaType]

  const deltaBg = {
    up: 'bg-[#00FFA7]/10',
    down: 'bg-red-400/10',
    neutral: 'bg-[#667085]/10',
  }[deltaType]

  const DeltaIcon = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: Minus,
  }[deltaType]

  return (
    <div className="group relative bg-[#161b22] border border-[#21262d] rounded-2xl p-5 transition-all duration-300 hover:border-[#00FFA7]/40 hover:shadow-[0_0_24px_rgba(0,255,167,0.06)]">
      {/* Subtle top gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00FFA7]/20 to-transparent rounded-t-2xl" />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#00FFA7]/8 border border-[#00FFA7]/15">
          <Icon size={18} className="text-[#00FFA7]" />
        </div>
        {delta && (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${deltaColor} ${deltaBg}`}>
            <DeltaIcon size={12} />
            <span>{delta}</span>
          </div>
        )}
      </div>

      <p className="text-3xl font-bold text-[#e6edf3] tracking-tight">{value}</p>
      <p className="text-sm text-[#667085] mt-1">{label}</p>
    </div>
  )
}

// --- Active Agents Bar ---
function ActiveAgentsBar({ agents, loading }: { agents: ActiveAgent[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 mb-8 px-1">
        <SkeletonPill />
        <SkeletonPill />
        <SkeletonPill />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 mb-8 flex-wrap">
      <span className="text-xs font-medium text-[#667085] uppercase tracking-wider mr-1">Active Agents</span>
      {agents.length === 0 ? (
        <span className="text-xs text-[#667085]/60 italic">No agents running</span>
      ) : (
        agents.map((agent, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-[#161b22] border border-[#21262d] text-[#e6edf3]"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FFA7] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00FFA7]" />
            </span>
            {agent.name}
          </span>
        ))
      )}
    </div>
  )
}

// --- Quick Actions ---
const QUICK_ACTIONS = [
  { label: 'Agents', icon: Bot, to: '/agents', hint: 'Talk to agents' },
  { label: 'Providers', icon: Settings, to: '/providers', hint: 'AI configuration' },
  { label: 'View Costs', icon: BarChart3, to: '/costs', hint: 'Financial overview' },
  { label: 'Check GitHub', icon: GitBranch, to: '/integrations', hint: 'Repo status' },
]

// --- Main Component ---
export default function Overview() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  const helpLocale: HelpLocale = i18n.language.startsWith('pt')
    ? 'pt-BR'
    : i18n.language.startsWith('es')
      ? 'es'
      : 'en-US'
  const helpDoc = HELP_DOCUMENTS[helpLocale]

  useEffect(() => {
    api.get('/overview')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const fetchActiveAgents = useCallback(() => {
    api.get('/agents/active')
      .then((agents: ActiveAgent[]) => {
        setActiveAgents(Array.isArray(agents) ? agents : [])
      })
      .catch(() => {
        setActiveAgents([])
      })
      .finally(() => setAgentsLoading(false))
  }, [])

  useEffect(() => {
    fetchActiveAgents()
    const interval = setInterval(fetchActiveAgents, 5000)
    return () => clearInterval(interval)
  }, [fetchActiveAgents])

  useEffect(() => {
    if (!helpOpen) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [helpOpen])

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Failed to load overview</p>
          <p className="text-[#667085] text-sm">{error}</p>
        </div>
      </div>
    )
  }

  const recentReports = data?.recent_reports?.slice(0, 5) ?? []
  const routines = data?.routines?.slice(0, 8) ?? []

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">{t('overview.title')}</h1>
          <p className="text-[#667085] text-sm mt-1">{t('overview.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-[#344054] bg-[#161b22] px-4 py-2.5 text-sm font-medium text-[#D0D5DD] transition-all duration-200 hover:border-[#00FFA7]/40 hover:bg-[#00FFA7]/[0.06] hover:text-white hover:shadow-[0_0_24px_rgba(0,255,167,0.08)]"
          aria-label={helpDoc.button}
        >
          <CircleHelp size={16} className="text-[#00FFA7]" />
          <span>{helpDoc.button}</span>
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          data?.metrics?.map((m, i) => (
            <StatCard
              key={i}
              label={m.label}
              value={m.value}
              delta={m.delta}
              deltaType={m.deltaType}
              icon={getMetricIcon(m.label)}
            />
          ))
        )}
      </div>

      {/* Active Agents Bar */}
      <ActiveAgentsBar agents={activeAgents} loading={agentsLoading} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Reports */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-6 transition-all duration-300 hover:border-[#21262d] hover:shadow-[0_0_32px_rgba(0,255,167,0.04)]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-[#e6edf3] flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#00FFA7]/8 border border-[#00FFA7]/15">
                <FileText size={14} className="text-[#00FFA7]" />
              </div>
              Recent Reports
            </h2>
            <Link to="/workspace" className="text-xs font-medium text-[#667085] hover:text-[#00FFA7] transition-colors flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : recentReports.length ? (
            <div className="space-y-1">
              {recentReports.map((r, i) => {
                const areaStyle = getAreaStyle(r.area)
                return (
                  <Link
                    key={i}
                    to={`/workspace/${r.path?.replace(/^workspace\//, '') || ''}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-all group"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] shrink-0">
                      <FileText size={14} className="text-[#667085] group-hover:text-[#e6edf3] transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#e6edf3] group-hover:text-white transition-colors truncate">{r.title}</p>
                      <p className="text-xs text-[#667085] mt-0.5">{relativeTime(r.date)}</p>
                    </div>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
                      style={{
                        backgroundColor: areaStyle.bg,
                        color: areaStyle.text,
                        borderColor: areaStyle.border,
                      }}
                    >
                      {r.area}
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-[#667085] text-sm">No recent reports</p>
            </div>
          )}
        </div>

        {/* Routines */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-2xl p-6 transition-all duration-300 hover:border-[#21262d] hover:shadow-[0_0_32px_rgba(0,255,167,0.04)]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-[#e6edf3] flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#00FFA7]/8 border border-[#00FFA7]/15">
                <Clock size={14} className="text-[#00FFA7]" />
              </div>
              Routines
            </h2>
            <Link to="/activity" className="text-xs font-medium text-[#667085] hover:text-[#00FFA7] transition-colors flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : routines.length ? (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#667085] text-[11px] uppercase tracking-wider font-medium">
                    <th className="text-left pb-3 pr-4">Routine</th>
                    <th className="text-left pb-3 pr-4">Status</th>
                    <th className="text-right pb-3 pr-4">Runs</th>
                    <th className="text-right pb-3">Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {routines.map((r, i) => (
                    <tr
                      key={i}
                      className="border-t border-[#21262d]/60 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-2.5 pr-4 text-[#e6edf3] text-[13px] font-medium">{r.name}</td>
                      <td className="py-2.5 pr-4">
                        <HealthBadge status={r.status} label={r.status} />
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[#D0D5DD] tabular-nums text-[13px]">{r.runs}</td>
                      <td className="py-2.5 text-right text-[#667085] text-[13px]">{relativeTime(r.last_run)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-[#667085] text-sm">No routines data</p>
            </div>
          )}
        </div>
      </div>

      {/* Plugin Widgets */}
      <PluginWidgetsGrid mountPoint="overview" />

      {/* Quick Actions */}
      <div className="mb-4">
        <h3 className="text-xs font-medium text-[#667085] uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.label}
                to={action.to}
                className="group flex items-center gap-3 bg-[#161b22] border border-[#21262d] rounded-xl px-4 py-3 transition-all duration-200 hover:border-[#00FFA7]/30 hover:bg-[#00FFA7]/[0.03]"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] group-hover:bg-[#00FFA7]/10 transition-colors">
                  <Icon size={15} className="text-[#667085] group-hover:text-[#00FFA7] transition-colors" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#e6edf3] group-hover:text-white truncate">{action.label}</p>
                  <p className="text-[11px] text-[#667085] truncate">{action.hint}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="relative mx-auto flex h-[min(92vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-[#344054] bg-[#0C111D] shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#21262d] px-6 py-5 sm:px-8">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00FFA7]/20 bg-[#00FFA7]/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#7EE7C5]">
                  <CircleHelp size={12} />
                  <span>{helpDoc.badge}</span>
                </div>
                <h2 className="max-w-3xl text-xl font-semibold tracking-tight text-[#F8FAFC] sm:text-2xl">
                  {helpDoc.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#98A2B3]">
                  {helpDoc.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="shrink-0 rounded-xl border border-[#344054] bg-white/[0.02] p-2 text-[#98A2B3] transition-colors hover:border-[#00FFA7]/35 hover:text-white"
                aria-label={helpDoc.closeLabel}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <div className="rounded-[24px] border border-[#21262d] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 sm:p-8">
                <div className="mb-6 rounded-2xl border border-[#00FFA7]/15 bg-[#00FFA7]/[0.04] px-4 py-3 text-sm leading-6 text-[#B7C2D0]">
                  {helpDoc.callout}
                </div>

                <div className="space-y-6">
                  {helpDoc.sections.map((section, index) => (
                    <section
                      key={section.title}
                      className={index === 0 ? '' : 'border-t border-[#21262d] pt-6'}
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#00FFA7]/15 bg-[#00FFA7]/10 text-sm font-semibold text-[#00FFA7]">
                          {index + 1}
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight text-[#F8FAFC]">
                          {section.title}
                        </h3>
                      </div>

                      <div className="space-y-3">
                        {section.paragraphs.map((paragraph) => (
                          <p key={paragraph} className="text-[14px] leading-7 text-[#98A2B3]">
                            {paragraph}
                          </p>
                        ))}
                      </div>

                      {section.bullets && section.bullets.length > 0 && (
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-[14px] leading-7 text-[#C9D2DE] marker:text-[#00FFA7]">
                          {section.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

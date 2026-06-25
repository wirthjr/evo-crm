import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Menu,
  X,
  BookOpen,
  Rocket,
  LayoutDashboard,
  Bot,
  Zap,
  Clock,
  Plug,
  Globe,
  FileText,
  Folder,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'

const API = import.meta.env.DEV ? 'http://localhost:8080' : ''

interface DocEntry {
  title: string
  slug: string
  path: string
  content_preview?: string
}

interface DocSection {
  title: string
  slug: string
  children: DocEntry[]
}

interface TreeNode {
  id: string
  label: string
  type: 'folder' | 'file'
  slug?: string
  path?: string
  content_preview?: string
  children: TreeNode[]
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  'getting-started': Rocket,
  'guides': BookOpen,
  'dashboard': LayoutDashboard,
  'agents': Bot,
  'skills': Zap,
  'routines': Clock,
  'integrations': Plug,
  'real-world': Globe,
  'reference': FileText,
}

function humanizeSegment(segment: string) {
  return segment
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function sortTreeNodes(nodes: TreeNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

function buildSectionTree(section: DocSection): TreeNode[] {
  const roots: TreeNode[] = []

  const ensureFolder = (bucket: TreeNode[], id: string, label: string) => {
    let folderNode = bucket.find((node) => node.id === id && node.type === 'folder')
    if (!folderNode) {
      folderNode = { id, label, type: 'folder', children: [] }
      bucket.push(folderNode)
    }
    return folderNode
  }

  for (const entry of section.children) {
    const normalizedPath = entry.path.startsWith('root/') ? entry.path.slice(5) : entry.path
    const parts = normalizedPath.split('/').filter(Boolean)
    let currentLevel = roots
    let accumulatedPath = ''

    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

      if (isLeaf) {
        currentLevel.push({
          id: `${section.slug}:${entry.slug}`,
          label: entry.title || humanizeSegment(part),
          type: 'file',
          slug: entry.slug,
          path: entry.path,
          content_preview: entry.content_preview,
          children: [],
        })
        return
      }

      const folder = ensureFolder(
        currentLevel,
        `${section.slug}:folder:${accumulatedPath}`,
        humanizeSegment(part),
      )
      currentLevel = folder.children
    })
  }

  const deepSort = (nodes: TreeNode[]): TreeNode[] =>
    sortTreeNodes(nodes).map((node) => ({
      ...node,
      children: node.type === 'folder' ? deepSort(node.children) : node.children,
    }))

  return deepSort(roots)
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes

  const q = query.toLowerCase()

  return nodes.reduce<TreeNode[]>((acc, node) => {
    const matchesLabel = node.label.toLowerCase().includes(q)
    const matchesPreview = node.content_preview?.toLowerCase().includes(q) ?? false

    if (node.type === 'file') {
      if (matchesLabel || matchesPreview) acc.push(node)
      return acc
    }

    const filteredChildren = filterTree(node.children, query)
    if (matchesLabel || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren })
    }
    return acc
  }, [])
}

function findAncestorIds(nodes: TreeNode[], slug: string, trail: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'file' && node.slug === slug) return trail
    if (node.type === 'folder') {
      const result = findAncestorIds(node.children, slug, [...trail, node.id])
      if (result.length > 0) return result
    }
  }
  return []
}

export default function Docs() {
  const location = useLocation()
  const navigate = useNavigate()

  const [sections, setSections] = useState<DocSection[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSlug, setActiveSlug] = useState('')

  // Derive the current doc slug from the URL
  const getSlugFromPath = useCallback(() => {
    const prefix = '/docs'
    const path = location.pathname
    if (path === prefix || path === prefix + '/') return ''
    return path.slice(prefix.length + 1)
  }, [location.pathname])

  // Load the doc tree
  useEffect(() => {
    fetch(`${API}/api/docs`)
      .then((r) => r.json())
      .then((data) => setSections(data.sections || []))
      .catch(() => setSections([]))
  }, [])

  // Load content when slug changes
  useEffect(() => {
    const slug = getSlugFromPath()
    setActiveSlug(slug)

    // Find the matching doc entry
    let docPath = ''
    if (!slug && sections.length > 0) {
      // Default to first doc
      const first = sections[0]?.children?.[0]
      if (first) {
        docPath = first.path
        setActiveSlug(first.slug)
      }
    } else {
      for (const sec of sections) {
        const entry = sec.children.find((c) => c.slug === slug)
        if (entry) {
          docPath = entry.path
          break
        }
      }
    }

    if (!docPath) {
      if (sections.length > 0) setContent('# Page not found\n\nThe requested documentation page was not found.')
      return
    }

    setLoading(true)
    fetch(`${API}/api/docs/${docPath}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.text()
      })
      .then((md) => {
        setContent(md)
        setLoading(false)
      })
      .catch(() => {
        setContent('# Error\n\nCould not load this page.')
        setLoading(false)
      })
  }, [getSlugFromPath, sections])

  const handleNav = (slug: string) => {
    navigate(`/docs/${slug}`)
    setMobileOpen(false)
  }

  const toggleNode = (id: string, defaultExpanded = false) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? defaultExpanded) }))
  }

  const treeSections = useMemo(
    () => sections.map((section) => ({ ...section, nodes: buildSectionTree(section) })),
    [sections],
  )

  const activeAncestorIds = useMemo(() => {
    const ids = new Set<string>()
    for (const section of treeSections) {
      if (activeSlug) {
        ids.add(section.slug)
        findAncestorIds(section.nodes, activeSlug).forEach((id) => ids.add(id))
      }
    }
    return ids
  }, [treeSections, activeSlug])

  const filteredSections = useMemo(() => {
    const query = search.trim()
    return treeSections
      .map((section) => ({
        ...section,
        nodes: filterTree(section.nodes, query),
      }))
      .filter((section) => section.nodes.length > 0)
  }, [treeSections, search])

  const getSnippet = (preview?: string) => {
    const query = search.trim().toLowerCase()
    if (!preview || !query) return null
    const previewLower = preview.toLowerCase()
    const start = previewLower.indexOf(query)
    if (start < 0) return null
    return `...${preview.slice(Math.max(0, start - 18), start + query.length + 42)}...`
  }

  const renderTreeNode = (node: TreeNode, depth = 0): ReactNode => {
    if (node.type === 'folder') {
      const defaultExpanded = search.trim().length > 0 || activeAncestorIds.has(node.id)
      const isExpanded = expanded[node.id] ?? defaultExpanded

      return (
        <div key={node.id} className="mb-0.5">
          <button
            type="button"
            onClick={() => toggleNode(node.id, defaultExpanded)}
            className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
            style={{ paddingLeft: `${8 + depth * 16}px` }}
          >
            {isExpanded ? (
              <ChevronDown size={12} className="shrink-0 text-[#667085] group-hover:text-[#D0D5DD]" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-[#667085] group-hover:text-[#D0D5DD]" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="shrink-0 text-[#00FFA7]/80" />
            ) : (
              <Folder size={14} className="shrink-0 text-[#00FFA7]/60" />
            )}
            <span className="truncate text-[13px] font-medium text-[#98A2B3] group-hover:text-[#E5E7EB]">
              {node.label}
            </span>
          </button>
          {isExpanded && node.children.length > 0 && (
            <div className="mt-0.5">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    const snippet = getSnippet(node.content_preview)

    return (
      <button
        key={node.id}
        type="button"
        onClick={() => handleNav(node.slug!)}
        className={`mb-0.5 block w-full rounded-lg border-l-2 py-2 text-left transition-colors ${activeSlug === node.slug
          ? 'border-[#00FFA7] bg-[#00FFA7]/10 text-[#00FFA7]'
          : 'border-transparent text-[#667085] hover:bg-white/5 hover:text-[#D0D5DD]'
          }`}
        style={{ paddingLeft: `${26 + depth * 16}px`, paddingRight: '10px' }}
      >
        <div className="flex items-start gap-2">
          <FileText size={13} className={`mt-0.5 shrink-0 ${activeSlug === node.slug ? 'text-[#00FFA7]' : 'text-[#667085]'}`} />
          <div className="min-w-0">
            <span className="block truncate text-[13px]">{node.label}</span>
            {snippet && (
              <span className="mt-0.5 block truncate text-[11px] text-[#475467]">
                {snippet}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-5 flex items-center justify-between border-b border-[#344054]">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-[#00FFA7]" />
          <span className="text-lg font-bold">
            <span className="text-[#00FFA7]">Evo</span>
            <span className="text-white">Nexus</span>
            <span className="text-[#667085] ml-1.5 text-sm font-normal">Docs</span>
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 rounded hover:bg-white/10 text-[#667085]"
        >
          <X size={20} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-[#667085]" />
          <input
            type="text"
            placeholder="Search docs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-[#182230] border border-[#344054] rounded-lg text-[#D0D5DD] placeholder-[#667085] focus:outline-none focus:border-[#00FFA7]/50"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {filteredSections.map((sec) => {
          const Icon = SECTION_ICONS[sec.slug] || FileText
          const defaultExpanded = search.trim().length > 0 || activeAncestorIds.has(sec.slug) || sections.length > 0
          const isExpanded = expanded[sec.slug] ?? defaultExpanded

          return (
            <div key={sec.slug} className="mb-2">
              <button
                type="button"
                onClick={() => toggleNode(sec.slug, defaultExpanded)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] uppercase tracking-widest text-[#667085] font-semibold hover:text-[#D0D5DD] transition-colors"
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Icon size={13} className="text-[#00FFA7]/60" />
                <span className="truncate">{sec.title}</span>
              </button>
              {isExpanded && (
                <div className="mt-1">
                  {sec.nodes.map((node) => renderTreeNode(node))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Back to dashboard */}
      <div className="px-4 py-3 border-t border-[#344054]/50">
        <a
          href="/"
          className="flex items-center justify-center gap-1.5 text-xs text-[#667085] hover:text-[#00FFA7] transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0C111D]">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-[#182230] border border-[#344054] text-[#D0D5DD] hover:text-[#00FFA7] transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 bottom-0 w-64 bg-[#0a0f1a] border-r border-[#344054] flex flex-col z-50
          transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {sidebar}
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-0 lg:ml-64 p-4 lg:p-12 pt-16 lg:pt-12 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {loading && sections.length > 0 ? (
            <div className="text-[#667085] text-sm">Loading...</div>
          ) : (
            <article className="docs-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt, ...props }) => (
                    <img
                      src={src?.startsWith('/api/') ? `${API}${src}` : src}
                      alt={alt || ''}
                      className="rounded-lg border border-[#344054] my-4 max-w-full"
                      {...props}
                    />
                  ),
                  a: ({ href, children, ...props }) => (
                    <a
                      href={href}
                      className="text-[#00FFA7] hover:underline"
                      target={href?.startsWith('http') ? '_blank' : undefined}
                      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </main>

      <style>{`
        .docs-content h1 {
          font-size: 2rem;
          font-weight: 700;
          color: #F5F5F6;
          margin-bottom: 1rem;
          margin-top: 0;
          line-height: 1.2;
        }
        .docs-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #F5F5F6;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #344054;
        }
        .docs-content h3 {
          font-size: 1.2rem;
          font-weight: 600;
          color: #D0D5DD;
          margin-top: 2rem;
          margin-bottom: 0.5rem;
        }
        .docs-content h4 {
          font-size: 1rem;
          font-weight: 600;
          color: #D0D5DD;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .docs-content p {
          color: #98A2B3;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .docs-content ul, .docs-content ol {
          color: #98A2B3;
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }
        .docs-content li {
          margin-bottom: 0.4rem;
          line-height: 1.7;
        }
        .docs-content code {
          background: #182230;
          color: #00FFA7;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .docs-content pre {
          background: #0a0f1a;
          border: 1px solid #344054;
          border-radius: 8px;
          padding: 1rem;
          overflow-x: auto;
          margin-bottom: 1.5rem;
        }
        .docs-content pre code {
          background: none;
          padding: 0;
          color: #D0D5DD;
        }
        .docs-content blockquote {
          border-left: 3px solid #00FFA7;
          padding-left: 1rem;
          margin: 1rem 0;
          color: #667085;
        }
        .docs-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
        }
        .docs-content th {
          text-align: left;
          padding: 0.6rem 0.8rem;
          border-bottom: 2px solid #344054;
          color: #D0D5DD;
          font-weight: 600;
          font-size: 0.875rem;
        }
        .docs-content td {
          padding: 0.5rem 0.8rem;
          border-bottom: 1px solid #1D2939;
          color: #98A2B3;
          font-size: 0.875rem;
        }
        .docs-content hr {
          border: none;
          border-top: 1px solid #344054;
          margin: 2rem 0;
        }
        .docs-content strong {
          color: #D0D5DD;
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

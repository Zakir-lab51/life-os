"use client"

import { ArrowUpRight, Check, Construction } from "lucide-react"
import Link from "next/link"
import { Panel } from "@/components/os/panel"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { NAV, type NavKey } from "@/features/shell/nav"

interface PlannedModule {
  summary: string
  coming: string[]
  today: { label: string; href: string; detail: string }[]
  note?: string
}

const MODULES: Partial<Record<NavKey, PlannedModule>> = {
  notes: {
    summary: "A second brain: rich-text notes, folders, tags, backlinks, a knowledge graph, daily journal, idea inbox and templates, with Markdown import and export.",
    coming: ["Rich-text editor with backlinks and linked notes", "Knowledge graph of note relationships", "Daily journal and idea inbox", "Markdown import / export", "Full-text search across notes"],
    today: [{ label: "Daily reflection", href: "/today", detail: "Wins and lessons for each day, kept in your history." }],
  },
  finance: {
    summary: "A personal finance overview with manual transactions, categories, monthly budgets, savings goals, recurring expenses, subscriptions and CSV import/export. INR by default.",
    coming: ["Income and expense tracking with categories", "Monthly budgets with progress", "Savings goals and subscription tracker", "Spending breakdowns and history", "CSV import / export"],
    today: [{ label: "Finance area", href: "/tasks", detail: "Finance-area tasks and habits (like a weekly spending review) feed the Finance axis of your radar." }],
    note: "Bank sync is not planned for local mode. Nothing here will claim to connect to a bank unless a real, supported integration is built.",
  },
}

export function PlannedView({ module }: { module: NavKey }) {
  const nav = NAV.find((n) => n.key === module)!
  const info = MODULES[module]!
  const I = nav.icon
  return (
    <PageTransition>
      <PageHeader
        eyebrow={`Planned · Phase ${nav.phase}`}
        title={
          <span className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-2 text-violet">
              <I className="size-5" />
            </span>
            {nav.label}
          </span>
        }
        description={info.summary}
      />
      <div className="grid gap-4 @4xl/main:grid-cols-[1.3fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Construction className="size-4 text-amber" />
            <h2 className="font-semibold">Not built yet</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            This module is part of Phase {nav.phase}. Nothing on this page pretends to work: here&apos;s what it will do once it&apos;s built.
          </p>
          <ul className="space-y-2.5">
            {info.coming.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet" />
                {c}
              </li>
            ))}
          </ul>
          {info.note && <p className="mt-5 rounded-2xl border border-line bg-surface-2/60 p-3 text-xs text-muted-foreground">{info.note}</p>}
        </Panel>
        <Panel>
          <h2 className="mb-1 font-semibold">What works today</h2>
          <p className="mb-4 text-sm text-muted-foreground">Data you record now carries over when the module ships.</p>
          <ul className="space-y-2">
            {info.today.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="group flex items-start gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2/60">
                  <Check className="mt-0.5 size-4 shrink-0 text-mint" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.detail}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PageTransition>
  )
}

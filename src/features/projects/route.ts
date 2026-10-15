"use client"

import { hashRoute } from "@/features/shell/hash-route"

/* A project opens as its own page at /projects#pr_… (see hash-route.ts). */
const route = hashRoute("/projects", (h) => h.startsWith("pr_"))

export const useOpenProjectId = route.useOpenId
export const projectHref = route.href
export const openProject = route.open
export const closeProject = route.close

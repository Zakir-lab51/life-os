"use client"

import { ErrorState } from "@/components/os/error-state"

/** A page that crashed shows this inside the app, so the sidebar and top bar still work. */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState error={error} retry={retry} />
}

/** The parts of a failed validation that forms show; no zod needed to read them. */
export interface ValidationIssues {
  issues: { path: PropertyKey[]; message: string }[]
}

/** First message per field, for showing inline form errors. */
export function fieldErrors(error: ValidationIssues): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_"
    if (!out[key]) out[key] = issue.message
  }
  return out
}

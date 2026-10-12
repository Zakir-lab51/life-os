// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ErrorState, errorDetails } from "@/components/os/error-state"

/*
  A page that throws while rendering used to take the whole app down to Next's bare
  "Application error" screen. Now (os)/error.tsx shows ErrorState inside the app shell.
*/

afterEach(cleanup)

describe("page error state", () => {
  it("says the data is safe, shows what failed, and tries again", () => {
    const retry = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<ErrorState error={new Error("Cannot read properties of undefined (reading 'title')")} retry={retry} />)
    expect(screen.getByRole("alert").textContent).toContain("Your data is safe")
    expect(screen.getByText(/reading 'title'/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole("link", { name: /overview/i }).getAttribute("href")).toBe("/")
  })

  it("copies details a bug report can use", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" })
    const text = errorDetails(error, "/tasks/")
    expect(text).toContain("Error: boom")
    expect(text).toContain("Page: /tasks/")
    expect(text).toContain("Digest: abc123")
  })
})

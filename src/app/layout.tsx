import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter, Outfit, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { asset, PREPAINT_SCRIPT } from "@/lib/design/design"
import "./globals.css"

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
})

// alternative interface fonts for the Design studio; not preloaded, so they cost nothing until chosen
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false })
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], preload: false })
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], preload: false })

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "LIFE OS",
    template: "%s · LIFE OS",
  },
  description: "A personal operating system for your day, habits, focus and progress.",
  // home-screen app (iPad/iPhone): full screen, status bar over the app, our icon
  appleWebApp: { capable: true, title: "LIFE OS", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }],
    apple: [{ url: asset("/icons/apple-touch-icon.png"), sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  // draw under the status bar and home indicator; the bars pad themselves with safe-area insets
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121216" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f9" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} ${inter.variable} ${outfit.variable} ${grotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* paints your saved design before the app loads, so there's no flash of the default look */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

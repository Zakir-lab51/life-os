import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter, Outfit, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { asset, PREPAINT_SCRIPT } from "@/lib/design/design"
import { THEME_COLORS, THEME_COLOR_SCRIPT } from "@/lib/theme-color"
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
  // home-screen app (iPad/iPhone): full screen with our icon. The status bar keeps its own
  // strip in the theme colour (see theme-color.ts) instead of sitting over the page.
  appleWebApp: { capable: true, title: "LIFE OS", statusBarStyle: "default" },
  icons: {
    icon: [{ url: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }],
    apple: [{ url: asset("/icons/apple-touch-icon.png"), sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  // use the full screen in landscape and around the home indicator; the bars pad themselves with safe-area insets
  viewportFit: "cover",
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
        {/* status bar / browser colour; follows the app's theme (set before load, then kept in sync) */}
        <meta name="theme-color" content={THEME_COLORS.dark} />
        <script dangerouslySetInnerHTML={{ __html: THEME_COLOR_SCRIPT }} />
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

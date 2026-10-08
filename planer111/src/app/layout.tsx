import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: {
    default: "استادی‌فلو | برنامه‌ریز هوشمند مطالعه",
    template: "%s | استادی‌فلو",
  },
  description:
    "استادی‌فلو؛ دستیار هوشمند مطالعه با برنامه‌ریزی هفتگی، سیستم مرور فاصله‌دار، پومودورو، آزمون‌ها، اهداف و آمار پیشرفت.",
  manifest: "/manifest.webmanifest",
  applicationName: "StudyFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StudyFlow",
  },
  icons: {
    icon: [
      { url: "/icons/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors closeButton dir="rtl" />
        </ThemeProvider>
      </body>
    </html>
  );
}

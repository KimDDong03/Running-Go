import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { TRPCProvider } from "./components/providers/TRPCProvider";
import { AuthProvider } from "./components/providers/AuthProvider";
import { BottomNav } from "./components/navigation/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "러닝고 - Running Go",
  description: "포켓몬고 스타일 수집형 러닝 앱",
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <TRPCProvider>
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
              <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl rg-floating" />
              <div className="absolute right-[-72px] top-24 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl rg-floating" style={{ animationDelay: '1.2s' }} />
              <div className="absolute bottom-[-90px] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-300/25 blur-3xl rg-floating" style={{ animationDelay: '2.2s' }} />
            </div>
            <div className="relative mx-auto min-h-screen w-full max-w-[1200px]">
              {children}
            </div>
            <BottomNav />
            <Toaster richColors position="top-center" closeButton />
          </TRPCProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

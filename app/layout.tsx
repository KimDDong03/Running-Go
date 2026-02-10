import type { Metadata } from "next";
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
            <div className="min-h-screen pb-28">
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

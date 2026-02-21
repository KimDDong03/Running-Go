import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import Link from "next/link";
import { Toaster } from "sonner";
import "./globals.css";
import { TRPCProvider } from "./components/providers/TRPCProvider";
import { AuthProvider } from "./components/providers/AuthProvider";
import { BottomNav } from "./components/navigation/BottomNav";
import { LanguageSwitcher } from "./components/navigation/LanguageSwitcher";
import { LocaleProvider } from "./components/providers/LocaleProvider";
import { ConsentBanner } from "./components/consent/ConsentBanner";
import { AdSenseBootstrap } from "./components/ads/AdSenseBootstrap";
import { getMessages } from "@/lib/i18n/messages";
import { resolveRequestLocale } from "@/lib/i18n/locale";

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
  other: {
    'google-adsense-account': 'ca-pub-2809413571797124',
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
};

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? 'G-CK58GFWQ9E';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveRequestLocale();
  const messages = getMessages(locale);
  const footerCopy = locale === 'ko'
      ? {
          about: '서비스 소개',
          faq: '자주 묻는 질문',
          contact: '문의하기',
          privacy: '개인정보처리방침',
          cookies: '쿠키 정책',
          terms: '이용약관',
        }
      : {
          about: 'About',
          faq: 'FAQ',
          contact: 'Contact',
          privacy: 'Privacy',
          cookies: 'Cookies',
          terms: 'Terms',
        };

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-gtag" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
        </Script>
        <AuthProvider>
          <TRPCProvider>
            <LocaleProvider locale={locale} messages={messages}>
              <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-[#1d8fff]/18 blur-3xl rg-floating" />
                <div className="absolute right-[-72px] top-24 h-64 w-64 rounded-full bg-[#67c93a]/16 blur-3xl rg-floating" style={{ animationDelay: '1.2s' }} />
                <div className="absolute bottom-[-90px] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#ffb020]/12 blur-3xl rg-floating" style={{ animationDelay: '2.2s' }} />
              </div>
              <LanguageSwitcher />
              <AdSenseBootstrap />
              <div className="relative mx-auto min-h-screen w-full max-w-[1200px]">
                {children}
              </div>
              <footer className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 text-center text-xs text-slate-500">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link href="/about" className="underline underline-offset-2">{footerCopy.about}</Link>
                  <Link href="/faq" className="underline underline-offset-2">{footerCopy.faq}</Link>
                  <Link href="/contact" className="underline underline-offset-2">{footerCopy.contact}</Link>
                  <Link href="/privacy" className="underline underline-offset-2">{footerCopy.privacy}</Link>
                  <Link href="/cookies" className="underline underline-offset-2">{footerCopy.cookies}</Link>
                  <Link href="/terms" className="underline underline-offset-2">{footerCopy.terms}</Link>
                </div>
              </footer>
              <ConsentBanner />
              <BottomNav />
              <Toaster richColors position="top-center" closeButton />
            </LocaleProvider>
          </TRPCProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

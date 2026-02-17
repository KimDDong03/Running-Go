import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? 'GTM-WB4N6JXM';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveRequestLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script id="gtm-bootstrap" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            title="Google Tag Manager"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <AuthProvider>
          <TRPCProvider>
            <LocaleProvider locale={locale} messages={messages}>
              <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl rg-floating" />
                <div className="absolute right-[-72px] top-24 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl rg-floating" style={{ animationDelay: '1.2s' }} />
                <div className="absolute bottom-[-90px] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-300/25 blur-3xl rg-floating" style={{ animationDelay: '2.2s' }} />
              </div>
              <LanguageSwitcher />
              <AdSenseBootstrap />
              <div className="relative mx-auto min-h-screen w-full max-w-[1200px]">
                {children}
              </div>
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

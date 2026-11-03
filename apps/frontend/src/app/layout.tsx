import type { Metadata } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/config/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Dort" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Dort",
    "smart contract audit",
    "Foundry",
    "forge test traces",
    "Solidity",
    "call graph",
    "Slither",
    "Aderyn",
    "bug bounty",
    "web3 security",
  ],
  authors: [{ name: "Dort", url: SITE_URL }],
  creator: SITE_NAME,
  // the card image comes from app/opengraph-image.png
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Anuphan } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const anuphan = Anuphan({
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-anuphan",
});

export const metadata: Metadata = {
  title: "ระบบรายงานปริมาณการใช้น้ำมัน (RFDRS)",
  description: "ระบบรายงานปริมาณการจำหน่ายและสต็อกน้ำมันเชื้อเพลิงรายพื้นที่",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="th" className={anuphan.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

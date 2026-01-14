import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Op.Dr. İbrahim YAĞCI randevu ekranı",
  description: "Op.Dr. İbrahim YAĞCI randevu ekranı",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="w-full max-w-[430px] min-h-screen bg-white shadow-xl mx-auto overflow-hidden relative">
          {children}
        </div>
      </body>
    </html>
  );
}

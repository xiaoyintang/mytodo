import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Todo App",
  description: "Daily and weekly todo management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,100,0,0"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/npm/lucide-static@latest/font/lucide.min.css"
          rel="stylesheet"
        />
      </head>
      <body className="font-inter h-full antialiased">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppHeader } from "./app-header";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "sbd.io",
    description: "A spreadsheet-first workout companion for powerlifting programs.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="min-h-full bg-gray-50 text-gray-900">
                <div className="flex min-h-full flex-col">
                    <AppHeader />
                    <div className="flex-1">{children}</div>
                </div>
            </body>
        </html>
    );
}

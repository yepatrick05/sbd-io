import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getButtonClassName } from "@/components/ui/button";

export function AppHeader() {
    return (
        <header className="border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                    <Link href="/" className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                        sbd.io
                    </Link>
                    <Badge variant="accent" className="hidden sm:inline-flex">
                        Training Utility
                    </Badge>
                </div>

                <nav className="flex flex-wrap items-center gap-2">
                    <Link href="/" className={getButtonClassName({ variant: "quiet", size: "sm" })}>
                        Dashboard
                    </Link>
                    <Link href="/upload" className={getButtonClassName({ variant: "quiet", size: "sm" })}>
                        Upload
                    </Link>
                    <Link href="/programs" className={getButtonClassName({ variant: "quiet", size: "sm" })}>
                        Programs
                    </Link>
                </nav>
            </div>
        </header>
    );
}

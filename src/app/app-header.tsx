import Link from "next/link";

export function AppHeader() {
    return (
        <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                <Link href="/" className="text-lg font-semibold text-gray-900">
                    sbd.io
                </Link>

                <nav className="flex flex-wrap gap-3 text-sm text-gray-600">
                    <Link href="/" className="underline">
                        Dashboard
                    </Link>
                    <Link href="/upload" className="underline">
                        Upload
                    </Link>
                    <Link href="/programs" className="underline">
                        Programs
                    </Link>
                </nav>
            </div>
        </header>
    );
}

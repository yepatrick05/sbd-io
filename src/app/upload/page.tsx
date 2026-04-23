"use client";

import { useState } from "react";

import type { WorkbookPreview } from "@/types/workbook";

export default function UploadPage() {
    const [data, setData] = useState<WorkbookPreview | null>(null);

    async function handleUpload(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        const json = await res.json();
        setData(json as WorkbookPreview);
    }

    return (
        <main className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Upload Workbook</h1>

            <form onSubmit={handleUpload}>
                <input type="file" name="file" accept=".xlsx" required />
                <button type="submit" className="ml-2 px-3 py-1 border">
                    Upload
                </button>
            </form>

            {data && <pre className="text-sm bg-gray-100 p-4 overflow-auto">{JSON.stringify(data, null, 2)}</pre>}
        </main>
    );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteProgramButtonProps {
    programId: string;
    deleteProgramAction: (formData: FormData) => Promise<{
        error: string | null;
    }>;
}

export function DeleteProgramButton({
    programId,
    deleteProgramAction,
}: DeleteProgramButtonProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    return (
        <form
            onSubmit={async (event) => {
                event.preventDefault();

                const confirmedDelete = window.confirm(
                    "Delete this saved program and all of its related data?",
                );

                if (!confirmedDelete) {
                    return;
                }

                setIsDeleting(true);
                setErrorMessage(null);

                const formData = new FormData();
                formData.set("programId", programId);

                const result = await deleteProgramAction(formData);

                if (result.error !== null) {
                    setIsDeleting(false);
                    setErrorMessage(result.error);
                    return;
                }

                router.refresh();
            }}
            className="space-y-2"
        >
            <button
                type="submit"
                disabled={isDeleting}
                className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isDeleting ? "Deleting..." : "Delete"}
            </button>

            {errorMessage !== null && <p className="text-sm text-red-700">{errorMessage}</p>}
        </form>
    );
}

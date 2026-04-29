"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

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
            <Button type="submit" variant="danger" size="sm" disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
            </Button>

            {errorMessage !== null && <p className="text-sm text-danger-foreground">{errorMessage}</p>}
        </form>
    );
}

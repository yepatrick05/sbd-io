import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/workbook-parser";

export async function POST(request: Request) {
    const formData = await request.formData();
    const uploadedFile = formData.get("file");

    if (!(uploadedFile instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await uploadedFile.arrayBuffer();
    const preview = await parseWorkbook(uploadedFile.name, Buffer.from(arrayBuffer));

    return NextResponse.json(preview);
}

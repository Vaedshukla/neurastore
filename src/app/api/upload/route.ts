import { NextResponse } from "next/server";
import { detectMimeType, generateFilePath, uploadToSupabase, saveFileMetadata } from "@/lib/utils/fileHandler";
import { supabase } from "@/lib/supabaseClient";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: Request) {
    let file: File | null = null;
    let buffer: Buffer | null = null;

    try {
        let formData: FormData;
        try {
            formData = await req.formData();
        } catch (error) {
            console.error("Form data parsing failed:", error);
            return NextResponse.json(
                { error: "Invalid form data", code: "INVALID_FORM_DATA" },
                { status: 400 }
            );
        }

        file = formData.get("file") as File | null;
        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded", code: "NO_FILE" },
                { status: 400 }
            );
        }

        // Validate file size (50MB limit)
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File too large. Maximum size is 50MB", code: "FILE_TOO_LARGE" },
                { status: 413 }
            );
        }

        // Read file buffer
        try {
            buffer = Buffer.from(await file.arrayBuffer());
        } catch (error) {
            console.error("File buffer reading failed:", error);
            return NextResponse.json(
                { error: "Failed to read file data", code: "FILE_READ_ERROR" },
                { status: 400 }
            );
        }

        // Check for duplicate files safely
        try {
            const { data: existingFile } = await supabase
                .from('files_metadata')
                .select('id, name, public_url, category, confidence, storage_type, schema_id, table_name, folder_path, mime_type, size')
                .eq('name', file.name)
                .eq('size', file.size)
                .maybeSingle();

            if (existingFile) {
                return NextResponse.json({
                    success: true,
                    message: "File already exists",
                    category: existingFile.category,
                    confidence: existingFile.confidence,
                    publicUrl: existingFile.public_url,
                    folderPath: existingFile.folder_path,
                    mimeType: existingFile.mime_type,
                    size: existingFile.size,
                    duplicate: true,
                    file_id: existingFile.id
                });
            }
        } catch (dupErr) {
            console.warn("Duplicate check warning (continuing upload):", dupErr);
        }

        // Detect MIME type
        let mimeType: string;
        try {
            mimeType = await detectMimeType(buffer, file.name);
        } catch (error) {
            mimeType = file.type || 'application/octet-stream';
        }

        // Determine intelligent folder path
        let folderPath = 'media/others/';
        if (mimeType.startsWith('image/')) folderPath = 'media/images/';
        else if (mimeType.startsWith('video/')) folderPath = 'media/videos/';
        else if (mimeType.startsWith('audio/')) folderPath = 'media/audio/';
        else if (mimeType === 'application/pdf') folderPath = 'media/documents/';
        else if (mimeType === 'application/json' || file.name.endsWith('.json')) folderPath = 'media/data/json/';
        else if (mimeType === 'text/plain' || file.name.endsWith('.md')) folderPath = 'media/documents/text/';
        else if (mimeType.includes('javascript') || mimeType.includes('typescript')) folderPath = 'media/code/';
        else if (mimeType.includes('zip') || mimeType.includes('rar')) folderPath = 'media/archives/';

        const filePath = generateFilePath(file.name, folderPath);

        // Storage Upload with robust local fallback
        let publicUrl = "";
        const uploadResult = await uploadToSupabase(buffer, filePath, mimeType);

        if (uploadResult && uploadResult.publicUrl) {
            publicUrl = uploadResult.publicUrl;
        } else {
            // Local fallback upload write
            const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const localFilePath = path.join(uploadsDir, safeFileName);
            fs.writeFileSync(localFilePath, buffer);
            publicUrl = `/uploads/${safeFileName}`;
        }

        // Categorize file
        function detectFileCategory(mime: string, name: string): string {
            if (mime.startsWith("image/")) return "Image";
            if (mime.startsWith("video/")) return "Video";
            if (mime.startsWith("audio/")) return "Audio";
            if (mime === "application/pdf") return "PDF";
            if (mime === "text/plain" || name.endsWith(".txt") || name.endsWith(".md")) return "Text";
            if (mime.includes("json") || name.endsWith(".json")) return "JSON";
            if (mime.includes("zip") || name.endsWith(".zip")) return "Archive";
            return "Document";
        }

        let category = detectFileCategory(mimeType, file.name);

        if (category === "JSON") {
            try {
                const content = buffer.toString('utf-8');
                const parsed = JSON.parse(content);
                category = Array.isArray(parsed) || typeof parsed === "object" ? "SQL JSON" : "Generic JSON";
            } catch {
                category = "Malformed JSON";
            }
        }

        const cleanData = {
            id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name || 'Untitled',
            size: file.size || 0,
            mime_type: mimeType,
            category: category,
            confidence: 1,
            uploaded_at: new Date().toISOString(),
            public_url: publicUrl,
            folder_path: folderPath,
        };

        // Save metadata cleanly with fallback
        const saved = await saveFileMetadata(cleanData);

        return NextResponse.json({
            success: true,
            message: "File uploaded successfully",
            category: category,
            confidence: 1,
            publicUrl: publicUrl,
            folderPath: folderPath,
            mimeType: mimeType,
            size: file.size,
            file_id: cleanData.id,
            metadata: cleanData
        });

    } catch (error: any) {
        console.error("Upload handler error:", error);
        return NextResponse.json(
            { error: error.message || "Upload processing failed", code: "UPLOAD_FAILED" },
            { status: 500 }
        );
    }
}

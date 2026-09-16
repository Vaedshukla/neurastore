import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import fs from "fs";
import path from "path";
const pdfParse = require("pdf-parse");

interface SummaryResult {
    fileName: string;
    fileSize: number;
    wordCount: number;
    readingTimeMinutes: number;
    executiveSummary: string;
    keyTakeaways: string[];
    topics: { title: string; summary: string }[];
    entities: string[];
    textSnippet: string;
}

// Perform smart local NLP text summarization and extraction
function processDocumentText(text: string, fileName: string, fileSize: number): SummaryResult {
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    const words = cleanedText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    // Split sentences
    const rawSentences = cleanedText.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
    const sentences = rawSentences.length > 0 ? rawSentences : [cleanedText];

    // Identify key sentences by frequency of non-common words
    const stopWords = new Set(['the', 'and', 'is', 'in', 'to', 'of', 'for', 'with', 'on', 'at', 'from', 'by', 'an', 'be', 'this', 'that', 'are', 'was', 'as', 'it', 'or', 'an']);
    const wordFreq: Record<string, number> = {};

    words.forEach(w => {
        const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (lower.length > 3 && !stopWords.has(lower)) {
            wordFreq[lower] = (wordFreq[lower] || 0) + 1;
        }
    });

    // Top entities / keywords
    const topKeywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([kw]) => kw.charAt(0).toUpperCase() + kw.slice(1));

    // Score sentences
    const scoredSentences = sentences.map(sentence => {
        const sWords = sentence.toLowerCase().split(/\s+/);
        let score = 0;
        sWords.forEach(w => {
            const clean = w.replace(/[^a-z0-9]/g, '');
            if (wordFreq[clean]) score += wordFreq[clean];
        });
        return { sentence, score: score / (sWords.length || 1) };
    });

    scoredSentences.sort((a, b) => b.score - a.score);

    // Executive summary (top 3-4 scored sentences in chronological order)
    const topSentences = scoredSentences.slice(0, Math.min(4, sentences.length));
    const chronSummary = sentences.filter(s => topSentences.some(ts => ts.sentence === s));
    const executiveSummary = chronSummary.join(' ') || cleanedText.slice(0, 300) + '...';

    // Key takeaways (bullet points)
    const takeaways = scoredSentences.slice(0, Math.min(5, sentences.length)).map(s => s.sentence.trim());

    // Topics breakdown
    const topicChunkSize = Math.max(1, Math.floor(sentences.length / 3));
    const topics = [];
    for (let i = 0; i < sentences.length && topics.length < 3; i += topicChunkSize) {
        const chunkSentences = sentences.slice(i, i + topicChunkSize);
        if (chunkSentences.length > 0) {
            topics.push({
                title: `Section ${topics.length + 1}: ${chunkSentences[0].slice(0, 35)}...`,
                summary: chunkSentences.join(' ').slice(0, 200) + '...'
            });
        }
    }

    return {
        fileName,
        fileSize,
        wordCount,
        readingTimeMinutes,
        executiveSummary,
        keyTakeaways: takeaways.length > 0 ? takeaways : ["Document uploaded successfully."],
        topics: topics.length > 0 ? topics : [{ title: "Overview", summary: executiveSummary }],
        entities: topKeywords,
        textSnippet: cleanedText.slice(0, 1000)
    };
}

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";

        let documentText = "";
        let fileName = "Document";
        let fileSize = 0;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File | null;

            if (!file) {
                return NextResponse.json({ error: "No file provided" }, { status: 400 });
            }

            fileName = file.name;
            fileSize = file.size;

            const buffer = Buffer.from(await file.arrayBuffer());

            if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
                const pdfData = await pdfParse(buffer);
                documentText = pdfData.text;
            } else {
                documentText = buffer.toString("utf-8");
            }
        } else {
            const body = await req.json();
            const { fileId, question } = body;

            // Handle Document Q&A if question is passed
            if (question && body.contextText) {
                const context = body.contextText as string;
                const qLower = question.toLowerCase();
                const sentences = context.split(/(?<=[.!?])\s+/);

                const matchingSentences = sentences.filter(s => {
                    const words = qLower.split(/\s+/).filter((w: string) => w.length > 3);
                    return words.some((w: string) => s.toLowerCase().includes(w));
                });

                const answer = matchingSentences.length > 0
                    ? matchingSentences.slice(0, 3).join(' ')
                    : "I couldn't find a direct answer to that question in the document text. Try rephrasing your question or checking the executive summary.";

                return NextResponse.json({ answer });
            }

            if (fileId) {
                let fileData: any = null;

                try {
                    const { data, error } = await supabase
                        .from("files_metadata")
                        .select("*")
                        .eq("id", fileId)
                        .single();
                    if (!error && data) fileData = data;
                } catch (err) {
                    console.warn("Supabase record fetch failed in summarize-document, checking local fallback:", err);
                }

                if (!fileData) {
                    try {
                        const metaPath = path.join(process.cwd(), "public", "uploads", "metadata.json");
                        if (fs.existsSync(metaPath)) {
                            const localMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                            fileData = localMeta.find((r: any) => r.id === fileId || r.name === fileId);
                        }
                    } catch (metaErr) {
                        console.error("Local metadata read error:", metaErr);
                    }
                }

                if (!fileData) {
                    return NextResponse.json({ error: "File not found in metadata" }, { status: 404 });
                }

                fileName = fileData.name;
                fileSize = fileData.size || 0;

                if (fileData.public_url) {
                    let buffer: Buffer | null = null;

                    if (fileData.public_url.startsWith("/uploads/")) {
                        const localPath = path.join(process.cwd(), "public", fileData.public_url);
                        if (fs.existsSync(localPath)) {
                            buffer = fs.readFileSync(localPath);
                        }
                    } else {
                        try {
                            const res = await fetch(fileData.public_url);
                            if (res.ok) {
                                buffer = Buffer.from(await res.arrayBuffer());
                            }
                        } catch (fetchErr) {
                            console.warn("Remote file fetch failed:", fetchErr);
                        }
                    }

                    if (buffer) {
                        if (fileName.toLowerCase().endsWith(".pdf") || fileData.mime_type === "application/pdf") {
                            const pdfData = await pdfParse(buffer);
                            documentText = pdfData.text;
                        } else {
                            documentText = buffer.toString("utf-8");
                        }
                    }
                }
            }
        }

        if (!documentText || documentText.trim().length === 0) {
            return NextResponse.json({ error: "Could not extract text from document" }, { status: 400 });
        }

        const summaryResult = processDocumentText(documentText, fileName, fileSize);

        return NextResponse.json({
            success: true,
            summary: summaryResult,
            rawText: documentText
        });

    } catch (err: any) {
        console.error("Summarization error:", err);
        return NextResponse.json({ error: err.message || "Failed to process document" }, { status: 500 });
    }
}

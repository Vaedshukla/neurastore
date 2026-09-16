import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import fs from "fs";
import path from "path";

export interface DocumentChunk {
    chunkIndex: number;
    text: string;
}

export interface SummaryResult {
    fileId?: string;
    fileName: string;
    fileSize: number;
    wordCount: number;
    pageCount?: number;
    readingTimeMinutes: number;
    executiveSummary: string;
    keyTakeaways: string[];
    topics: { title: string; summary: string }[];
    entities: string[];
    textSnippet: string;
    chunksCount: number;
}

export interface SourceCitation {
    chunkIndex: number;
    snippet: string;
}

export interface QAResponse {
    answer: string;
    sources: SourceCitation[];
}

// Normalize extracted document text
function normalizeText(text: string): string {
    if (!text) return "";
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\t/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// Split document into indexed chunks for RAG & citations
function chunkText(text: string, chunkSize: number = 700): DocumentChunk[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: DocumentChunk[] = [];
    let currentChunk = "";
    let chunkIndex = 1;

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        if ((currentChunk + "\n\n" + trimmed).length > chunkSize && currentChunk.length > 0) {
            chunks.push({ chunkIndex: chunkIndex++, text: currentChunk.trim() });
            currentChunk = trimmed;
        } else {
            currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push({ chunkIndex: chunkIndex++, text: currentChunk.trim() });
    }

    return chunks;
}

// Rank chunks by keyword relevance / TF-IDF lexical overlap
function findRelevantChunks(chunks: DocumentChunk[], question: string, topK: number = 4): { chunk: DocumentChunk; score: number }[] {
    const stopWords = new Set(["the", "and", "is", "in", "to", "of", "for", "with", "on", "at", "from", "by", "an", "be", "this", "that", "are", "was", "as", "it", "or", "what", "where", "how", "why", "who", "which", "does", "can", "tell", "me", "about"]);
    const qWords = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    if (qWords.length === 0) {
        return chunks.slice(0, topK).map(chunk => ({ chunk, score: 1 }));
    }

    const scored = chunks.map(chunk => {
        const cText = chunk.text.toLowerCase();
        let score = 0;

        qWords.forEach(word => {
            const matches = (cText.match(new RegExp(`\\b${word}\\b`, "g")) || []).length;
            score += matches * 2;
            if (cText.includes(word)) score += 1;
        });

        return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}

// Perform smart local NLP text summarization
function processDocumentText(text: string, fileName: string, fileSize: number, pageCount?: number): SummaryResult {
    const cleanedText = normalizeText(text);
    const words = cleanedText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    const rawSentences = cleanedText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    const sentences = rawSentences.length > 0 ? rawSentences : [cleanedText];

    const stopWords = new Set(["the", "and", "is", "in", "to", "of", "for", "with", "on", "at", "from", "by", "an", "be", "this", "that", "are", "was", "as", "it", "or", "have", "has", "had", "not", "but", "what", "all", "were", "when", "we", "there", "can", "an"]);
    const wordFreq: Record<string, number> = {};

    words.forEach(w => {
        const lower = w.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lower.length > 3 && !stopWords.has(lower)) {
            wordFreq[lower] = (wordFreq[lower] || 0) + 1;
        }
    });

    const topKeywords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([kw]) => kw.charAt(0).toUpperCase() + kw.slice(1));

    const scoredSentences = sentences.map(sentence => {
        const sWords = sentence.toLowerCase().split(/\s+/);
        let score = 0;
        sWords.forEach(w => {
            const clean = w.replace(/[^a-z0-9]/g, "");
            if (wordFreq[clean]) score += wordFreq[clean];
        });
        return { sentence, score: score / (sWords.length || 1) };
    });

    scoredSentences.sort((a, b) => b.score - a.score);

    const topSentences = scoredSentences.slice(0, Math.min(4, sentences.length));
    const chronSummary = sentences.filter(s => topSentences.some(ts => ts.sentence === s));
    const executiveSummary = chronSummary.join(" ") || cleanedText.slice(0, 400) + "...";

    const takeaways = scoredSentences.slice(0, Math.min(5, sentences.length)).map(s => s.sentence.trim());

    const topicChunkSize = Math.max(1, Math.floor(sentences.length / 3));
    const topics = [];
    for (let i = 0; i < sentences.length && topics.length < 3; i += topicChunkSize) {
        const chunkSentences = sentences.slice(i, i + topicChunkSize);
        if (chunkSentences.length > 0) {
            const titleWord = chunkSentences[0].trim().split(/\s+/).slice(0, 5).join(" ");
            topics.push({
                title: `${titleWord}...`,
                summary: chunkSentences.join(" ").slice(0, 220) + "..."
            });
        }
    }

    const chunks = chunkText(cleanedText);

    return {
        fileName,
        fileSize,
        wordCount,
        pageCount,
        readingTimeMinutes,
        executiveSummary,
        keyTakeaways: takeaways.length > 0 ? takeaways : ["Document processed successfully."],
        topics: topics.length > 0 ? topics : [{ title: "Overview", summary: executiveSummary }],
        entities: topKeywords,
        textSnippet: cleanedText.slice(0, 1000),
        chunksCount: chunks.length
    };
}

// Answer question using grounded context
function answerQuestionGrounded(question: string, text: string): QAResponse {
    const normalized = normalizeText(text);
    const chunks = chunkText(normalized);

    if (chunks.length === 0 || normalized.trim().length === 0) {
        return {
            answer: "This document contains no readable text to answer your question.",
            sources: []
        };
    }

    const topScored = findRelevantChunks(chunks, question, 3);
    const maxScore = topScored.length > 0 ? topScored[0].score : 0;

    // Check grounding threshold
    if (maxScore === 0) {
        return {
            answer: "I couldn't find the answer in this document.",
            sources: []
        };
    }

    const relevantChunks = topScored.filter(s => s.score > 0);
    const sources: SourceCitation[] = relevantChunks.map(item => ({
        chunkIndex: item.chunk.chunkIndex,
        snippet: item.chunk.text.slice(0, 150) + (item.chunk.text.length > 150 ? "..." : "")
    }));

    // Synthesize grounded answer from top relevant sentences within selected chunks
    const qWords = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    const contextTextCombined = relevantChunks.map(rc => rc.chunk.text).join(" ");
    const sentences = contextTextCombined.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);

    const matchingSentences = sentences.filter(s => {
        const lower = s.toLowerCase();
        return qWords.some(w => lower.includes(w));
    });

    let answer = "";
    if (matchingSentences.length > 0) {
        answer = matchingSentences.slice(0, 3).join(" ");
    } else {
        answer = relevantChunks[0].chunk.text.slice(0, 300) + "...";
    }

    return {
        answer: answer.trim(),
        sources
    };
}

// Helper to extract text based on file format
async function extractTextFromBuffer(buffer: Buffer, fileName: string, mimeType: string): Promise<{ text: string; pageCount?: number }> {
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
        try {
            const pdfParse = require("pdf-parse");
            const pdfData = await pdfParse(buffer);
            return { text: pdfData.text || "", pageCount: pdfData.numpages };
        } catch (pdfErr) {
            console.warn("PDF parsing fallback:", pdfErr);
            // Fallback plain text extraction for PDF text streams
            const raw = buffer.toString("binary");
            const matches = raw.match(/\(([^()]+)\)/g) || [];
            const text = matches.map(m => m.slice(1, -1)).filter(s => s.length > 3).join(" ");
            return { text: text || "PDF document uploaded." };
        }
    }

    if (lowerName.endsWith(".docx") || mimeType?.includes("wordprocessingml")) {
        try {
            const mammoth = require("mammoth");
            const result = await mammoth.extractRawText({ buffer });
            return { text: result.value || "" };
        } catch (docxErr) {
            console.warn("DOCX parsing error:", docxErr);
            return { text: buffer.toString("utf-8").replace(/<[^>]+>/g, " ") };
        }
    }

    // Default for TXT, MD, DOC, etc.
    return { text: buffer.toString("utf-8") };
}

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";

        let documentText = "";
        let fileName = "Document";
        let fileSize = 0;
        let pageCount: number | undefined = undefined;

        let requestFileId: string | undefined = undefined;

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File | null;

            if (!file) {
                return NextResponse.json({ error: "No file provided" }, { status: 400 });
            }

            fileName = file.name;
            fileSize = file.size;

            const buffer = Buffer.from(await file.arrayBuffer());
            const extracted = await extractTextFromBuffer(buffer, fileName, file.type);
            documentText = extracted.text;
            pageCount = extracted.pageCount;
        } else {
            const body = await req.json();
            const { fileId, question, contextText } = body;
            requestFileId = fileId;

            // Handle Document Q&A
            if (question) {
                if (!question.trim()) {
                    return NextResponse.json({ error: "Question cannot be empty" }, { status: 400 });
                }

                let textToUse = contextText || "";

                if (!textToUse && fileId) {
                    const fetched = await fetchFileTextById(fileId);
                    if (fetched) {
                        textToUse = fetched.text;
                    }
                }

                if (!textToUse) {
                    return NextResponse.json({
                        answer: "I couldn't find the answer in this document.",
                        sources: []
                    });
                }

                const qaResult = answerQuestionGrounded(question, textToUse);
                return NextResponse.json(qaResult);
            }

            // Handle Document Summarization / Loading
            if (fileId) {
                const fetched = await fetchFileTextById(fileId);
                if (!fetched) {
                    return NextResponse.json({ error: "File not found or metadata missing" }, { status: 404 });
                }

                fileName = fetched.fileName;
                fileSize = fetched.fileSize;
                documentText = fetched.text;
                pageCount = fetched.pageCount;
            }
        }

        const normalized = normalizeText(documentText);

        if (!normalized || normalized.length === 0) {
            return NextResponse.json({
                error: "NeuraNotebook couldn't extract readable text from this document."
            }, { status: 400 });
        }

        const summaryResult = processDocumentText(normalized, fileName, fileSize, pageCount);
        if (requestFileId) summaryResult.fileId = requestFileId;

        return NextResponse.json({
            success: true,
            summary: summaryResult,
            rawText: normalized
        });

    } catch (err: any) {
        console.error("Summarization API error:", err);
        return NextResponse.json({
            error: err.message || "Failed to process document"
        }, { status: 500 });
    }
}

// Fetch file buffer and text by fileId from Supabase or local storage
async function fetchFileTextById(fileId: string): Promise<{ text: string; fileName: string; fileSize: number; pageCount?: number } | null> {
    let fileData: any = null;

    try {
        const { data, error } = await supabase
            .from("files_metadata")
            .select("*")
            .eq("id", fileId)
            .single();
        if (!error && data) fileData = data;
    } catch (err) {
        console.warn("Supabase fetch error in summarize-document:", err);
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

    if (!fileData) return null;

    const fileName = fileData.name || "Document";
    const fileSize = fileData.size || 0;
    const mimeType = fileData.mime_type || "";
    let buffer: Buffer | null = null;

    if (fileData.public_url) {
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
    }

    if (!buffer) return null;

    const extracted = await extractTextFromBuffer(buffer, fileName, mimeType);
    return {
        text: extracted.text,
        fileName,
        fileSize,
        pageCount: extracted.pageCount
    };
}

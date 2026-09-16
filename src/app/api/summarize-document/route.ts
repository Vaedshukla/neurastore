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

// Check if question is asking for high-level overview, main argument, or summary
function isOverviewOrMainArgumentQuestion(question: string): boolean {
    const qLower = question.toLowerCase();
    const overviewKeywords = [
        "main argument", "main point", "main idea", "main objective", "main purpose",
        "main topic", "main takeaway", "primary argument", "central argument",
        "overview", "summary", "summarize", "about", "what is this", "what does this",
        "key points", "key findings", "conclusion", "abstract", "purpose", "thesis"
    ];
    return overviewKeywords.some(kw => qLower.includes(kw));
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

// External LLM integration for Summary (Gemini / OpenAI REST API with local fallback)
async function generateAISummary(text: string, fileName: string, fileSize: number, pageCount?: number): Promise<SummaryResult> {
    const localResult = processDocumentText(text, fileName, fileSize, pageCount);
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
        return localResult;
    }

    try {
        const prompt = `You are a document intelligence analyst. Analyze the following document text and return ONLY a JSON object matching this exact structure:
{
  "executiveSummary": "Concise 3-4 sentence overview of the document.",
  "keyTakeaways": ["Point 1", "Point 2", "Point 3"],
  "topics": [{"title": "Topic 1", "summary": "Short summary"}, {"title": "Topic 2", "summary": "Short summary"}],
  "entities": ["Entity1", "Entity2"]
}

Document Text:
${text.slice(0, 6000)}`;

        let aiText = "";

        if (geminiKey) {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            const data = await res.json();
            aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else if (openaiKey) {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${openaiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: prompt }]
                })
            });
            const data = await res.json();
            aiText = data?.choices?.[0]?.message?.content || "";
        }

        if (aiText) {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    ...localResult,
                    executiveSummary: parsed.executiveSummary || localResult.executiveSummary,
                    keyTakeaways: parsed.keyTakeaways || localResult.keyTakeaways,
                    topics: parsed.topics || localResult.topics,
                    entities: parsed.entities || localResult.entities
                };
            }
        }
    } catch (err) {
        console.warn("LLM API summarization call failed, using local NLP result:", err);
    }

    return localResult;
}

// Answer question using grounded context (LLM API + Smart Overview logic with local NLP fallback)
async function answerQuestionGrounded(question: string, text: string): Promise<QAResponse> {
    const normalized = normalizeText(text);
    const chunks = chunkText(normalized);

    if (chunks.length === 0 || normalized.trim().length === 0) {
        return {
            answer: "This document contains no readable text to answer your question.",
            sources: []
        };
    }

    const isOverviewQ = isOverviewOrMainArgumentQuestion(question);

    let selectedChunks: DocumentChunk[] = [];
    if (isOverviewQ) {
        // For main argument / overview questions, select first 3 introductory/abstract chunks
        selectedChunks = chunks.slice(0, Math.min(3, chunks.length));
    } else {
        const topScored = findRelevantChunks(chunks, question, 4);
        const maxScore = topScored.length > 0 ? topScored[0].score : 0;

        // Check grounding threshold for out-of-scope questions (e.g., weather in Paris)
        if (maxScore === 0) {
            // Check if question looks like a general document inquiry
            if (question.toLowerCase().includes("doc") || question.toLowerCase().includes("pdf") || question.toLowerCase().includes("paper")) {
                selectedChunks = chunks.slice(0, 2);
            } else {
                return {
                    answer: "I couldn't find the answer in this document.",
                    sources: []
                };
            }
        } else {
            selectedChunks = topScored.filter(s => s.score > 0).map(s => s.chunk);
        }
    }

    const sources: SourceCitation[] = selectedChunks.map(chunk => ({
        chunkIndex: chunk.chunkIndex,
        snippet: chunk.text.slice(0, 150) + (chunk.text.length > 150 ? "..." : "")
    }));

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // LLM synthesis mode (when GEMINI_API_KEY or OPENAI_API_KEY is available)
    if (geminiKey || openaiKey) {
        try {
            const contextText = selectedChunks.map(rc => `[Chunk ${rc.chunkIndex}]: ${rc.text}`).join("\n\n");
            const systemPrompt = isOverviewQ
                ? `You are an executive document analyst. Synthesize a clear, structured response explaining the main argument, core thesis, and primary conclusions of this document based strictly on the context provided below.

Document Context:
${contextText}

Question:
${question}`
                : `You are answering questions about a specific uploaded document. Use ONLY the provided document context below. If the answer cannot be determined from the document context, explicitly say: 'I couldn't find the answer in this document.' Do not invent facts.

Document Context:
${contextText}

Question:
${question}`;

            let aiAnswer = "";

            if (geminiKey) {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt }] }]
                    })
                });
                const data = await res.json();
                aiAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else if (openaiKey) {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openaiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "system", content: "Use only document context." }, { role: "user", content: systemPrompt }]
                    })
                });
                const data = await res.json();
                aiAnswer = data?.choices?.[0]?.message?.content || "";
            }

            if (aiAnswer && aiAnswer.trim().length > 0) {
                return {
                    answer: aiAnswer.trim(),
                    sources
                };
            }
        } catch (err) {
            console.warn("LLM API Q&A call failed, using local NLP ranking:", err);
        }
    }

    // Local NLP Grounded Response (Smart Overview vs Specific Sentence Match)
    if (isOverviewQ) {
        const summaryObj = processDocumentText(normalized, "Document", normalized.length);
        const structuredAnswer = `The primary argument and overview of this document:\n\n${summaryObj.executiveSummary}\n\nKey Highlights:\n` +
            summaryObj.keyTakeaways.slice(0, 3).map(t => `• ${t}`).join("\n");

        return {
            answer: structuredAnswer,
            sources
        };
    }

    // Specific Sentence Match
    const qWords = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    const contextTextCombined = selectedChunks.map(rc => rc.text).join(" ");
    const sentences = contextTextCombined.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);

    const matchingSentences = sentences.filter(s => {
        const lower = s.toLowerCase();
        return qWords.some(w => lower.includes(w));
    });

    let answer = "";
    if (matchingSentences.length > 0) {
        answer = matchingSentences.slice(0, 3).join(" ");
    } else {
        answer = selectedChunks[0].text.slice(0, 350) + "...";
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
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require("pdf-parse");
            const pdfData = await pdfParse(buffer);
            return { text: pdfData.text || "", pageCount: pdfData.numpages };
        } catch (pdfErr) {
            console.warn("PDF parsing fallback:", pdfErr);
            const raw = buffer.toString("binary");
            const matches = raw.match(/\(([^()]+)\)/g) || [];
            const text = matches.map(m => m.slice(1, -1)).filter(s => s.length > 3).join(" ");
            return { text: text || "PDF document uploaded." };
        }
    }

    if (lowerName.endsWith(".docx") || mimeType?.includes("wordprocessingml")) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
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

                const qaResult = await answerQuestionGrounded(question, textToUse);
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

        const summaryResult = await generateAISummary(normalized, fileName, fileSize, pageCount);
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

    const targetUrl = fileData.public_url || fileData.url || fileData.publicUrl || "";

    if (targetUrl) {
        if (targetUrl.startsWith("/uploads/")) {
            const localPath = path.join(process.cwd(), "public", targetUrl);
            if (fs.existsSync(localPath)) {
                buffer = fs.readFileSync(localPath);
            }
        } else if (targetUrl.startsWith("http")) {
            try {
                const res = await fetch(targetUrl);
                if (res.ok) {
                    buffer = Buffer.from(await res.arrayBuffer());
                }
            } catch (fetchErr) {
                console.warn("Remote file fetch failed:", fetchErr);
            }
        }
    }

    // Fallback search in public/uploads for local disk files
    if (!buffer) {
        const uploadsDir = path.join(process.cwd(), "public", "uploads");
        if (fs.existsSync(uploadsDir)) {
            const matches = fs.readdirSync(uploadsDir).filter(f => f.includes(fileName) || (fileId && f.includes(fileId)));
            if (matches.length > 0) {
                buffer = fs.readFileSync(path.join(uploadsDir, matches[0]));
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

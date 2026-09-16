"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    BookOpen,
    FileText,
    Upload,
    Sparkles,
    MessageSquare,
    Clock,
    FileCheck,
    Search,
    Send,
    ArrowLeft,
    Layers,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Tag,
    Info,
    ChevronRight
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface SummaryData {
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
    chunksCount?: number;
}

interface SourceCitation {
    chunkIndex: number;
    snippet: string;
}

interface QAItem {
    id: string;
    question: string;
    answer: string;
    sources?: SourceCitation[];
    timestamp: string;
}

type ProcessingState = "IDLE" | "PROCESSING" | "READY" | "ERROR";

function NotebookContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { addToast } = useToast();

    const [existingFiles, setExistingFiles] = useState<any[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [rawText, setRawText] = useState<string>("");
    const [processingState, setProcessingState] = useState<ProcessingState>("IDLE");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [question, setQuestion] = useState("");
    const [qaHistory, setQaHistory] = useState<QAItem[]>([]);
    const [askingQuestion, setAskingQuestion] = useState(false);
    const [showSnippet, setShowSnippet] = useState(false);

    // Fetch existing documents from metadata
    useEffect(() => {
        async function fetchDocuments() {
            try {
                const res = await fetch("/api/file-metadata");
                const json = await res.json();
                const data = json.files || [];

                const docs = data.filter((f: any) => {
                    const name = (f.name || "").toLowerCase();
                    const mime = (f.mime_type || "").toLowerCase();
                    return (
                        name.endsWith(".pdf") ||
                        name.endsWith(".txt") ||
                        name.endsWith(".md") ||
                        name.endsWith(".doc") ||
                        name.endsWith(".docx") ||
                        mime.includes("text") ||
                        mime.includes("pdf") ||
                        mime.includes("document") ||
                        mime.includes("wordprocessingml")
                    );
                });

                setExistingFiles(docs);

                // Auto select file if fileId query param is present
                const fileIdParam = searchParams.get("fileId");
                if (fileIdParam) {
                    setSelectedFileId(fileIdParam);
                    analyzeFileById(fileIdParam);
                }
            } catch (err: any) {
                console.error("Error loading documents:", err);
            }
        }
        fetchDocuments();
    }, [searchParams]);

    async function analyzeFileById(fileId: string) {
        setProcessingState("PROCESSING");
        setErrorMessage(null);
        setSummary(null);
        setQaHistory([]);

        try {
            const res = await fetch("/api/summarize-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to analyze document");
            }

            setSummary(data.summary);
            setRawText(data.rawText);
            setProcessingState("READY");
            addToast("success", "Document Loaded", `Successfully extracted and analyzed ${data.summary.fileName}`);
        } catch (err: any) {
            console.error(err);
            setProcessingState("ERROR");
            setErrorMessage(err.message || "Failed to process document.");
            addToast("error", "Extraction Error", err.message || "Could not process document.");
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcessingState("PROCESSING");
        setErrorMessage(null);
        setSummary(null);
        setQaHistory([]);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/summarize-document", {
                method: "POST",
                body: formData
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Failed to analyze uploaded file");
            }

            setSummary(data.summary);
            setRawText(data.rawText);
            setProcessingState("READY");
            addToast("success", "File Analyzed", `Successfully analyzed ${file.name}`);
        } catch (err: any) {
            console.error(err);
            setProcessingState("ERROR");
            setErrorMessage(err.message || "Failed to process file.");
            addToast("error", "Processing Error", err.message || "Failed to process file.");
        }
    }

    async function handleAskQuestion(e?: React.FormEvent, customQ?: string) {
        if (e) e.preventDefault();
        const qToAsk = customQ || question;

        if (!qToAsk.trim() || askingQuestion || !rawText) return;

        setAskingQuestion(true);
        const userQ = qToAsk.trim();
        if (!customQ) setQuestion("");

        try {
            const res = await fetch("/api/summarize-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileId: selectedFileId,
                    question: userQ,
                    contextText: rawText
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to get answer");

            const newItem: QAItem = {
                id: Date.now().toString(),
                question: userQ,
                answer: data.answer || "I couldn't find the answer in this document.",
                sources: data.sources || [],
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setQaHistory(prev => [newItem, ...prev]);
        } catch (err: any) {
            addToast("error", "Q&A Error", err.message || "Failed to generate answer.");
        } finally {
            setAskingQuestion(false);
        }
    }

    const formatFileSize = (bytes: number) => {
        if (!bytes) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto text-white">
            {/* Top Navigation & Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push("/search")}
                            className="text-gray-400 hover:text-white p-0 h-auto hover:bg-transparent mr-2"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Files
                        </Button>
                        <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 bg-cyan-500/10">
                            <Sparkles className="w-3 h-3 mr-1" /> NeuraNotebook
                        </Badge>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-gray-200 to-cyan-400 bg-clip-text text-transparent">
                        Document Intelligence Workspace
                    </h1>
                    <p className="text-sm text-gray-400">
                        NeuraStore doesn't just store your files — it understands them.
                    </p>
                </div>

                {/* Document Selector & Quick Upload */}
                <div className="flex items-center gap-3">
                    <select
                        value={selectedFileId || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                                setSelectedFileId(val);
                                router.push(`/notebook?fileId=${val}`);
                                analyzeFileById(val);
                            }
                        }}
                        className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg p-2.5 max-w-xs focus:ring-cyan-500 focus:border-cyan-500"
                    >
                        <option value="">-- Select Stored Document --</option>
                        {existingFiles.map((f) => (
                            <option key={f.id} value={f.id}>
                                📄 {f.name} ({formatFileSize(f.size)})
                            </option>
                        ))}
                    </select>

                    <label className="cursor-pointer">
                        <input
                            type="file"
                            accept=".pdf,.txt,.md,.doc,.docx"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <Button variant="outline" className="border-cyan-500/50 hover:bg-cyan-950 text-cyan-300">
                            <Upload className="w-4 h-4 mr-2" /> Upload New
                        </Button>
                    </label>
                </div>
            </div>

            {/* PROCESSING STATE LOADER */}
            {processingState === "PROCESSING" && (
                <Card className="bg-gray-900/60 border-cyan-500/30 p-8 text-center space-y-4 animate-pulse">
                    <div className="flex justify-center">
                        <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
                    </div>
                    <h3 className="text-lg font-medium text-cyan-300">Extracting & Analyzing Document...</h3>
                    <p className="text-sm text-gray-400 max-w-md mx-auto">
                        Parsing structure, generating executive summary, topics, and indexing context chunks.
                    </p>
                </Card>
            )}

            {/* ERROR STATE */}
            {processingState === "ERROR" && (
                <Card className="bg-red-950/30 border-red-500/40 p-6 text-center space-y-3">
                    <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                    <h3 className="text-lg font-medium text-red-200">Document Extraction Failed</h3>
                    <p className="text-sm text-red-300/80 max-w-md mx-auto">
                        {errorMessage || "NeuraNotebook couldn't extract readable text from this document."}
                    </p>
                    <Button variant="outline" onClick={() => selectedFileId && analyzeFileById(selectedFileId)} className="border-red-500/50 text-red-300 hover:bg-red-900/40">
                        Retry Extraction
                    </Button>
                </Card>
            )}

            {/* IDLE STATE - NO DOCUMENT SELECTED */}
            {processingState === "IDLE" && !summary && (
                <Card className="bg-gray-900/40 border-gray-800 p-12 text-center space-y-6">
                    <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto border border-cyan-500/20">
                        <BookOpen className="w-8 h-8 text-cyan-400" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-white">Select a Document to Start</h3>
                        <p className="text-sm text-gray-400 max-w-lg mx-auto">
                            Choose an existing uploaded PDF, TXT, MD, or DOCX document from NeuraStore, or upload a new file to open your interactive AI notebook.
                        </p>
                    </div>

                    <div className="flex justify-center gap-4 pt-2">
                        {existingFiles.length > 0 && (
                            <Button
                                onClick={() => {
                                    const first = existingFiles[0];
                                    setSelectedFileId(first.id);
                                    router.push(`/notebook?fileId=${first.id}`);
                                    analyzeFileById(first.id);
                                }}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                            >
                                Open Recent: {existingFiles[0].name}
                            </Button>
                        )}
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept=".pdf,.txt,.md,.doc,.docx"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <Button variant="secondary" className="bg-gray-800 text-gray-200 hover:bg-gray-700">
                                <Upload className="w-4 h-4 mr-2" /> Select File
                            </Button>
                        </label>
                    </div>
                </Card>
            )}

            {/* READY STATE - FULL NEURANOTEBOOK WORKSPACE */}
            {processingState === "READY" && summary && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* LEFT / MAIN COLUMN: DOCUMENT SUMMARY & TAKEAAYS */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* DOCUMENT METADATA BAR */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                                        <FileText className="w-6 h-6 text-cyan-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg text-white">{summary.fileName}</h3>
                                        <p className="text-xs text-gray-400 flex items-center gap-2">
                                            <span>Size: {formatFileSize(summary.fileSize)}</span> •
                                            <span>Words: {summary.wordCount.toLocaleString()}</span> •
                                            <span>Est. Read: {summary.readingTimeMinutes} min</span>
                                            {summary.pageCount && <span>• Pages: {summary.pageCount}</span>}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Indexed ({summary.chunksCount || 1} Chunks)
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>

                        {/* EXECUTIVE SUMMARY */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-md font-semibold flex items-center gap-2 text-cyan-300">
                                    <Sparkles className="w-4 h-4 text-cyan-400" /> Executive Summary
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-gray-300 leading-relaxed bg-gray-950/50 p-4 rounded-lg border border-gray-800">
                                    {summary.executiveSummary}
                                </p>

                                <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                                    <button
                                        onClick={() => setShowSnippet(!showSnippet)}
                                        className="text-cyan-400 hover:underline flex items-center gap-1"
                                    >
                                        <Info className="w-3.5 h-3.5" />
                                        {showSnippet ? "Hide Extracted Snippet" : "View Extracted Raw Text Snippet"}
                                    </button>
                                </div>

                                {showSnippet && (
                                    <pre className="p-3 bg-black/60 rounded border border-gray-800 text-xs text-gray-400 overflow-x-auto max-h-48 whitespace-pre-wrap font-mono">
                                        {summary.textSnippet}
                                    </pre>
                                )}
                            </CardContent>
                        </Card>

                        {/* KEY TAKEAWAYS */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-md font-semibold flex items-center gap-2 text-emerald-300">
                                    <FileCheck className="w-4 h-4 text-emerald-400" /> Key Takeaways
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2.5">
                                    {summary.keyTakeaways.map((takeaway, idx) => (
                                        <li key={idx} className="flex items-start text-sm text-gray-300 gap-2.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                                            <span className="leading-relaxed">{takeaway}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>

                        {/* TOPICS BREAKDOWN */}
                        <Card className="bg-gray-900 border-gray-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-md font-semibold flex items-center gap-2 text-indigo-300">
                                    <Layers className="w-4 h-4 text-indigo-400" /> Topic Breakdown
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {summary.topics.map((t, i) => (
                                    <div key={i} className="p-3 bg-gray-950/60 rounded-lg border border-gray-800 space-y-1">
                                        <h4 className="text-xs font-medium text-indigo-300 truncate">{t.title}</h4>
                                        <p className="text-xs text-gray-400 line-clamp-3">{t.summary}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        {/* IDENTIFIED ENTITIES */}
                        {summary.entities.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <Tag className="w-3.5 h-3.5 text-gray-500" /> Identified Keywords:
                                </span>
                                {summary.entities.map((ent, i) => (
                                    <Badge key={i} variant="secondary" className="bg-gray-800 text-gray-300 text-xs">
                                        {ent}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: ASK NEURA GROUNDED Q&A CHAT */}
                    <div className="space-y-6">
                        <Card className="bg-gray-900 border-gray-800 flex flex-col h-[680px]">
                            <CardHeader className="pb-3 border-b border-gray-800">
                                <CardTitle className="text-md font-semibold flex items-center gap-2 text-cyan-300">
                                    <MessageSquare className="w-4 h-4 text-cyan-400" /> Ask Neura
                                </CardTitle>
                                <CardDescription className="text-xs text-gray-400">
                                    Answers are grounded strictly in this document's text context.
                                </CardDescription>
                            </CardHeader>

                            {/* Q&A CHAT STREAM */}
                            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                                {qaHistory.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3 p-4">
                                        <div className="p-3 bg-cyan-500/10 rounded-full border border-cyan-500/20 text-cyan-400">
                                            <Sparkles className="w-6 h-6" />
                                        </div>
                                        <p className="text-xs text-gray-400 max-w-xs">
                                            Ask anything about <span className="text-gray-200 font-medium">{summary.fileName}</span>.
                                        </p>

                                        {/* Quick Prompt Pills */}
                                        <div className="flex flex-col gap-1.5 w-full pt-2">
                                            {[
                                                "What is the main argument?",
                                                "Summarize key findings",
                                                "What conclusions are drawn?"
                                            ].map((qp, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleAskQuestion(undefined, qp)}
                                                    className="text-xs text-left p-2 bg-gray-950 hover:bg-gray-800 text-gray-300 rounded border border-gray-800 flex items-center justify-between"
                                                >
                                                    <span>{qp}</span>
                                                    <ChevronRight className="w-3 h-3 text-gray-500" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    qaHistory.map((item) => (
                                        <div key={item.id} className="space-y-3">
                                            {/* User Question */}
                                            <div className="flex justify-end">
                                                <div className="bg-cyan-600/90 text-white text-xs p-3 rounded-xl rounded-tr-none max-w-[85%] space-y-1">
                                                    <p>{item.question}</p>
                                                    <span className="text-[10px] text-cyan-200/70 block text-right">{item.timestamp}</span>
                                                </div>
                                            </div>

                                            {/* Neura AI Grounded Answer */}
                                            <div className="flex justify-start">
                                                <div className="bg-gray-950 border border-gray-800 text-gray-200 text-xs p-3 rounded-xl rounded-tl-none max-w-[90%] space-y-2">
                                                    <div className="flex items-center gap-1.5 text-cyan-400 font-medium text-[11px]">
                                                        <Sparkles className="w-3 h-3" /> Neura
                                                    </div>
                                                    <p className="leading-relaxed">{item.answer}</p>

                                                    {/* Source Citations */}
                                                    {item.sources && item.sources.length > 0 && (
                                                        <div className="pt-2 border-t border-gray-900 space-y-1">
                                                            <span className="text-[10px] text-gray-400 font-medium">Referenced Sources:</span>
                                                            <div className="flex flex-wrap gap-1">
                                                                {item.sources.map((src, i) => (
                                                                    <Badge
                                                                        key={i}
                                                                        variant="outline"
                                                                        className="text-[10px] border-cyan-500/30 bg-cyan-500/5 text-cyan-300"
                                                                        title={src.snippet}
                                                                    >
                                                                        Chunk {src.chunkIndex}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {askingQuestion && (
                                    <div className="flex justify-start">
                                        <div className="bg-gray-950 border border-gray-800 text-gray-400 text-xs p-3 rounded-xl flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                            <span>Searching document context...</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            {/* Q&A INPUT FORM */}
                            <div className="p-3 border-t border-gray-800 bg-gray-950/50">
                                <form onSubmit={handleAskQuestion} className="flex gap-2">
                                    <Input
                                        value={question}
                                        onChange={(e) => setQuestion(e.target.value)}
                                        placeholder="Ask a question about this document..."
                                        className="bg-gray-900 border-gray-700 text-xs text-white focus:ring-cyan-500 focus:border-cyan-500"
                                        disabled={askingQuestion}
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={askingQuestion || !question.trim()}
                                        className="bg-cyan-600 hover:bg-cyan-500 text-white"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                    </Button>
                                </form>
                            </div>
                        </Card>
                    </div>

                </div>
            )}
        </div>
    );
}

export default function NotebookPage() {
    return (
        <Suspense fallback={
            <div className="p-8 text-center text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-cyan-400 mb-2" />
                Loading NeuraNotebook...
            </div>
        }>
            <NotebookContent />
        </Suspense>
    );
}

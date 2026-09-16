"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { BookOpen, FileText, Upload, Sparkles, MessageSquare, Clock, FileCheck, Search, Send, Layers } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface SummaryData {
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

interface QAItem {
    question: string;
    answer: string;
}

export default function NotebookPage() {
    const searchParams = useSearchParams();
    const { addToast } = useToast();

    const [existingFiles, setExistingFiles] = useState<any[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [rawText, setRawText] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [question, setQuestion] = useState("");
    const [qaHistory, setQaHistory] = useState<QAItem[]>([]);
    const [askingQuestion, setAskingQuestion] = useState(false);

    // Fetch user documents
    useEffect(() => {
        async function fetchDocuments() {
            try {
                const res = await fetch("/api/file-metadata");
                const json = await res.json();
                const data = json.files || [];

                const docs = data.filter((f: any) =>
                    f.name.endsWith(".pdf") ||
                    f.name.endsWith(".txt") ||
                    f.name.endsWith(".md") ||
                    f.name.endsWith(".doc") ||
                    f.mime_type?.includes("text") ||
                    f.mime_type?.includes("pdf") ||
                    f.mime_type?.includes("document")
                );
                setExistingFiles(docs);

                // Auto select file if fileId query param is present
                const fileId = searchParams.get("fileId");
                if (fileId) {
                    setSelectedFileId(fileId);
                    analyzeFileById(fileId);
                }
            } catch (err: any) {
                console.error("Error loading files:", err);
            }
        }
        fetchDocuments();
    }, [searchParams]);

    async function analyzeFileById(fileId: string) {
        setLoading(true);
        setSummary(null);
        setQaHistory([]);
        try {
            const res = await fetch("/api/summarize-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to analyze document");

            setSummary(data.summary);
            setRawText(data.rawText);
            addToast("success", "Document Summarized", `Successfully summarized ${data.summary.fileName}`);
        } catch (err: any) {
            console.error(err);
            addToast("error", "Summarization Error", err.message || "Failed to process document.");
        } finally {
            setLoading(false);
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setSummary(null);
        setQaHistory([]);
        setSelectedFileId(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/summarize-document", {
                method: "POST",
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to analyze document");

            setSummary(data.summary);
            setRawText(data.rawText);
            addToast("success", "Document Processed", `Generated summary for ${file.name}`);
        } catch (err: any) {
            console.error(err);
            addToast("error", "Error", err.message || "Failed to extract document.");
        } finally {
            setLoading(false);
        }
    }

    async function handleAskQuestion() {
        if (!question.trim() || !rawText) return;
        const currentQ = question.trim();
        setQuestion("");
        setAskingQuestion(true);

        try {
            const res = await fetch("/api/summarize-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: currentQ, contextText: rawText })
            });
            const data = await res.json();
            if (data.answer) {
                setQaHistory(prev => [...prev, { question: currentQ, answer: data.answer }]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setAskingQuestion(false);
        }
    }

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                        <BookOpen className="h-8 w-8 text-blue-400" />
                        Doc Notebook & Summarizer
                    </h1>
                    <p className="text-gray-400 mt-1">
                        NotebookLM-style executive summaries, key bullet points, topic breakdowns, and interactive Q&A.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Panel: File Selection & Upload */}
                <div className="lg:col-span-4 space-y-6">
                    <Card className="bg-gray-900 border-gray-800 text-white">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Upload className="h-5 w-5 text-blue-400" />
                                Add Document
                            </CardTitle>
                            <CardDescription>Upload a PDF, TXT, or Markdown document to analyze.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <label className="border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-gray-950/50">
                                <FileText className="h-10 w-10 text-gray-400 mb-2" />
                                <span className="text-sm font-medium text-gray-300">Click to upload document</span>
                                <span className="text-xs text-gray-500 mt-1">PDF, TXT, MD, DOCX, Code</span>
                                <input
                                    type="file"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    accept=".pdf,.txt,.md,.json,.csv,.js,.ts,.py"
                                />
                            </label>

                            {/* Existing Documents in NeuraStore */}
                            {existingFiles.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Or Select From Saved Repository
                                    </h4>
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                        {existingFiles.map(file => (
                                            <button
                                                key={file.id}
                                                onClick={() => {
                                                    setSelectedFileId(file.id);
                                                    analyzeFileById(file.id);
                                                }}
                                                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${selectedFileId === file.id
                                                        ? "bg-blue-600/30 border border-blue-500 text-blue-200"
                                                        : "bg-gray-800/50 hover:bg-gray-800 text-gray-300"
                                                    }`}
                                            >
                                                <span className="truncate pr-2">{file.name}</span>
                                                <Badge variant="outline" className="text-xs bg-gray-800">
                                                    {(file.size / 1024).toFixed(0)} KB
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Panel: Notebook Summary & Analysis */}
                <div className="lg:col-span-8 space-y-6">
                    {loading && (
                        <Card className="bg-gray-900 border-gray-800 text-white p-12 text-center">
                            <Sparkles className="h-10 w-10 text-blue-400 animate-spin mx-auto mb-4" />
                            <h3 className="text-lg font-semibold">Extracting & Summarizing Document...</h3>
                            <p className="text-sm text-gray-400 mt-1">Processing text, computing takeaways, and structuring topics.</p>
                        </Card>
                    )}

                    {!loading && !summary && (
                        <Card className="bg-gray-900 border-gray-800 text-white p-12 text-center">
                            <BookOpen className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-gray-300">No Document Selected</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Upload a document or pick an existing file from the left sidebar to generate a NotebookLM-style summary.
                            </p>
                        </Card>
                    )}

                    {!loading && summary && (
                        <div className="space-y-6">
                            {/* Document Header Metrics */}
                            <Card className="bg-gray-900 border-gray-800 text-white">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <FileCheck className="h-6 w-6 text-green-400" />
                                            <div>
                                                <CardTitle className="text-xl">{summary.fileName}</CardTitle>
                                                <CardDescription>Document Analysis & Notebook Summary</CardDescription>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> {summary.readingTimeMinutes} min read
                                            </Badge>
                                            <Badge variant="outline" className="text-gray-300">
                                                {summary.wordCount.toLocaleString()} words
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                            </Card>

                            {/* Executive Summary */}
                            <Card className="bg-gray-900 border-gray-800 text-white">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2 text-blue-400">
                                        <Sparkles className="h-5 w-5" /> Executive Overview
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-gray-200 leading-relaxed text-base">
                                        {summary.executiveSummary}
                                    </p>

                                    {summary.entities.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-800">
                                            <span className="text-xs text-gray-400 self-center">Key Concepts:</span>
                                            {summary.entities.map((kw, i) => (
                                                <Badge key={i} variant="secondary" className="bg-gray-800 text-blue-300 hover:bg-gray-700">
                                                    #{kw}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Key Takeaways */}
                            <Card className="bg-gray-900 border-gray-800 text-white">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2 text-emerald-400">
                                        <FileCheck className="h-5 w-5" /> Key Bullet Takeaways
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-3">
                                        {summary.keyTakeaways.map((bullet, idx) => (
                                            <li key={idx} className="flex items-start gap-3 text-gray-300">
                                                <span className="h-2 w-2 rounded-full bg-emerald-400 mt-2 shrink-0" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>

                            {/* Topics Breakdown */}
                            <Card className="bg-gray-900 border-gray-800 text-white">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2 text-purple-400">
                                        <Layers className="h-5 w-5" /> Topic Sections
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {summary.topics.map((topic, i) => (
                                        <div key={i} className="p-4 rounded-lg bg-gray-950/60 border border-gray-800 space-y-1">
                                            <h4 className="font-medium text-purple-300">{topic.title}</h4>
                                            <p className="text-sm text-gray-400">{topic.summary}</p>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            {/* Interactive Q&A */}
                            <Card className="bg-gray-900 border-gray-800 text-white">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2 text-cyan-400">
                                        <MessageSquare className="h-5 w-5" /> Ask Questions About Document
                                    </CardTitle>
                                    <CardDescription>
                                        Type a question below to query specific details within this document.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex gap-2">
                                        <Input
                                            value={question}
                                            onChange={e => setQuestion(e.target.value)}
                                            onKeyDown={e => e.key === "Enter" && handleAskQuestion()}
                                            placeholder="Ask something, e.g. What are the key conclusions?"
                                            className="bg-gray-950 border-gray-700 text-white"
                                        />
                                        <Button
                                            onClick={handleAskQuestion}
                                            disabled={askingQuestion || !question.trim()}
                                            className="bg-cyan-600 hover:bg-cyan-700 text-white"
                                        >
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {qaHistory.length > 0 && (
                                        <div className="space-y-3 pt-2">
                                            {qaHistory.map((item, index) => (
                                                <div key={index} className="p-4 rounded-lg bg-gray-950 border border-gray-800 space-y-2">
                                                    <p className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                                                        <span>Q:</span> {item.question}
                                                    </p>
                                                    <p className="text-sm text-gray-300 pl-4 border-l-2 border-cyan-500">
                                                        {item.answer}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

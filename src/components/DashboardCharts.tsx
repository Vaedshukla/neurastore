"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import DataQueryModal from "./DataQueryModal";

interface FileMetadata {
    id: number;
    name: string;
    mime_type: string;
    size: number;
    category: string;
    confidence: number;
    folder_path: string;
    public_url: string;
    uploaded_at: string;
    ai_tags?: string[];
    table_name?: string;
    storage_type?: string;
    record_count?: number;
}

interface DashboardChartsProps {
    files: FileMetadata[];
    onAnalyzeJSON: (file: any) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const getFileTypeCategory = (type: string) => {
    if (type.startsWith('image/')) return 'Images';
    if (type.startsWith('video/')) return 'Videos';
    if (type.startsWith('audio/')) return 'Audio';
    if (type.startsWith('text/') || type.includes('document')) return 'Documents';
    return 'Other';
};

export default function DashboardCharts({ files, onAnalyzeJSON }: { files: any[], onAnalyzeJSON: (file: any) => void }) {
    const [validJsonFiles, setValidJsonFiles] = useState<Set<string>>(new Set());
    const [queryModalOpen, setQueryModalOpen] = useState(false);
    const [selectedTable, setSelectedTable] = useState<{ name: string; fileName: string } | null>(null);

    // Check JSON validity for .json files in parallel without blocking UI
    useEffect(() => {
        if (!files || files.length === 0) return;
        let isSubscribed = true;

        const checkJsonValidity = async () => {
            const jsonFiles = files.filter(f => f.name?.endsWith('.json') && f.public_url);
            if (jsonFiles.length === 0) return;

            const results = await Promise.allSettled(
                jsonFiles.map(async file => {
                    try {
                        const response = await fetch(file.public_url);
                        if (!response.ok) return null;
                        const text = await response.text();
                        JSON.parse(text);
                        return file.name;
                    } catch {
                        return null;
                    }
                })
            );

            if (isSubscribed) {
                const validSet = new Set<string>();
                results.forEach(res => {
                    if (res.status === 'fulfilled' && res.value) {
                        validSet.add(res.value);
                    }
                });
                setValidJsonFiles(validSet);
            }
        };

        checkJsonValidity();
        return () => { isSubscribed = false; };
    }, [files]);

    if (!files || files.length === 0) return <p className="text-gray-400 text-center py-8">No personal files or data added yet. Upload files or write JSON data to view visualizations.</p>;

    const categories = files.reduce((acc: any, f: any) => {
        const cat = f.category || "Other";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
    }, {});

    const fileTypeData = Object.entries(categories).map(([name, value]) => ({ name, value }));

    // Validate before render
    if (!fileTypeData || fileTypeData.length === 0) {
        return (
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="md:col-span-2">
                    <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
                        <p>No data available for charts</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Upload trend data (last 7 days)
    const uploadTrendData = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const count = files.filter(file =>
            file.uploaded_at.startsWith(dateStr)
        ).length;
        uploadTrendData.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            uploads: count,
        });
    }

    // Top AI tags data
    const tagCounts: { [key: string]: number } = {};
    files.forEach((file: any) => {
        if (file.ai_tags && Array.isArray(file.ai_tags)) {
            file.ai_tags.forEach((tag: string) => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    const topTags = Object.entries(tagCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count }));

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Upload Trends</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {uploadTrendData.some(d => d.uploads > 0) ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={uploadTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="uploads" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                No upload data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>AI Category Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {fileTypeData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={fileTypeData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {fileTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                No data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Top AI Tags Section */}
            <div className="bg-gray-900 p-4 rounded-lg mt-6">
                <h2 className="text-lg font-medium mb-3">All Files & AI Tags</h2>
                {files.length === 0 ? (
                    <p className="text-gray-400">No files available.</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {files.map((file) => (
                            <div key={file.id} className="p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-500 transition">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-xs text-gray-400">
                                    {file.category || "Uncategorized"} • {(file.size / 1024).toFixed(2)} KB
                                    {file.record_count && ` • ${file.record_count} records`}
                                </p>

                                {/* File Category Badge */}
                                <div className="mt-3 flex justify-between items-center">
                                    <span
                                        className={`text-xs font-medium px-3 py-1 rounded-full ${file.name.endsWith(".json")
                                            ? "bg-yellow-600/20 text-yellow-400 border border-yellow-500/50"
                                            : "bg-blue-600/20 text-blue-400 border border-blue-500/50"
                                            }`}
                                    >
                                        {file.category || "Unclassified"}
                                        {file.storage_type && ` (${file.storage_type})`}
                                    </span>

                                    {/* Action buttons */}
                                    <div className="flex gap-1">
                                        {file.table_name && file.storage_type === 'SQL' ? (
                                            <button
                                                onClick={() => {
                                                    setSelectedTable({ name: file.table_name!, fileName: file.name });
                                                    setQueryModalOpen(true);
                                                }}
                                                className="text-xs px-3 py-1 rounded-md bg-green-600 hover:bg-green-500 text-white transition"
                                            >
                                                Query Data
                                            </button>
                                        ) : file.name.endsWith(".json") && validJsonFiles.has(file.name) ? (
                                            <button
                                                onClick={() => onAnalyzeJSON(file)}
                                                className="text-xs px-3 py-1 rounded-md bg-yellow-600 hover:bg-yellow-500 text-white transition"
                                            >
                                                Analyze
                                            </button>
                                        ) : file.name.endsWith(".json") ? (
                                            <button
                                                className="text-xs px-3 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white transition"
                                                disabled
                                            >
                                                Malformed
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Data Query Modal */}
            {selectedTable && (
                <DataQueryModal
                    isOpen={queryModalOpen}
                    onClose={() => {
                        setQueryModalOpen(false);
                        setSelectedTable(null);
                    }}
                    tableName={selectedTable.name}
                    fileName={selectedTable.fileName}
                />
            )}
        </>
    );
}

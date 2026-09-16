"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import SearchBar from "@/components/SearchBar";
import FileCard from "@/components/FileCard";
import FileTreeView from "@/components/FileTreeView";
import JSONVisualizer from "@/components/JSONVisualizer";
import { buildFileTree, sortTreeNodes, FileTreeNode } from "@/lib/utils/buildFileTree";
import { JSONAnalyzer, JSONAnalysisResult } from "@/utils/jsonAnalyzer";
import { motion } from "framer-motion";

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
}

export default function SearchPage() {
    const [query, setQuery] = useState("");
    const [selectedFilter, setSelectedFilter] = useState<string>("All");
    const [results, setResults] = useState<FileMetadata[]>([]);
    const [allFiles, setAllFiles] = useState<FileMetadata[]>([]);
    const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [allCategories, setAllCategories] = useState<string[]>([]);
    const [highlightedPaths, setHighlightedPaths] = useState<Set<string>>(new Set());
    const [fileAnalyses, setFileAnalyses] = useState<Record<string, JSONAnalysisResult>>({});
    const [visualizingFile, setVisualizingFile] = useState<{ data: any; fileName: string; fileId?: string } | null>(null);

    useEffect(() => {
        fetchCategories();
        fetchAllFiles();
        performSearch();
    }, [query, selectedFilter]);

    // Fetch all files for the full tree explorer
    const fetchAllFiles = async () => {
        try {
            const res = await fetch('/api/file-metadata');
            const json = await res.json();
            const files = json.files || [];
            setAllFiles(files);

            // Build tree from files
            const fileInfos = files.map((f: any) => ({ folder_path: f.folder_path, name: f.name })).filter((f: any) => f.folder_path);
            let fullTree = buildFileTree(fileInfos);
            fullTree = sortTreeNodes(fullTree);

            // Auto-expand media/ by default
            const expandMedia = (nodes: FileTreeNode[]): FileTreeNode[] => {
                return nodes.map(node => {
                    if (node.name === 'media') {
                        return { ...node, isExpanded: true };
                    }
                    if (node.children) {
                        return { ...node, children: expandMedia(node.children) };
                    }
                    return node;
                });
            };
            fullTree = expandMedia(fullTree);

            setTreeData(fullTree);
        } catch (error) {
            console.error('Error fetching all files:', error);
            setTreeData([]);
            setAllFiles([]);
        }
    };



    // Calculate highlighted paths when results change
    useEffect(() => {
        if (query.trim() && results.length > 0) {
            const matches = new Set<string>();
            const searchTerm = query.toLowerCase();

            results.forEach(file => {
                // Check if file name or category matches
                if (file.name.toLowerCase().includes(searchTerm) ||
                    file.category?.toLowerCase().includes(searchTerm)) {
                    matches.add(file.folder_path);
                }
            });

            setHighlightedPaths(matches);
        } else {
            setHighlightedPaths(new Set());
        }
    }, [query, results]);

    const fetchCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('files_metadata')
                .select('category')
                .not('category', 'is', null);

            if (error) throw error;

            const uniqueCategories = Array.from(new Set(data.map(item => item.category)));
            setAllCategories(uniqueCategories);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    const performSearch = async () => {
        setLoading(true);
        try {
            let queryBuilder = supabase
                .from('files_metadata')
                .select('*')
                .order('uploaded_at', { ascending: false });

            if (query.trim()) {
                queryBuilder = queryBuilder.or(`name.ilike.%${query}%,category.ilike.%${query}%`);
            }

            if (selectedFilter !== "All") {
                if (selectedFilter === "Images") {
                    queryBuilder = queryBuilder.ilike('mime_type', 'image/%');
                } else if (selectedFilter === "Documents") {
                    queryBuilder = queryBuilder.or('mime_type.ilike.%text/%,mime_type.ilike.%document%,mime_type.ilike.%application/pdf%');
                } else if (selectedFilter === "Videos") {
                    queryBuilder = queryBuilder.ilike('mime_type', 'video/%');
                } else if (selectedFilter === "JSON") {
                    queryBuilder = queryBuilder.ilike('mime_type', 'application/json');
                } else if (selectedFilter === "Text Files") {
                    queryBuilder = queryBuilder.ilike('mime_type', 'text/%');
                } else if (selectedFilter === "Others") {
                    // Filter for files that don't match common categories
                    queryBuilder = queryBuilder.not('mime_type', 'ilike', 'image/%')
                        .not('mime_type', 'ilike', 'video/%')
                        .not('mime_type', 'ilike', 'text/%')
                        .not('mime_type', 'ilike', 'application/json')
                        .not('mime_type', 'ilike', 'application/pdf')
                        .not('mime_type', 'ilike', 'application/msword')
                        .not('mime_type', 'ilike', 'application/vnd%');
                } else {
                    // Fallback for any other filters
                    queryBuilder = queryBuilder.ilike('category', `%${selectedFilter.toLowerCase()}%`);
                }
            }

            const { data, error } = await queryBuilder.limit(100);

            if (error) throw error;
            setResults(data || []);
        } catch (error) {
            console.error('Error performing search:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    // Analyze JSON files when results change
    useEffect(() => {
        const analyzeJSONFiles = async () => {
            const jsonFiles = results.filter(file => file.mime_type === 'application/json');
            const analyses: Record<string, JSONAnalysisResult> = {};

            for (const file of jsonFiles) {
                try {
                    const response = await fetch(file.public_url);
                    const jsonData = await response.json();
                    const analysis = JSONAnalyzer.analyzeStructure(jsonData);
                    analyses[file.name] = analysis;
                } catch (error) {
                    console.error(`Error analyzing ${file.name}:`, error);
                }
            }

            setFileAnalyses(analyses);
        };

        if (results.length > 0) {
            analyzeJSONFiles();
        }
    }, [results]);

    const handleVisualizeFile = async (file: FileMetadata) => {
        try {
            const response = await fetch(file.public_url);
            const data = await response.json();
            setVisualizingFile({ data, fileName: file.name, fileId: file.id.toString() });
        } catch (error) {
            console.error('Error loading file for visualization:', error);
        }
    };

    const getFilterChips = () => {
        const baseFilters = ["All", "Images", "Documents", "Videos"];
        const staticFilters = ["JSON", "Text Files", "Others"];
        return [...baseFilters, ...staticFilters];
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Smart Search</h1>
                <p className="text-muted-foreground">
                    Search through your files using AI-powered filtering
                </p>
            </div>

            {/* Search Bar */}
            <Card>
                <CardContent className="p-6">
                    <SearchBar
                        onSearch={setQuery}
                        placeholder="Search files or tags..."
                    />
                </CardContent>
            </Card>

            {/* Filter Chips */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                        {getFilterChips().map((filter) => (
                            <Button
                                key={filter}
                                variant={selectedFilter === filter ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedFilter(filter)}
                                className={selectedFilter === filter ? "bg-teal-600 hover:bg-teal-700" : ""}
                            >
                                {filter}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Search Results - File Cards */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Search Results ({results.length} files)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : results.length > 0 ? (
                        <motion.div
                            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                        >
                            {results.map((file) => (
                                <motion.div
                                    key={file.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <FileCard
                                        name={file.name}
                                        size={file.size}
                                        type={file.mime_type}
                                        url={file.public_url}
                                        analysis={fileAnalyses[file.name]}
                                        onVisualize={file.mime_type === 'application/json' ? () => handleVisualizeFile(file) : undefined}
                                    />

                                </motion.div>
                            ))}
                        </motion.div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No files found</p>
                            <p>Try adjusting your search query or filter</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* File Explorer - Full Tree */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">File Explorer — Browse All Files</h3>
                <div className="max-h-[350px] overflow-auto rounded border border-zinc-700">
                    <FileTreeView
                        nodes={treeData}
                        onFileClick={(node) => {
                            // Find the corresponding file and handle click
                            const file = allFiles.find(f => f.folder_path === node.path);
                            if (file) {
                                console.log('File clicked:', file);
                                // Could open file preview or download
                            }
                        }}
                        onFolderClick={(node) => {
                            console.log('Folder clicked:', node);
                        }}
                        highlightedPaths={highlightedPaths}
                    />
                </div>
            </div>

            {/* JSON Visualizer Modal */}
            {visualizingFile && (
                <JSONVisualizer
                    data={visualizingFile.data}
                    fileName={visualizingFile.fileName}
                    fileId={visualizingFile.fileId}
                    allFiles={results.map(f => ({ name: f.name, content: null }))} // Simplified for now
                    onClose={() => setVisualizingFile(null)}
                />
            )}
        </div>
    );
}

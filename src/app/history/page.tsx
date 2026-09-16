"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Trash2, FileText, Image, Video, Music, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/toast";

interface FileMetadata {
    id: string;
    name: string;
    mime_type: string;
    size: number;
    uploaded_at: string;
    public_url: string;
    analysis_result?: any;
}

const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    if (type.startsWith('video/')) return Video;
    if (type.startsWith('audio/')) return Music;
    return FileText;
};

const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function HistoryPage() {
    const router = useRouter();
    const { addToast } = useToast();
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingFile, setDeletingFile] = useState<string | null>(null);

    useEffect(() => {
        fetchFiles();
    }, []);

    // Listen for history clear events
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'neurastore-history-cleared' && e.newValue) {
                // History was cleared, refresh the data
                fetchFiles();
            }
        };

        // Also check on component mount in case history was cleared in another tab
        const checkHistoryCleared = () => {
            const clearedTime = localStorage.getItem('neurastore-history-cleared');
            if (clearedTime) {
                // Clear the flag and refresh data
                localStorage.removeItem('neurastore-history-cleared');
                fetchFiles();
            }
        };

        // Check immediately and set up listener
        checkHistoryCleared();
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const fetchFiles = async () => {
        try {
            const res = await fetch('/api/file-metadata');
            const json = await res.json();
            setFiles(json.files || []);
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (file: FileMetadata) => {
        try {
            const response = await fetch(file.public_url);
            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading file:', error);
        }
    };

    const handleDelete = async (file: FileMetadata) => {
        setDeletingFile(file.id);
        try {
            const res = await fetch(`/api/file-metadata?fileId=${file.id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Delete failed');

            setFiles(files.filter(f => f.id !== file.id));
            addToast('success', 'File Deleted', `${file.name} has been deleted successfully.`);
        } catch (error: any) {
            console.error('Error deleting file:', error);
            addToast('error', 'Delete Failed', `Failed to delete ${file.name}. Please try again.`);
        } finally {
            setDeletingFile(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">File History</h1>
                <p className="text-muted-foreground">
                    View and manage all your uploaded files
                </p>
            </div>

            {files.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No files uploaded yet</h3>
                        <p className="text-muted-foreground text-center">
                            Upload your first file to get started with analysis
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {files.map((file) => {
                        const FileIcon = getFileIcon(file.mime_type);
                        return (
                            <Card key={file.id}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <FileIcon className="h-8 w-8 text-muted-foreground" />
                                            <div>
                                                <CardTitle className="text-lg">{file.name}</CardTitle>
                                                <CardDescription>
                                                    {formatFileSize(file.size)} • {file.mime_type} • {new Date(file.uploaded_at).toLocaleDateString()}
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <Badge variant="secondary">
                                            {file.analysis_result ? 'Analyzed' : 'Pending'}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex space-x-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDownload(file)}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => router.push(`/notebook?fileId=${file.id}`)}
                                        >
                                            <BookOpen className="h-4 w-4 mr-2 text-blue-400" />
                                            Summarize
                                        </Button>
                                        {file.analysis_result && (
                                            <Button variant="outline" size="sm">
                                                <Eye className="h-4 w-4 mr-2" />
                                                View Analysis
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(file)}
                                            disabled={deletingFile === file.id}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            {deletingFile === file.id ? 'Deleting...' : 'Delete'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

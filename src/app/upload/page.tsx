"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FolderOpen, FileText, Image, Video, Music, File, X, CheckCircle, AlertCircle, Code } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmUploadDialog } from "@/components/ConfirmUploadDialog";
import UploadAnalysisModal from "@/components/UploadAnalysisModal";
import { useToast } from "@/components/ui/toast";

interface UploadFile {
    id: string;
    file: File;
    progress: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    error?: string;
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

export default function UploadPage() {
    const { addToast } = useToast();
    const router = useRouter();
    const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
    const [folderName, setFolderName] = useState<string>('');
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());

    const handleFileSelect = useCallback((files: FileList | null) => {
        if (!files) return;

        const newFiles: UploadFile[] = Array.from(files).map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            progress: 0,
            status: 'pending' as const,
        }));

        setUploadFiles(prev => {
            const updatedFiles = [...prev];
            newFiles.forEach(newFile => {
                const existingIndex = updatedFiles.findIndex(f => f.file.name === newFile.file.name && f.file.size === newFile.file.size);
                if (existingIndex === -1) {
                    // File doesn't exist, add it
                    updatedFiles.push(newFile);
                } else {
                    // File exists, update its status to pending if it was completed/error
                    const existing = updatedFiles[existingIndex];
                    if (existing.status === 'completed' || existing.status === 'error') {
                        updatedFiles[existingIndex] = { ...existing, status: 'pending' as const, progress: 0, error: undefined };
                    }
                }
            });
            return updatedFiles;
        });
    }, []);

    const handleFolderSelect = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.webkitdirectory = true;
        input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                // Extract folder name from the first file's webkitRelativePath
                const firstFile = files[0];
                const folderName = firstFile.webkitRelativePath?.split('/')[0] || 'Selected Folder';

                // Calculate total size
                let totalSize = 0;
                for (let i = 0; i < files.length; i++) {
                    totalSize += files[i].size;
                }

                setPendingFiles(files);
                setFolderName(folderName);
                setIsDialogOpen(true);
            }
        };
        input.click();
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFileSelect(e.dataTransfer.files);
    }, [handleFileSelect]);

    const removeFile = useCallback((id: string) => {
        setUploadFiles(prev => prev.filter(f => f.id !== id));
    }, []);

    const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
        const fileName = uploadFile.file.name;

        // Prevent duplicate uploads
        if (uploadingFiles.has(fileName)) {
            setUploadFiles(prev =>
                prev.map(f =>
                    f.id === uploadFile.id
                        ? { ...f, status: "error", error: "File already being uploaded" }
                        : f
                )
            );
            return;
        }

        // Add to uploading set
        setUploadingFiles(prev => new Set(prev).add(fileName));

        try {
            // mark as uploading
            setUploadFiles(prev =>
                prev.map(f =>
                    f.id === uploadFile.id ? { ...f, status: "uploading" } : f
                )
            );

            const file = uploadFile.file;
            if (!file) throw new Error("No file selected");

            // Use the new unified upload API that handles everything
            const formData = new FormData();
            formData.append('file', file);

            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const contentType = uploadRes.headers.get('content-type') || '';
            let responseData: any = {};
            if (contentType.includes('application/json')) {
                responseData = await uploadRes.json();
            } else {
                const rawText = await uploadRes.text();
                console.error('Upload route non-JSON response:', rawText);
                addToast('error', 'Configuration Required', 'Please set valid Supabase credentials in .env.local.');
                throw new Error('Upload endpoint returned non-JSON error. Please check your Supabase configuration.');
            }

            if (!uploadRes.ok) {
                // Handle specific error codes with user-friendly messages
                const errorCode = responseData.code;
                let userMessage = responseData.error || 'Upload failed';
                let toastType: 'error' | 'warning' | 'info' = 'error';
                let shouldRetry = false;

                switch (errorCode) {
                    case 'NO_FILE':
                        userMessage = 'No file was selected for upload.';
                        break;
                    case 'FILE_TOO_LARGE':
                        userMessage = 'File is too large. Maximum size is 50MB.';
                        break;
                    case 'INVALID_FORM_DATA':
                        userMessage = 'Invalid file data. Please try again.';
                        shouldRetry = true;
                        break;
                    case 'FILE_READ_ERROR':
                        userMessage = 'Failed to read file. Please check the file and try again.';
                        shouldRetry = true;
                        break;
                    case 'MIME_DETECTION_FAILED':
                        userMessage = 'Could not determine file type. Please try again.';
                        shouldRetry = true;
                        break;
                    case 'STORAGE_UPLOAD_FAILED':
                        userMessage = 'Failed to upload to storage. Please check your connection and try again.';
                        shouldRetry = true;
                        toastType = 'warning';
                        break;
                    case 'NOT_AUTHENTICATED':
                        userMessage = 'Please log in to upload files.';
                        toastType = 'info';
                        // Could redirect to login here
                        break;
                    case 'AUTH_SERVICE_ERROR':
                    case 'AUTH_UNAVAILABLE':
                        userMessage = 'Authentication service is temporarily unavailable. Please try again later.';
                        shouldRetry = true;
                        toastType = 'warning';
                        break;
                    case 'METADATA_SAVE_FAILED':
                        userMessage = 'File uploaded but could not save information. The file is still accessible.';
                        toastType = 'warning';
                        // Mark as completed since file was uploaded
                        setUploadFiles(prev =>
                            prev.map(f =>
                                f.id === uploadFile.id
                                    ? { ...f, progress: 100, status: "completed" }
                                    : f
                            )
                        );
                        addToast(toastType, 'Partial Success', userMessage);
                        return;
                    case 'NETWORK_ERROR':
                        userMessage = 'Network connection issue. Please check your internet and try again.';
                        shouldRetry = true;
                        toastType = 'warning';
                        break;
                    case 'TIMEOUT_ERROR':
                        userMessage = 'Upload timed out. Please try again.';
                        shouldRetry = true;
                        break;
                    case 'QUOTA_EXCEEDED':
                        userMessage = 'Storage quota exceeded. Please contact support or free up space.';
                        break;
                    default:
                        userMessage = responseData.error || 'An unexpected error occurred during upload.';
                        shouldRetry = true;
                }

                // Show toast notification for the error
                addToast(toastType, 'Upload Failed', userMessage);

                // Throw error to mark file as failed
                throw new Error(userMessage);
            }

            const uploadData = responseData;

            if (uploadData.duplicate) {
                // Handle duplicate file
                setUploadFiles(prev =>
                    prev.map(f =>
                        f.id === uploadFile.id
                            ? { ...f, progress: 100, status: "completed" }
                            : f
                    )
                );
                addToast('info', 'Duplicate File', `${file.name} already exists and was skipped.`);
            } else {
                // Normal completion
                setUploadFiles(prev =>
                    prev.map(f =>
                        f.id === uploadFile.id
                            ? { ...f, progress: 100, status: "completed" }
                            : f
                    )
                );
                // Show success toast for individual file uploads
                addToast('success', 'File Uploaded', `${file.name} uploaded successfully!`);
            }

            // Remove from uploading set
            setUploadingFiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(fileName);
                return newSet;
            });

        } catch (error: any) {
            console.error("Upload error:", error.message || error);

            // Extract user-friendly message if it's already been processed above
            const errorMessage = error.message?.includes('Upload Failed') ?
                error.message :
                (error.message || "Upload failed");

            setUploadFiles(prev =>
                prev.map(f =>
                    f.id === uploadFile.id
                        ? {
                            ...f,
                            status: "error",
                            error: errorMessage,
                        }
                        : f
                )
            );

            // Remove from uploading set on error
            setUploadingFiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(fileName);
                return newSet;
            });
        }
    };


    const startUpload = async () => {
        if (uploadFiles.length === 0) return;

        setIsUploading(true);

        // Upload files sequentially to avoid overwhelming the server
        for (const file of uploadFiles) {
            if (file.status === 'pending') {
                await uploadFile(file);
            }
        }

        setIsUploading(false);

        // Collect successful uploads for the modal
        const successfulUploads = uploadFiles.filter(f => f.status === 'completed');
        if (successfulUploads.length > 0) {
            addToast('success', 'Upload Completed', `✅ Upload completed successfully!`);
        }
    };

    const clearCompleted = () => {
        setUploadFiles(prev => prev.filter(f => f.status !== 'completed'));
    };

    const handleConfirmUpload = () => {
        if (pendingFiles) {
            handleFileSelect(pendingFiles);
            addToast('success', 'Upload Started', `Upload started for ${pendingFiles.length} files from ${folderName}.`);
            setIsDialogOpen(false);
            setPendingFiles(null);
            setFolderName('');
        }
    };

    const handleCancelUpload = () => {
        addToast('info', 'Upload Cancelled', 'Folder upload was cancelled.');
        setIsDialogOpen(false);
        setPendingFiles(null);
        setFolderName('');
    };

    // Calculate total size for the dialog
    const getTotalSize = () => {
        if (!pendingFiles) return '0 Bytes';
        let totalSize = 0;
        for (let i = 0; i < pendingFiles.length; i++) {
            totalSize += pendingFiles[i].size;
        }
        return formatFileSize(totalSize);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Upload Files</h1>
                <p className="text-muted-foreground">
                    Upload and analyze your files with advanced AI processing
                </p>
            </div>

            {/* Upload Area */}
            <Card>
                <CardContent className="p-6">
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver
                            ? 'border-primary bg-primary/5'
                            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                            }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Drop files here or click to browse</h3>
                        <p className="text-muted-foreground mb-4">
                            Support for images, videos, documents, and more
                        </p>
                        <div className="flex gap-2 justify-center">
                            <Button
                                variant="outline"
                                onClick={() => document.getElementById('file-input')?.click()}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                Select Files
                            </Button>
                            <Button variant="outline" onClick={handleFolderSelect}>
                                <FolderOpen className="mr-2 h-4 w-4" />
                                Select Folder
                            </Button>
                            <Button variant="outline" onClick={() => router.push('/json-editor')}>
                                <Code className="mr-2 h-4 w-4" />
                                Write JSON
                            </Button>
                        </div>
                        <input
                            id="file-input"
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFileSelect(e.target.files)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* File List */}
            <AnimatePresence>
                {uploadFiles.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Files to Upload</CardTitle>
                                    <CardDescription>
                                        {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected
                                    </CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={clearCompleted}
                                        disabled={!uploadFiles.some(f => f.status === 'completed')}
                                    >
                                        Clear Completed
                                    </Button>
                                    <Button
                                        variant="default"
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => setShowAnalysis(true)}
                                        disabled={!uploadFiles.some(f => f.status === "completed")}
                                    >
                                        Analyze
                                    </Button>
                                    <Button
                                        onClick={startUpload}
                                        disabled={isUploading || !uploadFiles.some(f => f.status === 'pending')}
                                    >
                                        {isUploading ? 'Uploading...' : 'Start Upload'}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>File</TableHead>
                                            <TableHead>Size</TableHead>
                                            <TableHead>Progress</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {uploadFiles.map((uploadFile) => {
                                            const FileIcon = getFileIcon(uploadFile.file.type);
                                            return (
                                                <TableRow key={uploadFile.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <FileIcon className="h-4 w-4 text-muted-foreground" />
                                                            <span className="font-medium truncate max-w-xs">
                                                                {uploadFile.file.name}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{formatFileSize(uploadFile.file.size)}</TableCell>
                                                    <TableCell>
                                                        <div className="w-24">
                                                            <Progress value={uploadFile.progress} className="h-2" />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={
                                                                uploadFile.status === 'completed' ? 'default' :
                                                                    uploadFile.status === 'error' ? 'destructive' :
                                                                        uploadFile.status === 'uploading' ? 'secondary' : 'outline'
                                                            }
                                                        >
                                                            {uploadFile.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                                            {uploadFile.status === 'error' && <AlertCircle className="w-3 h-3 mr-1" />}
                                                            {uploadFile.status === 'uploading' ? 'Uploading' :
                                                                uploadFile.status === 'completed' ? 'Completed' :
                                                                    uploadFile.status === 'error' ? 'Error' : 'Pending'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeFile(uploadFile.id)}
                                                            disabled={uploadFile.status === 'uploading'}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Upload Stats */}
            {uploadFiles.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-2xl font-bold text-primary">
                                {uploadFiles.filter(f => f.status === 'completed').length}
                            </div>
                            <p className="text-sm text-muted-foreground">Completed</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-2xl font-bold text-orange-500">
                                {uploadFiles.filter(f => f.status === 'uploading').length}
                            </div>
                            <p className="text-sm text-muted-foreground">Uploading</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-2xl font-bold text-red-500">
                                {uploadFiles.filter(f => f.status === 'error').length}
                            </div>
                            <p className="text-sm text-muted-foreground">Failed</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Confirmation Dialog */}
            <ConfirmUploadDialog
                isOpen={isDialogOpen}
                fileCount={pendingFiles?.length || 0}
                folderName={folderName}
                totalSize={getTotalSize()}
                onConfirm={handleConfirmUpload}
                onCancel={handleCancelUpload}
            />

            {/* Upload Analysis Modal */}
            {showAnalysis && (
                <UploadAnalysisModal
                    isOpen={showAnalysis}
                    onClose={() => setShowAnalysis(false)}
                    uploadedFiles={uploadFiles.filter(f => f.status === "completed")}
                />
            )}
        </div>
    );
}

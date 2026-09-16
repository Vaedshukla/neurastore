"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { FileText, Image, Video, Music, File, Download, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface FilePreviewProps {
    fileId?: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
    category?: string;
    confidence?: number;
    className?: string;
}

const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.startsWith('video/')) return Video;
    if (mimeType.startsWith('audio/')) return Music;
    if (mimeType === 'application/pdf') return FileText;
    return File;
};

export default function FilePreview({
    fileId,
    fileUrl,
    fileName,
    mimeType,
    size,
    category,
    confidence,
    className = ""
}: FilePreviewProps) {
    const [previewMode, setPreviewMode] = useState<'preview' | 'details'>('preview');
    const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
    const [pdfPageNumber, setPdfPageNumber] = useState(1);
    const [textContent, setTextContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const FileIcon = getFileIcon(mimeType);

    // Load text content for text files
    useEffect(() => {
        if (mimeType.startsWith('text/') && previewMode === 'preview') {
            setIsLoading(true);
            fetch(fileUrl)
                .then(response => response.text())
                .then(text => {
                    setTextContent(text);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error('Failed to load text content:', err);
                    setError('Failed to load text content');
                    setIsLoading(false);
                });
        }
    }, [fileUrl, mimeType, previewMode]);

    const onPdfLoadSuccess = ({ numPages }: { numPages: number }) => {
        setPdfNumPages(numPages);
    };

    const renderPreview = () => {
        if (error) {
            return (
                <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
                    <div className="text-center">
                        <FileIcon className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                </div>
            );
        }

        if (mimeType.startsWith('image/')) {
            return (
                <div className="relative">
                    <img
                        src={fileUrl}
                        alt={fileName}
                        className="max-w-full max-h-64 object-contain rounded-lg bg-muted"
                        onError={() => setError('Failed to load image')}
                    />
                </div>
            );
        }

        if (mimeType === 'application/pdf') {
            return (
                <div className="bg-white rounded-lg border">
                    <Document
                        file={fileUrl}
                        onLoadSuccess={onPdfLoadSuccess}
                        onLoadError={() => setError('Failed to load PDF')}
                        loading={
                            <div className="flex items-center justify-center h-64">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="ml-2">Loading PDF...</span>
                            </div>
                        }
                    >
                        <Page
                            pageNumber={pdfPageNumber}
                            width={300}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                        />
                    </Document>
                    {pdfNumPages && pdfNumPages > 1 && (
                        <div className="flex items-center justify-between p-2 bg-muted">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPdfPageNumber(Math.max(1, pdfPageNumber - 1))}
                                disabled={pdfPageNumber <= 1}
                            >
                                Previous
                            </Button>
                            <span className="text-sm">
                                Page {pdfPageNumber} of {pdfNumPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPdfPageNumber(Math.min(pdfNumPages, pdfPageNumber + 1))}
                                disabled={pdfPageNumber >= pdfNumPages}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            );
        }

        if (mimeType.startsWith('video/')) {
            return (
                <video
                    controls
                    className="max-w-full max-h-64 rounded-lg bg-muted"
                    preload="metadata"
                >
                    <source src={fileUrl} type={mimeType} />
                    Your browser does not support the video tag.
                </video>
            );
        }

        if (mimeType.startsWith('audio/')) {
            return (
                <div className="bg-muted rounded-lg p-4">
                    <audio controls className="w-full">
                        <source src={fileUrl} type={mimeType} />
                        Your browser does not support the audio tag.
                    </audio>
                </div>
            );
        }

        if (mimeType.startsWith('text/')) {
            if (isLoading) {
                return (
                    <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>Loading text content...</span>
                    </div>
                );
            }

            return (
                <div className="bg-muted rounded-lg p-4 max-h-64 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                        {textContent || 'No content available'}
                    </pre>
                </div>
            );
        }

        // Default fallback for unsupported file types
        return (
            <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
                <div className="text-center">
                    <FileIcon className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Preview not available</p>
                    <p className="text-xs text-muted-foreground mt-1">{mimeType}</p>
                </div>
            </div>
        );
    };

    const renderDetails = () => (
        <div className="space-y-4">
            <div className="space-y-3 text-sm">
                <div>
                    <span className="font-medium text-muted-foreground">Filename:</span>
                    <p className="mt-1 break-all">{fileName}</p>
                </div>
                <div>
                    <span className="font-medium text-muted-foreground">File size:</span>
                    <p className="mt-1">{formatFileSize(size)}</p>
                </div>
                <div>
                    <span className="font-medium text-muted-foreground">MIME type:</span>
                    <p className="mt-1">{mimeType}</p>
                </div>
                <div>
                    <span className="font-medium text-muted-foreground">Category:</span>
                    <div className="mt-1">
                        {category ? (
                            <Badge variant="secondary">
                                {category}
                            </Badge>
                        ) : (
                            <span className="text-muted-foreground">Unclassified</span>
                        )}
                    </div>
                </div>
                <div>
                    <span className="font-medium text-muted-foreground">Uploaded date/time:</span>
                    <p className="mt-1">{new Date().toLocaleString()}</p>
                </div>
            </div>
        </div>
    );

    return (
        <Card className={className}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                        <h3 className="font-medium truncate max-w-xs" title={fileName}>
                            {fileName}
                        </h3>
                    </div>
                    <div className="flex gap-1 items-center">
                        {(mimeType.startsWith('text/') || mimeType === 'application/pdf' || fileName.endsWith('.md') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-950 text-xs flex items-center gap-1"
                                asChild
                            >
                                <Link href={`/notebook?fileId=${fileId || fileName}`}>
                                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                                    Ask Neura
                                </Link>
                            </Button>
                        )}
                        <Button
                            variant={previewMode === 'preview' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPreviewMode('preview')}
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={previewMode === 'details' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPreviewMode('details')}
                        >
                            <FileText className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {previewMode === 'preview' ? renderPreview() : renderDetails()}
            </CardContent>
        </Card>
    );
}

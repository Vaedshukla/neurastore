"use client";
import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function FileUpload({ onUpload }: { onUpload: (files: any[]) => void }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState(0);
    const { addToast } = useToast();

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setUploading(true);
        setError("");
        setProgress(10);
        const uploadedData: any[] = [];

        try {
            for (let i = 0; i < acceptedFiles.length; i++) {
                const file = acceptedFiles[i];
                const formData = new FormData();
                formData.append("file", file);

                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || `Failed to upload ${file.name}`);
                }

                uploadedData.push(data.metadata || {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    public_url: data.publicUrl,
                    category: data.category
                });

                setProgress(Math.round(((i + 1) / acceptedFiles.length) * 100));
            }

            addToast("success", "Upload Complete", `Successfully uploaded ${acceptedFiles.length} file(s).`);
            onUpload(uploadedData);
        } catch (err: any) {
            console.error("Upload error:", err);
            setError(err.message || "Upload failed. Please try again.");
            addToast("error", "Upload Failed", err.message || "Upload failed.");
        } finally {
            setUploading(false);
            setProgress(0);
        }
    }, [onUpload, addToast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

    return (
        <div
            {...getRootProps()}
            className={`border-2 border-dashed p-10 text-center rounded-xl cursor-pointer transition-all duration-200 ${
                isDragActive
                    ? "border-cyan-400 bg-cyan-500/10"
                    : "border-gray-700 bg-gray-900/60 hover:border-cyan-500/50 hover:bg-gray-900"
            }`}
        >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-3">
                <div className="p-3 bg-cyan-500/10 rounded-full border border-cyan-500/20 text-cyan-400">
                    {uploading ? (
                        <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                        <Upload className="w-8 h-8" />
                    )}
                </div>

                {uploading ? (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-cyan-300">Uploading & Analyzing Files... {progress}%</p>
                        <div className="w-48 bg-gray-800 rounded-full h-1.5 mx-auto overflow-hidden">
                            <div
                                className="bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                ) : isDragActive ? (
                    <p className="text-md font-medium text-cyan-400">Drop files here to upload</p>
                ) : (
                    <div className="space-y-1">
                        <p className="text-md font-medium text-gray-200">
                            Drag & drop files here, or <span className="text-cyan-400 underline">browse</span>
                        </p>
                        <p className="text-xs text-gray-400">
                            Supports PDF, DOCX, TXT, MD, Images, Videos, Audio, Archives, & JSON (Up to 50MB)
                        </p>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 pt-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

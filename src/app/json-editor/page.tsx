"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

export default function JSONEditorPage() {
    const [jsonText, setJsonText] = useState("");
    const [isValid, setIsValid] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();
    const { addToast } = useToast();

    const validateJSON = (text: string) => {
        if (!text.trim()) {
            setIsValid(true);
            return;
        }
        try {
            JSON.parse(text);
            setIsValid(true);
        } catch {
            setIsValid(false);
        }
    };

    const handleTextChange = (value: string) => {
        setJsonText(value);
        validateJSON(value);
    };

    const handleStore = async () => {
        if (!jsonText.trim()) {
            addToast("error", "Error", "Please enter some JSON text.");
            return;
        }

        if (!isValid) {
            addToast("error", "Invalid JSON", "Please correct the JSON formatting before storing.");
            return;
        }

        setIsProcessing(true);

        try {
            const response = await fetch("/api/store-manual-json", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ jsonText }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to store JSON");
            }

            addToast("success", "Success", "JSON stored intelligently!");

            // Navigate to JSON Visualizer
            router.push(`/dashboard?fileId=${result.fileId}`);

        } catch (error: any) {
            console.error("Store error:", error);
            addToast("error", "Error", error.message || "Failed to store JSON. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-white">JSON Editor</h1>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Enter JSON Data
                    </label>
                    <Textarea
                        value={jsonText}
                        onChange={(e) => handleTextChange(e.target.value)}
                        placeholder="Paste or enter your JSON data structure here..."
                        className={`min-h-[400px] font-mono text-sm ${!isValid ? "border-red-500" : ""
                            }`}
                        disabled={isProcessing}
                    />
                    {!isValid && (
                        <p className="text-red-400 text-sm mt-1">
                            Invalid JSON — please correct formatting.
                        </p>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button
                        onClick={handleStore}
                        disabled={!isValid || isProcessing || !jsonText.trim()}
                        className="px-6"
                    >
                        {isProcessing ? "Storing..." : "Store Intelligently"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

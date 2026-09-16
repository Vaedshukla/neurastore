"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import DashboardCharts from "@/components/DashboardCharts";
import JSONVisualizer from "@/components/JSONVisualizer";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

function DashboardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [files, setFiles] = useState<any[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [sortBy, setSortBy] = useState("recent");
    const [showJSON, setShowJSON] = useState(false);
    const [jsonData, setJsonData] = useState(null);
    const [selectedFile, setSelectedFile] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;
        async function fetchDashboardData() {
            try {
                const res = await fetch("/api/file-metadata");
                const json = await res.json();
                const data = json.files || [];
                if (isMounted) {
                    setFiles(data);
                    setFilteredFiles(data);
                }
            } catch (err: any) {
                console.error("Dashboard fetch error:", err);
                setError(err.message);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchDashboardData();
        return () => { isMounted = false };
    }, []);

    // Listen for history clear events
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'neurastore-history-cleared' && e.newValue) {
                // History was cleared, refresh the data
                setLoading(true);
                setError(null);
                // Re-fetch data
                const fetchData = async () => {
                    try {
                        const res = await fetch("/api/file-metadata");
                        const json = await res.json();
                        const data = json.files || [];
                        setFiles(data);
                        setFilteredFiles(data);
                    } catch (err: any) {
                        console.error("Dashboard fetch error:", err);
                        setError(err.message);
                    } finally {
                        setLoading(false);
                    }
                };
                fetchData();
            }
        };

        // Also check on component mount in case history was cleared in another tab
        const checkHistoryCleared = () => {
            const clearedTime = localStorage.getItem('neurastore-history-cleared');
            if (clearedTime) {
                // Clear the flag and refresh data
                localStorage.removeItem('neurastore-history-cleared');
                setLoading(true);
                setError(null);
                // Re-fetch data
                const fetchData = async () => {
                    try {
                        const res = await fetch("/api/file-metadata");
                        const json = await res.json();
                        const data = json.files || [];
                        setFiles(data);
                        setFilteredFiles(data);
                    } catch (err: any) {
                        console.error("Dashboard fetch error:", err);
                        setError(err.message);
                    } finally {
                        setLoading(false);
                    }
                };
                fetchData();
            }
        };

        // Check immediately and set up listener
        checkHistoryCleared();
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    // Handle filter
    function applyFilters(category: string, sort: string) {
        let result = [...files];
        if (category !== "All") {
            result = result.filter(f => f.category === category);
        }
        if (sort === "recent") {
            result.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
        } else if (sort === "oldest") {
            result.sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
        } else if (sort === "size") {
            result.sort((a, b) => (b.size || 0) - (a.size || 0));
        }
        setFilteredFiles(result);
    }

    useEffect(() => {
        applyFilters(selectedCategory, sortBy);
    }, [selectedCategory, sortBy, files]);

    // Handle fileId query param for direct JSON visualization
    useEffect(() => {
        const fileId = searchParams.get('fileId');
        if (fileId && files.length > 0) {
            const file = files.find(f => f.id.toString() === fileId);
            if (file) {
                handleAnalyzeJSON(file);
            }
        }
    }, [searchParams, files]);

    async function handleAnalyzeJSON(file: any) {
        try {
            let data;
            if (file.raw_json) {
                // For manual JSON, parse from raw_json
                data = JSON.parse(file.raw_json);
            } else if (file.public_url) {
                // For uploaded files, fetch from public_url
                const res = await fetch(file.public_url);
                data = await res.json();
            } else {
                throw new Error("No data source available");
            }
            setJsonData(data);
            setSelectedFile(file);
            setShowJSON(true);
        } catch (err) {
            console.error("Error analyzing JSON:", err);
        }
    }

    if (loading) return <p className="text-gray-400 text-center mt-10">Loading dashboard data...</p>;
    if (error) return <p className="text-red-400 text-center mt-10">Error: {error}</p>;
    if (!files.length) return <p className="text-gray-400 text-center mt-10">No files found in Supabase.</p>;

    const categories = Array.from(new Set(files.map(f => f.category))).filter(Boolean);

    return (
        <div className="p-6 space-y-8">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
                <Button onClick={() => router.push('/json-editor')} className="bg-blue-600 hover:bg-blue-700">
                    Write JSON
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
                <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-gray-800 text-white px-3 py-2 rounded-md border border-gray-600"
                >
                    <option value="All">All Categories</option>
                    {categories.map(cat => <option key={cat}>{cat}</option>)}
                </select>

                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-gray-800 text-white px-3 py-2 rounded-md border border-gray-600"
                >
                    <option value="recent">Most Recent</option>
                    <option value="oldest">Oldest</option>
                    <option value="size">Largest</option>
                </select>
            </div>

            {/* Charts */}
            <DashboardCharts files={filteredFiles} onAnalyzeJSON={handleAnalyzeJSON} />

            {showJSON && selectedFile && <JSONVisualizer data={jsonData} fileName={selectedFile.name} fileId={selectedFile.id.toString()} onClose={() => setShowJSON(false)} />}
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="p-6 text-white">Loading dashboard...</div>}>
            <DashboardContent />
        </Suspense>
    );
}

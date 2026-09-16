"use client";
import React, { useCallback, useEffect, useState } from "react";
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Node,
    Edge
} from "reactflow";
import "reactflow/dist/style.css";
import ObjectView from "./ObjectView";
import IntelligenceSidebar from "./IntelligenceSidebar";
import { JSONAnalyzer, JSONAnalysisResult, MultiFileComparison } from "@/utils/jsonAnalyzer";

export default function JSONVisualizer({ data, onClose, fileName, fileId, allFiles }: any) {
    const [view, setView] = useState<"raw" | "graph" | "object">("raw");
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [analysis, setAnalysis] = useState<JSONAnalysisResult | null>(null);
    const [comparison, setComparison] = useState<MultiFileComparison | null>(null);
    const [metadata, setMetadata] = useState<{ tags: string[]; comments: string }>({
        tags: [],
        comments: ''
    });

    const buildGraph = useCallback((json: any, parentId: string | null = null, depth = 0) => {
        if (!json || typeof json !== "object") return { nodes: [], edges: [] };
        const result: Node[] = [];
        const edgeList: Edge[] = [];
        let index = 0;

        Object.entries(json).forEach(([key, value]) => {
            const id = parentId ? `${parentId}-${key}` : key;
            result.push({
                id,
                data: { label: `${key}: ${typeof value === "object" ? "" : value}` },
                position: { x: depth * 250, y: index * 100 },
                style: {
                    background: "#1f2937",
                    color: "#fff",
                    border: "1px solid #4b5563",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 12,
                    width: 220
                }
            });
            if (parentId) {
                edgeList.push({
                    id: `${parentId}-${id}`,
                    source: parentId,
                    target: id,
                    type: "smoothstep"
                });
            }
            if (typeof value === "object") {
                const childGraph = buildGraph(value, id, depth + 1);
                result.push(...childGraph.nodes);
                edgeList.push(...childGraph.edges);
            }
            index++;
        });
        return { nodes: result, edges: edgeList };
    }, []);

    useEffect(() => {
        try {
            const graph = buildGraph(data);
            setNodes(graph.nodes);
            setEdges(graph.edges);
        } catch (err) {
            console.error("Error rendering flow:", err);
        }
    }, [data, buildGraph]);

    // Analyze JSON structure
    useEffect(() => {
        if (data) {
            const jsonAnalysis = JSONAnalyzer.analyzeStructure(data);
            setAnalysis(jsonAnalysis);

            // Compare with other files if available
            if (allFiles && allFiles.length > 0) {
                const otherAnalyses: Record<string, JSONAnalysisResult> = {};
                allFiles.forEach((file: any) => {
                    if (file.name !== fileName && file.content) {
                        try {
                            const fileData = JSON.parse(file.content);
                            otherAnalyses[file.name] = JSONAnalyzer.analyzeStructure(fileData);
                        } catch (e) {
                            // Skip invalid JSON files
                        }
                    }
                });
                const fileComparison = JSONAnalyzer.compareWithOtherFiles(jsonAnalysis, otherAnalyses);
                setComparison(fileComparison);
            }
        }
    }, [data, fileName, allFiles]);

    const onConnect = useCallback(
        (params: any) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-[#0B1220] rounded-lg w-[95%] h-[95%] relative flex flex-col lg:flex-row">
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex justify-between items-center mt-6 px-4">
                        <h2 className="text-lg font-semibold text-gray-200">
                            JSON Visualizer
                            {fileName && <span className="text-gray-400 ml-2">— {fileName}</span>}
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-200">✕</button>
                    </div>

                    <div className="flex gap-2 mt-6 px-4">
                        <button
                            onClick={() => setView("raw")}
                            className={`px-4 py-2 rounded-md transition ${view === "raw"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                }`}
                        >
                            Raw JSON
                        </button>
                        <button
                            onClick={() => setView("graph")}
                            className={`px-4 py-2 rounded-md transition ${view === "graph"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                }`}
                        >
                            Graph View
                        </button>
                        <button
                            onClick={() => setView("object")}
                            className={`px-4 py-2 rounded-md transition ${view === "object"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                }`}
                        >
                            Object View
                        </button>
                    </div>

                    <div className="flex-1 rounded-lg border border-gray-700 overflow-hidden mx-4 mb-4">
                        {view === "raw" && (
                            <div className="p-4 h-full overflow-y-auto bg-gray-800">
                                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                                    {JSON.stringify(data, null, 2)}
                                </pre>
                            </div>
                        )}
                        {view === "graph" && (
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                fitView
                            >
                                <MiniMap />
                                <Controls />
                                <Background gap={16} color="#2d2d2d" />
                            </ReactFlow>
                        )}
                        {view === "object" && <ObjectView jsonData={data} onDataChange={(newData) => {
                            // Update the data in the visualizer
                            // This will sync across all views
                        }} />}
                    </div>
                </div>

                {analysis && (
                    <IntelligenceSidebar
                        analysis={analysis}
                        comparison={comparison || undefined}
                        fileName={fileName}
                        fileId={fileId}
                        jsonType={analysis.classification.toLowerCase().replace(' json', '')}
                        jsonData={data}
                        allAnalyses={allFiles ? allFiles.reduce((acc: Record<string, JSONAnalysisResult>, file: any) => {
                            if (file.name !== fileName && file.content) {
                                try {
                                    const fileData = JSON.parse(file.content);
                                    acc[file.name] = JSONAnalyzer.analyzeStructure(fileData);
                                } catch (e) {
                                    // Skip invalid JSON
                                }
                            }
                            return acc;
                        }, {} as Record<string, JSONAnalysisResult>) : undefined}
                    />
                )}
            </div>
        </div>
    );
}

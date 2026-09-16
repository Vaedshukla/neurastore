"use client";

import { useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface SchemaGraphProps {
    data: any;
}

interface GraphNode extends Node {
    data: {
        label: string;
        type: string;
        value?: any;
    };
}

const getNodeType = (value: any): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
};

const getNodeColor = (type: string): string => {
    switch (type) {
        case 'object':
            return '#3b82f6'; // blue
        case 'array':
            return '#f59e0b'; // orange
        case 'string':
        case 'number':
        case 'boolean':
        case 'null':
            return '#6b7280'; // gray
        default:
            return '#6b7280';
    }
};

const createNodesAndEdges = (data: any, parentId: string = 'root', x: number = 0, y: number = 0): { nodes: GraphNode[], edges: Edge[] } => {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];
    const currentY = y;

    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) {
            // Handle arrays
            const arrayNode: GraphNode = {
                id: parentId,
                type: 'default',
                position: { x, y: currentY },
                data: {
                    label: `Array[${data.length}]`,
                    type: 'array'
                },
                style: {
                    background: getNodeColor('array'),
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                },
            };
            nodes.push(arrayNode);

            // Create nodes for array elements (limit to first 5 for performance)
            data.slice(0, 5).forEach((item, index) => {
                const itemId = `${parentId}.[${index}]`;
                const itemX = x + 200;
                const itemY = currentY + (index * 80);

                const { nodes: childNodes, edges: childEdges } = createNodesAndEdges(
                    item,
                    itemId,
                    itemX,
                    itemY
                );

                nodes.push(...childNodes);
                edges.push(...childEdges);

                // Connect array to item
                edges.push({
                    id: `edge-${parentId}-${itemId}`,
                    source: parentId,
                    target: itemId,
                    type: 'smoothstep',
                    style: { stroke: '#94a3b8', strokeWidth: 2 },
                });
            });

            if (data.length > 5) {
                const moreNode: GraphNode = {
                    id: `${parentId}.more`,
                    type: 'default',
                    position: { x: x + 200, y: currentY + (5 * 80) },
                    data: {
                        label: `... and ${data.length - 5} more`,
                        type: 'null'
                    },
                    style: {
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '10px',
                    },
                };
                nodes.push(moreNode);
                edges.push({
                    id: `edge-${parentId}-${moreNode.id}`,
                    source: parentId,
                    target: moreNode.id,
                    type: 'smoothstep',
                    style: { stroke: '#94a3b8', strokeWidth: 2 },
                });
            }
        } else {
            // Handle objects
            const objectNode: GraphNode = {
                id: parentId,
                type: 'default',
                position: { x, y: currentY },
                data: {
                    label: `Object{${Object.keys(data).length}}`,
                    type: 'object'
                },
                style: {
                    background: getNodeColor('object'),
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                },
            };
            nodes.push(objectNode);

            // Create nodes for object properties
            Object.entries(data).forEach(([key, value], index) => {
                const propId = `${parentId}.${key}`;
                const propX = x + 250;
                const propY = currentY + (index * 100);

                const { nodes: childNodes, edges: childEdges } = createNodesAndEdges(
                    value,
                    propId,
                    propX,
                    propY
                );

                nodes.push(...childNodes);
                edges.push(...childEdges);

                // Connect object to property
                edges.push({
                    id: `edge-${parentId}-${propId}`,
                    source: parentId,
                    target: propId,
                    type: 'smoothstep',
                    style: { stroke: '#94a3b8', strokeWidth: 2 },
                    label: key,
                    labelStyle: { fontSize: '10px', fill: '#64748b' },
                    labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
                });
            });
        }
    } else {
        // Handle primitive values
        const type = getNodeType(data);
        const primitiveNode: GraphNode = {
            id: parentId,
            type: 'default',
            position: { x, y: currentY },
            data: {
                label: typeof data === 'string' ? `"${data}"` : String(data),
                type,
                value: data
            },
            style: {
                background: getNodeColor(type),
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                maxWidth: '150px',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
            },
        };
        nodes.push(primitiveNode);
    }

    return { nodes, edges };
};

export default function SchemaGraph({ data }: SchemaGraphProps) {
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        if (!data) return { nodes: [], edges: [] };
        return createNodesAndEdges(data, 'root', 50, 50);
    }, [data]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Update nodes and edges when data changes
    useMemo(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const onConnect = useCallback((params: any) => {
        // We don't allow manual connections in this read-only graph
    }, []);

    if (!data) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No data to visualize
            </div>
        );
    }

    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                attributionPosition="bottom-left"
                className="bg-background"
            >
                <Background color="#e2e8f0" gap={20} />
                <Controls
                    showZoom={false}
                    showFitView={false}
                    showInteractive={false}
                    className="bg-background border border-border"
                />
                <MiniMap
                    nodeColor={(node) => getNodeColor((node as GraphNode).data.type)}
                    className="bg-background border border-border"
                />
            </ReactFlow>
        </div>
    );
}

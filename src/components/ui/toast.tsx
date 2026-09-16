"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    description?: string;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (type: ToastType, title: string, description?: string) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        // Return a no-op function for SSR or when context is not available
        return {
            toasts: [],
            addToast: () => { },
            removeToast: () => { },
        };
    }
    return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((type: ToastType, title: string, description?: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        const toast: Toast = { id, type, title, description };
        setToasts((prev) => [...prev, toast]);

        // Auto remove after 3 seconds
        setTimeout(() => {
            removeToast(id);
        }, 3000);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <ToastContainer />
        </ToastContext.Provider>
    );
}

function ToastContainer() {
    const { toasts, removeToast } = useToast();

    const getIcon = (type: ToastType) => {
        switch (type) {
            case "success":
                return <CheckCircle className="h-5 w-5 text-green-500" />;
            case "error":
                return <AlertCircle className="h-5 w-5 text-red-500" />;
            case "warning":
                return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            case "info":
                return <Info className="h-5 w-5 text-blue-500" />;
        }
    };

    const getBorderColor = (type: ToastType) => {
        switch (type) {
            case "success":
                return "border-green-500";
            case "error":
                return "border-red-500";
            case "warning":
                return "border-yellow-500";
            case "info":
                return "border-blue-500";
        }
    };

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 300 }}
                        className={`bg-card border ${getBorderColor(toast.type)} rounded-lg shadow-lg p-4 min-w-80 max-w-md`}
                    >
                        <div className="flex items-start gap-3">
                            {getIcon(toast.type)}
                            <div className="flex-1">
                                <h4 className="font-medium text-sm">{toast.title}</h4>
                                {toast.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{toast.description}</p>
                                )}
                            </div>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

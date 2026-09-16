"use client";

import { useEffect, useState } from "react";
import { ToastProvider } from "@/components/ui/toast";
import "../lib/i18n";

export function ClientProviders({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    if (!mounted) {
        return <>{children}</>;
    }

    return <ToastProvider>{children}</ToastProvider>;
}

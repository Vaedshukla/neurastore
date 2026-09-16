"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Upload,
    BarChart3,
    History,
    Settings,
    User,
    FileText,
    Search,
    BookOpen,
} from "lucide-react";

const navigation = [
    { name: "Upload", href: "/upload", icon: Upload },
    { name: "Search", href: "/search", icon: Search },
    { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
    { name: "NeuraNotebook", href: "/notebook", icon: BookOpen },
    { name: "JSON Editor", href: "/json-editor", icon: FileText },
    { name: "History", href: "/history", icon: History },
    { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
    className?: string;
}

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname();

    return (
        <div className={cn("pb-12", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <div className="flex items-center mb-2">
                        <FileText className="mr-2 h-6 w-6" />
                        <h2 className="text-lg font-semibold tracking-tight">
                            NeuraStore+
                        </h2>
                    </div>
                    <div className="space-y-1">
                        {navigation.map((item) => (
                            <Button
                                key={item.name}
                                variant={pathname === item.href ? "secondary" : "ghost"}
                                className="w-full justify-start"
                                asChild
                            >
                                <Link href={item.href}>
                                    <item.icon className="mr-2 h-4 w-4" />
                                    {item.name}
                                </Link>
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

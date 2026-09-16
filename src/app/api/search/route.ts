import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        if (!query || query.trim().length < 2) {
            return NextResponse.json(
                { error: 'Search query must be at least 2 characters long' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const isPlaceholder = !supabaseUrl || supabaseUrl.includes('your-supabase') || supabaseUrl.includes('placeholder');

        let searchResults: any[] = [];
        let totalCount = 0;

        if (!isPlaceholder) {
            try {
                const searchTerm = `%${query.trim()}%`;
                const { data: files, error: searchError, count } = await supabase
                    .from('files_metadata')
                    .select('*', { count: 'exact' })
                    .or(`name.ilike.${searchTerm},category.ilike.${searchTerm}`)
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);

                if (!searchError && files) {
                    searchResults = files;
                    totalCount = count || files.length;
                }
            } catch (err) {
                console.warn('Supabase search failed, checking local metadata:', err);
            }
        }

        // Local metadata search fallback
        if (searchResults.length === 0) {
            try {
                const metaPath = path.join(process.cwd(), 'public', 'uploads', 'metadata.json');
                if (fs.existsSync(metaPath)) {
                    const localRecords: any[] = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                    const qLower = query.trim().toLowerCase();
                    const filtered = localRecords.filter((r: any) =>
                        (r.name && r.name.toLowerCase().includes(qLower)) ||
                        (r.category && r.category.toLowerCase().includes(qLower)) ||
                        (r.mime_type && r.mime_type.toLowerCase().includes(qLower))
                    );
                    totalCount = filtered.length;
                    searchResults = filtered.slice(offset, offset + limit);
                }
            } catch (localErr) {
                console.error('Local search error:', localErr);
            }
        }

        return NextResponse.json({
            success: true,
            query: query.trim(),
            results: searchResults,
            total: totalCount,
            limit,
            offset,
            hasMore: totalCount > offset + searchResults.length
        });

    } catch (error: any) {
        console.error('Search API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const { query, filters, limit = 50, offset = 0 } = await request.json();

        if (!query || query.trim().length < 2) {
            return NextResponse.json(
                { error: 'Search query must be at least 2 characters long' },
                { status: 400 }
            );
        }

        // Build search query with filters
        let searchQuery = supabase
            .from('files_metadata')
            .select('*', { count: 'exact' });

        // Add text search
        const searchTerm = `%${query.trim()}%`;
        searchQuery = searchQuery.or(`name.ilike.${searchTerm},category.ilike.${searchTerm}`);

        // Apply filters if provided
        if (filters) {
            if (filters.mimeType) {
                if (Array.isArray(filters.mimeType)) {
                    searchQuery = searchQuery.in('mime_type', filters.mimeType);
                } else {
                    searchQuery = searchQuery.ilike('mime_type', `%${filters.mimeType}%`);
                }
            }

            if (filters.category) {
                if (Array.isArray(filters.category)) {
                    searchQuery = searchQuery.in('category', filters.category);
                } else {
                    searchQuery = searchQuery.ilike('category', `%${filters.category}%`);
                }
            }

            if (filters.sizeMin !== undefined) {
                searchQuery = searchQuery.gte('size', filters.sizeMin);
            }

            if (filters.sizeMax !== undefined) {
                searchQuery = searchQuery.lte('size', filters.sizeMax);
            }

            if (filters.dateFrom) {
                searchQuery = searchQuery.gte('created_at', filters.dateFrom);
            }

            if (filters.dateTo) {
                searchQuery = searchQuery.lte('created_at', filters.dateTo);
            }
        }

        // Execute search
        const { data: files, error: searchError, count } = await searchQuery
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (searchError) {
            console.error('Advanced search error:', searchError);
            return NextResponse.json(
                { error: 'Search failed', details: searchError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            query: query.trim(),
            filters,
            results: files || [],
            total: count || 0,
            limit,
            offset,
            hasMore: (count || 0) > offset + (files?.length || 0)
        });

    } catch (error: any) {
        console.error('Advanced search API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

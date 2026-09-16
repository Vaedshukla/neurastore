import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabaseClient';
import fs from 'fs';
import path from 'path';

function getLocalMetadata() {
    try {
        const metaPath = path.join(process.cwd(), 'public', 'uploads', 'metadata.json');
        if (fs.existsSync(metaPath)) {
            const content = fs.readFileSync(metaPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (err) {
        console.error('Error reading local metadata:', err);
    }
    return [];
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const isPlaceholder = !supabaseUrl || supabaseUrl.includes('your-supabase') || supabaseUrl.includes('placeholder');

        let data: any = null;

        if (!isPlaceholder) {
            try {
                if (fileId) {
                    const { data: singleData, error } = await supabase
                        .from('files_metadata')
                        .select('*')
                        .eq('id', fileId)
                        .single();

                    if (!error && singleData) {
                        data = singleData;
                    }
                } else {
                    const { data: listData, error } = await supabase
                        .from('files_metadata')
                        .select('*')
                        .order('uploaded_at', { ascending: false });

                    if (!error && listData) {
                        data = listData;
                    }
                }
            } catch (err) {
                console.warn('Supabase metadata GET fetch failed, falling back to local storage:', err);
            }
        }

        // Fallback to local disk metadata
        if (!data) {
            const localRecords = getLocalMetadata();
            if (fileId) {
                data = localRecords.find((r: any) => r.id === fileId || r.name === fileId) || null;
            } else {
                data = localRecords;
            }
        }

        if (fileId && !data) {
            return NextResponse.json(
                { error: 'File not found', code: 'FILE_NOT_FOUND' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            files: Array.isArray(data) ? data : undefined,
            metadata: !Array.isArray(data) ? data : undefined
        });

    } catch (error: unknown) {
        console.error('File metadata API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { fileId, updates } = body;

        if (!fileId) {
            return NextResponse.json(
                { error: 'fileId is required', code: 'MISSING_FILE_ID' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const isPlaceholder = !supabaseUrl || supabaseUrl.includes('your-supabase') || supabaseUrl.includes('placeholder');

        if (!isPlaceholder && supabaseAdmin) {
            try {
                const { data: updatedMetadata, error } = await supabaseAdmin
                    .from('files_metadata')
                    .update(updates)
                    .eq('id', fileId)
                    .select('*')
                    .single();

                if (!error && updatedMetadata) {
                    return NextResponse.json({ success: true, metadata: updatedMetadata });
                }
            } catch (err) {
                console.warn('Supabase metadata POST update failed:', err);
            }
        }

        // Local metadata update fallback
        const localRecords = getLocalMetadata();
        const index = localRecords.findIndex((r: any) => r.id === fileId);
        if (index !== -1) {
            localRecords[index] = { ...localRecords[index], ...updates };
            const metaPath = path.join(process.cwd(), 'public', 'uploads', 'metadata.json');
            fs.writeFileSync(metaPath, JSON.stringify(localRecords, null, 2));
            return NextResponse.json({ success: true, metadata: localRecords[index] });
        }

        return NextResponse.json({ success: true, metadata: updates });

    } catch (error: unknown) {
        console.error('File metadata POST API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');

        if (!fileId) {
            return NextResponse.json(
                { error: 'fileId is required', code: 'MISSING_FILE_ID' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const isPlaceholder = !supabaseUrl || supabaseUrl.includes('your-supabase') || supabaseUrl.includes('placeholder');

        if (!isPlaceholder) {
            try {
                // Fetch file record to get public_url
                const { data: fileData } = await supabase
                    .from('files_metadata')
                    .select('*')
                    .eq('id', fileId)
                    .single();

                if (fileData?.public_url && !fileData.public_url.startsWith('/uploads/')) {
                    const urlParts = fileData.public_url.split('/storage/v1/object/public/');
                    if (urlParts.length >= 2) {
                        const storagePath = urlParts[1].split('/').slice(1).join('/');
                        await supabase.storage.from('media').remove([storagePath]);
                    }
                }

                await supabase.from('files_metadata').delete().eq('id', fileId);
            } catch (err) {
                console.warn('Supabase remote delete failed:', err);
            }
        }

        // Local deletion fallback
        try {
            const metaPath = path.join(process.cwd(), 'public', 'uploads', 'metadata.json');
            if (fs.existsSync(metaPath)) {
                let localRecords = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                const fileToDelete = localRecords.find((r: any) => r.id === fileId);

                if (fileToDelete?.public_url?.startsWith('/uploads/')) {
                    const localFilePath = path.join(process.cwd(), 'public', fileToDelete.public_url);
                    if (fs.existsSync(localFilePath)) {
                        fs.unlinkSync(localFilePath);
                    }
                }

                localRecords = localRecords.filter((r: any) => r.id !== fileId);
                fs.writeFileSync(metaPath, JSON.stringify(localRecords, null, 2));
            }
        } catch (localErr) {
            console.error('Local file deletion failed:', localErr);
        }

        return NextResponse.json({ success: true, message: 'File deleted successfully' });

    } catch (error: any) {
        console.error('Delete API error:', error);
        return NextResponse.json(
            { error: 'Failed to delete file', details: error.message },
            { status: 500 }
        );
    }
}

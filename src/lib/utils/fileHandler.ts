import { fileTypeFromBuffer } from 'file-type';
import { supabase, supabaseAdmin } from '@/lib/supabaseClient';
import fs from 'fs';
import path from 'path';

export interface FileMetadata {
    name: string;
    mime_type: string;
    size: number;
    folder_path: string;
    public_url: string;
    category?: string;
    confidence?: number;
}

export interface UploadResult {
    success: boolean;
    message: string;
    metadata?: FileMetadata;
    error?: string;
}

/**
 * Detect if running in Vercel or Serverless environment
 */
export function isServerlessEnvironment(): boolean {
    return Boolean(
        process.env.VERCEL ||
        process.env.VERCEL_ENV ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.NETLIFY ||
        process.env.NEXT_RUNTIME === 'edge'
    );
}

/**
 * Check if Supabase environment variables are properly configured
 */
export function isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    return Boolean(
        url &&
        key &&
        !url.includes('placeholder') &&
        !url.includes('your-supabase') &&
        !key.includes('placeholder') &&
        !key.includes('your-supabase')
    );
}

/**
 * Detect MIME type from file buffer
 */
export async function detectMimeType(buffer: Buffer, filename: string): Promise<string> {
    try {
        const result = await fileTypeFromBuffer(buffer);
        return result?.mime || getMimeTypeFromExtension(filename);
    } catch (error) {
        return getMimeTypeFromExtension(filename);
    }
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'ts': 'application/typescript',
        'py': 'text/x-python',
        'java': 'text/x-java-source',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',
        'ogg': 'audio/ogg',
        'mp4': 'video/mp4',
        'avi': 'video/avi',
        'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv',
        'mkv': 'video/x-matroska',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'gz': 'application/gzip',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Determine intelligent folder path based on content analysis and existing structure
 */
export async function getIntelligentFolderPath(
    mimeType: string,
    fileName: string,
    tags: string[] = []
): Promise<string> {
    const basePath = 'media/';

    if (mimeType.startsWith('image/')) {
        let category = 'images';
        const name = fileName.toLowerCase();
        if (name.includes('photo') || name.includes('pic') || name.includes('picture')) {
            category = 'images/photos';
        } else if (name.includes('screenshot') || name.includes('screen')) {
            category = 'images/screenshots';
        } else if (name.includes('logo') || name.includes('brand')) {
            category = 'images/logos';
        } else if (name.includes('diagram') || name.includes('chart') || name.includes('graph')) {
            category = 'images/diagrams';
        } else if (name.includes('avatar') || name.includes('profile') || name.includes('user')) {
            category = 'images/avatars';
        } else if (tags.includes('photo')) {
            category = 'images/photos';
        } else if (tags.includes('screenshot')) {
            category = 'images/screenshots';
        } else if (tags.includes('logo')) {
            category = 'images/logos';
        } else if (tags.includes('diagram')) {
            category = 'images/diagrams';
        }
        return `${basePath}${category}/`;

    } else if (mimeType.startsWith('video/')) {
        let category = 'videos';
        const name = fileName.toLowerCase();
        if (name.includes('tutorial') || name.includes('guide') || name.includes('howto')) {
            category = 'videos/tutorials';
        } else if (name.includes('presentation') || name.includes('demo')) {
            category = 'videos/presentations';
        } else if (name.includes('interview') || name.includes('talk')) {
            category = 'videos/interviews';
        } else if (name.includes('music') || name.includes('song') || name.includes('audio')) {
            category = 'videos/music';
        }
        return `${basePath}${category}/`;

    } else if (mimeType.startsWith('audio/')) {
        let category = 'audio';
        const name = fileName.toLowerCase();
        if (name.includes('music') || name.includes('song')) {
            category = 'audio/music';
        } else if (name.includes('podcast') || name.includes('talk')) {
            category = 'audio/podcasts';
        } else if (name.includes('interview')) {
            category = 'audio/interviews';
        } else if (name.includes('sound') || name.includes('effect')) {
            category = 'audio/sounds';
        }
        return `${basePath}${category}/`;

    } else if (mimeType === 'application/pdf' || mimeType.includes('document')) {
        let category = 'documents';
        const name = fileName.toLowerCase();
        if (name.includes('resume') || name.includes('cv')) {
            category = 'documents/resumes';
        } else if (name.includes('report') || name.includes('analysis')) {
            category = 'documents/reports';
        } else if (name.includes('manual') || name.includes('guide')) {
            category = 'documents/manuals';
        } else if (name.includes('invoice') || name.includes('bill')) {
            category = 'documents/invoices';
        }
        return `${basePath}${category}/`;

    } else if (mimeType === 'application/json') {
        let category = 'data/json';
        if (tags.includes('users') || tags.includes('contacts')) {
            category = 'data/json/users';
        } else if (tags.includes('settings') || tags.includes('config')) {
            category = 'data/json/config';
        } else if (tags.includes('array') && tags.includes('records')) {
            category = 'data/json/records';
        }
        return `${basePath}${category}/`;

    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
        let category = 'documents/text';
        const name = fileName.toLowerCase();
        if (name.includes('readme') || name.includes('doc')) {
            category = 'documents/text/docs';
        } else if (name.includes('note') || name.includes('todo')) {
            category = 'documents/text/notes';
        } else if (name.includes('script') || name.includes('code')) {
            category = 'documents/text/scripts';
        }
        return `${basePath}${category}/`;

    } else if (mimeType.includes('javascript') || mimeType.includes('typescript')) {
        return `${basePath}code/javascript/`;
    } else if (mimeType.includes('python')) {
        return `${basePath}code/python/`;
    } else if (mimeType.includes('java')) {
        return `${basePath}code/java/`;
    } else if (mimeType.includes('html')) {
        return `${basePath}web/html/`;
    } else if (mimeType.includes('css')) {
        return `${basePath}web/css/`;
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) {
        return `${basePath}archives/`;
    } else {
        return `${basePath}other/`;
    }
}

/**
 * Legacy function for backward compatibility
 */
export function getFolderPath(mimeType: string): string {
    return 'media/others/';
}

/**
 * Normalize filename and generate unique path safely
 */
export function generateFilePath(originalName: string, folderPath: string): string {
    const timestamp = Date.now();
    const basename = path.basename(originalName).replace(/[\r\n\0]/g, '');
    const sanitizedName = basename.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.+/g, '.').slice(-100);
    return `${folderPath}${timestamp}_${sanitizedName}`;
}

/**
 * Upload file to Supabase Storage with local storage fallback
 */
export async function uploadToSupabase(
    fileBuffer: Buffer,
    filePath: string,
    mimeType: string
): Promise<{ publicUrl: string } | null> {
    const isConfigured = isSupabaseConfigured();
    const client = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) ? supabaseAdmin : supabase;

    if (isConfigured) {
        try {
            let { data, error } = await client.storage
                .from('media')
                .upload(filePath, fileBuffer, {
                    contentType: mimeType,
                    cacheControl: '3600',
                    upsert: true,
                });

            // If bucket not found, attempt creating 'media' bucket with public access
            if (error && (error.message?.toLowerCase().includes('bucket not found') || (error as any).statusCode === '404' || (error as any).status === 404)) {
                try {
                    await client.storage.createBucket('media', { public: true });
                    const retry = await client.storage
                        .from('media')
                        .upload(filePath, fileBuffer, {
                            contentType: mimeType,
                            cacheControl: '3600',
                            upsert: true,
                        });
                    data = retry.data;
                    error = retry.error;
                } catch (bErr) {
                    console.warn('Attempt to auto-create media bucket failed:', bErr);
                }
            }

            if (!error && data) {
                const { data: urlData } = client.storage
                    .from('media')
                    .getPublicUrl(filePath);

                return { publicUrl: urlData.publicUrl };
            } else if (error) {
                console.warn('Supabase storage upload error:', error.message);
            }
        } catch (error: any) {
            console.warn('Supabase remote upload failed:', error.message || error);
        }
    }

    // In Serverless / Vercel environments, NEVER write to local filesystem
    if (isServerlessEnvironment()) {
        console.warn('Serverless environment: Local disk fallback skipped.');
        return null;
    }

    // Fallback for Local Development ONLY: Store file locally under ./public/uploads
    try {
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const fileName = path.basename(filePath);
        const localFilePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(localFilePath, fileBuffer);
        return { publicUrl: `/uploads/${fileName}` };
    } catch (localError) {
        console.error('Local fallback storage upload failed:', localError);
        return null;
    }
}

/**
 * Save metadata to files_metadata table with local fallback
 */
export async function saveFileMetadata(metadata: FileMetadata): Promise<boolean> {
    const isConfigured = isSupabaseConfigured();
    const client = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY) ? supabaseAdmin : supabase;

    if (isConfigured) {
        try {
            const { error } = await client.from('files_metadata').insert([
                {
                    name: metadata.name,
                    mime_type: metadata.mime_type,
                    size: metadata.size,
                    uploaded_at: new Date().toISOString(),
                    folder_path: metadata.folder_path,
                    public_url: metadata.public_url,
                    category: metadata.category || 'Unclassified',
                    confidence: metadata.confidence || 0,
                },
            ]);

            if (!error) return true;
            console.warn('Supabase DB metadata save failed:', error.message);
        } catch (error: any) {
            console.warn('Save metadata to Supabase failed:', error.message || error);
        }
    }

    // In Serverless / Vercel environments, NEVER write to local metadata.json
    if (isServerlessEnvironment()) {
        console.warn('Serverless environment: Local metadata disk save skipped.');
        return false;
    }

    // Local Development Metadata JSON fallback
    try {
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const metaFilePath = path.join(uploadsDir, 'metadata.json');
        let localMeta: any[] = [];
        if (fs.existsSync(metaFilePath)) {
            try {
                localMeta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
            } catch {
                localMeta = [];
            }
        }
        localMeta.unshift({
            id: Date.now().toString(),
            name: metadata.name,
            mime_type: metadata.mime_type,
            size: metadata.size,
            uploaded_at: new Date().toISOString(),
            folder_path: metadata.folder_path,
            public_url: metadata.public_url,
            category: metadata.category || 'Unclassified',
            confidence: metadata.confidence || 0,
        });
        fs.writeFileSync(metaFilePath, JSON.stringify(localMeta, null, 2));
        return true;
    } catch (localMetaErr) {
        console.error('Local metadata save failed:', localMetaErr);
        return true;
    }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

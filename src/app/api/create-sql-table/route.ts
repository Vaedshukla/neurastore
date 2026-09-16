import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabaseClient';

// Map JSON schema types to PostgreSQL types
function mapJsonTypeToPostgres(jsonType: string): string {
    switch (jsonType.toLowerCase()) {
        case 'string':
            return 'TEXT';
        case 'number':
            return 'NUMERIC';
        case 'boolean':
            return 'BOOLEAN';
        case 'null':
            return 'TEXT'; // fallback for null values
        default:
            return 'TEXT'; // fallback for unknown types
    }
}

// Validate table name (snake_case only)
function isValidTableName(tableName: string): boolean {
    // Only allow lowercase letters, numbers, and underscores
    // Must start with letter or underscore
    const snakeCaseRegex = /^[a-z_][a-z0-9_]*$/;
    return snakeCaseRegex.test(tableName) && tableName.length <= 63; // PostgreSQL limit
}

// Generate CREATE TABLE SQL
function generateCreateTableSQL(tableName: string, schema: Record<string, string>): string {
    const columns: string[] = [];

    // Add primary key
    columns.push('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');

    // Add file_id reference
    columns.push(`file_id UUID NOT NULL REFERENCES files_metadata(id)`);

    // Add schema columns (skip 'id' as it's added manually)
    for (const [fieldName, jsonType] of Object.entries(schema)) {
        if (fieldName === 'id') continue; // Skip 'id' field as it's added manually
        const postgresType = mapJsonTypeToPostgres(jsonType);
        columns.push(`${fieldName} ${postgresType}`);
    }

    // Add timestamps
    columns.push('created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
    columns.push('updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');

    return `CREATE TABLE ${tableName} (
    ${columns.join(',\n    ')}
);`;
}

export async function POST(request: NextRequest) {
    try {
        const { fileId, tableName, schema } = await request.json();

        // Validate required fields
        if (!fileId) {
            return NextResponse.json(
                { error: 'fileId is required', code: 'MISSING_FILE_ID' },
                { status: 400 }
            );
        }

        if (!tableName) {
            return NextResponse.json(
                { error: 'tableName is required', code: 'MISSING_TABLE_NAME' },
                { status: 400 }
            );
        }

        if (!schema || typeof schema !== 'object') {
            return NextResponse.json(
                { error: 'schema must be a valid object', code: 'INVALID_SCHEMA' },
                { status: 400 }
            );
        }

        // Validate table name format
        if (!isValidTableName(tableName)) {
            return NextResponse.json(
                {
                    error: 'tableName must be in snake_case format (lowercase letters, numbers, underscores only, max 63 chars)',
                    code: 'INVALID_TABLE_NAME'
                },
                { status: 400 }
            );
        }

        // Validate file exists
        const { data: fileRecord, error: fileError } = await supabase
            .from('files_metadata')
            .select('id, name')
            .eq('id', fileId)
            .single();

        if (fileError || !fileRecord) {
            return NextResponse.json(
                { error: 'File not found', code: 'FILE_NOT_FOUND' },
                { status: 404 }
            );
        }

        // Check if schema already exists for this file
        const { data: existingSchema, error: schemaCheckError } = await supabase
            .from('json_schemas')
            .select('id')
            .eq('file_id', fileId)
            .single();

        let schemaId = existingSchema?.id;
        const schemaExists = !schemaCheckError && existingSchema;

        if (schemaExists) {
            // Schema exists - update metadata to ensure it's marked as SQL storage
            const { error: updateError } = await supabase
                .from('files_metadata')
                .update({
                    storage_type: 'SQL'
                })
                .eq('id', fileId);

            if (updateError) {
                console.error('Metadata update error for existing schema:', updateError);
                // Don't fail the request, just log the error
            }
        }

        // Check if table already exists
        let tableExists = false;
        try {
            const { error: checkError } = await supabase
                .from(tableName)
                .select('id')
                .limit(1);

            // If no error, table exists
            if (!checkError) {
                tableExists = true;
            }
        } catch {
            // Table doesn't exist, continue with creation
        }

        if (tableExists) {
            // Table exists - ensure schema is saved if it doesn't exist
            if (!schemaExists) {
                // Save schema in json_schemas table
                if (!supabaseAdmin) {
                    console.error('supabaseAdmin not available for schema insert');
                    return NextResponse.json(
                        { error: 'Admin client not available', code: 'ADMIN_CLIENT_UNAVAILABLE' },
                        { status: 500 }
                    );
                }
                const { data: schemaRecord, error: schemaError } = await supabaseAdmin
                    .from('json_schemas')
                    .insert({
                        file_id: fileId,
                        schema: schema,
                        storage_type: 'SQL'
                    })
                    .select('id')
                    .single();

                if (schemaError) {
                    console.error('Schema save error for existing table:', schemaError);
                    return NextResponse.json(
                        {
                            error: 'Failed to save schema for existing table',
                            code: 'SCHEMA_SAVE_FAILED'
                        },
                        { status: 500 }
                    );
                }
                schemaId = schemaRecord.id;
            }

            // Update files_metadata with table info for existing table
            const metadataUpdate: any = {
                table_name: tableName,
                storage_type: 'SQL',
                json_type: 'sql'
            };
            if (schemaId) {
                metadataUpdate.schema_id = schemaId;
            }

            const { error: updateError } = await supabase
                .from('files_metadata')
                .update(metadataUpdate)
                .eq('id', fileId);

            if (updateError) {
                console.error('Metadata update error for existing table:', updateError);
                // Don't fail the request, just log the error
            }

            return NextResponse.json({
                success: false,
                message: `Table '${tableName}' already exists`,
                tableName,
                schemaId,
                code: 'TABLE_EXISTS'
            });
        }

        // Generate CREATE TABLE SQL
        const createTableSQL = generateCreateTableSQL(tableName, schema);

        // Execute table creation using Supabase RPC
        const { error: createError } = await supabase.rpc('execute_sql', {
            sql_query: createTableSQL
        });

        if (createError) {
            console.error('Table creation error:', createError);
            return NextResponse.json(
                {
                    error: 'Failed to create table',
                    details: createError.message,
                    code: 'TABLE_CREATION_FAILED'
                },
                { status: 500 }
            );
        }

        // Save schema in json_schemas table
        if (!supabaseAdmin) {
            console.error('supabaseAdmin not available for schema insert');
            // Try to drop the created table since schema save failed
            try {
                await supabase.rpc('execute_sql', {
                    sql_query: `DROP TABLE IF EXISTS ${tableName};`
                });
            } catch (dropError) {
                console.error('Failed to drop table after schema error:', dropError);
            }
            return NextResponse.json(
                { error: 'Admin client not available', code: 'ADMIN_CLIENT_UNAVAILABLE' },
                { status: 500 }
            );
        }
        const { data: schemaRecord, error: schemaError } = await supabaseAdmin
            .from('json_schemas')
            .insert({
                file_id: fileId,
                schema: schema,
                storage_type: 'SQL'
            })
            .select('id')
            .single();

        if (schemaError) {
            console.error('Schema save error:', schemaError);
            // Try to drop the created table since schema save failed
            try {
                await supabase.rpc('execute_sql', {
                    sql_query: `DROP TABLE IF EXISTS ${tableName};`
                });
            } catch (dropError) {
                console.error('Failed to drop table after schema error:', dropError);
            }

            return NextResponse.json(
                {
                    error: 'Table created but failed to save schema',
                    code: 'SCHEMA_SAVE_FAILED'
                },
                { status: 500 }
            );
        }

        // Update files_metadata with table info
        const { error: updateError } = await supabase
            .from('files_metadata')
            .update({
                table_name: tableName,
                storage_type: 'SQL',
                json_type: 'sql',
                schema_id: schemaRecord.id
            })
            .eq('id', fileId);

        if (updateError) {
            console.error('Metadata update error:', updateError);
            // Don't fail the request, just log the error
        }

        return NextResponse.json({
            success: true,
            message: 'SQL table created successfully',
            tableName,
            schemaId: schemaRecord.id,
            fileId
        });

    } catch (error: unknown) {
        console.error('Create SQL table API error:', error);
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}

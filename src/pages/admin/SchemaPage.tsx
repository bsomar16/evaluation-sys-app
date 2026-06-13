import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { hideLoadingOverlay } from '@/lib/loading-overlay';
import {
  EXPECTED_DB_SCHEMA,
  EXPECTED_TABLE_NAMES,
  buildCreateTableSql,
  buildFullMigrationSql,
  getExpectedColumn,
  type ExpectedColumn,
} from '@/lib/expected-db-schema';
import { CheckCircle2, AlertCircle, Copy, Loader, RefreshCw } from 'lucide-react';

interface ColumnStatus {
  table: string;
  column: string;
  type: string;
  exists: boolean;
}

interface TableStatus {
  name: string;
  exists: boolean;
  columns: ColumnStatus[];
  extraColumns: string[];
}

export default function AdminSchemaPage() {
  const [tables, setTables] = useState<TableStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const expectedColumnCount = useMemo(
    () =>
      Object.values(EXPECTED_DB_SCHEMA).reduce((sum, cols) => sum + cols.length, 0),
    []
  );

  const checkColumnExists = async (tableName: string, columnName: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from(tableName).select(columnName).limit(1);
      if (!error) return true;
      const msg = (error.message || '').toLowerCase();
      if (msg.includes(columnName.toLowerCase()) || msg.includes('column') || msg.includes('does not exist')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const checkTableExists = async (tableName: string): Promise<boolean> => {
    const probeColumn = EXPECTED_DB_SCHEMA[tableName]?.[0]?.name ?? 'id';
    try {
      const { error } = await supabase.from(tableName).select(probeColumn).limit(1);
      if (!error) return true;
      const msg = (error.message || '').toLowerCase();
      if (error.code === 'PGRST116' || msg.includes('does not exist') || msg.includes('schema cache')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const discoverLiveColumns = async (tableName: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase.from(tableName).select('*').limit(1);
      if (error || !data?.length) return [];
      return Object.keys(data[0]);
    } catch {
      return [];
    }
  };

  const checkSchema = useCallback(async () => {
    setLoading(true);
    setMigrationStatus(null);

    // Check all tables in parallel (not sequentially)
    const tableResults = await Promise.all(
      EXPECTED_TABLE_NAMES.map(async (tableName) => {
        const exists = await checkTableExists(tableName);
        const expectedCols: ExpectedColumn[] = EXPECTED_DB_SCHEMA[tableName] ?? [];
        const liveCols = exists ? await discoverLiveColumns(tableName) : [];

        // Check all columns for this table in parallel (not sequentially)
        const columns: ColumnStatus[] = await Promise.all(
          expectedCols.map(async (col) => {
            const colExists = exists ? await checkColumnExists(tableName, col.name) : false;
            return {
              table: tableName,
              column: col.name,
              type: col.type,
              exists: colExists,
            };
          })
        );

        const expectedNames = new Set(expectedCols.map((c) => c.name));
        const extraColumns = liveCols.filter((c) => !expectedNames.has(c));

        return { name: tableName, exists, columns, extraColumns };
      })
    );

    setTables(tableResults);
    setLastCheckedAt(new Date());
    setLoading(false);
    hideLoadingOverlay();
  }, []);

  useEffect(() => {
    checkSchema();
  }, [checkSchema]);

  const missingColumns = useMemo(() => {
    const missing: { table: string; column: ExpectedColumn }[] = [];
    for (const t of tables) {
      if (!t.exists) continue;
      for (const col of t.columns) {
        if (!col.exists) {
          const def = getExpectedColumn(t.name, col.column);
          if (def) missing.push({ table: t.name, column: def });
        }
      }
    }
    return missing;
  }, [tables]);

  const missingTables = tables.filter((t) => !t.exists);
  const migrationSql = useMemo(
    () => buildFullMigrationSql(
      missingTables.map((t) => t.name),
      missingColumns
    ),
    [missingTables, missingColumns]
  );

  const hasMigrationWork = missingTables.length > 0 || missingColumns.length > 0;

  const allOk =
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    tables.length > 0;

  const applyMigrations = async () => {
    setApplying(true);
    setMigrationStatus('⏳ Exécution des migrations...');

    try {
      const statements = migrationSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('--'));

      let successCount = 0;
      const errors: string[] = [];

      for (const statement of statements) {
        try {
          const { error } = await supabase.rpc('execute_sql', { sql: statement });
          if (error) {
            if (error.message.includes('execute_sql')) {
              errors.push('RPC execute_sql non disponible');
              break;
            }
            errors.push(error.message);
          } else {
            successCount++;
          }
        } catch (err: unknown) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
      await checkSchema();

      if (successCount > 0) {
        setMigrationStatus(`✅ ${successCount} migration(s) appliquée(s).`);
      } else if (!hasMigrationWork) {
        setMigrationStatus('✅ Schéma déjà à jour.');
      } else if (errors.length > 0) {
        setMigrationStatus(
          '⚠️ Migration automatique impossible.\n\nCopiez le SQL ci-dessous et exécutez-le dans Supabase SQL Editor.'
        );
      }
    } catch (error: unknown) {
      setMigrationStatus(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setApplying(false);
    }
  };

  const copySQL = () => {
    navigator.clipboard.writeText(migrationSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Schéma base de données</h1>
          <p className="text-muted-foreground mt-2">
            {EXPECTED_TABLE_NAMES.length} tables · {expectedColumnCount} colonnes
          </p>
          {lastCheckedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Dernière vérification : {lastCheckedAt.toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={checkSchema} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {!loading && (
        <Card
          className={
            allOk
              ? 'border-green-500 bg-green-50 dark:bg-green-950'
              : 'border-amber-500 bg-amber-50 dark:bg-amber-950'
          }
        >
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              {allOk ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-semibold">Schéma complet</p>
                    <p className="text-sm text-muted-foreground">
                      Toutes les tables et colonnes attendues sont présentes
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                  <div>
                    <p className="font-semibold">Écarts détectés</p>
                    <p className="text-sm text-muted-foreground">
                      {missingTables.length > 0 && `${missingTables.length} table(s) absente(s) · `}
                      {missingColumns.length} colonne(s) manquante(s)
                    </p>
                  </div>
                </div>
              )}
            </div>
            <Button onClick={applyMigrations} disabled={applying || !hasMigrationWork} size="lg">
              {applying ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  En cours...
                </>
              ) : (
                'Appliquer les migrations'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {migrationStatus && (
        <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
          <CardContent className="pt-6">
            <p className="text-sm whitespace-pre-wrap">{migrationStatus}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
            <Loader className="w-5 h-5 animate-spin" />
            Analyse du schéma en cours...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {/* Show section for missing tables first */}
          {missingTables.length > 0 && (
            <Card className="border-red-500 bg-red-50 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="text-lg text-red-700 dark:text-red-300">
                  ⚠️ Tables absentes ({missingTables.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {missingTables.map((table) => (
                  <div key={table.name} className="space-y-2">
                    <p className="font-mono font-semibold">{table.name}</p>
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                      {buildCreateTableSql(table.name)}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Show only existing tables */}
          {tables
            .filter((t) => t.exists)
            .map((table) => {
              const missingCount = table.columns.filter((c) => !c.exists).length;
              const tableOk = missingCount === 0;

              return (
                <Card key={table.name}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-lg font-mono">{table.name}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="outline">Table OK</Badge>
                        <Badge variant={tableOk ? 'default' : 'destructive'}>
                          {tableOk
                            ? `${table.columns.length} colonnes`
                            : `${missingCount} manquante(s)`}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {table.columns.map((status) => (
                        <div
                          key={`${status.table}-${status.column}`}
                          className="flex items-center justify-between p-2 bg-muted rounded gap-2"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-mono block truncate">{status.column}</span>
                            <span className="text-xs text-muted-foreground">{status.type}</span>
                          </div>
                          {status.exists ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                    {table.extraColumns.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Colonnes en base non listées dans le schéma attendu :
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {table.extraColumns.map((col) => (
                            <Badge key={col} variant="secondary" className="font-mono text-xs">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>SQL de migration (généré dynamiquement)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={copySQL} disabled={!hasMigrationWork}>
              <Copy className="w-4 h-4 mr-2" />
              {copied ? 'Copié !' : 'Copier le SQL'}
            </Button>
          </div>
          <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-80">{migrationSql}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

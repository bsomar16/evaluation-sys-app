import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Search, Download, FileText, X } from 'lucide-react';
import { employees, months } from '@/data/mockData';

function getTier(score: number) {
  if (score >= 90) return { label: 'Excellent', variant: 'default' as const };
  if (score >= 70) return { label: 'Very Good', variant: 'secondary' as const };
  if (score >= 50) return { label: 'Good', variant: 'outline' as const };
  return { label: 'Follow-up', variant: 'destructive' as const };
}

function EmployeeProfile({ employee, onClose }: { employee: typeof employees[0]; onClose: () => void }) {
  const monthlyScores = months.map((m) => ({ month: m, score: Math.round(employee.score - 10 + Math.random() * 20) }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onClose}>← Back</Button>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">{employee.avatar}</div>
            <div className="flex-1">
              <h2 className="text-xl font-bold font-heading text-foreground">{employee.name}</h2>
              <p className="text-muted-foreground text-sm">{employee.position} · {employee.branch}</p>
              <p className="text-muted-foreground text-xs mt-1">Manager: {employee.manager}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">{employee.score}%</p>
              <Badge {...{ variant: getTier(employee.score).variant }}>{getTier(employee.score).label}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader><CardTitle className="text-base font-heading">Monthly Performance History</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {monthlyScores.map((ms) => (
              <div key={ms.month} className="flex items-center gap-4">
                <span className="w-10 text-xs font-medium text-muted-foreground">{ms.month}</span>
                <Progress value={ms.score} className="flex-1 h-2" />
                <span className="w-10 text-right text-sm font-bold text-foreground">{ms.score}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="gap-2"><FileText size={16} /> Export Semester PDF</Button>
        <Button variant="outline" className="gap-2"><Download size={16} /> Export to Excel</Button>
      </div>
    </div>
  );
}

export default function Employees() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.branch.toLowerCase().includes(search.toLowerCase())
  );

  const selectedEmp = employees.find((e) => e.id === selectedId);

  if (selectedEmp) {
    return <EmployeeProfile employee={selectedEmp} onClose={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Employees</h1>
          <p className="text-muted-foreground text-sm mt-1">{employees.length} total employees</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Download size={14} /> Export All</Button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or branch..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(emp.id)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{emp.avatar}</div>
                      <span className="font-medium text-foreground">{emp.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{emp.position}</TableCell>
                  <TableCell className="text-muted-foreground">{emp.branch}</TableCell>
                  <TableCell className="text-muted-foreground">{emp.manager}</TableCell>
                  <TableCell className="text-right font-bold text-foreground">{emp.score}%</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={getTier(emp.score).variant}>{getTier(emp.score).label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

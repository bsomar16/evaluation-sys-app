import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, FileText, Building2, Users, Crown } from 'lucide-react';

const reports = [
  { id: 1, title: 'January Team Performance', type: 'team', uploadedBy: 'Dr. Khalid', date: '2026-01-28', branch: 'Headquarters' },
  { id: 2, title: 'Q4 2025 Company Report', type: 'company', uploadedBy: 'CEO Office', date: '2026-01-05', branch: 'All' },
  { id: 3, title: 'February Branch Report', type: 'branch', uploadedBy: 'Ms. Rania', date: '2026-02-27', branch: 'South Branch' },
  { id: 4, title: 'March Team Performance', type: 'team', uploadedBy: 'Mr. Ali', date: '2026-03-28', branch: 'North Branch' },
  { id: 5, title: 'Q1 2026 Master Report', type: 'company', uploadedBy: 'CEO Office', date: '2026-03-30', branch: 'All' },
];

const typeConfig = {
  team: { label: 'Team', icon: Users, variant: 'secondary' as const },
  company: { label: 'Company', icon: Crown, variant: 'default' as const },
  branch: { label: 'Branch', icon: Building2, variant: 'outline' as const },
};

export default function Reports() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload and view role-based performance reports</p>
        </div>
        <Button className="gap-2"><Upload size={16} /> Upload Report</Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Reports</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="branch">Branch</TabsTrigger>
        </TabsList>

        {['all', 'team', 'company', 'branch'].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports
                .filter((r) => tab === 'all' || r.type === tab)
                .map((report) => {
                  const config = typeConfig[report.type as keyof typeof typeConfig];
                  const Icon = config.icon;
                  return (
                    <Card key={report.id} className="border-border shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                            <FileText size={20} className="text-accent-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-foreground truncate">{report.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{report.uploadedBy} · {report.date}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
                              <span className="text-xs text-muted-foreground">{report.branch}</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="w-full mt-4 gap-2">
                          <Download size={14} /> Download
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

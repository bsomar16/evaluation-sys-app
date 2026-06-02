import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, FileText, BookOpen, TrendingUp, AlertCircle } from "lucide-react";

interface Evaluation {
  id: string;
  period: string;
  status: "pending" | "submitted" | "approved" | "rejected";
  score: number | null;
  feedback: string | null;
  created_at: string;
}

interface TrainingRequest {
  id: string;
  course_name: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface Report {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export default function EmployeePanel() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [trainingRequests, setTrainingRequests] = useState<TrainingRequest[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrainingDialogOpen, setIsTrainingDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  const [trainingFormData, setTrainingFormData] = useState({
    course_name: "",
    reason: "",
  });

  const [reportFormData, setReportFormData] = useState({
    title: "",
    content: "",
  });

  useEffect(() => {
    const checkRole = () => {
      const userRole = localStorage.getItem("userRole");
      const userData = localStorage.getItem("user");
      if (userRole !== "employee") {
        navigate("/");
      }
      if (userData) {
        setUser(JSON.parse(userData));
      }
    };
    checkRole();
    loadData();
  }, [navigate]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      if (!user?.email) return;

      // Charger les évaluations
      const { data: evalData } = await supabase
        .from("evaluations")
        .select("*")
        .eq("employee_email", user?.email)
        .order("created_at", { ascending: false });

      // Charger les demandes de formation
      const { data: trainingData } = await supabase
        .from("training_requests")
        .select("*")
        .eq("employee_email", user?.email)
        .order("created_at", { ascending: false });

      // Charger les rapports
      const { data: reportData } = await supabase
        .from("reports")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      setEvaluations((evalData as any) || []);
      setTrainingRequests((trainingData as any) || []);
      setReports((reportData as any) || []);
    } catch (error: any) {
      console.error("Erreur chargement données:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.email) {
      loadData();
    }
  }, [user]);

  const handleCreateTrainingRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trainingFormData.course_name) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("training_requests").insert({
        employee_email: user?.email,
        employee_name: user?.name,
        course_name: trainingFormData.course_name,
        reason: trainingFormData.reason || null,
        status: "pending",
        user_id: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Demande de formation soumise",
      });

      setTrainingFormData({ course_name: "", reason: "" });
      setIsTrainingDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Erreur création demande:", error);
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reportFormData.title || !reportFormData.content) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("reports").insert({
        title: reportFormData.title,
        content: reportFormData.content,
        user_id: user?.id,
        type: "employee_report",
      });

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Rapport créé avec succès",
      });

      setReportFormData({ title: "", content: "" });
      setIsReportDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Erreur création rapport:", error);
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: "bg-yellow-600/10 text-yellow-700 border-yellow-200",
      submitted: "bg-blue-600/10 text-blue-700 border-blue-200",
      approved: "bg-green-600/10 text-green-700 border-green-200",
      rejected: "bg-red-600/10 text-red-700 border-red-200",
    };

    const labels: Record<string, string> = {
      pending: "En attente",
      submitted: "Soumis",
      approved: "Approuvé",
      rejected: "Rejeté",
    };

    return (
      <Badge variant="outline" className={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const approvedEvals = evaluations.filter((e) => e.status === "approved").length;
  const avgScore = evaluations.filter((e) => e.score).length > 0
    ? (evaluations.reduce((sum, e) => sum + (e.score || 0), 0) / evaluations.filter((e) => e.score).length).toFixed(1)
    : "N/A";
  const approvedTraining = trainingRequests.filter((t) => t.status === "approved").length;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-heading text-foreground">Mon Tableau de Bord</h1>
        <p className="text-muted-foreground mt-1">Bienvenue {user?.name || user?.email}</p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Évaluations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{evaluations.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Score moyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{avgScore}/5</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-500" />
              Formations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{trainingRequests.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-500" />
              Rapports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{reports.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Onglets */}
      <Tabs defaultValue="evaluations" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-muted">
          <TabsTrigger value="evaluations">Évaluations</TabsTrigger>
          <TabsTrigger value="training">Formations</TabsTrigger>
          <TabsTrigger value="reports">Rapports</TabsTrigger>
        </TabsList>

        {/* Onglet Évaluations */}
        <TabsContent value="evaluations">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Mes Évaluations</CardTitle>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : evaluations.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Aucune évaluation trouvée pour le moment</AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Période</TableHead>
                        <TableHead className="text-muted-foreground">Score</TableHead>
                        <TableHead className="text-muted-foreground">Statut</TableHead>
                        <TableHead className="text-muted-foreground">Commentaires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evaluations.map((evaluation) => (
                        <TableRow key={evaluation.id} className="border-border hover:bg-accent/50">
                          <TableCell className="font-medium text-foreground">{evaluation.period}</TableCell>
                          <TableCell className="text-foreground font-semibold">
                            {evaluation.score ? `${evaluation.score}/5` : "N/A"}
                          </TableCell>
                          <TableCell>{getStatusBadge(evaluation.status)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                            {evaluation.feedback || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Formations */}
        <TabsContent value="training">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Mes Demandes de Formation</CardTitle>
              </div>
              <Dialog open={isTrainingDialogOpen} onOpenChange={setIsTrainingDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-primary hover:bg-primary text-primary-foreground">
                    <Plus className="w-4 h-4" />
                    Nouvelle demande
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Demander une formation</DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleCreateTrainingRequest} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Nom de la formation</label>
                      <Input
                        placeholder="Ex: React Avancé, TypeScript, etc."
                        value={trainingFormData.course_name}
                        onChange={(e) => setTrainingFormData({ ...trainingFormData, course_name: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Justification</label>
                      <Textarea
                        placeholder="Pourquoi avez-vous besoin de cette formation..."
                        value={trainingFormData.reason}
                        onChange={(e) => setTrainingFormData({ ...trainingFormData, reason: e.target.value })}
                        className="border-input bg-background text-foreground"
                        rows={4}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary text-primary-foreground"
                    >
                      Soumettre la demande
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : trainingRequests.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Aucune demande de formation pour le moment</AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Formation</TableHead>
                        <TableHead className="text-muted-foreground">Raison</TableHead>
                        <TableHead className="text-muted-foreground">Statut</TableHead>
                        <TableHead className="text-muted-foreground">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainingRequests.map((training) => (
                        <TableRow key={training.id} className="border-border hover:bg-accent/50">
                          <TableCell className="font-medium text-foreground">{training.course_name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                            {training.reason || "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(training.status)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(training.created_at).toLocaleDateString("fr-FR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Rapports */}
        <TabsContent value="reports">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Mes Rapports</CardTitle>
              </div>
              <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-primary hover:bg-primary text-primary-foreground">
                    <Plus className="w-4 h-4" />
                    Nouveau rapport
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Créer un rapport</DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleCreateReport} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Titre</label>
                      <Input
                        placeholder="Ex: Rapport d'activité Q1 2026"
                        value={reportFormData.title}
                        onChange={(e) => setReportFormData({ ...reportFormData, title: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Contenu</label>
                      <Textarea
                        placeholder="Contenu du rapport..."
                        value={reportFormData.content}
                        onChange={(e) => setReportFormData({ ...reportFormData, content: e.target.value })}
                        className="border-input bg-background text-foreground"
                        rows={6}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary text-primary-foreground"
                    >
                      Créer le rapport
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : reports.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Aucun rapport créé pour le moment</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => (
                    <Card key={report.id} className="bg-accent/20 border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-foreground text-lg">{report.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleDateString("fr-FR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground whitespace-pre-wrap">{report.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

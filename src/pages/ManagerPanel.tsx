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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CheckCircle2, Clock, AlertCircle, TrendingUp } from "lucide-react";

interface Evaluation {
  id: string;
  employee_name: string;
  employee_email: string;
  period: string;
  status: "pending" | "submitted" | "approved" | "rejected";
  score: number | null;
  feedback: string | null;
  created_at: string;
}

interface TrainingRequest {
  id: string;
  employee_name: string;
  employee_email: string;
  course_name: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export default function ManagerPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [trainingRequests, setTrainingRequests] = useState<TrainingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEvalDialogOpen, setIsEvalDialogOpen] = useState(false);
  const [isTrainingDialogOpen, setIsTrainingDialogOpen] = useState(false);

  const [evalFormData, setEvalFormData] = useState({
    employee_email: "",
    period: "",
    score: "",
    feedback: "",
  });

  const [trainingFormData, setTrainingFormData] = useState({
    employee_email: "",
    course_name: "",
    reason: "",
  });

  useEffect(() => {
    const checkRole = () => {
      const userRole = localStorage.getItem("userRole");
      const userData = localStorage.getItem("user");
      if (userRole !== "manager") {
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
      
      // Charger les évaluations
      const { data: evalData } = await supabase
        .from("evaluations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      // Charger les demandes de formation
      const { data: trainingData } = await supabase
        .from("training_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      setEvaluations((evalData as any) || []);
      setTrainingRequests((trainingData as any) || []);
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

  const handleCreateEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!evalFormData.employee_email || !evalFormData.period || !evalFormData.score) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("evaluations").insert({
        employee_email: evalFormData.employee_email,
        employee_name: evalFormData.employee_email.split("@")[0],
        period: evalFormData.period,
        score: parseFloat(evalFormData.score),
        feedback: evalFormData.feedback || null,
        status: "submitted",
        manager_id: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Évaluation créée avec succès",
      });

      setEvalFormData({ employee_email: "", period: "", score: "", feedback: "" });
      setIsEvalDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Erreur création évaluation:", error);
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateTrainingRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trainingFormData.employee_email || !trainingFormData.course_name) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("training_requests").insert({
        employee_email: trainingFormData.employee_email,
        employee_name: trainingFormData.employee_email.split("@")[0],
        course_name: trainingFormData.course_name,
        reason: trainingFormData.reason || null,
        status: "pending",
        manager_id: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Demande de formation créée",
      });

      setTrainingFormData({ employee_email: "", course_name: "", reason: "" });
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

  const approveEvaluation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("evaluations")
        .update({ status: "approved" })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Évaluation approuvée",
      });

      loadData();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const approveTraining = async (id: string) => {
    try {
      const { error } = await supabase
        .from("training_requests")
        .update({ status: "approved" })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Succès",
        description: "Demande approuvée",
      });

      loadData();
    } catch (error: any) {
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

  const pendingEvals = evaluations.filter((e) => e.status === "pending").length;
  const pendingTraining = trainingRequests.filter((t) => t.status === "pending").length;
  const avgScore = evaluations.filter((e) => e.score).length > 0
    ? (evaluations.reduce((sum, e) => sum + (e.score || 0), 0) / evaluations.filter((e) => e.score).length).toFixed(1)
    : "N/A";

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-foreground">Tableau de Bord Manager</h1>
          <p className="text-muted-foreground mt-1">Gérez les évaluations et formations de votre équipe</p>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              Évaluations en attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{pendingEvals}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Formations en attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{pendingTraining}</p>
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
      </div>

      {/* Onglets */}
      <Tabs defaultValue="evaluations" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-muted">
          <TabsTrigger value="evaluations">Évaluations</TabsTrigger>
          <TabsTrigger value="training">Formations</TabsTrigger>
        </TabsList>

        {/* Onglet Évaluations */}
        <TabsContent value="evaluations">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Évaluations des employés</CardTitle>
              </div>
              <Dialog open={isEvalDialogOpen} onOpenChange={setIsEvalDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-primary hover:bg-primary text-primary-foreground">
                    <Plus className="w-4 h-4" />
                    Nouvelle évaluation
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Créer une évaluation</DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleCreateEvaluation} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Email employé</label>
                      <Input
                        type="email"
                        placeholder="employe@example.com"
                        value={evalFormData.employee_email}
                        onChange={(e) => setEvalFormData({ ...evalFormData, employee_email: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Période</label>
                      <Input
                        placeholder="Q1 2026"
                        value={evalFormData.period}
                        onChange={(e) => setEvalFormData({ ...evalFormData, period: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Score (1-5)</label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        step="0.5"
                        placeholder="4"
                        value={evalFormData.score}
                        onChange={(e) => setEvalFormData({ ...evalFormData, score: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Commentaires</label>
                      <Textarea
                        placeholder="Retours sur les performances..."
                        value={evalFormData.feedback}
                        onChange={(e) => setEvalFormData({ ...evalFormData, feedback: e.target.value })}
                        className="border-input bg-background text-foreground"
                        rows={4}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary text-primary-foreground"
                    >
                      Créer l'évaluation
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : evaluations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Aucune évaluation trouvée</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Employé</TableHead>
                        <TableHead className="text-muted-foreground">Période</TableHead>
                        <TableHead className="text-muted-foreground">Score</TableHead>
                        <TableHead className="text-muted-foreground">Statut</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evaluations.map((evaluation) => (
                        <TableRow key={evaluation.id} className="border-border hover:bg-accent/50">
                          <TableCell className="font-medium text-foreground">{evaluation.employee_name}</TableCell>
                          <TableCell className="text-muted-foreground">{evaluation.period}</TableCell>
                          <TableCell className="text-foreground font-semibold">
                            {evaluation.score ? `${evaluation.score}/5` : "N/A"}
                          </TableCell>
                          <TableCell>{getStatusBadge(evaluation.status)}</TableCell>
                          <TableCell className="text-right">
                            {evaluation.status === "submitted" && (
                              <Button
                                size="sm"
                                className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => approveEvaluation(evaluation.id)}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Approuver
                              </Button>
                            )}
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
                <CardTitle className="text-foreground">Demandes de Formation</CardTitle>
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
                    <DialogTitle className="text-foreground">Créer une demande de formation</DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleCreateTrainingRequest} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Email employé</label>
                      <Input
                        type="email"
                        placeholder="employe@example.com"
                        value={trainingFormData.employee_email}
                        onChange={(e) => setTrainingFormData({ ...trainingFormData, employee_email: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Nom de la formation</label>
                      <Input
                        placeholder="React Avancé"
                        value={trainingFormData.course_name}
                        onChange={(e) => setTrainingFormData({ ...trainingFormData, course_name: e.target.value })}
                        className="border-input bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Raison</label>
                      <Textarea
                        placeholder="Justification pour cette formation..."
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
                      Créer la demande
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Chargement...</div>
              ) : trainingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Aucune demande trouvée</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Employé</TableHead>
                        <TableHead className="text-muted-foreground">Formation</TableHead>
                        <TableHead className="text-muted-foreground">Raison</TableHead>
                        <TableHead className="text-muted-foreground">Statut</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainingRequests.map((training) => (
                        <TableRow key={training.id} className="border-border hover:bg-accent/50">
                          <TableCell className="font-medium text-foreground">{training.employee_name}</TableCell>
                          <TableCell className="text-muted-foreground">{training.course_name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{training.reason}</TableCell>
                          <TableCell>{getStatusBadge(training.status)}</TableCell>
                          <TableCell className="text-right">
                            {training.status === "pending" && (
                              <Button
                                size="sm"
                                className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => approveTraining(training.id)}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Approuver
                              </Button>
                            )}
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
      </Tabs>
    </div>
  );
}

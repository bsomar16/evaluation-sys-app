import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { passwordService } from "@/services/passwordService";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Archive, Edit2, Plus, Users, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { archiveUser } from "@/services/userArchiveService";
import { isUserArchived } from "@/lib/user-archive";

interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  branch: string;
  is_active: boolean;
  created_at: string;
}

export default function HRPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    position: "",
    branch: "",
  });

  useEffect(() => {
    const checkRole = () => {
      const userRole = localStorage.getItem("userRole");
      if (userRole !== "hr") {
        navigate("/");
      }
    };
    checkRole();
    loadEmployees();
  }, [navigate]);

  const loadEmployees = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", "employee")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEmployees((data || []).filter((u) => !isUserArchived(u)));
    } catch (error: any) {
      console.error("Erreur chargement employés:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les employés",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.position || !formData.branch) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      });
      return;
    }

    try {
      // Vérifier si l'email existe déjà
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", formData.email)
        .limit(1)
        .single();

      if (existingUser) {
        toast({
          title: "Erreur",
          description: "Cet email existe déjà",
          variant: "destructive",
        });
        return;
      }

      // Créer un mot de passe temporaire sécurisé avec au moins 12 caractères
      const tempPassword = passwordService.generateTemporaryPassword(12);

      // Créer l'utilisateur avec mot de passe haché
      const result = await passwordService.createUserWithPassword(
        formData.email,
        formData.name,
        tempPassword,
        {
          position: formData.position,
          branch_id: formData.branch,
          role: "employee"
        }
      );

      if (!result.success) {
        throw new Error('Impossible de créer l\'employé');
      }

      toast({
        title: "Succès",
        description: `Employé ajouté. Mot de passe temporaire: ${tempPassword}`,
      });

      setFormData({ name: "", email: "", position: "", branch: "" });
      setIsDialogOpen(false);
      loadEmployees();
    } catch (error: any) {
      console.error("Erreur ajout employé:", error);
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de l'ajout de l'employé",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      setEmployees(
        employees.map((emp) =>
          emp.id === id ? { ...emp, is_active: !currentStatus } : emp
        )
      );

      toast({
        title: "Succès",
        description: `Employé ${!currentStatus ? "activé" : "désactivé"}`,
      });
    } catch (error: any) {
      console.error("Erreur mise à jour:", error);
      toast({
        title: "Erreur",
        description: "Erreur lors de la mise à jour",
        variant: "destructive",
      });
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!window.confirm("Archiver cet employé ? Il ne pourra plus se connecter.")) {
      return;
    }

    try {
      await archiveUser(id);

      setEmployees(employees.filter((emp) => emp.id !== id));
      toast({
        title: "Succès",
        description: "Employé archivé",
      });
    } catch (error: any) {
      console.error("Erreur suppression:", error);
      toast({
        title: "Erreur",
        description: "Erreur lors de la suppression",
        variant: "destructive",
      });
    }
  };

  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = employees.filter((e) => !e.is_active).length;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-foreground">Gestion RH</h1>
          <p className="text-muted-foreground mt-1">Gérez les employés et leurs informations</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-primary hover:bg-primary text-primary-foreground">
              <Plus className="w-4 h-4" />
              Ajouter un employé
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Ajouter un employé</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <Input
                placeholder="Nom complet"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="border-2 border-blue-300 bg-blue-50"
              />

              <Input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="border-2 border-blue-300 bg-blue-50"
              />

              <Input
                placeholder="Poste"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="border-2 border-blue-300 bg-blue-50"
              />

              <Input
                placeholder="Branche"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                className="border-2 border-blue-300 bg-blue-50"
              />

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary text-primary-foreground"
              >
                Ajouter l'employé
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Total Employés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{employees.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              Inactifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{inactiveCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des employés */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Liste des employés</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : employees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucun employé trouvé</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Nom</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Poste</TableHead>
                    <TableHead className="text-muted-foreground">Branche</TableHead>
                    <TableHead className="text-muted-foreground">Statut</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id} className="border-border hover:bg-accent/50">
                      <TableCell className="font-medium text-foreground">{employee.name}</TableCell>
                      <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                      <TableCell className="text-muted-foreground">{employee.position}</TableCell>
                      <TableCell className="text-muted-foreground">{employee.branch}</TableCell>
                      <TableCell>
                        <Badge
                          variant={employee.is_active ? "default" : "secondary"}
                          className={
                            employee.is_active
                              ? "bg-green-600/10 text-green-700 border-green-200"
                              : "bg-gray-600/10 text-gray-700 border-gray-200"
                          }
                        >
                          {employee.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(employee.id, employee.is_active)}
                            className="border-border hover:bg-accent"
                          >
                            {employee.is_active ? "Désactiver" : "Activer"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteEmployee(employee.id)}
                            className="gap-1"
                          >
                            <Archive className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

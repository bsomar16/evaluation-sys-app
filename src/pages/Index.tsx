import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

// CPH - Gestion des Évaluations des Ressources Humaines
const CPHIndex = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center space-y-8 px-4">
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold text-slate-900">CPH</h1>
          <p className="text-xl text-slate-600">
            Gestion des Évaluations
          </p>
        </div>

        {/* Description */}
        <p className="text-lg text-slate-500 max-w-md mx-auto">
          Système intégré pour gérer les évaluations, les critères et les systèmes de calcul.
        </p>

        {/* CTA Buttons */}
        <div className="flex gap-4 justify-center pt-4">
          <Button 
            size="lg" 
            onClick={() => navigate('/admin')}
            className="bg-teal-600 hover:bg-teal-700"
          >
            Accéder au Système
          </Button>
        </div>
      </div>
    </div>
  );
};

const Index = CPHIndex;

export default Index;

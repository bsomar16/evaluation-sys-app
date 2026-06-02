export function ModuleAccessDenied({ title = 'Accès refusé' }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
    </div>
  );
}

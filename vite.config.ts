/**
 * CPH - Gestion des Évaluations des Ressources Humaines
 * 
 * MIGRATION NOTE: Ce projet a été migré de Lovable vers CPH.
 * Toutes les références à Lovable ont été supprimées.
 * Voir LOVABLE_MIGRATION.md pour les détails.
 * 
 * Dependencies Lovable supprimées:
 * - data-lovable-blank-page-placeholder (UI marker)
 * - placeholder assets remplacés par logo CPH
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const projectRoot = path.resolve(__dirname);

export default defineConfig(({ mode }) => ({
  root: projectRoot,
  // Chemin de base servi par Apache (ex. '/eval/'). Defaut : racine du domaine.
  base: process.env.APP_BASE ?? '/',
  server: {
    host: "::",
    port: 9000,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

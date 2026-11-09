import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";
const PredictPage = lazy(() => import("./pages/PredictPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const OutcomesPage = lazy(() => import("./pages/OutcomesPage"));
const LocalSettingsPage = lazy(() => import("./pages/LocalSettingsPage"));

function Router() {
  return (
    <DashboardLayout>
      <Suspense fallback={<p className="p-8 text-muted-foreground">画面を読み込み中...</p>}><Switch>
        <Route path="/"          component={PredictPage} />
        <Route path="/history"   component={HistoryPage} />
        <Route path="/rules"     component={RulesPage} />
        <Route path="/outcomes"  component={OutcomesPage} />
        {import.meta.env.VITE_DEMO_MODE !== "true" && <Route path="/local" component={LocalSettingsPage} />}
        <Route path="/404"       component={NotFound} />
        <Route                   component={NotFound} />
      </Switch></Suspense>
    </DashboardLayout>
  );
}

function App() {
  const basePath = import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <WouterRouter base={basePath}>
            <Router />
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

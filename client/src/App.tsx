import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PredictPage from "./pages/PredictPage";
import HistoryPage from "./pages/HistoryPage";
import RulesPage from "./pages/RulesPage";
import OutcomesPage from "./pages/OutcomesPage";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/"          component={PredictPage} />
        <Route path="/history"   component={HistoryPage} />
        <Route path="/rules"     component={RulesPage} />
        <Route path="/outcomes"  component={OutcomesPage} />
        <Route path="/404"       component={NotFound} />
        <Route                   component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

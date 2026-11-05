import { useEffect, useState } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Shell } from "@/components/Shell";
import { FilterCtx, type Boot } from "@/lib/ui";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Sheet from "@/pages/Sheet";
import Game from "@/pages/Game";
import Rink from "@/pages/Rink";
import { Leagues, LeaguePage, TeamPage } from "@/pages/Leagues";
import { Players, PlayerPage } from "@/pages/Players";
import Join from "@/pages/Join";
import MePage from "@/pages/Me";
import Pool from "@/pages/Pool";

function ScrollTop() {
  const [loc] = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc]);
  return null;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/scan" component={Scan} />
      <Route path="/sheet/:id">{(p) => <Sheet id={p.id} />}</Route>
      <Route path="/game/:id/new">{(p) => <Game id={p.id} fresh />}</Route>
      <Route path="/game/:id">{(p) => <Game id={p.id} />}</Route>
      <Route path="/leagues" component={Leagues} />
      <Route path="/league/:id">{(p) => <LeaguePage id={p.id} />}</Route>
      <Route path="/team/:id">{(p) => <TeamPage id={p.id} />}</Route>
      <Route path="/players" component={Players} />
      <Route path="/player/:id">{(p) => <PlayerPage id={p.id} />}</Route>
      <Route path="/rink" component={Rink} />
      <Route path="/join" component={Join} />
      <Route path="/me" component={MePage} />
      <Route path="/pool">{() => <Pool />}</Route>
      <Route path="/pool/:team/match/:slot">{(p) => <Pool teamId={p.team} slotId={p.slot} />}</Route>
      <Route path="/pool/:team">{(p) => <Pool teamId={p.team} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function Root() {
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const { data: boot } = useQuery<Boot>({ queryKey: ["/api/bootstrap"] });
  return (
    <FilterCtx.Provider value={{ leagueId, setLeagueId, boot }}>
      <Router hook={useHashLocation}>
        <ScrollTop />
        <Shell><AppRouter /></Shell>
      </Router>
    </FilterCtx.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Root />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

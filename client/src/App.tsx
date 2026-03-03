import { AppRouter } from "@/app/routing/AppRouter";
import { AppProviders } from "@/app/providers/AppProviders";

function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

export default App;

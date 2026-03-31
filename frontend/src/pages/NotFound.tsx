import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-mesh-gradient relative overflow-hidden">
      <div className="orb orb-gold w-[300px] h-[300px] top-[20%] left-[20%]" />
      <div className="orb orb-blue w-[250px] h-[250px] bottom-[20%] right-[20%]" />
      <div className="bg-grid-pattern absolute inset-0 opacity-20 pointer-events-none" />

      <div className="text-center relative z-10 animate-fade-in">
        <div className="text-8xl font-extrabold text-primary text-glow mb-2">404</div>
        <p className="mb-6 text-lg text-muted-foreground">This page doesn't exist</p>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;

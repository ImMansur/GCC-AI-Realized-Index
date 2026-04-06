import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const AdminLogin = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      // Verify with backend that this user is the admin
      const res = await fetch(`${API_BASE}/api/admin/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Not authorized as admin");
      }

      sessionStorage.setItem("admin_token", idToken);
      toast.success("Admin login successful!");
      navigate("/admin/dashboard");
    } catch (error: any) {
      const msg = error?.code === "auth/invalid-credential"
        ? "Invalid email or password"
        : error?.message || "Login failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Admin Portal"
      subtitle="Sign in with your admin credentials to access the dashboard"
    >
      <div className="flex items-center gap-2 mb-6 p-3 rounded-lg border border-primary/20 bg-primary/5">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="text-sm text-muted-foreground">Restricted access — Admin credentials required</span>
      </div>

      <div className="mb-6 px-4 py-3 rounded-lg border border-dashed border-yellow-500/30 bg-yellow-500/5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-yellow-500 mb-2">Demo credentials — will be removed in production</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground">Email:</span> admin@gmail.com</span>
          <span><span className="font-medium text-foreground">Password:</span> admin123</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="Enter admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" variant="ey" size="lg" className="w-full shimmer group" disabled={loading}>
          {loading ? "Signing in…" : "Sign in as Admin"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Not an admin?{" "}
        <a href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
          User login
        </a>
      </p>
    </AuthLayout>
  );
};

export default AdminLogin;

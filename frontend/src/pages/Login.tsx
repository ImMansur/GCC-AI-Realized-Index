import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { signInWithEmailAndPassword,sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Block admin from using user login — check role in Firestore via backend
      try {
        const idToken = await userCredential.user.getIdToken();
        const verifyRes = await fetch(`${API_BASE}/api/admin/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });
        if (verifyRes.ok) {
   // user is admin → send to admin dashboard
   toast.success("Admin login successful");
   navigate("/admin/dashboard");
   return;
}
      } catch {
        // verify failed = not admin, proceed normally
      }

      toast.success("Signed in successfully!");

      // Check if user has past survey results
      try {
        const res = await fetch(`${API_BASE}/api/users/${userCredential.user.uid}/surveys/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data.survey) {
            // User has past results — go to results page
            navigate("/results");
            return;
          }
        }
      } catch {
        // If check fails, just go to designation
      }

      navigate("/designation");
    } catch (error: any) {
      const code = error?.code as string | undefined;
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please try again later.");
      } else {
        toast.error("Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };
     // FORGOT PASSWORD FUNCTION (Firebase)
  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Please enter your email first");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("Password reset email sent!");
    } catch (error: any) {
      toast.error(error.message);
    }
  };


  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to access your GARIX assessment dashboard"
    >
      {/* Role toggle */}
      

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Email Address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Password
            </Label>
            <button type="button" onClick={handleForgotPassword} className="text-xs text-primary hover:text-primary/80 transition-colors font-medium">
              Forgot password?
            </button>
          </div>
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
          {loading ? "Signing in…" : role === "admin" ? "Sign in as Admin" : "Sign in"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-primary hover:text-primary/80 transition-colors">
          Create account
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Login;

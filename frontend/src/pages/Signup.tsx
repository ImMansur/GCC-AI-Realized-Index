import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AuthLayout from "@/components/AuthLayout";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const GCC_LOCATIONS = [
  "Bangalore", "Hyderabad", "Chennai", "Pune", "Mumbai", "Delhi NCR",
  "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Other"
];

const GCC_SIZES = [
  "< 500 FTEs", "500 – 1,000 FTEs", "1,000 – 2,500 FTEs",
  "2,500 – 5,000 FTEs", "5,000 – 10,000 FTEs", "> 10,000 FTEs"
];

const INDUSTRIES = [
  "Banking & Financial Services", "Insurance", "Technology",
  "Healthcare & Life Sciences", "Manufacturing", "Retail & Consumer",
  "Energy & Utilities", "Telecom", "Automotive", "Professional Services", "Other"
];

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [gccLocation, setGccLocation] = useState("");
  const [gccSize, setGccSize] = useState("");
  const [parentIndustry, setParentIndustry] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });

      // Save profile data to backend (Firestore)
      await fetch(`${API_BASE}/api/users/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: userCredential.user.uid,
          name,
          email,
          company,
          gcc_location: gccLocation,
          gcc_size: gccSize,
          parent_industry: parentIndustry,
        }),
      });

      toast.success("Account created successfully!");
      navigate("/designation");
    } catch (error: any) {
      const code = error?.code as string | undefined;
      if (code === "auth/email-already-in-use") {
        toast.error("This email is already registered. Please sign in.");
      } else if (code === "auth/weak-password") {
        toast.error("Password is too weak. Use at least 6 characters.");
      } else if (code === "auth/invalid-email") {
        toast.error("Invalid email address.");
      } else {
        toast.error("Sign-up failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const inputClass = "h-11 bg-input border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30";

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started with your GARIX AI maturity assessment"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Name & Email */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name" className={labelClass}>Your Name *</Label>
            <Input id="name" type="text" placeholder="e.g. Priya Menon" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className={labelClass}>Email Address *</Label>
            <Input id="email" type="email" placeholder="priya@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
          </div>
        </div>

        {/* Row 2: Company & GCC Location */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company" className={labelClass}>Company / GCC Name *</Label>
            <Input id="company" type="text" placeholder="e.g. Acme Corp GCC" value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} required />
          </div>
          <div className="space-y-2">
            <Label className={labelClass}>GCC Location</Label>
            <Select value={gccLocation} onValueChange={setGccLocation}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                {GCC_LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3: GCC Size & Parent Industry */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={labelClass}>GCC Size (FTEs)</Label>
            <Select value={gccSize} onValueChange={setGccSize}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {GCC_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className={labelClass}>Parent Company Industry</Label>
            <Select value={parentIndustry} onValueChange={setParentIndustry}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className={labelClass}>Password *</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-10`} required minLength={8} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-1">
          By creating an account, you agree to the{" "}
          <button type="button" className="text-primary hover:text-primary/80 transition-colors">Terms of Service</button>{" "}and{" "}
          <button type="button" className="text-primary hover:text-primary/80 transition-colors">Privacy Policy</button>
        </div>

        <Button type="submit" variant="ey" size="lg" className="w-full shimmer group" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">Sign in</Link>
      </p>
    </AuthLayout>
  );
};

export default Signup;

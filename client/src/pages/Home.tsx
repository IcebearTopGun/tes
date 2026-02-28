import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, GraduationCap, Users } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="min-h-screen bg-mesh flex flex-col overflow-hidden">
      <Navbar />
      
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-16 relative z-10">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-primary text-sm font-medium mb-8">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            Modern School Management
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Education managed <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">beautifully.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 font-sans">
            A unified platform for teachers and students. Track attendance, manage assignments, and streamline communication in one elegant workspace.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="h-14 px-8 rounded-full text-base font-semibold shadow-premium hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                Get Started for Free <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-base font-medium bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80 transition-all duration-300">
                Log into existing account
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Abstract floating cards to add depth */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full"
        >
          <div className="bg-card/60 backdrop-blur-xl border border-white/20 dark:border-white/5 p-6 rounded-3xl shadow-premium transform hover:-translate-y-2 transition-all duration-500 text-left">
            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 text-primary">
              <GraduationCap className="h-6 w-6" />
            </div>
            <h3 className="font-display font-bold text-xl mb-2">For Teachers</h3>
            <p className="text-muted-foreground">Manage your classroom with ease. Monitor student progress and handle administrative tasks flawlessly.</p>
          </div>
          
          <div className="bg-card/60 backdrop-blur-xl border border-white/20 dark:border-white/5 p-6 rounded-3xl shadow-premium transform hover:-translate-y-2 transition-all duration-500 text-left md:translate-y-8">
            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="font-display font-bold text-xl mb-2">For Students</h3>
            <p className="text-muted-foreground">Stay on top of your assignments and attendance. A clear view of your academic journey.</p>
          </div>
        </motion.div>
        
      </main>
    </div>
  );
}

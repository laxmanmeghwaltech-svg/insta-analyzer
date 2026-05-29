import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, Zap } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back, {user?.name || "Creator"}
        </h1>
        <p className="text-muted-foreground">
          Analyze, understand, and repurpose your Instagram content with AI-powered insights.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-primary shadow-premium hover:shadow-premium-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Get Started
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Connect your Instagram account and start analyzing your content.
              </p>
              <Button
                onClick={() => setLocation("/posts")}
                className="w-full"
                size="sm"
              >
                View Your Posts
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-accent shadow-premium hover:shadow-premium-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">
              Get natural language descriptions and content scripts for each post.
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-secondary shadow-premium hover:shadow-premium-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Engagement Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">
              Track likes, comments, and reach for each post.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Features Overview */}
      <Card className="shadow-premium-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-accent" />
            Key Features
          </CardTitle>
          <CardDescription>
            Everything you need to analyze and repurpose your Instagram content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-medium">Content Analysis</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered descriptions and categorization of your posts, reels, stories, and carousels.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Script Generation</h3>
              <p className="text-sm text-muted-foreground">
                Automatically generate full scripts and narration for your content.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Engagement Tracking</h3>
              <p className="text-sm text-muted-foreground">
                View detailed metrics including likes, comments, and reach.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Easy Export</h3>
              <p className="text-sm text-muted-foreground">
                Copy AI-generated content to clipboard with one click.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

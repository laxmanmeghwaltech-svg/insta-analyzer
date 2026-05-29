import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Copy, Loader2, ArrowLeft, Heart, MessageCircle, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type InstagramPost = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  timestamp?: string;
  permalink?: string;
};

const getContentType = (mediaType: string): "post" | "reel" | "story" | "carousel" => {
  if (mediaType === "VIDEO") return "reel";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  return "post";
};

const getContentTypeColor = (type: "post" | "reel" | "story" | "carousel") => {
  switch (type) {
    case "reel":
      return "bg-accent text-accent-foreground";
    case "carousel":
      return "bg-secondary text-secondary-foreground";
    case "story":
      return "bg-destructive text-destructive-foreground";
    default:
      return "bg-primary text-primary-foreground";
  }
};

const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  } catch (error) {
    toast.error(`Failed to copy ${label}`);
  }
};

type AnalysisData = {
  description: string;
  contentCategory: string;
  script: string;
};

type PostInsights = {
  likeCount: number;
  commentsCount: number;
  reach: number;
  impressions: number;
};

export default function PostDetail() {
  const params = useParams();
  const postId = params?.id as string;
  const [, setLocation] = useLocation();

  // Mock post data - in real app, this would be fetched from the backend
  const [post] = useState<InstagramPost>({
    id: postId,
    caption: "Amazing content about AI design systems",
    media_type: "VIDEO",
    media_url: "https://via.placeholder.com/1080x1350",
    timestamp: new Date().toISOString(),
  });

  const contentType = getContentType(post.media_type);

  // Analyze post
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const analyzePostMutation = trpc.instagram.analyzePost.useMutation();

  useEffect(() => {
    if (post.caption) {
      setIsLoadingAnalysis(true);
      analyzePostMutation.mutate(
        {
          postId: post.id,
          caption: post.caption,
          mediaType: contentType,
        },
        {
          onSuccess: (data: AnalysisData) => {
            setAnalysisData(data);
            setIsLoadingAnalysis(false);
          },
          onError: () => {
            setIsLoadingAnalysis(false);
            toast.error("Failed to analyze post");
          },
        }
      );
    }
  }, [post.id, post.caption, contentType]);

  // Fetch insights
  const { data: insights, isLoading: isLoadingInsights } =
    trpc.instagram.getPostInsights.useQuery(
      { postId: post.id },
      { enabled: !!post.id }
    );

  const insightData = (insights || {}) as PostInsights;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => setLocation("/posts")}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Posts
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Media Preview */}
          <Card className="overflow-hidden shadow-premium-lg">
            <CardContent className="p-0">
              <div className="relative bg-muted">
                {post.media_url ? (
                  <img
                    src={post.media_url}
                    alt={post.caption || "Instagram post"}
                    className="w-full h-auto max-h-96 object-cover"
                  />
                ) : (
                  <div className="w-full h-96 flex items-center justify-center bg-secondary/10">
                    <span className="text-muted-foreground">No preview</span>
                  </div>
                )}

                {/* Content Type Badge */}
                <Badge
                  className={`absolute top-4 right-4 capitalize text-sm ${getContentTypeColor(
                    contentType
                  )}`}
                >
                  {contentType}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Caption */}
          {post.caption && (
            <Card className="shadow-premium">
              <CardHeader>
                <CardTitle className="text-lg">Caption</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap">{post.caption}</p>
              </CardContent>
            </Card>
          )}

          {/* AI Analysis */}
          <Card className="shadow-premium-lg">
            <CardHeader>
              <CardTitle className="text-lg">AI Analysis</CardTitle>
              <CardDescription>
                AI-powered insights about your content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingAnalysis ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : analysisData ? (
                <>
                  {/* Description */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-sm">Description</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(analysisData.description, "Description")
                        }
                        className="gap-2"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-foreground">
                      {analysisData.description}
                    </p>
                  </div>

                  {/* Content Category */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Content Category</h3>
                    <Badge variant="secondary" className="capitalize">
                      {analysisData.contentCategory}
                    </Badge>
                  </div>

                  {/* Script */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-sm">Generated Script</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(analysisData.script, "Script")
                        }
                        className="gap-2"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="bg-secondary/10 p-3 rounded-lg">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {analysisData.script}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No analysis available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Metrics */}
        <div className="space-y-6">
          {/* Post Info */}
          <Card className="shadow-premium">
            <CardHeader>
              <CardTitle className="text-lg">Post Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Type
                </p>
                <p className="text-sm font-medium capitalize">{contentType}</p>
              </div>
              {post.timestamp && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Published
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(post.timestamp).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Engagement Metrics */}
          <Card className="shadow-premium">
            <CardHeader>
              <CardTitle className="text-lg">Engagement</CardTitle>
              <CardDescription>
                {isLoadingInsights ? "Loading metrics..." : "Post performance"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingInsights ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <>
                  {/* Likes */}
                  <div className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-muted-foreground">Likes</span>
                    </div>
                    <span className="font-semibold">
                      {insightData.likeCount || 0}
                    </span>
                  </div>

                  {/* Comments */}
                  <div className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-accent" />
                      <span className="text-sm text-muted-foreground">Comments</span>
                    </div>
                    <span className="font-semibold">
                      {insightData.commentsCount || 0}
                    </span>
                  </div>

                  {/* Reach */}
                  <div className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Reach</span>
                    </div>
                    <span className="font-semibold">
                      {insightData.reach || 0}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-premium">
            <CardHeader>
              <CardTitle className="text-lg">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {post.permalink && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(post.permalink, "_blank")}
                >
                  View on Instagram
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

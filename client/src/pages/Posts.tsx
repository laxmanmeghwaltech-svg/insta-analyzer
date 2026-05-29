import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type NormalizedPost = {
  id: string;
  caption?: string;
  mediaType: "post" | "reel" | "story" | "carousel";
  mediaUrl?: string;
  timestamp?: Date;
  permalink?: string;
  rawMediaType: string;
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

export default function Posts() {
  const [, setLocation] = useLocation();
  const [pageCursor, setPageCursor] = useState<string | undefined>();

  const { data, isLoading, error } = trpc.instagram.getPosts.useQuery({
    limit: 10,
    pageCursor,
  });

  const posts = data?.posts || [];
  const nextPageCursor = data?.nextCursor;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Failed to load posts</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "Please check your Instagram connection and try again."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Your Posts</h1>
        <p className="text-muted-foreground">
          Browse and analyze your recent Instagram content
        </p>
      </div>

      {/* Posts Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-64 w-full" />
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-96 gap-4">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">No posts found</h2>
            <p className="text-sm text-muted-foreground">
              Make sure your Instagram account is connected and you have published content.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post: NormalizedPost) => {
              const contentType = post.mediaType;
              const mediaUrl = post.mediaUrl || "";

              return (
                <Card
                  key={post.id}
                  className="overflow-hidden shadow-premium hover:shadow-premium-lg transition-all duration-300 cursor-pointer group"
                  onClick={() => setLocation(`/posts/${post.id}`)}
                >
                  <CardContent className="p-0">
                    {/* Media Preview */}
                    <div className="relative h-64 bg-muted overflow-hidden">
                      {mediaUrl ? (
                        <img
                          src={mediaUrl}
                          alt={post.caption || "Instagram post"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary/10">
                          <span className="text-muted-foreground text-sm">No preview</span>
                        </div>
                      )}

                      {/* Content Type Badge */}
                      <Badge
                        className={`absolute top-3 right-3 capitalize ${getContentTypeColor(
                          contentType
                        )}`}
                      >
                        {contentType}
                      </Badge>
                    </div>

                    {/* Post Info */}
                    <div className="p-4 space-y-3">
                      {post.caption && (
                        <p className="text-sm line-clamp-2 text-foreground">
                          {post.caption}
                        </p>
                      )}

                      {post.timestamp && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(post.timestamp).toLocaleDateString()}
                        </p>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full group/btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/posts/${post.id}`);
                        }}
                      >
                        View Details
                        <ChevronRight className="h-4 w-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {nextPageCursor && (
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => setPageCursor(nextPageCursor)}
                variant="outline"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More Posts"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

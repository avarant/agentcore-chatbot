"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, MessageCircleQuestion, AlertTriangle, Tags } from "lucide-react";
import { useCustomer } from "../customer-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type RecurringQuestion = {
  question: string;
  count: number;
  example_session_ids: string[];
};

type FrictionTheme = {
  theme: string;
  description: string;
  affected_count: number;
  example_session_ids: string[];
};

type TopTopic = {
  topic: string;
  count: number;
};

type InsightsPayload = {
  generated_at: string;
  session_count: number;
  recurring_questions: RecurringQuestion[];
  friction_themes: FrictionTheme[];
  top_topics: TopTopic[];
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  return `${days}d ago`;
}

function SessionPills({ ids }: { ids: string[] }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {ids.slice(0, 5).map((id) => (
        <Link
          key={id}
          href={`/dashboard/conversations?session=${encodeURIComponent(id)}`}
          className="rounded-full border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {id.slice(0, 8)}
        </Link>
      ))}
    </div>
  );
}

export default function InsightsPage() {
  const { siteId } = useCustomer();
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(
        `${API_URL}/api/insights?site=${encodeURIComponent(siteId)}`,
        { credentials: "include" }
      );
      if (res.status === 404) {
        setInsights(null);
        setNotFound(true);
      } else if (res.ok) {
        const data = (await res.json()) as InsightsPayload;
        setInsights(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What end users are asking about and where they get stuck.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {insights && (
            <div>
              Updated {formatRelative(insights.generated_at)} · {insights.session_count} conversations analyzed
            </div>
          )}
          <div className="mt-0.5 opacity-70">Regenerates weekly on Mondays</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading insights…
        </div>
      ) : notFound ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="size-10 text-muted-foreground" />
            <div className="text-base font-medium">No insights yet</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Insights regenerate every Monday at 07:00 UTC. Your first report will appear after the next run.
            </p>
          </CardContent>
        </Card>
      ) : insights ? (
        <div className="space-y-8">
          {/* Recurring Questions */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Recurring questions
              </h2>
            </div>
            {insights.recurring_questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring questions detected.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {insights.recurring_questions.map((q, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-sm leading-snug">{q.question}</CardTitle>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {q.count}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <SessionPills ids={q.example_session_ids} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Friction Themes */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Friction themes
              </h2>
            </div>
            {insights.friction_themes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friction themes detected.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {insights.friction_themes.map((t, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-sm leading-snug">{t.theme}</CardTitle>
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          {t.affected_count}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{t.description}</p>
                      <SessionPills ids={t.example_session_ids} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Top Topics */}
          {insights.top_topics.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Tags className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Top topics
                </h2>
              </div>
              <Card>
                <CardContent className="flex flex-wrap gap-2 pt-6">
                  {insights.top_topics.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
                    >
                      <span>{t.topic}</span>
                      <span className="text-muted-foreground">{t.count}</span>
                    </span>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

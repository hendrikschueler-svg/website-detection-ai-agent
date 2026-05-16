import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, CheckCircle2, AlertCircle, Gavel, ShieldAlert, ShieldCheck, ShieldQuestion, Check, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type z } from "zod";
import { type searchResultSchema } from "@shared/schema";

type ResultItem = z.infer<typeof searchResultSchema> & { id?: string; Client?: string | null; "Product Name"?: string | null; Keyword?: string | null };

const HARDCODED_RESULTS: ResultItem[] = [
  {
    id: "demo-1",
    URL: "https://design-store.example/de/9-dinge-die-sie-vor-dem-kauf-einer-replik-des-eames-lounge-chair-wissen-sollten/",
    Status: "Takedown Recommended",
    "Risk Score": 0.9,
    "Confidence Score": 0.9,
    "Infringement Type": "counterfeit",
    "Recommended Action": "escalate",
    "Reasoning Summary": "Page discusses 'Eames Lounge Chair Replica,' promoting the purchase of non-authentic versions of a product licensed by Vitra, undermining genuine sales.",
    Client: "Vitra",
    "Product Name": "Lounge Chair",
  },
  {
    id: "demo-2",
    URL: "https://www.classic-furniture.example/furniture/bestseller/charles-eames-lounge-chair/",
    Status: "Takedown Recommended",
    "Risk Score": 0.85,
    "Confidence Score": 0.9,
    "Infringement Type": "counterfeit",
    "Recommended Action": "escalate",
    "Reasoning Summary": "The website explicitly sells a 'Nachbau' (replica) of the Eames Lounge Chair, a product manufactured under license by Vitra. This constitutes selling unauthorized copies of a protected design.",
    Client: "Vitra",
    "Product Name": "Lounge Chair",
  },
  {
    id: "demo-3",
    URL: "https://design-reference.example/loungesessel/eames-lounge-chair/",
    Status: "Auto Closed",
    "Risk Score": 0.1,
    "Confidence Score": 0.9,
    "Infringement Type": "not_infringing",
    "Recommended Action": "auto_close",
    "Reasoning Summary": "The site is an informational guide comparing original Vitra Eames Lounge Chairs with replicas, clearly distinguishing between them and their respective manufacturers. No misrepresentation found.",
    Client: "Vitra",
    "Product Name": "Lounge Chair",
  },
];

type Severity = "high" | "clear" | "review" | "processing" | "none";

function getDecisionInfo(item: ResultItem) {
  const rowStatus = item.Status?.toLowerCase() || '';
  const isTakedownRecommended = rowStatus === "takedown recommended" || rowStatus === "escalated";
  const recommendedAction = item["Recommended Action"]?.toLowerCase() || '';

  if (isTakedownRecommended || recommendedAction === "escalate") {
    return { label: "Takedown recommended", severity: "high" as Severity };
  } else if (recommendedAction === "auto_close") {
    return { label: "No infringement detected", severity: "clear" as Severity };
  } else if (recommendedAction === "human_review") {
    return { label: "Flagged for review", severity: "review" as Severity };
  }
  return { label: "No decision", severity: "none" as Severity };
}

function getRiskInfo(score: number | undefined | null) {
  if (score === undefined || score === null) return null;
  if (score >= 0.8) return { text: "High Risk", short: "High", level: "high" as const };
  if (score >= 0.5) return { text: "Medium Risk", short: "Med", level: "medium" as const };
  return { text: "Low Risk", short: "Low", level: "low" as const };
}

function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function RiskIndicator({ score, compact }: { score: number | undefined | null; compact?: boolean }) {
  const risk = getRiskInfo(score);
  if (!risk) return <span className="text-[#9ca3af] text-[12px]">—</span>;

  return (
    <div className="flex items-center gap-1.5" data-testid="risk-indicator">
      <div className={cn(
        "rounded-full shrink-0",
        compact ? "h-1.5 w-1.5" : "h-2 w-2",
        risk.level === "high" && "bg-red-500",
        risk.level === "medium" && "bg-amber-500",
        risk.level === "low" && "bg-emerald-500"
      )} />
      <span className={cn(
        "font-semibold tabular-nums",
        compact ? "text-[11px]" : "text-[13px]",
        risk.level === "high" && "text-red-600",
        risk.level === "medium" && "text-amber-600",
        risk.level === "low" && "text-emerald-600"
      )}>
        {compact ? risk.short : risk.text}
      </span>
    </div>
  );
}

function ResultRowDesktop({ item, idx, onApprove, isQueued }: {
  item: ResultItem;
  idx: number;
  onApprove: (item: ResultItem) => void;
  isQueued: boolean;
}) {
  const decision = getDecisionInfo(item);
  const risk = getRiskInfo(item["Risk Score"]);
  const infringement = (item["Infringement Type"] || "").trim();
  const isHighPriority = decision.severity === "high" && risk && risk.level === "high";
  const isClear = decision.severity === "clear";

  const DecisionIcon = decision.severity === "high" ? ShieldAlert
    : decision.severity === "clear" ? ShieldCheck
    : decision.severity === "review" ? ShieldQuestion
    : null;

  const showAction = decision.severity === "high" && !isQueued;

  return (
    <div
      className={cn(
        "group transition-colors",
        isHighPriority && "border-l-2 border-l-red-400",
        !isHighPriority && decision.severity === "high" && "border-l-2 border-l-amber-300",
        decision.severity === "review" && "border-l-2 border-l-amber-200",
        (isClear || decision.severity === "none") && "border-l-2 border-l-transparent",
      )}
      data-testid={`result-row-${idx}`}
    >
      <div className={cn(
        "px-6 py-5 hover:bg-[#fafafa] transition-colors",
        isClear && "opacity-75 hover:opacity-100"
      )}>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  {DecisionIcon && (
                    <DecisionIcon className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      decision.severity === "high" && "text-red-500",
                      decision.severity === "clear" && "text-emerald-500",
                      decision.severity === "review" && "text-amber-500"
                    )} />
                  )}
                  <span className={cn(
                    "leading-tight",
                    decision.severity === "high" && "text-[15px] font-semibold text-[#111827]",
                    decision.severity === "clear" && "text-[14px] font-medium text-[#6b7280]",
                    decision.severity === "review" && "text-[14px] font-medium text-[#111827]",
                    decision.severity === "none" && "text-[14px] text-[#6b7280]"
                  )} data-testid={`text-decision-${idx}`}>
                    {decision.label}
                  </span>
                  {infringement && infringement !== "not_infringing" && (
                    <Badge className="bg-[#f3f4f6] text-[#6b7280] hover:bg-[#f3f4f6] border-none font-normal text-[11px] px-2 py-0 h-5 rounded-full shadow-none" data-testid={`badge-type-${idx}`}>
                      {infringement.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                <div className="pl-7">
                  <RiskIndicator score={item["Risk Score"]} />
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2 pt-0.5">
                {isQueued && (
                  <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 font-medium" data-testid="badge-takedown-queued">
                    <Check className="w-3.5 h-3.5" />
                    Queued
                  </div>
                )}
                {showAction && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[13px] border-[#e5e7eb] transition-all duration-200 rounded-lg px-4 text-[#111827] font-medium whitespace-nowrap shadow-none"
                    onClick={() => onApprove(item)}
                    data-testid="button-approve-takedown"
                  >
                    Approve takedown
                  </Button>
                )}
              </div>
            </div>
            {item.URL && (
              <div className="flex items-center gap-1.5 mb-2 pl-7">
                <a
                  href={item.URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-[#6b7280] hover:text-[#111827] transition-colors truncate max-w-[500px] underline decoration-[#e5e7eb] underline-offset-2 hover:decoration-[#9ca3af]"
                  title={item.URL}
                  data-testid={`link-url-${idx}`}
                >
                  {item.URL}
                </a>
                <ExternalLink className="h-3 w-3 text-[#9ca3af] shrink-0" />
              </div>
            )}
            {item["Reasoning Summary"] && (
              <p className={cn(
                "text-[13px] leading-relaxed pl-7",
                isClear ? "text-[#9ca3af]" : "text-[#6b7280]"
              )} data-testid={`text-reasoning-${idx}`}>
                {item["Reasoning Summary"]}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultRowMobile({ item, idx, onApprove, isQueued }: {
  item: ResultItem;
  idx: number;
  onApprove: (item: ResultItem) => void;
  isQueued: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const decision = getDecisionInfo(item);
  const risk = getRiskInfo(item["Risk Score"]);
  const infringement = (item["Infringement Type"] || "").trim();
  const isHighPriority = decision.severity === "high" && risk && risk.level === "high";
  const isClear = decision.severity === "clear";
  const domain = item.URL ? getDomain(item.URL) : '';

  const DecisionIcon = decision.severity === "high" ? ShieldAlert
    : decision.severity === "clear" ? ShieldCheck
    : decision.severity === "review" ? ShieldQuestion
    : null;

  const showAction = decision.severity === "high" && !isQueued;

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, item]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    touchStartX.current = null;
    touchStartY.current = null;
    if (deltaY > 30) return;
    if (deltaX > 80 && showAction) {
      onApprove(item);
    }
  }, [showAction, onApprove, item]);

  return (
    <div
      ref={rowRef}
      className={cn(
        "transition-colors",
        isHighPriority && "border-l-2 border-l-red-400",
        !isHighPriority && decision.severity === "high" && "border-l-2 border-l-amber-300",
        decision.severity === "review" && "border-l-2 border-l-amber-200",
        (isClear || decision.severity === "none") && "border-l-2 border-l-transparent",
      )}
      data-testid={`result-row-${idx}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={cn(
          "px-4 py-3.5 active:bg-[#f3f4f6] transition-colors cursor-pointer select-none",
          isClear && "opacity-70"
        )}
        onClick={() => setExpanded(prev => !prev)}
        data-testid={`row-toggle-${idx}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {DecisionIcon && (
                <DecisionIcon className={cn(
                  "h-4 w-4 shrink-0",
                  decision.severity === "high" && "text-red-500",
                  decision.severity === "clear" && "text-emerald-500",
                  decision.severity === "review" && "text-amber-500"
                )} />
              )}
              <span className={cn(
                "leading-tight",
                decision.severity === "high" && "text-[14px] font-semibold text-[#111827]",
                decision.severity === "clear" && "text-[13px] font-medium text-[#6b7280]",
                decision.severity === "review" && "text-[13px] font-medium text-[#111827]",
                decision.severity === "none" && "text-[13px] text-[#6b7280]"
              )} data-testid={`text-decision-${idx}`}>
                {decision.label}
              </span>
              <RiskIndicator score={item["Risk Score"]} compact />
            </div>
            {domain && (
              <p className="text-[11px] text-[#9ca3af] truncate pl-6" data-testid={`text-domain-${idx}`}>
                {domain}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {isQueued && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium" data-testid="badge-takedown-queued">
                <Check className="w-3 h-3" />
                Queued
              </div>
            )}
            <ChevronDown className={cn(
              "h-4 w-4 text-[#9ca3af] transition-transform duration-200 shrink-0",
              expanded && "rotate-180"
            )} />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out",
          !expanded && "invisible h-0"
        )}
        style={{ maxHeight: expanded ? contentHeight + 'px' : '0px' }}
        aria-hidden={!expanded}
      >
        <div ref={contentRef} className="px-4 pb-4 pt-0">
          <div className="pl-6 flex flex-col gap-2.5">
            {infringement && infringement !== "not_infringing" && (
              <Badge className="bg-[#f3f4f6] text-[#6b7280] hover:bg-[#f3f4f6] border-none font-normal text-[11px] px-2 py-0 h-5 rounded-full shadow-none w-fit" data-testid={`badge-type-${idx}`}>
                {infringement.replace(/_/g, ' ')}
              </Badge>
            )}
            {item.URL && (
              <a
                href={item.URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#6b7280] underline decoration-[#e5e7eb] underline-offset-2 break-all leading-relaxed"
                onClick={(e) => e.stopPropagation()}
                data-testid={`link-url-${idx}`}
              >
                {item.URL}
              </a>
            )}
            {item["Reasoning Summary"] && (
              <p className={cn(
                "text-[12px] leading-relaxed",
                isClear ? "text-[#9ca3af]" : "text-[#6b7280]"
              )} data-testid={`text-reasoning-${idx}`}>
                {item["Reasoning Summary"]}
              </p>
            )}
            {showAction && (
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-[13px] border-[#e5e7eb] rounded-lg px-4 text-[#111827] font-medium shadow-none w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(item);
                  }}
                  data-testid="button-approve-takedown-expanded"
                >
                  Approve takedown
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [takedownStatuses, setTakedownStatuses] = useState<Record<string, boolean>>({});
  const [confirmDialogItem, setConfirmDialogItem] = useState<ResultItem | null>(null);

  const handleTakedownConfirm = () => {
    if (!confirmDialogItem) return;
    const rowId = confirmDialogItem.id || confirmDialogItem.URL || '';
    setTakedownStatuses(prev => ({ ...prev, [rowId]: true }));
    toast({
      title: "Takedown initiated",
      description: "Demo: Escalation workflow has been queued.",
      className: "border-l-4 border-l-primary",
    });
    setConfirmDialogItem(null);
  };

  const actionableCount = HARDCODED_RESULTS.filter(r => {
    const s = r.Status?.toLowerCase() || '';
    const a = r["Recommended Action"]?.toLowerCase() || '';
    return s === "takedown recommended" || s === "escalated" || a === "escalate";
  }).length;

  const RowComponent = isMobile ? ResultRowMobile : ResultRowDesktop;

  return (
    <AppLayout>
      <div className={cn("py-6", isMobile && "py-4")}>
        <div className={cn(
          "flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6",
          isMobile && "gap-3 mb-4"
        )}>
          <div>
            <h1 className={cn(
              "font-bold text-foreground font-display",
              isMobile ? "text-xl mb-1" : "text-3xl mb-2"
            )} data-testid="text-results-title">Scan Results</h1>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="secondary" className={cn("font-normal", isMobile && "text-[11px] px-2 py-0")} data-testid="badge-client">
                Client: Vitra
              </Badge>
              <Badge variant="secondary" className={cn("font-normal", isMobile && "text-[11px] px-2 py-0")} data-testid="badge-product">
                Product: Lounge Chair
              </Badge>
            </div>
          </div>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 self-start sm:self-auto">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Scan Complete
          </Badge>
        </div>

        <div className={cn(
          "flex items-center gap-4 text-[13px] text-[#6b7280]",
          isMobile ? "gap-3 mb-3 text-[12px]" : "mb-6"
        )} data-testid="results-summary">
          <span><span className="font-semibold text-[#111827]">{HARDCODED_RESULTS.length}</span> {isMobile ? "scanned" : "domains scanned"}</span>
          <span className="text-[#e5e7eb]">|</span>
          <span><span className="font-semibold text-[#111827]">{actionableCount}</span> {isMobile ? "action needed" : "requiring action"}</span>
        </div>

        <div className={cn(
          "bg-card rounded-xl border shadow-sm overflow-hidden",
          isMobile && "rounded-lg"
        )} data-testid="results-container">
          <div className={cn(
            "divide-y divide-[#e5e7eb]",
            isMobile && "divide-y-0"
          )}>
            {HARDCODED_RESULTS.map((row, idx) => {
              const rowId = row.id || row.URL || '';
              return (
                <div key={row.id} className={cn(isMobile && idx > 0 && "border-t border-[#f3f4f6]")}>
                  <RowComponent
                    item={row}
                    idx={idx}
                    onApprove={setConfirmDialogItem}
                    isQueued={!!takedownStatuses[rowId]}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AlertDialog open={!!confirmDialogItem} onOpenChange={(open) => !open && setConfirmDialogItem(null)}>
        <AlertDialogContent className={cn("border-border", isMobile && "max-w-[calc(100vw-32px)] rounded-xl")}>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Gavel className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle className={cn(isMobile ? "text-lg" : "text-xl")}>Confirm Demo Action</AlertDialogTitle>
            </div>
            <AlertDialogDescription className={cn("text-foreground leading-relaxed pt-2 border-t", isMobile ? "text-sm" : "text-base")}>
              You are about to initiate a takedown workflow for:
              <br />
              <span className={cn("font-mono bg-muted px-1.5 py-0.5 rounded mt-2 inline-block", isMobile ? "text-[11px] break-all" : "text-sm")}>
                {confirmDialogItem?.URL}
              </span>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Demo Environment Notice
                </p>
                <p className={cn(isMobile && "text-[12px]")}>
                  This is a demo application. No actual enforcement action or legal notice will be sent.
                  Automated recommendations are not legal advice.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTakedownConfirm}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Proceed (Demo)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

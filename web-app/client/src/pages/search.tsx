import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Search as SearchIcon, ArrowRight } from "lucide-react";
import { useSearchOptions, useStartSearch } from "@/hooks/use-search";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type StepState = "completed" | "active" | "upcoming";

function StepIndicator({ number, state, label, summary, hint, onClick }: {
  number: number;
  state: StepState;
  label: string;
  summary?: string;
  hint?: string;
  onClick?: () => void;
}) {
  const isClickable = state === "completed" && !!onClick;

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={cn(
        "flex items-center gap-3 text-left transition-all duration-200 group",
        isClickable && "cursor-pointer hover:opacity-80",
        !isClickable && "cursor-default"
      )}
      data-testid={`step-indicator-${number}`}
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 border-2",
        state === "completed" && "bg-primary border-primary text-primary-foreground",
        state === "active" && "bg-primary/10 border-primary text-primary",
        state === "upcoming" && "bg-muted/50 border-muted-foreground/20 text-muted-foreground/50"
      )}>
        {state === "completed" ? (
          <Check className="h-4 w-4" />
        ) : (
          number
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className={cn(
          "text-sm font-semibold transition-colors duration-200",
          state === "completed" && "text-foreground",
          state === "active" && "text-primary",
          state === "upcoming" && "text-muted-foreground/50"
        )}>
          {label}
        </span>
        {state === "completed" && summary && (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]" data-testid={`step-summary-${number}`}>{summary}</span>
        )}
        {state === "upcoming" && hint && (
          <span className="text-[11px] text-muted-foreground/40 hidden sm:block">{hint}</span>
        )}
      </div>
    </button>
  );
}

function StepConnector({ state }: { state: "completed" | "upcoming" }) {
  return (
    <div className="flex items-center mx-1">
      <div className={cn(
        "h-[2px] w-8 sm:w-12 rounded-full transition-all duration-500",
        state === "completed" ? "bg-primary" : "bg-muted-foreground/15"
      )} />
    </div>
  );
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data, isLoading: isOptionsLoading, isError } = useSearchOptions();
  const startSearch = useStartSearch();

  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const clients = data?.clients || [];
  const setups = data?.setups || [];

  const productsForClient = useMemo(() => {
    if (!selectedClient) return [];
    const unique = new Set(
      setups
        .filter(opt => opt.Client === selectedClient)
        .map(opt => opt["Product Name"])
        .filter(Boolean) as string[]
    );
    return Array.from(unique).sort();
  }, [setups, selectedClient]);

  const step1State: StepState = selectedClient ? "completed" : "active";
  const step2State: StepState = !selectedClient ? "upcoming" : "active";

  const handleClientSelect = (client: string) => {
    if (selectedClient === client) return;
    setSelectedClient(client);
    setSelectedProduct(null);
  };

  const handleProductSelect = (product: string) => {
    if (selectedProduct === product) return;
    setSelectedProduct(product);
  };

  const handleStepClick = (step: number) => {
    if (step === 1) {
      setSelectedClient(null);
      setSelectedProduct(null);
    }
  };

  const handleStartSearch = () => {
    if (!selectedClient || !selectedProduct) return;
    
    const matchingSetup = setups.find(s => 
      s.Client === selectedClient && 
      s["Product Name"] === selectedProduct
    );

    if (!matchingSetup) {
      toast({
        title: "Configuration error",
        description: "Could not find a matching setup for these selections.",
        variant: "destructive",
      });
      return;
    }
    
    startSearch.mutate(
      {
        setupRecordId: matchingSetup.id,
      },
      {
        onSuccess: (data) => {
          const params = new URLSearchParams();
          params.set('runId', data.runId);
          if (selectedClient) params.set('client', selectedClient);
          if (selectedProduct) params.set('product', selectedProduct);
          setLocation(`/results?${params.toString()}`);
        },
        onError: (err) => {
          toast({
            title: "Failed to start search",
            description: err.message,
            variant: "destructive",
          });
        }
      }
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (isOptionsLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60 mb-4" />
          <p className="text-muted-foreground">Loading search options...</p>
        </div>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] text-center max-w-md mx-auto">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <SearchIcon className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">Failed to load options</h2>
          <p className="text-muted-foreground mb-6">Could not connect to the analytics engine. Please ensure the backend proxy is running.</p>
          <Button onClick={() => window.location.reload()}>Retry Connection</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-12">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4 font-display">Run AI Risk Scan</h1>
          <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Scan the web for potential IP risks using policy-guided AI decisioning.
          </p>
        </div>

        <div className="flex items-center justify-center sm:justify-start mb-12 py-4 px-1 overflow-x-auto" data-testid="stepper">
          <StepIndicator
            number={1}
            state={step1State}
            label="Client"
            summary={selectedClient || undefined}
            onClick={step1State === "completed" ? () => handleStepClick(1) : undefined}
          />
          <StepConnector state={step1State === "completed" ? "completed" : "upcoming"} />
          <StepIndicator
            number={2}
            state={step2State}
            label="Product"
            summary={selectedProduct || undefined}
            hint="Select a client first"
          />
        </div>

        <motion.div 
          className="space-y-14"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {step1State === "active" && (
            <motion.section variants={itemVariants}>
              <div className="mb-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground" data-testid="step-heading-1">Which client is this scan for?</h2>
                <p className="text-sm text-muted-foreground mt-1">Your selection determines which products are available next.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {clients.map(client => (
                  <Card 
                    key={client}
                    data-testid={`card-client-${client}`}
                    className={cn(
                      "cursor-pointer transition-all duration-200 border-2 overflow-hidden group hover-elevate",
                      selectedClient === client 
                        ? "border-primary bg-primary/5 shadow-md" 
                        : "border-transparent bg-card hover:border-primary/30 shadow-sm"
                    )}
                    onClick={() => handleClientSelect(client)}
                  >
                    <CardContent className="p-5 flex items-center justify-between h-full">
                      <span className={cn(
                        "font-medium",
                        selectedClient === client ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"
                      )}>
                        {client}
                      </span>
                      {selectedClient === client && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.section>
          )}

          <AnimatePresence>
            {step2State === "active" && (
              <motion.section 
                variants={itemVariants}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="mb-5">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground" data-testid="step-heading-2">
                    Products for <span className="text-primary">{selectedClient}</span>
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Showing products linked to {selectedClient}. Keywords are determined automatically from the database.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {productsForClient.length === 0 ? (
                    <p className="text-muted-foreground text-sm italic">No products are configured for {selectedClient}. Try selecting a different client.</p>
                  ) : (
                    productsForClient.map(product => (
                      <Card 
                        key={product}
                        data-testid={`card-product-${product}`}
                        className={cn(
                          "cursor-pointer transition-all duration-200 border-2 overflow-hidden group hover-elevate",
                          selectedProduct === product 
                            ? "border-primary bg-primary/5 shadow-md" 
                            : "border-transparent bg-card hover:border-primary/30 shadow-sm"
                        )}
                        onClick={() => handleProductSelect(product)}
                      >
                        <CardContent className="p-5 flex items-center justify-between h-full">
                          <span className={cn(
                            "font-medium",
                            selectedProduct === product ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"
                          )}>
                            {product}
                          </span>
                          {selectedProduct === product && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>

                <AnimatePresence>
                  {selectedProduct && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="mt-8"
                    >
                      <Button 
                        data-testid="button-start-scan"
                        size="lg" 
                        className="w-full sm:w-auto h-14 px-10 font-bold text-lg shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1 active:translate-y-0 transition-all duration-300 rounded-xl bg-primary hover:bg-primary/95"
                        onClick={handleStartSearch}
                        disabled={startSearch.isPending}
                      >
                        {startSearch.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                            Initiating Scan...
                          </>
                        ) : (
                          <>
                            Start AI Scan
                            <ArrowRight className="ml-2 h-6 w-6" />
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AppLayout>
  );
}

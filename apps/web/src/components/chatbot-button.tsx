"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { 
  Search, 
  BookOpen, 
  Video, 
  Mail, 
  X,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface HelpMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  rightContent?: React.ReactNode;
}

function HelpMenuItem({ icon, label, onClick, rightContent }: HelpMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-accent transition-colors text-left"
    >
      <div className="flex-shrink-0 text-muted-foreground">
        {icon}
      </div>
      <span className="flex-1 text-sm">{label}</span>
      {rightContent && <div className="flex-shrink-0">{rightContent}</div>}
    </button>
  );
}

interface DocsPage {
  path: string;
  title: string;
  group: string;
}

interface DocsJson {
  navigation: {
    groups: Array<{
      group: string;
      pages: string[];
    }>;
  };
}

export function ChatbotButton() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [docsPages, setDocsPages] = useState<DocsPage[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Charger le fichier docs.json au montage du composant
  useEffect(() => {
    const loadDocs = async () => {
      setIsLoadingDocs(true);
      try {
        const response = await fetch('https://raw.githubusercontent.com/openinary/documentation/main/docs.json');
        const docs: DocsJson = await response.json();
        
        // Extraire tous les chemins de pages avec leurs groupes
        const pages: DocsPage[] = [];
        docs.navigation.groups.forEach((group) => {
          group.pages.forEach((page) => {
            // Convertir le chemin en titre lisible
            const title = page
              .split('/')
              .pop()
              ?.split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ') || page;
            
            pages.push({
              path: page,
              title,
              group: group.group,
            });
          });
        });
        
        setDocsPages(pages);
      } catch (error) {
        console.error('Erreur lors du chargement de la documentation:', error);
      } finally {
        setIsLoadingDocs(false);
      }
    };

    loadDocs();
  }, []);

  // Recherche dans les pages
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return [];
    }

    const query = searchQuery.toLowerCase().trim();
    return docsPages
      .filter((page) => {
        const searchableText = `${page.title} ${page.path} ${page.group}`.toLowerCase();
        return searchableText.includes(query);
      })
      .slice(0, 5); // Limiter à 5 résultats
  }, [searchQuery, docsPages]);

  const handleResultClick = (path: string) => {
    window.open(`https://docs.openinary.dev/${path}`, '_blank');
    setSearchQuery("");
    setOpen(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && searchResults.length > 0) {
      // Si des résultats sont disponibles, ouvrir le premier
      handleResultClick(searchResults[0].path);
    } else if (searchQuery.trim()) {
      // Sinon, ouvrir la documentation
      window.open('https://docs.openinary.dev/', '_blank');
      setSearchQuery("");
      setOpen(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-10 w-10 rounded-full shadow-lg z-50 cursor-pointer bg-white dark:bg-black text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-900 border border-primary/20 hover:border-primary/30"
          aria-label={open ? "Close help chatbot" : "Open help chatbot"}
        >
          <div className="relative h-5 w-5">
            <span
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg font-medium transition-all duration-200 ${
                open ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
              }`}
            >
              ?
            </span>
            <X
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 transition-all duration-200 ${
                open ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"
              }`}
            />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="end"
        sideOffset={16}
        className="w-64 p-0"
      >
        <div className="p-2 space-y-2">
          {/* Search Bar */}
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search docs..."
                className="pl-8 pr-8 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {isLoadingDocs ? (
                <Loader2 className="absolute right-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* Search Results */}
          {searchQuery.trim().length >= 2 && (
            <div className="max-h-64 overflow-y-auto border-t pt-2">
              {searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((result, index) => (
                    <button
                      key={index}
                      onClick={() => handleResultClick(result.path)}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <div className="text-sm font-medium line-clamp-1">{result.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {result.group}
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.trim().length >= 2 ? (
                <div className="text-sm text-muted-foreground p-2 text-center">
                  Aucun résultat trouvé
                </div>
              ) : null}
            </div>
          )}

          {/* First Section - Hidden when searching */}
          {searchQuery.trim().length < 2 && (
            <>
              <div className="space-y-0.5">
                <HelpMenuItem
                  icon={<BookOpen className="h-3.5 w-3.5" />}
                  label="Documentation"
                  onClick={() => {
                    window.open('https://docs.openinary.dev', '_blank');
                    setOpen(false);
                  }}
                />
              </div>

              <Separator />

              {/* Second Section */}
              <div className="space-y-0.5">
                <HelpMenuItem
                  icon={<Video className="h-3.5 w-3.5" />}
                  label="Book a Call"
                  onClick={() => {
                    window.open('https://cal.com/hey-florian/20-min-openinary?overlayCalendar=true', '_blank');
                    setOpen(false);
                  }}
                />
                <HelpMenuItem
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email Me"
                  onClick={() => {
                    window.location.href = 'mailto:heysen.florian@gmail.com';
                    setOpen(false);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
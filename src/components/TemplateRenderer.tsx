import React, { useState } from "react";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { cn } from "../lib/utils";
import { GeneratedPost } from "../types";
import { POST_TEMPLATES } from "../constants";

interface TemplateRendererProps {
  post: GeneratedPost;
  className?: string;
  slideIndex?: number;
}

export const TemplateRenderer: React.FC<TemplateRendererProps> = ({ post, className, slideIndex }) => {
  const { templateId, headline, caption, imageUrl, styles, logoUrl, description } = post;
  const [currentSlide, setCurrentSlide] = useState(slideIndex ?? 0);
  const [showWatermark, setShowWatermark] = useState(true);

  React.useEffect(() => {
    if (slideIndex !== undefined) {
      setCurrentSlide(slideIndex);
    }
  }, [slideIndex]);
  
  const accentColor = styles?.primaryColor || "#4f46e5"; // Default indigo-600
  const captionColor = styles?.captionColor || (templateId.includes("-dark") || (templateId.startsWith("insta-architect") && templateId.includes("-blueprint")) ? "#ffffff" : "#0f172a");
  const descriptionColor = styles?.descriptionColor || (templateId.includes("-dark") || (templateId.startsWith("insta-architect") && templateId.includes("-blueprint")) ? "#94a3b8" : "#64748b");
  const zoom = styles?.imageZoom || 1;
  const filterClass = styles?.imageFilter === 'grayscale' ? 'grayscale' : 
                      styles?.imageFilter === 'sepia' ? 'sepia' : 
                      styles?.imageFilter === 'contrast' ? 'contrast-125 saturate-150' : '';

  const getHeadingSize = () => {
    switch (styles?.headingSize) {
      case 'sm': return 'text-lg md:text-xl';
      case 'md': return 'text-2xl md:text-3xl';
      case 'lg': return 'text-3xl md:text-4xl';
      case 'xl': return 'text-4xl md:text-6xl';
      default: return 'text-2xl md:text-3xl';
    }
  };

  const getAspectClass = () => {
    // If we have a specific template, use its ratio
    const currentTemplate = POST_TEMPLATES.find(t => t.id === templateId);
    
    switch (post.platform) {
      case "instagram":
        return "aspect-square"; // 1:1
      case "facebook":
        return "aspect-[1.91/1]"; // Landscape
      default:
        return "aspect-square";
    }
  };

  const getProxiedUrl = (url: string | null | undefined) => {
    if (!url || !url.trim()) return "";
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    // Use our internal proxy for everything to ensure consistency and bypass IG blocks
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  const renderSlideIndicators = () => {
    if (!description || post.platform !== 'instagram') return null;
    return (
      <div className="flex justify-center gap-2 mt-6 pb-2">
        {[0, 1].map((idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentSlide(idx);
            }}
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              currentSlide === idx ? "bg-slate-900 w-6" : "bg-slate-200"
            )}
          />
        ))}
      </div>
    );
  };

  const renderDescriptionSlide = () => {
    return (
      <div className={cn(
        "relative w-full h-full overflow-hidden flex flex-col p-12 justify-center bg-slate-50",
        templateId.startsWith("insta-architect") && templateId.includes("-blueprint") ? "bg-slate-900 geometric-grid text-white" : "text-slate-900"
      )}>
        {logoUrl && logoUrl.trim() !== "" && (
          <div className="absolute top-8 left-8 w-10 h-10 md:w-16 md:h-16 flex items-center justify-center z-20">
            <img 
              src={getProxiedUrl(logoUrl)} 
              className="w-full h-full object-contain" 
              alt="" 
              crossOrigin="anonymous" 
            />
          </div>
        )}
        <div className="space-y-8 max-w-lg mx-auto z-10">
          <p className={cn(
            "text-sm md:text-xl font-medium leading-relaxed italic opacity-90 border-l-4 pl-6",
            templateId.includes("-blueprint") ? "border-indigo-500/50" : "border-slate-200"
          )} style={{ borderLeftColor: `${accentColor}50`, color: descriptionColor }}>
            {description}
          </p>
        </div>
        
        {showWatermark && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-2 z-30">
            <div className="flex items-center gap-2 opacity-25 hover:opacity-100 transition-opacity bg-white/10 px-2 py-1 rounded-full backdrop-blur-sm pointer-events-auto group/watermark">
              <div className="w-4 h-4 bg-white flex items-center justify-center rounded-sm overflow-hidden p-0.5">
                <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="" />
              </div>
              <span className="text-[7px] font-black uppercase tracking-[0.4em]">Powered by Speelox</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWatermark(false);
                }}
                className="ml-1 p-0.5 hover:bg-black/10 rounded-full transition-colors"
              >
                <X className="w-2 h-2" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (currentSlide === 1 && description) {
      return renderDescriptionSlide();
    }
    
    // Template: Architect Series
    if (templateId.startsWith("insta-architect")) {
      const isEditorial = templateId.includes("-editorial");
      const isBlueprint = templateId.includes("-blueprint");
      const isGallery = templateId.includes("-gallery");

      return (
        <div className={cn(
          "relative w-full h-full overflow-hidden flex flex-col",
          isBlueprint ? "bg-slate-900 geometric-grid" : "bg-white",
          isGallery && "p-8 bg-slate-50"
        )}>
          {/* Main Stage */}
          <div className={cn(
            "relative w-full overflow-hidden transition-all duration-700",
            isEditorial ? "h-[88%] border-b border-slate-100" : (isBlueprint ? "h-[82%] m-2 rounded-xl border border-white/10" : (isGallery ? "h-[92%] rounded-lg shadow-2xl" : "h-full"))
          )}>
            {imageUrl && imageUrl.trim() !== "" && (
              <img 
                src={getProxiedUrl(imageUrl)} 
                alt="" 
                style={{ transform: `scale(${zoom})` }}
                className={cn("w-full h-full object-cover", filterClass, isBlueprint && "opacity-80")} 
                crossOrigin="anonymous" 
              />
            )}
            
            {/* Architectural Overlays */}
            {isBlueprint && (
              <div className="absolute inset-0 border-[20px] border-slate-900/50 pointer-events-none" />
            )}
            
            {/* Premium Logo Placement: Floating Glass Badge */}
            {logoUrl && logoUrl.trim() !== "" && (
              <div className={cn(
                "absolute transition-all duration-500",
                isEditorial ? "bottom-6 right-6" : (isBlueprint ? "top-8 left-8" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2")
              )}>
                <div className={cn(
                  "p-3 rounded-2xl backdrop-blur-xl border border-white/30 shadow-2xl transition-transform hover:scale-110",
                  isEditorial ? "bg-white/80 w-12 h-12 md:w-16 md:h-16" : (isBlueprint ? "w-10 h-10 md:w-14 md:h-14" : "bg-white/90 w-16 h-16 md:w-24 md:h-24")
                )} style={isBlueprint && !isEditorial ? { backgroundColor: `${accentColor}E6` } : undefined}>
                  <img src={getProxiedUrl(logoUrl)} className="w-full h-full object-contain" alt="" crossOrigin="anonymous" />
                </div>
              </div>
            )}
          </div>

          {/* Copy Architecture */}
          <div className={cn(
            "flex-1 flex flex-col p-4 md:p-6 relative",
            isEditorial ? "bg-white justify-center" : (isBlueprint ? "text-white" : "text-slate-900"),
            isGallery && "items-center text-center px-4 justify-center"
          )}>
            {isBlueprint && (
              <div className="absolute top-0 right-12 w-[1px] h-full bg-white/5 pointer-events-none" />
            )}

            <div className={cn(
              "flex flex-col gap-4",
              isGallery && "max-w-xs mx-auto"
            )}>
              <h2 className={cn(
                "font-display leading-[0.9] tracking-tighter line-clamp-3",
                isEditorial ? "text-3xl md:text-5xl font-light italic" : "text-xl md:text-4vw font-black uppercase",
                getHeadingSize(),
                isBlueprint && "text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400"
              )} style={isBlueprint ? undefined : { color: captionColor }}>
                {headline}
              </h2>

              <div className={cn("flex flex-wrap gap-4 items-center", isEditorial ? "mt-2" : "mt-4")}>
                <span className={cn(
                  "px-3 py-1 text-[8px] font-black uppercase tracking-widest border",
                  isBlueprint ? "border-white/20 text-white/50" : "border-slate-200 text-slate-400"
                )}>
                  Architecture
                </span>
                <span className={cn(
                  "text-[9px] font-bold"
                )} style={{ color: accentColor }}>
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
          
          {/* Blueprint Technical Info */}
          {isBlueprint && (
            <div className="absolute bottom-4 left-8 right-8 flex justify-between items-center opacity-20">
              <span className="text-[6px] font-mono uppercase tracking-widest">34.0522° N, 118.2437° W</span>
              <div className="flex gap-4">
                <div className="w-4 h-[1px] bg-white" />
                <div className="w-4 h-[1px] bg-white" />
                <div className="w-4 h-[1px] bg-white" />
              </div>
              <span className="text-[6px] font-mono uppercase tracking-widest">Asset #88219-B</span>
            </div>
          )}
          {showWatermark && !isBlueprint && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center z-30">
              <div className="flex items-center gap-2 opacity-25 hover:opacity-100 transition-opacity bg-black/5 px-2 py-1 rounded-full backdrop-blur-sm pointer-events-auto">
                <div className="w-4 h-4 bg-white flex items-center justify-center rounded-sm overflow-hidden p-0.5">
                  <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="" />
                </div>
                <span className="text-[6px] font-black uppercase tracking-[0.4em] text-slate-400">Powered by Speelox</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWatermark(false);
                  }}
                  className="p-0.5 hover:bg-black/10 rounded-full"
                >
                  <X className="w-2 h-2 text-slate-400" />
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Template: Modern Variants
    if (templateId.startsWith("insta-modern")) {
      const isBold = templateId.includes("-bold");
      const isClean = templateId.includes("-clean");
      const isDark = templateId.includes("-dark");
      const isBrutalist = templateId.includes("-brutalist");
      const isGradient = templateId.includes("-gradient");
      const isSplit = templateId.includes("-split");
      const isMinimal = templateId.includes("-minimal");
      const isOffset = templateId.includes("-offset");
      const isBadge = templateId.includes("-badge");
      const isFloating = templateId.includes("-floating");

      return (
        <div id="capture-modern" className={cn(
          "relative w-full h-full overflow-hidden flex flex-col",
          isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900",
          isBrutalist && "border-8 border-slate-900",
          isGradient && "bg-gradient-to-br from-slate-50 to-slate-200",
          isFloating && "p-6 bg-slate-950"
        )}>
          {isSplit ? (
            <div className="flex h-full w-full">
              <div className="w-1/2 h-full relative overflow-hidden">
                {imageUrl && imageUrl.trim() !== "" && (
                  <img 
                    src={getProxiedUrl(imageUrl)} 
                    className="w-full h-full object-cover" 
                    alt="" 
                    crossOrigin="anonymous" 
                  />
                )}
              </div>
              <div className="w-1/2 h-full flex flex-col items-center justify-center p-8 bg-slate-900 text-white border-l-4" style={{ borderColor: accentColor, color: captionColor }}>
                <h2 className={cn("font-black uppercase text-center leading-[0.8] tracking-tighter line-clamp-3", getHeadingSize())}>
                  {headline}
                </h2>
              </div>
            </div>
          ) : (
            <>
              <div className={cn(
                "relative w-full overflow-hidden transition-all duration-500",
                isClean ? "h-[94%]" : (isMinimal ? "h-[40%] m-4 bg-slate-100 rounded-lg" : (isOffset ? "h-[92%]" : (isBadge ? "h-[80%]" : (isFloating ? "h-[92%] rounded-t-3xl" : "h-[65%] border-b-4 border-slate-900")))),
                isBold && "border-b-[12px]",
                isDark && "border-slate-800",
                isBrutalist && "border-b-8 border-slate-900"
              )}>
                {imageUrl && imageUrl.trim() !== "" && (
                  <img 
                    src={getProxiedUrl(imageUrl)} 
                    alt="Feature" 
                    style={{ transform: `scale(${zoom})` }}
                    className={cn("w-full h-full object-cover transition-transform duration-500", filterClass, isBrutalist && "grayscale contrast-150")}
                    crossOrigin="anonymous"
                  />
                )}
                {!isClean && !isMinimal && !isFloating && <div className="absolute inset-0 bg-indigo-900/5 mix-blend-multiply" />}
                
                {isFloating && logoUrl && logoUrl.trim() !== "" && (
                  <div className="absolute top-6 left-6 w-12 h-12 md:w-16 md:h-16 bg-white/70 backdrop-blur-md rounded-xl border border-white/20 p-2 md:p-3">
                    <img src={getProxiedUrl(logoUrl)} className="w-full h-full object-contain" alt="" crossOrigin="anonymous" />
                  </div>
                )}
              </div>
              
              <div className={cn(
                "flex-1 flex flex-col items-center justify-center p-6 md:p-10 relative",
                isOffset && "justify-end pb-12",
                (isClean || isMinimal || isOffset) && "items-start px-6 md:px-12",
                isFloating && "bg-white rounded-b-3xl -mt-10 border-t border-slate-100 p-4 md:p-6"
              )}>
                {!isClean && !isMinimal && !isBrutalist && !isFloating && (
                    <div 
                      className={cn(
                        "absolute top-0 w-14 h-14 md:w-20 md:h-20 flex items-center justify-center transform border border-slate-200 bg-white/80 backdrop-blur-sm overflow-hidden",
                        isOffset ? "left-12 -translate-y-1/2 rotate-0" : (isBadge ? "left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full scale-110" : "left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45")
                      )}
                    >
                       {logoUrl && logoUrl.trim() !== "" ? (
                         <img 
                           src={getProxiedUrl(logoUrl)} 
                           alt="Logo" 
                           className={cn(
                             "w-full h-full object-contain p-3",
                             !isOffset && !isBadge && "-rotate-45"
                           )}
                           crossOrigin="anonymous"
                         />
                       ) : (
                         <div style={{ backgroundColor: accentColor }} className="w-4 h-4" />
                       )}
                    </div>
                )}
                
                <div 
                  className={cn(isFloating ? "mt-2" : "mt-4", (isClean || isMinimal || isOffset) ? "text-left" : "text-center", isBrutalist && "w-full")}
                >
                  {(isClean || isMinimal) && logoUrl && logoUrl.trim() !== "" && (
                    <img src={getProxiedUrl(logoUrl)} className="w-10 h-10 md:w-14 md:h-14 object-contain mb-4 md:mb-6" alt="Logo" crossOrigin="anonymous" />
                  )}
                  <h2 className={cn(
                    "font-black tracking-tighter uppercase leading-[0.9] line-clamp-3",
                    isDark ? "text-white" : "text-slate-900",
                    getHeadingSize(),
                    isBold && "italic",
                    isBrutalist && "bg-slate-900 text-white px-4 py-2 inline-block transform -rotate-2",
                    isFloating && "text-slate-950 text-2xl"
                  )} style={isBrutalist ? undefined : { color: captionColor }}>
                    {headline}
                  </h2>
                  {!isClean && !isMinimal && !isBrutalist && !isFloating && !isOffset && (
                    <div className={cn("mt-6 flex items-center gap-2", !isOffset && "justify-center")}>
                      <div className={cn("w-8 h-[1px]", isDark ? "bg-slate-700" : "bg-slate-200")} />
                      <div style={{ backgroundColor: accentColor }} className="w-2 h-2 rounded-full" />
                      <div className={cn("w-8 h-[1px]", isDark ? "bg-slate-700" : "bg-slate-200")} />
                    </div>
                  )}
                  {isMinimal && (
                    <div className="mt-8 flex items-center gap-4">
                      <div style={{ backgroundColor: accentColor }} className="w-12 h-1" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Issue v.01</span>
                    </div>
                  )}

                  {isFloating && (
                    <div className="mt-4 flex items-center gap-2 opacity-30">
                      <div className="w-6 h-[1px] bg-slate-950" />
                      <span className="text-[8px] font-black uppercase tracking-[0.1em]">Read More in Bio</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {showWatermark && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center z-30">
              <div className={cn(
                "flex items-center gap-2 opacity-25 hover:opacity-100 transition-opacity px-2 py-1 rounded-full backdrop-blur-sm pointer-events-auto",
                isDark ? "bg-white/5" : "bg-black/5"
              )}>
                <div className="w-4 h-4 bg-white flex items-center justify-center rounded-sm overflow-hidden p-0.5">
                  <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="" />
                </div>
                <span className={cn(
                  "text-[6px] font-black uppercase tracking-[0.4em]",
                  isDark ? "text-white/30" : "text-slate-400"
                )}>Powered by Speelox</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWatermark(false);
                  }}
                  className="p-0.5 hover:bg-black/10 rounded-full"
                >
                  <X className={cn("w-2 h-2", isDark ? "text-white/30" : "text-slate-400")} />
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return <div className="w-full h-full flex items-center justify-center bg-slate-100 text-[10px] uppercase font-bold text-slate-400">Layout not found</div>;
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div 
        className={cn(
          "w-full max-w-lg mx-auto shadow-2xl rounded-sm overflow-hidden relative cursor-pointer group", 
          getAspectClass(), 
          className
        )}
        onClick={() => {
          if (description) {
            setCurrentSlide(prev => (prev === 0 ? 1 : 0));
          }
        }}
      >
        {renderContent()}

        {/* Slide Navigation Overlay Hints */}
        {description && (
          <div className="absolute inset-y-0 right-0 w-12 flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
             <div className="bg-black/20 text-white p-1 rounded-full backdrop-blur-sm">
               <ChevronRight className="w-4 h-4" />
             </div>
          </div>
        )}
      </div>
      {renderSlideIndicators()}
    </div>
  );
};

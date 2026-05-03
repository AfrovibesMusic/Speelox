/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Search, Link as LinkIcon, Rss, Loader2, Sparkles, Send, Download, Image as ImageIcon, CheckCircle2, ChevronRight, ChevronDown, ChevronUp, LayoutTemplate, Settings, User, X, LogIn, LogOut, Save, Share2, AtSign, Zap, Upload, Trash2 } from "lucide-react";
import { Toaster, toast } from 'sonner';
import { toPng } from 'html-to-image';
import imageCompression from 'browser-image-compression';
import { extractContent } from "./services/api";
import { generatePostContent, enhanceImageWithAI } from "./services/gemini";
import { findImageForPost } from "./services/imageSearch";
import { ExtractionResult, ExtractedItem, GeneratedPost, PostTemplate } from "./types";
import { POST_TEMPLATES } from "./constants";
import { TemplateRenderer } from "./components/TemplateRenderer";
import { AuthPage } from "./components/AuthPage";
import { cn } from "./lib/utils";
import { auth, loginWithGoogle, getUserSettings, saveUserSettings, savePostToDatabase, getSavedPosts, deleteSavedPost } from "./services/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

export default function App() {
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState<'link' | 'rss'>('link');
  const [loading, setLoading] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [enrichingIndices, setEnrichingIndices] = useState<Set<number>>(new Set());
  const [selectedItem, setSelectedItem] = useState<ExtractedItem | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PostTemplate>(POST_TEMPLATES[0]);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openSettingsSection, setOpenSettingsSection] = useState<'account' | 'branding' | 'templates' | null>('account');
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [captionColor, setCaptionColor] = useState("#0f172a");
  const [descriptionColor, setDescriptionColor] = useState("#64748b");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'stream' | 'library'>('stream');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryPosts, setLibraryPosts] = useState<GeneratedPost[]>([]);
  const captureRef = useRef<HTMLDivElement>(null);
  const slide1CaptureRef = useRef<HTMLDivElement>(null);
  const slide2CaptureRef = useRef<HTMLDivElement>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userData) => {
      setUser(userData);
      if (userData) {
        try {
          const settings = await getUserSettings(userData.uid);
          if (settings) {
            setLogoUrl(settings.logoUrl || "");
            setPrimaryColor(settings.defaultPrimaryColor || "#4f46e5");
            setCaptionColor(settings.captionColor || "#0f172a");
            setDescriptionColor(settings.descriptionColor || "#64748b");
            setUsername(settings.username || "");
            if (settings.defaultTemplateId) {
              const tpl = POST_TEMPLATES.find(t => t.id === settings.defaultTemplateId);
              if (tpl) setSelectedTemplate(tpl);
            }
          }
        } catch (err) {
          console.error("Failed to load settings", err);
        }
        
        try {
          // Fetch library
          const posts = await getSavedPosts(userData.uid);
          setLibraryPosts(posts);
        } catch (err) {
          console.error("Failed to load library", err);
        }
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const refreshLibrary = async () => {
    if (user) {
      const posts = await getSavedPosts(user.uid);
      setLibraryPosts(posts);
    }
  };

  const [savingSettings, setSavingSettings] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const options = {
        maxSizeMB: 0.2, // 200KB
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      
      const reader = new FileReader();
      reader.readAsDataURL(compressedFile);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        setLogoUrl(base64data);
        setIsUploadingLogo(false);
        toast.success("Brand mark synchronized successfully");
      };
    } catch (err) {
      console.error("Logo upload failed", err);
      setIsUploadingLogo(false);
      toast.error("Asset compression failed");
    }
  };

  const handleSaveSettings = async () => {
    if (!user) {
      await loginWithGoogle();
      return;
    }
    setSavingSettings(true);
    try {
      await saveUserSettings(user.uid, {
        username,
        logoUrl,
        defaultPrimaryColor: primaryColor,
        captionColor,
        descriptionColor,
        defaultTemplateId: selectedTemplate.id
      });
      setIsSettingsOpen(false);
      toast.success("Blueprint settings updated");
    } catch (err) {
      console.error("Failed to save settings", err);
      setError("Failed to save blueprint settings");
      toast.error("Critical: Settings sync failed");
    } finally {
      setSavingSettings(false);
    }
  };

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const placeholders = [
    "Instagram Reel link...",
    "Blog post URL...",
    "Facebook post link...",
    "News article URL...",
    "Portfolio link...",
    "RSS Feed endpoint..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getProxiedUrl = (url: string | null | undefined) => {
    if (!url || !url.trim()) return "";
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setExtractionResult(null);
    setSelectedItem(null);
    setGeneratedPost(null);

    try {
      const result = await extractContent(url, sourceType);
      setExtractionResult(result);
      toast.success("Signals captured successfully");
      
      let enrichedItems: ExtractedItem[] = [];
      
      if (result.type === 'link' || (!result.items && result.title)) {
        const singleItem: ExtractedItem = {
          title: result.title || "Untitled Link",
          description: result.description,
          image: result.image,
          url: result.url || url
        };
        setSelectedItem(singleItem);
        enrichedItems = [singleItem];
        // Auto-generate visual for link
        handleGenerate(singleItem);
      } else if (result.items && result.items.length > 0) {
        enrichedItems = result.items;
        const firstItem = result.items[0];
        setSelectedItem(firstItem);
        // Auto-generate visual for first item in feed
        handleGenerate(firstItem);
      }

      // Background image enrichment for items missing images
      enrichedItems.forEach(async (item, idx) => {
        if (!item.image) {
          setEnrichingIndices(prev => new Set(prev).add(idx));
          const foundImage = await findImageForPost(item.title);
          
          if (foundImage) {
            setExtractionResult(prev => {
              if (!prev) return null;
              if (prev.type === 'link') {
                return { ...prev, image: foundImage };
              }
              const newItems = [...(prev.items || [])];
              if (newItems[idx]) {
                newItems[idx] = { ...newItems[idx], image: foundImage };
              }
              return { ...prev, items: newItems };
            });
            
            // If the currently selected item was missing an image, update it too
            setSelectedItem(prev => {
              if (prev && prev.title === item.title && !prev.image) {
                return { ...prev, image: foundImage };
              }
              return prev;
            });
          }
          
          setEnrichingIndices(prev => {
            const next = new Set(prev);
            next.delete(idx);
            return next;
          });
        }
      });

    } catch (err: any) {
      setError(err.message);
      toast.error(`Extraction Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (item: ExtractedItem) => {
    setGenerating(true);
    try {
      const { headline, caption, description } = await generatePostContent(item.title, item.description || item.content || "");
      setGeneratedPost({
        templateId: selectedTemplate.id,
        headline,
        caption,
        description,
        imageUrl: item.image || "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1000",
        platform: selectedTemplate.platform,
        logoUrl: logoUrl || null,
        styles: {
          primaryColor: primaryColor,
          captionColor: captionColor,
          descriptionColor: descriptionColor,
          headingSize: 'md',
          imageFilter: 'none',
          imageZoom: 1
        }
      });
      // Auto switch to Studio tab on mobile
      if (window.innerWidth < 768) {
        setActiveTab('preview');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleEnhanceImage = async () => {
    if (!generatedPost || !generatedPost.imageUrl) return;
    
    setIsEnhancing(true);
    setError(null);
    try {
      const enhancedUrl = await enhanceImageWithAI(generatedPost.imageUrl, generatedPost.headline);
      setGeneratedPost({
        ...generatedPost,
        imageUrl: enhancedUrl
      });
      toast.success("Visual refinement complete");
    } catch (err: any) {
      console.error("Enhancement failed", err);
      setError("AI Refinement failed. Please try a different source image.");
      toast.error("AI processing interrupted");
    } finally {
      setIsEnhancing(false);
    }
  };

  const updateStyle = (key: keyof NonNullable<GeneratedPost['styles']>, value: any) => {
    setGeneratedPost(prev => {
      if (!prev) return null;
      return {
        ...prev,
        styles: {
          ...(prev.styles || {
            primaryColor: primaryColor,
            headingSize: 'md',
            imageFilter: 'none',
            imageZoom: 1
          }),
          [key]: value
        }
      };
    });
  };

  useEffect(() => {
    if (generatedPost) {
      setGeneratedPost(prev => prev ? { ...prev, logoUrl: logoUrl || null } : null);
    }
  }, [logoUrl]);

  useEffect(() => {
    if (generatedPost) {
      updateStyle('primaryColor', primaryColor);
    }
  }, [primaryColor]);

  useEffect(() => {
    if (generatedPost) {
      updateStyle('captionColor', captionColor);
    }
  }, [captionColor]);

  useEffect(() => {
    if (generatedPost) {
      updateStyle('descriptionColor', descriptionColor);
    }
  }, [descriptionColor]);

  useEffect(() => {
    if (selectedItem && generatedPost && generatedPost.templateId !== selectedTemplate.id) {
       setGeneratedPost(prev => prev ? {
         ...prev,
         templateId: selectedTemplate.id,
         platform: selectedTemplate.platform
       } : null);
    }
  }, [selectedTemplate]);

  const [activeTab, setActiveTab] = useState<'source' | 'preview'>('preview');
  const [isCopyEngineOpen, setIsCopyEngineOpen] = useState(false);

  const mockPost: GeneratedPost = {
    templateId: "",
    headline: "The Future of Digital Curation",
    caption: "Explore how AI is reshaping the way we process and share information.",
    description: "Detailed analysis of how machine learning models specifically curated for aesthetic extraction are redefining high-end brand narratives in 2026. Key insights into generative visual standard and cross-platform synergy.",
    imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1000",
    platform: "instagram",
    logoUrl: logoUrl,
    styles: {
      primaryColor: primaryColor,
      headingSize: 'md',
      imageFilter: 'none',
      imageZoom: 1
    }
  };

  const handleSaveToDatabase = async () => {
    if (!user || !generatedPost) return;
    setSaving(true);
    setError(null);
    try {
      await savePostToDatabase(user.uid, generatedPost);
      await refreshLibrary();
      toast.success("Asset archived to library");
    } catch (err: any) {
      setError("Failed to save to database");
      toast.error("Database sync failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) return;
    
    if (!confirm("Are you sure you want to delete this asset?")) return;

    try {
      await deleteSavedPost(user.uid, postId);
      toast.success("Asset deleted");
      await refreshLibrary();
      if (generatedPost?.id === postId) {
        setGeneratedPost(null);
      }
    } catch (err) {
      toast.error("Deletion failed");
    }
  };

  const handleExport = async () => {
    if (!generatedPost) return;
    setExporting(true);
    
    const exportWidth = 540;
    const exportHeight = 540;

    try {
      const captureSlide = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
        if (!ref.current) return;
        
        // Ensure all images are loaded before capture
        const images = Array.from(ref.current.getElementsByTagName('img')) as HTMLImageElement[];
        await Promise.all(
          images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve; // Continue even if one fails
              setTimeout(resolve, 5000); // Max wait 5s
            });
          })
        );

        // For social posts, we might want to capture a specific frame or just the design overlay
        const dataUrl = await toPng(ref.current, { 
          cacheBust: true, 
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          width: exportWidth,
          height: exportHeight,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left',
            width: `${exportWidth}px`,
            height: `${exportHeight}px`
          }
        });
        
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
        
        // Small delay between downloads to ensure browser triggers them
        await new Promise(resolve => setTimeout(resolve, 500));
      };

      // Capture main slide
      await captureSlide(slide1CaptureRef, `social-gen-main-${Date.now()}.png`);
      
      // Capture description slide if it exists
      if (generatedPost.description) {
        await captureSlide(slide2CaptureRef, `social-gen-summary-${Date.now()}.png`);
      }

      toast.success("Synthesis complete. Assets exported.");
    } catch (err: any) {
      console.error('Export failed', err);
      setError("Failed to export image - CORS or loading issue");
      toast.error("Export sequence failed");
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 bg-white flex items-center justify-center animate-pulse">
          <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="Speelox" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="h-screen bg-slate-100 text-slate-900 font-sans flex flex-col overflow-hidden relative">
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: 'white',
            color: '#0f172a',
            border: '2px solid #e2e8f0',
            borderRadius: '1rem',
            fontFamily: 'inherit',
            fontSize: '10px',
            textTransform: 'uppercase',
            fontWeight: '900',
            letterSpacing: '0.1em',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)'
          }
        }}
      />
      {/* Dynamic Background Accents */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden opacity-30">
        <div className="absolute top-[10%] right-[30%] w-[50rem] h-[50rem] bg-indigo-100/50 rounded-full blur-[150px]" />
        <div className="absolute bottom-[20%] left-[20%] w-[40rem] h-[40rem] bg-slate-200/50 rounded-full blur-[120px]" />
      </div>

      {/* Settings Page Overlay */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col overflow-hidden">
            <header className="fixed top-0 left-0 right-0 h-16 border-b border-slate-200 px-4 md:px-8 flex items-center justify-between bg-white z-50">
               <div className="flex items-center gap-2 md:gap-4">
                 <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                   <X className="w-5 h-5 text-slate-500" />
                 </button>
                 <h2 className="font-black uppercase tracking-[0.2em] text-sm text-slate-900 truncate max-w-[120px] md:max-w-none">Settings</h2>
               </div>
               <div className="flex items-center gap-2 md:gap-4">
                  {user && (
                    <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-slate-200">
                      <div className="text-right">
                        <p className="text-[8px] font-black uppercase text-slate-400">Auth</p>
                        <p className="text-[10px] font-bold">{username ? `@${username}` : user.displayName}</p>
                      </div>
                      {user.photoURL && <img src={user.photoURL} className="w-8 h-8 rounded-full border border-slate-200" alt="" />}
                    </div>
                  )}
                  <button 
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="h-10 px-4 md:px-8 bg-slate-900 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2 rounded-lg"
                  >
                    {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (user ? <Save className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />)}
                    <span className="hidden xs:inline">{user ? 'Save Changes' : 'Login'}</span>
                  </button>
               </div>
            </header>

             <div className="flex-1 overflow-y-auto bg-slate-50/50 relative mt-16">
                <div className="absolute inset-0 geometric-grid opacity-30 pointer-events-none" />
                
                 <div className="max-w-4xl mx-auto p-6 space-y-4 relative z-10">
                   {/* Account Section */}
                   <div className="bg-white rounded-3xl border border-slate-200 studio-shadow overflow-hidden">
                      <button 
                        onClick={() => setOpenSettingsSection(openSettingsSection === 'account' ? null : 'account')}
                        className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100"
                      >
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                               <User className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div className="text-left">
                               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 leading-none">Account Settings</h3>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Identity & Handle Management</p>
                            </div>
                         </div>
                         {openSettingsSection === 'account' ? <ChevronUp className="w-5 h-5 text-slate-300" /> : <ChevronDown className="w-5 h-5 text-slate-300" />}
                      </button>
                      
                      {openSettingsSection === 'account' && (
                        <div className="p-8 bg-white space-y-6 animate-in slide-in-from-top-4 duration-300">
                          <div className="space-y-6">
                            <div className="space-y-2">
                               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">System Handle</span>
                               <div className="relative">
                                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                  <input 
                                     value={username}
                                     onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                     placeholder="Unique handle..."
                                     className="w-full bg-slate-50 border border-slate-100 pl-12 pr-4 py-4 rounded-xl text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-200 transition-all"
                                  />
                               </div>
                               <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tight">Your identifier across the Speelox ecosystem.</p>
                            </div>
                            
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                               {user ? (
                                 <>
                                   <div className="flex items-center gap-3">
                                      {user.photoURL ? <img src={user.photoURL} className="w-10 h-10 rounded-full" alt="" /> : <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-black">?</div>}
                                      <div>
                                         <p className="text-[10px] font-black text-slate-900">{user.displayName}</p>
                                         <p className="text-[9px] font-bold text-slate-400">{user.email}</p>
                                      </div>
                                   </div>
                                   <button onClick={() => auth.signOut()} className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 rounded-lg transition-colors">Sign Out</button>
                                 </>
                               ) : (
                                 <div className="w-full flex flex-col items-center gap-4 py-4">
                                   <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronize settings across devices</p>
                                   <button 
                                     onClick={() => loginWithGoogle()}
                                     className="w-full h-12 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors"
                                   >
                                     <LogIn className="w-4 h-4" />
                                     Connect Identity
                                   </button>
                                 </div>
                               )}
                            </div>
                          </div>
                        </div>
                      )}
                   </div>

                   {/* Branding Section */}
                   <div className="bg-white rounded-3xl border border-slate-200 studio-shadow overflow-hidden">
                      <button 
                        onClick={() => setOpenSettingsSection(openSettingsSection === 'branding' ? null : 'branding')}
                        className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100"
                      >
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                               <Sparkles className="w-5 h-5 text-rose-600" />
                            </div>
                            <div className="text-left">
                               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 leading-none">Branding Assets</h3>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Logo & Color Palette</p>
                            </div>
                         </div>
                         {openSettingsSection === 'branding' ? <ChevronUp className="w-5 h-5 text-slate-300" /> : <ChevronDown className="w-5 h-5 text-slate-300" />}
                      </button>
                      
                      {openSettingsSection === 'branding' && (
                        <div className="p-8 bg-white space-y-8 animate-in slide-in-from-top-4 duration-300">
                           <div className="space-y-4">
                             <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
                                <span>Logo Resource</span>
                                {logoUrl && <span className="text-teal-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Validated</span>}
                             </div>
                             
                             <div className="flex flex-col gap-3">
                                <div className="relative">
                                  <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                  <input 
                                   value={logoUrl.startsWith('data:') ? 'Base64 Encoded Image' : logoUrl}
                                   onChange={(e) => setLogoUrl(e.target.value)}
                                   placeholder="Public image URL or Upload below..."
                                   className="w-full bg-slate-50 border border-slate-100 pl-12 pr-4 py-4 rounded-xl text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/10 focus:border-rose-200 transition-all font-mono"
                                  />
                                </div>
                                
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploadingLogo}
                                    className="flex-1 h-12 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-100 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                                  >
                                    {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />}
                                    {isUploadingLogo ? "Compressing..." : "Upload & Sync Logo"}
                                  </button>
                                  <input 
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleLogoUpload}
                                    accept="image/*"
                                    className="hidden"
                                  />
                                  {logoUrl && (
                                    <button 
                                      onClick={() => setLogoUrl("")}
                                      className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                             </div>

                             <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm overflow-hidden">
                                   {logoUrl ? <img src={logoUrl} className="w-full h-full object-contain p-1" alt="" /> : <ImageIcon className="w-6 h-6 text-slate-200" />}
                                </div>
                                <div className="flex-1">
                                   <p className="text-[9px] font-black text-slate-900 uppercase">Live Preview</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Your persistent brand mark (max 200kb).</p>
                                </div>
                             </div>
                           </div>

                           <div className="space-y-4">
                             <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Atmosphere Tone</span>
                             <div className="grid grid-cols-6 gap-3">
                               {["#4f46e5", "#ef4444", "#10b981", "#f59e0b", "#06b6d4", "#111827"].map(color => (
                                  <button 
                                    key={color}
                                    onClick={() => setPrimaryColor(color)}
                                    className="relative flex items-center justify-center group"
                                  >
                                    <div 
                                      className={cn(
                                        "w-full aspect-square rounded-2xl transition-all shadow-inner",
                                        primaryColor === color ? "scale-100" : "scale-90 opacity-40 group-hover:opacity-100 group-hover:scale-95"
                                      )}
                                      style={{ backgroundColor: color }}
                                    />
                                    {primaryColor === color && (
                                      <div className="absolute inset-0 border-4 border-white/50 rounded-2xl flex items-center justify-center">
                                         <div className="w-2 h-2 bg-white rounded-full shadow-lg" />
                                      </div>
                                    )}
                                  </button>
                               ))}
                             </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-4">
                               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Caption Color</span>
                               <div className="flex flex-wrap gap-2">
                                 {["#0f172a", "#1e293b", "#334155", "#4f46e5", "#7c3aed", "#db2777"].map(color => (
                                   <button
                                     key={color}
                                     onClick={() => setCaptionColor(color)}
                                     className={cn(
                                       "w-8 h-8 rounded-full border-2 transition-all",
                                       captionColor === color ? "border-slate-900 scale-110 shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                                     )}
                                     style={{ backgroundColor: color }}
                                   />
                                 ))}
                                 <input 
                                   type="color" 
                                   value={captionColor}
                                   onChange={(e) => setCaptionColor(e.target.value)}
                                   className="w-8 h-8 rounded-full overflow-hidden cursor-pointer border border-slate-200"
                                 />
                               </div>
                             </div>

                             <div className="space-y-4">
                               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Description Color</span>
                               <div className="flex flex-wrap gap-2">
                                 {["#64748b", "#94a3b8", "#cbd5e1", "#4f46e5", "#a78bfa", "#f472b6"].map(color => (
                                   <button
                                     key={color}
                                     onClick={() => setDescriptionColor(color)}
                                     className={cn(
                                       "w-8 h-8 rounded-full border-2 transition-all",
                                       descriptionColor === color ? "border-slate-900 scale-110 shadow-md" : "border-transparent opacity-60 hover:opacity-100"
                                     )}
                                     style={{ backgroundColor: color }}
                                   />
                                 ))}
                                 <input 
                                   type="color" 
                                   value={descriptionColor}
                                   onChange={(e) => setDescriptionColor(e.target.value)}
                                   className="w-8 h-8 rounded-full overflow-hidden cursor-pointer border border-slate-200"
                                 />
                               </div>
                             </div>
                           </div>
                        </div>
                      )}
                   </div>

                   {/* Template Section */}
                   <div className="bg-white rounded-3xl border border-slate-200 studio-shadow overflow-hidden">
                      <button 
                        onClick={() => setOpenSettingsSection(openSettingsSection === 'templates' ? null : 'templates')}
                        className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100"
                      >
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
                               <LayoutTemplate className="w-5 h-5 text-teal-600" />
                            </div>
                            <div className="text-left">
                               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 leading-none">Template Settings</h3>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Default UI Blueprint Selection</p>
                            </div>
                         </div>
                         {openSettingsSection === 'templates' ? <ChevronUp className="w-5 h-5 text-slate-300" /> : <ChevronDown className="w-5 h-5 text-slate-300" />}
                      </button>
                      
                      {openSettingsSection === 'templates' && (
                        <div className="p-8 bg-white space-y-6 animate-in slide-in-from-top-4 duration-300">
                           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                              {POST_TEMPLATES.map((tpl) => (
                                <div key={tpl.id} className="space-y-2">
                                   <button 
                                     onClick={() => setSelectedTemplate(tpl)}
                                     className={cn(
                                       "w-full rounded-2xl border-2 relative overflow-hidden transition-all group aspect-square",
                                       selectedTemplate.id === tpl.id ? "border-indigo-600 ring-4 ring-indigo-50" : "border-slate-50 hover:border-slate-200"
                                     )}
                                   >
                                      <div className={cn(
                                        "absolute inset-0 pointer-events-none origin-top-left transition-all scale-[0.4] w-[250%] h-[250%]",
                                        selectedTemplate.id === tpl.id ? "opacity-100" : "opacity-80 group-hover:opacity-100"
                                      )}>
                                         <TemplateRenderer post={{ ...mockPost, templateId: tpl.id }} />
                                      </div>
                                      {selectedTemplate.id === tpl.id && (
                                        <div className="absolute top-3 right-3 bg-indigo-600 text-white p-1 rounded-full shadow-lg z-20">
                                           <CheckCircle2 className="w-2.5 h-2.5" />
                                        </div>
                                      )}
                                   </button>
                                   <p className={cn(
                                     "text-[8px] font-black uppercase text-center tracking-widest truncate",
                                     selectedTemplate.id === tpl.id ? "text-indigo-600" : "text-slate-400"
                                   )}>{tpl.name}</p>
                                </div>
                              ))}
                           </div>
                        </div>
                      )}
                   </div>
                </div>
             </div>
          </div>
        )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[72px] border-b border-slate-200/60 bg-white/70 backdrop-blur-xl z-50 px-4 md:px-12 flex items-center justify-between inner-glow">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white flex items-center justify-center shadow-[0_4px_20px_rgba(253,89,73,0.15)] overflow-hidden rounded-lg p-2 border border-slate-50">
            <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="Speelox" />
          </div>
          <div className="">
            <h1 className="font-display font-black text-lg md:text-xl tracking-tighter uppercase leading-none">Speelox</h1>
            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mt-0.5">Content Studio</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 bg-white shadow-sm"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative mt-[72px]">
        {/* Left Sidebar (Source Selection) - Fixed on Desktop */}
        <aside className={cn(
          "bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 z-40 shadow-xl shadow-slate-200/20",
          activeTab === 'source' ? "fixed inset-0 top-[72px] bottom-0 w-full bg-white" : "hidden md:flex md:relative md:w-80 h-full",
          "md:h-[calc(100vh-72px)] md:sticky md:top-0"
        )}>
          <div className="flex-1 overflow-y-auto">
            <div className="p-8 border-b border-slate-100 space-y-6">
            <form onSubmit={handleExtract} className="space-y-3">
              <div className="space-y-3">
                <div className="relative group p-[1px] rounded-xl overflow-hidden shadow-[0_0_20px_rgba(253,89,73,0.1)]">
                  {/* Animated Border Layer - Permanently Visible */}
                  <div className="absolute inset-[-200%] instagram-gradient animate-border-rotate opacity-100" />
                  
                  <div className="relative bg-white rounded-[11px] overflow-hidden flex items-center">
                    <div className="absolute left-3 text-slate-400 z-10 transition-colors group-focus-within:text-indigo-500">
                      {sourceType === 'link' ? <LinkIcon className="w-3.5 h-3.5" /> : <Rss className="w-3.5 h-3.5" />}
                    </div>
                    <input 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={placeholders[placeholderIndex]}
                      className="w-full pl-10 pr-4 py-3.5 text-[10px] font-bold tracking-tight border-none focus:outline-none bg-white transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              </div>
              <button 
                disabled={loading || !url}
                className="w-full instagram-gradient text-white text-[10px] font-black py-4 rounded-xl uppercase tracking-[0.2em] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/10 group"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />}
                {loading ? "Synthesizing..." : "Generate Content"}
              </button>
            </form>
          </div>

          <div className="flex-1 p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex gap-4">
                <button 
                  onClick={() => setSidebarMode('stream')}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.3em] transition-all relative pb-2",
                    sidebarMode === 'stream' ? "text-slate-900" : "text-slate-300"
                  )}
                >
                  Intelligence
                  {sidebarMode === 'stream' && <div className="absolute bottom-0 left-0 w-full h-[3px] instagram-gradient rounded-full" />}
                </button>
                <button 
                  onClick={() => setSidebarMode('library')}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.3em] transition-all relative pb-2",
                    sidebarMode === 'library' ? "text-slate-900" : "text-slate-300"
                  )}
                >
                  Library
                  {sidebarMode === 'library' && <div className="absolute bottom-0 left-0 w-full h-[3px] instagram-gradient rounded-full" />}
                </button>
              </div>
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                {sidebarMode === 'stream' ? (extractionResult?.items?.length || (extractionResult ? 1 : 0)) : libraryPosts.length} Assets
              </span>
            </div>
            
            <div className="space-y-3">
              {sidebarMode === 'stream' ? (
                extractionResult ? (
                  <div className="space-y-3">
                    {extractionResult.items ? (
                      extractionResult.items.map((item, idx) => (
                        <button 
                          key={idx}
                          onClick={() => {
                            setSelectedItem(item);
                            setGeneratedPost(null);
                            if (window.innerWidth < 768) setActiveTab('preview');
                          }}
                          className={cn(
                            "w-full text-left p-4 rounded-2xl border transition-all flex gap-4 items-center group relative overflow-hidden",
                            selectedItem === item 
                              ? "border-slate-900 bg-slate-900 text-white studio-shadow" 
                              : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
                          )}
                        >
                          <div className={cn(
                            "w-12 h-12 rounded-xl overflow-hidden shrink-0 border flex items-center justify-center transition-all",
                            selectedItem === item ? "border-slate-800" : "border-slate-100"
                          )}>
                            {item.image && item.image.trim() !== "" ? (
                              <img src={item.image} alt="" className="w-full h-full object-cover transition-all group-hover:scale-110" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                {enrichingIndices.has(idx) ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600/40" />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-400 opacity-30" />
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                             <h3 className="font-bold text-[10px] leading-tight line-clamp-2 uppercase tracking-wide">{item.title}</h3>
                             <p className="text-[8px] mt-1 uppercase font-black tracking-widest text-slate-400">
                               {item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Signals Active'}
                             </p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <button 
                        onClick={() => {
                          const item: ExtractedItem = {
                            title: extractionResult.title,
                            description: extractionResult.description,
                            image: extractionResult.image,
                            url: extractionResult.url
                          };
                          setSelectedItem(item);
                          setGeneratedPost(null);
                        }}
                        className={cn(
                          "w-full text-left p-4 rounded-2xl border transition-all flex gap-4 items-center group relative overflow-hidden",
                          selectedItem?.title === extractionResult.title 
                            ? "border-slate-900 bg-slate-900 text-white studio-shadow" 
                            : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
                        )}
                      >
                          <div className={cn(
                            "w-12 h-12 rounded-xl overflow-hidden shrink-0 border flex items-center justify-center",
                            selectedItem?.title === extractionResult.title ? "border-slate-800" : "border-slate-100"
                          )}>
                            {extractionResult.image && extractionResult.image.trim() !== "" ? (
                              <img src={getProxiedUrl(extractionResult.image)} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                {enrichingIndices.has(0) ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600/40" />
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-400 opacity-30" />
                                )}
                              </div>
                            )}
                          </div>
                         <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-[10px] leading-tight line-clamp-2 uppercase tracking-wide">{extractionResult.title}</h3>
                            <p className="text-[8px] mt-1 uppercase font-black tracking-widest text-slate-400">Primary extraction</p>
                         </div>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-10 text-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Connect Source</p>
                    <p className="text-[9px] text-slate-300 mt-2 tracking-tight uppercase font-bold">Awaiting content signals</p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {libraryPosts.length > 0 ? (
                    libraryPosts.map((post) => (
                      <div key={post.id} className="relative group">
                        <button 
                          onClick={() => {
                            setGeneratedPost(post);
                            setSelectedItem(null);
                            if (window.innerWidth < 768) setActiveTab('preview');
                          }}
                          className={cn(
                            "w-full text-left p-4 rounded-2xl border transition-all flex gap-4 items-center overflow-hidden",
                            generatedPost?.id === post.id 
                              ? "border-slate-900 bg-slate-900 text-white studio-shadow" 
                              : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
                          )}
                        >
                           <div className={cn(
                             "w-12 h-12 rounded-xl overflow-hidden shrink-0 border flex items-center justify-center",
                             generatedPost?.id === post.id ? "border-slate-800" : "border-slate-100"
                           )}>
                              {post.imageUrl && post.imageUrl.trim() !== "" ? (
                                <img src={getProxiedUrl(post.imageUrl)} alt="" className="w-full h-full object-cover grayscale" crossOrigin="anonymous" />
                              ) : (
                                <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                  <LayoutTemplate className="w-5 h-5 text-slate-300" />
                                </div>
                              )}
                           </div>
                           <div className="flex-1 min-w-0 pr-8">
                              <h3 className="font-bold text-[10px] leading-tight line-clamp-2 uppercase tracking-wide">{post.headline}</h3>
                              <p className="text-[8px] mt-1 uppercase font-black tracking-widest text-slate-400">Saved Asset</p>
                           </div>
                        </button>
                        <button 
                          onClick={(e) => post.id && handleDeletePost(e, post.id)}
                          className={cn(
                            "absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg",
                            generatedPost?.id === post.id ? "text-white/30" : "text-slate-300"
                          )}
                          title="Delete Asset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-10 text-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-slate-400">
                      <p className="text-[10px] font-black uppercase tracking-widest">Library Empty</p>
                      <p className="text-[9px] mt-2 font-bold opacity-60 uppercase tracking-tighter">No assets archived yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto hidden md:block">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-tight">
              <span>Usage</span>
              <span>12/50 Posts</span>
            </div>
            <div className="w-full bg-slate-200 h-1 mt-2">
              <div className="w-[24%] bg-indigo-600 h-full transition-all duration-500" />
            </div>
          </div>
        </div>
      </aside>

        {/* Main Content Area (Preview Stage) */}
        <main className={cn(
          "flex-1 relative overflow-y-auto geometric-grid flex flex-col transition-all duration-500 z-10 bg-slate-50/40",
          activeTab === 'preview' ? "flex" : "hidden md:flex"
        )}>
          {/* Generation Loading Overlay - Mobile Only */}
          {generating && (
            <div className="absolute inset-0 z-[60] bg-white/40 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300 md:hidden">
              <div className="w-20 h-20 bg-white shadow-2xl rounded-2xl flex items-center justify-center animate-pulse overflow-hidden p-4 mb-6">
                <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="Speelox" />
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-col items-center">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-900 leading-none">Architecting Post</h3>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-3 opacity-60">Synthesizing Semantic Layer</p>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}
          <div className="flex-none min-h-full flex flex-col items-center p-4 md:p-12 pt-12 pb-32 md:py-32 w-full">
              {(selectedItem || generatedPost) ? (
                <div 
                  key={selectedItem?.title || generatedPost?.id}
                  className="w-full flex items-center justify-center"
                >
                  <div className="flex flex-col items-center justify-center gap-8 md:gap-12 w-full max-w-2xl">
                    {/* Post Preview Canvas */}
                    <div className="w-full max-w-[480px] bg-white studio-shadow p-0 relative border border-slate-200 md:ring-offset-[16px] ring-offset-slate-100">
                       {generating ? (
                         <div className="aspect-square bg-slate-50 flex flex-col p-8 space-y-6 animate-pulse">
                            <div className="w-full h-2/3 bg-slate-200 rounded-2xl" />
                            <div className="space-y-3">
                               <div className="w-3/4 h-6 bg-slate-200 rounded-lg" />
                               <div className="w-1/2 h-4 bg-slate-200 rounded-lg opacity-60" />
                            </div>
                            <div className="flex gap-2">
                               <div className="w-8 h-8 rounded-full bg-slate-200" />
                               <div className="w-24 h-4 bg-slate-200 rounded-lg mt-2" />
                            </div>
                         </div>
                       ) : generatedPost ? (
                         <div className="relative group" ref={captureRef}>
                             {isEnhancing && (
                                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center transition-all z-20">
                                   <div className="relative">
                                      <div className="absolute inset-0 animate-ping bg-indigo-500 rounded-full opacity-30" />
                                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl relative z-10">
                                         <Zap className="w-8 h-8 text-indigo-600 animate-pulse fill-current" />
                                      </div>
                                   </div>
                                   <div className="mt-8 space-y-3">
                                      <h3 className="text-white text-[14px] font-black uppercase tracking-[0.4em]">Optic Refinement</h3>
                                      <p className="text-indigo-100/60 text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-[200px]">Gemini is reconstructing your visual blueprint for maximum fidelity...</p>
                                   </div>
                                </div>
                             )}
                            <TemplateRenderer post={generatedPost} />
                            <div className="absolute inset-0 border-4 border-indigo-600/0 group-hover:border-indigo-600/20 transition-all pointer-events-none" />
                         </div>
                       ) : (
                         <div className="aspect-square bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-slate-400 text-center p-12">
                            <div className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center mb-6">
                              <ImageIcon className="w-8 h-8 opacity-20" />
                            </div>
                            <h4 className="text-sm font-black uppercase tracking-[0.2em] mb-2 text-slate-800">Visual Stage</h4>
                            <p className="text-[10px] font-medium uppercase tracking-widest max-w-[200px] leading-relaxed">Select source content and trigger generation to reveal layout</p>
                         </div>
                       )}
                    </div>

                     {generatedPost && (
                       <div className="w-full max-w-2xl mt-8">
                         <div className="bg-white rounded-[2rem] border border-slate-200 studio-shadow overflow-hidden">
                            <button 
                              onClick={() => setIsCopyEngineOpen(!isCopyEngineOpen)}
                              className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex flex-col items-start gap-1">
                                <h3 className="font-display font-black text-[10px] uppercase tracking-[0.4em] text-slate-400">Copy Engine</h3>
                                <p className="text-[8px] text-slate-300 uppercase tracking-widest font-bold">Semantic Layer</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                  {isCopyEngineOpen ? 'Hide Controls' : 'Show Controls'}
                                </span>
                                {isCopyEngineOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </button>
 
                            {isCopyEngineOpen && (
                              <div className="overflow-hidden">
                                <div className="p-8 pt-0 space-y-8 border-t border-slate-50">
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Typography Layer</label>
                                      <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Main Headline</span>
                                    </div>
                                    <textarea 
                                      value={generatedPost.headline}
                                      onChange={(e) => setGeneratedPost({ ...generatedPost, headline: e.target.value })}
                                      className="w-full bg-slate-50/50 border border-slate-100 rounded-[1rem] p-4 text-[11px] font-bold uppercase tracking-tight focus:outline-none focus:ring-4 focus:ring-indigo-500/5 resize-none h-24 shadow-inner transition-all"
                                    />
                                  </div>
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Publication Copy</label>
                                      <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Platform Caption</span>
                                    </div>
                                    <textarea 
                                      rows={4}
                                      value={generatedPost.caption}
                                      onChange={(e) => setGeneratedPost({ ...generatedPost, caption: e.target.value })}
                                      className="w-full bg-slate-50/50 border border-slate-100 rounded-[1rem] p-4 text-[10px] font-medium leading-relaxed focus:outline-none focus:ring-4 focus:ring-indigo-500/5 resize-none h-32 shadow-inner transition-all"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-3">
                              <button 
                                onClick={handleSaveToDatabase}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 rounded-xl transition-all"
                                title="Save to Library"
                              >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Library</span>
                              </button>
                              <button 
                                onClick={handleExport}
                                disabled={exporting}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-slate-800 transition-all shadow-sm"
                              >
                                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                                Publish
                              </button>
                            </div>
                            <div className="p-4 pt-0 bg-slate-50/50">
                              <button 
                                onClick={handleEnhanceImage}
                                disabled={isEnhancing}
                                className="w-full h-11 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                              >
                                {isEnhancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                                {isEnhancing ? "Refining..." : "Enhance with AI"}
                              </button>
                            </div>
                         </div>
                       </div>
                     )}
                  </div>
                </div>
              ) : (
                <div className="text-center p-12 bg-white rounded-[3rem] studio-shadow border border-slate-200 max-w-md mx-auto relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10">
                    <div className="w-24 h-24 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center justify-center mx-auto mb-8 transform -rotate-12 group-hover:rotate-0 transition-transform overflow-hidden rounded-2xl p-4">
                      <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="Speelox" />
                    </div>
                    <h3 className="text-2xl font-black font-display uppercase tracking-tighter text-slate-800">Synthetic Studio</h3>
                    <p className="text-[11px] font-bold text-slate-400 mt-4 uppercase tracking-[0.2em] leading-relaxed max-w-[220px] mx-auto">
                      Ingest source content to initiate social architecture.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </main>



        {/* Mobile Navigation Bar (Studio Mode) */}
        <div className="md:hidden fixed bottom-6 left-6 right-6 h-16 bg-white/90 backdrop-blur-xl rounded-2xl flex items-center justify-around z-50 shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-slate-200 border-2">
          <button 
            onClick={() => setActiveTab('source')}
            className={cn("flex flex-col items-center gap-1 transition-all", activeTab === 'source' ? "text-red-500 scale-110" : "text-slate-500")}
          >
            <Rss className="w-5 h-5" />
            <span className="text-[7px] font-black uppercase tracking-widest">Source</span>
          </button>
          
          {showInstallPrompt && (
            <button 
              onClick={handleInstallClick}
              className="flex flex-col items-center gap-1 text-slate-900 bg-red-50 px-3 py-1 rounded-xl border border-red-100"
            >
              <Download className="w-5 h-5 text-red-500" />
              <span className="text-[7px] font-black uppercase tracking-widest">App</span>
            </button>
          )}

          <button 
            onClick={() => setActiveTab('preview')}
            className={cn("flex flex-col items-center gap-1 transition-all", activeTab === 'preview' ? "text-red-500 scale-110" : "text-slate-500")}
          >
            <LayoutTemplate className="w-5 h-5" />
            <span className="text-[7px] font-black uppercase tracking-widest">Studio</span>
          </button>
        </div>

        {/* Hidden Capture Area for Multi-Slide Export */}
        <div className="fixed -left-[10000px] -top-[10000px] pointer-events-none" aria-hidden="true">
          <div 
            ref={slide1CaptureRef} 
            style={{ 
              width: '540px', 
              height: '540px', 
              position: 'relative' 
            }}
          >
             {generatedPost && (
               <TemplateRenderer 
                 post={generatedPost} 
                 slideIndex={0} 
                 className="max-w-none shadow-none rounded-none m-0 p-0 border-0 w-[540px] h-[540px]"
               />
             )}
          </div>
          {generatedPost?.description && (
            <div ref={slide2CaptureRef} style={{ width: '540px', height: '540px', position: 'relative' }}>
               <TemplateRenderer 
                 post={generatedPost} 
                 slideIndex={1} 
                 className="w-[540px] h-[540px] max-w-none shadow-none rounded-none m-0 p-0 border-0" 
               />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export type ContentType = 'link' | 'rss';

export interface ExtractedItem {
  title: string;
  content?: string;
  description?: string;
  image?: string | null;
  link?: string;
  url?: string;
  pubDate?: string;
}

export interface ExtractionResult {
  type: ContentType;
  title: string;
  items?: ExtractedItem[]; // For RSS
  description?: string; // For single link
  image?: string | null; // For single link
  url?: string; // For single link
}

export interface PostTemplate {
  id: string;
  name: string;
  platform: 'instagram' | 'facebook';
  aspectRatio: '1:1' | '4:5' | '1.91:1';
  style: 'modern' | 'minimal' | 'bold' | 'magazine' | 'modern-bold' | 'modern-clean' | 'modern-dark' | 'modern-brutalist' | 'modern-gradient' | 'modern-split' | 'modern-minimal' | 'modern-offset' | 'modern-badge' | 'modern-floating' | 'architect-editorial' | 'architect-blueprint' | 'architect-gallery';
}

export interface PostStyles {
  primaryColor: string;
  captionColor?: string;
  descriptionColor?: string;
  headingSize: 'sm' | 'md' | 'lg' | 'xl';
  imageFilter: 'none' | 'grayscale' | 'sepia' | 'contrast';
  imageZoom: number;
}

export interface GeneratedPost {
  id?: string;
  templateId: string;
  headline: string;
  caption: string;
  description?: string;
  imageUrl: string | null;
  platform: 'instagram' | 'facebook';
  styles?: PostStyles;
  logoUrl?: string | null;
}

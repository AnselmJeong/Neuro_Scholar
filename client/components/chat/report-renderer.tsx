import React, { useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Link as LinkIcon, Maximize2, Download } from 'lucide-react';
import JSZip from 'jszip';
import { CodeExecutor } from '@/components/chat/code-executor';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ReportRendererProps {
  content: string;
  showExport?: boolean;
  title?: string;
}

interface Source {
  title: string;
  url: string;
}

interface ContentPart {
  type: 'text' | 'code' | 'image';
  content?: string;
  url?: string;
  title?: string;
}

interface Section {
  title: string;
  parts: ContentPart[];
  sources: Source[];
}

// Convert DOI references to clickable links
function convertDoiToLinks(text: string): string {
  // Match patterns like (DOI: 10.xxxx/xxxxx) or DOI: 10.xxxx/xxxxx
  const doiPattern = /\(DOI:\s*(10\.[^\s,;\)\]]+)\)|(?<!\[)DOI:\s*(10\.[^\s,;\)\]]+)/gi;
  return text.replace(doiPattern, (match, doi1, doi2) => {
    const doi = doi1 || doi2;
    const url = `https://doi.org/${doi}`;
    if (match.startsWith('(')) {
      return `([DOI: ${doi}](${url}))`;
    }
    return `[DOI: ${doi}](${url})`;
  });
}

// Convert content to clean markdown for export
function contentToMarkdown(content: string, title?: string): string {
  let markdown = '';

  if (title) {
    markdown += `# ${title}\n\n`;
  }

  const sections = parseXML(content);

  if (!sections.length && content) {
    // Raw content without sections
    return markdown + convertDoiToLinks(content);
  }

  for (const section of sections) {
    if (section.title) {
      markdown += `## ${section.title}\n\n`;
    }

    for (const part of section.parts) {
      if (part.type === 'text' && part.content) {
        markdown += convertDoiToLinks(part.content) + '\n\n';
      } else if (part.type === 'code' && part.content) {
        markdown += '```\n' + part.content + '\n```\n\n';
      } else if (part.type === 'image' && part.url) {
        markdown += `![${part.title || 'Image'}](${part.url})\n\n`;
      }
    }

    if (section.sources.length > 0) {
      markdown += '### Sources\n\n';
      for (const source of section.sources) {
        markdown += `- [${source.title}](${source.url})\n`;
      }
      markdown += '\n';
    }
  }

  return markdown;
}

function sanitizeBaseFilename(title?: string): string {
  const date = new Date().toISOString().split('T')[0];
  const base = (title || 'research-report').trim() || 'research-report';
  const safe = base
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${safe || 'research-report'}-${date}`;
}

function escapeBibValue(value: string): string {
  return value.replace(/[{}]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim();
}

function toBibtexKey(doi: string, index: number): string {
  const normalized = doi.replace(/^https?:\/\/doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  const key = normalized.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return key ? `doi_${key}` : `ref_${index + 1}`;
}

function buildBibFromMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\s*##\s*(References|참고문헌)\s*$/i.test(line));
  if (headerIndex === -1) return '';

  const refLines: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^\s*##\s+/.test(line)) break;
    if (line.startsWith('- ')) refLines.push(line);
  }

  const entries: string[] = [];
  refLines.forEach((line, index) => {
    const doiMatch =
      line.match(/\[DOI:\s*([^\]\s]+)\]/i) ||
      line.match(/https?:\/\/doi\.org\/([^\s)\]]+)/i) ||
      line.match(/\b(10\.\d{4,}\/[^\s,;\])]+)\b/i);

    if (!doiMatch) return;

    const doi = doiMatch[1].replace(/[).,;]+$/, '').trim();
    const main = line.replace(/^-+\s*/, '').trim();
    const segments = main.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
    const authors = segments[0] || 'Unknown';
    const yearMatch = main.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : '';
    const title = segments.length > 2 ? segments[2].replace(/\*+/g, '') : '';
    const journalMatch = main.match(/\*([^*]+)\*/);
    const journal = journalMatch ? journalMatch[1] : '';
    const key = toBibtexKey(doi, index);

    const fields: string[] = [];
    fields.push(`  doi = "${escapeBibValue(doi)}"`);
    if (title) fields.push(`  title = "${escapeBibValue(title)}"`);
    if (authors && authors.toLowerCase() !== 'unknown') fields.push(`  author = "${escapeBibValue(authors)}"`);
    if (journal) fields.push(`  journal = "${escapeBibValue(journal)}"`);
    if (year) fields.push(`  year = "${year}"`);

    entries.push(`@article{${key},\n${fields.join(',\n')}\n}`);
  });

  return entries.join('\n\n');
}

export function ReportRenderer({ content, showExport = false, title }: ReportRendererProps) {
  const sections = useMemo(() => parseXML(content), [content]);

  // Process content to convert DOI links
  const processedContent = useMemo(() => convertDoiToLinks(content), [content]);

  const handleExport = useCallback(async () => {
    const markdown = contentToMarkdown(content, title);
    const bib = buildBibFromMarkdown(markdown);
    const baseFilename = sanitizeBaseFilename(title);

    const zip = new JSZip();
    zip.file(`${baseFilename}.md`, markdown);
    zip.file(`${baseFilename}.bib`, bib || '% No references section found or DOI entries detected.');

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseFilename}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [content, title]);

  if (!sections.length && content) {
    // Fallback if parsing fails or no sections yet but there is content
    // This might happen if the model outputs raw text before the first section
    return (
      <div>
        <div className="prose prose-zinc dark:prose-invert max-w-none text-foreground/90">
           <ReactMarkdown rehypePlugins={[rehypeRaw]}>{processedContent}</ReactMarkdown>
        </div>
        {showExport && (
          <div className="flex justify-end mt-6">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {sections.map((section, idx) => (
        <div key={idx} className="group">
          {section.title && (
            <h2 className="text-2xl font-semibold mb-4 text-foreground flex items-center gap-2">
              {section.title}
            </h2>
          )}
          
          <div className="space-y-4 mb-4">
             {section.parts.map((part, pIdx) => {
               if (part.type === 'text') {
                 return (
                   <div key={pIdx} className="prose prose-zinc dark:prose-invert max-w-none text-foreground/90 leading-relaxed break-words overflow-x-auto">
                     <ReactMarkdown
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          // Custom link rendering to open in new tab
                          a: ({ node, ...props }) => (
                            <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80" />
                          ),
                        }}
                     >
                        {convertDoiToLinks(part.content || '')}
                     </ReactMarkdown>
                   </div>
                 );
               } else if (part.type === 'code') {
                 return <CodeExecutor key={pIdx} code={part.content || ''} />;
               } else if (part.type === 'image') {
                 return (
                   <div key={pIdx} className="my-6 flex flex-col items-center">
                     <Dialog>
                       <div className="relative group w-fit">
                         <img 
                           src={part.url} 
                           alt={part.title || 'Illustration'} 
                           className="rounded-lg shadow-md max-w-full h-auto mx-auto border border-border/50"
                         />
                         <DialogTrigger asChild>
                           <Button 
                             variant="outline" 
                             size="icon" 
                             className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
                             aria-label="Maximize Image"
                           >
                             <Maximize2 className="h-4 w-4" />
                           </Button>
                         </DialogTrigger>
                       </div>
                       <DialogContent className="max-w-[95vw] h-[95vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center pointer-events-none">
                         <DialogTitle className="sr-only">Image View</DialogTitle>
                         <DialogDescription className="sr-only">Full screen image view</DialogDescription>
                         <div className="relative pointer-events-auto">
                            <img 
                              src={part.url} 
                              alt={part.title || 'Illustration'} 
                              className="max-w-[95vw] max-h-[95vh] object-contain rounded-md"
                            />
                         </div>
                       </DialogContent>
                     </Dialog>
                     {part.title && <p className="text-center text-sm text-muted-foreground mt-2">{part.title}</p>}
                   </div>
                 );
               }
               return null;
             })}
          </div>

          {section.sources.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
               {section.sources.map((source, sIdx) => (
                 <a 
                   key={sIdx}
                   href={source.url}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground no-underline border border-transparent hover:border-border"
                   title={source.title}
                 >
                   <LinkIcon className="w-3 h-3" />
                   <span className="truncate max-w-[200px]">{source.title}</span>
                 </a>
               ))}
            </div>
          )}
        </div>
      ))}
      {showExport && sections.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>
      )}
    </div>
  );
}

function parseXML(xml: string): Section[] {
  if (!xml) return [];

  const sections: Section[] = [];
  
  // Split by <section to define boundaries
  const parts = xml.split('<section');
  
  // If no sections found, but content exists, return one section with all content
  if (parts.length === 1 && xml.trim().length > 0) {
     return [{ title: '', parts: [{type: 'text', content: xml}], sources: [] }];
  }

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    // Extract title
    const titleMatch = part.match(/title="(.*?)"/);
    const title = titleMatch ? titleMatch[1] : '';
    
    let body = part;
    const sourcesStart = part.indexOf('<sources>');
    let sources: Source[] = [];
    
    if (sourcesStart !== -1) {
       body = part.substring(0, sourcesStart);
       const sourcesBlock = part.substring(sourcesStart);
       
       // Parse sources
       const linkRegexGlobal = /<link\s+url="([^"]*)"\s+title="([^"]*)"\s*\/>/g;
       let match;
       while ((match = linkRegexGlobal.exec(sourcesBlock)) !== null) {
         sources.push({ url: match[1], title: match[2] });
       }
    } else {
       body = part.replace('</section>', '');
    }

    // Refine body start (after section tag close)
    const sectionTagEnd = part.indexOf('>');
    if (sectionTagEnd !== -1) {
       const actualBodyStart = sectionTagEnd + 1;
       const actualBodyEnd = sourcesStart !== -1 ? sourcesStart : part.lastIndexOf('</section>');
       
       if (actualBodyEnd > actualBodyStart) {
           body = part.substring(actualBodyStart, actualBodyEnd);
       } else if (actualBodyEnd === -1) {
           // If streaming and no end tag yet
           body = part.substring(actualBodyStart); 
       } else {
           // Empty body or malformed
           body = "";
       }
    }

    const contentParts: ContentPart[] = [];
    
    // Regex to find tags: <text>...</text>, <code>...</code>, <image ... />
    const tagRegex = /<(text|code)>([\s\S]*?)<\/\1>|<image\s+([^>]*?)\s*\/>/g;
    
    // Check if we find any tags
    if (!body.match(tagRegex)) {
        // Fallback: treat as text if no tags found (legacy or streaming partial)
        if (body.trim().length > 0) {
             contentParts.push({ type: 'text', content: body });
        }
    } else {
        let match;
        while ((match = tagRegex.exec(body)) !== null) {
            if (match[1] === 'text') {
                const textContent = match[2];
                const parts = textContent.split(/(<code>[\s\S]*?<\/code>)/g);
                
                parts.forEach(part => {
                    if (part.startsWith('<code>') && part.endsWith('</code>')) {
                        const codeContent = part.substring(6, part.length - 7);
                        if (codeContent.trim()) {
                            contentParts.push({ type: 'code', content: codeContent.trim() });
                        }
                    } else if (part.trim()) {
                        contentParts.push({ type: 'text', content: part.trim() });
                    }
                });
            } else if (match[1] === 'code') {
                contentParts.push({ type: 'code', content: match[2].trim() });
            } else if (match[0].startsWith('<image')) {
                const attrs = match[3];
                const srcMatch = attrs.match(/src="([^"]*)"/);
                const altMatch = attrs.match(/alt="([^"]*)"/);
                if (srcMatch) {
                    contentParts.push({ 
                        type: 'image', 
                        url: srcMatch[1], 
                        title: altMatch ? altMatch[1] : '' 
                    });
                }
            }
        }
    }
    
    sections.push({ title, parts: contentParts, sources });
  }
  
  return sections;
}

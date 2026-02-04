import * as fs from 'fs';
import * as path from 'path';

// Note: pdf-parse will be installed as a dependency
// For now, we'll have a placeholder that can be enhanced

export interface ParsedFile {
  content: string;
  metadata: {
    pages?: number;
    title?: string;
    author?: string;
    [key: string]: any;
  };
}

export class FileParser {
  /**
   * Parse a file and extract text content
   */
  async parse(filePath: string): Promise<ParsedFile> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.parsePDF(filePath);
      case '.md':
      case '.qmd':
        return this.parseMarkdown(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  /**
   * Parse PDF file and extract text
   */
  private async parsePDF(filePath: string): Promise<ParsedFile> {
    try {
      // Dynamic import to avoid issues if pdf-parse is not installed
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);

      return {
        content: data.text,
        metadata: {
          pages: data.numpages,
          title: data.info?.Title || undefined,
          author: data.info?.Author || undefined,
          creator: data.info?.Creator || undefined,
          producer: data.info?.Producer || undefined,
        },
      };
    } catch (error: any) {
      // If pdf-parse is not available, throw a helpful error
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('PDF parsing not available. Please install pdf-parse: npm install pdf-parse');
      }
      throw error;
    }
  }

  /**
   * Parse Markdown/Quarto file
   */
  private async parseMarkdown(filePath: string): Promise<ParsedFile> {
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Extract YAML frontmatter if present
    let metadata: ParsedFile['metadata'] = {};
    let content = raw;

    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      // Parse simple YAML frontmatter
      const yamlContent = frontmatterMatch[1];
      metadata = this.parseSimpleYaml(yamlContent);
      content = raw.slice(frontmatterMatch[0].length).trim();
    }

    return { content, metadata };
  }

  /**
   * Simple YAML parser for frontmatter
   * Handles basic key: value pairs
   */
  private parseSimpleYaml(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)?$/);
      if (match) {
        const [, key, value] = match;
        if (value) {
          // Remove quotes if present
          result[key] = value.replace(/^["']|["']$/g, '').trim();
        }
      }
    }

    return result;
  }
}

export default FileParser;

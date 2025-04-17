// visual-vigilante/src/core/fix-generator.js

const { OpenAI } = require('openai');
const { LangChainPromptTemplate } = require('langchain');
const fs = require('fs').promises;
const path = require('path');

class FixGenerator {
  constructor(config = {}) {
    this.config = {
      llm: {
        provider: 'openai',
        model: 'gpt-4-1106-preview',
        temperature: 0.2,
        ...config.llm
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-opus-20240229',
        ...config.anthropic
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        ...config.openai
      },
      outputDir: path.resolve(process.cwd(), 'generated-fixes'),
      maxContextSize: 4000, // characters to include from source file
      ...config
    };
    
    // Initialize LLM client based on provider
    if (this.config.llm.provider === 'openai') {
      this.llmClient = new OpenAI({
        apiKey: this.config.openai.apiKey
      });
    } else if (this.config.llm.provider === 'anthropic') {
      // Initialize Anthropic client
      // Would use appropriate Anthropic API client
      this.llmClient = null; // Placeholder for now
    }
  }
  
  /**
   * Generate fixes for visual discrepancies based on comparison results
   */
  async generateFix(comparisonResults, sourceCode, options = {}) {
    if (!this.llmClient) {
      throw new Error('LLM client not initialized. Check configuration.');
    }
    
    const {
      componentName = 'UI Component',
      filePath = 'unknown',
      fileType = this._detectFileType(filePath),
      framework = 'react', // Default assumption
    } = options;
    
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });
    
    // Prepare LLM prompt with context
    const prompt = this._createFixPrompt(comparisonResults, sourceCode, {
      componentName,
      filePath,
      fileType,
      framework
    });
    
    // Generate fix using appropriate LLM
    const fixResult = await this._callLLM(prompt);
    
    // Extract code from LLM response
    const fixedCode = this._extractCodeFromResponse(fixResult, fileType);
    
    // Save the generated fix
    const outputPath = path.join(
      this.config.outputDir, 
      `${componentName.toLowerCase().replace(/\s+/g, '-')}-fix.${this._getFileExtension(fileType)}`
    );
    
    await fs.writeFile(outputPath, fixedCode);
    
    return {
      original: sourceCode,
      fixed: fixedCode,
      filePath: outputPath,
      reasoning: this._extractReasoningFromResponse(fixResult),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Create a detailed prompt for the LLM to generate a fix
   */
  _createFixPrompt(comparisonResults, sourceCode, options) {
    const {
      componentName,
      filePath,
      fileType,
      framework
    } = options;
    
    // Get relevant sections of code if the file is large
    const relevantCode = sourceCode.length > this.config.maxContextSize
      ? this._extractRelevantCodeSection(sourceCode, this.config.maxContextSize)
      : sourceCode;
    
    // Format prompt based on LLM provider
    if (this.config.llm.provider === 'openai') {
      return [
        {
          role: "system",
          content: `You are an expert frontend developer specialized in fixing visual UI issues. 
          Your task is to analyze visual discrepancies between design mockups and implementations, 
          then generate precise fixes for the code. 
          
          Focus on addressing the following types of issues:
          1. Spacing and alignment problems
          2. Color inconsistencies
          3. Typography differences
          4. Missing UI elements
          5. Responsive layout issues
          
          Provide clean, production-ready code with minimal changes to fix the issues.
          Explain your reasoning for each change.`
        },
        {
          role: "user",
          content: `I need your help fixing visual inconsistencies in a UI component.
          
          ## Component Information
          - Component Name: ${componentName}
          - File Path: ${filePath}
          - File Type: ${fileType}
          - Framework: ${framework}
          
          ## Visual Discrepancy Analysis
          - Pixel Difference: ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%
          - Structural Difference: ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%
          
          ${comparisonResults.llmAnalysis && comparisonResults.llmAnalysis.enabled ? 
            `## AI Analysis of Visual Issues\n\n${comparisonResults.llmAnalysis.analysis}\n\n` : 
            ''}
          
          ## Current Source Code
          
          \`\`\`${fileType}
          ${relevantCode}
          \`\`\`
          
          Please provide:
          1. A fixed version of the entire component code
          2. An explanation of each change you made and why it addresses the visual issues
          3. Any additional suggestions for preventing similar issues in the future`
        }
      ];
    } else if (this.config.llm.provider === 'anthropic') {
      // Anthropic-specific prompt format would go here
      return `<thinking>
You are an expert frontend developer specialized in fixing visual UI issues. Your task is to analyze visual discrepancies between design mockups and implementations, then generate precise fixes.

Component: ${componentName}
File Type: ${fileType}
Framework: ${framework}
Visual Differences:
- Pixel Difference: ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%
- Structural Difference: ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%

${comparisonResults.llmAnalysis && comparisonResults.llmAnalysis.enabled ? 
  `AI Analysis of Issues:\n${comparisonResults.llmAnalysis.analysis}\n\n` : 
  ''}

Source Code:
${relevantCode}
</thinking>

I need your help fixing visual inconsistencies in a UI component.

## Component Information
- Component Name: ${componentName}
- File Type: ${fileType}
- Framework: ${framework}

## Visual Discrepancy Analysis
- Pixel Difference: ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%
- Structural Difference: ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%

${comparisonResults.llmAnalysis && comparisonResults.llmAnalysis.enabled ? 
  `## AI Analysis of Visual Issues\n\n${comparisonResults.llmAnalysis.analysis}\n\n` : 
  ''}

Please provide:
1. A fixed version of the entire component code
2. An explanation of each change you made and why it addresses the visual issues`;
    }
  }
  
  /**
   * Call appropriate LLM API to generate fix
   */
  async _callLLM(prompt) {
    if (this.config.llm.provider === 'openai') {
      const response = await this.llmClient.chat.completions.create({
        model: this.config.llm.model,
        messages: prompt,
        temperature: this.config.llm.temperature,
        max_tokens: 4000
      });
      
      return response.choices[0].message.content;
    } else if (this.config.llm.provider === 'anthropic') {
      // Anthropic API call would go here
      // This is a placeholder - would use actual Anthropic client
      return "Anthropic API response would go here";
    }
    
    throw new Error(`Unsupported LLM provider: ${this.config.llm.provider}`);
  }
  
  /**
   * Extract code blocks from LLM response
   */
  _extractCodeFromResponse(response, fileType) {
    // Look for code blocks with the specified language
    const codeBlockRegex = new RegExp(`\`\`\`(?:${fileType})?\\s*([\\s\\S]*?)\\s*\`\`\``, 'g');
    const matches = [...response.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      // Return the last code block (usually the fixed version)
      return matches[matches.length - 1][1].trim();
    }
    
    // Fallback: if no code blocks found, try to extract code some other way
    // This is a naive approach - would need more robust parsing in production
    const lines = response.split('\n');
    let inCodeSection = false;
    let code = [];
    
    for (const line of lines) {
      // Look for markers that might indicate code sections
      if (line.includes('Fixed Code:') || line.includes('Updated Code:') || line.includes('Here is the fixed code:')) {
        inCodeSection = true;
        continue;
      }
      
      if (inCodeSection && (line.includes('Explanation:') || line.includes('Reasoning:') || line.includes('Changes made:'))) {
        inCodeSection = false;
        break;
      }
      
      if (inCodeSection) {
        code.push(line);
      }
    }
    
    if (code.length > 0) {
      return code.join('\n').trim();
    }
    
    // Last resort: return the whole response
    return response;
  }
  
  /**
   * Extract reasoning portion from LLM response
   */
  _extractReasoningFromResponse(response) {
    // Look for explanation/reasoning sections
    const reasoningStartMarkers = [
      'Explanation:',
      'Reasoning:',
      'Changes made:',
      'Here\'s why these changes fix the issues:'
    ];
    
    for (const marker of reasoningStartMarkers) {
      const markerIndex = response.indexOf(marker);
      if (markerIndex !== -1) {
        // Extract everything after the marker
        let reasoning = response.substring(markerIndex);
        
        // Stop at the next code block if there is one
        const nextCodeBlock = reasoning.indexOf('```');
        if (nextCodeBlock !== -1) {
          reasoning = reasoning.substring(0, nextCodeBlock);
        }
        
        return reasoning.trim();
      }
    }
    
    // If no explicit reasoning section, try to find implicit reasoning
    // This is a heuristic approach
    const codeBlockRegex = /```[\s\S]*?```/g;
    const withoutCodeBlocks = response.replace(codeBlockRegex, '');
    
    return withoutCodeBlocks.trim();
  }
  
  /**
   * Detect file type from file path
   */
  _detectFileType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    
    const extensionMap = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.tailwind.config.js': 'javascript'
    };
    
    return extensionMap[extension] || 'javascript';
  }
  
  /**
   * Get file extension from detected file type
   */
  _getFileExtension(fileType) {
    const typeMap = {
      'javascript': 'js',
      'jsx': 'jsx',
      'typescript': 'ts',
      'tsx': 'tsx',
      'vue': 'vue',
      'svelte': 'svelte',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less'
    };
    
    return typeMap[fileType] || 'js';
  }
  
  /**
   * Extract relevant section of code for large files
   */
  _extractRelevantCodeSection(sourceCode, maxLength) {
    // If code is already short enough, return as is
    if (sourceCode.length <= maxLength) {
      return sourceCode;
    }
    
    // Try to find component definition or main class/function
    const componentRegexPatterns = [
      // React functional component
      /function\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*{[\s\S]*?return\s*\(/,
      // React arrow function component
      /const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\([^)]*\)\s*=>\s*{[\s\S]*?return\s*\(/,
      // React class component
      /class\s+([A-Z][A-Za-z0-9_]*)\s+extends\s+React\.Component[\s\S]*?{[\s\S]*?render\s*\(\)\s*{/,
      // Vue component
      /export\s+default\s+{[\s\S]*?name:\s*['"]([A-Za-z0-9_]*)['"],/,
      // General component or module
      /export\s+(default\s+)?(\w+)/
    ];
    
    for (const pattern of componentRegexPatterns) {
      const match = sourceCode.match(pattern);
      if (match) {
        const matchIndex = match.index;
        // Get a section of code centered around the match
        const startIndex = Math.max(0, matchIndex - Math.floor(maxLength / 2));
        const endIndex = Math.min(sourceCode.length, startIndex + maxLength);
        return sourceCode.substring(startIndex, endIndex);
      }
    }
    
    // Fallback: if no component pattern is found, take from the beginning
    return sourceCode.substring(0, maxLength);
  }
}

module.exports = FixGenerator;
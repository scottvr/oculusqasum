const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

class IssueTracker {
  constructor(config = {}) {
    this.config = {
      github: {
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        token: process.env.GITHUB_TOKEN,
        ...config.github
      },
      issueLabels: ['visual-regression', 'automated', ...config.issueLabels || []],
      priorityThresholds: {
        high: 0.15, // >15% difference is high priority
        medium: 0.08, // >8% difference is medium priority
        low: 0.03, // >3% difference is low priority
        ...config.priorityThresholds
      },
      ...config
    };
    
    // Initialize GitHub client if configured
    if (this.config.github.token) {
      this.octokit = new Octokit({
        auth: this.config.github.token
      });
    }
  }
  
  /**
   * Create issue from comparison results
   */
  async createIssue(comparisonResults, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized. Check configuration.');
    }
    
    const {
      componentName = 'UI Component',
      pageUrl = 'Unknown page',
      selector = 'body',
      assignees = []
    } = options;
    
    // Generate issue title
    const title = this._generateIssueTitle(comparisonResults, componentName);
    
    // Generate issue body
    const body = await this._generateIssueBody(comparisonResults, {
      componentName,
      pageUrl,
      selector
    });
    
    // Determine appropriate labels based on severity
    const labels = [...this.config.issueLabels];
    const priorityLabel = this._determinePriorityLabel(comparisonResults);
    if (priorityLabel) {
      labels.push(priorityLabel);
    }
    
    // Create GitHub issue
    const issue = await this.octokit.issues.create({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      title,
      body,
      labels,
      assignees
    });
    
    return {
      issueId: issue.data.id,
      issueNumber: issue.data.number,
      issueUrl: issue.data.html_url,
      created: issue.data.created_at,
      title,
      body,
      labels
    };
  }
  
  /**
   * Update existing issue with new comparison results
   */
  async updateIssue(issueNumber, comparisonResults, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized. Check configuration.');
    }
    
    const {
      componentName = 'UI Component',
      pageUrl = 'Unknown page',
      selector = 'body',
      closeIfFixed = true
    } = options;
    
    // Check if issue should be closed due to fix
    if (closeIfFixed && !comparisonResults.hasSignificantDifferences) {
      await this.octokit.issues.update({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        issue_number: issueNumber,
        state: 'closed',
        state_reason: 'completed'
      });
      
      await this.octokit.issues.createComment({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        issue_number: issueNumber,
        body: `✅ **Visual inconsistency resolved!**\n\nThe visual differences are now below the threshold:\n- Pixel difference: ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%\n- Structural difference: ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%\n\nAutomatically closing this issue.`
      });
      
      return {
        issueNumber,
        updated: new Date().toISOString(),
        status: 'closed',
        reason: 'resolved'
      };
    }
    
    // Generate updated issue body
    const body = await this._generateIssueBody(comparisonResults, {
      componentName,
      pageUrl,
      selector,
      isUpdate: true
    });
    
    // Update GitHub issue
    await this.octokit.issues.update({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      issue_number: issueNumber,
      body
    });
    
    // Add comment about the update
    await this.octokit.issues.createComment({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      issue_number: issueNumber,
      body: `📊 **Visual regression update**\n\nLatest comparison results:\n- Pixel difference: ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%\n- Structural difference: ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%\n\nSee updated issue description for details.`
    });
    
    return {
      issueNumber,
      updated: new Date().toISOString(),
      status: 'updated'
    };
  }
  
  /**
   * Check for existing issues to avoid duplicates
   */
  async findSimilarIssues(componentName, selector) {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized. Check configuration.');
    }
    
    // Search for open issues with matching component and selector
    const searchQuery = `repo:${this.config.github.owner}/${this.config.github.repo} is:issue is:open label:visual-regression "${componentName}" "${selector}"`;
    
    const searchResult = await this.octokit.search.issuesAndPullRequests({
      q: searchQuery
    });
    
    return searchResult.data.items.map(issue => ({
      issueId: issue.id,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      title: issue.title,
      created: issue.created_at,
      updated: issue.updated_at
    }));
  }
  
  /**
   * Generate a descriptive issue title
   */
  _generateIssueTitle(comparisonResults, componentName) {
    const pixelDiff = (comparisonResults.pixelDiff.diffPercentage * 100).toFixed(1);
    const structuralDiff = (comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(1);
    
    // Find the main type of issue
    let issueType = 'Visual inconsistency';
    if (pixelDiff > 10 && structuralDiff > 10) {
      issueType = 'Major visual discrepancy';
    } else if (pixelDiff > structuralDiff * 1.5) {
      issueType = 'Color/style inconsistency';
    } else if (structuralDiff > pixelDiff * 1.5) {
      issueType = 'Layout/alignment issue';
    }
    
    return `${issueType}: ${componentName} (${pixelDiff}% visual diff)`;
  }
  
  /**
   * Generate comprehensive issue body with embedded images
   */
  async _generateIssueBody(comparisonResults, options) {
    const {
      componentName,
      pageUrl,
      selector,
      isUpdate = false
    } = options;
    
    // Convert images to base64 to embed in the issue
    let designImgBase64, implImgBase64, diffImgBase64;
    
    try {
      // For embedded images, convert to base64, but this requires image hosting
      // In a real implementation, you'd upload these to S3 or another image host
      // Here we'll just reference the paths as these would be hosted elsewhere
      designImgBase64 = '(Design image would be embedded here)';
      implImgBase64 = '(Implementation image would be embedded here)';
      diffImgBase64 = '(Diff visualization would be embedded here)';
    } catch (err) {
      console.error('Error preparing images for issue:', err);
    }
    
    // Include LLM analysis if available
    let llmAnalysisSection = '';
    if (comparisonResults.llmAnalysis && comparisonResults.llmAnalysis.enabled) {
      llmAnalysisSection = `
## AI Analysis

${comparisonResults.llmAnalysis.analysis}

`;
    }
    
    // Create markdown for the issue body
    return `# Visual Regression Detected: ${componentName}

${isUpdate ? '⚠️ *This issue has been automatically updated with new comparison results.*' : '🔍 *This issue was automatically created by VisualVigilante.*'}

## Overview

- **Component:** ${componentName}
- **Page URL:** ${pageUrl}
- **Selector:** \`${selector}\`
- **Timestamp:** ${comparisonResults.timestamp}
- **Pixel Difference:** ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%
- **Structural Difference:** ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%

## Visual Comparison

### Design Mockup
${designImgBase64}

### Current Implementation
${implImgBase64}

### Difference Visualization
${diffImgBase64}

${llmAnalysisSection}

## Technical Details

\`\`\`json
${JSON.stringify({
  selector,
  timestamp: comparisonResults.timestamp,
  pixelDiffPercentage: comparisonResults.pixelDiff.diffPercentage,
  structuralDiffPercentage: comparisonResults.structuralDiff.structuralDiffPercentage,
  totalPixels: comparisonResults.pixelDiff.totalPixels,
  diffPixelCount: comparisonResults.pixelDiff.diffPixelCount
}, null, 2)}
\`\`\`

---

*Generated by [VisualVigilante](https://github.com/example/visual-vigilante) - Automated Visual QA System*
`;
  }
  
  /**
   * Determine priority label based on difference percentages
   */
  _determinePriorityLabel(comparisonResults) {
    const maxDiff = Math.max(
      comparisonResults.pixelDiff.diffPercentage,
      comparisonResults.structuralDiff.structuralDiffPercentage
    );
    
    if (maxDiff >= this.config.priorityThresholds.high) {
      return 'priority:high';
    } else if (maxDiff >= this.config.priorityThresholds.medium) {
      return 'priority:medium';
    } else if (maxDiff >= this.config.priorityThresholds.low) {
      return 'priority:low';
    }
    
    return null;
  }
  
  /**
   * Create a pull request with automated fix
   */
  async createFixPullRequest(comparisonResults, fixCode, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub client not initialized. Check configuration.');
    }
    
    const {
      componentName = 'UI Component',
      filePath,
      branchName = `fix/visual-regression-${Date.now()}`,
      baseBranch = 'main',
      issueNumber
    } = options;
    
    if (!filePath) {
      throw new Error('File path is required to create a PR');
    }
    
    // Get current file content
    const fileResponse = await this.octokit.repos.getContent({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      path: filePath,
      ref: baseBranch
    });
    
    const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString();
    const sha = fileResponse.data.sha;
    
    // Create a new branch
    const refResponse = await this.octokit.git.getRef({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      ref: `heads/${baseBranch}`
    });
    
    await this.octokit.git.createRef({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      ref: `refs/heads/${branchName}`,
      sha: refResponse.data.object.sha
    });
    
    // Update file with fix
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      path: filePath,
      message: `Fix visual regression in ${componentName}`,
      content: Buffer.from(fixCode).toString('base64'),
      sha,
      branch: branchName
    });
    
    // Create PR
    const prTitle = `Fix: Visual regression in ${componentName}`;
    const prBody = `
# Automated Visual Regression Fix

This PR was automatically generated to fix visual inconsistencies in \`${componentName}\`.

${issueNumber ? `Fixes #${issueNumber}` : ''}

## Visual Difference Before Fix
- Pixel Difference: ${(comparisonResults.pixelDiff.diffPercentage * 100).toFixed(2)}%
- Structural Difference: ${(comparisonResults.structuralDiff.structuralDiffPercentage * 100).toFixed(2)}%

## Changes Made
\`\`\`diff
${this._generateDiff(currentContent, fixCode)}
\`\`\`

## AI Analysis
${comparisonResults.llmAnalysis && comparisonResults.llmAnalysis.enabled ? 
  comparisonResults.llmAnalysis.analysis : 
  'No AI analysis available.'}

---

*Generated by [VisualVigilante](https://github.com/example/visual-vigilante) - Automated Visual QA System*
`;

    const pr = await this.octokit.pulls.create({
      owner: this.config.github.owner,
      repo: this.config.github.repo,
      title: prTitle,
      body: prBody,
      head: branchName,
      base: baseBranch
    });
    
    // Link PR to issue if issue number provided
    if (issueNumber) {
      await this.octokit.issues.createComment({
        owner: this.config.github.owner,
        repo: this.config.github.repo,
        issue_number: issueNumber,
        body: `I've created an automated fix in PR #${pr.data.number}`
      });
    }
    
    return {
      prNumber: pr.data.number,
      prUrl: pr.data.html_url,
      branchName
    };
  }
  
  /**
   * Generate a simplified diff between two code strings
   */
  _generateDiff(originalCode, newCode) {
    const originalLines = originalCode.split('\n');
    const newLines = newCode.split('\n');
    
    let diff = '';
    let inDiffBlock = false;
    
    for (let i = 0; i < Math.max(originalLines.length, newLines.length); i++) {
      const originalLine = i < originalLines.length ? originalLines[i] : '';
      const newLine = i < newLines.length ? newLines[i] : '';
      
      if (originalLine !== newLine) {
        // If this is the start of a diff block, add some context
        if (!inDiffBlock && i > 0) {
          const contextStart = Math.max(0, i - 3);
          for (let j = contextStart; j < i; j++) {
            diff += ` ${originalLines[j]}\n`;
          }
        }
        
        inDiffBlock = true;
        if (originalLine && newLine) {
          diff += `-${originalLine}\n+${newLine}\n`;
        } else if (originalLine) {
          diff += `-${originalLine}\n`;
        } else if (newLine) {
          diff += `+${newLine}\n`;
        }
      } else if (inDiffBlock) {
        // Add a few lines of context after the diff block
        diff += ` ${originalLine}\n`;
        
        // End diff block after 3 lines of context
        if (i >= originalLines.length - 1 || i - originalLines.lastIndexOf(originalLine, i - 1) > 3) {
          inDiffBlock = false;
        }
      }
    }
    
    return diff;
  }
}

module.exports = IssueTracker;
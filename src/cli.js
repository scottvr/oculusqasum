#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const dotenv = require('dotenv');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const VisualComparisonEngine = require('../src/core/comparison-engine');
const IssueTracker = require('../src/integrations/issue-tracker');
const FixGenerator = require('../src/core/fix-generator');
const LiveMonitor = require('../src/core/live-monitor');

// Load environment variables
dotenv.config();

// ASCII art logo for CLI
const logo = `
██╗   ██╗██╗███████╗██╗   ██╗ █████╗ ██╗         
██║   ██║██║██╔════╝██║   ██║██╔══██╗██║         
██║   ██║██║███████╗██║   ██║███████║██║         
╚██╗ ██╔╝██║╚════██║██║   ██║██╔══██║██║         
 ╚████╔╝ ██║███████║╚██████╔╝██║  ██║███████╗    
  ╚═══╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝    
                                                  
██╗   ██╗██╗ ██████╗ ██╗██╗      █████╗ ███╗   ██╗████████╗███████╗
██║   ██║██║██╔════╝ ██║██║     ██╔══██╗████╗  ██║╚══██╔══╝██╔════╝
██║   ██║██║██║  ███╗██║██║     ███████║██╔██╗ ██║   ██║   █████╗  
╚██╗ ██╔╝██║██║   ██║██║██║     ██╔══██║██║╚██╗██║   ██║   ██╔══╝  
 ╚████╔╝ ██║╚██████╔╝██║███████╗██║  ██║██║ ╚████║   ██║   ███████╗
  ╚═══╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
`;

// Default configuration file path
const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'visual-vigilante.config.yml');

/**
 * Load configuration from file
 */
async function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const configFile = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(configFile);
    
    // Resolve relative paths in config
    if (config.outputDir) {
      config.outputDir = path.resolve(process.cwd(), config.outputDir);
    }
    
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(chalk.yellow(`Configuration file not found at ${configPath}. Using default configuration.`));
      return {};
    }
    
    console.error(chalk.red(`Error loading configuration file: ${error.message}`));
    throw error;
  }
}

/**
 * Initialize the CLI
 */
async function init() {
  console.log(chalk.cyan(logo));
  console.log(chalk.bold('  The Visual QA System for Web Interfaces\n'));
  
  program
    .name('visual-vigilante')
    .description('A visual QA system for web interfaces')
    .version('1.0.0');
  
  // Initialize command
  program
    .command('init')
    .description('Initialize VisualVigilante in the current directory')
    .action(async () => {
      const spinner = ora('Initializing VisualVigilante...').start();
      
      try {
        // Create default configuration file
        const defaultConfig = {
          comparison: {
            thresholds: {
              pixelDifference: 0.05,
              structuralDifference: 0.1
            },
            browser: {
              headless: true,
              slowMo: 0
            },
            llm: {
              enabled: true,
              model: 'gpt-4-vision-preview'
            },
            outputDir: './visual-vigilante-results'
          },
          github: {
            owner: 'your-username',
            repo: 'your-repo',
            issueLabels: ['visual-regression', 'automated'],
            priorityThresholds: {
              high: 0.15,
              medium: 0.08,
              low: 0.03
            }
          },
          llm: {
            provider: 'openai',
            model: 'gpt-4-1106-preview',
            temperature: 0.2
          },
          monitoring: {
            schedule: '0 */6 * * *',
            urls: [
              'https://example.com'
            ],
            viewports: [
              { width: 1920, height: 1080, name: 'desktop' },
              { width: 768, height: 1024, name: 'tablet' },
              { width: 375, height: 812, name: 'mobile' }
            ],
            selectors: ['body'],
            thresholds: {
              pixelDifference: 0.03
            },
            storage: {
              baseDir: './visual-vigilante-snapshots',
              maxSnapshots: 20
            },
            webhooks: [
              {
                type: 'slack',
                url: 'https://hooks.slack.com/services/YOUR_SLACK_WEBHOOK'
              }
            ]
          }
        };
        
        await fs.writeFile(
          DEFAULT_CONFIG_PATH,
          yaml.dump(defaultConfig, { indent: 2 })
        );
        
        // Create .env file
        const envContent = `# API Keys
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# GitHub Configuration
GITHUB_TOKEN=your-github-token
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-github-repo
`;
        
        await fs.writeFile(path.resolve(process.cwd(), '.env'), envContent);
        
        // Create directories
        await fs.mkdir(path.resolve(process.cwd(), 'visual-vigilante-results'), { recursive: true });
        await fs.mkdir(path.resolve(process.cwd(), 'visual-vigilante-snapshots'), { recursive: true });
        
        spinner.succeed('Initialized VisualVigilante successfully!');
        
        console.log(boxen(
          `${chalk.green('VisualVigilante initialized!')}
          
Edit ${chalk.cyan('visual-vigilante.config.yml')} to configure your project.
Don't forget to update your API keys in ${chalk.cyan('.env')}.

Run ${chalk.cyan('npx visual-vigilante compare')} to start comparing your designs with implementations.`,
          { padding: 1, borderColor: 'green', margin: 1 }
        ));
      } catch (error) {
        spinner.fail(`Initialization failed: ${error.message}`);
      }
    });
  
  // Compare command
  program
    .command('compare')
    .description('Compare design mockup with implementation')
    .option('-d, --design <url>', 'URL or file path to design mockup')
    .option('-i, --implementation <url>', 'URL or file path to implementation')
    .option('-s, --selector <selector>', 'CSS selector to compare', 'body')
    .option('-c, --config <path>', 'Path to configuration file', DEFAULT_CONFIG_PATH)
    .option('--no-issue', 'Skip creating GitHub issue for discrepancies')
    .option('--no-fix', 'Skip generating fix for discrepancies')
    .action(async (options) => {
      const spinner = ora('Loading configuration...').start();
      
      try {
        // Load configuration
        const config = await loadConfig(options.config);
        
        spinner.text = 'Initializing comparison engine...';
        const comparisonEngine = new VisualComparisonEngine(config.comparison);
        
        spinner.text = 'Comparing design with implementation...';
        const comparisonResults = await comparisonEngine.runComparison(
          options.design,
          options.implementation,
          options.selector
        );
        
        spinner.succeed('Comparison completed!');
        
        // Display results
        console.log(boxen(
          `${chalk.bold('Comparison Results')}
          
Pixel Difference: ${chalk.yellow(comparisonResults.pixelDiff.diffPercentage * 100)}%
Structural Difference: ${chalk.yellow(comparisonResults.structuralDiff.structuralDiffPercentage * 100)}%

${comparisonResults.hasSignificantDifferences 
  ? chalk.red('✘ Significant visual discrepancies detected!') 
  : chalk.green('✓ No significant visual discrepancies detected.')}

Diff Image: ${chalk.cyan(comparisonResults.pixelDiff.diffImagePath)}`,
          { padding: 1, borderColor: comparisonResults.hasSignificantDifferences ? 'red' : 'green', margin: 1 }
        ));
        
        // Create GitHub issue if enabled and discrepancies exist
        if (options.issue && comparisonResults.hasSignificantDifferences) {
          spinner.text = 'Creating GitHub issue...';
          spinner.start();
          
          const issueTracker = new IssueTracker(config.github);
          const issueResult = await issueTracker.createIssue(comparisonResults, {
            componentName: path.basename(options.implementation),
            pageUrl: options.implementation,
            selector: options.selector
          });
          
          spinner.succeed(`GitHub issue created: #${issueResult.issueNumber}`);
          console.log(`Issue URL: ${chalk.cyan(issueResult.issueUrl)}`);
        }
        
        // Generate fix if enabled and discrepancies exist
        if (options.fix && comparisonResults.hasSignificantDifferences) {
          spinner.text = 'Generating fix...';
          spinner.start();
          
          try {
            // For this demo, we'll assume we have the source code
            const sourceCode = await fs.readFile(options.implementation, 'utf8');
            
            const fixGenerator = new FixGenerator(config.llm);
            const fixResult = await fixGenerator.generateFix(comparisonResults, sourceCode, {
              componentName: path.basename(options.implementation),
              filePath: options.implementation
            });
            
            spinner.succeed(`Fix generated: ${fixResult.filePath}`);
            
            console.log(boxen(
              `${chalk.bold('Generated Fix')}
              
${chalk.green('✓')} Fix has been saved to: ${chalk.cyan(fixResult.filePath)}

${chalk.bold('Reasoning:')}
${fixResult.reasoning}`,
              { padding: 1, borderColor: 'cyan', margin: 1 }
            ));
          } catch (error) {
            spinner.warn(`Unable to generate fix: ${error.message}`);
          }
        }
      } catch (error) {
        spinner.fail(`Comparison failed: ${error.message}`);
      }
    });
  
  // Monitor command
  program
    .command('monitor')
    .description('Start continuous monitoring for visual regressions')
    .option('-c, --config <path>', 'Path to configuration file', DEFAULT_CONFIG_PATH)
    .option('--create-baselines', 'Create baseline snapshots before starting monitoring')
    .option('--once', 'Run a single check instead of continuous monitoring')
    .action(async (options) => {
      const spinner = ora('Loading configuration...').start();
      
      try {
        // Load configuration
        const config = await loadConfig(options.config);
        
        spinner.text = 'Initializing monitoring system...';
        const liveMonitor = new LiveMonitor(config.monitoring);
        
        // Set up event handlers
        liveMonitor.on('started', (data) => {
          spinner.succeed(`Monitoring started with schedule: ${data.schedule}`);
          console.log(`Monitoring ${data.urls} URLs across multiple viewports.`);
        });
        
        liveMonitor.on('baselines-created', (data) => {
          console.log(chalk.green(`✓ Created ${data.count} baseline snapshots.`));
        });
        
        liveMonitor.on('visual-regression-detected', (data) => {
          console.log(boxen(
            `${chalk.red('🚨 Visual Regression Detected!')}
            
URL: ${chalk.cyan(data.url)}
Viewport: ${chalk.yellow(data.viewport)}
Selector: ${chalk.magenta(data.selector)}
Difference: ${chalk.red(data.diffPercentage * 100)}%

Diff Image: ${chalk.cyan(data.diffImagePath)}`,
            { padding: 1, borderColor: 'red', margin: 1 }
          ));
        });
        
        liveMonitor.on('check-completed', (data) => {
          const alertCount = data.results.filter(r => r.status === 'alert').length;
          
          console.log(
            alertCount > 0
              ? chalk.red(`✘ Check completed with ${alertCount} alerts.`)
              : chalk.green('✓ Check completed with no visual regressions.')
          );
        });
        
        // Create baselines if requested
        if (options.createBaselines) {
          spinner.text = 'Creating baseline snapshots...';
          await liveMonitor.createBaselines();
        }
        
        if (options.once) {
          // Run a single check
          spinner.text = 'Running visual check...';
          const results = await liveMonitor.runCheck();
          spinner.succeed('Visual check completed!');
          
          // Display results summary
          const alertCount = results.filter(r => r.status === 'alert').length;
          console.log(boxen(
            `${chalk.bold('Visual Check Results')}
            
${alertCount > 0 
  ? chalk.red(`✘ ${alertCount} visual regressions detected!`) 
  : chalk.green('✓ No visual regressions detected.')}

Checked ${results.length} URL/viewport/selector combinations.`,
            { padding: 1, borderColor: alertCount > 0 ? 'red' : 'green', margin: 1 }
          ));
        } else {
          // Start continuous monitoring
          spinner.text = 'Starting continuous monitoring...';
          await liveMonitor.start();
          
          console.log(chalk.yellow('\nPress Ctrl+C to stop monitoring.\n'));
          
          // Keep process running
          process.stdin.resume();
          
          // Handle graceful shutdown
          process.on('SIGINT', async () => {
            console.log(chalk.yellow('\nStopping monitoring...'));
            await liveMonitor.stop();
            console.log(chalk.green('Monitoring stopped.'));
            process.exit(0);
          });
        }
      } catch (error) {
        spinner.fail(`Monitoring failed: ${error.message}`);
      }
    });
  
  // Parse command line arguments
  program.parse(process.argv);
  
  // Display help if no command provided
  if (process.argv.length <= 2) {
    program.help();
  }
}

// Run the CLI
init().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});

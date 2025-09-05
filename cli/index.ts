#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
const { default: Conf } = require('conf');
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

// Enhanced Configuration Management
interface CliConfig {
  apiUrl: string;
  apiKey: string;
  user?: {
    id: string;
    name: string;
    email: string;
    defaults: {
      seller: any;
      currency: string;
      notes?: string;
    };
  };
  folders: Record<string, {
    id: string;
    name: string;
    company: string;
    defaults: {
      buyer: any;
      currency?: string;
    };
  }>;
  defaultFolder?: string;
  quickDefaults: {
    dueInDays: number;
    defaultTaxRate: number;
    defaultDiscountRate: number;
  };
}

const config = new Conf({
  projectName: 'invoice',
  defaults: {
    apiUrl: 'https://invoice.boidu.dev',
    apiKey: '',
    folders: {},
    quickDefaults: {
      dueInDays: 30,
      defaultTaxRate: 0,
      defaultDiscountRate: 0,
    },
  },
});

// Smart API Client
class InvoiceAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.get('apiUrl');
    this.apiKey = config.get('apiKey');
  }

  private async request(endpoint: string, options: any = {}) {
    const { method = 'GET', body } = options;
    
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'invoice/1.0.0',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.headers.get('content-type')?.includes('application/pdf')) {
        return {
          success: response.ok,
          data: Buffer.from(await response.arrayBuffer()),
        };
      }

      const data = await response.json();
      return {
        success: response.ok,
        data,
        error: !response.ok ? (data as any).error : null,
        details: !response.ok ? (data as any).details : null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createUser(userData: any) {
    return this.request('/users', { method: 'POST', body: userData });
  }

  async createFolder(folderData: any) {
    return this.request('/folders', { method: 'POST', body: folderData });
  }

  async listFolders() {
    return this.request('/folders');
  }

  async createInvoice(folderId: string, invoiceData: any) {
    return this.request(`/invoices/folders/${folderId}`, { method: 'POST', body: invoiceData });
  }

  async listInvoices(limit = 20) {
    return this.request(`/invoices?limit=${limit}`);
  }

  async updateInvoiceStatus(invoiceId: string, status: 'due' | 'paid') {
    return this.request(`/invoices/${invoiceId}/status`, { method: 'PATCH', body: { status } });
  }

  async getStats() {
    return this.request('/metadata/stats');
  }
}

// Utility Functions
function ensureSetup() {
  const apiKey = config.get('apiKey');
  if (!apiKey) {
    console.error(chalk.red('❌ Not configured yet!'));
    console.log(chalk.yellow('Run:'), chalk.cyan('invoice setup'));
    process.exit(1);
  }
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatStatus(status: string) {
  return status === 'paid' ? chalk.green('✅ PAID') : chalk.yellow('⏳ DUE');
}

// Smart folder selection with caching and nicknames
async function selectFolder(): Promise<string> {
  const folders = config.get('folders');
  const folderEntries = Object.entries(folders);
  
  if (folderEntries.length === 0) {
    console.log(chalk.yellow('No clients found. Adding one...'));
    return await createQuickFolder();
  }

  if (folderEntries.length === 1) {
    const folder = folderEntries[0][1] as any;
    console.log(chalk.gray(`Using client: ${folder.name}`));
    return folder.id;
  }

  const defaultFolder = config.get('defaultFolder');
  if (defaultFolder && folders[defaultFolder]) {
    const folder = folders[defaultFolder] as any;
    console.log(chalk.gray(`Using default client: ${folder.name}`));
    return folder.id;
  }

  const { folderId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'folderId',
      message: 'Select client:',
      choices: folderEntries.map(([key, folder]) => ({
        name: `${(folder as any).name} (${(folder as any).company})`,
        value: (folder as any).id,
      })),
    },
  ]);

  return folderId;
}

async function createQuickFolder(): Promise<string> {
  const { clientName, company, email } = await inquirer.prompt([
    {
      type: 'input',
      name: 'clientName',
      message: 'Client name:',
      validate: (input: string) => input.trim() ? true : 'Required',
    },
    {
      type: 'input',
      name: 'company',
      message: 'Company abbreviation (for invoice IDs):',
      validate: (input: string) => input.trim() ? true : 'Required',
      transformer: (input: string) => input.toUpperCase(),
    },
    {
      type: 'input',
      name: 'email',
      message: 'Client email:',
      validate: (input: string) => {
        const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;
        return emailRegex.test(input) ? true : 'Valid email required';
      },
    },
  ]);

  const spinner = ora('Adding client...').start();
  const api = new InvoiceAPI();
  
  const result = await api.createFolder({
    name: clientName,
    company: company.toUpperCase(),
    defaults: {
      buyer: {
        name: clientName,
        address: 'Address on file',
        email: email,
      },
    },
  });

  if (result.success) {
    spinner.succeed(`Client added: ${clientName}`);
    
    // Cache folder info with nickname
    const folders = config.get('folders');
    const nickname = clientName.toLowerCase().replace(/\\s+/g, '-');
    folders[nickname] = result.data as any;
    config.set('folders', folders);
    config.set('defaultFolder', nickname);
    
    return (result.data as any).id;
  } else {
    spinner.fail('Failed to add client');
    throw new Error(result.error || 'Unknown error');
  }
}

// Main CLI Program
const program = new Command();
const packageJson = require('../package.json');

program
  .name('invoice')
  .description('⚡ Ultra-fast invoice creation')
  .version(packageJson.version);

// One-time setup
program
  .command('setup')
  .description('🔧 One-time setup')
  .action(async () => {
    console.log(chalk.blue.bold('⚡ Invoice CLI Setup'));
    console.log('');

    const { name, email, companyName, companyAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Your name:',
        validate: (input: string) => input.trim() ? true : 'Required',
      },
      {
        type: 'input',
        name: 'email',
        message: 'Your email:',
        validate: (input: string) => /^[^@]+@[^@]+\.[^@]+$/.test(input) ? true : 'Valid email required',
      },
      {
        type: 'input',
        name: 'companyName',
        message: 'Your business name:',
        validate: (input: string) => input.trim() ? true : 'Required',
      },
      {
        type: 'input',
        name: 'companyAddress',
        message: 'Business address:',
        validate: (input: string) => input.trim() ? true : 'Required',
      },
    ]);

    const spinner = ora('Creating your account...').start();
    const api = new InvoiceAPI();
    
    const result = await api.createUser({
      name,
      email,
      defaults: {
        seller: {
          name: companyName,
          address: companyAddress,
          email: email,
        },
        currency: 'USD',
        notes: 'Thank you for your business!',
      },
    });

    if (result.success) {
      spinner.succeed('Account created! 🎉');
      
      // Save config
      config.set('apiKey', (result.data as any).apiKey);
      config.set('user', (result.data as any).user);
      
      console.log('');
      console.log(chalk.green('✅ Setup complete!'));
      console.log('');
      console.log('Create your first invoice:');
      console.log(chalk.cyan('  invoice new'));
    } else {
      spinner.fail('Setup failed');
      console.error(chalk.red('Error:'), result.error);
      if (result.details) {
        (result.details as any[]).forEach((detail: any) => {
          console.error(chalk.red('  -'), detail.message);
        });
      }
      process.exit(1);
    }
  });

// Super quick invoice creation - main command
program
  .command('new')
  .alias('create')
  .description('🚀 Create new invoice (main command)')
  .option('-c, --client <name>', 'Client nickname (skip selection)')
  .option('-a, --amount <amount>', 'Total amount')
  .option('-d, --description <desc>', 'Work description')
  .action(async (options) => {
    try {
      ensureSetup();
      
      console.log(chalk.blue.bold('🚀 New Invoice'));
      console.log('');

      // Get folder
      let folderId: string;
      if (options.client) {
        const folders = config.get('folders');
        const clientFolder = folders[options.client.toLowerCase()];
        if (clientFolder) {
          folderId = clientFolder.id;
          console.log(chalk.gray(`Using client: ${clientFolder.name}`));
        } else {
          console.log(chalk.yellow(`Client "${options.client}" not found. Available:`));
          Object.keys(folders).forEach(key => {
            console.log(chalk.gray(`  ${key}`));
          });
          console.log('');
          folderId = await selectFolder();
        }
      } else {
        folderId = await selectFolder();
      }

      // Get invoice details with smart defaults
      const prompts: any[] = [];

      if (!options.description) {
        prompts.push({
          type: 'input',
          name: 'description',
          message: 'Work description:',
          validate: (input: string) => input.trim() ? true : 'Required',
          default: 'Consulting services',
        });
      }

      if (!options.amount) {
        prompts.push(
          {
            type: 'number',
            name: 'quantity',
            message: 'Quantity (hours/units):',
            default: 1,
            validate: (input: number) => input > 0 ? true : 'Must be positive',
          },
          {
            type: 'number',
            name: 'rate',
            message: 'Rate per unit ($):',
            validate: (input: number) => input > 0 ? true : 'Must be positive',
          }
        );
      }

      prompts.push({
        type: 'list',
        name: 'status',
        message: 'Status:',
        choices: [
          { name: '⏳ Due (send to client)', value: 'due' },
          { name: '✅ Already paid', value: 'paid' },
        ],
        default: 'due',
      });

      const answers = await inquirer.prompt(prompts);

      // Parse amount if provided as option
      let quantity = 1;
      let rate = 0;
      
      if (options.amount) {
        rate = parseFloat(options.amount);
        quantity = 1;
      } else {
        quantity = answers.quantity;
        rate = answers.rate;
      }

      const description = options.description || answers.description;

      // Auto-generate dates
      const issueDate = new Date().toISOString().split('T')[0];
      const dueInDays = config.get('quickDefaults').dueInDays;
      const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      const spinner = ora('Creating invoice...').start();
      const api = new InvoiceAPI();
      
      const invoiceData = {
        items: [{
          description,
          qty: quantity,
          unit: rate,
          tax: config.get('quickDefaults').defaultTaxRate,
        }],
        issueDate,
        dueDate,
        status: answers.status,
        taxRate: config.get('quickDefaults').defaultTaxRate,
        discountRate: config.get('quickDefaults').defaultDiscountRate,
      };

      const result = await api.createInvoice(folderId, invoiceData);

      if (result.success) {
        // Generate smart filename
        const cleanDesc = description.toLowerCase()
          .replace(/[^a-z0-9\\s]/g, '')
          .replace(/\\s+/g, '-')
          .substring(0, 20);
        const filename = `invoice-${issueDate}-${cleanDesc}.pdf`;
        
        await fs.writeFile(filename, result.data as any);
        
        spinner.succeed('Invoice created! 💸');
        
        const total = quantity * rate;
        const user = config.get('user');
        const currency = user?.defaults?.currency || 'USD';
        
        console.log('');
        console.log(chalk.green('📄 PDF:'), path.resolve(filename));
        console.log(chalk.cyan('💰 Total:'), formatCurrency(total, currency));
        console.log(chalk.cyan('📊 Status:'), formatStatus(answers.status));
        console.log(chalk.cyan('📅 Due:'), dueDate);
        
        if (answers.status === 'due') {
          console.log('');
          console.log(chalk.gray('💡 Tip: Mark as paid later with:'));
          console.log(chalk.gray(`  invoice paid <invoice-id>`));
        }
      } else {
        spinner.fail('Failed to create invoice');
        console.error(chalk.red('Error:'), result.error);
        if (result.details) {
          (result.details as any[]).forEach((detail: any) => {
            console.error(chalk.red('  -'), detail.message);
          });
        }
      }
      
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// List recent invoices
program
  .command('list')
  .alias('ls')
  .description('📋 List recent invoices')
  .option('-l, --limit <number>', 'Number to show', '10')
  .action(async (options) => {
    try {
      ensureSetup();
      
      const spinner = ora('Loading...').start();
      const api = new InvoiceAPI();
      const result = await api.listInvoices(parseInt(options.limit));

      if (result.success) {
        const invoices = (result.data as any).invoices;
        spinner.succeed(`${invoices.length} recent invoices`);
        
        if (invoices.length === 0) {
          console.log('');
          console.log(chalk.gray('No invoices yet.'));
          console.log(chalk.cyan('Create one:'), 'invoice new');
          return;
        }

        console.log('');
        invoices.forEach((invoice: any) => {
          const total = formatCurrency(invoice.total, invoice.currency);
          const status = formatStatus(invoice.status);
          const date = new Date(invoice.createdAt).toLocaleDateString();
          console.log(`${status} ${chalk.cyan(invoice.id)} ${chalk.gray(date)}`);
          console.log(`  ${invoice.buyer} • ${total}`);
        });
        
        console.log('');
        console.log(chalk.gray('💡 Mark as paid: invoice paid <id>'));
      } else {
        spinner.fail('Failed to load');
        console.error(chalk.red('Error:'), result.error);
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Mark invoice as paid - super common action
program
  .command('paid <invoiceId>')
  .description('✅ Mark invoice as paid')
  .action(async (invoiceId: string) => {
    try {
      ensureSetup();
      
      const spinner = ora('Marking as paid...').start();
      const api = new InvoiceAPI();
      const result = await api.updateInvoiceStatus(invoiceId, 'paid');

      if (result.success) {
        const invoice = result.data as any;
        spinner.succeed('Marked as PAID! 💰');
        console.log('');
        console.log(chalk.cyan('Invoice:'), invoice.id);
        console.log(chalk.cyan('Total:'), formatCurrency(invoice.total, invoice.currency));
        console.log(chalk.green('✅ Status: PAID'));
      } else {
        spinner.fail('Failed to update');
        console.error(chalk.red('Error:'), result.error);
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Revenue stats - important for freelancers
program
  .command('stats')
  .description('📊 Revenue stats')
  .action(async () => {
    try {
      ensureSetup();
      
      const spinner = ora('Loading stats...').start();
      const api = new InvoiceAPI();
      const result = await api.getStats();

      if (result.success && result.data) {
        const stats = result.data as any;
        spinner.succeed('Stats loaded');
        
        console.log('');
        console.log(chalk.blue.bold('📊 Business Overview'));
        console.log('━'.repeat(30));
        
        const paidCount = stats.totalPaidInvoices;
        const totalCount = stats.totalInvoices;
        const unpaidCount = totalCount - paidCount;
        
        console.log(chalk.cyan('Total Invoices:'), totalCount.toLocaleString());
        console.log(chalk.green('✅ Paid:'), paidCount.toLocaleString());
        console.log(chalk.yellow('⏳ Unpaid:'), unpaidCount.toLocaleString());
        
        if (totalCount > 0) {
          const percentage = ((paidCount / totalCount) * 100).toFixed(0);
          const emoji = percentage === '100' ? '🎉' : Number(percentage) >= 80 ? '👍' : '📈';
          console.log(chalk.blue('Payment Rate:'), `${percentage}% ${emoji}`);
        }
        
        console.log('');
        console.log(chalk.blue.bold('💰 Revenue (Paid Only)'));
        console.log('━'.repeat(30));
        
        if (Object.keys(stats.currencyBreakdown).length === 0) {
          console.log(chalk.gray('No revenue yet (no paid invoices)'));
        } else {
          let totalRevenue = 0;
          Object.entries(stats.currencyBreakdown).forEach(([currency, amount]) => {
            const formattedAmount = formatCurrency(amount as number, currency);
            console.log(chalk.green('💵'), formattedAmount);
            totalRevenue += amount as number;
          });
          
          if (unpaidCount > 0) {
            console.log('');
            console.log(chalk.yellow(`💡 ${unpaidCount} unpaid invoices - follow up for more revenue!`));
          }
        }
      } else {
        spinner.fail('Failed to load stats');
        console.error(chalk.red('Error:'), result.error);
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Client management
program
  .command('clients')
  .description('👥 Manage clients')
  .action(async () => {
    try {
      ensureSetup();
      
      const folders = config.get('folders');
      const clientList = Object.entries(folders);
      
      if (clientList.length === 0) {
        console.log(chalk.gray('No clients yet.'));
        console.log(chalk.cyan('Add one by creating an invoice:'), 'invoice new');
        return;
      }
      
      console.log('');
      console.log(chalk.blue.bold('👥 Your Clients'));
      console.log('━'.repeat(30));
      
      clientList.forEach(([nickname, folder]) => {
        const isDefault = config.get('defaultFolder') === nickname;
        const marker = isDefault ? chalk.green('● ') : chalk.gray('○ ');
        console.log(`${marker}${chalk.cyan(nickname)} - ${(folder as any).name} (${(folder as any).company})`);
      });
      
      console.log('');
      console.log(chalk.gray('💡 Use client nickname: invoice new -c <nickname>'));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Config management for power users
program
  .command('config')
  .description('⚙️ Settings')
  .option('--due-days <days>', 'Default days until due')
  .option('--tax-rate <rate>', 'Default tax rate (%)')
  .option('--url <url>', 'Change API URL')
  .action(async (options) => {
    if (options.dueDays) {
      config.set('quickDefaults.dueInDays', parseInt(options.dueDays));
      console.log(chalk.green('✅'), `Due days: ${options.dueDays}`);
    }
    
    if (options.taxRate) {
      config.set('quickDefaults.defaultTaxRate', parseFloat(options.taxRate));
      console.log(chalk.green('✅'), `Tax rate: ${options.taxRate}%`);
    }
    
    if (options.url) {
      config.set('apiUrl', options.url);
      console.log(chalk.green('✅'), `API URL: ${options.url}`);
    }
    
    if (!options.dueDays && !options.taxRate && !options.url) {
      console.log(chalk.blue.bold('⚙️ Current Settings'));
      console.log('━'.repeat(30));
      
      const defaults = config.get('quickDefaults');
      const apiUrl = config.get('apiUrl');
      
      console.log(chalk.cyan('API URL:'), apiUrl);
      console.log(chalk.cyan('Due in days:'), defaults.dueInDays);
      console.log(chalk.cyan('Tax rate:'), `${defaults.defaultTaxRate}%`);
      
      const user = config.get('user');
      if (user) {
        console.log('');
        console.log(chalk.blue.bold('👤 Your Account'));
        console.log('━'.repeat(30));
        console.log(chalk.cyan('Name:'), user.name);
        console.log(chalk.cyan('Email:'), user.email);
        console.log(chalk.cyan('Business:'), user.defaults.seller.name);
      }
      
      console.log('');
      console.log(chalk.gray('Change settings:'));
      console.log(chalk.gray('  --due-days 30'));
      console.log(chalk.gray('  --tax-rate 8.5'));
    }
  });

// Enhanced help
program.on('--help', () => {
  console.log('');
  console.log(chalk.blue.bold('🚀 Common Workflow:'));
  console.log('');
  console.log(`  ${chalk.cyan('invoice setup')}              First-time setup`);
  console.log(`  ${chalk.cyan('invoice new')}                Create invoice`);
  console.log(`  ${chalk.cyan('invoice paid INV-XXX-001')}   Mark as paid`);
  console.log(`  ${chalk.cyan('invoice stats')}              Check revenue`);
  console.log('');
  console.log(chalk.blue.bold('⚡ Power User Tips:'));
  console.log('');
  console.log(`  ${chalk.gray('invoice new -c acme -a 1500 -d "Website redesign"')}`);
  console.log(`  ${chalk.gray('invoice clients')}            ${chalk.gray('# List client nicknames')}`);
  console.log(`  ${chalk.gray('invoice config --due-days 15')} ${chalk.gray('# Change defaults')}`);
  console.log('');
});

// Handle no arguments - show smart welcome
if (process.argv.length === 2) {
  console.log(chalk.blue.bold('⚡ Invoice CLI'));
  console.log('');
  
  const hasApiKey = config.get('apiKey');
  const hasClients = Object.keys(config.get('folders')).length > 0;
  
  if (!hasApiKey) {
    console.log('👋 First time here?');
    console.log(chalk.cyan('  invoice setup'), '- One-time account setup');
  } else if (!hasClients) {
    console.log('🚀 Ready to create your first invoice?');
    console.log(chalk.cyan('  invoice new'), '- Create invoice (adds client automatically)');
  } else {
    console.log('💼 Ready to invoice!');
    console.log(chalk.cyan('  invoice new'), '- Create new invoice');
    console.log(chalk.cyan('  invoice list'), '- View recent invoices');
    console.log(chalk.cyan('  invoice stats'), '- Check your revenue');
  }
  
  console.log('');
  console.log(chalk.gray('All commands:'), 'invoice --help');
  process.exit(0);
}

program.parse();
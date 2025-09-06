#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
// @ts-ignore - External module compatibility
const { default: Conf } = require('conf');
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';

// Types
interface SellerBuyer {
  name: string;
  address: string;
  email: string;
  phone?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Array<{ message: string }>;
}

interface InvoiceData {
  id: string;
  total: number;
  currency: string;
  status: string;
  buyer: string;
  createdAt: string;
}

interface StatsData {
  totalInvoices: number;
  totalPaidInvoices: number;
  currencyBreakdown: Record<string, number>;
}

interface FolderData {
  id: string;
  name: string;
  company: string;
  defaults: {
    buyer: SellerBuyer;
    currency?: string;
  };
}

interface UserData {
  id: string;
  name: string;
  email: string;
  defaults: {
    seller: SellerBuyer;
    currency: string;
    notes?: string;
  };
  apiKey: string;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

interface ListResponse {
  invoices: InvoiceData[];
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

  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
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

      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/pdf')) {
        return {
          success: response.ok,
          data: Buffer.from(await response.arrayBuffer()) as T,
        };
      }

      const data = (await response.json()) as {
        error?: string;
        details?: Array<{ message: string }>;
      };

      return {
        success: response.ok,
        data: response.ok ? (data as T) : undefined,
        error: !response.ok ? data.error : undefined,
        details: !response.ok ? data.details : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createUser(userData: unknown): Promise<ApiResponse<UserData>> {
    return this.request<UserData>('/users', { method: 'POST', body: userData });
  }

  async createFolder(folderData: unknown): Promise<ApiResponse<FolderData>> {
    return this.request<FolderData>('/folders', { method: 'POST', body: folderData });
  }

  async listFolders(): Promise<ApiResponse<FolderData[]>> {
    return this.request<FolderData[]>('/folders');
  }

  async createInvoice(folderId: string, invoiceData: unknown): Promise<ApiResponse<Buffer>> {
    return this.request<Buffer>(`/invoices/folders/${folderId}`, {
      method: 'POST',
      body: invoiceData,
    });
  }

  async listInvoices(limit = 20): Promise<ApiResponse<ListResponse>> {
    return this.request<ListResponse>(`/invoices?limit=${limit}`);
  }

  async updateInvoiceStatus(
    invoiceId: string,
    status: 'due' | 'paid'
  ): Promise<ApiResponse<InvoiceData>> {
    return this.request<InvoiceData>(`/invoices/${invoiceId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  async updateInvoiceClient(
    invoiceId: string,
    clientData: { seller?: SellerBuyer; buyer?: SellerBuyer }
  ): Promise<ApiResponse<InvoiceData>> {
    return this.request<InvoiceData>(`/invoices/${invoiceId}/client`, {
      method: 'PATCH',
      body: clientData,
    });
  }

  async getInvoiceData(invoiceId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/invoices/${invoiceId}`, {
      method: 'GET',
    });
  }

  async updateFolderClient(
    folderId: string,
    clientData: { buyer: SellerBuyer }
  ): Promise<ApiResponse<FolderData>> {
    // First get the current folder data
    const currentFolder = await this.getFolder(folderId);
    if (!currentFolder.success || !currentFolder.data) {
      return { success: false, error: 'Could not fetch current folder data' };
    }
    
    // Update just the buyer information while preserving everything else
    const updatedFolderData = {
      ...currentFolder.data,
      defaults: {
        ...currentFolder.data.defaults,
        buyer: clientData.buyer,
      },
    };
    
    // Use the existing PUT endpoint to update the full folder
    return this.request<FolderData>(`/folders/${folderId}`, {
      method: 'PUT',
      body: updatedFolderData,
    });
  }

  async getFolder(folderId: string): Promise<ApiResponse<FolderData>> {
    return this.request<FolderData>(`/folders/${folderId}`);
  }

  async getStats(): Promise<ApiResponse<StatsData>> {
    return this.request<StatsData>('/metadata/stats');
  }

  async getInvoice(invoiceId: string): Promise<ApiResponse<Buffer>> {
    return this.request<Buffer>(`/invoices/${invoiceId}`);
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

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatStatus(status: string) {
  return status === 'paid' ? chalk.green('✅ PAID') : chalk.yellow('⏳ DUE');
}

// Version comparison utility
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}

// Version management
async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}> {
  try {
    const currentVersion = packageJson.version;

    // Fetch the install.sh script to get the latest version
    const response = await fetch('https://invoice.boidu.dev/install.sh');
    const installScript = await response.text();

    // Extract version from install.sh
    const versionMatch = installScript.match(/VERSION=([0-9]+\.[0-9]+\.[0-9]+)/);
    const latestVersion = versionMatch ? versionMatch[1] : currentVersion;

    // Check if latest version is actually newer
    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
    };
  } catch {
    // If we can't check for updates, assume no update needed
    return {
      hasUpdate: false,
      currentVersion: packageJson.version,
      latestVersion: packageJson.version,
    };
  }
}
async function performSelfUpdate(): Promise<void> {
  const spinner = ora('Updating...').start();

  try {
    // Download and run the install script
    const installProcess = spawn(
      'bash',
      ['-c', 'curl -sSL https://invoice.boidu.dev/install.sh | bash'],
      {
        stdio: 'pipe',
      }
    );

    let output = '';
    installProcess.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    installProcess.stderr.on('data', (data: Buffer) => {
      output += data.toString();
    });

    await new Promise((resolve, reject) => {
      installProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`Update failed with exit code ${code}: ${output}`));
        }
      });
    });

    spinner.succeed('Updated successfully! 🎉');
    console.log('');
    console.log(
      chalk.yellow(
        'Please restart your terminal or run the command again to use the updated version.'
      )
    );
  } catch (error) {
    spinner.fail('Update failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    console.log('');
    console.log(chalk.gray('You can try updating manually:'));
    console.log(chalk.cyan('curl -sSL https://invoice.boidu.dev/install.sh | bash'));
  }
}

// Smart folder selection with caching and nicknames
async function selectFolder(): Promise<string> {
  const folders = config.get('folders');
  const folderEntries = Object.entries(folders);

  if (folderEntries.length === 0) {
    console.log(chalk.yellow('No clients found. Adding one...'));
    return await createQuickFolder();
  }

  // Always ask user if they want to use existing client or create new one
  const choices = [
    ...folderEntries.map(([, folder]) => ({
      name: `${(folder as FolderData).name} [${(folder as FolderData).company}]`,
      value: (folder as FolderData).id,
    })),
    new inquirer.Separator(),
    {
      name: 'Create new client',
      value: '_#_CREATE_NEW_#_',
    },
  ];

  const { folderId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'folderId',
      message: 'Select client:',
      choices,
    },
  ]);

  if (folderId === '_#_CREATE_NEW_#_') {
    return await createQuickFolder();
  }

  return folderId;
}

async function createQuickFolder(id?: string): Promise<string> {
  const { clientName, address, company, email } = await inquirer.prompt([
    {
      type: 'input',
      name: 'clientName',
      message: 'Client name:',
      validate: (input: string) => (input.trim() ? true : 'Required'),
    },
    {
      type: 'input',
      name: 'company',
      message: 'Company abbreviation (for invoice IDs):',
      validate: (input: string) => (input.trim() ? true : 'Required'),
      transformer: (input: string) => input.toUpperCase(),
      default: id,
    },
    {
      type: 'input',
      name: 'address',
      message: 'Client address:',
      validate: (input: string) => (input.trim() ? true : 'Required'),
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
        address: address !== '' ? address : 'Address on file',
        email: email,
      },
    },
  });

  if (result.success && result.data) {
    spinner.succeed(`Client added: ${clientName}`);

    // Cache folder info with nickname
    const folders = config.get('folders');
    const nickname = clientName.toLowerCase().replace(/\\s+/g, '-');
    folders[nickname] = result.data;
    config.set('folders', folders);
    config.set('defaultFolder', nickname);

    return result.data.id;
  }

  spinner.fail('Failed to add client');
  throw new Error(result.error || 'Unknown error');
}

// Main CLI Program
const program = new Command();
// @ts-ignore - Package JSON compatibility
const packageJson = require('../package.json');

program.name('invoice').description('⚡ Ultra-fast invoice creation').version(packageJson.version);

// One-time setup
program
  .command('setup')
  .description('🔧 One-time setup')
  .action(async () => {
    console.log(chalk.blue.bold('⚡ Invoice Setup'));
    console.log('');

    const { name, email, companyName, companyAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Your name:',
        validate: (input: string) => (input.trim() ? true : 'Required'),
      },
      {
        type: 'input',
        name: 'email',
        message: 'Your email:',
        validate: (input: string) =>
          /^[^@]+@[^@]+\.[^@]+$/.test(input) ? true : 'Valid email required',
      },
      {
        type: 'input',
        name: 'companyName',
        message: 'Your business name:',
        validate: (input: string) => (input.trim() ? true : 'Required'),
      },
      {
        type: 'input',
        name: 'companyAddress',
        message: 'Business address:',
        validate: (input: string) => (input.trim() ? true : 'Required'),
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

    if (result.success && result.data) {
      spinner.succeed('Account created! 🎉');

      // Save config
      config.set('apiKey', result.data.apiKey);
      config.set('user', result.data);

      console.log('');
      console.log(chalk.green('✅ Setup complete!'));
      console.log('');
      console.log('Create your first invoice:');
      console.log(chalk.cyan('  invoice new'));
    } else {
      spinner.fail('Setup failed');
      console.error(chalk.red('Error:'), result.error);
      if (result.details) {
        for (const detail of result.details) {
          console.error(chalk.red('  -'), detail.message);
        }
      }
      process.exit(1);
    }
  });

// Super quick invoice creation - main command
program
  .command('new')
  .alias('create')
  .description('🚀 Create new invoice (main command)')
  .option('-c, --client <name>', 'Create or use client nickname')
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
          console.log(chalk.gray(`🔄 Creating new client "${options.client}"`));
          console.log('');
          folderId = await createQuickFolder(options.client);
        }
      } else {
        folderId = await selectFolder();
      }

      // Get invoice details with smart defaults
      const prompts: Array<Record<string, unknown>> = [];

      if (!options.description) {
        prompts.push({
          type: 'input',
          name: 'description',
          message: 'Work description:',
          validate: (input: string) => (input.trim() ? true : 'Required'),
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
            validate: (input: number) => (input > 0 ? true : 'Must be positive'),
          },
          {
            type: 'number',
            name: 'rate',
            message: 'Rate per unit ($):',
            validate: (input: number) => (input > 0 ? true : 'Must be positive'),
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
        rate = Number.parseFloat(options.amount);
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
        .toISOString()
        .split('T')[0];

      const spinner = ora('Creating invoice...').start();
      const api = new InvoiceAPI();

      const invoiceData = {
        items: [
          {
            description,
            qty: quantity,
            unit: rate,
            tax: config.get('quickDefaults').defaultTaxRate,
          },
        ],
        issueDate,
        dueDate,
        status: answers.status,
        taxRate: config.get('quickDefaults').defaultTaxRate,
        discountRate: config.get('quickDefaults').defaultDiscountRate,
      };

      const result = await api.createInvoice(folderId, invoiceData);

      if (result.success && result.data) {
        // Generate smart filename
        const cleanDesc = description
          .toLowerCase()
          .replace(/[^a-z0-9\\s]/g, '')
          .replace(/\\s+/g, '-')
          .substring(0, 20);
        const filename = `invoice-${issueDate}-${cleanDesc}.pdf`;

        await fs.writeFile(filename, result.data);

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
          console.log(chalk.gray('  invoice paid <invoice-id>'));
        }
      } else {
        spinner.fail('Failed to create invoice');
        console.error(chalk.red('Error:'), result.error);
        if (result.details) {
          for (const detail of result.details) {
            console.error(chalk.red('  -'), detail.message);
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
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
      const result = await api.listInvoices(Number.parseInt(options.limit, 10));

      if (result.success && result.data) {
        const { invoices } = result.data;
        spinner.succeed(`${invoices.length} recent invoices`);

        if (invoices.length === 0) {
          console.log('');
          console.log(chalk.gray('No invoices yet.'));
          console.log(chalk.cyan('Create one:'), 'invoice new');
          return;
        }

        console.log('');
        for (const invoice of invoices) {
          const total = formatCurrency(invoice.total, invoice.currency);
          const status = formatStatus(invoice.status);
          const date = new Date(invoice.createdAt).toLocaleDateString();
          console.log(`${status} ${chalk.cyan(invoice.id)} ${chalk.gray(date)}`);
          console.log(`  ${invoice.buyer} • ${total}`);
        }

        console.log('');
        console.log(chalk.gray('💡 Mark as paid: invoice paid <id>'));
      } else {
        spinner.fail('Failed to load');
        console.error(chalk.red('Error:'), result.error);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
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

      if (result.success && result.data) {
        const invoice = result.data;
        spinner.succeed('Marked as PAID! 💰');
        console.log('');
        console.log(chalk.cyan('Invoice:'), invoice.id);
        console.log(chalk.cyan('Total:'), formatCurrency(invoice.total, invoice.currency));
        console.log(chalk.green('✅ Status: PAID'));
      } else {
        spinner.fail('Failed to update');
        console.error(chalk.red('Error:'), result.error);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    }
  });

// Get invoice PDF - download existing invoice
program
  .command('get <invoiceId>')
  .description('📄 Download invoice PDF')
  .option('-o, --output <filename>', 'Output filename (optional)')
  .action(async (invoiceId: string, options) => {
    try {
      ensureSetup();

      const spinner = ora('Downloading invoice...').start();
      const api = new InvoiceAPI();
      const result = await api.getInvoice(invoiceId);

      if (result.success && result.data && Buffer.isBuffer(result.data)) {
        // Generate filename
        const filename = options.output || `${invoiceId}.pdf`;

        await fs.writeFile(filename, result.data);

        spinner.succeed('Invoice downloaded! 📄');
        console.log('');
        console.log(chalk.green('📄 PDF:'), path.resolve(filename));
      } else {
        spinner.fail('Failed to download');
        console.error(chalk.red('Error:'), result.error || 'Invalid response format');
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    }
  });

// Update client data for existing invoice
program
  .command('client <invoiceId>')
  .description('👤 Update client data for invoice')
  .option('--seller', 'Update seller (your business) information')
  .option('--buyer', 'Update buyer (client) information')
  .action(async (invoiceId: string, options) => {
    try {
      ensureSetup();

      if (!options.seller && !options.buyer) {
        console.error(chalk.red('Error: Must specify --seller or --buyer'));
        console.log('');
        console.log(chalk.gray('Examples:'));
        console.log(
          chalk.cyan('  invoice client INV-ABC-1234 --seller'),
          '# Update your business info'
        );
        console.log(chalk.cyan('  invoice client INV-ABC-1234 --buyer'), '# Update client info');
        console.log(chalk.cyan('  invoice client INV-ABC-1234 --seller --buyer'), '# Update both');
        process.exit(1);
      }

      // First get the invoice data to see current information
      const spinner = ora('Loading current invoice data...').start();
      const api = new InvoiceAPI();

      // Set Accept header to get JSON data instead of PDF
      const originalRequest = api.request.bind(api);
      api.request = async function <T>(endpoint: string, options: RequestOptions = {}) {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'invoice/1.0.0',
          Accept: 'application/json',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        };
        const { method = 'GET', body } = options;

        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });

          const data = (await response.json()) as {
            error?: string;
            details?: Array<{ message: string }>;
          };
          return {
            success: response.ok,
            data: response.ok ? (data as T) : undefined,
            error: !response.ok ? data.error : undefined,
            details: !response.ok ? data.details : undefined,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      };

      const currentResult = await api.getInvoiceData(invoiceId);

      if (!currentResult.success || !currentResult.data) {
        spinner.fail('Failed to load invoice');
        console.error(chalk.red('Error:'), currentResult.error || 'Invoice not found');
        process.exit(1);
      }

      const invoiceData = currentResult.data as {
        request?: { seller?: SellerBuyer; buyer?: SellerBuyer };
      };

      // Provide safe defaults for seller and buyer
      const currentSeller: SellerBuyer = invoiceData.request?.seller || {
        name: '',
        address: '',
        email: '',
      };
      const currentBuyer: SellerBuyer = invoiceData.request?.buyer || {
        name: '',
        address: '',
        email: '',
      };
      spinner.succeed('Invoice data loaded');

      console.log('');
      console.log(chalk.blue.bold('📄 Current Invoice Information'));
      console.log('━'.repeat(50));

      // Display current seller info
      if (currentSeller.name) {
        console.log(chalk.cyan('🏢 Seller (Your Business):'));
        console.log(`  Name: ${currentSeller.name}`);
        console.log(`  Address: ${currentSeller.address}`);
        console.log(`  Email: ${currentSeller.email}`);
        if (currentSeller.phone) console.log(`  Phone: ${currentSeller.phone}`);
        console.log('');
      }

      // Display current buyer info
      if (currentBuyer.name) {
        console.log(chalk.cyan('👤 Buyer (Client):'));
        console.log(`  Name: ${currentBuyer.name}`);
        console.log(`  Address: ${currentBuyer.address}`);
        console.log(`  Email: ${currentBuyer.email}`);
        if (currentBuyer.phone) console.log(`  Phone: ${currentBuyer.phone}`);
        console.log('');
      }

      const updateData: { seller?: SellerBuyer; buyer?: SellerBuyer } = {};

      // Collect new seller information
      if (options.seller) {
        console.log(chalk.yellow.bold('✏️  Update Seller Information'));
        console.log('━'.repeat(30));

        const sellerAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Business name:',
            default: currentSeller.name,
            validate: (input: string) => (input.trim() ? true : 'Required'),
          },
          {
            type: 'input',
            name: 'address',
            message: 'Business address:',
            default: currentSeller.address,
            validate: (input: string) => (input.trim() ? true : 'Required'),
          },
          {
            type: 'input',
            name: 'email',
            message: 'Business email:',
            default: currentSeller.email,
            validate: (input: string) =>
              /^[^@]+@[^@]+\.[^@]+$/.test(input) ? true : 'Valid email required',
          },
          {
            type: 'input',
            name: 'phone',
            message: 'Business phone (optional):',
            default: currentSeller.phone || '',
          },
        ]);

        updateData.seller = {
          name: sellerAnswers.name,
          address: sellerAnswers.address,
          email: sellerAnswers.email,
          ...(sellerAnswers.phone.trim() && { phone: sellerAnswers.phone }),
        };
      }

      // Collect new buyer information
      if (options.buyer) {
        console.log(chalk.yellow.bold('✏️  Update Client Information'));
        console.log('━'.repeat(30));

        const buyerAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Client name:',
            default: currentBuyer.name,
            validate: (input: string) => (input.trim() ? true : 'Required'),
          },
          {
            type: 'input',
            name: 'address',
            message: 'Client address:',
            default: currentBuyer.address,
            validate: (input: string) => (input.trim() ? true : 'Required'),
          },
          {
            type: 'input',
            name: 'email',
            message: 'Client email:',
            default: currentBuyer.email,
            validate: (input: string) =>
              /^[^@]+@[^@]+\.[^@]+$/.test(input) ? true : 'Valid email required',
          },
          {
            type: 'input',
            name: 'phone',
            message: 'Client phone (optional):',
            default: currentBuyer.phone || '',
          },
        ]);

        updateData.buyer = {
          name: buyerAnswers.name,
          address: buyerAnswers.address,
          email: buyerAnswers.email,
          ...(buyerAnswers.phone.trim() && { phone: buyerAnswers.phone }),
        };
      }

      // Restore original request method and update the invoice
      api.request = originalRequest;

      const updateSpinner = ora('Updating client data...').start();
      const result = await api.updateInvoiceClient(invoiceId, updateData);

      if (result.success && result.data) {
        updateSpinner.succeed('Client data updated! ✅');
        console.log('');
        console.log(chalk.cyan('Invoice ID:'), invoiceId);

        if (updateData.seller) {
          console.log(chalk.green('✅ Seller information updated'));
        }
        if (updateData.buyer) {
          console.log(chalk.green('✅ Client information updated'));
        }

        console.log('');
        console.log(chalk.gray('💡 Tip: Download the updated PDF with:'));
        console.log(chalk.cyan(`  invoice get ${invoiceId}`));
      } else {
        updateSpinner.fail('Failed to update client data');
        console.error(chalk.red('Error:'), result.error);
        if (result.details) {
          for (const detail of result.details) {
            console.error(chalk.red('  -'), detail.message);
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
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
        const stats = result.data;
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
          for (const [currency, amount] of Object.entries(stats.currencyBreakdown)) {
            const formattedAmount = formatCurrency(amount, currency);
            console.log(chalk.green('💵'), formattedAmount);
          }

          if (unpaidCount > 0) {
            console.log('');
            console.log(
              chalk.yellow(`💡 ${unpaidCount} unpaid invoices - follow up for more revenue!`)
            );
          }
        }
      } else {
        spinner.fail('Failed to load stats');
        console.error(chalk.red('Error:'), result.error);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    }
  });

// Client management
program
  .command('clients')
  .description('👥 Manage clients')
  .option('--update <nickname>', 'Update client information by nickname')
  .option('--list', 'List all clients (default)')
  .action(async (options) => {
    try {
      ensureSetup();

      if (options.update) {
        await updateClientData(options.update);
        return;
      }

      // List clients (default behavior)
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

      for (const [nickname, folder] of clientList) {
        const isDefault = config.get('defaultFolder') === nickname;
        const marker = isDefault ? chalk.green('● ') : chalk.gray('○ ');
        const folderData = folder as FolderData;
        console.log(
          `${marker}${chalk.cyan(nickname)} - ${folderData.name} (${folderData.company})`
        );
        console.log(`  ${chalk.gray('Email:')} ${folderData.defaults.buyer.email}`);
        console.log(`  ${chalk.gray('Address:')} ${folderData.defaults.buyer.address}`);
        if (folderData.defaults.buyer.phone) {
          console.log(`  ${chalk.gray('Phone:')} ${folderData.defaults.buyer.phone}`);
        }
        console.log('');
      }

      console.log(chalk.gray.bold('💡 Tips:'));
      console.log(chalk.gray('   invoice clients --update <nickname>'), '# Update client info');
      console.log(chalk.gray('   invoice new -c <nickname>'), '# Create invoice for client');
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    }
  });

// Helper function to update client data
async function updateClientData(nickname: string): Promise<void> {
  const folders = config.get('folders');
  const folder = folders[nickname.toLowerCase()] as FolderData;

  if (!folder) {
    console.error(chalk.red(`Error: Client "${nickname}" not found`));
    console.log('');
    console.log(chalk.gray('Available clients:'));
    for (const [nick, folderData] of Object.entries(folders)) {
      console.log(`  ${chalk.cyan(nick)} - ${(folderData as FolderData).name}`);
    }
    return;
  }

  console.log(chalk.blue.bold('📝 Update Client Information'));
  console.log('━'.repeat(40));
  console.log('');
  console.log(chalk.cyan('Current Information:'));
  console.log(`  Name: ${folder.defaults.buyer.name}`);
  console.log(`  Address: ${folder.defaults.buyer.address}`);
  console.log(`  Email: ${folder.defaults.buyer.email}`);
  if (folder.defaults.buyer.phone) {
    console.log(`  Phone: ${folder.defaults.buyer.phone}`);
  }
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Client name:',
      default: folder.defaults.buyer.name,
      validate: (input: string) => (input.trim() ? true : 'Required'),
    },
    {
      type: 'input',
      name: 'address',
      message: 'Client address:',
      default: folder.defaults.buyer.address,
      validate: (input: string) => (input.trim() ? true : 'Required'),
    },
    {
      type: 'input',
      name: 'email',
      message: 'Client email:',
      default: folder.defaults.buyer.email,
      validate: (input: string) =>
        /^[^@]+@[^@]+\.[^@]+$/.test(input) ? true : 'Valid email required',
    },
    {
      type: 'input',
      name: 'phone',
      message: 'Client phone (optional):',
      default: folder.defaults.buyer.phone || '',
    },
  ]);

  const spinner = ora('Updating client data...').start();
  const api = new InvoiceAPI();

  const updatedBuyer = {
    name: answers.name,
    address: answers.address,
    email: answers.email,
    ...(answers.phone.trim() && { phone: answers.phone }),
  };

  try {
    const result = await api.updateFolderClient(folder.id, { buyer: updatedBuyer });
  
    if (result.success && result.data) {
      spinner.succeed('Client data updated! ✅');

      // Update local cache
      const updatedFolder = result.data;
      folders[nickname.toLowerCase()] = updatedFolder;
      config.set('folders', folders);

      console.log('');
      console.log(chalk.cyan('Updated Information:'));
      console.log(`  Name: ${updatedFolder.defaults.buyer.name}`);
      console.log(`  Address: ${updatedFolder.defaults.buyer.address}`);
      console.log(`  Email: ${updatedFolder.defaults.buyer.email}`);
      if (updatedFolder.defaults.buyer.phone) {
        console.log(`  Phone: ${updatedFolder.defaults.buyer.phone}`);
      }
      console.log('');
      console.log(chalk.gray('💡 Next invoices for this client will use the updated information.'));
    } else {
      spinner.fail('Failed to update client data');
      console.error(chalk.red('Error:'), result.error);
      if (result.details) {
        for (const detail of result.details) {
          console.error(chalk.red('  -'), detail.message);
        }
      }
    }
  } catch (error) {
    spinner.fail('Failed to update client data');
    console.error(chalk.red('Network Error:'), error instanceof Error ? error.message : 'Unknown error');
    console.log('');
    console.log(chalk.yellow('💡 This might happen if:'));
    console.log(chalk.gray('  • The API server is not running'));
    console.log(chalk.gray('  • There are network connectivity issues')); 
    console.log(chalk.gray('  • The endpoint has not been deployed yet'));
    console.log('');
    console.log(chalk.cyan('Current API URL:'), config.get('apiUrl'));
  }
}

// Config management for power users
program
  .command('config')
  .description('⚙️ Settings')
  .option('--due-days <days>', 'Default days until due')
  .option('--tax-rate <rate>', 'Default tax rate (%)')
  .option('--url <url>', 'Change API URL')
  .action(async (options) => {
    if (options.dueDays) {
      config.set('quickDefaults.dueInDays', Number.parseInt(options.dueDays, 10));
      console.log(chalk.green('✅'), `Due days: ${options.dueDays}`);
    }

    if (options.taxRate) {
      config.set('quickDefaults.defaultTaxRate', Number.parseFloat(options.taxRate));
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

// Self-update command
program
  .command('self-update')
  .description('🔄 Update to latest version')
  .option('-y, --yes', 'Update automatically if available')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('🔄 Self-Update'));
      console.log('');

      const { hasUpdate, currentVersion, latestVersion } = await checkForUpdates();

      if (!hasUpdate) {
        console.log(chalk.green('✅ Already up to date!'));
        console.log(chalk.cyan('Current version:'), currentVersion);
        return;
      }

      console.log(chalk.yellow('📦 Update available!'));
      console.log(chalk.cyan('Current version:'), currentVersion);
      console.log(chalk.cyan('Latest version:'), latestVersion);
      console.log('');

      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Update now?',
            default: true,
          },
        ]);
        if (confirm) {
          await performSelfUpdate();
          // Exit after successful update to avoid any issues
          process.exit(0);
        } else {
          console.log(chalk.gray('Update cancelled.'));
          console.log('');
          console.log(chalk.gray('You can update later with:'), chalk.cyan('invoice self-update'));
        }
      } else {
        await performSelfUpdate();
        process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    }
  });

function help() {
  console.log(chalk.blue.bold('⏳ Common Workflow:'));
  console.log('');
  console.log(`   ${chalk.cyan('invoice setup')}              First-time setup`);
  console.log(`   ${chalk.cyan('invoice new')}                Create invoice`);
  console.log(`   ${chalk.cyan('invoice paid <id>')}          Mark <id> as paid`);
  console.log(`   ${chalk.cyan('invoice get <id>')}           Download Invoice PDF for <id>`);
  console.log(`   ${chalk.cyan('invoice clients')}            Get saved client info`);
  console.log(`   ${chalk.cyan('invoice stats')}              Check revenue`);
  console.log(`   ${chalk.cyan('invoice self-update')}        Update to latest version`);
  console.log('');
  console.log(chalk.yellow.bold('⚡ Power User Tips:'));
  console.log('');
  console.log(
    `   ${chalk.white('invoice new -c acme -a 1500 -d "Website redesign"')}\t${chalk.gray('# Super quick invoice')}`
  );
  console.log(
    `   ${chalk.white('invoice client INV-ABC-1234 --seller --buyer')}\t\t${chalk.gray('# Update invoice client data')}`
  );
  console.log(
    `   ${chalk.white('invoice clients --update acme')}\t\t\t${chalk.gray('# Update saved client "acme"')}`
  );
  console.log(
    `   ${chalk.white('invoice clients')}\t\t\t\t\t${chalk.gray('# List all saved clients')}`
  );
  console.log(
    `   ${chalk.white('invoice config --due-days 15')}\t\t\t\t${chalk.gray('# Change defaults')}`
  );
  console.log('');
}

// Enhanced help
program.on('--help', () => {
  console.log('');
  help();
});

// Handle no arguments - show smart welcome
function showWelcomeScreen() {
  console.log(chalk.blue.bold('⚡ Invoice'));
  console.log('');
  console.log(chalk.gray('Ultra-fast invoice creation'));
  console.log('');

  const hasApiKey = config.get('apiKey');
  const hasClients = Object.keys(config.get('folders')).length > 0;

  if (!hasApiKey) {
    console.log('👋 First time here?');
    console.log(chalk.cyan('   invoice setup'), '- One-time account setup');
  } else if (!hasClients) {
    console.log('🚀 Ready to create your first invoice?');
    console.log(chalk.cyan('   invoice new'), '- Create invoice (adds client automatically)');
  } else {
    help();
  }

  console.log('');
  console.log(chalk.gray('All commands:'), 'invoice --help');
  process.exit(0);
}

if (process.argv.length === 2) {
  showWelcomeScreen();
}
program.parse();

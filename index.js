import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createRequire } from 'module';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function displayBanner() {
    console.clear();
    const banner = figlet.textSync('KINJI', {
        font: 'Small',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 40,
        whitespaceBreak: true
    });

    const subText = figlet.textSync('Blockmesh DePin Automation', {
        font: 'Small',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: true
    });

    console.log(gradient.pastel(banner));
    console.log(gradient.pastel(subText));
    console.log('\n' + '='.repeat(80) + '\n');
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

const getRandomUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

class Logger {
    static success(message) {
        console.log(chalk.green(`[${new Date().toLocaleString()}] ✔ ${message}`));
    }

    static error(message) {
        console.log(chalk.red(`[${new Date().toLocaleString()}] ✖ ${message}`));
    }

    static info(message) {
        console.log(chalk.blue(`[${new Date().toLocaleString()}] ℹ ${message}`));
    }

    static warning(message) {
        console.log(chalk.yellow(`[${new Date().toLocaleString()}] ⚠ ${message}`));
    }
}

class TelegramBot {
    constructor(token, chatId) {
        this.token = token;
        this.chatId = chatId;
        this.apiUrl = `https://api.telegram.org/bot${token}`;
    }

    async sendMessage(message) {
        try {
            const response = await fetch(`${this.apiUrl}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            
            const data = await response.json();
            if (!data.ok) {
                throw new Error(`Telegram API error: ${data.description}`);
            }
            return data;
        } catch (error) {
            Logger.error(`Error sending Telegram message: ${error.message}`);
        }
    }
}

class BlockMeshAutoClaimer {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'https://api.blockmesh.xyz';
        this.email = config.email;
        this.password = config.password;
        this.ip = config.ip || '';
        this.proxy = config.proxy || null;
        this.cookies = config.cookies || '';
        this.apiToken = null;
        this.isRunning = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.pollingInterval = 900000;
        this.telegramBot = config.telegramBot;
        
        if (this.proxy) {
            const proxyUrl = `http://${this.proxy}`;
            this.proxyAgent = new HttpsProxyAgent(proxyUrl);
        }
    }

    getTimestamp() {
        return new Date().toLocaleString();
    }

    async login() {
        try {
            const response = await fetch(`${this.baseUrl}/api/get_token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'User-Agent': getRandomUserAgent(),
                    'Origin': 'https://app.blockmesh.xyz',
                    'Referer': 'https://app.blockmesh.xyz/'
                },
                body: JSON.stringify({
                    email: this.email,
                    password: this.password
                }),
                agent: this.proxyAgent,
                redirect: 'follow'
            });

            const setCookieHeader = response.headers.get('set-cookie');
            if (setCookieHeader) {
                this.cookies = setCookieHeader;
            }

            const data = await response.json();
            
            if (data.api_token) {
                this.apiToken = data.api_token;
                this.retryCount = 0;
                Logger.success(`Login successful for ${this.email}`);
                return true;
            }
            
            throw new Error('Login failed: No API token received');
        } catch (error) {
            Logger.error(`Login error for ${this.email}: ${error.message}`);
            throw error;
        }
    }

    async getDashboardStats() {
        try {
            const response = await fetch('https://app.blockmesh.xyz/dashboard', {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'User-Agent': getRandomUserAgent(),
                    'Origin': 'https://app.blockmesh.xyz',
                    'Referer': 'https://app.blockmesh.xyz/ui/dashboard',
                    'Cookie': this.cookies
                },
                agent: this.proxyAgent
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch: Status ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            Logger.error(`Failed to get dashboard stats: ${error.message}`);
            await this.login();
            return null;
        }
    }

    async reportUptime() {
        if (!this.apiToken) {
            throw new Error('Not logged in');
        }

        const reportIP = this.proxy ? this.proxy.split(':')[0] : this.ip;
        const url = `https://app.blockmesh.xyz/api/report_uptime?email=${encodeURIComponent(this.email)}&api_token=${this.apiToken}&ip=${reportIP}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'User-Agent': getRandomUserAgent(),
                    'Origin': 'https://app.blockmesh.xyz',
                    'Referer': 'https://app.blockmesh.xyz/',
                    'Cookie': `id=${this.apiToken}`
                },
                agent: this.proxyAgent
            });

            const data = await response.json();
            
            if (data.status_code === 200) {
                Logger.success(`Uptime reported successfully for IP: ${reportIP}`);

                if (!this.proxy) {
                    const stats = await this.getDashboardStats();
                    if (stats) {
                        await this.sendStatsToTelegram(stats);
                    }
                }
                
                this.retryCount = 0;
                return true;
            }
            
            throw new Error(`Uptime report failed with status: ${data.status_code}`);
        } catch (error) {
            Logger.error(`Uptime report error for IP ${reportIP}: ${error.message}`);
            this.retryCount++;
            
            if (this.retryCount >= this.maxRetries) {
                Logger.warning(`Max retries reached for IP ${reportIP}, attempting to re-login...`);
                await this.login();
            }
            
            throw error;
        }
    }

    async sendStatsToTelegram(stats) {
        if (!this.telegramBot || !stats) return;

        const formatNumber = (num, decimals = 2) => (num || 0).toFixed(decimals);

        const message = `
🌟 <b>BlockMesh Stats Update</b> 🌟
📍 IP: <code>${this.ip}</code>

📊 <b>Performance Metrics:</b>
⏱ Uptime: <code>${formatNumber(stats.uptime)}%</code>
💰 Points: <code>${formatNumber(stats.points, 4)}</code>
📡 Latency: <code>${formatNumber(stats.latency)} ms</code>
⬇️ Download: <code>${formatNumber(stats.download)} Mbps</code>
⬆️ Upload: <code>${formatNumber(stats.upload)} Mbps</code>

📅 <b>Today's Performance:</b>
🕒 Uptime: <code>${formatNumber(stats.daily_stats?.[0]?.uptime)}%</code>
💎 Points: <code>${formatNumber(stats.daily_stats?.[0]?.points, 4)}</code>

🔗 <b>Status:</b>
⚡️ Connected: ${stats.connected ? '✅' : '❌'}
✉️ Email Verified: ${stats.verified_email ? '✅' : '❌'}

🕐 Updated: ${this.getTimestamp()}`;

        await this.telegramBot.sendMessage(message);
    }

    async start() {
        if (this.isRunning) {
            Logger.warning('Auto claimer is already running');
            return;
        }

        Logger.info(`Starting BlockMesh auto claimer for ${this.email}...`);
        
        try {
            await this.login();
            this.isRunning = true;
            this.claimLoop();
        } catch (error) {
            Logger.error(`Failed to initialize auto claimer: ${error.message}`);
        }
    }

    async claimLoop() {
        while (this.isRunning) {
            try {
                await this.reportUptime();
                await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
            } catch (error) {
                Logger.error(`Error in claim loop: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    stop() {
        Logger.info(`Stopping BlockMesh auto claimer for ${this.email}...`);
        this.isRunning = false;
    }
}

async function loadConfig() {
    try {
        const [proxyList, userConfig, telegramConfig, cookies] = await Promise.all([
            fs.readFile(path.join(__dirname, 'proxy.txt'), 'utf8'),
            fs.readFile(path.join(__dirname, 'user.txt'), 'utf8'),
            fs.readFile(path.join(__dirname, 'config.txt'), 'utf8'),
            fs.readFile(path.join(__dirname, 'cookies.txt'), 'utf8')
        ]);

        const proxies = proxyList.split('\n').filter(line => line.trim());
        const mainIP = proxies[0].trim();
        const proxyAddresses = proxies.slice(1).filter(p => p.trim());

        const [email, password] = userConfig.trim().split('\n')[0].split(':');

        const telegramParts = telegramConfig.trim().split('\n')[0].split(':');
        const chatId = telegramParts.pop();
        const botToken = telegramParts.join(':'); 

        const cookiesStr = cookies.trim();

        return {
            mainIP,
            proxyAddresses,
            email,
            password,
            botToken,
            chatId,
            cookies: cookiesStr
        };
    } catch (error) {
        Logger.error(`Error loading configuration: ${error.message}`);
        process.exit(1);
    }
}

async function initializeConfigFiles() {
    const configFiles = {
        'proxy.txt': '103.133.63.4\n156.228.116.246:3128',
        'user.txt': 'email@example.com:password123',
        'konfigurasi.txt': 'bottoken:chatid',
        'cookies.txt': '_ga=GA1.1.123456789.0123456789; id=abcdefghijklmnop'
    };

    for (const [filename, defaultContent] of Object.entries(configFiles)) {
        const filePath = path.join(__dirname, filename);
        try {
            await fs.access(filePath);
        } catch (error) {
            try {
                await fs.writeFile(filePath, defaultContent);
                Logger.success(`Created ${filename} with default content`);
            } catch (writeError) {
                Logger.error(`Error creating ${filename}: ${writeError.message}`);
            }
        }
    }
}

async function main() {
    displayBanner();
    
    Logger.info('Initializing BlockMesh Automation...');
    await initializeConfigFiles();

    const config = await loadConfig();
    const telegramBot = new TelegramBot(config.botToken, config.chatId);

    const instances = [];

    instances.push(new BlockMeshAutoClaimer({
        email: config.email,
        password: config.password,
        ip: config.mainIP,
        cookies: config.cookies,
        telegramBot
    }));

    for (const proxy of config.proxyAddresses) {
        instances.push(new BlockMeshAutoClaimer({
            email: config.email,
            password: config.password,
            proxy: proxy,
            cookies: config.cookies,
            telegramBot: null 
        }));
    }

    Logger.info(chalk.cyan('Starting all instances...'));
    for (const instance of instances) {
        await instance.start();
    }

    process.on('SIGINT', () => {
        Logger.warning('\nReceived shutdown signal. Gracefully stopping all instances...');
        instances.forEach(instance => instance.stop());
        console.log(gradient.rainbow('\nThank you for using Kinji Blockmesh Automation!'));
        process.exit(0);
    });
}

main().catch(error => Logger.error(error.message));
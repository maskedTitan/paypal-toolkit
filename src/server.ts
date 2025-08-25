import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import auth from 'basic-auth';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { PayPalWorkflows, PayPalAgentToolkit, ALL_TOOLS_ENABLED } from '@paypal/agent-toolkit/ai-sdk';

// Load env variables
dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 🎭 DEMO MODE FLAG (can be changed dynamically)
let DEMO_MODE = process.env.DEMO_MODE === 'true';

// 🎪 MOCK RESPONSE GENERATOR
const generateMockResponse = (prompt: string, mode: string): any => {
  const lowerPrompt = prompt.toLowerCase();
  const mockOrderId = `DEMO${Math.random().toString(36).substr(2, 12).toUpperCase()}`;
  
  // Generate appropriate mock response based on prompt
  let mockAmount = '20.00';
  let mockItem = 'Custom Service';
  let mockDescription = 'AI-generated service based on your request';
  
  if (lowerPrompt.includes('laptop') || lowerPrompt.includes('computer')) {
    mockAmount = '1299.00';
    mockItem = 'MacBook Pro 13"';
    mockDescription = 'Apple MacBook Pro 13" with M2 chip';
  } else if (lowerPrompt.includes('coffee') || lowerPrompt.includes('mug')) {
    mockAmount = '12.99';
    mockItem = 'Coffee Mug';
    mockDescription = 'Premium ceramic coffee mug';
  } else if (lowerPrompt.includes('consulting') || lowerPrompt.includes('service')) {
    const hourMatch = prompt.match(/(\d+)\s*hours?/i);
    const rateMatch = prompt.match(/\$(\d+(?:\.\d{2})?)/);
    if (hourMatch && rateMatch) {
      const hours = parseInt(hourMatch[1]);
      const rate = parseFloat(rateMatch[1]);
      mockAmount = (hours * rate).toFixed(2);
      mockItem = `${hours} Hours Consulting`;
      mockDescription = `Professional consulting services at $${rate}/hour`;
    }
  }

  const mockResponse = `**Order Summary**

- **Order ID:** ${mockOrderId}
- **Status:** PAYER_ACTION_REQUIRED
- **Intent:** CAPTURE
- **Total Amount:** $${mockAmount} USD
  - **Item Total:** $${mockAmount} USD
  - **Shipping:** $0.00 USD
  - **Tax Total:** $0.00 USD

**Payee Information:**
- **Email:** demo-merchant@example.com
- **Merchant ID:** DEMO123456789

**Items Ordered:**
1. **Name:** ${mockItem}
   - **Unit Amount:** $${mockAmount} USD
   - **Quantity:** 1
   - **Description:** ${mockDescription}
   - **Item Level Tax:** $0.00 USD

🎭 **This is a DEMO response** - To complete real purchases, please visit [PayPal Demo Payment Link](https://www.sandbox.paypal.com/checkoutnow?token=${mockOrderId}).

💡 **Want real integration?** [Set up your own instance](https://github.com/your-repo/setup-guide) with your PayPal and OpenAI credentials.`;

  return {
    success: true,
    isDemo: true,
    prompt,
    rawRequest: {
      type: mode,
      systemPrompt: DEMO_MODE ? 'Demo mode - mock responses only' : undefined,
      userPrompt: prompt,
      note: DEMO_MODE ? 'This is a demonstration with mock data' : undefined
    },
    rawResponse: mockResponse,
    demoInfo: DEMO_MODE ? {
      message: 'This is a simulated response for demonstration purposes',
      realSetup: 'https://github.com/your-repo/setup-guide',
      paypalDocs: 'https://developer.paypal.com/docs/',
      openaiDocs: 'https://platform.openai.com/docs/'
    } : undefined
  };
};

// Setup OpenAI (only if not in demo mode)
let openai: any;
let paypalToolkit: PayPalAgentToolkit | undefined;
let paypalWorkflows: PayPalWorkflows | undefined;

if (!DEMO_MODE) {
  openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
  });

  // Setup PayPal toolkit and workflows
  const ppConfigWorkflows = {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    configuration: {
      actions: ALL_TOOLS_ENABLED
    }
  };

  const ppConfigToolkit = {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    configuration: {
      actions: {
        invoices: {
          create: true,
          list: true,
          send: true,
          sendReminder: true,
          cancel: true,
          generateQRC: true,
        },
        products: { create: true, list: true, update: true },
        subscriptionPlans: { create: true, list: true, show: true },
        shipment: { create: true, show: true, cancel: true },
        orders: { create: true, get: true },
        disputes: { list: true, get: true },
      },
    },
  };

  paypalToolkit = new PayPalAgentToolkit(ppConfigToolkit);
  paypalWorkflows = new PayPalWorkflows(ppConfigWorkflows);
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// System prompt (only used in production mode)
const systemPrompt = `
You are an intelligent business assistant specializing in generating accurate PayPal orders based on user requests.
When creating orders:
- Break down services, labor, or product items clearly.
- Calculate taxes if mentioned (specify tax rates per item if different).
- Include service descriptions, quantities, unit prices, and total amounts.
- If shipping or discounts are involved, itemize them separately.
- Use USD currency unless otherwise specified.
- Set the return URL to: ${BASE_URL}/thank-you.
Always generate complete, detailed, and payment-ready order information.
`;

// 🔐 CONDITIONAL AUTHENTICATION
// Demo mode: No auth required
// Production mode: Full auth required
const protect = (req: Request, res: Response, next: NextFunction) => {
  if (DEMO_MODE) {
    // Demo mode - no authentication required
    return next();
  }

  // Production mode - require authentication
  const credentials = auth(req);

  if (!credentials || credentials.name !== process.env.PROTECT_USER || credentials.pass !== process.env.PROTECT_PASS) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="PayPal AI API"');
    res.end('Access denied - Production mode requires authentication');
  } else {
    next();
  }
};

// Apply protection to generate route
app.use('/generate', protect);

// 🚀 HEALTH/INFO ENDPOINT
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    mode: DEMO_MODE ? 'demo' : 'production',
    timestamp: new Date().toISOString(),
    ...(DEMO_MODE && {
      demoInfo: {
        message: 'This is a demo environment with mock responses',
        authentication: 'None required for demo',
        setupGuide: 'https://github.com/your-repo/setup-guide'
      }
    })
  });
});

// 🔄 MODE TOGGLE ENDPOINT (disabled in production demo deployments)
app.post('/toggle-mode', (req, res) => {
  // Security: Disable toggle in production demo deployments
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE === 'true') {
    res.status(403).json({
      success: false,
      message: 'Mode switching is disabled in demo deployments for security reasons'
    });
    return;
  }

  const { mode } = req.body;
  
  if (mode === 'demo' || mode === 'production') {
    DEMO_MODE = mode === 'demo';
    console.log(`🔄 Mode switched to: ${DEMO_MODE ? 'DEMO' : 'PRODUCTION'}`);
    
    res.json({
      success: true,
      mode: DEMO_MODE ? 'demo' : 'production',
      message: `Switched to ${DEMO_MODE ? 'demo' : 'production'} mode`
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid mode. Use "demo" or "production"'
    });
  }
});

// 📊 DEMO INFO ENDPOINT (only available in demo mode)
if (DEMO_MODE) {
  app.get('/demo-info', (req, res) => {
    res.json({
      success: true,
      isDemo: true,
      features: [
        'Mock PayPal order generation',
        'No real API calls made',
        'No authentication required',
        'Educational/demonstration purposes only'
      ],
      limitations: [
        'Responses are simulated',
        'No real payments processed',
        'Limited to basic scenarios'
      ],
      buildYourOwn: {
        repository: 'https://github.com/your-repo/paypal-ai-toolkit',
        setupGuide: 'https://github.com/your-repo/setup-guide',
        requirements: [
          'PayPal Developer Account',
          'OpenAI API Key',
          'Vercel Account (for deployment)'
        ]
      }
    });
  });
}

// 🎯 MAIN GENERATE ENDPOINT
app.post('/generate', async (req, res) => {
  const { prompt, mode, selectedActions = {}, forceDemo = false } = req.body;

  // Input validation
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Prompt is required and must be a string'
    });
    return;
  }

  if (DEMO_MODE || forceDemo) {
    // 🎭 DEMO MODE - Return mock responses
    console.log(`🎭 Demo request: "${prompt.substring(0, 100)}..."${forceDemo ? ' (forced)' : ''}`);
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const mockResponse = generateMockResponse(prompt, mode);
    res.json(mockResponse);
    return;
  }

  // 🚀 PRODUCTION MODE - Real API calls
  try {
    if (mode === 'workflow') {
      if (!paypalWorkflows) {
        throw new Error('PayPal Workflows not initialized');
      }

      const orderSummary = await paypalWorkflows.generateOrder(openai('gpt-4o'), prompt, systemPrompt);
      
      res.json({
        success: true,
        prompt,
        rawRequest: {
          type: 'workflow',
          systemPrompt,
          userPrompt: prompt
        },
        rawResponse: orderSummary
      });

    } else if (mode === 'toolkit') {
      if (!paypalToolkit) {
        throw new Error('PayPal Toolkit not initialized');
      }

      // Dynamically create a new Toolkit based on selectedActions
      const dynamicToolkitConfig = {
        clientId: process.env.PAYPAL_CLIENT_ID || '',
        clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
        configuration: {
          actions: selectedActions
        }
      };

      const dynamicToolkit = new PayPalAgentToolkit(dynamicToolkitConfig);

      const { text: orderDetails } = await generateText({
        model: openai('gpt-4o'),
        prompt,
        tools: dynamicToolkit.getTools(),
        maxSteps: 10,
      });

      res.json({
        success: true,
        prompt,
        rawRequest: {
          type: 'toolkit',
          prompt,
          selectedActions
        },
        rawResponse: orderDetails
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid mode selected' });
    }

  } catch (error) {
    console.error('❌ Error generating:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating response',
      mode: 'production'
    });
  }
});

// Static files and routes (unchanged)
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/thank-you', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/thank-you.html'));
});

// 🚫 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    availableEndpoints: DEMO_MODE 
      ? ['/health', '/demo-info', '/generate']
      : ['/health', '/generate', '/', '/thank-you']
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`🎭 Mode: ${DEMO_MODE ? 'DEMO (Mock responses)' : 'PRODUCTION (Real APIs)'}`);
  if (DEMO_MODE) {
    console.log(`📋 Demo info: http://localhost:${port}/demo-info`);
    console.log(`🔒 Authentication: Not required in demo mode`);
  }
});

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

// Setup OpenAI
const openai = createOpenAI({
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

const ppConfigToolkit =  {
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

const paypalToolkit = new PayPalAgentToolkit(ppConfigToolkit);
const paypalWorkflows = new PayPalWorkflows(ppConfigWorkflows);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// System prompt
// This prompt defines the business assistant's behavior when interacting with PayPal APIs.
// It ensures that the AI agent creates fully detailed and payment-ready PayPal orders based on user input.
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

const protect = (req: Request, res: Response, next: NextFunction) => {
    const credentials = auth(req);
  
    if (!credentials || credentials.name !== process.env.PROTECT_USER || credentials.pass !== process.env.PROTECT_PASS) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm="Access to the site"');
      res.end('Access denied');
    } else {
      next();
    }
  };
  
  // Apply protection to all routes
  app.use(protect);

app.post('/generate', async (req, res) => {
    const { prompt, mode } = req.body;
  
    try {
      if (mode === 'workflow') {
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
  
      } else {
        const { text: orderDetails } = await generateText({
          model: openai('gpt-4o'),
          prompt,
          tools: paypalToolkit.getTools(),
          maxSteps: 10,
        });
  
        res.json({
          success: true,
          prompt,
          rawRequest: {
            type: 'toolkit',
            prompt
          },
          rawResponse: orderDetails
        });
      }
  
    } catch (error) {
      console.error('❌ Error generating:', error);
      res.status(500).json({ success: false, message: 'Error generating response' });
    }
  });  

app.use(express.static('public'));

// Serve root (/) - Load public/index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

// Serve /thank-you
app.get('/thank-you', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/thank-you.html'));
  });

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

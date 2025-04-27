import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
const ppConfig = {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  configuration: {
    actions: ALL_TOOLS_ENABLED
  }
};

const paypalToolkit = new PayPalAgentToolkit(ppConfig);
const paypalWorkflows = new PayPalWorkflows(ppConfig);

// System prompt
const systemPrompt = `
You are an intelligent business assistant specializing in generating accurate PayPal orders based on user requests.
When creating orders:
- Break down services, labor, or product items clearly.
- Calculate taxes if mentioned (specify tax rates per item if different).
- Include service descriptions, quantities, unit prices, and total amounts.
- If shipping or discounts are involved, itemize them separately.
- Use USD currency unless otherwise specified.
- Set the return URL to: http://localhost:3000/thank-you.
Always generate complete, detailed, and payment-ready order information.
`;

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

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

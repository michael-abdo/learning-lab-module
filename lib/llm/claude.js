module.exports = class Claude {
  constructor(apiKey) {
    const Anthropic = require("@anthropic-ai/sdk");
    const anthropic = new Anthropic({
        apiKey: apiKey
    });
    
    this.apiKey = apiKey;
    this.anthropic = anthropic;
  }

  async generateResponse(systemPrompt, messages, model='claude-3-7-sonnet-20250219', maxTokens = 8192, temperature=1, tools=[]) {
    const response = await this.anthropic.messages.create({
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt,
        messages: messages,
        thinking: {
          "type": "enabled",
          "budget_tokens": 6554
        },
        tools: tools
    }, {
        headers: {
            'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
        }
    });

    console.log('claude response', response);

    return response;
  }
}
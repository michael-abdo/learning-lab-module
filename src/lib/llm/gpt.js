module.exports = class GPT {
  constructor(apiKey) {
    const OpenAI = require("openai");
    const openai = new OpenAI({
        apiKey: apiKey
    });
    
    this.apiKey = apiKey;
    this.openai = openai;
  }

  async generateResponse(systemPrompt, messages, model='03-mini', reasoningEffort = 'high', tools=[]) {
    messages.unshift({
        "role": "system",
        "content": systemPrompt
    });

    const response = await this.openai.chat.completions.create({
        model: model,
        messages: messages,
        reasoning_effort: reasoningEffort,
        tools: tools
    });
    
    return response;
  }
}
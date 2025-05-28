module.exports = class Gemini {
  constructor(apiKey) {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const gemini = new GoogleGenerativeAI({
        apiKey: apiKey
    });
    
    this.apiKey = apiKey;
    this.gemini = gemini;
  }

  async generateResponse(systemPrompt, messages, model='gemini-2.0-flash', maxOutputTokens = 8192, temperature=1, tools=[], topP=0.95, topK=40) {
    const gemini = this.gemini.getGenerativeModel({
      model: model,
      systemInstruction: systemPrompt,
      tools: {
        functionDeclarations: tools
      }
    });

    const generationConfig = {
      temperature: temperature,
      topP: topP,
      topK: topK,
      maxOutputTokens: maxOutputTokens,
    };

    const chatSession = gemini.startChat({
      generationConfig,
      history: messages,
    });

    
    const result = await chatSession.sendMessage(" ");
    return result;
  }
}
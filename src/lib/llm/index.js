module.exports = class LLM {
  constructor(apiKey, model='CLAUDE') {
    this.apiKey = apiKey;
    if(model == 'CLAUDE') {
      const Claude = require("./claude");
      this.model = new Claude(this.apiKey);
      this.modelName = 'CLAUDE';
    }else if (model == 'GPT') {
      const GPT = require("./gpt");
      this.model = new GPT(this.apiKey);
      this.modelName = 'GPT';
    }else if (model == 'GEMINI') {
      const Gemini = require("./gemini");
      this.model = new Gemini(this.apiKey);
      this.modelName = 'GEMINI';
    }else{
      const Claude = require("./claude");
      this.model = new Claude(this.apiKey);
      this.modelName = 'CLAUDE';
    }
  }

  /**
   * Expected structure for messages:
   * [
   *   {
   *     isUser: Boolean,           // true if the message is from a user, false if from an assistant
   *     message_text: String,      // text content of the message (optional)
   *     message_audio: String,     // audio URI or file reference (optional)
   *     message_files: [           // optional array of file objects
   *       {
   *         mimeType: String,      // MIME type of the file, e.g., "image/png" or "audio/mpeg"
   *         data: String           // file data, e.g., base64 string or URL
   *       },
   *       // ... additional files
   *     ]
   *   },
   *   // ... additional messages
   * ]
   */
  async generateResponse(systemPrompt, messages, model, maxTokens = 8192, temperature=1, tools=[]) {
    let response = null;

    const Claude = require("./claude");
    const GPT = require("./gpt");
    const Gemini = require("./gemini");

    messages = await this.prepareMessagesForLLM(messages, this.modelName);
    console.log('messages', messages);

    if(this.model instanceof Claude) {
      model = !model ? 'claude-3-7-sonnet-20250219' : model;
      response = await this.model.generateResponse(systemPrompt, messages, model, maxTokens, temperature, tools);
      response = response.content[response.content.length - 1].text;
    }else if (this.model instanceof GPT) {
      model = !model ? '03-mini' : model;
      response = await this.model.generateResponse(systemPrompt, messages, model, 'high', tools);
      response = response.choices[0].message.content;
    }else if (this.model instanceof Gemini) {
      model = !model ? 'gemini-2.0-flash' : model;
      response = await this.model.generateResponse(systemPrompt, messages, model, maxTokens, temperature, tools);
      response = result.response.text();
    }

    return response;
  }


  /**
   * Expected structure for messages:
   * [
   *   {
   *     isUser: Boolean,           // true if the message is from a user, false if from an assistant
   *     message_text: String,      // text content of the message (optional)
   *     message_audio: String,     // audio URI or file reference (optional)
   *     message_files: [           // optional array of file objects
   *       {
   *         mimeType: String,      // MIME type of the file, e.g., "image/png" or "audio/mpeg"
   *         data: String           // file data, e.g., base64 string or URL
   *       },
   *       // ... additional files
   *     ]
   *   },
   *   // ... additional messages
   * ]
   */
  async prepareMessagesForLLM(messages, model = "CLAUDE") {
    // Validate that the input is an array
    if (!Array.isArray(messages)) {
      throw new Error("Input messages must be an array.");
    }

    const preparedMessages = [];

    for (const message of messages) {
      try {
        // Determine the role based on the 'isUser' flag
        const role = message.isUser ? "user" : "assistant";

        // Extract text content and audio data, providing default values if missing
        const content = message.message_text || "";
        const audio = message.message_audio || null;

        if (model === "CLAUDE") {
          const claudeContent = [];

          // Process any files attached to the message
          if (
            message.message_files &&
            Array.isArray(message.message_files) &&
            message.message_files.length > 0
          ) {
            for (const file of message.message_files) {
              // Ensure file has the necessary properties
              if (file && typeof file.mimeType === "string" && file.data) {
                // Check if the file is an image
                if (file.mimeType.startsWith("image/")) {
                  claudeContent.push({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: file.mimeType,
                      data: file.data, // Assumed to be a base64 string
                    },
                  });
                }
              }
            }
          }

          // Add text content if available
          if (content) {
            claudeContent.push({
              type: "text",
              text: content,
            });
          }

          preparedMessages.push({
            role: role,
            content: claudeContent,
          });
        } else if (model === "GPT") {
          const gptContent = [];

          // Process any files attached to the message
          if (
            message.message_files &&
            Array.isArray(message.message_files) &&
            message.message_files.length > 0
          ) {
            for (const file of message.message_files) {
              // Ensure file has the necessary properties
              if (file && typeof file.mimeType === "string" && file.data) {
                // Check if the file is an image
                if (file.mimeType.startsWith("image/")) {
                  gptContent.push({
                    type: "image_url",
                    image_url: {
                      url: file.data, // Use the data as URL
                    },
                  });
                }
              }
            }
          }

          // Add text content if available
          if (content) {
            gptContent.push({
              type: "text",
              text: content,
            });
          }

          preparedMessages.push({
            role: role,
            content: gptContent,
          });
        } else if (model === "GEMINI") {
          const parts = [];

          // Always include the text part (even if it's empty)
          parts.push({ text: content });

          // Add audio data if available
          if (audio) {
            parts.push({
              fileData: {
                mimeType: "audio/mpeg",
                fileUri: audio,
              },
            });
          }

          // Process any files attached to the message
          if (
            message.message_files &&
            Array.isArray(message.message_files) &&
            message.message_files.length > 0
          ) {
            for (const file of message.message_files) {
              // Ensure file has the necessary properties
              if (file && typeof file.mimeType === "string" && file.data) {
                parts.push({
                  fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.data,
                  },
                });
              }
            }
          }

          preparedMessages.push({
            role: role,
            parts: parts,
          });
        } else {
          // If the model type is unsupported, throw an error
          throw new Error(`Unsupported model type: ${model}`);
        }
      } catch (error) {
        // Log the error and continue processing the next message
        console.error(`Error processing message: ${error.message}`);
        continue;
      }
    }

    // Return the list of prepared messages
    return preparedMessages;
  }

}
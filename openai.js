const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function askChatGPT(prompt, model = "gpt-3.5-turbo", temperature = 0.7, max_tokens = 1000) {
  const res = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens
  });
  return res.choices[0].message.content.trim();
}

async function generateImage(prompt) {
  const res = await openai.images.generate({
    prompt,
    n: 1,
    size: "512x512"
  });
  return res.data[0].url;
}

module.exports = { askChatGPT, generateImage };

const axios = require('axios');

async function queryHuggingFace(model, input) {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      input,
      {
        headers: {
          // No token required for public models
        }
      }
    );
    return response.data;
  } catch (err) {
    console.error('HuggingFace Error:', err.message);
    return '⚠️ Error from AI model.';
  }
}

module.exports = { queryHuggingFace };
